# Phase 8 build: practice packs, the skill library and the review

Date: 2026-11-18. Owner instruction: implement phase 8 of the build plan. The spec is [../../docs/specs/practice-packs.md](../../docs/specs/practice-packs.md).

## What was built

| Area | Code and content |
|---|---|
| N4: the library | 61 skills in `skills/`, one `SKILL.md` each: SK-001 to SK-033 (except SK-028, phase 9), SK-101 to SK-110, SK-113, SK-114, SK-201 to SK-208, SK-210, SK-301 to SK-305, SK-307 to SK-309. Four new document kinds: `bail_application`, `anticipatory_bail_application`, `quashing_petition`, `discharge_application` (`src/shared/records.ts`, `src/lib/drafting/documents.ts`). |
| N4: the packs | `packs/criminal.json`, `civil.json`, `writ.json`, `slp.json`; `src/lib/packs/index.ts` checks a pack, chooses the pack of a matter, refuses a skill outside its pack and gives the filing plan; `src/main/packs.ts` reads the files. |
| N6: the review | `src/lib/skills/review.ts`: thirteen parameters out of 26, three legal failure modes, `review.json` kept with the version; a version without its record cannot run. |
| N6: the tests | `src/lib/skills/skill-tests.ts`: three fixture briefs (criminal bail, civil injunction, writ maintainability); `tests/unit/skill-library.test.ts` checks every skill and its sample output through the gate. |
| Q3: the SLP pack | `packs/slp.json` owns the SLP set, the 90-day limitation, the workflow, the stages and the terms; `src/lib/packs/slp.ts` owns the petition and condonation generators. `src/main/filing.ts` reads the pack; it holds no SLP constant. The `in-sc` adapter keeps the quoted rules and the checklist and gives up the practice content. |
| The window | Workflows & Skills: the four packs, the pack filter, the review score and its date. Practice Profile: the packs, their acts and the reviewed skills. Filing tab: the pack, its proceeding, its limitation and its workflow. |
| Tests | `tests/unit/packs.test.ts`, `skill-review.test.ts`, `skill-library.test.ts`; `tests/e2e/phase8.spec.ts`. `tests/unit/skills.test.ts`, `filing-target.test.ts`, `court-adapters.test.ts`, `structured.test.ts` and `v2.test.ts` follow the new library and imports. |

## Commands and results

| Command | Result |
|---|---|
| `node scripts/review-skills.ts` | 61 skills reviewed; no legal failure mode; every score 24 or 25 of 26 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 364 tests: 361 passed, 0 failed, 3 skipped (the live-network suites) |
| `npm run build` | main, preload and renderer built (three "built in" lines) |
| `npx playwright test tests/e2e/phase8.spec.ts --workers=1` | 1 passed |
| `npx playwright test` (the phase-end run, once) | 48 tests: 46 passed, 2 skipped (the live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed |
| Docs checks (`docs/agent-guide.md` section 9.1) | 170 features, no gaps and no phase-order violations; 0 broken links |
| `git diff --check` | no whitespace errors |

## Evidence

- `test-results/phase8-packs.png`: the criminal matter after the bail run, with the pack on screen.
- The phase 8 test reads the four pack rows, the SLP pack's default mark, the bail skill's review line, the criminal filter, the Filing tab's pack and workflow, and the report card of the SK-103 run.

## Commits

- `42458f8`: the phase-8 spec and the owning documents.
- `76adb77`: the practice packs, the SLP pack out of the core and the four new document kinds.
- `efa1d46`: the four criminal document kinds in the shared draft list (the follow-up to `76adb77`).
- `9ae3767`: the 61 skills, their review records, the fixture tests and the role tools.
- `b29a771`: the Practice map, the reviewed skill list, the Filing tab's pack and the window test.
- `f6c986f`: the repo map, the agent guide and the add-a-skill recipe.

## Known gaps and limits

- **The phase exit is owed by the owner (lesson L3):** an SLP with no loss against what the code does today; a Delhi bail application; a quashing petition with an ingredients chart; a writ with maintainability questions; a civil injunction with a conditions chart.
- The library is 61 skills. The "about 140" of feature N4 includes the packs of phase 11 ([docs/skills.md](../../docs/skills.md) sections 2.5 and 2.6), whose rows are not written yet.
- No gold set exists (questions Q-3). The skill tests use fixture briefs and say so; they do not call a model.
- The review is deterministic. It finds a missing trigger, a wrong tool, a missing anchor, a missing approval point and the three legal failure modes. It cannot judge the legal quality of a skill beyond that; an engineer still reads each skill.
- A matter with a practice area but no proceeding gets the pack's first proceeding. The Filing tab names the proceeding, and the advocate can set the right one on the matter profile.
- The packs record an act's version only where a source records it; other rows say "not recorded". They do not verify the version in the law store.
- The SLP pack is the default when no proceeding, practice area or court chooses a pack. The Filing tab says so; it never hides the default.
- The SLP pack's generator writes the civil form. A criminal SLP is named as an unmapped part in `packs/slp.json`; the substance is drafted by SK-308. The criminal form generator is not built.
- Not run: the live-model e2e tests (`OPENADVO_LIVE_MODEL`), `npm run dist`.
