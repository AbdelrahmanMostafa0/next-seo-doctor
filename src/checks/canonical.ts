import type { CheckResult, Finding, PageData, SiteData } from "../types.js";
import { normalizeUrl } from "../utils/html.js";

function usablePages(pages: PageData[]): PageData[] {
  return pages.filter((p) => p.ok && !p.failed && !p.skipped);
}

export function checkCanonical(pages: PageData[], site: SiteData): CheckResult {
  const findings: Finding[] = [];
  const candidates = usablePages(pages);
  let okCount = 0;

  for (const page of candidates) {
    if (!page.canonical) {
      findings.push({
        severity: "error",
        page: page.finalUrl,
        message: `${page.finalUrl}: no <link rel="canonical"> found`,
      });
      continue;
    }

    const isRelative = !/^https?:\/\//i.test(page.canonical);
    if (isRelative) {
      findings.push({
        severity: "error",
        page: page.finalUrl,
        message: `${page.finalUrl}: canonical href "${page.canonical}" is relative`,
        hint: "set metadataBase in your root layout so canonical URLs resolve to absolute URLs",
      });
      continue;
    }

    let canonicalOrigin: string;
    try {
      canonicalOrigin = new URL(page.canonical).origin;
    } catch {
      findings.push({
        severity: "error",
        page: page.finalUrl,
        message: `${page.finalUrl}: canonical href "${page.canonical}" is not a valid URL`,
      });
      continue;
    }

    const baseOrigin = new URL(site.baseUrl).origin;
    if (canonicalOrigin !== baseOrigin) {
      const severity = site.isLocalhost ? "warn" : "error";
      findings.push({
        severity,
        page: page.finalUrl,
        message: `${page.finalUrl}: canonical origin "${canonicalOrigin}" differs from crawled origin "${baseOrigin}"`,
        hint: site.isLocalhost
          ? "production canonicals while crawling localhost are expected — verify this is intentional"
          : "check for a hardcoded production domain or a stale preview-deployment URL",
      });
      continue;
    }

    if (normalizeUrl(page.canonical) !== normalizeUrl(page.finalUrl)) {
      findings.push({
        severity: "warn",
        page: page.finalUrl,
        message: `${page.finalUrl}: canonical "${page.canonical}" does not self-reference this page`,
      });
      continue;
    }

    okCount++;
  }

  return {
    id: "canonical",
    summary: `${okCount}/${candidates.length} pages ok`,
    findings,
  };
}
