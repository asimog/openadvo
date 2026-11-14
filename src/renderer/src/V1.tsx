/**
 * V1 views (docs/specs/v1.md): matter rename and archive (V1-10), matter memory (V1-3) and the
 * record table (V1-5). No business logic: each action is one bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { MatterSummary, RecordTable, SourceRecord } from "../../shared/api.ts";
import { MemoryProposals } from "./V2.tsx";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function MatterAdmin(props: { matter: MatterSummary; onChanged: () => Promise<void>; onArchived: () => void }) {
  const [title, setTitle] = useState(props.matter.title);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTitle(props.matter.title), [props.matter.title]);
  return (
    <section className="work-section" aria-label="Matter name" data-testid="matter-admin">
      <Heading level={3}>Matter</Heading>
      <div className="row-actions">
        <label className="field">
          <span>Matter name</span>
          <input data-testid="matter-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <Button
          label="Rename"
          size="sm"
          isDisabled={!title.trim() || title.trim() === props.matter.title}
          clickAction={async () => {
            try {
              setError(null);
              await api.renameMatter(props.matter.id, title);
              await props.onChanged();
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
        <Button
          label="Archive matter"
          size="sm"
          variant="ghost"
          clickAction={async () => {
            await api.setMatterArchived(props.matter.id, true);
            await props.onChanged();
            props.onArchived();
          }}
        />
      </div>
      <Text type="supporting">Archiving hides the matter from the side navigation. Nothing is deleted; restore it from the home page.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </section>
  );
}

export function MemoryEditor(props: { matterId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    void api.getMemory(props.matterId).then((t) => {
      setText(t);
      setSaved(t);
    });
  }, [props.matterId, reload]);
  if (text === null) return null;
  return (
    <section className="work-section" aria-label="Matter memory" data-testid="memory">
      <Heading level={3}>Matter memory</Heading>
      <Text type="supporting">
        Notes for the agent: the client's instructions, preferences, things to avoid. The agent reads them as reference text, never as an instruction or as a fact. Only you write them.
      </Text>
      <textarea className="memory-text" aria-label="Matter memory text" data-testid="memory-text" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row-actions">
        <Button
          label="Save memory"
          size="sm"
          isDisabled={text === saved}
          clickAction={async () => {
            const t = await api.setMemory(props.matterId, text);
            setSaved(t);
            setNote("Saved.");
          }}
        />
        {note && text === saved ? <Text type="supporting">{note}</Text> : null}
      </div>
      <MemoryProposals matterId={props.matterId} version={reload} onAccepted={() => setReload((n) => n + 1)} />
    </section>
  );
}

export function RecordTableView(props: { matterId: string; sources: SourceRecord[]; version: number }) {
  const [t, setT] = useState<RecordTable | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => setT(await api.getRecordTable(props.matterId)), [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!t) return null;
  return (
    <section className="work-section" aria-label="Record table" data-testid="record-table">
      <Heading level={3}>Record table</Heading>
      <Text type="supporting">
        Ask a question of every source. The agent fills each cell with an answer and the exact words of one line; a quote that is not on that line is refused. Its cells are candidates until you confirm them.
      </Text>
      <div className="row-actions">
        <label className="field">
          <span>New column (a question)</span>
          <input data-testid="record-question" value={question} placeholder="For example: Date of the order" onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <Button
          label="Add column"
          size="sm"
          isDisabled={!question.trim()}
          clickAction={() =>
            run(async () => {
              await api.addRecordColumn(props.matterId, question);
              setQuestion("");
            })
          }
        />
        <Button label="Ask the agent to fill the table" size="sm" variant="ghost" isDisabled={t.columns.length === 0} clickAction={() => api.sendChat(props.matterId, "Fill the record table: read list_record_table, then fill each empty cell with fill_record_cell, quoting the exact words of one line. Leave a cell empty when the source does not answer.")} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {t.columns.length === 0 ? (
        <Text type="supporting">No columns yet.</Text>
      ) : (
        <div className="table-scroll">
          <table className="table record-table">
            <thead>
              <tr>
                <th>Source</th>
                {t.columns.map((c) => (
                  <th key={c.id}>{c.question}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  {t.columns.map((c) => {
                    const cell = t.cells.find((x) => x.sourceId === s.id && x.columnId === c.id);
                    return (
                      <td key={c.id} data-testid="record-cell" data-source={s.name} data-status={cell?.status ?? "empty"}>
                        {cell ? (
                          <div className="record-cell">
                            <Text>{cell.answer}</Text>
                            <span className="record-quote">
                              “{cell.quote}” p. {cell.page}, l. {cell.line}
                            </span>
                            <div className="row-actions">
                              {cell.status === "confirmed" ? <Badge variant="success" label="Confirmed" /> : <Badge variant="warning" label={`Candidate (${cell.author})`} />}
                              {cell.status !== "confirmed" ? <Button label="Confirm" size="sm" clickAction={() => run(() => api.decideRecordCell(props.matterId, s.id, c.id, "confirm"))} /> : null}
                              <Button label="Clear" size="sm" variant="ghost" clickAction={() => run(() => api.decideRecordCell(props.matterId, s.id, c.id, "clear"))} />
                            </div>
                          </div>
                        ) : (
                          <Text type="supporting">Empty</Text>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** V1-10: archived matters on the home page, each with Restore. */
export function ArchivedMatters(props: { matters: MatterSummary[]; onChanged: () => Promise<void> }) {
  const archived = props.matters.filter((m) => m.archived);
  if (archived.length === 0) return null;
  return (
    <section className="work-section" aria-label="Archived matters" data-testid="archived-matters">
      <Heading level={4}>Archived</Heading>
      {archived.map((m) => (
        <div key={m.id} className="row-actions">
          <Text>{m.title}</Text>
          <Button
            label="Restore"
            size="sm"
            variant="ghost"
            clickAction={async () => {
              await api.setMatterArchived(m.id, false);
              await props.onChanged();
            }}
          />
        </div>
      ))}
    </section>
  );
}
