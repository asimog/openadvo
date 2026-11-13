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

- Harness bar: "Check draft". The result panel sits in the chat dock. The status shows "Facts checked: N defect(s). Citations: not verified" for the checked revision only.
- Bridge: `checkDraft(matterId, draftId)`.

**Built in the first part (2026-11-14).** Rules 1 to 8, the bridge function, the harness control, unit tests and one end-to-end assertion.

**Not built yet (still step 5).** Defects stored as review items and the first quality-gate states; the agent's corrections as tracked changes through the Document Builder; the chat summary card with Keep all, Undo all and Review one by one (editor-design items e to g); the approval gate while an agent change is not decided (item h); an agent tool that runs the checks.

**Proof task.** The owner runs the checks on a real draft with three planted errors and finds all three, and decides every agent change.
