import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite } from "../src/crawler.js";

const BASE = "http://localhost:3000";

function html(title = "Page"): string {
  return `<!doctype html><html><head><title>${title}</title></head><body></body></html>`;
}

function urlset(urls: string[]): string {
  const items = urls.map((u) => `<url><loc>${u}</loc></url>`).join("");
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

type RouteHandler = (callNumber: number) => Response;

function makeFetch(routes: Record<string, RouteHandler>) {
  const callCounts = new Map<string, number>();
  return vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const n = (callCounts.get(url) ?? 0) + 1;
    callCounts.set(url, n);
    const handler = routes[url];
    if (!handler) return new Response("not found", { status: 404 });
    return handler(n);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crawlSite", () => {
  it("retries a 429 respecting Retry-After, then succeeds", async () => {
    const fetchMock = makeFetch({
      [`${BASE}/sitemap.xml`]: () =>
        new Response(urlset([`${BASE}/rate-limited`]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      [`${BASE}/rate-limited`]: (n) =>
        n === 1
          ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } })
          : new Response(html(), { status: 200, headers: { "content-type": "text/html" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].skipped).toBeUndefined();
    expect(result.pages[0].status).toBe(200);
    expect(fetchMock.mock.calls.filter((c) => c[0] === `${BASE}/rate-limited`)).toHaveLength(2);
  });

  it("marks a page failed when a redirect loop exceeds the hop handling", async () => {
    const fetchMock = makeFetch({
      [`${BASE}/sitemap.xml`]: () =>
        new Response(urlset([`${BASE}/loop-a`]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      [`${BASE}/loop-a`]: () =>
        new Response(null, { status: 302, headers: { location: `${BASE}/loop-b` } }),
      [`${BASE}/loop-b`]: () =>
        new Response(null, { status: 302, headers: { location: `${BASE}/loop-a` } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.pages[0].failed).toBe(true);
  });

  it("records a dead sitemap URL as a crawl finding", async () => {
    const fetchMock = makeFetch({
      [`${BASE}/sitemap.xml`]: () =>
        new Response(urlset([`${BASE}/gone`]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      [`${BASE}/gone`]: () => new Response("gone", { status: 404 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.site.crawlFindings.some((f) => f.message.includes("dead URL"))).toBe(true);
  });

  it("aborts the run when more than half the pages fail to fetch", async () => {
    const urls = [`${BASE}/ok`, `${BASE}/bad1`, `${BASE}/bad2`, `${BASE}/bad3`];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === `${BASE}/sitemap.xml`) {
        return new Response(urlset(urls), { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url === `${BASE}/ok`) {
        return new Response(html(), { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error("network error");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toMatch(/site looks broken/);
  });

  it("follows a sitemapindex and merges child sitemap entries", async () => {
    const fetchMock = makeFetch({
      [`${BASE}/sitemap.xml`]: () =>
        new Response(
          `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${BASE}/sitemap-a.xml</loc></sitemap></sitemapindex>`,
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      [`${BASE}/sitemap-a.xml`]: () =>
        new Response(urlset([`${BASE}/a`, `${BASE}/b`]), {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      [`${BASE}/a`]: () => new Response(html(), { status: 200, headers: { "content-type": "text/html" } }),
      [`${BASE}/b`]: () => new Response(html(), { status: 200, headers: { "content-type": "text/html" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.site.sitemapFound).toBe(true);
    expect(result.site.sitemapEntries.map((e) => e.url).sort()).toEqual([`${BASE}/a`, `${BASE}/b`]);
    expect(result.pages).toHaveLength(2);
  });

  it("falls back to crawling the base URL when the sitemap is missing", async () => {
    const fetchMock = makeFetch({
      [BASE]: () => new Response(html(), { status: 200, headers: { "content-type": "text/html" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlSite(BASE, { maxPages: 200, concurrency: 5 });

    expect(result.site.sitemapFound).toBe(false);
    expect(result.site.crawlFindings.some((f) => f.severity === "error")).toBe(true);
    expect(result.pages).toHaveLength(1);
  });
});
