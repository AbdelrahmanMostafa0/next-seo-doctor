import type { CheckResult, Finding, PageData } from "../types.js";

interface Reference {
  id: string;
  pageUrl: string;
  parentKey: string | null;
}

interface WalkContext {
  declaredIds: Set<string>;
  references: Reference[];
  nodeCountByPage: Map<string, number>;
  linkCountByPage: Map<string, number>;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function walk(value: unknown, pageUrl: string, parentKey: string | null, ctx: WalkContext): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, pageUrl, parentKey, ctx);
    return;
  }
  if (!value || typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 1 && keys[0] === "@id" && typeof obj["@id"] === "string") {
    ctx.references.push({ id: obj["@id"] as string, pageUrl, parentKey });
    bump(ctx.linkCountByPage, pageUrl);
    return;
  }

  const hasType = obj["@type"] !== undefined;
  const id = obj["@id"];
  if (hasType && typeof id === "string") {
    ctx.declaredIds.add(id);
  }
  if (hasType) {
    bump(ctx.nodeCountByPage, pageUrl);
  }

  for (const key of keys) {
    walk(obj[key], pageUrl, key, ctx);
  }
}

export function checkJsonLdGraph(pages: PageData[]): CheckResult {
  const ctx: WalkContext = {
    declaredIds: new Set(),
    references: [],
    nodeCountByPage: new Map(),
    linkCountByPage: new Map(),
  };

  for (const page of pages) {
    if (page.failed || page.skipped) continue;
    for (const block of page.jsonLdBlocks) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block);
      } catch {
        continue;
      }
      walk(parsed, page.finalUrl, null, ctx);
    }
  }

  const findings: Finding[] = [];
  let danglingCount = 0;

  for (const ref of ctx.references) {
    if (!ctx.declaredIds.has(ref.id)) {
      danglingCount++;
      const keyLabel = ref.parentKey ? `${ref.parentKey} ` : "";
      findings.push({
        severity: "error",
        page: ref.pageUrl,
        message: `${ref.pageUrl}: ${keyLabel}{"@id": "${ref.id}"} — target never declared`,
      });
    }
  }

  for (const [pageUrl, nodeCount] of ctx.nodeCountByPage) {
    if (nodeCount > 1 && (ctx.linkCountByPage.get(pageUrl) ?? 0) === 0) {
      findings.push({
        severity: "info",
        page: pageUrl,
        message: `${pageUrl}: ${nodeCount} schema nodes present but nothing is connected — consider linking with @id`,
      });
    }
  }

  return {
    id: "jsonld-graph",
    summary: `${danglingCount} dangling @id reference${danglingCount === 1 ? "" : "s"}`,
    findings,
  };
}
