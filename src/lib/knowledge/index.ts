/**
 * G6, G7, J1: one retrieval function over every kind of knowledge. An adapter serves one scope
 * (statutes, procedure, research, the matter, the firm library, advocate memory, the session).
 * Each adapter runs its own retrievers (full text, exact lookup, graph walk, vectors) and gives
 * ranked lists. The lists are joined by reciprocal rank fusion; policy then orders the result.
 * The scope is checked before any search: a matter adapter is bound to one matter, and the
 * function refuses a scope it was not given. What was not searched is always reported.
 * No store is written here. Plain library (decision 6).
 */
import type { KnowledgeHit, KnowledgeScope, RetrievalResult, SearchMode } from "../../shared/law.ts";
import { findCitations, findProvisions } from "../legal-corpus/index.ts";

// ---- the query ----

export interface ParsedQuery {
  raw: string;
  mode: SearchMode;
  /** The FTS5 expression for full-text retrievers; "" when the mode has none. */
  fts: string;
  phrase: boolean;
  citations: string[];
  provisions: Array<{ kind: string; number: string; act: string }>;
  /** The governing date, for historical law. */
  date: string | null;
  court: string | null;
}

const term = (w: string) => `"${w.replace(/"/g, "")}"`;
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1);

const STOP = new Set("the a an of to and or in on for with by at from is are was were be this that it its as into about what which who whom whose when where why how does do can whether under any".split(" "));

/**
 * A Boolean query as FTS5: AND, OR, NOT and brackets are kept; "quoted words" stay a phrase;
 * every other word is quoted, so punctuation never breaks the query.
 */
export function booleanFts(q: string): string {
  const out: string[] = [];
  const re = /"([^"]+)"|\(|\)|\b(AND|OR|NOT|NEAR)\b|([^\s()"]+)/g;
  for (let m = re.exec(q); m; m = re.exec(q)) {
    if (m[1]) {
      const w = wordsOf(m[1]);
      if (w.length) out.push(`"${w.join(" ")}"`);
    } else if (m[0] === "(" || m[0] === ")") out.push(m[0]);
    else if (m[2]) out.push(m[2] === "NEAR" ? "AND" : m[2]);
    else {
      const w = wordsOf(m[3]);
      if (w.length) out.push(w.map(term).join(" "));
    }
  }
  // An operator with no operand is dropped, so the expression always parses.
  const clean: string[] = [];
  for (const t of out) {
    const op = /^(AND|OR|NOT)$/.test(t);
    const prev = clean[clean.length - 1];
    if (op && (!prev || /^(AND|OR|NOT|\()$/.test(prev))) {
      if (t === "NOT" && prev && prev !== "(" && prev !== "NOT") clean.push(t);
      continue;
    }
    clean.push(t);
  }
  while (clean.length && /^(AND|OR|NOT)$/.test(clean[clean.length - 1])) clean.pop();
  let depth = 0;
  const balanced = clean.filter((t) => {
    if (t === "(") depth++;
    if (t === ")") {
      if (depth === 0) return false;
      depth--;
    }
    return true;
  });
  return balanced.join(" ") + ")".repeat(depth);
}

export function parseQuery(raw: string, mode: SearchMode = "natural", opts: { date?: string | null; court?: string | null } = {}): ParsedQuery {
  const text = raw.trim();
  const citations = findCitations(text).map((c) => c.citation);
  const provisions = findProvisions(text).map((p) => ({ kind: p.kind, number: p.number, act: p.act }));
  const all = wordsOf(text);
  const content = all.filter((w) => !STOP.has(w));
  let fts = "";
  let phrase = false;
  if (mode === "phrase") {
    phrase = true;
    fts = all.length ? `"${all.join(" ")}"` : "";
  } else if (mode === "boolean") fts = booleanFts(text);
  else if (mode === "citation") fts = "";
  else {
    // Natural language: every content word as a prefix, any of them; BM25 ranks the ones with more.
    const w = content.length ? content : all;
    fts = w.map((x) => `${term(x)}*`).join(" OR ");
  }
  return { raw: text, mode, fts, phrase, citations, provisions, date: opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : null, court: opts.court ?? null };
}

// ---- fusion ----

export interface RankedList {
  /** "text", "exact", "graph" or "vector". */
  retriever: string;
  hits: KnowledgeHit[];
  /** Exact lookups count for more than a ranked guess. */
  weight?: number;
}

/**
 * Reciprocal rank fusion: a hit's score is the sum over the lists of weight / (k + rank). A hit
 * found by two retrievers outranks a hit found by one. Scores of different engines are never
 * compared; only ranks are.
 */
export function fuse(lists: RankedList[], k = 60): KnowledgeHit[] {
  const byId = new Map<string, KnowledgeHit>();
  for (const list of lists) {
    list.hits.forEach((h, i) => {
      const key = `${h.scope}|${h.id}`;
      const add = (list.weight ?? 1) / (k + i + 1);
      const have = byId.get(key);
      if (have) {
        have.score += add;
        if (!have.why.includes(list.retriever)) have.why.push(list.retriever);
      } else byId.set(key, { ...h, score: add, why: [list.retriever] });
    });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * Policy after fusion (architecture section 5, step 3). For a question of law, a higher court
 * and a verified, fresh row come first among hits of similar relevance. A stale row is kept and
 * marked; it is never hidden. The order inside one authority level stays the fused order.
 */
export function applyPolicy(hits: KnowledgeHit[], question: "law" | "fact" | "any" = "any"): KnowledgeHit[] {
  if (hits.length === 0) return hits;
  const top = hits[0].score;
  const band = (h: KnowledgeHit) => (h.score >= top * 0.6 ? 0 : h.score >= top * 0.3 ? 1 : 2);
  // A provision or citation the query names exactly is the answer, not a candidate for a
  // higher court to displace. Exact lookups lead their band; policy orders the rest.
  const exactRank = (h: KnowledgeHit) => (h.why.includes("exact") ? 0 : 1);
  const lawRank = (h: KnowledgeHit) => (question === "law" ? -h.authority : 0);
  const factRank = (h: KnowledgeHit) => (question === "fact" ? (h.verification === "confirmed" ? 0 : 1) : 0);
  return hits
    .map((h, i) => ({ h, i }))
    .sort((a, b) => exactRank(a.h) - exactRank(b.h) || band(a.h) - band(b.h) || lawRank(a.h) - lawRank(b.h) || factRank(a.h) - factRank(b.h) || Number(a.h.stale) - Number(b.h.stale) || a.i - b.i)
    .map((x) => x.h);
}

// ---- vectors ----

export interface Embedder {
  model: string;
  dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export function normalise(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
  return out;
}

/**
 * An exact nearest-neighbour index in memory: one flat Float32 array, cosine by dot product of
 * unit vectors. Measured at 7.5 ms per query for 20,000 vectors of 384 dimensions
 * (spikes/vector-index). It is rebuilt from the stored rows; it owns nothing.
 */
export class VectorIndex {
  readonly dim: number;
  private ids: string[] = [];
  private flat: Float32Array;
  private n = 0;

  constructor(dim: number, rows: Array<{ id: string; v: Float32Array }> = []) {
    this.dim = dim;
    this.flat = new Float32Array(Math.max(rows.length, 16) * dim);
    for (const r of rows) this.add(r.id, r.v);
  }

  get size(): number {
    return this.n;
  }

  add(id: string, v: Float32Array): void {
    if (v.length !== this.dim) throw new Error(`VECTOR_DIM: expected ${this.dim}, got ${v.length}`);
    if ((this.n + 1) * this.dim > this.flat.length) {
      const bigger = new Float32Array(this.flat.length * 2);
      bigger.set(this.flat);
      this.flat = bigger;
    }
    this.flat.set(normalise(v), this.n * this.dim);
    this.ids.push(id);
    this.n++;
  }

  search(query: Float32Array, k = 10, allow?: (id: string) => boolean): Array<{ id: string; score: number }> {
    if (query.length !== this.dim) throw new Error(`VECTOR_DIM: expected ${this.dim}, got ${query.length}`);
    const q = normalise(query);
    const { dim, flat, n } = this;
    const best: Array<{ id: string; score: number }> = [];
    let floor = -Infinity;
    for (let i = 0; i < n; i++) {
      let s = 0;
      const o = i * dim;
      for (let j = 0; j < dim; j++) s += flat[o + j] * q[j];
      if (best.length < k || s > floor) {
        if (allow && !allow(this.ids[i])) continue;
        best.push({ id: this.ids[i], score: s });
        best.sort((a, b) => b.score - a.score);
        if (best.length > k) best.length = k;
        floor = best.length === k ? best[k - 1].score : -Infinity;
      }
    }
    return best;
  }
}

// ---- adapters and the one function ----

export interface AdapterContext {
  limit: number;
  /** The query's vector, when an embedder is installed. */
  vector: Float32Array | null;
}

export interface KnowledgeAdapter {
  scope: KnowledgeScope;
  /** Why this scope cannot be searched now, or null when it can. */
  unavailable(): string | null;
  search(q: ParsedQuery, ctx: AdapterContext): Promise<RankedList[]> | RankedList[];
  /** Run after fusion on the hits that will be returned (verification at the time of use). */
  finish?(hits: KnowledgeHit[]): Promise<void>;
}

export interface RetrieveOptions {
  mode?: SearchMode;
  scopes?: KnowledgeScope[];
  limit?: number;
  date?: string | null;
  court?: string | null;
  question?: "law" | "fact" | "any";
  embedder?: Embedder | null;
}

/** The scopes a mode searches when the caller names none. */
export const MODE_SCOPES: Record<SearchMode, KnowledgeScope[]> = {
  natural: ["statute", "procedure", "research", "matter", "firm", "advocate"],
  phrase: ["statute", "procedure", "research", "matter", "firm"],
  boolean: ["statute", "procedure", "research", "matter", "firm"],
  citation: ["research"],
  party: ["research", "matter"],
  judge: ["research"],
  court: ["research", "procedure"],
  statute: ["statute", "procedure", "research"],
  paragraph: ["research"],
  proposition: ["research", "firm"],
  fact_pattern: ["research", "matter"],
  connected: ["research"],
  historical: ["statute", "research"],
  cross_jurisdiction: ["research", "statute"],
};

export async function retrieve(adapters: KnowledgeAdapter[], query: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
  const started = Date.now();
  const mode = opts.mode ?? "natural";
  const q = parseQuery(query, mode, { date: opts.date, court: opts.court });
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const want = opts.scopes?.length ? opts.scopes : MODE_SCOPES[mode];
  const notSearched: RetrievalResult["notSearched"] = [];
  let vector: Float32Array | null = null;
  if (opts.embedder && q.raw && mode !== "citation" && mode !== "phrase" && mode !== "boolean") {
    try {
      vector = (await opts.embedder.embed([q.raw]))[0] ?? null;
    } catch {
      vector = null;
    }
  }
  const lists: RankedList[] = [];
  const used: KnowledgeAdapter[] = [];
  for (const scope of want) {
    const adapter = adapters.find((a) => a.scope === scope);
    if (!adapter) {
      notSearched.push({ scope, reason: "No source is connected for this scope." });
      continue;
    }
    const why = adapter.unavailable();
    if (why) {
      notSearched.push({ scope, reason: why });
      continue;
    }
    try {
      lists.push(...(await adapter.search(q, { limit: limit * 3, vector })));
      used.push(adapter);
    } catch (e) {
      notSearched.push({ scope, reason: (e as Error).message.slice(0, 200) });
    }
  }
  const question = opts.question ?? (mode === "fact_pattern" || mode === "party" ? "fact" : mode === "natural" ? "any" : "law");
  const hits = applyPolicy(fuse(lists), question).slice(0, limit);
  for (const a of used) if (a.finish) await a.finish(hits.filter((h) => h.scope === a.scope));
  return { query: q.raw, mode, hits, notSearched, vectors: vector ? "on" : "off", ms: Date.now() - started };
}
