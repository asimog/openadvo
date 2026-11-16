/**
 * D2: candidate links between the provisions of an earlier and a later Act (the Indian Penal
 * Code and the Bharatiya Nyaya Sanhita, and the like). A candidate is two provisions whose
 * headings and opening words share most of their words. It is a proposal with its score. The
 * advocate confirms or rejects each one; no link is shipped as law. Plain library (decision 6).
 */

export interface CrosswalkSide {
  number: string;
  heading: string;
  text: string;
}

export interface CrosswalkCandidate {
  from: string;
  to: string;
  similarity: number;
  basis: string;
}

const STOP = new Set("the a an of to and or in on for with by at from is are was be shall may any such which who whom that this as not no under section sub clause act code".split(" "));

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

/** The best candidate for each provision of `from`, when its score reaches `min`. */
export function proposeCrosswalk(from: CrosswalkSide[], to: CrosswalkSide[], min = 0.45): CrosswalkCandidate[] {
  const right = to.map((p) => ({ p, h: words(p.heading), t: words(p.text.slice(0, 600)) }));
  const out: CrosswalkCandidate[] = [];
  for (const f of from) {
    const fh = words(f.heading);
    const ft = words(f.text.slice(0, 600));
    if (fh.size === 0) continue;
    let best: { number: string; score: number; h: number; t: number } | null = null;
    for (const r of right) {
      const h = jaccard(fh, r.h);
      const t = jaccard(ft, r.t);
      // A short heading ("Cheating") shares few words with a long one; the opening text then decides.
      if (h < 0.3 && t < 0.3) continue;
      const score = 0.6 * h + 0.4 * t;
      if (!best || score > best.score) best = { number: r.p.number, score, h, t };
    }
    if (best && best.score >= min) {
      out.push({ from: f.number, to: best.number, similarity: Math.round(best.score * 100) / 100, basis: `Headings share ${Math.round(best.h * 100)}% of their words; opening text shares ${Math.round(best.t * 100)}%.` });
    }
  }
  return out;
}
