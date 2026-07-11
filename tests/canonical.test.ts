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

  it("downgrades a wrong-origin canonical to a warning on localhost", () => {
    const page = makePage({
      url: "http://localhost:3000/about",
      finalUrl: "http://localhost:3000/about",
      canonical: "https://example.com/about",
    });
    const result = checkCanonical([page], makeSite({ isLocalhost: true }));
    expect(result.findings[0].severity).toBe("warn");
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
