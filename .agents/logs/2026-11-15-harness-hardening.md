# Harness hardening: H-3 and H-12

Date: 2026-11-15. Owner's instruction: "start the build plan with harness hardening". Order from `docs/harness-hardening.md` section 5.

## Done

| Item | Commit | What |
|---|---|---|
| H-3 | 0d98c92 | The model is resolved again when none was found and when `auth.json` or `models.json` change (size and time only; contents never read). An open session takes the model before its next run, with a notice. Pi's stand-in model `unknown/unknown` counts as no model. The chat and the model picker read the model again on window focus and after each run. |
| H-3 test | 0d98c92 | `tests/unit/agent.test.ts`: the `Agent` class with a faux model (H-1, H-3, follow-up). |
| H-12 | see git log | Extension questions (`select`, `confirm`, `input`, `editor`) are AG-UI interrupt objects in the CUSTOM event `EXTENSION_QUESTIONS_EVENT`, answered in a card in the chat (`answerExtensionQuestion`). Dismiss, Stop, a new conversation, abort and timeout give the default answer. |
| Session close | see git log | `closeSession()` sends `session_shutdown` before `dispose()`. Without it pi-permission-system's forwarding socket stayed open after each new conversation, reload or quit. |

## Mismatches and defects found

- Pi's agent holds a stand-in model `unknown/unknown` when it has none. The old "no model" checks never matched it. Fixed with H-3.
- `tests/e2e/v1.spec.ts` expected no "No model" notice after a restart; it relied on the stand-in defect. The test now checks the notice against `chat.model`. The notice no longer repeats on each restart.
- The first H-12 response schema listed options with terminal codes; the unit test caught it. Fixed.
- Pi's `session.dispose()` does not send `session_shutdown`. Recorded as agent-guide pitfall 11.
- `docs/harness-build.md` and `docs/agent-guide.md` said an `ask` rule acts as a refusal. Updated.

## Commands and results

| Command | Result |
|---|---|
| `node --test tests/unit/agent.test.ts` | 4 pass, 0 fail |
| same, with the H-3 lines removed | 4 fail (the tests detect the defect) |
| `node --test tests/unit/extension-questions.test.ts` | 4 pass, 0 fail |
| `node --test tests/unit/pi-extensions.test.ts` | 6 pass, 0 fail, exit 0 (before `closeSession`, the process did not exit) |
| `npm run typecheck` | 0 errors |
| `npm run test:unit` | 121 tests: 118 pass, 0 fail, 3 skipped, exit 0 |
| `npm run build` | "built in" 3 times |
| `npx playwright test` (H-3 build, before the v1 test fix) | 21 pass, 1 fail (`v1.spec.ts` no-model notice), 2 skipped |
| `npx playwright test` (H-12 build) | 23 pass, 0 fail, 2 skipped (live-model tests), exit 0 |

## Evidence

- `2026-11-15-harness-hardening/extension-question-confirm.png`: the `/checklist clear` question.
- `2026-11-15-harness-hardening/extension-question-select.png`: the `/pruner` choices.

## Not verified

- A permission `ask` from a helper agent forwarded to the main window (needs a live model).
- The H-3 sign-in flow in the window with a real provider; it is tested with a faux provider only.

## Next

H-14 (the `/` list), then the rest of `docs/harness-hardening.md` section 5.
