import { useEffect, useRef, useState, type DragEvent } from "react";
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
import { DocTypeBadge, DocTypeControl } from "./V2.tsx";
import { InspectButton, inspect } from "./V5.tsx";
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
          width: proportional(1, { minWidth: 140 }),
          sortable: true,
          renderCell: (s) => (
            <button type="button" className="link" onClick={() => props.onSelect(s.id)} title={s.name}>
              {s.name}
            </button>
          ),
        },
        { key: "docType", header: "Type", width: pixel(124), renderCell: (s) => <DocTypeBadge source={s} /> },
        { key: "sha256", header: "SHA-256", width: pixel(104), sortable: true, renderCell: (s) => <span className="mono" title={s.sha256}>{shortHash(s.sha256)}</span> },
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

/**
 * The read-only PDF view. The pages are images in one normal scroll container, so the mouse wheel
 * scrolls the document. A page image is rendered when it comes near the viewport; a large judgment
 * never renders every page at once.
 */
function PdfSourceView(props: { matterId: string; sourceId: string; pages: number; focus: SourceLink | null }) {
  const [scale, setScale] = useState(1.5);
  const [images, setImages] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const loading = useRef(new Set<number>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  const load = (page: number) => {
    if (imagesRef.current[page] || loading.current.has(page)) return;
    loading.current.add(page);
    setBusy((n) => n + 1);
    void api.sourcePageImage(props.matterId, props.sourceId, page, scale).then(
      (url) => setImages((all) => ({ ...all, [page]: url })),
      (e: Error) => setError(cleanError(e)),
    ).finally(() => {
      loading.current.delete(page);
      setBusy((n) => Math.max(0, n - 1));
    });
  };

  useEffect(() => {
    setImages({});
    setError(null);
    loading.current.clear();
    // The first page is always loaded, even when the observer has not fired yet.
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sourceId, scale]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (page) load(page);
        }
      },
      { root, rootMargin: "800px 0px" },
    );
    for (const el of pageRefs.current.values()) io.observe(el);
    return () => io.disconnect();
    // load reads the current refs; a new observer is needed only when the source or scale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sourceId, scale, props.pages]);

  const focusPage = props.focus?.page;
  useEffect(() => {
    if (focusPage) pageRefs.current.get(focusPage)?.scrollIntoView({ block: "start" });
  }, [focusPage]);

  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
      <div className="pdf-toolbar">
        <Text>{props.pages} page{props.pages === 1 ? "" : "s"}</Text>
        <Button label="Zoom out" size="sm" variant="ghost" isDisabled={scale <= 0.75} clickAction={() => setScale((s) => Math.max(0.75, Math.round((s - 0.25) * 100) / 100))} />
        <Text type="supporting">{Math.round(scale * 100)}%</Text>
        <Button label="Zoom in" size="sm" variant="ghost" isDisabled={scale >= 4} clickAction={() => setScale((s) => Math.min(4, Math.round((s + 0.25) * 100) / 100))} />
        <Text type="supporting">Scroll with the mouse wheel. Each page is read only.</Text>
        {busy > 0 ? <Text type="supporting">Reading {busy} page{busy === 1 ? "" : "s"}…</Text> : null}
      </div>
      {error ? <div className="notice" role="alert" data-testid="pdf-error">{error}</div> : null}
      <div className="pdf-scroll" ref={scrollRef} data-testid="pdf-scroll">
        {Array.from({ length: props.pages }, (_, i) => i + 1).map((page) => (
          <div
            key={page}
            className="pdf-page"
            data-page={page}
            data-testid={`pdf-page-${page}`}
            ref={(el) => {
              if (el) pageRefs.current.set(page, el);
              else pageRefs.current.delete(page);
            }}
          >
            {images[page] ? <img src={images[page]} alt={`Page ${page}`} /> : <div className="pdf-page-placeholder">Page {page}</div>}
          </div>
        ))}
      </div>
    </div>
  );
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
            <td>{e.seq}</td><td>{e.at}</td><td>{e.actor}</td><td>{e.subject ? <button type="button" className="link" onClick={() => inspect(e.subject!)}>{e.action}</button> : e.action}</td>
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
  /** V2-2: called after the advocate sets the document type. */
  onChanged?: () => void;
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
  const unreadable = pages.filter((p) => p.kind !== "born_digital").length;
  const showText = pages.length > 0 && (unreadable > 0 || props.focus !== null);
  const textOnly = !isPdf;
  const frame = pages.length > 0 ? (
    <PdfSourceView matterId={props.matterId} sourceId={props.source.id} pages={pages.length} focus={props.focus} />
  ) : (
    <div className="work-pad"><Text type="supporting">Reading the file…</Text></div>
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
              <DocTypeControl matterId={props.matterId} source={props.source} onChanged={() => props.onChanged?.()} />
              <InspectButton id={props.source.id} label="Inspect the source record" />
              {isPdf ? <Text type="supporting" data-testid="viewer-state">Read-only PDF view. Scroll the page with the wheel.</Text> : null}
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
