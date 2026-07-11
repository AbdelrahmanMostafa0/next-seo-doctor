import { describe, expect, it } from "vitest";
import { ArgError, parseArgs } from "../src/index.js";

describe("parseArgs", () => {
  it("parses a bare URL with defaults", () => {
    const args = parseArgs(["http://localhost:3000"]);
    expect(args.baseUrl).toBe("http://localhost:3000");
    expect(args.maxPages).toBe(200);
    expect(args.concurrency).toBe(5);
    expect(args.only).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it("parses --only into a check id list", () => {
    const args = parseArgs(["http://localhost:3000", "--only", "canonical,og-image"]);
    expect(args.only).toEqual(["canonical", "og-image"]);
  });

  it("parses --skip into a check id list", () => {
    const args = parseArgs(["http://localhost:3000", "--skip", "robots-leak"]);
    expect(args.skip).toEqual(["robots-leak"]);
  });

  it("rejects passing both --only and --skip", () => {
    expect(() =>
      parseArgs(["http://localhost:3000", "--only", "canonical", "--skip", "og-image"]),
    ).toThrow(ArgError);
  });

  it("rejects an unknown check id", () => {
    expect(() => parseArgs(["http://localhost:3000", "--only", "not-a-real-check"])).toThrow(
      ArgError,
    );
  });

  it("rejects a missing base URL", () => {
    expect(() => parseArgs(["--json"])).toThrow(ArgError);
  });

  it("parses --max-pages and --concurrency as integers", () => {
    const args = parseArgs(["http://localhost:3000", "--max-pages", "50", "--concurrency", "2"]);
    expect(args.maxPages).toBe(50);
    expect(args.concurrency).toBe(2);
  });

  it("rejects a non-integer --max-pages", () => {
    expect(() => parseArgs(["http://localhost:3000", "--max-pages", "abc"])).toThrow(ArgError);
  });
});
