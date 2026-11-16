/**
 * E3: the structure of a provision as its source gives it. India Code gives a section as HTML
 * with one block per sub-section, clause, explanation or illustration, and the amendment history
 * as footnotes. This module reads both. It never writes law: every part and every event keeps
 * the source's own words. Plain library (decision 6).
 */
import { createHash } from "node:crypto";
import { htmlToText } from "../research-sources/http.ts";
import type { StatuteEvent, StatuteEventKind } from "../../shared/law.ts";

/** The date a source writes ("1-7-2024", "01-07-2024", "1872-09-01", "8-1-1997") as ISO, or null. */
export function sourceDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(t);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 1700 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The text of a provision as compared between two readings: tags and spacing never count. */
export function normaliseText(htmlOrText: string): string {
  return htmlToText(htmlOrText).replace(/\s+/g, " ").trim();
}

export function textHash(text: string): string {
  return createHash("sha256").update(normaliseText(text)).digest("hex");
}

export type PartKind = "intro" | "subsection" | "clause" | "subclause" | "proviso" | "explanation" | "illustration" | "exception" | "text";

export interface ProvisionPart {
  kind: PartKind;
  /** "(1)", "(a)", "(i)", "Explanation 1", or "" */
  num: string;
  text: string;
  /** 0 the section, 1 a sub-section, 2 a clause, 3 a sub-clause. */
  level: number;
}

const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x|xi{0,3}|xiv|xv)$/;

/** The blocks of a section, in order, each with its kind. */
export function provisionParts(htmlOrText: string): ProvisionPart[] {
  const lines = htmlToText(htmlOrText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ProvisionPart[] = [];
  let lastAlpha = "";
  let inIllustrations = false;
  for (const raw of lines) {
    const line = raw.replace(/^\d+\s*\[?\s*(?=\()/, "").replace(/^\[\s*/, "");
    let m: RegExpExecArray | null;
    if (/^Illustrations?\.?$/i.test(line)) {
      inIllustrations = true;
      out.push({ kind: "illustration", num: "", text: line, level: 1 });
      continue;
    }
    if ((m = /^(Explanation(?:\s+\d+)?|Exception(?:\s+\d+)?)\s*[.:—–-]+\s*(.*)$/i.exec(line))) {
      inIllustrations = false;
      out.push({ kind: /^Exp/i.test(m[1]) ? "explanation" : "exception", num: m[1], text: m[2], level: 1 });
      continue;
    }
    if (/^Provided\b/.test(line)) {
      out.push({ kind: "proviso", num: "", text: line, level: 1 });
      continue;
    }
    if ((m = /^\((\d+[A-Z]?)\)\s*(.*)$/.exec(line))) {
      inIllustrations = false;
      lastAlpha = "";
      out.push({ kind: "subsection", num: `(${m[1]})`, text: m[2], level: 1 });
      continue;
    }
    if ((m = /^\(([a-z]{1,3})\)\s*(.*)$/.exec(line))) {
      if (inIllustrations) {
        out.push({ kind: "illustration", num: `(${m[1]})`, text: m[2], level: 2 });
        continue;
      }
      // "(i)" is a clause after "(h)", and a sub-clause anywhere else.
      const roman = ROMAN.test(m[1]) && !(m[1] === "i" && lastAlpha === "h") && !(m[1] === "v" && lastAlpha === "u") && !(m[1] === "x" && lastAlpha === "w");
      if (roman) out.push({ kind: "subclause", num: `(${m[1]})`, text: m[2], level: 3 });
      else {
        lastAlpha = m[1];
        out.push({ kind: "clause", num: `(${m[1]})`, text: m[2], level: 2 });
      }
      continue;
    }
    out.push({ kind: out.length === 0 ? "intro" : inIllustrations ? "illustration" : "text", num: "", text: line, level: out.length === 0 ? 0 : 1 });
  }
  return out;
}

const EVENT_WORDS: Array<[RegExp, StatuteEventKind]> = [
  [/^Ins(?:erted)?\b/i, "insertion"],
  [/^Added\b/i, "insertion"],
  [/^Subs(?:tituted)?\b/i, "substitution"],
  [/^Omitted\b/i, "omission"],
  [/^Rep(?:ealed)?\b/i, "repeal"],
  [/^(?:The\s+)?.{0,80}?\brep(?:ealed)?\.?\s+by\b/i, "repeal"],
  [/^(?:The\s+)?.{0,80}?\bomitted\s+by\b/i, "omission"],
  [/^Renumbered\b/i, "renumbering"],
  [/^Amended\b/i, "amendment"],
];

/**
 * The amendment events a provision's footnotes state. One event per footnote that names an
 * amending instrument. The date is the "w.e.f." date when the footnote gives one; else the
 * year of the amending Act, marked as a year only.
 */
export function footnoteEvents(actId: string, provision: string, footnoteHtml: string): Array<Omit<StatuteEvent, "id">> {
  const out: Array<Omit<StatuteEvent, "id">> = [];
  const notes = htmlToText(footnoteHtml)
    .split("\n")
    .map((l) => l.replace(/^\d+\s*\.\s*/, "").trim())
    .filter(Boolean);
  for (const note of notes) {
    const kind = EVENT_WORDS.find(([re]) => re.test(note))?.[1];
    if (!kind) continue;
    const by = /\bby\s+(?:the\s+)?(?:([A-Z][^,(]*?Act,?\s+\d{4})\s*\()?\s*(?:Act\s+)?(\d+[A-Z]?)\s+of\s+(\d{4})\)?/i.exec(note);
    if (!by) continue;
    const sec = /,\s*s(?:ec(?:tion)?)?\.?\s*([0-9A-Z]+)/i.exec(note.slice(by.index));
    const wef = /w\.\s*e\.\s*f\.?\s*(\d{1,2}[-./]\d{1,2}[-./]\d{4})/i.exec(note);
    const date = wef ? sourceDate(wef[1]) : null;
    const part = partOfNote(note);
    out.push({
      actId,
      provision,
      kind,
      scope: part ? "part" : "provision",
      part,
      byAct: `${by[1] ? `${by[1].trim()} (` : ""}Act ${by[2]} of ${by[3]}${by[1] ? ")" : ""}`,
      bySection: sec?.[1] ?? "",
      date: date ?? `${by[3]}-01-01`,
      datePrecision: date ? "day" : "year",
      quote: note.slice(0, 600),
      source: "footnote",
    });
  }
  return out;
}

/** The part a footnote changes, when it names one ("the second clause of Exception 1"). */
function partOfNote(note: string): string {
  const before = /^(.{0,160}?)\b(?:rep(?:ealed)?|omitted|subs(?:tituted)?|ins(?:erted)?|added|renumbered|amended)\b\.?\s+by\b/i.exec(note)?.[1]?.trim() ?? "";
  if (!before || /^(?:the\s+)?(?:whole\s+)?(?:section|s\.|rule|article)\s*$/i.test(before)) return "";
  if (/\b(?:clause|sub-?section|proviso|explanation|illustration|exception|schedule|entry|item|paragraph)\b/i.test(before) || /\bof\s+(?:section|s\.|rule|article)\b/i.test(before)) return before;
  return "";
}

/** True when the source gives no operative text for a provision ("Repealed.", "Omitted."). */
export function goneMarker(heading: string, text: string): "repealed" | "omitted" | null {
  const h = heading.trim();
  const t = normaliseText(text);
  if (/^\[?\s*Repealed\.?\s*\.?\]?\.?$/i.test(h) || /^\[?\s*Rep(?:ealed)?\b[^.]{0,120}\.?\]?$/i.test(t)) return "repealed";
  if (/^\[?\s*Omitted\.?\s*\.?\]?\.?$/i.test(h) || /^\[?\s*Omitted\b[^.]{0,120}\.?\]?$/i.test(t)) return "omitted";
  return null;
}
