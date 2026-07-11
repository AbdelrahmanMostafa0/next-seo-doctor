import { describe, expect, it } from "vitest";
import { checkDuplicateCanonicals } from "../src/checks/duplicate-canonicals.js";
import { makePage } from "./fixtures/page.js";

describe("checkDuplicateCanonicals", () => {
  it("passes when every canonical is unique", () => {
    const pages = [
      makePage({ finalUrl: "http://localhost:3000/a", canonical: "http://localhost:3000/a" }),
      makePage({ finalUrl: "http://localhost:3000/b", canonical: "http://localhost:3000/b" }),
    ];
    const result = checkDuplicateCanonicals(pages);
    expect(result.findings).toHaveLength(0);
  });

  it("errors when two distinct pages claim the same canonical", () => {
    const pages = [
      makePage({ finalUrl: "http://localhost:3000/a", canonical: "http://localhost:3000/canonical" }),
      makePage({ finalUrl: "http://localhost:3000/b", canonical: "http://localhost:3000/canonical" }),
    ];
    const result = checkDuplicateCanonicals(pages);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].message).toContain("/a");
    expect(result.findings[0].message).toContain("/b");
  });

  it("treats trailing-slash variants as the same canonical", () => {
    const pages = [
      makePage({ finalUrl: "http://localhost:3000/a", canonical: "http://localhost:3000/canonical" }),
      makePage({ finalUrl: "http://localhost:3000/b", canonical: "http://localhost:3000/canonical/" }),
    ];
    const result = checkDuplicateCanonicals(pages);
    expect(result.findings).toHaveLength(1);
  });
});
