# Session handoff: phase 7 built; the owner's exit is owed

Phase 7 of the build plan (argument and hearings: K1–K9, O5) is built and committed. Read `docs/specs/argument-and-hearings.md` first, then `.agents/logs/2026-11-18-phase-7-build.md`. The owner's exit on a real listing is the only thing phase 7 still owes.

## Verified now

- `npm run typecheck` exit 0.
- `npm run test:unit`: 348 tests, 345 passed, 0 failed, 3 skipped (live-network suites).
- `npm run build`: main, preload and renderer built (three "built in" lines).
- `npx playwright test` (the phase-end run, once): 47 tests, 45 passed, 2 skipped (the live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed.
- `npx playwright test tests/e2e/phase7.spec.ts --workers=1` passes. The exit path covers the issue ties, the interim-relief chart and a closed gap, the theory decided, the loop on a second scripted critic model, the rehearsal, the hearing and its compliance tasks, the cross-examination question with its target's anchors, the dissent panel, the hearing brief and the oral outline. Screenshot: `test-results/phase7-strategy.png`.

## Changed this session

- Commit `9706c19`: the Drafts picker reads the group labels from the catalogue (the Hearing preparation group now appears); the issue view shows the matter's recorded relief; `src/lib/studio/strategy.ts` assembles the standing, the felled-by attack, the dependencies and the weaknesses; the brief states the proceeding and the previous hearing's recorded directions; a cross-question resolves its target's anchors; the spec's test table names the files that carry each check.
- Commit `9df37cf`: O5's drafting model runs the loop's proposing passes and the rehearsal's bench questions; the critic passes stay on the critic model. The phase-7 e2e drives the loop and the rehearsal with separate scripted drafting and critic models.
- Commit `15fc092`: the advocate's Facts-tab link writes the issue row's one column; the dissent panel keeps each run's split and shows the run's answers together; Settings says when a saved role model is no longer signed in.
- Commit `fb31172`: the Strategy view's `strategyView` names the issue of each standing row.
- The phase-7 core is `94ded85` (O5 and K1–K9); the spec is `5f5c574`.

## Broken or not verified

- None known.
- Not run: the live-model e2e tests (`OPENADVO_LIVE_MODEL`), `npm run dist`.
- Risk: setting a role model needs a model with credentials; the e2e run uses a scripted critic. The multi-model dissent panel is covered by `tests/unit/dissent.test.ts`, not the window test.

## Next step

- The owner completes the phase 7 exit on a real listing (lesson L3): before the date, the hearing brief, the bench questions and the oral outline; after it, the directions, the next date and the compliance tasks.
- Why it is next: every phase-7 feature and test is built; the module is done when the owner completes its exit.
- What counts as done: the owner's real listing and the owner's real hearing work, not a test.
- What must not change during it: no outcome prediction anywhere; the dissent panel shows a split and never resolves it; the witness rule (the agent puts the record to the witness and never composes the answer); every decision stays human-only.
- What waits for the owner: the phase 7 exit itself.

## Commands

- Start: `npm run session:start -- --unit`
- Verify: the rows of `docs/agent-guide.md` section 8.4 that apply.
- Focused check for the exit discussion: `npx playwright test tests/e2e/phase7.spec.ts --workers=1` (needs the vendored parts).

## Clean state at hand-over

- [x] `npm run session:start -- --unit` exits 0 (348 unit tests: 345 passed, 3 skipped)
- [x] Everything is committed; `scratchpad/` content is not in the diff
- [x] The session record is in `.agents/logs/2026-11-18-phase-7-build.md`
- [ ] The owner's phase 7 exit (the only open item)
