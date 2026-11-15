# The bundled extensions as native parts

Date: 2026-11-15. Base: `main` at `e0873d1`. Owner's instruction: make the seven bundled extensions native, keep their usable parts, remove overlapping redundancies, integrate with the native systems, apply the context and harness lessons, and keep a harmless minimal extension as a placeholder to test the extension system. Spec: `docs/specs/native-harness-parts.md`.

## What happened to each package

Licence facts as the packages state them: six MIT, pi-context-usage ISC. No code was copied from them; each native part is new code against the Pi SDK.

| Package | Now | Code |
|---|---|---|
| @gotgenes/pi-permission-system 42.0.0 | Tool policy: allow, ask (approval card), deny per tool; built-in tools and credential paths always denied; review log without arguments; Settings → Tool permissions | `src/main/tool-policy.ts` |
| pi-subagent-manager 1.9.0 | Helpers: `start_helper` runs one helper in process to its end, through the agent's tools and policy; parallel by several calls in one message; 4 at once; 30 turns; 15 minutes; 8,000-character result; spawn rights in code; Stop ends it at once | `src/main/helpers.ts`, `src/main/helper-types.ts` |
| pi-checklist 3.3.0 | Plan: `plan_set`, `plan_update`; plan card; Clear plan (human-only) | `src/main/plan.ts`, `src/renderer/src/PlanCard.tsx` |
| pi-context-usage 2.1.0, pi-cache-graph 1.2.1 | Context meter in the chat header: tokens of the window, the last run's cache reads and writes; also in the trace | `Agent.setMeter` |
| pi-context-prune 2.2.0 | Dropped: the tool-result clearing per agent kind does its job. Its "prune now" became Compact now | `Agent.compact` |
| pi-context-decisions 4.0.0 | Dropped: the skill registry and tool scopes own its job (it was inert) | — |

Removed: `scripts/vendor-pi-extensions.ts`, `scripts/pi-extensions.manifest.json`, `npm run vendor:extensions`, `PiExtensions.writeSubagentPolicy`, `writePermissionPolicy`, the loader's separate guard, `Agent.stopHelpers`. A unit test fails if any of the seven names returns in `src/`, `extensions/`, `scripts/`, `package.json` or `electron-builder.yml`.

Added: `extensions/placeholder` (one command `/placeholder`, `/placeholder ask`; no tool). Bundled extensions are now the packages in `extensions/`, shipped by `electron-builder.yml`.

Decisions 21 and 23 now say what the owner's instruction changed (`docs/decisions.md`). The successor prompt's part B3 (adapters for each bundled extension) is replaced by this work (H-42).

Lessons applied: one owner per job (two packages dropped); tool results bounded and cleared, not truncated blindly; helpers return condensed results with record ids, and never start a turn by themselves (no `triggerTurn`); approval through the harness, not inside a tool; the trace records cache numbers; a placeholder with no tool, so it costs no context.

## Commands and results

| Command | Result |
|---|---|
| `node --test tests/unit/tool-policy.test.ts` | 5 pass, 0 fail (first run failed: Node's type stripping refused a constructor parameter property; fixed) |
| `node --test tests/unit/pi-extensions.test.ts` | first run: the "no package name" test failed on the vendor manifest and two comments; after their removal, 4 pass |
| `node --test tests/unit/helpers.test.ts` | the Stop test hung: `start_helper` lacked the Stop wrapper and waited on a faux model call that never ends; after the fix, 5 pass, 0 fail |
| `node --test tests/unit/agent-runs.test.ts` | 5 pass, 0 fail (on the shared fixture `tests/unit/agent-fixture.ts`) |
| `node --test tests/unit/plan.test.ts` | first run: Pi refused to compact a short conversation ("Nothing to compact"); Compact now now reports Pi's reason; 3 pass |
| `npm run typecheck` | exit 0 (node and web) |
| `npm run build` | 3 bundles built |
| `npx playwright test tests/e2e/extensions.spec.ts tests/e2e/app.spec.ts tests/e2e/firm.spec.ts` | 7 passed |
| `npm run test:unit` | tests 148, pass 145, fail 0, skipped 3, exit 0 |
| `npx playwright test` | 23 passed, 0 failed, 2 skipped, 2.4 min |
| Link check; feature id check | no broken link; 170 features, no gap |

Evidence: `test-results/tool-permissions.png`, `test-results/extension-question-confirm.png`.

## Not verified

- With a live model: a helper's real run, an approval card in a real run, the plan card filled by a model, the meter's numbers from a real provider (cache numbers depend on the provider), and Compact now on a long conversation.
- The select-question screenshot of H-39: no bundled extension asks a select question any more. The approval card is a select question; it is tested in the unit tests, not in a window screenshot.
- `resources/pi-extensions/` is left on disk, unused and git-ignored. The owner may delete it.
