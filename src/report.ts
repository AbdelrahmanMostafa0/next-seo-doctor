import pc from "picocolors";
import type { CheckResult, Finding, Severity } from "./types.js";

const MAX_FINDINGS_SHOWN = 10;
const ID_COLUMN_WIDTH = 22;

export interface ReportSection {
  id: string;
  summary: string;
  findings: Finding[];
}

export interface ReportData {
  version: string;
  baseUrl: string;
  pagesCrawled: number;
  cappedAt: number | null;
  skippedCount: number;
  crawlFindings: Finding[];
  checks: CheckResult[];
  exitCode: number;
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

function sectionIcon(findings: Finding[]): string {
  const counts = countBySeverity(findings);
  if (counts.error > 0) return pc.red("✗");
  if (counts.warn > 0) return pc.yellow("⚠");
  return pc.green("✓");
}

function findingPrefix(severity: Severity): string {
  if (severity === "error") return pc.red("→");
  if (severity === "warn") return pc.yellow("→");
  return pc.dim("→");
}

function renderSection(id: string, summary: string, findings: Finding[], lines: string[]): void {
  const icon = sectionIcon(findings);
  lines.push(`${icon} ${id.padEnd(ID_COLUMN_WIDTH)} ${summary}`);

  const shown = findings.slice(0, MAX_FINDINGS_SHOWN);
  for (const finding of shown) {
    lines.push(`    ${findingPrefix(finding.severity)} ${finding.message}`);
    if (finding.hint) {
      lines.push(`      ${pc.dim(finding.hint)}`);
    }
  }
  if (findings.length > MAX_FINDINGS_SHOWN) {
    lines.push(pc.dim(`    …and ${findings.length - MAX_FINDINGS_SHOWN} more`));
  }
}

export function renderTerminalReport(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`next-seo-doctor v${data.version} — crawled ${data.pagesCrawled} pages from ${data.baseUrl}`);
  lines.push("");

  if (data.cappedAt !== null) {
    lines.push(pc.dim(`crawl capped at ${data.cappedAt} pages (--max-pages)`));
  }
  if (data.skippedCount > 0) {
    lines.push(pc.dim(`${data.skippedCount} page${data.skippedCount === 1 ? "" : "s"} skipped: rate limited`));
  }
  if (data.cappedAt !== null || data.skippedCount > 0) lines.push("");

  if (data.crawlFindings.length > 0) {
    const errorCount = data.crawlFindings.filter((f) => f.severity === "error").length;
    renderSection("crawl", `${errorCount} issue${errorCount === 1 ? "" : "s"} found`, data.crawlFindings, lines);
  }

  for (const check of data.checks) {
    renderSection(check.id, check.summary, check.findings, lines);
  }

  lines.push("");

  const allFindings = [...data.crawlFindings, ...data.checks.flatMap((c) => c.findings)];
  const totals = countBySeverity(allFindings);
  const parts = [
    `${totals.error} error${totals.error === 1 ? "" : "s"}`,
    `${totals.warn} warning${totals.warn === 1 ? "" : "s"}`,
  ];
  lines.push(`${parts.join(", ")} — exit ${data.exitCode}`);

  return lines.join("\n");
}

interface JsonCheckEntry {
  id: string;
  severityCounts: Record<Severity, number>;
  findings: Finding[];
}

export function renderJsonReport(data: ReportData): string {
  const checks: JsonCheckEntry[] = [];

  if (data.crawlFindings.length > 0) {
    checks.push({
      id: "crawl",
      severityCounts: countBySeverity(data.crawlFindings),
      findings: data.crawlFindings,
    });
  }

  for (const check of data.checks) {
    checks.push({
      id: check.id,
      severityCounts: countBySeverity(check.findings),
      findings: check.findings,
    });
  }

  return JSON.stringify(
    {
      version: data.version,
      baseUrl: data.baseUrl,
      pagesCrawled: data.pagesCrawled,
      checks,
      exitCode: data.exitCode,
    },
    null,
    2,
  );
}
