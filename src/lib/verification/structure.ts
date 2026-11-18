/**
 * Phase 6 (P7, P8): the structure checks of a draft. The template's parts must be present and in
 * order; numbered paragraphs sequential; a cross-reference must name a paragraph that exists; an
 * annexure reference must name a recorded annexure; the relief the matter records must be prayed;
 * the open markers [CITE], [VERIFY], [REVIEW] and [TO BE COMPLETED are found; the page format of
 * the DOCX must match the court's. Deterministic: no model reads the draft here.
 *
 * Plain library: no Electron import, no Pi import (decision 6).
 */
import { strFromU8, unzipSync } from "fflate";

export interface StructureItem {
  kind:
    | "missing_part"
    | "part_order"
    | "numbering"
    | "cross_reference"
    | "annexure_reference"
    | "relief_mismatch"
    | "page_format"
    | "marker";
  /** The marker's own word, for kind "marker": "[CITE]", "[VERIFY]" or "[REVIEW]". */
  marker?: string;
  paragraph: number;
  anchor: string | null;
  text: string;
  evidence: string;
  action: string;
}

export interface StructureInput {
  paragraphs: Array<{ anchor: string | null; text: string }>;
  /** The headings the template's parts carry, in order. Empty when the kind has no template. */
  requiredHeadings: string[];
  /** The annexure labels the matter records, for example "Annexure P-1". */
  annexureLabels: string[];
  /** The relief recorded in the matter, each clause the prayer should hold. */
  recordedRelief: string[];
  /** The court's page size in OOXML twips, or null when no format is known. */
  pageFormat: { width: number; height: number } | null;
  /** The DOCX itself, for the page setup. Null when the check runs on stored text only. */
  docx?: Buffer;
}

export interface StructureResult {
  items: StructureItem[];
  /** Reported, never defects: footnotes and tables present. */
  notes: string[];
  notRun: Array<{ check: string; reason: string }>;
}

/** The markers a draft may hold. An open marker blocks approval (P8). */
export const MARKERS = ["[CITE]", "[VERIFY]", "[REVIEW]"] as const;
export type Marker = (typeof MARKERS)[number];

/** The [TO BE COMPLETED: …] marker of the form parts. */
export const TO_COMPLETE = "[TO BE COMPLETED";

/** The markers of a text, including the incomplete-parts marker. */
export function markersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of MARKERS) if (text.includes(m)) out.push(m);
  if (text.includes(TO_COMPLETE)) out.push(TO_COMPLETE);
  return out;
}

const NUMBERED = /^(\d{1,3})\.\s/;
const CROSS_REFERENCE = /\b(?:paragraph|para)\.?\s*(\d{1,3})\b/gi;
const ANNEXURE_REFERENCE = /\bAnnexure\s*([A-Z]?[- ]?\d{1,2})\b/gi;

/** The page size the DOCX's own section properties state, in twips, or null. */
export function readPageSetup(docx: Buffer): { width: number; height: number } | null {
  const parts = unzipSync(new Uint8Array(docx));
  const xml = parts["word/document.xml"];
  if (!xml) return null;
  const text = strFromU8(xml);
  const m = /<w:pgSz\s[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(text) || /<w:pgSz\s[^>]*w:h="(\d+)"[^>]*w:w="(\d+)"/.exec(text);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return null;
  return m[0].indexOf("w:w") < m[0].indexOf("w:h") ? { width, height } : { width: height, height };
}

/** The footnotes and tables the DOCX carries, reported as notes. */
export function readNotes(docx: Buffer): { footnotes: number; tables: number } {
  const parts = unzipSync(new Uint8Array(docx));
  const text = parts["word/document.xml"] ? strFromU8(parts["word/document.xml"]) : "";
  const tables = (text.match(/<w:tbl[\s>]/g) ?? []).length;
  const footnotes = parts["word/footnotes.xml"] ? (strFromU8(parts["word/footnotes.xml"]).match(/<w:footnote[\s>]/g) ?? []).length : 0;
  return { footnotes, tables };
}

export function checkStructure(input: StructureInput): StructureResult {
  const items: StructureItem[] = [];
  const notes: string[] = [];
  const notRun: Array<{ check: string; reason: string }> = [];
  const texts = input.paragraphs.map((p) => ({ ...p, text: p.text.trim() }));

  // 1. The template's parts, present and in order: a part that appears earlier than the part
  // before it is out of order; a part that does not appear is missing.
  if (input.requiredHeadings.length === 0) {
    notRun.push({ check: "The template's parts are present", reason: "This kind has no template: the parts are the advocate's own." });
  } else {
    const norm = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").toLowerCase();
    let last = -1;
    for (const heading of input.requiredHeadings) {
      const at = texts.findIndex((p) => norm(p.text) === norm(heading));
      if (at < 0) {
        items.push({
          kind: "missing_part",
          paragraph: 0,
          anchor: null,
          text: heading,
          evidence: `The draft does not hold the part "${heading}" the template names.`,
          action: "Regenerate the draft, or add the part in the editor.",
        });
        continue;
      }
      if (at <= last) {
        items.push({
          kind: "part_order",
          paragraph: at + 1,
          anchor: texts[at].anchor,
          text: texts[at].text,
          evidence: `The part "${heading}" appears out of the template's order.`,
          action: "Move the part to its place, or regenerate the draft.",
        });
      } else {
        last = at;
      }
    }
  }

  // 2. Numbering: sequential within the draft.
  const numbered = texts.filter((p) => NUMBERED.test(p.text));
  if (numbered.length >= 2) {
    let expected = 1;
    for (const p of numbered) {
      const n = Number(NUMBERED.exec(p.text)![1]);
      if (n !== expected) {
        items.push({
          kind: "numbering",
          paragraph: texts.indexOf(p) + 1,
          anchor: p.anchor,
          text: p.text.slice(0, 80),
          evidence: `The paragraph numbers jump: expected ${expected}, the draft says ${n}.`,
          action: "Correct the numbering.",
        });
        expected = n + 1;
      } else expected += 1;
    }
  }

  // 3. Cross-references name a numbered paragraph.
  const last = numbered.length > 0 ? Math.max(...numbered.map((p) => Number(NUMBERED.exec(p.text)![1]))) : 0;
  if (last === 0) notRun.push({ check: "Cross-references name an existing paragraph", reason: "The draft holds no numbered paragraph to refer to." });
  texts.forEach((p, i) => {
    for (const m of p.text.matchAll(CROSS_REFERENCE)) {
      const n = Number(m[1]);
      if (n < 1 || n > last) {
        items.push({
          kind: "cross_reference",
          paragraph: i + 1,
          anchor: p.anchor,
          text: p.text.slice(0, 80),
          evidence: `The draft refers to paragraph ${n}, and the numbering reaches only ${last}.`,
          action: "Correct the reference, or add the paragraph it refers to.",
        });
      }
    }
  });

  // 4. Annexure references name a recorded annexure.
  if (input.annexureLabels.length === 0) {
    notRun.push({ check: "Annexure references name a recorded annexure", reason: "The matter records no annexure." });
  } else {
    texts.forEach((p, i) => {
      for (const m of p.text.matchAll(ANNEXURE_REFERENCE)) {
        const wanted = m[1];
        const known = input.annexureLabels.some((label) => label.replace(/\s+/g, "").includes(wanted.replace(/\s+/g, "")));
        if (!known) {
          items.push({
            kind: "annexure_reference",
            paragraph: i + 1,
            anchor: p.anchor,
            text: p.text.slice(0, 80),
            evidence: `The draft refers to Annexure ${wanted}, and the matter records ${input.annexureLabels.join(", ")}.`,
            action: "Correct the reference, or record the annexure on the Filing tab.",
          });
        }
      }
    });
  }

  // 5. The relief the matter records is prayed.
  if (input.recordedRelief.length > 0) {
    const prayerAt = texts.findIndex((p) => /^PRAYER/i.test(p.text));
    if (prayerAt < 0) {
      notRun.push({ check: "The relief the matter records is prayed", reason: "The draft holds no PRAYER part." });
    } else {
      const prayerText = texts.slice(prayerAt).map((p) => p.text).join(" ");
      for (const relief of input.recordedRelief) {
        if (!prayerText.includes(relief.trim())) {
          items.push({
            kind: "relief_mismatch",
            paragraph: prayerAt + 1,
            anchor: texts[prayerAt].anchor,
            text: relief.slice(0, 80),
            evidence: `The recorded relief "${relief.trim()}" is not in the prayer.`,
            action: "Add the clause to the prayer, or correct the recorded relief.",
          });
        }
      }
    }
  }

  // 6. The open markers (P8).
  texts.forEach((p, i) => {
    for (const marker of markersIn(p.text)) {
      items.push({
        kind: "marker",
        marker,
        paragraph: i + 1,
        anchor: p.anchor,
        text: p.text.slice(0, 80),
        evidence: `The paragraph holds the open marker ${marker}.`,
        action:
          marker === "[CITE]"
            ? "Insert the citation with its source, then remove the marker."
            : marker === "[VERIFY]"
              ? "Verify the statement against its source, then remove the marker."
              : marker === "[REVIEW]"
                ? "Write or review the passage, then remove the marker."
                : "Record the detail and regenerate, or complete it in the editor.",
      });
    }
  });

  // 7. The page format of the DOCX.
  if (input.pageFormat && input.docx) {
    const setup = readPageSetup(input.docx);
    if (setup && (setup.width !== input.pageFormat.width || setup.height !== input.pageFormat.height)) {
      items.push({
        kind: "page_format",
        paragraph: 0,
        anchor: null,
        text: `${setup.width} x ${setup.height} twips`,
        evidence: `The document's page is ${setup.width} x ${setup.height} twips, and the court's format is ${input.pageFormat.width} x ${input.pageFormat.height}.`,
        action: "Regenerate the draft (it is born in the court's format), or change the page setup in the editor.",
      });
    }
  } else if (!input.pageFormat) {
    notRun.push({ check: "The page format matches the court's", reason: "No format is known for this court: the default A4 page applies." });
  }

  if (input.docx) {
    const counts = readNotes(input.docx);
    notes.push(`Footnotes: ${counts.footnotes}. Tables: ${counts.tables}.`);
  }

  return { items, notes, notRun };
}
