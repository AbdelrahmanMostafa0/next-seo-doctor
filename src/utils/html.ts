import * as cheerio from "cheerio";
import type { OgImageMeta } from "../types.js";

export interface ParsedHtml {
  canonical: string | null;
  jsonLdBlocks: string[];
  ogImage: OgImageMeta | null;
  hasTitle: boolean;
  hasDescription: boolean;
}

export function parseHtml(html: string): ParsedHtml {
  const $ = cheerio.load(html);

  const canonical = $('link[rel="canonical"]').attr("href") ?? null;

  const jsonLdBlocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdBlocks.push($(el).contents().text());
  });

  const ogImageUrl = $('meta[property="og:image"]').attr("content") ?? null;
  let ogImage: OgImageMeta | null = null;
  if (ogImageUrl) {
    const widthRaw = $('meta[property="og:image:width"]').attr("content");
    const heightRaw = $('meta[property="og:image:height"]').attr("content");
    ogImage = {
      url: ogImageUrl,
      width: widthRaw ? Number(widthRaw) : undefined,
      height: heightRaw ? Number(heightRaw) : undefined,
    };
  }

  const hasTitle = $("title").text().trim().length > 0;
  const hasDescription =
    ($('meta[name="description"]').attr("content") ?? "").trim().length > 0;

  return { canonical, jsonLdBlocks, ogImage, hasTitle, hasDescription };
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${u.protocol}//${u.hostname.toLowerCase()}${pathname}${u.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, "");
  }
}

/** Normalized pathname + query of a URL, ignoring its origin. */
export function normalizeUrlPath(url: string): string {
  try {
    const u = new URL(url);
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${pathname}${u.search}`;
  } catch {
    return url.trim();
  }
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1" ||
      u.hostname === "[::1]" ||
      u.hostname === "0.0.0.0" ||
      u.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Rebuilds `url` on `targetOrigin`, keeping path, query, and hash.
 * Returns null when `url` is not an absolute http(s) URL or already lives on the target origin.
 */
export function swapUrlOrigin(url: string, targetOrigin: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.origin === targetOrigin) return null;
    const target = new URL(targetOrigin);
    u.protocol = target.protocol;
    u.host = target.host;
    return u.toString();
  } catch {
    return null;
  }
}
