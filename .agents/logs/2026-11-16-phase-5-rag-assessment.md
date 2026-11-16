# Phase 5 RAG pipeline: independent assessment

Date: 2026-11-16. Status: assessment. It changes no accepted decision. Only the owner accepts a decision. The companion integration report is [2026-11-16-phase-5-rag-integration.md](2026-11-16-phase-5-rag-integration.md). The decision register is [../decisions/2026-11-16-phase-5-rag.md](../decisions/2026-11-16-phase-5-rag.md).

Scope: Phase 5 of [build-plan.md](../../docs/build-plan.md): law, research and authority (features D2, E1-E7, G1, G4, G6-G8, H11, J1-J6). It also covers the eight intelligence areas the owner named, the firm and matter stores, session logs, and the review surface modelled on Plannotator.

Method: I read the accepted documents and the uncommitted Phase 5 code. I tested India Code and Nyaykosh live on 2026-11-16. I inspected the named repositories and the main alternatives. I ran local spikes on Windows with no Docker: `node:sqlite` plus sqlite-vec, a flat TypeScript vector index, and LadybugDB. I ran the type check and the unit tests. Section 2 gives the commands and the results.

This report is independent of the earlier survey in [../memory-rag-assessment.md](../memory-rag-assessment.md) and the earlier assessment in [2026-11-16-rag-knowledge-assessment.md](2026-11-16-rag-knowledge-assessment.md). It repeats a fact from them only where the fact decides a choice. It corrects one material fact in both (section 6.7).

---

## 1. Key points

1. **Build the adapters, not a RAG platform, and not only a query agent.** The smallest reliable unit is one retrieval function over seven scope adapters, four canonical stores, one verifier and one review surface. A query agent alone cannot supply exact citation keys, versioned law, scope control or an audit trail. A RAG platform brings a second store, a server and a schema that does not fit decisions 4, 12 and 13.
2. **SQLite stays the source of truth.** `advocate.db` (firm), one `matter.db` per matter, `corpus.db` (law), `intel.db` (courts, packs, sources). No Docker. No server. No graph database. The full-text index, vectors and graphs are derived and rebuildable (decision 13).
3. **Statutes and procedure share one provision model.** An Act, a rule, a regulation, a notification and a practice direction differ in `kind` and `jurisdiction`, not in table shape. One Akoma Ntoso writer serves all of them.
4. **Chunk by legal boundary, never by page or token.** The unit is the section, article, rule or order. A long provision splits at its own sub-section, clause, sub-clause, proviso, explanation, illustration or exception. Every chunk carries a structured citation key: act, chapter, part, section, sub-section, clause, version.
5. **India Code is the statute source, and the owner's statement about the repealed codes is correct.** The IPC, the CrPC and the Evidence Act are not in the "Acts" collection as section records. They are in the Central "Repeal Acts" collection as an Act PDF plus extracted text. My first search looked only at "Acts" and was wrong. Section 6.7 records the correction and the exact item ids.
6. **Chapter metadata is missing from the India Code section API.** `dc.identifier.no_of_chapter` is unreliable (0 for the Contract Act, which has chapters). The chapter map must come from the Act PDF's arrangement of sections, with a small curated map per Act, and must say "unmapped" when it cannot be settled. Never guess a chapter.
7. **Verification at the time of use is cheap and must be visible.** Re-read the exact source item or PDF, normalize the same way, hash, compare. Three results: `verified`, `changed`, `unreachable`. `unreachable` means unconfirmed. It never means passed (decision 16, ruling R-4).
8. **The default retrieval is exact lookup + FTS5 + the graph + filters.** Vectors join only when a local model is installed. Reciprocal rank fusion merges the lists; policy orders the result. This is the right order for "cite the exact provision": exact citations and phrases first, semantics second.
9. **Vectors are optional and lightweight.** A flat Float32 index in TypeScript takes about 10 ms at 20,000 vectors, 20 ms at 50,000 and 40 ms at 100,000 on this machine. sqlite-vec gives 8 ms at 20,000 with a native extension and a pre-v1 API. The TypeScript index is enough for Phase 5. Revisit at about 200,000 to 1,000,000 vectors, or when the corpus spans several High Courts.
10. **No graph database in Phase 5.** The three graphs stay SQLite edge tables with recursive CTEs. LadybugDB works on Windows, is MIT, and has native full-text and HNSW. It is still a second store. Keep it as an optional derived index behind an adapter if a measured graph query fails.
11. **Quote first, then reason, then verify.** Retrieval returns candidates. A quote-selection step extracts exact spans. A reasoning step sees only verified quotes and citation keys. A deterministic verifier checks the citation key, the quote, the governing date and the authority. A model never certifies its own quote.
12. **The matter database and the session logs must become append-only.** Today `matter.db` updates and deletes rows in nine places. That is a real mismatch with the owner's instruction. The migration is a change to Phases 1 to 4, and it needs the owner's acceptance.
13. **Plan review is native, on the Plannotator pattern.** Annotations live with the target: a plan, a research plan, a memorandum, a draft, a provision or a judgment paragraph. The agent receives one structured message. No 53 MB browser extension and no terminal assumption.
14. **Long files are a structure problem; large datasets are a partition problem.** A 100+ page file is indexed by its parts and anchored to the page. A 1M-paragraph judgment index is partitioned by court and year. One global FTS table takes 118 ms for a phrase and 464 ms for an OR query at 1M rows; a 50,000-100,000-row partition returns a phrase query in about 10-20 ms. Page is an anchor, never a chunk.

---

## 2. Evidence: what I ran and what it returned

### 2.1 Repository state

`main` was at `8fdf3a3` ("Assessment: the knowledge layer for phase 5"). The following files were untracked at the start:

| Path | What it is |
|---|---|
| `src/shared/law.ts` | Phase 5 types |
| `src/lib/statutes/{structure,indiacode,akn,rules,inforce,crosswalk}.ts` | Statute parsing, India Code adapter, Akoma Ntoso, PDF rules, in-force logic, crosswalk |
| `src/lib/law-store/index.ts` | The law store: instruments, versions, events, checks, judgments, edges, vectors |
| `src/lib/legal-corpus/index.ts` | Judgment paragraphs, citations, provisions named, treatment edges |
| `src/lib/knowledge/{index,adapters}.ts` | Retrieval, fusion, policy, vector index, adapters |
| `tests/unit/knowledge.test.ts`, `tests/fixtures/indiacode-contract-act.json` | The Phase 5 test set and a real India Code fixture |

### 2.2 Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0. No output. `tsc` on the node and web projects passed. |
| `node --test tests/unit/knowledge.test.ts` | 11 tests, 11 pass, 0 fail. |
| `npm run test:unit` | 231 tests, 228 pass, 0 fail, 3 skipped. Exit 0. |
| sqlite-vec spike (Windows, Node 24.13.1, no Docker) | `sqlite-vec v0.1.9` loaded into `node:sqlite`. 20,000 x 384: insert 269 ms, query 8.2-8.3 ms. |
| Flat TypeScript index (same machine) | 20,000 x 384: 10-17 ms. 50,000: 17-30 ms. 100,000: 34-43 ms. Array size 154 MB at 100,000. |
| LadybugDB spike (Windows, `@ladybugdb/core` 0.22.3) | Embedded database opened, Cypher table created, row inserted and read. No server, no Docker. |
| npm package sizes | `@ladybugdb/core-win32-x64` 15.6 MB unpacked. `@lancedb/lancedb-win32-x64-msvc` 355.8 MB unpacked. `sqlite-vec` wrapper 4 KB plus the native extension. |
| FTS5 scale spike (Windows, `node:sqlite`, synthetic legal prose, 90-140 words per paragraph) | 100,000 rows: 3.3 s build, 144 MB, phrase 11 ms, OR 44 ms. 1,000,000 rows: 41.5 s build, 1.44 GB, phrase 118 ms, OR 464 ms. After `optimize`: phrase 117 ms, OR 403 ms. A SQL filter on an `UNINDEXED` column: 1,011 ms. |
| Embedding spike (`Xenova/bge-small-en-v1.5`, 384 dims, ONNX, CPU, batch 32) | Model load 9.7 s. Throughput 165-244 paragraphs/s. |
| `git status` | The Phase 5 files were untracked at the start; no tracked file was modified. |

### 2.3 What the tests exposed, and what I fixed

The test file did not pass at first. Two failures were visible; fixing them exposed three more. The causes were real, not test noise:

| Defect | Fix |
|---|---|
| `findProvisions` consumed "Constitution" as part of the Act name, so "Article 226 of the Constitution" had no act. It also kept the final dot of "Cr.P.C.". | The instrument group now allows zero leading words before the suffix, and a trailing dot is removed. |
| Policy let a higher court outrank an exact provision lookup. | Exact hits now lead their band. A named provision or citation is the answer, not a candidate for a higher court to displace. |
| The treatment word "follow" did not match the `follows` pattern. | `follow(?:ed|s|ing)?` now includes the bare verb. |
| Crosswalk skipped a short heading ("Cheating") before it looked at the text. | The text can carry the candidate when both headings and text are low; the score still decides. |
| The Akoma Ntoso round-trip changed the words of section 28. | The XML now carries the canonical text per provision in the provenance block. The reader uses that text for the hash check. The body remains the structured rendering. |
| A footnote that repealed "the second clause of Exception 1" was treated as a repeal of the whole section. | Events now carry a scope of `provision` or `part`, and the part's words. The in-force evaluator ignores part events for the whole provision and states that it did so. |
| An insertion that followed a whole-section substitution was treated as the section's origin. | Until events carry a part anchor, a later insertion is treated as part-level and does not decide the section's history. This is a temporary conservative rule. |

These fixes are in the Phase 5 files. The test file is the record of the behaviour. Section 6.6 and section 6.11 explain the two design issues that remain: part-level anchors and the lossless XML contract.

### 2.4 What was tested live

| Test | Result |
|---|---|
| India Code DSpace API, Contract Act item `0e782442-f035-4d53-aace-81b1552a8cf2` | 200. Act metadata: title, number, year, enactment date, commencement date, repealed flag, `act_id`. |
| Contract Act search by `dc.identifier.act_id` | 270 items on 3 pages: 268 sections, 1 schedule, 1 Act. Each section has `section_number`, `order_number`, `section_page_note`, `section_footnote`. No chapter field. |
| Contract Act PDF bundles | ORIGINAL `a1872-9.pdf` (568 KB) and `H1872-09.pdf` (Hindi, 1.1 MB); TEXT extracts; thumbnails. The PDF has the arrangement of chapters and sections. |
| Central "Repeal Acts" collection | Discovered by community name `CENTRAL`, collection name `Repeal Acts`, scope `51639377-cbe3-4c6d-91bb-7823ed0ecd14`. It holds about 4,632 Acts. |
| IPC in Repeal Acts | `The Indian Penal Code, 45 of 1860 (Rep., Act 45 of 2023)`, item `972afbe0-a2de-415d-9df5-8d70038056ad`, ORIGINAL `A1860-45.pdf` 1.10 MB, TEXT `A1860-45.pdf.txt` 101 KB. |
| CrPC in Repeal Acts | `The Code of Criminal Procedure 1973, 02 of 1974 (Rep., Act 46 of 2023)`, item `973d60aa-105c-4a2f-94f1-7640f0b5d6a7`, PDF 8.96 MB, TEXT 681 KB. |
| Evidence Act in Repeal Acts | `The Indian Evidence Act, 1872, 1 of 1872 (Rep., Act 47 of 2023)`, item `b62073e0-4d33-4348-8eda-d92af40af24b`, PDF 640 KB, TEXT 101 KB. |
| Repealed text quality | The IPC and CrPC text bundles have the arrangement of sections and chapter headings. The CrPC OCR has errors ("Cfilef Judicial Magistrate", "Ma2is•trate"). The PDF is the source; the text is a hint. |
| Nyaykosh `/laac-api/v1/laws` | 4 Acts: Online Gaming 2025 (20 sections), DPDP 2023 (44), Aadhaar 2016 (69), IT Act 2000 (125). The `provisions[].text` field is a one-paragraph summary. |
| Nyaykosh `/xml` | Akoma Ntoso 3.0 with `FRBRWork` only. Section content is the summary. Not the enacted text. |
| Nyaykosh `/penalties` | Compliance obligations and penalties for those 4 Acts. A useful pointer, not a source of statutory text. |
| GitHub metadata | Star counts, last push, licence and archive state for the named projects and the alternatives. Section 10 and Appendix A. |

---

## 3. Links to assess

These are the links I would give the owner, with what to read. They are grouped by the decision they inform. Star counts are a rough signal, not a quality measure.

### 3.1 The named projects

| Project | Link | What to read | Verdict |
|---|---|---|---|
| Plannotator | https://github.com/backnotprop/plannotator | `README.md`, `packages/core/annotation-threads.ts`, `docs/agent-guides/plan-review.md`, `apps/pi-extension/server/annotations.ts` | Take the pattern. Build it native. Do not bundle the 53 MB Pi extension. |
| WeKnora | https://github.com/Tencent/WeKnora | `README.md`, `docs/LITE.md`, `internal/application/repository/chunk.go`, the graph and wiki tools | Take parent-child chunks, chunk revisions, graph evidence by chunk id, built-in evaluation. Do not run the server. Licence is a custom Tencent licence, not the MIT badge in the README. |
| CaseCite | https://github.com/thomasunise/casecite | `docs/deep-research.md`, `backend/app/services/chunking.py`, `backend/app/services/quote_verify.py`, `docs/architecture.md` | Take the quote-first deep-research design, clause-aware chunks, server-assigned refs, unverified quotes kept and flagged. It is US CourtListener-based; no Indian citation support. |
| Pencil | https://github.com/evolus/pencil | `README.md`, `app/tools/mcp/` | Not for Phase 5. GPL-2.0 Electron app. A later case-map viewer, not a dependency. |
| Vercel knowledge agent | https://github.com/vercel-labs/knowledge-agent-template | `docs/ARCHITECTURE.md`, `docs/SOURCES.md` | Take the idea: precise search and read tools over structured text, no vectors, no chunking. Do not take the sandbox or the shell. |
| LadybugDB | https://github.com/LadybugDB/ladybug | `README.md`, `docs.ladybugdb.com` | Embedded, MIT, Cypher, FTS and HNSW. Works on Windows. A second store; optional derived index only. |

### 3.2 Statutes, standards and official sources

| Source | Link | What to read |
|---|---|---|
| India Code | https://indiacode.gov.in/ | The official DSpace 9 repository. Use the REST API, not the rendered Angular pages. |
| India Code search API | https://indiacode.gov.in/server/api/discover/search/objects | The API used by the current adapter. |
| India Code item API | https://indiacode.gov.in/server/api/core/items/`<uuid>` | Act and section metadata. |
| India Code bundles | https://indiacode.gov.in/server/api/core/items/`<uuid>`/bundles | ORIGINAL PDF, TEXT extract, thumbnail. |
| DSpace REST contract | https://github.com/DSpace/RestContract/blob/main/search-endpoint.md | Search parameters, filters, pagination. |
| Nyaykosh | https://lawascode.negd.in/laws | 4 Acts as PDF, XML and API. Summaries, not enacted text. |
| Nyaykosh API | https://lawascode.negd.in/laac-api/v1/laws | The data shape. |
| Akoma Ntoso 3.0 schema | https://github.com/oasis-open/legaldocml-akomantoso | The OASIS LegalDocML schema and examples. |
| Akoma Ntoso | https://www.oasis-open.org/committees/legaldocml/ | The committee and the standard family. |
| LegalRuleML | https://www.oasis-open.org/committees/legalruleml/ | Rules as data. Do not use it for statutory text in Phase 5. |
| Laws.Africa Indigo | https://github.com/laws-africa/indigo | The FRBR work/expression/manifestation model, commencements and consolidation. |
| Laws.Africa Bluebell | https://github.com/laws-africa/bluebell | An Akoma Ntoso 3 parser. |
| Laws.Africa Cobalt | https://github.com/laws-africa/cobalt | An Akoma Ntoso library. |
| NYAaya laws of India | https://github.com/nyaayaIN/laws-of-india | Indian laws in Akoma Ntoso XML. Last push 2019; seed or test only. |
| JurisBound bare-acts scraper | https://github.com/jurisbound/bare-acts-scraper | A working India Code client: central, repealed and state lists; PDF checksums; chapter and section extraction. No licence was detected by the GitHub API; check the repository before reuse. |

### 3.3 Court rules

| Court | Link | What to read |
|---|---|---|
| Supreme Court Rules, 2013 | https://www.sci.gov.in/supreme-court-rules-2013/ | The official page and the 5 MB PDF. |
| Supreme Court Rules page | https://www.sci.gov.in/supreme-court-rules/ | The 2013 Rules and the 2024-2025 amendment notifications. |
| Delhi High Court, Original Side Rules, 2018 | https://delhihighcourt.nic.in/files/Notifications%20and%20Practice%20Directions/notificationfile_0xy08957.pdf | The consolidated PDF with the index, chapters and rules. |
| Delhi High Court, Court Rules | https://delhihighcourt.nic.in/web/court-rules | The rule list and the per-chapter PDFs. |
| Delhi High Court, Notifications and Practice Directions | https://delhihighcourt.nic.in/web/notifications-practice-directions | Amendments, practice directions and circulars. |
| Delhi High Court, Original Side Rules, 1967 | https://delhihighcourt.nic.in/files/2024-04/courtrulefile_q2ss5tpt.pdf | The earlier rules, for historical matters. |

### 3.4 Vector and search options

| Option | Link | Local, no Docker | Node/Windows | Verdict |
|---|---|---|---|---|
| SQLite FTS5 | https://www.sqlite.org/fts5.html | Yes | Yes, built into `node:sqlite` | Default full-text engine. |
| sqlite-vec | https://github.com/asg017/sqlite-vec | Yes | Yes, extension load tested | Optional. Pre-v1. BigInt rowid gotcha. |
| usearch | https://github.com/unum-cloud/usearch | Yes | Native addon | Benchmark if the corpus passes 200k-1M. |
| LanceDB | https://github.com/lancedb/lancedb | Yes | Yes, 355 MB Windows package | Alternative only. |
| Qdrant | https://github.com/qdrant/qdrant | No server; Edge is Python/Rust | Node client needs a server | Reject for Phase 5. |
| Qdrant Edge | https://qdrant.tech/documentation/edge/ | Yes, beta | Python/Rust only | Reject for the TypeScript app. |
| Orama | https://github.com/oramasearch/orama | Yes | Pure TypeScript | Reference; duplicates FTS5. |
| Vectra | https://github.com/Stevenic/vectra | Yes | TypeScript, local files | Reference; no hybrid. |
| hnswlib-node | https://github.com/yoshoku/hnswlib-node | Yes | Native addon | Benchmark only. |
| FAISS | https://github.com/facebookresearch/faiss | Yes | Native bindings vary | Reject for this stack. |
| DuckDB VSS | https://duckdb.org/docs/extensions/vss.html | Yes | Native | Another engine; no. |
| Chroma | https://github.com/chroma-core/chroma | Client/server | JS client needs a server | Reject. |
| Milvus | https://github.com/milvus-io/milvus | Server | No | Reject. |
| Weaviate | https://github.com/weaviate/weaviate | Server | No | Reject. |
| pgvector | https://github.com/pgvector/pgvector | PostgreSQL | No | Reject. |
| Tantivy | https://github.com/quickwit-oss/tantivy | Embedded Rust | Rust | Reject unless FTS5 fails a benchmark. |

### 3.5 Graph options

| Option | Link | Local, no Docker | Node/Windows | Verdict |
|---|---|---|---|---|
| SQLite edge table + recursive CTE | https://www.sqlite.org/lang_with.html | Yes | Yes | Accepted. Default for all three graphs. |
| LadybugDB | https://github.com/LadybugDB/ladybug | Yes | Yes, tested | Optional derived index. Not a second source. |
| Kuzu | https://github.com/kuzudb/kuzu | Yes | Yes | Archived 2025-10-10. Reject. |
| Oxigraph | https://github.com/oxigraph/oxigraph | Yes | Rust/JS/WASM | RDF/SPARQL. Optional standards export; not runtime. |
| Quadstore | https://github.com/quadstorejs/quadstore | Yes | TypeScript/LevelDB | RDF quads. Another store. Reject. |
| Neo4j | https://github.com/neo4j/neo4j | Server/Docker | Driver | Reject. |
| Memgraph | https://github.com/memgraph/memgraph | Server/Docker | Driver | Reject. |
| FalkorDB | https://github.com/FalkorDB/FalkorDB | Server/Docker | Driver | Reject. |
| graphology | https://github.com/graphology/graphology | Yes | TypeScript | Analytics and layout only. |
| Apache Jena TDB | https://jena.apache.org/ | Java | No | Reject. |
| Blazegraph | https://github.com/blazegraph/database | Java | No | Reject. |
| NetworkX | https://github.com/networkx/networkx | Python | No | Offline analytics only. |
| OpenCaseLaw | https://github.com/jonashertner/opencaselaw | Yes | MCP/REST | Swiss corpus with a 10M-edge citation graph. Architecture reference, not Indian law. |

### 3.6 Parsing, OCR and legal NLP

| Project | Link | Use |
|---|---|---|
| Docling | https://github.com/docling-project/docling | Layout-aware parsing. Build-time reference for PDFs and gazettes. |
| Marker | https://github.com/datalab-to/marker | PDF to Markdown benchmark. |
| MinerU | https://github.com/opendatalab/MinerU | PDF parsing benchmark. |
| Unstructured | https://github.com/Unstructured-IO/unstructured | Document parsing reference. |
| pdfjs-dist | https://github.com/mozilla/pdf.js | The current text layer. |
| Tesseract.js | https://github.com/naptha/tesseract.js | OCR engine already in the app. |
| docTR | https://github.com/mindee/doctr | Second OCR engine (decision 26). |
| OpenNyAI | https://github.com/OpenNyAI/Opennyai | Indian legal NLP pipeline; statute extraction, rhetorical roles. |
| Legal NER | https://github.com/Legal-NLP-EkStep/legal_NER | Indian legal NER baseline. |
| IL-TUR | https://github.com/Exploration-Lab/IL-TUR | Indian legal benchmark. Check the licence. |
| eyecite | https://github.com/freelawproject/eyecite | Citation extraction architecture. US patterns; port the approach. |
| CourtListener | https://github.com/freelawproject/courtlistener | Citator and authority graph design. |
| Juriscraper | https://github.com/freelawproject/juriscraper | Court adapter patterns. |
| Indian Supreme Court judgments | https://github.com/vanga/indian-supreme-court-judgments | CC-BY-4.0 dataset already used by `aws.ts`. |

### 3.7 Memory and knowledge

| Project | Link | Use |
|---|---|---|
| Graphiti | https://github.com/getzep/graphiti | Bi-temporal edges and invalidation. Model reference. |
| Mem0 | https://github.com/mem0ai/mem0 | Extraction and consolidation loop. |
| Letta | https://github.com/letta-ai/letta | Core memory blocks versus archival memory. |
| Basic Memory | https://github.com/basicmachines-co/basic-memory | Markdown plus SQLite graph. Local-first pattern. |
| MemOS | https://github.com/MemTensor/MemOS | Memory scheduling ideas. |
| LangMem | https://github.com/langchain-ai/langmem | Memory tool API shape. |
| Memori | https://github.com/MemoriLabs/Memori | SQL-native memory. |
| Kernel Memory | https://github.com/dluc/kernel-memory | Ingestion and partition abstraction. |
| Cognee | https://github.com/topoteretes/cognee | Extract, cognify, load pipelines. |
| mcp-memory-service | https://github.com/doobidoo/mcp-memory-service | Small local sqlite-vec memory service. Size reference. |
| Outline | https://github.com/outline/outline | Wiki information architecture. |
| Docmost | https://github.com/docmost/docmost | TypeScript team wiki. |
| Onyx | https://github.com/onyx-dot-app/onyx | Connectors and permissions. |
| RAGFlow | https://github.com/infiniflow/ragflow | Ingestion and chunk review UI. |
| Khoj | https://github.com/khoj-ai/khoj | Personal knowledgebase. |
| Paperless-ngx | https://github.com/paperless-ngx/paperless-ngx | Document intake. |

### 3.8 RAG algorithms and evaluation

| Project | Link | Use |
|---|---|---|
| GraphRAG | https://github.com/microsoft/graphrag | Community summaries. Algorithm reference only. |
| LightRAG | https://github.com/HKUDS/LightRAG | Incremental graph plus vector. Read the algorithm. |
| nano-graphrag | https://github.com/gusye1234/nano-graphrag | Small readable GraphRAG. |
| RAPTOR | https://github.com/parthsarthi03/raptor | Hierarchical summaries for long documents. |
| Late chunking | https://github.com/jina-ai/late-chunking | Embedding technique. |
| Chonkie | https://github.com/feyninc/chonkie | Chunking reference. |
| LegalBenchRAG | https://github.com/zeroentropy-ai/legalbenchrag | Legal retrieval evaluation design. |
| LegalBench | https://github.com/HazyResearch/legalbench | Task design. |
| RAGAS | https://github.com/vibrantlabsai/ragas | RAG metrics. |
| Promptfoo | https://github.com/promptfoo/promptfoo | Regression tests for retrieval and skills. |
| FlashRank | https://github.com/PrithivirajDamodaran/FlashRank | Reranker reference. |
| aiosnow | https://www.aiosnow.com/ | Repeatable agent workflow patterns. Use it for the workflow catalogue, not as a dependency. |

---

## 4. The model: eight areas, four stores, one facade

The owner named eight areas. They are not eight products and not eight databases. They are eight scopes over four stores and one retrieval facade.

| Area | Shape | Owner store | Text index | Graph | Vector | Change rule |
|---|---|---|---|---|---|---|
| 1. Advocate memory | Typed records with a lifecycle | `advocate.db` | filter | advocate-memory edges | optional | Advocate changes it; history kept |
| 2. Firm knowledge base | Files with front matter | `advocate.db` + blobs | FTS5 | document links | optional | Editable and shareable; revisions kept |
| 3. Statute intelligence | Versioned provision rows | `corpus.db` | FTS5 | amended by, interprets | not needed | Editable by re-check; versions kept |
| 4. Jurisdictional and procedural | Dated rule rows with applicability | `corpus.db` text; `intel.db` applicability | FTS5 | applies in | not needed | Editable by re-check; versions kept |
| 5. Matter intelligence | Anchored records | `matter.db` | Find | evidence graph | optional, inside one matter | Append only |
| 6. Research intelligence | Judgment paragraphs and propositions | `corpus.db` | FTS5 | citation and treatment edges | optional | Editable and shareable; versions kept |
| 7. Per-matter orchestrator | Session log plus a rebuilt posture | Session JSONL + `matter.db` | none | none | none | Append only |
| 8. Unified memory | One function over the adapters | No store | fused | walk | fused | Not applicable |

The rule is: **separate the files, unify the interface**. Each store keeps one writer and its own hash chain (decision 12). The agent sees one `retrieve` function and one `assemble` function. It never sees SQL, file paths or another matter's rows.

### 4.1 What combines

- One provision table for Acts, rules, regulations, notifications and practice directions.
- One Akoma Ntoso writer and reader for all of them.
- One edge table shape for the legal, matter and memory graphs.
- One vector table shape and one embedder interface.
- One retrieval function, one fusion rule and one policy.
- One verification routine: read the source now, normalize, hash, compare.
- One citation key format.
- One annotation and review model.

### 4.2 What stays separate

- Each matter's facts. No cross-matter retrieval of facts (architecture section 6).
- The firm database, each matter database and the session logs. Three kinds of file, three lifetimes.
- Law (shared, versioned, changeable) and facts (per matter, append-only).
- Confirmed records and candidates.
- Canonical records and derived indexes.
- The session log and the matter record. The log records what happened; the store records what is true.
- Firm knowledge (no client facts) and matter knowledge.
- Draft revisions and approved precedents.

---

## 5. Storage design

### 5.1 Firm database (`advocate.db`)

The owner asked for a firm database with advocate details, basic matter details and firm agent logs. The accepted `advocate.db` already owns the profile, preferences, advocate memory and the Knowledge Library. Add three things:

1. **`firm_matter`**: a small index, not the matter facts. Columns: `matter_id`, `title`, `stage`, `court`, `next_date`, `folder_path`, `status`, `created_at`, `updated_at`. The matter's own `matter.db` remains the truth. The firm row is a pointer for the Home dashboard and the matter list.
2. **`firm_agent_log`**: an append-only, hash-chained log of the Firm Agent's sessions. Columns: `seq`, `at`, `session_id`, `segment`, `actor`, `action`, `subject`, `data`, `prev_hash`, `hash`. The Firm Agent never writes matter facts. It proposes.
3. **`firm_edge`**: the advocate memory graph, with the same edge shape as the other two graphs.

The firm database also holds the Knowledge Library (`library_item` plus blobs), advocate memory records, preferences and source checks. It does not hold client facts. A firm-wide library may hold public law, templates, checklists, approved positions and commentary with the client identity removed. It may not hold matter facts.

### 5.2 Matter database (`matter.db`), append only

The owner's instruction is clear: each matter database is append only. The current code is not. It updates records in place and deletes rows in these places:

| Table | Current operation | Why it happens |
|---|---|---|
| `document_part` | `DELETE` before re-insert | Rebuilt index over a document |
| `matter_edge` | `DELETE` all, rebuild | Derived evidence graph |
| `page_mark` | `DELETE` before re-insert | Rebuilt page marks |
| `forum_clause` | `DELETE` before re-insert | Rebuilt extraction |
| `related_matter` | `DELETE` on removal | Relation removal |
| `record_cell` | `INSERT ... ON CONFLICT DO UPDATE`, `DELETE` on rejection | Review table cell |
| `lod_row` | `DELETE` all, rebuild | List-of-dates rows |
| `annexure` | `DELETE` all, rebuild | Annexure list |
| `find_fts` / `find_state` | `DELETE` and rebuild | Derived Find index |
| `fact`, `evidence`, `memory`, `review_item`, `review_item` status, `defect`, `reminder`, `argument`, `legal_issue`, `authority`, `limitation` | `UPDATE` status/fields | Decisions and corrections |

Making every table append-only is not a trigger change. It is an event-sourcing change. The design:

- Keep `event` as the canonical, hash-chained write log.
- For a record that can change, write a **decision row** (append) and project the current state in a view. Examples: `fact_decision`, `review_decision`, `memory_decision`, `cell_decision`, `relation_decision`.
- Replace `DELETE` + re-insert with a new **version set**: `document_part_set` with `set_id`, `built_from`, `built_at`, and `document_part` rows that belong to a set. The current set is a view. The old set stays.
- Replace `UPDATE` with a new row that has `supersedes` or `version`. The current row is a view.
- Keep rebuildable indexes (`find_fts`, `matter_edge` if it is derived) deletable. They own nothing. The owner's "append only" applies to records, not to derived indexes. State this explicitly in the spec.
- Add triggers that refuse `UPDATE` and `DELETE` on record tables. Add a test that tries both and expects `SQLITE_CONSTRAINT`.
- Add a `schema_version` migration. Do not rewrite an existing `matter.db` in place without a backup and a dry run.

This is a change to Phases 1 to 4. It needs the owner's acceptance. A staged migration is safer: first add append-only decision tables beside the current tables and write to both; then switch reads to the views; then remove the old writes. Do not delete the old data.

### 5.3 Session logs and compaction

The owner asked for three separate things: firm agent logs, matter agent session logs and a compaction rule. The design:

- **One JSONL file per session segment**, outside `matter.db`, under the matter folder: `sessions/<session-id>/<segment>.jsonl`. The firm agent uses `sessions/firm/<session-id>/<segment>.jsonl` under the user data folder.
- Each entry: `seq`, `at`, `session`, `segment`, `kind`, `data`, `prev_hash`, `hash`. Kinds: `segment_start`, `user`, `assistant`, `tool_call`, `tool_result`, `plan`, `approval`, `quote`, `verification`, `error`, `compaction`.
- **Compaction starts a new segment.** It writes a `compaction` entry with the summary, the token count and the reason. Then it writes a `segment_start` entry in a new file, with `resumes_from` set to the previous segment's last hash. It never edits or deletes the old file.
- The model context uses the latest summary plus the recent entries. The log keeps everything. The UI shows "compacted at <time>" and can expand the old segment.
- The session log is not the truth. On resume, rebuild the case posture from `matter.db`; use the log only for the conversation and the audit.
- The matter agent session is append-only. The firm agent session is append-only. Skill runs and helpers get their own sessions and their own logs. They link by ids.
- If a secret appears in a log, do not rewrite the log. Redact at read time and record the redaction. The log is evidence.

### 5.4 `corpus.db` and `intel.db`

- `corpus.db` holds law: instruments, provisions, parts, events, checks, judgments, paragraphs, citations, treatment edges, propositions, law-only research notes and vectors. It is changeable and shareable. A change adds a version; it never overwrites the words of an earlier version.
- `intel.db` holds courts, benches, case types, packs, filing checks, source rows and freshness. It does not duplicate the text of a rule. It points to the provision row in `corpus.db`.
- The current `corpus.db` has a `judgment` metadata table and `judgment_fts`. The Phase 5 `LawStore` adds `judgment_identity` and `judgment_para`. Use one file. Migrate the old metadata into the new tables, or keep the old table as a compatibility view. Do not create a second `law.db`.
- `intel.db` already has `source` rows with `valid_from`, `valid_until`, `retrieved_at`, `checked_by`. Reuse them. Do not add a second source registry.

### 5.5 Sharing and the network boundary

SQLite over a network share is unsafe. File locking over SMB or NFS is not reliable for a write-ahead log. For a chamber, do not open the same `corpus.db` from two machines. Share **packages**, not live database files:

```
package/
  manifest.json          # set id, built_at, instruments, counts, hashes
  akn/<instrument>.xml   # Akoma Ntoso export
  rows/<instrument>.jsonl
  pdf/<instrument>.pdf   # optional, for offline verification
```

The recipient imports the package into its own `corpus.db`, verifies the hashes, and records the set id. A later update is a new package. The firm library can use the same package shape. Matter files never enter a shared package.

### 5.6 What the owner can change

| Thing | Changeable? | How |
|---|---|---|
| Statutes and rules | Yes | Re-check the source; a change adds a version |
| Research notes and memos | Yes | New revision; the old revision stays |
| Firm knowledge base | Yes | New revision; approved items are marked |
| Advocate memory | Yes | Confirm, supersede, expire; history kept |
| Matter facts | No, append only | Correct by a new fact that supersedes the old one |
| Session logs | No, append only | Compaction starts a new segment |
| Draft revisions | No, append only | A new revision for each change |
| Review annotations | Status changes only | `open`, `sent`, `accepted`, `rejected`, `withdrawn`; no delete |

---

## 6. Statute intelligence

### 6.1 The source comparison

| Source | What it gives | What it does not give | Verdict |
|---|---|---|---|
| India Code "Acts" collection | Act metadata, section records, schedules, footnotes, Act PDF and text extract | Chapter field; reliable amendment dates; repealed codes as sections | Primary source for Acts in force |
| India Code "Repeal Acts" collection | Repealed central Acts as Act PDF plus text extract | Section records; reliable OCR | Primary source for repealed codes |
| India Code "Spent Acts", "Acts Not Enforced" | Lists and PDFs | Section text | Use by name when needed |
| Nyaykosh | 4 Acts as PDF, XML and API; compliance rules and penalties | Enacted text (summaries only); current law beyond 4 Acts | Pointer for compliance rules only |
| High Court and Supreme Court PDFs | Rules, practice directions, amendments | Machine structure | Primary source for procedure |
| A third-party paid API | Convenience, normalized data | Official status, provenance | Do not use as a source of law |

### 6.2 The India Code adapter

The adapter is a read-only client over DSpace 9. It does not scrape the rendered Angular page.

```
findCentralAct(title)
  -> GET /server/api/discover/search/objects?query=dc.title:"<title>"&dsoType=ITEM&size=20
  -> keep the item with dc.identifier.state_name == "CENTRAL" and collection == "ACT"

fetchAct(uuid)
  -> GET /server/api/core/items/<uuid>                    # act metadata
  -> GET /server/api/discover/search/objects
         ?query=dc.identifier.act_id:"<act_id>"&dsoType=ITEM&size=100&page=n
  -> for each item: provisionOf(actRef, item)
  -> sort by order_number, then section number

fetchActFiles(uuid)
  -> GET /server/api/core/items/<uuid>/bundles?embed=bitstreams
  -> keep ORIGINAL (PDF) and TEXT (extracted text) and their checksums
```

Rules:

- Exclude State copies by `dc.identifier.state_name == "CENTRAL"`. A State copy may carry State amendments. It is a separate Act, not a replacement.
- Do not trust `dc.date.last_modified`. It is stale. Compare the bitstream checksum and the PDF.
- Keep the source's own words. `section_page_note` is HTML; normalize it the same way every time. Store the normalized text and its SHA-256.
- The `TEXT` bundle is a convenience. It can have OCR errors. It is not the source of truth.
- Respect the site. One request at a time, a pause between requests, a user agent, no parallel crawl. The site is a public service.

### 6.3 Chapter and part mapping

India Code gives no chapter field on a section. The Act item's `dc.identifier.no_of_chapter` is unreliable: it is 0 for the Contract Act, which has chapters. Therefore:

1. Parse the Act PDF's "ARRANGEMENT OF SECTIONS" or table of contents. It lists `CHAPTER I`, the chapter title, and the section numbers in that chapter.
2. Build a `chapter_map` for the Act: chapter number, title, first section, last section, source page, source hash.
3. Join each provision to its chapter by its position in the map. If two maps disagree, mark the provision `chapter_unmapped`.
4. For 20-30 Acts, a small curated map is acceptable. Each entry carries the PDF page and the quote that names the chapter. The map is data, not code.
5. For court rules, the PDF's own "Index" or "Contents" gives Parts, Chapters, Orders and rule ranges. Parse it the same way.

Never infer a chapter from a section number. A wrong chapter is worse than no chapter.

### 6.4 The citation key

The citation key is structured, not a concatenated display string. It is the chunk id and the audit key.

```
{
  "instrument": "ic:0e782442-f035-4d53-aace-81b1552a8cf2",
  "kind": "section",
  "number": "16",
  "chapter": "II",
  "part": null,
  "sub": "(2)",
  "clause": "(a)",
  "proviso": null,
  "version": 1
}
```

Display: `Section 16(2)(a), The Indian Contract Act, 1872`.

Machine key: `ic:0e782442-f035-4d53-aace-81b1552a8cf2#section:16#sub:(2)#clause:(a)#v1`.

For the Supreme Court Rules: `{instrument:"sc-rules-2013", part:"II", order:"XXI", rule:"1", sub:"(1)"}`. Display: `Order XXI Rule 1(1), Supreme Court Rules, 2013`.

For a High Court rule: `{instrument:"dhc-os-rules-2018", chapter:"VII", rule:"3", sub:"(1)"}`. Display: `Rule 3(1), Chapter VII, Delhi High Court (Original Side) Rules, 2018`.

The key is stable across re-parsing if the section number and the part path are the same. The version changes when the text changes. The anchor is the key plus the source page and line.

### 6.5 Provision parts

`provisionParts` already reads sub-sections, clauses, sub-clauses, provisos, explanations, illustrations and exceptions by rule. Use it to create `provision_part` rows:

| Column | Meaning |
|---|---|
| `part_id` | Stable id: `<provision id>#p<ordinal>` |
| `provision_id` | The section or rule |
| `kind` | `intro`, `subsection`, `clause`, `subclause`, `proviso`, `explanation`, `illustration`, `exception`, `text` |
| `num` | `(1)`, `(a)`, `(i)`, `Explanation 1`, or empty |
| `level` | 0 to 3 |
| `text` | The part's exact text |
| `text_hash` | SHA-256 of the normalized text |
| `ord` | Order in the provision |

The retrieval unit is the part when the question names a sub-provision, and the whole provision when it does not. The model gets the whole provision as parent context and the part as the precise citation (the parent-child pattern from WeKnora). The quote must come from the part.

### 6.6 Amendment events and part anchors

The current `footnoteEvents` reads the footnotes and creates events. It now carries `scope` and `part`. This is the minimum. The full design needs a marker anchor:

- India Code's section HTML has `<sup>1</sup>`, `<sup>2</sup>`, ... markers inside the text. Each marker points to a footnote.
- Parse the marker positions. A marker after a clause belongs to that clause. A marker at the start of the section belongs to the whole section.
- Store `event.marker`, `event.part_ref` and `event.part_text`. If the marker cannot be placed, set `scope: "part"` and `part_ref: null`; the event is visible but does not decide the whole provision.
- The in-force evaluator uses only whole-provision events. It reports part-level events separately.
- Add a test for a section with a whole-section substitution and a clause-level insertion (the Contract Act s.28 case). The answer before the substitution is `undetermined`; after it is `in_force`.

Do not guess. A wrong amendment date is worse than "undetermined".

### 6.7 The repealed codes

The owner said the IPC, CrPC and Evidence Act would come from the repealed Acts in India Code. The owner is right. The correct path is:

```
findRepealedAct(titleStart)
  -> discover the CENTRAL community
  -> discover its "Repeal Acts" collection
  -> search that scope by title
  -> item -> ORIGINAL PDF + TEXT extract

parseRepealedAct(pdf, text)
  -> read the PDF's own arrangement of sections and chapters
  -> cut sections at their printed numbers
  -> keep page and line anchors
  -> OCR only where the text layer is missing; record the engine and confidence
  -> compare the text layer with a second OCR if the quote is critical
  -> store rows with sourceRef = item uuid, sourceUrl = handle, pdfSha256, textSha256
```

Facts from the live test:

| Act | Item | PDF | Text | Notes |
|---|---|---|---|---|
| IPC, 1860 | `972afbe0-a2de-415d-9df5-8d70038056ad` | `A1860-45.pdf`, 1.10 MB | `A1860-45.pdf.txt`, 101 KB | Text has the arrangement and chapters; OCR is readable but not perfect |
| CrPC, 1973 | `973d60aa-105c-4a2f-94f1-7640f0b5d6a7` | `1974-2.pdf`, 8.96 MB | `1974-2.pdf.txt`, 681 KB | OCR errors: "Cfilef", "Ma2is•trate", "Chie:t" |
| Evidence Act, 1872 | `b62073e0-4d33-4348-8eda-d92af40af24b` | `A1872-1.pdf`, 640 KB | `A1872-1.pdf.txt`, 101 KB | Text has the arrangement and chapters |

The PDF is the source. The text extract is a hint. For a quote that will be cited, show the page image beside the extracted line and mark the reading `text_layer` or `ocr` with the engine and confidence. The advocate confirms a quote that will be filed.

The repeal date is not in the title. The title names the repealing Act ("Rep., Act 45 of 2023"). The adapter can record `repealedBy` and leave `repealedOn` null until the repealing Act's commencement is in the library. The in-force evaluator returns `undetermined` until the date is known. Do not infer 1 July 2024 from memory.

### 6.8 The crosswalk (IPC to BNS, CrPC to BNSS, Evidence Act to BSA)

No official machine-readable table was found. The crosswalk is a proposal, not law:

- Match headings and opening words; give every candidate a score and a basis.
- Show the old section and the new section side by side, with both texts.
- The advocate confirms or rejects each link. No link ships as confirmed.
- A confirmed link is a `crosswalk` row with `author`, `createdAt`, `basis`, `similarity`, `status`.
- The retrieval adapter returns the confirmed link when the governing date spans the repeal, and says "the old section is repealed; the new section is proposed, not confirmed" until the advocate confirms.

The current `proposeCrosswalk` returns candidates with a score. Keep it. Do not let a score become a legal conclusion.

### 6.9 Verification at the time of use

Every law row carries:

| Field | Meaning |
|---|---|
| `source` | `indiacode`, `indiacode_repealed`, `upload`, `akn`, `set` |
| `source_ref` | The India Code item uuid, the bitstream uuid, or the file SHA-256 |
| `source_url` | The URL the advocate can open |
| `retrieved_at` | When the text was read |
| `text_hash` | SHA-256 of the normalized text |
| `checked_at` | When it was last checked |
| `check_state` | `never`, `verified`, `changed`, `unreachable` |
| `check_interval_days` | How often to check |
| `stale` | Derived: `checked_at` is older than the interval, or never |

The check:

1. If the row is fresh, return it with `verified`.
2. If it is stale, re-read the exact source:
   - India Code section: `GET /core/items/<uuid>`; run `provisionOf`; normalize; hash.
   - India Code Act PDF: `GET /core/bitstreams/<uuid>/content`; hash the bytes; compare the PDF checksum; if the PDF changed, parse again and diff the rows.
   - Repealed Act: the same, plus the TEXT extract hash.
   - Court rules PDF: `GET <source_url>`; hash the file; if it changed, parse again and diff.
3. Compare:
   - Same text: `verified`.
   - Different text: store a new version, close the old one, return `changed` with the new version and a diff summary.
   - Cannot reach: `unreachable`. The row stays as it was. The hit is `unconfirmed`.
4. Record the check in `statute_check` (append-only). Record the event in the store chain.
5. The UI shows the state on the hit and on the provision. A filing or a citation output that depends on `unconfirmed` is blocked (ruling R-4). A research note can show it with a warning.

The check is per row, not per set. A set check can run in the background and report counts. The user sees "28 Acts; 27 verified; 1 changed; 0 unreachable" and can open the one that changed.

### 6.10 Static sets

A static set is a manifest plus optional rows and PDFs. It is not a copy of the truth. The manifest:

```json
{
  "set": "phase5-core",
  "built_at": "2026-11-16T00:00:00Z",
  "instruments": [
    {
      "id": "ic:0e782442-f035-4d53-aace-81b1552a8cf2",
      "title": "The Indian Contract Act, 1872",
      "source": "indiacode",
      "sourceRef": "0e782442-f035-4d53-aace-81b1552a8cf2",
      "sourceUrl": "https://indiacode.gov.in/handle/123456789/496413",
      "pdfSha256": "...",
      "textSha256": "...",
      "provisions": 270,
      "checkedAt": "2026-11-16T00:00:00Z"
    }
  ]
}
```

At use, verify the row's source. If the source is unreachable, the set does not turn "unreachable" into "verified".

### 6.11 Akoma Ntoso and LegalDocML

Akoma Ntoso 3.0 is the exchange form. The rows are the record. The XML carries:

- FRBR Work, Expression and Manifestation. Work URI: `/akn/in/act/1872/9`. Expression: `/akn/in/act/1872/9/eng@2026-11-16`.
- `eId` per provision: `sec_16`, `sec_16__subsec_2`, `sec_16__subsec_2__para_a`.
- The lifecycle: enactment, commencement, amendments, repeals, with the source quote.
- The body: `section`, `subsection`, `paragraph`, `subparagraph`, `hcontainer`, `num`, `heading`, `content`, `intro`, `wrapUp`.
- The provenance block: `oa:instrument` and one `oa:provision` per provision, with `sourceRef`, `sourceUrl`, `sha256` and the canonical text.
- The notes: the source footnotes.

The round-trip contract:

```
for every provision:
  xml = toAkn(rows)
  back = parseAkn(xml)
  back.provision.text == row.text
  back.provision.textHash == row.textHash
```

The current writer now carries the canonical text in `oa:text`, so the contract holds. A future writer that reconstructs text from the body must pass the same test. Do not use the XML as the primary store. Do not parse arbitrary third-party Akoma Ntoso with regular expressions; use a real XML parser and validate against the schema at build time.

LegalDocML is the standard family. Akoma Ntoso is the document vocabulary. LegalRuleML is for rules. Do not encode obligations and penalties in LegalRuleML in Phase 5. Keep the text, the metadata and a separate rule table. The Nyaykosh compliance rules are a pointer, not a source.

### 6.12 Obligations and penalties

The Nyaykosh description promises "a rule base of obligations and penalties". That is a useful second layer, but it is not the statute. Build it as a typed table over the text, with the advocate's confirmation:

| Column | Meaning |
|---|---|
| `rule_id` | Stable id |
| `instrument_id`, `provision` | The provision the rule comes from |
| `persona` | Who the rule addresses: user, operator, employer, public servant, company |
| `condition` | The triggering facts, in plain words |
| `effect` | What must be done, or must not be done |
| `penalty` | The consequence, with its provision |
| `quote` | The exact words of the source |
| `status` | `proposed`, `confirmed`, `rejected`, `superseded` |
| `author` | `advocate`, `agent`, `system` |
| `source` | The provision and the check state |

Rules:

- The rule is an index over the text, not a replacement. A rule without a quote is not shown.
- A model may propose a rule. The advocate confirms it. No rule is shipped as law on a model's word.
- Nyaykosh's 4 Acts can seed candidates. They are summaries; the quote must come from the Act.
- The rule table is separate from the provision table. It can be exported to LegalRuleML later if a consumer needs it. It is not the source of truth.
- A penalty rule that is stale or whose provision changed is `unconfirmed`, not silently updated.

The three forms of the same law are: rows (text and identity), Akoma Ntoso (document and exchange), and the rule table (obligations and penalties). The rows are the truth.

---

## 7. Procedural intelligence

### 7.1 What it holds

- The Supreme Court Rules, 2013: Parts I to IX, Orders I to LVII, Schedules and Forms, plus the 2024 and 2025 amendment notifications.
- The High Court rules: for the first courts, the Delhi High Court Original Side Rules, 2018, and the Delhi High Court Rules and Orders, Volume V, plus practice directions and amendments.
- The rule that a High Court's rules govern its district courts. Store `jurisdiction` and `applies_to` separately: `jurisdiction = "High Court of Delhi"`, `applies_to = "District courts of Delhi"`.
- Practice directions, circulars and notifications. They are instruments of kind `practice_direction` or `notification`. They can apply to a court or a case type.

### 7.2 The PDF pipeline

```
download the PDF from the official page
  -> record the URL, the retrieval time and the SHA-256
  -> read the text layer (pdfjs)
  -> if the text layer is missing or poor, OCR with Tesseract; use docTR as the second engine
  -> split into lines with page and line numbers
  -> parse the table of contents (Index / Contents / Arrangement)
  -> parse Parts, Chapters, Orders, Rules and sub-rules by their printed numbers
  -> attach each rule to its Part/Chapter/Order
  -> store rows with page and line anchors
  -> store the file hash and the set hash
```

Rules for the parser:

- A rule starts at a line that begins with a number and a dot, or "Rule N", inside the current chapter or order. A sub-rule starts with `(1)`, `(2)`. A clause starts with `(a)`, `(b)`. A proviso starts with "Provided". An explanation starts with "Explanation".
- A page header or footer is not a rule. Strip it by matching the running header against the document title.
- A table of contents line is not the rule text. It only builds the map.
- A schedule or a form is its own provision. Do not cut it into token windows.
- If the parser cannot decide, it emits a `parse_issue` row with the page, line and the reason. The UI shows it. Do not silently skip.
- The file hash is the set identity. If the file changes, parse again and diff. A changed rule is a new version. A removed rule is a status change, not a delete.

### 7.3 The applicability evaluator

The evaluator is small and deterministic. It answers: "Which rule applies to this court, this case type and this date?"

Inputs: court, case type, date, instrument kind, jurisdiction, `applies_to`, `valid_from`, `valid_until`, conditions.

Output: the rule rows, the citation keys, the source, the check state, and `undetermined` when a condition cannot be settled.

Do not build a rules DSL. A DSL adds a translation layer the advocate cannot audit. Store the rule text and a small set of typed conditions: `court`, `case_type`, `stage`, `party`, `document_kind`, `days`. If a rule is not reducible to those, return the text and let the advocate read it.

### 7.4 The first sets

For Phase 5, ship:

1. The Supreme Court Rules, 2013, with the 2024 and 2025 amendments as separate instruments.
2. The Delhi High Court Original Side Rules, 2018, with the 2018 and 2025 amendments.
3. The Delhi High Court Rules and Orders, Volume V, as chapter PDFs.
4. The IPC, CrPC and Evidence Act from the Repeal Acts collection.
5. The BNS, BNSS and BSA from the central Acts collection.

This matches questions Q-1 (the Supreme Court, the Delhi High Court and the Delhi district courts) and gives one complete research question at the Phase 5 exit.

### 7.5 What procedural intelligence gives the other areas

- Statute intelligence: the same provision table, the same AKN writer, the same verification.
- Matter intelligence: the applicable rule for the matter's court, stage and date; the limitation and route checks; the filing checklist.
- Research intelligence: the rule that a judgment interprets; the court hierarchy for binding effect.
- Drafting: the rule that prescribes the form, the limitation and the filing requirement.
- The unified memory: the procedure adapter returns hits with the same shape as the statute and research adapters.

---

## 8. Research intelligence

### 8.1 Judgment paragraphs

A judgment is stored as identity plus paragraphs. A paragraph is the unit an advocate cites. Do not chunk by tokens. A paragraph that is too long for the model splits at sentence boundaries, with the paragraph as the citation and the sentence window as the reading. The parent is the judgment; the child is the paragraph.

The paragraph record: `judgment_id`, `para`, `label` (as printed), `page`, `line`, `text`, `role` (ratio, obiter, submission, lower court, dissent, concurrence, facts, direction), `role_status` (candidate or confirmed). The role is a candidate until the advocate confirms.

### 8.2 Citations and treatments

The graph is built from the judgment's own words, not from a model's entity extraction:

- `findCitations` reads Indian reporters and neutral citations: SCC, AIR, SCR, INSC, SCC OnLine, High Court neutral, SCALE, JT, CriLJ.
- `findProvisions` reads "Section 138 of the Negotiable Instruments Act, 1881", "Article 226 of the Constitution", "Section 482 of the Cr.P.C.", "Order XXI Rule 1".
- `edgesOf` adds `cites` for every citation and a treatment edge (`follows`, `distinguishes`, `overrules`, `doubts`, `refers_to_larger_bench`, `affirms`, `reverses`, `modifies`, `per_incuriam`) when the treatment word is in the same sentence. A submission of counsel yields `cites` only.
- Every edge keeps the paragraph and the sentence. It is a candidate until the advocate confirms.
- The graph is high precision and auditable. Do not use GraphRAG entity extraction for "what binds me". Use it, if at all, for commentary and fact patterns, and mark it as a candidate.

**The four graphs, and what each is for.**

| Graph | Nodes | Edges | Answers | Never used for |
|---|---|---|---|---|
| Citation and treatment | judgment, paragraph, citation, provision, proposition | cites, follows, distinguishes, overrules, doubts, refers to a larger bench, affirms, reverses, modifies, per incuriam, interprets | What binds me; what later changed; which paragraph states it | Facts of a matter; a model's summary of a holding |
| Matter evidence | party, event, document, page, line, exhibit, witness, statement, fact, allegation, issue, argument, relief, draft paragraph | supports, contradicts, admits, denies, depends on, relies on, attacks, derived from, proves element | What happened; what supports or contradicts an issue; which document proves it | Law; another matter |
| Advocate memory | advocate, court, practice area, preference, skill, precedent, workflow, decision, lesson | prefers, rejected, approved, supersedes, used in, succeeded when, failed because | How this advocate works; what was rejected before; which court practice applies | Case facts; a substitute for the matter record |
| Firm knowledge | document, collection, template, checklist, author, court, practice area | part of, applies to, cites, supersedes | Which template or checklist applies; what the firm approved | Any client fact; any matter record |

A **wiki graph** (the WeKnora pattern) is a document-link graph. It belongs in the firm knowledge scope. It is not an authority graph. A **Harvey-style entity graph** is not publicly documented; do not copy a proprietary schema. The public product material does not disclose its graph design. The four graphs above are the ones the product can build, verify and explain. GraphRAG-style entity extraction is an optional commentary tool, never the source of "what binds me".

### 8.3 Binding effect, conflicts and propositions

- Binding effect is a fact with reasons: court hierarchy, territory, bench strength, coordinate benches, larger benches, prospective overruling. The result is `binding`, `persuasive`, `not_binding` or `undetermined`, with the unresolved facts listed. No judge profiles (decision 18).
- Conflicts: decisions in conflict across benches or High Courts, and references pending before larger benches. Open review items. Do not resolve them silently.
- Propositions: a legal proposition, its supporting passages, its adverse passages, the provisions it interprets, the date it was verified and its status. A proposition is a record, not a chat answer.

### 8.4 The quote-first pipeline

This is the core of "cite the exact provision".

```
question
  -> plan: sub-questions, modes, scopes, governing date, court
  -> retrieve: exact + FTS5 + graph + optional vector; candidates with citation keys
  -> select quotes: the model returns only exact spans from the candidates
  -> verify quotes: server locates each span in the source text; records offsets and hash
  -> reason: the model sees only verified quotes and citation keys
  -> verify citations: key exists, quote is inside the cited part, the part is in force on the date,
     the authority is binding or persuasive as stated, the treatment is not overruled
  -> review: the advocate reads the quotes and the verification badges
  -> deliver: a memo or matrix with quote-level citations
```

Rules:

- The model never names a source. The server gives each candidate a reference (`P1`, `P2`, ...). The model cites only those references. The server joins them back to real rows in code.
- A quote is matched with whitespace tolerance. A quote that cannot be located is kept and marked `unverified`. It is never silently dropped. The user sees the claim and the fact that it is ungrounded.
- A quote shorter than 12 characters is not verified; it is too short to be evidence.
- The reasoning step gets the quote and the citation key, not the whole corpus.
- The citation verifier is deterministic first. A model may explain a mismatch; it may not certify its own quote.
- A stale or unreachable source makes the quote `unconfirmed`. A filing output that depends on it is blocked.
- The run is recorded: question, plan, hits, quotes, verifier results, model, prompt version, times. The record is append-only in the matter or session log.

### 8.5 The multi-agent workflow

The owner proposed: fact extraction -> retrieval -> quote selection -> reasoning -> citation verifier. That is the right shape. Implement it as roles in one skill run, not as five long-lived agents:

| Role | Input | Output | May write? |
|---|---|---|---|
| Fact extraction | Matter documents, anchors | Proposed facts with quotes | No; proposes records |
| Retrieval | Sub-question, date, court | Candidate passages with citation keys | No |
| Quote selection | Candidates | JSON quotes with refs and spans | No |
| Reasoning | Verified quotes, citation keys | Propositions, adverse points, open questions | No |
| Citation verifier | Propositions, quotes, sources | `verified`, `unverified`, `contradicted`, `stale`, `out_of_scope` | No; writes a verification record |
| Orchestrator | The question and the plan | The run state, the step log, the review gate | Writes only the run record |

The Matter Agent is the orchestrator. Helpers get a scoped context and a tool list. The Firm Agent can propose a plan or a cross-matter lesson; it cannot confirm a fact. The verifier can use a different model family from the reasoner. No role approves its own run (architecture section 7).

### 8.6 Research modes and coverage

The modes map to the features:

- `citation`: exact lookup of a reporter or neutral citation.
- `phrase`: FTS5 phrase, no vectors.
- `boolean`: FTS5 boolean, with a parser that always produces a valid expression.
- `statute`: exact provision + the judgments that interpret it (graph).
- `paragraph`: a paragraph by judgment and number.
- `proposition`: a proposition and its passages.
- `connected`: a graph walk from a judgment, provision or issue.
- `historical`: the law on a governing date.
- `cross_jurisdiction`: the same question in another court.
- `fact_pattern`: semantic and phrase search over judgments and the matter.
- `party`, `judge`, `court`: metadata filters.
- `natural`: all scopes, fused.

Every result states what was not searched and why. A research memorandum ends with the coverage: issues with no authority, authorities not checked, sources not reached. Completeness is a feature, not a disclaimer.

### 8.7 Adverse authority

Negative search is a separate step, not a filter on the positive search:

- For each issue, search the opposite terms, the contrary results and the treatments (`distinguishes`, `overrules`, `doubts`).
- Search the courts that can bind or persuade, and the later judgments that treatment the authority.
- Return the adverse hits with the reason and the quote.
- The memo lists the adverse authority even when the advocate disagrees with it. The advocate decides.

---

## 9. Vector and graph options: the full quadrant

### 9.1 Vector options

| Option | Shape | Local, no Docker | Windows + Node | Licence | Measured / known | Verdict |
|---|---|---|---|---|---|---|
| SQLite FTS5 | Full text, BM25 | Yes | Yes, built in | Public domain (SQLite) | Good for exact phrases and citations | Default |
| Flat TypeScript index | Exact cosine over a Float32 array | Yes | Yes | Our code | 10-17 ms at 20k; 34-43 ms at 100k | Default when vectors are on |
| sqlite-vec 0.1.9 | SQLite extension, `vec0` | Yes | Yes, extension load tested | MIT OR Apache (npm) | 8.2 ms at 20k; pre-v1; no ANN; BigInt rowid | Optional |
| usearch 2.26.5 | HNSW, quantization | Yes | Native addon | Apache-2.0 | Fast; native binary | Benchmark at 200k-1M |
| LanceDB 0.41 | Embedded Lance columnar, FTS + vector + RRF | Yes | Yes, 355 MB Windows package | Apache-2.0 | Hybrid in one engine; heavy | Alternative only |
| Qdrant | Server, HNSW | Server; Edge is Python/Rust | Node client needs a server | Apache-2.0 | Mature server; Edge beta | Reject for Phase 5 |
| Qdrant local mode | Python in-process | Python only | No | Apache-2.0 | <20k, brute force, single process | Reject |
| Chroma | Client/server | Server | JS client needs a server | Apache-2.0 | Simple API; server | Reject |
| Milvus | Server | Server | No | Apache-2.0 | Scale; heavy | Reject |
| Weaviate | Server | Server | No | BSD-3 / Weaviate licence | Hybrid; server | Reject |
| pgvector | PostgreSQL extension | Server | No | PostgreSQL | SQL + vector | Reject |
| DuckDB VSS | Embedded columnar | Yes | Native | MIT | Another engine | Reject |
| Orama | Pure TypeScript, full-text + vector | Yes | Yes | Apache-2.0 | In-memory; persistence plugin | Reference |
| Vectra | Local file index | Yes | Yes | MIT | Older; no hybrid | Reference |
| hnswlib-node | HNSW native | Yes | Native addon | Apache-2.0 | Fast; build toolchain | Benchmark only |
| FAISS | Native library | Yes | Bindings vary | MIT | Research-grade | Reject for this stack |
| Tantivy | Rust full-text | Yes | Rust | MIT | Fast FTS | Reject unless FTS5 fails |

### 9.2 Graph options

| Option | Shape | Local, no Docker | Windows + Node | Licence | Verdict |
|---|---|---|---|---|---|
| SQLite edge table + recursive CTE | Relational graph | Yes | Yes | Public domain | Accepted default |
| LadybugDB 0.22.3 | Embedded property graph, Cypher, FTS, HNSW | Yes | Yes, tested | MIT | Optional derived index |
| Kuzu | Embedded property graph | Yes | Yes | MIT | Archived 2025-10-10. Reject |
| Oxigraph | RDF/SPARQL | Yes | Rust/JS/WASM | Apache-2.0 | Standards export only |
| Quadstore | RDF quads on LevelDB | Yes | Yes | MIT | Another store. Reject |
| Neo4j | Server | Server/Docker | Driver | GPL/Commercial | Reject |
| Memgraph | Server | Server/Docker | Driver | BSL | Reject |
| FalkorDB | Server | Server/Docker | Driver | SSPL | Reject |
| graphology | In-memory graph | Yes | Yes | MIT | Analytics and layout only |
| Apache Jena TDB | RDF store | Java | No | Apache-2.0 | Reject |
| Blazegraph | RDF store | Java | No | GPL-2.0 | Reject |
| NetworkX | Python graph | Yes | No | BSD-3 | Offline analytics only |

### 9.3 The measured thresholds

The flat TypeScript index is exact, simple and fast enough for Phase 5. On this machine, at 384 dimensions:

| Vectors | Query | Array memory |
|---|---|---|
| 20,000 | 10-17 ms | 31 MB |
| 50,000 | 17-30 ms | 77 MB |
| 100,000 | 34-43 ms | 154 MB |
| 1,000,000 | about 350-430 ms | about 1.5 GB |

sqlite-vec is 8.2 ms at 20,000. It does not beat the flat index enough to justify a native extension, a pre-v1 API and a BigInt rowid rule in Phase 5. At 100,000 to 1,000,000 vectors, or when the corpus spans many High Courts, run a benchmark of usearch, LanceDB and sqlite-vec on the target laptop. Choose on p95 latency, memory, rebuild time and packaging size, not on stars.

### 9.4 LadybugDB: the deep dive

What it is: an embedded property graph database, formerly Kuzu, MIT. Cypher. Columnar disk storage. Native full-text search (including Hindi and Tamil stemmers) and a native HNSW vector index. Node package `@ladybugdb/core` 0.22.3; Windows x64 binary 15.6 MB unpacked.

The spike: it opened a `.lbug` file on Windows, created a node table, inserted a row, and read it back. No server, no Docker. It is a credible local engine.

Why it is not the default:

1. **It is a second store.** Decisions 12 and 13 make SQLite the canonical store and the edge table the graph. Adopting LadybugDB as the runtime would create a second file with its own schema, transactions, backups and verification. The canonical rows would have to be copied into it on every change.
2. **The graph queries are small.** Our walks are two or three hops: a judgment cites a judgment, a provision interprets a judgment, a fact supports an issue. A recursive CTE with indexes handles that. A columnar graph engine matters at millions of edges and deep traversals, not at 100,000 edges and three hops.
3. **One writer.** LadybugDB allows one read-write `Database` object per process. Our Electron main process is one writer, so that fits. But it is another lifecycle to manage beside SQLite.
4. **It duplicates FTS and vectors.** It has both, which is attractive. But then the app has two full-text indexes and two vector indexes, and they can disagree. One index per purpose is safer.

When to revisit: if a measured corpus graph query (for example, "all later judgments that treatment this authority, transitively, with the treatment path") takes more than 200 ms at 1M edges on the target laptop, or if the graph needs variable-length paths with path predicates that a CTE cannot express cleanly. Then add LadybugDB as a **derived index** behind an adapter, rebuilt from `corpus.db`, never as a source. The adapter would export the edge table and the paragraph text, build the graph, and answer only graph queries. The SQLite rows remain the truth.

### 9.5 Qdrant: the deep dive

Qdrant is a strong vector database. It is not the right fit here:

- The Node client talks to a server. The server is normally Docker. The owner's first preference is local, no Docker.
- Qdrant Edge is the in-process engine, but it is beta and its bindings are Python and Rust. There is no Node binding.
- Qdrant local mode is a Python client feature. It is for development and small data (<20k), and its data format is not the server format.
- A server would add a port, a process, a backup, a security surface and a second store. That contradicts decisions 8, 9, 12 and 13.

If the corpus ever needs a shared multi-user vector service, Qdrant is a good candidate. That is a phase 12 or later decision, not Phase 5.

### 9.6 LanceDB, usearch, sqlite-vec and Orama

- **LanceDB** is the closest single-engine alternative: embedded, Node, full-text (BM25), vector, hybrid with RRF, versioned datasets. The cost is the 355.8 MB Windows package and a second storage format. It is the first benchmark if the flat index and FTS5 are not enough. It is not the default.
- **usearch** is the first native ANN candidate: Apache-2.0, Node, HNSW, quantization. It is smaller than LanceDB and faster at large scale. It is a native binary, so it must sit behind one module that selects the platform binary and fails cleanly.
- **sqlite-vec** is the smallest integration: one extension, loaded into the existing SQLite connection. It is pre-v1. The `node:sqlite` binding passes numbers as REAL, so the `rowid` must be a BigInt; this is a real trap. It is a good optional engine for per-matter or per-advocate scopes, not the corpus default.
- **Orama** is pure TypeScript, with full-text and vector in one in-memory index. It is attractive for a small, ephemeral index. It duplicates FTS5, has no SQL joins, and persistence is a plugin. Use it as a reference, not a store.
- **Vectra** is a local file index. It is older, has no hybrid, and does not solve a problem FTS5 plus the flat index does not solve.

### 9.7 What would change the decisions

- A measured recall failure of FTS5 plus the graph on the owner's 50-query set. Then add a vector engine.
- A measured p95 over 200 ms for a graph query at the target corpus size. Then add LadybugDB as a derived index.
- A corpus over 1M paragraphs. Then benchmark usearch and LanceDB.
- A chamber with several machines writing the same law corpus. Then a sync service or a server; not a SQLite file on a network share.
- A need to exchange law with another tool. Akoma Ntoso is the answer; the XML export already exists.

### 9.8 Long documents and large datasets

A 100+ page case file or judgment is not a vector problem. It is a structure and anchoring problem. A 100,000-1,000,000 judgment dataset is a partitioning problem. The same pipeline serves both, but the index layout changes.

#### 9.8.1 A 100+ page case file

Index the document at its own parts, not at page length:

| Level | What it is | Use |
|---|---|---|
| Document | The plaint, written statement, affidavit, annexure, exhibit, deposition, order or judgment | Route the query to the right document |
| Part | A heading, an exhibit, a numbered pleading paragraph, a deposition question | Filter and group |
| Page and line | The exact place in the PDF or scan | Open at the page; quote |
| Passage | The sentence or paragraph the model reads | Retrieve and quote |

The page is an anchor, not a chunk. A 100-page file typically has 300 to 1,000 paragraphs. FTS5 over that file is a few milliseconds. The real cost is OCR, layout and anchoring, not search.

Design rules:

- Keep the document identity and its SHA-256. A file is read once; a changed file is a new source.
- Read the text layer first. OCR only the pages without text, or the pages a critical quote depends on. Record the engine, the version and the confidence.
- Keep the page image beside the OCR line. A quote that will be filed is confirmed against the image.
- Index the paragraph or line, not the page. A page with three columns or two exhibits is not one passage.
- Retrieve the passage and return its parent: the page, the document and the matter. The model gets the passage and the page context; the citation is the page and line.
- For a query across the matter, group results by document and show "12 hits in 3 documents". Open at the page.
- For "find in this document", use the same FTS index with a document filter. For "find similar", use vectors only if they are on.
- For a scanned file, OCR is the bottleneck. A 100-page scan at 2-5 seconds per page is 3-8 minutes. Run it in the background, show progress, and let the advocate search the text layer while OCR continues.
- Do not embed the whole document. Embed the paragraph only when vectors are on. A 100-page file is 300-1,000 vectors, which the flat index handles in under a millisecond.

#### 9.8.2 A large judgment

A judgment is a set of paragraphs, often with more than one opinion:

- Each opinion has its own author, its own paragraph numbering and sometimes its own heading. A concurrence can restart at paragraph 1. The citation key must include the opinion: `judgment#opinion:<judge>#p<para>`.
- A paragraph that is longer than the model window splits at sentence boundaries. The citation stays the paragraph; the window is a reading.
- Headnotes, the bench, the date, the citations and the disposal are metadata. The paragraph is the unit.
- A 100-500 page judgment is 100-1,000 paragraphs. It is small for FTS5. The long part is the reading, not the search.
- The current `paragraphs()` function assumes one sequential numbering. It must learn an opinion id. This is a Phase 5 fix, not a later one.

#### 9.8.3 A research memo

A memo is editable, so index it by revision:

- Split at its own headings: issue, submission, analysis, conclusion, prayer.
- Index each paragraph with its heading path, its citations and its proposition.
- Keep the revision hash. A memo edit creates a new revision; the old revision stays readable. Re-index only the changed paragraphs.
- A vector row is tied to the paragraph text hash. If the text changes, the old vector is not reused.
- Search modes: "find the proposition", "find the supporting quote", "find the adverse note", "find the paragraph I wrote on limitation".
- A memo is a work product, not a source of law. A quote in a memo is checked against the law source, not against the memo.

#### 9.8.4 A large judgment dataset

The dataset is the hard case. The unit is the paragraph, the partition is the court and the year.

- **Partition.** One FTS5 table per court and year (or per court and five-year bucket). A catalog table lists the partitions, their row counts, their date ranges and their build state. A query with a court or date filter opens only the matching partitions. A query without a filter searches the most recent N partitions, then reports what was not searched.
- **Metadata first.** Court, bench, date, citation, case number, judges, disposal and source are normal columns with indexes. Do not put them in `UNINDEXED` FTS columns and filter there. The benchmark below shows a SQL filter on an `UNINDEXED` column takes about 1 second at 1M rows; an indexed metadata join or a partition is the fix.
- **One text copy.** Use an FTS5 external-content table (`content=`) or a contentless table with a rowid map. The current `provision_fts` copies the text. At 1M paragraphs that duplication is hundreds of megabytes.
- **Phrase search needs positions.** Keep `detail=full`. `detail=none` and `detail=column` lose the phrase queries that legal research needs.
- **Incremental.** Append new judgments. Do not rebuild the corpus for one new decision. Run `INSERT INTO fts(fts) VALUES('optimize')` after a bulk load, not on every insert.
- **Dedup.** Use a canonical id: court, case number, decision date and a normalized title. Keep the text hash. The same judgment from two sources is one judgment with two source rows.
- **Vectors are a second pass.** Embed the headnote, the disposition and the paragraphs that are cited most, not every paragraph on day one. Measure the recall gain before paying the embedding and storage cost.
- **The graph is separate.** The citation and treatment edges are built from the paragraphs. At 10M edges, keep the edge table with indexes on both directions. Use a closure table only for the hot, deep paths. Benchmark a two-hop and a three-hop query before adding LadybugDB.

#### 9.8.5 Measured numbers

These are local measurements on this Windows machine, Node 24.13.1, `node:sqlite`, no Docker. The text is synthetic legal prose, 90-140 words per paragraph. Real paragraphs are longer, so treat these as a lower bound on size and latency.

| Rows | Build | DB size | Phrase | OR | SQL filter on an `UNINDEXED` column |
|---:|---:|---:|---:|---:|---:|
| 100,000 | 3.3 s | 144 MB | 11 ms | 44 ms | not measured |
| 1,000,000 | 41.5 s | 1.44 GB | 118 ms | 464 ms | 1,011 ms |

After `optimize` on the 1M table: phrase 117 ms, OR 403 ms, prefix (correct `anticip*` syntax) 190 ms. The optimize took 3.5 s and did not change the size.

The lesson is not "SQLite is slow". The lesson is "one global FTS table is the wrong shape at 1M rows". A partition of 50,000-100,000 paragraphs returns a phrase query in about 10-20 ms. The design target is p95 under 150 ms for interactive search. Partitioning meets it; a single 1M-row table does not for OR queries.

The vector side:

| Vectors | Query | Memory |
|---:|---:|---:|
| 100,000 | 34-43 ms | 154 MB |
| 1,000,000 | about 350-430 ms | about 1.5 GB |

The local embedding benchmark with `bge-small-en-v1.5` (384 dimensions, ONNX, CPU) on this machine:

| Batch | Throughput |
|---:|---:|
| 32 paragraphs | 165-244 paragraphs/s |
| Model load | 9.7 s |

At 235 paragraphs/s, 1M paragraphs take about 71 minutes. At 165/s, about 101 minutes. A 10M-paragraph corpus takes 12-20 hours. That is a batch job, not a search-time cost. It is another reason vectors are optional and off by default.

#### 9.8.6 What this means for the design

- The matter adapter indexes the document's parts and paragraphs. A 100-page file is small; the work is OCR and anchors.
- The research adapter partitions `judgment_para` by court and year. The catalog and the metadata filters choose the partitions.
- The statute adapter is small: 20-30 Acts, 10,000-30,000 provisions. One table is enough. No partition.
- The procedure adapter is small: a few rule sets. One table is enough.
- The firm library is medium: partition by collection if it passes 100,000 items.
- Vectors are a second pass, per partition, after the golden set exists.
- The graph is built from paragraphs; it scales with edges, not pages.
- The UI always says what was searched: "searched 12 partitions, 2019-2026; not searched: 1990-2018". Coverage is part of the result.

The short answer: a 100+ page file is indexed by its structure and anchored to the page; a large dataset is partitioned by court and year. Neither needs a 100-page embedding or a 100-page prompt.

---

## 10. Query agent only, adapters, or a platform?

| Option | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Query agent over files | Give the model `grep`, `find`, `cat` over the corpus | Fast to build; transparent; no schema | No citation keys; no versions; no scope; no audit; poor at 30 Acts and 100k paragraphs; exact quotes are luck | Not enough |
| B. Query agent over ad-hoc SQL | Give the model SQL tools over the stores | Direct; flexible | The model writes joins; scope leaks; no stable contract; every question is a new query; no coverage report | Reject |
| C. Thin knowledge layer + adapters | One `retrieve`, one `assemble`, seven adapters, four stores | Exact keys; versions; verification; scope; audit; fits decisions 4, 12, 13 | More code now; parsers to maintain; contract tests | **Recommended** |
| D. Adopt a RAG platform | RAGFlow, WeKnora, Onyx, etc. | Ingestion, UI, hybrid search, evaluation | Server/Docker; second store; schema mismatch; licence; no append-only matter DB; no LegalDocML provenance | Reference only |
| E. Graph DB + vector DB | LadybugDB + Qdrant/LanceDB | Powerful queries; scale | Two or three stores; native binaries; rebuild and sync; no single writer; hard to audit | Optional derived indexes only |

**Recommendation: C.** Build the adapters now, in one piece, with contract tests. A query agent is a thin tool surface over the pipeline, not the pipeline. The adapters are not a platform: they are seven read-only ports, four stores, one verifier and one review surface. This is the smallest design that satisfies "cite the exact provision" and the owner's append-only rule.

---

## 11. Phase 5 build plan

### 11.1 Work packages

| Package | Features | Work | Exit |
|---|---|---|---|
| P5-1 Law model | E3, D2 | Provision, part, event, check, chapter map, citation key | Contract tests; s.28 part event; round-trip |
| P5-2 India Code | E3 | Central Acts, Repeal Acts, PDF/TEXT, checksums, rate limit | 28 Acts loaded; 3 repealed codes loaded |
| P5-3 Court rules | B4, B6, D5 | SC Rules 2013; DHC OS Rules 2018; index/TOC parser; amendments | Two sets parsed; page/line anchors |
| P5-4 Verification | E3, B2 | Re-read, hash, compare; changed/unreachable; set manifest | Verified/changed/unreachable tests |
| P5-5 Legal corpus | E1, G1 | Judgment paragraphs, citations, treatments, edges | 100 judgments; edge precision test |
| P5-6 Retrieval v1 | G7, J1 | Exact, FTS5, graph, filters, RRF, policy, coverage | Modes; p95; golden set |
| P5-7 Research skill | J2, J3, J4 | Plan, quote, reason, verify, adverse, memo | One real memo with adverse authority |
| P5-8 Vectors | G6 | ONNX embedder, flat index, optional sqlite-vec, rebuild | Recall@10; p95; off by default |
| P5-9 Review | O5, J5 | Annotations, plan review, send to agent, audit | One plan and one memo reviewed |
| P5-10 Stores | F5, I1 | Append-only matter DB, firm index/log, session segments | Append-only tests; compaction test |
| P5-11 Views | J1-J6 | Research, Statute, Procedure, Review Inbox, index health | Real use |
| P5-12 E2E | All | Real brief; real question; adverse authority; governing date; coverage | Owner completes the exit |

### 11.2 Order

1. Freeze the data model and the adapter contracts. Write the Phase 5 spec ([docs/specs/README.md](../../docs/specs/README.md) says one spec per module). The current `src/shared/law.ts` points to a spec that does not exist.
2. Fix the part-level event model and the AKN round-trip contract. The tests are green now; add the property tests before more data.
3. Load the first Acts: BNS, BNSS, BSA, Contract, CPC, Limitation, Specific Relief, Transfer of Property, Arbitration, Negotiable Instruments, Commercial Courts, IBC, Companies, IT, Prevention of Corruption, NDPS, POCSO, Consumer Protection, Motor Vehicles, Hindu Marriage, Registration, Stamp, PMLA, Advocates, Court-fees, General Clauses, Contempt of Courts, Domestic Violence.
4. Load the repealed codes: IPC, CrPC, Evidence Act, with page anchors and OCR confidence.
5. Load the rules: SC Rules 2013; DHC OS Rules 2018; DHC Volume V.
6. Build verification at use and the set manifest.
7. Build retrieval v1 and the research skill. No vectors.
8. Add the optional vector index only after the golden set exists.
9. Add the review surface and the append-only store migration.
10. Run the end-to-end research memo.

### 11.3 Tests and exits

| Test | What it proves |
|---|---|
| `law-store` contract | A provision round-trips; a changed text adds a version; nothing is deleted |
| India Code fixture | Contract Act 270 items; section 28 footnote; section 19A insertion; repealed flag |
| Repealed Act fixture | IPC/CrPC/Evidence PDF + TEXT; section boundaries; page anchors; OCR confidence |
| Rules fixture | SC Rules Part/Order/Rule; DHC Chapter/Rule; sub-rules; index vs body |
| AKN property | For every provision, `parseAkn(toAkn(rows)).textHash == row.textHash` |
| Verification | Same text verified; changed text versioned; unreachable unconfirmed |
| Retrieval | Exact provision first; phrase; boolean; citation; graph; historical; coverage |
| Quote-first | A fabricated quote is unverified; a real quote is located; an unknown ref is removed |
| Scope | A matter adapter refuses another matter; no cross-matter hit |
| Append-only | `UPDATE` and `DELETE` on a record table are refused |
| Compaction | A new segment starts; the old segment is unchanged; the posture rebuilds |
| Golden set | 50 real queries; recall@10, citation accuracy, quote match, p95 |
| E2E | One real research memo: adverse authority, binding effect, provision in force, coverage |

### 11.4 Effort (indicative)

For one experienced TypeScript engineer, with the current code as the base:

| Package | Weeks |
|---|---|
| P5-1 Law model and contracts | 2 |
| P5-2 India Code and repealed codes | 2 |
| P5-3 Court rules | 1.5 |
| P5-4 Verification and manifests | 1 |
| P5-5 Legal corpus and graph | 2 |
| P5-6 Retrieval | 1.5 |
| P5-7 Research skill | 3 |
| P5-8 Vectors | 1 |
| P5-9 Review | 1 |
| P5-10 Stores and session logs | 1.5 |
| P5-11 Views | 2 |
| P5-12 E2E and fixes | 1.5 |
| **Total** | **20** |

This is not a promise. It assumes the owner answers the open questions in section 14, the first courts are the Supreme Court and Delhi, and no new feature enters the phase. The exit is not "the code is written"; it is the owner completing a real research memorandum.

### 11.5 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| India Code API changes | Ingestion stops | Versioned adapter; fixtures; PDF fallback; clear error |
| Chapter metadata absent | Wrong chapter labels | PDF map + curated map; `unmapped` state |
| OCR errors in repealed codes | Wrong quote | PDF page image; second OCR; advocate confirms; quote verifier |
| Footnote attribution | Wrong in-force date | Part anchors; `undetermined` when unsettled |
| AKN round-trip loss | Audit fails | Canonical text in provenance; property tests |
| Append-only migration | Breaks Phase 1-4 writes | Staged migration; views; tests; owner acceptance |
| Cross-matter leak | Confidentiality breach | Bound adapter; scope check before search; tests |
| Vector drift | Wrong neighbours | Text hash; model version; rebuild command |
| Native binary | Packaging failure | Optional; one module; platform selection |
| Overclaim | The report becomes the product | L1-L3; the owner completes a real task |

---

## 12. Mismatches and corrections

1. **Correction: the repealed codes are in India Code.** The earlier assessment searched the "Acts" collection and concluded that the IPC, CrPC and Evidence Act were only State stubs. The correct collection is the Central "Repeal Acts" list. The three Acts have Act PDFs and TEXT extracts. The adapter must use that path. This is the owner's point, and the owner is right.
2. **The prior assessment said `matter.db` is not append only.** Confirmed. The current code updates and deletes in the places listed in section 5.2. The owner's instruction needs a migration, not a trigger alone.
3. **The prior assessment said the firm knowledge base has no store owner.** `advocate.db` is the nearest owner, but architecture section 3 does not name it. The owner must accept the firm scope in `advocate.db` and the no-client-facts rule.
4. **The prior assessment said LadybugDB is not adopted.** Agree, with the conditions in section 9.4. The spike shows it works; the reason to reject is architectural, not technical.
5. **The prior assessment said Nyaykosh is not a text source.** Confirmed. Four Acts, summaries, minimal XML. Use it for compliance-rule pointers only.
6. **`src/shared/law.ts` points to `docs/specs/law-research-authority.md`, which does not exist.** Write the spec when the phase starts, or change the comment to point to this report until then.
7. **`corpus.db` currently has a judgment metadata table and FTS.** Phase 5 adds `judgment_identity`, `judgment_para` and the law tables. Use one file and migrate; do not create a second law database.
8. **`intel.db` and `corpus.db` both have source-like rows.** Keep the source registry in `intel.db`; the law rows point to it by `source_ref`. Do not duplicate the text.
9. **The current test file was untracked at the start and was failing.** It is now 11/11. The fixes are listed in section 2.3. The full suite is 228 pass, 3 skipped, 0 fail.
10. **The current code has no adapter registry.** `src/lib/knowledge/index.ts` takes an array of adapters from the caller. That is a good start, but there is no single place that builds the production set, checks scopes and records coverage. The integration report defines it.

---

## 13. Decisions proposed

The full register is [../decisions/2026-11-16-phase-5-rag.md](../decisions/2026-11-16-phase-5-rag.md). The short form:

| Id | Decision |
|---|---|
| RAG-1 | Canonical stores stay SQLite; no server and no Docker |
| RAG-2 | One retrieval function over seven scope adapters |
| RAG-3 | Statutes and rules are provision rows; Akoma Ntoso is the export |
| RAG-4 | Chunk by section/article/rule and their own parts; never by token |
| RAG-5 | Every chunk carries a structured citation key |
| RAG-6 | Chapter and part maps come from the source PDF; `unmapped` is allowed |
| RAG-7 | Judgment paragraphs are the research unit; the judgment is the parent |
| RAG-8 | Default retrieval is exact + FTS5 + graph + filters |
| RAG-9 | Vectors are optional; the flat TypeScript index is the default when on |
| RAG-10 | No graph database; SQLite edge tables; LadybugDB only as a derived index |
| RAG-11 | Verification at use; `unreachable` is unconfirmed, never passed |
| RAG-12 | Quote-first research; a deterministic verifier checks every quote and citation |
| RAG-13 | Multi-agent roles in one skill run; the Matter Agent orchestrates |
| RAG-14 | Firm DB, matter DB and session logs stay separate |
| RAG-15 | Matter DB and session logs are append only; compaction starts a new segment |
| RAG-16 | Law, firm knowledge and memos are versioned and shareable; facts are not |
| RAG-17 | Plan review is native, on the Plannotator pattern |
| RAG-18 | No RAG platform, no vector server, no graph server in Phase 5 |
| RAG-19 | Build the adapters now, not a query agent alone and not a platform |
| RAG-20 | The phase exit is a real research memorandum the owner completes |
| RAG-21 | Large judgment indexes are partitioned by court and year; no single global table at 1M rows |
| RAG-22 | Long files are indexed by structure; page is an anchor, not a chunk; opinions get their own paragraph namespace |
| RAG-23 | FTS5 uses external content, indexed metadata and `detail=full`; filters never use `UNINDEXED` columns |

---

## 14. Owner questions that block work

1. **Which 20 to 30 statutes?** The 28 from the earlier survey are a good default. Add BNS, BNSS and BSA if they are not in the list. Confirm the list before ingestion.
2. **Do you accept the append-only migration of `matter.db`?** It changes Phases 1 to 4. Without it, the owner's instruction is not met.
3. **Do you accept `advocate.db` as the firm knowledge base owner?** Architecture section 3 does not name it. The alternative is a separate `firm.db`, which adds a fourth store.
4. **Where do law annotations live?** Shared law annotations in `corpus.db`; matter annotations in `matter.db`. Confirm.
5. **Which court rules come first?** The default is the Supreme Court Rules, 2013 and the Delhi High Court Original Side Rules, 2018, with the Delhi district courts in scope.
6. **Do you accept OCR text for the repealed codes, with the page image and the advocate's confirmation?** The alternative is to wait for a clean text source, which may not exist.
7. **Do you accept the `undetermined` answer for a provision whose earlier text is not in the library?** The alternative is to guess, which the architecture forbids.

---

## 15. Recap

The product needs a knowledge layer, not a RAG product. The layer has four SQLite stores, seven read-only adapters, one retrieval function, one verifier and one review surface. Statutes and court rules use one provision model and one citation key. The unit is the section, article or rule, split only at its own legal parts. India Code supplies Acts in force; its Repeal Acts collection supplies the IPC, CrPC and Evidence Act as PDFs. Nyaykosh is a pointer, not a source. Every law row is checked against its source when it is used. The default search is exact, full-text and graph; vectors are optional and lightweight. The graphs stay in SQLite; LadybugDB is a future derived index, not a second source. Research is quote-first: retrieve, quote, reason, verify. The matter database and session logs must become append-only; that is a real migration. Plan review is native, on the Plannotator pattern. Build the adapters now; do not ship a query agent alone and do not adopt a platform.

---

## Appendix A: the repository quadrant

Stars, last push and licence from the GitHub API on 2026-11-16. Licence is a fact from the API or the repository's own file; check it before redistribution.

| Repo | Stars | Last push | Licence | Verdict |
|---|---:|---|---|---|
| backnotprop/plannotator | 11.8k | 2026-11-15 | Apache-2.0 (API); README states Apache-2.0 or MIT; no root LICENSE file | Pattern |
| Tencent/WeKnora | 37.5k | 2026-11-09 | Custom Tencent licence (README badge says MIT) | Reference |
| thomasunise/casecite | 294 | 2026-11-05 | Apache-2.0 | Reference |
| evolus/pencil | 9.9k | 2026-11-13 | GPL-2.0 | Not Phase 5 |
| vercel-labs/knowledge-agent-template | 1.1k | 2026-11-11 | MIT | Reference |
| LadybugDB/ladybug | 1.9k | 2026-11-15 | MIT | Optional derived index |
| kuzudb/kuzu | 4.0k | 2025-10-10 | MIT | Archived; reject |
| asg017/sqlite-vec | 8.3k | 2026-05-18 | MIT OR Apache (npm); API Apache-2.0 | Optional |
| unum-cloud/usearch | 4.4k | 2026-11-15 | Apache-2.0 | Benchmark |
| lancedb/lancedb | 11.9k | 2026-11-15 | Apache-2.0 | Alternative |
| qdrant/qdrant | 35.6k | 2026-11-15 | Apache-2.0 | Reject for Phase 5 |
| oramasearch/orama | 10.6k | 2026-10-18 | Apache-2.0 | Reference |
| Stevenic/vectra | 633 | 2026-07-20 | MIT | Reference |
| graphology/graphology | 1.8k | 2026-11-10 | MIT | Analytics |
| oxigraph/oxigraph | 2.0k | 2026-11-15 | Apache-2.0 | Standards export |
| quadstorejs/quadstore | — | — | — | RDF store; reject |
| laws-africa/indigo | 78 | 2026-11-12 | LGPL-3.0 | Model reference |
| laws-africa/bluebell | 23 | 2026-07-13 | GPL-3.0 | Parser reference |
| oasis-open/legaldocml-akomantoso | 87 | 2022-06-02 | OASIS | Schema |
| OpenNyAI/Opennyai | 104 | 2026-04-01 | MIT | Indian NLP reference |
| freelawproject/courtlistener | 1.1k | 2026-11-15 | Custom | Citator reference |
| freelawproject/eyecite | 303 | 2026-11-01 | BSD-2 | Citation reference |
| docling-project/docling | 70.6k | 2026-11-15 | MIT | Parsing reference |
| infiniflow/ragflow | 94.2k | 2026-11-13 | Apache-2.0 | Ingestion reference |
| microsoft/graphrag | 36.6k | 2026-11-09 | MIT | Algorithm reference |
| HKUDS/LightRAG | 40.7k | 2026-11-15 | MIT | Algorithm reference |
| getzep/graphiti | 32.8k | 2026-11-15 | Apache-2.0 | Memory model |
| mem0ai/mem0 | 69.0k | 2026-11-06 | Apache-2.0 | Memory model |
| letta-ai/letta | 25.5k | 2026-10-18 | Apache-2.0 | Memory model |
| basicmachines-co/basic-memory | 4.6k | 2026-11-15 | AGPL-3.0 | Local KB pattern |
| milvus-io/milvus | 46.7k | 2026-11-15 | Apache-2.0 | Reject |
| weaviate/weaviate | 16.9k | 2026-11-15 | BSD-3 / Weaviate licence | Reject |
| chroma-core/chroma | 29.7k | 2026-11-13 | Apache-2.0 | Reject |
| jurisbound/bare-acts-scraper | — | 2026-11-10 | Check the file | India Code client reference |
| jonashertner/opencaselaw | 80 | 2026-11-15 | MIT code, CC0 data | Citation graph reference |

## Appendix B: the exact commands

```powershell
# Baseline
npm run typecheck
npm run test:unit
node --test tests/unit/knowledge.test.ts

# Vector spike (Windows, no Docker)
# In a temporary folder:
npm install sqlite-vec@0.1.9 @ladybugdb/core@0.22.3
node spike.mjs

# FTS5 scale spike (Windows, no Docker)
# In %TEMP%\openadvo-fts-scale:
node bench.mjs 1000000

# Embedding spike (Windows, no Docker)
# Temporary script in the repository, removed after the run:
node embed-bench.mjs

# India Code (read-only)
# See section 2.4 for the endpoints.
```

The spike files were in `%TEMP%\openadvo-spike-vec` and `%TEMP%\openadvo-fts-scale`. They are not in the repository. The embedding script was temporary and removed. The test fixture `tests/fixtures/indiacode-contract-act.json` is in the repository.
