# v0 spec: List of Dates and Synopsis as a DOCX in the Word editor

Step 4 of [../build-plan.md](../build-plan.md). Serves workflow section 8 (DOCX working petition, each revision new), 8A, 8B and 10 (approval of one revision), and Appendix B-E (original file to SLP paragraph).

**Input.** The confirmed Notebook events of a step 3 matter.

**Output.** In `matter.db`: drafts, revisions (SHA-256, base revision, author kind `generator` or `advocate`, approval) and paragraph links (anchor to event ids and source lines). In the window: the List of Dates or the Synopsis as a DOCX in the Euro-Office Word editor, with the harness bar outside the editor frame.

**Rules.**

1. Generation is deterministic and schema-based. No model writes the text. Only confirmed events that the advocate has not excluded enter generated prose (Appendix B-C: only checked dates in generated prose).
2. An open date conflict on a confirmed event refuses generation. The system does not put a contested date into prose. The advocate resolves the conflict in the Notebook first.
3. Each generated paragraph carries an anchor that links it to its event ids. The anchor is a block-level content control whose tag is the anchor string. The paragraph links are stored in `matter.db`. Every link is a stored id, never a text match (build-plan section 5.2).
4. The editor works on a working copy (`Editor.bin` in a temp folder). The matter store is unchanged until the advocate saves. A human save needs a base revision; a save with no base revision is refused (`BASE_REQUIRED`), and a stale base is refused (`DOC_STALE_BASE`) (WD-007 to WD-010). Each save makes a new revision, and every revision keeps its SHA-256 and its base revision.
5. The matter store is the single writer. `lib/drafting` computes; `main/drafts.ts` passes results to `main/matters.ts`. The renderer computes nothing.
6. Approve is a human-only bridge action on one revision (decision 5). The agent tools `read_draft` and `get_paragraph_source` are read only. The agent cannot save, insert or approve.
7. The editor frame is sandboxed, and the ribbon is trimmed by editor configuration only; no vendored file is changed. The clean view is the default, and the advocate's typing is not tracked.
8. "Check citations" shows "not available until step 7". The verification state shows "not verified". No revision is shown as verified.

**Surfaces.**

- Editor view: the Word editor in a sandboxed frame that fills the view. The harness bar (view switch Clean, Redline, Original; Save revision; Insert from Notebook; Show source of this paragraph; Check citations; Approve revision; status area) sits in the chat dock, left of the editor (decisions choice 20, 2026-11-14).
- Bridge: queries `listDrafts`, `getRevision`, `getParagraphSource`; actions `generateListOfDates`, `generateSynopsis`, `openRevisionInEditor`, `insertFromNotebook`; human-only actions `saveRevision`, `approveRevision`.
- Agent tools (read only): `read_draft`, `get_paragraph_source`.

**Not in v0.** Model polishing of the Synopsis with traceability kept (8A, later); agent edits as tracked changes (editor-design items e to h, step 5); Questions of Law and Grounds (step 6); annexures (step 8); PDF export; inserting at the cursor (v0 adds the sentence at the end of the draft); accepting or rejecting changes from the harness bar.

**Proof task.** The owner generates the List of Dates and Synopsis of a real brief, follows "Show source" for five paragraphs, edits and saves twice, approves one revision, and opens the approved DOCX in Microsoft Word.
