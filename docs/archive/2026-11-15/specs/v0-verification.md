# v0 spec: factual verification and draft consistency

Step 5 of [../build-plan.md](../build-plan.md). Serves workflow sections 9A and 9D, and editor-design items e to h.

**Input.** The latest stored revision of a draft (List of Dates or Synopsis), its paragraph links, and the Notebook events.

**Output.** A list of defects. Each defect names the paragraph, the evidence (the values that were compared) and the action required. One `draft.checked` event records that the check ran, with its counts.

**Rules.**

1. The checks are deterministic. No model reads the draft. `lib/verification` computes; `main/drafts.ts` passes the record of the run to `main/matters.ts`. A check changes no draft.
2. The checks read the stored revision. Unsaved typing is not part of them; the harness bar says so and asks for a save.
3. A paragraph that states a date and links to no Notebook event is a defect (`no_source`).
4. A date that a paragraph states must be a date of one of its linked events, or a date that the event's own source line states (`date_mismatch`).
5. A linked event must be confirmed and not excluded (`event_not_confirmed`). A link to an event the Notebook does not hold is a defect (`broken_link`).
6. The List of Dates and the Synopsis state the same event with the same dates (`drafts_disagree`), and an event stated in one is stated in the other (`missing_in_other_draft`).
7. A check that cannot run is named with its reason. It is never shown as passed. Today: party names and case number (the matter records neither).
8. The system does not choose. Every defect is the advocate's to decide.

**Surfaces.**

- Harness bar: "Check draft". The result panel sits in the chat dock. The status shows "Facts checked: N defect(s). Gate: <state>. Citations: not verified" for the checked revision only.
- Bridge: `checkDraft(matterId, draftId)`.

**Built in the first part (2026-11-14).** Rules 1 to 8, the bridge function, the harness control, unit tests and one end-to-end assertion.

**Built in the second part (2026-11-14): agent changes.**

9. The agent proposes a correction with `propose_correction` (draft, anchor, the paragraph's exact current text, the new text, the reason). `lib/tracked-changes` writes it into the stored DOCX as word-level tracked changes by "Open Advocate agent" (editor-design item a). The result is a new revision with author `agent` and the event `revision.proposed`. A wrong expected text fails with `DOC_STALE_TARGET` (WD-129). A paragraph that already holds an undecided change is refused.
10. The changes still to decide are read from the head revision's DOCX. There is no second proposal store.
11. A change is substantive when its changed words hold a digit or a month name (item g). v0 limit: party names and prayers are not recognised, because the matter records no parties.
12. A run in which the agent proposed changes ends with an AG-UI `RUN_FINISHED` event whose outcome is `interrupt`, one interrupt per change (reason `openadvo.draft_change`). The answer is not a resume run: Keep and Undo are the bridge function `decideAgentChanges` (decision 5). The result is a new revision with author `advocate` and the event `agent_change.decided`.
13. The chat dock shows one card per draft: before and after of each change, Keep and Undo for each, "Keep all wording changes" (never the substantive ones) and Undo all. The open draft moves to the new head revision.
14. A revision with an undecided agent change cannot be approved (`AGENT_CHANGES_UNDECIDED`, item h).
15. The agent tool `check_draft` runs the checks of rules 1 to 8.

A matter made before this part is migrated once when it opens: the revision table is rebuilt so that the author `agent` is allowed. Rows and triggers are kept.

v0 limit: the corrected paragraph keeps its paragraph properties and the properties of its first run. Mixed formatting inside that one paragraph is not kept.

**Built in the third part (2026-11-14): review items and the gate.**

16. Each defect a check finds opens a review item of its draft (kind `draft_defect.<defect kind>`; the detail names the draft, the paragraph, the text, the evidence and the action). The same defect is not opened twice while its item is open. Only the advocate resolves or skips an item. Draft items do not count against Notebook readiness.
17. The gate state (workflow 9) comes from one tested mapping, `gateState` in `lib/verification`: an open item about a source link (`no_source`, `broken_link`, `event_not_confirmed`) gives "Blocked pending source verification"; any other open item or an undecided agent change gives "Needs correction"; a check that could not run gives "Needs additional instructions"; otherwise "Ready for advocate review". The first state that applies, in the workflow's order, is shown, with every reason.
18. Legal review (steps 6, 7) and filing compliance (step 8) are listed as "not available". They never count as passed. While the matter records no parties, every draft stays at "Needs additional instructions" or earlier.

19. "Show in editor" on a change opens the draft at its head revision and moves the editor cursor into that paragraph (item f), through the host command `goToAnchor` (builder API `GetContentControlsByTag`, then `Select`).

**Built in the fifth part (2026-11-14): parties and case numbers.** 20. A case number the draft states ("No. N of YYYY") must be the matter's recorded case number or appear in a source (`case_number_mismatch`). 21. A name one or two letters away from a recorded party name is a defect (`party_name_mismatch`); an exact match passes. While no party is recorded, the check is named as not run. Both defects need correction. 22. The Synopsis and List of Dates comparison applies only to that pair.

**Proof task.** The owner runs the checks on a real draft with three planted errors and finds all three, and decides every agent change.
