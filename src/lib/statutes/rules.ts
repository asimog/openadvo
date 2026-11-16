/**
 * E3: a court's rules, a practice direction or a repealed Act, from the text lines of a PDF the
 * advocate gives. The lines become provision rows with the same shape as an Act's sections, so
 * the same store, the same Akoma Ntoso form and the same search serve both. Each provision
 * keeps the page and line where it starts. Lines before the first provision are counted and
 * reported, never dropped in silence. Plain library (decision 6).
 */
import { textHash } from "./structure.ts";
import type { ProvisionKind } from "../../shared/law.ts";

export interface TextLine {
  page: number;
  line: number;
  text: string;
}

export interface ParsedRule {
  kind: ProvisionKind;
  number: string;
  heading: string;
  text: string;
  textHash: string;
  order: number;
  page: number;
  line: number;
  /** The chapter, part or order the provision is under, as the document prints it. */
  under: string;
}

export interface ParsedRules {
  provisions: ParsedRule[];
  lines: number;
  /** Lines before the first provision (title pages, contents). */
  preface: number;
  /** The numbering the parser found: "rule", "section", "order" or "article". */
  style: ProvisionKind | null;
}

const DIVISION = /^(CHAPTER|PART|ORDER|TITLE|SCHEDULE|APPENDIX)\s+([IVXLC]+|\d+[A-Z]?)\b\.?\s*[-–—:]?\s*(.*)$/i;
const NUMBERED = /^(?:(Rule|Section|Article|Sec\.|Art\.|R\.)\s*)?(\d{1,4}[A-Z]{0,2})\s*[.)]\s*[-–—]?\s*(\S.*)$/;

function kindOf(word: string | undefined, fallback: ProvisionKind): ProvisionKind {
  if (!word) return fallback;
  if (/^(rule|r\.)/i.test(word)) return "rule";
  if (/^art/i.test(word)) return "article";
  return "section";
}

/**
 * `fallback` is what a bare "12." means in this document: a rule for court rules, a section for
 * an Act. A numbered line starts a provision only when its number follows the last one, so a
 * list item "2." inside a rule does not split the rule.
 */
export function parseRules(lines: TextLine[], fallback: ProvisionKind = "rule"): ParsedRules {
  const provisions: ParsedRule[] = [];
  let under = "";
  let current: (ParsedRule & { body: string[] }) | null = null;
  let preface = 0;
  let lastNum = 0;
  let lastDivision = "";
  const close = () => {
    if (!current) return;
    current.text = current.body.join("\n").trim();
    current.textHash = textHash(current.text);
    const { body: _body, ...row } = current;
    provisions.push(row);
    current = null;
  };
  for (const l of lines) {
    const t = l.text.trim();
    if (!t) continue;
    const d = DIVISION.exec(t);
    if (d && t.length < 120 && t === t.toUpperCase().replace(/[a-z]/g, (c) => c) && /^[A-Z]/.test(t) && d[1] === d[1].toUpperCase()) {
      close();
      under = t;
      // Numbering starts again under a new Order or Chapter in many rule books.
      if (lastDivision !== d[1].toUpperCase() || /^(ORDER|CHAPTER|PART)$/i.test(d[1])) lastNum = 0;
      lastDivision = d[1].toUpperCase();
      continue;
    }
    const m = NUMBERED.exec(t);
    const n = m ? parseInt(m[2], 10) : NaN;
    const follows = m && (n === lastNum + 1 || (n === lastNum && /[A-Z]$/.test(m[2])) || (lastNum === 0 && n === 1) || (!!m[1] && n > lastNum));
    if (m && follows) {
      close();
      lastNum = n;
      const rest = m[3];
      const cut = /^(.{3,160}?)(?:\.\s*[-–—]+|\s[-–—]{1,2}\s|\.—|:\s*[-–—])\s*(.*)$/.exec(rest);
      const heading = cut ? cut[1].trim() : rest.length <= 120 && !/[.;,]$/.test(rest) ? rest : "";
      const first = cut ? cut[2] : heading ? "" : rest;
      current = { kind: kindOf(m[1], fallback), number: m[2], heading, text: "", textHash: "", order: provisions.length + 1, page: l.page, line: l.line, under, body: first ? [first] : [] };
      continue;
    }
    if (current) current.body.push(t);
    else preface++;
  }
  close();
  return { provisions, lines: lines.length, preface, style: provisions[0]?.kind ?? null };
}
