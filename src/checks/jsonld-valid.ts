import type { CheckResult, Finding, PageData } from "../types.js";

export function checkJsonLdValid(pages: PageData[]): CheckResult {
  const findings: Finding[] = [];
  let total = 0;
  let ok = 0;

  for (const page of pages) {
    if (page.failed || page.skipped) continue;
    for (const block of page.jsonLdBlocks) {
      total++;
      try {
        JSON.parse(block);
        ok++;
      } catch {
        const snippet = block.trim().slice(0, 80);
        findings.push({
          severity: "error",
          page: page.finalUrl,
          message: `${page.finalUrl}: invalid JSON-LD — "${snippet}${block.trim().length > 80 ? "…" : ""}"`,
        });
      }
    }
  }

  return {
    id: "jsonld-valid",
    summary: `${ok} blocks parsed`,
    findings,
  };
}
