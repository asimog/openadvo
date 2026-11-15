# Pi extensions and the harness hardening plan

Date: 2026-11-15. Owner's instruction: include every missing Pi feature, write a separate harness hardening plan, let the advocate add Pi extensions, and install pi-subagent-manager, pi-context-decisions, pi-checklist, pi-context-prune, pi-context-usage and pi-cache-graph. Evidence base: `2026-11-15-pi-sdk-review.md`.

## Review of the six extensions before install

- Cloned each repository (scratchpad, depth 1) and read `package.json`, the README, and the registrations: tools, commands, events, process, file and network calls, UI calls.
- The npm tarballs differ from the repository heads (pi-subagent-manager 37 files, pi-context-decisions 48, pi-cache-graph 13, pi-checklist 8, pi-context-usage 5, pi-context-prune 0). The scan was repeated on the installed tarballs.
- Process calls in the tarballs: one `spawnSync` in `pi-subagent-manager/src/ui/ui.ts`. It opens `$EDITOR` only when `ctx.mode === "tui"`. The application binds `mode: "rpc"`. No `fetch` in any of the six.
- pi-subagent-manager's bundled agent types allow `read`, `bash`, `edit` and `write`. Its default `toolFiltering` is `all-except-blocked`. The application now writes `toolFiltering: "allowed"` and an overlay per type (see harness-hardening.md section 3).

## Done

- `scripts/vendor-pi-extensions.ts`, `scripts/pi-extensions.manifest.json`, `npm run vendor:extensions`. electron-builder includes `resources/pi-extensions/**`. `.gitignore` excludes it.
- `src/main/pi-extensions.ts`: loader, package manager, host guard, helper-agent policy, extension UI context.
- `src/main/agent.ts`: DefaultResourceLoader through `PiExtensions`; `noTools: "builtin"` with an exclude list; a new start check; `bindExtensions` with the UI context; compaction on (H-2); the race fix and follow-up (H-1); the prompt fix (H-4); the comment fix (H-7); extension commands run without a model; `reloadIdle()`.
- Bridge: `listExtensions`, `addExtension`, `removeExtension`, `setExtensionEnabled`. Settings → Pi extensions panel. Chat dock: extension status lines and multi-line notices.
- Docs: `docs/harness-hardening.md` (new), decision 22, EC-3, EC-12, vendored parts, architecture section 7, repo map, indexes, H-8 (six workflows).

## Commands and results

| Command | Result |
|---|---|
| `npm view <name>@<version> dist.integrity` (six) | recorded in the manifest |
| `node scripts/vendor-pi-extensions.ts` | "added 9 packages"; 6 extensions; every integrity matched |
| `npm run typecheck` | exit 0 |
| `node --test tests/unit/pi-extensions.test.ts` | 5 pass, 0 fail |
| probe: loader, confidential | `['<inline:openadvo-policy>']` only |
| probe: loader, normal | six extensions plus the guard, mcp, codemode, tool_search |
| `npx playwright test tests/e2e/app.spec.ts -g "bridge|built-in Pi tool"` | 2 passed (after sorting the tool list; order changed) |
| `npx playwright test tests/e2e/extensions.spec.ts` | 2 passed; screenshot `test-results/extension-command.png` shows the `/context` report |
| `npm run test:unit` | 112 tests: 109 pass, 0 fail, 3 skipped; exit 0 |
| `npx playwright test` (full) | 22 passed, 2 skipped (the live-model tests); exit 0 |

## Not done

H-3, H-5, H-6, H-13, H-15 to H-27 and H-31 are open. H-29 (Pi's built-in tools) and H-30 (pi-durable, chord) need an owner decision. See `docs/harness-hardening.md`.
