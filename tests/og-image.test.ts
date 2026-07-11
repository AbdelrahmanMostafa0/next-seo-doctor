import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOgImage } from "../src/checks/og-image.js";
import { makePage } from "./fixtures/page.js";

function buildPng(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13, false);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

function fakeImageResponse(width: number, height: number): Response {
  const bytes = buildPng(width, height);
  return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkOgImage", () => {
  it("warns when no og:image tag is present", async () => {
    const page = makePage({ ogImage: null });
    const result = await checkOgImage([page]);
    expect(result.findings[0].severity).toBe("warn");
  });

  it("passes a correctly sized 1200x630 image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeImageResponse(1200, 630)),
    );
    const page = makePage({ ogImage: { url: "/og.png" } });
    const result = await checkOgImage([page]);
    expect(result.findings).toHaveLength(0);
  });

  it("warns when the image is not exactly 1200x630", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeImageResponse(1024, 512)),
    );
    const page = makePage({ ogImage: { url: "/og.png" } });
    const result = await checkOgImage([page]);
    expect(result.findings[0].severity).toBe("warn");
    expect(result.findings[0].message).toContain("1024");
  });

  it("errors when the og:image URL returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const page = makePage({ ogImage: { url: "/missing.png" } });
    const result = await checkOgImage([page]);
    expect(result.findings[0].severity).toBe("error");
  });

  it("fetches a shared og:image URL only once across pages", async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse(1200, 630));
    vi.stubGlobal("fetch", fetchMock);
    const pageA = makePage({
      url: "http://localhost:3000/a",
      finalUrl: "http://localhost:3000/a",
      ogImage: { url: "/shared.png" },
    });
    const pageB = makePage({
      url: "http://localhost:3000/b",
      finalUrl: "http://localhost:3000/b",
      ogImage: { url: "/shared.png" },
    });
    await checkOgImage([pageA, pageB]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
