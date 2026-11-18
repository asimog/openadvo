/**
 * Phase 11 (N5): the workflow runner. It chains the skills in order, evaluates each condition,
 * waits at each gate for the advocate, records every step in the matter and never starts a step
 * the workflow did not name. The tool in the Matter Agent supplies the skill runner and the
 * approval card; the unit test supplies fakes.
 */
import { conditionHolds, missingInputs, renderStepRequest } from "../lib/builders/index.ts";
import type { WorkflowDefinition, WorkflowRun, WorkflowStep, WorkflowStepRun } from "../shared/builders.ts";
import type { ReportCard } from "../shared/skills.ts";

export interface WorkflowRunStore {
  startWorkflowRun(input: { workflowId: string; workflowVersion: string; inputs: Record<string, string>; steps: Array<{ id: string; skill: string }> }): WorkflowRun;
  setWorkflowStep(runId: string, stepId: string, change: Partial<Omit<WorkflowStepRun, "id" | "skill">>): WorkflowRun;
  finishWorkflowRun(runId: string, state: "done" | "failed" | "stopped", notice: string): WorkflowRun;
}

export interface WorkflowRunDeps {
  workflow: WorkflowDefinition;
  inputs: Record<string, string>;
  store: WorkflowRunStore;
  /** Run one skill with its request. It is the Matter Agent's skill runner. */
  runSkill(step: WorkflowStep, request: string, signal?: AbortSignal): Promise<ReportCard>;
  /** The approval card. True when the advocate allows. */
  confirm(title: string, message: string, signal?: AbortSignal): Promise<boolean>;
  signal?: AbortSignal;
}

/** Run a workflow from its first step to its last. It stops where the workflow says to stop. */
export async function executeWorkflow(deps: WorkflowRunDeps): Promise<WorkflowRun> {
  const wf = deps.workflow;
  const inputs = { ...Object.fromEntries(wf.inputs.map((i) => [i.key, i.default])), ...deps.inputs };
  const missing = missingInputs(wf, inputs);
  if (missing.length) throw new Error(`MISSING_INPUTS: ${missing.join(", ")}`);
  const run = deps.store.startWorkflowRun({
    workflowId: wf.id,
    workflowVersion: wf.version,
    inputs,
    steps: wf.steps.map((s) => ({ id: s.id, skill: s.skill })),
  });
  const steps: WorkflowStepRun[] = [];
  const stop = (state: "done" | "failed" | "stopped", notice: string): WorkflowRun => deps.store.finishWorkflowRun(run.id, state, notice);

  for (const step of wf.steps) {
    if (!conditionHolds(step.when, inputs, steps)) {
      const skipped: WorkflowStepRun = { id: step.id, skill: step.skill, state: "skipped", runId: null, report: `The condition ${step.when} is false.`, output: "" };
      steps.push(skipped);
      deps.store.setWorkflowStep(run.id, step.id, skipped);
      continue;
    }
    if (step.gate === "before") {
      const ok = await deps.confirm(`Workflow ${wf.title}: ${step.id}`, `Run ${step.skill}? ${step.request}`.slice(0, 900), deps.signal).catch(() => false);
      if (!ok) {
        deps.store.setWorkflowStep(run.id, step.id, { state: "skipped", report: "The advocate did not allow this step." });
        return stop("stopped", `You stopped the workflow before ${step.id}.`);
      }
    }
    deps.store.setWorkflowStep(run.id, step.id, { state: "running" });
    let card: ReportCard;
    try {
      card = await deps.runSkill(step, renderStepRequest(step.request, inputs, steps), deps.signal);
    } catch (e) {
      const failed: WorkflowStepRun = { id: step.id, skill: step.skill, state: "failed", runId: null, report: (e as Error).message.slice(0, 900), output: "" };
      steps.push(failed);
      deps.store.setWorkflowStep(run.id, step.id, failed);
      if (step.onFailure === "stop") return stop("failed", `${step.id} failed: ${(e as Error).message}`);
      continue;
    }
    const state = card.state === "done" || card.state === "needs_review" ? "done" : "failed";
    const done: WorkflowStepRun = {
      id: step.id,
      skill: step.skill,
      state,
      runId: card.runId,
      report: `${card.state}: ${card.reason}`,
      output: JSON.stringify(card.output ?? null).slice(0, 12000),
    };
    steps.push(done);
    deps.store.setWorkflowStep(run.id, step.id, done);
    if (state === "failed" && step.onFailure === "stop") return stop("failed", `${step.id} failed: ${card.reason}`);
    if (step.gate === "after") {
      const ok = await deps.confirm(`Workflow ${wf.title}: after ${step.id}`, `Continue to the next step? ${card.reason}`.slice(0, 900), deps.signal).catch(() => false);
      if (!ok) return stop("stopped", `You stopped the workflow after ${step.id}.`);
    }
  }
  const failed = steps.some((s) => s.state === "failed");
  return stop(failed ? "failed" : "done", `${steps.filter((s) => s.state === "done").length} of ${steps.length} step(s) done${failed ? `, ${steps.filter((s) => s.state === "failed").length} failed` : ""}.`);
}
