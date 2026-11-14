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
