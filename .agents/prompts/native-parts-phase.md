# Prompt: the bundled extensions as native parts, in one phase

You are the lead engineer of `C:\dev\openadvo`. Read this whole prompt before you act. The owner is a lawyer and the first user. Follow `AGENTS.md`; this prompt overrides it only where it says so.

## 0. Start by finding out where things stand

Another session has already started this work. Do not trust any summary, including this one. Before you plan:

1. Run `npm run session:start`. Read `git log --oneline -20` and `git status`.
2. Read `docs/specs/native-harness-parts.md`, `docs/specs/agent-framework.md`, `docs/decisions.md` (decisions 21 to 23), and the newest files in `.agents/logs/` and `.agents/prompts/`.
3. Read the code that exists: `src/main/agent.ts`, `agent-context.ts`, `tool-policy.ts`, `helper-types.ts`, `firm-agent.ts`, `pi-extensions.ts`, `src/renderer/src/ChatDock.tsx`, `FirmChat.tsx`, and any new files for helpers, the plan or the meter.
4. Check what is still bundled: `resources/pi-extensions/`, `scripts/pi-extensions.manifest.json`, `scripts/vendor-pi-extensions.ts`, and every place in `src/` and `tests/` that names `pi-subagent-manager`, `pi-checklist`, `@gotgenes/pi-permission-system`, `pi-context-prune`, `pi-context-usage`, `pi-cache-graph` or `pi-context-decisions`.
5. Write a short gap list in `.agents/logs/<date>-native-parts-gaps.md`: for each item in section 2, one of built, part built (what is missing), or not built. Build only what the gap list says is missing. Do not rebuild what works.

Read `C:\dev\pireference` before you write code against Pi. Use Pi's features (sessions, `steer`, `followUp`, `compact`, the `context` and `tool_call` hooks, `getContextUsage`, `executeTool`). Do not reinvent them.

## 1. Rules for this phase

- **One phase, finished.** Build every item of section 2 in this phase, deep and complete (lesson L5). If an item cannot be finished, say so on screen (lesson L2) and in the report.
- **Text by default.** The chat streams plain text lines for anything the advocate only needs to read. A control (a button, a form, a card with choices) is used only where the advocate must act. Section 3 says which is which.
- **One pinned status line** at the top of each chat: the plan's progress, running helpers and context use, for example `Plan 2/5 · 1 helper running · Context 31k of 200k (16%)`. It is text, not a card.
- **No bundled package remains.** The seven packages leave the application; their kept parts are our code. The extension system stays for packages the advocate adds, plus one placeholder (section 2.8).
- **Testing (owner's instruction, overrides `docs/agent-guide.md` section 8.4).** Write end-to-end tests only (Playwright, `tests/e2e/`). No new unit tests. Do not run the full unit suite or the full end-to-end suite. Run `npm run typecheck`, `npm run build`, and the end-to-end files you add or change. If an existing unit test breaks because of a removed package, delete or fix only that test, and say so in the report.
- **A model in end-to-end tests.** Real runs need a model. Check whether the app has a test-only scripted model. If not, add one: when `OPENADVO_TEST=1`, a faux provider from `@earendil-works/pi-ai` (`createFauxCore`) whose responses a test sets through a test hook (`__openadvoTest.setModelScript`). It never loads outside tests.
- Write in Simplified Technical English. Commit in small steps. Push nothing. Never give legal or licensing advice.

## 2. The features

### 2.1 Tool policy (replaces pi-permission-system)
- Allow, ask or deny per tool, from `<userData>/tool-policy.json`; Pi's built-in tools and credential paths always denied.
- Hide denied tools before the run, so the model does not try them.
- Fail closed: an error inside the policy hook blocks the call and is logged.
- Rules by argument: ask before `web_search` or `web_fetch` when the query or URL contains a party name of the open matter.
- Rules per MCP server and per MCP tool.
- The approval card shows what the call will do: the tool in plain words, plus the query, the URL or the portal field.
- Choices: Allow once, Allow for this conversation, Refuse. Stop, a new conversation or a timeout refuses. Approvals wait in a queue, one at a time.
- A timeout on an unanswered approval for a background helper (refuse after 10 minutes).
- A review log without arguments, and a `policy` line in `trace.jsonl` for each ask and deny.
- Settings → Tool permissions: a list of tools and MCP servers with allow, ask or deny, and the party-name rule on or off.

### 2.2 Helpers (replaces pi-subagent-manager)
- The four types (`legal-research`, `record-reader`, `critic`, `drafter`) with their allowlists, in process, through the parent's tools and policy.
- Only `legal-research` may start helpers, and only `record-reader`. Enforced in code, with the depth limit.
- Limits: 4 at once per conversation, 30 turns and 15 minutes each.
- Foreground: the call waits for the result. Background (`background: true`): the call returns a job id at once.
- Fresh context by default; fork context (a frozen copy of the conversation) on request, for example for a `critic`.
- Progress reports from the helper (`helper_update`) stream as text in the parent's chat.
- Early hand-back with a question (`helper_ask`): the question reaches the parent agent, which answers it or asks the advocate.
- Steer: the agent (`steer_helper`) or the advocate can add an instruction to a running helper.
- Stop: Stop on the chat stops every helper; the agent can stop one (`stop_helper`); the advocate can stop one.
- Wait timeout: after 5 minutes the parent is told the helper is still working; the helper keeps running.
- Paged output: a long result is read in pages (`helper_output`), not cut.
- Background results never start a turn by themselves. A finished result waits; it reaches the agent with the advocate's next message, or when the advocate chooses "Use results".
- Final Recap: when several background helpers run, one notice when all of them have finished, not one per helper.
- After a restart, a helper that was running shows as interrupted, with its partial output. It never restarts by itself.
- Each helper's transcript is kept as a session file in the matter's chat folder, linked to its parent.
- Cost per helper, including cache reads and writes, recorded with the matter.
- Helper names come from the task, not the type.

### 2.3 Plan (replaces pi-checklist)
- At most 10 items; statuses planned, ongoing, done, cancelled; `done` is final; a cancelled item can be planned again; enforced in code.
- Dependencies: an item cannot start until the items it depends on are done.
- Subtasks: at most 3 per item; an item cannot be done while a subtask is open.
- Tags on an item (for example which helper is doing it, which draft it changes).
- The advocate can add an item by typing it, for example "add to the plan: check Order XXII".
- A setting for how strongly the agent is asked to keep a plan (only for long work, or for most work).
- The plan survives compaction, a restart and a new branch of the conversation.
- **The plan has its own UI** (owner's instruction): a compact checklist panel above the chat log, built from reusable Astryx components already in the app (for example `@astryxdesign/core` list, checkbox or status components; check what the package offers before you build anything by hand). It shows each item with its status, dependencies and subtasks, the count done, the helper working on an item, and a "Clear plan" action (human-only bridge function). It folds to the pinned status line when the advocate collapses it. Plan changes still stream as text lines too.

### 2.4 Context (replaces pi-context-prune)
- Keep the clearing per agent kind that exists.
- Summarise instead of delete: old tool results are replaced by a short summary; the originals stay in the session.
- Each summary carries short refs (`t1`, `t2`); a tool (`recall_result`) returns the original.
- Summarise once, when the agent gives its final answer, not every turn, so the prompt cache holds.
- Skip a summary that is not shorter than the original.
- Compact now: an action in the chat, off while the agent works.

### 2.5 Context meter (replaces pi-context-usage)
- In the pinned status line: tokens used of the window.
- On request (`/context`, typed in the chat): a text breakdown of system prompt, tool definitions, messages, free space and the output buffer; tokens per tool definition; tokens per turn with compaction summaries shown. Say that these are estimates and that the provider's totals can differ.

### 2.6 Cache and cost (replaces pi-cache-graph)
- Per run, in `trace.jsonl`: input, output, cache reads, cache writes and the cache hit percentage, computed as cache reads divided by (input plus cache reads plus cache writes).
- After each run, one text line with the run's tokens and cost.
- `/cost`, typed in the chat: a text table of runs and helpers with tokens, cache and cost.
- Export of cost per matter as CSV, from the matter's page.

### 2.7 Skill choice (replaces pi-context-decisions)
- Keep: discovery is not permission; a tool found by search or by code is still checked by the policy at the call.
- Record the rest of its design (relevant skills only, keep earlier picks, an always-allowed list, no filtering below 8 skills, a pick history in the trace, when to pick again) in `docs/parking.md` against features N1 to N3. Do not build it: Open Advocate has no skills of its own yet.

### 2.8 The placeholder extension
- `extensions/placeholder/` in the repository: one command, `/placeholder`, which shows a notice; `/placeholder ask` asks one yes-or-no question and shows the answer. No tools, so it adds nothing to any context.
- It is the only bundled extension. Settings → Pi extensions lists it and can turn it off and on.

## 3. Text or control

**Text lines in the chat** (streamed, no buttons):
- helper start, progress, finish, timeout notice and interruption;
- the Final Recap notice;
- plan updates;
- policy refusals;
- compaction and summary notices;
- the run's tokens and cost;
- the outputs of `/context` and `/cost`.

**One pinned status line**: plan progress, running helpers, context use.

**The plan panel** (section 2.3): the one exception to "text by default", because the advocate follows the plan throughout long work.

**Controls** (the advocate acts):
- the approval card (Allow once, Allow for this conversation, Refuse);
- Stop for the chat, and Stop and Steer beside each running helper in the status line's menu;
- "Use results", when background results wait;
- "Compact now";
- Settings → Tool permissions;
- the CSV export;
- answers to a helper's question, when the parent agent passes it to the advocate (the existing question card).

## 4. What stays where (agents and layers)

- **The advocate** decides every legal point and every approval. Only bridge functions (decision 5) change a decision.
- **The Firm Agent** sees the firm's summary, plans firm work, and proposes instructions for a matter. It may start helpers only for firm work, and none that read a matter's documents.
- **The Matter Agent** owns its matter's conversation, plan and helpers. It is the only agent that talks to the advocate in that matter. It passes a helper's question to the advocate when it cannot answer it.
- **Helpers** work for their parent only. They never talk to the advocate, never approve, never write outside their type's tools, and never start a turn.
- **The orchestration layer** (our code in `src/main/`): the run listener, the policy hook, the helper runtime, the plan store, the context strategy and the trace. It owns limits, Stop, timeouts, restarts and records. No model decides any of these.
- **Pi** owns sessions, the agent loop, compaction, steering and the hooks. Use them; do not wrap them twice.
- **The window** shows text, the pinned line and the controls of section 3. It holds no logic (decision 3).
- **New decisions overrule old decisions** (owner's rule, 2026-11-15). When the owner's newer instruction conflicts with an older accepted decision, the newer one wins. Record this rule at the top of `docs/decisions.md`, and update the older decision's text to the new state, with the date and the owner's words. Decisions 21 and 23 name the bundled packages; this phase's instruction replaces those parts, so update them this way.

## 5. End-to-end tests

One file per part, in `tests/e2e/`, each using the scripted test model.

**No long tests** (owner's instruction). No test waits for a real 5-minute, 10-minute or 15-minute limit. Make the helper limits and timeouts settable for tests (for example `OPENADVO_TEST_HELPER_TIMEOUT_MS`, used only when `OPENADVO_TEST=1`) and set them to a few seconds. A background helper in a test finishes in seconds, through the scripted model. Each test file should run in under a minute.

- `native-policy.spec.ts`: a deny is refused with a text line; an ask shows the card with the query; each choice works; a party-name query asks; the Settings view changes a rule.
- `native-helpers.spec.ts`: a foreground helper's progress and result as text; two background helpers, then one Final Recap notice, and "Use results" sends them; steer and stop from the status line; Stop on the chat stops both; an interruption after a restart.
- `native-plan.spec.ts`: the plan panel shows the items, statuses and subtasks, collapses to the status line, and "Clear plan" works; a dependency blocks; an item added by typing; the plan after a restart.
- `native-context.spec.ts`: `/context` and `/cost` print their text; Compact now; a summarised result recalled by its ref; the CSV export.
- `extensions.spec.ts` (rewrite): the placeholder is listed, turns off and on, `/placeholder` shows its notice, and `/placeholder ask` shows the question card and the answer.

## 6. Done

- No bundled package, script, manifest or name remains in `src/`, `scripts/` or `tests/`. Leave `resources/pi-extensions/` on disk and tell the owner it can be deleted.
- `npm run typecheck` and `npm run build` pass; the end-to-end files above pass. Report the commands, the counts and the exit codes.
- The docs own their facts: `docs/specs/native-harness-parts.md` (updated to what was built), `docs/harness-build.md`, `docs/harness-hardening.md`, `docs/decisions.md`, `docs/repo-map.md`, `docs/agent-guide.md` (no `vendor:extensions`), `README.md`.
- A report in `.agents/logs/<date>-native-parts.md`: the gap list, what was built, the commands and their results, and what is not verified.
- The owner then runs a real brief with a plan, a background helper, an approval card and `/cost` (lesson L3).
