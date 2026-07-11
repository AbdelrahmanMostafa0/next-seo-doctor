import type { CheckResult, Finding, SiteData } from "../types.js";

const SENSITIVE_KEYWORDS = [
  "admin",
  "dashboard",
  "internal",
  "secret",
  "private",
  "staging",
  "backup",
  ".env",
  "config",
];

export function checkRobotsLeak(site: SiteData): CheckResult {
  const findings: Finding[] = [];

  for (const path of site.robotsDisallow) {
    const lower = path.toLowerCase();
    const matched = SENSITIVE_KEYWORDS.find((keyword) => lower.includes(keyword));
    if (matched) {
      findings.push({
        severity: "warn",
        message: `Disallow: ${path} — robots.txt is public; sensitive paths need auth, not a Disallow entry`,
      });
    }
  }

  return {
    id: "robots-leak",
    summary: findings.length === 0 ? "no sensitive-looking paths in robots.txt" : `${findings.length} suspicious Disallow entries`,
    findings,
  };
}
