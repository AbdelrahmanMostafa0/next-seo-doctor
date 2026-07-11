import { describe, expect, it } from "vitest";
import { readImageDimensions } from "../src/utils/image-dimensions.js";

function buildPng(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13, false);
  buf.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

function buildJpegSof(marker: number, width: number, height: number): Uint8Array {
  const bytes: number[] = [0xff, 0xd8, 0xff, marker];
  const length = 8;
  bytes.push((length >> 8) & 0xff, length & 0xff);
  bytes.push(8); // precision
  bytes.push((height >> 8) & 0xff, height & 0xff);
  bytes.push((width >> 8) & 0xff, width & 0xff);
  bytes.push(0); // num components
  return new Uint8Array(bytes);
}

describe("readImageDimensions", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    const buf = buildPng(1200, 630);
    expect(readImageDimensions(buf)).toEqual({ width: 1200, height: 630, format: "png" });
  });

  it("reads JPEG width/height by scanning for the SOF0 marker", () => {
    const buf = buildJpegSof(0xc0, 800, 400);
    expect(readImageDimensions(buf)).toEqual({ width: 800, height: 400, format: "jpeg" });
  });

  it("reads JPEG width/height from a progressive SOF2 marker", () => {
    const buf = buildJpegSof(0xc2, 1024, 768);
    expect(readImageDimensions(buf)).toEqual({ width: 1024, height: 768, format: "jpeg" });
  });

  it("returns null for unrecognized data", () => {
    const buf = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(readImageDimensions(buf)).toBeNull();
  });
});
