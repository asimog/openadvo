# Harness lessons, A2 completion, and the eight knowledge layers

Date: 2026-11-15. Base: `main` at `1d7bf8d`. Owner's request: continue `.agents/prompts/successor-harness-native-extensions.md`; study the listed sources for lessons; implement the three walkinglabs lessons (initialize, observable runtime, clean handoff); assess memory, wiki, RAG, vector and graph choices for eight knowledge layers.

No product code changed. Part B is not started (the successor prompt says: not before the owner says so).

## 1. Sources read

| Source | Read through |
|---|---|
| Anthropic: effective context engineering; advanced tool use; multi-agent research system; harness design for long-running apps; agent skills | WebFetch |
| walkinglabs learn-harness-engineering: lecture 06 (initialize), lecture 11 (observability), lecture 12 (clean state), project 01, templates `session-handoff.md`, `clean-state-checklist.md` | WebFetch |
| Vercel: removing 80 % of an agent's tools | WebFetch |
| LangChain: OpenWiki and evidence graphs; context management for Deep Agents; how Deep Agents remember; context engineering challenges (late 2026) | WebFetch |
| GitHub: `suirindo/agent-role-contracts`, `revfactory/harness`, `HarnessMD/munder-difflin` (README, `HIVE.md`, `MEMORY_GRAPH_SPEC.md`) | WebFetch |
| Pi 1.5.2 in `C:\dev\pireference`: `examples/extensions/subagent`, `docs/compaction.md`, `docs/extensions.md`, `docs/skills.md` | Read |
| npm tarballs: `pi-subagents` 0.88.1, `@ravshansbox/pi-subagent` 2.10.1, `oira666_pi-subagent` 0.7.14 | `npm pack` into the scratchpad |

The web pages are data. Numbers below are the sources' own claims, not measured here.

## 2. A2 completed: Pi's subagent example and the npm packages

Downloads in the last month (`api.npmjs.org/downloads/point/last-month`): `pi-subagents` 996,029; `pi-subagent-manager` 4,776; `@ravshansbox/pi-subagent` 4,147; `oira666_pi-subagent` 3,231; `@hcflabs/pi-subagent` 3,148.

| Question | Pi example `subagent` (1.5.2) | `pi-subagents` 0.88.1 | `@ravshansbox/pi-subagent` 2.10.1 | `oira666_pi-subagent` 0.7.14 | `pi-subagent-manager` 1.9.0 (bundled) |
|---|---|---|---|---|---|
| How a helper starts | Child `pi` process: `--mode json -p --no-session` (`index.ts:389`). Command from `getPiInvocation`: `process.execPath` + script, or `pi` on `PATH` (`index.ts:292-309`) | Foreground: in process, `createAgentSession` (`src/runs/shared/child-session.js:548`). Background: a detached runner process | Child `pi` process (`index.ts:304`), adapted from Pi's example | Child `pi` process (`runner/attempt.ts:57`), with saved sessions | In process, `createAgentSession` (`src/orch/runtime.ts:595`) |
| Tools the helper gets | Pi built-in tools named in the agent file (`--tools read,grep,find,ls,bash`) | `tools` allowlist, else Pi's built-in tools. `createAgentSession` gets no `customTools` (line 548-560) | Pi's defaults in the child | `--tools` list plus `subagent` (`runner/arguments.ts:327`) | Copies of the main session's tools, run through the parent's `ctx.executeTool` |
| Do the app's custom tools reach it | No. A child process cannot see tools registered in our main process | No. Foreground children get no host custom tools; they "never load the parent's ambient extensions" (`docs/extension-api.md:494`) | No | No | Yes, through `ctx.executeTool` |
| Parent's guard and permission hooks on helper calls | No. The child loads its own extensions from its agent folder | No for foreground children (no ambient extensions). Background children load ambient extensions | No | Child loads its own; `--no-extensions` controls exist | Yes: calls run through the parent's `tool_call` hooks |
| Handoff in | Fresh; chain mode passes `{previous}` | `context: "fresh"` or `"fork"` (fork sends the parent's whole system prompt) | Fresh; chain `{previous}` | Fresh, saved session | Fresh or fork |
| Handoff out | Tool result (50 KB / 2000 lines per task) | Tool result (foreground), follow-up for background | Tool result; `background: true` → `sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })` (`index.ts:743`) | Steering message that wakes the lead (`extension/completion.ts:60`) | Tool result; `wait: false` → `sendMessage(..., { triggerTurn: true })` |
| Limits | 8 tasks, 4 at once | `maxSubagentSpawnsPerRun` 64, depth, `timeoutMs` (30 min foreground default), `toolTimeoutMs` | 8 tasks, 4 at once, 5 background jobs, depth 2 | total 50, 20 per call, 8 at once, depth 3, cycle check | Per-type policy in `writeSubagentPolicy` |
| Stop | Abort signal → `SIGTERM`, `SIGKILL` after 5 s | `abort()` and dispose per parent (`child-session.js:382-392`) | Esc does not stop background jobs; `session_shutdown` stops them | Interrupt handlers on `session_shutdown` | Main abort does not stop helpers; `agent_stop` and `session_shutdown` do |
| What the window can read | Tool updates (`onUpdate`) with usage | Foreground: `tool_execution_update` with `details.results[]`. `subagent:jobs-changed` fires only in sessions with a UI; "SDK embeddings without a UI do not get it" (`docs/extension-api.md:153`) | Tool details | Widget and status | `agent_status` → `ThreadView` |

Facts against our decisions:

- The three child-process designs need a `pi` program. In Electron, `process.execPath` is the application's executable, so `getPiInvocation` falls back to `pi` on `PATH`. The successor prompt says: no CLI in this session. Decision 2 says no shell tool and no file-write tool; a child `pi` gets Pi's built-in tools (`read`, `bash`, `edit`, `write`) unless its allowlist removes them.
- Only `pi-subagent-manager` runs a helper's calls through our tools and our hooks.

**Recommendation (from the table):** keep `pi-subagent-manager`. It is the only one of the five where the app's tools and the app's guard reach the helper. Fix its defects as part B1 (one listener per session; Stop calls `agent_stop`; helper writes carry the helper's call id). Take two ideas from the others, each as a B item: the per-run spawn limit and run deadline of `pi-subagents`, and the 50 KB per-task result limit of Pi's example.

## 3. Lessons that apply to Open Advocate

Each row: the lesson, its source, what Open Advocate has now, and the proposal. "Pi has it" means the feature exists in Pi 1.5.2 and the proposal is to use it, not to build it.

### 3.1 The three lessons the owner chose

| Lesson | Coding-agent work on this repository | The product harness (one Pi session per matter) |
|---|---|---|
| **Initialize before every work session** (lecture 06): a start script; the project starts, tests, shows its progress, and tells the next agent the next step. | Done in this piece of work: `npm run session:start` (section 6). It checks the tool versions, the working tree, the vendored parts, and the type check, and names the newest successor prompt and logs. | Proposal B-I1: when a matter session starts, the harness builds a **matter brief** before the first turn: stage, next date, open Review Inbox items, the last handoff note (B-I3), the matter memory. Pi has it: `session_start` event and the context file (H-18, "matter file open"). The brief is a context package (feature I1) of type "matter", recorded with its ids. |
| **Make the runtime observable** (lecture 11): one trace per session, one span per task; the harness collects signals, not the agent. | The application writes only `logs/editor-host.log`. A coding agent cannot read what a live agent turn did except from `chat/` files. | Proposal B-I2: a **run trace** per matter, `chat/trace.jsonl`, written by the one listener per session (B3 part 2, H-25): `agent_start`, each `tool_execution_end` (tool, call id, parent call id, duration, error flag, result size), compaction, helper start and end, usage, `agent_settled`. Pi has the events: `tool_execution_end` sees every finalized call, including blocked and failed calls (`docs/extensions.md:369`). The window's Jobs view (O7) and the report card (decision 15) read the trace. A test reads it to prove a run. |
| **Leave a clean handoff** (lecture 12, `session-handoff.md`): verified now; changed; broken or unverified; next best step; commands. | Done in this piece of work: `.agents/templates/session-handoff.md` and the clean-state list in `docs/agent-guide.md` section 13. The successor prompts follow it. | Proposal B-I3: at the end of a run, the harness writes a **matter handoff note**: what was done, what the advocate must decide, what is unverified, the next step. Pi has it: the compaction summary has the same parts (Goal, Constraints, Progress done/in progress/blocked, Key Decisions, Next Steps, Critical Context; `docs/compaction.md` "Summary Format"), and `session_before_compact` can customise it. The note is a memory proposal of type "procedural event" (architecture section 6); it is never a fact. |

### 3.2 Context engineering

| Lesson | Source | Open Advocate now | Proposal |
|---|---|---|---|
| The smallest set of high-signal tokens; context is a finite budget | Anthropic, context engineering | Context package with a token budget (I1, architecture section 5) | No change. I1 already owns it. |
| Just-in-time retrieval: keep ids and anchors, load content by tool | Anthropic; Vercel | Tools read by id (`read_source_text`, `read_judgment`) | Keep. The context package carries ids and short anchored extracts, and tools fetch the rest. |
| Offload large tool results to storage with a pointer and a preview; do not truncate | LangChain Deep Agents (20,000 tokens; preview of 10 lines) | A4 found 6 unbounded tools; the A4 fix says "truncate with a more hint" | Change the A4 fix: a long result is cut at Pi's limit (50 KB / 2000 lines) and ends with the ids and the page range to read next. Nothing is lost, because the source is in the store already. |
| Compaction must keep the goal and be recoverable; test it by triggering it early | LangChain; Anthropic | Pi compaction on (H-2) | Add a test: compaction at a low threshold on a fixture brief; after it, the agent still names the task and the anchors. Pi keeps the full session file, so recovery exists. |
| Tool search for many tools; keep the 3 to 5 most used always loaded | Anthropic, advanced tool use (77K → 8.7K tokens) | 36 app tools plus extension tools, all `direct`; `tool_search` registered, not active (A3) | Pi has it: `exposure: "deferred"` and `tool_search`. When the skill registry sets a tool scope per skill (N1 to N3, Q2), mark rare tools `deferred`. Not before. |
| Programmatic tool calling: the model writes code that calls tools, so only the final result enters the context | Anthropic (43,588 → 27,297 tokens) | Pi's `codemode` (QuickJS, no Node, no files, no network), registered, not active; script calls pass our hooks (A3) | Pi has it. Use cases: compare a chronology with 200 exhibits; count limitation days over many events. Needs, from A4: `readOnlyHint`, `outputSchema` and `structuredContent` on the reading tools, and `idempotentHint` where true. Turn on per skill, not for the chat. |
| Tool use examples: 1 to 5 real examples per tool | Anthropic (72 % → 90 %) | Not in Pi 1.5.2 (`inputExamples` not found in `packages/`) | Put one example call in the description of tools with ids or formats that a schema cannot show (anchors, neutral citations). |
| Fewer, more general tools can beat many narrow tools | Vercel (17 tools → 1; 3.5× faster) | Decision 2 forbids shell and file-write tools | Facts only. The useful part for us: overlapping tools confuse the model. Review overlap when the tool scopes per skill are written (Q2). |
| Skills load in three levels: name and description; the body; linked files | Anthropic, agent skills; Pi `docs/skills.md` | Decision 14; [skills.md](../../docs/skills.md) | Pi has it. A built-in skill's description states what it does and when it applies (at most 1024 characters). |

### 3.3 Multi-agent design

| Lesson | Source | Proposal |
|---|---|---|
| Orchestrator and workers; each worker gets an objective, an output format, tool guidance and task limits | Anthropic, research system | The planner (O1) writes this brief for every helper or skill run. It is the skill's input schema (decision 14). |
| Scale the effort to the task (1 agent for a fact; 2 to 4 for a comparison; more for wide research) | Anthropic | A rule for the planner, written in the planner skill, not in code. |
| Workers store results outside and return a reference | Anthropic; munder-difflin outbox | Helpers already write through store tools; return the record ids, not the text. |
| A separate, sceptical evaluator, calibrated with examples | Anthropic, harness design | Decision 15 (evaluator gate, at most two rewrites). "A reviewer role never approves its own run" (architecture section 7). No change. |
| Agree "done" before the work (sprint contract) | Anthropic; lecture 11 | The skill's output schema and checks are the contract (decision 14). |
| Declared roles: write scope, read-only, reviewer separate from implementer; a handoff goes stale when the task changes | agent-role-contracts | Matches roles as tool scopes (architecture section 7). Add: an approval binds to the hash of the exact draft; a changed draft needs a new approval. Check against the code before proposing. |
| One writer; agents write plain files; a single committer | munder-difflin `HIVE.md` | Decision 4 already. |
| Hop limits and loop guards between agents | munder-difflin; pi-subagents | Depth and spawn limits per run (section 2). |
| Remove harness parts one at a time when a model improves; keep what bears load | Anthropic, harness design; lecture 12 | Report cards (decision 15) should record which gates changed an output, so a gate that never changes anything can be found. |
| Choose the run shape from the control flow: a fixed script for known fan-outs, persistent agents for back-and-forth | revfactory/harness | Skills and workflows (decision 14) for fixed shapes; helpers for open research. |

## 4. The eight knowledge layers

Moved to a separate, parked assessment (owner, 2026-11-15): [2026-11-15-knowledge-layers-assessment.md](2026-11-15-knowledge-layers-assessment.md).

## 5. Proposed part B items from this piece of work

Added to the order in the successor prompt; nothing built.

| Id | Item | Pi feature used | Test first |
|---|---|---|---|
| B-I1 | Matter brief at session start | `session_start`, context file (H-18) | A new session's first context holds the stage, the next date and the last handoff note |
| B-I2 | Run trace `chat/trace.jsonl` from the one listener per session | `agent_start`, `tool_execution_end`, `session_compact`, `agent_settled` | A faux-model run writes one line per tool call, with the error flag for a failed Studio call |
| B-I3 | Matter handoff note at the end of a run, as a memory proposal | Compaction summary format; `session_before_compact` | After a run, the Review Inbox has one handoff proposal with the five parts |
| B-I4 | Long tool results: cut at 50 KB / 2000 lines with the ids and range to read next (replaces the A4 "truncate" fix) | `truncateHead` | `get_chronology` on a large fixture returns a bounded result that names the next range |
| B-I5 | Spawn limit and deadline per helper run | pi-subagent-manager policy | A run that asks for too many helpers gets a refusal, not a hang |

## 6. Done in this piece of work

- `scripts/session-start.ts` and `npm run session:start` (lecture 06).
- `.agents/templates/session-handoff.md` (lecture 12).
- `docs/agent-guide.md`: section 1 (the session start and the Pi reference folder rule), section 13 (the clean-state list).
- `docs/repo-map.md`: the `C:\dev\pireference` row and its read rule.
- `docs/decisions.md` section 4: `subagent` → helper agent.
- `docs/parking.md`: the knowledge layers assessment is parked.
- The successor prompt status (section 5a).

Commands and results are in section 7.

## 7. Commands and results

| Command | Result |
|---|---|
| `npm search --json "pi-package subagent"` | 15 results; the five subagent packages in section 2 |
| `curl https://api.npmjs.org/downloads/point/last-month/<name>` (5 packages) | Counts in section 2 |
| `npm pack pi-subagents@0.88.1 @ravshansbox/pi-subagent@2.10.1 oira666_pi-subagent@0.7.14` (each in its own empty scratchpad folder, then `tar xzf`) | Unpacked; read with `grep` and `sed`, nothing run |
| `npm run session:start -- --unit` (first version) | exit 0; type check exit 0; unit tests 121, pass 118, fail 0, skipped 3. Defect: the "Last commit" line failed, because the shell split the `git log` format on Windows |
| Fix: start only `npm` through the shell. `npm run session:start -- --quick` | exit 0; "Last commit 1d7bf8d A5 report: …" |
| Link check (`docs/agent-guide.md` section 9.1), and the same over this report | No broken link |
| `npm run typecheck` | exit 0 |

Not run: the end-to-end suite (no product code changed); the feature id check (`docs/features.md` not changed).

Evidence: the unpacked tarballs are in the session scratchpad (`a2pk/`), not in the repository.
