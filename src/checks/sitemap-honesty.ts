import type { CheckResult, Finding, SiteData } from "../types.js";

function toSecondPrecision(lastmod: string): string {
  const date = new Date(lastmod);
  if (Number.isNaN(date.getTime())) return lastmod.trim();
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

export function checkSitemapHonesty(site: SiteData): CheckResult {
  const findings: Finding[] = [];
  const entries = site.sitemapEntries;
  const withLastmod = entries.filter((e) => e.lastmod);

  if (entries.length === 0) {
    return { id: "sitemap-honesty", summary: "no sitemap entries", findings };
  }

  if (withLastmod.length / entries.length < 0.5) {
    findings.push({
      severity: "warn",
      message: `only ${withLastmod.length}/${entries.length} sitemap entries have a lastmod value`,
    });
  }

  if (withLastmod.length > 0) {
    const counts = new Map<string, number>();
    for (const entry of withLastmod) {
      const key = toSecondPrecision(entry.lastmod as string);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let topValue = "";
    let topCount = 0;
    for (const [value, count] of counts) {
      if (count > topCount) {
        topValue = value;
        topCount = count;
      }
    }
    if (topCount / withLastmod.length >= 0.8) {
      findings.push({
        severity: "error",
        message: `${topCount}/${withLastmod.length} lastmod values are identical (${topValue})`,
        hint: "use real content dates (post.updated ?? post.date), not new Date() at build time",
      });
    }
  }

  const summary =
    findings.length === 0
      ? `${withLastmod.length}/${entries.length} entries have honest lastmod values`
      : findings[findings.length - 1].message;

  return { id: "sitemap-honesty", summary, findings };
}
