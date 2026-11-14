/**
 * V5 views (docs/specs/v5.md). No business logic: each action is one bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { ChainCheck, Inspection, Refusal } from "../../shared/api.ts";

const api = window.openadvo;

export function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

// ---- V5-3: the Inspector ----

export const INSPECT_EVENT = "openadvo:inspect";

/** Open the Inspector on any record id, from anywhere in the window. */
export function inspect(id: string): void {
  window.dispatchEvent(new CustomEvent(INSPECT_EVENT, { detail: id }));
}

export function InspectButton(props: { id: string; label?: string }) {
  return <Button label={props.label ?? "Inspect"} size="sm" variant="ghost" onClick={() => inspect(props.id)} />;
}

export function Inspector(props: { matterId: string | null }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Inspection | null | undefined>(undefined);
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(INSPECT_EVENT, on);
    return () => window.removeEventListener(INSPECT_EVENT, on);
  }, []);
  useEffect(() => {
    if (!id || !props.matterId) return;
    setData(undefined);
    void api.inspectRecord(props.matterId, id).then(setData, () => setData(null));
  }, [id, props.matterId]);
  if (!id) return null;
  return (
    <Dialog isOpen onOpenChange={(o) => !o && setId(null)} purpose="info" width={760} padding={4}>
      <DialogHeader title={data ? `Inspector: ${data.kind}` : "Inspector"} onOpenChange={(o) => !o && setId(null)} />
      <div className="inspector" data-testid="inspector">
        <Text type="supporting" className="mono">{id}</Text>
        {data === undefined ? <Text type="supporting">Reading…</Text> : null}
        {data === null ? <Text type="supporting">No record of the matter has this id.</Text> : null}
        {data ? (
          <>
            <Heading level={4}>Record</Heading>
            <pre className="raw" data-testid="inspector-raw">{JSON.stringify(data.record, null, 2)}</pre>
            <Heading level={4}>Events that name it ({data.events.length})</Heading>
            <ul className="plain-list">
              {data.events.map((e) => (
                <li key={e.seq}><span className="mono">#{e.seq}</span> {e.at.replace("T", " ").slice(0, 19)} {e.actor}: {e.action}</li>
              ))}
            </ul>
            <Heading level={4}>Links out ({data.linksOut.length})</Heading>
            <ul className="plain-list">
              {data.linksOut.map((l) => (
                <li key={l.id}><button type="button" className="link" onClick={() => setId(l.id)}>{l.kind}</button> <span className="mono">{l.id.slice(0, 24)}</span></li>
              ))}
            </ul>
            <Heading level={4}>Links in ({data.linksIn.length})</Heading>
            <ul className="plain-list" data-testid="inspector-links-in">
              {data.linksIn.map((l) => (
                <li key={l.id}><button type="button" className="link" onClick={() => setId(l.id)}>{l.kind}</button> <span className="mono">{l.id.slice(0, 24)}</span> <Text type="supporting">(in {l.field})</Text></li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---- V5-1 and V5-2: the record ----

export function RecordIntegrity(props: { matterId: string; version: number }) {
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  useEffect(() => {
    void api.listRefusals(props.matterId).then(setRefusals);
  }, [props.matterId, props.version]);
  return (
    <section className="work-section" aria-label="Record integrity" data-testid="record-integrity">
      <Heading level={3}>The matter's record</Heading>
      <Text type="supporting">Every event of the matter carries the hash of the event before it, so a changed, removed or reordered event is found.</Text>
      <div className="row-actions">
        <Button label="Verify the record" size="sm" clickAction={async () => setCheck(await api.verifyRecordChain(props.matterId))} />
      </div>
      {check ? (
        <div className="notice" data-testid="chain-check" data-ok={check.ok}>
          {check.ok
            ? `Record verified: ${check.events - check.unchained} chained event(s)${check.unchained ? `, ${check.unchained} earlier event(s) written before the chain existed` : ""}. Head ${check.head?.slice(0, 16) ?? "none"}…`
            : `Record NOT verified at event #${check.firstBreak?.seq}: ${check.firstBreak?.problem}.`}
        </div>
      ) : null}
      <details data-testid="refusals">
        <summary>Refused requests ({refusals.length})</summary>
        <ul className="plain-list">
          {refusals.map((r) => (
            <li key={r.id}><Badge variant="warning" label={r.code} /> <Text type="supporting">{r.at.replace("T", " ").slice(0, 19)}, {r.actor}, {r.action}: {r.reason}</Text></li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---- V5-5: files and jobs ----

function size(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesAndJobs(props: { matterId: string; version: number }) {
  const [files, setFiles] = useState<Array<{ path: string; size: number; isDir: boolean; files?: number }>>([]);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof api.listJobsOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setFiles(await api.listMatterFiles(props.matterId));
    setJobs(await api.listJobsOverview(props.matterId));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  return (
    <>
      <details className="work-section" data-testid="files">
        <summary>Files of the matter ({files.filter((f) => !f.isDir).length})</summary>
        <ul className="plain-list files-list">
          {files.map((f) => (
            <li key={f.path}>
              {f.isDir ? (
                <Text type="supporting">{f.path}/ {f.files !== undefined ? `(${f.files} stored file(s), ${size(f.size)})` : ""}</Text>
              ) : (
                <>
                  <button type="button" className="link" onClick={() => void api.openMatterFile(props.matterId, f.path).catch((e) => setError(errorText(e)))}>{f.path}</button>{" "}
                  <Text type="supporting">{size(f.size)}</Text>
                </>
              )}
            </li>
          ))}
        </ul>
        {error ? <div className="notice" role="alert">{error}</div> : null}
      </details>
      <details className="work-section" data-testid="jobs">
        <summary>Jobs{jobs?.running ? ": an argument loop is running" : ""}{jobs?.indexing ? `: indexing ${jobs.indexing}` : ""}</summary>
        {jobs ? (
          <table className="plain">
            <thead><tr><th>Job</th><th>State</th><th>Detail</th><th /></tr></thead>
            <tbody>
              {jobs.reading.map((j) => (
                <tr key={j.sourceId}><td>Read {j.name}</td><td>{j.state}</td><td>{j.pages ?? ""} {j.error ?? ""}</td><td /></tr>
              ))}
              {jobs.runs.map((r) => (
                <tr key={r.id}>
                  <td>Argument loop</td>
                  <td>{r.status}</td>
                  <td>{r.startedAt.replace("T", " ").slice(0, 16)} {r.error ?? ""}</td>
                  <td>{r.id === jobs.running ? <Button label="Stop" size="sm" variant="ghost" clickAction={async () => { await api.stopArgumentLoop(props.matterId); await load(); }} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </>
  );
}

// ---- V5-6: entities ----

const ENTITY_LABEL: Record<string, string> = { party: "Parties", statute: "Statutory references", case_number: "Case numbers", amount: "Amounts", citation: "Citations" };

export function EntitiesView(props: { matterId: string; version: number; onOpen: (l: { sourceId: string; page: number; line: number }) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getEntities>> | null>(null);
  useEffect(() => {
    void api.getEntities(props.matterId).then(setData);
  }, [props.matterId, props.version]);
  if (!data) return null;
  const kinds = Object.keys(ENTITY_LABEL);
  return (
    <section className="work-section" aria-label="Entities" data-testid="entities">
      <Text type="supporting">Found by fixed rules on every line. Nothing here is a fact until you rely on it.</Text>
      {data.conflicts.length ? (
        <div className="notice" data-testid="entity-conflicts">
          {data.conflicts.map((c) => <div key={c.key}>{c.key} is given with different years: {c.values.join(", ")}.</div>)}
        </div>
      ) : null}
      {kinds.map((k) => {
        const rows = data.entities.filter((e) => e.kind === k);
        const groups = new Map<string, typeof rows>();
        for (const e of rows) groups.set(e.value, [...(groups.get(e.value) ?? []), e]);
        return (
          <div key={k}>
            <Heading level={4}>{ENTITY_LABEL[k]} ({groups.size})</Heading>
            <ul className="plain-list">
              {[...groups].map(([value, list]) => (
                <li key={value}>
                  <Text weight="semibold">{value}</Text>{" "}
                  {list.slice(0, 6).map((e) => (
                    <button key={e.anchorId} type="button" className="link" onClick={() => props.onOpen({ sourceId: e.sourceId, page: e.page, line: e.line })}>
                      p. {e.page}, l. {e.line}
                    </button>
                  ))}
                  {list.length > 6 ? <Text type="supporting"> and {list.length - 6} more</Text> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// ---- V5-7 and V5-8: decisions in the review lists ----

export function DisputeDecision(props: { matterId: string; reviewItemId: string; onDone: () => void }) {
  const [d, setD] = useState<import("../../shared/api.ts").OcrDispute | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.listOcrDisputes(props.matterId).then((all) => setD(all.find((x) => x.reviewItemId === props.reviewItemId) ?? null));
  }, [props.matterId, props.reviewItemId]);
  if (!d) return null;
  const decide = async (choice: "a" | "b" | "typed") => {
    try {
      setError(null);
      await api.decideOcrDispute(props.matterId, d.id, choice, typed);
      props.onDone();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="dispute" data-testid="ocr-dispute">
      <div><Badge variant="neutral" label={d.engineA} /> <span className="mono">{d.readingA}</span></div>
      <div><Badge variant="neutral" label={d.engineB} /> <span className="mono">{d.readingB}</span></div>
      <div className="row-actions">
        <Button label="Use the first reading" size="sm" clickAction={() => decide("a")} />
        <Button label="Use the second reading" size="sm" variant="ghost" clickAction={() => decide("b")} />
        <input aria-label="Type the line" placeholder="Type the line as it reads on the page" value={typed} onChange={(e) => setTyped(e.target.value)} className="grow" />
        <Button label="Use my typed copy" size="sm" variant="ghost" isDisabled={!typed.trim()} clickAction={() => decide("typed")} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </div>
  );
}

export function DateAnchorForm(props: { matterId: string; sourceId: string; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="row-actions" data-testid="date-anchor">
      <input type="date" aria-label="Base date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button
        label="Set the base date"
        size="sm"
        isDisabled={!date}
        clickAction={async () => {
          try {
            const r = await api.setDateAnchor(props.matterId, props.sourceId, date);
            setNote(`${r.added} event(s) dated.`);
            props.onDone();
          } catch (e) {
            setNote(errorText(e));
          }
        }}
      />
      {note ? <Text type="supporting">{note}</Text> : null}
    </div>
  );
}

// ---- V5-7: correct an event ----

export function CorrectEvent(props: { matterId: string; event: { id: string; dateStart: string; dateEnd: string; description: string }; onDone: (nb: import("../../shared/api.ts").Notebook) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ dateStart: props.event.dateStart, dateEnd: props.event.dateEnd, description: props.event.description, reason: "" });
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button label="Correct" size="sm" variant="ghost" onClick={() => setOpen(true)} />;
  return (
    <div className="correct-form" data-testid="correct-event">
      <input type="date" aria-label="Corrected start date" value={f.dateStart} onChange={(e) => setF({ ...f, dateStart: e.target.value })} />
      <input type="date" aria-label="Corrected end date" value={f.dateEnd} onChange={(e) => setF({ ...f, dateEnd: e.target.value })} />
      <textarea aria-label="Corrected description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
      <input aria-label="Reason for the correction" placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      <div className="row-actions">
        <Button
          label="Save correction"
          size="sm"
          isDisabled={!f.reason.trim()}
          clickAction={async () => {
            try {
              props.onDone(await api.correctEvent(props.matterId, props.event.id, { dateStart: f.dateStart, dateEnd: f.dateEnd, description: f.description }, f.reason));
              setOpen(false);
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
        <Button label="Cancel" size="sm" variant="ghost" onClick={() => setOpen(false)} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </div>
  );
}
