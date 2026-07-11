import { describe, expect, it } from "vitest";
import { checkJsonLdXss } from "../src/checks/jsonld-xss.js";
import { makePage } from "./fixtures/page.js";

describe("checkJsonLdXss", () => {
  it("passes properly escaped JSON-LD", () => {
    const page = makePage({
      jsonLdBlocks: ['{"@type":"Article","name":"a \\u003c/script\\u003e b"}'],
    });
    const result = checkJsonLdXss([page]);
    expect(result.findings).toHaveLength(0);
  });

  it("errors on a raw </script> breakout", () => {
    const page = makePage({
      jsonLdBlocks: ['{"@type":"Article","name":"a</script><script>alert(1)</script>"}'],
    });
    const result = checkJsonLdXss([page]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("error");
  });

  it("errors on an unescaped < followed by ! (comment breakout)", () => {
    const page = makePage({ jsonLdBlocks: ['{"@type":"Article","name":"a<!-- --> b"}'] });
    const result = checkJsonLdXss([page]);
    expect(result.findings).toHaveLength(1);
  });
});
