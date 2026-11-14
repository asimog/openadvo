# Build plan

Status: current. This file is the only owner of build order. No dates and no time estimates.

The plan serves [advocate-workflow.md](advocate-workflow.md). The decisions it builds on are in [decisions.md](decisions.md). Ideas outside the current step go to [parking.md](parking.md).

## 1. Rule of the plan

- No step gets a second version until its round is complete and the owner has used the whole round on a real brief (B6).
- A step is done when the owner completes its proof task on a real brief (lesson L3). A test the agent wrote is evidence, not completion.
- A step's v0 spec is written when the step starts, and it is one page (lesson L1). Each started step has one in [specs/](specs/).
- A v0 may do little. It may not pretend (lesson L2). A feature that is not built shows as "not available" and never as a result.

## 2. Steps and rounds

| Step | Name | Workflow sections | Round |
|---|---|---|---|
| 1 | Application skeleton, matter store and dropped files | 2, part of 3 | 1 |
| 2 | Document intelligence: text, page anchors, PDF view in the Euro-Office PDF editor | 4 | 1 |
| 3 | Notebook: sources, procedural history, Factual Matrix, chronology | 5, 6 | 1 |
| 4 | List of Dates and Synopsis as a DOCX in the editor | 8A, 8B | 1 |
| 5 | Factual verification and draft consistency | 9A, 9D | 2 |
| 6 | Research, memoranda, case conference, Questions of Law, Grounds | 7, 8C, 8D | 2 |
| 7 | Citation verification and adverse-authority review | 9B, 9C | 2 |
| 8 | Annexures, filing compliance, approval, filing PDF | 8E, 9E, 10 | 2 |
| 9 | Court record capture and client email | 3 | 3 |
| 10 | Agent-operated filing and voice | 11, 2 | 3 |
| V1 | Second version of the components: durable chat, memory, workflows, record table, conference package, petition and prayer, filing manifest, extractor quality, matter rename and archive | 2 to 11, Appendix C 1 and 8 | 4 |
| V2 | Third version of the components: files other than PDF, document type, same-text duplicates, relative dates, List of Dates rows, interim relief and condonation, signed manifest, memory proposals | 3, 4, 8, 9, Appendix B | 5 |

The order is the order the task gave, with one change forced by a dependency. The owner wants the complete Euro-Office suite, including its PDF editor, inside the app (2026-11-13). The PDF view of step 2 is that PDF editor, so vendoring and hosting Euro-Office moves from step 4 to step 2. Step 4 then uses the Word editor that step 2 already hosts. Two more notes on the order:

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
| 12. The full Euro-Office suite (Word, PDF and the other editors) inside the window | 2 (hosting, PDF editor), 4 (Word editor) | v0 |
| 4. Detect document type and legal category | 2 | Later. Step 2 v0 has no classification, by the advocate or by the system. |
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
- **Views (as built, layout of decisions choice 20):** title bar; side navigation with the matters; chat landing page; in a matter, the chat dock with one Pi session and the view (Sources tab with the source list; source detail: SHA-256, size, origins, status, events).
- **Events written:** `matter.created`, `source.added`, `source.origin_added`, `source.missing`, `source.changed`, `agent.session_started`. **Records read:** matters, sources, origins, events.
- **Carry over from `advodsh/plugins/workspace-editor`:** `lib/scope.js` (resolve a path through links before a containment check; port the rule into the matter store's path check). `lib/errors.js` (one module owns the error codes; port the pattern, not the DSH codes). Nothing else applies to step 1.

### Step 2. Document intelligence: text, page anchors, PDF view

- **Serves:** workflow 4 and Appendix A (event-driven processing), Appendix B-A (capture and ingestion separate). The advocate opens a source in the Euro-Office PDF editor inside the window and sees it page by page. Each page shows its extracted text, and whether the text is born-digital or OCR. Scanned pages are read by OCR. Files that cannot be read open a review item.
- **v0:** The complete official Euro-Office release, vendored by script and hosted in the window ([euro-office-vendoring.md](euro-office-vendoring.md)). Sources open in its PDF editor, read only: the blob is never edited. PDF only. Born-digital text with page and line anchors. One OCR engine (`tesseract.js`, English, WASM, so no per-platform binary). Each OCR reading is marked "single reading, not cross-checked". One job per source, started when the source is added. Review items for unreadable, encrypted or partly readable files. The advocate classifies a source by hand. **Later:** a second OCR engine and critical-token disputes; automatic document type and legal category; annexure and exhibit references; duplication kind 3 (same text after OCR); image files and DOCX sources.
- **Depends on:** [euro-office-vendoring.md](euro-office-vendoring.md). **To verify at step 2:** whether our host can move the PDF editor to a page and mark a line anchor. If it cannot, the anchor is shown in the page-text panel beside the editor.
- **Input:** the sources of a step 1 matter. **Output:** page records, line anchors and review items in `matter.db`. **Proof task:** the owner opens each PDF of a real brief, checks three pages of born-digital text and three scanned pages against the page image, and resolves or skips every review item.
- **Port when the step starts:** `deprecated/docs/specs/G-ocr-document-intelligence.md` (pipeline states, review items, OCR gold set G13); `deprecated/docs/specs/F-capture-ingest.md` (ingestion queue); `deprecated/docs/specs/J-documents-editors.md` J01 (PDF viewer requirement: anchors and highlights at page geometry); `deprecated/docs/decisions.md` sections 5C, 5N and 5.4; `research/engineering research/C2-prior-art-repos-review.md` section 6 (ingest, OCR and anchors).
- **Main-process modules:** `main/ingest.ts` (a queue with one job per source; it calls the library and passes results to `main/matters.ts`, which writes them); `main/editor-host.ts` (serves the vendored Euro-Office files and our host page on a custom protocol; answers the editors' `AscDesktopEditor` calls over IPC; runs conversions).
- **Plain libraries:** `lib/document-intelligence` (wraps `pdfjs-dist` for text with positions, and `tesseract.js` for OCR); `lib/converter` (selects the release's `x2t` by platform and runs it; builds the font list with `x2t -create-allfonts`).
- **Scripts:** `scripts/vendor-euro-office.ts` (fetches and checks the release; see the vendoring document).
- **Agent tools:** `read_source_text` (one source, a page range); `search_sources` (text search; returns anchors). Both read only.
- **Bridge functions (as built).** Queries: `listJobs`, `getSourcePages`, `listReviewItems`, `openSourceView`, `closeView`; an `onIngestUpdate` event. Human-only actions: `resolveReviewItem`, `skipReviewItem`.
- **Views:** the Euro-Office PDF editor in the view (a sandboxed frame that fills the view to its top edge), with the page text below it only when a page was read by OCR or has no text, or when a source link asks for one line (owner, 2026-11-14: a readable PDF shows the editor alone); the review item list.
- **Events written (as built):** `ingest.started`, `ingest.finished` (with page counts by kind), `ingest.failed`, `ocr.read`, `review_item.opened`, `review_item.resolved`, `review_item.skipped`. **Records read:** sources, blobs, pages, anchors, OCR readings, jobs, review items.
- **Carry over from `advodsh/plugins/workspace-editor`:** `lib/editor/host.html`, `lib/editor/boot.js`, `lib/editor/shim.js` (host page, editor boot, `AscDesktopEditor` answers; follow the official open and save flow, see the vendoring document); `lib/x2t.js` (one conversion at a time, a temp folder per run); `lib/engine/locate.js` (converter SHA-256 check, WD-101). Remove every euro-office-lite part.

### Step 3. Notebook: sources, procedural history, Factual Matrix, chronology

- **Serves:** workflow 5 (A to D, H for date conflicts), 6, Appendix B-C (date extraction), Appendix B-D (Notebook readiness), Appendix B-E (traceability). The advocate opens the Notebook and sees four tabs: Sources, Procedural history, Factual Matrix, Chronology. Every dated event shows its source line. The advocate confirms or rejects each event, excludes a date from a view, and sees conflicting dates flagged.
- **v0:** deterministic date extraction by the rules of Appendix B-C. Explicit dates first; relative dates against the document's own header date; inferred and unresolved dates marked. Every dated event enters the chronology. Event fields exactly as workflow section 6 lists them. Procedural events are events with a procedural kind (institution, application, order, hearing, judgment). Notebook readiness computed by the rule of Appendix B-D. The agent reads the Notebook. It does not write it. **Later:** agent-proposed candidate events (recorded as agent-authored candidates, confirmed only by the advocate); the relationship graph view; legal issues and authorities (step 6).
- **Input:** the pages and anchors of step 2. **Output:** candidate events, procedural events and confirmations in `matter.db`; the chronology view. **Proof task:** the owner builds the chronology of a real brief, confirms or rejects every event, checks ten events against their source lines, and resolves every date conflict.
- **Port when the step starts:** `deprecated/docs/specs/H-notebook.md`; `deprecated/docs/decisions.md` section 5C (dates and corrections); `research/architecrture research/C3-master-research-and-architecture.md` section 6 (Notebook and case graph) and section 15 (data model); `research/engineering research/C2-prior-art-repos-review.md` section 7.
- **Main-process modules:** `main/notebook.ts` (runs extraction when a source's ingestion finishes; passes results to `main/matters.ts`).
- **Plain libraries:** `lib/notebook` (date extraction, event schema, chronology builder, conflict detection, readiness rule). No external library is needed. Indian date formats are parsed by our own tested rules.
- **Agent tools:** `list_events` (filters: kind, confirmed, date range); `get_event` (with its source anchor); `get_chronology`. All read only.
- **Bridge functions (as built).** Query: `getNotebook` (events, conflicts, readiness). Human-only actions: `confirmEvent`, `rejectEvent`, `excludeEvent`, `includeEvent`, `resolveConflict`.
- **Views (as built):** the Notebook in the view pane, with a Matter tab (matter facts, review items, events) beside the four Notebook tabs (Astryx `TabList`), a readiness badge, the open date conflicts with Keep and "Both dates are right", and a source link on every row that opens the source at the page with the line marked.
- **Events written (as built):** `notebook.events_extracted` (one per source, with a count), `notebook.conflict_flagged`, `notebook.conflict_resolved`, `notebook.event_confirmed`, `notebook.event_rejected`, `notebook.event_excluded`, `notebook.event_included`, and `review_item.opened` and `review_item.resolved` for conflicts. **Records read:** anchors, pages, jobs, events, decisions, conflicts, review items.
- **Carry over from `advodsh/plugins/workspace-editor`:** none.

### Step 4. List of Dates and Synopsis as a DOCX in the editor

- **Serves:** workflow 8 (DOCX working petition, each revision new), 8A, 8B, 10 (approval of one revision), Appendix B-E (file to SLP paragraph). The advocate asks for the List of Dates and the Synopsis. A DOCX opens in the Euro-Office editor inside the window. "Show source of this paragraph" opens the Notebook event and its source line. The advocate edits, saves (a new revision) and approves a revision.
- **v0:** the Word editor that step 2 hosts. Editor-design items a to d, i and j ([editor-design.md](editor-design.md)). A generator writes the first revision from confirmed events only (Appendix B-C: only checked dates in generated prose). Each generated paragraph carries an anchor that links it to its event ids. Human save makes a new revision with a base revision. "Check citations" is shown as "not available until step 7". The verification state shows "not verified". **Later:** model polishing of the Synopsis with traceability kept (8A); agent edits as tracked changes (editor-design items e to h, step 5); inserting a Notebook sentence at the cursor (v0 adds it at the end of the draft).
- **Input:** the confirmed events of step 3. **Output:** a draft with revisions in the matter store; the DOCX open in the editor. **Proof task:** the owner generates the List of Dates and Synopsis of a real brief, follows "Show source" for five paragraphs, edits and saves twice, approves one revision, and opens the approved DOCX in Microsoft Word.
- **Port when the step starts:** `deprecated/docs/specs/J-documents-editors.md` (revisions, first-revision writer, editor in a view); `deprecated/docs/decisions.md` section 5.5 (DOCX to PDF/A flow) for the revision rules; `research/architecrture research/C6-document-editor-and-module-architecture.md` sections 4 and 8; the engine rules listed in [editor-design.md](editor-design.md).
- **Main-process modules (as built):** `main/editor-host.ts` from step 2, with the Word document package served from a working copy; `main/drafts.ts` (generation, the save path through x2t, revisions and paragraph links, through `main/matters.ts`).
- **Plain libraries (as built):** `lib/drafting` (List of Dates and Synopsis from the event schema to a DOCX, with paragraph anchors; the `docx` npm library, and `fflate` for the DOCX package); `lib/converter` from step 2, with `convertFile` for one `TaskQueueDataConvert` run.
- **Agent tools (as built):** `read_draft` (live text of the latest revision of each draft, with its paragraph anchors; read only); `get_paragraph_source` (anchor to event ids and source lines; read only).
- **Bridge functions (as built).** Queries: `listDrafts`, `getRevision`, `getParagraphSource`. Actions: `generateListOfDates`, `generateSynopsis`, `openRevisionInEditor`, `insertFromNotebook` (records the paragraph link and returns the anchor and sentence). Human-only actions (decision 5): `saveRevision` (needs a base revision), `approveRevision`.
- **Save path (as built):** the editor's own save command and the harness bar's "Save revision" both send the editor's document package (`asc_nativeGetFile3`) to the window; the window calls `saveRevision`, the main process converts `Editor.bin` to DOCX with the release's x2t, and the matter store makes the revision or refuses a stale base (`DOC_STALE_BASE`) or a missing base (`BASE_REQUIRED`). The editor's saved index is reset after a successful save.
- **Views (as built):** the Drafts section on the Matter tab (generate, list, open latest or approved); the editor view (the editor frame fills the view; the harness bar of [editor-design.md](editor-design.md) item c sits in the chat dock: view switch, Save revision, Insert from Notebook, Show source of this paragraph, Check citations, Approve revision, and the status area).
- **Files (as built):** `src/lib/drafting/index.ts`; `src/lib/matter-store/index.ts` (draft, revision, approval and paragraph-link tables); `src/main/drafts.ts`; `src/main/editor-host.ts`; `src/editor-host/boot.js` and `shim.js`; `src/main/index.ts`, `main/agent.ts`, `main/matters.ts`, `src/preload/index.ts`, `src/shared/{records,api}.ts`; `src/renderer/src/{Drafts,DraftView}.tsx`, `App.tsx`, `app.css`; spec [specs/v0-list-of-dates-and-synopsis.md](specs/v0-list-of-dates-and-synopsis.md).
- **Tests (as built):** `tests/unit/drafting.test.ts` (13), `tests/unit/drafts-store.test.ts` (4), `tests/e2e/step4.spec.ts` (generate, show source, edit and save twice, approve). The report records the commands and the proof run: [2026-11-14-step4-report.md](../.agents/logs/2026-11-14-step4-report.md); the round 1 proof on a real brief: [2026-11-14-round1-proof-report.md](../.agents/logs/2026-11-14-round1-proof-report.md).
- **Events written (as built):** `draft.generated`, `revision.saved`, `revision.approved`, `editor.opened`, `editor.closed`. **Records read:** events, confirmations, anchors, drafts, revisions, paragraph links.
- **Settled at step 4 (as built):** the paragraph anchor is a block content control whose tag is the anchor ([editor-design.md](editor-design.md) section 1.1); the editor opens in Edit, because Final is a read-only preview in this build (section 1.2 and Q-5).
- **Carry over from `advodsh/plugins/workspace-editor`:**
  - The host page, shim and `x2t` code came over at step 2.
  - `lib/docs.js`: the per-document temp layout (`Editor.bin`, `media/`) and the refusal of a write with a stale base or a dirty editor (WD-007 to WD-010).
  - `lib/errors.js`: the document error codes that remain (`DOC_STALE_BASE`, `DOC_EDITOR_DIRTY`, `DOC_STALE_TARGET`).
  - `lib/outline.js`: the heading outline (not needed in v0; carried only if a later step reads it).
  - Not carried: `lib/client.js`, `lib/index.js`, `lib/roles.js`, `lib/fanout/`, `lib/tools/` (DSH plugin and fan-out code).

### Step 5. Factual verification and draft consistency

- **Serves:** workflow 9A, 9D, the first quality-gate states of 9, and editor-design items e to h. The advocate runs the checks on a draft and sees each defect with its evidence, the affected paragraph, and the action required. The agent proposes corrections as tracked changes, and the advocate keeps or undoes each one.
- **v0:** see [specs/v0-verification.md](specs/v0-verification.md). Every factual statement in the draft has a source anchor; dates match the Factual Matrix; party names and case numbers match the matter; Synopsis agrees with the List of Dates. Agent edits as tracked changes through the Document Builder. **Later:** India Code statutory checks; full cross-reference checks.
- **Started 2026-11-14. Built so far:** `src/lib/verification/index.ts` (the deterministic checks), `Drafts.check` in `src/main/drafts.ts`, the bridge function `checkDraft`, "Check draft" in the harness bar, the event `draft.checked`; tests `tests/unit/verification.test.ts` (7) and the check in `tests/e2e/step4.spec.ts`. Second part, agent changes: `src/lib/tracked-changes/index.ts`; `Drafts.proposeCorrection`, `agentChanges`, `decideAgentChanges` and the approval gate in `src/main/drafts.ts`; revision author `agent` with a one-time migration in the matter store; agent tools `check_draft` and `propose_correction`; the AG-UI interrupt in `src/main/agent.ts`; bridge functions `agentChanges` and `decideAgentChanges` (human-only); the card `src/renderer/src/AgentChangesCard.tsx`; events `revision.proposed`, `agent_change.decided`; tests `tests/unit/tracked-changes.test.ts` (5), `tests/unit/agent-changes.test.ts` (2), `tests/unit/agui-interrupt.test.ts` (1), `tests/e2e/step5.spec.ts` (1); live evidence in [2026-11-14-step5-agent-changes](../.agents/logs/2026-11-14-step5-agent-changes/). Third part: defects as review items of their draft (`review_item.draft_id`, migrated) and the gate state (`gateState` in `src/lib/verification/index.ts`); tests `tests/unit/gate.test.ts` (2) and the gate in `tests/e2e/step5.spec.ts`. Fourth part: "Show in editor" on each change (item f; host command `goToAnchor`). Fifth part: the party-name and case-number checks, from the matter details of step 8. Step 5 v0 is built; its proof task is the owner's.
- **Input:** an approved or working revision from step 4. **Output:** review items and quality-gate state. **Proof task:** the owner runs the checks on a real draft with three planted errors and finds all three, and decides every agent change.
- **Port when the step starts:** `deprecated/docs/specs/K-verification-adapter.md` (state mapping); `deprecated/docs/decisions.md` section 5.3 (verifier states); the Notebook verification gates G1 to G7 in `research/architecrture research/C3-master-research-and-architecture.md` section 6 (no C5 file exists; C3 holds the gates); `advodsh/plugins/workspace-editor/lib/engine/manager.js`, `lib/engine/diff.js`, `lib/model/blocks.js`, `lib/model/session-contract.js`, `lib/review/analyzers.js` (sidecar lifecycle, block diff, live-text rule, commit eligibility, legal analyzers).

### Step 6. Research, memoranda, case conference, Questions of Law, Grounds

- **Serves:** workflow 5E, 5F, 5G, 7A to 7E, 8C, 8D. The advocate directs research, reads memoranda grounded in Notebook references, chairs the case conference, and approves grounds. Studio drafts Questions of Law and Grounds into the petition as tracked changes.
- **v0:** see [specs/v0-research.md](specs/v0-research.md). **Later:** capture before quote, support and voice assessment, treatment, advisory scores (R-1), multi-agent evaluation.
- **Started and built 2026-11-14 (as built):** `src/lib/matter-store/work.ts` (issues, authorities, memoranda), `src/lib/research/index.ts` (references), `src/main/research.ts`, `src/lib/tracked-changes` `proposeInsertion`, `Drafts.proposeParagraph`, draft kinds `questions_of_law` and `grounds` (migrated), the Research tab in `src/renderer/src/Work.tsx`, the agent tools of the spec. Test: `tests/e2e/steps6to10.spec.ts` (one end-to-end run of steps 6 to 10 against the built application, with a local stand-in portal and the vendored `ulos`).
- **Input:** the Notebook and the impugned judgment. **Output:** memoranda, conference record, approved grounds, petition revision. **Proof task:** the owner runs a case conference on a real brief and approves at least one ground drafted by Studio.
- **Port when the step starts:** `deprecated/docs/specs/I-research-studio.md`; `deprecated/docs/specs/D-harness.md` (tool result paging, context); `research/architecrture research/C3-master-research-and-architecture.md` sections 7, 8 and 11; `research/engineering research/C2-prior-art-repos-review.md` sections 10 and 11; ruling R-1 in [decisions.md](decisions.md).

### Step 7. Citation verification and adverse-authority review

- **Serves:** workflow 5F, 9B, 9C. Every citation in the petition shows the validator's outcome. A failed or unresolved citation blocks until corrected or attested. The adverse-authority review is recorded before grounds approval.
- **v0:** see [specs/v0-citations.md](specs/v0-citations.md). The validator is `ulos`, built in `C:\dev\ulosadvo`, vendored by `npm run vendor:ulos`. **Later:** pinpoint and quote checks, statute checks, portal lookups after 2023, the AI-use disclosure.
- **Started and built 2026-11-14 (as built):** `src/lib/ulos/index.ts`, `scripts/vendor-ulos.ts`, `Research.checkCitations`, attestations, the adverse-authority review, `legalBlockers` in the gate and in approval. Test: `tests/e2e/steps6to10.spec.ts` (one end-to-end run of steps 6 to 10 against the built application, with a local stand-in portal and the vendored `ulos`).
- **Input:** a petition revision with citations. **Output:** validator outcomes and review items. **Proof task:** the owner verifies every citation of a real petition and attests one that cannot be resolved.
- **Port when the step starts:** `deprecated/docs/specs/U-ulos-validator.md`; `deprecated/docs/specs/K-verification-adapter.md`; `research/architecrture research/C3-master-research-and-architecture.md` section 5; rulings R-2, R-5, R-6.

### Step 8. Annexures, filing compliance, approval, filing PDF

- **Serves:** workflow 8E, 9E, 10, Appendix C 4 and 5. The advocate sees annexures numbered consistently, the filing defects as review items, limitation computed with its working, and the PDF/A filing set made from the approved DOCX revision.
- **v0:** see [specs/v0-filing.md](specs/v0-filing.md). **Later:** the Registry's defect list (Q-6), pagination and a combined PDF, PDF/A annexures, limitation exclusions.
- **Started and built 2026-11-14 (as built):** `src/lib/filing/index.ts` (rules `slp-package-v0`, limitation, PDF/A test), `src/main/filing.ts` (filing set through x2t with `m_bIsPDFA`), matter details, the Filing tab. Test: `tests/e2e/steps6to10.spec.ts` (one end-to-end run of steps 6 to 10 against the built application, with a local stand-in portal and the vendored `ulos`).
- **Input:** an approved petition revision and its sources. **Output:** the filing set (PDF/A) and the compliance report. **Proof task:** the owner prepares the filing set of a real SLP and checks it against the Registry's list of defects.
- **Port when the step starts:** `deprecated/docs/specs/L-filing.md`; `deprecated/docs/decisions.md` section 5.5 (DOCX to PDF/A); ruling R-3 and R-4; editor-design item h (gate).

### Step 9. Court record capture and client email

- **Serves:** workflow 2 (case number, CNR, email), 3, Appendix B-B duplication kind 2. The agent finds the case on the Supreme Court portal, downloads the record into the matter inbox with its provenance, and imports authorised email attachments. The advocate solves CAPTCHA and signs in in a visible browser.
- **v0:** see [specs/v0-capture.md](specs/v0-capture.md). **Later:** a script for the live portal's case search, case status as data, attachments other than PDF.
- **Started and built 2026-11-14 (as built):** `src/main/portal.ts` (visible portal window, download capture), `src/main/mail.ts` (`.eml` and read-only IMAP; `postal-mime` 4.2.0, `imapflow` 2.10.0), capture provenance in `work.ts`. Test: `tests/e2e/steps6to10.spec.ts` (one end-to-end run of steps 6 to 10 against the built application, with a local stand-in portal and the vendored `ulos`). The IMAP path is not run against a live mailbox.
- **Input:** a case number or CNR; an authorised mailbox. **Output:** sources with capture provenance. **Proof task:** the owner captures the record of a real case and imports client attachments from email.
- **Port when the step starts:** `deprecated/docs/specs/F-capture-ingest.md`; `deprecated/docs/specs/M-browser.md`; `deprecated/docs/specs/O-firm-data.md`; `deprecated/docs/decisions.md` OQ-13 (one IMAP-compatible path, read only).

### Step 10. Agent-operated filing and voice

- **Serves:** workflow 11, 2 (voice instruction), Appendix A (filing agent-operated, not agent-authorised), Appendix C 1. The agent prepares and executes the filing in the visible browser after two confirmations bound to the payload hash. The advocate can direct the work by voice. Voice cannot confirm a filing.
- **v0:** see [specs/v0-agent-filing.md](specs/v0-agent-filing.md). **Later:** a user-presence prompt on confirmation 2 (Q-4), a script for the live e-filing forms, continuous voice.
- **Started and built 2026-11-14 (as built):** confirmations in `work.ts`, the portal tools `upload_filing_file`, `submit_filing`, `save_portal_receipt` in `src/main/portal.ts`, voice in `src/lib/voice/index.ts` (`@huggingface/transformers` 4.3.2; model by `npm run vendor:voice`) and the composer's microphone. Tests: `tests/e2e/steps6to10.spec.ts` (one end-to-end run of steps 6 to 10 against the built application, with a local stand-in portal and the vendored `ulos`); `tests/e2e/voice.spec.ts` (Windows speech synthesis through Chromium's fake microphone).
- **Input:** an approved filing set. **Output:** the portal receipt linked to the matter. **Proof task:** the owner files a real SLP through the application, or runs the flow to the last confirmation on the portal's test path if one exists.
- **Port when the step starts:** `deprecated/docs/specs/L-filing.md`; `deprecated/docs/specs/M-browser.md`; `deprecated/docs/specs/N-desktop-computer-use.md`; [questions.md](questions.md) Q-4.

### Round 4. V1 of the components

- **Started 2026-11-14 on the owner's instruction**, which overrides rule B6 for this round. **Spec:** [specs/v1.md](specs/v1.md) (items V1-1 to V1-10). Each item is built thin, joined to the rest, tested, and pushed to `main` on its own.
- **Built 2026-11-14 (as built):** V1-9 in `src/lib/notebook/index.ts` (method `rules-v2`); V1-8 in `src/lib/filing/index.ts` (`canonicalJson`, `manifestDigest`, `verifyManifest`) and `src/main/filing.ts`; V1-6 and V1-7 in `src/lib/drafting/structured.ts` and `Drafts.generate` (draft kinds `conference` and `petition`, migrated), check rules 23 and 24 as defect kinds `incomplete` and `prayer_mismatch`, approval refused with `DRAFT_INCOMPLETE`; V1-1 in `src/main/agent.ts` (`SessionManager.continueRecent` in `<matter>/chat/pi`, `messages.json`, `newConversation`); V1-2 in `src/shared/markdown.ts` and `src/renderer/src/Markdown.tsx`; V1-3 in `main/matters.ts` and the tool `read_matter_memory`; V1-4 in `src/lib/workflows/index.ts`; V1-5 in `work.ts` (`record_column`, `record_cell`), `src/main/record-table.ts` and the tools `list_record_table`, `fill_record_cell`; V1-10 in the matter store (`rename`, the `archived` marker file). Views: `src/renderer/src/V1.tsx`, the Record table tab, the chat dock (New conversation, Workflows), the landing page (Workflows, Archived).
- **Tests (as built):** `tests/unit/notebook-v1.test.ts`, `filing-manifest.test.ts`, `structured.test.ts`, `markdown.test.ts`; `tests/e2e/v1.spec.ts`; `tests/e2e/steps6to10.spec.ts` extended with the conference package, the petition and the manifest check. Report: [2026-11-14-v1-report.md](../.agents/logs/2026-11-14-v1-report.md).
- **Proof task:** see [specs/v1.md](specs/v1.md). Not yet run by the owner.

### Round 5. V2 of the components

- **Started 2026-11-14 on the owner's instruction**, which overrides rule B6 for this round. **Spec:** [specs/v2.md](specs/v2.md) (items V2-1 to V2-8). Each item is built thin, joined to the rest, tested, and pushed to `main`.

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
| The editor frontend and the converter come from different versions. | Startup check from step 2: both come from one release file whose sha256 equals the vendoring table; refuse to open the editor otherwise. |
| A new Euro-Office release adds or changes an `AscDesktopEditor` call. | The round-trip test in [euro-office-vendoring.md](euro-office-vendoring.md): open a DOCX and a PDF, edit, save, reopen, and fail on any call our host does not answer. |
| An event in the matter store names a Pi session that does not exist. | Test at step 1: the session id in `agent.session_started` equals the Pi session's id. |
| A date that is not confirmed reaches generated prose. | Test at step 4: an unconfirmed event never appears in the List of Dates or the Synopsis. |
