/**
 * H8: candidate facts from the stored lines. Fixed rules only; a candidate is not a fact until
 * the advocate confirms it. Plain library (decision 6).
 */
import { findDates } from "../notebook/index.ts";
import type { FactType } from "../../shared/evidence.ts";

export interface EvidenceLine {
  anchorId: string;
  sourceId: string;
  sourceName: string;
  page: number;
  line: number;
  text: string;
  reading: "text_layer" | "ocr";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  pageHeight?: number;
}

export interface FactInput {
  text: string;
  type: FactType;
  sourceId: string;
  anchorId: string;
  page: number;
  line: number;
  date: string;
  amount: string;
  parties: string[];
  relief: string;
  method: string;
}

const ADMISSION = /\b(admitted|admission|agree[sd]?\s+that|not\s+disputed|undisputed|conceded)\b/i;
const DENIAL = /\b(denied|denies|denial|not\s+admitted|disputed|dispute[sd]?)\b/i;
const MISSING = /\b(not\s+known|not\s+available|no\s+record|cannot\s+be\s+traced)\b/i;
const RELIEF = /\b(pray(?:ed|er)?|relief|direction|directed|declare|quash|set\s+aside|stay|injunction|compensation|damages)\b/i;
const SKIP = /^(?:page|p\.|annexure|exhibit|index|contents|table\s+of|date\s+of\s+(?:order|judgment)|coram|equivalent\s+citation)\b/i;
const AMOUNT = /(?:\bRs\.?|\bINR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:\/-)?)(?:\s*(lakhs?|crores?))?/i;
const CAUSE_TITLE = /^\s*(.{3,120}?)\s+(?:v\.|vs\.?|versus)\s+(.{3,120}?)\s*(?:\.{3}|.)?\s*$/i;

export function amountOf(text: string): string {
  const m = AMOUNT.exec(text);
  if (!m) return "";
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base) || base === 0) return "";
  const mult = /lakh/i.test(m[2] ?? "") ? 1e5 : /crore/i.test(m[2] ?? "") ? 1e7 : 1;
  return String(Math.round(base * mult * 100) / 100);
}

export function partiesOf(text: string): string[] {
  const m = CAUSE_TITLE.exec(text);
  if (!m) return [];
  return [m[1].replace(/\s+/g, " ").trim(), m[2].replace(/\s+/g, " ").replace(/\s*(?:\.{3}|.).*$/, "").trim()].filter(Boolean);
}

/** One line becomes a fact only when it carries a date, an amount, a party, an admission or a relief. */
export function lineFact(l: EvidenceLine): FactInput | null {
  const text = l.text.replace(/\s+/g, " ").trim();
  if (text.length < 25 || SKIP.test(text)) return null;
  const dates = findDates(text);
  const amount = amountOf(text);
  const parties = partiesOf(text);
  const admission = ADMISSION.test(text);
  const denial = DENIAL.test(text);
  const missing = MISSING.test(text);
  const relief = RELIEF.test(text);
  if (!dates.length && !amount && !parties.length && !admission && !denial && !missing && !relief) return null;
  const type: FactType = admission ? "admission" : denial ? "denial" : missing ? "missing" : "fact";
  return {
    text: text.slice(0, 1000),
    type,
    sourceId: l.sourceId,
    anchorId: l.anchorId,
    page: l.page,
    line: l.line,
    date: dates[0]?.start ?? "",
    amount,
    parties,
    relief: relief ? text.slice(0, 500) : "",
    method: "fact-rules-v1",
  };
}

/** Every candidate fact of one source, at most 500, with the same line used once. */
export function extractFacts(lines: EvidenceLine[]): FactInput[] {
  const out: FactInput[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (out.length >= 500) break;
    const f = lineFact(l);
    if (!f) continue;
    const key = `${f.anchorId}\n${f.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
