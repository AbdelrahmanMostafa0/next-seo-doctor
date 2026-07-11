import { XMLParser } from "fast-xml-parser";
import { parseHtml } from "./utils/html.js";
import { isLocalhostUrl } from "./utils/html.js";
import type { Finding, PageData, SiteData, SitemapEntry } from "./types.js";

const PAGE_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_AFTER_S = 5;
const MAX_RETRY_AFTER_S = 30;

export interface CrawlOptions {
  maxPages: number;
  concurrency: number;
  filter?: string;
}

export interface CrawlResult {
  pages: PageData[];
  site: SiteData;
  aborted: boolean;
  abortReason?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PAGE_TIMEOUT_MS,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response | null> {
  const first = await fetchWithTimeout(url, init);
  if (first) return first;
  return fetchWithTimeout(url, init);
}

interface RedirectResult {
  response: Response | null;
  finalUrl: string;
  looped: boolean;
}

async function fetchFollowingRedirects(url: string): Promise<RedirectResult> {
  let currentUrl = url;
  const visited = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (visited.has(currentUrl)) {
      return { response: null, finalUrl: currentUrl, looped: true };
    }
    visited.add(currentUrl);
    const response = await fetchWithRetry(currentUrl, { redirect: "manual" });
    if (!response) {
      return { response: null, finalUrl: currentUrl, looped: false };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: currentUrl, looped: false };
      if (hop === MAX_REDIRECTS) {
        return { response: null, finalUrl: currentUrl, looped: false };
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return { response, finalUrl: currentUrl, looped: false };
  }
  return { response: null, finalUrl: currentUrl, looped: false };
}

function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_S;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.min(seconds, MAX_RETRY_AFTER_S);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diffS = Math.max(0, (date - Date.now()) / 1000);
    return Math.min(diffS, MAX_RETRY_AFTER_S);
  }
  return DEFAULT_RETRY_AFTER_S;
}

async function fetchPageWithRateLimit(
  url: string,
  onRateLimited: () => void,
): Promise<{ response: Response | null; finalUrl: string; rateLimited: boolean }> {
  let attempt = 0;
  while (attempt <= MAX_RATE_LIMIT_RETRIES) {
    const result = await fetchFollowingRedirects(url);
    if (result.response?.status === 429) {
      onRateLimited();
      if (attempt === MAX_RATE_LIMIT_RETRIES) {
        return { response: null, finalUrl: result.finalUrl, rateLimited: true };
      }
      const waitS = parseRetryAfter(result.response.headers.get("retry-after"));
      await sleep(waitS * 1000);
      attempt++;
      continue;
    }
    return { response: result.response, finalUrl: result.finalUrl, rateLimited: false };
  }
  return { response: null, finalUrl: url, rateLimited: true };
}

async function runPool<T, R>(
  items: T[],
  initialConcurrency: number,
  worker: (item: T) => Promise<R>,
  getConcurrency: () => number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const next = (): number | null => (cursor < items.length ? cursor++ : null);

  async function workerLoop(workerId: number): Promise<void> {
    while (true) {
      if (cursor >= items.length) return;
      if (workerId >= getConcurrency()) {
        await sleep(50);
        continue;
      }
      const idx = next();
      if (idx === null) return;
      results[idx] = await worker(items[idx]);
    }
  }

  const workerCount = Math.max(1, initialConcurrency);
  await Promise.all(Array.from({ length: workerCount }, (_, i) => workerLoop(i)));
  return results;
}

function parseRobots(text: string): { disallow: string[]; sitemapUrls: string[] } {
  const disallow: string[] = [];
  const sitemapUrls: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^disallow\s*:/i.test(line)) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      if (value) disallow.push(value);
    } else if (/^sitemap\s*:/i.test(line)) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      if (value) sitemapUrls.push(value);
    }
  }
  return { disallow, sitemapUrls };
}

async function fetchRobots(baseUrl: string): Promise<{
  disallow: string[];
  sitemapUrls: string[];
  found: boolean;
}> {
  const response = await fetchWithRetry(new URL("/robots.txt", baseUrl).toString());
  if (!response || !response.ok) {
    return { disallow: [], sitemapUrls: [], found: false };
  }
  const text = await response.text();
  const { disallow, sitemapUrls } = parseRobots(text);
  return { disallow, sitemapUrls, found: true };
}

const xmlParser = new XMLParser({ ignoreAttributes: false });

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetchSitemapRecursive(
  url: string,
  entries: SitemapEntry[],
  seen: Set<string>,
): Promise<boolean> {
  if (seen.has(url)) return true;
  seen.add(url);

  const response = await fetchWithRetry(url);
  if (!response || !response.ok) return false;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/xml/i.test(contentType) && !/text\/plain/i.test(contentType)) {
    return false;
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(text);
  } catch {
    return false;
  }

  const doc = parsed as Record<string, unknown>;

  if (doc.sitemapindex) {
    const index = doc.sitemapindex as Record<string, unknown>;
    const children = toArray(index.sitemap as Record<string, unknown> | Record<string, unknown>[]);
    for (const child of children) {
      const loc = (child as Record<string, unknown>).loc;
      if (typeof loc === "string") {
        await fetchSitemapRecursive(loc, entries, seen);
      }
    }
    return true;
  }

  if (doc.urlset) {
    const urlset = doc.urlset as Record<string, unknown>;
    const urls = toArray(urlset.url as Record<string, unknown> | Record<string, unknown>[]);
    for (const entry of urls) {
      const record = entry as Record<string, unknown>;
      const loc = record.loc;
      if (typeof loc === "string") {
        const lastmod = typeof record.lastmod === "string" ? record.lastmod : null;
        entries.push({ url: loc, lastmod });
      }
    }
    return true;
  }

  return false;
}

async function fetchSitemap(url: string): Promise<{ entries: SitemapEntry[]; found: boolean }> {
  const entries: SitemapEntry[] = [];
  const found = await fetchSitemapRecursive(url, entries, new Set());
  return { entries, found };
}

function dedupeEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    if (!seen.has(entry.url)) seen.set(entry.url, entry);
  }
  return [...seen.values()];
}

async function fetchPageData(
  entry: SitemapEntry,
  crawlFindings: Finding[],
  onRateLimited: () => void,
): Promise<PageData> {
  const { response, finalUrl, rateLimited } = await fetchPageWithRateLimit(entry.url, onRateLimited);

  if (rateLimited) {
    return {
      url: entry.url,
      finalUrl,
      status: null,
      ok: false,
      skipped: "rate limited",
      canonical: null,
      jsonLdBlocks: [],
      ogImage: null,
      hasTitle: false,
      hasDescription: false,
      lastmod: entry.lastmod,
    };
  }

  if (!response) {
    return {
      url: entry.url,
      finalUrl,
      status: null,
      ok: false,
      failed: true,
      canonical: null,
      jsonLdBlocks: [],
      ogImage: null,
      hasTitle: false,
      hasDescription: false,
      lastmod: entry.lastmod,
    };
  }

  if (response.status === 404 || response.status === 410 || response.status >= 500) {
    crawlFindings.push({
      severity: "error",
      message: `sitemap lists a dead URL: ${entry.url} (${response.status})`,
      page: entry.url,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html/i.test(contentType)) {
    return {
      url: entry.url,
      finalUrl,
      status: response.status,
      ok: response.ok,
      skipped: "non-html",
      canonical: null,
      jsonLdBlocks: [],
      ogImage: null,
      hasTitle: false,
      hasDescription: false,
      lastmod: entry.lastmod,
    };
  }

  const html = await response.text();
  const parsed = parseHtml(html);

  return {
    url: entry.url,
    finalUrl,
    status: response.status,
    ok: response.ok,
    canonical: parsed.canonical,
    jsonLdBlocks: parsed.jsonLdBlocks,
    ogImage: parsed.ogImage,
    hasTitle: parsed.hasTitle,
    hasDescription: parsed.hasDescription,
    lastmod: entry.lastmod,
  };
}

export async function crawlSite(baseUrl: string, opts: CrawlOptions): Promise<CrawlResult> {
  const crawlFindings: Finding[] = [];
  const isLocalhost = isLocalhostUrl(baseUrl);

  const robots = await fetchRobots(baseUrl);

  const sitemapUrl = robots.sitemapUrls[0] ?? new URL("/sitemap.xml", baseUrl).toString();
  let { entries, found: sitemapFound } = await fetchSitemap(sitemapUrl);

  if (!sitemapFound) {
    crawlFindings.push({
      severity: "error",
      message: "sitemap.xml not found — falling back to crawling only the base URL",
      hint: "add a sitemap so the crawler and search engines can discover all pages",
    });
    entries = [{ url: baseUrl, lastmod: null }];
  }

  let deduped = dedupeEntries(entries);

  if (opts.filter) {
    const filterPrefix = opts.filter;
    deduped = deduped.filter((entry) => {
      try {
        return new URL(entry.url).pathname.startsWith(filterPrefix);
      } catch {
        return false;
      }
    });
  }

  let cappedAt: number | null = null;
  if (deduped.length > opts.maxPages) {
    cappedAt = opts.maxPages;
    deduped = deduped.slice(0, opts.maxPages);
  }

  const rateLimitedUrls = new Set<string>();
  let concurrencyOverride: number | null = null;
  let noticePrinted = false;

  const pages = await runPool(
    deduped,
    opts.concurrency,
    async (entry) => {
      const markRateLimited = () => {
        if (!rateLimitedUrls.has(entry.url)) {
          rateLimitedUrls.add(entry.url);
          if (rateLimitedUrls.size >= 3 && concurrencyOverride === null) {
            concurrencyOverride = 1;
            if (!noticePrinted) {
              noticePrinted = true;
              // eslint-disable-next-line no-console
              console.error(
                "next-seo-doctor: multiple pages are being rate limited — dropping concurrency to 1 for the rest of the run",
              );
            }
          }
        }
      };
      return fetchPageData(entry, crawlFindings, markRateLimited);
    },
    () => concurrencyOverride ?? opts.concurrency,
  );

  const failedCount = pages.filter((p) => p.failed).length;
  const failureRatio = pages.length > 0 ? failedCount / pages.length : 0;

  const site: SiteData = {
    baseUrl,
    robotsDisallow: robots.disallow,
    robotsFound: robots.found,
    sitemapEntries: deduped,
    sitemapFound,
    cappedAt,
    crawlFindings,
    isLocalhost,
  };

  if (failureRatio > 0.5) {
    return {
      pages,
      site,
      aborted: true,
      abortReason: `site looks broken — fix availability before auditing SEO (${failedCount}/${pages.length} pages failed to fetch)`,
    };
  }

  return { pages, site, aborted: false };
}
