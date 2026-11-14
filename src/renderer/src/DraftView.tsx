import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import type { DraftCheck, DraftRecord, NotebookEvent, ParagraphSource, RevisionRecord } from "../../shared/api.ts";
import type { SourceLink } from "./Notebook.tsx";

const api = window.openadvo;

/** "final" is the clean text preview (read only in this build), "edit" shows tracked changes and accepts typing, "original" shows the first revision. */
type DisplayMode = "final" | "edit" | "original";

const VIEW_OPTIONS = [
  { value: "final", label: "Clean" },
  { value: "edit", label: "Redline" },
  { value: "original", label: "Original" },
];

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

function dateCell(event: { dateStart: string; dateEnd: string }): string {
  return event.dateStart === event.dateEnd ? event.dateStart : `${event.dateStart} – ${event.dateEnd}`;
}

/** The document bytes of a save request. The protocol names an ArrayBuffer; a typed array carries the same bytes. */
function documentBytes(bytes: unknown): Uint8Array | null {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (bytes instanceof Uint8Array) return bytes;
  return null;
}

/** The Notebook events one paragraph anchor links to, with the source line of each (design section 1.1). */
function ParagraphSourcePanel(props: { source: ParagraphSource; onClose: () => void; onOpenSource: (link: SourceLink) => void }) {
  return (
    <section className="source-panel" data-testid="paragraph-source" aria-label="Paragraph source">
      <div className="source-panel-header">
        <Text weight="semibold">Paragraph source</Text>
        <Button label="Close" size="sm" variant="ghost" onClick={props.onClose} />
      </div>
      {props.source.events.length === 0 ? <Text type="supporting">No source events are stored for this paragraph.</Text> : null}
      <ul className="source-event-list">
        {props.source.events.map((event) => (
          <li key={event.id} className="source-event" data-anchor={event.anchorId}>
            <div>
              <b>{dateCell(event)}</b> — {event.description}
            </div>
            <Text type="supporting">
              {event.sourceName}, p. {event.page}, l. {event.line}
            </Text>
            {event.reading === "ocr" ? <Text type="supporting">OCR, single reading</Text> : null}
            <div className="row-actions">
              <Button label="Open source" size="sm" onClick={() => props.onOpenSource({ sourceId: event.sourceId, page: event.page, line: event.line })} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The result of the draft checks: each defect with its evidence and the action it needs (workflow 9A, 9D). */
function DraftCheckPanel(props: { check: DraftCheck; stale: boolean; onClose: () => void }) {
  const { check } = props;
  return (
    <section className="source-panel" data-testid="draft-check" aria-label="Draft check">
      <div className="source-panel-header">
        <Text weight="semibold">
          Check of revision {check.seq}: {check.defects.length} defect(s) in {check.statementsChecked} statement(s)
        </Text>
        <Button label="Close" size="sm" variant="ghost" onClick={props.onClose} />
      </div>
      <div data-testid="draft-gate">
        <Text weight="semibold">Gate: {check.gate.label}</Text>
        <ul className="gate-reasons">
          {check.gate.reasons.map((r) => (
            <li key={r}>
              <Text type="supporting">{r}</Text>
            </li>
          ))}
          {check.gate.notAvailable.map((r) => (
            <li key={r}>
              <Text type="supporting">{r}</Text>
            </li>
          ))}
        </ul>
        <Text type="supporting">
          Review items: {check.reviewItems.opened} opened, {check.reviewItems.alreadyOpen} already open. Resolve or skip them on the Matter tab.
        </Text>
      </div>
      {props.stale ? <Text type="supporting">The draft changed after this check. Save and check again.</Text> : null}
      {check.defects.length === 0 ? <Text type="supporting">No defect found by the checks that ran.</Text> : null}
      <ul className="source-event-list">
        {check.defects.map((defect, index) => (
          <li key={`${defect.paragraph}-${defect.kind}-${index}`} className="source-event" data-kind={defect.kind}>
            <div>
              <Badge variant="warning" label={`Paragraph ${defect.paragraph}`} /> {defect.evidence}
            </div>
            <Text type="supporting">“{defect.text.length > 140 ? `${defect.text.slice(0, 140)}…` : defect.text}”</Text>
            <Text type="supporting">Action: {defect.action}</Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Word editor of one draft revision. The editor frame fills the view, so its ribbon reaches the top.
 * Our harness bar is outside the editor frame, in the chat dock (`dock`), beside the editor
 * (editor-design items b, c and i; the frame protocol is fixed by the editor host).
 */
export function DraftView(props: {
  matterId: string;
  draft: DraftRecord;
  revision: RevisionRecord;
  /** The place in the chat dock that holds the harness bar. */
  dock: HTMLElement | null;
  onChanged: () => Promise<void>;
  onOpenSource: (link: SourceLink) => void;
  /** Item f: a paragraph to move the editor to. `n` changes for each request. */
  focus?: { anchor: string; n: number } | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [editorOpened, setEditorOpened] = useState(false);
  /** The revision the editor holds. A human save makes a new revision; every later save names it as the base. */
  const baseRevisionId = useRef(props.revision.id);
  /** Revisions this view saved. A refresh that reports them must not reopen the frame. */
  const localRevisionIds = useRef(new Set<string>());
  const loadedRevisionId = useRef<string | null>(null);
  const frameOpened = useRef(false);
  const requestSeq = useRef(0);
  const pendingCommands = useRef(new Map<string, string>());

  const [url, setUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("edit");
  const [revisionInfo, setRevisionInfo] = useState({ seq: props.revision.seq, sha256: props.revision.sha256 });
  const [dirty, setDirty] = useState(false);
  const [approved, setApproved] = useState(props.revision.approvedAt !== null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState<ParagraphSource | null>(null);
  const [check, setCheck] = useState<DraftCheck | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertEvents, setInsertEvents] = useState<NotebookEvent[]>([]);
  const [insertError, setInsertError] = useState<string | null>(null);

  const post = useCallback((payload: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(payload, "*");
  }, []);

  const sendCommand = useCallback(
    (command: string, args: Record<string, unknown>) => {
      if (!doc) return;
      const requestId = `${Date.now().toString(36)}-${++requestSeq.current}`;
      pendingCommands.current.set(requestId, command);
      post({ type: "oa-editor/command", doc, requestId, command, args });
    },
    [doc, post],
  );

  const sendDisplayMode = useCallback((mode: DisplayMode) => sendCommand("displayMode", { mode }), [sendCommand]);

  // Open the revision in the Word editor. One revision per open view: a new revision id reopens the frame.
  useEffect(() => {
    if (loadedRevisionId.current === props.revision.id) return;
    if (localRevisionIds.current.has(props.revision.id)) {
      loadedRevisionId.current = props.revision.id;
      return;
    }
    loadedRevisionId.current = props.revision.id;
    baseRevisionId.current = props.revision.id;
    frameOpened.current = false;
    setUrl(null);
    setDoc(null);
    setEditorOpened(false);
    setFrameError(null);
    setRevisionInfo({ seq: props.revision.seq, sha256: props.revision.sha256 });
    setApproved(props.revision.approvedAt !== null);
    setDirty(false);
    setSaveBlocked(false);
    setMessage(null);
    setSource(null);
    let live = true;
    let openedUrl: string | null = null;
    api.openRevisionInEditor(props.matterId, props.revision.id).then(
      (value) => {
        openedUrl = value;
        if (!live) {
          void api.closeView(value);
          return;
        }
        let token: string | null = null;
        try {
          token = new URL(value).searchParams.get("doc");
        } catch {
          token = null;
        }
        if (!token) {
          setFrameError("The editor URL has no document token.");
          return;
        }
        setDoc(token);
        setUrl(value);
      },
      (error: Error) => {
        if (live) setFrameError(errorText(error));
      },
    );
    return () => {
      live = false;
      if (openedUrl) void api.closeView(openedUrl);
    };
  }, [props.matterId, props.revision.id]);

  /** A human save: the frame sends its Editor.bin, the matter store makes a new revision or refuses a stale base. */
  const onSaveRequest = useCallback(
    async (requestId: string, bytes: unknown) => {
      if (!doc) return;
      const bytesToStore = documentBytes(bytes);
      if (!bytesToStore) {
        post({ type: "oa-editor/save-result", doc, requestId, ok: false, message: "The editor sent no document bytes." });
        setMessage("The editor sent no document bytes.");
        return;
      }
      try {
        const saved = await api.saveRevision(props.matterId, props.draft.id, bytesToStore, baseRevisionId.current);
        baseRevisionId.current = saved.id;
        localRevisionIds.current.add(saved.id);
        setRevisionInfo({ seq: saved.seq, sha256: saved.sha256 });
        setDirty(false);
        setSaveBlocked(false);
        post({
          type: "oa-editor/save-result",
          doc,
          requestId,
          ok: true,
          revision: { id: saved.id, seq: saved.seq, sha256: saved.sha256 },
        });
        setMessage("Saved.");
        try {
          await props.onChanged();
        } catch {
          // The revision is stored. A failed list refresh does not change that.
        }
      } catch (error) {
        const text = errorText(error);
        const code = /DOC_[A-Z_]+/.exec(text)?.[0];
        post({ type: "oa-editor/save-result", doc, requestId, ok: false, ...(code ? { code } : {}), message: text });
        if (text.includes("DOC_STALE_BASE")) {
          setSaveBlocked(true);
          setMessage("The stored document has a newer revision. Close and reopen the latest revision.");
        } else {
          setMessage(text);
        }
      }
    },
    [doc, post, props.matterId, props.draft.id, props.onChanged],
  );

  const onCommandResult = useCallback(
    async (requestId: string, data: Record<string, unknown>) => {
      const command = pendingCommands.current.get(requestId);
      pendingCommands.current.delete(requestId);
      const error = typeof data.error === "string" && data.error.length > 0 ? data.error : null;
      if (data.ok !== true) {
        setMessage(error ?? "The editor refused the command.");
        return;
      }
      if (command === "showSource") {
        const result = (data.result ?? null) as { anchor?: unknown } | null;
        const anchor = result && typeof result.anchor === "string" && result.anchor.length > 0 ? result.anchor : null;
        if (!anchor) {
          setMessage("This paragraph has no source link.");
          return;
        }
        try {
          const found = await api.getParagraphSource(props.matterId, props.draft.id, anchor);
          if (!found || found.events.length === 0) {
            setMessage("This paragraph has no source link.");
            return;
          }
          setMessage(null);
          setSource(found);
        } catch (e) {
          setMessage(errorText(e));
        }
        return;
      }
      if (command === "save") {
        setDirty(false);
        setMessage("Saved.");
      }
    },
    [props.matterId, props.draft.id],
  );

  // The frame protocol. Only the frame origin, and only messages for this document token, are accepted.
  useEffect(() => {
    if (!doc) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "oa-eo://app") return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      if (data.doc !== doc) return;
      const type = data.type;
      if (type === "oa-editor/state") {
        const state = typeof data.state === "string" ? data.state : "";
        if (state === "opened") {
          frameOpened.current = true;
          setEditorOpened(true);
          setFrameError(null);
          sendDisplayMode(displayMode);
        } else if (state === "failed" || state === "error") {
          setFrameError(String(data.detail ?? "The editor reported a problem."));
        }
        return;
      }
      if (type === "oa-editor/dirty") {
        if (typeof data.modified !== "boolean") return;
        post({ type: "oa-editor/ack", doc, requestId: data.requestId });
        setDirty(data.modified);
        return;
      }
      if (type === "oa-editor/save-request") {
        if (typeof data.requestId !== "string") return;
        void onSaveRequest(data.requestId, data.bytes);
        return;
      }
      if (type === "oa-editor/command-result") {
        if (typeof data.requestId !== "string") return;
        void onCommandResult(data.requestId, data);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [doc, displayMode, post, sendDisplayMode, onSaveRequest, onCommandResult]);

  const save = () => {
    if (saveBlocked) return;
    setMessage("Saving…");
    sendCommand("save", {});
  };

  const showParagraphSource = () => {
    setSource(null);
    sendCommand("showSource", {});
  };

  const openInsertDialog = async () => {
    setInsertError(null);
    try {
      const notebook = await api.getNotebook(props.matterId);
      const confirmed = notebook.events.filter((event) => event.status === "confirmed" && !event.excluded);
      if (confirmed.length === 0) {
        setMessage("No confirmed Notebook events.");
        return;
      }
      setInsertEvents(confirmed);
      setInsertOpen(true);
    } catch (e) {
      setMessage(errorText(e));
    }
  };

  const chooseEvent = async (event: NotebookEvent) => {
    setInsertError(null);
    try {
      const inserted = await api.insertFromNotebook(props.matterId, props.draft.id, event.id);
      sendCommand("insert", { anchor: inserted.anchor, text: inserted.text });
      setInsertOpen(false);
      setMessage("Inserted one event from the Notebook.");
    } catch (e) {
      setInsertError(errorText(e));
    }
  };

  /** The checks read the stored revision, so unsaved typing is not part of them. */
  const runCheck = async () => {
    if (dirty) {
      setMessage("Save the revision first. The checks read the saved revision.");
      return;
    }
    try {
      const result = await api.checkDraft(props.matterId, props.draft.id);
      setSource(null);
      setCheck(result);
      setMessage(null);
    } catch (e) {
      setMessage(errorText(e));
    }
  };

  const approve = async () => {
    if (approving) return;
    setApproving(true);
    try {
      await api.approveRevision(props.matterId, baseRevisionId.current);
      setApproved(true);
      setMessage("Revision approved by the advocate.");
      try {
        await props.onChanged();
      } catch {
        // The approval is stored. A failed list refresh does not undo it.
      }
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setApproving(false);
    }
  };

  // Item f: move the editor to the paragraph the change card names, once the editor is open.
  const focusN = props.focus?.n;
  useEffect(() => {
    if (!props.focus || !editorOpened) return;
    sendCommand("goToAnchor", { anchor: props.focus.anchor });
    // Only a new request moves the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusN, editorOpened]);

  // Item c: the status counts the agent changes not decided in the open revision.
  const [undecided, setUndecided] = useState(0);
  useEffect(() => {
    let live = true;
    api.agentChanges(props.matterId).then(
      (groups) => live && setUndecided(groups.find((g) => g.revisionId === props.revision.id)?.changes.length ?? 0),
      () => live && setUndecided(0),
    );
    return () => {
      live = false;
    };
  }, [props.matterId, props.revision.id]);

  const harness = (
    <>
      <div className="harness-bar" data-testid="harness-bar">
        <div className="harness-status" data-testid="draft-status" role="status">
          <Text weight="semibold">Revision {revisionInfo.seq}</Text>
          <span className="mono" title={revisionInfo.sha256}>
            {shortHash(revisionInfo.sha256)}
          </span>
          <Text weight="semibold">{dirty ? "Unsaved changes" : "Saved"}</Text>
          {approved ? <Badge variant="success" label="Approved by advocate" /> : null}
          {undecided > 0 ? (
            <Text type="supporting" weight="semibold" data-testid="draft-undecided">
              {undecided} agent change(s) not decided
            </Text>
          ) : null}
          <Text type="supporting" data-testid="draft-verification">
            {check && check.seq === revisionInfo.seq && !dirty
              ? `Facts checked: ${check.defects.length} defect(s). Gate: ${check.gate.label}. Citations: not verified`
              : "Verification: not verified"}
          </Text>
          {message ? (
            <Text type="supporting" data-testid="draft-message">
              {message}
            </Text>
          ) : null}
        </div>
        <div className="harness-actions">
          <Selector
            label="View"
            isLabelHidden
            size="sm"
            options={VIEW_OPTIONS}
            value={displayMode}
            onChange={(value) => {
              const mode: DisplayMode = value === "edit" ? "edit" : value === "original" ? "original" : "final";
              setDisplayMode(mode);
              if (frameOpened.current) sendDisplayMode(mode);
            }}
          />
          <Button label="Save revision" size="sm" variant="primary" isDisabled={!doc || saveBlocked} clickAction={save} />
          <Button label="Approve revision" size="sm" isDisabled={approved || approving} clickAction={approve} />
          <Button label="Check draft" size="sm" isDisabled={!doc} clickAction={runCheck} />
          <Button label="Show source of this paragraph" size="sm" isDisabled={!doc} onClick={showParagraphSource} />
          <Button label="Insert from Notebook" size="sm" isDisabled={!doc} clickAction={openInsertDialog} />
          <span className="harness-citations">
            <Button label="Check citations" size="sm" isDisabled />
            <Text type="supporting">not available until step 7</Text>
          </span>
        </div>
      </div>
      {source ? <ParagraphSourcePanel source={source} onClose={() => setSource(null)} onOpenSource={props.onOpenSource} /> : null}
      {check && !source ? <DraftCheckPanel check={check} stale={dirty || check.seq !== revisionInfo.seq} onClose={() => setCheck(null)} /> : null}
    </>
  );

  return (
    <div className="draft-view" data-testid="draft-view">
      {props.dock ? createPortal(harness, props.dock) : null}
      {frameError ? (
        <div className="notice work-pad" role="alert" data-testid="draft-error">
          {frameError}
        </div>
      ) : null}
      {url ? (
        <iframe
          key={url}
          ref={frameRef}
          className="work-frame"
          data-testid="draft-frame"
          title="Draft document"
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        />
      ) : !frameError ? (
        <div className="work-pad">
          <Text type="supporting">Opening the Word editor…</Text>
        </div>
      ) : null}
      <Dialog isOpen={insertOpen} onOpenChange={setInsertOpen} purpose="form" width={560} padding={4}>
        <DialogHeader title="Insert from Notebook" onOpenChange={setInsertOpen} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
          <Text type="supporting">Each confirmed Notebook event adds one sentence at the cursor.</Text>
          {insertError ? (
            <div className="notice" role="alert">
              {insertError}
            </div>
          ) : null}
          <ul className="insert-list">
            {insertEvents.map((event) => (
              <li key={event.id} className="insert-item">
                <div>
                  <b>{dateCell(event)}</b> — {event.description}
                </div>
                <Text type="supporting">
                  {event.sourceName}, p. {event.page}, l. {event.line}
                </Text>
                <Button label={`Insert ${event.dateText}`} size="sm" clickAction={() => chooseEvent(event)} />
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button label="Cancel" variant="ghost" onClick={() => setInsertOpen(false)} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

