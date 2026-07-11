import type { CheckResult, Finding, PageData } from "../types.js";

const SCRIPT_BREAKOUT = /<\/script/i;
const UNESCAPED_ANGLE = /<[/!]/;

export function checkJsonLdXss(pages: PageData[]): CheckResult {
  const findings: Finding[] = [];
  let total = 0;
  let safe = 0;

  for (const page of pages) {
    if (page.failed || page.skipped) continue;
    for (const block of page.jsonLdBlocks) {
      total++;
      if (SCRIPT_BREAKOUT.test(block) || UNESCAPED_ANGLE.test(block)) {
        findings.push({
          severity: "error",
          page: page.finalUrl,
          message: `${page.finalUrl}: JSON-LD block contains an unescaped "<" — script breakout risk`,
          hint: 'JSON.stringify(data).replace(/</g, "\\u003c")',
        });
      } else {
        safe++;
      }
    }
  }

  return {
    id: "jsonld-xss",
    summary: total === 0 ? "no blocks found" : `${safe}/${total} blocks escaped`,
    findings,
  };
}
