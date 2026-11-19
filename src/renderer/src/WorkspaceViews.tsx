/**
 * Workspace views: matter progress, the Review Inbox, Settings, the command bar, tool permissions,
 * plan strength and Pi extensions. Reads only, except the human-only decisions.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutPanel, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import type { AppInfo, Appearance, InboxItem, IntegrationRecord, PiExtensionInfo, ProgressStage, StorageFolder, ToolPolicyView } from "../../shared/api.ts";
import { DateAnchorForm, DisputeDecision } from "./AuditPanels.tsx";
import { TriggersPanel } from "./Builders.tsx";

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
/** What a review item means and what the advocate can do about it. Deterministic, no model. */
function explainInbox(item: InboxItem): string {
  switch (item.kind) {
    case "date_conflict":
      return "Two sources put the same event on different dates. Keep the date one source states, keep both when they are different events, or open the source and correct the wrong event. The system does not choose.";
    case "doc_type":
      return "The reader guessed the document's type. Check the first page, then confirm or correct the type. A wrong type changes how the document is read and which checks apply.";
    case "ocr_dispute":
      return "The two OCR readings of the same line differ. Read the page image, choose the reading that matches the page, or type the line yourself. The chosen reading is what the record uses.";
    case "possible_duplicate":
      return "Two sources look like the same document. Same document means one source is a duplicate; different documents means both stay. Check the hash, the page count and the first page before deciding.";
    case "injection":
      return "A document or page contains text that looks like an instruction to the agent. It is data, never an instruction. Read the quoted line and decide whether the document is safe to rely on.";
    case "date_anchor":
      return "A relative date in this file (for example 'the next day') has no date to count from. Give the base date the document uses, or correct the date in the source.";
    case "document_quality":
      return "The reading may be poor: blur, skew, a missing page or a low-confidence OCR page. Check the page image before relying on the text. The quality score is advice, not a finding.";
    case "final_order":
      return "This is a judgment or order, and the next step is a choice, not an end. Check the date and the operative order, compute limitation, then decide: appeal or special leave petition, review or revision, or no action. The court directory names the next forum; the agent can propose the route.";
    case "research_memo":
      return "A research memorandum is ready. Check its verified quotes, its adverse authority and its coverage line before relying on it. The memorandum is a candidate; you decide.";
    case "filing_defect":
      return "A filing check found a defect. Open the filing set, read the item and its source, then correct the document or record why the item does not apply.";
    default:
      return "The system recorded something that needs your decision. Read the detail, open its source or tab, and resolve or skip it. The agent can explain the item and the options without deciding it.";
  }
}

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
        <details className="conflict-explain">
          <summary>What this means, and your options</summary>
          <Text type="supporting">{explainInbox(item)}</Text>
          <Button label="Ask the agent to explain this" size="sm" variant="ghost" clickAction={() => api.sendChat(props.matterId, `Explain this review item and the options for me. Do not decide it. ${item.title}: ${item.detail}`)} />
        </details>
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

export function SettingsPage(props: { mailbox: ReactNode; research?: ReactNode; contacts?: ReactNode; diagnostics?: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [mode, setMode] = useState<Appearance>("system");
  const [active, setActive] = useState("appearance");
  const [storage, setStorage] = useState<StorageFolder[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  useEffect(() => {
    void api.getAppInfo().then(setInfo);
    void api.getAppearance().then(setMode);
    void api.storageFolders().then(setStorage, () => setStorage([]));
    void api.listIntegrations().then(setIntegrations, () => setIntegrations([]));
  }, []);
  const addIntegration = async () => {
    try {
      setIntegrationError(null);
      const r = await api.addIntegration();
      if (r) setIntegrations(await api.listIntegrations());
    } catch (e) {
      setIntegrationError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };
  const toggleIntegration = async (id: string, enabled: boolean) => {
    try {
      setIntegrationError(null);
      await api.setIntegrationEnabled(id, enabled);
      setIntegrations(await api.listIntegrations());
    } catch (e) {
      setIntegrationError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };
  const choose = async (m: Appearance) => {
    setMode(m);
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: m }));
    await api.setAppearance(m);
  };
  const sections = [
    { id: "appearance", label: "Appearance" },
    { id: "role-models", label: "Role models" },
    { id: "extensions", label: "Pi extensions" },
    { id: "permissions", label: "Tool permissions" },
    { id: "plan", label: "Plan" },
    { id: "mailbox", label: "Mailbox" },
    { id: "research", label: "Research sources" },
    { id: "contacts", label: "Contacts" },
    { id: "storage", label: "Storage" },
    { id: "integrations", label: "Integrations" },
    { id: "triggers", label: "Triggers" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "filing-key", label: "Filing manifest key" },
    { id: "folders", label: "Folders" },
    { id: "versions", label: "Versions" },
    { id: "shortcuts", label: "Keyboard shortcuts" },
  ];
  const go = (id: string) => {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ block: "start" });
  };
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1}>
            <Heading level={2}>Settings</Heading>
            <Text type="supporting">The window, the agent and this computer. Every change applies as you make it.</Text>
          </VStack>
        </LayoutHeader>
      }
      start={
        <LayoutPanel role="navigation" label="Settings sections" width={210} hasDivider>
          <List density="compact">
            {sections.map((s) => (
              <ListItem key={s.id} label={s.label} isSelected={active === s.id} onClick={() => go(s.id)} />
            ))}
          </List>
        </LayoutPanel>
      }
      content={
        <LayoutContent padding={4} data-testid="settings">
          <VStack gap={4}>
            <section className="work-section" id="settings-appearance" aria-label="Appearance">
              <Heading level={3}>Appearance</Heading>
              <div className="row-actions" role="radiogroup" aria-label="Appearance">
                {(["system", "light", "dark"] as const).map((m) => (
                  <label key={m} className="radio">
                    <input type="radio" name="appearance" checked={mode === m} onChange={() => void choose(m)} /> {m === "system" ? "Follow the system" : m === "light" ? "Light" : "Dark"}
                  </label>
                ))}
              </div>
            </section>
            <section className="work-section" id="settings-role-models" aria-label="Role models">
              <Heading level={3}>Role models</Heading>
              <Text type="supporting">
                A model for each role the agent works in, local or remote. With none set, the chat's model runs everything. A role model that no longer has credentials falls back to the chat's model, and the run says so.
              </Text>
              <RoleModelSettings />
            </section>
            <section className="work-section" id="settings-extensions" aria-label="Pi extensions">
              <Heading level={3}>Pi extensions</Heading>
              <Text type="supporting">Extensions add tools and commands to the agent. An extension runs code on this computer, so add only one whose source you have reviewed. Pi's built-in file and shell tools stay off, and the tool permissions below decide every tool call. A change applies when a conversation next opens.</Text>
              <PiExtensionsSettings />
            </section>
            <section className="work-section" id="settings-permissions" aria-label="Tool permissions">
              <Heading level={3}>Tool permissions</Heading>
              <Text type="supporting">For each tool of the agent: Allow, Ask (the agent waits for your approval in the chat), or Refuse. Pi's built-in file and shell tools, and any call that names a credential file, are always refused. A change applies to the next tool call.</Text>
              <ToolPermissionsSettings />
            </section>
            <section className="work-section" id="settings-plan" aria-label="Plan">
              <Heading level={3}>Plan</Heading>
              <Text type="supporting">How strongly the agent is asked to keep a plan. A plan is the checklist above the chat; the advocate can add an item by typing "add to the plan: …".</Text>
              <PlanStrengthSettings />
            </section>
            <section className="work-section" id="settings-mailbox" aria-label="Mailbox">
              <Heading level={3}>Authorised mailbox</Heading>
              {props.mailbox}
            </section>
            <section className="work-section" id="settings-research" aria-label="Research sources">
              <Heading level={3}>Research sources</Heading>
              <Text type="supporting">Queries to these sources leave this computer and are recorded in the matter's research log. Turn off a source you do not want used.</Text>
              {props.research}
            </section>
            <section className="work-section" id="settings-contacts" aria-label="Contacts">
              <Heading level={3}>Contacts</Heading>
              <Text type="supporting">The firm's clients, opposing parties and advocates. A matter's parties link to them.</Text>
              {props.contacts}
            </section>
            <section className="work-section" id="settings-storage" aria-label="Storage">
              <Heading level={3}>Storage</Heading>
              <Text type="supporting">Local folders come first. OneDrive and Google Drive are read through the folders their desktop applications keep in sync. Open Advocate holds no cloud credential and uses no sign-in.</Text>
              {storage.length === 0 ? <Text type="supporting">No OneDrive or Google Drive folder is detected on this computer.</Text> : (
                <List density="compact" data-testid="storage-folders">
                  {storage.map((s) => (
                    <ListItem
                      key={`${s.provider}:${s.root}`}
                      label={`${s.provider === "onedrive" ? "OneDrive" : "Google Drive"}: ${s.exists ? "found" : "not found"}`}
                      description={`${s.root} (${s.how})`}
                    />
                  ))}
                </List>
              )}
            </section>
            <section className="work-section" id="settings-integrations" aria-label="Integrations">
              <Heading level={3}>Integrations</Heading>
              <Text type="supporting">An integration declares what it does, what it may reach, its events, its lifecycle, its audit and what happens when it fails or is disabled. No integration is installed with the application.</Text>
              <div className="row-actions">
                <Button label="Add a manifest" size="sm" variant="ghost" clickAction={addIntegration} data-testid="integration-add" />
              </div>
              {integrationError ? <div className="notice" role="alert">{integrationError}</div> : null}
              {integrations.length === 0 ? <Text type="supporting">No integration manifest is installed.</Text> : (
                <List density="compact" data-testid="integrations-list">
                  {integrations.map((i) => (
                    <ListItem
                      key={i.id}
                      data-testid={`integration-${i.id}`}
                      startContent={<Badge variant={i.error ? "error" : i.enabled ? "success" : "neutral"} label={i.error ? "Refused" : i.enabled ? "Enabled" : "Disabled"} />}
                      label={`${i.title} v${i.version}`}
                      description={i.error ?? `${i.manifest?.capabilities.join(", ")}; may reach ${i.manifest?.permissions.join(", ")}. Failure: ${i.manifest?.failure.mode}; disabled: ${i.manifest?.disable.state.replace(/_/g, " ")}.`}
                      endContent={!i.error ? <Button label={i.enabled ? "Disable" : "Enable"} size="sm" variant="ghost" clickAction={() => toggleIntegration(i.id, !i.enabled)} /> : undefined}
                    />
                  ))}
                </List>
              )}
            </section>
            <section className="work-section" id="settings-triggers" aria-label="Triggers">
              <Heading level={3}>Triggers</Heading>
              <TriggersPanel />
            </section>
            <section className="work-section" id="settings-diagnostics" aria-label="Diagnostics">
              <Heading level={3}>Diagnostics</Heading>
              {props.diagnostics}
            </section>
            <section className="work-section" id="settings-filing-key" aria-label="Filing manifest key">
              <Heading level={3}>Filing manifest key</Heading>
              <Text type="supporting">Every filing manifest is signed with this application's Ed25519 key. The private key is kept encrypted by the operating system and never leaves this computer.</Text>
              <Text>Fingerprint: <span className="mono" data-testid="signing-fingerprint">{info?.signingKey ?? "not available: the operating system's secret store is not available, so manifests are not signed"}</span></Text>
            </section>
            <section className="work-section" id="settings-folders" aria-label="Folders">
              <Heading level={3}>Folders</Heading>
              <dl className="facts">
                <dt>Matters</dt><dd className="mono">{info?.folders.matters}</dd>
                <dt>Settings and keys</dt><dd className="mono">{info?.folders.userData}</dd>
              </dl>
            </section>
            <section className="work-section" id="settings-versions" aria-label="Versions">
              <Heading level={3}>Versions</Heading>
              <dl className="facts" data-testid="versions">
                <dt>Open Advocate</dt><dd>{info?.app}</dd>
                <dt>Electron</dt><dd>{info?.electron} (Chromium {info?.chrome}, Node {info?.node})</dd>
                <dt>Euro-Office</dt><dd>{info?.euroOffice}</dd>
                <dt>Citation validator</dt><dd>{info?.validator}</dd>
              </dl>
            </section>
            <section className="work-section" id="settings-shortcuts" aria-label="Keyboard shortcuts">
              <Heading level={3}>Keyboard shortcuts</Heading>
              <dl className="facts">
                <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Command bar: matters, tabs, actions and source lines</dd>
                <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>Review tab: next and previous item</dd>
                <dt><kbd>Enter</kbd></dt><dd>Review tab: open the item</dd>
                <dt><kbd>Escape</kbd></dt><dd>Close the command bar, the Inspector or a dialog</dd>
              </dl>
            </section>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <Text type="supporting">Changes are saved as you make them.</Text>
        </LayoutFooter>
      }
    />
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

// ---- Decision 21: Pi extensions ----

/** Settings → Tool permissions (native-harness-parts section 2). */
export function ToolPermissionsSettings() {
  const [data, setData] = useState<ToolPolicyView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void api.getToolPolicy().then(setData, (e: Error) => setMessage(e.message));
  }, []);
  if (!data) return message ? <Text>{message}</Text> : null;
  const save = async (policy: ToolPolicyView["policy"], partyRule = data.partyRule) => {
    try {
      setData(await api.setToolPolicy(policy, partyRule));
      setMessage("Saved.");
    } catch (e) {
      setMessage(`Not saved: ${(e as Error).message}`);
    }
  };
  const RULES = [["allow", "Allow"], ["ask", "Ask"], ["deny", "Refuse"]] as const;
  return (
    <div data-testid="tool-permissions">
      <label className="row-actions">
        <Text weight="semibold">Every other tool</Text>
        <select aria-label="Rule for every other tool" value={data.policy.default} onChange={(e) => void save({ ...data.policy, default: e.target.value as "allow" })}>
          {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="row-actions">
        <input
          type="checkbox"
          aria-label="Ask when a web search or a web page names a party"
          checked={data.partyRule}
          onChange={(e) => void save(data.policy, e.target.checked)}
        />
        <Text>Ask when a web search or a web page names a party of this matter</Text>
      </label>
      <ul className="plain-list">
        {data.tools.map((t) => (
          <li key={t.name} className="row-actions" data-testid={`tool-rule-${t.name}`}>
            <Text>{t.label}</Text> <span className="mono">{t.name}</span>
            <select
              aria-label={`Rule for ${t.label}`}
              value={data.policy.tools[t.name] ?? ""}
              onChange={(e) => {
                const tools = { ...data.policy.tools };
                if (e.target.value) tools[t.name] = e.target.value as "allow";
                else delete tools[t.name];
                void save({ ...data.policy, tools });
              }}
            >
              <option value="">As every other tool</option>
              {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {message ? <Text>{message}</Text> : null}
    </div>
  );
}

/** Phase 7 (O5): Settings → Role models. Each role picks one model of the signed-in list. */
function RoleModelSettings() {
  const [models, setModels] = useState<Array<{ key: string; name: string; provider: string; id: string }>>([]);
  const [roles, setRoles] = useState<{ drafting: string | null; extraction: string | null; critic: string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void api.listModels().then(setModels, (e: Error) => setMessage(e.message));
    void api.getRoleModels().then(setRoles);
  }, []);
  const set = async (role: "drafting" | "extraction" | "critic", key: string) => {
    try {
      setMessage(null);
      setRoles(await api.setRoleModel(role, key === "" ? null : key));
    } catch (e) {
      setMessage(`Not saved: ${(e as Error).message}`);
    }
  };
  if (!roles) return null;
  const rows: Array<{ role: "drafting" | "extraction" | "critic"; title: string; applies: string }> = [
    { role: "drafting", title: "Drafting", applies: "The argument loop's proposing passes; the rehearsal's bench questions; the skill runs of the drafting role." },
    { role: "extraction", title: "Extraction", applies: "The skill runs of the intake and evidence roles. The fact extraction itself is rule-based today; this choice is kept for the extraction model calls when they exist." },
    { role: "critic", title: "Critic", applies: "The loop's critic and opposing-counsel passes; the rehearsal's objections; the skill runs of the review and strategy roles. A second model family here attacks the arguments with a different mind." },
  ];
  return (
    <div data-testid="role-models">
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={r.role} data-testid="role-model-row" data-role={r.role}>
            <div className="phase4-main">
              <div className="phase4-head">
                <Text weight="semibold">{r.title}</Text>
              </div>
              <Text type="supporting">{r.applies}</Text>
            </div>
            <div className="row-actions">
              <select aria-label={`${r.title} model`} value={roles[r.role] ?? ""} onChange={(e) => void set(r.role, e.target.value)}>
                <option value="">The chat's model</option>
                {models.map((m) => (
                  <option key={m.key} value={m.key}>{m.name || m.id} ({m.key})</option>
                ))}
              </select>
              {roles[r.role] && !models.some((m) => m.key === roles[r.role]) ? (
                <Text type="supporting">The saved model is no longer signed in. The chat's model runs this role until you choose another.</Text>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {message ? <div className="notice" role="alert">{message}</div> : null}
      {models.length === 0 ? <Text type="supporting">No model is signed in. Sign in with Pi first, then pick a role's model.</Text> : null}
    </div>
  );
}

/** Settings: how strongly the agent is asked to keep a plan (native-harness-parts section 4). */
export function PlanStrengthSettings() {  const [value, setValue] = useState<"long" | "most" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void api.getPlanStrength().then(setValue, (e: Error) => setMessage(e.message));
  }, []);
  const choose = async (v: "long" | "most") => {
    setValue(v);
    try {
      setValue(await api.setPlanStrength(v));
      setMessage("Saved. It applies when a conversation next opens.");
    } catch (e) {
      setMessage(`Not saved: ${(e as Error).message}`);
    }
  };
  if (!value) return message ? <Text>{message}</Text> : null;
  return (
    <div className="row-actions" role="radiogroup" aria-label="Plan strength" data-testid="plan-strength">
      {(
        [
          ["long", "Only for long work: three or more steps"],
          ["most", "For most work: almost every task"],
        ] as const
      ).map(([v, label]) => (
        <label key={v} className="radio">
          <input type="radio" name="plan-strength" checked={value === v} onChange={() => void choose(v)} /> {label}
        </label>
      ))}
      {message ? <Text type="supporting">{message}</Text> : null}
    </div>
  );
}

export function PiExtensionsSettings() {
  const [list, setList] = useState<PiExtensionInfo[] | null>(null);
  const [source, setSource] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void api.listExtensions().then(setList, (e: Error) => setMessage(e.message));
  }, []);
  const run = async (what: string, fn: () => Promise<PiExtensionInfo[]>) => {
    setWorking(true);
    setMessage(`${what}…`);
    try {
      setList(await fn());
      setMessage(null);
    } catch (e) {
      setMessage(`${what} failed: ${(e as Error).message}`);
    } finally {
      setWorking(false);
    }
  };
  if (!list) return message ? <Text>{message}</Text> : null;
  return (
    <div data-testid="pi-extensions">
      {list.length === 0 ? <Text>No extension is installed.</Text> : null}
      <ul className="plain-list">
        {list.map((x) => (
          <li key={x.id} data-testid={`pi-extension-${x.id}`}>
            <Text weight="semibold">{x.id}</Text> {x.version ? <span className="mono">{x.version}</span> : null} <Badge label={x.kind === "bundled" ? "bundled" : "added"} />{" "}
            {x.error ? <Badge label="failed to load" variant="error" /> : null}
            <div>
              <Text type="supporting">
                {x.tools.length ? `Tools: ${x.tools.join(", ")}. ` : ""}
                {x.commands.length ? `Commands: ${x.commands.map((c) => "/" + c).join(", ")}. ` : ""}
                {!x.tools.length && !x.commands.length && !x.error ? "Tools and commands show after a conversation opens. " : ""}
                {x.error ? `Error: ${x.error}` : ""}
              </Text>
            </div>
            <div className="row-actions">
              {x.kind === "bundled" ? (
                <label className="radio">
                  <input type="checkbox" checked={x.enabled} disabled={working} onChange={() => void run(x.enabled ? "Turning off" : "Turning on", () => api.setExtensionEnabled(x.id, !x.enabled))} /> On
                </label>
              ) : (
                <Button label="Remove" size="sm" variant="ghost" isDisabled={working} clickAction={() => void run("Removing", () => api.removeExtension(x.source))} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <input
          className="text-input"
          aria-label="Extension source"
          placeholder="npm:name@1.2.3, git:github.com/owner/repo@v1, or a folder"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={working}
        />
        <Button label="Add extension" size="sm" isDisabled={working || !source.trim()} clickAction={() => void run("Installing", async () => {
          const r = await api.addExtension(source);
          setSource("");
          return r;
        })} />
      </div>
      <Text type="supporting">npm and git sources need npm or git on this computer. A folder always works.</Text>
      {message ? <Text>{message}</Text> : null}
    </div>
  );
}
