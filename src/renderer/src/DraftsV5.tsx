/**
 * V5-13 and V5-18 views (docs/specs/v5.md): compare revisions, the Word round trip, and the
 * portal result after an uncertain submission.
 */
import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import type { DraftRecord, RevisionRecord } from "../../shared/api.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

type Diff = Awaited<ReturnType<typeof api.compareRevisions>>;

export function DraftTools(props: { matterId: string; draft: DraftRecord; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [revs, setRevs] = useState<RevisionRecord[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    void api.listRevisions(props.matterId, props.draft.id).then((r) => {
      setRevs(r);
      setA(r.at(-2)?.id ?? r[0]?.id ?? "");
      setB(r.at(-1)?.id ?? "");
    });
  }, [open, props.matterId, props.draft.id]);
  const head = props.draft.head;
  if (!open) return <Button label="Compare and Word" size="sm" variant="ghost" onClick={() => setOpen(true)} />;
  return (
    <div className="draft-tools" data-testid="draft-tools">
      <div className="row-actions">
        <select aria-label="Earlier revision" value={a} onChange={(e) => setA(e.target.value)}>
          {revs.map((r) => <option key={r.id} value={r.id}>Revision {r.seq} ({r.author})</option>)}
        </select>
        <select aria-label="Later revision" value={b} onChange={(e) => setB(e.target.value)}>
          {revs.map((r) => <option key={r.id} value={r.id}>Revision {r.seq} ({r.author})</option>)}
        </select>
        <Button label="Compare" size="sm" isDisabled={!a || !b || a === b} clickAction={async () => setDiff(await api.compareRevisions(props.matterId, a, b))} />
        {head ? (
          <>
            <Button label="Open in Word" size="sm" variant="ghost" clickAction={async () => { const r = await api.openInWord(props.matterId, head.id); setNote(`A copy of revision ${head.seq} is open in Word (${r.file}). Save it there, then bring it back.`); }} />
            <Button
              label="Bring back the edited copy"
              size="sm"
              variant="ghost"
              clickAction={async () => {
                try {
                  const saved = await api.importFromWord(props.matterId, head.id);
                  if (saved) {
                    setNote(`The edited copy is revision ${saved.seq}.`);
                    props.onChanged();
                  }
                } catch (e) {
                  setNote(errorText(e));
                }
              }}
            />
          </>
        ) : null}
        <Button label="Close" size="sm" variant="ghost" onClick={() => setOpen(false)} />
      </div>
      {note ? <Text type="supporting" data-testid="word-note">{note}</Text> : null}
      {diff ? (
        <ol className="diff" data-testid="diff">
          {diff.filter((d) => d.op !== "same").length === 0 ? <li><Text type="supporting">The two revisions have the same paragraphs.</Text></li> : null}
          {diff.map((d, i) =>
            d.op === "same" ? null : d.op === "changed" ? (
              <li key={i} data-op="changed"><Badge variant="warning" label="Changed" /> <del>{d.before}</del> <ins>{d.after}</ins></li>
            ) : (
              <li key={i} data-op={d.op}><Badge variant={d.op === "added" ? "success" : "error"} label={d.op === "added" ? "Added" : "Removed"} /> {d.op === "added" ? <ins>{d.text}</ins> : <del>{d.text}</del>}</li>
            ),
          )}
        </ol>
      ) : null}
    </div>
  );
}

export function PortalResult(props: { matterId: string; version: number }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof api.filingResult>> | null>(null);
  const [diary, setDiary] = useState("");
  const load = async () => setR(await api.filingResult(props.matterId));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.matterId, props.version]);
  if (!r || r.state === "none") return null;
  return (
    <div className="notice" data-testid="portal-result" data-state={r.state}>
      {r.state === "unknown" ? (
        <>
          <Text weight="semibold">The portal's answer to the last submission is not known.</Text>
          <Text> Check the portal (diary search or the e-filing dashboard), then record what it shows. No new attempt is made until then.</Text>
          <div className="row-actions">
            <input aria-label="Diary number" placeholder="Diary number, if shown" value={diary} onChange={(e) => setDiary(e.target.value)} />
            <Button label="It was submitted" size="sm" clickAction={async () => { await api.reconcileFiling(props.matterId, "submitted", diary); await load(); }} />
            <Button label="It was not submitted" size="sm" variant="ghost" clickAction={async () => { await api.reconcileFiling(props.matterId, "not_submitted", ""); await load(); }} />
          </div>
        </>
      ) : r.state === "submitted" ? (
        <Text>Recorded as submitted{r.diary ? `, diary number ${r.diary}` : ""}.</Text>
      ) : (
        <Text>Recorded as not submitted. A new attempt needs both confirmations again.</Text>
      )}
    </div>
  );
}
