import { describe, expect, it } from "vitest";
import { checkCanonical } from "../src/checks/canonical.js";
import { makePage, makeSite } from "./fixtures/page.js";

describe("checkCanonical", () => {
  it("passes a self-referencing absolute canonical", () => {
    const page = makePage({
      url: "http://localhost:3000/about",
      finalUrl: "http://localhost:3000/about",
      canonical: "http://localhost:3000/about",
    });
    const result = checkCanonical([page], makeSite());
    expect(result.findings).toHaveLength(0);
  });

  it("errors when no canonical tag is present", () => {
    const page = makePage({ canonical: null });
    const result = checkCanonical([page], makeSite());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("error");
  });

  it("errors on a relative canonical href", () => {
    const page = makePage({ canonical: "/about" });
    const result = checkCanonical([page], makeSite());
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].hint).toMatch(/metadataBase/);
  });

  it("accepts a production-origin canonical on localhost when the path self-references", () => {
    const page = makePage({
      url: "http://localhost:3000/about",
      finalUrl: "http://localhost:3000/about",
      canonical: "https://example.com/about",
    });
    const result = checkCanonical([page], makeSite({ isLocalhost: true }));
    expect(result.summary).toBe("1/1 pages ok");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("info");
    expect(result.findings[0].message).toContain("https://example.com");
  });

  it("warns on localhost when a production-origin canonical points at a different path", () => {
    const page = makePage({
      url: "http://localhost:3000/about",
      finalUrl: "http://localhost:3000/about",
      canonical: "https://example.com/other",
    });
    const result = checkCanonical([page], makeSite({ isLocalhost: true }));
    expect(result.summary).toBe("0/1 pages ok");
    expect(result.findings[0].severity).toBe("warn");
    expect(result.findings[0].message).toContain("does not point at this page's path");
  });

  it("warns on localhost when canonicals are split across multiple production origins", () => {
    const pageA = makePage({
      url: "http://localhost:3000/a",
      finalUrl: "http://localhost:3000/a",
      canonical: "https://example.com/a",
    });
    const pageB = makePage({
      url: "http://localhost:3000/b",
      finalUrl: "http://localhost:3000/b",
      canonical: "https://other.example/b",
    });
    const result = checkCanonical([pageA, pageB], makeSite({ isLocalhost: true }));
    const originFindings = result.findings.filter((f) => f.message.includes("carry canonicals"));
    expect(originFindings).toHaveLength(2);
    expect(originFindings.every((f) => f.severity === "warn")).toBe(true);
  });

  it("errors on a wrong-origin canonical off localhost", () => {
    const page = makePage({
      url: "https://mysite.com/about",
      finalUrl: "https://mysite.com/about",
      canonical: "https://staging.mysite.com/about",
    });
    const result = checkCanonical(
      [page],
      makeSite({ baseUrl: "https://mysite.com", isLocalhost: false }),
    );
    expect(result.findings[0].severity).toBe("error");
  });

  it("warns on a non-self-referencing canonical", () => {
    const page = makePage({
      url: "http://localhost:3000/about/",
      finalUrl: "http://localhost:3000/about/",
      canonical: "http://localhost:3000/other-page",
    });
    const result = checkCanonical([page], makeSite());
    expect(result.findings[0].severity).toBe("warn");
  });
});
