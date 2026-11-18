# Session handoff: phase 6 built; the owner's exit is owed

Phase 6 of the build plan (drafting and verification: A7, F2, L1–L6, L8, P1–P11) is built and committed. Read `docs/specs/drafting-and-verification.md` first, then `.agents/logs/2026-11-18-phase-6-build.md`. The owner's exit on a real brief is the only thing phase 6 still owes.

## Verified now

- `npm run typecheck` exit 0.
- `npm run test:unit`: 330 tests, 327 passed, 0 failed, 3 skipped (live-network suites).
- `npm run build`: main, preload and renderer built (three "built in" lines).
- `npx playwright test` (the phase-end run, once): 46 tests, 44 passed, 2 skipped (the live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed.
- The exit path runs in the window: `npx playwright test tests/e2e/phase6.spec.ts` passes. A Delhi High Court W.P.(C) matter goes from the target to a signed manifest: template documents, markers blocking approval, the ask-once citation format, a kept citation proposal with its applied-because note, coverage with the attestation, the repeated-correction preference, the deponent's own words in the affidavit, the AI-use disclosure and both confirmations. Screenshot: `test-results/phase6-filing-set.png`.

## Changed this session

- Commits `6c064cb`, `027130e`, `fbb10cc`: the catalogue (`src/lib/drafting/documents.ts`, `parts.ts`), preferences (`src/lib/preferences/`), the verification family (`src/lib/verification/`), the DHC filing set (`src/main/filing.ts`), agent tools (`insert_citation`, `list_preferences`, `propose_preference`, `propose_advocate_memory`), the window views, `tests/e2e/phase6.spec.ts`, and `docs/specs/drafting-and-verification.md`.
- Three pre-existing defects fixed after the full suite caught them (details in the session record): `ResearchHub` did not create `<userData>/corpus` (start-up crashed on a fresh folder), phase-5 bridge names and agent tools missing from the exact lists in `tests/e2e/app.spec.ts`, and the `draft` kind CHECK refusing the catalogue kinds.

## Broken or not verified

- None known. The reviewer note's full P9 shape lives on `DraftCheck`; skill report cards still show `not_read` (named in the session record).
- Not run: the live-model e2e tests (`OPENADVO_LIVE_MODEL`), `npm run dist`.
- Risk: `setTarget` builds the court's lists from the court's site; the phase-6 test serves fixtures, and a real matter needs the network or the Court Intelligence upload path.

## Next step

- The owner completes the phase 6 exit on real briefs (lesson L3): draft review where every error found is supported by a source with an accurate reference, and a filing-ready Delhi High Court set the advocate files without changes. Nothing else in phase 6 is owed.
- What counts as done: the owner's real draft and the owner's real filing set, not a test.
- What must not change during it: the frozen decisions, the spec's rule that a slot is the advocate's or the agent's to write, and the witness rule.
- What waits for the owner: Q-3 (the gold set) stays open; the phase 6 exit itself is the owner's task.

## Commands

- Start: `npm run session:start -- --unit`
- Verify: `docs/agent-guide.md` section 8.4 rows that apply.
- Focused check for the exit discussion: `npx playwright test tests/e2e/phase6.spec.ts` (needs the vendored parts).

## Clean state at hand-over

- [x] `npm run session:start -- --unit` exits 0 (330 unit tests: 327 passed, 3 skipped)
- [x] Everything is committed; `scratchpad/` content is not in the diff
- [x] The session record is in `.agents/logs/2026-11-18-phase-6-build.md`
- [ ] The owner's phase 6 exit (the only open item)
