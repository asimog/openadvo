# Permission system, Pi agent folder, pi-btw removal, confidentiality removal

Date: 2026-11-15. Owner's instruction: configure pi-permission-system the best way (logs in our own folder, or Pi's agent folder pointed at the app's folder); build the permission config; remove pi-btw; remove the confidential distinction; add a harness build doc covering this, with side questions and the browser plan (A, plus agent-browser through MCP, plus Playwright scripts) recorded for later.

## Done

- **Decision 23.** `src/main/index.ts` `claimPiAgentDir()` reads the owner's Pi folder with `getAgentDir()`, then sets `PI_CODING_AGENT_DIR=<userData>/pi-agent`. `Agent` takes `piHome`. It reads `auth.json` and `models.json` with explicit paths (`ModelRuntime.create({ authPath, modelsPath })`) and Pi's default model from `piHome`.
- **Decision 24.** `PiExtensions.writePermissionPolicy()` and `permissionPolicyFile()`. The file is `<userData>/pi-agent/extensions/pi-permission-system/config.json`. On every start the safety rules are put back: shell commands and Pi's built-in tools denied; credential paths denied; `yoloMode` false.
- **pi-btw removed** from the manifest. `npm run vendor:extensions` was re-run: 7 extensions, every integrity hash matched; `@narumitw` is gone from `resources/pi-extensions/node_modules`.
- **Decision 25.** The confidential checks were removed from:
  - `agent.ts`: send, start check, loader call, `ChatState.confidentialSession`;
  - `pi-extensions.ts`: the loader;
  - `studio.ts`: web search and `admit`;
  - `Practice.tsx`: the checkbox.

  The stored column stays and is not read. The budget is unchanged.
- **Tests.** `tests/unit/pi-extensions.test.ts` was rewritten and now uses a faux model through `createFauxCore` and `pi.registerProvider`. `tests/e2e/extensions.spec.ts` now checks the policy file and `PI_CODING_AGENT_DIR` in the running app. The `tests/e2e/v5.spec.ts` budget test no longer sets the confidential flag.
- **Docs.** New `docs/harness-build.md`. Decisions 23 to 25, with 19 marked superseded. Product hard rule 9 marked removed. Updated: harness-hardening (section 3 now links to harness-build; H-32, H-33; tests; order), architecture, engineering EC-3, repo map, docs index.

## Commands and results

| Command | Result |
|---|---|
| `npm run vendor:extensions` | added 15 packages; 7 extensions; integrity matched |
| `node --test tests/unit/pi-extensions.test.ts` (debug print on) | 5 pass. `probe_allowed` ran; `probe_denied` gave "Tool probe_denied not found"; `probe_path` with `<agentDir>/auth.json` gave "[pi-permission-system] Denied by policy: 'path' … (rule '*auth.json')"; `permission_request.blocked` in `<agentDir>/extensions/pi-permission-system/logs` |
| search for a review log under `~/.pi/agent` | none; `~/.pi/agent/extensions` does not exist |
| `npm run typecheck` | exit 0 |
| `npm run build` | 3 bundles built |
| `npx playwright test tests/e2e/extensions.spec.ts tests/e2e/app.spec.ts tests/e2e/v5.spec.ts` | 11 passed, 2 skipped (live model) |
| `npm run test:unit` | 112 tests: 109 pass, 0 fail, 3 skipped; exit 0 |
| `npx playwright test` (full) | 22 passed, 2 skipped (live model); exit 0 |
| after the Settings text change: `npm run typecheck`, `npm run build`, `npx playwright test tests/e2e/extensions.spec.ts` | exit 0; 3 bundles; 2 passed |

## Facts found

- With pi-permission-system, a tool whose rule is `deny` stays in Pi's active tool list but is withheld from the model at call time ("Tool … not found").
- Its review log records blocks at call time (`permission_request.blocked`), not plain allows.
