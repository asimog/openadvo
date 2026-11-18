/**
 * RAG-1: read an Act from its own text extract. The Constitution and the repealed Indian Penal
 * Code, Code of Criminal Procedure and Evidence Act are India Code PDFs with a TEXT bundle, not
 * section items. The text extract is a hint; the PDF is the source of record. Page numbers in the
 * extract become page anchors. An arrangement of sections repeats every provision in short form,
 * so the longest text for a provision number is kept and the short index entry is dropped.
 *
 * This parser is deliberately conservative. It never invents a number, a chapter or a part.
 */
import type { ProvisionKind } from "../../shared/law.ts";

export interface ActTextLine {
  page: number;
  line: number;
  text: string;
}

export interface ParsedActProvision {
  kind: ProvisionKind;
  number: string;
  heading: string;
  text: string;
  footnotes: string;
  order: number;
  page: number;
  line: number;
  /** "PART III / CHAPTER I", "CHAPTER VII" or "" when the source prints none. */
  under: string;
  gone: "repealed" | "omitted" | null;
}

/**
 * Split an Act text extract into page and line rows. A line that is only a number is a page
 * marker, not text. The extract's page numbers are the source's printed page numbers.
 */
export function actTextLines(text: string): ActTextLine[] {
  const lines: ActTextLine[] = [];
  let page = 1;
  let line = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*\d{1,4}\s*$/.test(raw)) {
      page = Number(raw.trim());
      line = 0;
      continue;
    }
    line += 1;
    const value = raw.trim();
    if (value) lines.push({ page, line, text: value });
  }
  return lines;
}

function headingOf(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const cut = clean.search(/[.—]\s/);
  const heading = (cut > 0 ? clean.slice(0, cut) : clean).replace(/[.;]$/, "").trim();
  return heading.length <= 200 ? heading : "";
}

function goneOf(text: string): "repealed" | "omitted" | null {
  const opening = text.slice(0, 80).toLowerCase();
  if (/^\[\s*repealed/.test(opening)) return "repealed";
  if (/^\[\s*omitted/.test(opening)) return "omitted";
  return null;
}

/**
 * Parse an Act text extract. `kind` is "article" for the Constitution and "section" for the
 * codes. The result is ordered by page, then line, then number. A repeated provision keeps the
 * longest text, which drops the arrangement-of-sections entry and keeps the body.
 */
export interface PdfPage {
  page: number;
  lines: Array<{ line: number; text: string }>;
}

const cleanPdfLine = (value: string) => value.replace(/\s*IndiaCode\s*/gi, " ").replace(/\s+/g, " ").trim();
const RUNNING_HEADER = /^(?:\d{1,4}\s+)?(?:THE CONSTITUTION OF INDIA|THE INDIAN PENAL CODE|THE CODE OF CRIMINAL PROCEDURE(?:, 1973)?|THE INDIAN EVIDENCE ACT(?:, 1872)?|ARRANGEMENT OF SECTIONS|SECTIONS|ARTICLES)$/i;
const SCHEDULE_HEADING = /^(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH)\s+SCHEDULE$/i;

/**
 * The first page of the operative body. The contents and arrangement repeat every heading in
 * short form; the body starts at the first numbered line that carries the section text after an
 * em dash. A line that says "Omitted" or "Repealed" is still an index entry and is skipped.
 */
export function statuteBodyStart(pages: PdfPage[]): number {
  for (let index = 0; index < pages.length; index++) {
    for (const line of pages[index].lines) {
      const value = cleanPdfLine(line.text);
      if (/^(ACT NO\.|No\.\s*\d+\s+OF\s+\d{4})/i.test(value)) return index;
      if (/^An Act to\b/i.test(value)) return index;
      if (/^WE, THE PEOPLE OF INDIA/i.test(value)) return index;
    }
  }
  return 0;
}

/**
 * Parse the operative body of an Act from a PDF's page and line rows. This is the source path
 * for the Constitution and the repealed codes: the PDF text layer is stable, and the page and
 * line are anchors. The body start skips the arrangement; the parser stops at the first
 * schedule. It never invents a number or a heading.
 */
export interface StatutePageOptions {
  /** Start at this line. It skips the abbreviations, contents and arrangement. */
  start?: RegExp;
  /** The largest accepted jump between two provision numbers. Default 20; OCR noise is larger. */
  maxJump?: number;
}

/** The repealed CrPC's OCR reads a few section numbers badly. These are the known readings. */
function repairOcrNumber(value: string): string {
  if (/^4g,2\./.test(value)) return value.replace(/^4g,2\./, "482.");
  if (/^rn2\./.test(value)) return value.replace(/^rn2\./, "482.");
  if (/^4\.?83\./.test(value)) return value.replace(/^4\.?83\./, "483.");
  if (/^4-84\./.test(value)) return value.replace(/^4-84\./, "484.");
  return value;
}

export function parseStatutePages(pages: PdfPage[], kind: ProvisionKind = "section", opts: StatutePageOptions = {}): ParsedActProvision[] {
  const start = opts.start ? 0 : statuteBodyStart(pages);
  const found = new Map<string, ParsedActProvision>();
  let part = "";
  let chapter = "";
  let current: ParsedActProvision | null = null;
  let body: string[] = [];
  let lastNumber = 0;
  let started = !opts.start;

  const flush = (): void => {
    if (!current) return;
    const value = body.join("\n").trim();
    if (value) {
      const row = { ...current, text: value, gone: goneOf(value) };
      const prior = found.get(row.number.toUpperCase());
      if (!prior || row.text.length > prior.text.length) found.set(row.number.toUpperCase(), row);

    }
    current = null;
    body = [];
  };

  for (let index = start; index < pages.length; index++) {
    for (const line of pages[index].lines) {
      let value = cleanPdfLine(line.text).replace(/^\s*\d{0,2}\[\s*/, "").trim();
      if (!value) continue;
      if (!started) {
        if (!opts.start?.test(value)) continue;
        started = true;
      }
      value = repairOcrNumber(value);
      if (/^\d{1,4}$/.test(value)) continue;
      if (RUNNING_HEADER.test(value)) continue;
      if (SCHEDULE_HEADING.test(value)) {
        if (found.size > 0) {
          flush();
          return finishStatuteRows(found);
        }
        continue;
      }
      const division = /^(PART|CHAPTER)\s*[.:]?\s*([IVXLCDM]+[AB]?|\d+)\b/i.exec(value);
      if (division) {
        flush();
        if (division[1].toUpperCase() === "PART") {
          part = `PART ${division[2].toUpperCase()}`;
          chapter = "";
        } else {
          chapter = `CHAPTER ${division[2].toUpperCase()}`;
        }
        continue;
      }
      const numbered = /^(\d{1,4}[A-Z]?|l)\.\s*[—–-]?\s*(.+)$/.exec(value);
      if (numbered && !/^\d+\./.test(numbered[2])) {
        const number = numbered[1] === "l" ? "1" : numbered[1];
        const numeric = Number.parseInt(number, 10);
        // An OCR misread such as "1882" is a cross-reference, not a section number. A real
        // section follows the previous one closely; a run of omitted sections is not a jump.
        const first = found.size === 0 && !current;
        if (!first && (numeric > 1000 || numeric > lastNumber + (opts.maxJump ?? 20))) continue;
        const next = numeric > lastNumber;
        const suffix = numeric === lastNumber && /^[0-9]+[A-Z]$/.test(number);
        if (next || suffix) {
          flush();
          lastNumber = numeric;
          current = {
            kind,
            number,
            heading: headingOf(numbered[2]),
            text: "",
            footnotes: "",
            order: 0,
            page: pages[index].page,
            line: line.line,
            under: [part, chapter].filter(Boolean).join(" / "),
            gone: null,
          };
          body = [numbered[2]];
          continue;
        }
      }
      if (current) body.push(value);
    }
  }
  flush();
  return finishStatuteRows(found);
}

function finishStatuteRows(found: Map<string, ParsedActProvision>): ParsedActProvision[] {
  const rows = [...found.values()].sort((a, b) => a.page - b.page || a.line - b.line || a.number.localeCompare(b.number, "en", { numeric: true }));
  rows.forEach((row, index) => {
    row.order = index + 1;
  });
  return rows;
}

export interface ActTextOptions {
  /** Start at the first line that matches, which skips the arrangement and contents. */
  start?: RegExp;
  /** Stop before the first line that matches, which skips the schedules. */
  stop?: RegExp;
  /** The largest accepted jump between two provision numbers. Default 20; OCR noise is larger. */
  maxJump?: number;
}

export function parseActText(text: string, kind: ProvisionKind = "section", opts: ActTextOptions = {}): ParsedActProvision[] {
  const lines = actTextLines(text);
  const found = new Map<string, ParsedActProvision>();
  let part = "";
  let chapter = "";
  let current: ParsedActProvision | null = null;
  let body: string[] = [];
  let lastNumber = 0;
  let started = !opts.start;

  const flush = (): void => {
    if (!current) return;
    const value = body.join("\n").trim();
    if (value) {
      const row = { ...current, text: value, gone: goneOf(value) };
      const key = row.number.toUpperCase();
      const prior = found.get(key);
      if (!prior || row.text.length > prior.text.length) found.set(key, row);
    }
    current = null;
    body = [];
  };

  for (const line of lines) {
    // A footnote marker before a number is not part of the provision: "2[226." is article 226.
    const value = line.text.replace(/^\s*\d{0,2}\[\s*/, "").trim();
    if (!started) {
      if (!opts.start?.test(value)) continue;
      started = true;
    }
    if (opts.stop?.test(value) && (found.size > 0 || current)) {
      flush();
      break;
    }
    const division = /^(PART|CHAPTER)\s*[.:]?\s*([IVXLCDM]+[AB]?|\d+)\b[.:\s-]*(.*)$/i.exec(value);
    if (division) {
      flush();
      if (division[1].toUpperCase() === "PART") {
        part = `PART ${division[2].toUpperCase()}`;
        chapter = "";
      } else {
        chapter = `CHAPTER ${division[2].toUpperCase()}`;
      }
      continue;
    }
    const numbered = /^(\d{1,4}[A-Z]?|l)\.\s*[—–-]?\s*(.+)$/.exec(value);
    // "4.83." is an OCR reading of 483, not section 4 with text "83...". Do not invent.
    if (numbered && !/^\(/.test(numbered[2]) && !/^\d+\./.test(numbered[2])) {
      const numeric = Number.parseInt(numbered[1] === "l" ? "1" : numbered[1], 10);
      const first = found.size === 0 && !current;
      if (!first && (numeric > 1000 || numeric > lastNumber + (opts.maxJump ?? 20))) continue;
      flush();
      lastNumber = numeric;
      current = {
        kind,
        number: numbered[1] === "l" ? "1" : numbered[1],
        heading: headingOf(numbered[2]),
        text: "",
        footnotes: "",
        order: 0,
        page: line.page,
        line: line.line,
        under: [part, chapter].filter(Boolean).join(" / "),
        gone: null,
      };
      body = [numbered[2]];
      continue;
    }
    if (current) body.push(value);
  }
  flush();

  const rows = [...found.values()].sort((a, b) => a.page - b.page || a.line - b.line || a.number.localeCompare(b.number, "en", { numeric: true }));
  rows.forEach((row, index) => {
    row.order = index + 1;
  });
  return rows;
}
