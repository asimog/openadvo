import { useEffect, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Table, pixel, proportional, useTableSortable, useTableSortableState } from "@astryxdesign/core/Table";
import { ArrowUpTrayIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import type { SourceLink } from "./Notebook.tsx";
import type { EventRecord, IngestJob, OriginRecord, PageRecord, SourceRecord } from "../../shared/api.ts";

const api = window.openadvo;

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

type SourceRow = SourceRecord & Record<string, unknown>;

function textState(job: IngestJob | undefined): { label: string; variant: "neutral" | "info" | "success" | "error" } {
  if (!job || job.state === "queued") return { label: "Queued", variant: "neutral" };
  if (job.state === "running") return { label: "Reading…", variant: "info" };
  if (job.state === "failed") return { label: "Failed", variant: "error" };
  return { label: `${job.pages} pp.`, variant: "success" };
}

function SourcesTable(props: {
  sources: SourceRecord[];
  jobs: IngestJob[];
  eventCounts: Map<string, number>;
  onSelect: (id: string) => void;
}) {
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
          width: proportional(1, { minWidth: 180 }),
          sortable: true,
          renderCell: (s) => (
            <button type="button" className="link" onClick={() => props.onSelect(s.id)} title={s.name}>
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
        { key: "events", header: "Events", width: pixel(72), renderCell: (s) => props.eventCounts.get(s.id) ?? 0 },
      ]}
    />
  );
}

/** The Sources tab of a matter: add files, drop files, and the list of sources with hash, file status and text status. */
export function SourcesPanel(props: {
  sources: SourceRecord[];
  jobs: IngestJob[];
  eventCounts: Map<string, number>;
  onAddPaths: (paths: string[]) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void props.onAddPaths(api.pathsForFiles(Array.from(e.dataTransfer.files)));
  };
  return (
    <section className="sources" aria-label="Sources">
      <div className="section-header">
        <Heading level={3}>Sources ({props.sources.length})</Heading>
        <Button
          label="Add files…"
          size="sm"
          icon={<Icon icon={PaperClipIcon} size="sm" />}
          clickAction={async () => props.onAddPaths(await api.pickFiles())}
        />
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
        <Icon icon={ArrowUpTrayIcon} size="md" color="secondary" />
        <Text type="supporting">Drop files here: PDF, DOCX, text, PNG or JPEG</Text>
      </div>
      {props.sources.length > 0 ? (
        <SourcesTable sources={props.sources} jobs={props.jobs} eventCounts={props.eventCounts} onSelect={props.onSelect} />
      ) : (
        <Text type="supporting">No sources yet. Add the files of the brief.</Text>
      )}
    </section>
  );
}

function cleanError(e: Error): string {
  return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** Opens a source in the Euro-Office PDF editor (read only) and closes the view when the source changes. */
function useSourceView(matterId: string, sourceId: string, enabled: boolean): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let opened: string | null = null;
    setUrl(null);
    setError(null);
    if (!enabled) return;
    api.openSourceView(matterId, sourceId).then(
      (u) => {
        opened = u;
        if (live) setUrl(u);
        else void api.closeView(u);
      },
      (e: Error) => live && setError(cleanError(e)),
    );
    return () => {
      live = false;
      if (opened) void api.closeView(opened);
    };
  }, [matterId, sourceId, enabled]);
  return { url, error };
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
function PageText(props: { pages: PageRecord[]; focus?: SourceLink | null }) {
  const { pages } = props;
  const [page, setPage] = useState(props.focus?.page ?? 1);
  useEffect(() => {
    if (props.focus) setPage(props.focus.page);
  }, [props.focus]);
  const focusLine = props.focus && props.focus.page === page ? props.focus.line : 0;
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

export function EventTable(props: { events: EventRecord[] }) {
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

/** V2-1: what the advocate is told about a source that is not a PDF. */
const FORMAT_NOTE: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX: no PDF view. Each paragraph is one line; pages are blocks of 50 lines, not printed pages.",
  "text/plain": "Plain text: no PDF view. Pages are blocks of 50 lines, not printed pages.",
  "image/png": "Image: no PDF view. Read by OCR as one page.",
  "image/jpeg": "Image: no PDF view. Read by OCR as one page.",
};

const FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads";

/**
 * One source in the view: the Euro-Office PDF editor fills the view to its top edge (editor-design item j).
 * The stored page text appears below it only when it is needed: when a page was read by OCR or has no
 * text (the advocate compares the reading with the page), or when a source link asks for one line.
 * A PDF with a text layer on every page shows the editor alone.
 * The file facts and the record of the source go to the chat dock through `dock`.
 */
export function SourceDetail(props: {
  matterId: string;
  source: SourceRecord;
  events: EventRecord[];
  version: number;
  focus: SourceLink | null;
  dock: HTMLElement | null;
}) {
  const [origins, setOrigins] = useState<OriginRecord[]>([]);
  const [pages, setPages] = useState<PageRecord[]>([]);
  useEffect(() => {
    void api.listOrigins(props.matterId, props.source.id).then(setOrigins);
  }, [props.matterId, props.source.id, props.source.origins]);
  useEffect(() => {
    setPages([]);
    void api.getSourcePages(props.matterId, props.source.id).then(setPages);
  }, [props.matterId, props.source.id, props.version]);
  const events = props.events.filter((e) => e.subject === props.source.id);
  const isPdf = props.source.mediaType === "application/pdf";
  const view = useSourceView(props.matterId, props.source.id, isPdf);
  const unreadable = pages.filter((p) => p.kind !== "born_digital").length;
  const showText = pages.length > 0 && (unreadable > 0 || props.focus !== null);
  const textOnly = !isPdf;
  const frame = (
    <>
      {view.error ? <div className="notice work-pad" data-testid="viewer-error">{view.error}</div> : null}
      {!view.error && !view.url ? <div className="work-pad"><Text type="supporting">Opening the PDF editor…</Text></div> : null}
      {view.url ? <iframe className="work-frame" title="Source document" data-testid="source-frame" src={view.url} sandbox={FRAME_SANDBOX} /> : null}
    </>
  );
  return (
    <div className="source-view" data-testid="source-view">
      {props.dock
        ? createPortal(
            <div className="dock-card" aria-label="Open source">
              <div className="dock-card-row">
                {statusBadge(props.source.status)}
                <Text type="supporting">{formatSize(props.source.size)}</Text>
                <span className="mono" title={props.source.sha256}>{shortHash(props.source.sha256)}</span>
                {pages.length > 0 ? (
                  <Badge
                    variant={unreadable > 0 ? "warning" : "success"}
                    label={unreadable > 0 ? `${unreadable} of ${pages.length} pp. read by OCR or without text` : `Text layer, ${pages.length} pp.`}
                  />
                ) : null}
              </div>
              {view.url ? <ViewerState url={view.url} /> : null}
              {textOnly ? <Text type="supporting" data-testid="viewer-state">{FORMAT_NOTE[props.source.mediaType] ?? "No PDF view for this format."}</Text> : null}
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
            </div>,
            props.dock,
          )
        : null}
      {textOnly ? (
        <div className="source-info source-text-only">
          {pages.length > 0 ? <PageText pages={pages} focus={props.focus} /> : <div className="work-pad"><Text type="supporting">Reading the file…</Text></div>}
        </div>
      ) : showText ? (
        <Group orientation="vertical" style={{ height: "100%" }}>
          <Panel id="source-frame" defaultSize="62%" minSize="20%">
            {frame}
          </Panel>
          <Separator className="separator separator-horizontal" />
          <Panel id="source-text" minSize="12%">
            <div className="source-info">
              <PageText pages={pages} focus={props.focus} />
            </div>
          </Panel>
        </Group>
      ) : (
        frame
      )}
    </div>
  );
}
