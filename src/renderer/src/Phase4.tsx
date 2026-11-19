/**
 * Phase 4 views: facts and timelines, the evidence repository, document structure, jurisdiction
 * and typed matter memory. Every write goes through a named bridge function; only the advocate
 * confirms or decides. Spec: docs/specs/documents-evidence-facts.md.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { Contradiction, DocumentOperation, DocumentPart, EvidenceRecord, FactRecord, ForumClause, JurisdictionReport, MatterEdge, PageMark, SourceRelation, TimelineEntry } from "../../shared/api.ts";
import type { SourceRecord } from "../../shared/records.ts";
import { FACT_STATUSES, FACT_TYPES } from "../../shared/evidence.ts";
import { MEMORY_QUESTIONS, OUTCOME_RESULTS, type MemoryAnswer, type OutcomeRecord, type OutcomeResult } from "../../shared/knowledge.ts";
import { FOREIGN_KINDS, type ForeignElement, type ForeignRoute, type ForeignKind } from "../../shared/foreign.ts";
import type { DocumentQuality } from "../../shared/quality.ts";
import { dmy } from "../../shared/dates.ts";
import { factProvenance } from "../../lib/verification/provenance.ts";
import type { SourceLink } from "./Notebook.tsx";
import { MemoryEditor } from "./MatterAdminViews.tsx";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** Phase 6 (P2): the provenance value of one fact, as the badge shows it. */
function factProvenanceLabel(f: FactRecord): string {
  return factProvenance({ author: f.author, sourceId: f.sourceId, anchorId: f.anchorId }).value.replace(/_/g, " ");
}

function SourceButton(props: { sourceId: string | null; sourceName: string | null; page: number | null; line: number | null; onOpen: (l: SourceLink) => void }) {
  if (!props.sourceId || !props.page || !props.line) return <Text type="supporting">No line anchor</Text>;
  return <button type="button" className="link" onClick={() => props.onOpen({ sourceId: props.sourceId!, page: props.page!, line: props.line! })}>{props.sourceName ?? "source"}, p. {props.page}, l. {props.line}</button>;
}

// ---- Facts and timelines ----

export function FactsPanel(props: { matterId: string; version: number; onOpenSource: (l: SourceLink) => void; onChanged: () => void }) {
  const [facts, setFacts] = useState<FactRecord[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"facts" | "timeline">("facts");
  const [timelineKind, setTimelineKind] = useState("all");
  const [split, setSplit] = useState("");
  const [supersede, setSupersede] = useState<{ id: string; text: string } | null>(null);
  const [link, setLink] = useState<{ id: string; issues: string; arguments: string; relief: string } | null>(null);
  const [issues, setIssues] = useState<Awaited<ReturnType<typeof api.getResearch>>["issues"]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const [f, c, t] = await Promise.all([api.evidenceFacts(props.matterId, { status: status || undefined, type: type || undefined, q: q || undefined }), api.evidenceContradictions(props.matterId), api.timeline(props.matterId)]);
      setFacts(f);
      setContradictions(c);
      setTimeline(t);
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId, status, type, q]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  useEffect(() => {
    void api.getResearch(props.matterId).then((r) => setIssues(r.issues), () => setIssues([]));
  }, [props.matterId]);
  const decide = async (id: string, next: "confirmed" | "disputed" | "rejected") => {
    await api.evidenceDecideFact(props.matterId, id, next);
    await load();
    props.onChanged();
  };
  const saveSupersede = async () => {
    if (!supersede) return;
    await api.evidenceSupersedeFact(props.matterId, supersede.id, { text: supersede.text });
    setSupersede(null);
    await load();
    props.onChanged();
  };
  const saveLink = async () => {
    if (!link) return;
    await api.evidenceLinkFact(props.matterId, link.id, {
      issueIds: link.issues.split(",").map((x) => x.trim()).filter(Boolean),
      argumentIds: link.arguments.split(",").map((x) => x.trim()).filter(Boolean),
      relief: link.relief,
    });
    setLink(null);
    await load();
    props.onChanged();
  };
  const shown = timelineKind === "all" ? timeline : timeline.filter((e) => e.kind === timelineKind);
  const before = split ? shown.filter((e) => e.date && e.date < split) : [];
  const after = split ? shown.filter((e) => e.date && e.date >= split) : [];
  return (
    <section className="work-section" aria-label="Facts and chronology" data-testid="facts-panel">
      <div className="section-header">
        <Heading level={3}>Facts and chronology</Heading>
        <div className="row-actions">
          <Button label="Facts" size="sm" variant={view === "facts" ? "primary" : "ghost"} onClick={() => setView("facts")} />
          <Button label="Timelines" size="sm" variant={view === "timeline" ? "primary" : "ghost"} onClick={() => setView("timeline")} />
        </div>
      </div>
      <Text type="supporting">A fact is a candidate until you confirm it. A contradiction stays visible; the system never chooses the right value. Every fact keeps its source line.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {view === "facts" ? (
        <>
          <div className="row-actions">
            <select aria-label="Filter facts by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Every status</option>
              {FACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select aria-label="Filter facts by type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Every type</option>
              {FACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input aria-label="Search facts" placeholder="Search facts" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {contradictions.length ? (
            <div className="notice" data-testid="contradictions">
              <Text weight="semibold">{contradictions.length} contradiction(s) found. Open the Review tab to decide each one.</Text>
              <ul className="plain-list">
                {contradictions.slice(0, 8).map((c) => <li key={c.key}><Badge variant="warning" label={c.kind} /> {c.values.map((v) => v.value).join(" / ")}: {c.values[0]?.text.slice(0, 100)}</li>)}
              </ul>
            </div>
          ) : null}
          {facts.length === 0 ? <Text type="supporting">No fact is recorded yet. Facts appear when a source is read.</Text> : null}
          <ul className="plain-list" data-testid="fact-list">
            {facts.map((f) => (
              <li key={f.id} className="phase4-row" data-testid="fact-row" data-status={f.status}>
                <div className="phase4-main">
                  <div className="phase4-head">
                    <StatusDot variant={f.status === "confirmed" ? "success" : f.status === "disputed" ? "warning" : f.status === "rejected" ? "error" : "neutral"} label={f.status} />
                    <Badge variant="neutral" label={f.type} />
                    {f.date ? <Badge variant="info" label={dmy(f.date)} /> : null}
                    {f.amount ? <Badge variant="neutral" label={`₹ ${f.amount}`} /> : null}
                    <Badge variant="neutral" label={factProvenanceLabel(f)} />
                  </div>
                  <Text>{f.text}</Text>
                  <Text type="supporting"><SourceButton sourceId={f.sourceId} sourceName={f.sourceName} page={f.page} line={f.line} onOpen={props.onOpenSource} />{f.parties.length ? ` · ${f.parties.join(" / ")}` : ""}{f.issueIds.length ? ` · ${f.issueIds.length} issue link(s)` : ""}</Text>
                </div>
                <div className="row-actions">
                  {f.status !== "confirmed" ? <Button label="Confirm" size="sm" clickAction={() => decide(f.id, "confirmed")} /> : null}
                  {f.status !== "disputed" ? <Button label="Dispute" size="sm" variant="ghost" clickAction={() => decide(f.id, "disputed")} /> : null}
                  {f.status !== "rejected" ? <Button label="Reject" size="sm" variant="ghost" clickAction={() => decide(f.id, "rejected")} /> : null}
                  <Button label="Correct" size="sm" variant="ghost" onClick={() => setSupersede({ id: f.id, text: f.text })} />
                  <Button label="Links" size="sm" variant="ghost" onClick={() => setLink({ id: f.id, issues: f.issueIds.join(","), arguments: f.argumentIds.join(","), relief: f.relief })} />
                </div>
                {link?.id === f.id ? (
                  <div className="phase4-edit">
                    <select aria-label="Issue link" value="" onChange={(e) => { if (e.target.value) setLink({ ...link, issues: [...link.issues.split(",").filter(Boolean), e.target.value].join(",") }); }}>
                      <option value="">Add an issue</option>
                      {issues.map((i) => <option key={i.id} value={i.id}>{i.text.slice(0, 80)}</option>)}
                    </select>
                    <input aria-label="Issue ids" placeholder="Issue ids" value={link.issues} onChange={(e) => setLink({ ...link, issues: e.target.value })} />
                    <input aria-label="Argument ids" placeholder="Argument ids" value={link.arguments} onChange={(e) => setLink({ ...link, arguments: e.target.value })} />
                    <input aria-label="Relief link" placeholder="Relief this fact supports" value={link.relief} onChange={(e) => setLink({ ...link, relief: e.target.value })} />
                    <Button label="Save the links" size="sm" clickAction={saveLink} />
                    <Button label="Cancel" size="sm" variant="ghost" onClick={() => setLink(null)} />
                  </div>
                ) : null}
                {supersede?.id === f.id ? (
                  <div className="phase4-edit">
                    <input aria-label="Corrected fact" value={supersede.text} onChange={(e) => setSupersede({ ...supersede, text: e.target.value })} />
                    <Button label="Save the correction" size="sm" clickAction={saveSupersede} />
                    <Button label="Cancel" size="sm" variant="ghost" onClick={() => setSupersede(null)} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="row-actions">
            <select aria-label="Timeline kind" value={timelineKind} onChange={(e) => setTimelineKind(e.target.value)}>
              {["all", "procedural", "factual", "payment", "communication", "order", "limitation"].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <label className="field inline">Compare before/after <input type="date" aria-label="Compare date" value={split} onChange={(e) => setSplit(e.target.value)} /></label>
          </div>
          {split ? (
            <div className="timeline-split">
              <div><Text weight="semibold">Before {dmy(split)}</Text><ul className="plain-list">{before.map((e) => <li key={e.id}>{dmy(e.date)}: {e.text}</li>)}</ul></div>
              <div><Text weight="semibold">On or after {dmy(split)}</Text><ul className="plain-list">{after.map((e) => <li key={e.id}>{dmy(e.date)}: {e.text}</li>)}</ul></div>
            </div>
          ) : (
            <ul className="plain-list" data-testid="timeline">
              {shown.map((e) => (
                <li key={e.id} className="phase4-row">
                  <div className="phase4-main">
                    <div className="phase4-head"><Badge variant="neutral" label={e.kind} /><Text weight="semibold">{dmy(e.date)}</Text>{e.dateEnd && e.dateEnd !== e.date ? <Text type="supporting">to {dmy(e.dateEnd)}</Text> : null}</div>
                    <Text>{e.text}</Text>
                    <Text type="supporting"><SourceButton sourceId={e.sourceId} sourceName={e.sourceName} page={e.page} line={e.line} onOpen={props.onOpenSource} /></Text>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ---- Evidence repository and document operations ----

function parsePages(text: string): number[] {
  return text.split(/[,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
}

export function EvidencePanel(props: { matterId: string; sources: SourceRecord[]; version: number; onChanged: () => void; onOpenSource: (l: SourceLink) => void }) {
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [relations, setRelations] = useState<SourceRelation[]>([]);
  const [operations, setOperations] = useState<DocumentOperation[]>([]);
  const [marks, setMarks] = useState<PageMark[]>([]);
  const [edges, setEdges] = useState<MatterEdge[]>([]);
  const [quality, setQuality] = useState<Record<string, DocumentQuality>>({});
  const [form, setForm] = useState({ sourceId: "", exhibitNumber: "", witness: "", statement: "", givenBy: "", givenAt: "", electronic: false, device: "", admissibility: "", notes: "" });
  const [op, setOp] = useState({ kind: "extract", sourceId: "", sourceIds: [] as string[], pages: "", ranges: "", order: "", page: "1", x: "0.1", y: "0.1", w: "0.4", h: "0.1" });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const [e, r, o, m, g] = await Promise.all([api.evidenceList(props.matterId), api.evidenceRelations(props.matterId), api.documentOperations(props.matterId), api.evidenceMarks(props.matterId), api.evidenceEdges(props.matterId)]);
      setItems(e);
      setRelations(r);
      setOperations(o);
      setMarks(m);
      setEdges(g);
      const scores = await Promise.all(props.sources.map(async (s) => [s.id, await api.documentQuality(props.matterId, s.id)] as const));
      setQuality(Object.fromEntries(scores));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const add = async () => {
    try {
      await api.evidenceAdd(props.matterId, form);
      setForm({ sourceId: "", exhibitNumber: "", witness: "", statement: "", givenBy: "", givenAt: "", electronic: false, device: "", admissibility: "", notes: "" });
      await load();
      props.onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const update = async (id: string, input: Parameters<typeof api.evidenceUpdate>[2]) => {
    try {
      await api.evidenceUpdate(props.matterId, id, input);
      await load();
      props.onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const run = async () => {
    try {
      setNote(null);
      const input: Parameters<typeof api.documentOperation>[1] = { kind: op.kind as never, sourceId: op.sourceId || undefined };
      if (op.kind === "extract") input.pages = parsePages(op.pages);
      if (op.kind === "split") input.ranges = op.ranges.split(";").map(parsePages).filter((r) => r.length);
      if (op.kind === "merge") input.sourceIds = op.sourceIds;
      if (op.kind === "reorder") input.order = parsePages(op.order);
      if (["annotate", "highlight", "redact"].includes(op.kind)) input.area = { page: Number(op.page), x: Number(op.x), y: Number(op.y), w: Number(op.w), h: Number(op.h) };
      const r = await api.documentOperation(props.matterId, input);
      setNote(`Made ${r.sources.length} new document(s): ${r.sources.map((s) => s.name).join(", ")}.`);
      await load();
      props.onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="work-section" aria-label="Documents and evidence" data-testid="evidence-panel">
      <Heading level={3}>Documents and evidence</Heading>
      <Text type="supporting">The exhibit, the witness and the chain of custody. The hash is the source's bytes. Authenticity and admissibility are yours to record.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {note ? <div className="notice" role="status">{note}</div> : null}
      <Heading level={4}>Document quality</Heading>
      <Text type="supporting">The score of each document: a blank page, a duplicate, a missing page, a low OCR confidence, blur, skew or a short read. A page read as text has no image metrics, and the score says so.</Text>
      <ul className="plain-list" data-testid="document-quality">
        {props.sources.map((s) => {
          const q = quality[s.id];
          return (
            <li key={s.id} className="phase4-row" data-testid="document-quality-row">
              <div className="phase4-main">
                <div className="phase4-head">
                  <Badge variant={!q || q.score >= 85 ? "success" : q.score >= 70 ? "warning" : "error"} label={q ? `${q.score}/100` : "no pages"} />
                  <Text weight="semibold">{s.name}</Text>
                </div>
                <Text type="supporting">{q ? `${q.pages} page${q.pages === 1 ? "" : "s"}${q.expectedPages ? ` of ${q.expectedPages}` : ""}. ${q.imageMetrics ? "Image metrics recorded." : "Image metrics not recorded."}` : "The document has not been read yet."}</Text>
                {q?.issues.length ? <Text type="supporting">{q.issues.slice(0, 4).map((i) => i.detail).join(" ")}{q.issues.length > 4 ? ` ${q.issues.length - 4} more issue(s).` : ""}</Text> : null}
              </div>
            </li>
          );
        })}
        {props.sources.length === 0 ? <li><Text type="supporting">No document yet.</Text></li> : null}
      </ul>
      <div className="phase4-form">
        <select aria-label="Evidence source" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
          <option value="">Choose a source</option>
          {props.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input aria-label="Exhibit number" placeholder="Exhibit P-1" value={form.exhibitNumber} onChange={(e) => setForm({ ...form, exhibitNumber: e.target.value })} />
        <input aria-label="Witness" placeholder="Witness" value={form.witness} onChange={(e) => setForm({ ...form, witness: e.target.value })} />
        <input aria-label="Given by" placeholder="Given by" value={form.givenBy} onChange={(e) => setForm({ ...form, givenBy: e.target.value })} />
        <input aria-label="Given at" placeholder="When and where" value={form.givenAt} onChange={(e) => setForm({ ...form, givenAt: e.target.value })} />
        <label className="field inline"><input type="checkbox" checked={form.electronic} onChange={(e) => setForm({ ...form, electronic: e.target.checked })} /> Electronic evidence</label>
        <input aria-label="Device" placeholder="Device or platform" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} />
        <input aria-label="Admissibility" placeholder="Admissibility note" value={form.admissibility} onChange={(e) => setForm({ ...form, admissibility: e.target.value })} />
        <input aria-label="Evidence notes" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button label="Add the evidence" size="sm" isDisabled={!form.sourceId} clickAction={add} data-testid="evidence-add" />
      </div>
      <ul className="plain-list" data-testid="evidence-list">
        {items.map((e) => (
          <li key={e.id} className="phase4-row" data-testid="evidence-row">
            <div className="phase4-main">
              <div className="phase4-head"><Badge variant={e.authenticity === "authentic" ? "success" : e.authenticity === "disputed" ? "warning" : "neutral"} label={e.authenticity} /><Text weight="semibold">{e.exhibitNumber || "No exhibit number"}</Text><Text type="supporting">{e.sourceName}</Text></div>
              <Text>{e.statement || e.notes || "No statement yet."}</Text>
              <Text type="supporting">{e.witness ? `Witness: ${e.witness}. ` : ""}{e.givenBy ? `Given by ${e.givenBy}${e.givenAt ? `, ${e.givenAt}` : ""}. ` : ""}{e.electronic ? `Electronic${e.device ? ` (${e.device})` : ""}. ` : ""}Hash {e.hash.slice(0, 12)}…</Text>
              <Text type="supporting">Admissibility: {e.admissibility || "not recorded"}.</Text>
            </div>
            <div className="row-actions">
              <select aria-label={`Authenticity of ${e.exhibitNumber}`} value={e.authenticity} onChange={(ev) => void update(e.id, { authenticity: ev.target.value as never })}>
                {["candidate", "authentic", "disputed", "rejected"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <Button label="Notes" size="sm" variant="ghost" onClick={() => { const n = window.prompt("Admissibility and notes", `${e.admissibility}\n${e.notes}`); if (n !== null) { const [a, ...rest] = n.split("\n"); void update(e.id, { admissibility: a, notes: rest.join("\n") }); } }} />
            </div>
          </li>
        ))}
        {items.length === 0 ? <li><Text type="supporting">No evidence is recorded yet.</Text></li> : null}
      </ul>
      <Heading level={4}>Source relations</Heading>
      <Text type="supporting">A version, a reply, a certified copy or an annexure. Decide each proposal; nothing is merged.</Text>
      <ul className="plain-list" data-testid="source-relations">
        {relations.map((r) => (
          <li key={`${r.sourceA}:${r.sourceB}:${r.relation}`} className="phase4-row">
            <div className="phase4-main"><Text weight="semibold">{r.nameA} — {r.nameB}</Text><Text type="supporting">{r.relation.replace(/_/g, " ")}: {r.reason} ({Math.round(r.confidence * 100)}%)</Text></div>
            {r.reviewItemId && !r.decision ? <div className="row-actions"><Button label="Same" size="sm" clickAction={async () => { await api.evidenceDecideRelation(props.matterId, r.reviewItemId!, "same"); await load(); }} /><Button label="Different" size="sm" variant="ghost" clickAction={async () => { await api.evidenceDecideRelation(props.matterId, r.reviewItemId!, "different"); await load(); }} /></div> : <Text type="supporting">{r.decision ?? "recorded"}</Text>}
          </li>
        ))}
        {relations.length === 0 ? <li><Text type="supporting">No relation is proposed.</Text></li> : null}
      </ul>
      <Heading level={4}>Document operations</Heading>
      <Text type="supporting">Every operation writes a new source; the original is never changed. A redaction records the original hash and the area in its log.</Text>
      <div className="phase4-form">
        <select aria-label="Operation" value={op.kind} onChange={(e) => setOp({ ...op, kind: e.target.value })}>
          {["extract", "split", "merge", "reorder", "annotate", "highlight", "redact"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select aria-label="Operation source" value={op.sourceId} onChange={(e) => setOp({ ...op, sourceId: e.target.value })}>
          <option value="">Choose a source</option>
          {props.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {op.kind === "extract" ? <input aria-label="Pages to extract" placeholder="Pages: 1,3" value={op.pages} onChange={(e) => setOp({ ...op, pages: e.target.value })} /> : null}
        {op.kind === "split" ? <input aria-label="Split ranges" placeholder="Ranges: 1-2; 3-4" value={op.ranges} onChange={(e) => setOp({ ...op, ranges: e.target.value })} /> : null}
        {op.kind === "merge" ? <select aria-label="Merge sources" multiple value={op.sourceIds} onChange={(e) => setOp({ ...op, sourceIds: [...e.target.selectedOptions].map((o) => o.value) })}>{props.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : null}
        {op.kind === "reorder" ? <input aria-label="Page order" placeholder="Order: 3,2,1" value={op.order} onChange={(e) => setOp({ ...op, order: e.target.value })} /> : null}
        {["annotate", "highlight", "redact"].includes(op.kind) ? (
          <>
            <input aria-label="Page" placeholder="Page" value={op.page} onChange={(e) => setOp({ ...op, page: e.target.value })} />
            <input aria-label="Area x" placeholder="x (0-1)" value={op.x} onChange={(e) => setOp({ ...op, x: e.target.value })} />
            <input aria-label="Area y" placeholder="y (0-1)" value={op.y} onChange={(e) => setOp({ ...op, y: e.target.value })} />
            <input aria-label="Area width" placeholder="width (0-1)" value={op.w} onChange={(e) => setOp({ ...op, w: e.target.value })} />
            <input aria-label="Area height" placeholder="height (0-1)" value={op.h} onChange={(e) => setOp({ ...op, h: e.target.value })} />
          </>
        ) : null}
        <Button label="Run the operation" size="sm" isDisabled={op.kind === "merge" ? op.sourceIds.length < 2 : !op.sourceId} clickAction={run} data-testid="docops-run" />
      </div>
      <ul className="plain-list" data-testid="document-operations">
        {operations.map((o) => <li key={o.id}><Text type="supporting">{o.kind} on {o.inputs.map((i) => i.sourceId.slice(0, 8)).join(", ")} → {o.outputSourceId ? o.outputSourceId.slice(0, 8) : "no output"} at {o.createdAt.slice(0, 16).replace("T", " ")}</Text></li>)}
        {operations.length === 0 ? <li><Text type="supporting">No operation yet.</Text></li> : null}
      </ul>
      <details>
        <summary>Page marks and graph edges</summary>
        <Text type="supporting">{marks.length} mark(s), {edges.length} edge(s).</Text>
        <ul className="plain-list">{marks.map((m) => <li key={m.id}>{m.kind} on {m.sourceId.slice(0, 8)}, p. {m.page} ({Math.round(m.confidence * 100)}%)</li>)}</ul>
      </details>
    </section>
  );
}

// ---- Document structure ----

export function StructurePanel(props: { matterId: string; version: number; onOpenSource: (l: SourceLink) => void }) {
  const [parts, setParts] = useState<DocumentPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.evidenceParts(props.matterId).then(setParts, (e) => setError(errorText(e)));
  }, [props.matterId, props.version]);
  const bySource = new Map<string, DocumentPart[]>();
  for (const p of parts) bySource.set(p.sourceName, [...(bySource.get(p.sourceName) ?? []), p]);
  return (
    <section className="work-section" aria-label="Document structure" data-testid="structure-panel">
      <Heading level={3}>Document structure</Heading>
      <Text type="supporting">The parts of each document: the title, parties, facts, grounds, prayer, allegations, admissions, denials, witnesses, exhibits, directions and annexures, each with its line.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {parts.length === 0 ? <Text type="supporting">No structure is read yet.</Text> : null}
      {[...bySource.entries()].map(([source, list]) => (
        <section key={source} className="phase4-structure" aria-label={source}>
          <Heading level={4}>{source}</Heading>
          <ul className="plain-list">
            {list.map((p) => (
              <li key={p.id} className="phase4-row">
                <div className="phase4-main"><div className="phase4-head"><Badge variant="neutral" label={p.kind} />{p.ref ? <Badge variant="info" label={p.ref} /> : null}</div><Text>{p.text}</Text></div>
                <SourceButton sourceId={p.sourceId} sourceName={p.sourceName} page={p.page} line={p.line} onOpen={props.onOpenSource} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

// ---- Jurisdiction ----

export function JurisdictionPanel(props: { matterId: string; version: number; onOpenSource: (l: SourceLink) => void }) {
  const [report, setReport] = useState<JurisdictionReport | null>(null);
  const [clauses, setClauses] = useState<ForumClause[]>([]);
  const [draft, setDraft] = useState<JurisdictionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [foreign, setForeign] = useState<ForeignElement[]>([]);
  const [routes, setRoutes] = useState<ForeignRoute[]>([]);
  const [foreignForm, setForeignForm] = useState({ kind: "foreign_party" as ForeignKind, subject: "", country: "", detail: "" });
  const load = useCallback(async () => {
    try {
      const [r, c, f, fr] = await Promise.all([api.jurisdictionGet(props.matterId), api.forumClauses(props.matterId), api.listForeignElements(props.matterId), api.foreignRoutes(props.matterId)]);
      setReport(r);
      setDraft(r);
      setClauses(c);
      setForeign(f);
      setRoutes(fr);
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const save = async () => {
    if (!draft) return;
    try {
      setError(null);
      setReport(await api.jurisdictionSet(props.matterId, draft));
      setNote("The jurisdiction report is saved.");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const addForeign = async () => {
    try {
      setError(null);
      await api.addForeignElement(props.matterId, foreignForm);
      setForeignForm({ ...foreignForm, subject: "", country: "", detail: "" });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const decideForeign = async (id: string, decision: "confirmed" | "rejected") => {
    try {
      setError(null);
      await api.decideForeignElement(props.matterId, id, decision);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!report || !draft) return <section className="work-section" data-testid="jurisdiction-panel"><Heading level={3}>Jurisdiction</Heading><Text type="supporting">No report yet. It is built after the record is read.</Text>{error ? <div className="notice" role="alert">{error}</div> : null}</section>;
  return (
    <section className="work-section" aria-label="Jurisdiction" data-testid="jurisdiction-panel">
      <div className="section-header"><Heading level={3}>Jurisdiction</Heading><Button label="Save the report" size="sm" clickAction={save} data-testid="jurisdiction-save" /></div>
      <Text type="supporting">The report is built from the matter profile, the court directory, the court packs, the limitation record and the clauses in the record. A field that cannot be settled says "Undetermined".</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {note ? <div className="notice" role="status">{note}</div> : null}
      {report.undetermined ? <div className="notice" data-testid="jurisdiction-undetermined"><Text weight="semibold">Undetermined fields</Text><Text>{report.unresolvedFacts.join("; ") || "The report is incomplete."}</Text></div> : null}
      <div className="field-grid">
        <label className="field">Forum<input value={draft.forum} onChange={(e) => setDraft({ ...draft, forum: e.target.value })} /></label>
        <label className="field">Court type<input value={draft.courtType} onChange={(e) => setDraft({ ...draft, courtType: e.target.value })} /></label>
        <label className="field">Territorial basis<input value={draft.territorialBasis} onChange={(e) => setDraft({ ...draft, territorialBasis: e.target.value })} /></label>
        <label className="field">Subject basis<input value={draft.subjectBasis} onChange={(e) => setDraft({ ...draft, subjectBasis: e.target.value })} /></label>
        <label className="field">Limitation<input value={draft.limitation} onChange={(e) => setDraft({ ...draft, limitation: e.target.value })} /></label>
        <label className="field">Appeal route<input value={draft.appealRoute} onChange={(e) => setDraft({ ...draft, appealRoute: e.target.value })} /></label>
      </div>
      <label className="field">Governing provisions<input value={draft.provisions.join(", ")} onChange={(e) => setDraft({ ...draft, provisions: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
      <label className="field">Alternative forums<input value={draft.alternativeForums.join(", ")} onChange={(e) => setDraft({ ...draft, alternativeForums: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
      <label className="field">Applicable rules<input value={draft.applicableRules.join(", ")} onChange={(e) => setDraft({ ...draft, applicableRules: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
      <Text type="supporting">Basis: {draft.basis.join(" ") || "No basis is recorded."}</Text>
      <Heading level={4}>Forum clauses</Heading>
      <ul className="plain-list" data-testid="forum-clauses">
        {clauses.map((c) => <li key={c.id} className="phase4-row"><div className="phase4-main"><div className="phase4-head"><Badge variant="warning" label={c.kind.replace(/_/g, " ")} /><Text type="supporting">{c.sourceName}, p. {c.page}, l. {c.line}</Text></div><Text>{c.text}</Text></div><SourceButton sourceId={c.sourceId} sourceName={c.sourceName} page={c.page} line={c.line} onOpen={props.onOpenSource} /></li>)}
        {clauses.length === 0 ? <li><Text type="supporting">No forum clause is read.</Text></li> : null}
      </ul>
      <Heading level={4}>Foreign elements</Heading>
      <Text type="supporting">A foreign party, judgment, award, seat or asset opens a route. The record must name the country; a name alone is never a guess. A route is a question for you, with its provisions and source.</Text>
      <div className="phase4-form">
        <select aria-label="Foreign element kind" value={foreignForm.kind} onChange={(e) => setForeignForm({ ...foreignForm, kind: e.target.value as ForeignKind })}>
          {FOREIGN_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
        </select>
        <input aria-label="Foreign element subject" placeholder="The party, judgment, award, seat or asset" value={foreignForm.subject} onChange={(e) => setForeignForm({ ...foreignForm, subject: e.target.value })} />
        <input aria-label="Foreign element country" placeholder="Country" value={foreignForm.country} onChange={(e) => setForeignForm({ ...foreignForm, country: e.target.value })} />
        <input aria-label="Foreign element detail" placeholder="Where it was read (optional)" value={foreignForm.detail} onChange={(e) => setForeignForm({ ...foreignForm, detail: e.target.value })} />
        <Button label="Add the element" size="sm" isDisabled={!foreignForm.subject.trim()} clickAction={addForeign} data-testid="foreign-add" />
      </div>
      <ul className="plain-list" data-testid="foreign-elements">
        {foreign.map((f) => (
          <li key={f.id} className="phase4-row" data-status={f.status} data-testid="foreign-element">
            <div className="phase4-main">
              <div className="phase4-head"><Badge variant={f.status === "confirmed" ? "success" : f.status === "rejected" ? "error" : "warning"} label={f.status} /><Badge variant="neutral" label={f.kind.replace(/_/g, " ")} /></div>
              <Text weight="semibold">{f.subject}{f.country ? ` — ${f.country}` : ""}</Text>
              {f.detail ? <Text type="supporting">{f.detail}</Text> : null}
            </div>
            {f.status === "proposed" ? (
              <div className="row-actions">
                <Button label="Confirm" size="sm" clickAction={() => decideForeign(f.id, "confirmed")} />
                <Button label="Reject" size="sm" variant="ghost" clickAction={() => decideForeign(f.id, "rejected")} />
              </div>
            ) : null}
          </li>
        ))}
        {foreign.length === 0 ? <li><Text type="supporting">No foreign element is recorded. A forum clause that names another country is proposed after the record is read.</Text></li> : null}
      </ul>
      <Heading level={4}>Routes</Heading>
      <ul className="plain-list" data-testid="foreign-routes">
        {routes.map((r) => (
          <li key={`${r.route}|${r.basis}`} className="phase4-row" data-status={r.status}>
            <div className="phase4-main">
              <div className="phase4-head"><Badge variant={r.status === "confirmed" ? "success" : "warning"} label={r.status === "confirmed" ? "element confirmed" : "element proposed"} /></div>
              <Text weight="semibold">{r.route}</Text>
              <Text type="supporting">{r.basis}. Source: {r.source}. {r.note}</Text>
            </div>
          </li>
        ))}
        {routes.length === 0 ? <li><Text type="supporting">No route is open until an element is recorded.</Text></li> : null}
      </ul>
    </section>
  );
}

// ---- Typed matter memory ----

export function MemoryPanel(props: { matterId: string; version: number; onChanged: () => void }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.matterMemory>>>([]);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ type: "fact_from_document", subject: "", relation: "is", object: "" });
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState(MEMORY_QUESTIONS[0].question);
  const [answer, setAnswer] = useState<MemoryAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [outcomeForm, setOutcomeForm] = useState({ result: "disposed" as OutcomeResult, subject: "", court: "", decidedOn: new Date().toISOString().slice(0, 10), summary: "", supersedes: "" });
  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api.matterMemory(props.matterId, { status: status || undefined, type: type || undefined, q: q || undefined }));
      setOutcomes(await api.listOutcomes(props.matterId));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId, status, type, q]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const propose = async () => {
    try {
      await api.matterMemoryPropose(props.matterId, form);
      setForm({ ...form, subject: "", object: "" });
      await load();
      props.onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const decide = async (id: string, next: string) => {
    await api.matterMemoryDecide(props.matterId, id, next);
    await load();
    props.onChanged();
  };
  const ask = async (text: string) => {
    try {
      setAsking(true);
      setError(null);
      setQuestion(text);
      setAnswer(await api.answerMemory(props.matterId, text));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setAsking(false);
    }
  };
  const recordOutcome = async () => {
    try {
      setError(null);
      await api.recordOutcome(props.matterId, {
        result: outcomeForm.result,
        subject: outcomeForm.subject,
        court: outcomeForm.court,
        decidedOn: outcomeForm.decidedOn,
        summary: outcomeForm.summary,
        supersedes: outcomeForm.supersedes || null,
      });
      setOutcomeForm({ result: "disposed", subject: "", court: "", decidedOn: new Date().toISOString().slice(0, 10), summary: "", supersedes: "" });
      await load();
      props.onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="work-section" aria-label="Matter memory" data-testid="memory-panel">
      <Heading level={3}>Typed matter memory</Heading>
      <Text type="supporting">Facts, admissions, disputes, missing facts, decisions, orders, open questions and case-theory changes. Only you confirm. A correction supersedes the old record; the history stays.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <Heading level={4}>Ask the memory</Heading>
      <Text type="supporting">Six questions answered from the typed memory and the record. Every line names its records; a missing record is a gap, never an invention.</Text>
      <div className="row-actions">
        {MEMORY_QUESTIONS.map((item) => (
          <Button key={item.kind} label={item.title} size="sm" variant="ghost" isDisabled={asking} clickAction={() => ask(item.question)} data-testid={`memory-question-${item.kind}`} />
        ))}
      </div>
      <div className="row-actions">
        <input aria-label="Ask the matter's memory" placeholder="Or search the memory" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Button label="Ask" size="sm" isDisabled={asking || !question.trim()} clickAction={() => ask(question)} data-testid="memory-ask" />
      </div>
      {answer ? (
        <div className="notice" data-testid="memory-answer" data-kind={answer.kind}>
          <Text weight="semibold">{answer.title}</Text>
          <Text type="supporting">As of {answer.asOf.slice(0, 10)}. {answer.records.length} record{answer.records.length === 1 ? "" : "s"}.</Text>
          <ul className="plain-list">
            {answer.answer.map((line, i) => (
              <li key={`${answer.kind}:${i}`} className="phase4-row" data-testid="memory-answer-line">
                <Text>{line.text}</Text>
                {line.recordIds.length ? <Text type="supporting" className="mono">records: {line.recordIds.join(", ")}{line.anchors.length ? ` · anchors: ${line.anchors.join(", ")}` : ""}</Text> : null}
              </li>
            ))}
          </ul>
          {answer.gaps.length ? <Text type="supporting" data-testid="memory-answer-gaps">Gaps: {answer.gaps.join(" ")}</Text> : null}
          {answer.notRead.length ? <Text type="supporting">Not read: {answer.notRead.join(" ")}</Text> : null}
        </div>
      ) : null}
      <div className="row-actions">
        <select aria-label="Filter memory by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Every status</option>{["proposed", "tentative", "confirmed", "rejected", "superseded", "expired", "deprecated", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select aria-label="Filter memory by type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Every type</option>{["fact_from_document", "fact_from_party", "admission", "disputed_fact", "missing_fact", "client_instruction", "advocate_decision", "accepted_argument", "rejected_argument", "procedural_event"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input aria-label="Search memory" placeholder="Search memory" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="phase4-form">
        <select aria-label="New memory type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{["fact_from_document", "fact_from_party", "admission", "disputed_fact", "missing_fact", "client_instruction", "advocate_decision", "accepted_argument", "rejected_argument", "procedural_event"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input aria-label="Memory subject" placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <input aria-label="Memory relation" placeholder="Relation" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
        <input aria-label="Memory object" placeholder="Object" value={form.object} onChange={(e) => setForm({ ...form, object: e.target.value })} />
        <Button label="Propose the record" size="sm" isDisabled={!form.subject.trim() || !form.object.trim()} clickAction={propose} data-testid="memory-propose" />
      </div>
      <ul className="plain-list" data-testid="memory-list">
        {items.map((m) => (
          <li key={m.memoryId} className="phase4-row" data-status={m.status}>
            <div className="phase4-main">
              <div className="phase4-head"><Badge variant={m.status === "confirmed" ? "success" : m.status === "rejected" ? "error" : "neutral"} label={m.status} /><Badge variant="neutral" label={m.type.replace(/_/g, " ")} /></div>
              <Text weight="semibold">{m.subject} {m.relation} {m.object}</Text>
              <Text type="supporting">{m.proposedBy}, {m.recordedAt.slice(0, 10)}{m.supersedes ? "; corrects an earlier record" : ""}</Text>
            </div>
            <div className="row-actions">
              {m.status !== "confirmed" ? <Button label="Confirm" size="sm" clickAction={() => decide(m.memoryId, "confirmed")} /> : null}
              {m.status !== "rejected" ? <Button label="Reject" size="sm" variant="ghost" clickAction={() => decide(m.memoryId, "rejected")} /> : null}
              <Button label="Tentative" size="sm" variant="ghost" clickAction={() => decide(m.memoryId, "tentative")} />
              <Button label="Archive" size="sm" variant="ghost" clickAction={() => decide(m.memoryId, "archived")} />
            </div>
          </li>
        ))}
        {items.length === 0 ? <li><Text type="supporting">No typed memory yet.</Text></li> : null}
      </ul>
      <Heading level={4}>Outcome records</Heading>
      <Text type="supporting">What the court did, in your words. Only you enter it. A correction supersedes the old record; the history stays. The advocate memory graph reads the result and the legal subject, never a party or a piece of evidence.</Text>
      {outcomeForm.supersedes ? <Text type="supporting" data-testid="outcome-correcting">Correcting the outcome of {outcomeForm.decidedOn}. The old record stays and is marked superseded.</Text> : null}
      <div className="phase4-form">
        <select aria-label="Outcome result" value={outcomeForm.result} onChange={(e) => setOutcomeForm({ ...outcomeForm, result: e.target.value as OutcomeResult })}>
          {OUTCOME_RESULTS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
        <input aria-label="Outcome subject" placeholder="The legal question or the relief" value={outcomeForm.subject} onChange={(e) => setOutcomeForm({ ...outcomeForm, subject: e.target.value })} />
        <input aria-label="Outcome court" placeholder="Court (optional)" value={outcomeForm.court} onChange={(e) => setOutcomeForm({ ...outcomeForm, court: e.target.value })} />
        <input aria-label="Outcome date" type="date" value={outcomeForm.decidedOn} onChange={(e) => setOutcomeForm({ ...outcomeForm, decidedOn: e.target.value })} />
        <input aria-label="Outcome summary" placeholder="One line of the order (optional)" value={outcomeForm.summary} onChange={(e) => setOutcomeForm({ ...outcomeForm, summary: e.target.value })} />
        <Button label="Record the outcome" size="sm" isDisabled={!outcomeForm.subject.trim()} clickAction={recordOutcome} data-testid="outcome-record" />
      </div>
      <ul className="plain-list" data-testid="outcome-list">
        {outcomes.map((o) => (
          <li key={o.id} className="phase4-row" data-status={o.status}>
            <div className="phase4-main">
              <div className="phase4-head"><Badge variant={o.status === "active" ? "success" : "neutral"} label={o.status} /><Badge variant="neutral" label={o.result.replace(/_/g, " ")} /></div>
              <Text weight="semibold">{o.subject}</Text>
              <Text type="supporting">{[o.court || null, o.decidedOn, o.summary || null, `entered ${o.enteredAt.slice(0, 10)}`].filter(Boolean).join(" · ")}</Text>
            </div>
            {o.status === "active" ? (
              <div className="row-actions">
                <Button label="Correct" size="sm" variant="ghost" clickAction={() => setOutcomeForm({ result: o.result, subject: o.subject, court: o.court, decidedOn: o.decidedOn, summary: o.summary, supersedes: o.id })} data-testid="outcome-correct" />
              </div>
            ) : null}
          </li>
        ))}
        {outcomes.length === 0 ? <li><Text type="supporting">No outcome recorded yet.</Text></li> : null}
      </ul>
      <MemoryEditor matterId={props.matterId} />
    </section>
  );
}
