/**
 * Phase 11 (N5): the workflow and agent checks and their execution rules. Plain library
 * (decision 6): it reads the registry, checks a definition, renders a step and evaluates a
 * condition. It runs nothing itself.
 */
import {
  AVAILABLE_CHECKS,
  APPROVAL_POINTS,
  CONTEXT_KINDS,
  OUTPUT_TYPES,
  type ApprovalPoint,
  type ContextKind,
  type OutputType,
  type SkillDefinition,
} from "../../shared/skills.ts";
import {
  WORKFLOW_FAILURES,
  WORKFLOW_GATES,
  type AgentProfile,
  type AgentTest,
  type BuilderCheck,
  type WorkflowDefinition,
  type WorkflowInput,
  type WorkflowStep,
  type WorkflowStepRun,
} from "../../shared/builders.ts";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const INPUT_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const STEP_ID = /^[a-z][a-z0-9-]{0,40}$/;

/** 1.0.0 becomes 1.1.0: an edit is a new version, kept beside the old one. */
export function bumpVersion(version: string): string {
  const parts = version.split(".").map((x) => Number.parseInt(x, 10) || 0);
  return `${parts[0] || 1}.${(parts[1] || 0) + 1}.0`;
}

/** Check a workflow against the skill ids that exist. */
export function checkWorkflow(raw: unknown, skills: ReadonlyMap<string, { id: string; title: string }>): BuilderCheck<WorkflowDefinition> {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  if (!/^wf-[a-z0-9-]+$/.test(id)) errors.push(`id must start with wf- and hold lower case letters, digits and hyphens, not "${id}"`);
  const version = str(o.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version must be n.n.n, not "${version}"`);
  const title = str(o.title);
  if (!title) errors.push("title is required");
  const description = str(o.description);
  if (!description) errors.push("description is required");

  const inputs: WorkflowInput[] = [];
  const inputKeys = new Set<string>();
  for (const rawInput of (Array.isArray(o.inputs) ? o.inputs : []) as Array<Record<string, unknown>>) {
    const key = str(rawInput.key);
    if (!INPUT_KEY.test(key)) errors.push(`input key must be lower case letters, digits and _: "${key}"`);
    if (inputKeys.has(key)) errors.push(`input ${key} is listed twice`);
    inputKeys.add(key);
    const inputTitle = str(rawInput.title) || key;
    inputs.push({ key, title: inputTitle, required: rawInput.required === true, default: str(rawInput.default) });
  }

  const steps: WorkflowStep[] = [];
  const stepIds = new Set<string>();
  for (const rawStep of (Array.isArray(o.steps) ? o.steps : []) as Array<Record<string, unknown>>) {
    const stepId = str(rawStep.id);
    if (!STEP_ID.test(stepId)) errors.push(`step id must be lower case letters, digits and hyphens: "${stepId}"`);
    if (stepIds.has(stepId)) errors.push(`step ${stepId} is listed twice`);
    const skill = str(rawStep.skill).toUpperCase();
    if (!skills.has(skill)) errors.push(`step ${stepId}: there is no skill ${skill || "(none)"}`);
    const request = str(rawStep.request);
    if (!request) errors.push(`step ${stepId}: request is required`);
    for (const m of request.matchAll(/\{\{\s*(input|step)[:.]([a-z0-9_-]+)(?:\.output)?\s*\}\}/g)) {
      if (m[1] === "input" && !inputKeys.has(m[2])) errors.push(`step ${stepId}: the request names an unknown input ${m[2]}`);
      if (m[1] === "step" && !stepIds.has(m[2])) errors.push(`step ${stepId}: the request names a step that is not earlier: ${m[2]}`);
    }
    const when = str(rawStep.when) || "always";
    if (when !== "always") {
      const im = /^input:([a-z][a-z0-9_]*)$/.exec(when);
      const sm = /^step:([a-z][a-z0-9-]*):(done|failed)$/.exec(when);
      if (im && !inputKeys.has(im[1])) errors.push(`step ${stepId}: the condition names an unknown input ${im[1]}`);
      else if (sm && !stepIds.has(sm[1])) errors.push(`step ${stepId}: the condition names a step that is not earlier: ${sm[1]}`);
      else if (!im && !sm) errors.push(`step ${stepId}: when must be always, input:<key>, step:<id>:done or step:<id>:failed, not "${when}"`);
    }
    const gate = str(rawStep.gate) || "none";
    if (!(WORKFLOW_GATES as readonly string[]).includes(gate)) errors.push(`step ${stepId}: gate must be ${WORKFLOW_GATES.join(", ")}`);
    const onFailure = str(rawStep.onFailure) || "stop";
    if (!(WORKFLOW_FAILURES as readonly string[]).includes(onFailure)) errors.push(`step ${stepId}: onFailure must be ${WORKFLOW_FAILURES.join(", ")}`);
    stepIds.add(stepId);
    steps.push({ id: stepId, skill, request, when, gate: gate as WorkflowStep["gate"], onFailure: onFailure as WorkflowStep["onFailure"] });
  }
  if (steps.length === 0) errors.push("a workflow needs at least one step");
  if (errors.length) return { value: null, errors };
  return { errors, value: { id, version, title, description, inputs, steps, createdAt: "", supersededBy: null } };
}

/** The step's request, with the inputs and the earlier steps' outputs put in. */
export function renderStepRequest(request: string, inputs: Record<string, string>, steps: readonly WorkflowStepRun[]): string {
  return request.replace(/\{\{\s*(input|step)[:.]([a-z0-9_-]+)(?:\.output)?\s*\}\}/g, (_m, kind: string, key: string) => {
    if (kind === "input") return inputs[key] ?? "";
    const step = steps.find((s) => s.id === key);
    return step?.output ?? "";
  });
}

/** A step's condition. A condition on a step that did not run is false. */
export function conditionHolds(when: string, inputs: Record<string, string>, steps: readonly WorkflowStepRun[]): boolean {
  if (!when || when === "always") return true;
  const im = /^input:([a-z][a-z0-9_]*)$/.exec(when);
  if (im) return (inputs[im[1]] ?? "").trim().length > 0;
  const sm = /^step:([a-z][a-z0-9-]*):(done|failed)$/.exec(when);
  if (sm) return steps.find((s) => s.id === sm[1])?.state === sm[2];
  return false;
}

/** The inputs a run still needs. */
export function missingInputs(workflow: WorkflowDefinition, inputs: Record<string, string>): string[] {
  return workflow.inputs.filter((i) => i.required && !(inputs[i.key] ?? i.default).trim()).map((i) => i.key);
}

/** Check an agent against the registry and the drafting catalogue. */
export function checkAgent(
  raw: unknown,
  deps: { skills: ReadonlyMap<string, SkillDefinition>; draftKinds: readonly string[]; humanOnly: RegExp; never: readonly string[] },
): BuilderCheck<AgentProfile> {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  if (!/^agent-[a-z0-9-]+$/.test(id)) errors.push(`id must start with agent- and hold lower case letters, digits and hyphens, not "${id}"`);
  const version = str(o.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version must be n.n.n, not "${version}"`);
  const title = str(o.title);
  if (!title) errors.push("title is required");
  const task = str(o.task);
  if (!task) errors.push("task is required: the work the agent does");
  const instructions = str(o.instructions);
  if (!instructions) errors.push("instructions are required");

  const skillIds = strs(o.skills).map((s) => s.toUpperCase());
  if (skillIds.length === 0) errors.push("an agent needs at least one skill");
  const chosen: SkillDefinition[] = [];
  for (const sid of skillIds) {
    const skill = deps.skills.get(sid);
    if (!skill) errors.push(`there is no skill ${sid}`);
    else chosen.push(skill);
  }
  const template = o.template == null || str(o.template) === "" ? null : str(o.template);
  if (template && !deps.draftKinds.includes(template)) errors.push(`template must be one of the document kinds, not "${template}"`);
  const output = str(o.output) as OutputType;
  if (!(OUTPUT_TYPES as readonly string[]).includes(output)) errors.push(`output must be one of ${OUTPUT_TYPES.join(", ")}`);
  const context = strs(o.requiredContext) as ContextKind[];
  const badContext = context.filter((c) => !(CONTEXT_KINDS as readonly string[]).includes(c));
  if (badContext.length) errors.push(`unknown required context: ${badContext.join(", ")}`);
  const checks = strs(o.checks);
  const badChecks = checks.filter((c) => !(AVAILABLE_CHECKS as readonly string[]).includes(c));
  if (badChecks.length) errors.push(`unknown checks: ${badChecks.join(", ")}; the gate has ${AVAILABLE_CHECKS.join(", ")}`);
  const approvals = strs(o.approvals) as ApprovalPoint[];
  const badApprovals = approvals.filter((a) => !(APPROVAL_POINTS as readonly string[]).includes(a));
  if (badApprovals.length) errors.push(`unknown approval points: ${badApprovals.join(", ")}`);

  const tools = strs(o.tools);
  const allowed = new Set(chosen.flatMap((s) => s.permittedTools));
  const outside = tools.filter((t) => !allowed.has(t));
  if (outside.length) errors.push(`tools outside the chosen skills: ${outside.join(", ")}`);
  const human = tools.filter((t) => deps.humanOnly.test(t));
  if (human.length) errors.push(`human-only actions are never agent tools (decision 5): ${human.join(", ")}`);
  const never = tools.filter((t) => deps.never.includes(t));
  if (never.length) errors.push(`no agent may have these tools: ${never.join(", ")}`);

  if (errors.length) return { value: null, errors };
  return {
    errors,
    value: {
      id,
      version,
      title,
      task,
      instructions,
      skills: skillIds,
      template,
      sources: strs(o.sources),
      requiredContext: context,
      tools,
      output,
      checks,
      approvals,
      createdAt: "",
      supersededBy: null,
    },
  };
}

/** Test an agent: the checks, and each skill's review and gate state. It writes nothing. */
export function testAgent(agent: AgentProfile, deps: { skills: ReadonlyMap<string, SkillDefinition>; draftKinds: readonly string[]; humanOnly: RegExp; never: readonly string[] }): AgentTest {
  const check = checkAgent(agent, deps);
  const skills = agent.skills.map((sid) => {
    const skill = deps.skills.get(sid);
    return { id: sid, review: skill?.review ?? "missing", ok: !!skill && !skill.review.startsWith("not reviewed") && !skill.review.startsWith("review needed") };
  });
  return {
    agentId: agent.id,
    version: agent.version,
    ok: check.errors.length === 0 && skills.every((s) => s.ok),
    errors: [...check.errors, ...skills.filter((s) => !s.ok).map((s) => `skill ${s.id}: ${s.review}`)],
    skills,
    ranAt: new Date().toISOString(),
  };
}
