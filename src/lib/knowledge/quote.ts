/**
 * RAG-0: the deterministic quote gate. It says whether an exact quote is present in one source
 * text, and where. It does not decide whether the quote supports the proposition, and it does
 * not prove that the source is the latest law. No model runs here. Plain library (decision 6;
 * TypeScript only, RAG-26).
 */
import { createHash } from "node:crypto";
import type { QuoteCheck } from "../../shared/law.ts";

/** A quote shorter than this is too easy to match by accident, so it is not evidence. */
export const QUOTE_MIN_CHARACTERS = 12;

export interface QuoteLocation {
  /** 0-based offset of the first character in the source. */
  start: number;
  /** 0-based end offset, exclusive. */
  end: number;
}

/**
 * Collapse every whitespace run to one space and drop the ends. `at` maps each character of the
 * result back to its offset in the original text, so a hit can be reported against the source.
 */
function collapse(text: string): { text: string; at: number[] } {
  const out: string[] = [];
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (/\s/.test(character)) {
      space = out.length > 0;
      continue;
    }
    if (space) {
      out.push(" ");
      at.push(i);
      space = false;
    }
    out.push(character);
    at.push(i);
  }
  return { text: out.join(""), at };
}

export function normaliseQuote(quote: string): string {
  return collapse(quote).text;
}

/** The SHA-256 of the whitespace-normalised quote, so a reformat does not change the identity. */
export function quoteHash(quote: string): string {
  return createHash("sha256").update(normaliseQuote(quote)).digest("hex");
}

/**
 * Locate a quote in a source. The comparison is case-sensitive and whitespace-tolerant: a line
 * break, a tab or a run of spaces in the source matches one space in the quote. It returns the
 * first occurrence, or null when the quote is absent or too short to be evidence.
 */
export function locateQuote(quote: string, source: string): QuoteLocation | null {
  const wanted = normaliseQuote(quote);
  if (wanted.length < QUOTE_MIN_CHARACTERS) return null;
  const { text, at } = collapse(source);
  const index = text.indexOf(wanted);
  if (index < 0) return null;
  return { start: at[index], end: at[index + wanted.length - 1] + 1 };
}

/**
 * Verify one quote against one source text. A found quote has its offsets and a hash. A
 * fabricated quote, or one shorter than the minimum, is unverified and says why.
 */
export function verifyQuote(quote: string, source: string): QuoteCheck {
  const normalised = normaliseQuote(quote);
  const hash = quoteHash(quote);
  if (normalised.length < QUOTE_MIN_CHARACTERS) {
    return { quote, quoteHash: hash, start: null, end: null, verified: false, detail: `A quote needs at least ${QUOTE_MIN_CHARACTERS} characters. This one has ${normalised.length}.` };
  }
  const location = locateQuote(quote, source);
  if (!location) return { quote, quoteHash: hash, start: null, end: null, verified: false, detail: "The quote is not present in the source at this anchor." };
  return { quote, quoteHash: hash, ...location, verified: true, detail: `The quote is present at offset ${location.start}.` };
}
