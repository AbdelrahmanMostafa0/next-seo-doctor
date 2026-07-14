#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { crawlSite } from "./crawler.js";
import { renderJsonReport, renderTerminalReport, type ReportData } from "./report.js";
import { ALL_CHECK_IDS, type CheckId, type CheckResult, type PageData, type SiteData } from "./types.js";
import { checkCanonical } from "./checks/canonical.js";
import { checkSitemapHonesty } from "./checks/sitemap-honesty.js";
import { checkJsonLdValid } from "./checks/jsonld-valid.js";
import { checkJsonLdGraph } from "./checks/jsonld-graph.js";
import { checkJsonLdXss } from "./checks/jsonld-xss.js";
import { checkRobotsLeak } from "./checks/robots-leak.js";
import { checkOgImage } from "./checks/og-image.js";
import { checkDuplicateCanonicals } from "./checks/duplicate-canonicals.js";

export const VERSION = "0.2.0";

const HELP_TEXT = `next-seo-doctor v${VERSION}

Usage: next-seo-doctor <url> [options]

Crawls a running Next.js site and runs technical SEO checks.

Options:
  --max-pages <n>    max pages to crawl (default 200)
  --concurrency <n>  concurrent page fetches (default 5)
  --filter <prefix>  only crawl sitemap URLs whose pathname starts with this prefix
  --only <ids>       comma-separated check IDs; run only these
  --skip <ids>       comma-separated check IDs; run all except these
  --json             machine-readable output instead of colored report
  --version          print version and exit
  --help             print this help and exit

Valid check IDs: ${ALL_CHECK_IDS.join(", ")}

Exit codes:
  0  crawl completed, no error-severity findings
  1  crawl completed, SEO errors found
  2  the tool could not do its job (bad arguments, unreachable, aborted)
`;

export class ArgError extends Error {}

interface ParsedArgs {
  baseUrl: string;
  maxPages: number;
  concurrency: number;
  filter?: string;
  only?: CheckId[];
  skip?: CheckId[];
  json: boolean;
  help: boolean;
  version: boolean;
}

function requireInt(value: string | undefined, flag: string): number {
  if (value === undefined) throw new ArgError(`${flag} requires a value`);
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ArgError(`${flag} must be a positive integer, got "${value}"`);
  }
  return n;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let baseUrl: string | undefined;
  let maxPages = 200;
  let concurrency = 5;
  let filter: string | undefined;
  let only: string[] | undefined;
  let skip: string[] | undefined;
  let json = false;
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--max-pages":
        maxPages = requireInt(argv[++i], "--max-pages");
        break;
      case "--concurrency":
        concurrency = requireInt(argv[++i], "--concurrency");
        break;
      case "--filter": {
        const value = argv[++i];
        if (value === undefined) throw new ArgError("--filter requires a value");
        filter = value;
        break;
      }
      case "--only": {
        const value = argv[++i];
        if (value === undefined) throw new ArgError("--only requires a value");
        only = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "--skip": {
        const value = argv[++i];
        if (value === undefined) throw new ArgError("--skip requires a value");
        skip = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-v":
        version = true;
        break;
      default:
        if (arg.startsWith("--")) throw new ArgError(`unknown flag: ${arg}`);
        if (baseUrl !== undefined) throw new ArgError(`unexpected argument: ${arg}`);
        baseUrl = arg;
    }
  }

  if (help || version) {
    return { baseUrl: baseUrl ?? "", maxPages, concurrency, filter, json, help, version };
  }

  if (only && skip) {
    throw new ArgError("--only and --skip are mutually exclusive");
  }

  const validateIds = (ids: string[] | undefined, flag: string): void => {
    if (!ids) return;
    for (const id of ids) {
      if (!(ALL_CHECK_IDS as string[]).includes(id)) {
        throw new ArgError(`unknown check id "${id}" for ${flag}. Valid IDs: ${ALL_CHECK_IDS.join(", ")}`);
      }
    }
  };
  validateIds(only, "--only");
  validateIds(skip, "--skip");

  if (!baseUrl) {
    throw new ArgError("missing base URL argument");
  }

  return {
    baseUrl,
    maxPages,
    concurrency,
    filter,
    only: only as CheckId[] | undefined,
    skip: skip as CheckId[] | undefined,
    json,
    help,
    version,
  };
}

async function runCheck(id: CheckId, pages: PageData[], site: SiteData): Promise<CheckResult> {
  switch (id) {
    case "canonical":
      return checkCanonical(pages, site);
    case "sitemap-honesty":
      return checkSitemapHonesty(site);
    case "jsonld-valid":
      return checkJsonLdValid(pages);
    case "jsonld-graph":
      return checkJsonLdGraph(pages);
    case "jsonld-xss":
      return checkJsonLdXss(pages);
    case "robots-leak":
      return checkRobotsLeak(site);
    case "og-image":
      return checkOgImage(pages, site);
    case "duplicate-canonicals":
      return checkDuplicateCanonicals(pages);
  }
}

function isDebug(): boolean {
  return process.env.DEBUG === "1";
}

function logFatal(message: string, err?: unknown): void {
  console.error(`next-seo-doctor: ${message}`);
  if (isDebug() && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof ArgError) {
      console.error(`next-seo-doctor: ${err.message}\n`);
      console.error(HELP_TEXT);
      process.exit(2);
    }
    throw err;
  }

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  let baseUrlObj: URL;
  try {
    baseUrlObj = new URL(args.baseUrl);
  } catch {
    logFatal(`invalid base URL: "${args.baseUrl}"`);
    process.exit(2);
  }
  if (baseUrlObj.protocol !== "http:" && baseUrlObj.protocol !== "https:") {
    logFatal(`base URL must use http or https: "${args.baseUrl}"`);
    process.exit(2);
  }

  const baseUrl = baseUrlObj.toString().replace(/\/$/, "");

  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    logFatal(`could not reach ${baseUrl} — ${(err as Error).message}`, err);
    process.exit(2);
  }

  const crawlResult = await crawlSite(baseUrl, {
    maxPages: args.maxPages,
    concurrency: args.concurrency,
    filter: args.filter,
  });

  if (crawlResult.aborted) {
    logFatal(crawlResult.abortReason ?? "crawl aborted");
    process.exit(2);
  }

  const checksToRun = ALL_CHECK_IDS.filter((id) => {
    if (args.only) return args.only.includes(id);
    if (args.skip) return !args.skip.includes(id);
    return true;
  });

  const results: CheckResult[] = [];
  for (const id of checksToRun) {
    results.push(await runCheck(id, crawlResult.pages, crawlResult.site));
  }

  const skippedCount = crawlResult.pages.filter((p) => p.skipped === "rate limited").length;

  const hasErrors =
    crawlResult.site.crawlFindings.some((f) => f.severity === "error") ||
    results.some((r) => r.findings.some((f) => f.severity === "error"));
  const exitCode = hasErrors ? 1 : 0;

  const reportData: ReportData = {
    version: VERSION,
    baseUrl,
    pagesCrawled: crawlResult.pages.length,
    cappedAt: crawlResult.site.cappedAt,
    skippedCount,
    crawlFindings: crawlResult.site.crawlFindings,
    checks: results,
    exitCode,
  };

  console.log(args.json ? renderJsonReport(reportData) : renderTerminalReport(reportData));

  process.exit(exitCode);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMainModule) {
  main().catch((err: unknown) => {
    logFatal(err instanceof Error ? err.message : String(err), err);
    process.exit(2);
  });
}
