/**
 * V3 views (docs/specs/v3.md): matter progress (V3-1) and the review inbox (V3-2).
 * Reads only, except the review-item decisions, which are the same bridge functions as before.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { AppInfo, Appearance, InboxItem, ProgressStage } from "../../shared/api.ts";
import { DateAnchorForm, DisputeDecision } from "./V5.tsx";

const api = window.openadvo;

const STATE_LABEL: Record<ProgressStage["state"], { label: string; variant: "neutral" | "info" | "success" | "error" }> = {
  not_started: { label: "Not started", variant: "neutral" },
  in_progress: { label: "In progress", variant: "info" },
  done: { label: "Done", variant: "success" },
  blocked: { label: "Blocked", variant: "error" },
};

/** V3-1: where the matter stands, stage by stage, with the next action. */
export function MatterProgress(props: { matterId: string; version: number; onTab: (tab: string) => void }) {
  const [stages, setStages] = useState<ProgressStage[] | null>(null);
  useEffect(() => {
    void api.getProgress(props.matterId).then(setStages, () => setStages(null));
  }, [props.matterId, props.version]);
  if (!stages) return null;
  const next = stages.find((s) => s.state !== "done" && s.next);
  const done = stages.filter((s) => s.state === "done").length;
  return (
    <section className="work-section progress" aria-label="Matter progress" data-testid="progress">
      <div className="progress-head">
        <Heading level={3}>Progress</Heading>
        <Text type="supporting">{done} of {stages.length} stages done</Text>
      </div>
      <div className="progress-bar" aria-hidden="true">
        {stages.map((s) => (
          <span key={s.id} data-state={s.state} title={`${s.title}: ${STATE_LABEL[s.state].label}`} />
        ))}
      </div>
      {next ? (
        <div className="next-step" data-testid="next-step">
          <Text weight="semibold">Next: </Text>
          <Text>{next.next}</Text>
          <Button label={`Go to ${tabName(next.tab)}`} size="sm" variant="ghost" onClick={() => props.onTab(next.tab)} />
        </div>
      ) : (
        <div className="next-step"><Text weight="semibold">Every stage is done.</Text></div>
      )}
      <ol className="stages">
        {stages.map((s) => (
          <li key={s.id} data-state={s.state} data-stage={s.id}>
            <Badge variant={STATE_LABEL[s.state].variant} label={STATE_LABEL[s.state].label} />
            <button type="button" className="link stage-title" onClick={() => props.onTab(s.tab)}>{s.title}</button>
            <Text type="supporting">{s.status}</Text>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TAB_NAMES: Record<string, string> = {
  matter: "Matter",
  sources: "Sources",
  procedural: "Procedural history",
  matrix: "Factual Matrix",
  chronology: "Chronology",
  entities: "Entities",
  records: "Record table",
  research: "Studio",
  filing: "Filing",
  review: "Review",
};

export function tabName(tab: string): string {
  return TAB_NAMES[tab] ?? tab;
}

/** V3-2: everything that waits for the advocate. j and k move, Enter opens. */
export function ReviewInbox(props: { matterId: string; version: number; onTab: (tab: string) => void; onOpenSource: (sourceId: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [at, setAt] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const load = useCallback(async () => setItems(await api.getInbox(props.matterId)), [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);
  if (!items) return null;
  const open = (item: InboxItem) => (item.sourceId && item.kind === "doc_type" ? props.onOpenSource(item.sourceId) : props.onTab(item.tab));
  const decided = async () => {
    await load();
    props.onChanged();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setAt((n) => Math.min(n + 1, items.length - 1));
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setAt((n) => Math.max(n - 1, 0));
    } else if (e.key === "Enter" && items[at]) {
      e.preventDefault();
      open(items[at]);
    }
  };
  const blocking = items.filter((i) => i.blocks);
  const row = (item: InboxItem, index: number) => (
    <li key={item.id} data-index={index} data-current={index === at} data-kind={item.kind} data-testid="inbox-item" onClick={() => setAt(index)}>
      <div className="inbox-main">
        <Text weight="semibold">{item.title}</Text>
        <Text>{item.detail}</Text>
      </div>
      <div className="row-actions">
        {item.kind === "ocr_dispute" && item.reviewItemId ? (
          <DisputeDecision matterId={props.matterId} reviewItemId={item.reviewItemId} onDone={() => void decided()} />
        ) : item.kind === "date_anchor" && item.sourceId ? (
          <DateAnchorForm matterId={props.matterId} sourceId={item.sourceId} onDone={() => void decided()} />
        ) : item.kind === "possible_duplicate" && item.reviewItemId ? (
          <>
            <Button label="Same document" size="sm" clickAction={async () => { await api.decideDuplicate(props.matterId, item.reviewItemId!, "same"); await decided(); }} />
            <Button label="Different documents" size="sm" variant="ghost" clickAction={async () => { await api.decideDuplicate(props.matterId, item.reviewItemId!, "different"); await decided(); }} />
          </>
        ) : item.reviewItemId ? (
          <>
            <Button label="Resolve" size="sm" clickAction={async () => { await api.resolveReviewItem(props.matterId, item.reviewItemId!); await decided(); }} />
            <Button label="Skip" size="sm" variant="ghost" clickAction={async () => { await api.skipReviewItem(props.matterId, item.reviewItemId!); await decided(); }} />
          </>
        ) : null}
        <Button label={`Open ${item.kind === "doc_type" ? "source" : tabName(item.tab)}`} size="sm" variant="ghost" onClick={() => open(item)} />
      </div>
    </li>
  );
  return (
    <section className="work-section inbox" aria-label="Review inbox" data-testid="inbox" tabIndex={0} onKeyDown={onKey}>
      <Heading level={3}>Review</Heading>
      <Text type="supporting">Everything that waits for your decision. Keys: j and k move, Enter opens.</Text>
      {items.length === 0 ? <Text type="supporting" data-testid="inbox-empty">Nothing waits for you.</Text> : null}
      <ol className="inbox-list" ref={listRef}>
        {blocking.length ? <li className="inbox-group">Blocks the work ({blocking.length})</li> : null}
        {blocking.map((it, i) => row(it, i))}
        {items.length > blocking.length ? <li className="inbox-group">Other ({items.length - blocking.length})</li> : null}
        {items.slice(blocking.length).map((it, i) => row(it, i + blocking.length))}
      </ol>
    </section>
  );
}

// ---- V3-4: settings ----

export const APPEARANCE_EVENT = "openadvo:appearance";

export function SettingsPage(props: { mailbox: ReactNode; research?: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [mode, setMode] = useState<Appearance>("system");
  useEffect(() => {
    void api.getAppInfo().then(setInfo);
    void api.getAppearance().then(setMode);
  }, []);
  const choose = async (m: Appearance) => {
    setMode(m);
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: m }));
    await api.setAppearance(m);
  };
  return (
    <div className="work-scroll settings" data-testid="settings">
      <Heading level={2}>Settings</Heading>
      <section className="work-section" aria-label="Appearance">
        <Heading level={3}>Appearance</Heading>
        <div className="row-actions" role="radiogroup" aria-label="Appearance">
          {(["system", "light", "dark"] as const).map((m) => (
            <label key={m} className="radio">
              <input type="radio" name="appearance" checked={mode === m} onChange={() => void choose(m)} /> {m === "system" ? "Follow the system" : m === "light" ? "Light" : "Dark"}
            </label>
          ))}
        </div>
      </section>
      <section className="work-section" aria-label="Mailbox">
        <Heading level={3}>Authorised mailbox</Heading>
        {props.mailbox}
      </section>
      <section className="work-section" aria-label="Research sources">
        <Heading level={3}>Research sources</Heading>
        <Text type="supporting">Queries to these sources leave this computer and are recorded in the matter's research log. Turn off a source you do not want used.</Text>
        {props.research}
      </section>
      <section className="work-section" aria-label="Filing manifest key">
        <Heading level={3}>Filing manifest key</Heading>
        <Text type="supporting">Every filing manifest is signed with this application's Ed25519 key. The private key is kept encrypted by the operating system and never leaves this computer.</Text>
        <Text>Fingerprint: <span className="mono" data-testid="signing-fingerprint">{info?.signingKey ?? "not available: the operating system's secret store is not available, so manifests are not signed"}</span></Text>
      </section>
      <section className="work-section" aria-label="Folders">
        <Heading level={3}>Folders</Heading>
        <dl className="facts">
          <dt>Matters</dt><dd className="mono">{info?.folders.matters}</dd>
          <dt>Settings and keys</dt><dd className="mono">{info?.folders.userData}</dd>
        </dl>
      </section>
      <section className="work-section" aria-label="Versions">
        <Heading level={3}>Versions</Heading>
        <dl className="facts" data-testid="versions">
          <dt>Open Advocate</dt><dd>{info?.app}</dd>
          <dt>Electron</dt><dd>{info?.electron} (Chromium {info?.chrome}, Node {info?.node})</dd>
          <dt>Euro-Office</dt><dd>{info?.euroOffice}</dd>
          <dt>Citation validator</dt><dd>{info?.validator}</dd>
        </dl>
      </section>
      <section className="work-section" aria-label="Keyboard shortcuts">
        <Heading level={3}>Keyboard shortcuts</Heading>
        <dl className="facts">
          <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Command bar: matters, tabs, actions and source lines</dd>
          <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>Review tab: next and previous item</dd>
          <dt><kbd>Enter</kbd></dt><dd>Review tab: open the item</dd>
          <dt><kbd>Escape</kbd></dt><dd>Close the command bar, the Inspector or a dialog</dd>
        </dl>
      </section>
    </div>
  );
}

// ---- V3-3: the command bar ----

export interface Command {
  id: string;
  group: "Matters" | "Go to" | "Actions" | "Source lines" | "In this matter";
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandBar(props: { isOpen: boolean; onClose: () => void; commands: Command[]; searchLines: ((q: string) => Promise<Command[]>) | null }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [lines, setLines] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.isOpen) {
      setQ("");
      setAt(0);
      setLines([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [props.isOpen]);
  useEffect(() => {
    if (!props.searchLines || q.trim().length < 3) {
      setLines([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => void props.searchLines!(q.trim()).then((r) => live && setLines(r)), 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, props.searchLines]);
  if (!props.isOpen) return null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = props.commands.filter((c) => words.every((w) => `${c.group} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(w)));
  const all = [...matches.slice(0, 30), ...lines];
  const run = (c: Command | undefined) => {
    if (!c) return;
    props.onClose();
    c.run();
  };
  let group = "";
  return (
    <div className="command-backdrop" onMouseDown={props.onClose} data-testid="command-bar">
      <div className="command-bar" role="dialog" aria-label="Command bar" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          aria-label="Command"
          placeholder="Type a matter, a tab, an action, or words from a source"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((n) => Math.min(n + 1, all.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((n) => Math.max(n - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(all[at]);
            }
          }}
        />
        <ul className="command-list" role="listbox">
          {all.length === 0 ? <li className="command-empty">No match.</li> : null}
          {all.map((c, i) => {
            const head = c.group !== group ? (group = c.group) : null;
            return (
              <li key={c.id} role="none">
                {head ? <div className="command-group">{head}</div> : null}
                <button type="button" role="option" aria-selected={i === at} data-current={i === at} onMouseEnter={() => setAt(i)} onClick={() => run(c)}>
                  <span>{c.label}</span>
                  {c.hint ? <span className="command-hint">{c.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
