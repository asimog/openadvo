# Law, research and authority: Phase 5 RAG integration

Status: proposed spec, written 2026-11-18. It records the owner's instruction: **TypeScript only, no Rust Kernel**. It does not change an accepted decision. Only the owner accepts a decision.

This spec owns the RAG integration contract, the seven scopes, the phase split and the Phase 5 skeleton. The detailed reasoning, the option comparison and the measurements are in [../../.agents/logs/2026-11-18-rag-integration-phases.md](../../.agents/logs/2026-11-18-rag-integration-phases.md). The decision register is [../../.agents/decisions/2026-11-16-phase-5-rag.md](../../.agents/decisions/2026-11-16-phase-5-rag.md). The prior assessment is [../../.agents/logs/2026-11-16-phase-5-rag-assessment.md](../../.agents/logs/2026-11-16-phase-5-rag-assessment.md); the prior integration design is [../../.agents/logs/2026-11-16-phase-5-rag-integration.md](../../.agents/logs/2026-11-16-phase-5-rag-integration.md).

Features: D2, E1-E7, G1, G4, G6-G8, H11, J1-J6. Phase: 5, with later phases named where a scope depends on them.

## 1. Purpose

Give the advocate one reliable way to ask a legal question and get:

- the applicable statute, rule or judgment paragraph;
- the exact quote, with a stable citation and anchor;
- the version in force on the governing date;
- the later treatment and the adverse authority;
- a statement of what was searched and what was not;
- a research memorandum the advocate reviews and approves.

This is not a vector search product. It is scope-controlled, temporal, graph-assisted retrieval with quote-first verification and bounded agentic research.

## 2. The contract

The contract is TypeScript. It has no Electron import, no Pi import and no store import. It compiles in the shared and main projects (decision 6).

### 2.1 Scope

```ts
type KnowledgeScope = "advocate" | "firm" | "statute" | "procedure" | "matter" | "research" | "session";
```

One registry per session. One retrieval function. The agent sees one tool, `search_knowledge`.

### 2.2 Citation key

```ts
interface CitationKey {
  instrument: string;          // "ic:<uuid>", "sc-rules-2013", "dhc-os-rules-2018"
  kind: "section" | "article" | "rule" | "order" | "schedule" | "regulation" | "notification" | "practice_direction" | "preamble";
  number: string;
  chapter?: string | null;
  part?: string | null;
  order?: string | null;
  sub?: string | null;
  clause?: string | null;
  proviso?: string | null;
  version?: number;
}
```

Two functions:

- `citationKeyId(key)` returns a stable machine id.
- `citationKeyText(key, title?)` returns the human citation.

The key is the chunk id, the anchor and the audit key. A display string alone is not enough.

### 2.3 Hit and passage

```ts
interface KnowledgeHit {
  id: string;
  scope: KnowledgeScope;
  kind: string;
  title: string;
  text: string;                // exact text, never a summary
  anchor: string;              // citation key id, "<judgment>#opinion:<id>#p<n>", "<source>:p<page>:l<line>", record id
  date: string | null;
  authority: number;           // legacy coarse rank; new code uses authorityFacts
  verification: string;        // legacy display string; new code uses checks
  stale: boolean;
  score: number;
  why: string[];               // "exact" | "text" | "graph" | "vector" | "filter"
  citationKey?: CitationKey;
  authorityFacts?: AuthorityFacts;
  checks?: VerificationCheck[];
}

interface SourcePassage {
  hit: KnowledgeHit;
  text: string;
  start: number;
  end: number;
  page: number | null;
  line: number | null;
  sourceRef: string;
  sourceUrl: string;
  check: "never" | "verified" | "changed" | "unreachable";
  checkedAt: string | null;
}
```

A summary never replaces the source passage. A hit without an anchor is invalid.

### 2.4 Verification dimensions

Do not use one `verified` flag for the whole record. Keep seven checks:

| Dimension | Question |
|---|---|
| `source` | Is this the same official source or file that was recorded? |
| `text` | Does the extracted text still match the stored hash? |
| `currentness` | Is this the operative version for the governing date? |
| `citation` | Do the provision, judgment and paragraph exist? |
| `quote` | Is the exact quote present at the cited anchor? |
| `support` | Does the passage support the proposition, with its qualifications? |
| `treatment` | Is the decision still good law for this proposition and date? |

```ts
type VerificationState = "never" | "verified" | "changed" | "unreachable" | "not_applicable";

interface VerificationCheck {
  dimension: "source" | "text" | "currentness" | "citation" | "quote" | "support" | "treatment";
  state: VerificationState;
  detail: string;
  checkedAt: string;
  sourceRef?: string;
}
```

`summariseVerification(checks)` returns `verified`, `partial` or `unconfirmed` for code and badges. It never replaces the individual checks. `changed`, `unreachable` and `never` make the record `unconfirmed`.

A matching PDF hash proves the local file did not change. It does not prove the PDF is the latest law.

### 2.5 Authority facts

Do not reduce authority to `3 = Supreme Court`, `2 = High Court`, `1 = other`.

```ts
interface AuthorityFacts {
  court: string;
  courtName?: string | null;
  jurisdiction?: string | null;
  territory?: string | null;
  benchStrength?: number | null;
  decisionDate?: string | null;
  role?: "ratio" | "obiter" | "submission" | "lower_court" | "dissent" | "concurrence" | "facts" | "direction" | null;
  treatment?: string | null;
}
```

The binding/persuasive label is computed for the question's jurisdiction and date from these facts. If a fact is missing, the result is `undetermined`. Relevance and adverse authority are not buried by one aggregate score.

### 2.6 Coverage

Every result states:

```ts
interface Coverage {
  searched: KnowledgeScope[];
  deferred: Array<{ scope: KnowledgeScope; reason: string }>;
  failed: Array<{ scope: KnowledgeScope; reason: string }>;
  partial: boolean;
}
```

A bounded search is allowed only when it says it is partial. A court/year partition search must list the partitions searched and the partitions not searched. Absence of a result is not proof that no adverse authority exists.

### 2.7 Health

```ts
interface AdapterHealth {
  scope: KnowledgeScope;
  state: "ready" | "empty" | "deferred" | "off" | "error";
  detail: string;
  rows?: number;
  builtAt?: string | null;
}
```

The Index Health view shows this. A deferred scope says "deferred" and why. It does not show a fake empty result.

## 3. The seven adapters and their boundaries

| Adapter | Source | Retrieval | Hard boundary |
|---|---|---|---|
| `statute` | `corpus.db` | exact provision, FTS5, amendment graph, optional vector | never presents a judgment or matter fact as statutory text |
| `procedure` | rule text in `corpus.db`; applicability in `intel.db` | exact rule, FTS5, court/date/case-type filters, interpretation links | checks court, proceeding and governing date |
| `research` | `corpus.db` | exact citation, paragraph FTS5, treatment graph, optional vector | no treatment edge without its supporting paragraph |
| `matter` | one bound `matter.db` | matter FTS5, record filters, evidence graph, optional matter-local vector | cannot open or search another matter |
| `firm` | `advocate.db` | approved library text, scope/status filters, document links | rejects client facts at import and search |
| `advocate` | `advocate.db` | confirmed memory and preference filters | proposed or tentative memory is never treated as confirmed |
| `session` | current session JSONL | time/type filter, small log search | audit and prior decisions only; never case facts |

Each adapter receives a narrow read port. It does not open a path or issue unrestricted SQL.

A matter adapter is constructed bound to one `matter_id`. It has no method that can open another. The scope check runs before any search.

## 4. The phase split

Only **RAG-0** is in this step. It is the integration skeleton for Phase 5. The other phases are named so the skeleton has stable extension points; they are not built now.

| Phase | Name | When | What it delivers | Status |
|---|---|---|---|---|
| RAG-0 | Contract and skeleton | Now, Phase 5 | contract, registry, scope guard, bounded retrieval, coverage, health, statute/procedure/research/matter adapters, quote verifier, deferred placeholders, tests | **This spec** |
| RAG-1 | Law data and verification | Phase 5, after RAG-0 | The 28-instrument first wave, including repealed codes; rules PDFs, chapter maps, AKN export, verification at use, source manifests | Deferred to Phase 5 module work |
| RAG-2 | Research and quote-first | Phase 5/6 | plan, retrieve, quote, verify, reason, adverse search, memo, review | Deferred to Phase 5/6 module work |
| RAG-3 | Firm, advocate, session | Phase 10/12 | firm library, advocate memory, firm agent log, session adapter, annotations, append-only migration | Deferred until the owning phases |
| RAG-4 | Scale | After Phase 5, when measured | court/year partitions, partition catalog, external-content FTS, multi-opinion paragraphs, optional vectors/ANN | Deferred |
| RAG-5 | Review, sharing, evaluation | Phase 6/12/13 | Plannotator-style review, chamber sharing, golden set, benchmark, hardening | Deferred |

**Deferred means not in RAG-0.** RAG-0 registers `firm`, `advocate` and `session` as deferred with a reason. It does not return invented data for them.

RAG-0 does not prove the Phase 5 exit. It proves the contract, the scope guard, the coverage and the quote gate. The exit remains a real research memorandum the owner completes (RAG-20).

## 5. RAG-0: the skeleton scope

### 5.1 In scope

- The TypeScript contract in section 2.
- `KnowledgeRegistry`: one adapter per scope; duplicate scope is an error.
- `runRetrieval`: parse, scope check, bounded concurrency, per-adapter timeout, RRF, policy, finish hooks, coverage.
- `createSkeletonKnowledge`: real statute, procedure and research adapters over the existing `LawStore`; a bound matter adapter when a matter port is supplied; deferred firm, advocate and session.
- `boundMatterAdapter`: refuses another matter before calling the port.
- `deferredAdapter`: says why, returns no fake rows.
- `withHealth`: adapter health for the Index Health view.
- `verifyQuote` and `locateQuote`: whitespace-tolerant location, 12-character minimum, quote hash, offsets.
- `citationKeyId` and `citationKeyText`.
- Verification dimensions and `summariseVerification`.
- Unit tests for the contract, scope guard, timeout, coverage, citation key, quote and health.

### 5.2 Out of scope

- Ingestion of India Code, repealed codes, rules PDFs or judgments.
- Database schema migrations beyond what the current `LawStore` already has.
- Vectors, embeddings and ANN.
- Court/year partitions and large datasets.
- Firm, advocate and session stores; firm knowledge base; advocate memory.
- Append-only migration of `matter.db`; session segments.
- Plannotator-style annotation UI; plan review; memo editing.
- Akoma Ntoso import/export; static set packages.
- Full research skill (plan, reason, adverse, memo).
- The Phase 5 exit.

### 5.3 What the skeleton must not do

- It must not write to a store.
- It must not open a second matter.
- It must not present a deferred scope as searched.
- It must not use a single `verified` boolean for a record.
- It must not use a single numeric authority as the binding decision.
- It must not return a hit without a source and an anchor.
- It must not claim RAG-1 to RAG-5 are done.

## 6. Checks and acceptance

### 6.1 Contract tests

- Every hit has `id`, `scope`, `anchor`, `title`, `text`, `why`.
- A hit without an anchor is rejected.
- A duplicate adapter scope is rejected.
- A deferred scope appears in `notSearched` and `coverage.deferred`.

### 6.2 Scope tests

- A matter adapter bound to `m1` refuses `m2` before it calls the port.
- A request with no matter id is refused by a bound matter adapter.
- A hostile or malformed matter id cannot reach another store.

### 6.3 Bounded run tests

- A slow adapter times out; the fast adapter's hits survive.
- A failed adapter appears in `coverage.failed`; it does not throw the whole run.
- Concurrency stays within the configured limit.
- `partial` is true when a requested scope is deferred or failed.

### 6.4 Quote tests

- A real quote is located, with offsets and a hash.
- A whitespace-different quote is located.
- A fabricated quote is unverified.
- A quote shorter than 12 characters is not accepted as evidence.

### 6.5 Citation tests

- A section key and a rule/order key have stable ids and correct display text.
- A chapter or part is shown only when present.
- An unmapped chapter is not invented.

### 6.6 Verification tests

- All dimensions verified → `verified`.
- `changed`, `unreachable` or `never` → `unconfirmed`.
- `not_applicable` does not make a record unconfirmed on its own.
- The individual checks remain available; the summary does not replace them.

### 6.7 Baseline

- `npm run typecheck` exits 0.
- The full unit suite passes after the skeleton tests are added.
- The skeleton tests will be in `tests/unit/rag-skeleton.test.ts`.

### 6.8 Owner acceptance

The skeleton is accepted when the owner confirms:

1. The contract covers the fields the agent and UI need.
2. The seven scopes and their boundaries are correct.
3. The deferred scopes are visible, not hidden.
4. RAG-0 is the only RAG work in this step.
5. The TypeScript target is correct; no Rust Kernel.

## 7. Decisions

The full register is [../../.agents/decisions/2026-11-16-phase-5-rag.md](../../.agents/decisions/2026-11-16-phase-5-rag.md). The decisions that define this spec:

| Id | Decision |
|---|---|
| RAG-1 | SQLite canonical; no server, no Docker |
| RAG-2 | One retrieval function over seven adapters |
| RAG-3 | Provision rows; Akoma Ntoso is export |
| RAG-4 | Chunk by legal/document structure, never token/page windows |
| RAG-5 | Structured citation key for every legal passage |
| RAG-6 | Chapter/part maps from the source; `unmapped` is allowed |
| RAG-7 | Judgment paragraph is the unit; opinions have separate namespaces |
| RAG-8 | Exact + FTS5 + graph + filters default; vectors optional |
| RAG-9 | Vectors derived, benchmark-gated, no vector server |
| RAG-10 | SQLite edge tables; no graph database as source |
| RAG-11 | Verify at use; changed/unreachable/never are not verified |
| RAG-12 | Quote-first with deterministic quote and citation checks |
| RAG-13 | Multiple roles in one bounded skill run under the existing harness |
| RAG-14 | Separate stores and session logs |
| RAG-15 | Canonical matter history and session logs append-only; projections rebuildable |
| RAG-16 | Law and firm know-how versioned; matter facts private |
| RAG-17 | Native annotation flow, bound to target version |
| RAG-18 | No RAG platform or vector/graph server |
| RAG-19 | Build the full contract and tests before exposing the tool |
| RAG-20 | Phase 5 exit is a real reviewed memorandum |
| RAG-21 | Partition large judgment indexes; report coverage |
| RAG-22 | Long documents follow structure; page is an anchor |
| RAG-23 | FTS5 external content; indexed metadata; `detail=full` |
| RAG-24 | Formal ontology deferred; stable IDs and typed relations now |
| RAG-25 | Pi remains the harness; no second agent runtime |
| RAG-26 | **TypeScript only. No Rust Kernel.** Owner instruction, 2026-11-18. |
| RAG-27 | Verification dimensions stay separate; no single badge |
| RAG-28 | Authority facts, not one numeric score; keep relevance and adverse authority |
| RAG-29 | Bounded concurrency, timeouts and visible coverage |
| RAG-30 | Retrieval agent reads and proposes; it never writes canonical facts or edges |
| RAG-31 | Safe partition identifiers; model-aware vector identity |
| RAG-32 | Commentary is secondary material, never binding authority |
| RAG-33 | RAG-0 is the only RAG work now; RAG-1 to RAG-5 are deferred |

## 8. Real task at the end of Phase 5

The owner gives a real legal question on a real matter. The system finds the applicable law, the exact passages, the adverse authority, the version in force on the governing date, and states its coverage. The owner reviews the memorandum, corrects it, and confirms that the quotes and citations are accurate.

A green test suite, a demo, or an agent-written document is not the exit (lesson L3).
