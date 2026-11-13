import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector } from "@astryxdesign/core/Selector";
import { Table, pixel, proportional, useTableSortable, useTableSortableState } from "@astryxdesign/core/Table";
import { NotebookView, type SourceLink } from "./Notebook.tsx";
import type {
  AddFileResult,
  ChatEvent,
  ChatMessage,
  EventRecord,
  MatterSummary,
  ModelChoice,
  OriginRecord,
  IngestJob,
  PageRecord,
  ReviewItem,
  Notebook,
  SourceRecord,
} from "../../shared/api.ts";

const api = window.openadvo;

// Stop a file dropped outside the drop zone from navigating the window.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

function shortHash(h: string): string {
  return `${h.slice(0, 12)}…`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(status: SourceRecord["status"]) {
  const variant = status === "ok" ? "success" : status === "missing" ? "error" : "warning";
  const label = status === "ok" ? "OK" : status === "missing" ? "Missing" : "Changed";
  return <Badge variant={variant} label={label} />;
}

function summarise(results: AddFileResult[]): string {
  const added = results.filter((r) => r.outcome === "added").length;
  const dup = results.filter((r) => r.outcome === "duplicate");
  const refused = results.filter((r) => r.outcome === "refused");
  const parts = [`${added} added`];
  if (dup.length) parts.push(`${dup.length} already in the matter (same bytes): ${dup.map((r) => r.source?.name).join(", ")}`);
  if (refused.length) parts.push(`${refused.length} refused: ${refused.map((r) => `${baseName(r.path)} (${r.reason})`).join("; ")}`);
  return parts.join(". ") + ".";
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

type SourceRow = SourceRecord & Record<string, unknown>;

function textState(job: IngestJob | undefined): { label: string; variant: "neutral" | "info" | "success" | "error" } {
  if (!job || job.state === "queued") return { label: "Queued", variant: "neutral" };
  if (job.state === "running") return { label: "Reading…", variant: "info" };
  if (job.state === "failed") return { label: "Failed", variant: "error" };
  return { label: `${job.pages} pp.`, variant: "success" };
}

function SourcesTable(props: { sources: SourceRecord[]; jobs: IngestJob[]; selected: string | null; onSelect: (id: string) => void }) {
  const data = props.sources as SourceRow[];
  const { sortedData, sortConfig } = useTableSortableState<SourceRow>({ data });
  const sortable = useTableSortable<SourceRow>(sortConfig);
  return (
    <Table<SourceRow>
      data={sortedData}
      idKey="id"
      density="compact"
      plugins={{ sortable }}
      columns={[
        {
          key: "name",
          header: "Name",
          width: proportional(1, { minWidth: 140 }),
          sortable: true,
          renderCell: (s) => (
            <button
              type="button"
              className="matter-item"
              aria-current={props.selected === s.id}
              onClick={() => props.onSelect(s.id)}
              title={s.name}
            >
              {s.name}
            </button>
          ),
        },
        { key: "sha256", header: "SHA-256", width: pixel(118), sortable: true, renderCell: (s) => <span className="mono" title={s.sha256}>{shortHash(s.sha256)}</span> },
        { key: "size", header: "Size", width: pixel(78), sortable: true, renderCell: (s) => formatSize(s.size) },
        { key: "status", header: "File", width: pixel(92), sortable: true, renderCell: (s) => statusBadge(s.status) },
        {
          key: "text",
          header: "Text",
          width: pixel(104),
          renderCell: (s) => {
            const t = textState(props.jobs.find((j) => j.sourceId === s.id));
            return <Badge variant={t.variant} label={t.label} />;
          },
        },
      ]}
    />
  );
}

function NewMatterDialog(props: { isOpen: boolean; onOpenChange: (open: boolean) => void; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const submit = async () => {
    if (!title.trim()) return;
    await props.onCreate(title);
    setTitle("");
    props.onOpenChange(false);
  };
  return (
    <Dialog isOpen={props.isOpen} onOpenChange={props.onOpenChange} purpose="form" width={460} padding={4}>
      <DialogHeader title="New matter" onOpenChange={props.onOpenChange} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
        <TextInput
          label="Matter title"
          description="For example: Petitioner v. Respondent"
          value={title}
          onChange={(v) => setTitle(v)}
          onEnter={() => void submit()}
          hasAutoFocus
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button label="Cancel" variant="ghost" onClick={() => props.onOpenChange(false)} />
          <Button label="Create matter" variant="primary" isDisabled={!title.trim()} clickAction={submit} />
        </div>
      </div>
    </Dialog>
  );
}

/** The Euro-Office PDF editor, read only, in a sandboxed frame (editor-design item j). */
function SourceViewer(props: { matterId: string; sourceId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let opened: string | null = null;
    setUrl(null);
    setError(null);
    api.openSourceView(props.matterId, props.sourceId).then(
      (u) => {
        opened = u;
        if (live) setUrl(u);
        else void api.closeView(u);
      },
      (e: Error) => live && setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")),
    );
    return () => {
      live = false;
      if (opened) void api.closeView(opened);
    };
  }, [props.matterId, props.sourceId]);
  if (error) return <div className="notice" data-testid="viewer-error">{error}</div>;
  if (!url) return <Text type="supporting">Opening the PDF editor…</Text>;
  return (
    <>
    <ViewerState url={url} />
    <iframe
      className="source-frame"
      title="Source document"
      data-testid="source-frame"
      src={url}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
    />
    </>
  );
}

/** The state the editor host page reports: opened, error or failed. */
function ViewerState(props: { url: string }) {
  const [state, setState] = useState<{ state: string; detail: string } | null>(null);
  useEffect(() => {
    const doc = new URL(props.url).searchParams.get("doc");
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== "oa-eo://app") return;
      const d = e.data as { type?: string; doc?: string; state?: string; detail?: string };
      if (d?.type === "oa-editor/state" && d.doc === doc) setState({ state: String(d.state), detail: String(d.detail ?? "") });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [props.url]);
  if (!state) return <Text type="supporting">Starting the PDF editor…</Text>;
  if (state.state === "opened") return <Text type="supporting" data-testid="viewer-state">Opened read only in the Euro-Office PDF editor.</Text>;
  return <div className="notice" data-testid="viewer-state">The PDF editor reported a problem: {state.detail}</div>;
}

const KIND_TEXT: Record<string, string> = {
  born_digital: "Text layer",
  ocr: "OCR: single reading, not cross-checked",
  none: "No text found",
};

/** The stored text of each page, line by line, with the anchor of every line. */
function PageText(props: { matterId: string; sourceId: string; version: number; focus?: SourceLink | null }) {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [page, setPage] = useState(props.focus?.page ?? 1);
  useEffect(() => {
    if (props.focus) setPage(props.focus.page);
  }, [props.focus]);
  const focusLine = props.focus && props.focus.page === page ? props.focus.line : 0;
  useEffect(() => {
    void api.getSourcePages(props.matterId, props.sourceId).then(setPages);
  }, [props.matterId, props.sourceId, props.version]);
  if (pages.length === 0) return <Text type="supporting">No page text is stored yet. Text extraction runs after a file is added.</Text>;
  const current = pages.find((p) => p.page === page) ?? pages[0];
  return (
    <section className="page-text" aria-label="Page text">
      <div className="page-text-bar">
        <Button label="Previous page" size="sm" variant="ghost" isDisabled={current.page <= 1} onClick={() => setPage(current.page - 1)} />
        <Text>Page {current.page} of {pages.length}</Text>
        <Button label="Next page" size="sm" variant="ghost" isDisabled={current.page >= pages.length} onClick={() => setPage(current.page + 1)} />
        <Badge
          variant={current.kind === "born_digital" ? "success" : current.kind === "ocr" ? "warning" : "error"}
          label={KIND_TEXT[current.kind] + (current.ocr ? ` (${Math.round(current.ocr.confidence)}%)` : "")}
        />
      </div>
      <ol className="page-lines" data-testid="page-lines">
        {current.lines.map((l) => (
          <li key={l.id} data-focus={l.line === focusLine} ref={l.line === focusLine ? (el) => el?.scrollIntoView({ block: "center" }) : undefined} title={`Anchor ${l.sha256.slice(0, 12)}…:${l.page}:${l.line}`}>
            <span className="line-no">{l.line}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReviewList(props: { matterId: string; items: ReviewItem[]; sources: SourceRecord[]; onChange: () => void }) {
  const open = props.items.filter((i) => i.status === "open");
  const decided = props.items.length - open.length;
  if (props.items.length === 0) return <Text type="supporting">No review items.</Text>;
  return (
    <div>
      <Text type="supporting">{open.length} open, {decided} decided.</Text>
      <ul className="review-list" aria-label="Review items">
        {props.items.map((item) => (
          <li key={item.id} data-status={item.status}>
            <div>{item.detail}</div>
            {item.status === "open" ? (
              <div className="review-actions">
                <Button label="Resolve" size="sm" clickAction={async () => { await api.resolveReviewItem(props.matterId, item.id); props.onChange(); }} />
                <Button label="Skip" size="sm" variant="ghost" clickAction={async () => { await api.skipReviewItem(props.matterId, item.id); props.onChange(); }} />
              </div>
            ) : (
              <Text type="supporting">{item.status === "resolved" ? "Resolved" : "Skipped"} by {item.decidedBy}</Text>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceDetail(props: { matterId: string; source: SourceRecord; events: EventRecord[]; version: number; focus: SourceLink | null }) {
  const [origins, setOrigins] = useState<OriginRecord[]>([]);
  useEffect(() => {
    void api.listOrigins(props.matterId, props.source.id).then(setOrigins);
  }, [props.matterId, props.source.id, props.source.origins]);
  const events = props.events.filter((e) => e.subject === props.source.id);
  return (
    <div className="source-detail">
      <Heading level={2}>{props.source.name}</Heading>
      <SourceViewer matterId={props.matterId} sourceId={props.source.id} />
      <PageText matterId={props.matterId} sourceId={props.source.id} version={props.version} focus={props.focus} />
      <details>
      <summary>Hash, origins and events</summary>
      <dl className="facts">
        <dt>SHA-256</dt>
        <dd className="mono" data-testid="detail-sha256">{props.source.sha256}</dd>
        <dt>Size</dt>
        <dd>{formatSize(props.source.size)} ({props.source.size} bytes)</dd>
        <dt>Status</dt>
        <dd>{statusBadge(props.source.status)} {props.source.checkedAt ? <Text type="supporting">checked {props.source.checkedAt}</Text> : null}</dd>
        <dt>Added</dt>
        <dd>{props.source.addedAt}</dd>
      </dl>
      <Heading level={3}>Origins</Heading>
      <table className="plain">
        <thead><tr><th>When</th><th>Name</th><th>From</th><th>By</th></tr></thead>
        <tbody>
          {origins.map((o) => (
            <tr key={o.id}><td>{o.addedAt}</td><td>{o.originalName}</td><td className="mono">{o.originalPath}</td><td>{o.actor}</td></tr>
          ))}
        </tbody>
      </table>
      <Heading level={3}>Events</Heading>
      <EventTable events={events} />
      </details>
    </div>
  );
}

function EventTable(props: { events: EventRecord[] }) {
  if (props.events.length === 0) return <Text type="supporting">No events.</Text>;
  return (
    <table className="plain" aria-label="Events">
      <thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Session</th></tr></thead>
      <tbody>
        {props.events.map((e) => (
          <tr key={e.seq}>
            <td>{e.seq}</td><td>{e.at}</td><td>{e.actor}</td><td>{e.action}</td>
            <td className="mono">{e.sessionId ? e.sessionId.slice(0, 8) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The model picker: pi-ai's list of models that have credentials (Pi's own sign-in). */
function ModelPicker(props: { isDisabled: boolean }) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.listModels().then(setModels, (e: Error) => setError(e.message));
    void api.getModel().then(setCurrent);
  }, []);
  const providers = [...new Set(models.map((m) => m.provider))];
  const options = providers.map((p) => ({
    type: "section" as const,
    title: p,
    options: models.filter((m) => m.provider === p).map((m) => ({ value: m.key, label: m.name || m.id, description: m.key })),
  }));
  return (
    <Selector
      label="Model"
      isLabelHidden
      size="sm"
      variant="ghost"
      hasSearch
      options={options}
      value={current ?? undefined}
      placeholder={models.length ? "Choose a model" : "No model signed in"}
      emptyText="No model is signed in. Sign in with Pi first."
      isDisabled={props.isDisabled || models.length === 0}
      status={error ? { type: "error", message: error } : undefined}
      onChange={(key) => {
        if (!key) return;
        void api.setModel(key).then(setCurrent, (e: Error) => setError(e.message));
      }}
    />
  );
}

function ChatPane(props: { matterId: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
    if (!props.matterId) return;
    let live = true;
    api.getChat(props.matterId).then(
      (s) => {
        if (!live) return;
        setMessages(s.messages);
        setBusy(s.busy);
        setModel(s.model);
      },
      (e: Error) => live && setError(`The agent could not start: ${e.message}`),
    );
    const off = api.onChatEvent((ev: ChatEvent) => {
      if (ev.matterId !== props.matterId) return;
      if (ev.type === "message") setMessages((m) => [...m, ev.message]);
      else if (ev.type === "delta") setMessages((m) => m.map((x) => (x.id === ev.messageId ? { ...x, text: x.text + ev.delta } : x)));
      else if (ev.type === "busy") setBusy(ev.busy);
    });
    return () => {
      live = false;
      off();
    };
  }, [props.matterId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    if (!props.matterId || !text.trim()) return;
    void api.sendChat(props.matterId, text);
    setText("");
  };

  return (
    <div className="pane" aria-label="Chat">
      <div className="pane-header">
        <Heading level={2}>Agent</Heading>
        {busy ? <Text type="supporting">Working…</Text> : null}
        <ModelPicker isDisabled={busy} key={model ?? "none"} />
      </div>
      <div className="chat-log" ref={logRef} data-testid="chat-log">
        {!props.matterId ? <Text type="supporting">Open a matter to talk to the agent.</Text> : null}
        {error ? <div className="notice">{error}</div> : null}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg" data-role={m.role}>{m.text}</div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          aria-label="Message to the agent"
          value={text}
          disabled={!props.matterId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="For example: list the sources"
        />
        <Button label="Send" variant="primary" isDisabled={!props.matterId || !text.trim() || busy} onClick={send} />
      </div>
    </div>
  );
}

export function App() {
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [version, setVersion] = useState(0);
  const [nb, setNb] = useState<Notebook | null>(null);
  const [focus, setFocus] = useState<SourceLink | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refreshMatters = useCallback(async () => setMatters(await api.listMatters()), []);
  useEffect(() => {
    void refreshMatters();
  }, [refreshMatters]);

  const refreshMatter = useCallback(async (id: string) => {
    setSources(await api.listSources(id));
    setEvents(await api.listEvents(id));
    setJobs(await api.listJobs(id));
    setReviewItems(await api.listReviewItems(id));
    setNb(await api.getNotebook(id));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!matterId) return;
    return api.onIngestUpdate((id) => {
      if (id === matterId) void refreshMatter(id);
    });
  }, [matterId, refreshMatter]);

  const openMatter = useCallback(
    async (id: string) => {
      setMatterId(id);
      setSourceId(null);
      setNotice(null);
      const checked = await api.openMatter(id);
      setSources(checked);
      setEvents(await api.listEvents(id));
      setJobs(await api.listJobs(id));
      setReviewItems(await api.listReviewItems(id));
      setNb(await api.getNotebook(id));
      const bad = checked.filter((s) => s.status !== "ok");
      if (bad.length) setNotice(`${bad.length} source file(s) are missing or changed: ${bad.map((s) => `${s.name} (${s.status})`).join(", ")}.`);
    },
    [],
  );

  const createMatter = async (title: string) => {
    const m = await api.createMatter(title);
    await refreshMatters();
    await openMatter(m.id);
  };

  const addPaths = async (paths: string[]) => {
    if (!matterId || paths.length === 0) return;
    const results = await api.addFiles(matterId, paths);
    setNotice(summarise(results));
    await refreshMatter(matterId);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void addPaths(api.pathsForFiles(files));
  };

  const matter = useMemo(() => matters.find((m) => m.id === matterId) ?? null, [matters, matterId]);
  const source = sources.find((s) => s.id === sourceId) ?? null;

  return (
    <div className="app">
      <Group orientation="horizontal" style={{ height: "100%" }}>
        <Panel id="left" defaultSize="34%" minSize="22%">
          <div className="pane" aria-label="Matters and sources">
            <div className="pane-header">
              <Heading level={2}>Matters</Heading>
              <Button label="New matter" size="sm" onClick={() => setDialogOpen(true)} />
            </div>
            <div className="pane-scroll">
              {matters.length === 0 ? <Text type="supporting">No matters yet. Create one.</Text> : null}
              <ul className="matter-list" aria-label="Matter list">
                {matters.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="matter-item" aria-current={m.id === matterId} onClick={() => void openMatter(m.id)}>
                      {m.title}
                    </button>
                  </li>
                ))}
              </ul>
              {matter ? (
                <section aria-label="Sources">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Heading level={3}>Sources ({sources.length})</Heading>
                    <Button label="Add files…" size="sm" onClick={async () => void addPaths(await api.pickFiles())} />
                  </div>
                  <div
                    className="dropzone"
                    data-over={dragOver}
                    data-testid="dropzone"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                  >
                    <Text type="supporting">Drop PDF files here</Text>
                  </div>
                  {notice ? <div className="notice" role="status" data-testid="notice">{notice}</div> : null}
                  <SourcesTable sources={sources} jobs={jobs} selected={sourceId} onSelect={(id) => { setFocus(null); setSourceId(id); }} />
                </section>
              ) : null}
            </div>
          </div>
        </Panel>
        <Separator className="separator" />
        <Panel id="view" defaultSize="38%" minSize="25%">
          <div className="pane" aria-label="View">
            <div className="pane-header">
              <Heading level={2}>{matter ? matter.title : "Open Advocate"}</Heading>
              {source ? <Button label="Back to matter" size="sm" variant="ghost" onClick={() => setSourceId(null)} /> : null}
            </div>
            <div className="pane-scroll">
              {!matter ? <Text type="supporting">Create or open a matter. Then drop the PDFs of the brief into it.</Text> : null}
              {matter && source ? <SourceDetail matterId={matter.id} source={source} events={events} version={version} focus={focus} /> : null}
              {matter && !source ? (
                <NotebookView
                  matterId={matter.id}
                  nb={nb}
                  sources={sources}
                  jobs={jobs}
                  onChange={(next) => {
                    setNb(next);
                    void refreshMatter(matter.id);
                  }}
                  onOpen={(link) => {
                    setFocus(link);
                    setSourceId(link.sourceId);
                  }}
                  overview={
                <div>
                  <dl className="facts">
                    <dt>Sources</dt><dd>{sources.length}</dd>
                    <dt>Matter folder</dt><dd className="mono">{matter.folder}</dd>
                    <dt>Created</dt><dd>{matter.createdAt}</dd>
                    <dt>Parties, court, case number, CNR</dt><dd>Not recorded</dd>
                  </dl>
                  <Heading level={3}>Review items</Heading>
                  <ReviewList matterId={matter.id} items={reviewItems} sources={sources} onChange={() => void refreshMatter(matter.id)} />
                  <Heading level={3}>Events</Heading>
                  <EventTable events={events} />
                </div>
                  }
                />
              ) : null}
            </div>
          </div>
        </Panel>
        <Separator className="separator" />
        <Panel id="chat" defaultSize="28%" minSize="18%">
          <ChatPane matterId={matterId} />
        </Panel>
      </Group>
      <NewMatterDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} onCreate={createMatter} />
    </div>
  );
}
