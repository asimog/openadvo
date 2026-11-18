/**
 * Phase 6 (P1): the grounding check. Deterministic, no model call: every quoted string in a
 * draft must appear verbatim in an anchored line, a confirmed fact or a recorded statement of
 * the matter; every page reference must name a page the record holds; every paragraph number
 * cited for a saved authority must exist. The output is a score and the items. A quote shorter
 * than twelve characters cannot be verified, so it is reported, never passed.
 *
 * Plain library: no Electron import, no Pi import (decision 6).
 */

/** The smallest quote a source can verify (the knowledge layer's own rule). */
export const QUOTE_MIN_CHARACTERS = 12;

export type GroundingItemKind =
  | "quote_unmatched"
  | "quote_too_short"
  | "page_missing"
  | "authority_paragraph_missing";

export interface GroundingItem {
  kind: GroundingItemKind;
  /** The position of the paragraph in the draft, from 1. */
  paragraph: number;
  anchor: string | null;
  /** The quote or the reference as the draft writes it. */
  found: string;
  evidence: string;
  action: string;
}

export interface GroundingInput {
  paragraphs: Array<{ anchor: string | null; text: string }>;
  /** The anchored lines of the matter's sources. */
  lines: Array<{ sourceName: string; page: number; line: number; text: string }>;
  /** The pages each source holds. */
  sources: Array<{ name: string; pages: number[] }>;
  facts: Array<{ id: string; text: string; status: string }>;
  evidence: Array<{ id: string; statement: string }>;
  /** For each saved authority: the highest paragraph number indexed, or null when its judgment is not indexed. */
  authorities: Array<{ citation: string; maxParagraph: number | null }>;
}

export interface GroundingResult {
  /** Statements the check looked at: quotes, page references, authority paragraph references. */
  checked: number;
  grounded: number;
  /** grounded of checked, 0 to 1. */
  score: number;
  items: GroundingItem[];
  notRun: Array<{ check: string; reason: string }>;
}

/** Whitespace-tolerant comparison, the knowledge layer's rule: exact words, any spacing. */
function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/** Every quoted span of at least four characters: straight or curly quotes. */
export function quotedSpans(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[“"]([^“”"]{4,})[”"]/g)) out.push(m[1]);
  return out;
}

/** Page and line references: "p. 12", "page 12", "p. 12, l. 3". */
export function pageReferences(text: string): Array<{ page: number; line: number | null }> {
  const out: Array<{ page: number; line: number | null }> = [];
  for (const m of text.matchAll(/\b(?:p|page)\.?\s*(\d{1,4})(?:\s*,?\s*(?:l|line)\.?\s*(\d{1,4}))?\b/gi)) {
    out.push({ page: Number(m[1]), line: m[2] ? Number(m[2]) : null });
  }
  return out;
}

/** Paragraph references of an authority: "paragraph 15", "para 15", "para. 15". */
export function paragraphReferences(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\b(?:paragraph|para)\.?\s*(\d{1,4})\b/gi)) out.push(Number(m[1]));
  return out;
}

/** The citations a paragraph states, in the ulos form ("2024 INSC 23"). */
function citationsIn(text: string, authorities: GroundingInput["authorities"]): string[] {
  return authorities.map((a) => a.citation).filter((c) => c && text.includes(c));
}

export function checkGrounding(input: GroundingInput): GroundingResult {
  const items: GroundingItem[] = [];
  const notRun: Array<{ check: string; reason: string }> = [];
  let checked = 0;
  let grounded = 0;
  const pagesOf = (name: string) => input.sources.find((s) => name && s.name === name)?.pages ?? null;

  input.paragraphs.forEach((p, index) => {
    const paragraph = index + 1;
    const text = p.text.trim();
    if (!text) return;
    const base = { paragraph, anchor: p.anchor };

    for (const quote of quotedSpans(text)) {
      checked += 1;
      if (quote.trim().length < QUOTE_MIN_CHARACTERS) {
        items.push({
          ...base,
          kind: "quote_too_short",
          found: quote,
          evidence: `The quote "${quote}" is shorter than ${QUOTE_MIN_CHARACTERS} characters, so no source can verify it.`,
          action: "Widen the quote to the words the source actually states, or remove the quotation marks.",
        });
        continue;
      }
      const inLine = input.lines.some((l) => sameText(l.text, quote));
      const inFact = input.facts.some((f) => f.text.includes(quote));
      const inStatement = input.evidence.some((e) => e.statement.includes(quote));
      if (inLine || inFact || inStatement) grounded += 1;
      else
        items.push({
          ...base,
          kind: "quote_unmatched",
          found: quote,
          evidence: `The quote "${quote}" appears in no anchored line, no confirmed fact and no recorded statement of this matter.`,
          action: "Correct the quote to the source's words, or add the source that states it.",
        });
    }

    // Page references: the page must exist in a source the paragraph names, or in any source
    // when it names none.
    for (const ref of pageReferences(text)) {
      checked += 1;
      const named = input.sources.filter((s) => text.includes(s.name));
      const candidates = named.length > 0 ? named : input.sources;
      const pageExists = candidates.some((s) => s.pages.includes(ref.page));
      if (pageExists) grounded += 1;
      else
        items.push({
          ...base,
          kind: "page_missing",
          found: `p. ${ref.page}${ref.line != null ? `, l. ${ref.line}` : ""}`,
          evidence: `No source of this matter${named.length === 1 ? ` (${named[0].name})` : ""} holds page ${ref.page}.`,
          action: "Correct the page number, or add the source it refers to.",
        });
    }

    // Paragraph references of a saved authority: the judgment's indexed paragraphs must reach them.
    const cited = citationsIn(text, input.authorities);
    for (const citation of cited) {
      const authority = input.authorities.find((a) => a.citation === citation)!;
      for (const para of paragraphReferences(text)) {
        checked += 1;
        if (authority.maxParagraph == null) {
          notRun.push({ check: `Paragraph ${para} of ${citation} exists`, reason: "The judgment is saved but its paragraphs are not indexed. Read it once on the Research tab." });
          continue;
        }
        if (para >= 1 && para <= authority.maxParagraph) grounded += 1;
        else
          items.push({
            ...base,
            kind: "authority_paragraph_missing",
            found: `${citation}, paragraph ${para}`,
            evidence: `${citation} is indexed to paragraph ${authority.maxParagraph}, so paragraph ${para} does not exist in it.`,
            action: "Correct the paragraph number, or re-read the judgment and save the right passage.",
          });
      }
    }
  });

  if (input.sources.length === 0) notRun.push({ check: "Page references name a recorded page", reason: "The matter holds no source with pages." });
  const score = checked === 0 ? 1 : grounded / checked;
  return { checked, grounded, score, items, notRun: dedupeNotRun(notRun) };
}

function dedupeNotRun(notRun: Array<{ check: string; reason: string }>): Array<{ check: string; reason: string }> {
  const seen = new Set<string>();
  const out: Array<{ check: string; reason: string }> = [];
  for (const n of notRun) {
    const key = `${n.check} — ${n.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.slice(0, 20);
}
