# Component map

Status: settled map, updated 4 November 2026. This is the parts list for one Rust desktop application. Every choice in it is settled in [decisions.md](decisions.md), which governs where this map disagrees. Each group has an implementation spec in [specs/](specs/README.md).

## Verdicts

| Verdict | Meaning |
|---|---|
| **VENDOR** | Code in our tree, ours to patch. |
| **DEPEND** | A crate we link behind our own interface. |
| **HOST** | A separate application with its own window and its own storage. We show it, sandbox it and talk to it over a contract. |
| **BUILD** | Ours. |
| **REF** | Read for design, no code taken. |

## Words this map uses

Four words do most of the work in this file, and they are not interchangeable.

| Word | What it means here | Where it lives |
|---|---|---|
| **Harness** | The runtime that runs turns: loop, context assembly, tool dispatch, policy, approvals, durable session, providers, budget | Group D |
| **Agent** | A configuration the harness runs: a model, instructions, a tool allowlist and a task. One long-horizon orchestrator per matter, plus short-lived sub-agents it starts for judgment research and document edits. One harness | D12 and the configuration records |
| **Capability** | Something the application can do, exposed as a tool with a side-effect class | Groups A to O |
| **Session** | The durable record of a run, in the harness session store `harness/session.db`, separate from the canonical ledger. Canonical events reach the ledger only through the kernel | D07 and C07 |

The practical test is that an agent has no runtime of its own. If a design gives an agent a scheduler, a queue or a store, it has quietly created a second harness.

## Decisions this map encodes

- CLI first. Every capability is a set of control commands, usable from `oa` before it has a pane.
- Pane UI is ours, against current upstream egui and winit.
- A lightweight document viewer and a lightweight PDF viewer come first, and they are the agent's anchor surface. The full editor is WordCraft.
- WordCraft and PdfCraft are vendored into our tree from their own forks, keep their own storage, and run as hosted processes reparented into our panes. They never own the record.
- DOCX is the working format of every draft. Filings are PDF/A.
- One full Chromium binary, one process per profile: the advocate's matter profiles, the filing profile, and the agent's own headless profile for tool tasks other than filing.
- Two OCR engines from the start, vendored, each in its own process.
- One validator, `ulos`: deterministic, no model, a separate binary. Verification is mandatory and needs the network.
- The matter is a folder. Matter creation is the workspace component.
- Evidence is immutable, the Notebook is never written by an editor, drafts live in their own store.
- No workflow cluster. Durability comes from a local runner with an intent log.
- Everything is inspectable: every view opens any item in the Inspector, and every query has a view (P9).
- Licence position is not a constraint right now.

## The app in one picture

```
advocate
  |
shell  winit + egui, our panes
  |-- workspace      files, matters, folders          A
  |-- notebook       facts, dates, issues, authorities H
  |-- viewer         our lightweight PDF and DOCX     J
  |-- editor         our lightweight edit surface     J
  |-- hosted         WordCraft, PdfCraft, Word        J N
  |-- browser        Chromium, child window           M
  |-- agent          chat, plan, tools, approvals     D
  |
control surface  typed commands and queries, one protocol, two front ends   B
  |
kernel  matters, evidence, drafts, ledger, approvals, filing tokens         C
  |
stores  SQLite per matter workspace, blobs on disk, graph projection        E
  |
capabilities  capture, OCR, research, verification, filing, desktop         F G I K L N
  |
validator  ulos, separate binary, deterministic, court sources only         U
```

Two rules decide most of the work. The kernel is the only writer of the record. Every capability publishes what it can do and what it cannot, and the agent is refused claims the publication does not cover.

---

## A. Shell and workspace

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| A01 | Window, event loop, render backend | VENDOR | `winit` and `egui`, current upstream, refreshed at a pinned interval |
| A02 | Pane layout: three or more splits, tabs, navigation history, saved layouts per matter | BUILD | One layout model. Panes register; they do not own geometry |
| A03 | Workspace and matter creation: create, open, rename, archive, template folders | BUILD | Matter is a directory plus a registry row. See the disk layout below |
| A04 | File browser: tree, list, breadcrumb, details pane, inline preview, drag out | BUILD | The primary screen. Everything reachable from the filesystem is reachable here |
| A05 | Notebook pane | BUILD | Sectioned view over notebook records, with source peek |
| A06 | Viewer pane host: slots, split, tabs, sync scroll | BUILD | Holds our viewer, the hosted apps, and later anything else |
| A07 | Agent pane: transcript, streaming, tool cards, plan, inline approvals | BUILD | The second screen the advocate lives in |
| A08 | Review inbox: disputes, conflicts, unresolved citations, filing defects, missing documents, runs waiting on the advocate | BUILD | One queue, split into Signal and Noise, keyboard first. No issue may exist only in a log |
| A09 | Command bar, keymap, shortcuts, undo scope | BUILD | Commands, matters and records ranked by frecency. No global undo across panes |
| A10 | Settings and profiles: models, OCR engines, rule packs, confidentiality, providers | BUILD | Two layers, firm preferences and a non-patchable legal layer |
| A11 | Long jobs: progress, cancellation, retry, resume markers | BUILD | Cancellation reaches the runner, not only the widget |
| A12 | Voice input: capture, VAD, ASR, legal-term normaliser | BUILD, one DEPEND | Local ASR. Voice cannot authorise a filing |
| A13 | Typography and text: Devanagari, legal faces, bidi, IME | BUILD | Our viewer needs real shaping. egui's default text path is not enough for documents |
| A14 | Accessibility tree for our widgets | BUILD | AccessKit through egui-winit. Canvas content is exposed through B03, not as thousands of nodes |
| A15 | First run: workspace root, provider key, OCR models, fonts | BUILD | Installs and starts with no network. Capture, research, model calls and verification need one |
| A16 | Inspector drawer: raw record, ledger events, links out and in, producing command, origin | BUILD | Every item in every view opens it (P9) |
| A17 | View galleries: every view in fixture states, no kernel | BUILD | Visual and accessibility review. Pattern from the Macro reference (REF) |

## B. Control surface: how the agent sees and drives the app

The panes are painted, so they have no useful accessibility children. This group is the answer, and it is also how tests and scripts drive the app.

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| B01 | Control protocol: typed commands, typed queries, one schema, local socket or named pipe | BUILD | The only channel the agent uses for app state and actions |
| B02 | Control CLI: `oa` binary over the same protocol | BUILD | CLI first: every capability ships here before its pane. Human debugging, scripted tests, and the agent's shell. Human-class commands are refused to the harness and need OS user presence from the CLI |
| B03 | Pane semantic models: workspace, notebook, viewer, editor publish queryable state with anchor ids | BUILD | What the pane shows is a query. Selection, scroll, page, paragraph and visible text are all typed answers |
| B04 | Viewport snapshot: raster plus text plus anchor rectangles for what is on screen | BUILD | The fallback for a vision model, and the fixture for visual tests |
| B05 | Tool binding: every control command is a registered tool with a side-effect class | BUILD | One registry. The UI calls the same commands |
| B06 | Desktop driver for other applications: UIA first, vision second | VENDOR | `agent-desktop`, for Word, portals, anything outside our window |
| B07 | Browser control: CDP against our Chromium | BUILD | DOM, input, screenshots. Pixels only when the DOM has no answer |
| B08 | Control audit: every accepted command lands in the ledger with actor and result | BUILD | Same rule as every other capability |

## C. Kernel

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| C01 | Command bus, validation, single commit path, current-state view | BUILD | Nothing else writes canonical state |
| C02 | Identifiers: `urn:ulos:` for objects, `sha256:` for bytes, court ids kept as issued | BUILD | One parser, one validation rule |
| C03 | Workspace registry: matters, roots, stage, confidentiality | BUILD | An index over folders, not the case itself |
| C04 | Evidence store: immutable documents, capture records, manifests | BUILD | Bytes never change after import |
| C05 | Draft store: DOCX revisions in a DAG, compare-and-swap heads, checkpoints, working copies, each agent edit its own revertible revision | BUILD | Mutable by design, unlike C04. No revision is ever deleted |
| C06 | Blob store: content addressed, deduped within a matter | BUILD | One blob, many documents. Encryption at rest is OQ-05 |
| C07 | Ledger: append only, hash chained, canonical JSON, per-matter sequence | BUILD | The record of what happened |
| C08 | Receipts and manifests: signed envelope, AI-use disclosure document per filing, verification receipt | BUILD | Not generated while any citation is failed, or unresolved without an advocate attestation |
| C09 | Capability and permission model: scoped grants per run, walls, data labels | BUILD | A capability object, never a store handle |
| C10 | Gates and approvals: durable wait, validated decision, record before effect, fail closed | BUILD | The mechanism behind every human checkpoint |
| C11 | Filing payload store: exact bytes, payload hash, single-use token, reconciliation state | BUILD | Any change to the payload invalidates the token |
| C12 | Reference validation at write time | BUILD | An anchor that does not resolve cannot enter the record |
| C13 | Rejected-write and security audit | BUILD | Separate table, visible count, never silent |
| C14 | Rule packs and profiles: versioned, sourced, non-patchable legal layer | BUILD | Firm preferences patch on top and cannot override it |
| C15 | Outbox and event fan-out to panes, workers and observers | BUILD | The ledger is the record, the outbox is delivery |
| C16 | Bitemporal edges | BUILD | Valid time and record time. Derived, rebuildable |
| C17 | Link index: every reference also recorded as a link, answered in both directions | BUILD | Backlinks for every record. Derived, rebuildable |

## D. Harness

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| D01 | Agent loop: model call, tool proposals, policy, gates, streaming, cancel, budget | BUILD | Small on purpose. Conformance test before any adapter argument |
| D02 | Provider adapters: OpenRouter, local OpenAI-compatible, streaming, tools, structured output | DEPEND | `rig` first, behind our trait. Multi-provider quirks are not ours to own |
| D03 | Model router: residency, confidentiality, budget, pinning, fallback | BUILD | One choke point for what text may leave the machine |
| D04 | Tool registry: name, schemas, description hash, side-effect class, idempotency key, cost | BUILD | The same registry the UI commands use |
| D05 | Capability manifests and runtime gating | BUILD | An adapter's limit becomes behaviour, not a note |
| D06 | Context assembler and context manifest | BUILD | Store what was shown to the model, not only what was said |
| D07 | Durable session and effect ledger: intent before effect, `started/returned/raised/unknown` | BUILD | `harness/session.db`, separate from the canonical ledger. Resume after a kill, replay without duplicate effects |
| D08 | Reconciliation of unknown effects | BUILD | A check before a retry. Never a blind repeat |
| D09 | Playbook interpreter: typed steps, gates, branches, loops, sub-playbooks, content pinned | BUILD | One interpreter, data-defined flows |
| D10 | SLP workflow state machine as data | BUILD | Stages, entry conditions, required artefacts. Executed by D09 |
| D11 | Policy engine: default deny, side-effect classes, destructive command guard, egress | BUILD | Sits in front of D04 and B01 |
| D12 | Agent configurations: one long-horizon orchestrator per matter, sub-agents for judgment research and document edits | BUILD | Task configuration, not separate runtimes. Typed, capped sub-agent returns |
| D13 | Planning and steering: plan view, re-plan, follow-ups, mid-run human steer | BUILD | A steer is a new turn, never a rewrite of history |
| D14 | Service registry and lifecycle | BUILD | Named services, dependency gating, reverse-order disposal |
| D15 | Process supervisor: spawn, handshake, health, restart budget, cancel, typed stdio or pipe | BUILD | Every HOST and every capability process lives under this |
| D16 | Metering: tokens, cost, wall time per run | BUILD | Shown in D17 and in the run inspector |
| D17 | Model trace store: request, response, tool calls, timings | BUILD | The record behind replay and after-the-fact review |
| D18 | Session lease and fence | BUILD | A presumed-dead harness can never append again |
| D19 | Tool-result limit and paging | BUILD | The model sees a preview; the session store and the GUI keep the whole result |

## E. Stores

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| E01 | SQLite schema, migrations, WAL, one `matter.db` per matter workspace | DEPEND | `rusqlite`. One writer process, many readers |
| E02 | Full-text search and Indian legal tokenisation | DEPEND | FTS5. Tantivy only if a measured query fails |
| E03 | Vector search for matter retrieval | DEPEND | `sqlite-vec` inside `matter.db`. Required: the orchestrator finds relevant context through it |
| E04 | Graph projection: build and rebuild from the ledger | BUILD | Behind one trait. Ladybug is the eventual engine |
| E05 | Graph queries on typed tables and recursive CTEs | BUILD | The first implementation behind E04 |
| E06 | Backup, export, restore, offline verification | BUILD | A matter must be movable and checkable without the app |
| E07 | Secrets: provider keys, portal credentials, signing keys | DEPEND | OS keychain and DPAPI. Never plaintext in SQLite |

## F. Capture and ingest

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| F01 | Import paths: dialog, drag and drop, folder, clipboard, bulk | BUILD | Files are files. No import that hides the source |
| F02 | Duplicate handling: identical bytes, same listing, same text after OCR | BUILD | Three layers, one decision each. Never merge a certified scan |
| F03 | Supreme Court capture: case status, judgments search, orders tab | BUILD | Driven through the visible browser |
| F04 | India Code adapter: Acts, sections, amendments, repeal | BUILD | Public read API. Any Act, Central or State |
| F05 | High Court record through the Supreme Court lower-court search | BUILD | Same portal, same capture path |
| F06 | Download interception and hashing | BUILD | The hash is taken before anything opens the file |
| F07 | Login and CAPTCHA handoff: pause, open the visible browser, resume with the human gesture recorded | BUILD | Never inherit the advocate's own session |
| F08 | Email connector: search, attachments, provenance | BUILD | Read only. Email text never changes a permission |
| F09 | Ingestion queue: one job per artefact, event driven, resumable | BUILD | Runs on D07 |
| F10 | Format detection and readability: pdf, docx, image, text, encrypted, corrupt | DEPEND, one BUILD | `magika` if it binds, plus our own magic bytes and structure checks |
| F11 | Classification and metadata: document type, legal category, annexure references | BUILD | Rules first. A wrong class costs a review item, not a reroute |
| F12 | Court codebooks: case types, stages, disposal types, subject categories with list versions | BUILD | Stored as issued, never renumbered |
| F13 | Inbox routing and association | BUILD | Classification never removes provenance |

## G. OCR and document intelligence

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| G01 | PDF open, raster, page hash, page count | DEPEND | `pdfium-render`. One rasteriser for viewer, OCR and anchors |
| G02 | Text and geometry without OCR: characters, lines, boxes | DEPEND | pdfium character boxes |
| G03 | OCR reader one | VENDOR | Tesseract, built from our tree, run as a separate process, hOCR or ALTO out |
| G04 | OCR reader two | VENDOR | PaddleOCR PP-OCRv5 with Devanagari, built from our tree, run as a separate process. Ships with G03 from the start |
| G05 | Layout and reading order: blocks, columns, tables, headers | BUILD | Start with rules over G02 and G03 boxes. A model only if the rules lose |
| G06 | Canonical line model: page, raster hash, line, box, text, confidence, engine version, line hash | BUILD | The contract every anchor points at |
| G07 | Agreement engine: exact for every critical token (digits, dates, amounts, case numbers, party names, provisions, citations, negations), bounded edit distance for the remaining prose | BUILD | Disagreement marks the text disputed and stops it propagating |
| G08 | Anchor resolver: passage to boxes to quote, stable across re-OCR | BUILD | A re-parse is an event, not a silent upgrade |
| G09 | Entity extraction: dates, relative dates, case numbers, CNR, parties, amounts, provisions, citations, negations | BUILD | Rules plus a model assist. Vague wording never becomes a date |
| G10 | Pipeline orchestrator: per-artefact states, results, review items | BUILD | No global pause between stages |
| G11 | Review screen: page image, both readings, dispute decision, accept typed copy | BUILD | Decides whether the product feels trustworthy |
| G12 | Typed copy path for handwritten pages | BUILD | The human who typed it is recorded |
| G13 | OCR gold set and CI gate | BUILD | The upgrade gate for G03, G04 and G05 |

## H. Notebook

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| H01 | Notebook schema: item kinds, anchors, status, provenance | BUILD | Eight sections, one item kind each |
| H02 | Notebook writers: one writer per step, committed through C01 | BUILD | The step that did the work writes the content, the kernel commits |
| H03 | Procedural history: orders, applications, hearings, disposal | BUILD | Event to document to location |
| H04 | Factual matrix: candidate and confirmed facts, conflicts flagged | BUILD | Deterministic and schema shaped |
| H05 | Chronology: date type, source, uncertainty, view exclusion without deletion | BUILD | Exclusion is a filter |
| H06 | Issues, authorities, work products as records | BUILD | Each carries the anchor that supports it |
| H07 | Readiness condition: no queued jobs, review items resolved or skipped | BUILD | A milestone, not a lock |
| H08 | Notebook queries: matter view, stage view, traceability chain from file to paragraph | BUILD | Runs over E04 and E05 |
| H09 | Conflict detection: dates, parties, amounts | BUILD | Flags, never resolves |

## I. Research Studio

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| I01 | Research index ingest and coverage per snapshot: captured judgments plus the AWS catalogue | BUILD | A finding aid, never a verification source |
| I02 | Query planner: exact citation, statute lookup, keyword, hybrid | BUILD | Prevents a citation being searched as prose |
| I03 | Citation span finder for research text | BUILD | Parsing for verification belongs to the validator |
| I04 | Authority retrieval: capture the judgment from the portal before it is quoted | BUILD | Every adopted authority goes to K for verification |
| I05 | Judgment structure: paragraph numbering, reporter block, headnotes, speaker segments | BUILD | Feeds voice classification and the paragraph anchor |
| I06 | Legislation lookup | BUILD | Reuses F04. Verification is ULOS-L through K |
| I07 | Statute mapping data: old to new codes, effective dates, sources | BUILD | Governing date first |
| I08 | Treatment and adverse authority: citing paragraph, treatment, bench strength, coverage | BUILD | Overruled authority is mandatory and blocks grounds approval. A difference of opinion is a warning |
| I09 | Note and memorandum builder: typed propositions bound to a source | BUILD | Separates fact, dispute, proposition, assumption, open question |
| I10 | Case conference: package, argument comparison, recorded accept and reject | BUILD | Rejected arguments are part of the record |
| I11 | Support and voice assessor: does this passage support this claim, and in whose voice | BUILD | Separate vocabulary, never `verified`. The advocate confirms voice |
| I12 | Advisory outcome scores | BUILD | Labelled advisory, from research and bench trends, never per judge, never in a draft |
| I13 | Multi-agent argument evaluation | BUILD | Sub-agents argue for and against a ground for the advocate to read |
| I14 | Quick check of citations against the AWS open-data catalogue of Supreme Court judgments | BUILD | An early signal before the portal check. Outside the ULOS standard, never verification |

## J. Documents, viewers and editors

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| J01 | Lightweight PDF viewer: render, text layer, search, thumbnails, zoom, highlight | BUILD | Our own egui widget over G01. First viewer shipped |
| J02 | Lightweight document viewer: paragraphs, styles, tables, images | BUILD | A read-only model of a document we can render. No Word fidelity claim |
| J03 | Lightweight edit surface: selection, comment, proposed edit against an anchor | BUILD | This is the agent's editing interface, and it is small |
| J04 | Draft generation: templates and generators to the first DOCX revision | DEPEND | `docx-rs`, writer only. Every later read and edit goes through the WordCraft engine |
| J05 | WordCraft: the full editor, and the one DOCX engine | VENDOR, HOST | Vendored from its fork, run as a separate process with its own storage, reparented into a pane. A headless mode applies agent edits and renders PDF |
| J06 | PdfCraft: PDF editing, redaction, forms, assembly | VENDOR, HOST | Same hosting contract as J05 |
| J07 | Hosted window hosting: reparenting, input forwarding, DPI | BUILD | Reparent first, an owned top-level window as the fallback (RQ-77) |
| J08 | Transfer at the boundary: import, export, revision capture, working copy rules | BUILD | The only way bytes cross between a hosted app and C05 |
| J09 | Templates: synopsis, list of dates, questions of law, grounds, prayer, annexures | BUILD | Court format values are data with sources |
| J10 | Generators: chronology to list of dates, events to synopsis, theories to grounds | BUILD | Every generated sentence keeps its event ids |
| J11 | Annexure manager: selection, numbering, page references | BUILD | One numbering authority, recomputed on export |
| J12 | Fidelity oracle: Word, hosted editor, our renderer, diffed page by page | BUILD | The upgrade gate for J02 to J06 |
| J13 | Filing PDF/A: the approved DOCX rendered by the DOCX engine, assembled with annexures, page labels, bookmarks, index | DEPEND | `typst` only for generated pages such as the index, a PDF assembly crate, PDF/A conversion. One production path |
| J14 | Printing | DEPEND | System spooler |
| J15 | Changes viewer: any two revisions by paragraph id, review notes anchored | BUILD | One viewer for agent proposals, WordCraft saves and restores |

## K. Verification adapter

The application side of verification. The checks themselves are done by the `ulos` validator, specified in [specs/U-ulos-validator.md](specs/U-ulos-validator.md).

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| K01 | Verification record store: target hash, checks, outcome, reason, standard version, validator hash, verification proof | BUILD | One shape for every check, bound to the revision judged |
| K02 | Factual checks: statement to source, dates, parties, numbers, provisions, disputed OCR use | BUILD | A missing source fails the check |
| K03 | Citation existence through ULOS-C: parse, resolve, two identifiers agree, parties, date | BUILD | The adapter builds the bundle, `ulos` checks |
| K04 | Legislation through ULOS-L: Act, section, repeal, number and year, conditional amendment check | BUILD | Any Act in India Code |
| K05 | Notebook through ULOS-N: identifiers, case resolves, impugned order, required documents, capture proof, hash | BUILD | Court-portal items only. Client-supplied items are tagged, never checked |
| K06 | Draft consistency: synopsis, list of dates, questions of law, grounds, prayer, annexures, defined terms | BUILD | Cross-reference checks are cheap and high value |
| K07 | Filing compliance and limitation packs: required documents, structure, pagination, declarations, limitation | BUILD | Developed from the Registry's filing-defects list. Limitation computed, then confirmed by the advocate |
| K08 | Mapping from the four validator outcomes to the six gate states | BUILD | One mapping function, tested exhaustively |
| K09 | Independence guard: every record produced by a known `ulos` binary hash | BUILD | No model anywhere in verification |
| K10 | Source stamp: every resolution attempt names its endpoint, fixture sources refused in release builds | BUILD | Replaces the real-or-simulated tag |
| K11 | `ulos` invocation: the validator runs as a separate supervised process | BUILD | The one validator. The adapter has no check code |
| K12 | Adapter conformance against `ulos` outputs | BUILD | The suite itself belongs to `ulos` |
| K13 | Verdict UI: badge, verification proof, source peek, why unresolved, advocate attestation | BUILD | Two actions to the source passage |
| K14 | Paragraph identification through ULOS-CI: paragraph exists, quote occurs, not a headnote | BUILD | Against the judgment captured from the portal |

## L. Filing

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| L01 | Filing orchestrator: destination, payload, declarations, confirmation, execution, capture | BUILD | Ten steps, no shortcuts |
| L02 | Portal adapters | BUILD | Same bridge as F03, stricter policy class |
| L03 | Two confirmations and a single-use token bound to the payload hash | BUILD | Voice cannot satisfy either |
| L04 | Receipt capture and reconciliation: actual result, portal state, no blind retry | BUILD | Duplicate filing is the failure that matters |

## M. Browser

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| M01 | Chromium: one binary on disk, CEF embedded | DEPEND | Child window inside our pane, hardware accelerated |
| M02 | Child window hosting: position, clip, resize, DPI, focus, keyboard | BUILD | The cost of a real browser in an egui pane |
| M03 | Tabs, windows, profiles, session persistence, restore | BUILD | One profile per matter, one filing profile, and a throwaway profile per agent run |
| M04 | Downloads: intercept, hash, route to inbox, capture record | BUILD | Reuses F06 |
| M05 | DevTools, find, zoom, print, save as PDF | DEPEND | Off by default in the filing profile |
| M06 | Agent browser: own process and throwaway profile, same binary, headless, for tool tasks other than filing, attachable to the visible browser only on the advocate's request | VENDOR | `agent-browser`, pointed at our Chromium. Refuses filing destinations |
| M07 | Content extraction: main text, links, tables, with URL and time | BUILD | Page text is untrusted data |
| M08 | Credential store and autofill | DEPEND | OS keychain. The agent never inherits the advocate's cookies |
| M09 | Egress policy per profile: allow list, proxy, deny by default for parsing and agent runs | BUILD | A missed flag must fail safe |
| M10 | Capture exclusion and privacy mode | BUILD | The overlay never appears in a screenshot |

## N. Computer use and desktop apps

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| N01 | Desktop driver: windows, controls, invoke, read, stable refs | VENDOR | `agent-desktop` |
| N02 | Vision fallback: screenshot, plan, act, verify, repair | BUILD | Design from public computer-use research |
| N03 | Overlay and global hotkey, point and box protocol | BUILD | The advocate can point at something and mean it |
| N04 | Action safety: per-app allow list, confirmation class, dry run | BUILD | Policy from D11, not from the driver |
| N05 | Target app registry: Word, Excel, viewers, portals, per-app quirks | BUILD | Data, not code |
| N06 | Screenshot capture and PII masking before a model sees it | BUILD | Client text does not leave by accident |
| N07 | Word control: COM automation and window hosting | BUILD | Word is used when installed, and never becomes the record |

## O. Firm data

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| O01 | Contacts, organisations, counsel, courts, benches | BUILD, one REF | Four small tables. Entity shape studied in an open CRM application, no code taken |
| O02 | Matter party roles and relationship history | BUILD | Party identity here ties matters together |
| O03 | Activity timeline: notes, calls, meetings, filing events | BUILD | Reads the ledger |
| O04 | Correspondence log | BUILD | Log only. No sending path |

## P. Observability

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| P01 | Trace model: one span per model call, tool call, control call, gate wait, joined to the ledger | BUILD | Local exporter only |
| P02 | Run inspector: timeline, inputs, outputs, cost, retries, linked events | BUILD | What both a lawyer and an engineer read after a bad run |
| P03 | Structured logs and metrics | DEPEND | `tracing`, local sink, rotation |
| P04 | Live observation during development | DEPEND | `iii`, reading our trace stream. May keep disposable harness trace logs. Never the record |
| P05 | Eval harness: gold sets, planted defects developed from the Registry's filing-defects list, catch rate per gate | BUILD | The gate's own error rate is a product feature |
| P06 | Replay tests: recorded run against a new loop, prompt or provider | BUILD | The provider swap drill |
| P07 | Diagnostics bundle, opt in | BUILD | Inspectable before it is shared |

## Q. Build and ship

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| Q01 | Installer: signed, per user or per machine, offline capable | BUILD | Size is not a constraint |
| Q02 | Updater: staged, signed, rollback | BUILD | Two files and a signature check is enough |
| Q03 | Bundled assets: Chromium, OCR models, fonts, tokenisers, data | BUILD | Hashed and versioned like code |
| Q04 | CI: build matrix, fixtures, conformance, replay | BUILD | The upgrade gates live here |
| Q05 | Crash handling: dump, safe restart, resume | BUILD | Recovery is a feature |
| Q06 | Telemetry off, provable | BUILD | An egress test in CI |
| Q07 | Network-required behaviour: no offline mode. Reading, review and drafting work without a network, and unreachable sources give `unresolved`, which blocks | BUILD | `unresolved`, never `verified` |

## R. Cloud seams

| ID | Component | Verdict | Built on, or why |
|---|---|---|---|
| R01 | Repository traits over SQLite | BUILD | No SQL dialect in domain code |
| R02 | Blob store trait: local files now, object store later | BUILD | Content addressing makes this nearly free |
| R03 | Identity and tenancy: single user now, firm and client walls later | BUILD later | The owner field exists from day one |
| R04 | Durable engine interface | BUILD | Local runner now, shared engine when a second user or workflow needs it |

---

## Cross dependencies and duplicates

The parts that touch two areas, and the calls that stop them diverging.

**One PDF rasteriser.** G01 pdfium serves the viewer (J01), the OCR input (G03, G04) and the anchor geometry (G06, G08). If a highlight box, an OCR word box and a viewer rectangle came from three sources they would drift by a pixel and the pinpoint would land on the wrong word. PdfCraft stays the editing application. Its engine crates are deliberately written without egui, so one can still be linked later if pdfium fails a specific test, but never alongside it.

**One DOCX engine.** DOCX is the working format, so exactly one component reads and edits it: WordCraft's vendored engine, in its own process. J04 uses `docx-rs` only to write the first revision of a generated draft. Our viewer (J02) renders the paragraph model the engine returns and never parses DOCX itself. Agent edits are applied by the engine in headless mode. The transfer boundary (J08) is the only crossing into the draft store, and it carries DOCX bytes plus a revision record. Paragraph ids are the anchors, so the engine must preserve them through every save. Three parsers on one file is how revision attribution dies.

**The three surfaces the agent has.** B01 for our panes, B07 for the browser, B06 for other applications. All three are registered as tools (B05) and pass the same policy (D11). The order is fixed. Typed state first, accessibility second, pixels last. Without that order the agent will screenshot its way into a slow, unreliable product.

**One Chromium.** M01 is the binary. M03 is the profile. M06 is the agent's process, using the same binary. The advocate's logins never enter the agent profile (M09). Attaching the agent to the visible browser is a policy decision, not a second product.

**Two stores, on purpose.** C04 evidence is immutable, C05 drafts move. The Notebook (H01) points into C04 and never into C05. A draft paragraph may quote notebook text, and the link is an anchor reference, not a copy. This is the duplicate that must stay visible, so the map keeps them apart at every layer.

**One search owner, one graph owner.** E02 owns text search and E03 owns vector search, both inside `matter.db`. E04 owns relations, and E05 is its first implementation. The graph is a projection of the ledger, so deleting it costs a rebuild and nothing else. Anything outside SQLite (Tantivy, a separate vector store, a graph database) arrives only after a measured failure.

**One event path.** C07 records, C15 delivers. P01 and P04 observe. A pane that needs to know something is listening to C15, not polling the database, and iii never becomes a second source.

**Matter identity in two places, one writer.** A03 creates the folder, C03 records it. The folder is the thing that survives. C03 is an index that can be rebuilt by scanning.

**Two OCR readers, deliberately.** G03 and G04 disagree by design, and the disagreement is the signal. The cost is two runtimes and two model sets, so both are vendored and run as separate processes behind one line model (G06), from the first release.

**The harness and the UI touch the same commands.** B01 and D04 are one registry seen from two sides. If the UI and the agent could do different things, the capability manifest would be a lie. The exception is the human-class commands, which the UI and the CLI can issue and the harness cannot.

**One validator.** `ulos` is the only producer of verification records. K builds its input and maps its output, and holds no check code. Research Studio (I) assesses support, voice and treatment in its own vocabulary and never produces `verified`.

## Calls I would make differently

Eight places where the obvious stack is not the one I would build, and why. All eight are adopted ([decisions.md](decisions.md) section 4).

**egui can expose an accessibility tree after all.** The earlier assumption was that an immediate-mode app is invisible to automation. egui depends on accesskit and egui-winit ships the platform adapter, so UIA can see our standard widgets. The correct design is still a control protocol for canvas content, but accessibility is no longer a dead end, and screen readers become reachable.

**Host the document applications instead of vendoring them into the pane tree.** Both WordCraft and PdfCraft pin their own forks of egui and winit. Linking their UI next to upstream egui means two incompatible copies of the same crate. Their source is vendored into our tree so it is ours to patch, and each runs as its own hosted process. Hosting keeps their forks theirs and keeps our shell upstream.

**Own the lightweight viewer.** A page renderer, a text layer and an anchor overlay are small and they are the surface the agent edits through. Waiting for a full fidelity editor to land before showing a page would delay the whole workflow.

**Skip the workflow cluster.** A durable local runner with intent rows and an effect ledger meets the recovery requirement for one user on one laptop. The interface stays so the cloud phase can attach a shared engine.

**Skip the network-shaped stores.** No search cluster, no managed vector database, no second JVM store in the first release. One SQLite database per workspace plus blobs is enough for a matter of a few thousand pages, and it is portable.

**Do not adopt a provider framework as the harness.** A framework that owns a session store becomes a second authority. Use it as an adapter behind our loop and measure it against the loop's conformance test.

**Defer the .NET compare engine.** Redlines and accept/reject are required, but the first version needs them for our own drafts, where the DOCX engine and paragraph-level revisions suffice. A .NET sidecar is the fallback when real court documents defeat the engine, not the default.

**Two OCR engines as processes, not one model in-process.** The disagreement signal is the product feature, and a native inference runtime in the UI process is a crash waiting for a bad scan.

## Workspace layout on disk

```
<matter root>/<matter id>/
  manifest.json          ids, parties, stage, standard version, rule pack pin
  matter.db              ledger, evidence entries, notebook, drafts index, search and vector indexes
  inbox/                 not yet classified; the agent may write here
  evidence/              one entry per document, pointing at blobs
  blobs/<sha256>         immutable bytes
  captures/              capture records, retry logs
  drafts/<draft id>/     our DOCX revision store, one head per draft
  drafts/external/       hosted applications' working copies and own files
  filings/               payloads, receipts, disclosure documents
  exports/               generated PDF/A files and bundles
  harness/session.db     harness session store, separate from the ledger
  harness/scratch/       the agent's scratch area
```

Beside the matter folders, the application data folder holds `registry.db` (the matter index, rebuildable by scanning) and `firm.db` (firm data, group O).

The rule is simple. Anything a court or a client handed us is under `blobs` and never edited. Anything we produced is under `drafts` or `exports` and always versioned. Removing a matter folder removes the matter.

## Build order

Every step lands as `oa` commands first, then its pane.

1. Workspace, kernel skeleton, ledger, stores, as `oa` commands. Kill the process mid-write and prove nothing duplicates. Then the file browser.
2. Control protocol, the full `oa` CLI surface, and the harness as a child process. Every later pane is a client of the protocol from birth.
3. Lightweight PDF viewer over pdfium, with anchors, plus the viewer query model.
4. Capture from the Supreme Court portal through the browser pane, with download hashing, capture records and the inbox.
5. OCR with both engines as separate processes, the line model, the agreement engine, the review screen.
6. Notebook: procedural history, factual matrix, chronology, readiness.
7. The WordCraft spike: prove paragraph ids survive, headless edits, render to PDF (H-02, H-03). Then the lightweight document viewer and edit surface, and draft generation to DOCX.
8. The `ulos` validator and its conformance suite, then the verification adapter, on real citations and one real capture. Research Studio alongside.
9. Hosted WordCraft, then hosted PdfCraft, through J07 and J08.
10. Filing last, with the two confirmations and a fake portal for the duplicate test.

## Open questions

Every choice in this map is settled in [decisions.md](decisions.md). The questions still open are listed there in section 11.
