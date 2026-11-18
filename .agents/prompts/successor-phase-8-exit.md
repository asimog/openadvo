# Session handoff: phase 8 built; the owner's exit is owed

Phase 8 of the build plan (practice packs: N4, N6, Q3) is built and committed. Read `docs/specs/practice-packs.md` first, then `.agents/logs/2026-11-18-phase-8-build.md`. The owner's exit on real briefs is the only thing phase 8 still owes.

## Verified now

- `node scripts/review-skills.ts`: 61 skills reviewed, no legal failure mode, every score 24 or 25 of 26; each `review.json` matches its `SKILL.md` version.
- `npm run typecheck`: exit 0.
- `npm run test:unit`: 364 tests, 361 passed, 0 failed, 3 skipped (live-network suites).
- `npm run build`: main, preload and renderer built (three "built in" lines).
- `npx playwright test tests/e2e/phase8.spec.ts --workers=1`: 1 passed.
- `npx playwright test` (the phase-end run, once): 48 tests, 46 passed, 2 skipped (the live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed.
- Docs checks (`docs/agent-guide.md` section 9.1): 170 features, no gaps and no phase-order violations; 0 broken links. `git diff --check`: no whitespace errors.
- Evidence: `test-results/phase8-packs.png`.

## Changed this session

- `42458f8`: the phase-8 spec (`docs/specs/practice-packs.md`) and the owning documents (`docs/skills.md`, the two phase specs, `skills/README.md`).
- `76adb77`: `packs/` (criminal, civil, writ, slp), `src/lib/packs/` (checks, pack choice, skill gate, filing plan), `src/main/packs.ts`, the filing set and limitation now read the pack, `src/lib/packs/slp.ts` owns the SLP generators, the `in-sc` adapter keeps only the quoted rules and the checklist, and four criminal document kinds. `efa1d46` adds the kinds to the shared draft list.
- `9ae3767`: 61 skills with `review.json`, `src/lib/skills/review.ts` (13 parameters, 3 legal failure modes), `src/lib/skills/skill-tests.ts` (three fixture briefs), `scripts/review-skills.ts`, the role tools of phases 4 and 7, and the tests.
- `b29a771`: the Practice map with the packs and acts, the reviewed and filterable skill list, the Filing tab's pack and workflow, and `tests/e2e/phase8.spec.ts`.
- `f6c986f`: the repo map (the `packs/` folders), the agent guide (the review record and the recipe).

## Broken or not verified

- None known.
- Not run: the live-model e2e tests (`OPENADVO_LIVE_MODEL`), `npm run dist`.
- The library is 61 skills, not the "about 140" of feature N4; the remaining rows belong to phase 11 (`docs/skills.md` sections 2.5 and 2.6).
- No gold set (questions Q-3). The skill tests use fixture briefs and do not call a model. The review is deterministic and cannot judge legal quality beyond its three failure modes.
- A matter with a practice area but no proceeding gets the pack's first proceeding (bail for criminal); the Filing tab names it.
- The packs record an act's version only when a source records it; they do not verify it in the law store.
- The SLP pack is the default when no proceeding, practice area or court chooses a pack; the Filing tab says so.

## Next step

- The owner completes the phase 8 exit on real briefs (lesson L3): an SLP with no loss against what the code does today; a Delhi bail application; a quashing petition with an ingredients chart; a writ with maintainability questions; a civil injunction with a conditions chart.
- Why it is next: every phase-8 feature and test is built; the module is done when the owner completes its exit.
- What counts as done: the owner's real briefs and the owner's acceptance, not a test.
- What must not change during it: no skill decides a legal point, approves, attests or files; the witness rule; every pack's set and limitation stay data with their source; the review record stays with the version.
- What waits for the owner: the phase 8 exit itself. Phase 9 (court monitoring and communications, B8, B9, E8, H2, S3 to S8, S11, S12, V2, V3, Y2) starts after it.

## Commands

- Start: `npm run session:start -- --unit`
- Verify: the rows of `docs/agent-guide.md` section 8.4 that apply.
- Review the library after any skill change: `node scripts/review-skills.ts`
- Focused check for the exit discussion: `npx playwright test tests/e2e/phase8.spec.ts --workers=1` (needs the vendored parts).

## Clean state at hand-over

- [x] `npm run session:start -- --unit` exits 0 (364 unit tests: 361 passed, 3 skipped)
- [x] Everything is committed; `scratchpad/` content is not in the diff
- [x] The session record is in `.agents/logs/2026-11-18-phase-8-build.md`
- [ ] The owner's phase 8 exit (the only open item)
