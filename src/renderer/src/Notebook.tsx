import { useState, type ReactNode } from "react";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import type { DateConflict, Notebook, NotebookEvent } from "../../shared/api.ts";
import { dmyRange } from "../../shared/dates.ts";

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
            </td>
            <td><SourceLinkButton e={e} onOpen={props.onOpen} /></td>
            {props.full ? <td>{e.reading === "ocr" ? "OCR, single reading" : "Text layer"}</td> : null}
            <td>{statusBadge(e)}</td>
            <td><Decide matterId={props.matterId} e={e} onChange={props.onChange} /></td>
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
  onChange: (nb: Notebook) => void;
  onOpen: (l: SourceLink) => void;
}) {
  const { tab, onTab: setTab } = props;
  const [showExcluded, setShowExcluded] = useState(false);
  const nb = props.nb;
  const events = nb?.events ?? [];
  const chronology = events.filter((e) => e.status !== "rejected" && (showExcluded || !e.excluded));
  return (
    <div className="notebook">
      <div className="readiness" data-testid="readiness">
        {nb ? (
          nb.readiness.ready ? (
            <Badge variant="success" label="Notebook ready" />
          ) : (
            <Badge variant="warning" label={`Not ready: ${nb.readiness.jobsPending} file(s) being read, ${nb.readiness.openReviewItems} review item(s) open`} />
          )
        ) : null}
        <Text type="supporting">
          {events.length} events, {events.filter((e) => e.status === "confirmed").length} confirmed. Events are extracted by fixed rules and stay candidates until you confirm them.
        </Text>
      </div>
      <TabList value={tab} onChange={setTab} size="sm" hasDivider role="tablist">
        <Tab value="matter" label="Matter" />
        <Tab value="review" label={props.reviewCount ? `Review (${props.reviewCount})` : "Review"} />
        <Tab value="sources" label="Sources" />
        <Tab value="procedural" label="Procedural history" />
        <Tab value="matrix" label="Factual Matrix" />
        <Tab value="chronology" label="Chronology" />
        <Tab value="records" label="Record table" />
        <Tab value="research" label="Studio" />
        <Tab value="filing" label="Filing" />
      </TabList>
      <div className="notebook-body">
        {tab !== "matter" && tab !== "research" && tab !== "filing" && tab !== "records" && tab !== "review" && nb ? <Conflicts matterId={props.matterId} nb={nb} onChange={props.onChange} onOpen={props.onOpen} /> : null}
        {tab === "matter" ? props.overview : null}
        {tab === "sources" ? props.sourcesPanel : null}
        {tab === "research" ? props.researchPanel : null}
        {tab === "records" ? props.recordPanel : null}
        {tab === "review" ? props.reviewPanel : null}
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
      </div>
    </div>
  );
}
