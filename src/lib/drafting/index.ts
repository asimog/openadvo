/**
 * Drafting: the List of Dates and the Synopsis as DOCX, with one paragraph anchor per paragraph.
 * Plain library: no Electron import, no Pi import (decision 6).
 * Deterministic: no model writes text. Only the anchors are random.
 * Spec: docs/build-plan.md step 4. Anchor scheme: docs/editor-design.md section 1.1.
 */
import { randomUUID } from "node:crypto";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** One confirmed Notebook event, as the generator needs it. */
export interface DraftEvent {
  id: string;
  /** ISO date. For a single date, start equals end. */
  dateStart: string;
  dateEnd: string;
  /** The date as written in the source. */
  dateText: string;
  description: string;
  kind: "procedural" | "factual";
  reading: "text_layer" | "ocr";
  sourceName: string;
  page: number;
  line: number;
}

/** One generated paragraph: its anchor in the DOCX and the events that it links to. */
export interface GeneratedParagraph {
  anchor: string;
  text: string;
  eventIds: string[];
  /** V1: how the paragraph is set. Plain when absent. */
  style?: "heading" | "center" | "plain";
}

/** The DOCX bytes and the paragraphs that they carry. */
export interface GeneratedDocument {
  docx: Buffer;
  paragraphs: GeneratedParagraph[];
}

const DOCUMENT_PART = "word/document.xml";
const CORE_PART = "docProps/core.xml";
const ANCHOR_ALIAS = "Open Advocate paragraph";
const DRAFT_NOTE = "DRAFT: generated from confirmed Notebook events only. Not verified.";
const SENTINEL = /\{\{(oa-[0-9a-f]{32})\}\}/g;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** A new paragraph anchor: "oa-" and 32 lowercase hex characters. */
export function newAnchor(): string {
  return `oa-${randomUUID().replace(/-/g, "").toLowerCase()}`;
}

/** DD.MM.YYYY from an ISO date. Other input is returned unchanged. */
function dayMonthYear(iso: string): string {
  const m = ISO_DATE.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** One date, or the start and end of a range. A single date shows once. */
function rangeText(start: string, end: string): string {
  return start === end ? dayMonthYear(start) : `${dayMonthYear(start)} – ${dayMonthYear(end)}`;
}

/** One deterministic sentence for one event. The description is kept as it is. */
export function eventSentence(e: DraftEvent): string {
  const description = e.description.trim();
  const fullStop = /[.!?]$/.test(description) ? "" : ".";
  if (e.dateStart === e.dateEnd) return `On ${dayMonthYear(e.dateStart)}, ${description}${fullStop}`;
  return `Between ${dayMonthYear(e.dateStart)} and ${dayMonthYear(e.dateEnd)}, ${description}${fullStop}`;
}

/** Date order, then source name, then page, then line. */
function byEventOrder(a: DraftEvent, b: DraftEvent): number {
  if (a.dateStart !== b.dateStart) return a.dateStart < b.dateStart ? -1 : 1;
  if (a.sourceName !== b.sourceName) return a.sourceName < b.sourceName ? -1 : 1;
  if (a.page !== b.page) return a.page - b.page;
  return a.line - b.line;
}

function inDateOrder(events: DraftEvent[]): DraftEvent[] {
  return [...events].sort(byEventOrder);
}

function generatedDate(generatedAt: string): Date {
  const when = new Date(generatedAt);
  if (Number.isNaN(when.getTime())) throw new Error(`generatedAt is not a valid date: ${generatedAt}`);
  return when;
}

// ---- The anchor injection. Change the anchor scheme here and in readParagraphs only. ----

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove the sentinel run that holds the anchor. The run is the only one that matches. */
function removeSentinelRun(paragraph: string, sentinel: string): string {
  const run = new RegExp(
    `<w:r(?:\\s[^>]*)?>(?:(?!<\\/w:r>)[\\s\\S])*?${escapeForRegExp(sentinel)}(?:(?!<\\/w:r>)[\\s\\S])*?<\\/w:r>`,
  );
  return paragraph.replace(run, "");
}

/**
 * Put every anchor in the DOCX as the tag of a block-level content control.
 * Each anchored paragraph starts with a sentinel run. This function removes the
 * sentinel run and wraps the whole paragraph in <w:sdt>. The id matches the shape
 * that the x2t spike shows to survive an editor save (scratchpad/step4).
 */
function injectAnchors(xml: string): string {
  let id = 0;
  const wrapped = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    SENTINEL.lastIndex = 0;
    const found = SENTINEL.exec(paragraph);
    if (!found) return paragraph;
    const anchor = found[1];
    id += 1;
    const content = removeSentinelRun(paragraph, `{{${anchor}}}`);
    return (
      "<w:sdt><w:sdtPr>" +
      `<w:alias w:val="${ANCHOR_ALIAS}"/>` +
      `<w:tag w:val="${anchor}"/>` +
      `<w:id w:val="${id}"/>` +
      `</w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`
    );
  });
  if (wrapped.includes("{{oa-")) throw new Error("anchor injection failed: a sentinel run remains");
  return wrapped;
}

/** Put the generated date into the core properties, so two runs give the same bytes. */
function dateStamp(coreXml: string, when: Date): string {
  const stamp = when.toISOString();
  return coreXml.replace(
    /<dcterms:(created|modified)(\s[^>]*)?>[^<]*<\/dcterms:\1>/g,
    (_all, name: string, attrs: string | undefined) => `<dcterms:${name}${attrs ?? ""}>${stamp}</dcterms:${name}>`,
  );
}

// ---- DOCX writing. ----

/** The docx package compiler, which the async Packer also uses. */
interface DocxCompiler {
  compile(file: unknown, prettify: undefined, overrides: unknown[]): Map<string, string | Uint8Array>;
}

/**
 * Compile a docx `Document` to the parts of the OOXML package.
 * The public interface of this library is synchronous. docx 9.15.3 compiles the
 * package synchronously; only its Packer adds the zip. We add the zip with fflate.
 */
function packageParts(doc: Document): Map<string, string | Uint8Array> {
  const compiler = (Packer as unknown as { compiler?: DocxCompiler }).compiler;
  if (!compiler || typeof compiler.compile !== "function") throw new Error("the docx compiler is not available");
  return compiler.compile(doc, undefined, []);
}

function partText(parts: Map<string, string | Uint8Array>, path: string): string {
  const data = parts.get(path);
  if (typeof data === "string") return data;
  if (data) return strFromU8(data);
  throw new Error(`the docx has no ${path}`);
}

function zipParts(parts: Map<string, string | Uint8Array>, when: Date): Buffer {
  const files: Record<string, Uint8Array> = {};
  for (const [path, data] of parts) files[path] = typeof data === "string" ? strToU8(data) : data;
  return Buffer.from(zipSync(files, { level: 6, mtime: when }));
}

/** Build one DOCX: a Heading 1 with the title, then one anchored paragraph per entry. */
function buildDocx(
  options: { title: string; generatedAt: string },
  paragraphs: GeneratedParagraph[],
): Buffer {
  const when = generatedDate(options.generatedAt);
  const children: Paragraph[] = [
    new Paragraph({ text: options.title, heading: HeadingLevel.HEADING_1 }),
    ...paragraphs.map((p) => {
      const children = [new TextRun(`{{${p.anchor}}}`), new TextRun({ text: p.text, bold: p.style === "center" })];
      if (p.style === "heading") return new Paragraph({ children, heading: HeadingLevel.HEADING_2 });
      if (p.style === "center") return new Paragraph({ children, alignment: AlignmentType.CENTER });
      return new Paragraph({ children });
    }),
  ];
  const doc = new Document({
    title: options.title,
    creator: "Open Advocate",
    description: `Generated ${when.toISOString()} from confirmed Notebook events only.`,
    sections: [{ children }],
  });
  const parts = packageParts(doc);
  parts.set(DOCUMENT_PART, injectAnchors(partText(parts, DOCUMENT_PART)));
  parts.set(CORE_PART, dateStamp(partText(parts, CORE_PART), when));
  return zipParts(parts, when);
}

// ---- The generators. ----

/**
 * The List of Dates: a Heading 1 with the title, then one paragraph per event in date order.
 * A paragraph reads "<dd.mm.yyyy>: <description>", or the range when the event has one.
 */
export function generateListOfDates(
  events: DraftEvent[],
  options: { title: string; generatedAt: string },
): GeneratedDocument {
  const paragraphs = inDateOrder(events).map((e) => ({
    anchor: newAnchor(),
    text: `${rangeText(e.dateStart, e.dateEnd)}: ${e.description.trim()}`,
    eventIds: [e.id],
  }));
  return { docx: buildDocx(options, paragraphs), paragraphs };
}

/**
 * The Synopsis: a Heading 1 with the title, one sentence per event in date order, and a
 * final note. The note carries an anchor but links to no event.
 */
export function generateSynopsis(
  events: DraftEvent[],
  options: { title: string; generatedAt: string },
): GeneratedDocument {
  const paragraphs: GeneratedParagraph[] = inDateOrder(events).map((e) => ({
    anchor: newAnchor(),
    text: eventSentence(e),
    eventIds: [e.id],
  }));
  paragraphs.push({ anchor: newAnchor(), text: DRAFT_NOTE, eventIds: [] });
  return { docx: buildDocx(options, paragraphs), paragraphs };
}

// ---- The DOCX reader. ----

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode the XML entities that Word writes. */
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return all;
      try {
        return String.fromCodePoint(code);
      } catch {
        return all;
      }
    }
    return ENTITIES[body] ?? all;
  });
}

/** Read one attribute value from the attribute text of a tag. */
function attributeValue(attributes: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${escapeForRegExp(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const m = re.exec(attributes);
  if (!m) return null;
  return m[2] ?? m[3] ?? "";
}

/** The live text of one paragraph: w:t only, and no deleted text (WD-013, WD-014). */
function liveText(paragraphXml: string): string {
  const live = paragraphXml
    .replace(/<w:del(?:\s[^>]*)?>[\s\S]*?<\/w:del>/g, "")
    .replace(/<w:moveFrom(?:\s[^>]*)?>[\s\S]*?<\/w:moveFrom>/g, "")
    .replace(/<w:delText(?:\s[^>]*)?>[\s\S]*?<\/w:delText>/g, "");
  let text = "";
  for (const m of live.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) text += decodeXml(m[1]);
  return text;
}

/**
 * The paragraphs of word/document.xml in document order.
 * The anchor is the tag of the nearest enclosing block-level content control (null when none).
 */
function paragraphsFromXml(xml: string): Array<{ anchor: string | null; text: string }> {
  const out: Array<{ anchor: string | null; text: string }> = [];
  const sdtTags: Array<string | null> = [];
  let openParagraphs = 0;
  let paragraphStart = -1;
  let anchor: string | null = null;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    const closing = m[1] === "/";
    const name = m[2];
    const selfClosing = m[4] === "/";
    if (!name) continue; // a comment, a processing instruction or a CDATA block
    if (name === "w:sdt") {
      if (closing) sdtTags.pop();
      else if (!selfClosing) sdtTags.push(null);
      continue;
    }
    if (name === "w:tag" && !closing && sdtTags.length > 0) {
      const value = attributeValue(m[3] ?? "", "w:val");
      if (value !== null) sdtTags[sdtTags.length - 1] = value;
      continue;
    }
    if (name !== "w:p") continue;
    if (closing) {
      if (openParagraphs === 0) continue;
      openParagraphs--;
      if (openParagraphs === 0 && paragraphStart >= 0) {
        out.push({ anchor, text: liveText(xml.slice(paragraphStart, m.index + m[0].length)) });
        paragraphStart = -1;
        anchor = null;
      }
    } else {
      if (openParagraphs === 0) {
        paragraphStart = m.index;
        anchor = null;
        for (let i = sdtTags.length - 1; i >= 0; i--) {
          if (sdtTags[i] !== null) {
            anchor = sdtTags[i];
            break;
          }
        }
      }
      openParagraphs++;
      if (selfClosing) {
        openParagraphs--;
        if (openParagraphs === 0 && paragraphStart >= 0) {
          out.push({ anchor, text: "" });
          paragraphStart = -1;
          anchor = null;
        }
      }
    }
  }
  return out;
}

/**
 * Read the paragraphs of a DOCX in document order: the anchor that each one carries, and its
 * live text. A paragraph that is empty and carries no anchor is not returned.
 */
export function readParagraphs(docx: Buffer): Array<{ anchor: string | null; text: string }> {
  const parts = unzipSync(new Uint8Array(docx));
  const documentXml = parts[DOCUMENT_PART];
  if (!documentXml) throw new Error(`the DOCX has no ${DOCUMENT_PART}`);
  return paragraphsFromXml(strFromU8(documentXml)).filter((p) => p.anchor !== null || p.text.trim() !== "");
}

/**
 * Step 6: a draft with its title only (Questions of Law, Grounds). Its paragraphs come from the
 * agent as tracked insertions, or from the advocate typing; no generator writes legal text.
 */
export function generateStructuredDocx(
  rows: Array<Omit<GeneratedParagraph, "anchor">>,
  options: { title: string; generatedAt: string },
): GeneratedDocument {
  const paragraphs = rows.map((r) => ({ ...r, anchor: newAnchor() }));
  return { docx: buildDocx(options, paragraphs), paragraphs };
}

export function generateEmptyDraft(options: { title: string; generatedAt: string }): GeneratedDocument {
  return { docx: buildDocx(options, []), paragraphs: [] };
}
