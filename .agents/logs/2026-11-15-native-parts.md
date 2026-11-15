# Native parts phase: report

Date: 2026-11-15. Worktree `native-parts-finish` (from `main` at `7a7edee`). Scope: [.agents/prompts/successor-native-parts-phase.md](../prompts/successor-native-parts-phase.md); the owner's phase scope is [.agents/prompts/native-parts-phase.md](../prompts/native-parts-phase.md). The gap list at hand-over is [2026-11-15-native-parts-gaps.md](2026-11-15-native-parts-gaps.md).

## 1. State at hand-over and what was missing

The WIP commit passed `npm run typecheck`, but the helper runtime v2, the policy gaps, the context summaries, the cost lines, `/context`, `/cost`, the CSV and the plan-strength UI were not built. `stopHelper`, `steerHelper`, `useHelperResults`, `getPlanStrength`, `setPlanStrength` and `costCsv` were declared on the bridge with no main-process handlers.

Built in this session:

| Item | Now |
|---|---|
| 2.1 Tool policy | Deny hides the tool at the next conversation; fail closed; party-name rule for `web_search`/`web_fetch` (on or off); MCP rules (`mcp__<server>__*`, `mcp__*`); the card shows the query, URL or field; one approval at a time; 10-minute timeout for a nested (background helper) approval with its own text line; `policy` lines in `trace.jsonl`; Settings rows for MCP and the party rule |
| 2.2 Helpers | `HelperManager` per conversation: foreground and background jobs, fork context, `helper_update` as text, `helper_ask` and answer by Steer (same session), Steer and Stop (agent, advocate and Stop on the chat), 5-minute wait then background, paged `helper_output` (8,000 characters), results wait for the next message or Use results, one Final Recap, `helpers.json` + `helpers/<id>.txt`, interrupted after a restart, a session file per helper under `chat/helpers/`, cost per helper with cache, names from the task, test-only timeouts |
| 2.3 Plan | Dependencies, subtasks, tags, transitions (done final, cancelled replannable), text line per change, "add to the plan: …", strength setting, survives a new conversation and a restart, panel from Astryx components that folds to the status line, Clear plan |
| 2.4 Context | Summaries of old tool results once at the end of a run, `t1` refs, `recall_result`, skip when not clearly shorter, text line with the count |
| 2.5 Context meter | Pinned status line (plan, helpers, waiting results, context); `/context` text breakdown with estimates said plainly |
| 2.6 Cost | Input, output, cache reads/writes, hit percentage and cost in `run_end`; `helper_end` per helper; a text line after each run; `/cost` table; "Export cost CSV" on the matter page |
| 2.7 Skill choice | The pi-context-decisions design is in `docs/parking.md` against N1 to N3; nothing built |
| 2.8 Placeholder | Was built; its test passes |

Not built: the Firm Agent has no `start_helper` in the code. Its tool set has no research tools, so a firm helper today would have no tool to work with. [specs/native-harness-parts.md](../../docs/specs/native-harness-parts.md) says "tools of the agent", not "of the Firm Agent". The owner's phase scope section 4 still says the Firm Agent may start helpers for firm work and none that read a matter's documents. That line and the code disagree; the code follows the safer state (no firm helpers), and this report records the mismatch.

## 2. Commands and results

| Command | Result |
|---|---|
| `npm install` | exit 0 (fresh worktree) |
| `npm run typecheck` | exit 0, after each change |
| `npm run build` | exit 0 |
| `node --test --test-timeout=60000 tests/unit/helpers.test.ts tests/unit/tool-policy.test.ts tests/unit/plan.test.ts tests/unit/agent-context.test.ts tests/unit/agent-runs.test.ts` | 23 tests, 23 passed, 0 failed |
| `npx playwright test tests/e2e/native-policy.spec.ts tests/e2e/native-helpers.spec.ts tests/e2e/native-plan.spec.ts tests/e2e/native-context.spec.ts tests/e2e/extensions.spec.ts` | 22 tests, 22 passed, 0 failed, 1.5 minutes |

The end-to-end files, all with the scripted model (`OPENADVO_TEST=1`):

- `native-policy.spec.ts` (5): deny with a text line, a trace line and hiding; an ask with the query; each choice; one approval at a time; the party rule on and off; the background-helper approval timeout; Settings saves a rule.
- `native-helpers.spec.ts` (8): foreground progress and result; two background helpers, one Final Recap and Use results; Steer and Stop from the status line; Stop on the chat; the parent's tools after a background `start_helper` returned; the wait limit; fork context; a question answered by Steer; an interruption after a restart; `/cost` lists the helpers.
- `native-plan.spec.ts` (4): the panel, statuses, dependencies, subtasks and tags; the fold; Clear plan; the rules; an item added by typing; the strength setting; a restart.
- `native-context.spec.ts` (3): `/context`, `/cost`, the run's cost line, the CSV; a summary with refs recalled by `recall_result`; Compact now.
- `extensions.spec.ts` (2): the placeholder and the settings rows, unchanged.

Unit tests changed only where the new behavior changed the expected result: hidden denied tools, the card's query text, MCP rules, the host defaults, and the helper manager's constructor.

## 3. Not verified

- No live model run of the helpers, approvals, plan, summaries, Compact now or the Firm Agent. The owner's exit (lesson L3) is still to run a real brief with a plan, a background helper, an approval card and `/cost`.
- MCP rules are unit-tested as patterns. No MCP server was connected in this session, so the Settings rows for a real server and a real MCP call are not seen.
- The Firm Agent helper path is not built (section 1).
- Windows is the only platform tested here.

## 4. Notes for the owner

- `resources/pi-extensions/` is not used and can be deleted.
- `.agents/memory-rag-assessment.md` belongs to another session and was not added.
- The Pi reference at `C:\dev\pireference` was not read. The session-start check looks for it under the worktree and reported it missing. The Pi behavior was checked against the installed Pi 1.5.2 type definitions and its MCP extension documentation in `node_modules/@earendil-works/pi-coding-agent/dist`.

## 5. Commits

- `4a911cf` Native harness parts: helpers v2, policy gaps, plan panel, summaries, cost.
- `bf1f09e` Docs: the native harness parts as built.
- `68c4590` Report: native parts phase finished, with commands and what is not verified.
- `8fd0e90` Helpers stop when the conversation is replaced; app tool list follows the new tools.
- `d38033d` Plan test: a new conversation keeps the plan.

Note: `8fd0e90` and `d38033d` came after this report. Their tests passed (`native-helpers` Steer/Stop and background tool use; `native-plan` restart with a new conversation).
