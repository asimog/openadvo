# Spec: the agent framework

Status: started 2026-11-15 (owner's instruction). Features: O3, O6, O7, O10, and harness-hardening H-25. Evidence and sources: [../../.agents/logs/2026-11-15-harness-lessons-and-knowledge-layers.md](../../.agents/logs/2026-11-15-harness-lessons-and-knowledge-layers.md) and the part B report named in section 9.

This spec owns the kinds of agent, what each may read, write and start, how a run is observed, and how each kind keeps its context small. It does not own skills ([../skills.md](../skills.md)) or the stores ([../architecture.md](../architecture.md) section 3).

## 1. Principles

1. **Use Pi's parts.** Sessions, events, compaction, the `context` hook, codemode and tool search are Pi's. Helpers are Pi sessions the application starts in process ([native-harness-parts.md](native-harness-parts.md) section 3). The application adds policy and the window, not a second agent runtime.
2. **Few agent kinds, each with a fixed scope.** An agent kind is a tool scope, a prompt, a spawn right and a context strategy. It is not an authority: only the advocate approves (decision 5).
3. **The smallest set of high-signal tokens.** Each kind gets a hybrid context: a short package up front (stable records, by id), and tools to read more on demand. Legal work changes slowly, so the up-front part is larger than for coding work.
4. **Every run is observable.** One listener per session records every run, including runs that the agent starts by itself.
5. **Delegate only when it pays.** A helper costs many times the tokens of a direct answer. The Matter Agent works directly by default and delegates wide reading or independent research.

## 2. The agent kinds

| Kind | How many | Session | Reads | Writes (always as proposals or candidates) | May start |
|---|---|---|---|---|---|
| **Firm Agent** | One per advocate (a solo practitioner is a firm) | One Pi session in user data, not in a matter | Every matter's summary (stage, next date, open Review Inbox items, last handoff note); the Knowledge Library (templates, memos, workflows, playbooks the advocate uploads); advocate memory; the calendar | Advocate-memory proposals; instructions handed to a Matter Agent (shown to the advocate first) | Helpers of the firm types (section 4). It never reads one matter's facts into another matter's work (architecture section 6). |
| **Matter Agent** | One per matter | The matter's chat session (current code) | That matter's records, drafts and research; public law; the matter memory | Candidates, tracked changes and memory proposals in that matter | Helpers of the matter types (section 4) |
| **Helper** | Started by a Matter Agent | An in-memory Pi session, in process, for one `start_helper` call | What its type allows, through the parent's tools | What its type allows, through the parent's tools, recorded with its own actor id (section 5) | Only the `legal-research` type, and only `record-reader` helpers |
| **Skill run** (planned, N2) | One per skill run | A session the harness starts | The skill's declared context | The skill's output schema | Nothing. It is not a helper. |

"Godmode" means the Firm Agent sees the whole firm. It does not mean more rights: it proposes, and the advocate decides.

Status: all three are built. The Firm Agent is built as section 2.1 says.

### 2.1 The Firm Agent as built

- **Session.** The same `Agent` class, under the conversation id `FIRM_AGENT_ID` (`firm:agent`; a colon cannot be in a matter folder's name). Its folder is `<userData>/firm-agent/`: the Pi session, `messages.json`, `trace.jsonl`, `handoffs.json` and `usage.jsonl`. No matter store records its usage, and no matter budget applies to it.
- **Tools** (`src/main/firm-agent.ts`), all read-only except the last: `list_matters` (the docket: stage, next step, next hearing, limitation, open items, reminders), `matter_overview` (one matter's open items by kind and title, hearings, reminders; no item text), `list_hearings`, `list_workflows`, `read_workflow`, and `propose_matter_instruction`. A wrong id is an error. It has no matter tool and no built-in tool; the start check requires the six.
- **Handoff.** `propose_matter_instruction` stores the instruction in the Firm Agent's conversation only. On Home, the advocate presses "Open in the matter" (the instruction goes into that matter's composer, unsent) or "Dismiss". Both are the human-only bridge function `closeFirmHandoff` (decision 5).
- **Window.** The Firm Agent panel on Home, below the new-matter composer: its conversation, Stop, a new conversation, the handoff cards and extension questions. It says what it cannot read and what is not available yet.
- **Not available to it yet:** the Knowledge Library and advocate memory (`advocate.db`, feature Q4). Its prompt tells it to say so.

## 3. What a helper is

A helper is a Pi session that a Matter Agent starts with `start_helper` ([native-harness-parts.md](native-harness-parts.md) section 3). The Firm Agent starts no helper yet: no helper type reads firm data. Facts that define it:

- It runs in the main process. Its tool calls run through the parent's tools and the parent's `tool_call` hooks (the tool policy).
- It starts with a fresh context and a task brief: the objective, the output wanted, the records to start from, and the limits (lesson from the multi-agent research system).
- It returns a short result (about 1,000 to 2,000 tokens) with record ids, never the full text it read.
- It never talks to the advocate. A question goes back to its parent.
- It never approves anything.

Not helpers: a skill run (section 2), a codemode script (a program that calls tools, turned on per skill later), and a side question (HB-1).

## 4. Helper types

The type table is `src/main/helper-types.ts`.

| Type | Job | Tools | May spawn |
|---|---|---|---|
| `legal-research` | Find and assess law for one question: judgments, statutes, the citation index, the web for discovery | Reading and research tools; `save_judgment`, `save_provision`, `add_authority`, `assess_authority`, `record_treatment` (candidates); `start_helper` | `record-reader` |
| `record-reader` | Read a set of pages or judgments and return facts or passages with page and line anchors | Reading tools only | No |
| `critic` | Test a draft, an argument or a research note against the record and the law; report defects with anchors | Reading tools, `check_draft`, `quick_check_citations`, `check_citations` | No |
| `drafter` | Propose new text for named paragraphs | Reading tools, `propose_correction`, `propose_paragraph` | No |

The limits (`HELPER_LIMITS`): 4 helpers at once per conversation, 30 turns, 15 minutes, a result of at most 8,000 characters. A call past the limit fails at once. Spawn rights are enforced in code: `start_helper` offers each caller only the types it may start, and only `legal-research` has it.

Role names of feature O2 (intake, chronology, drafting and the others) are skills, not helper types.

## 5. Runs and observation

- **One listener per session** (H-25). It is attached when the session opens and lives as long as the session. A run starts on Pi's `agent_start` and ends on `agent_settled` (Pi `docs/extensions.md`: `agent_end` is not final). So a turn that a helper's result starts (`sendMessage` with `triggerTurn`) is shown, saved, counted and marks the chat busy, like a turn the advocate starts.
- **Stop** aborts the Matter Agent's run. Helpers run inside the run's `start_helper` calls, so the abort stops them too. The notice says how many helpers were stopped.
- **Actor ids.** A tool call that another tool made (a helper's call or a codemode script's call) has the id `<parent call id>/<n>` (Pi `nested-tool-calls.ts`). Writes record the session id followed by `/<parent call id>`, so the record tells the Matter Agent's own writes from a helper's.
- **Run trace.** The listener appends one JSON line per event to `chat/trace.jsonl` in the matter folder: run start and end, each finished tool call (tool, call id, parent call id, duration in ms, error flag, result size in characters), compaction, and usage. The Jobs view (O7) and tests read it. It holds no tool arguments or results, so it holds no client text.

## 6. Tools

Pi's `docs/extensions.md` is the standard, as the A4 assessment applied it:

- String choices use `StringEnum`.
- Reading tools carry `annotations.readOnlyHint`; tools that write a draft or a record run with `executionMode: "sequential"`.
- A failed call throws, so Pi reports it to the model and to the window as an error. The Studio tools no longer return "Refused or failed" as a success.
- A long result is cut at Pi's limits (`truncateHead`: 2,000 lines or 50 KB) and ends with a line that says how to read the rest. The source is in the store, so nothing is lost.
- Stop ends a tool call at once: the call returns "Stopped by the advocate" when the abort signal fires. Work already sent to a store finishes there.

## 7. Context strategy per kind

Pi's compaction is on for every kind. What differs is when it starts, what the summary keeps, and whether old tool results are cleared first. Clearing is the lightest form of compaction: the session file keeps every result, and only the request sees the placeholder (Pi's `context` hook).

| Kind | Up front | Tool-result clearing | Compaction | Why |
|---|---|---|---|---|
| Firm Agent | Firm summary: matters by id with stage, next date and open items | Clear all but the last 3 results when the context passes 30 % of the window | `keepRecentTokens` 12,000. Summary: open items per matter id, the advocate's instructions, decisions, next steps | Firm lists go stale fast and are cheap to fetch again |
| Matter Agent | The matter's title and the system prompt; the matter memory on demand | Clear all but the last 6 results, and only results over 2,000 characters, when the context passes 50 % of the window. `read_matter_memory` is never cleared | `keepRecentTokens` 30,000. Summary in the matter form (section 7.1) | Legal work needs exact anchors and the advocate's words; recall comes before brevity |
| Helper | The task brief only | None (helpers load no extension) | Pi's default | A helper's work is short; its result is capped |
| Skill run (planned) | The context package (I1) | Per skill | Per skill | Owned by the skill |

### 7.1 The matter summary form

The Matter Agent's compaction summary uses Pi's custom-compaction hook (`session_before_compact`, as in Pi's `examples/extensions/custom-compaction.ts`) with these parts, in this order:

1. The task, in the advocate's own words.
2. The advocate's instructions and decisions, quoted, with dates.
3. Records touched, by id and anchor (sources, pages and lines; events; drafts and paragraph anchors; authorities; issues).
4. Proposals waiting for the advocate.
5. Open questions and what is not verified.
6. Next steps.

A summary never states a fact that is not in the records it names (architecture section 5). If the summary call fails, Pi's default compaction runs.

## 8. Checks

| Check | Test |
|---|---|
| A turn started by a helper result is a run: RUN_STARTED and RUN_FINISHED, the answer saved, usage recorded | `tests/unit/agent-runs.test.ts` |
| Stop stops the running helpers and says how many | same |
| A nested write carries `<session id>/<parent call id>` | same |
| The trace has one line per tool call with the error flag | same |
| A failed Studio call is an error to the model and the window | `tests/unit/studio-tools.test.ts` |
| A long result is cut with a hint; reading tools are read-only; writers are sequential | `tests/unit/agent-runs.test.ts` |
| The helper types and limits are written; the coding types have no tools | `tests/unit/pi-extensions.test.ts` |
| The matter compaction keeps the six parts; clearing keeps the recent results | `tests/unit/agent-context.test.ts` |
| The Firm Agent: firm tools only, its context strategy, the firm summary without documents, a wrong id is an error, handoffs stored and closed, workflows readable | `tests/unit/firm-agent.test.ts` |
| The Firm Agent on Home: its tools, a handoff card, "Open in the matter" puts the instruction in the composer unsent | `tests/e2e/firm.spec.ts` |

Done (lesson L3): the owner runs a real brief in which the Matter Agent starts a `legal-research` helper, the helper's result arrives as its own run, and Stop ends both.

## 9. Not in this piece of work

- Helper threads in the Jobs view with Steer and Stop (O7, B3 adapter).
- Skill runs (N2) and the planner (O1).
- Codemode and tool search turned on per skill.
