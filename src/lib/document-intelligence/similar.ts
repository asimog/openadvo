/**
 * V2-3: same text, different files (duplication kind 3). Compares the word sequences of five
 * words of two texts. Suggests only; nothing is merged. Plain library. Spec: docs/specs/v2.md.
 */

export const SHINGLE = 5;
export const MIN_WORDS = 50;
export const DUPLICATE_THRESHOLD = 0.9;

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function shingles(ws: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= ws.length; i++) out.add(ws.slice(i, i + SHINGLE).join(" "));
  return out;
}

/**
 * The share of word sequences the two texts have in common, measured against the larger set, so
 * both texts must share it. Null when either text has fewer than MIN_WORDS words.
 */
export function overlap(a: string, b: string): number | null {
  const wa = words(a);
  const wb = words(b);
  if (wa.length < MIN_WORDS || wb.length < MIN_WORDS) return null;
  const sa = shingles(wa);
  const sb = shingles(wb);
  let common = 0;
  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  for (const s of small) if (large.has(s)) common++;
  return common / Math.max(sa.size, sb.size);
}

/** Every pair of texts (by id) whose overlap is at or above the threshold, with the overlap. */
export function possibleDuplicates(texts: Array<{ id: string; text: string }>): Array<{ a: string; b: string; overlap: number }> {
  const out: Array<{ a: string; b: string; overlap: number }> = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const o = overlap(texts[i].text, texts[j].text);
      if (o !== null && o >= DUPLICATE_THRESHOLD) out.push({ a: texts[i].id, b: texts[j].id, overlap: o });
    }
  }
  return out;
}
