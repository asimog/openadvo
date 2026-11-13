# v0 spec: Notebook — sources, procedural history, Factual Matrix, chronology

Step 3 of [../build-plan.md](../build-plan.md). Serves workflow sections 5 (A to D, H for date conflicts) and 6, and Appendix B-C, B-D and B-E.

**Input.** The pages and line anchors of step 2.

**Output.** In `matter.db`: one candidate event per dated line, each with the fields of workflow section 6; an append-only record of the advocate's decisions on events; date conflicts. In the window: the Notebook, with four tabs: Sources, Procedural history, Factual Matrix, Chronology.

**Rules.**

1. Extraction is deterministic and schema-based. No model writes an event. The method is recorded (`rules-v1`).
2. Dates follow Appendix B-C. Explicit Indian court formats first (`12.03.2024`, `12/03/2024`, `12-03-2024`, `12th March, 2024`, `March 12, 2024`). A date in the format `dd/mm` is read day first. A two-digit year is an inferred date. A month and year alone is a date range. Vague words ("thereafter") never become dates.
3. Every event keeps its source anchor (`sha256:page:line`), its date text as written, its date type (`explicit`, `inferred`, `range`), and its reading (text layer, or OCR single reading).
4. Every dated event enters the chronology. Excluding an event from a view never deletes it. Rejecting it never deletes it.
5. Conflicting dates are flagged, not resolved: two events from different lines that describe the same act with different dates open a review item. Only the advocate resolves it.
6. Confirm, reject, exclude, include and resolve are human-only bridge functions (decision 5). The agent reads the Notebook through read-only tools.
7. Notebook readiness (Appendix B-D): no ingest job is queued or running, and no review item is open.

**Surfaces.**
- Notebook view in the view pane: Sources, Procedural history (procedural events), Factual Matrix (all events with every field), Chronology (by date, excluded events hidden unless shown). Each row links to the source page and line.
- Bridge: `getNotebook` (events, conflicts, readiness); human actions `confirmEvent`, `rejectEvent`, `excludeEvent`, `includeEvent`, `resolveConflict`.
- Agent tools (read only): `list_events` and `get_chronology`.

**Not in v0.** Model-proposed events; relative dates against a header date (for example "the next day"); events that span two lines that the rules cannot join; legal issues and authorities (step 6); the relationship graph view.

**Proof task.** The owner builds the chronology of a real brief, confirms or rejects every event, checks ten events against their source lines, and resolves every date conflict.
