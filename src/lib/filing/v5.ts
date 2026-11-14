/**
 * V5-13 to V5-17: revision compare, citation hygiene, victim identity, limitation exclusions,
 * the AI-use disclosure, the paper book and the conversion check. Plain library: it computes;
 * the matter store writes. Spec: docs/specs/v5.md.
 */
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, rgb, type PDFRef } from "pdf-lib";

// ---- V5-13: compare two revisions, paragraph by paragraph ----

export type DiffOp = { op: "same" | "added" | "removed"; text: string } | { op: "changed"; before: string; after: string };

/** Longest common subsequence of paragraphs; a removal followed by an addition is a change. */
export function diffParagraphs(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const raw: Array<{ op: "same" | "added" | "removed"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ op: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) raw.push({ op: "removed", text: a[i++] });
    else raw.push({ op: "added", text: b[j++] });
  }
  while (i < n) raw.push({ op: "removed", text: a[i++] });
  while (j < m) raw.push({ op: "added", text: b[j++] });
  const out: DiffOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].op === "removed" && raw[k + 1]?.op === "added") {
      out.push({ op: "changed", before: raw[k].text, after: raw[k + 1].text });
      k++;
    } else out.push(raw[k]);
  }
  return out;
}

// ---- V5-14: citation hygiene ----

const REPORTER = [
  /\(\d{4}\)\s*\d{1,3}\s*SCC\s*\d{1,5}/gi,
  /\bAIR\s*\d{4}\s*SC\s*\d{1,5}\b/gi,
  /\[\d{4}\]\s*\d{1,3}\s*S\.?C\.?R\.?\s*\d{1,5}/gi,
  /\b\d{4}\s*SCC\s*OnLine\s*SC\s*\d{1,6}\b/gi,
  /\(\d{4}\)\s*\d{1,3}\s*Cri\.?\s*L\.?J\.?\s*\d{1,5}/gi,
];

/**
 * Citations in reporter form with no neutral citation in the same paragraph (K rules 1 and 7):
 * the validator cannot check them, so the advocate is asked for the neutral citation.
 */
export function reporterOnlyCitations(paragraph: string): string[] {
  if (/\b\d{4}\s*INSC\s*\d+/i.test(paragraph)) return [];
  const out: string[] = [];
  for (const re of REPORTER) {
    re.lastIndex = 0;
    for (const m of paragraph.matchAll(re)) out.push(m[0].replace(/\s+/g, " "));
  }
  return [...new Set(out)];
}

/** Names the matter protects that a paragraph contains, matched as whole words, ignoring case. */
export function protectedNamesIn(paragraph: string, names: string[]): string[] {
  return names.filter((n) => n.trim().length > 1 && new RegExp(`(^|[^\\p{L}])${n.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(paragraph));
}

// ---- V5-16: limitation with the certified-copy exclusion ----

export const COPY_EXCLUSION_SOURCE = "Limitation Act, 1963, section 12(2) (time taken to obtain a copy of the judgment), as recorded by the engineer; to be confirmed by the owner (questions.md Q-7)";

const DAY = 86_400_000;
const utc = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`LIMITATION_BAD_DATE: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const show = (d: string) => d.split("-").reverse().join(".");

/**
 * The days excluded for obtaining the certified copy: from the day the copy was applied for to
 * the day it was ready, both counted. Nothing is excluded when either date is missing, or when
 * the application was made after the judgment's limitation had already run.
 */
export function copyExclusion(judgment: string, applied: string | null, received: string | null, days: number): { days: number; working: string } {
  if (!applied || !received) return { days: 0, working: "Certified copy: the dates it was applied for and received are not recorded, so no time is excluded." };
  const a = utc(applied);
  const r = utc(received);
  const j = utc(judgment);
  if (a < j || r < a) return { days: 0, working: `Certified copy: the recorded dates (applied ${show(applied)}, received ${show(received)}) are not in order, so no time is excluded.` };
  if (a > j + days * DAY) return { days: 0, working: `Certified copy: applied for on ${show(applied)}, after the period had run, so no time is excluded.` };
  const n = Math.round((r - a) / DAY) + 1;
  return { days: n, working: `Certified copy applied for on ${show(applied)} and received on ${show(received)}: ${n} day(s) excluded. Source: ${COPY_EXCLUSION_SOURCE}.` };
}

export function extendDeadline(deadline: string, extra: number): string {
  return iso(utc(deadline) + extra * DAY);
}

// ---- V5-17: the AI-use disclosure ----

export interface DisclosureInput {
  matter: string;
  generatedAt: string;
  model: string | null;
  assistance: string[];
  citations: Array<{ citation: string; outcome: string; attested: boolean; reason: string | null }>;
  provisions: Array<{ act: string; section: string; repealed: boolean }>;
  attestations: Array<{ citation: string; reason: string; at: string }>;
}

/** The paragraphs of the disclosure (R-3; L rule 3). Attested citations are never shown as verified. */
export function disclosureBlocks(i: DisclosureInput): Array<{ text: string; style?: "heading" | "center" }> {
  const blocks: Array<{ text: string; style?: "heading" | "center" }> = [
    { text: "DISCLOSURE OF THE USE OF ARTIFICIAL INTELLIGENCE", style: "center" },
    { text: `Matter: ${i.matter}. Prepared on ${i.generatedAt.slice(0, 10)}.` },
    { text: "1. Assistance used", style: "heading" },
    ...i.assistance.map((a) => ({ text: a })),
    { text: `Language model used for drafting and research assistance: ${i.model ?? "none recorded"}.` },
    { text: "2. Citations and their verification", style: "heading" },
  ];
  const verified = i.citations.filter((c) => !c.attested);
  if (verified.length === 0) blocks.push({ text: "No citation was checked by the validator." });
  for (const c of verified) blocks.push({ text: `${c.citation}: ${c.outcome} by the independent validator${c.reason ? ` (${c.reason})` : ""}.` });
  blocks.push({ text: "3. Statutory references", style: "heading" });
  if (i.provisions.length === 0) blocks.push({ text: "No statutory provision was saved to the matter." });
  for (const p of i.provisions) blocks.push({ text: `${p.act}, section ${p.section}: text taken from India Code${p.repealed ? "; recorded there as repealed" : ""}. The version in force on the relevant date was confirmed by the advocate, not computed.` });
  blocks.push({ text: "4. Citations attested by the advocate (not verified)", style: "heading" });
  if (i.attestations.length === 0) blocks.push({ text: "None." });
  for (const a of i.attestations) blocks.push({ text: `${a.citation}: attested by the advocate on ${a.at.slice(0, 10)}. Reason: ${a.reason}. This citation is advocate-attested and is not verified.` });
  blocks.push({ text: "5. Responsibility", style: "heading" });
  blocks.push({ text: "Every fact, citation and legal submission in the filing was reviewed and approved by the Advocate-on-Record." });
  blocks.push({ text: "Advocate-on-Record: ______________________" });
  return blocks;
}

/** Blocked while any citation failed or is unresolved without an attestation (C rule 17). */
export function disclosureBlockers(citations: DisclosureInput["citations"]): string[] {
  return citations.filter((c) => (c.outcome === "failed" || c.outcome === "unresolved") && !c.attested).map((c) => `${c.citation}: ${c.outcome}, not attested`);
}

// ---- V5-17: the paper book ----

export interface PaperBookPart {
  title: string;
  bytes: Uint8Array;
}

/**
 * One PDF: an index page listing every part with its first page, every part in order, page
 * numbers stamped at the foot of every page, and a bookmark per part. Returns the bytes and the
 * index rows.
 */
export async function paperBook(title: string, parts: PaperBookPart[]): Promise<{ bytes: Uint8Array; index: Array<{ title: string; from: number; to: number }> }> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.TimesRoman);
  const bold = await out.embedFont(StandardFonts.TimesRomanBold);
  const indexPage = out.addPage([595, 842]);
  const index: Array<{ title: string; from: number; to: number }> = [];
  let pageNo = 2;
  const firstPages: PDFRef[] = [];
  for (const part of parts) {
    const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    const from = pageNo;
    copied.forEach((p, k) => {
      out.addPage(p);
      if (k === 0) firstPages.push(p.ref);
      pageNo++;
    });
    index.push({ title: part.title, from, to: pageNo - 1 });
  }
  // The index page.
  indexPage.drawText("INDEX", { x: 270, y: 790, size: 14, font: bold });
  indexPage.drawText(title.slice(0, 80), { x: 60, y: 765, size: 11, font });
  indexPage.drawText("Sl.", { x: 60, y: 735, size: 11, font: bold });
  indexPage.drawText("Particulars", { x: 95, y: 735, size: 11, font: bold });
  indexPage.drawText("Pages", { x: 480, y: 735, size: 11, font: bold });
  index.forEach((r, k) => {
    const y = 712 - k * 20;
    indexPage.drawText(String(k + 1), { x: 60, y, size: 11, font });
    indexPage.drawText(r.title.slice(0, 70), { x: 95, y, size: 11, font });
    indexPage.drawText(r.from === r.to ? String(r.from) : `${r.from}-${r.to}`, { x: 480, y, size: 11, font });
  });
  // Page numbers at the foot of every page.
  out.getPages().forEach((p, k) => {
    const { width } = p.getSize();
    p.drawText(String(k + 1), { x: width / 2 - 6, y: 18, size: 10, font, color: rgb(0, 0, 0) });
  });
  // Bookmarks: one outline item per part.
  if (firstPages.length) {
    const outlineRef = out.context.nextRef();
    const itemRefs = firstPages.map(() => out.context.nextRef());
    itemRefs.forEach((ref, k) => {
      const item = out.context.obj({
        Title: PDFString.of(index[k].title),
        Parent: outlineRef,
        Dest: out.context.obj([firstPages[k], PDFName.of("Fit")]),
        ...(k > 0 ? { Prev: itemRefs[k - 1] } : {}),
        ...(k < itemRefs.length - 1 ? { Next: itemRefs[k + 1] } : {}),
      });
      out.context.assign(ref, item);
    });
    out.context.assign(outlineRef, out.context.obj({ Type: "Outlines", First: itemRefs[0], Last: itemRefs[itemRefs.length - 1], Count: PDFNumber.of(itemRefs.length) }));
    out.catalog.set(PDFName.of("Outlines"), outlineRef);
  }
  return { bytes: await out.save(), index };
}

// ---- V5-17: the conversion check ----

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Every paragraph of the approved DOCX must appear, in order, in the PDF's text (K rule 18).
 * Compared after removing punctuation and spacing, so line breaks in the PDF do not matter.
 */
export function conversionCheck(paragraphs: string[], pdfText: string): { ok: boolean; missing: string[] } {
  const hay = words(pdfText).replace(/\s+/g, "");
  let from = 0;
  const missing: string[] = [];
  for (const p of paragraphs) {
    const needle = words(p).replace(/\s+/g, "");
    if (!needle) continue;
    const at = hay.indexOf(needle, from);
    if (at < 0) missing.push(p.slice(0, 120));
    else from = at + needle.length;
  }
  return { ok: missing.length === 0, missing };
}
