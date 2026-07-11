export type Severity = "error" | "warn" | "info";

export interface Finding {
  severity: Severity;
  message: string;
  hint?: string;
  page?: string;
}

export interface CheckResult {
  id: CheckId;
  summary: string;
  findings: Finding[];
}

export type CheckId =
  | "canonical"
  | "sitemap-honesty"
  | "jsonld-valid"
  | "jsonld-graph"
  | "jsonld-xss"
  | "robots-leak"
  | "og-image"
  | "duplicate-canonicals";

export const ALL_CHECK_IDS: CheckId[] = [
  "canonical",
  "sitemap-honesty",
  "jsonld-valid",
  "jsonld-graph",
  "jsonld-xss",
  "robots-leak",
  "og-image",
  "duplicate-canonicals",
];

export interface OgImageMeta {
  url: string;
  width?: number;
  height?: number;
}

export interface PageData {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  skipped?: "rate limited" | "non-html";
  failed?: boolean;
  canonical: string | null;
  jsonLdBlocks: string[];
  ogImage: OgImageMeta | null;
  hasTitle: boolean;
  hasDescription: boolean;
  lastmod: string | null;
}

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

export interface SiteData {
  baseUrl: string;
  robotsDisallow: string[];
  robotsFound: boolean;
  sitemapEntries: SitemapEntry[];
  sitemapFound: boolean;
  cappedAt: number | null;
  /** Findings for the "crawl" pseudo-section: dead sitemap URLs, missing sitemap, etc. */
  crawlFindings: Finding[];
  isLocalhost: boolean;
}

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg";
}
