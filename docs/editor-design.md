# Editor design

Status: design. Code starts at build-plan step 4. This file owns how the editor fits the product. Where the editor comes from is in [euro-office-vendoring.md](euro-office-vendoring.md). Build order is in [build-plan.md](build-plan.md).

The editor is the official Euro-Office document editor (decision 8). It is part of the product, not a separate application. The advocate drafts in it; the agent edits through it; the matter store keeps every revision.

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
| j. Hosting | The editor runs in its own sandboxed frame or `WebContentsView` in our window. It has no Node integration and no preload of ours other than the host interface it needs. | 4 |

### 1.1 Paragraph anchors

Each generated paragraph carries an anchor that links it to Notebook event ids (build-plan section 5.2). The anchor must survive an editor save through `x2t`. Two candidates: a bookmark around the paragraph, or a content control with a tag. **To verify at step 4:** which of the two survives open, edit and save in the vendored build, and which one Microsoft Word keeps.

### 1.2 Points to verify at step 4

These depend on the vendored build. They are not assumed.

- That review display "final" hides all markup, including deleted text and formatting changes.
- That accept and reject of one change work after the editor moves to that change.
- Which editor configuration keys hide the ribbon tabs of item d (`customization` keys in the editor config are the candidate; the exact keys are unverified).
- That the advocate's typing is untracked by default when the document carries tracked changes.
- That the paragraph anchor of section 1.1 survives a save.

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
