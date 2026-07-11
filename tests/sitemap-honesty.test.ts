import { describe, expect, it } from "vitest";
import { checkSitemapHonesty } from "../src/checks/sitemap-honesty.js";
import { makeSite } from "./fixtures/page.js";

describe("checkSitemapHonesty", () => {
  it("passes when lastmod values are varied and mostly present", () => {
    const site = makeSite({
      sitemapEntries: [
        { url: "/a", lastmod: "2026-01-01T00:00:00Z" },
        { url: "/b", lastmod: "2026-02-02T00:00:00Z" },
        { url: "/c", lastmod: "2026-03-03T00:00:00Z" },
      ],
    });
    const result = checkSitemapHonesty(site);
    expect(result.findings).toHaveLength(0);
  });

  it("errors when 80%+ of lastmod values are identical (stamped build time)", () => {
    const stamped = "2026-07-11T09:14:22Z";
    const site = makeSite({
      sitemapEntries: [
        { url: "/a", lastmod: stamped },
        { url: "/b", lastmod: stamped },
        { url: "/c", lastmod: stamped },
        { url: "/d", lastmod: stamped },
        { url: "/e", lastmod: "2020-01-01T00:00:00Z" },
      ],
    });
    const result = checkSitemapHonesty(site);
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].message).toContain("2026-07-11T09:14:22");
  });

  it("warns when fewer than half of entries have lastmod at all", () => {
    const site = makeSite({
      sitemapEntries: [
        { url: "/a", lastmod: "2026-01-01T00:00:00Z" },
        { url: "/b", lastmod: null },
        { url: "/c", lastmod: null },
        { url: "/d", lastmod: null },
      ],
    });
    const result = checkSitemapHonesty(site);
    expect(result.findings[0].severity).toBe("warn");
  });
});
