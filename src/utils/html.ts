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

export function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}
