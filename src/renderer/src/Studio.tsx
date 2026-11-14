/**
 * V4-4: the Research and Argument Studio (docs/specs/v4.md). No business logic: each action is
 * one bridge function. Accept, reject, adopt are human-only bridge functions.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import type { ArgumentRecord, ArgumentStatus, CorpusPart, EventRecord, IssueRecord, ResearchDocument, ResearchHit, StudioState } from "../../shared/api.ts";
import { GROUNDS, STANCES } from "../../shared/studio.ts";

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

export function StudioView(props: { matterId: string; version: number; conference: ReactNode }) {
  const [part, setPart] = useState("conference");
  const [changed, setChanged] = useState(0);
  useEffect(() => api.onStudioChanged((id) => id === props.matterId && setChanged((n) => n + 1)), [props.matterId]);
  return (
    <div className="studio" data-testid="studio">
      <TabList value={part} onChange={setPart} size="sm" role="tablist" aria-label="Studio parts">
        <Tab value="conference" label="Conference" />
        <Tab value="sources" label="Search" />
        <Tab value="arguments" label="Arguments" />
        <Tab value="log" label="Research log" />
      </TabList>
      <div className="studio-body">
        {part === "conference" ? props.conference : null}
        {part === "sources" ? <SourcesPart matterId={props.matterId} /> : null}
        {part === "arguments" ? <ArgumentsPart matterId={props.matterId} version={props.version + changed} /> : null}
        {part === "log" ? <LogPart matterId={props.matterId} version={props.version + changed} /> : null}
      </div>
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
