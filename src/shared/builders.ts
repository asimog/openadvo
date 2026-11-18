/**
 * Phase 11 (N5): the workflow and agent builder. A workflow chains skills in order, with inputs,
 * conditions and approval gates. An agent is a named composition of skills, instructions, a
 * template, sources, context, tools, output, checks and approvals. Both are versioned and tested.
 */
import type { ApprovalPoint, ContextKind, OutputType } from "./skills.ts";

export const WORKFLOW_GATES = ["none", "before", "after"] as const;
export type WorkflowGate = (typeof WORKFLOW_GATES)[number];

export const WORKFLOW_FAILURES = ["stop", "continue"] as const;
export type WorkflowFailure = (typeof WORKFLOW_FAILURES)[number];

export interface WorkflowInput {
  key: string;
  title: string;
  required: boolean;
  default: string;
}

export interface WorkflowStep {
  id: string;
  skill: string;
  /** The request for the step. `{{input.key}}` and `{{step.<id>.output}}` are replaced. */
  request: string;
  /** `always`, `input:<key>`, `step:<id>:done` or `step:<id>:failed`. */
  when: string;
  gate: WorkflowGate;
  onFailure: WorkflowFailure;
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  inputs: WorkflowInput[];
  steps: WorkflowStep[];
  createdAt: string;
  /** Set on an older version when a newer one is saved. */
  supersededBy: string | null;
}

export const WORKFLOW_RUN_STATES = ["running", "done", "failed", "stopped"] as const;
export type WorkflowRunState = (typeof WORKFLOW_RUN_STATES)[number];

export const WORKFLOW_STEP_STATES = ["pending", "running", "done", "failed", "skipped"] as const;
export type WorkflowStepState = (typeof WORKFLOW_STEP_STATES)[number];

export interface WorkflowStepRun {
  id: string;
  skill: string;
  state: WorkflowStepState;
  /** The skill run's id. */
  runId: string | null;
  /** The run's state and reason, in one line. */
  report: string;
  /** The skill's output, as JSON text, for a later step's `{{step.<id>.output}}`. */
  output: string;
}

export interface WorkflowRun {
  id: string;
  matterId: string;
  workflowId: string;
  workflowVersion: string;
  inputs: Record<string, string>;
  steps: WorkflowStepRun[];
  state: WorkflowRunState;
  notice: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface AgentProfile {
  id: string;
  version: string;
  title: string;
  task: string;
  instructions: string;
  skills: string[];
  template: string | null;
  sources: string[];
  requiredContext: ContextKind[];
  tools: string[];
  output: OutputType;
  checks: string[];
  approvals: ApprovalPoint[];
  createdAt: string;
  supersededBy: string | null;
}

export interface AgentTest {
  agentId: string;
  version: string;
  ok: boolean;
  errors: string[];
  skills: Array<{ id: string; review: string; ok: boolean }>;
  ranAt: string;
}

export interface BuilderCheck<T> {
  value: T | null;
  errors: string[];
}
