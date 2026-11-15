# Native parts: gap list

Date: 2026-11-15. Base: `main` at `b9916fc`. Prompt: `.agents/prompts/native-parts-phase.md` (owner's scope, passed on by a side session). Checked: `git log`, `git status`, the code named in the prompt's section 0, and a search for the seven package names in `src/`, `scripts/`, `tests/`.

Already removed before this phase: the seven packages, `scripts/vendor-pi-extensions.ts`, its manifest and `npm run vendor:extensions` (commit `dd3a913`). Names left: `tests/unit/pi-extensions.test.ts` lists them on purpose, to fail if one comes back; one comment in `tests/unit/tool-policy.test.ts`. `resources/pi-extensions/` is on disk, unused.

| Item | State | Missing |
|---|---|---|
| Rule "new decisions overrule old" | not built | the rule at the top of `docs/decisions.md`; decisions 21 and 23 are already updated, with the owner's words |
| Scripted test model for end-to-end runs | not built | a faux provider under `OPENADVO_TEST=1`, scripted through `__openadvoTest.setModelScript` |
| 2.1 Tool policy | part built | built: allow/ask/deny file, fixed denials, three choices, Stop refuses, review log, Settings list. Missing: hide denied tools before the run; fail closed; party-name rule for `web_search`/`web_fetch`; MCP server and tool rules; the card shows the query, URL or field; one approval at a time; 10-minute timeout for a background helper's approval; `policy` lines in the trace; Settings rows for MCP and the party rule |
| 2.2 Helpers | part built | built: four types, in process, policy, spawn rights in code, 4 at once, 30 turns, 15 minutes, foreground, Stop on the chat. Missing: background jobs; fork context; `helper_update` as text; `helper_ask`; `steer_helper` and the advocate's Steer; `stop_helper` and the advocate's Stop; 5-minute wait notice; paged output (`helper_output`) instead of a cut; results wait for "Use results" or the next message; Final Recap; interrupted after a restart; a session file per helper; cost per helper with the matter; names from the task; settable test timeouts |
| 2.3 Plan | part built | built: 10 items, four statuses, saved, card, Clear plan. Missing: transitions (done is final, cancelled can be planned again); dependencies; subtasks (3); tags; the advocate adds an item by typing; the strength setting; the plan survives a new conversation; the panel from Astryx components that folds to the status line; plan changes as text lines |
| 2.4 Context | part built | built: clearing per kind; Compact now. Missing: summaries with refs and `recall_result`; summarise once at the final answer; skip when not shorter |
| 2.5 Context meter | part built | built: header meter. Missing: the pinned status line; `/context` breakdown |
| 2.6 Cache and cost | part built | built: cache reads and writes per run in the trace. Missing: input, output and hit % in the trace; a tokens-and-cost line after each run; `/cost`; CSV export |
| 2.7 Skill choice | part built | built: the policy checks every call, found by search or not. Missing: the parking entry |
| 2.8 Placeholder | built | — (its end-to-end test exists: `tests/e2e/extensions.spec.ts`) |

Unit tests written before this prompt (`tool-policy`, `helpers`, `plan`, `agent-runs`, `agent-context`, `firm-agent`, `pi-extensions`) stay; no new unit tests are added in this phase.
