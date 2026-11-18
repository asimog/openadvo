# Spec: argument and hearings (phase 7)

Status: started 2026-11-18. The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The advocate sees workflow steps 6 and 10 of [../advocate-workflow.md](../advocate-workflow.md) section 4: argue before the date, and the hearing after it.

One module is built: **argument and hearings** (K1 to K9), with the model-per-role setting (O5) that K2, K5 and the rehearsal need.

## 1. What already exists, and what this phase adds

The pre-plan Studio work is the base: the argument loop with its generator, critic, opposing-counsel and judge prompts over one model; grounded semantics (`in`/`out`/`undecided` from the attack graph); the rehearsal with bench questions and objections whose answers must be anchored; the challenge register; issues as candidate rows decided at the case conference; the record table with anchored cells; hearings with directions and the next date; the new-order impact check; the weak-points report.

| Feature | Built before this phase | This phase adds |
|---|---|---|
| K1 | Issues as candidate rows; facts link to issues (`linkFact`, human-only) | The issue view shows its facts with anchors and the relief sought; the agent's `propose_issue` names the facts it rests on, and the ties ride the issue row |
| K2 | The loop, its critic and its opposing counsel on one model | The attacking passes run on a **second model family** when the advocate sets one (O5) |
| K8 | Hearings with directions and next date; the new-order impact check | Compliance tasks: proposed from the directions, decided by the advocate, kept as reminders |

Everything else in the scope is new.

## 2. The model per role (O5)

`settings.json` gains `roleModels`: `drafting`, `extraction` and `critic`, each a model key from the advocate's model list (local or remote), each optional. Absent: the chat's model. The Settings view gains one row per role with the model picker, and says where each role applies.

| Role | Applies to |
|---|---|
| `drafting` | The argument loop's proposing passes; the rehearsal's bench questions; the skill runs of the drafting role |
| `extraction` | The skill runs of the intake and evidence roles (the extraction of facts itself is rule-based today; the view says so) |
| `critic` | The loop's critic and opposing-counsel passes; the rehearsal's objections; the skill runs of the review and strategy roles |

The seam is the existing `Complete` signature. `Agent.completer()` gains the role's model key: a completer for a chosen model from the same runtime and credentials. The argument loop and the rehearsal take a second completer for the attacking passes; with no critic model set, the chat model runs everything, as today.

## 3. Issues tied to the record (K1)

The `legal_issue` row gains `fact_ids`. The agent's `propose_issue` names the facts a proposed issue rests on; the row keeps them whatever the advocate later decides. The issues view lists, for each issue, its linked facts with their source anchors and the relief they seek (the fact-level relief and the matter's recorded relief). The advocate still links and unlinks facts on the Facts tab; both paths write the one column.

## 4. Element charts and their gaps (K3)

An element chart is a record-table chart: the elements are columns, the sources are rows, every cell passes the existing quote gate. Three things are added:

1. **Built-in element templates**: the conditions for interim relief (prima facie case, balance of convenience, irreparable injury) beside the existing ingredient templates.
2. **The agent proposes element columns** for one issue (`propose_elements`): the ingredients of the offence or the elements of the cause of action, as candidate columns; the advocate confirms each column before its cells count.
3. **The gaps**: a column with no confirmed cell across the record is a gap. The Record table view lists the gaps under its grid, and the Strategy view carries them in its weaknesses. A gap is never silently ignored, and never filled by a guess.

## 5. Case theory (K4)

A theory is a row the agent proposes and the advocate decides: title, statement, the issues it rests on, the burden it says the party bears, the standard of proof it faces, and its status (`primary`, `alternative`, `rejected`). The Strategy section of the Studio assembles the case theory from the records:

- the theories with their status, burden and standard;
- the argument status per issue: accepted arguments with their computed `in`/`out`/`undecided`, and the attack that fells each `out` one;
- the weaknesses: the loop's weak points and the record-table gaps;
- the dependencies: which argument attacks which, from the attack graph.

No theory states a probability of success. The Strategy view is a reading of the records; it decides nothing.

## 6. The dissent panel (K5)

The advocate asks one hard question on the Strategy view. The run asks each configured model — the drafting model, the extraction model, the critic model and the chat model, once each, the distinct ones only. Every answer must be anchored to the record or an authority exactly as the rehearsal's answers are; an unanchored answer is stored as refused, never dropped silently. All answers are shown side by side with the model that gave each. When two answers overlap on less than the loop's duplicate threshold, the panel is split, and one review item of kind `dissent_split` names the question and every model's answer. A split is shown, never resolved by the application.

## 7. The hearing brief (K6) and the oral outline (K7)

Two new kinds join the phase 6 drafting catalogue, generated from records:

- **`hearing_brief`** — one page: the posture (the stage and the proceeding), what is listed (the next hearing with its bench), the last order's directions with their anchors (the extracted `direction` parts and the previous hearing's recorded directions), the open items (the open review items), the bench questions with their anchored answers (the accepted challenges), the objections of opposing counsel with the answers kept, and the challenge register with each row's status. No outcome is predicted anywhere in it.
- **`oral_outline`** — three or four points, strongest first (the accepted arguments by their computed standing, then their Elo), each point with its grounding aliases as the speaking notes; the rebuttal notes from the accepted objections with their answers; the compilation of authorities with the paragraph each is relied on for. The order of the points is the advocate's to change in the editor.

Both carry the reviewer note and the checks of phase 6 like every catalogue document.

## 8. The post-hearing record (K8)

The hearing form already records the directions and the next date. This phase adds the compliance tasks: after a hearing with directions, the agent may propose the tasks the directions need (`propose_compliance_tasks`) — each proposal is a row with its due date, waiting for the advocate. The advocate accepts a task and it becomes a reminder; the advocate rejects it and it stays refused. The form also lets the advocate add a task directly. A new order that arrives after an approval keeps the existing impact check; nothing changes without the advocate.

## 9. The cross-examination plan (K9)

A cross-examination question is a proposed row tied to the record: it names the witness, the question, and the contradiction or the statement it springs from, with that record's anchors. The agent's `propose_cross_questions` reads the matter's open contradictions and the recorded statements and proposes the questions; each names its target row, and a question without a target is refused. The advocate accepts or rejects each question on the Proceedings view. The plan lists each question with its anchors, the way every record row lists its own.

## 10. The window

- **Studio**: a Strategy section (the theories, the argument standing, the weaknesses, the dissent panel ask).
- **Record table**: the gaps under the grid; the template picker gains the element templates.
- **Issues (the Conference section)**: the facts and the relief under each issue.
- **Proceedings (the Matter tab)**: the compliance tasks beside the hearing form, and the cross-examination plan.
- **Drafts**: the catalogue picker gains `hearing_brief` and `oral_outline` in the Notes group.
- **Settings**: the role models.

## 11. Tests

| Test | Checks |
|---|---|
| `tests/unit/studio.test.ts` | The loop's attacking passes on the second completer; the rest on the first |
| `tests/unit/theory.test.ts` | Theory rows proposed and decided; no status outside the three; the view assembles standing, weaknesses and dependencies |
| `tests/unit/dissent.test.ts` | Each model answers once; an unanchored answer is refused, not dropped; a split opens one review item; no split when the answers agree |
| `tests/unit/hearing-brief.test.ts` | The brief from records: posture, directions with anchors, bench questions, register; no outcome text |
| `tests/unit/oral-outline.test.ts` | Three or four points strongest first; the rebuttal notes; the compilation with the paragraphs |
| `tests/unit/compliance.test.ts` | A task proposal accepted becomes a reminder; rejected stays refused; the advocate's own task |
| `tests/unit/cross-exam.test.ts` | A question names its contradiction or statement; a question with no target is refused; accept and reject |
| `tests/unit/issues.test.ts` | The issue row keeps the agent's fact ids; the view's facts and relief |
| `tests/unit/record-gaps.test.ts` | A column with no confirmed cell is a gap; a confirmed cell closes it; the interim-relief template |
| `tests/e2e/phase7.spec.ts` | The exit path: the loop run with a critic model, the theory decided, the brief before the date, the oral outline, the hearing recorded with directions, the compliance tasks, the cross-exam questions decided |
| `tests/e2e/app.spec.ts` | The new bridge functions and agent tools in the exact lists |

Between the steps of the phase: the type check and the unit tests. The end-to-end suite runs once, at the end.

## 12. What is not built, and why

- The skills SK-018 to SK-020, SK-022 and SK-032 wrap these features in phase 8; this phase builds the outputs they run on.
- No outcome prediction and no judge personality profile anywhere (hard rule 8): the loop's judge prompt already compares grounding, not winning; the dissent panel shows a split without weighing it.
- The extraction model setting is stored and shown; the fact extraction itself stays rule-based, and the view says so (lesson L2).
- The dissent panel's split rule is mechanical (answer overlap), never a judgment of the answers' merits.

## 13. Done

The owner completes the phase exit on a real listing (lesson L3): the hearing brief, the bench questions and the oral outline before the date, and the directions, the next date and the compliance tasks after it.
