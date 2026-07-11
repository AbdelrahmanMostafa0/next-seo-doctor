import type { ImageDimensions } from "../types.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buf: Uint8Array): boolean {
  if (buf.length < 24) return false;
  return PNG_SIGNATURE.every((byte, i) => buf[i] === byte);
}

function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

function readPngDimensions(buf: Uint8Array): ImageDimensions | null {
  if (!isPng(buf)) return null;
  // IHDR chunk starts right after the 8-byte signature + 4-byte length + 4-byte "IHDR" tag.
  // Width: bytes 16-19 (big-endian), Height: bytes 20-23 (big-endian).
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return { width, height, format: "png" };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpegDimensions(buf: Uint8Array): ImageDimensions | null {
  if (!isJpeg(buf)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // Standalone markers with no length/payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buf.length) break;
    const segmentLength = view.getUint16(offset + 2, false);
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 > buf.length) return null;
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      return { width, height, format: "jpeg" };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

export function readImageDimensions(buf: Uint8Array): ImageDimensions | null {
  return readPngDimensions(buf) ?? readJpegDimensions(buf);
}
