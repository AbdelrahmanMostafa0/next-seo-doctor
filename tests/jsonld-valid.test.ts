import { describe, expect, it } from "vitest";
import { checkJsonLdValid } from "../src/checks/jsonld-valid.js";
import { makePage } from "./fixtures/page.js";

describe("checkJsonLdValid", () => {
  it("passes valid JSON-LD blocks", () => {
    const page = makePage({ jsonLdBlocks: ['{"@context":"https://schema.org","@type":"Article"}'] });
    const result = checkJsonLdValid([page]);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toBe("1 blocks parsed");
  });

  it("errors on a malformed JSON-LD block", () => {
    const page = makePage({
      url: "http://localhost:3000/broken",
      finalUrl: "http://localhost:3000/broken",
      jsonLdBlocks: ['{"@type": "Article", oops}'],
    });
    const result = checkJsonLdValid([page]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].message).toContain("/broken");
  });

  it("skips failed/skipped pages", () => {
    const page = makePage({ failed: true, jsonLdBlocks: ["not json"] });
    const result = checkJsonLdValid([page]);
    expect(result.findings).toHaveLength(0);
  });
});
