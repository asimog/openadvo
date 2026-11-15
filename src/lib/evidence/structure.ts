/**
 * H6: the legal structure of a document. Headings, parties, facts, grounds, prayers, allegations,
 * admissions, denials, witnesses, exhibits, directions and annexures, each with its line anchor.
 * Fixed rules only; the advocate confirms what a part is. Plain library.
 */
import type { DocumentPartKind } from "../../shared/evidence.ts";
import type { EvidenceLine } from "./facts.ts";

export interface PartInput {
  kind: DocumentPartKind;
  text: string;
  sourceId: string;
  anchorId: string;
  page: number;
  line: number;
  ref: string;
}

const HEADINGS: Array<[RegExp, DocumentPartKind]> = [
  [/^\s*(?:I\.?\s*)?(?:the\s+)?facts?\b/i, "facts"],
  [/^\s*(?:the\s+)?grounds?\b/i, "grounds"],
  [/^\s*(?:the\s+)?prayer\b/i, "prayer"],
  [/^\s*(?:the\s+)?parties\b/i, "parties"],
  [/^\s*(?:the\s+)?annexures?\b/i, "annexure"],
];

const DIRECTIONS = /\b(directed|direction|shall\s+(?:file|appear|comply|deposit|produce)|within\s+\d+\s+(?:days?|weeks?|months?))\b/i;
const WITNESS = /\b(?:PW|DW|CW|witness)\s*[-:]?\s*\d+|\bexamined\s+as\s+(?:PW|DW)\b/i;
const EXHIBIT = /\b(?:Exhibit|Ex\.?)\s*[-:]?\s*[A-Z0-9]+|\bmarked\s+as\s+(?:Exhibit|Ex\.?)\b/i;
const ANNEXURE = /\bAnnexure\s+[A-Z0-9-]+\b/gi;
const PRAYER = /\b(?:it\s+is\s+therefore\s+prayed|pray(?:er)?\s+(?:that|for)|most\s+respectfully\s+prayed)\b/i;
const ADMISSION = /\b(?:admitted|admission|not\s+disputed|conceded)\b/i;
const DENIAL = /\b(?:denied|denial|not\s+admitted|disputed)\b/i;
const ALLEGATION = /\b(?:alleged|allegation|it\s+is\s+submitted|it\s+is\s+stated)\b/i;

export function extractStructure(lines: EvidenceLine[]): PartInput[] {
  const out: PartInput[] = [];
  let section: DocumentPartKind = "other";
  let titleDone = false;
  for (const l of lines) {
    if (out.length >= 500) break;
    const text = l.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const add = (kind: DocumentPartKind, value = text, ref = "") => out.push({ kind, text: value.slice(0, 1000), sourceId: l.sourceId, anchorId: l.anchorId, page: l.page, line: l.line, ref });
    if (!titleDone && text.length <= 160 && /^(?:in\s+the\s+|before\s+the\s+)?(?:supreme\s+court|high\s+court|district|tribunal|in\s+the\s+matter\s+of)/i.test(text)) {
      add("title");
      titleDone = true;
    }
    const heading = HEADINGS.find(([re]) => re.test(text))?.[1];
    if (heading) {
      section = heading;
      add(heading, text);
      continue;
    }
    if (/\b(?:v|vs|versus)\.?(?=\s)/i.test(text) && text.length < 240) add("parties");
    if (PRAYER.test(text)) add("prayer");
    if (ADMISSION.test(text)) add("admission");
    if (DENIAL.test(text)) add("denial");
    if (ALLEGATION.test(text)) add("allegation");
    if (WITNESS.test(text)) add("witness");
    if (EXHIBIT.test(text)) add("exhibit");
    if (DIRECTIONS.test(text)) add("direction");
    for (const m of text.matchAll(ANNEXURE)) add("annexure", m[0], m[0]);
    if (section !== "other" && section !== "title" && section !== "parties" && !out.some((p) => p.anchorId === l.anchorId && p.kind === section)) add(section);
  }
  return out;
}
