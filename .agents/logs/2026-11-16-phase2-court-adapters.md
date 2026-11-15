# Phase 2: court adapters, on-demand rule lists and filing readiness

Session of 2026-11-16. Owner's instruction: "continue building phase 2 … do not download the whole rules for supreme court or each high court … it should be based on lawyer profile and it should be made when needed … write the framework for adapters that would download necessary PDFs of court rules and turn them into usable checklists workflows and lists … these adapters should be modifiable and upradeable and ability to be vendored in". Spec: [docs/specs/court-adapters.md](../../docs/specs/court-adapters.md).

## What was built

| Feature | Code |
|---|---|
| B1 | `src/lib/court-directory/` (Supreme Court, 25 High Courts, 36 district judiciaries, state consumer commissions and RERA authorities, national tribunals; appeal routes; "advocate to verify") |
| B2 to B7, B10, Q1 | `src/lib/intel-store/packs.ts` and `IntelStore` methods: documents and their lines, versioned lists and items, bench rows, proceeding packs |
| Framework | `src/lib/court-adapters/` (adapter checks, OCR-tolerant quote match, scope, section extraction, link finding, format checks, profile needs, defect matching); `src/main/court-intel.ts` (tiers, profile, on-demand build, upload, fork, add, matter checklist, compliance, format checks, defects, D5, rules context) |
| Vendoring | `scripts/vendor-adapters.ts`, `scripts/adapters.manifest.json` (empty), `npm run vendor:adapters` |
| B11 to B14 | `src/lib/matter-store/filing-checks.ts`; checklist rows joined to the filing compliance list in `src/main/filing.ts` (`courtRules`) |
| D5 | `forumRefusal` in `src/main/skill-runner.ts`; context kind `rules` |
| Window | `src/renderer/src/Intel.tsx` (courts and practice in the profile; Court Intelligence; the court checklist in the matter's Filing tab) |
| Built-in adapters | `adapters/in-sc`, `adapters/in-hc-delhi`, `adapters/in-dj-delhi` |

## The built-in adapters: what was read

Each quote was copied from the official document, downloaded into `scratchpad/` (not committed) and read with the application's own text extraction:

| Document | Address | Pages (with text) |
|---|---|---|
| Supreme Court Rules, 2013 (Gazette text) | found by its title on https://www.sci.gov.in/supreme-court-rules/ | 109 (109) |
| Delhi High Court, Rules for On-line Electronic Filing | found on https://delhihighcourt.nic.in/web/e-filing | 106 (86) |
| Delhi High Court, Practice Directions No. 74/Rules/DHC (A4) | same page | 1 (1) |
| High Court Rules and Orders, Vol. I, Ch. 1 | found on https://delhihighcourt.nic.in/web/court-rules | 51 (49) |

Check of every quote against these texts (`scratchpad/checkadapters.ts`): 0 quotes not found. The Supreme Court text has OCR errors ("issucd", "oftlie"), so the match allows them; one quote was changed because "papers" was read as "papcr5".

Not stated by any document read, so not in the adapters: Supreme Court format checks and registry defect classes (question Q-4), Delhi High Court defect classes, case-type checklists of the Delhi High Court beyond the e-filing format.

## Commands and results

| Command | Result |
|---|---|
| `node --test tests/unit/court-adapters.test.ts tests/unit/court-intel.test.ts` | 13 passed, 0 failed |
| `node --test tests/unit/skill-runner.test.ts` | 8 passed (with the D5 test) |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 195 tests: 192 passed, 0 failed, 3 skipped; exit 0 |
| `npm run build` | "built in" three times |
| `npx playwright test tests/e2e/phase2.spec.ts` | 2 passed |
| `node scripts/vendor-adapters.ts --from <a copy at 1.0.1>`, then with an invalid file | vendored and pinned with its SHA-256 and lock file; the invalid file exited 1 (the test output was removed and the manifest restored) |
| Link check of `docs/agent-guide.md` section 9.1 | no broken link |

A first full end-to-end run had 2 failures, both tests that stated the earlier window: the exact bridge list in `tests/e2e/app.spec.ts` and the Court Intelligence note in `tests/e2e/phase1.spec.ts`. Both were updated; the final run is below.

Evidence: `test-results/phase2-court-intel.png`, `test-results/phase2-checklist.png` (not committed).

## Not built, and said on screen or in the spec

- B7: reading rosters from the court sites. Bench rows are entered by the advocate with a source.
- B13: font and margin checks of a DOCX; the checks run on the filing set's PDFs only. OCR of rule documents is not run.
- B14: drafting the defect reply (skill SK-025, phase 8).
- B15, B16, B17: the paper book, the filing history and the signed manifest are the existing code; nothing new.
- The owner's exit (lesson L3): checking the first courts' lists against the official sources and accepting one Delhi High Court case type.

Final run after those updates: `npx playwright test`: 47 passed, 2 skipped (the live-model tests), 0 failed; exit 0; 4.1 min.
