# Session handoff: phase 1, harness and stores

## Verified now

- `npm run typecheck`: exit 0. `npm run test:unit`: 181 tests, 178 passed, 3 skipped. `npx playwright test`: 45 passed, 2 skipped (live model). Record: `.agents/logs/2026-11-16-phase1-harness-and-stores.md`.

## Changed this session

- 1689067: the CI failure on main (`tests/unit/agent-changes.test.ts` wrote `sqlite_master`; SQLite's defensive mode refuses it).
- 1b07996 and the commit after it: phase 1 ([docs/specs/harness-and-stores.md](../../docs/specs/harness-and-stores.md)).

## Broken or not verified

- No live model run of a skill run or a side question. The faux and scripted models only.
- CI ran only the unit tests before this session; the build and end-to-end steps on the Linux and Windows runners are not yet seen to pass.
- Y4 embeddings and reranking, and H-14 extension commands in the `/` list, are not built.

## Next step

- The owner runs the phase 1 exit on a real matter (lesson L3): the plan card, a skill run with its package and report card, a side question, the Jobs view.
- Then phase 2 starts with its spec. The vector-index spike waits for phase 5; the browser spike for phase 3.
- Must not change: the frozen decisions; the skill format of the spec, section 2.

## Commands

- Start: `npm run session:start -- --unit`
- Focused: `node --test tests/unit/skill-runner.test.ts tests/unit/side-questions.test.ts`; `npm run build && npx playwright test tests/e2e/phase1.spec.ts`
