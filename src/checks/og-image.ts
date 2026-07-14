import type { CheckResult, Finding, PageData, SiteData } from "../types.js";
import { readImageDimensions } from "../utils/image-dimensions.js";
import { swapUrlOrigin } from "../utils/html.js";

const EXPECTED_WIDTH = 1200;
const EXPECTED_HEIGHT = 630;
const IMAGE_TIMEOUT_MS = 10_000;

interface ImageFetchResult {
  status: number | null;
  width?: number;
  height?: number;
}

async function fetchImage(url: string): Promise<ImageFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { status: response.status };
    const contentType = response.headers.get("content-type") ?? "";
    if (!/image\/(png|jpeg|jpg)/i.test(contentType)) return { status: response.status };
    const buffer = new Uint8Array(await response.arrayBuffer());
    const dims = readImageDimensions(buffer);
    if (!dims) return { status: response.status };
    return { status: response.status, width: dims.width, height: dims.height };
  } catch {
    return { status: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOgImage(pages: PageData[], site: SiteData): Promise<CheckResult> {
  const findings: Finding[] = [];
  const candidates = pages.filter((p) => p.ok && !p.failed && !p.skipped);
  const cache = new Map<string, Promise<ImageFetchResult>>();
  const baseOrigin = new URL(site.baseUrl).origin;
  let ok = 0;

  // On a localhost crawl, the site's production origin shows up in URLs the app
  // builds from metadataBase. The sitemap may already use localhost (env-based
  // base URL), so the crawl-time remap list alone can miss it — canonical
  // origins reveal it too. og:image URLs on any of these origins are fetched
  // from the local server; unrelated origins (CDNs, external hosts) are not.
  const siteOrigins = new Set(site.remappedOrigins);
  if (site.isLocalhost) {
    for (const page of candidates) {
      if (!page.canonical) continue;
      try {
        const origin = new URL(page.canonical).origin;
        if (origin !== baseOrigin) siteOrigins.add(origin);
      } catch {
        // relative or malformed canonical — the canonical check reports it
      }
    }
  }
  const localizedOrigins = new Set<string>();

  for (const page of candidates) {
    if (!page.ogImage) {
      findings.push({
        severity: "warn",
        page: page.finalUrl,
        message: `${page.finalUrl}: no og:image meta tag`,
      });
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(page.ogImage.url, page.finalUrl).toString();
    } catch {
      findings.push({
        severity: "error",
        page: page.finalUrl,
        message: `${page.finalUrl}: og:image url "${page.ogImage.url}" is not a valid URL`,
      });
      continue;
    }

    const imageOrigin = new URL(resolvedUrl).origin;
    if (site.isLocalhost && siteOrigins.has(imageOrigin)) {
      const swapped = swapUrlOrigin(resolvedUrl, baseOrigin);
      if (swapped) {
        resolvedUrl = swapped;
        localizedOrigins.add(imageOrigin);
      }
    }

    if (!cache.has(resolvedUrl)) {
      cache.set(resolvedUrl, fetchImage(resolvedUrl));
    }
    const result = await cache.get(resolvedUrl)!;

    if (result.status === null || result.status < 200 || result.status >= 300) {
      findings.push({
        severity: "error",
        page: page.finalUrl,
        message: `${page.finalUrl}: og:image ${resolvedUrl} returned ${result.status ?? "no response"}`,
      });
      continue;
    }

    if (result.width !== undefined && result.height !== undefined) {
      if (result.width !== EXPECTED_WIDTH || result.height !== EXPECTED_HEIGHT) {
        findings.push({
          severity: "warn",
          page: page.finalUrl,
          message: `${page.finalUrl}: og:image is ${result.width}×${result.height}, expected ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT}`,
        });
        continue;
      }
    }

    ok++;
  }

  if (localizedOrigins.size > 0) {
    findings.push({
      severity: "info",
      message: `og:image URLs point at ${[...localizedOrigins].join(", ")} — fetched from ${site.baseUrl} instead for local testing`,
    });
  }

  return {
    id: "og-image",
    summary: `${ok}/${candidates.length} ok`,
    findings,
  };
}
