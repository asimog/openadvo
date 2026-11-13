# Editor design

Status: design. Hosting code starts at build-plan step 2; draft editing at step 4. This file owns how the editor fits the product. Where the editor comes from is in [euro-office-vendoring.md](euro-office-vendoring.md). Build order is in [build-plan.md](build-plan.md).

The editor is the official Euro-Office suite (decision 8): the Word editor for drafts, the PDF editor for sources, and the other editors, all inside the window. Step 2 hosts it; step 4 uses the Word editor for drafts. It is part of the product, not a separate application. The advocate drafts in it; the agent edits through it; the matter store keeps every revision.

## 1. Design

| Item | Design | Step |
|---|---|---|
| a. One record | Agent edits are tracked changes in the DOCX, authored by the agent (author name "Open Advocate agent"). There is no second proposal store. What the agent changed, and what the advocate kept or undid, is read from the document's own revisions. | 4 (rule), 5 (first agent edit) |
| b. Clean view by default | The editor opens with review display "final": the advocate reads clean text. The advocate's own typing is not tracked unless the advocate turns tracking on. | 4 |
| c. Harness bar | Our own bar, above the editor and outside the editor frame. It holds: a view switch (Clean, Redline, Original); Send selection to agent; Insert from Notebook; Show source of this paragraph; Check citations; Approve revision; and a status area with the revision, the verification state, and "N agent changes not decided". At step 4, "Check citations" shows "not available until step 7", the verification state shows "not verified", and "Send selection to agent" sends the selected text to the chat as a quote. | 4 |
| d. Ribbon | Trimmed by editor configuration only, never by changing vendored files. Hidden: File, Plugins, Protect, and co-editing controls. Kept: Home, Insert, Layout, References, Review. | 4 |
| e. Chat summary card | Each agent turn that edits the document gives one card in the chat: what changed, by section, with counts, and the buttons Keep all, Undo all, Review one by one. | 5 |
| f. Review one by one | The card steps through the changes. The editor scrolls to each change. The card shows before and after, with Keep and Undo. Keep and Undo are bridge functions (decision 5), never agent tools. | 5 |
| g. Substantive changes | A change that touches a date, an amount, a citation, a party name or a prayer is listed separately. It is never part of Keep all. The advocate decides each one. | 5 |
| h. Gate | A revision cannot be approved, and no filing PDF can be made, while any agent change is not decided. | 5 (approval), 8 (filing PDF) |
| i. Store | The matter store owns every revision. The editor works on a working copy in a temp folder. A human save returns the working copy with its base revision, and the matter store makes a new revision or refuses a stale base. | 4 |
| j. Hosting | The editors run in their own sandboxed frame or `WebContentsView` in our window (from step 2). It has no Node integration and no preload of ours other than the host interface it needs. | 4 |

### 1.1 Paragraph anchors

Each generated paragraph carries an anchor that links it to Notebook event ids (build-plan section 5.2). The anchor must survive an editor save through `x2t`. Two candidates: a bookmark around the paragraph, or a content control with a tag.

**Settled at step 4: a block-level content control whose `w:tag` holds the anchor.** The anchor is `oa-` followed by 32 lowercase hex characters. The reader is the release's document builder API: `Asc.editor.getJsApi().GetDocument().GetCurrentContentControl().GetTag()`. Evidence: both candidates survived two `x2t` DOCX-to-Editor.bin-to-DOCX round trips and a Microsoft Word 16.0 open and save (the bookmark name survived too, but Word renumbers its `w:id`, so matching must use the name). The generated anchors were still present in the stored DOCX after two editor saves. Details: [step 4 report](../.agents/logs/2026-11-14-step4-report.md) and [editor findings](../.agents/logs/2026-11-14-step4-editor-findings.md).

### 1.2 Points to verify at step 4

Results in the vendored build. CONFIRMED means a run showed it.

| Point | Result |
|---|---|
| Review display "final" hides all markup, including deleted text and formatting changes. | **Partly confirmed.** In a document with one tracked insertion, Final showed the text without the insertion underline and Edit showed the underline. A separate tracked deletion was not visible as a strikethrough in either mode, so hidden deleted text is **unverified**. The release implements Final and Original as **read-only preview modes**; only Edit accepts typing. |
| Accept and reject of one change work after the editor moves to that change. | **Confirmed.** After `asc_GetNextRevisionsChange()`, `asc_AcceptChangesBySelection()` removed one tracked insertion (the change report went from one change to none) and `asc_RejectChangesBySelection()` removed another (the typed text disappeared and the paragraph returned to its original text). |
| Which editor configuration keys hide the ribbon tabs of item d. | **Confirmed, with one correction.** `customization.layout.toolbar = { file: false, plugins: false, protect: false }` and `customization.layout.header = { users: false, editMode: false }`, plus `coEditing: { mode: "fast", change: false }` and `customization.chat: false`, hide the File, Plugins and Protection tabs and the co-editing controls by configuration only. This build has **no tab captioned "Review"**: the review tools sit in the tab captioned **Collaboration**, so that tab is kept. The tabs Draw and View remain; item d does not name them and no configuration key was found for them. |
| The advocate's typing is untracked by default when the document carries tracked changes. | **Confirmed.** With one tracked change present and `asc_SetTrackRevisions(false)`, typing added no revision (the author report stayed at one change). |
| The paragraph anchor of section 1.1 survives a save. | **Confirmed.** The block content control and its tag survived two editor saves (DOCX to Editor.bin to DOCX), and Microsoft Word keeps it. |

The clean view of item b could not be kept as the default. In this build Final is a read-only preview, so a draft opened in Final cannot be edited. The editor therefore opens in **Edit**, which shows no markup while a draft carries no tracked changes (step 4); Clean (Final) stays available as a read-only clean read. Step 5, when tracked changes first appear, decides the default again. Recorded as a question for the owner (Q-5).

## 2. Engine rules carried over

The earlier editor record (`C:\dev\advodsh\docs\legal-docx-workspace.md`) found defects and set rules. These rules carry over. The old id is kept for traceability. Everything that existed only for DeepSeek Harness (plugin rows, fan-out, roles, SSE routes, the proposal store) does not carry over.

| Rule | Old id | Applies from |
|---|---|---|
| The text the agent reads, searches and matches is the live text. Tracked deleted text is never part of it. A markup view marks deleted runs and inserted runs. | WD-013, WD-014, WD-026 | 4 (`read_draft`) |
| A successful commit leaves the agent's document session usable. The next commit is not refused as stale. A commit sets the content hash to the SHA-256 of the new bytes. | WD-011, WD-012 | 5 |
| Every block has a stable id. A paragraph without `w14:paraId` gets one when the document opens, and the commit writes it. Every table has its own id. An op whose id names more than one block fails with an ambiguous-target error. | WD-020, WD-021, WD-022, WD-023, WD-024 | 4 (anchors), 5 (ops) |
| A paragraph replace makes word-level tracked changes, also when a match spans runs. After a replace with text T, the live text is exactly T. | OD-13, WD-015, WD-017 | 5 |
| An op that names a paragraph, run or cell carries the expected text. When the live text differs, the op fails with a stale-target error and changes nothing. | WD-129, WD-110 | 5 |
| The engine process is cleaned up: no work starts after a request is cancelled; restarts stop after 10 crashes in 10 minutes; lost sessions leave the status; the run's temp folder is deleted on dispose. | WD-096, WD-097, WD-098, WD-099 | 5 |
| A human save needs a base revision. A write with no base revision is refused. A state report without a boolean `modified` does not change the dirty flag. A failed state report is sent again. | WD-007, WD-008, WD-009, WD-010 | 4 |
| The editor frame is sandboxed. The host page sends a content security policy. An editor window refuses navigation to another origin and refuses to open new windows. | WD-076, WD-077, WD-078 | 4 |

## 3. Not in this design

Collaborative editing, comments threads beyond the editor's own, a separate proposal store, and Microsoft Word integration. New ideas go to [parking.md](parking.md).
