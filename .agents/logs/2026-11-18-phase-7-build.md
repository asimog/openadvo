# Phase 7 build: argument and hearings

Date: 2026-11-18. Owner instruction: implement phase 7 of the build plan. The spec is [../docs/specs/argument-and-hearings.md](../../docs/specs/argument-and-hearings.md).

## What was built

| Area | Code |
|---|---|
| O5: a model per role | `settings.json` `roleModels` (drafting, extraction, critic); `Agent.completerFor`; `skill-runner.ts`; Settings → Role models (`V3.tsx`). With none set, the chat's model runs everything. |
| K2: the critic seam | `runLoop` takes `criticComplete`; the critic's questions and opposing counsel's attacks run on it; the attacked side's replies stay on the proposing model (`src/lib/studio/index.ts`, `src/main/studio.ts`) |
| K1: issues tied to facts | `legal_issue.fact_ids`; `propose_issue` names the facts (unknown ids refused); the Conference view shows the facts with anchors and the relief (`theory.test.ts`) |
| K3: element charts and gaps | interim-relief template; `record_column` gains author, status and issue id; `propose_elements`; `recordGaps`; the Record table and Strategy show the gaps (`record-gaps.test.ts`) |
| K4: case theory and the Strategy view | `theory` rows (proposed, decided primary/alternative/rejected); `strategyView` assembles the live theories, the standing, the attack that fells an out argument, the attack graph's dependencies and the weaknesses (`src/lib/studio/strategy.ts`) |
| K5: the dissent panel | `src/lib/studio/dissent.ts`: each distinct configured model answers once; an unanchored answer is kept as refused; a split opens one `dissent_split` review item; answers side by side |
| K6, K7: hearing brief and oral outline | `hearing_brief` and `oral_outline` in the catalogue (`parts.ts`, `documents.ts`); one page with the posture, listed date, directions, open items, bench questions, objections and register; 3–4 points strongest first, rebuttal notes and the compilation |
| K8: compliance tasks | `task_proposal` rows; `propose_compliance_tasks`; an accepted task becomes a reminder; rejected stays refused; the advocate adds a task in the Proceedings view (`compliance.test.ts`) |
| K9: cross-examination plan | `cross_question` rows; each names a contradiction or a recorded statement, refused without a target; the view resolves the target's text and anchors (`compliance.test.ts`) |
| The window | Studio Strategy part; Record table gaps and templates; issue facts and relief; Proceedings tasks and cross-examination; the Hearing preparation group in the Drafts picker; Settings role models |
| Tests | `tests/unit/studio.test.ts` (K2), `theory.test.ts` (K1, K4), `dissent.test.ts` (K5), `hearing-brief.test.ts` (K6, K7), `compliance.test.ts` (K8, K9), `record-gaps.test.ts` (K3), `tests/e2e/phase7.spec.ts` (the exit path) |

## This session completed

- The phase-7 exit path passes in the window. The test now waits for the ingest row, reads the issue ties on the Studio Conference part, runs the loop on the accepted issue with a second scripted critic model, rejects the opponent's attack, accepts the bench question and the objection, records the hearing and the compliance tasks, records the witness statement, asks the dissent panel, and generates the hearing brief and the oral outline.
- The Drafts picker took its group list from a hardcoded copy that lacked the new Hearing preparation group. The catalogue now returns each group's label and the picker builds its list from the catalogue, so the new group appears and the labels have one owner.
- K1: the issue view shows the matter's recorded relief beside the facts' own relief.
- K4: the Strategy view shows the attack that fells each `out` argument and the attack graph's dependencies, through the tested `strategyView`.
- K6: the brief states the stage and the proceeding, and the previous hearing's recorded directions with the hearing date.
- K9: the cross-examination plan shows each target's text and anchors: the source, page and line for a fact; the statement, witness and date for recorded evidence.
- The phase-7 end-to-end run exercises O5: the loop and the rehearsal run with separate scripted drafting and critic models, so the drafting model's proposing passes and bench questions and the critic model's attacks and objections are both proven. The chat script stays empty, so the run would produce nothing if the role wiring were absent.
- O5: the loop's proposing passes and the rehearsal's bench questions now run on the drafting role model. Before this fix they always used the chat's model. A drafting model equal to the chat's model falls back to the chat's model; the critic passes are used only when the critic model differs from the proposing model.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 347 tests: 344 passed, 0 failed, 3 skipped (the live-network suites) |
| `npm run build` | main, preload and renderer built (three "built in" lines) |
| `npx playwright test tests/e2e/phase7.spec.ts --workers=1` | 1 passed |
| `npx playwright test` (the phase-end run, once) | 47 tests: 45 passed, 2 skipped (the live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed |
| Docs checks (`docs/agent-guide.md` section 9.1) | links resolve; 170 features, no gaps, no phase-order violations |

## Evidence

- `test-results/phase7-strategy.png`: the matter after the exit path, with the stage, the next date and the recorded relief.
- The phase-7 test writes the generated brief and outline into the temporary matter; their text is asserted in the test.

## Commits

- `5f5c574`: the phase-7 spec.
- `94ded85`: the phase-7 core (O5 and K1–K9).
- `9706c19`: the window and the exit path completed.
- `9df37cf`: O5's drafting model for the proposing passes and the bench questions, with the test that proves it.

## Known gaps and limits

- **The phase exit is owed by the owner (lesson L3):** a real listing with the hearing brief, the bench questions and the oral outline before the date, and the directions, the next date and the compliance tasks after it.
- The extraction role's model is stored and shown; the fact extraction itself stays rule-based, and the Settings view says so (spec section 12).
- The phase-7 end-to-end test asks the dissent panel with one model family (the scripted chat model). The multi-model panel is covered by `tests/unit/dissent.test.ts`; setting role models needs model credentials, so the e2e run does not set them.
- Not run: the live-model e2e tests (`OPENADVO_LIVE_MODEL`), `npm run dist`.
