/**
 * G6, G7, J1: one retrieval function over every kind of knowledge. An adapter serves one scope
 * (statutes, procedure, research, the matter, the firm library, advocate memory, the session).
 * Each adapter runs its own retrievers (full text, exact lookup, graph walk, vectors) and gives
 * ranked lists. The lists are joined by reciprocal rank fusion; policy then orders the result.
 * The scope is checked before any search: a matter adapter is bound to one matter, and the
 * function refuses a scope it was not given. What was not searched is always reported.
 * No store is written here. Plain library (decision 6).
 */
import { KNOWLEDGE_SCOPES } from "../../shared/law.ts";
import type { AdapterHealth, Coverage, KnowledgeHit, KnowledgeScope, RetrievalResult, SearchMode } from "../../shared/law.ts";
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
  /** The bound matter, when the caller is a matter session. A matter adapter must check it. */
  matterId?: string | null;
  /** The governing date, for currentness checks. */
  governingDate?: string | null;
  /** Cooperative cancellation. The orchestrator still times out an adapter that ignores it. */
  signal?: AbortSignal;
}

export interface KnowledgeAdapter {
  scope: KnowledgeScope;
  /** Why this scope cannot be searched now, or null when it can. */
  unavailable(): string | null;
  search(q: ParsedQuery, ctx: AdapterContext): Promise<RankedList[]> | RankedList[];
  /** Run after fusion on the hits that will be returned (verification at the time of use). */
  finish?(hits: KnowledgeHit[]): Promise<void>;
  /** The adapter's own state, for the Index Health view. */
  health?(): AdapterHealth;
}

export interface RetrieveOptions {
  mode?: SearchMode;
  scopes?: KnowledgeScope[];
  limit?: number;
  date?: string | null;
  court?: string | null;
  question?: "law" | "fact" | "any";
  embedder?: Embedder | null;
  /** The bound matter. A bound matter adapter refuses any other id, and a missing one. */
  matterId?: string | null;
  /** Per-adapter timeout for the search and for the finish hook. */
  timeoutMs?: number;
  /** The most adapters searched at once. */
  concurrency?: number;
  signal?: AbortSignal;
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

// ---- RAG-0: the one registry and the bounded run ----

export class KnowledgeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** One adapter per scope. A second adapter for the same scope is a configuration error. */
export class KnowledgeRegistry {
  private readonly byScope = new Map<KnowledgeScope, KnowledgeAdapter>();

  constructor(adapters: readonly KnowledgeAdapter[] = []) {
    for (const adapter of adapters) this.add(adapter);
  }

  add(adapter: KnowledgeAdapter): this {
    if (this.byScope.has(adapter.scope)) throw new KnowledgeError("DUPLICATE_SCOPE", `A ${adapter.scope} adapter is already registered.`);
    this.byScope.set(adapter.scope, adapter);
    return this;
  }

  get(scope: KnowledgeScope): KnowledgeAdapter | undefined {
    return this.byScope.get(scope);
  }

  has(scope: KnowledgeScope): boolean {
    return this.byScope.has(scope);
  }

  scopes(): KnowledgeScope[] {
    return KNOWLEDGE_SCOPES.filter((scope) => this.byScope.has(scope));
  }

  /** One health row per registered adapter, in the canonical scope order. */
  health(): AdapterHealth[] {
    return this.scopes().map((scope) => this.healthOf(scope));
  }

  healthOf(scope: KnowledgeScope): AdapterHealth {
    const adapter = this.byScope.get(scope);
    if (!adapter) return { scope, state: "deferred", detail: "No source is connected for this scope." };
    try {
      if (adapter.health) return adapter.health();
      const why = adapter.unavailable();
      return { scope, state: why ? "deferred" : "ready", detail: why ?? "The adapter is connected." };
    } catch (e) {
      return { scope, state: "error", detail: errorText(e).slice(0, 240) };
    }
  }
}

export function isKnowledgeScope(value: string): value is KnowledgeScope {
  return (KNOWLEDGE_SCOPES as readonly string[]).includes(value);
}

/** The source fields a hit must have before fusion can use it. */
function rawHitProblem(hit: unknown, expected?: KnowledgeScope): string | null {
  if (typeof hit !== "object" || hit === null) return "the hit is not an object";
  const value = hit as Partial<KnowledgeHit>;
  for (const field of ["id", "title", "text", "anchor"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim()) return `no ${field}`;
  }
  if (typeof value.scope !== "string" || !isKnowledgeScope(value.scope)) return `unknown scope ${String(value.scope)}`;
  if (expected && value.scope !== expected) return `scope ${value.scope} in a ${expected} adapter`;
  return null;
}

/** The missing or empty contract field of a hit, or null when the hit is valid. */
export function hitContractProblem(hit: KnowledgeHit): string | null {
  const problem = rawHitProblem(hit);
  if (problem) return problem;
  return Array.isArray(hit.why) && hit.why.every((why) => typeof why === "string" && why.trim()) && hit.why.length > 0 ? null : "no retriever in why";
}

export const RETRIEVAL_TIMEOUT_MS = 4_000;
export const RETRIEVAL_CONCURRENCY = 4;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Reject when the work does not settle in time. The work's own rejection is never unhandled. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      reject(new KnowledgeError("TIMEOUT", `${label} did not answer within ${ms} ms.`));
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * RAG-0: parse, check the scope, search with bounded concurrency and a per-adapter timeout,
 * fuse, apply policy, run the finish hooks, and state the coverage. A slow or failed adapter
 * never removes another adapter's hits. Nothing is written here.
 */
export async function runRetrieval(registry: KnowledgeRegistry, query: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
  const started = Date.now();
  const mode = opts.mode ?? "natural";
  const q = parseQuery(query, mode, { date: opts.date, court: opts.court });
  const requestedLimit = opts.limit ?? 20;
  const requestedTimeout = opts.timeoutMs ?? RETRIEVAL_TIMEOUT_MS;
  const requestedConcurrency = opts.concurrency ?? RETRIEVAL_CONCURRENCY;
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 20;
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(Math.max(requestedTimeout, 1), 60_000) : RETRIEVAL_TIMEOUT_MS;
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.min(Math.max(Math.trunc(requestedConcurrency), 1), 16) : RETRIEVAL_CONCURRENCY;
  const want = opts.scopes?.length ? [...new Set(opts.scopes)] : MODE_SCOPES[mode];
  for (const scope of want) if (!isKnowledgeScope(scope)) throw new KnowledgeError("UNKNOWN_SCOPE", `"${String(scope)}" is not a knowledge scope.`);

  const deferred: Coverage["deferred"] = [];
  let vector: Float32Array | null = null;
  if (opts.embedder && q.raw && mode !== "citation" && mode !== "phrase" && mode !== "boolean") {
    try {
      vector = (await opts.embedder.embed([q.raw]))[0] ?? null;
    } catch {
      vector = null;
    }
  }

  interface Task {
    scope: KnowledgeScope;
    adapter: KnowledgeAdapter;
  }
  const tasks: Task[] = [];
  const failed: Coverage["failed"] = [];
  for (const scope of want) {
    const adapter = registry.get(scope);
    if (!adapter) {
      deferred.push({ scope, reason: "No source is connected for this scope." });
      continue;
    }
    let why: string | null;
    try {
      why = adapter.unavailable();
    } catch (e) {
      failed.push({ scope, reason: `The ${scope} adapter could not report its state: ${errorText(e).slice(0, 240)}` });
      continue;
    }
    if (why) {
      deferred.push({ scope, reason: why });
      continue;
    }
    tasks.push({ scope, adapter });
  }

  const listsByScope = new Map<KnowledgeScope, RankedList[]>();
  const completed = new Set<KnowledgeScope>();
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      const task = tasks[index];
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener("abort", abort, { once: true });
      }
      try {
        const ctx: AdapterContext = { limit: limit * 3, vector, matterId: opts.matterId ?? null, governingDate: q.date, signal: controller.signal };
        const lists = await withTimeout(Promise.resolve().then(() => task.adapter.search(q, ctx)), timeoutMs, task.scope, abort);
        // An adapter's own malformed hit is rejected before fusion, so it cannot break another
        // adapter's result. The valid hits of the same adapter still take part.
        const clean: RankedList[] = [];
        const problems: string[] = [];
        for (const list of Array.isArray(lists) ? lists : []) {
          if (!list || !Array.isArray(list.hits)) {
            problems.push("a result list has no hits");
            continue;
          }
          const good = list.hits.filter((hit) => {
            const problem = rawHitProblem(hit, task.scope);
            if (problem) problems.push(problem);
            return !problem;
          });
          if (good.length > 0) clean.push({ ...list, hits: good });
        }
        if (problems.length > 0) failed.push({ scope: task.scope, reason: `The ${task.scope} adapter returned ${problems.length} invalid hit(s): ${problems[0]}.` });
        listsByScope.set(task.scope, clean);
        completed.add(task.scope);
      } catch (e) {
        failed.push({ scope: task.scope, reason: errorText(e).slice(0, 300) });
      } finally {
        opts.signal?.removeEventListener("abort", abort);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

  // Keep the caller's scope order even when the adapters finish in another order.
  const lists: RankedList[] = [];
  for (const task of tasks) lists.push(...(listsByScope.get(task.scope) ?? []));
  const searched = tasks.filter((task) => completed.has(task.scope)).map((task) => task.scope);

  const question = opts.question ?? (mode === "fact_pattern" || mode === "party" ? "fact" : mode === "natural" ? "any" : "law");
  const ranked = applyPolicy(fuse(lists), question).slice(0, limit);

  // A hit without a source and an anchor is not a knowledge hit (RAG-0, section 5.3).
  const invalid = new Map<KnowledgeScope, string[]>();
  const hits: KnowledgeHit[] = [];
  for (const hit of ranked) {
    const problem = hitContractProblem(hit);
    if (problem) {
      invalid.set(hit.scope, [...(invalid.get(hit.scope) ?? []), problem]);
      continue;
    }
    hits.push(hit);
  }
  for (const [scope, problems] of invalid) failed.push({ scope, reason: `The ${scope} adapter returned an invalid hit: ${problems[0]}.` });

  // Verification at the time of use runs after fusion, on the hits that will be returned.
  for (const task of tasks) {
    if (!task.adapter.finish) continue;
    const scoped = hits.filter((hit) => hit.scope === task.scope);
    if (scoped.length === 0) continue;
    try {
      await withTimeout(Promise.resolve().then(() => task.adapter.finish!(scoped)), timeoutMs, `${task.scope} verification`);
    } catch (e) {
      failed.push({ scope: task.scope, reason: `The ${task.scope} verification did not finish: ${errorText(e).slice(0, 240)}` });
      for (const hit of scoped) hit.stale = true;
    }
  }

  // One reason per scope, in the order the caller asked for them.
  const unique = (rows: Array<{ scope: KnowledgeScope; reason: string }>) => {
    const seen = new Map<KnowledgeScope, string>();
    for (const row of rows) if (!seen.has(row.scope)) seen.set(row.scope, row.reason);
    return [...seen].sort((a, b) => want.indexOf(a[0]) - want.indexOf(b[0])).map(([scope, reason]) => ({ scope, reason }));
  };
  const deferredRows = unique(deferred);
  const failedRows = unique(failed);
  const coverage: Coverage = { searched, deferred: deferredRows, failed: failedRows, partial: deferredRows.length > 0 || failedRows.length > 0 };
  return {
    query: q.raw,
    mode,
    hits,
    notSearched: [...deferredRows, ...failedRows.filter((row) => !searched.includes(row.scope))],
    coverage,
    vectors: vector ? "on" : "off",
    ms: Date.now() - started,
  };
}

/** The earlier call shape: one adapter list, one retrieval function. */
export async function retrieve(adapters: KnowledgeAdapter[], query: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
  return runRetrieval(new KnowledgeRegistry(adapters), query, opts);
}
