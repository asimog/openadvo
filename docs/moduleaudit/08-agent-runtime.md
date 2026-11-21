# Module report: agent runtime

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the Matter Agent, the Firm Agent, Pi sessions and conversations, the model selection and model roles, the 87 agent tools, skill runs, helpers, side questions, plans, context assembly and compaction, budgets, approvals, traces, extensions, voice input and firm handoffs.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Agent and sessions | `src/main/agent.ts` (`Agent`) | `chat/` Pi session files, `messages.json`, `conversations.json` |
| Context strategy | `src/main/agent-context.ts` | Compacted summaries, result refs |
| Context package | `src/main/context-assembly.ts`, `src/lib/context-package/` | `matter.db` `context_package` |
| Tools | `src/main/agent.ts` (`AGENT_TOOLS`) | Tool definitions |
| Skill runtime | `src/main/skill-runner.ts` | `skill_run` |
| Helpers | `src/main/helpers.ts` | Helper sessions, results |
| Side questions | `src/main/side-questions.ts` | Side threads |
| Plan | `src/main/plan.ts` | `plan.json` |
| Policy | `src/main/tool-policy.ts` | `tool-policy.json`, policy log |
| Firm agent | `src/main/firm-agent.ts` | Firm chat folder, handoffs |
| Extensions | `src/main/pi-extensions.ts` | Pi extensions and question queue |
| Model roles | `src/main/index.ts`, settings | `model`, `drafting`, `extraction`, `critic` |
| Voice | `src/lib/voice/`, `ChatDock.tsx` | Local Whisper, composer text only |
| Trace | `chat/trace.jsonl` | Tool, policy, usage, skill end |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Matter Agent | Implemented | `Agent.open`, `Agent.send` | One session per matter |
| Firm Agent | Implemented | `firm-agent.ts` | Cross-matter, read-only, handoffs |
| Pi session per conversation | Implemented | `conversations.json`, session files | Persistent |
| New, switch and rename conversation | Implemented | `newConversation`, `switchConversation` | Per matter |
| 87 agent tools | Implemented | `AGENT_TOOLS` | Large surface |
| Skill runs | Implemented | `run_skill`, `SkillRunner` | Scoped tools, package, gate |
| Helpers | Implemented | `HelperManager`, `start_helper` | Max 4, timeout, results |
| Side questions | Implemented | `SideQuestions` | Separate thread, no matter write |
| Plan | Implemented | `plan.ts`, `plan_set`, `plan_update` | Approval required |
| Tool policy | Implemented | `policyExtension` | Allow/ask/deny |
| Budget | Implemented | `policy` | Stops the next run |
| Context package | Implemented | `context-assembly` | Retrieval, budget, record |
| Compaction and recall | Implemented | `agent-context`, `recall_result` | Summaries with refs |
| Model selection | Implemented | `resolveModel`, settings | Env, saved, default, Pi |
| Model roles | Implemented | `MODEL_ROLES` | Drafting, extraction, critic |
| Traces and cost | Implemented | `trace.jsonl`, `agent.usage` | Per run and matter |
| Extensions and MCP | Implemented | `pi-extensions` | Pi extensions load |
| Voice input | Implemented | `VoiceButton`, `voice:transcribe` | Text only; no confirmation |
| Firm handoff | Implemented | `FirmHandoff` | Advocate closes |
| Durable queue | Missing | In-process | Restart interrupts |
| Deterministic replay | Missing | Trace only | No replay |
| Global skill concurrency cap | Missing | No limit | Several runs can start |
| Multi-user sessions | Missing | One local advocate | No team |
| Cross-matter matter memory | Missing | Firm read-only | No shared facts |

## 3. Current flow

```text
Advocate message
  → Agent.send
  → budget check
  → session (Pi)
  → system prompt + skill list + plan guidance
  → tool calls through policyExtension
  → tools call host services (matter, documents, evidence, research, filing)
  → tool results stream to chat
  → context meter and trace
  → optional skill run or helper
```

```text
run_skill
  → skill registry
  → refusals (plan, court, pack, budget)
  → context package
  → scoped Pi session with only the skill's tools
  → gate (schema, anchors, claims)
  → report card
```

## 4. Problems

### A-01: One file owns the runtime, the tools and the prompts

**Evidence.** `agent.ts` is 3,270 lines. It contains `Agent`, `AgentHost`, model resolution, Pi session creation, the system prompt, 87 tool definitions, skill wiring, helpers, side questions, plan, policy, context, cost and traces.

**Effect.** A change to one tool can break the session. The file is hard to test in isolation. A new capability adds another block to the same file.

**Target.** Split into `AgentRuntime` (session and model), `ToolRegistry` (tool definitions by capability), `ContextService`, `SkillRuntime`, `HelperService`, `SideQuestionService`, `FirmAgent`, `PlanService`. `agent.ts` becomes a thin composition.

### A-02: The tool surface is too large for one prompt and one permission review

**Evidence.** `AGENT_TOOLS` has 87 entries. The Matter Agent can see all of them. The model must choose among them. The policy review covers all of them.

**Target.** Group tools by capability and expose a subset by task or by skill. The Matter Agent gets read tools and the tools for the current task; a skill gets only its permitted tools. The full tool set is not in every prompt.

### A-03: The context package and the chat context are two systems

**Evidence.** `context-assembly` builds a package for a skill; `agent-context` compacts the chat and keeps result refs. The Matter Agent's own prompt is built separately.

**Effect.** The same matter records can be summarised twice, with different selections. A skill can miss a record the chat has.

**Target.** One `ContextService` resolves a `ContextRequest` for a chat turn and for a skill run. The package records what was included and excluded. The chat uses the same service with a different budget.

### A-04: No durable queue or replay

**Evidence.** Skill runs and helpers run in process. `markInterrupted` marks a running run after a restart. `run_skill` can resume one interrupted run. Helpers cannot. Workflows cannot.

**Effect.** A restart loses background work. There is no way to replay a failed run with the same inputs. Debugging is a trace, not a reproduction.

**Target.** A durable `AgentTask` queue in `matter.db`: skill run, helper, workflow step. Each task has an idempotency key, inputs, state and a resume point. A replay command reruns with the recorded inputs and model.

### A-05: Skill concurrency is not bounded

**Evidence.** The agent can call `run_skill` several times in one message. The helper manager caps at four; skill runs have no global cap. Each run has a 15-minute timeout and retries.

**Effect.** Several skills can saturate the model provider or the CPU. A budget check happens at the start, not per run.

**Target.** A `ModelScheduler` with a global concurrency limit, a per-matter limit, a token budget and a provider rate limit. The queue waits; it does not fail.

### A-06: The Firm Agent is read-only and separate

**Evidence.** `FIRM_TOOLS` has list and read tools plus `propose_matter_instruction`; `FIRM_READ_ONLY` blocks writes. Firm handoffs are proposals.

**Effect.** The firm agent cannot help with cross-matter work beyond reading and proposing. That may be intentional. The boundary is not documented as a product rule.

**Target.** Keep it read-only. Make the contract explicit: the Firm Agent sees matter summaries, hearings, workflows and advocate memory; it never sees a matter's documents or facts. A handoff proposes an instruction to a Matter Agent.

### A-07: The model provider is a trust boundary

**Evidence.** The default model is a remote provider. `isLocalModel` exists. Decision 24 says every matter uses the chosen model and may search the web. There is no confidential enforcement.

**Effect.** Client facts can leave the machine. The UI has a confidential flag that is not enforced. The risk is product policy, not only code.

**Target.** A `ModelPolicy` per matter: local only, approved remote, or no model. The policy is enforced before the prompt is built. If the product keeps decision 24, remove the inert flag and state the rule.

### A-08: Observability is traces, not metrics

**Evidence.** `trace.jsonl` records tool, policy, usage, skill end. `agent.usage` records tokens and cost. There is no correlation id, latency metric, error rate, queue depth or provider health.

**Effect.** The owner can see one conversation, not the system. A slow tool or a failing provider is found by use.

**Target.** A `RunTrace` with correlation id, spans (model, tool, skill, store), duration, tokens and outcome. A small local metrics view. No cloud telemetry.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `AgentSession` | One conversation with model, messages, context and state |
| `AgentTask` | A skill run, helper, workflow step or side question |
| `ToolDefinition` | Name, description, schema, service contract, permission class |
| `ToolCall` | One call with args, result, duration, policy decision |
| `ContextRequest` | Purpose, proceeding, issues, budget, required kinds |
| `ContextPackage` | Included/excluded records, tokens, hash |
| `RunTrace` | Correlation id, spans, usage, errors |
| `ModelPolicy` | Local, approved remote, no model |
| `FirmHandoff` | Proposed instruction to a matter |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `AgentRuntime` | Session, model, message loop | `ContextService`, `ToolRegistry`, `PermissionService` |
| `ToolRegistry` | Tool definitions by capability | Service contracts |
| `ContextService` | Context request, package, compaction | `EvidenceService`, `ResearchService`, `DraftingService` |
| `SkillRuntime` | Skill run | `AgentRuntime`, `ContextService` |
| `HelperService` | Helper task, result | `AgentRuntime` |
| `SideQuestionService` | Side thread | `ContextService` |
| `PlanService` | Plan | `WorkflowService` |
| `FirmAgent` | Firm session, handoff | `MatterService` summaries |
| `ModelScheduler` | Queue, concurrency, rate limit | Provider |

### 5.3 Contracts

```ts
interface AgentRuntime {
  send(matterId: string, text: string): Promise<void>;
  stop(matterId: string): Promise<boolean>;
  session(matterId: string): Promise<AgentSession>;
}

interface ToolRegistry {
  forTask(input: { matterId: string; task: TaskKind; skillId?: string }): Promise<ToolDefinition[]>;
  execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}

interface ContextService {
  resolve(request: ContextRequest): Promise<ContextPackage>;
}

interface ModelScheduler {
  submit(task: AgentTask): Promise<string>;
  cancel(taskId: string): Promise<void>;
  status(): Promise<{ running: number; queued: number; provider: string }>;
}
```

### 5.4 The permission rule

The runtime does not decide permission. It asks `PermissionService` for each tool call. The policy is:

- read-only local tool: allow;
- write, fetch, court, model: ask;
- fixed dangerous tool or credential path: deny;
- policy error: deny;
- a party name in a web call: ask.

The skill scope narrows the tool list. The policy is the final gate.

### 5.5 The context rule

A `ContextRequest` names:

- the purpose: chat, skill, helper, side question, workflow step;
- the matter and proceeding;
- the issues;
- the required context kinds;
- the budget;
- the pinned records.

`ContextService` returns included and excluded records, with reasons and a token count. The same request from a skill and a chat turn yields the same core records, trimmed to the budget. The package is recorded and hashed.

## 6. Boundaries

- `AgentRuntime` owns the session and the model loop. It does not own legal records.
- `ToolRegistry` owns tool definitions. It does not own policy.
- `PermissionService` owns the final decision. It does not own the tool.
- `ContextService` owns selection. It does not own the source records.
- `SkillRuntime` owns one run. It does not own the workflow.
- `FirmAgent` owns cross-matter summaries. It does not read matter documents.
- `ModelScheduler` owns capacity. It does not own the prompt.

## 7. Migration

1. Extract `ToolRegistry` and move tool definitions by capability. Keep `AgentRuntime` as the session.
2. Extract `ContextService` and make chat and skill use it.
3. Add `ModelScheduler` with a queue and a global cap.
4. Add `AgentTask` and durable run records for skills, helpers and workflow steps.
5. Add a correlation id to trace, event and model calls.
6. Add `ModelPolicy` and enforce it, or remove the confidential flag.
7. Keep the Firm Agent read-only and document the boundary.
8. Split `agent.ts` until it is a composition, not a container.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| AR-01 | Two skill runs in one message | The scheduler queues or runs within the cap |
| AR-02 | Restart during a helper | The task resumes or is marked interrupted with a resume |
| AR-03 | Skill context and chat context for the same matter | The same core records are included |
| AR-04 | A tool outside the skill scope | Refused before the model call |
| AR-05 | A policy parse error | Denied |
| AR-06 | A confidential matter with a remote model | Blocked if the policy is enforced |
| AR-07 | A tool call has a correlation id | The trace, event and model call share it |
| AR-08 | Firm Agent asks for a matter document | Refused; only the summary is visible |
| AR-09 | Budget exhausted | The next run is refused with a reason |
| AR-10 | Replay a failed run | Same inputs and model; a new run record |

## 9. Recommendation

**Keep the runtime; split the container.** The Pi session, model resolution, context compaction and report card are good. The file and the tool surface are the problem. Extract tools by capability, unify context, add a scheduler and a durable task, add the correlation id, and make the model policy explicit. Do not build five agent frameworks; one runtime with bounded tasks is enough.

## Appendix: evidence map

- `src/main/agent.ts` — runtime, tools, prompts, sessions, helpers, side, plan, cost.
- `src/main/agent-context.ts` — compaction and result refs.
- `src/main/context-assembly.ts`, `src/lib/context-package/` — context package.
- `src/main/skill-runner.ts` — skill run.
- `src/main/helpers.ts` — helpers.
- `src/main/side-questions.ts` — side questions.
- `src/main/plan.ts` — plan.
- `src/main/firm-agent.ts` — firm agent.
- `src/main/tool-policy.ts` — policy.
- `src/main/pi-extensions.ts` — extensions.
- `src/lib/voice/` — local voice input.
