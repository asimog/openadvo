# Spec: the bundled extensions as native parts

Status: built 2026-11-15 (owner's instruction: "make the extensions we have added already native and keep their usable parts … they become first class parts … remove any overlapping redundancies … keep a harmless minimal extension as a placeholder to test the extension system"). It replaces part B3 and H-42 of the successor prompt. The agent kinds are in [agent-framework.md](agent-framework.md). The code is in `src/main/tool-policy.ts`, `helpers.ts`, `helper-types.ts`, `plan.ts`, `agent-context.ts` and `agent.ts`.

## 1. What changes

The seven npm packages bundled under decision 21 leave the application. Their usable parts are now parts of Open Advocate's own code, under its decisions, its window and its tests. What another part already did is dropped. The extension system stays: the advocate can still add Pi extensions (H-9, H-10), and one small placeholder extension ships to test it.

| Package | Kept as a native part | Dropped |
|---|---|---|
| @gotgenes/pi-permission-system 42.0.0 | **Tool policy** (section 2): allow, ask or deny per tool; built-in tools and credentials always denied; deny hides a tool; the approval card names the query, URL or field; one approval at a time; party-name and MCP rules; a review log and trace lines | Its config file, slash command, bash parser, forwarding socket, project trust layers |
| pi-subagent-manager 1.9.0 | **Helpers** (section 3): four types in process, background jobs, fork context, progress, an early question, Steer, Stop, paged output, waiting results, Final Recap, restart record | Its thread tree with mailboxes, terminal widgets, model picking, agent import, turns that start the parent |
| pi-checklist 3.3.0 | **Plan** (section 4): rules in code, dependencies, subtasks, tags, text lines, the panel and the pinned line | Its terminal widget, footer, display settings, 3-character hash ids |
| pi-context-usage 2.1.0 | **Context meter** (section 5): tokens of the window in the pinned status line and the `/context` breakdown | Its dot grid and terminal screens |
| pi-cache-graph 1.2.1 | **Cache and cost** (section 6): cache reads and writes, hit percentage, a line after each run, `/cost`, CSV | Its graph, export format and terminal screens |
| pi-context-prune 2.2.0 | **Compact now**, Pi's own compaction, and summaries of old tool results with refs (section 7) | Its prune-by-deletion and terminal screens |
| pi-context-decisions 4.0.0 | Nothing. Its design is recorded in [../parking.md](../parking.md) against N1 to N3 | Skill and tool choice by a second model; the policy checks every call, found by search or not |

## 2. Tool policy

- **File.** `<userData>/tool-policy.json`: `{ "default": "allow", "tools": { "<tool>": "allow" | "ask" | "deny" } }`. MCP rules use `mcp__<server>__*`, `mcp__<server>` or `mcp__*`. Written with defaults on first start. The advocate edits it in Settings → Tool permissions, together with the party rule.
- **Always denied**, whatever the file says: Pi's built-in tools (decision 2) and any call whose arguments name a credential path (`auth.json`, `.env`, `.ssh/`, `manifest-signing.key`, `models.json`).
- **Hide.** At the open of a conversation, a tool with a deny rule is removed from the active tools, and the chat says which. The hook still refuses a call that arrives by another path.
- **Ask.** The run waits on an approval card: the tool in plain words, then the query, the URL or the portal field. Choices: Allow once, Allow for this conversation, Refuse. Approvals wait in a queue, one at a time. Stop or a new conversation refuses. An unanswered card for a nested call (a background helper) refuses after 10 minutes, with a text line.
- **Party rule.** When a `web_search` query or a `web_fetch` URL contains a party name of the open matter (three characters or more), the call asks first. Settings turns the rule off.
- **Fail closed.** An error inside the hook blocks the call and writes the review log: a policy error never allows a call.
- **Where.** One hook, the application's guard extension `openadvo-policy` (`tool_call`), in every session of every kind. Helper calls run through the parent's tools, so the same hook checks them.
- **Records.** `<userData>/logs/tool-policy.jsonl`: every deny and every ask with its answer, never the arguments. `trace.jsonl`: a `policy` line for each ask and deny.

## 3. Helpers

`HelperManager` (`src/main/helpers.ts`), one per conversation. It owns every helper of its conversation; no model decides a limit.

- **Tools of the agent:** `start_helper` (`type`, `task`, optional `background`, `fork_context`, `name`), `helper_output` (`helper`, optional `page`), `stop_helper` (`helper`), `steer_helper` (`helper`, `text`). Helpers have `helper_update` and `helper_ask` in addition to their type's tools.
- **Session.** `createAgentSession` with the type's prompt, the conversation's model, no extensions, and a session file under `chat/helpers/`. Its tools are the parent's tools named in the type's allowlist; each call runs through the parent's `ctx.executeTool`, so the policy hook and the nested call id apply. This also works after a background `start_helper` returned.
- **Spawn rights.** Only `legal-research` has `start_helper`, and only for `record-reader`. Enforced in code: the choices come from the caller's type.
- **Limits.** At most 4 helpers run at once per conversation; a fifth call fails at once. Each helper has at most 30 turns and 15 minutes. Output is read in pages of 8,000 characters: a long result is never cut, and `helper_output` returns the next page.
- **Foreground.** The call waits for the result. After the wait limit (5 minutes) it returns "still working" and the helper becomes a background job; it never restarts.
- **Background.** `background: true` returns a job id at once. Its result waits: it reaches the agent with the advocate's next message or "Use results", never by starting a turn.
- **Fork context.** `fork_context: true` gives the helper a frozen block of the parent's last 30,000 characters of conversation.
- **Progress and questions.** `helper_update` writes one text line in the parent's chat. `helper_ask` ends the helper's turn and returns the question; the parent answers with `steer_helper`, which resumes the same session.
- **Steer and Stop.** The agent (`steer_helper`), the advocate (Status line → Helpers), and Stop on the chat. Stop on the chat stops every helper, foreground or background. A stopped helper is recorded as stopped.
- **Final Recap.** When two or more background helpers run, one notice when the last one finishes; it names each helper and says how many results wait.
- **Restart.** `helpers.json` in the chat folder and the partial output in `helpers/<id>.txt`. On reopen, a helper that was running shows as interrupted, with a text line; it never restarts.
- **Cost.** Each helper's tokens, cache reads and writes and cost go to `host.recordUsage` with the matter, and to a `helper_end` line in `trace.jsonl`.
- **Names.** The name comes from the task (or `name`), never from the type.

## 4. Plan

- **Tools:** `plan_set` (a title and up to 10 items, each with `depends_on`, up to 3 `subtasks` and `tags`) and `plan_update` (status, one subtask, tags). The Matter Agent and the Firm Agent have them.
- **Rules, in code:** at most 10 items; planned, ongoing, done, cancelled; done is final; a cancelled item can be planned again; an item starts only after the items it depends on are done; an item is done only when its subtasks are done.
- **State:** in the conversation's state and in `plan.json`; it survives compaction, a restart and a new conversation. A CUSTOM event `PLAN_EVENT` tells the window. Every change also writes a text line in the chat.
- **Advocate:** types "add to the plan: …" to add an item, with no model run; "Clear plan" is a human-only bridge function.
- **Setting:** Settings → Plan asks for a plan only for long work, or for most work. The line goes into the system prompt at the next conversation.
- **Window:** the plan panel above the chat log (Astryx `Collapsible`, `ProgressBar`, `List`, `StatusDot`, `Badge`): each item with its status, dependencies and subtasks, the count done, the helper or draft tags. It folds to the pinned status line, which keeps "Plan 2/5".

## 5. Context meter and the pinned status line

- After each run, the chat state carries `context`: Pi's `getContextUsage()` numbers and the run's cache reads and writes. A CUSTOM event `CONTEXT_EVENT` tells the window.
- One pinned status line at the top of the chat: plan progress, running helpers, waiting results and "Context 31k of 200k (16%)". It is text; its controls are Compact now and the helper menu.
- `/context`, typed in the chat, prints a text breakdown: the window, the tokens used, the system prompt, the tool definitions (and the tokens of each), the messages (and the last 20 entries with any summary marked), the free space and the output buffer. It says plainly that these are estimates.
- "Compact now" calls Pi's `session.compact()` with the kind's summary form (agent-framework section 7.1). It is off while the agent works. A refusal is a text line, never silence.

## 6. Cache and cost

- Each `run_end` line in `trace.jsonl` carries input, output, total tokens, cache reads, cache writes, the hit percentage (cache reads divided by input plus reads plus writes) and the cost. Each `helper_end` line carries the same for one helper.
- After each run, one text line: tokens in and out, cache reads and writes with the hit percentage, and the cost.
- `/cost`, typed in the chat, prints a text table of runs and helpers with tokens, cache and cost, and the total.
- "Export cost CSV" on the matter page saves the same rows as CSV.
- The context meter's tooltip shows the last run's cache numbers.

## 7. Tool-result summaries

- At the end of a run, the conversation marks that its old tool results may be summarised. On the next model request, results older than the kind's `keep` count (matter: 6; firm: 3) and longer than `minChars` are replaced by a short model-written summary with a ref (`t1`, `t2`, …). The turns inside a run keep their cached prefix; the summary is paid once.
- A summary that is not clearly shorter than the original is skipped.
- The original stays in the session. `recall_result` returns it by its ref.
- A chat text line says how many results were summarised. Pi's compaction, when it runs, keeps the same anchors (agent-framework section 7).

## 8. The placeholder extension

`extensions/placeholder/` in the repository: a Pi package with one entry file. It registers one command, `/placeholder`, and nothing the model can call, so it adds nothing to any context. `/placeholder` shows a notice; `/placeholder ask` asks one yes-or-no question through the extension interface and shows the answer. It is the only bundled extension. It tests loading, commands, notices, questions and turning a bundled extension off.

## 9. Checks

Each file runs under a minute with the scripted model (`OPENADVO_TEST=1`).

| Check | Test |
|---|---|
| Policy: deny with a text line and a trace line; the tool is hidden from the next conversation; an ask shows the card with the query; each choice; one approval at a time; the party rule on and off; the timeout for a background helper; Settings saves a rule; MCP rows | `tests/e2e/native-policy.spec.ts`, `tests/unit/tool-policy.test.ts` |
| Helpers: a foreground helper's progress and result; a background helper uses the parent's tools after the call returned; two background helpers and one Final Recap; Use results; Steer and Stop from the status line; Stop on the chat; the wait limit; an interruption after a restart; cost per helper | `tests/e2e/native-helpers.spec.ts`, `tests/unit/helpers.test.ts` |
| Plan: the panel, statuses, dependencies, subtasks, tags; the fold; Clear plan; the rules; an item added by typing; the strength setting; a restart | `tests/e2e/native-plan.spec.ts`, `tests/unit/plan.test.ts` |
| Context: `/context`, `/cost`, the run's cost line, a summary with a ref recalled by `recall_result`, Compact now, the CSV | `tests/e2e/native-context.spec.ts`, `tests/unit/agent-context.test.ts`, `tests/unit/agent-runs.test.ts` |
| The placeholder loads; `/placeholder` and `/placeholder ask` work; it turns off and on | `tests/e2e/extensions.spec.ts`, `tests/unit/pi-extensions.test.ts` |
| No bundled package is left: no package name in the code, scripts or tests | `tests/unit/pi-extensions.test.ts` |

Done (lesson L3): the owner runs a real brief with a plan, a background helper, an approval card and `/cost`.
