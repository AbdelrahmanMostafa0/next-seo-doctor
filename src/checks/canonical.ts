import type { CheckResult, Finding, PageData, SiteData } from "../types.js";
import { normalizeUrl, normalizeUrlPath } from "../utils/html.js";

function usablePages(pages: PageData[]): PageData[] {
  return pages.filter((p) => p.ok && !p.failed && !p.skipped);
}

export function checkCanonical(pages: PageData[], site: SiteData): CheckResult {
  const findings: Finding[] = [];
  const candidates = usablePages(pages);
  const baseOrigin = new URL(site.baseUrl).origin;
  const foreignOriginPages = new Map<string, number>();
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

    if (canonicalOrigin !== baseOrigin) {
      if (!site.isLocalhost) {
        findings.push({
          severity: "error",
          page: page.finalUrl,
          message: `${page.finalUrl}: canonical origin "${canonicalOrigin}" differs from crawled origin "${baseOrigin}"`,
          hint: "check for a hardcoded production domain or a stale preview-deployment URL",
        });
        continue;
      }
      // Localhost crawl: the app naturally emits production canonicals
      // (metadataBase). Judge the path, and report the origin once after the
      // loop instead of warning on every page.
      if (normalizeUrlPath(page.canonical) !== normalizeUrlPath(page.finalUrl)) {
        findings.push({
          severity: "warn",
          page: page.finalUrl,
          message: `${page.finalUrl}: canonical "${page.canonical}" does not point at this page's path`,
        });
        continue;
      }
      foreignOriginPages.set(canonicalOrigin, (foreignOriginPages.get(canonicalOrigin) ?? 0) + 1);
      okCount++;
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

  // A single production origin on localhost is the normal metadataBase setup;
  // several different origins point at a misconfiguration.
  const multipleOrigins = foreignOriginPages.size > 1;
  for (const [origin, count] of foreignOriginPages) {
    findings.push({
      severity: multipleOrigins ? "warn" : "info",
      message: `${count} page${count === 1 ? "" : "s"} carry canonicals on ${origin} — expected on a localhost crawl, paths self-reference correctly`,
      hint: multipleOrigins
        ? "multiple canonical origins found — all pages should share one production domain"
        : `confirm ${origin} is your production domain, then validate fully with: next-seo-doctor ${origin}`,
    });
  }

  return {
    id: "canonical",
    summary: `${okCount}/${candidates.length} pages ok`,
    findings,
  };
}
