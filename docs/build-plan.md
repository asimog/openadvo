# Build plan

Status: current. This file is the only owner of build order. No dates and no time estimates.

The plan serves [advocate-workflow.md](advocate-workflow.md). The decisions it builds on are in [decisions.md](decisions.md). Ideas outside the current step go to [parking.md](parking.md).

## 1. Rule of the plan

- No step gets a second version until its round is complete and the owner has used the whole round on a real brief (B6).
- A step is done when the owner completes its proof task on a real brief (lesson L3). A test the agent wrote is evidence, not completion.
- A step's v0 spec is written when the step starts, and it is one page (lesson L1). Only step 1 has a spec now: [specs/v0-app-and-matter-store.md](specs/v0-app-and-matter-store.md).
- A v0 may do little. It may not pretend (lesson L2). A feature that is not built shows as "not available" and never as a result.

## 2. Steps and rounds

| Step | Name | Workflow sections | Round |
|---|---|---|---|
| 1 | Application skeleton, matter store and dropped files | 2, part of 3 | 1 |
| 2 | Document intelligence: text, page anchors, PDF view | 4 | 1 |
| 3 | Notebook: sources, procedural history, Factual Matrix, chronology | 5, 6 | 1 |
| 4 | List of Dates and Synopsis as a DOCX in the editor | 8A, 8B | 1 |
| 5 | Factual verification and draft consistency | 9A, 9D | 2 |
| 6 | Research, memoranda, case conference, Questions of Law, Grounds | 7, 8C, 8D | 2 |
| 7 | Citation verification and adverse-authority review | 9B, 9C | 2 |
| 8 | Annexures, filing compliance, approval, filing PDF | 8E, 9E, 10 | 2 |
| 9 | Court record capture and client email | 3 | 3 |
| 10 | Agent-operated filing and voice | 11, 2 | 3 |

The order is the order the task gave. No dependency forces a change. Two notes on the order:

- Step 4 needs the Factual Matrix of step 3, and step 5 needs the draft of step 4. The order serves both.
- Step 9 comes late because step 1 already accepts dropped files. The record can enter the matter before court capture exists.

## 3. Coverage table

Every section and appendix item of the workflow has a row. "v0" means the step's first version serves the item. "Later" means a second version of that step serves it, after its round.

| Workflow section | Step | v0 or later |
|---|---|---|
| 1. Objective: instruction to filing-ready SLP | 1 to 10 together | v0 across the rounds |
| 2. Starting a matter: give the impugned judgment PDF | 1 | v0 |
| 2. Starting a matter: case number or CNR | 1 (recorded as text); 9 (used for capture) | v0 records it; capture later in round 3 |
| 2. Starting a matter: voice instruction | 10 | Round 3 |
| 2. Starting a matter: import client documents | 1 | v0 (dropped files) |
| 2. Starting a matter: authorised email account | 9 | Round 3 |
| 2. Matter creation, steps 1 to 5 | 1 | v0: the advocate creates the matter. Agent-requested creation is later: it needs a human confirmation. |
| 2. Recognisable matter identity; missing information recorded as missing | 1 | v0: title only, other fields "not recorded". Parties, court and CNR fields: later (step 1, second version). |
| 3. Court record acquisition | 9 | Round 3 |
| 3. Authentication and CAPTCHA | 9 | Round 3 |
| 3. Client documents from email | 9 | Round 3 |
| 3. Direct import of documents | 1 | v0 |
| 3. Acquisition is continuous; each artifact an independent task | 1 (each file a separate record); 2 (each file a separate job) | v0 |
| 4. Hash and preserve original bytes | 1 | v0 |
| 4. Identify format and readability | 2 | v0 (PDF only; other formats reported "not supported") |
| 4. Detect document type and legal category | 2 | Later. v0: the advocate classifies. |
| 4. Metadata, annexure and exhibit references | 2 | Later |
| 4. Born-digital text | 2 | v0 |
| 4. OCR of scanned pages | 2 | v0: one OCR engine, each reading marked "single reading, not cross-checked" |
| 4. Page and passage references | 2 | v0 (page and line) |
| 4. Structured extraction results; review items | 2 | v0 |
| 4. OCR disputes between engines (critical tokens) | 2 | Later: needs a second engine |
| 4. Document identity separate from file bytes | 1 (source record), 2 | v0 |
| 4. Original never overwritten | 1 | v0 |
| 5. Notebook A: source documents | 3 | v0 |
| 5. Notebook B: procedural history | 3 | v0 |
| 5. Notebook C: Factual Matrix | 3 | v0 |
| 5. Notebook D: chronology | 3 | v0 |
| 5. Notebook E: legal issues | 6 | Round 2 |
| 5. Notebook F: authorities | 6, 7 | Round 2 |
| 5. Notebook G: work products | 4 (drafts), 6 (memoranda) | v0 for drafts; memoranda round 2 |
| 5. Notebook H: review and verification | 2 (OCR items), 3 (date conflicts), 5, 7, 8 | v0 for steps 2 and 3 |
| 5. Stable references passed between capabilities; graph as projection | 1 to 4 (ids), integration section below | v0 ids; graph view later |
| 6. Procedural history | 3 | v0 |
| 6. Factual Matrix: deterministic, schema-based, every field listed | 3 | v0 |
| 6. Exclude a date from a view without deleting it | 3 | v0 |
| 6. Conflicting dates flagged | 3 | v0 |
| 7A. Initial case assessment | 6 | Round 2 |
| 7B. Research | 6 | Round 2 |
| 7C. Research prompts and lawyer direction | 6 | Round 2 |
| 7D. Legal memoranda | 6 | Round 2 |
| 7E. Case conference, advisory scores | 6 | Round 2 |
| 8. Petition structure; DOCX working petition; each revision new | 4 | v0 for List of Dates and Synopsis |
| 8A. Synopsis from schema, traceable to event ids | 4 | v0 (no model polishing; polishing later) |
| 8B. List of Dates from the Factual Matrix | 4 | v0 |
| 8C. Questions of Law | 6 | Round 2 |
| 8D. Grounds | 6 | Round 2 |
| 8E. Annexures | 8 | Round 2 |
| 9A. Factual verification | 5 | Round 2 |
| 9B. Citation verification | 7 | Round 2 |
| 9C. Adverse-authority review | 7 | Round 2 |
| 9D. Draft consistency | 5 | Round 2 |
| 9E. Filing compliance; limitation; PDF/A | 8 | Round 2 |
| 9. Quality-gate outcome and its one tested mapping | 5 (first states), 7, 8 | Round 2 |
| 10. Advocate approval and document commitment | 4 (approve a revision), 8 (approve for filing) | v0 at step 4 for one revision; filing approval round 2 |
| 11. Filing: agent-operated, lawyer-authorised | 10 | Round 3 |
| 12. The unified environment | 1 (one window), every step | v0 |
| Appendix A. Notebook is not a working copy | 3 | v0 |
| Appendix A. Event-driven processing | 2 | v0 |
| Appendix A. Research, analysis and drafting connected | 4, 6 | v0 at step 4 |
| Appendix A. Filing agent-operated, not agent-authorised | 10 | Round 3 |
| Appendix B-A. Capture and ingestion separate | 1 (capture: import), 2 (ingestion) | v0 |
| Appendix B-B. Duplication 1: identical bytes | 1 | v0 |
| Appendix B-B. Duplication 2: same court listing | 9 | Round 3 |
| Appendix B-B. Duplication 3: same text after OCR | 2 | Later: suggestion with advocate confirmation |
| Appendix B-C. Date extraction rules | 3 | v0 |
| Appendix B-D. Notebook readiness | 3 | v0 |
| Appendix B-E. Source traceability chain | 2, 3, 4 | v0 |
| Appendix C 1. Whole-application agent operation through chat and voice | 1 (chat), 10 (voice) | Chat v0; voice round 3 |
| Appendix C 2. Shared resource identity and provenance | 1 to 4 | v0 |
| Appendix C 3. Continuous human supervision and explicit review states | 2, 3, 4 | v0 |
| Appendix C 4. Separate workflow-specific procedural state machines | 8 | Round 2 |
| Appendix C 5. Versioned, source-backed procedural rules | 8 | Round 2 |
| Appendix C 6. Explicit verification outcomes and limitations | 5, 7 | Round 2 |
| Appendix C 7. Unix composability, simple interchange, thin glue | 1 (plain libraries, JSON records) | v0 |
| Appendix C 8. Durable, recoverable agent sessions | 1 | Later: step 1 v0 keeps the chat for one run (see [parking.md](parking.md)) |
| Appendix C 9 to 13 | Same rows as Appendix B above | As above |

## 4. The steps

Each step lists: the workflow sections and the result the advocate sees; the v0 scope and what waits; one input, one output and the proof task; the earlier material to port when the step starts. Earlier material is read only when the step starts (see [repo-map.md](repo-map.md)). Abbreviations: `deprecated` is `C:\dev\openadvodeprecated`; `advodsh` is `C:\dev\advodsh`; `research` is `C:\dev\archive\research`.

Round 1 steps also list the main-process modules, agent tools, bridge functions, views, events and the code to carry over (B4). Rounds 2 and 3 do not (lesson L1).

### Step 1. Application skeleton, matter store and dropped files

- **Serves:** workflow 2 (matter creation, matter identity) and part of 3 (direct import). The advocate creates a matter, drops PDFs into it, asks the agent "list the sources", and sees every source with its hash after a restart.
- **v0:** see [specs/v0-app-and-matter-store.md](specs/v0-app-and-matter-store.md). **Later:** parties, court, CNR fields; matter rename and archive; agent-requested matter creation with a human confirmation; persisted chat; formats other than PDF.
- **Input:** PDF files of one real brief. **Output:** a matter folder with `matter.db`, one blob per distinct SHA-256, and an append-only event table. **Proof task:** in the spec.
- **Port when the step starts:** `deprecated/docs/specs/C-kernel.md` (matter identity, event record rules); `deprecated/docs/specs/E-stores.md` (content-addressed blobs); `deprecated/docs/specs/F-capture-ingest.md` (import path, duplication kind 1); `deprecated/docs/decisions.md` section 5M (workspace and record shape).
- **Main-process modules:** `main/matters.ts` wraps the matter-store library and is the only caller of it; `main/agent.ts` wraps the Pi SDK; `main/ipc.ts` registers the bridge handlers; `main/window.ts` creates the window.
- **Plain libraries:** `lib/matter-store` (wraps `node:sqlite`, `node:crypto`, `node:fs`). No Electron import, no Pi import.
- **Agent tools:** `list_sources` (read only).
- **Bridge functions.** Queries: `listMatters`, `listSources`, `listEvents`. Actions: `createMatter`, `addFiles`, `sendChat`. Human-only actions: none in step 1.
- **Views:** matters and sources pane; view pane (source detail: name, SHA-256, size, origins, status, events); chat pane with one Pi session.
- **Events written:** `matter.created`, `source.added`, `source.origin_added`, `source.missing`, `source.changed`, `agent.session_started`. **Records read:** matters, sources, origins, events.
- **Carry over from `advodsh/plugins/workspace-editor`:** `lib/scope.js` (resolve a path through links before a containment check; port the rule into the matter store's path check). `lib/errors.js` (one module owns the error codes; port the pattern, not the DSH codes). Nothing else applies to step 1.

### Step 2. Document intelligence: text, page anchors, PDF view

- **Serves:** workflow 4 and Appendix A (event-driven processing), Appendix B-A (capture and ingestion separate). The advocate opens a source and sees the PDF page by page. Each page shows its extracted text, and whether the text is born-digital or OCR. Scanned pages are read by OCR. Files that cannot be read open a review item.
- **v0:** PDF only. Born-digital text with page and line anchors. One OCR engine (`tesseract.js`, English, WASM, so no per-platform binary). Each OCR reading is marked "single reading, not cross-checked". One job per source, started when the source is added. Review items for unreadable, encrypted or partly readable files. The advocate classifies a source by hand. **Later:** a second OCR engine and critical-token disputes; automatic document type and legal category; annexure and exhibit references; duplication kind 3 (same text after OCR); image files and DOCX sources.
- **Input:** the sources of a step 1 matter. **Output:** page records, line anchors and review items in `matter.db`. **Proof task:** the owner opens each PDF of a real brief, checks three pages of born-digital text and three scanned pages against the page image, and resolves or skips every review item.
- **Port when the step starts:** `deprecated/docs/specs/G-ocr-document-intelligence.md` (pipeline states, review items, OCR gold set G13); `deprecated/docs/specs/F-capture-ingest.md` (ingestion queue); `deprecated/docs/specs/J-documents-editors.md` J01 (PDF viewer requirement: anchors and highlights at page geometry); `deprecated/docs/decisions.md` sections 5C, 5N and 5.4; `research/engineering research/C2-prior-art-repos-review.md` section 6 (ingest, OCR and anchors).
- **Main-process modules:** `main/ingest.ts` (a queue with one job per source; it calls the library and passes results to `main/matters.ts`, which writes them).
- **Plain libraries:** `lib/document-intelligence` (wraps `pdfjs-dist` for text with positions, and `tesseract.js` for OCR).
- **Agent tools:** `read_source_text` (one source, a page range); `search_sources` (text search; returns anchors). Both read only.
- **Bridge functions.** Queries: `getSourcePages`, `getPageText`, `getSourceBytes` (the bytes for the PDF view; the renderer reads no file), `listReviewItems`. Human-only actions: `classifySource`, `resolveReviewItem`, `skipReviewItem`.
- **Views:** PDF view in the view pane (`pdfjs-dist` renders from bytes the bridge gives), with the page text beside it and the anchor of the selected line; the review item list.
- **Events written:** `ingest.started`, `ingest.finished`, `ingest.failed`, `page.extracted`, `ocr.read`, `review_item.opened`, `review_item.resolved`, `review_item.skipped`, `source.classified`. **Records read:** sources, blobs, pages, anchors, review items.
- **Carry over from `advodsh/plugins/workspace-editor`:** none. The plugin has no PDF or OCR code.

### Step 3. Notebook: sources, procedural history, Factual Matrix, chronology

- **Serves:** workflow 5 (A to D, H for date conflicts), 6, Appendix B-C (date extraction), Appendix B-D (Notebook readiness), Appendix B-E (traceability). The advocate opens the Notebook and sees four tabs: Sources, Procedural history, Factual Matrix, Chronology. Every dated event shows its source line. The advocate confirms or rejects each event, excludes a date from a view, and sees conflicting dates flagged.
- **v0:** deterministic date extraction by the rules of Appendix B-C. Explicit dates first; relative dates against the document's own header date; inferred and unresolved dates marked. Every dated event enters the chronology. Event fields exactly as workflow section 6 lists them. Procedural events are events with a procedural kind (institution, application, order, hearing, judgment). Notebook readiness computed by the rule of Appendix B-D. The agent reads the Notebook. It does not write it. **Later:** agent-proposed candidate events (recorded as agent-authored candidates, confirmed only by the advocate); the relationship graph view; legal issues and authorities (step 6).
- **Input:** the pages and anchors of step 2. **Output:** candidate events, procedural events and confirmations in `matter.db`; the chronology view. **Proof task:** the owner builds the chronology of a real brief, confirms or rejects every event, checks ten events against their source lines, and resolves every date conflict.
- **Port when the step starts:** `deprecated/docs/specs/H-notebook.md`; `deprecated/docs/decisions.md` section 5C (dates and corrections); `research/architecrture research/C3-master-research-and-architecture.md` section 6 (Notebook and case graph) and section 15 (data model); `research/engineering research/C2-prior-art-repos-review.md` section 7.
- **Main-process modules:** `main/notebook.ts` (runs extraction when a source's ingestion finishes; passes results to `main/matters.ts`).
- **Plain libraries:** `lib/notebook` (date extraction, event schema, chronology builder, conflict detection, readiness rule). No external library is needed. Indian date formats are parsed by our own tested rules.
- **Agent tools:** `list_events` (filters: kind, confirmed, date range); `get_event` (with its source anchor); `get_chronology`. All read only.
- **Bridge functions.** Queries: `getChronology`, `getEvent`, `getReadiness`. Human-only actions: `confirmEvent`, `rejectEvent`, `excludeFromView`, `includeInView`, `resolveDateConflict`.
- **Views:** the Notebook view with four tabs (Astryx `TabList`), sortable tables (Astryx `Table`), and a source link on every row that opens the step 2 PDF view at the line.
- **Events written:** `notebook.event_extracted`, `notebook.event_confirmed`, `notebook.event_rejected`, `notebook.view_excluded`, `notebook.view_included`, `notebook.conflict_flagged`, `notebook.conflict_resolved`. **Records read:** pages, anchors, events, confirmations, review items.
- **Carry over from `advodsh/plugins/workspace-editor`:** none.

### Step 4. List of Dates and Synopsis as a DOCX in the editor

- **Serves:** workflow 8 (DOCX working petition, each revision new), 8A, 8B, 10 (approval of one revision), Appendix B-E (file to SLP paragraph). The advocate asks for the List of Dates and the Synopsis. A DOCX opens in the Euro-Office editor inside the window. "Show source of this paragraph" opens the Notebook event and its source line. The advocate edits, saves (a new revision) and approves a revision.
- **v0:** editor-design items a to d, i and j ([editor-design.md](editor-design.md)). A generator writes the first revision from confirmed events only (Appendix B-C: only checked dates in generated prose). Each generated paragraph carries an anchor that links it to its event ids. Human save makes a new revision with a base revision. "Check citations" is shown as "not available until step 7". The verification state shows "not verified". **Later:** model polishing of the Synopsis with traceability kept (8A); agent edits as tracked changes (editor-design items e to h, step 5).
- **Input:** the confirmed events of step 3. **Output:** a draft with revisions in the matter store; the DOCX open in the editor. **Proof task:** the owner generates the List of Dates and Synopsis of a real brief, follows "Show source" for five paragraphs, edits and saves twice, approves one revision, and opens the approved DOCX in Microsoft Word.
- **Depends on:** [euro-office-vendoring.md](euro-office-vendoring.md), which the owner reads before this step starts.
- **Port when the step starts:** `deprecated/docs/specs/J-documents-editors.md` (revisions, first-revision writer, editor in a view); `deprecated/docs/decisions.md` section 5.5 (DOCX to PDF/A flow) for the revision rules; `research/architecrture research/C6-document-editor-and-module-architecture.md` sections 4 and 8; the engine rules listed in [editor-design.md](editor-design.md).
- **Main-process modules:** `main/editor-host.ts` (serves the vendored frontend and our host page on a custom protocol; keeps the working copy folder; runs conversions); `main/drafts.ts` (generation and revisions, through `main/matters.ts`).
- **Plain libraries:** `lib/drafting` (List of Dates and Synopsis from the event schema to a DOCX, with paragraph anchors; wraps the `docx` npm library); `lib/converter` (selects the `x2t` binary by platform and runs it; one conversion at a time; checks the converter's SHA-256 against the vendor manifest).
- **Agent tools:** `read_draft` (live text of a revision with its paragraph anchors, read only); `get_paragraph_source` (anchor to event ids and source lines).
- **Bridge functions.** Queries: `listDrafts`, `getRevision`, `getParagraphSource`. Actions: `generateListOfDates`, `generateSynopsis`, `openRevisionInEditor`. Human-only actions: `saveRevision` (needs a base revision), `approveRevision`.
- **Views:** the editor view (editor frame plus the harness bar of [editor-design.md](editor-design.md) item c).
- **Events written:** `draft.generated`, `revision.saved`, `revision.approved`, `editor.opened`, `editor.closed`. **Records read:** events, confirmations, anchors, drafts, revisions, paragraph links.
- **Carry over from `advodsh/plugins/workspace-editor`:**
  - `lib/editor/host.html`, `lib/editor/boot.js`, `lib/editor/shim.js`: the host page, the editor boot and the host interface shim. Adapt to the official release. Remove every euro-office-lite part. [euro-office-vendoring.md](euro-office-vendoring.md) section f lists what carries over.
  - `lib/x2t.js`: one conversion at a time, a cleared temp folder per run, the font cache for PDF export. Replace the Windows paths with the platform module.
  - `lib/docs.js`: the per-document temp layout (`Editor.bin`, `media/`) and the refusal of a write with a stale base or a dirty editor (WD-007 to WD-010).
  - `lib/errors.js`: the document error codes that remain (`DOC_STALE_BASE`, `DOC_EDITOR_DIRTY`, `DOC_STALE_TARGET`).
  - `lib/outline.js`: the heading outline.
  - `lib/engine/locate.js`: the converter SHA-256 check (WD-101).
  - Not carried: `lib/client.js`, `lib/index.js`, `lib/roles.js`, `lib/fanout/`, `lib/tools/` (DSH plugin and fan-out code).

### Step 5. Factual verification and draft consistency

- **Serves:** workflow 9A, 9D, the first quality-gate states of 9, and editor-design items e to h. The advocate runs the checks on a draft and sees each defect with its evidence, the affected paragraph, and the action required. The agent proposes corrections as tracked changes, and the advocate keeps or undoes each one.
- **v0:** every factual statement in the draft has a source anchor; dates match the Factual Matrix; party names and case numbers match the matter; Synopsis agrees with the List of Dates. Agent edits as tracked changes through the Document Builder. **Later:** India Code statutory checks; full cross-reference checks.
- **Input:** an approved or working revision from step 4. **Output:** review items and quality-gate state. **Proof task:** the owner runs the checks on a real draft with three planted errors and finds all three, and decides every agent change.
- **Port when the step starts:** `deprecated/docs/specs/K-verification-adapter.md` (state mapping); `deprecated/docs/decisions.md` section 5.3 (verifier states); research C5 section 6.2, gates G1 to G7 (**not found**, see [questions.md](questions.md) Q-1); `advodsh/plugins/workspace-editor/lib/engine/manager.js`, `lib/engine/diff.js`, `lib/model/blocks.js`, `lib/model/session-contract.js`, `lib/review/analyzers.js` (sidecar lifecycle, block diff, live-text rule, commit eligibility, legal analyzers).

### Step 6. Research, memoranda, case conference, Questions of Law, Grounds

- **Serves:** workflow 5E, 5F, 5G, 7A to 7E, 8C, 8D. The advocate directs research, reads memoranda grounded in Notebook references, chairs the case conference, and approves grounds. Studio drafts Questions of Law and Grounds into the petition as tracked changes.
- **v0 and later:** set when the step starts.
- **Input:** the Notebook and the impugned judgment. **Output:** memoranda, conference record, approved grounds, petition revision. **Proof task:** the owner runs a case conference on a real brief and approves at least one ground drafted by Studio.
- **Port when the step starts:** `deprecated/docs/specs/I-research-studio.md`; `deprecated/docs/specs/D-harness.md` (tool result paging, context); `research/architecrture research/C3-master-research-and-architecture.md` sections 7, 8 and 11; `research/engineering research/C2-prior-art-repos-review.md` sections 10 and 11; ruling R-1 in [decisions.md](decisions.md).

### Step 7. Citation verification and adverse-authority review

- **Serves:** workflow 5F, 9B, 9C. Every citation in the petition shows the validator's outcome. A failed or unresolved citation blocks until corrected or attested. The adverse-authority review is recorded before grounds approval.
- **v0 and later:** set when the step starts. The validator is `ulos`, built in `C:\dev\ulosadvo`.
- **Input:** a petition revision with citations. **Output:** validator outcomes and review items. **Proof task:** the owner verifies every citation of a real petition and attests one that cannot be resolved.
- **Port when the step starts:** `deprecated/docs/specs/U-ulos-validator.md`; `deprecated/docs/specs/K-verification-adapter.md`; `research/architecrture research/C3-master-research-and-architecture.md` section 5; rulings R-2, R-5, R-6.

### Step 8. Annexures, filing compliance, approval, filing PDF

- **Serves:** workflow 8E, 9E, 10, Appendix C 4 and 5. The advocate sees annexures numbered consistently, the filing defects as review items, limitation computed with its working, and the PDF/A filing set made from the approved DOCX revision.
- **v0 and later:** set when the step starts.
- **Input:** an approved petition revision and its sources. **Output:** the filing set (PDF/A) and the compliance report. **Proof task:** the owner prepares the filing set of a real SLP and checks it against the Registry's list of defects.
- **Port when the step starts:** `deprecated/docs/specs/L-filing.md`; `deprecated/docs/decisions.md` section 5.5 (DOCX to PDF/A); ruling R-3 and R-4; editor-design item h (gate).

### Step 9. Court record capture and client email

- **Serves:** workflow 2 (case number, CNR, email), 3, Appendix B-B duplication kind 2. The agent finds the case on the Supreme Court portal, downloads the record into the matter inbox with its provenance, and imports authorised email attachments. The advocate solves CAPTCHA and signs in in a visible browser.
- **v0 and later:** set when the step starts.
- **Input:** a case number or CNR; an authorised mailbox. **Output:** sources with capture provenance. **Proof task:** the owner captures the record of a real case and imports client attachments from email.
- **Port when the step starts:** `deprecated/docs/specs/F-capture-ingest.md`; `deprecated/docs/specs/M-browser.md`; `deprecated/docs/specs/O-firm-data.md`; `deprecated/docs/decisions.md` OQ-13 (one IMAP-compatible path, read only).

### Step 10. Agent-operated filing and voice

- **Serves:** workflow 11, 2 (voice instruction), Appendix A (filing agent-operated, not agent-authorised), Appendix C 1. The agent prepares and executes the filing in the visible browser after two confirmations bound to the payload hash. The advocate can direct the work by voice. Voice cannot confirm a filing.
- **v0 and later:** set when the step starts.
- **Input:** an approved filing set. **Output:** the portal receipt linked to the matter. **Proof task:** the owner files a real SLP through the application, or runs the flow to the last confirmation on the portal's test path if one exists.
- **Port when the step starts:** `deprecated/docs/specs/L-filing.md`; `deprecated/docs/specs/M-browser.md`; `deprecated/docs/specs/N-desktop-computer-use.md`; [questions.md](questions.md) Q-4.

## 5. Integration

### 5.1 Record kinds in round 1

The matter store module (`lib/matter-store`, called only by `main/matters.ts`) writes every matter record. Other modules compute; they never write. "Computed by" names the module that produces the content.

| Record kind | Step | Computed by | Writer | Readers |
|---|---|---|---|---|
| Matter | 1 | Bridge `createMatter` | Matter store | Matters pane; `list_sources` (matter id) |
| Source (document identity: id, name, SHA-256, size, status) | 1 | Bridge `addFiles` | Matter store | Sources pane; `list_sources`; step 2 ingest; step 3 Notebook Sources tab |
| Origin (one row per time a file was added) | 1 | Bridge `addFiles` | Matter store | Source detail view |
| Blob (file bytes at `blobs/<sha256>`) | 1 | Bridge `addFiles` | Matter store | Integrity check; step 2 ingest; `getSourceBytes` |
| Event (append-only: who, what, when, session id) | 1 | Every writer call | Matter store | Source detail view; tests |
| Page (source, page number, text kind, text) | 2 | `lib/document-intelligence` | Matter store | PDF view; `read_source_text`; step 3 extraction |
| Line anchor (source SHA-256, page, line, box, text) | 2 | `lib/document-intelligence` | Matter store | PDF view; `search_sources`; Notebook events; draft paragraph links |
| OCR reading (engine, version, page, text, confidence) | 2 | `lib/document-intelligence` | Matter store | PDF view; review items |
| Review item (kind, target, status) | 2, 3 | Ingest, Notebook | Matter store; status by human bridge actions only | Review list; readiness rule |
| Notebook event (fields of workflow section 6) | 3 | `lib/notebook` | Matter store | Notebook view; `list_events`; step 4 generator |
| Confirmation or rejection | 3 | Human bridge action | Matter store | Notebook view; generator (confirmed only) |
| View exclusion | 3 | Human bridge action | Matter store | Chronology view (never deletes the event) |
| Draft (document identity of a work product) | 4 | `lib/drafting` | Matter store | Drafts list; editor view |
| Revision (SHA-256, base revision, author kind, approval) | 4 | Generator or human save | Matter store | Editor view; `read_draft` |
| Paragraph link (revision, paragraph anchor, event ids) | 4 | `lib/drafting` | Matter store | "Show source"; `get_paragraph_source` |
| Pi session (agent activity) | 1 | Pi | Pi (its own session store) | Chat pane. The matter store holds only the session id in events (decision 7). |

### 5.2 One sentence followed back to its source

A sentence in the List of Dates, for example "On 12.03.2024 the High Court dismissed the writ petition."

| Link | Record | Id carried |
|---|---|---|
| Draft paragraph | Paragraph in revision R of the List of Dates draft | `revision_id` and `paragraph_anchor` (the anchor written into the DOCX, see [editor-design.md](editor-design.md)) |
| Notebook item | Notebook event, confirmed | `event_id`, from the paragraph link record |
| Line | Line anchor on the judgment page | `anchor_id`, from the event's source field |
| Page | Page record | `source_id` and `page_number`, from the anchor |
| File hash | Source and blob | `sha256`, from the source; the blob path is `blobs/<sha256>` |

Every link is a stored id, never a text match. A link that cannot be followed is reported as broken.

### 5.3 Where the editor meets the record

- **Open:** the editor gets a working copy of a revision. It never opens the blob in place (editor-design item i).
- **Generate:** the generator writes a new revision with paragraph anchors and paragraph links.
- **Save:** a human save sends the working copy back with its base revision. The matter store makes a new revision, or refuses a stale base.
- **Show source:** the harness bar reads the paragraph anchor at the cursor and follows the paragraph link.
- **Insert from Notebook:** inserts an event's text and writes a paragraph link for the new anchor.
- **Approve:** a human bridge action on one revision.

### 5.4 Risks to integration

| Risk | Test that catches it |
|---|---|
| Paragraph anchors do not survive an editor save through `x2t`. "Show source" breaks after the first human save. | Generate a draft, open it in the editor, type in two paragraphs, save, and check that every anchor is still present and linked. Run at step 4 on the vendored build. |
| A blob is changed or removed outside the application, and a view still shows it as good. | Change one byte of a blob and delete another; reopen the matter; expect `changed` and `missing`, and the events `source.changed` and `source.missing`. Step 1 end-to-end test. |
| The renderer gets file or Node access by a configuration change. | End-to-end test: in the renderer, `typeof require` is `undefined`, `typeof process` is `undefined`, and the bridge exposes only the named functions. |
| The agent gets a tool that writes, or an extension adds tools. | Unit test: the session's active tool names equal the registered allowlist exactly. Step 1. |
| Events are edited or deleted. | Unit test: an `UPDATE` or `DELETE` on the event table fails. Step 1. |
| Page numbers differ between the PDF view and the extracted text. | Test at step 2: page count and page order are equal for every fixture PDF. |
| The editor frontend and the converter come from different versions. | Startup check at step 4: both versions equal the vendor manifest; refuse to open the editor otherwise. |
| An event in the matter store names a Pi session that does not exist. | Test at step 1: the session id in `agent.session_started` equals the Pi session's id. |
| A date that is not confirmed reaches generated prose. | Test at step 4: an unconfirmed event never appears in the List of Dates or the Synopsis. |
