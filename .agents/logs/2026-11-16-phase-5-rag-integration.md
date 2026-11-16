# Phase 5 RAG integration report: adapters, stores, flows

Date: 2026-11-16. Status: technical design for Phase 5. It follows the assessment in [2026-11-16-phase-5-rag-assessment.md](2026-11-16-phase-5-rag-assessment.md) and the proposed decisions in [../decisions/2026-11-16-phase-5-rag.md](../decisions/2026-11-16-phase-5-rag.md). It changes no accepted decision.

This report owns the adapter contracts, the store schemas, the retrieval flow, the quote-first flow, the Plannotator integration and the test plan. The assessment owns the why, the options and the corrections. Links, not copies.

---

## 1. Architecture at a glance

```
UI
  Research · Statute · Procedure · Matter tabs · Review Inbox · Knowledge · Index health
  Annotation side panel (plan, memo, draft, provision, paragraph)
        |
Agent tools (read-only)                         Human-only bridge functions
  search_knowledge · read_source                 approve_plan · confirm_fact
  verify_citation · start_research               confirm_citation · send_review
  propose_fact · propose_memory                  verify_source_now · export_akn
        |                                                 |
        +---------------------+---------------------------+
                              |
                    Knowledge layer
  parseQuery -> plan -> adapters -> fuse -> policy -> verify -> assemble
                              |
  +-----------+-----------+-----------+-----------+-----------+-----------+
  | statute   | procedure | research  | matter    | firm      | advocate  | session
  | adapter   | adapter   | adapter   | adapter   | adapter   | adapter   | adapter
  +-----------+-----------+-----------+-----------+-----------+-----------+
        |           |           |           |           |           |
     corpus.db   corpus.db   corpus.db   matter.db   advocate.db  advocate.db  JSONL
     intel.db
                              |
                    Derived indexes
  FTS5 · vectors (optional) · edge tables · analytics views
```

Rules:

- One writer per store. Adapters read through the store's port. They never write SQL.
- The scope is checked before any search, not after.
- Every hit carries provenance, an anchor, a date, a verification state and a citation key.
- Derived indexes own nothing. A rebuild recreates them from the canonical rows.

---

## 2. File and store layout

```
<userData>/
  advocate.db                  # firm: profile, preferences, memory, library, firm index, firm agent log
  corpus.db                    # law: Acts, rules, judgments, paragraphs, edges, propositions, vectors
  intel.db                     # courts, packs, sources, applicability
  blobs/                       # firm library files by SHA-256
  library/                     # human-readable library tree (optional mirror)
  sessions/firm/<session>/     # firm agent JSONL segments
  skills/                      # the advocate's own skills
  pi-agent/                    # Pi's agent folder (decision 22)
  review/                      # exported review bundles (optional)

<Documents>/Open Advocate/Matters/<matter-id>/
  matter.db                    # append-only records, events, annotations, drafts
  blobs/<sha256>               # matter files
  sessions/<session>/<segment>.jsonl
  exports/                     # AKN, PDF, DOCX, review bundles
  archived                     # marker file (current V1-10)
```

Do not open a SQLite file from two machines over a network share. Share packages, not live files. Section 8.4 gives the package shape.

---

## 3. Ports and types

The shared types are in `src/shared/law.ts`. The port types belong in a new `src/lib/knowledge/ports.ts` (main process only). The renderer gets plain data over the preload bridge; it never imports a store.

### 3.1 The citation key

```ts
export interface CitationKey {
  instrument: string;        // "ic:<uuid>", "sc-rules-2013", "dhc-os-rules-2018"
  kind: "section" | "article" | "rule" | "order" | "schedule" | "regulation" | "notification" | "practice_direction";
  number: string;            // "16", "XXI", "3"
  chapter: string | null;    // "II"
  part: string | null;       // "II" for the Supreme Court Rules
  order: string | null;      // "XXI"
  sub: string | null;        // "(2)"
  clause: string | null;     // "(a)"
  proviso: string | null;    // "1"
  version: number;
}

export function citationKeyText(k: CitationKey): string;
// "Section 16(2)(a), The Indian Contract Act, 1872"
// "Order XXI Rule 1(1), Supreme Court Rules, 2013"
// "Rule 3(1), Chapter VII, Delhi High Court (Original Side) Rules, 2018"

export function citationKeyId(k: CitationKey): string;
// "ic:0e782...#section:16#sub:(2)#clause:(a)#v1"
```

### 3.2 The hit and the passage

```ts
export interface KnowledgeHit {
  id: string;                 // stable row id or "<judgment>#p<para>"
  scope: KnowledgeScope;      // advocate | firm | statute | procedure | matter | research | session
  kind: string;               // "section", "rule", "paragraph", "fact", "library_item", ...
  title: string;
  text: string;               // the exact text; never a summary
  anchor: string;             // citation key id, "<judgment>#p<n>", "<source>:p<page>:l<line>", record id
  citation: CitationKey | null;
  date: string | null;        // decision date, valid_from, event date
  authority: number;          // 3 Supreme Court, 2 High Court, 1 other, 0 not an authority
  verification: string;       // "verified", "unconfirmed: ...", "stale", "confirmed"
  stale: boolean;
  score: number;
  why: string[];              // "exact", "text", "graph", "vector", "filter"
}

export interface SourcePassage {
  hit: KnowledgeHit;
  /** The exact text, with its char offsets in the stored source. */
  text: string;
  start: number;
  end: number;
  page: number | null;
  line: number | null;
  /** The source row and the check that was made. */
  sourceRef: string;
  sourceUrl: string;
  check: "verified" | "changed" | "unreachable" | "never";
  checkedAt: string | null;
}
```

### 3.3 The adapter port

```ts
export interface KnowledgeAdapter {
  scope: KnowledgeScope;
  /** Why this scope cannot be searched now, or null. */
  unavailable(): string | null;
  /** Ranked lists from independent retrievers. */
  search(q: ParsedQuery, ctx: AdapterContext): Promise<RankedList[]>;
  /** Read one hit with its exact text and provenance. */
  read?(hit: KnowledgeHit): Promise<SourcePassage>;
  /** Check stale rows at the time of use. Returns one result per hit. */
  verify?(hits: KnowledgeHit[]): Promise<VerificationResult[]>;
}

export interface AdapterContext {
  limit: number;
  vector: Float32Array | null;
  /** The bound matter id, when the caller is a matter session. */
  matterId: string | null;
  /** The bound court and date, for procedure and historical law. */
  court: string | null;
  governingDate: string | null;
  signal: AbortSignal;
}

export interface RankedList {
  retriever: "exact" | "text" | "graph" | "vector" | "filter";
  hits: KnowledgeHit[];
  weight?: number;
}
```

### 3.4 The store ports

Adapters do not import a concrete store. They receive a narrow port. The main process builds the concrete store and passes the port.

```ts
export interface LawReadPort {
  acts(): StatuteAct[];
  act(id: string): StatuteAct | null;
  provisions(actId: string): Provision[];
  provision(id: string): Provision | null;
  versions(actId: string, number: string): Provision[];
  events(actId: string, provision?: string): StatuteEvent[];
  inForce(actId: string, number: string, date: string): InForceResult;
  searchProvisions(query: string, opts: SearchOptions): ProvisionHit[];
  findProvision(number: string, actWords: string): Provision[];
  judgment(id: string): JudgmentIdentity | null;
  paras(judgmentId: string, from?: number, to?: number): JudgmentPara[];
  searchParas(query: string, opts: SearchOptions): ParaHit[];
  byCitation(citation: string): string[];
  edges(filter: EdgeFilter): LegalEdge[];
  walk(kind: string, id: string, opts: WalkOptions): WalkStep[];
  vector(scope: string, id: string): Float32Array | null;
  verify(provisionId: string, read: SourceReader, ctx?: WriteContext): Promise<ProvisionCheck>;
}

export interface MatterReadPort {
  /** Bound to one matter at construction. It has no method to open another matter. */
  readonly matterId: string;
  find(query: string, opts: FindOptions): KnowledgeHit[];
  records(kind: string, id: string): KnowledgeHit | null;
  edges(filter: EdgeFilter): MatterEdge[];
  memory(filter: MemoryFilter): MemoryRecord[];
  facts(filter: FactFilter): FactRecord[];
  annotations(targetKind: string, targetId: string): Annotation[];
}

export interface FirmReadPort {
  library(query: string, opts: LibraryOptions): KnowledgeHit[];
  memory(filter: MemoryFilter): MemoryRecord[];
  matters(): FirmMatterRow[];
  agentLog(sessionId?: string): AgentLogEntry[];
}

export interface SessionReadPort {
  readonly sessionId: string;
  entries(fromSeq?: number, limit?: number): SessionLogEntry[];
  search(query: string): KnowledgeHit[];
}
```

`MatterReadPort` is the scope guard. A matter adapter cannot be constructed without a matter id, and it cannot open a path. The main process resolves the folder and builds the port; the adapter gets only the port.

### 3.5 The registry

```ts
export interface AdapterRegistry {
  register(adapter: KnowledgeAdapter): void;
  forScope(scope: KnowledgeScope): KnowledgeAdapter | null;
  all(): KnowledgeAdapter[];
}

export function buildRegistry(deps: {
  law: LawReadPort;
  intel: IntelReadPort;
  matter: MatterReadPort | null;
  firm: FirmReadPort;
  advocate: FirmReadPort;
  session: SessionReadPort | null;
  embedder: Embedder | null;
  vectors: VectorRegistry | null;
  verifier: SourceVerifier;
}): AdapterRegistry;
```

The registry is built once per session. It is not global. The renderer never sees it.

---

## 4. The seven adapters

### 4.1 Statute adapter (`statute`)

Source: `corpus.db`, instruments of kind `act` and `notification`.

Retrievers:

1. **Exact**: a provision the query names with its Act. Weight 3.
2. **Text**: FTS5 over `provision_part` and `provision`, with BM25 weights on number, heading, act, text.
3. **Graph**: judgments that `interprets` the provision; provisions that `amended_by` or `in_force_from`.
4. **Vector**: optional, over provision parts.

Refuses: matter facts, firm library items, judgments as if they were statutes.

Verification: stale rows are checked by `law.verify`. At most five source reads per retrieval by default; the rest are returned as `unconfirmed` with the reason. A historical query checks the governing date and returns the version in force, or `undetermined` with the basis.

Read: returns the exact provision text, the part text, the citation key, the source URL and the check state. A click opens the Statute view at the chapter and section.

### 4.2 Procedure adapter (`procedure`)

Source: `corpus.db` for the rule text; `intel.db` for applicability and pack rows.

Retrievers:

1. **Exact**: a rule the query names ("Order XXI Rule 1", "Rule 3(1) of Chapter VII").
2. **Text**: FTS5 over rules and practice directions.
3. **Filter**: court, `applies_to`, case type, date. The filter runs before ranking.
4. **Graph**: the rule that a judgment interprets; the rule that a pack item cites.

Refuses: law that does not apply to the court or the date; a rule with no `valid_from` when the date matters, unless it is marked `undetermined`.

Verification: re-download the PDF by URL, hash, compare. If the PDF is unchanged, all rows from that file are verified as a set. If it changed, parse again and diff. A changed rule is a new version.

### 4.3 Research adapter (`research`)

Source: `corpus.db`, judgments, paragraphs, citations, treatments, propositions.

Retrievers:

1. **Exact**: a citation (`2023 INSC 1043`, `(2019) 5 SCC 1`, `AIR 1973 SC 1461`). Weight 3.
2. **Text**: FTS5 over paragraphs, with the judgment identity as a filter.
3. **Graph**: `cites`, `follows`, `distinguishes`, `overrules`, `doubts`, `refers_to_larger_bench`, `affirms`, `reverses`, `modifies`, `per_incuriam`; the paragraph that states the treatment.
4. **Vector**: optional, over paragraphs.

Refuses: a paragraph without a judgment identity; a treatment edge without an evidence paragraph; a proposition without its passages.

Verification: the citation key must exist; the paragraph must exist; the quote must be in the paragraph; the treatment edge must be a candidate or confirmed; the judgment date and court must be present.

### 4.4 Matter adapter (`matter`)

Source: one `matter.db`, bound at construction.

Retrievers:

1. **Find**: the matter's FTS5 index over records and anchored passages.
2. **Filter**: record kind, issue, date, document, page, exhibit.
3. **Graph**: the evidence graph (`supports`, `contradicts`, `admits`, `denies`, `depends_on`, `relies_on`, `attacked`, `derived_from`, `proves_element`).
4. **Vector**: optional, inside the matter only.

Refuses: another matter, the firm library, public law as if it were a matter fact, an unconfirmed candidate as if it were confirmed.

Verification: the record's status (`confirmed`, `tentative`, `proposed`, `superseded`, `disputed`) and its anchor. A fact without an anchor is returned as `unconfirmed` and is not used in a filing.

### 4.5 Firm adapter (`firm`)

Source: `advocate.db`, the Knowledge Library and the firm index.

Retrievers:

1. **Text**: FTS5 over library items and their front matter.
2. **Filter**: scope (`firm`, `court`, `practice_area`), status (`draft`, `reviewed`, `approved`, `superseded`), author, date.
3. **Graph**: document links (`part_of`, `applies_to`, `cites`, `supersedes`).
4. **Vector**: optional, over library items.

Refuses: matter facts. A library item that contains a client name, a matter number or a confidential fact is rejected at write time, not at search time. The front matter has `contains_client_facts: false` as a required field, and the importer checks the text for the matter's party names.

### 4.6 Advocate adapter (`advocate`)

Source: `advocate.db`, `memory` rows of scope `advocate`.

Retrievers:

1. **Filter**: type, status, court, practice area, subject.
2. **Text**: FTS5 over the memory text.
3. **Vector**: optional, for the long tail.

Refuses: a `proposed` or `tentative` memory as if it were confirmed. The always-on block contains only confirmed preferences and court practices. The response says "confirmed", "tentative" or "proposed" on every item.

### 4.7 Session adapter (`session`)

Source: the current session JSONL, read-only.

Retrievers:

1. **Filter**: session id, segment, kind, time range.
2. **Text**: a small FTS5 index built from the log at read time, or a linear scan for one session.

Refuses: another matter's session, another advocate's session, a segment that has been compacted but not summarised (the adapter returns the summary and points to the segment).

The session adapter is for "what did we decide in this session" and for the audit. It is not a source of case facts. The matter adapter is.

---

## 5. The retrieval pipeline

One function, used by every tool and every skill:

```ts
export async function retrieve(
  registry: AdapterRegistry,
  query: string,
  opts: RetrieveOptions,
): Promise<RetrievalResult> {
  const started = Date.now();
  const mode = opts.mode ?? "natural";
  const q = parseQuery(query, mode, { date: opts.date, court: opts.court });
  const limit = clamp(opts.limit ?? 20, 1, 100);
  const want = opts.scopes?.length ? opts.scopes : MODE_SCOPES[mode];

  // 1. Scope check before any search.
  const allowed = want.filter((s) => scopeAllowed(s, opts));
  const notSearched = want.filter((s) => !allowed.includes(s))
    .map((s) => ({ scope: s, reason: scopeReason(s, opts) }));

  // 2. Plan. Each adapter decides which retrievers to run.
  const adapters = allowed.map((s) => registry.forScope(s)).filter(Boolean);

  // 3. Vector, only when a model is installed and the mode can use it.
  const vector = await embedQuery(q, opts.embedder, mode);

  // 4. Run in parallel, with a per-adapter timeout.
  const lists = [];
  for (const adapter of adapters) {
    const why = adapter.unavailable();
    if (why) { notSearched.push({ scope: adapter.scope, reason: why }); continue; }
    try {
      const out = await withTimeout(adapter.search(q, {
        limit: limit * 3, vector, matterId: opts.matterId ?? null,
        court: opts.court ?? null, governingDate: opts.date ?? null,
        signal: opts.signal,
      }), 8_000);
      lists.push(...out);
    } catch (e) {
      notSearched.push({ scope: adapter.scope, reason: short(e) });
    }
  }

  // 5. Fuse by rank, never by raw score.
  const fused = fuse(lists, 60);

  // 6. Policy: exact first, then relevance band, then authority, then freshness.
  const hits = applyPolicy(fused, opts.question ?? "any").slice(0, limit);

  // 7. Verify the rows that will be returned.
  for (const adapter of adapters) {
    const own = hits.filter((h) => h.scope === adapter.scope);
    if (adapter.verify && own.length) {
      const checks = await adapter.verify(own);
      applyChecks(own, checks);
    }
  }

  // 8. Record coverage and return.
  return { query: q.raw, mode, hits, notSearched, vectors: vector ? "on" : "off", ms: Date.now() - started };
}
```

### 5.1 Parsing

`parseQuery` returns:

```ts
interface ParsedQuery {
  raw: string;
  mode: SearchMode;
  fts: string;                 // valid FTS5
  phrase: boolean;
  citations: string[];
  provisions: FoundProvision[];
  date: string | null;
  court: string | null;
  /** The sub-provisions named: "16(2)(a)". */
  parts: string[];
}
```

The parser must never produce an invalid FTS5 expression. The current `booleanFts` drops dangling operators and balances brackets. Keep that property and test it with fuzzed input.

### 5.2 Fusion

Reciprocal rank fusion, `k = 60`:

```
score(hit) = sum over lists of weight(list) / (60 + rank(hit, list))
```

Weights: exact 3, text 1, graph 1.5, vector 1. A hit found by two retrievers outranks a hit found by one. Scores from different engines are never compared.

### 5.3 Policy

Order:

1. **Exact** hits first. A provision or citation the query names is the answer, not a candidate for a higher court to displace.
2. **Relevance band**: top score, then 60%, then 30%.
3. **Question type**: for law, higher authority first; for fact, confirmed before candidate.
4. **Freshness**: verified before stale; stale is never hidden.
5. **Fused order** inside a tie.

### 5.4 Verification at use

Each adapter's `verify` returns:

```ts
interface VerificationResult {
  id: string;
  state: "verified" | "changed" | "unreachable" | "never";
  detail: string;
  checkedAt: string;
  newVersion: number | null;
}
```

`applyChecks` sets `verification` and `stale` on the hit. It never drops a hit because it is unreachable. It marks it. The UI and the filing gate decide what to do.

### 5.5 Context assembly

`assemble` is the Phase 1 feature I1, extended:

```ts
export async function assemble(
  registry: AdapterRegistry,
  task: TaskSpec,
  opts: AssembleOptions,
): Promise<ContextPackage> {
  const result = await retrieve(registry, task.query, {
    mode: task.mode, scopes: task.scopes, date: task.date,
    court: task.court, question: task.question, limit: task.limit ?? 40,
    matterId: opts.matterId, embedder: opts.embedder, signal: opts.signal,
  });

  const selected = fitToBudget(result.hits, opts.budgetTokens, opts.policy);
  const excluded = result.hits.filter((h) => !selected.includes(h))
    .map((h) => ({ id: h.id, reason: "budget" }));

  return {
    id: randomUUID(),
    task: task.id,
    items: selected.map((h) => ({ ...h, text: compress(h.text, h.anchor, opts.level) })),
    excluded,
    notSearched: result.notSearched,
    conflicts: selected.filter((h) => h.conflict),
    tokens: countTokens(selected),
    createdAt: new Date().toISOString(),
  };
}
```

Compression keeps the anchors and both sides of a conflict. A summary never replaces a source.

### 5.6 Scale: partitions, long documents and opinions

The retrieval contract does not change with size. The index layout does.

**Partitions.** `corpus.db` has a catalog:

```sql
CREATE TABLE search_partition (
  name TEXT PRIMARY KEY,            -- "sc-2024", "dhc-2020-2024"
  court TEXT NOT NULL,
  year_from INTEGER NOT NULL,
  year_to INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  fts_table TEXT NOT NULL,          -- "judgment_para_fts_sc_2024"
  vector_scope TEXT,                -- null when vectors are off
  built_at TEXT NOT NULL,
  state TEXT NOT NULL               -- ok | empty | stale | building
) STRICT;
```

The planner:

1. Reads the query's court and date filters.
2. Selects the partitions that can match.
3. If the query has no filter, selects the most recent N partitions and records the rest in `notSearched`.
4. Runs the FTS and vector retrievers per partition in parallel.
5. Fuses the partition lists with the same RRF; the partition is not part of the rank.

A query result says: "searched 12 partitions, 2019-2026; not searched: 1990-2018". This is the coverage rule applied to scale.

**Metadata filters.** Court, date, bench, citation and case number are normal columns with indexes. They are not `UNINDEXED` FTS columns. The benchmark in the assessment shows why: a SQL filter on an `UNINDEXED` column at 1M rows takes about 1 second; a partition or an indexed metadata join is the fix.

**One text copy.** Use FTS5 external content:

```sql
CREATE VIRTUAL TABLE judgment_para_fts_sc_2024 USING fts5(
  text,
  content = 'judgment_para',
  content_rowid = 'rowid',
  tokenize = 'porter unicode61'
);
```

The `judgment_para` table is the text. The FTS table holds the index. Triggers keep them in sync. Do not copy the paragraph text into both.

**Multiple opinions.** A judgment can have a concurrence or a dissent with its own paragraph numbering. `judgment_para` gets `opinion_id` and `opinion_author`; the citation key includes the opinion: `judgment#opinion:<judge>#p<para>`. `paragraphs()` in `src/lib/legal-corpus/index.ts` must learn this before the first multi-opinion judgment is indexed.

**Long matter documents.** The matter adapter uses `document_part_set` and `document_part` (section 7.3). The FTS index is per matter, over `document_part`, with external content. The parent is the document; the child is the page/line passage. A 100-page file is 300-1,000 rows; it does not need a partition.

**Research memos.** Index the current revision only for normal search. Keep the old revisions readable and searchable with a version filter. The memo's paragraph is the unit; the heading path is metadata; the citation is checked against the law source, not the memo.

**Vectors at scale.** Build vectors per partition, not for the whole corpus at once. A partition of 50,000-100,000 paragraphs is 77-154 MB of Float32 at 384 dimensions; the flat index handles it. A 1M-paragraph partition needs usearch or LanceDB, or smaller partitions. Embedding is a batch job; the measured rate on this machine is 165-244 paragraphs/s with `bge-small-en-v1.5`.

**The graph at scale.** The edge table is not partitioned in Phase 5. It has indexes on `(from_kind, from_id, relation)` and `(to_kind, to_id, relation)`. A two-hop or three-hop query is measured before LadybugDB is considered. A closure table is added only for the hot paths.

---

## 6. The quote-first research skill

### 6.1 The state machine

```
plan -> approved -> retrieve -> select_quotes -> verify_quotes -> reason -> verify_citations -> review -> deliver
                                                                                             |
                                                                                        stopped / failed
```

| State | Who | Input | Output | Gate |
|---|---|---|---|---|
| `plan` | Planner (agent) | Question, matter, date, court | 3-8 sub-questions with modes and scopes | Advocate approves |
| `approved` | Advocate | Plan | Plan record | Human only |
| `retrieve` | Retrieval role | Sub-question | Candidates with refs `P1..Pn` | Max tool calls |
| `select_quotes` | Quote role | Candidates | JSON quotes with refs, spans, why | Schema check |
| `verify_quotes` | Server | Quotes | Located / unverified, offsets, hashes | Deterministic |
| `reason` | Reasoner | Verified quotes + citation keys | Propositions, adverse points, open questions | No new sources |
| `verify_citations` | Verifier | Propositions | `verified`, `unverified`, `contradicted`, `stale`, `out_of_scope` | Deterministic + second model |
| `review` | Advocate | Memo with badges | Accept / annotate / reject | Human |
| `deliver` | System | Approved memo | DOCX/PDF/Markdown + citations + AI-use disclosure | Human |

### 6.2 The quote schema

The quote role returns only JSON:

```json
{
  "quotes": [
    {
      "ref": "P3",
      "quote": "No person shall be deprived of his life or personal liberty except according to procedure established by law.",
      "why": "States the Article 21 guarantee.",
      "start": 0,
      "end": 108
    }
  ],
  "not_quoted": [
    { "ref": "P7", "reason": "Only repeats the submission of counsel." }
  ]
}
```

The server checks:

1. `ref` names a candidate that was actually returned in this step.
2. `quote` is at least 12 characters after whitespace normalization.
3. `quote` is located in the candidate's text, allowing whitespace differences.
4. `start`/`end`, when given, agree with the located offsets; else the server records the located offsets.
5. The quote hash is stored.

A quote that fails is kept in the result as `unverified`, with the reason. It is not silently dropped.

### 6.3 The reasoning schema

The reasoner returns propositions, each with quote refs:

```json
{
  "propositions": [
    {
      "text": "Article 21 requires a procedure established by law.",
      "quoteRefs": ["Q1", "Q4"],
      "provisionRefs": ["in:constitution#article:21"],
      "adverse": false
    }
  ],
  "adverse": [
    {
      "text": "The State argues that the procedure is prescribed by the 2024 Rules.",
      "quoteRefs": ["Q9"],
      "authorityRef": "P12"
    }
  ],
  "open": ["Whether the 2024 Rules were laid before Parliament."]
}
```

The reasoner may not introduce a source. Every proposition must cite at least one verified quote or be marked `unsupported`.

### 6.4 The citation verifier

Checks, in order:

1. **Existence**: the citation key exists in the store. If not, `unverified: no such provision`.
2. **Quote containment**: the quote is inside the cited part. If not, `contradicted: quote is from another part`.
3. **Governing date**: the provision is in force on the governing date. If not, `stale` or `out_of_scope`, with the in-force basis.
4. **Authority**: the court and bench support the label (`binding`, `persuasive`, `not_binding`). If the facts are missing, `undetermined`.
5. **Treatment**: the authority is not overruled, doubted or distinguished in a later binding decision, unless the proposition says so.
6. **Crosswalk**: when the governing date spans a repeal, the old and new provisions are both checked; the crosswalk is `confirmed` or the result says `proposed, not confirmed`.
7. **Semantic support**: a second model, from a different family when possible, reads the quote and the proposition and answers `supports`, `does_not_support` or `unclear`. This is a flag, not a certificate.

The verifier writes a `citation_check` row (append-only) with the result, the model, the prompt version and the time. A model never certifies its own quote; the deterministic checks run first, and the semantic check is separate.

### 6.5 The adverse search

For every issue, a separate step:

- Search the contrary terms and the negative treatment words.
- Search the courts that can bind or persuade.
- Search later judgments that treatment the authority.
- Return the adverse hits with the reason and the quote.
- The memo lists them even when the reasoner disagrees.

### 6.6 The step log

Every step records:

```json
{
  "step": 3,
  "role": "retrieval",
  "query": "procedure established by law Article 21",
  "mode": "statute",
  "scopes": ["statute", "research"],
  "hits": 12,
  "toolCalls": 1,
  "passages": 6,
  "quotes": 0,
  "ms": 240,
  "notSearched": [{ "scope": "matter", "reason": "the question is one of law" }]
}
```

The step log is part of the run record and the session log. It is append-only.

---

## 7. Store schemas

The DDL below is a sketch. The spec written at the start of Phase 5 owns the final DDL and the migrations. The current `LAW_SCHEMA` in `src/lib/law-store/index.ts` is the base.

### 7.1 `corpus.db`

```sql
-- An instrument: an Act, a rule set, a regulation, a notification or a practice direction.
CREATE TABLE instrument (
  id TEXT PRIMARY KEY,              -- "ic:<uuid>", "sc-rules-2013"
  kind TEXT NOT NULL,               -- act | rules | regulation | notification | practice_direction
  title TEXT NOT NULL,
  number TEXT NOT NULL,
  year TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,       -- "CENTRAL", "High Court of Delhi"
  applies_to TEXT NOT NULL,         -- "India", "District courts of Delhi"
  enacted TEXT,
  enforced TEXT,
  enforced_text TEXT NOT NULL,
  repealed INTEGER NOT NULL,
  repealed_by TEXT,
  repealed_on TEXT,
  source TEXT NOT NULL,             -- indiacode | indiacode_repealed | upload | akn | set
  source_url TEXT NOT NULL,
  source_ref TEXT NOT NULL,         -- item uuid or file sha256
  pdf_sha256 TEXT,
  text_sha256 TEXT,
  retrieved_at TEXT NOT NULL,
  checked_at TEXT,
  check_interval_days INTEGER NOT NULL
) STRICT;

-- A provision: the section, article, rule, order, schedule or regulation.
CREATE TABLE provision (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES instrument(id),
  kind TEXT NOT NULL,
  number TEXT NOT NULL,
  heading TEXT NOT NULL,
  chapter TEXT,                     -- "II"
  part TEXT,                        -- "II"
  "order" TEXT,                     -- "XXI"
  path_json TEXT NOT NULL,          -- the structured path
  citation_key TEXT NOT NULL,       -- the machine key
  text TEXT NOT NULL,
  footnotes TEXT NOT NULL,
  version INTEGER NOT NULL,
  text_hash TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL,
  ord INTEGER NOT NULL,
  under TEXT NOT NULL,
  page INTEGER,
  line INTEGER,
  source_ref TEXT NOT NULL,
  source_url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  checked_at TEXT,
  check_state TEXT NOT NULL,
  current INTEGER NOT NULL,
  UNIQUE (instrument_id, kind, number, under, version)
) STRICT;

-- A part of a provision: subsection, clause, proviso, explanation, illustration, exception.
CREATE TABLE provision_part (
  id TEXT PRIMARY KEY,              -- "<provision id>#p<ord>"
  provision_id TEXT NOT NULL REFERENCES provision(id),
  kind TEXT NOT NULL,
  num TEXT NOT NULL,
  level INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  ord INTEGER NOT NULL,
  page INTEGER,
  line INTEGER
) STRICT;

-- An amendment, commencement or repeal. The scope decides whether it applies to the whole
-- provision or only to a part.
CREATE TABLE statute_event (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  provision TEXT NOT NULL,          -- "" for the whole instrument
  kind TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'provision',  -- provision | part
  part TEXT NOT NULL DEFAULT '',
  marker INTEGER,                   -- the footnote marker, when known
  by_act TEXT NOT NULL,
  by_section TEXT NOT NULL,
  date TEXT,
  date_precision TEXT NOT NULL,
  quote TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (instrument_id, provision, kind, by_act, quote)
) STRICT;

-- A judgment and its paragraphs.
CREATE TABLE judgment_identity (
  id TEXT PRIMARY KEY,
  court TEXT NOT NULL,              -- sc | hc | nclt | ...
  court_name TEXT NOT NULL,
  title TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  citations TEXT NOT NULL,          -- JSON array
  judges TEXT NOT NULL,             -- JSON array
  bench_strength INTEGER NOT NULL,
  paragraphs INTEGER NOT NULL,
  indexed_at TEXT NOT NULL
) STRICT;

CREATE TABLE judgment_para (
  judgment_id TEXT NOT NULL REFERENCES judgment_identity(id),
  opinion_id TEXT NOT NULL DEFAULT '',   -- the judge or the opinion; '' for a single opinion
  opinion_author TEXT NOT NULL DEFAULT '',
  para INTEGER NOT NULL,
  label TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  role TEXT,
  role_status TEXT,
  PRIMARY KEY (judgment_id, opinion_id, para)
) STRICT;

-- The legal graph. One edge shape for all graphs.
CREATE TABLE legal_edge (
  id TEXT PRIMARY KEY,
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,       -- "<judgment>#p<para>"
  quote TEXT NOT NULL,
  status TEXT NOT NULL,             -- candidate | confirmed | rejected
  built_from TEXT NOT NULL,
  built_at TEXT NOT NULL,
  UNIQUE (from_kind, from_id, relation, to_kind, to_id, evidence_ref)
) STRICT;

-- A proposition and its passages.
CREATE TABLE proposition (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  provisions TEXT NOT NULL,         -- JSON array of citation keys
  status TEXT NOT NULL,             -- proposed | confirmed | superseded | rejected
  verified_on TEXT,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE proposition_passage (
  proposition_id TEXT NOT NULL REFERENCES proposition(id),
  side TEXT NOT NULL,               -- supports | adverse
  judgment_id TEXT NOT NULL,
  para INTEGER NOT NULL,
  quote TEXT NOT NULL,
  quote_hash TEXT NOT NULL,
  PRIMARY KEY (proposition_id, judgment_id, para, side)
) STRICT;

-- Vectors are derived. The text hash ties the vector to the words.
CREATE TABLE vector (
  scope TEXT NOT NULL,
  id TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  text_hash TEXT NOT NULL,
  v BLOB NOT NULL,
  PRIMARY KEY (scope, id)
) STRICT;

-- A check of a row against its source.
CREATE TABLE statute_check (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  provision_id TEXT NOT NULL,
  at TEXT NOT NULL,
  state TEXT NOT NULL,              -- verified | changed | unreachable
  detail TEXT NOT NULL,
  new_version INTEGER
) STRICT;

-- A law-only research note or annotation. No matter facts.
CREATE TABLE law_note (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,        -- provision | judgment_para | proposition
  target_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,             -- open | sent | accepted | rejected | withdrawn
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Optional second layer: an obligation or a penalty stated by a provision. It is an index over
-- the text, never a replacement. Every row needs the source quote.
CREATE TABLE legal_rule (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  provision TEXT NOT NULL,
  persona TEXT,                     -- user | operator | employer | public servant | company
  condition_text TEXT NOT NULL,
  effect_text TEXT NOT NULL,
  penalty_text TEXT,
  quote TEXT NOT NULL,              -- the exact words of the source
  quote_hash TEXT NOT NULL,
  status TEXT NOT NULL,             -- proposed | confirmed | rejected | superseded
  author TEXT NOT NULL,             -- advocate | agent | system
  source_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

Indexes: `provision(instrument_id, current, ord)`, `provision(citation_key)`, `provision_part(provision_id, ord)`, `judgment_para(judgment_id, para)`, `legal_edge(to_kind, to_id, relation)`, `legal_edge(from_kind, from_id, relation)`, `statute_event(instrument_id, provision, date)`.

### 7.2 `advocate.db`

```sql
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bar_council TEXT,
  enrolment_no_enc BLOB,           -- safeStorage, optional
  enrolment_year INTEGER,
  chamber TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE preference (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  scope TEXT NOT NULL,             -- global | court | practice_area | skill
  status TEXT NOT NULL,            -- proposed | confirmed | superseded
  applied_because TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE memory (
  memory_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  relation TEXT NOT NULL,
  object TEXT NOT NULL,
  source_id TEXT,
  matter_id TEXT,                  -- a reference only; no facts
  recorded_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  confidence REAL,
  status TEXT NOT NULL,            -- proposed | tentative | confirmed | superseded | expired | archived
  scope TEXT NOT NULL,             -- advocate | firm
  supersedes TEXT,
  applied_because TEXT
) STRICT;

CREATE TABLE library_item (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,              -- template | checklist | memo | note | commentary | precedent
  scope TEXT NOT NULL,             -- firm | court | practice_area
  court TEXT,
  practice_area TEXT,
  author TEXT NOT NULL,
  status TEXT NOT NULL,            -- draft | reviewed | approved | superseded | rejected
  contains_client_facts INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE firm_matter (
  matter_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  court TEXT NOT NULL,
  next_date TEXT,
  folder_path TEXT NOT NULL,
  status TEXT NOT NULL,            -- active | archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE firm_agent_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  session_id TEXT NOT NULL,
  segment INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  data TEXT,
  prev_hash TEXT,
  hash TEXT NOT NULL
) STRICT;
CREATE TRIGGER firm_log_no_update BEFORE UPDATE ON firm_agent_log BEGIN SELECT RAISE(ABORT, 'firm agent log is append-only'); END;
CREATE TRIGGER firm_log_no_delete BEFORE DELETE ON firm_agent_log BEGIN SELECT RAISE(ABORT, 'firm agent log is append-only'); END;

CREATE TABLE firm_edge (
  id TEXT PRIMARY KEY,
  from_kind TEXT NOT NULL, from_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  to_kind TEXT NOT NULL, to_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  built_from TEXT NOT NULL, built_at TEXT NOT NULL
) STRICT;
```

### 7.3 `matter.db` append-only

Keep the current `event` chain. Add decision tables and views:

```sql
-- A fact is written once. A correction is a new fact that supersedes it.
CREATE TABLE fact (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  anchor TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL,            -- proposed | tentative | confirmed | disputed | superseded
  supersedes TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
) STRICT;
CREATE TRIGGER fact_no_update BEFORE UPDATE ON fact BEGIN SELECT RAISE(ABORT, 'facts are append-only'); END;
CREATE TRIGGER fact_no_delete BEFORE DELETE ON fact BEGIN SELECT RAISE(ABORT, 'facts are append-only'); END;

-- A decision about a fact is a new row.
CREATE TABLE fact_decision (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id TEXT NOT NULL REFERENCES fact(id),
  decision TEXT NOT NULL,          -- confirm | reject | dispute | supersede
  actor TEXT NOT NULL CHECK (actor = 'advocate'),
  at TEXT NOT NULL,
  note TEXT
) STRICT;
CREATE TRIGGER fact_decision_no_update BEFORE UPDATE ON fact_decision BEGIN SELECT RAISE(ABORT, 'fact decisions are append-only'); END;
CREATE TRIGGER fact_decision_no_delete BEFORE DELETE ON fact_decision BEGIN SELECT RAISE(ABORT, 'fact decisions are append-only'); END;

-- The current status is a view, never the stored truth.
CREATE VIEW fact_current AS
SELECT f.*, COALESCE(
  (SELECT d.decision FROM fact_decision d WHERE d.fact_id = f.id ORDER BY d.seq DESC LIMIT 1),
  'proposed'
) AS current_status
FROM fact f;

-- A rebuilt set of document parts. The current set is a view.
CREATE TABLE document_part_set (
  set_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  built_from TEXT NOT NULL,
  built_at TEXT NOT NULL,
  rows INTEGER NOT NULL
) STRICT;

CREATE TABLE document_part (
  set_id TEXT NOT NULL REFERENCES document_part_set(set_id),
  source_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (set_id, part)
) STRICT;
CREATE VIEW document_part_current AS
SELECT p.* FROM document_part p
JOIN document_part_set s ON s.set_id = p.set_id
WHERE s.set_id = (SELECT set_id FROM document_part_set WHERE source_id = p.source_id ORDER BY built_at DESC LIMIT 1);

-- Review annotations. Status changes; rows are not deleted.
CREATE TABLE annotation (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,       -- plan | research_plan | memorandum | deliverable | draft | provision | judgment_para | matter_fact
  target_id TEXT NOT NULL,
  target_version INTEGER,
  kind TEXT NOT NULL,              -- comment | replace | delete | insert | global
  quote TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  body TEXT NOT NULL,
  in_reply_to TEXT,
  status TEXT NOT NULL,            -- open | sent | accepted | rejected | withdrawn
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
) STRICT;
CREATE TRIGGER annotation_no_delete BEFORE DELETE ON annotation BEGIN SELECT RAISE(ABORT, 'annotations are withdrawn, never deleted'); END;

-- One structured message from the review surface to the agent.
CREATE TABLE review_message (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_version INTEGER,
  payload TEXT NOT NULL,           -- JSON
  status TEXT NOT NULL,            -- queued | delivered | answered
  created_at TEXT NOT NULL,
  delivered_at TEXT
) STRICT;
CREATE TRIGGER review_message_no_update BEFORE UPDATE ON review_message BEGIN SELECT RAISE(ABORT, 'review messages are append-only'); END;
```

The migration is staged:

1. Add the new decision tables and views. Write to both old and new.
2. Switch reads to the views. Test every view against the old rows.
3. Add the no-update/no-delete triggers to the record tables.
4. Remove the old `DELETE` and `UPDATE` statements one table at a time.
5. Keep a backup of `matter.db` before each step.

### 7.4 `intel.db`

Keep the current `source`, `doc`, `pack_list`, `pack_item`, `bench`, `proceeding` tables. Add:

```sql
CREATE TABLE rule_applicability (
  id TEXT PRIMARY KEY,
  provision_id TEXT NOT NULL,      -- the rule in corpus.db
  court TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  case_type TEXT,
  stage TEXT,
  party TEXT,
  document_kind TEXT,
  condition_json TEXT,
  valid_from TEXT,
  valid_until TEXT,
  source_id TEXT NOT NULL,
  reliability TEXT NOT NULL
) STRICT;
```

The procedure adapter joins `rule_applicability` to the rule text in `corpus.db`. The text is not copied.

### 7.5 Session log JSONL

```json
{"seq":1,"at":"2026-11-16T10:00:00Z","session":"matter-123/s1","segment":1,"kind":"segment_start","data":{"matter":"123","actor":"advocate"},"prev_hash":null,"hash":"..."}
{"seq":2,"at":"2026-11-16T10:00:05Z","session":"matter-123/s1","segment":1,"kind":"user","data":{"text":"Find the provision in force on 1 June 2024."},"prev_hash":"...","hash":"..."}
{"seq":3,"at":"2026-11-16T10:00:06Z","session":"matter-123/s1","segment":1,"kind":"tool_call","data":{"tool":"search_knowledge","args":{"query":"..."}},"prev_hash":"...","hash":"..."}
{"seq":4,"at":"2026-11-16T10:01:00Z","session":"matter-123/s1","segment":1,"kind":"compaction","data":{"summary":"...","tokens":12000,"reason":"context limit"},"prev_hash":"...","hash":"..."}
{"seq":1,"at":"2026-11-16T10:01:01Z","session":"matter-123/s1","segment":2,"kind":"segment_start","data":{"resumes_from":"..."},"prev_hash":"...","hash":"..."}
```

The hash chain is per segment and continues through `resumes_from`. A verifier can check each segment and the link between them.

---

## 8. The LegalDocML / Akoma Ntoso adapter

### 8.1 Export

`toAkn(act, provisions, events, generatedAt)`:

- Work URI: `/akn/in/act/<year>/<number>` or `/akn/in-<state>/act/...`.
- Expression URI: `<work>/eng@<retrievedAt>`.
- Manifestation URI: `<expression>.xml`.
- `eId`: `sec_16`, `sec_16__subsec_2`, `sec_16__subsec_2__para_a`.
- Body: `section`, `subsection`, `paragraph`, `subparagraph`, `hcontainer`, `num`, `heading`, `content`, `intro`, `wrapUp`.
- Lifecycle: `eventRef` for enactment, commencement, amendment, repeal.
- Notes: the source footnotes.
- Provenance: `oa:instrument` and one `oa:provision` per provision with `sourceRef`, `sourceUrl`, `sha256` and `<oa:text>`.

### 8.2 Import

`parseAkn(xml)`:

- Require `<akomaNtoso>`.
- Read FRBR Work, Expression, Manifestation.
- Read `oa:instrument` and `oa:provision`.
- For our own XML, use `<oa:text>` as the canonical text and check its hash.
- For third-party XML, read the body and mark `hashMatches: null` unless the publisher gives a hash.
- Never use regular expressions as the only parser for arbitrary XML. Use a real XML parser (`fast-xml-parser` or `sax`) for import. The current regex reader is acceptable for our generated XML; label it as such.

### 8.3 Validation

- At build time, validate a sample of exports against the OASIS Akoma Ntoso 3.0 schema.
- At runtime, check well-formedness and the provenance block. Do not ship a full XSD validator unless a measured need appears.
- A failed validation is a build error, not a warning.

### 8.4 Static set package

```
package/
  manifest.json
  akn/<instrument>.xml
  rows/<instrument>.jsonl
  pdf/<instrument>.pdf
```

`manifest.json` lists the set id, the build time, the instruments, the counts, the PDF SHA-256 and the text SHA-256. The recipient imports into `corpus.db`, verifies the hashes, and records the set id. A later package is a new set.

---

## 9. India Code and PDF adapters

### 9.1 Central Acts

```
findCentralAct(title):
  search dc.title:"<title>"
  keep collection=ACT and state_name=CENTRAL
  return the item

fetchAct(uuid):
  item = GET /core/items/<uuid>
  act = actOf(item)
  for page in 0..totalPages:
    GET /discover/search/objects?query=dc.identifier.act_id:"<act_id>"&dsoType=ITEM&size=100&page=n
    for each item: provisionOf(act.sourceRef, item)
  sort by order_number, then number
  return act + provisions + files
```

### 9.2 Repealed Acts

```
findRepealedAct(titleStart):
  central = GET /core/communities/search/top -> "CENTRAL"
  repeal = GET /core/communities/<central>/collections -> "Repeal Acts"
  GET /discover/search/objects?scope=<repeal>&query=dc.title:"<titleStart>"&size=50
  match the title key

fetchRepealedAct(uuid):
  item = GET /core/items/<uuid>
  files = GET /core/items/<uuid>/bundles?embed=bitstreams
  pdf = ORIGINAL
  text = TEXT
  rows = parseActPdf(pdf, text)
  return instrument + rows
```

The parser:

- Read the "ARRANGEMENT OF SECTIONS" for chapters and section numbers.
- Find the body. Split at `^\s*(\d{1,4}[A-Z]?)\.\s` at the start of a line, with the section heading.
- Keep sub-sections, clauses, provisos, explanations and illustrations as parts.
- Use the TEXT extract as a hint; where the PDF text layer is poor, OCR the page and record the engine and confidence.
- Keep the page and line for every row.
- If a section is missing or the numbering jumps, emit a `parse_issue` and keep going.

### 9.3 Court rules PDFs

```
fetchRulesPdf(url, instrument):
  bytes = GET url
  sha256 = hash(bytes)
  pages = pdfjs text layer, or OCR
  lines = page/line/text
  toc = parseToc(lines)                 # Index / Contents / Arrangement
  rules = parseRules(lines, toc)
  return instrument + rules + parseIssues
```

`parseRules` already handles chapters and rule numbers. Extend it for:

- `Part` before `Chapter`/`Order` (Supreme Court Rules).
- `Order` as a level (Supreme Court Rules).
- Sub-rules `(1)`, `(2)` and clauses `(a)`, `(b)`.
- Schedules and forms as their own provisions.
- The "Index" and the body disagreeing: the body wins; the index is a map.

### 9.4 Verification

```
verifyProvision(row):
  if source is indiacode section:
    item = GET /core/items/<sourceRef>
    next = provisionOf(row.instrumentId, item)
    compare textHash(next.text) with row.textHash
  if source is indiacode PDF:
    bytes = GET /core/bitstreams/<bitstreamRef>/content
    compare sha256(bytes) with row.pdfSha256
    if changed: parse again, diff by citation key
  if source is a rules PDF:
    bytes = GET row.sourceUrl
    compare sha256(bytes) with row.pdfSha256
    if changed: parse again, diff by citation key
  if unreachable: state = unreachable
```

The result is stored in `statute_check` and on the row. The UI shows it. The filing gate blocks `unreachable` and `changed` until the advocate reviews the change.

---

## 10. Plannotator integration

### 10.1 What Plannotator does that we need

- Select text in a plan or a document.
- Add a comment, a replacement, a deletion, an insertion or a global note.
- Thread replies.
- Send the structured feedback to the agent as one message.
- Keep the review in a local file.

What we do not need: the browser server, the Pi extension, the terminal assumptions, the 53 MB package.

### 10.2 The data model

Use `annotation` (section 7.3). Fields:

| Field | Meaning |
|---|---|
| `target_kind` | `plan`, `research_plan`, `memorandum`, `deliverable`, `draft`, `provision`, `judgment_para`, `matter_fact` |
| `target_id` | The plan id, memo id, draft revision id, citation key, `judgment#p<n>`, fact id |
| `target_version` | The version the annotation was made on |
| `kind` | `comment`, `replace`, `delete`, `insert`, `global` |
| `quote` | The selected words, copied from the target |
| `start_offset`, `end_offset` | The span in the target text, when known |
| `body` | The comment or the replacement text |
| `in_reply_to` | The parent annotation, for threads |
| `status` | `open`, `sent`, `accepted`, `rejected`, `withdrawn` |
| `author` | `advocate` or `agent` |
| `created_at`, `sent_at` | Timestamps |

### 10.3 Anchoring

1. Store the quote and the offsets.
2. On open, if the target version is the same, use the offsets.
3. If the target changed, search for the quote in the new text. If it is found exactly once, re-anchor and mark `moved`.
4. If it is found more than once, ask the advocate to choose.
5. If it is not found, keep the annotation as `orphaned` and show the old quote. Do not delete it.

### 10.4 Threading

Use the Plannotator rule: an annotation is a reply only when `in_reply_to` names a different annotation in the same target and the chain does not cycle. A cycle member is a root. No annotation is dropped. The algorithm is linear and is already documented in `packages/core/annotation-threads.ts`.

### 10.5 The message to the agent

```json
{
  "type": "review_feedback",
  "target": { "kind": "research_plan", "id": "rp_123", "version": 3 },
  "summary": "The plan is too broad. Drop the tribunal question and add the Article 21 line.",
  "annotations": [
    {
      "id": "a1",
      "kind": "replace",
      "quote": "Search all tribunals for the same limitation rule.",
      "body": "Drop this. The matter is in the Delhi High Court."
    },
    {
      "id": "a2",
      "kind": "comment",
      "quote": "Step 4: find the adverse authority.",
      "body": "Add the 2024 judgment that doubted the 2019 decision."
    }
  ],
  "instructions": "Revise the plan. Do not start the run until I approve."
}
```

The message is stored in `review_message` and in the session log. The agent's next turn includes it. The agent must not act on a target version that has changed; it re-anchors and asks if needed.

### 10.6 Where annotations live

- `plan`, `research_plan`, `memorandum`, `deliverable`, `draft`, `matter_fact`: `matter.db`, in the matter.
- `provision`, `judgment_para`, `proposition`: `corpus.db` as `law_note`, shared, no matter facts.
- Firm library items: `advocate.db`, firm scope, no matter facts.

### 10.7 The flow

```
Advocate opens a plan or a memo
  -> selects text
  -> adds a comment / replacement / deletion / insertion / global note
  -> the annotation is saved with the target version
  -> "Send to agent"
  -> review_message is written; the session log records it
  -> the agent's next turn includes the message
  -> the agent revises and returns a new version
  -> the annotation is marked sent; the advocate accepts or rejects
  -> the accepted version is the one that can be approved
```

### 10.8 The review gate

- A research plan must be approved before a long run. The plan card has "Approve", "Annotate", "Reject".
- A research memorandum must be reviewed before it can be exported as a deliverable. The review card shows the quote verification badges and the coverage.
- A draft must be reviewed before it can enter a filing set (Phase 6).
- The gate is a human-only bridge function. The agent cannot approve its own plan or memo.

---

## 11. Agent tools and bridge functions

### 11.1 Agent tools (read or propose)

| Tool | Input | Output | Notes |
|---|---|---|---|
| `search_knowledge` | query, mode, scopes, date, court, limit | `RetrievalResult` | The only search entry point |
| `read_source` | hit id or citation key | `SourcePassage` | Exact text, offsets, provenance |
| `verify_citation` | citation key, quote, date | `VerificationResult` | Deterministic checks; writes a check row |
| `start_research` | question, date, court | `ResearchPlan` | Proposes a plan; the advocate approves |
| `run_research_step` | plan id, step n | step result | Bounded by the plan |
| `propose_fact` | text, anchor, source | proposal id | The advocate confirms |
| `propose_memory` | type, subject, relation, object, basis | proposal id | The advocate confirms |
| `add_note` | target, quote, body | note id | The agent's own note; visible |
| `ask_advocate` | question, options | answer | Human input; never blocks forever |
| `read_matter_posture` | none | stage, next date, issues, open items | Rebuilt from `matter.db` |

### 11.2 Bridge functions (human only)

| Function | Effect |
|---|---|
| `approve_plan(planId)` | Moves a research plan to `approved` |
| `confirm_fact(factId)` | Adds a `fact_decision` row |
| `confirm_citation(citationKey, quote)` | Adds an attestation row (ruling R-1) |
| `send_review(messageId)` | Delivers the annotation message to the agent |
| `verify_source_now(provisionId)` | Runs the check and shows the result |
| `export_akn(instrumentId)` | Writes the AKN file and the manifest |
| `rebuild_index(name)` | Rebuilds FTS, vectors or the graph |
| `set_matter_scope(matterId)` | Binds the session to one matter |

The bridge functions are named functions on the preload bridge. They are never agent tools (decision 5).

---

## 12. UI surfaces

### 12.1 Research

- Query bar with modes: natural, phrase, boolean, citation, party, judge, court, statute, paragraph, proposition, fact pattern, connected, historical, cross-jurisdiction.
- Filters: court, date, bench, treatment, scope.
- Result rows: title, citation, court, date, paragraph, snippet, badges (`exact`, `text`, `graph`, `vector`), verification (`verified`, `unconfirmed`, `stale`), "Open source", "Quote", "Add note".
- Coverage line: what was not searched and why.
- The memo panel: propositions, quotes, adverse authority, open questions, coverage, verification counts.

### 12.2 Statute

- Act list with search and "Add from India Code".
- Chapter tree on the left: Part, Chapter, section.
- Provision view: text, parts, footnotes, events, versions, check state, source link, "Verify now".
- A part is selectable; the citation key is shown; "Copy citation" uses the advocate's format.
- A `changed` row shows the diff between the old and the new text.
- An `unmapped` chapter says so; it is not hidden.

### 12.3 Procedure

- Court selector, instrument selector, date.
- Part/Chapter/Order tree.
- Rule view: text, sub-rules, amendments, practice directions, applicability, source.
- "Applies to this matter" shows the evaluated conditions and the unresolved facts.

### 12.4 Review Inbox

- Plans waiting for approval.
- Annotations waiting to be sent.
- Stale sources, changed sources, unreachable sources.
- Conflicts and verification failures.
- Each item opens the target at the exact quote.

### 12.5 Index health

- Rows, last build, state (`ok`, `empty`, `stale`, `off`).
- FTS, vectors, edges, analytics.
- "Rebuild" per index.
- "Check set" per instrument set.

### 12.6 Annotation side panel

- Threads with quote, body, author, time.
- Reply, resolve, withdraw.
- "Send to agent" with a summary.
- "Open source" jumps to the provision or paragraph.
- The panel is available on plans, memos, drafts and law.

### 12.7 Errors

- No modal dialogs. Errors go to the log and to the Review Inbox.
- A failed source check is a row, not a crash.
- A failed agent run is a report card with the step and the error.

---

## 13. Tests

### 13.1 Contract tests

Every adapter test uses the same query set and asserts the same hit shape:

- `id`, `scope`, `kind`, `title`, `text`, `anchor`, `date`, `authority`, `verification`, `stale`, `why`.
- No hit without an anchor.
- No hit without a source.
- No hit from a scope the adapter was not given.
- A matter adapter refuses another matter.

### 13.2 Golden tests

- India Code Contract Act fixture: 270 items; s.28 substitution; s.19A insertion; s.99 repealed; chapter map from the PDF.
- Repealed Acts: IPC, CrPC, Evidence; section boundaries; page anchors; OCR confidence.
- Supreme Court Rules: Part II, Order XXI, Rule 1; sub-rule (1); the 2024 amendment.
- Delhi High Court: Chapter VII, Rule 3(1); the 2018 and 2025 amendments.
- Judgment: paragraphs, citations, treatment edges, `cites` vs `follows`.
- Crosswalk: IPC 420 -> BNS 318, with a score and a proposed status.

### 13.3 Property tests

- `parseAkn(toAkn(rows)).textHash == row.textHash` for every provision.
- `booleanFts` always returns a valid FTS5 expression for random punctuation.
- `VectorIndex.search` returns the same top-k as a brute-force reference.
- `fuse` is order-independent for the same lists.

### 13.4 Integration tests

- Temp SQLite for each store; one writer; the chain verifies.
- A stale row is checked; `verified`, `changed` and `unreachable` paths.
- A changed text creates a new version; the old version stays.
- A part event does not change the whole provision's status.
- A cross-matter search is refused before any query.
- A quote that is not in the source is `unverified`.
- An annotation on a changed target is re-anchored or orphaned, never deleted.
- A compaction starts a new segment; the old segment is unchanged.

### 13.5 End-to-end

Run once at the end of the phase (AGENTS.md section 8.4):

- A real matter.
- A real research question.
- A plan, approved.
- Retrieval, quotes, reasoning, verification.
- An adverse authority found.
- The provision in force on the governing date.
- A coverage statement.
- A memo the owner reviews and accepts.

### 13.6 Evaluation set

- 50 real queries from the owner's matters.
- For each: the expected provision, the expected judgment paragraph, the expected quote, the governing date.
- Metrics: recall@10, recall@50, exact citation accuracy, quote match rate, citation key validity, date correctness, stale/unconfirmed rate, p95 latency, "would I cite this".
- Store the set outside the repository if it contains client facts; use a redacted fixture in the repository.

---

## 14. Build sequence

| Step | Work | Done when |
|---|---|---|
| 1 | Write `docs/specs/law-research-authority.md`; freeze the citation key, the hit, the adapter port and the store ownership | The spec is accepted; the types compile |
| 2 | Law schema v2: instrument, provision, part, event scope, check, chapter map | The current 11 tests pass; new part/event tests pass |
| 3 | India Code central Acts adapter; 28 Acts; PDF and TEXT bundles | 28 Acts loaded; counts match the API |
| 4 | Repealed Acts adapter; IPC, CrPC, Evidence | Rows with page/line anchors; OCR confidence recorded |
| 5 | Rules PDF adapter; SC Rules 2013; DHC OS Rules 2018; DHC Volume V | Two sets parsed; page/line anchors; index vs body |
| 6 | Verification at use; set manifest; UI badges | Verified/changed/unreachable paths; set check |
| 7 | Legal corpus: judgment paragraphs, citations, treatments, edges | 100 judgments; edge precision test |
| 8 | Retrieval v1: exact, FTS, graph, filters, RRF, policy, coverage | Modes; p95; golden set |
| 9 | Quote-first research skill; plan, quote, verify, reason, adverse, memo | One real memo; adverse authority; coverage |
| 10 | Review surface and Plannotator pattern; annotations, send, audit | One plan and one memo reviewed |
| 11 | Append-only matter DB migration; firm index/log; session segments | Append-only tests; compaction test |
| 12 | Optional vectors: ONNX embedder, flat index, rebuild, benchmark | Recall@10; p95; off by default |
| 13 | Views: Research, Statute, Procedure, Review Inbox, Index health | Real use |
| 14 | E2E: one real research memorandum | Owner accepts |

Steps 3-6 can run in parallel with 7-8 after step 2. Steps 9-10 depend on 8. Step 11 can start after step 1 but should not block the research work. Step 12 is optional and last.

---

## 15. Recap

The integration is one knowledge layer: four stores, seven read-only adapters, one retrieval function, one verifier and one review surface. The statute and procedure adapters share one provision model and one citation key. The matter adapter is bound to one matter and cannot see another. The research adapter uses paragraphs and the legal graph. The firm and advocate adapters serve the library and memory, never matter facts. Retrieval is exact, full-text, graph and optional vector, fused by rank and ordered by policy. Research is quote-first, with a deterministic verifier and a review gate. Annotations live with the target and reach the agent as one structured message. The matter database and session logs become append-only through decision tables, views and new segments. Tests cover contracts, parsing, round-trips, verification, scope, quotes, append-only and one real end-to-end memo.
