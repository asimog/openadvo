/**
 * V2 views (docs/specs/v2.md): the document type control (V2-2), the List of Dates rows (V2-5)
 * and the memory proposals (V2-8). No business logic: each action is one bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { MemoryProposal, NotebookEvent, SourceRecord } from "../../shared/api.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** The labels of the document types (lib/document-intelligence/classify.ts owns the list). */
export const DOC_TYPE_LABEL: Record<string, string> = {
  judgment: "Judgment",
  order: "Order",
  fir: "First information report",
  charge_sheet: "Charge-sheet",
  petition: "Petition",
  application: "Application",
  affidavit: "Affidavit",
  reply: "Reply",
  notice: "Notice",
  letter: "Letter",
  other: "Other",
};

export function DocTypeBadge(props: { source: SourceRecord }) {
  const t = props.source.docType;
  if (!t) return <Text type="supporting">—</Text>;
  return <Badge variant={t.status === "confirmed" ? "success" : "neutral"} label={`${DOC_TYPE_LABEL[t.type] ?? t.type}${t.status === "candidate" ? "?" : ""}`} />;
}

/** V2-2: the advocate confirms the proposed type or sets another. */
export function DocTypeControl(props: { matterId: string; source: SourceRecord; onChanged: () => void }) {
  const t = props.source.docType;
  const [value, setValue] = useState(t?.type ?? "other");
  useEffect(() => setValue(t?.type ?? "other"), [t?.type]);
  return (
    <div className="dock-card-row" data-testid="doc-type">
      <label className="field inline">
        <span>Document type</span>
        <select aria-label="Document type" value={value} onChange={(e) => setValue(e.target.value)}>
          {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {t?.status === "confirmed" && value === t.type ? (
        <Badge variant="success" label="Confirmed" />
      ) : (
        <Button
          label={t && value === t.type ? "Confirm type" : "Set type"}
          size="sm"
          clickAction={async () => {
            await api.setSourceType(props.matterId, props.source.id, value);
            props.onChanged();
          }}
        />
      )}
      {t?.status === "candidate" ? <Text type="supporting">Proposed by rule: {t.matched || "no heading word matched"}.</Text> : null}
    </div>
  );
}

function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** V2-5: tick the confirmed events that the List of Dates keeps. */
export function ListOfDatesRows(props: { matterId: string; version: number }) {
  const [events, setEvents] = useState<NotebookEvent[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const nb = await api.getNotebook(props.matterId);
    setEvents(nb.events.filter((e) => e.status === "confirmed" && !e.excluded).sort((a, b) => (a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : 0)));
    const rows = await api.getListOfDatesRows(props.matterId);
    setSaved(rows);
    setPicked(new Set(rows));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const changed = picked.size !== saved.length || saved.some((id) => !picked.has(id));
  return (
    <details className="work-section lod-rows" data-testid="lod-rows">
      <summary>
        List of Dates rows: {saved.length ? `${saved.length} chosen` : `all ${events.length} confirmed events`}
      </summary>
      <Text type="supporting">Tick the rows the List of Dates keeps. With nothing ticked, every confirmed event is used.</Text>
      {events.length === 0 ? <Text type="supporting">No confirmed event yet.</Text> : null}
      <ul className="pick-list">
        {events.map((e) => (
          <li key={e.id}>
            <label>
              <input
                type="checkbox"
                aria-label={`Keep ${e.dateText}`}
                checked={picked.has(e.id)}
                onChange={(ev) => {
                  const next = new Set(picked);
                  if (ev.target.checked) next.add(e.id);
                  else next.delete(e.id);
                  setPicked(next);
                }}
              />
              <span className="mono">{e.dateStart === e.dateEnd ? dmy(e.dateStart) : `${dmy(e.dateStart)} – ${dmy(e.dateEnd)}`}</span> {e.description}
            </label>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <Button
          label="Save rows"
          size="sm"
          isDisabled={!changed}
          clickAction={async () => {
            try {
              setError(null);
              const ordered = events.filter((e) => picked.has(e.id)).map((e) => e.id);
              setSaved(await api.setListOfDatesRows(props.matterId, ordered));
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
        {saved.length ? <Button label="Use every confirmed event" size="sm" variant="ghost" clickAction={async () => { setSaved(await api.setListOfDatesRows(props.matterId, [])); setPicked(new Set()); }} /> : null}
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </details>
  );
}

/** V2-8: notes the agent proposed for the matter memory. The advocate accepts or rejects each. */
export function MemoryProposals(props: { matterId: string; version: number; onAccepted: () => void }) {
  const [list, setList] = useState<MemoryProposal[]>([]);
  useEffect(() => {
    void api.listMemoryProposals(props.matterId).then(setList);
  }, [props.matterId, props.version]);
  const open = list.filter((m) => m.status === "open");
  if (open.length === 0) return null;
  return (
    <section className="work-section" aria-label="Memory proposals" data-testid="memory-proposals">
      <Heading level={4}>Proposed by the agent ({open.length})</Heading>
      {open.map((m) => (
        <div key={m.id} className="proposal" data-testid="memory-proposal">
          <Text>{m.text}</Text>
          <Text type="supporting">Reason given: {m.reason || "none"}</Text>
          <div className="row-actions">
            <Button
              label="Add to memory"
              size="sm"
              clickAction={async () => {
                setList(await api.decideMemoryProposal(props.matterId, m.id, true));
                props.onAccepted();
              }}
            />
            <Button label="Reject" size="sm" variant="ghost" clickAction={async () => setList(await api.decideMemoryProposal(props.matterId, m.id, false))} />
          </div>
        </div>
      ))}
    </section>
  );
}
