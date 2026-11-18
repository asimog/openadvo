/**
 * Phase 6 (P4): the statute checks. Every statutory reference a draft states is looked up in
 * the law store: is it in force on the governing date, is it the current version, is it amended
 * or repealed. A row never verified (`never`, `changed`, `unreachable`) makes the item
 * unconfirmed, never passed. The governing date is named in the output, so the advocate sees
 * which date the check used.
 *
 * Plain library: no Electron import, no Pi import (decision 6). The store is read through the
 * lookup the caller supplies.
 */

export interface StatuteItem {
  kind: "statute_not_found" | "statute_repealed" | "statute_wrong_version" | "statute_not_yet_in_force" | "statute_ceased" | "statute_unconfirmed";
  paragraph: number;
  anchor: string | null;
  /** The reference as the draft writes it. */
  found: string;
  evidence: string;
  action: string;
}

export interface StatuteCheckInput {
  paragraphs: Array<{ anchor: string | null; text: string }>;
  /** The date the law is selected for, or null when none is recorded. */
  governingDate: string | null;
  /** The law rows for an act and section, or null when the library holds none. */
  lookup: (act: string, section: string) => Array<{
    act: string;
    section: string;
    status: string;
    version: number | null;
    validFrom: string | null;
    validUntil: string | null;
    current: number;
    checkState: string;
    sourceRef: string;
  }> | null;
}

export interface StatuteCheckResult {
  /** The governing date the checks used, named for the advocate. */
  governingDate: string | null;
  governingDateBasis: string;
  checked: number;
  items: StatuteItem[];
  notRun: Array<{ check: string; reason: string }>;
}

/** A statutory reference as the draft states it. */
export interface StatuteReference {
  act: string;
  section: string;
  text: string;
}

const SECTION_OF = /\b(?:[Ss]ection|[Ss]ec\.?|[Ss]\.)\s*(\d+[A-Z]{0,2})\s+of\s+(?:[Tt]he\s+)?(([A-Za-z&,-]+(?:\s+[A-Z][A-Za-z&,-]*)*\s+(?:Act|Code|Sanhita|Adhiniyam|Rules|Regulation)|(?:Code|Act)\s+of\s+[A-Za-z&,-]+(?:\s+[A-Z][A-Za-z&,-]*)*)(?:,?\s*(?:1[5-9]\d\d|20\d\d))?)/g;
const ARTICLE_OF = /\b([Aa]rticle|[Aa]rt\.)\s*(\d+[A-Z]{0,2})\s+of\s+(?:[Tt]he\s+)?(Constitution of India|Constitution)\b/g;

/** Every statutory reference of a paragraph: "section 12 of the Contract Act, 1872", "Article 226 of the Constitution". */
export function findStatuteReferences(paragraph: string): StatuteReference[] {
  const out: StatuteReference[] = [];
  for (const m of paragraph.matchAll(SECTION_OF)) {
    // The optional "the" before the name can be absorbed by the capture; strip it.
    out.push({ section: m[1], act: m[2].replace(/^[Tt]he\s+/, "").trim(), text: m[0] });
  }
  for (const m of paragraph.matchAll(ARTICLE_OF)) {
    out.push({ section: m[2], act: "Constitution of India", text: m[0] });
  }
  return out;
}

function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function checkStatutes(input: StatuteCheckInput): StatuteCheckResult {
  const items: StatuteItem[] = [];
  const notRun: Array<{ check: string; reason: string }> = [];
  let checked = 0;
  const seen = new Set<string>();

  input.paragraphs.forEach((p, index) => {
    const paragraph = index + 1;
    for (const ref of findStatuteReferences(p.text)) {
      const key = `${ref.act}|${ref.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checked += 1;
      const base = { paragraph, anchor: p.anchor, found: ref.text };
      const rows = input.lookup(ref.act, ref.section);
      if (!rows || rows.length === 0) {
        items.push({
          ...base,
          kind: "statute_not_found",
          evidence: `The law library holds no row for ${ref.act}, ${ref.section}.`,
          action: "Save the provision to the matter on the Research tab, or correct the reference.",
        });
        continue;
      }
      const governing = input.governingDate;
      const current = rows.filter((r) => r.current === 1);
      const row = current[0] ?? rows[0];
      const fromOk = isoDate(row.validFrom) == null || governing == null || isoDate(row.validFrom)! <= governing;
      const untilOk = isoDate(row.validUntil) == null || governing == null || governing <= isoDate(row.validUntil)!;
      if (row.status === "repealed" || row.status === "omitted") {
        items.push({
          ...base,
          kind: "statute_repealed",
          evidence: `${row.act}, ${row.section} is recorded as ${row.status} (${row.sourceRef}).`,
          action: "Rely on the provision in force, or record why the repealed one applies.",
        });
        continue;
      }
      if (governing != null && !fromOk) {
        items.push({
          ...base,
          kind: "statute_not_yet_in_force",
          evidence: `${row.act}, ${row.section} (version ${row.version ?? "—"}) is in force from ${isoDate(row.validFrom)}, and the governing date is ${governing}.`,
          action: "Cite the version in force on the governing date, or correct the date.",
        });
        continue;
      }
      if (governing != null && !untilOk) {
        items.push({
          ...base,
          kind: "statute_ceased",
          evidence: `${row.act}, ${row.section} (version ${row.version ?? "—"}) ceased on ${isoDate(row.validUntil)}, and the governing date is ${governing}.`,
          action: "Cite the version in force on the governing date.",
        });
        continue;
      }
      if (current.length === 0) {
        items.push({
          ...base,
          kind: "statute_wrong_version",
          evidence: `${row.act}, ${row.section} (version ${row.version ?? "—"}) is not the current row: a newer version exists in the library.`,
          action: "Cite the current version, or record why the older one applies.",
        });
        continue;
      }
      if (row.checkState === "never" || row.checkState === "changed" || row.checkState === "unreachable") {
        items.push({
          ...base,
          kind: "statute_unconfirmed",
          evidence: `${row.act}, ${row.section} was ${row.checkState === "never" ? "never verified" : row.checkState === "changed" ? "changed since the last verification" : "unreachable on the last verification"} (${row.sourceRef}).`,
          action: "Verify the text against the official source before filing.",
        });
        continue;
      }
    }
  });

  const governingDateBasis = input.governingDate
    ? `the governing date ${input.governingDate} (the impugned event's date, as the matter records it)`
    : "no governing date is recorded: the check used today, and the version question stays open";
  if (input.governingDate == null) notRun.push({ check: "The version in force on the governing date", reason: "The matter records no governing date (choose the impugned event on the Matter tab, or record the date the cause arose)." });
  return { governingDate: input.governingDate, governingDateBasis, checked, items, notRun };
}
