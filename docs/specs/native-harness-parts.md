# Spec: the bundled extensions as native parts

Status: started 2026-11-15 (owner's instruction: "make the extensions we have added already native and keep their usable parts … they become first class parts … remove any overlapping redundancies … keep a harmless minimal extension as a placeholder to test the extension system"). It replaces part B3 and H-42 of the successor prompt. The agent kinds are in [agent-framework.md](agent-framework.md).

## 1. What changes

The seven npm packages bundled under decision 21 leave the application. Their usable parts become parts of Open Advocate's own code, under its decisions, its window and its tests. What another part already does is dropped. The extension system stays: the advocate can still add Pi extensions (H-9, H-10), and one small placeholder extension ships to test it.

| Package | Kept as a native part | Dropped (the native part that already does it) |
|---|---|---|
| @gotgenes/pi-permission-system 42.0.0 | **Tool policy** (section 2): allow, ask or deny per tool; Pi's built-in tools and shell always denied; credential paths always denied; "ask" becomes an approval card; a review log | Its config file, slash command, bash parser, subagent forwarding socket, project trust layers (no shell tool exists; helpers run in process) |
| pi-subagent-manager 1.9.0 | **Helpers** (section 3): the four helper types, run in process, with the parent's tools and checks, limits and Stop | Its thread tree with mailboxes and retained threads, terminal widgets, model picking, agent import, `wait: false` turns that start the parent by themselves (the cause of H-33) |
| pi-checklist 3.3.0 | **Plan** (section 4): the agent's task list for long work, shown as a plan card in the chat; at most 10 items; statuses planned, ongoing, done, cancelled | Its terminal widget, footer, display settings, 3-character hash ids |
| pi-context-usage 2.1.0 | **Context meter** (section 5): tokens used of the window, in the chat header | Its dot grid and terminal screens |
| pi-cache-graph 1.2.1 | **Cache numbers** in the context meter and the run trace: cache reads and writes per run | Its graph, export and terminal screens |
| pi-context-prune 2.2.0 | Its "prune now" becomes **Compact now** (section 5), Pi's own compaction | Summaries of old tool results: the native tool-result clearing of agent-framework section 7 does this job |
| pi-context-decisions 4.0.0 | Nothing | Skill and tool choice by a second model: the skill registry and tool scopes (N1 to N3, Q2, H-5) own this job; it was inert |

## 2. Tool policy

- **File.** `<userData>/tool-policy.json`: `{ "default": "allow", "tools": { "<tool>": "allow" | "ask" | "deny" } }`. Written with defaults on first start. The advocate edits it in Settings → Tool permissions.
- **Always denied**, whatever the file says: Pi's built-in tools (decision 2) and any call whose arguments name a credential path (`auth.json`, `.env`, `.ssh/`, `manifest-signing.key`, `models.json`).
- **Ask.** The run waits on an approval card in the chat: "The agent wants to use <tool label>." with Allow once, Allow for this conversation, Refuse. Stop or a new conversation refuses. A helper's call is checked the same way, because it runs through the parent's tools.
- **Where.** One hook, the application's guard extension `openadvo-policy` (`tool_call`), in every session of every kind.
- **Review log.** `<userData>/logs/tool-policy.jsonl`: every deny and every ask with its answer. No arguments are written.

## 3. Helpers

- **Tools** of the Firm and Matter Agents: `start_helper` (`type`, `task`), and nothing else. The call runs the helper to its end and returns its result. To run helpers in parallel, the agent makes several `start_helper` calls in one message; Pi runs the calls of one message in parallel. So a helper never starts a turn by itself.
- **Session.** In process, `createAgentSession` with an in-memory session, the type's prompt, the chat's model, no extensions. Its tools are the parent's tools named in the type's allowlist; each call runs through the parent's `ctx.executeTool`, so the policy hook and the nested call id `<start_helper call id>/<n>` apply (actor ids, agent-framework section 5).
- **Spawn rights.** Only `legal-research` has `start_helper`, and only for `record-reader`. Enforced in code: the tool checks the caller's type and the depth (at most 2 below the agent).
- **Limits.** At most 4 helpers run at once per conversation; a fifth call fails at once. Each helper has at most 30 turns and 15 minutes. The result is cut at 8,000 characters.
- **Stop.** The abort signal of the `start_helper` call aborts the helper. Stop of the parent's run therefore stops every helper.
- **Window.** `start_helper` reports progress through tool updates: the type, the task and each tool the helper uses. The trace records the helper's tool calls with their parent call id. Usage is recorded with the parent's run.

## 4. Plan

- **Tools:** `plan_set` (a title and up to 10 items) and `plan_update` (an item number and a status). The Matter Agent and the Firm Agent have them. The prompt asks for a plan before long work (feature O1 builds on this).
- **State:** in the conversation's state and in `plan.json` in its chat folder; a CUSTOM event `PLAN_EVENT` tells the window.
- **Window:** a plan card above the chat log: each item with its status, and the count done. "Clear plan" is a human-only bridge function.

## 5. Context meter and Compact now

- After each run, the chat state carries `context`: tokens used, the context window, the percentage, and the run's cache reads and writes (from Pi's `getContextUsage()` and the assistant messages' usage). A CUSTOM event `CONTEXT_EVENT` tells the window.
- The chat header shows "Context 31k of 200k (16 %)"; its tooltip shows the cache numbers.
- "Compact now" in the chat header calls Pi's `session.compact()` with the kind's summary form (agent-framework section 7.1). It is off while the agent works.
- The run trace's `run_end` line adds `cacheRead` and `cacheWrite`.

## 6. The placeholder extension

`extensions/placeholder/` in the repository: a Pi package with one entry file. It registers one command, `/placeholder`, and nothing the model can call, so it adds nothing to any context. `/placeholder` shows a notice; `/placeholder ask` asks one yes-or-no question through the extension interface and shows the answer. It is the only bundled extension. It tests loading, commands, notices, questions and turning a bundled extension off.

## 7. Checks

| Check | Test |
|---|---|
| Policy: default allow; a deny rule refuses; an ask waits and each answer works; built-in tools and credential paths are refused whatever the file says; the review log has no arguments | `tests/unit/tool-policy.test.ts` |
| Helpers: a helper runs with its type's tools only; its calls pass the policy and carry the nested call id; two in one message run at once; the fifth over the limit fails; only `legal-research` starts `record-reader`; Stop aborts a helper | `tests/unit/helpers.test.ts` |
| Plan: set, update, limits, persistence, clear | `tests/unit/plan.test.ts` |
| Context meter numbers after a run; Compact now | `tests/unit/agent-runs.test.ts` |
| The placeholder loads; `/placeholder` and `/placeholder ask` work in the window; it turns off and on | `tests/unit/pi-extensions.test.ts`, `tests/e2e/extensions.spec.ts` |
| No bundled package is left: no `pi-subagent-manager`, `pi-checklist` or other package name in the code or `resources/` | `tests/unit/pi-extensions.test.ts` |

Done (lesson L3): the owner runs a real brief with a plan, a helper and an approval card, and reads the meter.
