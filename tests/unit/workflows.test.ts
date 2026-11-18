/**
 * Phase 11 (N5): the workflow builder and its runner. A workflow chains skills with inputs,
 * conditions and gates; an edit is a new version. The runner is tested with fakes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bumpVersion, checkWorkflow, conditionHolds, missingInputs, renderStepRequest } from "../../src/lib/builders/index.ts";
import { executeWorkflow } from "../../src/main/workflow-runs.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRun } from "../../src/shared/builders.ts";
import type { ReportCard } from "../../src/shared/skills.ts";

const skills = new Map([
  ["SK-001", { id: "SK-001", title: "Intake" }],
  ["SK-009", { id: "SK-009", title: "Chronology" }],
  ["SK-027", { id: "SK-027", title: "Citation review" }],
]);

const raw = {
  title: "Bail file",
  description: "Read the record, make the chronology and review the citations.",
  inputs: [{ key: "court", title: "Court", required: true, default: "Delhi High Court" }],
  steps: [
    { id: "intake", skill: "SK-001", request: "Read the record for {{input.court}}.", when: "always", gate: "none", onFailure: "stop" },
    { id: "chronology", skill: "SK-009", request: "Make the chronology from {{step.intake.output}}.", when: "step:intake:done", gate: "after", onFailure: "stop" },
    { id: "review", skill: "SK-027", request: "Review the citations.", when: "input:court", gate: "before", onFailure: "continue" },
  ],
};

test("N5: the workflow checks its id, version, steps, skills, conditions and gates", () => {
  const ok = checkWorkflow({ ...raw, id: "wf-bail", version: "1.0.0" }, skills);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value?.steps.length, 3);
  assert.equal(ok.value?.steps[1].gate, "after");
  const bad = checkWorkflow({ ...raw, id: "bail", version: "1", steps: [{ id: "a", skill: "SK-999", request: "", when: "input:nope", gate: "sometimes", onFailure: "later" }] }, skills);
  assert.ok(bad.errors.some((e) => /id must start with wf-/.test(e)));
  assert.ok(bad.errors.some((e) => /no skill SK-999/.test(e)));
  assert.ok(bad.errors.some((e) => /unknown input nope/.test(e)));
  assert.ok(bad.errors.some((e) => /gate must be/.test(e)));
  assert.ok(bad.errors.some((e) => /onFailure must be/.test(e)));
  assert.ok(bad.errors.some((e) => /request is required/.test(e)));
  assert.equal(bad.value, null);
});

test("N5: a condition is evaluated from the inputs and the earlier steps; a missing input is named", () => {
  const wf = checkWorkflow({ ...raw, id: "wf-bail", version: "1.0.0" }, skills).value!;
  assert.deepEqual(missingInputs({ ...wf, inputs: [{ key: "court", title: "Court", required: true, default: "" }] }, {}), ["court"]);
  assert.deepEqual(missingInputs({ ...wf, inputs: [{ key: "court", title: "Court", required: false, default: "" }] }, {}), []);
  const steps: WorkflowStepRun[] = [{ id: "intake", skill: "SK-001", state: "done", runId: "r1", report: "", output: "the output" }];
  assert.equal(conditionHolds("always", {}, steps), true);
  assert.equal(conditionHolds("input:court", { court: "Delhi" }, steps), true);
  assert.equal(conditionHolds("input:court", {}, steps), false);
  assert.equal(conditionHolds("step:intake:done", {}, steps), true);
  assert.equal(conditionHolds("step:intake:failed", {}, steps), false);
  assert.equal(conditionHolds("step:missing:done", {}, steps), false);
  assert.equal(renderStepRequest("From {{input.court}} and {{step.intake.output}}.", { court: "Delhi" }, steps), "From Delhi and the output.");
  assert.equal(bumpVersion("1.0.0"), "1.1.0");
  assert.equal(bumpVersion("2.3.4"), "2.4.0");
});

function card(runId: string, state: ReportCard["state"] = "done", output: unknown = { ok: true }): ReportCard {
  return {
    runId, skillId: "SK-001", skillVersion: "1.0.0", skillTitle: "Intake", state, reason: state, request: "", attempts: 1, rewrites: 0, checks: [], toolsUsed: [], tokens: { input: 0, output: 0, total: 0 }, cost: 0, durationMs: 1, packageId: null, packageTokens: 0, notRead: [], output, reviewItemId: null, startedAt: "", endedAt: null,
  };
}

function fakeStore() {
  let run: WorkflowRun | null = null;
  return {
    get run() {
      return run;
    },
    startWorkflowRun(input: { workflowId: string; workflowVersion: string; inputs: Record<string, string>; steps: Array<{ id: string; skill: string }> }): WorkflowRun {
      run = { id: "run-1", matterId: "m", workflowId: input.workflowId, workflowVersion: input.workflowVersion, inputs: input.inputs, steps: input.steps.map((s) => ({ ...s, state: "pending", runId: null, report: "", output: "" })), state: "running", notice: "", startedAt: "", finishedAt: null };
      return run;
    },
    setWorkflowStep(_id: string, stepId: string, change: Partial<WorkflowStepRun>): WorkflowRun {
      run = { ...run!, steps: run!.steps.map((s) => (s.id === stepId ? { ...s, ...change } : s)) };
      return run;
    },
    finishWorkflowRun(_id: string, state: "done" | "failed" | "stopped", notice: string): WorkflowRun {
      run = { ...run!, state, notice, finishedAt: "now" };
      return run;
    },
  };
}

test("N5: the runner chains the steps, evaluates the conditions and stops at a gate", async () => {
  const wf = checkWorkflow({ ...raw, id: "wf-bail", version: "1.0.0" }, skills).value!;
  const store = fakeStore();
  const ran: string[] = [];
  const gates: string[] = [];
  const result = await executeWorkflow({
    workflow: wf,
    inputs: { court: "Delhi High Court" },
    store,
    runSkill: async (step) => {
      ran.push(step.id);
      return card(`r-${step.id}`);
    },
    confirm: async (title) => {
      gates.push(title);
      return true;
    },
  });
  assert.deepEqual(ran, ["intake", "chronology", "review"]);
  assert.equal(gates.length, 2);
  assert.equal(result.state, "done");
  assert.deepEqual(result.steps.map((s) => s.state), ["done", "done", "done"]);
});

test("N5: a false condition skips the step; a refused gate stops the run; a failure obeys onFailure", async () => {
  const wf = checkWorkflow({ ...raw, id: "wf-bail", version: "1.0.0" }, skills).value!;
  const skipFlow = {
    ...wf,
    steps: [
      { id: "one", skill: "SK-001", request: "go", when: "always", gate: "none" as const, onFailure: "stop" as const },
      { id: "two", skill: "SK-009", request: "go", when: "step:one:failed", gate: "none" as const, onFailure: "stop" as const },
      { id: "three", skill: "SK-027", request: "go", when: "always", gate: "before" as const, onFailure: "stop" as const },
    ],
  };
  const skipped = await executeWorkflow({
    workflow: skipFlow,
    inputs: {},
    store: fakeStore(),
    runSkill: async () => card("r", "done"),
    confirm: async () => false,
  });
  assert.equal(skipped.state, "stopped");
  assert.equal(skipped.steps.find((s) => s.id === "two")!.state, "skipped");
  const failed = await executeWorkflow({
    workflow: { ...wf, steps: [{ id: "one", skill: "SK-001", request: "go", when: "always", gate: "none", onFailure: "continue" }, { id: "two", skill: "SK-009", request: "go", when: "always", gate: "none", onFailure: "stop" }] },
    inputs: {},
    store: fakeStore(),
    runSkill: async (step) => card(`r-${step.id}`, step.id === "one" ? "failed" : "done"),
    confirm: async () => true,
  });
  assert.equal(failed.state, "failed");
  assert.equal(failed.steps.find((s) => s.id === "one")!.state, "failed");
  assert.equal(failed.steps.find((s) => s.id === "two")!.state, "done");
});

test("N5: a missing input refuses the run before any step starts", async () => {
  const wf = checkWorkflow({ ...raw, id: "wf-bail", version: "1.0.0" }, skills).value!;
  const required = { ...wf, inputs: [{ key: "court", title: "Court", required: true, default: "" }] };
  await assert.rejects(() => executeWorkflow({ workflow: required, inputs: {}, store: fakeStore(), runSkill: async () => card("r"), confirm: async () => true }), /MISSING_INPUTS: court/);
});

test("N5: the store keeps every version; an edit supersedes the old row", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-workflow-"));
  const store = AdvocateStore.open(dir);
  try {
    const one = store.saveWorkflow({ ...raw, id: "wf-bail" }, [...skills.keys()], { actor: "advocate" });
    assert.equal(one.version, "1.0.0");
    const two = store.saveWorkflow({ ...one, title: "Bail file v2" }, [...skills.keys()], { actor: "advocate" });
    assert.equal(two.version, "1.1.0");
    assert.equal(store.workflows().length, 1);
    assert.equal(store.workflowHistory("wf-bail").length, 2);
    assert.equal(store.workflowHistory("wf-bail")[0].supersededBy, "1.1.0");
    assert.throws(() => store.saveWorkflow({ ...raw, id: "wf-bad", version: "1.0.0", steps: [] }, [...skills.keys()], { actor: "agent" }), /human|HUMAN/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
