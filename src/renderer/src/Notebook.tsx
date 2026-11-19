import { useEffect, useState, type ReactNode } from "react";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { DateConflict, Notebook, NotebookEvent, NotebookSourceStatus } from "../../shared/api.ts";
import { dmyRange } from "../../shared/dates.ts";
import { CorrectEvent } from "./AuditPanels.tsx";

const api = window.openadvo;

export interface SourceLink {
  sourceId: string;
  page: number;
  line: number;
}

function dateCell(e: NotebookEvent) {
  return (
    <>
      {dmyRange(e.dateStart, e.dateEnd)}
      {e.dateType === "inferred" ? (
        <>
          {" "}
          <span title={`Inferred. As written: ${e.dateText}`}><Badge variant="warning" label="inferred" /></span>
        </>
      ) : null}
    </>
  );
}

function statusBadge(e: NotebookEvent) {
  if (e.status === "confirmed") return <Badge variant="success" label="Confirmed" />;
  if (e.status === "rejected") return <Badge variant="error" label="Rejected" />;
  return <Badge variant="neutral" label="Candidate" />;
}

function SourceLinkButton(props: { e: NotebookEvent; onOpen: (l: SourceLink) => void }) {
  return (
    <button type="button" className="link" onClick={() => props.onOpen({ sourceId: props.e.sourceId, page: props.e.page, line: props.e.line })}>
      {props.e.sourceName}, p. {props.e.page}, l. {props.e.line}
    </button>
  );
}

/** Human-only actions (decision 5). */
function Decide(props: { matterId: string; e: NotebookEvent; onChange: (nb: Notebook) => void }) {
  const { matterId, e, onChange } = props;
  return (
    <div className="row-actions">
      {e.status !== "confirmed" ? <Button label="Confirm" size="sm" clickAction={async () => onChange(await api.confirmEvent(matterId, e.id))} /> : null}
      {e.status !== "rejected" ? <Button label="Reject" size="sm" variant="ghost" clickAction={async () => onChange(await api.rejectEvent(matterId, e.id))} /> : null}
      {e.excluded ? (
        <Button label="Include" size="sm" variant="ghost" clickAction={async () => onChange(await api.includeEvent(matterId, e.id))} />
      ) : (
        <Button label="Exclude" size="sm" variant="ghost" clickAction={async () => onChange(await api.excludeEvent(matterId, e.id))} />
      )}
    </div>
  );
}

function Conflicts(props: { matterId: string; nb: Notebook; onChange: (nb: Notebook) => void; onOpen: (l: SourceLink) => void }) {
  const open = props.nb.conflicts.filter((c) => c.status === "open");
  if (open.length === 0) return null;
  const byId = new Map(props.nb.events.map((e) => [e.id, e]));
  return (
    <section className="conflicts" aria-label="Date conflicts">
      <Text weight="semibold">{open.length} date conflict(s). The system does not choose. Decide each one.</Text>
      {open.map((c: DateConflict) => {
        const a = byId.get(c.eventA)!;
        const b = byId.get(c.eventB)!;
        return (
          <div key={c.id} className="conflict">
            {[a, b].map((e) => (
              <div key={e.id} className="conflict-side">
                <div><b>{e.dateText}</b> — {e.description}</div>
                <SourceLinkButton e={e} onOpen={props.onOpen} />
                <Button label={`Keep ${e.dateText}`} size="sm" clickAction={async () => props.onChange(await api.resolveConflict(props.matterId, c.id, e.id))} />
              </div>
            ))}
            <Button label="Both dates are right" size="sm" variant="ghost" clickAction={async () => props.onChange(await api.resolveConflict(props.matterId, c.id, "both"))} />
            <details className="conflict-explain">
              <summary>What this means, and your options</summary>
              <Text type="supporting">
                The same event is dated {a.dateText} in {a.sourceName} (p. {a.page}, l. {a.line}) and {b.dateText} in {b.sourceName} (p. {b.page}, l. {b.line}). This is a disagreement in the record, not a decision by the system.
              </Text>
              <Text type="supporting">
                Your options: keep one date and exclude the other event; keep both when they are two different events; open each source and check the line; or correct the wrong event with its reason. If neither is clear, ask the agent to explain the two lines before you decide.
              </Text>
              <Button label="Ask the agent to explain this" size="sm" variant="ghost" clickAction={() => api.sendChat(props.matterId, `Explain the date conflict between these two Notebook events, with their source lines, and list the options for me. Do not decide it. Event A: ${a.dateText} — ${a.description} (${a.sourceName}, p. ${a.page}, l. ${a.line}). Event B: ${b.dateText} — ${b.description} (${b.sourceName}, p. ${b.page}, l. ${b.line}).`)} />
            </details>
          </div>
        );
      })}
    </section>
  );
}

function EventsTable(props: {
  label: string;
  events: NotebookEvent[];
  full: boolean;
  matterId: string;
  onChange: (nb: Notebook) => void;
  onOpen: (l: SourceLink) => void;
}) {
  if (props.events.length === 0) return <Text type="supporting">No events.</Text>;
  return (
    <table className="plain events-table" aria-label={props.label}>
      <thead>
        <tr>
          <th>Date</th>
          {props.full ? <th>As written</th> : null}
          {props.full ? <th>Type</th> : null}
          {props.full ? <th>Kind</th> : null}
          <th>Event</th>
          <th>Source</th>
          {props.full ? <th>Reading</th> : null}
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {props.events.map((e) => (
          <tr key={e.id} data-excluded={e.excluded} data-conflict={e.conflicts.length > 0}>
            <td className="nowrap">{dateCell(e)}</td>
            {props.full ? <td className="nowrap">{e.dateText}</td> : null}
            {props.full ? <td>{e.dateType}</td> : null}
            {props.full ? <td>{e.kind}</td> : null}
            <td>
              {e.description}
              {e.conflicts.length ? <> <Badge variant="warning" label="Date conflict" /></> : null}
              {e.excluded ? <> <Badge variant="neutral" label="Excluded" /></> : null}
              {e.corrected ? <> <span title={`Corrected ${e.corrected.at.slice(0, 10)}: ${e.corrected.reason}. As extracted: ${e.corrected.original.dateText}: ${e.corrected.original.description}`}><Badge variant="info" label="Corrected" /></span></> : null}
              {e.disputed === "open" ? <> <Badge variant="warning" label="OCR disputed" /></> : null}
              {e.disputed === "replaced" ? <> <Badge variant="warning" label="Line reading replaced" /></> : null}
              {e.conflicts.length || e.disputed || e.dateType === "inferred" || e.reading === "ocr" ? (
                <details className="conflict-explain">
                  <summary>Why this may be wrong, and your options</summary>
                  <Text type="supporting">
                    {e.conflicts.length
                      ? "Another source dates the same event differently. Read the conflict at the top of this tab, then keep one date, keep both when they are different events, or correct the wrong one."
                      : e.disputed === "open"
                        ? "The two OCR readings of this line differ. Read the page image, choose the reading that matches, or type the line yourself."
                        : e.dateType === "inferred"
                          ? `The date was inferred from the words "${e.dateText}". Check the base date the document uses. If it is wrong, correct the event with your reason.`
                          : "The text was read by OCR, a single reading. Check the page image before relying on this line. If the reading is wrong, correct the event or decide the OCR dispute."}
                  </Text>
                  <Button label="Ask the agent to explain this event" size="sm" variant="ghost" clickAction={() => api.sendChat(props.matterId, `Explain this Notebook event and its risks, and list my options. Do not decide it. Date: ${e.dateText}; event: ${e.description}; source: ${e.sourceName}, p. ${e.page}, l. ${e.line}; type: ${e.dateType}; reading: ${e.reading}; conflicts: ${e.conflicts.length}.`)} />
                </details>
              ) : null}
            </td>
            <td><SourceLinkButton e={e} onOpen={props.onOpen} /></td>
            {props.full ? <td>{e.reading === "ocr" ? "OCR, single reading" : "Text layer"}</td> : null}
            <td>{statusBadge(e)}</td>
            <td><Decide matterId={props.matterId} e={e} onChange={props.onChange} /><CorrectEvent matterId={props.matterId} event={e} onDone={props.onChange} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function NotebookView(props: {
  matterId: string;
  nb: Notebook | null;
  /** The open tab. The window owns it, so closing a source or a draft returns to the same tab. */
  tab: string;
  onTab: (tab: string) => void;
  overview: ReactNode;
  /** The Sources tab: add files and the list of sources. */
  sourcesPanel: ReactNode;
  /** Steps 6 to 10. */
  researchPanel: ReactNode;
  filingPanel: ReactNode;
  /** V1-5. */
  recordPanel: ReactNode;
  /** V3-2: the review inbox and how many items wait. */
  reviewPanel: ReactNode;
  reviewCount: number;
  /** V5-6. */
  entitiesPanel?: ReactNode;
  /** Phase 4. */
  factsPanel?: ReactNode;
  evidencePanel?: ReactNode;
  structurePanel?: ReactNode;
  jurisdictionPanel?: ReactNode;
  memoryPanel?: ReactNode;
  onChange: (nb: Notebook) => void;
  onOpen: (l: SourceLink) => void;
}) {
  const { tab, onTab: setTab } = props;
  const [showExcluded, setShowExcluded] = useState(false);
  const [status, setStatus] = useState<NotebookSourceStatus[] | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);
  const nb = props.nb;
  const events = nb?.events ?? [];
  const chronology = events.filter((e) => e.status !== "rejected" && (showExcluded || !e.excluded));
  const loadStatus = () => void api.notebookStatus(props.matterId).then(setStatus, () => setStatus([]));
  useEffect(loadStatus, [props.matterId, events.length, nb?.readiness.jobsPending, nb?.readiness.openReviewItems]);
  const rebuild = async () => {
    setRebuilding(true);
    setRebuildNote(null);
    try {
      const r = await api.rebuildNotebook(props.matterId);
      setStatus(r.status);
      props.onChange(await api.getNotebook(props.matterId));
      setRebuildNote(`Extraction re-ran over ${r.status.filter((s) => s.state === "read").length} read source(s); ${r.added} event(s) added.`);
    } catch (e) {
      setRebuildNote(`The rebuild failed: ${(e as Error).message}`);
    } finally {
      setRebuilding(false);
    }
  };
  return (
    <div className="notebook">
      <div className="readiness" data-testid="readiness">
        {status && status.length === 0 ? (
          <Badge variant="neutral" label="No source yet" />
        ) : nb ? (
          nb.readiness.ready ? (
            <Badge variant="success" label="Notebook ready" />
          ) : (
            <Badge variant="warning" label={`Not ready: ${nb.readiness.jobsPending} file(s) being read, ${nb.readiness.openReviewItems} review item(s) open`} />
          )
        ) : null}
        <Text type="supporting">
          {events.length} events, {events.filter((e) => e.status === "confirmed").length} confirmed. Events are extracted by fixed rules and stay candidates until you confirm them.
        </Text>
        <Button label={rebuilding ? "Re-running extraction…" : "Rebuild extraction"} size="sm" variant="ghost" isDisabled={rebuilding || (status?.length ?? 0) === 0} clickAction={rebuild} data-testid="notebook-rebuild" />
      </div>
      {status ? (
        <details className="work-section notebook-diagnosis" data-testid="notebook-diagnosis" open={events.length === 0 && status.length > 0}>
          <summary>Notebook diagnosis: {status.length} source{status.length === 1 ? "" : "s"}</summary>
          <Text type="supporting">
            Each source is read into pages and lines. The fixed extraction rules then look for dates on those lines. A file with no date gives no event. A scan needs OCR. Nothing here is a fact until you confirm it.
          </Text>
          {rebuildNote ? <div className="notice" role="status">{rebuildNote}</div> : null}
          <List density="compact">
            {status.map((s) => (
              <ListItem
                key={s.sourceId}
                data-testid={`notebook-source-${s.sourceId}`}
                data-state={s.state}
                startContent={<StatusDot variant={s.state === "read" ? (s.events ? "success" : "warning") : s.state === "failed" ? "error" : "neutral"} label={s.state} />}
                label={s.name}
                description={`${s.note}${s.extractedAt ? ` Last extraction ${s.extractedAt.slice(0, 16).replace("T", " ")} (${s.method ?? "rules"}).` : ""}`}
                endContent={<Text type="supporting">{s.events} event{s.events === 1 ? "" : "s"}</Text>}
              />
            ))}
          </List>
          {status.length === 0 ? <Text type="supporting">No source is in this matter. Add a document on the Sources tab, or ask the agent to fetch the case documents by case number.</Text> : null}
        </details>
      ) : null}
      <TabList value={tab} onChange={setTab} size="sm" hasDivider role="tablist">
        <Tab value="matter" label="Matter" />
        <Tab value="review" label={props.reviewCount ? `Review (${props.reviewCount})` : "Review"} />
        <Tab value="sources" label="Sources" />
        <Tab value="procedural" label="Procedural history" />
        <Tab value="matrix" label="Factual Matrix" />
        <Tab value="chronology" label="Chronology" />
        <Tab value="facts" label="Facts" />
        <Tab value="evidence" label="Evidence" />
        <Tab value="structure" label="Structure" />
        <Tab value="jurisdiction" label="Jurisdiction" />
        <Tab value="memory" label="Memory" />
        <Tab value="entities" label="Entities" />
        <Tab value="records" label="Record table" />
        <Tab value="research" label="Studio" />
        <Tab value="filing" label="Filing" />
      </TabList>
      <div className="notebook-body">
        {["procedural", "matrix", "chronology", "facts"].includes(tab) && nb ? <Conflicts matterId={props.matterId} nb={nb} onChange={props.onChange} onOpen={props.onOpen} /> : null}
        {tab === "matter" ? props.overview : null}
        {tab === "sources" ? props.sourcesPanel : null}
        {tab === "research" ? props.researchPanel : null}
        {tab === "records" ? props.recordPanel : null}
        {tab === "review" ? props.reviewPanel : null}
        {tab === "entities" ? props.entitiesPanel : null}
        {tab === "filing" ? props.filingPanel : null}
        {tab === "procedural" ? (
          <EventsTable label="Procedural history" events={events.filter((e) => e.kind === "procedural")} full={false} matterId={props.matterId} onChange={props.onChange} onOpen={props.onOpen} />
        ) : null}
        {tab === "matrix" ? (
          <EventsTable label="Factual Matrix" events={events} full matterId={props.matterId} onChange={props.onChange} onOpen={props.onOpen} />
        ) : null}
        {tab === "chronology" ? (
          <>
            <label className="toggle">
              <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> Show excluded events
            </label>
            <EventsTable label="Chronology" events={chronology} full={false} matterId={props.matterId} onChange={props.onChange} onOpen={props.onOpen} />
          </>
        ) : null}
        {tab === "facts" ? props.factsPanel : null}
        {tab === "evidence" ? props.evidencePanel : null}
        {tab === "structure" ? props.structurePanel : null}
        {tab === "jurisdiction" ? props.jurisdictionPanel : null}
        {tab === "memory" ? props.memoryPanel : null}
      </div>
    </div>
  );
}
