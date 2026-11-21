# Module report: workflow, builders and automation

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: saved text workflows, structured workflows, plans, event triggers, named agents, the workflow and agent builders, skill runs, integration manifests, storage import and the automation surfaces around them.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Saved text workflows | `src/lib/workflows/index.ts` | JSON file through `customWorkflows` / `saveWorkflows` |
| Structured workflows | `src/lib/builders/index.ts`, `src/main/workflow-runs.ts` | `advocate.db` `workflow`, `workflow_run` |
| Named agents | `src/shared/builders.ts`, `advocate.db` `agent` | Agent profile |
| Plan | `src/main/plan.ts` | `chat/plan.json`, chat state |
| Triggers | `src/lib/triggers/index.ts`, `advocate.db` `trigger` | Trigger and fire |
| Skill runner | `src/main/skill-runner.ts` | `matter.db` `skill_run` |
| Builders UI | `src/renderer/src/Builders.tsx` | View state |
| Integrations | `src/main/integrations.ts`, `src/shared/integrations.ts` | `advocate.db` `integration` |
| Storage import | `src/lib/storage/` | Provider folders |
| Agent tools | `src/main/agent.ts` | `run_workflow`, `run_agent`, `plan_set`, `plan_update` |

The word "workflow" means four different things in the code. That is the central design problem.

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Six built-in text workflows | Implemented | `BUILT_IN` | Analyse judgment, chronology, record table, research, grounds, pre-filing |
| Custom text workflows | Implemented | `workflows:save`, JSON file | Plain instruction |
| Structured workflow definition | Implemented | `WorkflowDefinition` | Inputs, steps, conditions, gates, failure |
| Workflow validation | Implemented | `checkWorkflow` | Skill exists, request, conditions |
| Workflow runner | Implemented | `executeWorkflow` | Sequential, gate before/after |
| Workflow run record | Implemented | `matter.db workflow_run` | Per matter |
| Named agent profile | Implemented | `AgentProfile`, `checkAgent` | Skills, tools, context, output |
| Run a named agent | Implemented | `run_agent` | Maps profile to a workflow |
| Plan | Implemented | `plan.ts`, `plan_set`, `plan_update` | Chat approval |
| Plan item add | Implemented | `add to the plan:` | No model |
| Triggers | Implemented | `trigger`, `trigger_fire` | 10 events, proposals only |
| Trigger start | Implemented | `decideTriggerFire` | Human-only |
| Trigger dedupe | Partial | No uniqueness | Repeated events create fires |
| Integration manifests | Implemented | `IntegrationManifest` | Declared, not executed |
| Integration lifecycle | Partial | install/enable/disable in `advocate.db` | No executor |
| Storage import | Implemented | `detectStorageFolders`, `storage:import-matter` | Synced folders only |
| One workflow model | Missing | Two models | Text vs structured |
| One workflow store | Missing | JSON + advocate.db + matter.db + plan.json | Four stores |
| Durable run queue | Missing | In-process | Restart interrupts |
| Scheduler | Missing | No path | Runs only on request |
| Workflow resume | Partial | Skill resume exists | No workflow resume |
| Per-proceeding workflow | Missing | Matter-level | No proceeding |
| Workflow version pin | Implemented | `workflowVersion` in run | Good |
| Skill concurrency cap | Missing | No global limit | Several runs can start |

## 3. Current flow

### Text workflow

```text
Advocate chooses a workflow
  → the body is sent as a chat message
  → the Matter Agent reads it
  → the agent calls tools or skills
  → no workflow run record
```

### Structured workflow

```text
WorkflowDefinition
  → executeWorkflow
  → for each step: condition → gate → SkillRunner.run
  → ReportCard
  → workflow_step + workflow_run
```

### Plan

```text
plan_set
  → plan.json + ChatState
  → advocate approves
  → agent carries it out
```

### Trigger

```text
event (document, order, hearing, stage, deadline, email, instruction, amendment, citation, defect)
  → fireTriggers
  → trigger_fire (proposed)
  → advocate starts or dismisses
```

## 4. Problems

### W-01: Four coordination models, one word

**Evidence.** `Workflow` is a text body. `WorkflowDefinition` is a skill chain. `Plan` is a chat checklist. `Trigger` is an event response. A named agent is a fifth composition that becomes a `WorkflowDefinition` at runtime.

**Effect.** The advocate cannot tell what a "workflow" will do. The agent has `run_workflow` for one model and plain chat for another. The audit has different records for the same intent.

**Target.** One executable `Workflow`. A `SavedInstruction` is a prompt shortcut, not a workflow. A `Plan` is a view of a workflow run or a lightweight checklist. A `Trigger` proposes a workflow or a skill. A named agent is a workflow template.

### W-02: Four stores

**Evidence.** Text workflows in a JSON file; structured definitions in `advocate.db`; runs in `matter.db`; plans in `plan.json`; triggers in `advocate.db`.

**Effect.** A backup or export can miss one. A version is not comparable across models. The UI reads three sources.

**Target.** Definitions in `advocate.db` (with built-ins in checked data), runs in `matter.db`, plans as a run view. No executable workflow in a loose JSON file.

### W-03: The trigger is a proposal system with no dedupe

**Evidence.** `fireTriggers` inserts one fire per matching trigger on every event. There is no key, no day bucket and no check for an existing open fire.

**Effect.** Re-reading a document or reopening a matter can create duplicate proposals. The inbox fills with repeats.

**Target.** An idempotency key from trigger id, matter id, event, subject and a time bucket or content hash. A duplicate returns the existing fire.

### W-04: Integration manifests are declared but not executed

**Evidence.** `IntegrationManifest` declares capabilities, permissions, inputs, outputs, events, lifecycle, audit and failure. `Integrations.sync` reads the manifest and stores it. No executor, connector or event bus exists.

**Effect.** The integrations page promises a contract the application does not run. The manifest is documentation, not a working integration.

**Target.** Either call it a `ConnectorManifest` with a known connector implementation, or remove the execution claim. An integration has a manifest and a connector adapter registered by the application; the manifest declares the connector id. No arbitrary code from a manifest.

### W-05: The builder and the runtime do not share one scope model

**Evidence.** `checkAgent` checks the chosen tools against the chosen skills and rejects human-only tools. The skill runner checks the pack, court and (not) proceeding. The agent tools use the tool policy. Three scope systems.

**Target.** One `Scope` object on a skill and a workflow step: proceeding type, forum kind, stage, practice area, required service contracts. The builder checks it; the runner enforces it; the tool policy is separate and final.

### W-06: No scheduler or durable queue

**Evidence.** `executeWorkflow` runs in the request. `SkillRunner` runs in process. A restart marks a run interrupted; only a skill run can resume. `workflow_run` has no resume.

**Effect.** A long workflow dies with the process. A user must restart it by hand. Two workflows can compete for the model.

**Target.** A `WorkflowQueue` with one run per matter, bounded global concurrency, resumable steps, and a `workflow_run` state machine. The queue is local and in-process at first, but durable in `matter.db`.

### W-07: The plan is disconnected

**Evidence.** The plan is a chat file; the workflow runner does not read it. A plan item is not a workflow step. `run_workflow` does not update the plan.

**Effect.** The plan can say one thing and the run another.

**Target.** A plan is a `WorkflowRun` with `kind = "plan"` or a view over the workflow's steps. A step completion updates the plan. One source.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `SavedInstruction` | A named prompt shortcut. No steps, no run. |
| `Workflow` | Versioned inputs, steps, conditions, gates, failure policy |
| `WorkflowStep` | Skill id, request template, when, gate, onFailure, required context |
| `WorkflowRun` | One run, its inputs, steps, state and report |
| `WorkflowStepRun` | One step, its skill run, output and state |
| `Plan` | A view of a workflow run or a lightweight checklist |
| `Trigger` | Event, target (workflow or skill), conditions, enabled |
| `TriggerFire` | A proposed action, with an idempotency key |
| `ConnectorManifest` | A declared integration backed by an application connector |
| `Connector` | The code adapter that performs the integration |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `WorkflowService` | Definitions, runs, plans, triggers | `advocate.db`, `matter.db`, `SkillRuntime` |
| `SkillRuntime` | One skill run | `AgentRuntime`, `ContextService`, `PermissionService` |
| `ConnectorService` | Connector manifests and implementations | `advocate.db`, connectors |
| `ScheduleService` | Due triggers, reminders, deadlines | `WorkflowService`, `MatterService` |

### 5.3 Contracts

```ts
interface WorkflowService {
  save(input: WorkflowDefinition): Promise<WorkflowDefinition>;
  remove(id: string): Promise<void>;
  run(matterId: string, id: string, inputs: Record<string, string>): Promise<WorkflowRun>;
  stop(runId: string): Promise<WorkflowRun>;
  resume(runId: string): Promise<WorkflowRun>;
  plan(matterId: string): Promise<Plan>;
  fire(input: TriggerEvent): Promise<TriggerFire[]>;
  decideFire(fireId: string, decision: "started" | "dismissed"): Promise<TriggerFire>;
}
```

### 5.4 The state machine

```text
WorkflowRun: running → done | failed | stopped
StepRun: pending → running → done | failed | skipped
TriggerFire: proposed → started | dismissed
```

A step cannot run before its condition is true. A gate before the step waits for the advocate. A gate after the step waits before the next. A failure policy is `stop` or `continue`.

### 5.5 The integration rule

An integration is one of:

- a **connector** the application implements (mail, storage, calendar, court portal);
- a **manifest** that names the connector and its permissions;
- a **user-visible setting** that enables it.

A manifest never carries executable code. A connector never reads a matter without a scope. A connector failure is isolated and reported. No integration ships enabled by default.

## 6. Boundaries

- `WorkflowService` owns coordination. It does not own legal rules, documents or filing.
- `SkillRuntime` owns one skill run. It does not own the workflow.
- `ConnectorService` owns external IO. It does not own matter facts.
- `ScheduleService` owns time. It does not own a legal deadline; it asks `ProcedureService`.
- `PermissionService` owns the final tool decision. The workflow cannot loosen it.
- The agent may propose a workflow; the advocate starts it.

## 7. Migration

1. Rename the text model to `SavedInstruction` in code and UI. Keep the JSON file for one release.
2. Make `WorkflowDefinition` the only executable model. Add `kind: "workflow" | "plan"` or a separate plan table.
3. Move workflow definitions to `advocate.db`; keep built-ins in `data/`.
4. Add a `workflow_run` resume path and a queue.
5. Add the trigger idempotency key.
6. Add `ConnectorManifest` and a connector registry. Hide integrations that have no connector.
7. Add per-proceeding scope when the proceeding model lands.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| WF-01 | Run a workflow twice with the same idempotency key | One run |
| WF-02 | Stop a run | Final state stopped; no later step |
| WF-03 | Restart during a run | The run resumes at the next pending step |
| WF-04 | Gate before a step, advocate refuses | Step skipped; run stopped |
| WF-05 | Failure policy continue | Next step runs; run ends failed |
| WF-06 | Trigger fires twice for the same event | One open fire |
| WF-07 | A manifest names a missing connector | Refused; no enable |
| WF-08 | A connector attempts a write outside its scope | Refused; audit event |
| WF-09 | A text instruction | No workflow run; it is a saved instruction |
| WF-10 | A plan is viewed as a run | Same steps and state |

## 9. Recommendation

**Consolidate.** Keep the structured workflow runner; it is the right model. Rename the text workflows. Make plans a view. Add a queue and idempotency. Turn integrations into connector manifests with real connectors, or remove the execution claim. One model, one store, one audit.

## Appendix: evidence map

- `src/lib/workflows/index.ts` — text workflows.
- `src/shared/builders.ts` — workflow, agent, run types.
- `src/lib/builders/index.ts` — validation, rendering, conditions.
- `src/main/workflow-runs.ts` — runner.
- `src/main/plan.ts` — plan.
- `src/lib/triggers/index.ts` — triggers.
- `src/lib/advocate-store/index.ts` — workflow, agent, trigger tables.
- `src/main/integrations.ts` — manifest registry.
- `src/shared/integrations.ts` — manifest contract.
- `src/renderer/src/Builders.tsx` — builder UI.
