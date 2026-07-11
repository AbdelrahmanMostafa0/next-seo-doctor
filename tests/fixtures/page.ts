import type { PageData, SiteData } from "../../src/types.js";

export function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: "http://localhost:3000/",
    finalUrl: "http://localhost:3000/",
    status: 200,
    ok: true,
    canonical: null,
    jsonLdBlocks: [],
    ogImage: null,
    hasTitle: true,
    hasDescription: true,
    lastmod: null,
    ...overrides,
  };
}

export function makeSite(overrides: Partial<SiteData> = {}): SiteData {
  return {
    baseUrl: "http://localhost:3000",
    robotsDisallow: [],
    robotsFound: true,
    sitemapEntries: [],
    sitemapFound: true,
    cappedAt: null,
    crawlFindings: [],
    isLocalhost: true,
    ...overrides,
  };
}
