/**
 * Phase 2: the court adapter framework (docs/specs/court-adapters.md). An adapter is data: this
 * library checks it, finds an item's quote in a document's text (allowing OCR errors), reads the
 * numbered rules of a part of a document, finds a document's link on a court's page, runs the
 * format checks on a PDF's facts, and says which lists a profile needs. It fetches nothing and
 * runs no adapter code. Plain library (decision 6).
 */
import { FORMAT_CHECKS, LIST_KINDS, type AdapterDefinition, type AdapterFormatCheck, type AdapterList, type FormatCheckResult } from "../../shared/intel.ts";

export const MAX_DOC_BYTES = 60 * 1024 * 1024;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** Check one adapter.json. Returns the adapter, or null and the errors. */
export function checkAdapter(raw: unknown): { adapter: AdapterDefinition | null; errors: string[] } {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  const version = str(o.version);
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) errors.push("id must be lower case letters, digits and hyphens");
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push("version must be n.n.n");
  const hosts = strs(o.hosts).map((h) => h.toLowerCase());
  if (hosts.length === 0) errors.push("hosts must name at least one host the adapter may fetch from");
  const courts = strs(o.courts);
  if (courts.length === 0) errors.push("courts must name at least one court of the directory");
  const sources = (Array.isArray(o.sources) ? o.sources : []) as Array<Record<string, unknown>>;
  const sourceKeys = new Set<string>();
  const httpsOn = (url: string, what: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") errors.push(`${what}: only https addresses`);
      else if (!hosts.includes(u.hostname.toLowerCase())) errors.push(`${what}: the host ${u.hostname} is not in hosts`);
    } catch {
      errors.push(`${what}: not an address: ${url}`);
    }
  };
  for (const s of sources) {
    const key = str(s.key);
    if (!key) errors.push("a source has no key");
    if (sourceKeys.has(key)) errors.push(`source ${key} is listed twice`);
    sourceKeys.add(key);
    const locate = s.locate as { index?: unknown; linkText?: unknown } | undefined;
    if (!str(s.url) && !(locate && str(locate.index) && str(locate.linkText))) errors.push(`source ${key}: give url, or locate.index with locate.linkText`);
    if (str(s.url)) httpsOn(str(s.url), `source ${key} url`);
    if (locate && str(locate.index)) httpsOn(str(locate.index), `source ${key} locate.index`);
    if (!Number.isInteger(s.checkDays) || (s.checkDays as number) < 1) errors.push(`source ${key}: checkDays must be a whole number of days`);
  }
  const lists = (Array.isArray(o.lists) ? o.lists : []) as Array<Record<string, unknown>>;
  const listKeys = new Set<string>();
  for (const l of lists) {
    const key = str(l.key);
    if (!key) errors.push("a list has no key");
    if (listKeys.has(key)) errors.push(`list ${key} is listed twice`);
    listKeys.add(key);
    if (!(LIST_KINDS as readonly string[]).includes(str(l.kind))) errors.push(`list ${key}: kind must be one of ${LIST_KINDS.join(", ")}`);
    if (!sourceKeys.has(str(l.source))) errors.push(`list ${key}: source ${str(l.source)} is not in sources`);
    const items = Array.isArray(l.items) ? (l.items as Array<Record<string, unknown>>) : null;
    const extract = l.extract as { start?: unknown } | undefined;
    if (!items && !(extract && str(extract.start))) errors.push(`list ${key}: give items, or extract.start`);
    for (const it of items ?? []) if (!str(it.text)) errors.push(`list ${key}: an item has no text`);
  }
  for (const f of (Array.isArray(o.formatChecks) ? o.formatChecks : []) as Array<Record<string, unknown>>) {
    if (!(FORMAT_CHECKS as readonly string[]).includes(str(f.check))) errors.push(`format check ${str(f.key)}: check must be one of ${FORMAT_CHECKS.join(", ")}`);
    if (!sourceKeys.has(str(f.source))) errors.push(`format check ${str(f.key)}: source ${str(f.source)} is not in sources`);
  }
  for (const p of (Array.isArray(o.proceedings) ? o.proceedings : []) as Array<Record<string, unknown>>) {
    for (const ref of [str(p.checklist), str(p.workflow)].filter(Boolean)) if (!listKeys.has(ref)) errors.push(`proceeding ${str(p.key)}: list ${ref} is not in lists`);
    if (!courts.includes(str(p.court))) errors.push(`proceeding ${str(p.key)}: court ${str(p.court)} is not in courts`);
  }
  for (const [k, v] of Object.entries((o.general ?? {}) as Record<string, unknown>)) if (str(v)) httpsOn(str(v), `general ${k}`);
  if (errors.length) return { adapter: null, errors };
  return {
    errors,
    adapter: {
      id,
      version,
      title: str(o.title) || id,
      courts,
      author: str(o.author) || "unknown",
      review: str(o.review) || "not reviewed",
      hosts,
      general: Object.fromEntries(Object.entries((o.general ?? {}) as Record<string, unknown>).map(([k, v]) => [k, str(v)]).filter(([, v]) => v)),
      sources: sources as never,
      lists: lists as never,
      formatChecks: (o.formatChecks ?? []) as never,
      defects: (o.defects ?? []) as never,
      proceedings: (o.proceedings ?? []) as never,
    },
  };
}

/** May the framework fetch this address for this adapter? */
export function allowedUrl(adapter: Pick<AdapterDefinition, "hosts">, url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && adapter.hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ---- The quote match ----

export interface DocLine {
  page: number;
  line: number;
  text: string;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 0);
}

/** At most one letter changed, added or removed. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function sameWord(q: string, d: string): boolean {
  return q.length >= 4 ? near(q, d) : q === d;
}

export interface QuoteMatch {
  page: number;
  line: number;
  score: number;
  found: string;
}

/**
 * Find a quote in a document's lines. Case and punctuation are ignored; a word of four letters
 * or more may have one wrong letter (OCR); at least 85 % of the quote's words must match in order
 * inside a window a little longer than the quote. Two words read as one ("ofthe"), one word read as
 * two, and one lost word are allowed.
 */
export function findQuote(lines: readonly DocLine[], quote: string, threshold = 0.85): QuoteMatch | null {
  const q = words(quote);
  if (q.length === 0) return null;
  const doc: Array<{ w: string; at: number }> = [];
  lines.forEach((l, at) => {
    for (const w of words(l.text)) doc.push({ w, at });
  });
  const span = Math.ceil(q.length * 1.4) + 2;
  let best: { start: number; end: number; score: number } | null = null;
  for (let s = 0; s < doc.length; s++) {
    // A match starts where the first two words match (or the first was lost, or both were read as one).
    const firstTwo =
      sameWord(q[0], doc[s].w) &&
      (q.length === 1 || (s + 1 < doc.length && (sameWord(q[1], doc[s + 1].w) || (s + 2 < doc.length && q.length > 2 && sameWord(q[2], doc[s + 2].w)))));
    if (!firstTwo && !(q.length > 1 && (sameWord(q[1], doc[s].w) || near(q[0] + q[1], doc[s].w)))) continue;
    let qi = 0;
    let matched = 0;
    let last = s;
    for (let d = s; d < Math.min(doc.length, s + span) && qi < q.length; d++) {
      if (sameWord(q[qi], doc[d].w)) {
        matched++;
        qi++;
        last = d;
      } else if (qi + 1 < q.length && near(q[qi] + q[qi + 1], doc[d].w)) {
        // Two words read as one ("ofthe").
        matched += 2;
        qi += 2;
        last = d;
      } else if (d + 1 < doc.length && q[qi].length >= 5 && near(doc[d].w + doc[d + 1].w, q[qi])) {
        // One word read as two.
        matched++;
        qi++;
        last = ++d;
      } else if (qi + 1 < q.length && sameWord(q[qi + 1], doc[d].w)) {
        // A quote word lost in OCR: skip it.
        qi += 2;
        matched++;
        last = d;
      }
    }
    const score = matched / q.length;
    if (score >= threshold && (!best || score > best.score)) {
      best = { start: s, end: last, score };
      if (score === 1) break;
    }
  }
  if (!best) return null;
  const first = lines[doc[best.start].at];
  const lastLine = doc[best.end].at;
  const found = lines.slice(doc[best.start].at, lastLine + 1).map((l) => l.text).join(" ");
  return { page: first.page, line: first.line, score: Math.round(best.score * 100) / 100, found: found.slice(0, 600) };
}

/** The lines between two headings (the scope of a list), or all lines when the start is not found. */
export function scopeLines(lines: readonly DocLine[], scope?: { start: string; end?: string }): { lines: readonly DocLine[]; found: boolean } {
  if (!scope) return { lines, found: true };
  const s = findQuote(lines, scope.start, 0.9);
  if (!s) return { lines, found: false };
  const from = lines.findIndex((l) => l.page === s.page && l.line === s.line);
  let to = lines.length;
  if (scope.end) {
    const rest = lines.slice(from + 1);
    const e = findQuote(rest, scope.end, 0.9);
    if (e) to = from + 1 + rest.findIndex((l) => l.page === e.page && l.line === e.line);
  }
  return { lines: lines.slice(from, to), found: true };
}

// ---- Section extraction ----

/**
 * The numbered rules between a heading and the next: each line that starts with "1.", "2." …
 * opens an item, and the following lines join it. Returns the items with their anchors.
 */
export function extractSection(lines: readonly DocLine[], start: string, end?: string): Array<{ n: string; text: string; page: number; line: number }> {
  const s = findQuote(lines, start, 0.9);
  if (!s) return [];
  const from = lines.findIndex((l) => l.page === s.page && l.line === s.line);
  let to = lines.length;
  if (end) {
    const rest = lines.slice(from + 1);
    const e = findQuote(rest, end, 0.9);
    if (e) to = from + 1 + rest.findIndex((l) => l.page === e.page && l.line === e.line);
  }
  const out: Array<{ n: string; text: string; page: number; line: number }> = [];
  for (const l of lines.slice(from, to)) {
    const m = /^\s*\[?([0-9IlS]{1,3})\s*\.\s+(.*)$/.exec(l.text);
    // OCR reads "1." as "I." or "l."; "IS." as "15.".
    if (m && !/^(THE GAZETTE|\d+ THE GAZETTE)/i.test(l.text)) {
      const n = m[1].replace(/[Il]/g, "1").replace(/S/g, "5");
      out.push({ n, text: m[2].trim(), page: l.page, line: l.line });
    } else if (out.length && !/^===|GAZETTE OF INDIA/i.test(l.text) && l.text.trim()) {
      out[out.length - 1].text = `${out[out.length - 1].text} ${l.text.trim()}`.slice(0, 1500);
    }
  }
  return out;
}

// ---- Finding a document's link on a court's page ----

/** The address of the link whose words contain `linkText` (case and spaces ignored), resolved against the page. */
export function findLink(html: string, linkText: string, pageUrl: string): string | null {
  const want = linkText.toLowerCase().replace(/\s+/g, " ").trim();
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const [, href, inner] of links) {
    const text = decode(inner.replace(/<[^>]+>/g, " ")).toLowerCase().replace(/\s+/g, " ").trim();
    if (text.includes(want)) {
      try {
        return new URL(decode(href), pageUrl).toString();
      } catch {
        continue;
      }
    }
  }
  // Pages that put the title in a table cell and the link in the next ("View", "Download").
  const flat = html.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(want);
  if (at >= 0) {
    const after = /href\s*=\s*"([^"]+\.pdf)"/i.exec(flat.slice(at, at + 3000));
    if (after) {
      try {
        return new URL(decode(after[1]), pageUrl).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---- Format checks (B13) ----

export interface PdfFacts {
  name: string;
  bytes: number;
  pages: number;
  pagesWithText: number;
  pdfA: boolean;
  bookmarks: boolean;
  /** Page sizes in points. */
  pageSizes: Array<{ w: number; h: number }>;
}

const A4 = { w: 595.28, h: 841.89 };

export function runFormatCheck(check: AdapterFormatCheck, pdf: PdfFacts): FormatCheckResult {
  const base = { key: check.key, title: check.title, file: pdf.name, ref: check.ref ?? null };
  switch (check.check) {
    case "pdf_max_mb": {
      const max = Number(check.value);
      if (!Number.isFinite(max) || max <= 0) return { ...base, result: "not_checked", detail: "The adapter gives no size limit." };
      const mb = pdf.bytes / (1024 * 1024);
      return { ...base, result: mb <= max ? "pass" : "fail", detail: `${mb.toFixed(1)} MB; the limit is ${max} MB.` };
    }
    case "pdf_searchable":
      return { ...base, result: pdf.pagesWithText === pdf.pages ? "pass" : "fail", detail: `${pdf.pagesWithText} of ${pdf.pages} pages have searchable text.` };
    case "pdf_a":
      return { ...base, result: pdf.pdfA ? "pass" : "fail", detail: pdf.pdfA ? "The file declares PDF/A." : "The file does not declare PDF/A." };
    case "pdf_bookmarks":
      return { ...base, result: pdf.bookmarks ? "pass" : "fail", detail: pdf.bookmarks ? "The file has bookmarks." : "The file has no bookmarks." };
    case "pdf_page_size": {
      const off = pdf.pageSizes.filter((p) => !((Math.abs(p.w - A4.w) < 6 && Math.abs(p.h - A4.h) < 6) || (Math.abs(p.h - A4.w) < 6 && Math.abs(p.w - A4.h) < 6)));
      return { ...base, result: off.length === 0 ? "pass" : "fail", detail: off.length === 0 ? `All ${pdf.pageSizes.length} pages are A4.` : `${off.length} of ${pdf.pageSizes.length} pages are not A4.` };
    }
  }
  return { ...base, result: "not_checked", detail: "This check is not built." };
}

// ---- What a profile needs ----

/** The lists recommended for the advocate's practice areas: no download; the advocate builds one when needed. */
export function recommended(adapter: AdapterDefinition, practice: readonly string[]): string[] {
  const p = practice.map((x) => x.toLowerCase());
  return adapter.lists.filter((l) => !l.needs?.practice?.length || l.needs.practice.some((x) => p.includes(x.toLowerCase()))).map((l) => l.key);
}

/** The lists a matter's filing needs: those for its case type, and the format lists of the court. */
export function listsForCaseType(adapter: AdapterDefinition, caseType: string): AdapterList[] {
  const ct = caseType.toLowerCase().replace(/\s+/g, "");
  return adapter.lists.filter((l) => (l.needs?.caseTypes ?? []).some((c) => c.toLowerCase().replace(/\s+/g, "") === ct || c === "*"));
}

export function caseTypes(adapter: AdapterDefinition): string[] {
  return [...new Set(adapter.lists.flatMap((l) => l.needs?.caseTypes ?? []).filter((c) => c !== "*"))];
}

/** Match a registry's defect list to the court's defect classes (B14): one row per non-empty line. */
export function matchDefects(adapter: AdapterDefinition | null, text: string): Array<{ text: string; classKey: string | null; classTitle: string | null; step: string | null }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter((l) => l.length > 2)
    .map((line) => {
      const low = line.toLowerCase();
      const hit = adapter?.defects.find((d) => d.match.some((m) => low.includes(m.toLowerCase())));
      return { text: line, classKey: hit?.key ?? null, classTitle: hit?.title ?? null, step: hit?.step ?? null };
    });
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
