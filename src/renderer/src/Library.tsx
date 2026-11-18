/**
 * M1: the Knowledge Library. The advocate's judgments, statutes, pleadings, templates,
 * submissions, memoranda, notes, checklists, propositions and court rules, with their precedent
 * status. The file bytes stay in the library folder; this page reads and corrects the records.
 * Spec: docs/specs/advocate-matters-browser.md section 4.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { LIBRARY_KINDS, LIBRARY_STATUSES, type LibraryImportResult, type LibraryItem, type LibraryKind, type LibraryStatus } from "../../shared/stores.ts";
import type { AdvocateGraphView, LibraryRoleGroup } from "../../shared/knowledge.ts";
import type { MatterSummary } from "../../shared/records.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportNote(props: { result: LibraryImportResult | null }) {
  if (!props.result) return null;
  const r = props.result;
  return (
    <div className="notice" data-testid="library-note" role="status">
      {r.added} added. {r.duplicates} already in the library (same bytes).{" "}
      {r.refused.length ? `${r.refused.length} refused: ${r.refused.join("; ")}.` : ""}
    </div>
  );
}

function ItemEditor(props: { item: LibraryItem; matters: MatterSummary[]; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(props.item.title);
  const [kind, setKind] = useState<LibraryKind>(props.item.kind);
  const [author, setAuthor] = useState(props.item.author);
  const [date, setDate] = useState(props.item.itemDate);
  const [matterId, setMatterId] = useState(props.item.matterId ?? "");
  const [court, setCourt] = useState(props.item.court);
  const [scope, setScope] = useState(props.item.scope);
  const [notes, setNotes] = useState(props.item.notes);
  const [tags, setTags] = useState(props.item.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      setError(null);
      await api.libraryUpdate(props.item.id, { title, kind, author, itemDate: date, matterId: matterId || null, court, scope, notes, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
      props.onDone();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="library-editor" data-testid="library-editor">
      <div className="field-grid">
        <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">Kind<select value={kind} onChange={(e) => setKind(e.target.value as LibraryKind)}>{LIBRARY_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select></label>
        <label className="field">Author<input value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Matter
          <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            <option value="">No matter</option>
            {props.matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        <label className="field">Court<input value={court} onChange={(e) => setCourt(e.target.value)} /></label>
        <label className="field">Scope<input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="For example: judgments/2024" /></label>
        <label className="field">Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bail, 2024" /></label>
      </div>
      <label className="field">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <div className="row-actions">
        <Button label="Save" size="sm" clickAction={save} />
        <Button label="Cancel" size="sm" variant="ghost" onClick={props.onCancel} />
      </div>
    </div>
  );
}

export function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<LibraryImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [roles, setRoles] = useState<LibraryRoleGroup[]>([]);
  const [graph, setGraph] = useState<AdvocateGraphView | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api.libraryList({ q, kind: kind || undefined, status: status || undefined }));
      setRoles(await api.libraryRoles());
    } catch (e) {
      setError(errorText(e));
      setItems([]);
    }
  }, [q, kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.listMatters().then(setMatters, () => setMatters([]));
    void api.advocateGraph().then(setGraph, () => setGraph(null));
  }, []);

  const rebuildGraph = async () => {
    try {
      setGraphError(null);
      setGraph(await api.rebuildAdvocateGraph());
    } catch (e) {
      setGraphError(errorText(e));
    }
  };

  const importFiles = async () => {
    try {
      setError(null);
      const r = await api.libraryImportFiles();
      setResult(r);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const importFolder = async () => {
    try {
      setError(null);
      const r = await api.libraryImportFolder();
      setResult(r);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const setItemStatus = async (id: string, next: LibraryStatus) => {
    try {
      setError(null);
      await api.librarySetStatus(id, next);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const counts = items ? Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])) : null;

  return (
    <div className="work-scroll">
      <section className="work-section page" aria-label="Knowledge" data-testid="library-page">
        <Heading level={2}>Knowledge</Heading>
        <Text type="supporting">Judgments, statutes, pleadings, templates, submissions, memoranda, notes, checklists, propositions and court rules. Every item has a precedent status. The default is unreviewed.</Text>
        <div className="row-actions">
          <Button label="Import files" size="sm" clickAction={importFiles} data-testid="library-import-files" />
          <Button label="Import a folder" size="sm" clickAction={importFolder} data-testid="library-import-folder" />
          <input aria-label="Search the library" placeholder="Search titles, notes and tags" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Every kind</option>
            {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
          </select>
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Every status</option>
            {LIBRARY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <ImportNote result={result} />
        {error ? <div className="notice" role="alert">{error}</div> : null}
        {counts ? (
          <Text type="supporting" data-testid="library-counts">
            {items!.length} item{items!.length === 1 ? "" : "s"}. {LIBRARY_STATUSES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ") || "No status yet"}.
          </Text>
        ) : null}
        {!items ? <Text type="supporting">Reading the library.</Text> : null}
        {items && items.length === 0 ? (
          <div className="notice" data-testid="library-empty">No item yet. Import a folder of past work; every file enters as unreviewed.</div>
        ) : null}
        <Heading level={3}>In use</Heading>
        <Text type="supporting">A positive status puts an item to work: a proposition is a position, a checklist a playbook, a note tagged common-error a check, and an approved pleading, submission or template a precedent. A rejected item is never offered.</Text>
        {roles.filter((r) => r.items.length > 0).map((group) => (
          <div key={group.role} data-testid={`library-role-${group.role}`}>
            <Heading level={4}>{group.title} ({group.items.length})</Heading>
            <ul className="plain-list">
              {group.items.slice(0, 20).map((item) => (
                <li key={item.id} className="phase4-row" data-testid="library-role-item">
                  <Text weight="semibold">{item.title}</Text>
                  <Text type="supporting">{[item.status, item.kind.replace(/_/g, " "), item.court || null, item.scope || null, item.itemDate || null].filter(Boolean).join(" · ")}</Text>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {roles.every((r) => r.items.length === 0) ? <Text type="supporting">No item has a role yet. Approve an imported precedent, or tag a note common-error.</Text> : null}
        <Heading level={3}>Advocate memory graph</Heading>
        <Text type="supporting">The graph is rebuilt from your preferences, your memory, the library and the outcome records. It holds no client fact. {graph?.builtAt ? `Last built ${graph.builtAt.slice(0, 16).replace("T", " ")}.` : "Not built yet."}</Text>
        <div className="row-actions">
          <Button label="Rebuild the graph" size="sm" variant="ghost" clickAction={rebuildGraph} data-testid="graph-rebuild" />
        </div>
        {graphError ? <div className="notice" role="alert">{graphError}</div> : null}
        <div data-testid="advocate-graph">
          {graph && graph.counts.length === 0 ? <Text type="supporting">No edge yet. Approve a preference, confirm a memory record, approve a precedent, or record an outcome.</Text> : null}
          <ul className="plain-list">
            {(graph?.counts ?? []).map((c) => (
              <li key={`${c.fromKind}:${c.relation}:${c.toKind}`} className="phase4-row" data-testid="graph-count">
                <Text>{c.fromKind.replace(/_/g, " ")} → {c.relation.replace(/_/g, " ")} → {c.toKind.replace(/_/g, " ")}: {c.n}</Text>
              </li>
            ))}
          </ul>
          {graph && graph.edges.length > 0 ? (
            <ul className="plain-list">
              {graph.edges.slice(0, 12).map((e) => (
                <li key={`${e.fromKind}:${e.fromId}:${e.relation}:${e.toKind}:${e.toId}`} className="phase4-row" data-testid="graph-edge">
                  <Text type="supporting">{e.fromKind} {e.fromId} · {e.relation.replace(/_/g, " ")} · {e.toKind} {e.toId.slice(0, 24)}</Text>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <ul className="plain-list library-list" data-testid="library-list">
          {(items ?? []).map((item) => (
            <li key={item.id} className="library-item" data-testid="library-item" data-status={item.status}>
              <div className="library-item-main">
                <div className="library-item-head">
                  <StatusDot variant={item.status === "approved" || item.status === "reviewed" ? "success" : item.status === "rejected" || item.status === "withdrawn" ? "warning" : "neutral"} label={item.status} />
                  <Text weight="semibold">{item.title}</Text>
                  <span className="chip">{item.kind.replace(/_/g, " ")}</span>
                </div>
                <Text type="supporting">
                  {[item.sourceName, item.scope || null, item.author || null, item.itemDate || null, matters.find((m) => m.id === item.matterId)?.title ?? null, item.court || null, sizeText(item.size)].filter(Boolean).join(" · ")}
                </Text>
                {item.notes ? <Text type="supporting">{item.notes}</Text> : null}
                <Text type="supporting" className="mono">{item.sha256.slice(0, 16)}…</Text>
              </div>
              <div className="library-item-actions">
                <Button label="Open" size="sm" variant="ghost" clickAction={() => void api.libraryOpen(item.id)} />
                <Button label="Show file" size="sm" variant="ghost" clickAction={() => void api.libraryReveal(item.id)} />
                <select aria-label={`Status of ${item.title}`} value={item.status} onChange={(e) => void setItemStatus(item.id, e.target.value as LibraryStatus)}>
                  {LIBRARY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Button label="Correct" size="sm" variant="ghost" onClick={() => setEditing(editing === item.id ? null : item.id)} />
              </div>
              {editing === item.id ? <ItemEditor item={item} matters={matters} onDone={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
