/**
 * V4-1: the web, for discovery only. A keyless search (DuckDuckGo's HTML page) and a page fetch
 * that returns the page text. Nothing from the web verifies a citation (ruling R-6). Plain library.
 */
import { decodeEntities, get, getText, htmlToText, SourceError } from "./http.ts";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH = "https://html.duckduckgo.com/html/?q=";

export function parseDuckDuckGo(html: string): WebHit[] {
  const hits: WebHit[] = [];
  const blocks = html.split(/class="result results_links/).slice(1);
  for (const b of blocks) {
    const a = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    if (!a) continue;
    let url = decodeEntities(a[1]);
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    hits.push({ title: htmlToText(a[2]).replace(/\n/g, " "), url, snippet: snip ? htmlToText(snip[1]).replace(/\n/g, " ") : "" });
  }
  return hits;
}

export async function webSearch(query: string, limit = 10): Promise<WebHit[]> {
  const html = await getText(`${SEARCH}${encodeURIComponent(query)}`, { timeoutMs: 30_000 });
  if (/anomaly-modal|challenge-form/.test(html) && !/result__a/.test(html)) throw new SourceError("SOURCE_REFUSED", "the search engine asked for a human check; search in the browser instead");
  return parseDuckDuckGo(html).slice(0, limit);
}

/** Addresses the page fetch never opens: this computer and private networks. */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "0.0.0.0" || h === "::1") return false;
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^(fc|fd|fe80)/.test(h) && h.includes(":")) return false;
  return true;
}

export interface WebPage {
  url: string;
  contentType: string;
  title: string;
  text: string;
  truncated: boolean;
}

export const MAX_PAGE_CHARS = 24_000;

/** Fetch one public page as text. A PDF is returned as bytes for the caller to read. */
export async function webFetch(url: string): Promise<WebPage | { url: string; contentType: "application/pdf"; bytes: Uint8Array }> {
  if (!isPublicHttpUrl(url)) throw new SourceError("SOURCE_REFUSED", "only public http(s) addresses are fetched");
  const r = await get(url, { timeoutMs: 45_000 });
  const contentType = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/pdf") return { url, contentType, bytes: new Uint8Array(await r.arrayBuffer()) };
  const body = await r.text();
  const title = htmlToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? "");
  const text = contentType.includes("html") || /<html/i.test(body.slice(0, 2000)) ? htmlToText(body) : body;
  return { url, contentType: contentType || "text/plain", title, text: text.slice(0, MAX_PAGE_CHARS), truncated: text.length > MAX_PAGE_CHARS };
}
