/**
 * V4-1: the one way the research sources reach the network. Plain library. Tests replace the
 * fetcher; the application uses the global fetch with a timeout and a plain user agent.
 */

export type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export const USER_AGENT = "Mozilla/5.0 (compatible; OpenAdvocate/1.0; legal research)";

let current: Fetcher = (url, init) => fetch(url, { ...init, headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) } });

/** Replace the fetcher (tests). Returns the previous one. */
export function setFetcher(f: Fetcher): Fetcher {
  const prev = current;
  current = f;
  return prev;
}

export class SourceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** GET with a timeout. A network failure or a status other than 2xx (or 206) is a SourceError. */
export async function get(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const r = await current(url, { headers: opts.headers, signal: ctl.signal });
    if (!r.ok) throw new SourceError("SOURCE_HTTP", `${r.status} from ${new URL(url).host}`);
    return r;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError("SOURCE_UNREACHABLE", `${new URL(url).host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export async function getText(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<string> {
  return (await get(url, opts)).text();
}

export async function getJson<T>(url: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  return (await get(url, { ...opts, headers: { accept: "application/json" } })).json() as Promise<T>;
}

export async function getBytes(url: string, opts: { timeoutMs?: number } = {}): Promise<Uint8Array> {
  return new Uint8Array(await (await get(url, opts)).arrayBuffer());
}

/** An async buffer over HTTP range requests, for hyparquet. */
export async function rangeBuffer(url: string): Promise<{ byteLength: number; slice(start: number, end?: number): Promise<ArrayBuffer> }> {
  const head = await get(url, { headers: { range: "bytes=0-0" } });
  const total = Number(/\/(\d+)$/.exec(head.headers.get("content-range") ?? "")?.[1] ?? head.headers.get("content-length") ?? 0);
  await head.arrayBuffer().catch(() => undefined);
  if (!total) throw new SourceError("SOURCE_HTTP", `no size for ${url}`);
  return {
    byteLength: total,
    async slice(start: number, end?: number) {
      const r = await get(url, { headers: { range: `bytes=${start}-${(end ?? total) - 1}` }, timeoutMs: 120_000 });
      return r.arrayBuffer();
    },
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Visible text of an HTML document or fragment: scripts, styles and tags removed, one line per block. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|hr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
