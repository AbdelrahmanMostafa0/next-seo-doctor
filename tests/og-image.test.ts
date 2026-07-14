import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOgImage } from "../src/checks/og-image.js";
import { makePage, makeSite } from "./fixtures/page.js";

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
    const result = await checkOgImage([page], makeSite());
    expect(result.findings[0].severity).toBe("warn");
  });

  it("passes a correctly sized 1200x630 image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeImageResponse(1200, 630)),
    );
    const page = makePage({ ogImage: { url: "/og.png" } });
    const result = await checkOgImage([page], makeSite());
    expect(result.findings).toHaveLength(0);
  });

  it("warns when the image is not exactly 1200x630", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeImageResponse(1024, 512)),
    );
    const page = makePage({ ogImage: { url: "/og.png" } });
    const result = await checkOgImage([page], makeSite());
    expect(result.findings[0].severity).toBe("warn");
    expect(result.findings[0].message).toContain("1024");
  });

  it("errors when the og:image URL returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const page = makePage({ ogImage: { url: "/missing.png" } });
    const result = await checkOgImage([page], makeSite());
    expect(result.findings[0].severity).toBe("error");
  });

  it("fetches og:image from localhost when its origin was remapped during the crawl", async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse(1200, 630));
    vi.stubGlobal("fetch", fetchMock);
    const page = makePage({ ogImage: { url: "https://prod.example/og.png" } });
    const site = makeSite({ remappedOrigins: ["https://prod.example"] });
    const result = await checkOgImage([page], site);
    expect(result.findings.filter((f) => f.severity !== "info")).toHaveLength(0);
    expect(result.findings.some((f) => f.severity === "info" && f.message.includes("fetched from"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/og.png", expect.anything());
  });

  it("fetches og:image from localhost when the canonical reveals the production origin", async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse(1200, 630));
    vi.stubGlobal("fetch", fetchMock);
    const page = makePage({
      canonical: "https://prod.example/",
      ogImage: { url: "https://prod.example/og.png" },
    });
    const site = makeSite({ remappedOrigins: [] });
    const result = await checkOgImage([page], site);
    expect(result.findings.filter((f) => f.severity !== "info")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/og.png", expect.anything());
  });

  it("does not swap og:image origins when the crawl target is not localhost", async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse(1200, 630));
    vi.stubGlobal("fetch", fetchMock);
    const page = makePage({
      url: "https://staging.example/",
      finalUrl: "https://staging.example/",
      canonical: "https://prod.example/",
      ogImage: { url: "https://prod.example/og.png" },
    });
    const site = makeSite({
      baseUrl: "https://staging.example",
      isLocalhost: false,
      remappedOrigins: [],
    });
    await checkOgImage([page], site);
    expect(fetchMock).toHaveBeenCalledWith("https://prod.example/og.png", expect.anything());
  });

  it("leaves og:image on unrelated origins (CDNs) untouched on localhost", async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse(1200, 630));
    vi.stubGlobal("fetch", fetchMock);
    const page = makePage({ ogImage: { url: "https://cdn.example/og.png" } });
    const site = makeSite({ remappedOrigins: ["https://prod.example"] });
    await checkOgImage([page], site);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example/og.png", expect.anything());
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
    await checkOgImage([pageA, pageB], makeSite());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
