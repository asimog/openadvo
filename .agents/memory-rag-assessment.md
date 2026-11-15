# Memory, wiki, RAG, vector and graph options

Read-only assessment. No product file changed. Date: 2026-11-15.
Sources checked: `docs/architecture.md`, `docs/decisions.md`, `docs/features.md`,
`docs/build-plan.md`, `src/lib/research-sources/corpus.ts`, and the GitHub API on
2026-11-15. Star counts are a rough signal, not a quality measure.

## 1. What the accepted plan already fixes

| Thing | Where it is fixed |
|---|---|
| One writer per store: `matter.db`, `corpus.db`, `intel.db`, `advocate.db` | Decision 12, architecture section 3 |
| FTS5, vectors, three graphs and analytics are derived and rebuildable | Decision 13 |
| Graphs are SQLite edge tables, not a graph database | Decision 13, architecture section 4 |
| Memory records are typed and have a lifecycle: proposed, tentative, confirmed, superseded, expired, archived, deleted | Architecture section 6 |
| Context assembly is a phase 1 feature (I1), not a later memory product | Features I1, architecture section 5 |
| No cross-matter retrieval of facts | Architecture section 6 |
| Rules, statute versions and sources are dated and can go stale | Decision 16 |
| The legal corpus starts with the Supreme Court and grows by court | Build plan phase 5 |
| Roadmap placement: memory in phases 4, 6 and 10; statutes and research in phase 5; knowledge library in phases 3 and 10; chamber work in phase 12 | Build plan |

Current code, for effort estimates: `src/lib/research-sources/corpus.ts` line 19
has FTS5 over judgment metadata only (title, parties, judge, refs). There is no
paragraph text, no vector, and no graph. `src/lib/research-sources/indiacode.ts`
searches and reads India Code live; it does not store versions.

## 2. The model to decide against

Four different things are being mixed in the list. Keep them apart.

| Layer | What it is | What it is not | Home |
|---|---|---|---|
| Canonical records | Typed, dated, confirmed facts and law: parties, events, provisions, preferences, decisions | Prose pages; model output | `matter.db`, `corpus.db`, `intel.db`, `advocate.db` |
| Know-how (wiki) | Human-authored prose: checklists, drafting styles, playbooks, commentary, lessons | Case facts; operative law | Knowledge Library (M1/M2) in `advocate.db` plus blobs |
| Retrieval (RAG) | Chunk, index, retrieve, rank, pack. Rebuildable at any time | A source of truth | FTS5, vectors, edge tables |
| Memory | The confirmed subset of records with a lifecycle and a reason | A separate database or a memory server | Same stores, `type` column and status |

The graph is a projection of the records, not a fifth source. The vector index is a
projection of the chunks, not a fifth source.

## 3. Decision matrix

Legend: **●** primary, **○** supporting, **—** not needed.

| Area | Primary shape | Memory | Wiki | RAG | Vector | Graph |
|---|---|---|---|---|---|---|
| 1. Advocate memory | Typed records + small always-on profile block | ● | — | ○ | ○ | ○ |
| 2. Firm knowledgebase | Documents with front matter + index | ○ | ● | ● | ○ | ○ |
| 3. Statute intelligence | Versioned provision rows | ○ | — | — | — | ● |
| 4. Jurisdictional and procedural | Dated rule rows + small evaluator | ○ | ○ | — | — | ○ |
| 5. Matter intelligence | Anchored records + evidence graph | ● | — | ○ | ○ | ● |
| 6. Research intelligence | Paragraph chunks + citation graph | — | — | ● | ● | ● |
| 7. Per-matter orchestrator | Session log + rebuilt case posture | ● | — | — | — | — |
| 8. Unified agent memory | Retrieval facade over the four stores | ○ | ○ | ● | ● | ● |

## 4. Area-by-area

### 4.1 Advocate memory

Verdict: memory records, not a wiki and not a RAG product. Put it in `advocate.db`
with the architecture section 6 shape. Keep a small always-on block (top confirmed
preferences, rejected approaches, court practices) and use vector recall only for
the long tail.

- https://github.com/getzep/graphiti — bi-temporal edges (`valid_at`, `invalid_at`,
  `expired_at`). The closest published model to `valid_from`, `valid_until`,
  `supersedes`. Borrow the model; do not run the service.
- https://github.com/mem0ai/mem0 — extraction plus consolidation (add, update,
  delete). Borrow the proposal and dedup loop.
- https://github.com/letta-ai/letta — core memory blocks versus archival memory.
  Borrow the split: a small block always in context, the rest recalled.
- https://github.com/doobidoo/mcp-memory-service — small sqlite-vec plus graph
  memory service. Useful as a size reference for a local implementation.
- https://github.com/basicmachines-co/basic-memory — Markdown plus SQLite graph
  for agent-readable notes. Reference for the knowledge side, not for memory
  lifecycle.

Watch: memory bloat and stale preferences. Cap records per type, require an
"applied because" field, and expire silently unused records at review time.
Phase: 6 (F2) and 10 (F5, G3).

### 4.2 Firm knowledgebase

Verdict: wiki-shaped content and RAG-shaped retrieval, but there is no owner for a
"firm knowledgebase" in architecture section 3 today. The nearest accepted home is
the Knowledge Library (M1 phase 3, M2 phase 10) in `advocate.db`, plus phase 12 for
multi-advocate chamber work. That gap needs an owner decision before code.

Recommendation: files first. Markdown or DOCX plus front matter (`scope`, `court`,
`practice_area`, `author`, `status`, `approved_by`, `valid_from`, `source`) in a
synced folder, indexed into `advocate.db`, shown in the Knowledge tab. No server and
no Docker on the advocate's machine. This matches decisions 8, 9 and 12.

Hard constraint: no cross-matter retrieval of facts (architecture section 6). A
firm-wide library may hold public law, templates, checklists and approved positions
with client identity removed. It may not hold matter facts. If the owner wants
shared matter knowledge across advocates, that is phase 12 (W1-W3) and needs an
identity and sync design.

- https://github.com/outline/outline — wiki information architecture: collections,
  permissions, search, revisions. Borrow the shape, not the server.
- https://github.com/docmost/docmost — TypeScript team wiki. Closest stack, still a
  server. Read-only reference.
- https://github.com/onyx-dot-app/onyx — connectors, source permissions and
  enterprise search. Reference for a knowledgebase fed from many sources.
- https://github.com/basicmachines-co/basic-memory — local Markdown files plus
  SQLite graph plus MCP. The closest pattern to a desktop, file-first library.
- https://github.com/infiniflow/ragflow — document parsing and a chunk-review UI.
  Reference for ingestion quality control.
- https://github.com/khoj-ai/khoj — personal and team knowledgebase with
  connectors. Product reference.
- https://github.com/paperless-ngx/paperless-ngx — inbox, OCR, tags,
  correspondents, document dates. Reference for the document intake experience.

Watch: a firm KB is where practice-management scope creeps in. Decision 10 excludes
billing, time, CRM and firm analytics. Keep the library to litigation know-how.
Phase: 3 (M1), 10 (M2), 12 (shared).

### 4.3 Statute intelligence

Verdict: a versioned database, not a wiki and not RAG-first. A bare act is
structured text with identity and dates; embeddings lose section identity and the
governing version. Store provision rows keyed by act, provision, version and
in-force dates, plus commencement, amendment and repeal events. Keep the raw source
document as a blob for audit.

Use the FRBR model (work, expression, manifestation) from Laws.Africa Indigo: it is
the mature open model for consolidated legislation with versions and commencements.
Resolve the governing date by query, not by document selection.

- https://github.com/laws-africa/indigo — LGPL-3.0. The best structural reference
  for versioned legislation, commencements and consolidation. Django; borrow the
  model, not the stack.
- https://github.com/laws-africa/bluebell — GPL-3.0. Akoma Ntoso parser. Reference
  for turning XML into provision rows.
- https://github.com/laws-africa/cobalt — Akoma Ntoso library. Reference.
- https://github.com/oasis-open/legaldocml-akomantoso — the schema and examples.
- https://github.com/nyaayaIN/laws-of-india — Indian laws in Akoma Ntoso XML.
  Last push 2019 and no clear licence file; use as a seed or test set only, not as
  a source of current law.
- https://github.com/openlegaldata/awesome-legal-data — dataset index.

Needed even if the model is right: a provision crosswalk for IPC to BNS, CrPC to
BNSS and Evidence Act to BSA (feature D2). That mapping is legal work the advocate
must confirm; the code only proposes.

Watch: source drift and broken anchors. Every row needs `source_url`,
`retrieved_at`, `valid_from`, `valid_to` and a check interval (decision 16).
Phase: 5 (D2, E3, G1).

### 4.4 Jurisdictional and procedural

Verdict: dated rows in `intel.db` plus a very small deterministic evaluator. Do not
embed a rules engine or a rules DSL. A DSL adds a translation layer the advocate
cannot audit, and it duplicates the provenance requirement.

Rule row shape: court, instrument, rule number, condition, effect, source, dates,
check interval, reliability. The evaluator answers "which rule applies on this date"
and returns the citation. The advocate's own court practice is a `court_practice`
memory record, not a rule.

- https://github.com/Lexpedite/blawx — rules-as-code authoring with explanations.
  Reference for making a rule readable, not a runtime.
- https://github.com/openfisca/openfisca-core — AGPL-3.0. Dated parameters and
  formulas. Borrow the discipline, not the engine.
- https://github.com/laws-africa/indigo — commencement and version modelling for
  instruments.
- https://github.com/docling-project/docling — layout-aware parsing for court rule
  PDFs and gazettes.
- https://github.com/freelawproject/juriscraper — adapter patterns for court sites.
  Reference only; Indian adapters are separate.

Drafting styles and templates do not belong here. They are Knowledge Library (M2).
Phase: 2 (B), then one pack per court.

### 4.5 Matter intelligence

Verdict: the strongest graph case in the product, and the records must stay
anchored. Parties, events, documents, pages, exhibits, statements, facts, issues,
arguments, reliefs and draft paragraphs become nodes; supports, contradicts,
admits, denies, depends on and derived from become edges. Extraction proposes;
only the advocate confirms.

Pipeline: ingest (PDF, DOCX, OCR) -> structure with page and paragraph anchors ->
extract candidates (case numbers, CNR, dates, amounts, parties, directions) ->
propose records -> advocate confirms -> build edges. Deterministic extractors
first, model second. This matches architecture section 6: a model inference never
becomes a confirmed fact.

- https://github.com/OpenNyAI/Opennyai — MIT. Indian legal pipeline: statute
  extraction, rhetorical roles, summarization. Best Indian reference.
- https://github.com/Legal-NLP-EkStep/legal_NER — Apache-2.0. Indian legal NER
  baseline. Last push 2024; treat as a starting point.
- https://github.com/wanasit/chrono — MIT. Natural-language date parsing in
  TypeScript. Useful for chronology, including Indian formats.
- https://github.com/docling-project/docling — layout and table extraction.
- https://github.com/mindee/doctr — the second OCR engine already accepted
  (decision 26).
- https://github.com/graphology/graphology — MIT. Graph algorithms for analytics
  views, not for storage.
- https://github.com/Exploration-Lab/IL-TUR — Indian legal benchmark. No licence
  file; check before use.

Watch: entity resolution. The same party appears with different spellings across
documents. Keep a canonical party table with aliases and merge history, and never
merge silently.
Phase: 4 (F1, G2, H).

### 4.6 Research intelligence

Verdict: the only area that genuinely needs RAG, vectors and a graph at scale.
Paragraph-level chunks in `corpus.db`; FTS5 for exact phrase, boolean and citation
queries; ANN for semantic recall; citation and treatment edges for authority;
reciprocal rank fusion; rerank the top 50 to the top 10. Every result carries court,
bench, date, paragraph anchor and treatment status.

Do not use LLM-extracted entity graphs for authority. The legal knowledge graph is
built from citations and treatments in the judgments themselves: high precision and
auditable. GraphRAG-style entity extraction is the wrong tool for "what binds me";
it is at most a tool for commentary and fact patterns.

- https://github.com/asg017/sqlite-vec — loadable into `node:sqlite`
  (`allowExtension: true`, Node 22.13 or later). Pre-v1, brute-force KNN only, no
  ANN. Good for per-matter and per-advocate scopes.
- https://github.com/unum-cloud/usearch — Apache-2.0, npm 2.26.5. ANN with
  quantization. Candidate for the corpus-scale index.
- https://github.com/lancedb/lancedb — Apache-2.0, TypeScript SDK. Alternative if
  versioned datasets, IVF-PQ and hybrid search in one engine win a benchmark.
- https://github.com/quickwit-oss/tantivy — MIT. Only if FTS5 fails a measured
  benchmark.
- https://github.com/zeroentropy-ai/legalbenchrag — MIT. Legal RAG retrieval
  benchmark. Use its evaluation design.
- https://github.com/Exploration-Lab/IL-TUR — Indian legal tasks benchmark.
- https://github.com/freelawproject/eyecite — BSD-2. Citation extraction
  architecture. US patterns; port the approach, not the patterns.
- https://github.com/freelawproject/courtlistener — citator and authority graph
  design, API schema and treatment vocabulary. Strong reference.
- https://github.com/freelawproject/juriscraper — court adapter patterns.
- https://github.com/vanga/indian-supreme-court-judgments — CC-BY-4.0. The Supreme
  Court and High Court dataset already used by `aws.ts`.
- https://github.com/microsoft/graphrag — MIT. Community summaries for global
  questions. Expensive and hard to verify; borrow the idea, not the pipeline.
- https://github.com/HKUDS/LightRAG — MIT. Incremental graph plus vector, dual-level
  retrieval. Read for the algorithm.
- https://github.com/gusye1234/nano-graphrag — MIT. Small readable GraphRAG.
- https://github.com/parthsarthi03/raptor — MIT. Hierarchical summaries for long
  documents. Relevant to long judgments and commentaries.
- https://github.com/jina-ai/late-chunking — Apache-2.0. Better retrieval on long
  documents. Read for the technique.

Chunking: structure first. Numbered paragraphs, headings and page anchors, not
fixed 512-token windows. A judgment paragraph is the unit an advocate cites.
Phase: 5 (E, J, G1, G4).

### 4.7 Per-matter orchestrator memory

Verdict: not a database and not a memory product. It is three things: the Pi
session file (a log), a small case-posture block rebuilt from `matter.db` (stage,
next date, open issues, pending tasks, last decisions, conflicts, budget), and the
context package record. Inject the posture at every turn; do not rely on the model
to remember.

- https://github.com/letta-ai/letta — core versus archival memory. Borrow the split.
- https://github.com/langchain-ai/langmem — MIT. Memory extraction and tools for
  agents. Read for the API shape.
- https://github.com/getzep/graphiti — invalidation instead of deletion. Borrow the
  temporal edge rule.
- https://github.com/doobidoo/mcp-memory-service — a small local implementation to
  compare against.

Hard rule: the session is a log; `matter.db` is the truth. On resume, rebuild the
posture from the store. Never let the session summary become the only record.
Phase: 1 (harness) and 4 (memory).

### 4.8 Unified memory for the main agent

Verdict: one retrieval facade, four scopes, one policy filter. This is feature I1,
Context Assembly (phase 1, architecture section 5), not a fifth store and not a
memory service.

Interface: `assemble(task, scope, budget) -> { items, excluded, packageId }`. Each
item carries id, kind, text, anchor, authority, dates, confidence, provenance and a
conflict flag. Check scope before retrieval, not after (architecture section 6).
Record what was excluded and why; that is the audit trail.

- https://github.com/mem0ai/mem0 — extraction and consolidation loop.
- https://github.com/getzep/graphiti — temporal invalidation and hybrid search.
- https://github.com/topoteretes/cognee — extract, cognify, load pipelines.
- https://github.com/dluc/kernel-memory — MIT (moved from Microsoft). Pipeline and
  partition abstraction. Good architecture reference for ingestion and retrieval.
- https://github.com/MemTensor/MemOS — memory scheduling ideas.
- https://github.com/MemoriLabs/Memori — SQL-native memory. Reference.

Why not adopt any of them as the runtime: each owns its own storage, extraction loop
and schema. That duplicates the four canonical stores, breaks the one-writer rule and
weakens the audit chain. Take the algorithms, keep the stores.

## 5. Shared stack

### 5.1 Vector search

| Option | Use | Constraint |
|---|---|---|
| sqlite-vec 0.1.9 | Per-matter, per-advocate and intel scopes | Pre-v1, brute force, no ANN. Pin the version and wrap it in one module |
| usearch 2.26.5 | Corpus ANN index as a separate rebuildable file | Native binary; unpack from ASAR |
| LanceDB 0.41 | Alternative corpus index | Heavier dependency; benchmark first |
| Tantivy | Full-text only if FTS5 fails | Extra engine; avoid unless measured |

`node:sqlite` supports `loadExtension` with `allowExtension: true` (Node 22.13 or
later), so sqlite-vec can load into the current stack. Verify on Windows, macOS and
Linux (decision 9) before committing.

### 5.2 Graph

Keep the accepted design: a SQLite edge table with `(from_kind, from_id, relation,
to_kind, to_id, evidence_ref, built_from, built_at)` and a recursive CTE. Add a
closure table only for hot, deep traversals. Use graphology for offline analytics.
Do not add Neo4j. Kuzu is archived (last push 2025-10-10), so it is not a candidate.

### 5.3 Embeddings

`@huggingface/transformers` 4.3.2 is already a dependency and `onnxruntime-node`
1.30.0 is present. Run embeddings locally.

- English first: `BAAI/bge-small-en-v1.5` for speed on a laptop.
- Multilingual, if re-indexing later is unacceptable: `BAAI/bge-m3`.
- Reranker: `BAAI/bge-reranker-v2-m3` through ONNX, or FlashRank as a reference
  (https://github.com/PrithivirajDamodaran/FlashRank).

Measure on the target laptop, not on a server. The advocate's machine is the
constraint.

### 5.4 Evaluation

- https://github.com/promptfoo/promptfoo — MIT, TypeScript. Regression tests for
  retrieval and skills.
- https://github.com/vibrantlabsai/ragas — Apache-2.0. RAG metrics.
- https://github.com/zeroentropy-ai/legalbenchrag — legal retrieval benchmark.
- https://github.com/Exploration-Lab/IL-TUR — Indian legal benchmark.
- Internal set: 50 real queries with known answers, built from the owner's own
  matters. This is the set that decides.

Metrics: recall at 10 and 50, citation accuracy, anchor accuracy, p95 latency,
and a human "would I cite this" score.

## 6. Spikes, with exit criteria

| Spike | Work | Exit |
|---|---|---|
| A. Vector plumbing | Load sqlite-vec into `node:sqlite` inside Electron on Windows; index 10k judgment paragraphs | Query works; p95 < 150 ms at 1M vectors, or use usearch |
| B. Parsing quality | Docling versus the current pdfjs text layer on 20 real Supreme Court PDFs | 95% paragraph alignment; tables and footnotes readable |
| C. Statute versioning | Encode 3 provisions across a repeal and re-enactment; resolve 20 dates | Correct version and citation for every date |
| D. Memory round trip | One closed matter: 40 records, confirm, supersede, rebuild posture | Posture recovered; no unconfirmed fact in the package |
| E. ANN benchmark | usearch versus LanceDB versus sqlite-vec at 1M x 1024 vectors on the target laptop | One winner on latency, size and rebuild time |

## 7. Gaps and mismatches with the accepted documents

1. "Firm knowledgebase" has no store owner in architecture section 3 and no feature
   ID. Nearest accepted homes: M1/M2 (Knowledge Library) and phase 12 (chamber).
2. "Matter Studio" is not an accepted name. Decisions section 4 maps `studio` to the
   Research & Authorities and Arguments & Strategy tabs.
3. "Per Matter Orchestrator memory" has no separate store in architecture section 7.
   It is a session plus a posture block rebuilt from `matter.db`.
4. "Unified memory" is feature I1, Context Assembly, not a new database.
5. A firm-wide library that retrieves matter facts would break the no-cross-matter
   rule in architecture section 6. Keep firm knowledge free of client facts.
6. Adopting GraphRAG, LightRAG, Mem0 or Graphiti as a runtime would create a second
   store, which conflicts with decisions 12 and 13.

## 8. Owner decisions

1. Firm knowledgebase scope: single-advocate library, or chamber-shared in phase 12.
2. Corpus breadth for phase 5: Supreme Court only, or named High Courts too. This
   decides the vector engine.
3. Statute storage: normalized provision rows plus raw XML blob, or Akoma Ntoso as
   the primary store. Recommended: rows plus blob.
4. Build-time Python: allowed for Docling, Indigo-style conversion and benchmarks,
   or Node only.
5. Embedding family: English-only now and re-index in phase 11, or multilingual now
   to avoid re-indexing.

## 9. Repo inventory

Stars and last push as of 2026-11-15. Licence is a fact from the GitHub API; where
the API returned NOASSERTION or none, read the repository's own licence file.

| Area | Repo | Stars | Last push | Licence | Verdict |
|---|---|---|---|---|---|
| Vector | asg017/sqlite-vec | 8.3k | 2026-05-18 | Apache-2.0 | Adopt, per-store scopes |
| Vector | unum-cloud/usearch | 4.4k | 2026-11-15 | Apache-2.0 | Benchmark for corpus |
| Vector | lancedb/lancedb | 11.9k | 2026-11-15 | Apache-2.0 | Alternative |
| Vector | quickwit-oss/tantivy | 16.4k | 2026-11-11 | MIT | Hold |
| Embedding | huggingface/transformers.js | 16.4k | 2026-11-14 | Apache-2.0 | Already in use |
| Graph | graphology/graphology | 1.8k | 2026-11-10 | MIT | Analytics only |
| Graph | kuzudb/kuzu | 4.0k | 2025-10-10 | MIT | Reject, archived |
| Parsing | docling-project/docling | 70.6k | 2026-11-15 | MIT | Reference; ONNX spike |
| Parsing | Unstructured-IO/unstructured | 15.7k | 2026-11-14 | Apache-2.0 | Reference |
| Parsing | datalab-to/marker | 40.9k | 2026-11-14 | Apache-2.0 | Benchmark |
| Parsing | opendatalab/MinerU | 83.7k | 2026-11-13 | Custom | Benchmark |
| Parsing | mindee/doctr | 6.4k | 2026-11-13 | Apache-2.0 | Accepted (26) |
| Chunking | feyninc/chonkie | 4.8k | 2026-11-13 | MIT | Reference |
| Indian law | OpenNyAI/Opennyai | 104 | 2026-04-01 | MIT | Reference |
| Indian law | Legal-NLP-EkStep/legal_NER | 101 | 2024-05-15 | Apache-2.0 | Baseline |
| Indian law | Exploration-Lab/IL-TUR | 8 | 2026-09-20 | None | Benchmark |
| Indian law | vanga/indian-supreme-court-judgments | 100 | 2026-10-14 | CC-BY-4.0 | In use |
| Indian law | openlegaldata/awesome-legal-data | 330 | 2026-10-20 | None | Index |
| Citations | freelawproject/eyecite | 303 | 2026-11-01 | BSD-2 | Reference |
| Citations | freelawproject/courtlistener | 1.1k | 2026-11-15 | Custom | Reference |
| Citations | freelawproject/juriscraper | 659 | 2026-11-14 | BSD-2 | Reference |
| Statutes | laws-africa/indigo | 78 | 2026-11-12 | LGPL-3.0 | Model reference |
| Statutes | laws-africa/bluebell | 23 | 2026-07-13 | GPL-3.0 | Parser reference |
| Statutes | laws-africa/cobalt | 28 | 2026-06-18 | Custom | Reference |
| Statutes | oasis-open/legaldocml-akomantoso | 86 | 2022-06-02 | Custom | Schema |
| Statutes | nyaayaIN/laws-of-india | 39 | 2019-01-28 | Custom | Seed only |
| Rules | Lexpedite/blawx | 161 | 2024-11-01 | MIT | Reference |
| Rules | openfisca/openfisca-core | 252 | 2026-11-01 | AGPL-3.0 | Reference |
| Memory | getzep/graphiti | 32.8k | 2026-11-15 | Apache-2.0 | Model reference |
| Memory | mem0ai/mem0 | 69.0k | 2026-11-06 | Apache-2.0 | Model reference |
| Memory | letta-ai/letta | 25.4k | 2026-10-18 | Apache-2.0 | Model reference |
| Memory | topoteretes/cognee | 33.3k | 2026-11-14 | Apache-2.0 | Reference |
| Memory | HKUDS/LightRAG | 40.7k | 2026-11-15 | MIT | Algorithm reference |
| Memory | microsoft/graphrag | 36.6k | 2026-11-09 | MIT | Algorithm reference |
| Memory | gusye1234/nano-graphrag | 4.0k | 2026-01-27 | MIT | Read the algorithm |
| Memory | langchain-ai/langmem | 1.8k | 2026-11-13 | MIT | API reference |
| Memory | MemTensor/MemOS | 12.4k | 2026-11-11 | Apache-2.0 | Reference |
| Memory | MemoriLabs/Memori | 17.6k | 2026-10-03 | Custom | Reference |
| Memory | doobidoo/mcp-memory-service | 2.1k | 2026-11-15 | Apache-2.0 | Local reference |
| KB | basicmachines-co/basic-memory | 4.6k | 2026-11-15 | AGPL-3.0 | Pattern reference |
| KB | onyx-dot-app/onyx | 33.4k | 2026-11-15 | Custom | Reference |
| KB | outline/outline | 41.3k | 2026-11-15 | Custom | IA reference |
| KB | docmost/docmost | 22.3k | 2026-11-15 | AGPL-3.0 | IA reference |
| KB | khoj-ai/khoj | 38.1k | 2026-08-02 | AGPL-3.0 | Product reference |
| KB | infiniflow/ragflow | 94.2k | 2026-11-13 | Apache-2.0 | Ingestion reference |
| KB | dluc/kernel-memory | 2.2k | 2026-06-08 | MIT | Architecture reference |
| KB | paperless-ngx/paperless-ngx | 48.1k | 2026-11-15 | GPL-3.0 | Intake reference |
| Eval | promptfoo/promptfoo | 27.2k | 2026-11-15 | MIT | Adopt for tests |
| Eval | vibrantlabsai/ragas | 16.3k | 2026-11-14 | Apache-2.0 | Metrics reference |
| Eval | zeroentropy-ai/legalbenchrag | 220 | 2025-05-30 | MIT | Legal RAG eval |
| Eval | HazyResearch/legalbench | 658 | 2026-03-30 | None | Task design |
| Dates | wanasit/chrono | 5.3k | 2026-11-03 | MIT | Adopt candidate |
| Rerank | PrithivirajDamodaran/FlashRank | 1.0k | 2026-07-11 | Apache-2.0 | Reference |
| Long docs | parthsarthi03/raptor | 1.8k | 2024-09-03 | MIT | Technique |
| Long docs | jina-ai/late-chunking | 542 | 2024-12-23 | Apache-2.0 | Technique |
