# Assessment: the knowledge layer (stores, graphs, vectors, parsers) for phase 5

Date: 2026-11-16. Owner's instruction: assess every option, decide, and report. This file is an assessment. It changes no accepted decision; section 9 lists what the owner must accept before it becomes one. The earlier survey of 60 repositories is [../memory-rag-assessment.md](../memory-rag-assessment.md); this report does not repeat it.

## 1. Key points

1. **One retrieval function, seven adapters, four stores.** Nothing new is a source of truth. Full text, vectors and graphs are indexes that can be rebuilt (decision 13).
2. **India Code is the statute source.** One search by Act id returns every section with its enacted text and its amendment footnotes. Tested live: 28 central Acts, 34 to 1,183 items each.
3. **Nyaykosh (lawascode.negd.in) is not a text source.** Its JSON and its Akoma Ntoso XML hold a one-line summary of each section, not the enacted text. It covers 4 Acts. Its compliance rules are useful as a pointer only.
4. **India Code holds no section text for the IPC, the CrPC or the Evidence Act.** Only one-item State stubs exist. Their text must come from a PDF the advocate gives.
5. **Rows first, Akoma Ntoso second.** Provision rows in SQLite are the record. Akoma Ntoso XML is generated from the rows for export, sharing and audit. Each section in the XML carries its source id and the SHA-256 of its text.
6. **Verification at the time of use is cheap.** Re-read one India Code item, hash its text, compare with the stored hash. Three results: verified, changed, unreachable. Unreachable means "unconfirmed", never "passed" (decision 16, ruling R-4).
7. **Vectors are optional.** FTS5 plus the citation graph plus filters is the default. A plain TypeScript vector index over a SQLite BLOB table is enough; no native extension is needed.
8. **No graph database.** LadybugDB works, but it would be a second store beside SQLite. Edge tables stay.
9. **Plan review is built natively**, on the plannotator pattern, not by bundling its extension.

## 2. What was tested (commands and results)

| Test | Result |
|---|---|
| `GET indiacode.gov.in/server/api/core/items/<uuid>` | 200. Act metadata: title, number, year, enactment date, commencement date, repealed flag, `act_id`. |
| `GET .../discover/search/objects?query=dc.identifier.act_id:"<act_id>"&size=100&page=n` | 200. Contract Act: 270 items (sections, one schedule, the Act). Each section has `section_number`, `order_number`, `section_page_note` (HTML text), `section_footnote`. |
| Footnotes | Real examples: "Ins. by Act 6 of 1899, s. 3."; "Subs. by Act 1 of 1997, s. 2, for certain words (w.e.f. 8-1-1997)." They give the amendment history. |
| Commencement dates | Mixed formats: `1872-09-01`, `1-7-2024`, `01-07-2024`, and free text for the Consumer Protection Act, 2019. A parser must keep the source text and mark a date it cannot read. |
| A sort parameter on the search | 422. Read all pages, sort locally by `order_number`. |
| Search for the IPC, CrPC, Evidence Act as central Acts | Not found. State copies have 1 to 37 items; no full text. |
| `GET lawascode.negd.in/laac-api/v1/laws` , `/laws/<slug>`, `/provisions/<n>`, `/penalties`, `/xml` | All 200, open read access. `/xml` is Akoma Ntoso 3.0 with `FRBRWork` only, 125 sections, summaries as content. |
| Vector spike: 20,000 vectors x 384 dimensions, top 10 | sqlite-vec 0.1.9 in `node:sqlite`: 8.1 ms per query. Plain TypeScript: 7.5 ms per query. |
| npm facts | `sqlite-vec` 0.1.9; `@ladybugdb/core` 0.22.3 (72 KB wrapper, native binary separate); `@plannotator/pi-extension` 0.28.65 (53 MB unpacked). |

## 3. The repositories examined

| Project | What it is | Use |
|---|---|---|
| [backnotprop/plannotator](https://github.com/backnotprop/plannotator) | Local browser review surface for agent plans. Bun server, hooks, a Pi extension, an MCP inbox. Stores plans under `~/.plannotator`. Dual licence Apache-2.0 or MIT (stated). | Take the pattern: select text, mark comment, replace, delete, insert or a global note; send structured feedback to the agent. Build it native in the window. The Pi extension opens a browser and assumes Pi's terminal (notes for agents, lesson 2). |
| [Tencent/WeKnora](https://github.com/Tencent/WeKnora) | Go knowledge platform: hybrid keyword and vector search, rerank, parent-child chunks, optional GraphRAG on Neo4j, a generated wiki. Has a "Lite" build on SQLite. MIT (stated). | Take: parent-child chunks (retrieve the paragraph, give the model the section), editable chunks with history, built-in recall evaluation. Do not run it: it is a server. |
| [thomasunise/casecite](https://github.com/thomasunise/casecite) | Self-hosted legal research on CourtListener (US). FastAPI and React. Apache-2.0 (stated). | Take: keep a citation only when a verbatim quote is found in the opinion; scan citing opinions for negative-treatment words; say it is not a citator. No Indian citation support. |
| [evolus/pencil](https://github.com/evolus/pencil) | Electron diagram and wireframe tool, with an MCP server in 4.0. GPL-2.0 (stated). | Not for this phase. A canvas for case maps is a later idea; it goes to parking. |
| [vercel-labs/knowledge-agent-template](https://github.com/vercel-labs/knowledge-agent-template) | Agent that answers from files with grep, find and cat in a sandbox. No vectors, no chunking. MIT (stated). | Take the core idea: give the agent precise search and read tools over structured text and let it iterate. Our tools already do this over the stores; no shell is needed (decision 2). |
| [LadybugDB/ladybug](https://github.com/LadybugDB/ladybug) | Embedded graph database, formerly Kuzu. Cypher, full text, vector index. MIT (stated). | Not adopted. See section 6. |
| [lawascode.negd.in](https://lawascode.negd.in/laws) | Nyaykosh: 4 Acts as PDF, XML and API, with obligation and penalty rules per persona. No licence stated. | A pointer to compliance rules for those 4 Acts. Not a text source. |
| [indiacode.gov.in](https://indiacode.gov.in/) | The official code. DSpace REST API. | The statute source. |

## 4. The eight areas: what each is, and where it lives

| Area | Shape | Store | Text | Graph | Vector | Changeable |
|---|---|---|---|---|---|---|
| Advocate memory | Typed records with a lifecycle | Firm database | filter | advocate-memory edges | optional | By the advocate; history kept |
| Firm knowledge base | Files with front matter | Firm database and blobs | FTS5 | none | optional | Yes; shared |
| Statute intelligence | Versioned provision rows | `corpus.db` | FTS5 | amended by, interprets | not needed | Yes, by re-check; versions kept |
| Procedural intelligence | Dated rule rows, same shape as provisions | `intel.db` for built lists; `corpus.db` for rule text | FTS5 | applies in | not needed | Yes; versions kept |
| Matter intelligence | Anchored records | `matter.db` | Find | evidence graph | optional, inside one matter only | Append only |
| Research intelligence | Judgment paragraphs, propositions | `corpus.db` | FTS5 | citation and treatment edges | optional | Yes; shared, law only |
| Matter orchestrator memory | Session log and a posture block rebuilt from the store | Session log file per matter | none | none | none | Append only |
| Unified memory | One function over the adapters above | No store | fused | walk | fused | Not applicable |

### What combines and what stays apart

**Combined (one mechanism):**
- One provision table for Acts, rules, regulations and practice directions. A High Court rule and a section differ only in `kind` and `jurisdiction`.
- One Akoma Ntoso writer and reader for all of them.
- One edge table shape for the three graphs (architecture section 4).
- One vector table shape and one embedder for every scope.
- One retrieval function with reciprocal rank fusion.
- One verification routine: hash now, compare with the stored hash.

**Separate (never merged):**
- Each matter's facts. No cross-matter retrieval of facts (architecture section 6). The vector rows of a matter stay in that matter's file.
- The firm database, each matter database, and the session logs. These are four kinds of file.
- Law (shared, changeable, versioned) and facts (per matter, append only).
- Confirmed records and candidates. A candidate never ranks as a confirmed record.

## 5. The stores, with the owner's new instructions

| Store | Holds | Rule |
|---|---|---|
| Firm database (`advocate.db`) | Advocate details, basic matter details (id, title, stage, court, next date), firm agent log, advocate memory, Knowledge Library | One per installation. The firm agent log is append only. |
| `matter.db`, one per matter | Every record of the matter and its hash-chained event record | Append only. |
| Session log, one file per matter, beside `matter.db` | Every turn, tool call and compaction of the Matter Agent | Append only, hash-chained. A compaction closes a segment and opens the next, with the summary as its first entry. |
| `corpus.db` | Statutes, rules text, judgments, paragraphs, edges, propositions, law-only research notes | Changeable and shareable. Every change keeps the earlier version. |
| `intel.db` | Courts, built lists, sources and freshness | Changeable and shareable, versioned rows (current). |

**Mismatch to report.** `matter.db` is not append only today. Its event record is (triggers refuse update and delete). Its record tables are updated in place, and nine statements delete rows: `document_part`, `matter_edge`, `page_mark`, `forum_clause`, `related_matter`, `record_cell`, `lod_row`, `annexure` and the Find index. Five of these are rebuilt indexes; four are records. Making every table append only is a change to the code of phases 1 to 4. Proposed order: first add triggers that refuse delete on the record tables and replace the four record deletes with a status change; then move in-place updates to superseding rows table by table. This needs the owner's acceptance, because it touches decision 4.

## 6. Decisions proposed

| No. | Proposed decision | Why | Rejected |
|---|---|---|---|
| A | Statute text comes from India Code. Rows are the record. | The only official source with every section, the footnotes and an API. | Nyaykosh as a source (summaries only, 4 Acts). Scraping HTML pages (the pages are rendered by script; the API gives the same data). |
| B | Akoma Ntoso 3.0 is generated from the rows, with FRBR Work, Expression and Manifestation, a lifecycle from the footnotes, and a provenance block (source id, URL, SHA-256 per section). | Standard exchange form; verifiable; not needed for queries. | Akoma Ntoso as the primary store (every query would parse XML). |
| C | Sub-sections, clauses, provisos, explanations, illustrations and exceptions are read from the source's blocks by rule. The XML marks them as `subsection`, `paragraph`, `subparagraph` and `hcontainer`. | India Code gives one block per part. | A model to parse structure (cannot be verified). |
| D | Amendment events come from footnotes: kind, amending Act, section, and the "w.e.f." date when given, else the year, marked as a year only. | These are the source's own words. | Dates from memory. |
| E | The law on a governing date is computed from the commencement, the repeal flag and the events. When the record cannot settle it, the answer is "undetermined" with the reason. | India Code gives the current text only. An earlier text exists only when this library kept it. | Guessing the earlier text. |
| F | A static set is a list of Act ids plus, optionally, the rows with their hashes. Any set is checked against India Code when a row is used. | "Verifiable at time of use." Ships small. | Shipping unverifiable text. |
| G | Court rules, practice directions and the repealed codes come from a PDF. Lines become provision rows by numbering rules, with page and line anchors. Lines before the first rule are counted and shown. Check at use: re-download from the source URL and compare the file hash. | Same table, same search, same XML. | A separate rules engine. |
| H | The IPC to BNS (and similar) crosswalk is proposed by heading and text similarity, each link with its score. The advocate confirms each link. None is shipped as law. | No official machine-readable table was found. | A table written from memory. |
| I | Retrieval default: FTS5 (BM25), filters, and a graph walk, fused by reciprocal rank. Vectors join the fusion only when a model is installed. | Works offline with no model; legal search needs exact phrases and citations first. | Vector-first retrieval. |
| J | Vector index: Float32 BLOB rows in SQLite, brute-force cosine in TypeScript. | Spike: 7.5 ms at 20,000 vectors, against 8.1 ms for sqlite-vec. No native binary (decision 9). At 1,000,000 vectors it would take about 400 ms; that is the point to revisit. | sqlite-vec (pre-1.0, a native binary, no gain at this size); LanceDB; usearch. |
| K | Embedding model: optional, local, through the ONNX Runtime already present. `bge-small-en-v1.5` (384 dimensions) first. Off until vendored; the window says so. | "Embedding optional, lightweight." | A cloud embedding service. |
| L | Graphs stay SQLite edge tables. LadybugDB is not adopted. | It would be a second store with its own file format and a native binary, against decisions 9, 12 and 13. Our walks are two or three hops. | LadybugDB, Neo4j. |
| M | The legal graph is built from the judgments' own words: citations, and treatment words near a citation, each edge with its paragraph and quote, as a candidate. | High precision and auditable (casecite's rule). | Entity graphs extracted by a model (GraphRAG, LightRAG) for authority. |
| N | The judgment paragraph is the unit of retrieval; the judgment is the parent (WeKnora's parent-child pattern). | A paragraph is what an advocate cites. | Fixed-size chunks. |
| O | Plan review is native: notes on a plan, a research plan, a memorandum or a deliverable, kept in the matter, sent to the agent as one structured message. | Works in the window; recorded in the matter. | Bundling `@plannotator/pi-extension` (53 MB, opens a browser, assumes the terminal). |
| P | Firm database, matter databases and session logs as in section 5. | The owner's instruction. | One database for all. |

## 7. How one question flows

1. The advocate or the agent calls one function: `retrieve(query, mode, scopes, matter, governing date)`.
2. The scope check runs first. Another matter's facts are refused before any search.
3. The mode sets the plan. A citation goes to an exact lookup. A phrase goes to FTS5 only. "Statute and section" goes to the provision table and then to the judgments that interpret it. "Connected case" is a graph walk. "Historical law" adds the governing date.
4. Each adapter returns hits with the same fields: id, scope, text, anchor, date, authority level, verification state, stale flag.
5. Reciprocal rank fusion joins the lists. Policy ranks after that: binding authority first for a question of law; primary documents first for a question of fact.
6. Every statute hit is checked against its source if its last check is older than the interval. The result travels with the hit.
7. The answer states what was not searched and why. The run is recorded: per matter in full; across matters as law references only.

## 8. State of the work

Written in this session, not committed, not type-checked, not tested:

- `src/shared/law.ts`: the types of phase 5.
- `src/lib/statutes/structure.ts`, `indiacode.ts`, `akn.ts`, `rules.ts`, `inforce.ts`, `crosswalk.ts`.
- `tests/fixtures/indiacode-contract-act.json`: real India Code items for tests.

Not started: the law store tables, the judgment paragraph index, citations and treatments, binding effect, conflicts, propositions, the retrieval function and adapters, the vector table, the session log, review notes, the agent tools, the bridge, the views, the spec, the tests. Phase 5 is not delivered.

The list of 28 central Acts with their India Code ids is in the session scratchpad only. It must be rebuilt (one search per Act) or copied into the repository before use.

## 9. For the owner

1. Accept or change the proposed decisions A to P. Only the owner adds a decision.
2. Accept the order for making `matter.db` append only (section 5).
3. Name the 20 to 30 statutes. The 28 found are: BNS, BNSS, BSA, CPC, Limitation, Contract, Specific Relief, Transfer of Property, Arbitration, Negotiable Instruments, Commercial Courts, IBC, Companies, IT, Prevention of Corruption, NDPS, POCSO, Consumer Protection, Motor Vehicles, Hindu Marriage, Registration, Stamp, PMLA, Advocates, Court-fees, General Clauses, Contempt of Courts, Domestic Violence.
4. Say where the IPC, CrPC and Evidence Act text will come from, since India Code does not hold it.
