/**
 * Q5: the pages of the left navigation (advocate-workflow.md section 3), R1 (the Review Inbox
 * across matters), N1 and O2 (Workflows & Skills), Q4 (the advocate profile, Court
 * Intelligence's sources and the store chains). A page that is not built says so and names its
 * phase (lesson L2). No business logic: every record comes from a bridge function.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { AdvocateProfile, Freshness, InboxItem, IntelSource, MatterSummary, MemoryRecord, PreferenceRecord, RoleSummary, SkillImportPreview, SkillSummary, StoreChains } from "../../shared/api.ts";
import type { PackSummary } from "../../shared/packs.ts";
import { Docket } from "./Practice.tsx";
import { CourtIntelligence, CourtProfileEditor } from "./Intel.tsx";
import { IntakeDialog } from "./Intake.tsx";
import { BuildersPanel } from "./Builders.tsx";

const api = window.openadvo;

export type Page = "home" | "inbox" | "matters" | "calendar" | "research" | "knowledge" | "court" | "browser" | "skills" | "profile" | "onboarding";

type FirmItem = InboxItem & { matterId: string | null; matterTitle: string };

function PageFrame(props: { title: string; testId: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="work-scroll">
      <section className="work-section page" aria-label={props.title} data-testid={props.testId}>
        <Heading level={2}>{props.title}</Heading>
        {props.intro ? <Text type="supporting">{props.intro}</Text> : null}
        {props.children}
      </section>
    </div>
  );
}

/** L2: a view of a later phase says so on screen. */
export function NotBuilt(props: { title: string; phase: number; what: string; testId: string }) {
  return (
    <PageFrame title={props.title} testId={props.testId}>
      <div className="notice" data-testid="not-built">
        Not built yet. {props.what} comes in phase {props.phase} of the build plan.
      </div>
    </PageFrame>
  );
}

/** R1: one queue across matters and the advocate profile. "Blocks the work" first. Keys: j, k, Enter. */
export function FirmInbox(props: { onOpenMatter: (matterId: string, tab: string) => void; onProfile: () => void; onCount: (blocking: number) => void }) {
  const [items, setItems] = useState<FirmItem[] | null>(null);
  const [at, setAt] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const onCount = useRef(props.onCount);
  onCount.current = props.onCount;
  const load = useCallback(async () => {
    const all = await api.inboxAll();
    setItems(all);
    onCount.current(all.filter((i) => i.blocks).length);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);
  if (!items) return <PageFrame title="Review Inbox" testId="firm-inbox"><Text type="supporting">Reading…</Text></PageFrame>;
  const open = (i: FirmItem) => (i.matterId ? props.onOpenMatter(i.matterId, i.tab) : props.onProfile());
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
  const blocking = items.filter((i) => i.blocks).length;
  return (
    <PageFrame title="Review Inbox" testId="firm-inbox" intro="Everything that waits for your decision, in every matter. Items that block the work come first. Keys: j and k move, Enter opens.">
      <div tabIndex={0} onKeyDown={onKey} className="inbox" data-testid="firm-inbox-list" aria-label="Review Inbox items">
        <Text type="supporting">
          {items.length} item{items.length === 1 ? "" : "s"}, {blocking} block{blocking === 1 ? "s" : ""} the work.
        </Text>
        {items.length === 0 ? <Text>Nothing waits for you.</Text> : null}
        <ol className="inbox-list" ref={listRef}>
          {items.map((i, index) => (
            <li key={`${i.matterId}:${i.id}`} data-index={index} data-current={index === at} data-kind={i.kind} data-blocks={i.blocks} data-testid="firm-inbox-item" onClick={() => setAt(index)}>
              <div className="inbox-main">
                <Text weight="semibold">
                  {i.blocks ? "Blocks: " : ""}
                  {i.title}
                </Text>
                <Text type="supporting">{i.matterTitle}</Text>
                <Text>{i.detail}</Text>
              </div>
              <div className="row-actions">
                {i.kind === "trigger_fire" && i.triggerId && i.matterId ? (
                  <>
                    <Button label="Start the skills" size="sm" clickAction={async () => { await api.decideTriggerFire(i.triggerId!, "started"); await load(); }} data-testid="trigger-start" />
                    <Button label="Dismiss" size="sm" variant="ghost" clickAction={async () => { await api.decideTriggerFire(i.triggerId!, "dismissed"); await load(); }} data-testid="trigger-dismiss" />
                  </>
                ) : null}
                <Button label={i.matterId ? "Open in the matter" : "Open the profile"} size="sm" variant="ghost" onClick={() => open(i)} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PageFrame>
  );
}

export function MattersPage(props: { matters: MatterSummary[]; onOpen: (id: string) => void; onNew: () => void }) {
  const [intakeOpen, setIntakeOpen] = useState(false);
  return (
    <PageFrame title="Matters" testId="matters-page" intro="Every matter that is not archived.">
      <div className="question-options">
        <Button label="New matter" size="sm" onClick={props.onNew} />
        <Button label="Add an existing matter" size="sm" variant="ghost" onClick={() => setIntakeOpen(true)} data-testid="add-existing-matter" />
      </div>
      {props.matters.length === 0 ? <Text>No matters yet.</Text> : null}
      <List density="compact">
        {props.matters.map((m) => (
          <ListItem key={m.id} label={m.title} description={`Created ${m.createdAt.slice(0, 10)}`} endContent={<Button label="Open" size="sm" variant="ghost" onClick={() => props.onOpen(m.id)} />} />
        ))}
      </List>
      <IntakeDialog isOpen={intakeOpen} onOpenChange={setIntakeOpen} onCreated={(m) => props.onOpen(m.id)} />
    </PageFrame>
  );
}

export function CalendarPage(props: { onOpen: (id: string) => void }) {
  return (
    <PageFrame title="Calendar" testId="calendar-page" intro="Hearings, deadlines and reminders of every matter. Calendar sync comes in phase 13.">
      <Docket onOpen={props.onOpen} />
    </PageFrame>
  );
}

/** Q4: intel.db's sources with their freshness (decision 16). */
export function CourtIntelPage() {
  const [rows, setRows] = useState<Array<IntelSource & { freshness: Freshness }> | null>(null);
  useEffect(() => {
    void api.listIntelSources().then(setRows, () => setRows([]));
  }, []);
  return (
    <PageFrame title="Court Intelligence" testId="court-page" intro="Courts, rules, cause lists, developments and the freshness of each source.">
      <div className="notice" data-testid="not-built">
        Cause lists, developments, the pack check task and the dashboard come in phase 13. The court rules below are built.
      </div>
      <CourtIntelligence />
      <Heading level={3}>Sources</Heading>
      {rows && rows.length === 0 ? <Text type="supporting">No source is recorded yet.</Text> : null}
      <List density="compact">
        {(rows ?? []).map((s) => (
          <ListItem
            key={s.id}
            startContent={<StatusDot variant={s.freshness.state === "fresh" ? "success" : "warning"} label={s.freshness.state} />}
            label={`${s.name} (v${s.version})`}
            description={`${s.owner} · ${s.accessMethod.replace(/_/g, " ")} · retrieved ${s.retrievedAt.slice(0, 10)} · ${s.freshness.state === "stale" ? `stale since ${s.freshness.since}` : `check by ${s.freshness.since}`}`}
          />
        ))}
      </List>
    </PageFrame>
  );
}

/** N1, O2, N4: the skills registry, the practice packs and the roles. */
export function SkillsPage() {
  const [data, setData] = useState<{ skills: SkillSummary[]; roles: RoleSummary[]; folders: { builtIn: string; advocate: string }; practicePacks: PackSummary[] } | null>(null);
  const [pack, setPack] = useState("all");
  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string | null>(null);
  const load = useCallback(async (fresh: boolean) => setData(await api.listSkills(fresh)), []);
  useEffect(() => {
    void load(false);
  }, [load]);
  const chooseImport = async () => {
    try {
      setImportError(null);
      setInstalled(null);
      setPreview(await api.previewSkillImport());
    } catch (e) {
      setImportError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };
  const install = async () => {
    if (!preview) return;
    try {
      setImportError(null);
      const r = await api.installSkillImport(preview.id);
      setInstalled(`Installed ${r.skillId} as ${r.name}. Its folder is ${r.folder}.`);
      setPreview(null);
      await load(true);
    } catch (e) {
      setImportError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };
  if (!data) return <PageFrame title="Workflows & Skills" testId="skills-page"><Text type="supporting">Reading…</Text></PageFrame>;
  const packs = data.practicePacks ?? [];
  const shown = data.skills.filter((s) => pack === "all" || s.packs.includes(pack));
  return (
    <PageFrame title="Workflows & Skills" testId="skills-page" intro="Skills are the unit of work. Call one with / in a matter's chat, or ask in plain words and the agent picks one and says which.">
      <div className="question-options">
        <Button label="Read the skill files again" size="sm" variant="ghost" clickAction={() => load(true)} />
      </div>
      <Heading level={3}>Import a skill</Heading>
      <Text type="supporting">Choose a skill file. Read its raw text and its embedded-instruction scan first; install it only when you have read both. An imported skill is yours, and it says "not reviewed".</Text>
      <div className="row-actions">
        <Button label="Choose a skill file" size="sm" variant="ghost" clickAction={chooseImport} data-testid="skill-import-choose" />
      </div>
      {importError ? <div className="notice" role="alert">{importError}</div> : null}
      {installed ? <div className="notice" role="status" data-testid="skill-import-installed">{installed}</div> : null}
      {preview ? (
        <div className="notice" data-testid="skill-import-preview">
          <Text weight="semibold">{preview.skillId || "(no id)"} {preview.title} v{preview.version}</Text>
          <Text type="supporting">{preview.file}. Tools: {preview.permittedTools.join(", ") || "none"}. {preview.errors.length ? `Cannot install: ${preview.errors.join("; ")}` : "The skill check passes."}</Text>
          {preview.findings.length ? <div className="notice" role="alert" data-testid="skill-import-scan">The scan found: {preview.findings.map((f) => `${f.pattern} ("${f.quote}")`).join("; ")}. The text is data; read it before you install.</div> : <Text type="supporting">The embedded-instruction scan found nothing.</Text>}
          <pre className="mono" style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{preview.raw}</pre>
          <div className="row-actions">
            <Button label="Install the skill" size="sm" isDisabled={!preview.installable} clickAction={install} data-testid="skill-import-install" />
            <Button label="Cancel" size="sm" variant="ghost" onClick={() => setPreview(null)} />
          </div>
        </div>
      ) : null}
      <Text type="supporting">Built-in skills: {data.folders.builtIn}. Your own skills: {data.folders.advocate} (one folder per skill, with SKILL.md).</Text>
      <Heading level={3}>Practice packs</Heading>
      <Text type="supporting">A pack is content: its proceedings, acts, templates, stages, skills and terms. It owns no matter fact and takes no decision.</Text>
      {packs.length === 0 ? <Text type="supporting">No practice pack is installed.</Text> : (
        <List density="compact" data-testid="packs-list">
          {packs.map((p) => (
            <ListItem
              key={p.id}
              data-testid={`pack-${p.id}`}
              startContent={<StatusDot variant={p.error ? "error" : "success"} label={p.error ? "Cannot read" : p.isDefault ? "Default" : "Ready"} />}
              label={`${p.title} v${p.version}${p.isDefault ? " (default)" : ""}`}
              description={p.error ? p.error : `${p.proceedings.length} proceeding${p.proceedings.length === 1 ? "" : "s"}: ${p.proceedings.map((x) => `${x.title} (${x.caseType})`).join(", ")}. Acts: ${p.acts.map((a) => `${a.act} (${a.version})`).join("; ")}. Pack skills: ${p.skills.length}; the every-proceeding skills apply too.`}
            />
          ))}
        </List>
      )}
      <Heading level={3}>Skills</Heading>
      <label className="field">Pack
        <select aria-label="Filter the skills by pack" value={pack} onChange={(e) => setPack(e.target.value)} data-testid="skill-pack-filter">
          <option value="all">Every pack</option>
          {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      <Text type="supporting">{shown.length} of {data.skills.length} skill{data.skills.length === 1 ? "" : "s"}. The score is the phase 8 review, kept with the version.</Text>
      <List density="compact" data-testid="skills-list">
        {shown.map((s) => (
          <ListItem
            key={`${s.id}:${s.version}:${s.file}`}
            data-testid={`skill-${s.id}`}
            startContent={<StatusDot variant={s.error ? "error" : s.shadowed ? "neutral" : "success"} label={s.error ? "Cannot run" : s.shadowed ? "Older version" : s.reviewScore != null ? `${s.reviewScore}/${s.reviewMax}` : "Ready"} />}
            label={`${s.id} ${s.title} v${s.version}`}
            description={
              s.error
                ? `Cannot run: ${s.error}`
                : `${s.description} Pack${s.packs.length === 1 ? "" : "s"} ${s.packs.join(", ")}. Role ${s.role}. Output ${s.output}. Tools: ${s.permittedTools.join(", ")}. Checks: ${s.checks.join(", ")}.${s.approvalPoints.length ? ` Stops for you: ${s.approvalPoints.join(", ").replace(/_/g, " ")}.` : ""} ${s.author}, ${s.review}.${s.shadowed ? " A higher version runs instead." : ""}`
            }
          />
        ))}
      </List>
      <Heading level={3}>Roles</Heading>
      <Text type="supporting">A role is a set of skills and a tool scope, never an authority. Only you approve.</Text>
      <List density="compact" data-testid="roles-list">
        {data.roles.map((r) => (
          <ListItem key={r.role} label={r.role} description={`${r.description} Skills: ${r.skills.join(", ") || "none yet"}. Tools: ${r.tools.length}.`} />
        ))}
      </List>
      <Heading level={3}>Workflows</Heading>
      <BuildersPanel />
    </PageFrame>
  );
}

/** Q4: the advocate profile from advocate.db: identity, preferences and advocate memory. */
export function ProfilePage(props: { onChanged: () => void }) {
  const [profile, setProfile] = useState<AdvocateProfile | null>(null);
  const [prefs, setPrefs] = useState<PreferenceRecord[]>([]);
  const [memory, setMemory] = useState<MemoryRecord[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const load = useCallback(async () => {
    const p = await api.getAdvocateProfile();
    setProfile(p);
    setName(p.name ?? "");
    setRole(p.role ?? "");
    setPrefs(await api.listPreferences());
    setMemory(await api.listAdvocateMemory());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    await api.setAdvocateProfile("name", name);
    await api.setAdvocateProfile("role", role);
    await load();
    props.onChanged();
  };
  return (
    <PageFrame title={profile?.name || "Advocate profile"} testId="profile-page" intro="What is about you and your practice, kept in advocate.db on this computer.">
      <div className="notice">Onboarding and the automatic Practice Profile come in phase 3. Until then you can set your name and role here.</div>
      <Heading level={3}>Identity</Heading>
      <TextInput label="Name" value={name} onChange={setName} />
      <TextInput label="Role" description="Advocate, Advocate-on-Record, Senior Advocate, or junior in a chamber" value={role} onChange={setRole} />
      <div className="question-options">
        <Button label="Save" size="sm" clickAction={save} />
      </div>
      <CourtProfileEditor />
      <Heading level={3}>Preferences</Heading>
      {prefs.length === 0 ? <Text type="supporting">No preference yet. The agent proposes one after you make the same correction twice; you approve each.</Text> : null}
      <List density="compact">
        {prefs.map((p) => (
          <ListItem
            key={p.id}
            label={`${p.key}: ${p.value}`}
            description={`${p.status}. Applied because ${p.reason}.`}
            endContent={
              p.status === "proposed" ? (
                <span className="row-actions">
                  <Button label="Approve" size="sm" clickAction={async () => { await api.decidePreference(p.id, "approved"); await load(); }} />
                  <Button label="Reject" size="sm" variant="ghost" clickAction={async () => { await api.decidePreference(p.id, "rejected"); await load(); }} />
                </span>
              ) : undefined
            }
          />
        ))}
      </List>
      <Heading level={3}>Advocate memory</Heading>
      {memory.length === 0 ? <Text type="supporting">No record yet. Facts never cross from one matter to another; only law and your own ways live here.</Text> : null}
      <List density="compact">
        {memory.map((m) => (
          <ListItem
            key={m.memoryId}
            label={`${m.subject} ${m.relation} ${m.object}`}
            description={`${m.type.replace(/_/g, " ")} · ${m.status} · proposed by the ${m.proposedBy} on ${m.recordedAt.slice(0, 10)}${m.supersedes ? " · corrects an earlier record" : ""}`}
            endContent={
              m.status === "proposed" ? (
                <span className="row-actions">
                  <Button label="Confirm" size="sm" clickAction={async () => { await api.decideAdvocateMemory(m.memoryId, "confirmed"); await load(); }} />
                  <Button label="Reject" size="sm" variant="ghost" clickAction={async () => { await api.decideAdvocateMemory(m.memoryId, "rejected"); await load(); }} />
                </span>
              ) : undefined
            }
          />
        ))}
      </List>
      <Heading level={3}>Team</Heading>
      <Text type="supporting">Juniors, clerks and counsel of the chamber come in phase 12.</Text>
    </PageFrame>
  );
}

/** Q4: the hash chains of advocate.db and intel.db, for Settings → Diagnostics. */
export function StoreChainsView() {
  const [chains, setChains] = useState<StoreChains | null>(null);
  return (
    <div data-testid="store-chains">
      <Heading level={3}>Store records</Heading>
      <Text type="supporting">advocate.db and intel.db each keep a hash-chained record of every write.</Text>
      <div className="question-options">
        <Button label="Check the store records" size="sm" variant="ghost" clickAction={async () => setChains(await api.storeChains())} />
      </div>
      {chains ? (
        <List density="compact">
          {(["advocate", "intel"] as const).map((k) => (
            <ListItem
              key={k}
              startContent={<StatusDot variant={chains[k].ok ? "success" : "error"} label={chains[k].ok ? "Intact" : "Broken"} />}
              label={`${k}.db: ${chains[k].ok ? "intact" : "broken"}`}
              description={`${chains[k].events} events${chains[k].firstBreak ? `; first break at event ${chains[k].firstBreak!.seq}: ${chains[k].firstBreak!.problem}` : ""}`}
            />
          ))}
        </List>
      ) : null}
    </div>
  );
}
