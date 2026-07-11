import { describe, expect, it } from "vitest";
import { checkJsonLdGraph } from "../src/checks/jsonld-graph.js";
import { makePage } from "./fixtures/page.js";

describe("checkJsonLdGraph", () => {
  it("passes when every @id reference resolves to a declared node", () => {
    const pageA = makePage({
      url: "http://localhost:3000/post-a",
      finalUrl: "http://localhost:3000/post-a",
      jsonLdBlocks: [
        JSON.stringify({
          "@type": "Person",
          "@id": "https://example.com/#person",
          name: "Ada",
        }),
      ],
    });
    const pageB = makePage({
      url: "http://localhost:3000/post-b",
      finalUrl: "http://localhost:3000/post-b",
      jsonLdBlocks: [
        JSON.stringify({
          "@type": "Article",
          author: { "@id": "https://example.com/#person" },
        }),
      ],
    });
    const result = checkJsonLdGraph([pageA, pageB]);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("errors on a dangling @id reference", () => {
    const page = makePage({
      url: "http://localhost:3000/post-a",
      finalUrl: "http://localhost:3000/post-a",
      jsonLdBlocks: [
        JSON.stringify({
          "@type": "Article",
          author: { "@id": "https://example.com/#missing" },
        }),
      ],
    });
    const result = checkJsonLdGraph([page]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].message).toContain("author");
  });

  it("finds declared nodes nested in an @graph array", () => {
    const page = makePage({
      url: "http://localhost:3000/",
      finalUrl: "http://localhost:3000/",
      jsonLdBlocks: [
        JSON.stringify({
          "@graph": [
            { "@type": "Organization", "@id": "https://example.com/#org" },
            { "@type": "WebSite", publisher: { "@id": "https://example.com/#org" } },
          ],
        }),
      ],
    });
    const result = checkJsonLdGraph([page]);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("emits an info finding for unlinked multi-node pages", () => {
    const page = makePage({
      url: "http://localhost:3000/",
      finalUrl: "http://localhost:3000/",
      jsonLdBlocks: [
        JSON.stringify({ "@type": "Organization", name: "Acme" }),
        JSON.stringify({ "@type": "WebSite", name: "Acme Site" }),
      ],
    });
    const result = checkJsonLdGraph([page]);
    expect(result.findings.some((f) => f.severity === "info")).toBe(true);
  });
});
