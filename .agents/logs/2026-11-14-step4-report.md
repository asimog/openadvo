# Report: build step 4 — List of Dates and Synopsis as a DOCX in the Word editor

Date: 2026-11-14. Repository: `C:\dev\openadvo`. Round 1, step 4, on `main`. Nothing pushed.

## 1. What was built

| File | What it is |
|---|---|
| `docs/specs/v0-list-of-dates-and-synopsis.md` | The one-page v0 spec of the step. |
| `src/lib/drafting/index.ts` | Plain library. The List of Dates and the Synopsis from the event schema to a DOCX, with one block-content-control anchor per generated paragraph; the DOCX paragraph reader (live text only); the sentence used by Insert from Notebook. Uses `docx@9.15.3` and `fflate@0.8.3` (new direct dependencies). |
| `src/lib/matter-store/index.ts` | Drafts, revisions, approvals and paragraph links; `putBlob`/`readBlob`; the base-revision rules (`BASE_REQUIRED`, `DOC_STALE_BASE`, `HUMAN_ONLY`); append-only triggers for revisions and links. |
| `src/main/drafts.ts` | Generation from confirmed events only; the working copy; the save path (`Editor.bin` to DOCX through x2t); revision detail; paragraph source; `readDrafts`; open and close events. |
| `src/main/editor-host.ts` | Serves the Word document package and the document's draft and revision ids. |
| `src/editor-host/shim.js` | The desktop shell object: the editor's own save command now asks the window to save, and the modified-state report is forwarded. |
| `src/editor-host/boot.js` | Opens word documents for editing; applies the editor defaults and the ribbon configuration; runs the harness-bar protocol (view switch, Show source, Insert, Save); polls the editor's own change history for the dirty state. |
| `src/main/index.ts`, `src/main/matters.ts`, `src/main/agent.ts`, `src/preload/index.ts`, `src/shared/{records,api}.ts` | The bridge functions, the two read-only agent tools (`read_draft`, `get_paragraph_source`) and the draft and revision types. |
| `src/renderer/src/Drafts.tsx`, `src/renderer/src/DraftView.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/app.css` | The Drafts section and the editor view with the harness bar above a sandboxed editor frame. |
| `tests/unit/drafting.test.ts`, `tests/unit/drafts-store.test.ts` | 13 + 4 unit tests. |
| `tests/e2e/step4.spec.ts`, `tests/e2e/env.ts` | The step 4 end-to-end test, and the launch environment fix (see defect 1). |
| `.agents/logs/2026-11-14-step4-editor-findings.md`, `.agents/logs/2026-11-14-step4-evidence/` | The Euro-Office findings and the proof evidence. |

The plan's surfaces are all present. One action was added to the plan's list, as built: `insertFromNotebook` (it records the paragraph link and returns the anchor and sentence; the renderer sends the insert command to the editor frame). The save path is: the harness bar's "Save revision" and the editor's own save command both send the editor's document package to the window, which calls the human-only `saveRevision`.

## 2. The spec

[docs/specs/v0-list-of-dates-and-synopsis.md](../../docs/specs/v0-list-of-dates-and-synopsis.md), one page. Its rules: deterministic generation from confirmed, non-excluded events only; an open date conflict refuses generation; one anchor per generated paragraph; the editor works on a working copy; a human save needs a base revision; the matter store is the single writer; approval is a human-only action; the ribbon is trimmed by configuration only; "Check citations" and the verification state never pretend.

## 3. Editor-design points settled and how

| Point | Result |
|---|---|
| Anchor: bookmark or content control (section 1.1) | **Block content control with `w:tag`.** It survived two x2t round trips and a Microsoft Word 16.0 open and save. The bookmark also survived, but Word renumbers its `w:id`. Read at the cursor through the builder API: `GetCurrentContentControl().GetTag()`. |
| Review display "final" hides all markup | **Partly confirmed.** With one tracked insertion, Final showed the text without the insertion underline and Edit showed the underline. A hidden tracked deletion was not observed, so that part is unverified. Final and Original are read-only previews in this build. |
| Accept and reject one change after moving to it | **Confirmed.** `asc_GetNextRevisionsChange()` then `asc_AcceptChangesBySelection()` removed one tracked insertion (author report 1 → 0); the same move then `asc_RejectChangesBySelection()` removed another (typed text gone, original text back). |
| Ribbon configuration keys (item d) | **Confirmed.** `customization.layout.toolbar = { file:false, plugins:false, protect:false }`, `customization.layout.header = { users:false, editMode:false }`, `coEditing: { mode:"fast", change:false }`, `customization.chat:false` hide File, Plugins, Protection and the co-editing controls. This build has **no "Review" tab**: the review tools sit in the **Collaboration** tab, so it is kept. Draw and View remain (not named by item d). |
| Advocate's typing untracked by default | **Confirmed.** With one tracked change present and `asc_SetTrackRevisions(false)`, typing added no revision. |
| Anchor survives an editor save | **Confirmed.** After two editor saves, all three (e2e) and all 33 (proof) generated anchors were still in the stored DOCX; Word keeps the tag and the same text. |

**Deviation, item b.** The clean view cannot be the default and editable at once in this build: Final is a read-only preview. Step 4 opens in Edit, which shows no markup while a draft has no tracked changes, and Clean (Final) stays a read-only clean read. Recorded in [editor-design.md](../../docs/editor-design.md) section 1.2 and as [Q-5](../../docs/questions.md).

## 4. Tests and proof run

Commands, in `C:\dev\openadvo`, with the results:

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, no output. |
| `npm run test:unit` | 29 tests, 29 pass, 0 fail (12 from steps 1–3, 13 drafting, 4 revision store). |
| `npm run build` | exit 0. |
| `npx playwright test` | 6 passed, 2 skipped (the two live-model tests need `OPENADVO_LIVE_MODEL`), 31.9 s. |
| Proof run: `node scratchpad/step4-lead/spike-proof.mjs` | exit 0. See the numbers below. |
| Word check: `scratchpad/step4-lead/word-check.ps1` with the approved DOCX | exit 0, 33 content controls. |

**Proof run on real documents.** The owner provided `C:\dev\DOCSTEST` for testing. Three public court documents were copied to a scratch folder (never the owner's personal files): `CRA_2392_2008_Judgement_18-Oct-2019.pdf` (11 pages), `State_of_Rajasthan_vs_Islam_and_Ors_24052011__SCs110597COM442844.pdf` (5 pages), `CRA_1870_2005_FinalOrder_26-May-2017.pdf` (11 pages). The run:

- 27 pages read, 33 events extracted, 33 confirmed, 0 date conflicts.
- List of Dates: 34 paragraphs, 33 anchored, generated by `generator`, revision 1.
- Show source followed two paragraphs to their Notebook events and source lines (for example 1988-03-18, `State_of_Rajasthan_vs_Islam_and_Ors_...pdf`).
- Two human edits and saves: revision 3, base revision recorded, `advocate`. Approved revision 3. All 33 anchors present after both saves.
- Synopsis: 35 paragraphs, 34 anchored.
- The approved DOCX (29,158 bytes) opened in Microsoft Word 16.0: **33 content controls with the 33 anchors**, 34 paragraphs. Word saved it again; the reader then recovered the same 33 anchors and identical text.

Evidence: [2026-11-14-step4-evidence/](2026-11-14-step4-evidence/) (`proof.json`, `proof-1-list-of-dates.png`, `proof-2-approved.png`, `proof-3-synopsis.png`, `approved-list-of-dates.docx`, `word-check.json`, `word-roundtrip-check.json`, plus the clean and redline crops used for the design points). The owner's own proof task on a real brief is still owed (lesson L3).

## 5. Defects found

1. **Electron started as plain Node in this shell.** The agent shell sets `ELECTRON_RUN_AS_NODE=1`; inherited, it made `npx electron .` and Playwright fail at launch with "The requested module 'electron' does not provide an export named 'BrowserWindow'". The existing e2e tests failed the same way before any step 4 change. Fix: `tests/e2e/env.ts` removes that variable for the launches. This is a test-environment fix, not a product change.
2. **Applying the review display mode too early broke rendering.** Calling `asc_SetDisplayModeInReview` straight after `openDocument` threw `m_pFaceInfo` and the editor reported warning -25 ("an error occurred during the work with the document"); the page then drew no document. Fix: apply the defaults only on `onDocumentReady`, and retry a requested view mode. A zoom-fit call made the same warning and was left out.
3. **The editor's native package is not an x2t bin.** `asc_nativeGetFile()` returns `DOCY;v5;<size>;<base64>`, and the decoded payload does not convert (x2t exit 88). The save path uses `asc_nativeGetFile3()` (header plus base64 of the `DOCY;v10;...` package), decodes it, and x2t bin-to-DOCX succeeds.
4. **The builder API's obvious insert routes do not insert.** `Document.InsertContent(sdt)` and `Document.AddElement(sdt)` reported success but added nothing. Working route: create a paragraph, `InsertInContentControl(1)`, set the tag, `Document.Push`. v0 therefore adds a Notebook sentence at the **end** of the draft, not at the cursor (parked).
5. **Quitting Electron with the draft frame open hung under Playwright.** The step 4 test now leaves the editor first. The application should quit with a draft open; this needs a check and a fix in a later version (parked).
6. **Generated prose inherits extraction noise.** The real documents produced event descriptions with list numbering ("2. In brief, facts …") and repeated date phrases ("on the date of the incident, i.e. 18.3.1988"). The List of Dates and the Synopsis show them as the step 3 extractor stored them (parked for the step 3 second version).

## 6. Conflicts and how they were resolved

- **Design item b (final view by default) against the build.** Final is a read-only preview in 9.3.6. The build wins; the editor opens in Edit and Clean stays as a read-only read. Q-5 records the choice for the owner.
- **Design item d (keep the Review tab) against the build.** The build has no tab captioned Review; the review tools are in the Collaboration tab. The Collaboration tab is kept, so nothing of the review functions is removed.
- **Plan wording "bridge action saveRevision" against the frame protocol.** The renderer owns the iframe, so the window orchestrates: the frame sends its document package, the window calls the human-only `saveRevision`, the main process converts and the matter store decides. The action keeps its name and its base-revision rule.
- **Prompt line 21 (no step 4 reference documents).** The build plan names no reference file for step 4 beyond the editor design and the vendoring notes; none of the reference repositories was read except `advodsh/plugins/workspace-editor/lib/{x2t.js,docs.js}` as the task names.

## 7. Questions for the owner

- **Q-5** in [docs/questions.md](../../docs/questions.md): the editor opens in Edit because Final is read-only. Keep this for round 1, or open read-only in Clean and make the advocate switch to Redline before typing? Default: keep Edit; decide again at step 5.
- The round 1 proof tasks are still owed. For step 4: generate the List of Dates and Synopsis of a real brief, follow "Show source" for five paragraphs, edit and save twice, approve one revision, and open the approved DOCX in Microsoft Word.

## 8. Lines added to parking

Insert a Notebook sentence at the cursor; hide the Draw and View ribbon tabs if a key is found; show or reconcile the editor's own status bar; compare a generated List of Dates against the owner's own SLP drafts (deterministic, no model text). Plus the two findings above: quitting with a draft open, and cleaning the event description for generated prose.

## 9. Unverified

- That Final hides **deleted** text and formatting markup (only the insertion underline was seen to differ).
- The product path for quitting the application while a draft is open.
- The generation refusal on an open date conflict is not in the e2e test (no conflict case is built); the no-confirmed-events refusal is.
- Linux and macOS vendoring; CI has never run; nothing is pushed.
- The owner's proof task on a real brief (lesson L3). This report's proof run used public court documents from the test corpus, not the owner's own brief.

## 10. Round 1

Steps 1 to 4 are built, tested and committed. Round 1 is complete as software, and the round 1 proof tasks were run on the real Shankar Teli brief from `C:\dev\DOCSTEST`: [2026-11-14-round1-proof-report.md](2026-11-14-round1-proof-report.md). The owner's own confirmation on a real brief is the remaining gate before any second version or step 5.
