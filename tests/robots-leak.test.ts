import { describe, expect, it } from "vitest";
import { checkRobotsLeak } from "../src/checks/robots-leak.js";
import { makeSite } from "./fixtures/page.js";

describe("checkRobotsLeak", () => {
  it("passes with no sensitive-looking Disallow paths", () => {
    const result = checkRobotsLeak(makeSite({ robotsDisallow: ["/blog-drafts"] }));
    expect(result.findings).toHaveLength(0);
  });

  it("warns (never errors) on a sensitive-looking Disallow path", () => {
    const result = checkRobotsLeak(makeSite({ robotsDisallow: ["/admin/"] }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("warn");
  });

  it("matches case-insensitively", () => {
    const result = checkRobotsLeak(makeSite({ robotsDisallow: ["/Internal-Tools/"] }));
    expect(result.findings).toHaveLength(1);
  });
});
