import type { CheckResult, Finding, PageData } from "../types.js";
import { normalizeUrl } from "../utils/html.js";

export function checkDuplicateCanonicals(pages: PageData[]): CheckResult {
  const findings: Finding[] = [];
  const groups = new Map<string, Set<string>>();

  for (const page of pages) {
    if (page.failed || page.skipped || !page.canonical) continue;
    const key = normalizeUrl(page.canonical);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(page.finalUrl);
  }

  let collisions = 0;
  for (const [canonical, pageUrls] of groups) {
    if (pageUrls.size > 1) {
      collisions++;
      findings.push({
        severity: "error",
        message: `canonical "${canonical}" is claimed by ${pageUrls.size} pages: ${[...pageUrls].join(", ")}`,
      });
    }
  }

  return {
    id: "duplicate-canonicals",
    summary: collisions === 0 ? "no collisions" : `${collisions} canonical collisions`,
    findings,
  };
}
