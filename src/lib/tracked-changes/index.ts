/**
 * Tracked changes in a DOCX: the agent's corrections, and the advocate's keep or undo.
 * Plain library: no Electron import, no Pi import (decision 6).
 *
 * Editor-design item a: agent edits are tracked changes in the DOCX itself, authored
 * "Open Advocate agent". There is no second proposal store. What is still to decide is read
 * from the document's own w:ins and w:del marks.
 *
 * Rules carried over (editor-design section 2):
 * - WD-129: a correction carries the expected live text. When the live text differs, the
 *   correction fails with DOC_STALE_TARGET and changes nothing.
 * - OD-13, WD-015, WD-017: a paragraph replace makes word-level tracked changes. After the
 *   change is kept, the live text is exactly the new text.
 * v0 limit: the corrected paragraph keeps the paragraph properties and the run properties of
 * its first run. Mixed formatting inside one paragraph is not kept. Generated drafts have one
 * run style per paragraph.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const AGENT_AUTHOR = "Open Advocate agent";
const DOCUMENT_PART = "word/document.xml";

export class TrackedChangeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** One paragraph that holds agent marks the advocate has not decided. */
export interface PendingChange {
  anchor: string;
  /** The paragraph text with the agent's marks undone. */
  before: string;
  /** The paragraph text with the agent's marks kept. */
  after: string;
  /** Item g: the change touches a date, a number or an amount. Never part of Keep all. */
  substantive: boolean;
}

export type ChangeDecision = "keep" | "undo";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readDocument(docx: Uint8Array): { parts: Record<string, Uint8Array>; xml: string } {
  const parts = unzipSync(docx);
  const part = parts[DOCUMENT_PART];
  if (!part) throw new TrackedChangeError("DOC_INVALID", `the DOCX has no ${DOCUMENT_PART}`);
  return { parts, xml: strFromU8(part) };
}

function writeDocument(parts: Record<string, Uint8Array>, xml: string): Buffer {
  return Buffer.from(zipSync({ ...parts, [DOCUMENT_PART]: strToU8(xml) }));
}

/** The span of the one paragraph inside the content control tagged `anchor`. */
function paragraphSpan(xml: string, anchor: string): { start: number; end: number } {
  const tag = new RegExp(`<w:tag\\s+w:val="${escapeForRegExp(anchor)}"\\s*/>`, "g");
  const hits = [...xml.matchAll(tag)];
  if (hits.length === 0) throw new TrackedChangeError("DOC_TARGET_NOT_FOUND", `no paragraph carries the anchor ${anchor}`);
  if (hits.length > 1) throw new TrackedChangeError("DOC_AMBIGUOUS_TARGET", `${hits.length} paragraphs carry the anchor ${anchor}`);
  const from = hits[0].index ?? 0;
  const contentAt = xml.indexOf("<w:sdtContent", from);
  const sdtEnd = xml.indexOf("</w:sdt>", from);
  if (contentAt < 0 || (sdtEnd >= 0 && contentAt > sdtEnd)) throw new TrackedChangeError("DOC_TARGET_NOT_FOUND", `the anchor ${anchor} holds no content`);
  const open = /<w:p(?=[\s>/])/g;
  open.lastIndex = contentAt;
  const p = open.exec(xml);
  if (!p || (sdtEnd >= 0 && p.index > sdtEnd)) throw new TrackedChangeError("DOC_TARGET_NOT_FOUND", `the anchor ${anchor} holds no paragraph`);
  const close = xml.indexOf("</w:p>", p.index);
  const nested = open.exec(xml);
  if (close < 0) throw new TrackedChangeError("DOC_INVALID", "an unclosed paragraph");
  if (nested && nested.index < close) throw new TrackedChangeError("DOC_UNSUPPORTED", `the paragraph of ${anchor} holds another paragraph`);
  return { start: p.index, end: close + "</w:p>".length };
}

/** The live text: w:t only, no deleted text (WD-013). */
function liveText(p: string): string {
  const live = p.replace(/<w:del(?:\s[^>]*)?>[\s\S]*?<\/w:del>/g, "");
  let text = "";
  for (const m of live.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) text += decodeXml(m[1]);
  return text;
}

/** The text with every tracked mark undone: inserted text removed, deleted text back. */
function originalText(p: string): string {
  const without = p.replace(/<w:ins(?:\s[^>]*)?>[\s\S]*?<\/w:ins>/g, "");
  let text = "";
  for (const m of without.matchAll(/<w:(?:t|delText)(?:\s[^>]*)?>([\s\S]*?)<\/w:(?:t|delText)>/g)) text += decodeXml(m[1]);
  return text;
}

function hasMarks(p: string): boolean {
  return /<w:(?:ins|del)[\s>]/.test(p);
}

function authorOf(attrs: string): string | null {
  const m = /w:author="([^"]*)"/.exec(attrs);
  return m ? decodeXml(m[1]) : null;
}

/** Split into words and the spaces between them, so a diff works word by word. */
function tokens(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

type Segment = { op: "same" | "del" | "ins"; text: string };

/** A word-level diff by longest common subsequence. Deterministic. */
export function wordDiff(before: string, after: string): Segment[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: Segment[] = [];
  const push = (op: Segment["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return out;
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/**
 * Item g: a change is substantive when the changed words hold a digit (a date, an amount, a
 * case number, a citation) or a month name. v0 limit: party names and prayers are not
 * recognised, because the matter records no parties yet.
 */
export function isSubstantive(before: string, after: string): boolean {
  const changed = wordDiff(before, after)
    .filter((s) => s.op !== "same")
    .map((s) => s.text)
    .join(" ");
  return /\d/.test(changed) || MONTH.test(changed);
}

function maxMarkId(xml: string): number {
  let max = 0;
  for (const m of xml.matchAll(/<w:(?:ins|del)\s[^>]*w:id="(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/**
 * Write the agent's correction of one paragraph as word-level tracked changes.
 * The paragraph must hold `expected` as its live text and no undecided marks.
 */
export function proposeReplacement(
  docx: Uint8Array,
  input: { anchor: string; expected: string; replacement: string; date: string; author?: string },
): { docx: Buffer; change: PendingChange } {
  const author = input.author ?? AGENT_AUTHOR;
  const replacement = input.replacement.replace(/\s+/g, " ").trim();
  if (!replacement) throw new TrackedChangeError("DOC_EMPTY_REPLACEMENT", "a correction cannot empty the paragraph");
  const { parts, xml } = readDocument(docx);
  const span = paragraphSpan(xml, input.anchor);
  const p = xml.slice(span.start, span.end);
  if (hasMarks(p)) throw new TrackedChangeError("DOC_UNDECIDED_CHANGE", "the paragraph already holds a change the advocate has not decided");
  const live = liveText(p);
  if (live !== input.expected) {
    throw new TrackedChangeError("DOC_STALE_TARGET", `the paragraph text is not the expected text. It now reads: ${live}`);
  }
  if (live === replacement) throw new TrackedChangeError("DOC_NO_CHANGE", "the new text is the same as the paragraph text");
  const openTag = /^<w:p(?:\s[^>]*)?>/.exec(p)?.[0] ?? "<w:p>";
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>|<w:pPr\/>/.exec(p)?.[0] ?? "";
  const rPr = /<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(p)?.[1] ?? "";
  let id = maxMarkId(xml);
  const attrs = () => `w:id="${++id}" w:author="${escapeXml(author)}" w:date="${escapeXml(input.date)}"`;
  const body = wordDiff(live, replacement)
    .map((s) => {
      const t = escapeXml(s.text);
      if (s.op === "same") return `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
      if (s.op === "del") return `<w:del ${attrs()}><w:r>${rPr}<w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;
      return `<w:ins ${attrs()}><w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r></w:ins>`;
    })
    .join("");
  const next = `${openTag}${pPr}${body}</w:p>`;
  return {
    docx: writeDocument(parts, xml.slice(0, span.start) + next + xml.slice(span.end)),
    change: { anchor: input.anchor, before: live, after: replacement, substantive: isSubstantive(live, replacement) },
  };
}

/** Every anchored paragraph that holds undecided marks by `author`, in document order. */
export function pendingChanges(docx: Uint8Array, author: string = AGENT_AUTHOR): PendingChange[] {
  const { xml } = readDocument(docx);
  const out: PendingChange[] = [];
  for (const m of xml.matchAll(/<w:tag\s+w:val="(oa-[0-9a-f]{32})"\s*\/>/g)) {
    let span;
    try {
      span = paragraphSpan(xml, m[1]);
    } catch {
      continue;
    }
    const p = xml.slice(span.start, span.end);
    const marks = [...p.matchAll(/<w:(?:ins|del)(\s[^>]*)>/g)];
    if (!marks.some((x) => authorOf(x[1]) === author)) continue;
    const before = originalText(p);
    const after = liveText(p);
    out.push({ anchor: m[1], before, after, substantive: isSubstantive(before, after) });
  }
  return out;
}

/** Keep or undo the marks of `author` in one anchored paragraph. Marks of others are left as they are. */
function decideParagraph(p: string, decision: ChangeDecision, author: string): string {
  // The inserted paragraph mark (a self-closing w:ins in the paragraph's run properties).
  p = p.replace(/<w:ins(\s[^>]*?)\/>/g, (whole, attrs: string) => (authorOf(attrs) === author ? "" : whole));
  const mark = /<w:(ins|del)(\s[^>]*[^/])>([\s\S]*?)<\/w:\1>/g;
  return p.replace(mark, (whole, kind: string, attrs: string, inner: string) => {
    if (authorOf(attrs) !== author) return whole;
    const keepInner = (kind === "ins") === (decision === "keep");
    if (!keepInner) return "";
    return kind === "del"
      ? inner.replace(/<w:delText(\s[^>]*)?>/g, "<w:t$1>").replace(/<\/w:delText>/g, "</w:t>")
      : inner;
  });
}

/**
 * Apply the advocate's decisions (decision 5: only a bridge function calls this).
 * Each decision names one paragraph by its anchor. A paragraph with no agent marks fails.
 */
export function decideChanges(
  docx: Uint8Array,
  decisions: Array<{ anchor: string; decision: ChangeDecision }>,
  author: string = AGENT_AUTHOR,
): Buffer {
  if (decisions.length === 0) throw new TrackedChangeError("NO_DECISION", "no change was named");
  const { parts } = readDocument(docx);
  let { xml } = readDocument(docx);
  for (const d of decisions) {
    if (d.decision !== "keep" && d.decision !== "undo") throw new TrackedChangeError("BAD_DECISION", String(d.decision));
    const span = paragraphSpan(xml, d.anchor);
    const p = xml.slice(span.start, span.end);
    if (d.decision === "undo" && insertedParagraph(p, author)) {
      // Undo of an inserted paragraph removes the whole anchored block.
      const block = sdtSpan(xml, d.anchor);
      xml = xml.slice(0, block.start) + xml.slice(block.end);
      continue;
    }
    const next = decideParagraph(p, d.decision, author);
    if (next === p) throw new TrackedChangeError("NO_PENDING_CHANGE", `the paragraph ${d.anchor} holds no undecided agent change`);
    xml = xml.slice(0, span.start) + next + xml.slice(span.end);
  }
  return writeDocument(parts, xml);
}

function insertedParagraph(p: string, author: string): boolean {
  for (const m of p.matchAll(/<w:ins(\s[^>]*?)\/>/g)) if (authorOf(m[1]) === author) return true;
  return false;
}

/** The whole <w:sdt> block that carries `anchor`. */
function sdtSpan(xml: string, anchor: string): { start: number; end: number } {
  const at = xml.indexOf(`<w:tag w:val="${anchor}"`);
  if (at < 0) throw new TrackedChangeError("DOC_TARGET_NOT_FOUND", anchor);
  const start = Math.max(xml.lastIndexOf("<w:sdt>", at), xml.lastIndexOf("<w:sdt ", at));
  const end = xml.indexOf("</w:sdt>", at);
  if (start < 0 || end < 0) throw new TrackedChangeError("DOC_INVALID", `no content control around ${anchor}`);
  return { start, end: end + "</w:sdt>".length };
}

/**
 * Step 6: the agent proposes a new paragraph (a Question of Law, a Ground) as a tracked
 * insertion, in its own anchored content control. It goes after the paragraph `after`, or at
 * the end of the body. Keep makes it ordinary text; Undo removes it.
 */
export function proposeInsertion(
  docx: Uint8Array,
  input: { anchor: string; after: string | null; text: string; date: string; author?: string },
): { docx: Buffer; change: PendingChange } {
  const author = input.author ?? AGENT_AUTHOR;
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) throw new TrackedChangeError("DOC_EMPTY_REPLACEMENT", "a new paragraph needs text");
  if (!/^oa-[0-9a-f]{32}$/.test(input.anchor)) throw new TrackedChangeError("DOC_BAD_ANCHOR", input.anchor);
  const { parts, xml } = readDocument(docx);
  if (xml.includes(`w:val="${input.anchor}"`)) throw new TrackedChangeError("DOC_AMBIGUOUS_TARGET", input.anchor);
  let at: number;
  if (input.after) {
    at = sdtSpan(xml, input.after).end;
  } else {
    at = xml.lastIndexOf("<w:sectPr");
    if (at < 0) at = xml.lastIndexOf("</w:body>");
    if (at < 0) throw new TrackedChangeError("DOC_INVALID", "the document has no body end");
  }
  let id = maxMarkId(xml);
  let sdtId = 0;
  for (const m of xml.matchAll(/<w:id w:val="(\d+)"\/>/g)) sdtId = Math.max(sdtId, Number(m[1]));
  const attrs = () => `w:id="${++id}" w:author="${escapeXml(author)}" w:date="${escapeXml(input.date)}"`;
  const block =
    `<w:sdt><w:sdtPr><w:alias w:val="Open Advocate paragraph"/><w:tag w:val="${input.anchor}"/><w:id w:val="${sdtId + 1}"/></w:sdtPr>` +
    `<w:sdtContent><w:p><w:pPr><w:rPr><w:ins ${attrs()}/></w:rPr></w:pPr>` +
    `<w:ins ${attrs()}><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:ins></w:p></w:sdtContent></w:sdt>`;
  return {
    docx: writeDocument(parts, xml.slice(0, at) + block + xml.slice(at)),
    change: { anchor: input.anchor, before: "", after: text, substantive: isSubstantive("", text) },
  };
}
