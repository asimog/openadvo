/**
 * RAG-2: the quote-first research memorandum. The agent selects exact quotes from returned
 * hits; this module verifies each quote deterministically, composes the memorandum with the
 * verified quotes and the coverage, and never lets a fabricated quote into the body.
 *
 * Plain library (decision 6). The model proposes; the verifier decides; the advocate reviews.
 */
import { citationKeyText, type Coverage, type KnowledgeHit, type QuoteCheck } from "../../shared/law.ts";

export interface VerifiedQuote {
  hitId: string;
  title: string;
  citation: string;
  quote: string;
  check: QuoteCheck;
}

export interface MemoInput {
  title: string;
  question: string;
  governingDate: string | null;
  body: string;
  quotes: VerifiedQuote[];
  adverse: VerifiedQuote[];
  coverage: string;
  openQuestions: string[];
}

function quoteLine(quote: VerifiedQuote, index: number): string {
  return `${index + 1}. “${quote.quote}” — ${quote.title}${quote.citation ? `, ${quote.citation}` : ""}. Anchor: ${quote.hitId}. SHA-256 ${quote.check.quoteHash}.`;
}

/** Compose the memorandum around the verified quotes. The analysis never replaces a quote. */
export function composeResearchMemo(input: MemoInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`, "");
  lines.push("## Question", "", input.question, "");
  lines.push("## Governing date", "", input.governingDate || "Not given. The law on a date is therefore undetermined.", "");
  lines.push("## Verified quotes", "");
  lines.push(input.quotes.length ? input.quotes.map(quoteLine).join("\n") : "No verified quote was selected. The analysis below is not a quotation of any source.", "");
  if (input.adverse.length) {
    lines.push("## Adverse authority", "");
    lines.push(input.adverse.map(quoteLine).join("\n"), "");
  }
  lines.push("## Analysis", "", input.body.trim(), "");
  lines.push("## Coverage", "", input.coverage.trim() || "The coverage was not stated. This memorandum is incomplete.", "");
  if (input.openQuestions.length) {
    lines.push("## Open questions", "");
    lines.push(input.openQuestions.map((question) => `- ${question}`).join("\n"), "");
  }
  lines.push("## Verification", "", "Each quote above was located in its source by the deterministic quote gate. A verified quote proves the words are present at the anchor; it does not prove that the passage is the holding or that the search found every adverse authority. The advocate decides every legal point.", "");
  return lines.join("\n");
}

/** A compact citation line for one hit, for the memo and the review surface. */
export function hitCitation(hit: KnowledgeHit): string {
  return hit.citationKey ? citationKeyText(hit.citationKey) : hit.anchor;
}

/**
 * The negative search. For every issue, the agent must look for the contrary treatment, not only
 * the supporting words. The queries are deliberately blunt; the advocate reviews the result.
 */
export function adverseQueries(issue: string): string[] {
  const base = issue.trim().replace(/[?.]+$/, "");
  if (!base) return [];
  return [`${base} overruled`, `${base} doubted`, `${base} distinguished`, `${base} contrary`, `${base} not followed`];
}

/** A coverage line. It names what was searched, deferred and failed. */
export function coverageText(coverage: Coverage | null): string {
  if (!coverage) return "Coverage was not recorded.";
  const parts = [
    `Searched: ${coverage.searched.join(", ") || "none"}.`,
    `Deferred: ${coverage.deferred.map((row) => `${row.scope} (${row.reason})`).join("; ") || "none"}.`,
    `Failed: ${coverage.failed.map((row) => `${row.scope} (${row.reason})`).join("; ") || "none"}.`,
    coverage.partial ? "The search is partial." : "The search is complete for the scopes named.",
  ];
  return parts.join(" ");
}
