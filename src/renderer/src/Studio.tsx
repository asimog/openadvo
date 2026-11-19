/**
 * V4-4: the Research and Argument Studio (docs/archive/2026-11-15/specs/v4.md). No business logic: each action is
 * one bridge function. Accept, reject, adopt are human-only bridge functions.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { ArgumentRecord, ArgumentStatus, CorpusPart, EventRecord, IssueRecord, KnowledgeHealthView, KnowledgeHit, ResearchDocument, ResearchHit, ResearchPlan, RetrievalResult, SearchMode, StudioState } from "../../shared/api.ts";
import { GROUNDS, STANCES } from "../../shared/studio.ts";
import { citationKeyText, summariseVerification } from "../../shared/law.ts";
import { recordGaps } from "../../lib/evidence/templates.ts";
import { strategyView } from "../../lib/studio/strategy.ts";
import { InspectButton } from "./V5.tsx";
import { AuthorityReview, RehearsalPart } from "./StudioV5.tsx";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

const SOURCE_LABEL: Record<ResearchHit["source"], string> = {
  aws_sc: "Supreme Court (AWS Open Data)",
  aws_hc: "High Courts (AWS Open Data)",
  indiacode: "India Code",
  web: "Web (discovery only)",
};

const CONFERENCE_PROMPTS = [
  "Open the case conference. Read the accepted issues and the authorities, and tell me the strongest and weakest parts of the case.",
  "Explore the issues in this matter. For each, give the record it rests on, the authority for it, and the gap I must fill.",
  "Run the argument loop on the accepted issues and explain the result, including the adverse points.",
  "What must I decide before the next hearing? List the open questions, the missing documents and the deadlines.",
];

/** The Studio is a conversation first. These actions send the request to the matter's one agent. */
function ConferenceChat(props: { matterId: string }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (q: string) => {
    if (!q.trim()) return;
    try {
      setError(null);
      await api.sendChat(props.matterId, q);
      setText("");
      setNote("Sent to the matter chat. The agent answers there.");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="work-section studio-chat" aria-label="Agent conference" data-testid="studio-chat">
      <Heading level={3}>Agent conference</Heading>
      <Text type="supporting">
        The Studio is a conversation, not a form. Ask the agent to open the case conference, explore an issue, run the argument loop, test a theory or prepare the hearing. The panels below are its working record; every legal point stays yours.
      </Text>
      <div className="row-actions">
        {CONFERENCE_PROMPTS.map((p) => <Button key={p} label={p.split(".")[0]} size="sm" variant="ghost" clickAction={() => send(p)} />)}
      </div>
      <TextInput label="Ask the agent about this matter" placeholder="For example: explore the maintainability issue" value={text} onChange={setText} onEnter={() => void send(text)} />
      <div className="row-actions">
        <Button label="Send to the agent" size="sm" isDisabled={!text.trim()} clickAction={() => send(text)} data-testid="studio-send" />
      </div>
      {note ? <div className="notice" role="status">{note}</div> : null}
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </section>
  );
}

export function StudioView(props: { matterId: string; version: number; conference: ReactNode }) {
  const [part, setPart] = useState("conference");
  const [changed, setChanged] = useState(0);
  useEffect(() => api.onStudioChanged((id) => id === props.matterId && setChanged((n) => n + 1)), [props.matterId]);
  return (
    <div className="studio" data-testid="studio">
      <TabList value={part} onChange={setPart} size="sm" role="tablist" aria-label="Studio parts">
        <Tab value="conference" label="Conference" />
        <Tab value="strategy" label="Strategy" />
        <Tab value="law" label="Law library" />
        <Tab value="sources" label="Search" />
        <Tab value="arguments" label="Arguments" />
        <Tab value="rehearsal" label="Rehearsal" />
        <Tab value="log" label="Research log" />
      </TabList>
      <div className="studio-body">
        {part === "conference" ? (
          <>
            <ConferenceChat matterId={props.matterId} />
            {props.conference}
            <AuthorityReview matterId={props.matterId} version={props.version + changed} />
          </>
        ) : null}
        {part === "strategy" ? <StrategyPart matterId={props.matterId} version={props.version + changed} /> : null}
        {part === "rehearsal" ? <RehearsalPart matterId={props.matterId} version={props.version + changed} /> : null}
        {part === "law" ? <LawPart matterId={props.matterId} version={props.version + changed} /> : null}
        {part === "sources" ? <SourcesPart matterId={props.matterId} /> : null}
        {part === "arguments" ? <ArgumentsPart matterId={props.matterId} version={props.version + changed} /> : null}
        {part === "log" ? <LogPart matterId={props.matterId} version={props.version + changed} /> : null}
      </div>
    </div>
  );
}

// ---- Phase 7 (K4, K5): the Strategy view ----

function StrategyPart(props: { matterId: string; version: number }) {
  const [s, setS] = useState<StudioState | null>(null);
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [weak, setWeak] = useState<Awaited<ReturnType<typeof api.getWeakPoints>>>([]);
  const [gaps, setGaps] = useState<Array<{ columnId: string; question: string }>>([]);
  const [form, setForm] = useState({ title: "", statement: "", burden: "", standard: "", issueIds: "" });
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const [studio, research, weakPoints, table] = await Promise.all([
        api.getStudio(props.matterId),
        api.getResearch(props.matterId),
        api.getWeakPoints(props.matterId),
        api.getRecordTable(props.matterId),
      ]);
      setS(studio);
      setIssues(research.issues);
      setWeak(weakPoints);
      setGaps(recordGaps(table.columns, table.cells));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const add = async () => {
    try {
      setError(null);
      await api.addTheory(props.matterId, {
        title: form.title,
        statement: form.statement,
        issueIds: form.issueIds.split(",").map((x) => x.trim()).filter(Boolean),
        burden: form.burden,
        standard: form.standard,
      });
      setForm({ title: "", statement: "", burden: "", standard: "", issueIds: "" });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const decide = async (id: string, decision: "primary" | "alternative" | "rejected", reason: string) => {
    try {
      setError(null);
      await api.decideTheory(props.matterId, id, decision, reason);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      setError(null);
      await api.askDissent(props.matterId, question.trim());
      setQuestion("");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setAsking(false);
    }
  };
  if (!s) return null;
  const view = strategyView({ arguments: s.arguments, theories: s.theories, issues, weakPoints: weak, gaps });
  // K5: the answers of one run are shown together, with the split the run found.
  const panels: Array<{ id: string; question: string; split: boolean; answers: typeof s.dissents }> = [];
  for (const answer of s.dissents) {
    const id = answer.runId || answer.id;
    const panel = panels.find((p) => p.id === id);
    if (panel) {
      panel.answers.push(answer);
      panel.split ||= answer.split;
    } else {
      panels.push({ id, question: answer.question, split: answer.split, answers: [answer] });
    }
  }
  return (
    <section className="work-section" aria-label="Case strategy" data-testid="strategy-panel">
      <Heading level={3}>Case theory</Heading>
      <Text type="supporting">
        A theory is what the case is really about: the issues it rests on, the burden it says your side bears, the standard it faces. The agent may propose one; you set its place. No theory states a probability of success.
      </Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {view.theories.length === 0 ? <Text type="supporting">No theory yet. Add yours, or ask the agent to propose one in the chat.</Text> : null}
      <ul className="plain-list" data-testid="theory-list">
        {view.theories.map((t) => (
          <li key={t.id} className="phase4-row" data-testid="theory-row" data-status={t.status}>
            <div className="phase4-main">
              <div className="phase4-head">
                <Badge variant={t.status === "primary" ? "success" : "neutral"} label={t.status} />
                <Text weight="semibold">{t.title}</Text>
                {t.author === "agent" ? <Badge variant="info" label="proposed" /> : null}
              </div>
              <Text>{t.statement}</Text>
              {t.burden || t.standard ? (
                <Text type="supporting">{[t.burden ? `Burden: ${t.burden}` : "", t.standard ? `Standard: ${t.standard}` : ""].filter(Boolean).join(" · ")}</Text>
              ) : null}
            </div>
            <div className="row-actions">
              {t.status !== "primary" ? <Button label="Set primary" size="sm" onClick={() => void decide(t.id, "primary", "the advocate set it primary")} /> : null}
              {t.status !== "alternative" ? <Button label="Set alternative" size="sm" variant="ghost" onClick={() => void decide(t.id, "alternative", "the advocate set it alternative")} /> : null}
              <Button label="Reject" size="sm" variant="ghost" onClick={() => void decide(t.id, "rejected", "the advocate rejected the theory")} />
            </div>
          </li>
        ))}
      </ul>
      <details className="strategy-form">
        <summary>Add a theory</summary>
        <div className="phase4-edit">
          <input aria-label="Theory title" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea aria-label="The theory" placeholder="The theory, in your terms" value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} />
          <input aria-label="Burden" placeholder="Who bears the burden (optional)" value={form.burden} onChange={(e) => setForm({ ...form, burden: e.target.value })} />
          <input aria-label="Standard" placeholder="The standard of proof (optional)" value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value })} />
          <input aria-label="Issue ids" placeholder="Issue ids (comma-separated, optional)" value={form.issueIds} onChange={(e) => setForm({ ...form, issueIds: e.target.value })} />
          <Button label="Add the theory" size="sm" isDisabled={!form.title.trim() || !form.statement.trim()} clickAction={() => void add()} />
        </div>
      </details>

      <Heading level={3}>Standing and weaknesses</Heading>
      <Text type="supporting">
        The accepted arguments with their standing from the attack graph, the weak points the loop found, and the elements of the record-table chart that have no confirmed evidence.
      </Text>
      <ul className="plain-list" data-testid="standing-list">
        {view.standing.length === 0 ? <Text type="supporting">No accepted argument yet. Run the loop on the Arguments tab and accept the arguments that hold.</Text> : null}
        {view.standing.slice(0, 12).map((a) => (
          <li key={a.id} data-testid="standing-row" data-standing={a.standing}>
            <Badge variant={a.standing === "in" ? "success" : a.standing === "out" ? "error" : "warning"} label={a.standing === "in" ? "stands" : a.standing === "out" ? "felled" : "undecided"} /> {a.claim}
            {a.issue ? <Text type="supporting"> — issue: {a.issue}</Text> : null}
            {a.felledBy ? <Text type="supporting"> — felled by: {a.felledBy}</Text> : null}
          </li>
        ))}
      </ul>
      {view.dependencies.length > 0 ? (
        <div data-testid="argument-dependencies">
          <Text weight="semibold">Dependencies, from the attack graph:</Text>
          <ul className="plain-list">
            {view.dependencies.slice(0, 12).map((d) => (
              <li key={d.attackerId}>
                <Badge variant="neutral" label={d.kind} /> {d.attacker} → attacks → {d.target}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {weak.length > 0 ? (
        <div className="notice" data-testid="weak-points">
          <Text weight="semibold">Weak points of the accepted arguments:</Text>
          <ul className="plain-list">
            {weak.map((w, i) => (
              <li key={i}>{w.claim}: {w.questions.length ? ` open question: ${w.questions[0]}` : ""}{w.attacks.length ? ` standing attack (${w.attacks[0].kind}): ${w.attacks[0].claim}` : ""}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {gaps.length > 0 ? (
        <div className="notice" data-testid="record-gaps">
          <Text weight="semibold">{gaps.length} element(s) of the record-table chart have no confirmed evidence:</Text>
          <ul className="plain-list">
            {gaps.map((g) => (
              <li key={g.columnId}>{g.question}</li>
            ))}
          </ul>
          <Text type="supporting">Fill the cell from a source on the Record table tab, or drop the element. A gap is never guessed at.</Text>
        </div>
      ) : null}

      <Heading level={3}>Dissent panel</Heading>
      <Text type="supporting">
        Ask one hard question. Every model you configured for a role answers it, anchored to the record; the answers are shown side by side. When they disagree, a review item names every answer. The panel shows a split; it never resolves it, and no answer predicts an outcome.
      </Text>
      <div className="row-actions">
        <input
          aria-label="The hard question"
          placeholder="The hard question, as you would put it to counsel"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask()}
          data-testid="dissent-question"
        />
        <Button label={asking ? "Asking…" : "Ask the panel"} size="sm" isDisabled={asking || !question.trim()} clickAction={() => void ask()} />
      </div>
      {panels.length > 0 ? (
        <div data-testid="dissent-list">
          {panels.slice(0, 4).map((p) => (
            <div key={p.id} className="dissent-panel" data-testid="dissent-panel" data-split={p.split ? "yes" : "no"}>
              <Text weight="semibold">{p.question}</Text>{" "}
              <Badge variant={p.split ? "warning" : "neutral"} label={p.split ? "Split" : "No split"} />
              <div className="dissent-answers">
                {p.answers.map((d) => (
                  <div key={d.id} data-testid="dissent-answer" data-refused={d.refused ? "yes" : "no"}>
                    <Badge variant={d.refused ? "warning" : "neutral"} label={d.role} /> <Text type="supporting">{d.model} · {d.at.slice(0, 10)}</Text>
                    {d.refused ? <Text>Refused: {d.refused}</Text> : <Text>{d.answer}</Text>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---- Phase 5: the law library ----

const LAW_SCOPES: Record<string, Array<"statute" | "procedure" | "research" | "matter" | "firm" | "advocate">> = {
  all: ["statute", "procedure", "research", "matter", "firm", "advocate"],
  statutes: ["statute"],
  procedure: ["procedure"],
  judgments: ["research"],
  matter: ["matter"],
  firm: ["firm"],
  advocate: ["advocate"],
};

/** With no matter open, the shared library is searched; the matter scope is not offered. */
const SHARED_LAW_SCOPES: Record<string, Array<"statute" | "procedure" | "research" | "matter" | "firm" | "advocate">> = {
  all: ["statute", "procedure", "research", "firm", "advocate"],
  statutes: ["statute"],
  procedure: ["procedure"],
  judgments: ["research"],
  firm: ["firm"],
  advocate: ["advocate"],
};

const SCOPE_LABEL: Record<string, string> = { firm: "Knowledge library", advocate: "Advocate memory", session: "Session" };

/** The law library and its search. A matter id of "" searches the shared library only. */
export function LawPart(props: { matterId: string; version: number }) {
  const [health, setHealth] = useState<KnowledgeHealthView | null>(null);
  const [plans, setPlans] = useState<ResearchPlan[]>([]);
  const [progress, setProgress] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("natural");
  const [date, setDate] = useState("");
  const [scope, setScope] = useState("all");
  const [result, setResult] = useState<RetrievalResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setHealth(await api.knowledgeHealth(props.matterId));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);

  const refreshPlans = useCallback(async () => {
    if (!props.matterId) return;
    try {
      setPlans(await api.knowledgePlans(props.matterId));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);

  useEffect(() => {
    void refresh();
    void refreshPlans();
  }, [refresh, refreshPlans, props.version]);

  useEffect(() => api.onStudioProgress(setProgress), []);

  const decidePlan = async (id: string, decision: "approved" | "stopped") => {
    try {
      setError(null);
      await api.decideResearchPlan(props.matterId, id, decision);
      await refreshPlans();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.knowledgeLoadFirstWave();
      setNote(`Loaded ${r.acts} Acts and ${r.provisions} provisions. Set ${r.setHash.slice(0, 12)}.`);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const scopes = props.matterId ? LAW_SCOPES : SHARED_LAW_SCOPES;
      setResult(
        await api.knowledgeSearch(props.matterId, query.trim(), {
          mode,
          scopes: scopes[scope] ?? scopes.all,
          date: date || null,
          limit: 20,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProvision = async (hit: KnowledgeHit) => {
    try {
      setError(null);
      const saved = await api.knowledgeSaveProvision(props.matterId, hit.id);
      setNote(`Saved in this matter: ${saved.act}, ${saved.section}. The library row is the shared source.`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const saveAuthority = async (hit: KnowledgeHit) => {
    try {
      setError(null);
      const [ref, para] = hit.anchor.split("#p");
      const saved = await api.saveJudgment(props.matterId, ref, { paragraph: para ?? "", proposition: "", role: "supporting" });
      setNote(`Saved as a candidate authority: ${saved.citation}, paragraph ${saved.paragraph || "not given"}.`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const counts = health?.counts;
  return (
    <div className="work-view" data-testid="law-library" data-in-matter={props.matterId ? "yes" : "no"}>
      <section className="work-section" aria-label="Law library">
        <div className="row-actions">
          <Heading level={3}>Law library</Heading>
          {counts ? <Badge label={`${counts.acts} Acts · ${counts.provisions} provisions`} /> : null}
          {result ? <Badge variant={result.coverage.partial ? "warning" : "success"} label={result.coverage.partial ? "Partial coverage" : "Complete coverage"} /> : null}
        </div>
        <Text type="supporting">
          The shared library is the owner's ten-instrument first wave: the Constitution, BNS, BNSS, BSA, IPC, CrPC, the Evidence Act, the Civil Procedure Code, the General Clauses Act and the Limitation Act. It is read from India Code with page and line anchors and a source manifest.{" "}
          {props.matterId
            ? "A saved provision is a case-specific copy in this matter; the library row remains the shared source."
            : "Open a matter's research studio to save a provision or an authority to that matter."}{" "}
          The Knowledge Library and confirmed advocate memory are searched as records, not as law. A proposed or rejected record is never returned as confirmed.
        </Text>
        {counts ? (
          <Text type="supporting">
            {counts.provisions} current provisions, {counts.versions} versions, {counts.stale} stale; {counts.judgments} judgment(s), {counts.paragraphs} paragraph(s), {counts.edges} treatment edge(s). Set {health?.manifest.setHash.slice(0, 12) ?? "—"}.
          </Text>
        ) : null}
        <div className="row-actions">
          <Button label={counts && counts.provisions > 0 ? "Recheck and refresh the first wave" : "Load the first wave"} size="sm" isDisabled={busy || !!progress} clickAction={load} />
          <Button label="Refresh health" size="sm" variant="ghost" isDisabled={busy} clickAction={refresh} />
        </div>
        {progress ? <Text type="supporting" data-testid="law-progress">Law: {progress}</Text> : null}
        {health ? (
          <Text type="supporting" data-testid="law-health">
            {health.adapters
              .map((row) => `${SCOPE_LABEL[row.scope] ?? row.scope}: ${row.state} — ${row.detail}`)
              .join(" · ")}
          </Text>
        ) : null}
        {note ? <div className="notice" role="status">{note}</div> : null}
        {error ? <div className="notice" role="alert" data-testid="law-error">{error}</div> : null}
      </section>

      {props.matterId && plans.length ? (
        <section className="work-section" aria-label="Research plans" data-testid="research-plans">
          <Heading level={3}>Research plans</Heading>
          {plans.map((plan) => (
            <div key={plan.id} className="work-row">
              <div className="row-actions">
                <Badge variant={plan.status === "proposed" ? "warning" : plan.status === "stopped" ? "error" : "success"} label={plan.status} />
                <strong>{plan.question}</strong>
                {plan.governingDate ? <Text type="supporting">Governing date {plan.governingDate}</Text> : null}
              </div>
              <ol>
                {plan.steps.map((step) => (
                  <li key={step.n}>
                    <Text type="supporting">{step.status} · {step.mode} · {step.scopes.join(", ")}{step.hits ? ` · ${step.hits} hit(s)` : ""}{step.note ? ` — ${step.note}` : ""}</Text> {step.question}
                  </li>
                ))}
              </ol>
              <div className="row-actions">
                {plan.status === "proposed" ? <Button label="Approve the plan" size="sm" clickAction={() => decidePlan(plan.id, "approved")} /> : null}
                {plan.status === "proposed" || plan.status === "approved" || plan.status === "running" ? <Button label="Stop the plan" size="sm" variant="ghost" clickAction={() => decidePlan(plan.id, "stopped")} /> : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="work-section" aria-label="Search the law library">
        <div className="row-actions search-row">
          <input aria-label="Law query" className="grow" placeholder="A question, a citation, or words of a provision" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
          <select aria-label="Law mode" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)}>
            <option value="natural">Natural language</option>
            <option value="citation">Citation</option>
            <option value="statute">Statute and section</option>
            <option value="paragraph">Judgment paragraph</option>
            <option value="historical">Law on a date</option>
            <option value="connected">Connected case</option>
            <option value="phrase">Exact phrase</option>
            <option value="boolean">Boolean</option>
          </select>
          <select aria-label="Law scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">{props.matterId ? "All sources" : "All shared sources"}</option>
            <option value="statutes">Statutes</option>
            <option value="procedure">Procedure</option>
            <option value="judgments">Judgments</option>
            {props.matterId ? <option value="matter">This matter</option> : null}
            <option value="firm">Knowledge library</option>
            <option value="advocate">Advocate memory</option>
          </select>
          <input aria-label="Governing date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button label="Search the law library" size="sm" isDisabled={busy || !query.trim()} clickAction={search} />
        </div>
        {result ? (
          <>
            <Text type="supporting" data-testid="law-coverage">
              Searched {result.coverage.searched.join(", ") || "none"}. Deferred {result.coverage.deferred.map((d) => `${d.scope} (${d.reason})`).join("; ") || "none"}. Failed {result.coverage.failed.map((f) => `${f.scope} (${f.reason})`).join("; ") || "none"}. {result.coverage.partial ? "This result is partial." : "This result is complete for the scopes named."}
            </Text>
            <ol className="hit-list" data-testid="law-hits">
              {result.hits.map((hit) => {
                const summary = hit.checks ? summariseVerification(hit.checks) : null;
                const recordLabel = hit.scope === "firm" ? "library record" : hit.scope === "advocate" ? "advocate record" : "unconfirmed";
                return (
                  <li key={`${hit.scope}:${hit.id}`}>
                    <div className="hit-main">
                      <div className="row-actions">
                        <Badge label={hit.scope} />
                        <strong>{hit.title}</strong>
                        {summary ? <Badge variant={summary === "verified" ? "success" : summary === "partial" ? "warning" : "error"} label={summary} /> : <Badge variant={hit.scope === "firm" || hit.scope === "advocate" ? "neutral" : "error"} label={recordLabel} />}
                        {hit.stale ? <Badge variant="warning" label="stale" /> : null}
                      </div>
                      {hit.citationKey ? <Text type="supporting">{citationKeyText(hit.citationKey)}</Text> : null}
                      {hit.binding ? <Text type="supporting">Binding: {hit.binding.label} — {hit.binding.reasons.join(" ")}{hit.binding.unresolved.length ? ` (missing: ${hit.binding.unresolved.join(", ")})` : ""}</Text> : null}
                      <Text>{hit.text.length > 900 ? `${hit.text.slice(0, 900)}…` : hit.text}</Text>
                      <Text type="supporting">
                        anchor {hit.anchor} · {hit.why.join(", ")} · {hit.verification}
                      </Text>
                      <div className="row-actions">
                        {props.matterId && (hit.scope === "statute" || hit.scope === "procedure") ? <Button label="Save in this matter" size="sm" variant="ghost" clickAction={() => saveProvision(hit)} /> : null}
                        {props.matterId && hit.scope === "research" ? <Button label="Save as a candidate authority" size="sm" variant="ghost" clickAction={() => saveAuthority(hit)} /> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
              {result.hits.length === 0 ? <li><Text type="supporting">No hit. The coverage above says what was searched.</Text></li> : null}
            </ol>
          </>
        ) : null}
      </section>
    </div>
  );
}

// ---- Sources ----

function IndexPanel() {
  const [parts, setParts] = useState<CorpusPart[]>([]);
  const [progress, setProgress] = useState("");
  const [years, setYears] = useState(`${new Date().getFullYear() - 5}-${new Date().getFullYear() - 1}`);
  const [hcYear, setHcYear] = useState(String(new Date().getFullYear() - 1));
  const [courts, setCourts] = useState<Array<{ code: string; name: string }>>([]);
  const [court, setCourt] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.corpusParts().then(setParts);
    return api.onStudioProgress(setProgress);
  }, []);
  const run = async (fn: () => Promise<CorpusPart[]>) => {
    try {
      setError(null);
      setParts(await fn());
    } catch (e) {
      setError(errorText(e));
    }
  };
  const range = (): number[] => {
    const m = /^(\d{4})(?:\s*-\s*(\d{4}))?$/.exec(years.trim());
    if (!m) return [];
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
  };
  const sc = parts.filter((p) => p.source === "sc");
  const hc = parts.filter((p) => p.source === "hc");
  return (
    <details className="work-section index-panel" data-testid="index-panel" open={parts.length === 0}>
      <summary>
        Judgment index: {sc.length ? `Supreme Court ${Math.min(...sc.map((p) => p.year))}–${Math.max(...sc.map((p) => p.year))} (${sc.length} years, ${sc.reduce((n, p) => n + p.rows, 0)} judgments)` : "no Supreme Court year"}
        {hc.length ? `; ${hc.length} High Court part(s)` : ""}
      </summary>
      <Text type="supporting">
        The judgments' metadata is read from AWS Open Data (CC BY 4.0) into an index on this computer, shared by all matters. Each Supreme Court year is about 1 MB. A judgment's PDF is fetched only when you read it.
      </Text>
      <div className="row-actions">
        <label className="field inline">
          <span>Supreme Court years</span>
          <input aria-label="Supreme Court years" value={years} onChange={(e) => setYears(e.target.value)} placeholder="2015-2024" />
        </label>
        <Button label="Index Supreme Court years" size="sm" isDisabled={!!progress || range().length === 0} clickAction={() => run(() => api.indexSupremeCourt(range()))} />
      </div>
      <div className="row-actions">
        <label className="field inline">
          <span>High Court year</span>
          <input aria-label="High Court year" value={hcYear} onChange={(e) => setHcYear(e.target.value)} style={{ width: 70 }} />
        </label>
        <Button label="List High Courts" size="sm" variant="ghost" isDisabled={!/^\d{4}$/.test(hcYear)} clickAction={async () => { try { setError(null); setCourts(await api.listHighCourts(Number(hcYear))); } catch (e) { setError(errorText(e)); } }} />
        {courts.length ? (
          <>
            <select aria-label="High Court" value={court} onChange={(e) => setCourt(e.target.value)}>
              <option value="">Choose a court</option>
              {courts.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button label="Index this court and year" size="sm" isDisabled={!court || !!progress} clickAction={() => run(() => api.indexHighCourt(court, Number(hcYear)))} />
          </>
        ) : null}
      </div>
      {progress ? <Text type="supporting" data-testid="index-progress">Indexing: {progress}</Text> : null}
      {hc.length ? <Text type="supporting">High Courts indexed: {hc.map((p) => `${p.courtName} ${p.year} (${p.rows})`).join(", ")}.</Text> : null}
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </details>
  );
}

function SourcesPart(props: { matterId: string }) {
  const [source, setSource] = useState<ResearchHit["source"]>("aws_sc");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ hits: ResearchHit[]; notice: string } | null>(null);
  const [doc, setDoc] = useState<ResearchDocument | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [save, setSave] = useState({ paragraph: "", proposition: "", role: "supporting" });
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const current = doc?.pages.find((p) => p.page === page) ?? doc?.pages[0];
  return (
    <div className="work-view" data-testid="studio-sources">
      <IndexPanel />
      <section className="work-section" aria-label="Search">
        <div className="row-actions search-row">
          <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as ResearchHit["source"])}>
            {(Object.keys(SOURCE_LABEL) as Array<ResearchHit["source"]>).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <input
            aria-label="Research query"
            className="grow"
            value={query}
            placeholder={source === "indiacode" ? "For example: section 483 Bharatiya Nagarik Suraksha Sanhita" : source === "web" ? "Words to search the web for" : "Party names, 2023 INSC 1043, a CNR, a judge"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void go(async () => setResult(await api.researchSearch(props.matterId, source, query)))}
          />
          <Button label="Search" size="sm" isDisabled={busy || !query.trim()} clickAction={() => go(async () => setResult(await api.researchSearch(props.matterId, source, query)))} />
        </div>
        {source === "web" ? <Text type="supporting">Web queries leave this computer. Do not put client-confidential details in them.</Text> : null}
        {result ? <Text type="supporting" data-testid="research-notice">{result.notice}</Text> : null}
        {note ? <div className="notice" role="alert" data-testid="research-error">{note}</div> : null}
        {result ? (
          <ol className="hit-list" data-testid="research-hits">
            {result.hits.map((h) => (
              <li key={h.ref}>
                <div className="hit-main">
                  <Text weight="semibold">{h.title}</Text>
                  <Text type="supporting">{h.detail}</Text>
                </div>
                <div className="row-actions">
                  <Button label="Read" size="sm" variant="ghost" isDisabled={busy} clickAction={() => go(async () => { setDoc(await api.researchRead(props.matterId, h.source, h.ref)); setPage(1); })} />
                  {h.courtCopy ? <Button label={`Read court copy (${h.courtCopy.insc})`} size="sm" isDisabled={busy} clickAction={() => go(async () => { setDoc(await api.researchRead(props.matterId, "aws_sc", h.courtCopy!.ref)); setPage(1); })} /> : null}
                  {h.source === "indiacode" ? <Button label="Save provision" size="sm" isDisabled={busy} clickAction={() => go(async () => { const p = await api.saveProvision(props.matterId, h.ref); setNote(`Saved: ${p.act}, section ${p.section}${p.repealed ? " (repealed)" : ""}.`); })} /> : null}
                </div>
              </li>
            ))}
            {result.hits.length === 0 ? <li><Text type="supporting">No result.</Text></li> : null}
          </ol>
        ) : null}
      </section>
      {doc ? (
        <section className="work-section reader" aria-label="Reader" data-testid="research-reader">
          <Heading level={4}>{doc.title}</Heading>
          <Text type="supporting">{doc.detail}</Text>
          <Text type="supporting">{doc.notice}{doc.sha256 ? ` SHA-256 ${doc.sha256.slice(0, 16)}…` : ""}</Text>
          {doc.source === "aws_sc" || doc.source === "aws_hc" ? (
            <div className="row-actions save-row">
              <input aria-label="Paragraph relied on" placeholder="Paragraph" value={save.paragraph} onChange={(e) => setSave({ ...save, paragraph: e.target.value })} style={{ width: 90 }} />
              <input aria-label="Proposition" className="grow" placeholder="The proposition it supports" value={save.proposition} onChange={(e) => setSave({ ...save, proposition: e.target.value })} />
              <select aria-label="Role" value={save.role} onChange={(e) => setSave({ ...save, role: e.target.value })}>
                {["supporting", "adverse", "distinguishable", "other"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <Button label="Save as authority" size="sm" isDisabled={busy} clickAction={() => go(async () => { const a = await api.saveJudgment(props.matterId, doc.ref, save); setNote(`Saved as an authority: ${a.citation}.`); })} />
            </div>
          ) : null}
          {current ? (
            <>
              <div className="page-text-bar">
                <Button label="Previous page" size="sm" variant="ghost" isDisabled={page <= 1} onClick={() => setPage(page - 1)} />
                <Text>Page {current.page} of {doc.pages.length}</Text>
                <Button label="Next page" size="sm" variant="ghost" isDisabled={page >= doc.pages.length} onClick={() => setPage(page + 1)} />
              </div>
              <ol className="page-lines" data-testid="reader-lines">
                {current.lines.map((l) => (
                  <li key={l.line}>
                    <span className="line-no">{l.line}</span>
                    <span>{l.text}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Text type="supporting">No text was found.</Text>
          )}
        </section>
      ) : null}
    </div>
  );
}

// ---- Arguments ----

const STATUS_BADGE: Record<ArgumentStatus, { label: string; variant: "success" | "error" | "neutral" }> = {
  in: { label: "In", variant: "success" },
  out: { label: "Out", variant: "error" },
  undecided: { label: "Undecided", variant: "neutral" },
};

function ArgumentsPart(props: { matterId: string; version: number }) {
  const [s, setS] = useState<StudioState | null>(null);
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [issueId, setIssueId] = useState("");
  const [rounds, setRounds] = useState(2);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    setS(await api.getStudio(props.matterId));
    const r = await api.getResearch(props.matterId);
    setIssues(r.issues.filter((i) => i.status === "accepted"));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  useEffect(() => {
    if (!issueId && issues[0]) setIssueId(issues[0].id);
  }, [issues, issueId]);
  const act = async (fn: () => Promise<unknown>, after?: string) => {
    try {
      setNote(null);
      await fn();
      if (after) setNote(after);
      await load();
    } catch (e) {
      setNote(errorText(e));
    }
  };
  const forIssue = useMemo(() => (s?.arguments ?? []).filter((a) => a.issueId === issueId), [s, issueId]);
  const main = forIssue.filter((a) => !a.attacks);
  const attacksOf = (id: string) => forIssue.filter((a) => a.attacks === id);
  if (!s) return null;
  const rejections = s.rejections.filter((r) => s.runs.some((run) => run.id === r.runId && run.issueId === issueId));
  return (
    <div className="work-view" data-testid="studio-arguments">
      <section className="work-section" aria-label="Argument loop">
        <Heading level={3}>Argument loop</Heading>
        <Text type="supporting">
          For one accepted issue, generators propose arguments from the matter's records only. Code rejects any argument whose record quote, authority or provision does not check out. A critic lists open questions; opposing counsel writes attacks. You accept or reject. Status is computed from the attacks. No outcome is predicted.
        </Text>
        {issues.length === 0 ? (
          <Text type="supporting">No accepted issue. Accept an issue under Conference first.</Text>
        ) : (
          <div className="row-actions">
            <select aria-label="Issue" value={issueId} onChange={(e) => setIssueId(e.target.value)} className="grow">
              {issues.map((i) => <option key={i.id} value={i.id}>{i.text}</option>)}
            </select>
            <label className="field inline">
              <span>Rounds</span>
              <select aria-label="Rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button label="Run the loop" size="sm" variant="primary" isDisabled={!s.loop.available || !issueId} clickAction={() => act(() => api.startArgumentLoop(props.matterId, issueId, { rounds }), "The loop started. Results appear as they pass the checks.")} />
          </div>
        )}
        <Text type="supporting" data-testid="loop-state">{s.loop.detail}</Text>
        {note ? <div className="notice" role="status">{note}</div> : null}
      </section>
      <section className="work-section" aria-label="Archive">
        <Heading level={3}>Archive: ground by stance</Heading>
        <div className="archive-grid" data-testid="archive-grid">
          <span />
          {STANCES.map((st) => <span key={st} className="archive-head">{st}</span>)}
          {GROUNDS.map((g) => (
            <ArchiveRow key={g} ground={g} cells={STANCES.map((st) => main.filter((a) => a.ground === g && a.stance === st))} />
          ))}
        </div>
      </section>
      <section className="work-section" aria-label="Arguments">
        <Heading level={3}>Arguments ({main.length})</Heading>
        {main.length === 0 ? <Text type="supporting">None yet for this issue.</Text> : null}
        {[...main].sort((a, b) => b.elo - a.elo).map((a) => (
          <ArgumentCard key={a.id} a={a} attacks={attacksOf(a.id)} matterId={props.matterId} act={act} />
        ))}
      </section>
      <section className="work-section" aria-label="Rejected by the checks">
        <details>
          <summary>Rejected by the checks ({rejections.length})</summary>
          <ul className="plain-list">
            {rejections.map((r) => (
              <li key={r.id}><Badge variant="warning" label={r.reason} /> <Text type="supporting">{r.ground}/{r.stance}: {r.detail}</Text></li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

function ArchiveRow(props: { ground: string; cells: ArgumentRecord[][] }) {
  return (
    <>
      <span className="archive-head">{props.ground}</span>
      {props.cells.map((c, i) => (
        <span key={i} className="archive-cell" data-count={c.length}>{c.length || ""}</span>
      ))}
    </>
  );
}

function ArgumentCard(props: { a: ArgumentRecord & { computed?: ArgumentStatus }; attacks: Array<ArgumentRecord & { computed?: ArgumentStatus }>; matterId: string; act: (fn: () => Promise<unknown>, after?: string) => Promise<void> }) {
  const { a } = props;
  const st = STATUS_BADGE[a.computed ?? "undecided"];
  return (
    <article className="argument" data-testid="argument" data-status={a.status} data-computed={a.computed}>
      <div className="argument-head">
        <Badge variant={st.variant} label={st.label} />
        <Badge variant="neutral" label={`${a.ground} · ${a.stance}`} />
        <Text type="supporting">rating {Math.round(a.elo)}</Text>
        {a.status !== "candidate" ? <Badge variant={a.status === "accepted" ? "success" : "error"} label={a.status === "accepted" ? "Accepted" : "Rejected"} /> : null}
      </div>
      <Text weight="semibold">{a.claim}</Text>
      <Text>{a.reasoning}</Text>
      <Text type="supporting">
        Grounding: {a.events.length} record quote(s){a.events.length ? ` (“${a.events.map((e) => e.quote).join("”, “")}”)` : ""}; {a.authorities.length} authority(ies); {a.provisions.length} provision(s).
      </Text>
      {a.questions.length ? (
        <div className="questions">
          <Text type="supporting">Open questions:</Text>
          <ul>{a.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      ) : null}
      {props.attacks.length ? (
        <div className="attacks">
          {props.attacks.map((x) => (
            <div key={x.id} className="attack" data-computed={x.computed}>
              <Badge variant="warning" label={x.attackKind ?? "attack"} /> <Badge variant={STATUS_BADGE[x.computed ?? "undecided"].variant} label={STATUS_BADGE[x.computed ?? "undecided"].label} /> <Text>{x.claim}</Text>
              {x.status === "candidate" ? <Button label="Reject attack" size="sm" variant="ghost" clickAction={() => props.act(() => api.decideArgument(props.matterId, x.id, "rejected"))} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="row-actions">
        {a.status !== "accepted" ? <Button label="Accept" size="sm" clickAction={() => props.act(() => api.decideArgument(props.matterId, a.id, "accepted"))} /> : null}
        {a.status !== "rejected" ? <Button label="Reject" size="sm" variant="ghost" clickAction={() => props.act(() => api.decideArgument(props.matterId, a.id, "rejected"))} /> : null}
        <InspectButton id={a.id} />
        {a.status === "accepted" ? <Button label="Send to Grounds" size="sm" variant="ghost" clickAction={() => props.act(() => api.argumentToGrounds(props.matterId, a.id), "Proposed in the Grounds as a tracked insertion. Keep or undo it there.")} /> : null}
      </div>
    </article>
  );
}

// ---- Research log ----

function LogPart(props: { matterId: string; version: number }) {
  const [log, setLog] = useState<EventRecord[]>([]);
  useEffect(() => {
    void api.getResearchLog(props.matterId).then(setLog);
  }, [props.matterId, props.version]);
  return (
    <section className="work-section" aria-label="Research log" data-testid="research-log">
      <Heading level={3}>Research log</Heading>
      <Text type="supporting">Every query to a research source, and every run of the loop, as recorded in the matter.</Text>
      <table className="plain">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
        <tbody>
          {log.map((e) => (
            <tr key={e.seq}>
              <td className="nowrap">{e.at.replace("T", " ").slice(0, 19)}</td>
              <td>{e.actor}</td>
              <td>{e.action === "research.query" ? `${String(e.data?.source ?? "")} ${String(e.data?.action ?? "")}` : e.action}</td>
              <td>{e.action === "research.query" ? `${String(e.data?.query ?? "")} (${String(e.data?.results ?? 0)})` : JSON.stringify(e.data ?? {}).slice(0, 160)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Settings: research sources ----

export function ResearchSourceSettings() {
  const [s, setS] = useState<{ aws: boolean; indiaCode: boolean; web: boolean } | null>(null);
  useEffect(() => {
    void api.getResearchSettings().then(setS);
  }, []);
  if (!s) return null;
  const flip = async (k: "aws" | "indiaCode" | "web") => setS(await api.setResearchSettings({ ...s, [k]: !s[k] }));
  return (
    <div className="row-actions" data-testid="research-settings">
      <label className="radio"><input type="checkbox" checked={s.aws} onChange={() => void flip("aws")} /> AWS Open Data (Supreme Court and High Court judgments)</label>
      <label className="radio"><input type="checkbox" checked={s.indiaCode} onChange={() => void flip("indiaCode")} /> India Code</label>
      <label className="radio"><input type="checkbox" checked={s.web} onChange={() => void flip("web")} /> The web (discovery only)</label>
    </div>
  );
}
