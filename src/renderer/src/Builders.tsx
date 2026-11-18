/**
 * Phase 11 (N5): the workflow and agent builder. A visual editor for a workflow's inputs, steps,
 * conditions and gates, and for a named agent's skills, tools, context, output, checks and
 * approvals. The renderer holds no business logic: every save, test and run is a bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { AgentProfile, AgentTest, CatalogueEntry, MatterSummary, SkillSummary, WorkflowDefinition, WorkflowRun, WorkflowStep } from "../../shared/api.ts";
import type { TriggerDefinition, TriggerFire } from "../../shared/triggers.ts";
import { TRIGGER_EVENTS, TRIGGER_RESPONSES } from "../../shared/triggers.ts";
import { APPROVAL_POINTS, AVAILABLE_CHECKS, CONTEXT_KINDS, OUTPUT_TYPES } from "../../shared/skills.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function blankWorkflow(): Partial<WorkflowDefinition> {
  return {
    title: "",
    description: "",
    inputs: [],
    steps: [{ id: "step-1", skill: "", request: "", when: "always", gate: "none", onFailure: "stop" }],
  };
}

function blankAgent(): Partial<AgentProfile> {
  return { title: "", task: "", instructions: "", skills: [], template: null, sources: [], requiredContext: [], tools: [], output: "draft", checks: ["schema", "anchors"], approvals: [] };
}

function WorkflowEditor(props: { workflow: Partial<WorkflowDefinition>; skills: SkillSummary[]; onSaved: (w: WorkflowDefinition) => void; onCancel: () => void }) {
  const [wf, setWf] = useState<Partial<WorkflowDefinition>>({ ...props.workflow, inputs: [...(props.workflow.inputs ?? [])], steps: (props.workflow.steps ?? []).map((s) => ({ ...s })) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = props.skills.filter((s) => !s.error && !s.shadowed);
  const setStep = (i: number, change: Partial<WorkflowStep>) => setWf({ ...wf, steps: (wf.steps ?? []).map((s, k) => (k === i ? { ...s, ...change } : s)) });
  const move = (i: number, by: number) => {
    const steps = [...(wf.steps ?? [])];
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setWf({ ...wf, steps });
  };
  const save = async () => {
    try {
      setError(null);
      setSaving(true);
      props.onSaved(await api.saveBuiltWorkflow(wf));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const conditions = [
    { value: "always", label: "Always" },
    ...(wf.inputs ?? []).map((i) => ({ value: `input:${i.key}`, label: `Input ${i.key} is present` })),
    ...(wf.steps ?? []).flatMap((s, i) => (i < (wf.steps ?? []).length - 1 ? [{ value: `step:${s.id}:done`, label: `Step ${s.id} is done` }, { value: `step:${s.id}:failed`, label: `Step ${s.id} failed` }] : [])),
  ];
  return (
    <div className="library-editor" data-testid="workflow-editor">
      <div className="field-grid">
        <label className="field">Title<input value={wf.title ?? ""} onChange={(e) => setWf({ ...wf, title: e.target.value })} /></label>
        <label className="field">Description<input value={wf.description ?? ""} onChange={(e) => setWf({ ...wf, description: e.target.value })} /></label>
      </div>
      <Heading level={4}>Inputs</Heading>
      {(wf.inputs ?? []).map((input, i) => (
        <div key={`${input.key}:${i}`} className="phase4-form">
          <input aria-label={`Input ${i + 1} key`} placeholder="key" value={input.key} onChange={(e) => setWf({ ...wf, inputs: (wf.inputs ?? []).map((x, k) => (k === i ? { ...x, key: e.target.value } : x)) })} />
          <input aria-label={`Input ${i + 1} title`} placeholder="Title" value={input.title} onChange={(e) => setWf({ ...wf, inputs: (wf.inputs ?? []).map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
          <label className="field inline"><input type="checkbox" checked={input.required} onChange={(e) => setWf({ ...wf, inputs: (wf.inputs ?? []).map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)) })} /> Required</label>
          <input aria-label={`Input ${i + 1} default`} placeholder="Default" value={input.default} onChange={(e) => setWf({ ...wf, inputs: (wf.inputs ?? []).map((x, k) => (k === i ? { ...x, default: e.target.value } : x)) })} />
          <Button label="Remove" size="sm" variant="ghost" onClick={() => setWf({ ...wf, inputs: (wf.inputs ?? []).filter((_, k) => k !== i) })} />
        </div>
      ))}
      <div className="row-actions">
        <Button label="Add an input" size="sm" variant="ghost" onClick={() => setWf({ ...wf, inputs: [...(wf.inputs ?? []), { key: "", title: "", required: false, default: "" }] })} data-testid="workflow-add-input" />
      </div>
      <Heading level={4}>Steps</Heading>
      <Text type="supporting">Each step runs one skill. Put an input in a request as {"{{input.key}}"}, and an earlier step's output as {"{{step.id.output}}"}.</Text>
      {(wf.steps ?? []).map((step, i) => (
        <div key={`${step.id}:${i}`} className="phase4-form" data-testid="workflow-step">
          <input aria-label={`Step ${i + 1} id`} placeholder="step-id" value={step.id} onChange={(e) => setStep(i, { id: e.target.value })} />
          <select aria-label={`Step ${i + 1} skill`} value={step.skill} onChange={(e) => setStep(i, { skill: e.target.value })}>
            <option value="">Choose a skill</option>
            {active.map((s) => <option key={`${s.id}:${s.version}`} value={s.id}>{s.id} {s.title}</option>)}
          </select>
          <input aria-label={`Step ${i + 1} request`} placeholder="The request to the skill" value={step.request} onChange={(e) => setStep(i, { request: e.target.value })} />
          <select aria-label={`Step ${i + 1} condition`} value={step.when} onChange={(e) => setStep(i, { when: e.target.value })}>{conditions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          <select aria-label={`Step ${i + 1} gate`} value={step.gate} onChange={(e) => setStep(i, { gate: e.target.value as WorkflowStep["gate"] })}>
            <option value="none">No gate</option>
            <option value="before">Wait before this step</option>
            <option value="after">Wait after this step</option>
          </select>
          <select aria-label={`Step ${i + 1} on failure`} value={step.onFailure} onChange={(e) => setStep(i, { onFailure: e.target.value as WorkflowStep["onFailure"] })}>
            <option value="stop">Stop on failure</option>
            <option value="continue">Continue on failure</option>
          </select>
          <div className="row-actions">
            <Button label="Up" size="sm" variant="ghost" onClick={() => move(i, -1)} />
            <Button label="Down" size="sm" variant="ghost" onClick={() => move(i, 1)} />
            <Button label="Remove" size="sm" variant="ghost" onClick={() => setWf({ ...wf, steps: (wf.steps ?? []).filter((_, k) => k !== i) })} />
          </div>
        </div>
      ))}
      <div className="row-actions">
        <Button label="Add a step" size="sm" variant="ghost" onClick={() => setWf({ ...wf, steps: [...(wf.steps ?? []), { id: `step-${(wf.steps ?? []).length + 1}`, skill: "", request: "", when: "always", gate: "none", onFailure: "stop" }] })} data-testid="workflow-add-step" />
      </div>
      {error ? <div className="notice" role="alert" data-testid="workflow-error">{error}</div> : null}
      <div className="row-actions">
        <Button label="Save the workflow" size="sm" isDisabled={saving} clickAction={save} data-testid="workflow-save" />
        <Button label="Cancel" size="sm" variant="ghost" onClick={props.onCancel} />
      </div>
    </div>
  );
}

function AgentEditor(props: { agent: Partial<AgentProfile>; skills: SkillSummary[]; templates: CatalogueEntry[]; onSaved: (a: AgentProfile) => void; onCancel: () => void }) {
  const [agent, setAgent] = useState<Partial<AgentProfile>>({ ...props.agent, skills: [...(props.agent.skills ?? [])], tools: [...(props.agent.tools ?? [])], sources: [...(props.agent.sources ?? [])], requiredContext: [...(props.agent.requiredContext ?? [])], checks: [...(props.agent.checks ?? [])], approvals: [...(props.agent.approvals ?? [])] });
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<AgentTest | null>(null);
  const [busy, setBusy] = useState(false);
  const active = props.skills.filter((s) => !s.error && !s.shadowed);
  const chosen = active.filter((s) => (agent.skills ?? []).includes(s.id));
  const allowedTools = [...new Set(chosen.flatMap((s) => s.permittedTools))].sort();
  const toggle = <K extends "skills" | "tools" | "requiredContext" | "checks" | "approvals">(field: K, value: string) => {
    const list = (agent[field] ?? []) as string[];
    setAgent({ ...agent, [field]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };
  const testIt = async () => {
    try {
      setError(null);
      setBusy(true);
      setTest(await api.testAgentProfile(agent));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try {
      setError(null);
      setBusy(true);
      props.onSaved(await api.saveAgent(agent));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="library-editor" data-testid="agent-editor">
      <div className="field-grid">
        <label className="field">Title<input value={agent.title ?? ""} onChange={(e) => setAgent({ ...agent, title: e.target.value })} /></label>
        <label className="field">Task<input value={agent.task ?? ""} onChange={(e) => setAgent({ ...agent, task: e.target.value })} /></label>
        <label className="field">Template
          <select value={agent.template ?? ""} onChange={(e) => setAgent({ ...agent, template: e.target.value || null })}>
            <option value="">No template</option>
            {props.templates.map((t) => <option key={t.kind} value={t.kind}>{t.title}</option>)}
          </select>
        </label>
        <label className="field">Output
          <select value={agent.output ?? "draft"} onChange={(e) => setAgent({ ...agent, output: e.target.value as AgentProfile["output"] })}>{OUTPUT_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </label>
      </div>
      <label className="field">Instructions<textarea rows={4} value={agent.instructions ?? ""} onChange={(e) => setAgent({ ...agent, instructions: e.target.value })} /></label>
      <label className="field">Sources<input value={(agent.sources ?? []).join(", ")} onChange={(e) => setAgent({ ...agent, sources: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="For example: the FIR, the custody record" /></label>
      <Heading level={4}>Skills</Heading>
      <div className="row-actions">
        {active.map((s) => (
          <label key={`${s.id}:${s.version}`} className="field inline">
            <input type="checkbox" checked={(agent.skills ?? []).includes(s.id)} onChange={() => toggle("skills", s.id)} /> {s.id} {s.title}
          </label>
        ))}
      </div>
      <Heading level={4}>Tools</Heading>
      <Text type="supporting">Only the tools of the chosen skills are allowed.</Text>
      <div className="row-actions">
        {allowedTools.map((t) => (
          <label key={t} className="field inline"><input type="checkbox" checked={(agent.tools ?? []).includes(t)} onChange={() => toggle("tools", t)} /> {t}</label>
        ))}
        {allowedTools.length === 0 ? <Text type="supporting">Choose a skill first.</Text> : null}
      </div>
      <Heading level={4}>Required context</Heading>
      <div className="row-actions">
        {CONTEXT_KINDS.map((c) => <label key={c} className="field inline"><input type="checkbox" checked={(agent.requiredContext ?? []).includes(c)} onChange={() => toggle("requiredContext", c)} /> {c}</label>)}
      </div>
      <Heading level={4}>Checks and approvals</Heading>
      <div className="row-actions">
        {AVAILABLE_CHECKS.map((c) => <label key={c} className="field inline"><input type="checkbox" checked={(agent.checks ?? []).includes(c)} onChange={() => toggle("checks", c)} /> {c}</label>)}
        {APPROVAL_POINTS.map((a) => <label key={a} className="field inline"><input type="checkbox" checked={(agent.approvals ?? []).includes(a)} onChange={() => toggle("approvals", a)} /> {a.replace(/_/g, " ")}</label>)}
      </div>
      {error ? <div className="notice" role="alert" data-testid="agent-error">{error}</div> : null}
      {test ? (
        <div className="notice" data-testid="agent-test" data-ok={test.ok}>
          <Badge variant={test.ok ? "success" : "error"} label={test.ok ? "Test passed" : "Test failed"} />
          <Text>{test.errors.length ? test.errors.join(" ") : "Every chosen skill is reviewed and inside its role."}</Text>
        </div>
      ) : null}
      <div className="row-actions">
        <Button label="Test the agent" size="sm" variant="ghost" isDisabled={busy} clickAction={testIt} data-testid="agent-test-button" />
        <Button label="Save the agent" size="sm" isDisabled={busy} clickAction={save} data-testid="agent-save" />
        <Button label="Cancel" size="sm" variant="ghost" onClick={props.onCancel} />
      </div>
    </div>
  );
}

export function BuildersPanel(props: { onChanged?: () => void }) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [templates, setTemplates] = useState<CatalogueEntry[]>([]);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [matterId, setMatterId] = useState("");
  const [editWorkflow, setEditWorkflow] = useState<Partial<WorkflowDefinition> | null>(null);
  const [editAgent, setEditAgent] = useState<Partial<AgentProfile> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [w, a, s, t, m] = await Promise.all([api.listBuiltWorkflows(), api.listAgents(), api.listSkills(false), api.draftCatalogue(), api.listMatters()]);
      setWorkflows(w);
      setAgents(a);
      setSkills(s.skills);
      setTemplates(t);
      setMatters(m);
      if (!matterId && m[0]) setMatterId(m[0].id);
    } catch (e) {
      setError(errorText(e));
    }
  }, [matterId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!matterId) {
      setRuns([]);
      return;
    }
    void api.listWorkflowRuns(matterId).then(setRuns, () => setRuns([]));
  }, [matterId, workflows.length]);

  const run = async (id: string) => {
    try {
      setError(null);
      setNote(null);
      if (!matterId) throw new Error("Choose a matter first.");
      await api.runWorkflow(matterId, id, {});
      setNote("Sent to the matter's chat. The agent runs the steps and stops at each gate.");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const removeWorkflow = async (id: string) => {
    try {
      setWorkflows(await api.deleteBuiltWorkflow(id));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const removeAgent = async (id: string) => {
    try {
      setAgents(await api.deleteAgent(id));
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div data-testid="builders">
      <Heading level={3}>Workflows</Heading>
      <Text type="supporting">A workflow chains skills in order. Each step names one skill, its request, a condition and a gate. An edit makes a new version; the old one stays.</Text>
      <div className="row-actions">
        <Button label="New workflow" size="sm" onClick={() => setEditWorkflow(blankWorkflow())} data-testid="workflow-new" />
        <select aria-label="The matter to run a workflow in" value={matterId} onChange={(e) => setMatterId(e.target.value)}>
          <option value="">Choose a matter</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {note ? <div className="notice" role="status">{note}</div> : null}
      {editWorkflow ? <WorkflowEditor workflow={editWorkflow} skills={skills} onSaved={(w) => { setEditWorkflow(null); setWorkflows([...workflows.filter((x) => x.id !== w.id), w].sort((a, b) => a.title.localeCompare(b.title))); }} onCancel={() => setEditWorkflow(null)} /> : null}
      {workflows.length === 0 ? <Text type="supporting">No workflow yet. Build one from the skills above.</Text> : (
        <ul className="plain-list" data-testid="workflow-list">
          {workflows.map((w) => (
            <li key={`${w.id}:${w.version}`} className="phase4-row" data-testid="workflow-row">
              <div className="phase4-main">
                <div className="phase4-head"><StatusDot variant="success" label={`v${w.version}`} /><Text weight="semibold">{w.title}</Text></div>
                <Text type="supporting">{w.steps.length} step{w.steps.length === 1 ? "" : "s"}: {w.steps.map((s) => `${s.id} → ${s.skill}`).join(", ")}. {w.description}</Text>
              </div>
              <div className="row-actions">
                <Button label="Run" size="sm" isDisabled={!matterId} clickAction={() => run(w.id)} data-testid={`workflow-run-${w.id}`} />
                <Button label="Edit" size="sm" variant="ghost" onClick={() => setEditWorkflow(w)} />
                <Button label="Remove" size="sm" variant="ghost" onClick={() => removeWorkflow(w.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Runs</Heading>
      {runs.length === 0 ? <Text type="supporting">No workflow run in this matter yet.</Text> : (
        <ul className="plain-list" data-testid="workflow-runs">
          {runs.slice(0, 5).map((r) => (
            <li key={r.id} className="phase4-row">
              <div className="phase4-main">
                <div className="phase4-head"><Badge variant={r.state === "done" ? "success" : r.state === "failed" ? "error" : "warning"} label={r.state} /><Text weight="semibold">{r.workflowId}</Text></div>
                <Text type="supporting">{r.steps.map((s) => `${s.id}: ${s.state}`).join(", ")}. {r.notice}</Text>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Heading level={3}>Agents</Heading>
      <Text type="supporting">A named agent: a task, its instructions, the skills it may use, a template, its sources, required context, tools, output, checks and approvals. It is versioned and tested before it is used.</Text>
      <div className="row-actions">
        <Button label="New agent" size="sm" onClick={() => setEditAgent(blankAgent())} data-testid="agent-new" />
      </div>
      {editAgent ? <AgentEditor agent={editAgent} skills={skills} templates={templates} onSaved={(a) => { setEditAgent(null); setAgents([...agents.filter((x) => x.id !== a.id), a].sort((x, y) => x.title.localeCompare(y.title))); }} onCancel={() => setEditAgent(null)} /> : null}
      {agents.length === 0 ? <Text type="supporting">No agent yet.</Text> : (
        <ul className="plain-list" data-testid="agent-list">
          {agents.map((a) => (
            <li key={`${a.id}:${a.version}`} className="phase4-row" data-testid="agent-row">
              <div className="phase4-main">
                <div className="phase4-head"><StatusDot variant="success" label={`v${a.version}`} /><Text weight="semibold">{a.title}</Text></div>
                <Text type="supporting">{a.task}. Skills: {a.skills.join(", ")}. Output {a.output}; checks {a.checks.join(", ") || "none"}. {a.template ? `Template ${a.template}.` : ""}</Text>
              </div>
              <div className="row-actions">
                <Button label="Edit" size="sm" variant="ghost" onClick={() => setEditAgent(a)} />
                <Button label="Remove" size="sm" variant="ghost" onClick={() => removeAgent(a.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TriggerRow(props: { trigger: TriggerDefinition; onSaved: () => void }) {
  const [skills, setSkills] = useState(props.trigger.skills.join(", "));
  const [responses, setResponses] = useState<string[]>(props.trigger.responses);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      setError(null);
      await api.saveTrigger({ ...props.trigger, skills: skills.split(",").map((x) => x.trim()).filter(Boolean), responses: responses as TriggerDefinition["responses"] });
      props.onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <li className="phase4-row" data-testid="trigger-row" data-enabled={props.trigger.enabled}>
      <div className="phase4-main">
        <div className="phase4-head">
          <Badge variant={props.trigger.enabled ? "success" : "neutral"} label={props.trigger.enabled ? "On" : "Off"} />
          <Text weight="semibold">{props.trigger.title}</Text>
        </div>
        <Text type="supporting">{props.trigger.event.replace(/_/g, " ")}</Text>
        <div className="phase4-form">
          <input aria-label={`Skills of ${props.trigger.id}`} placeholder="SK-002, SK-009" value={skills} onChange={(e) => setSkills(e.target.value)} />
          <div className="row-actions">
            {TRIGGER_RESPONSES.map((r) => (
              <label key={r} className="field inline">
                <input type="checkbox" checked={responses.includes(r)} onChange={() => setResponses(responses.includes(r) ? responses.filter((x) => x !== r) : [...responses, r])} /> {r.replace(/_/g, " ")}
              </label>
            ))}
          </div>
        </div>
        {error ? <div className="notice" role="alert">{error}</div> : null}
      </div>
      <div className="row-actions">
        <Button label="Save" size="sm" clickAction={save} />
        <Button label={props.trigger.enabled ? "Disable" : "Enable"} size="sm" variant="ghost" clickAction={async () => { await api.setTriggerEnabled(props.trigger.id, !props.trigger.enabled); props.onSaved(); }} />
        <Button label="Remove" size="sm" variant="ghost" clickAction={async () => { await api.deleteTrigger(props.trigger.id); props.onSaved(); }} />
      </div>
    </li>
  );
}

export function TriggersPanel() {
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [fires, setFires] = useState<TriggerFire[]>([]);
  const [form, setForm] = useState({ event: "new_document", title: "", skills: "", responses: ["update_context"] as string[] });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([api.listTriggers(), api.listTriggerFires()]);
      setTriggers(t);
      setFires(f.slice(0, 10));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const add = async () => {
    try {
      setError(null);
      await api.saveTrigger({ event: form.event as TriggerDefinition["event"], title: form.title, skills: form.skills.split(",").map((x) => x.trim()).filter(Boolean), responses: form.responses as TriggerDefinition["responses"], enabled: true });
      setForm({ event: "new_document", title: "", skills: "", responses: ["update_context"] });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div data-testid="triggers">
      <Text type="supporting">A trigger fires on a local event and proposes the skills and the automated responses it names. It starts nothing: the Review Inbox shows the fire, and you start it.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <div className="phase4-form">
        <select aria-label="New trigger event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>{TRIGGER_EVENTS.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}</select>
        <input aria-label="New trigger title" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input aria-label="New trigger skills" placeholder="SK-002, SK-009" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
        <div className="row-actions">
          {TRIGGER_RESPONSES.map((r) => (
            <label key={r} className="field inline"><input type="checkbox" checked={form.responses.includes(r)} onChange={() => setForm({ ...form, responses: form.responses.includes(r) ? form.responses.filter((x) => x !== r) : [...form.responses, r] })} /> {r.replace(/_/g, " ")}</label>
          ))}
        </div>
        <Button label="Add the trigger" size="sm" isDisabled={!form.title.trim()} clickAction={add} data-testid="trigger-add" />
      </div>
      <ul className="plain-list" data-testid="trigger-list">
        {triggers.map((t) => <TriggerRow key={t.id} trigger={t} onSaved={load} />)}
      </ul>
      <Heading level={4}>Recent fires</Heading>
      {fires.length === 0 ? <Text type="supporting">No fire yet.</Text> : (
        <ul className="plain-list" data-testid="trigger-fires">
          {fires.map((f) => (
            <li key={f.id} className="phase4-row">
              <div className="phase4-main">
                <div className="phase4-head"><Badge variant={f.state === "started" ? "success" : f.state === "dismissed" ? "neutral" : "warning"} label={f.state} /><Text weight="semibold">{f.event.replace(/_/g, " ")}</Text></div>
                <Text type="supporting">{f.subject}. Skills: {f.skills.join(", ") || "none"}. Responses: {f.responses.join(", ") || "none"}.</Text>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
