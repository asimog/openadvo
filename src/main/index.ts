/**
 * Electron main process: the window, the bridge handlers, the matter store and the agent.
 */
import { Menu, Notification, app, BrowserWindow, crashReporter, dialog, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { existsSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Matters } from "./matters.ts";
import { AGENT_TOOLS, Agent, findSource } from "./agent.ts";
import { FIRM_TOOLS } from "./firm-agent.ts";
import { PLAN_TOOLS } from "./plan.ts";
import { PolicyStore, cleanPolicy } from "./tool-policy.ts";
import { PiExtensions } from "./pi-extensions.ts";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { RecordTables } from "./record-table.ts";
import { allWorkflows, parseCustom, remove as removeWorkflow, upsert as upsertWorkflow } from "../lib/workflows/index.ts";
import { Ingest } from "./ingest.ts";
import { Drafts, catalogue as draftsCatalogue } from "./drafts.ts";
import { EditorHost, registerEditorScheme, EO_ORIGIN } from "./editor-host.ts";
import { euroOfficePaths, platformKey } from "../lib/euro-office/platform.ts";
import { Research } from "./research.ts";
import { Filing } from "./filing.ts";
import { KeyFileSigner } from "./signing.ts";
import { Progress } from "./progress.ts";
import { ArgumentStudio, ResearchHub, type SourceName } from "./studio.ts";
import type { RetrieveOptions } from "../lib/knowledge/index.ts";
import { researchLog, studioTools } from "./studio-tools.ts";
import { ensureFindIndex, listMatterFiles } from "./audit.ts";
import { applyDateAnchor, eventsFromDecidedLine } from "./notebook.ts";
import { caseNumberConflicts, extractEntities } from "../lib/notebook/entities.ts";
import { ppocrDir, setPpocrDir } from "../lib/document-intelligence/ppocr.ts";
import { diffParagraphs } from "../lib/filing/v5.ts";
import { Contacts } from "../lib/contacts/index.ts";
import { captureLogs, diagnosticsEntries, diagnosticsZip, docket, dueReminders, questionsDocument } from "./practice.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { detectMediaType } from "../lib/document-intelligence/formats.ts";
import { setFetcher } from "../lib/research-sources/http.ts";
import type { ResearchSettings } from "../shared/studio.ts";
import { Portal, portalOptionsFromEnv } from "./portal.ts";
import { Mail, type MailAccount } from "./mail.ts";
import { agentWorkHost } from "./agent-work.ts";
import { SkillRegistry } from "./skills.ts";
import { registerHarnessBridge } from "./harness-bridge.ts";
import { registerIntelBridge } from "./intel-bridge.ts";
import { CourtIntel } from "./court-intel.ts";
import { PracticePacks } from "./packs.ts";
import { filingPlan, skillPackRefusal } from "../lib/packs/index.ts";
import type { FilingPack } from "./filing.ts";
import { listsForCaseType } from "../lib/court-adapters/index.ts";
import { AdvocateStore } from "../lib/advocate-store/index.ts";
import { IntelStore } from "../lib/intel-store/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import { searchCitationIndex, ulosPaths, type UlosPaths } from "../lib/ulos/index.ts";
import { transcribe, voiceAvailable } from "../lib/voice/index.ts";
import { randomUUID } from "node:crypto";
import type { AgentWorkHost } from "./agent.ts";
import { FIRM_AGENT_ID, type ChatEvent } from "../shared/api.ts";
import { appendFile, mkdir } from "node:fs/promises";
import { DRAFT_KINDS, type DraftKind } from "../shared/records.ts";
import { preferenceQuestions } from "../lib/preferences/index.ts";
import { Browser } from "./browser.ts";
import { BROWSER_STATE_EVENT, type BrowserBounds, type BrowserCapture, type CaseListProposal } from "../shared/browser.ts";
import { Library } from "./library.ts";
import { proposeClassification } from "../lib/classification/index.ts";
import { MatterProposals } from "./matter-proposals.ts";
import { analyzeMatter } from "./evidence.ts";
import { extractPages, markDocument, mergeDocuments, reorderDocument, splitDocument } from "./document-ops.ts";
import { buildTimeline, detectContradictions, detectRelatedMatters, templatesFor } from "../lib/evidence/index.ts";
import type { JurisdictionReport } from "../shared/evidence.ts";

// Tests and the proof run may point the application at separate folders.
if (process.env.OPENADVO_USER_DATA) app.setPath("userData", path.resolve(process.env.OPENADVO_USER_DATA));

const here = import.meta.dirname;
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const rendererFile = path.join(here, "../renderer/index.html");

registerEditorScheme();

let window: BrowserWindow | null = null;
let editorHost: EditorHost;
let matters: Matters;
let agent: Agent;
let ingest: Ingest;
let drafts: Drafts;
let research: Research;
let filing: Filing;
let portal: Portal;
let mail: Mail;
let ulos: UlosPaths;
let workHost: AgentWorkHost;
let recordTables: RecordTables;
let signer: KeyFileSigner | null = null;
let progress: Progress;
let hub: ResearchHub;
let contacts: Contacts;
let studio: ArgumentStudio;
/** Phase 1 (Q4, N1): the advocate store, the local intelligence store and the skill registry. */
let advocateStore: AdvocateStore;
let intelStore: IntelStore;
let skillRegistry: SkillRegistry;
let practicePacks: PracticePacks;
/** Phase 2: the court adapter framework. */
let courtIntel: CourtIntel;
/** Phase 3: the built-in browser (S10). */
let browser: Browser;
/** Phase 3: the Knowledge Library (M1). */
let library: Library;
/** C2: the matters the agent proposed in the chat. */
let proposals: MatterProposals;

/** Steps 6 to 10 notify the window that a matter changed (a capture, a proposal). */
function matterChanged(matterId: string): void {
  window?.webContents.send("ingest:update", matterId);
}

/** The IMAP account: host, port and user in settings; the password encrypted with safeStorage (decision 9). */
function mailSecretFile(): string {
  return path.join(app.getPath("userData"), "mail-secret.bin");
}

/** A2: the enrolment number, encrypted with the operating system's secret store. */
function enrolmentFile(): string {
  return path.join(app.getPath("userData"), "enrolment.bin");
}

function enrolmentState(): { stored: boolean; last4: string | null } {
  try {
    if (!existsSync(enrolmentFile()) || !safeStorage.isEncryptionAvailable()) return { stored: false, last4: null };
    const number = safeStorage.decryptString(readFileSync(enrolmentFile()));
    return { stored: true, last4: number.replace(/\s+/g, "").slice(-4) || null };
  } catch {
    return { stored: false, last4: null };
  }
}

/** C2 and A9: one matter from the fields the advocate confirmed, with its parties and next date. */
async function createMatterFromFields(input: { title: string; cnr?: string; court?: string; petitioner?: string; respondent?: string; stage?: string; nextDate?: string; sourceUrl?: string }): Promise<Awaited<ReturnType<Matters["create"]>>> {
  const title = String(input.title ?? "").trim().slice(0, 240);
  if (!title) throw new Error("TITLE_REQUIRED: a matter needs a title");
  const m = await matters.create(title);
  const petitioner = String(input.petitioner ?? "").trim();
  const respondent = String(input.respondent ?? "").trim();
  const court = String(input.court ?? "").trim();
  const cnr = String(input.cnr ?? "").trim();
  await filing.setDetails(m.id, { petitioner, respondent, cnr, court });
  const store = await matters.store(m.id);
  store.setProfile({ cnr, court, stage: String(input.stage ?? "").trim() }, { actor: "advocate" });
  if (petitioner) {
    const contact = contacts.add({ name: petitioner, kind: "client" });
    store.addParty(contact.id, "petitioner", petitioner, { actor: "advocate" });
  }
  if (respondent) {
    const contact = contacts.add({ name: respondent, kind: "opposing_party" });
    store.addParty(contact.id, "respondent", respondent, { actor: "advocate" });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.nextDate ?? ""))) {
    store.addHearing({ date: String(input.nextDate), bench: "", directions: `Next date read from ${String(input.sourceUrl || "the case list")}.`, nextDate: String(input.nextDate), nextDateStatus: "inferred", notes: String(input.stage ?? "") }, { actor: "advocate" });
  }
  return m;
}

function mattersRoot(): string {
  if (process.env.OPENADVO_HOME) return path.resolve(process.env.OPENADVO_HOME);
  return path.join(app.getPath("documents"), "Open Advocate", "Matters");
}

/** Only our own renderer page may call the bridge. */
function trusted(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (rendererDevUrl && url.startsWith(rendererDevUrl)) return true;
  return url === pathToFileURL(rendererFile).href;
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error(`refused: ${channel} from an untrusted page`);
    try {
      return await fn(...(args as A));
    } catch (e) {
      await recordRefusal(args[0], "advocate", channel, e);
      throw e;
    }
  });
}

/** V5-2: a refused request about a matter is kept in that matter's refusal table. */
async function recordRefusal(matterId: unknown, actor: string, action: string, e: unknown): Promise<void> {
  const code = (e as { code?: string }).code ?? /^([A-Z][A-Z_]{3,})\b/.exec((e as Error).message ?? "")?.[1];
  if (!code || typeof matterId !== "string" || !matters) return;
  try {
    if (!(await matters.list()).some((m) => m.id === matterId)) return;
    (await matters.store(matterId)).refuse(actor, action, code, String((e as Error).message ?? e));
  } catch {
    // The refusal record is best effort; the original error still reaches the caller.
  }
}

function emitChat(event: ChatEvent): void {
  window?.webContents.send("chat:event", event);
}

function workflowsFile(): string {
  return path.join(app.getPath("userData"), "workflows.json");
}

function customWorkflows() {
  try {
    return parseCustom(JSON.parse(readFileSync(workflowsFile(), "utf8")));
  } catch {
    return [];
  }
}

function saveWorkflows(list: ReturnType<typeof customWorkflows>) {
  mkdirSync(path.dirname(workflowsFile()), { recursive: true });
  writeFileSync(workflowsFile(), JSON.stringify(list, null, 2));
  return allWorkflows(list);
}

function registerBridge(): void {
  handle("matters:list", () => matters.list());
  // V1-10: rename and archive (human-only).
  handle("matters:rename", (matterId: string, title: string) => matters.rename(matterId, String(title ?? "")));
  handle("matters:archive", (matterId: string, archived: boolean) => matters.setArchived(matterId, archived === true));
  // V1-1: a new conversation.
  handle("chat:new", (matterId: string) => agent.newConversation(matterId));
  // V1-3: matter memory (human-only write).
  handle("memory:get", (matterId: string) => matters.memory(matterId));
  handle("memory:set", (matterId: string, text: string) => matters.setMemory(matterId, String(text ?? "")));
  // V1-4: workflows.
  handle("extensions:list", () => piExtensions().list());
  handle("extensions:add", async (source: string) => {
    const list = await piExtensions().add(String(source));
    await agent.reloadIdle();
    return list;
  });
  handle("extensions:remove", async (source: string) => {
    const list = await piExtensions().remove(String(source));
    await agent.reloadIdle();
    return list;
  });
  handle("extensions:setEnabled", async (input: { id: string; enabled: boolean }) => {
    const list = piExtensions().setEnabled(String(input.id), Boolean(input.enabled));
    await agent.reloadIdle();
    return list;
  });
  handle("workflows:list", () => allWorkflows(customWorkflows()));
  handle("workflows:save", (input: { id?: string; title: string; body: string }) => saveWorkflows(upsertWorkflow(customWorkflows(), input)));
  handle("workflows:delete", (id: string) => saveWorkflows(removeWorkflow(customWorkflows(), String(id))));
  // V1-5: the record table. Columns and decisions are human-only.
  handle("records:get", (matterId: string) => recordTables.table(matterId));
  handle("records:addColumn", (matterId: string, question: string) => recordTables.addColumn(matterId, String(question ?? "")));
  handle("records:decide", (matterId: string, sourceId: string, columnId: string, decision: string) => {
    if (decision !== "confirm" && decision !== "clear") throw new Error("BAD_DECISION: confirm or clear");
    return recordTables.decide(matterId, sourceId, columnId, decision);
  });
  // V2 (docs/archive/2026-11-15/specs/v2.md). Every write here is human-only.
  handle("sources:setType", (matterId: string, sourceId: string, type: string) => matters.setSourceType(matterId, sourceId, String(type)));
  handle("duplicates:list", (matterId: string) => matters.listDuplicates(matterId));
  handle("duplicates:decide", (matterId: string, reviewItemId: string, decision: string) => {
    if (decision !== "same" && decision !== "different") throw new Error("BAD_DECISION: same or different");
    return matters.decideDuplicate(matterId, reviewItemId, decision);
  });
  handle("lod:getRows", (matterId: string) => matters.lodRows(matterId));
  handle("lod:setRows", (matterId: string, ids: unknown) => matters.setLodRows(matterId, Array.isArray(ids) ? ids.map(String) : []));
  handle("memory:proposals", (matterId: string) => matters.listMemoryProposals(matterId));
  handle("memory:decideProposal", (matterId: string, id: string, accept: boolean) => matters.decideMemoryProposal(matterId, String(id), accept === true));
  handle("signing:fingerprint", () => (signer ? signer.fingerprint() : null));
  // V3-4: settings and facts about the application.
  handle("app:info", () => appInfo());
  handle("appearance:get", () => appearance());
  handle("appearance:set", (mode: string) => {
    if (!["system", "light", "dark"].includes(mode)) throw new Error("BAD_APPEARANCE: system, light or dark");
    writeSetting("appearance", mode);
    return mode;
  });
  // V3-5: the advocate chooses where the export goes.
  handle("matters:export", async (matterId: string) => {
    if (!window) throw new Error("NO_WINDOW");
    const title = (await matters.title(matterId)).replace(/[\\/:*?"<>|]+/g, " ").trim() || "matter";
    const r = await dialog.showSaveDialog(window, { title: "Export matter", defaultPath: `${title} ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
    if (r.canceled || !r.filePath) return null;
    return matters.exportMatter(matterId, r.filePath, (digest) => (signer ? { signature: signer.sign(digest), publicKey: signer.publicKey() } : null));
  });
  // V4: the Research and Argument Studio. Decisions are human-only.
  handle("studio:get", (matterId: string) => studio.state(matterId));
  handle("studio:log", (matterId: string) => researchLog(matters, matterId));
  handle("studio:search", (matterId: string, source: string, query: string, opts: Record<string, unknown>) =>
    hub.search(matterId, sourceName(source), String(query ?? ""), { from: Number(opts?.from) || undefined, to: Number(opts?.to) || undefined, limit: Number(opts?.limit) || 25 }),
  );
  handle("studio:read", (matterId: string, source: string, ref: string) => hub.read(matterId, sourceName(source), String(ref ?? "")));
  handle("studio:saveJudgment", (matterId: string, ref: string, input: Record<string, unknown>) =>
    hub.saveJudgment(matterId, String(ref), { paragraph: String(input?.paragraph ?? ""), proposition: String(input?.proposition ?? ""), role: String(input?.role ?? "other"), issueId: input?.issueId ? String(input.issueId) : null }, { actor: "advocate" }),
  );
  handle("studio:saveProvision", (matterId: string, ref: string) => hub.saveProvision(matterId, String(ref), { actor: "advocate" }));
  handle("studio:decideProvision", async (matterId: string, id: string, decision: string) => {
    if (decision !== "adopted" && decision !== "rejected") throw new Error("BAD_DECISION: adopted or rejected");
    return (await matters.store(matterId)).studio.decideProvision(String(id), decision, { actor: "advocate" });
  });
  handle("studio:start", (matterId: string, issueId: string, opts: Record<string, unknown>) => studio.start(matterId, String(issueId), { rounds: Number(opts?.rounds) || undefined, generators: Number(opts?.generators) || undefined }));
  handle("studio:decideArgument", async (matterId: string, id: string, decision: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    const out = (await matters.store(matterId)).studio.decideArgument(String(id), decision, { actor: "advocate" });
    // The write goes through the store, so the Studio views hear about it here.
    window?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:toGrounds", async (matterId: string, id: string) => {
    const a = (await matters.store(matterId)).studio.argument(String(id));
    if (!a) throw new Error("ARGUMENT_NOT_FOUND");
    if (a.status !== "accepted") throw new Error("ARGUMENT_NOT_ACCEPTED: accept the argument first");
    const r = await workHost.proposeParagraph(matterId, { kind: "grounds", after: null, text: `${a.claim} ${a.reasoning}`, reason: "Argument accepted in the Studio" }, "");
    return r.text;
  });
  handle("studio:weakPoints", (matterId: string) => studio.weakPoints(matterId));
  // Phase 7 (K4, K5): the case theories and the dissent panel. Decisions are the advocate's.
  handle("studio:addTheory", async (matterId: string, input: Record<string, unknown>) => {
    const out = await (await matters.store(matterId)).studio.addTheory(
      {
        title: String(input?.title ?? ""),
        statement: String(input?.statement ?? ""),
        issueIds: Array.isArray(input?.issueIds) ? (input.issueIds as unknown[]).map(String) : [],
        burden: String(input?.burden ?? ""),
        standard: String(input?.standard ?? ""),
      },
      { actor: "advocate" },
    );
    window?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:decideTheory", async (matterId: string, id: string, decision: string, reason: string) => {
    if (decision !== "primary" && decision !== "alternative" && decision !== "rejected") throw new Error("BAD_DECISION: primary, alternative or rejected");
    const out = await (await matters.store(matterId)).studio.decideTheory(String(id), decision, String(reason ?? ""), { actor: "advocate" });
    window?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:askDissent", (matterId: string, question: string) => studio.askDissent(matterId, String(question ?? "")));
  handle("knowledge:search", (matterId: string, query: string, opts: Record<string, unknown>) => hub.searchKnowledge(matterId || null, String(query ?? ""), (opts ?? {}) as RetrieveOptions));
  handle("knowledge:health", (matterId: string) => hub.knowledgeHealth(matterId || null));
  handle("knowledge:loadFirstWave", () => hub.loadLawFirstWave());
  handle("knowledge:indexJudgment", (_matterId: string, ref: string) => hub.indexJudgment(String(ref)));
  handle("knowledge:saveProvision", (matterId: string, provisionId: string) => hub.saveLawProvision(matterId, String(provisionId)));
  handle("knowledge:plans", async (matterId: string) => (await matters.store(matterId)).researchPlans.list());
  handle("knowledge:decidePlan", async (matterId: string, id: string, decision: string) => (await matters.store(matterId)).researchPlans.decide(String(id), decision === "stopped" ? "stopped" : "approved", { actor: "advocate" }));
  handle("corpus:parts", () => hub.parts());
  handle("corpus:indexSc", (years: unknown) => hub.indexSupremeCourt(Array.isArray(years) ? years.map(Number).filter(Number.isFinite) : []));
  handle("corpus:highCourts", (year: number) => hub.highCourts(Number(year)));
  handle("corpus:indexHc", (code: string, year: number) => hub.indexHighCourt(String(code), Number(year)));
  handle("research:getSettings", () => researchSettings());
  handle("research:setSettings", (s: Record<string, unknown>) => {
    const next: ResearchSettings = { aws: s?.aws !== false, indiaCode: s?.indiaCode !== false, web: s?.web !== false };
    writeSetting("researchSources", next);
    return next;
  });
  // V5-1 to V5-5: record chain, refusals, Inspector, Find, Files, Jobs.
  handle("audit:verifyChain", async (matterId: string) => (await matters.store(matterId)).verifyChain());
  handle("audit:refusals", async (matterId: string) => (await matters.store(matterId)).refusals());
  handle("audit:inspect", async (matterId: string, id: string) => (await matters.store(matterId)).inspect(String(id)));
  handle("find:query", async (matterId: string, q: string) => {
    await ensureFindIndex(matters, matterId);
    return (await matters.store(matterId)).find(String(q ?? ""), 40);
  });
  handle("files:list", async (matterId: string) => listMatterFiles((await matters.store(matterId)).folder));
  handle("files:open", async (matterId: string, rel: string) => {
    const folder = (await matters.store(matterId)).folder;
    const target = path.resolve(folder, String(rel ?? ""));
    if (!target.startsWith(path.resolve(folder) + path.sep)) throw new Error("PATH_OUTSIDE_MATTER");
    const err = await shell.openPath(target);
    if (err) throw new Error(`OPEN_FAILED: ${err}`);
    return true;
  });
  handle("jobs:list", async (matterId: string) => {
    const store = await matters.store(matterId);
    return {
      reading: store.listJobs().map((j) => ({ ...j, name: store.getSource(j.sourceId)?.name ?? j.sourceId })),
      runs: store.studio.runs(),
      running: studio.runningRun(matterId),
      indexing: hub.indexingNow(),
    };
  });
  handle("studio:stop", (matterId: string) => studio.stop(matterId));
  // V5-19 to V5-25: hearings, reminders, policy and usage, Stop, parties and contacts, docket, questions, diagnostics.
  handle("hearings:list", async (matterId: string) => (await matters.store(matterId)).hearings());
  handle("hearings:add", async (matterId: string, h: Record<string, unknown>) =>
    (await matters.store(matterId)).addHearing(
      { date: String(h?.date ?? ""), bench: String(h?.bench ?? ""), directions: String(h?.directions ?? ""), nextDate: String(h?.nextDate ?? ""), nextDateStatus: h?.nextDateStatus === "inferred" ? "inferred" : "confirmed", notes: String(h?.notes ?? "") },
      { actor: "advocate" },
    ),
  );
  handle("reminders:list", async (matterId: string) => (await matters.store(matterId)).reminders());
  handle("reminders:add", async (matterId: string, text: string, dueAt: string) => (await matters.store(matterId)).addReminder(String(text ?? ""), String(dueAt ?? ""), { actor: "advocate" }));
  handle("reminders:done", async (matterId: string, id: string) => {
    (await matters.store(matterId)).setReminderStatus(String(id), "done", { actor: "advocate" });
    return (await matters.store(matterId)).reminders();
  });
  // Phase 7 (K8): the compliance tasks a hearing's directions need.
  handle("tasks:list", async (matterId: string) => (await matters.store(matterId)).taskProposals());
  handle("tasks:add", async (matterId: string, hearingId: string, text: string, dueAt: string) =>
    (await matters.store(matterId)).proposeTask({ hearingId: String(hearingId ?? ""), text: String(text ?? ""), dueAt: dueAt ? String(dueAt) : undefined }, { actor: "advocate" }),
  );
  handle("tasks:decide", async (matterId: string, id: string, accept: boolean) => (await matters.store(matterId)).decideTask(String(id ?? ""), accept === true, { actor: "advocate" }));
  // Phase 7 (K9): the cross-examination plan.
  handle("cross:list", async (matterId: string) => (await matters.store(matterId)).crossQuestions());
  handle("cross:propose", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(matterId)).proposeCrossQuestion(
      {
        witness: String(input?.witness ?? ""),
        question: String(input?.question ?? ""),
        targetKind: input?.targetKind === "contradiction" ? "contradiction" : "evidence",
        targetId: String(input?.targetId ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("cross:decide", async (matterId: string, id: string, decision: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return (await matters.store(matterId)).decideCrossQuestion(String(id ?? ""), decision, { actor: "advocate" });
  });
  handle("policy:get", async (matterId: string) => {
    const store = await matters.store(matterId);
    return { ...store.policy(), usage: store.usage() };
  });
  handle("policy:set", async (matterId: string, p: Record<string, unknown>) => {
    const store = await matters.store(matterId);
    store.setPolicy({ confidential: p?.confidential === true, budgetTokens: p?.budgetTokens == null || p.budgetTokens === "" ? null : Number(p.budgetTokens) }, { actor: "advocate" });
    return { ...store.policy(), usage: store.usage() };
  });
  handle("chat:stop", (matterId: string) => agent.stop(matterId));
  // O10, human-only: a Firm Agent handoff was taken to its matter, or dismissed.
  handle("firm:close-handoff", (id: string) => agent.closeFirmHandoff(String(id ?? "")));
  // Native harness parts: the plan (clear is human-only) and Compact now.
  handle("chat:clear-plan", (id: string) => agent.clearPlan(String(id ?? "")));
  handle("chat:compact", (id: string) => agent.compact(String(id ?? "")));
  // The matter's cost as CSV text; the window saves it from the matter page.
  handle("cost:csv", (matterId: string) => agent.costCsv(String(matterId ?? "")));
  // Helpers (native-harness-parts section 3): Stop, Steer and "Use results" are the advocate's.
  handle("helpers:stop", (id: string, helperId: string) => agent.stopHelper(String(id ?? ""), String(helperId ?? "")));
  handle("helpers:steer", (id: string, helperId: string, text: string) => agent.steerHelper(String(id ?? ""), String(helperId ?? ""), String(text ?? "")));
  handle("helpers:use-results", (id: string) => agent.useHelperResults(String(id ?? "")));
  // Settings: how strongly the agent is asked to keep a plan (native-harness-parts section 4).
  handle("plan:strength:get", () => (readSettings().planStrength === "most" ? "most" : "long"));
  handle("plan:strength:set", (value: unknown) => {
    const v = value === "most" ? "most" : "long";
    writeSetting("planStrength", v);
    return v;
  });
  // Settings → Tool permissions (native-harness-parts section 2). The file is checked on write.
  handle("tool-policy:get", () => ({ policy: agent.policyStore().read(), tools: policyTools(), partyRule: readSettings().partyRule !== false }));
  handle("tool-policy:set", (policy: unknown, partyRule: unknown) => {
    if (typeof partyRule === "boolean") writeSetting("partyRule", partyRule);
    return { policy: agent.policyStore().write(cleanPolicy(policy)), tools: policyTools(), partyRule: readSettings().partyRule !== false };
  });
  handle("chat:answer-question", (matterId: string, questionId: unknown, answer: unknown) => {
    if (typeof questionId !== "string" || !questionId) throw new Error("BAD_REQUEST: a question id is required");
    if (answer !== null && typeof answer !== "string" && typeof answer !== "boolean") throw new Error("BAD_REQUEST: the answer is a string, true or false, or null");
    return agent.answerQuestion(matterId, questionId, answer);
  });
  handle("contacts:list", () => contacts.list());
  handle("contacts:add", (c: Record<string, unknown>) => contacts.add({ name: String(c?.name ?? ""), kind: String(c?.kind ?? "client"), email: String(c?.email ?? ""), phone: String(c?.phone ?? ""), notes: String(c?.notes ?? "") }));
  handle("contacts:remove", (id: string) => contacts.remove(String(id)));
  handle("parties:list", async (matterId: string) => {
    const all = contacts.list();
    return (await matters.store(matterId)).parties().map((p) => ({ ...p, contact: all.find((c) => c.id === p.contactId) ?? null }));
  });
  handle("parties:add", async (matterId: string, contactId: string, role: string, nameInRecord: string, counsel?: string) => {
    if (!contacts.list().some((c) => c.id === contactId)) throw new Error("CONTACT_NOT_FOUND");
    return (await matters.store(matterId)).addParty(String(contactId), String(role ?? "party"), String(nameInRecord ?? ""), { actor: "advocate" }, String(counsel ?? ""));
  });
  handle("docket:list", () => docket(matters, progress));
  handle("questions:generate", async (matterId: string) => {
    const r = await questionsDocument(matters, matterId, progress);
    if (process.env.OPENADVO_TEST !== "1") await shell.openPath(r.file);
    return r;
  });
  handle("diag:preview", async () => diagnosticsEntries(appInfo(), readSettings(), (await matters.list()).length).map((e) => ({ name: e.name, description: e.description, bytes: e.bytes.length })));
  handle("diag:write", async () => {
    if (!window) throw new Error("NO_WINDOW");
    const r = await dialog.showSaveDialog(window, { title: "Save the diagnostics file", defaultPath: `Open Advocate diagnostics ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
    if (r.canceled || !r.filePath) return null;
    const zip = diagnosticsZip(diagnosticsEntries(appInfo(), readSettings(), (await matters.list()).length));
    writeFileSync(r.filePath, zip);
    return { path: r.filePath, bytes: zip.length };
  });
  // V5-13: compare revisions; open a revision in Word and bring the edited copy back.
  handle("drafts:revisions", async (matterId: string, draftId: string) => (await matters.store(matterId)).listRevisions(String(draftId)));
  handle("drafts:compare", async (matterId: string, a: string, b: string) => {
    const store = await matters.store(matterId);
    const para = async (id: string) => readParagraphs(await store.revisionBytes(id)).map((x) => x.text).filter((t) => t.trim());
    return diffParagraphs(await para(String(a)), await para(String(b)));
  });
  handle("drafts:openInWord", async (matterId: string, revisionId: string) => {
    const store = await matters.store(matterId);
    const rev = store.getRevision(String(revisionId));
    const draft = store.getDraft(rev.draftId);
    const dir = path.join(app.getPath("userData"), "word", matterId);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${draft.title.replace(/[\\/:*?"<>|]+/g, " ").trim()} r${rev.seq}.docx`);
    writeFileSync(file, await store.revisionBytes(rev.id));
    store.appendEvent({ actor: "advocate" }, "revision.opened_in_word", rev.id, { file: path.basename(file) });
    if (process.env.OPENADVO_TEST !== "1") {
      const err = await shell.openPath(file);
      if (err) throw new Error(`OPEN_FAILED: ${err}`);
    }
    return { file, revisionId: rev.id };
  });
  handle("drafts:importFromWord", async (matterId: string, revisionId: string, filePath?: string) => {
    const store = await matters.store(matterId);
    const rev = store.getRevision(String(revisionId));
    let file = filePath ? String(filePath) : "";
    if (!file) {
      if (!window) throw new Error("NO_WINDOW");
      const r = await dialog.showOpenDialog(window, { title: "Bring back the edited copy", properties: ["openFile"], filters: [{ name: "Word document", extensions: ["docx"] }] });
      if (r.canceled || !r.filePaths[0]) return null;
      file = r.filePaths[0];
    }
    const bytes = readFileSync(file);
    if (detectMediaType(bytes, file) !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") throw new Error("NOT_DOCX: the file is not a Word document");
    const saved = await store.saveRevision(rev.draftId, Buffer.from(bytes), rev.id, { actor: "advocate" });
    store.appendEvent({ actor: "advocate" }, "revision.imported_from_word", saved.id, { base: rev.id, file: path.basename(file) });
    return saved;
  });
  // V5-18: the portal result after an uncertain submission.
  handle("filing:result", (matterId: string) => portal.resultState(matterId));
  handle("filing:reconcile", (matterId: string, outcome: string, diary: string) => {
    if (outcome !== "submitted" && outcome !== "not_submitted") throw new Error("BAD_OUTCOME: submitted or not_submitted");
    return portal.reconcile(matterId, outcome, String(diary ?? ""));
  });
  // V5-9 to V5-12: quick check, assessments, treatments, rehearsal, trends. Confirmations are the advocate's.
  handle("studio:quickCheck", (matterId: string) => hub.quickCheck(matterId));
  handle("studio:trends", () => hub.trends());
  handle("studio:assess", async (matterId: string, authorityId: string, field: string, value: string, basis: string) =>
    (await matters.store(matterId)).studio.assessAuthority(String(authorityId), field === "voice" ? "voice" : "support", String(value), String(basis ?? ""), { actor: "advocate" }),
  );
  handle("studio:addTreatment", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(matterId)).studio.addTreatment(
      {
        authorityId: String(input?.authorityId ?? ""),
        kind: String(input?.kind ?? "") as never,
        byCitation: String(input?.byCitation ?? ""),
        byDate: String(input?.byDate ?? ""),
        byBench: Number(input?.byBench) || null,
        authorityDate: String(input?.authorityDate ?? ""),
        authorityBench: Number(input?.authorityBench) || null,
        note: String(input?.note ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("studio:rehearse", (matterId: string) => studio.rehearse(matterId));
  handle("studio:decideChallenge", async (matterId: string, id: string, status: string) => {
    if (status !== "accepted" && status !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return (await matters.store(matterId)).studio.decideChallenge(String(id), status, { actor: "advocate" });
  });
  // V5-6 to V5-8: entities, corrections, date anchors, OCR disputes. Decisions are human-only.
  handle("notebook:entities", async (matterId: string) => {
    const store = await matters.store(matterId);
    const lines = store.listSources().flatMap((s) => store.sourceLines(s.id).map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text })));
    const entities = extractEntities(lines);
    return { entities, conflicts: caseNumberConflicts(entities) };
  });
  handle("notebook:correctEvent", async (matterId: string, eventId: string, input: Record<string, unknown>, reason: string) => {
    (await matters.store(matterId)).correctEvent(String(eventId), { dateStart: String(input?.dateStart ?? ""), dateEnd: String(input?.dateEnd ?? ""), description: String(input?.description ?? "") }, String(reason ?? ""), { actor: "advocate" });
    return matters.notebook(matterId);
  });
  handle("notebook:setDateAnchor", async (matterId: string, sourceId: string, date: string) => {
    (await matters.store(matterId)).setDateAnchor(String(sourceId), String(date), { actor: "advocate" });
    const added = await applyDateAnchor(matters, matterId, String(sourceId));
    return { added, notebook: await matters.notebook(matterId) };
  });
  handle("ocr:disputes", async (matterId: string, sourceId?: string) => (await matters.store(matterId)).disputes(sourceId ? String(sourceId) : undefined));
  handle("ocr:decide", async (matterId: string, id: string, choice: string, typed: string) => {
    if (choice !== "a" && choice !== "b" && choice !== "typed") throw new Error("BAD_CHOICE: a, b or typed");
    const d = (await matters.store(matterId)).decideDispute(String(id), choice, String(typed ?? ""), { actor: "advocate" });
    const added = await eventsFromDecidedLine(matters, matterId, d);
    return { dispute: d, added };
  });
  // V3-1 and V3-2: reads only.
  handle("progress:get", (matterId: string) => progress.progress(matterId));
  handle("inbox:get", (matterId: string) => progress.inbox(matterId));
  // V3-3: the command bar's line search (the same search as the agent's search_sources).
  handle("sources:search", (matterId: string, query: string) => matters.searchLines(matterId, String(query ?? ""), 50));
  handle("matters:create", (title: string) => matters.create(String(title ?? "")));
  handle("matters:open", async (matterId: string) => {
    const sources = await matters.openMatter(matterId);
    ingest.enqueue(matterId);
    return sources;
  });
  handle("sources:list", (matterId: string) => matters.listSources(matterId));
  handle("sources:origins", (matterId: string, sourceId: string) => matters.listOrigins(matterId, sourceId));
  handle("sources:add", (matterId: string, paths: unknown) => {
    const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    return matters.addFiles(matterId, list, { actor: "advocate" }).then((results) => {
      ingest.enqueue(matterId);
      return results;
    });
  });
  handle("events:list", (matterId: string) => matters.listEvents(matterId));
  handle("ingest:jobs", (matterId: string) => matters.listJobs(matterId));
  handle("sources:pages", (matterId: string, sourceId: string) => matters.listPages(matterId, sourceId));
  handle("review:list", (matterId: string) => matters.listReviewItems(matterId));
  // Human-only actions (decision 5): bridge functions, never agent tools.
  handle("review:resolve", (matterId: string, itemId: string) => matters.decideReviewItem(matterId, itemId, "resolved"));
  handle("review:skip", (matterId: string, itemId: string) => matters.decideReviewItem(matterId, itemId, "skipped"));
  handle("notebook:get", (matterId: string) => matters.notebook(matterId));
  for (const decision of ["confirmed", "rejected", "excluded", "included"] as const) {
    handle(`notebook:${decision}`, (matterId: string, eventId: string) => matters.decideEvent(matterId, eventId, decision));
  }
  handle("notebook:resolveConflict", (matterId: string, conflictId: string, resolution: string) => matters.resolveConflict(matterId, conflictId, resolution));
  handle("view:openSource", async (matterId: string, sourceId: string) => {
    const file = await matters.sourceFile(matterId, sourceId);
    return editorHost.open(file.path, file.name, "pdf", true);
  });
  handle("view:close", async (token: string) => {
    editorHost.close(String(token ?? ""));
    await drafts.closeWorkingCopy(String(token ?? ""));
  });
  // Step 4: drafts and revisions. The store is reached only through main/matters.ts.
  handle("drafts:list", (matterId: string) => drafts.list(matterId));
  handle("drafts:getRevision", (matterId: string, revisionId: string) => drafts.revisionDetail(matterId, revisionId));
  handle("drafts:paragraphSource", (matterId: string, draftId: string, anchor: string) => drafts.paragraphSource(matterId, draftId, anchor));
  handle("drafts:generateListOfDates", (matterId: string) => drafts.generate(matterId, "list_of_dates" satisfies DraftKind));
  handle("drafts:generateSynopsis", (matterId: string) => drafts.generate(matterId, "synopsis" satisfies DraftKind));
  handle("drafts:openRevision", (matterId: string, revisionId: string) => drafts.openInEditor(matterId, revisionId));
  handle("drafts:insertFromNotebook", (matterId: string, draftId: string, eventId: string) =>
    drafts.insertFromNotebook(matterId, draftId, eventId),
  );
  // Human-only actions (decision 5): the advocate saves and approves a revision.
  handle("drafts:saveRevision", (matterId: string, draftId: string, bytes: unknown, baseRevisionId: string) => {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer | number[]);
    if (raw.length === 0) throw new Error("DOC_SAVE_FAILED: the editor sent no bytes");
    return drafts.saveRevision(matterId, draftId, raw, baseRevisionId);
  });
  handle("drafts:check", (matterId: string, draftId: string) => drafts.check(matterId, String(draftId ?? "")));
  handle("drafts:agentChanges", (matterId: string) => drafts.agentChanges(matterId));
  // Human-only (decision 5): keep or undo agent changes. Never an agent tool. An undo may carry
  // the advocate's reason (A7): the second identical reason proposes a preference.
  handle("drafts:decideAgentChanges", (matterId: string, draftId: string, baseRevisionId: string, decisions: unknown) => {
    if (!Array.isArray(decisions)) throw new Error("BAD_DECISION: a list of decisions is needed");
    const clean = decisions.map((d: { anchor?: unknown; decision?: unknown; reason?: unknown }) => {
      if (d?.decision !== "keep" && d?.decision !== "undo") throw new Error("BAD_DECISION: keep or undo");
      return { anchor: String(d.anchor ?? ""), decision: d.decision as "keep" | "undo", reason: typeof d.reason === "string" ? d.reason : undefined };
    });
    return drafts.decideAgentChanges(matterId, String(draftId ?? ""), String(baseRevisionId ?? ""), clean);
  });
  handle("drafts:approveRevision", (matterId: string, revisionId: string) => drafts.approveRevision(matterId, revisionId));
  handle("drafts:generate", (matterId: string, kind: string) => {
    if (!(DRAFT_KINDS as readonly string[]).includes(kind)) throw new Error("BAD_DRAFT_KIND");
    return drafts.generate(matterId, kind as DraftKind);
  });
  handle("drafts:catalogue", () => draftsCatalogue());
  handle("drafts:compareRevisionWithPdf", (matterId: string, revisionId: string) =>
    drafts.compareRevisionToPdf(matterId, String(revisionId ?? "")).then((r) => ({ ok: r.ok, missing: r.missing, extra: r.extra })),
  );

  // Steps 6 and 7: research and legal review. Decisions are human-only bridge functions (decision 5).
  handle("research:get", (matterId: string) => research.state(matterId));
  handle("research:addIssue", (matterId: string, text: string) => research.addIssue(matterId, String(text ?? "")));
  handle("research:decideIssue", (matterId: string, id: string, decision: string, reason: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return research.decideIssue(matterId, String(id), decision, String(reason ?? ""));
  });
  handle("research:addAuthority", (matterId: string, input: Record<string, unknown>) =>
    research.addAuthority(matterId, {
      citation: String(input?.citation ?? ""),
      parties: String(input?.parties ?? ""),
      decisionDate: String(input?.decisionDate ?? ""),
      paragraph: String(input?.paragraph ?? ""),
      proposition: String(input?.proposition ?? ""),
      role: String(input?.role ?? "") as "supporting",
      issueId: input?.issueId ? String(input.issueId) : null,
    }),
  );
  handle("research:decideAuthority", (matterId: string, id: string, decision: string) => {
    if (decision !== "adopted" && decision !== "rejected") throw new Error("BAD_DECISION: adopted or rejected");
    return research.decideAuthority(matterId, String(id), decision);
  });
  handle("research:checkCitations", async (matterId: string, draftId: string | null) => {
    const out = await research.checkCitations(matterId, draftId ? String(draftId) : undefined);
    matterChanged(matterId);
    return out;
  });
  handle("research:attestCitation", (matterId: string, citation: string, reason: string) => research.attestCitation(matterId, String(citation ?? ""), String(reason ?? "")));
  handle("research:adverseReview", (matterId: string, outcome: string, coverage: string, note: string) =>
    research.recordAdverseReview(matterId, outcome as "none_found", String(coverage ?? ""), String(note ?? "")),
  );
  handle("research:searchIndex", (query: string) => searchCitationIndex(ulos, String(query ?? ""), 20));

  // Step 8: filing preparation. The approval for filing is human-only.
  handle("filing:get", (matterId: string) => filing.state(matterId));
  handle("filing:setDetails", (matterId: string, input: Record<string, unknown>) =>
    filing.setDetails(matterId, {
      ...(input?.petitioner !== undefined ? { petitioner: String(input.petitioner) } : {}),
      ...(input?.respondent !== undefined ? { respondent: String(input.respondent) } : {}),
      ...(input?.caseNumber !== undefined ? { caseNumber: String(input.caseNumber) } : {}),
      ...(input?.cnr !== undefined ? { cnr: String(input.cnr) } : {}),
      ...(input?.court !== undefined ? { court: String(input.court) } : {}),
      ...(input?.interimRelief !== undefined ? { interimRelief: String(input.interimRelief) } : {}),
      ...(input?.victimProtected !== undefined ? { victimProtected: input.victimProtected === true } : {}),
      ...(Array.isArray(input?.victimNames) ? { victimNames: (input.victimNames as unknown[]).map(String) } : {}),
      ...(input?.copyApplied !== undefined ? { copyApplied: String(input.copyApplied) } : {}),
      ...(input?.copyReceived !== undefined ? { copyReceived: String(input.copyReceived) } : {}),
      ...(input?.impugnedEventId !== undefined ? { impugnedEventId: input.impugnedEventId ? String(input.impugnedEventId) : null } : {}),
    }),
  );
  handle("filing:setAnnexures", (matterId: string, items: unknown) => {
    const list = Array.isArray(items) ? items.map((x: { sourceId?: unknown; title?: unknown }) => ({ sourceId: String(x?.sourceId ?? ""), title: String(x?.title ?? "") })) : [];
    return filing.setAnnexures(matterId, list);
  });
  handle("filing:computeLimitation", (matterId: string) => filing.computeLimitation(matterId));
  handle("filing:confirmLimitation", (matterId: string, id: string) => filing.confirmLimitation(matterId, String(id ?? "")));
  handle("filing:approve", (matterId: string) => filing.approveForFiling(matterId));
  handle("filing:verifyManifest", (matterId: string) => filing.verifyManifest(matterId));
  handle("filing:confirm", (matterId: string, filingSetId: string, payloadSha256: string, step: number) => {
    if (step !== 1 && step !== 2) throw new Error("BAD_STEP: 1 or 2");
    return filing.confirmFiling(matterId, String(filingSetId ?? ""), String(payloadSha256 ?? ""), step);
  });
  handle("filing:reveal", async (matterId: string) => {
    const set = (await filing.state(matterId)).filingSet;
    if (set) shell.showItemInFolder(path.join(set.folder, "manifest.json"));
  });

  // Step 10: voice. The transcript is text for the composer only; voice confirms nothing.
  handle("voice:status", () => voiceAvailable(resourcesRoot()));
  handle("voice:transcribe", (samples: unknown) => {
    const s = samples instanceof Float32Array ? samples : new Float32Array(samples as ArrayBuffer);
    if (s.length > 16_000 * 120) throw new Error("VOICE_TOO_LONG: at most two minutes at a time");
    return transcribe(resourcesRoot(), s);
  });

  // Step 9: court record capture and client email.
  handle("capture:openPortal", (matterId: string) => portal.open(matterId));
  // Phase 3 (S10): the built-in browser. The pane owns the layout; the main process owns the tabs.
  handle("browser:state", () => browser.state());
  handle("browser:open", (url?: string, options?: { agent?: boolean; activate?: boolean }) => browser.open(url ? String(url) : undefined, { agent: options?.agent === true, activate: options?.activate !== false }));
  handle("browser:close", (id: string) => browser.close(String(id)));
  handle("browser:activate", (id: string) => browser.activate(String(id)));
  handle("browser:navigate", (id: string, url: string) => browser.navigate(String(id), String(url)));
  handle("browser:back", (id: string) => browser.back(String(id)));
  handle("browser:forward", (id: string) => browser.forward(String(id)));
  handle("browser:reload", (id: string) => browser.reload(String(id)));
  handle("browser:stop", (id: string) => browser.stop(String(id)));
  handle("browser:setBounds", (bounds: BrowserBounds) => browser.setBounds(bounds));
  handle("browser:setVisible", (visible: boolean) => browser.setVisible(visible === true));
  handle("browser:setMatter", (matterId: string | null) => browser.setMatter(matterId ? String(matterId) : null));
  handle("browser:bookmarks", () => browser.listBookmarks());
  handle("browser:toggleBookmark", (id: string) => browser.toggleBookmark(String(id)));
  handle("browser:removeBookmark", (id: string) => browser.removeBookmark(String(id)));
  handle("browser:openBookmark", (id: string) => browser.openBookmark(String(id)));
  handle("browser:history", () => browser.historyList());
  handle("browser:clearHistory", () => browser.clearHistory());
  handle("browser:proposeCaseList", async () => browser.proposeCaseList((await agent.completer())?.complete ?? null));
  handle("browser:createMatters", async (cases: CaseListProposal[]) => {
    if (!Array.isArray(cases)) throw new Error("BAD_CASES: a list of proposals is needed");
    const out: { created: number; matterIds: string[]; refused: string[] } = { created: 0, matterIds: [], refused: [] };
    for (const c of cases.slice(0, 100)) {
      try {
        const m = await createMatterFromFields({
          title: String(c?.title ?? ""),
          petitioner: String(c?.petitioner ?? ""),
          respondent: String(c?.respondent ?? ""),
          cnr: String(c?.cnr ?? ""),
          court: String(c?.court ?? ""),
          stage: String(c?.stage ?? ""),
          nextDate: String(c?.nextDate ?? ""),
          sourceUrl: String(c?.sourceUrl ?? ""),
        });
        out.matterIds.push(m.id);
      } catch (e) {
        out.refused.push(`${String((c as { title?: unknown })?.title ?? "a case")}: ${(e as Error).message}`);
      }
    }
    out.created = out.matterIds.length;
    return out;
  });
  // C2: the agent's proposal waits for the advocate.
  handle("proposals:list", () => proposals.list());
  handle("proposals:create", async (id: string) => {
    const p = proposals.get(String(id));
    if (!p) throw new Error(`NOT_FOUND: no matter proposal ${String(id)}`);
    if (p.status !== "open") throw new Error(`NOT_OPEN: the proposal is ${p.status}`);
    const m = await createMatterFromFields({ title: p.title, cnr: p.cnr, court: p.court, petitioner: p.petitioner, respondent: p.respondent, stage: p.stage, nextDate: p.nextDate, sourceUrl: `a chat proposal (${p.reason})` });
    proposals.setStatus(p.id, "created");
    return m;
  });
  handle("proposals:dismiss", (id: string) => {
    proposals.setStatus(String(id), "dismissed");
    return proposals.list();
  });
  // Phase 4: facts, evidence, structure, relations, the graph and timelines.
  handle("evidence:facts", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.facts(filter ?? {}));
  handle("evidence:addFact", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.addFact(
      {
        text: String(input?.text ?? ""),
        type: String(input?.type ?? "fact"),
        sourceId: input?.sourceId ? String(input.sourceId) : null,
        anchorId: input?.anchorId ? String(input.anchorId) : null,
        page: input?.page == null ? null : Number(input.page),
        line: input?.line == null ? null : Number(input.line),
        eventId: input?.eventId ? String(input.eventId) : null,
        date: String(input?.date ?? ""),
        amount: String(input?.amount ?? ""),
        parties: Array.isArray(input?.parties) ? (input.parties as unknown[]).map(String) : [],
        relief: String(input?.relief ?? ""),
        method: "advocate",
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:decideFact", async (matterId: string, id: string, status: string) => {
    if (status !== "confirmed" && status !== "disputed" && status !== "rejected") throw new Error("BAD_STATUS: confirmed, disputed or rejected");
    return (await matters.store(String(matterId))).evidence.decideFact(String(id), status, { actor: "advocate" });
  });
  handle("evidence:supersedeFact", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.supersedeFact(
      String(id),
      {
        text: String(input?.text ?? ""),
        type: input?.type ? String(input.type) : undefined,
        date: input?.date ? String(input.date) : undefined,
        amount: input?.amount ? String(input.amount) : undefined,
        parties: Array.isArray(input?.parties) ? (input.parties as unknown[]).map(String) : undefined,
        relief: input?.relief ? String(input.relief) : undefined,
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:linkFact", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.linkFact(
      String(id),
      {
        issueIds: Array.isArray(input?.issueIds) ? (input.issueIds as unknown[]).map(String) : undefined,
        argumentIds: Array.isArray(input?.argumentIds) ? (input.argumentIds as unknown[]).map(String) : undefined,
        relief: input?.relief !== undefined ? String(input.relief) : undefined,
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:contradictions", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const nb = await matters.notebook(String(matterId));
    return detectContradictions(store.evidence.facts(), nb.events.map((e) => ({ id: e.id, dateStart: e.dateStart, description: e.description, sourceId: e.sourceId, page: e.page, line: e.line })));
  });
  handle("evidence:list", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.evidenceList(filter ?? {}));
  handle("evidence:add", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.addEvidence(
      {
        sourceId: String(input?.sourceId ?? ""),
        exhibitNumber: String(input?.exhibitNumber ?? ""),
        witness: String(input?.witness ?? ""),
        statement: String(input?.statement ?? ""),
        givenBy: String(input?.givenBy ?? ""),
        givenAt: String(input?.givenAt ?? ""),
        electronic: input?.electronic === true,
        device: String(input?.device ?? ""),
        admissibility: String(input?.admissibility ?? ""),
        notes: String(input?.notes ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:update", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.updateEvidence(
      String(id),
      {
        ...(input?.exhibitNumber !== undefined ? { exhibitNumber: String(input.exhibitNumber) } : {}),
        ...(input?.witness !== undefined ? { witness: String(input.witness) } : {}),
        ...(input?.statement !== undefined ? { statement: String(input.statement) } : {}),
        ...(input?.givenBy !== undefined ? { givenBy: String(input.givenBy) } : {}),
        ...(input?.givenAt !== undefined ? { givenAt: String(input.givenAt) } : {}),
        ...(input?.electronic !== undefined ? { electronic: input.electronic === true } : {}),
        ...(input?.device !== undefined ? { device: String(input.device) } : {}),
        ...(input?.authenticity !== undefined ? { authenticity: String(input.authenticity) as never } : {}),
        ...(input?.admissibility !== undefined ? { admissibility: String(input.admissibility) } : {}),
        ...(input?.notes !== undefined ? { notes: String(input.notes) } : {}),
        ...(input?.status !== undefined ? { status: String(input.status) as never } : {}),
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:parts", async (matterId: string, sourceId?: string) => (await matters.store(String(matterId))).evidence.parts(sourceId ? String(sourceId) : undefined));
  handle("evidence:relations", async (matterId: string) => (await matters.store(String(matterId))).evidence.relations());
  handle("evidence:decideRelation", async (matterId: string, reviewItemId: string, decision: string) => {
    if (decision !== "same" && decision !== "different") throw new Error("BAD_DECISION: same or different");
    return (await matters.store(String(matterId))).evidence.decideRelation(String(reviewItemId), decision, { actor: "advocate" });
  });
  handle("evidence:edges", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.edges(filter ?? {}));
  handle("evidence:timeline", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const nb = await matters.notebook(String(matterId));
    return buildTimeline(nb.events, store.evidence.facts());
  });
  handle("matter-memory:list", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.memory(filter ?? {}));
  handle("matter-memory:propose", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.proposeMemory(
      {
        type: String(input?.type ?? "fact_from_document"),
        subject: String(input?.subject ?? ""),
        relation: String(input?.relation ?? "is"),
        object: String(input?.object ?? ""),
        sourceId: input?.sourceId ? String(input.sourceId) : null,
        anchorId: input?.anchorId ? String(input.anchorId) : null,
        validFrom: input?.validFrom ? String(input.validFrom) : null,
        validUntil: input?.validUntil ? String(input.validUntil) : null,
        confidence: input?.confidence == null ? null : Number(input.confidence),
        supersedes: input?.supersedes ? String(input.supersedes) : null,
      },
      { actor: "advocate" },
    ),
  );
  handle("matter-memory:decide", async (matterId: string, id: string, status: string) => (await matters.store(String(matterId))).evidence.decideMemory(String(id), status as never, { actor: "advocate" }));
  handle("evidence:marks", async (matterId: string, sourceId?: string) => (await matters.store(String(matterId))).evidence.marks(sourceId ? String(sourceId) : undefined));
  handle("docops:list", async (matterId: string) => (await matters.store(String(matterId))).evidence.operations());
  handle("docops:run", async (matterId: string, input: Record<string, unknown>) => {
    const kind = String(input?.kind ?? "");
    if (kind === "extract") return extractPages(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.pages) ? (input.pages as unknown[]).map(Number) : []);
    if (kind === "split") return splitDocument(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.ranges) ? (input.ranges as unknown[]).map((r) => (Array.isArray(r) ? r.map(Number) : [])) : []);
    if (kind === "merge") return mergeDocuments(matters, String(matterId), Array.isArray(input?.sourceIds) ? (input.sourceIds as unknown[]).map(String) : []);
    if (kind === "reorder") return reorderDocument(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.order) ? (input.order as unknown[]).map(Number) : []);
    if (kind === "annotate" || kind === "highlight" || kind === "redact") {
      const area = (input?.area ?? {}) as Record<string, unknown>;
      return markDocument(matters, String(matterId), String(input?.sourceId ?? ""), { page: Number(area.page), x: Number(area.x), y: Number(area.y), w: Number(area.w), h: Number(area.h) }, kind);
    }
    throw new Error("BAD_OPERATION: extract, split, merge, reorder, annotate, highlight or redact");
  });
  handle("jurisdiction:get", async (matterId: string) => (await matters.store(String(matterId))).evidence.jurisdiction());
  handle("jurisdiction:set", async (matterId: string, report: JurisdictionReport) => (await matters.store(String(matterId))).evidence.setJurisdiction(report, { actor: "advocate" }));
  handle("jurisdiction:clauses", async (matterId: string) => (await matters.store(String(matterId))).evidence.forumClauses());
  handle("matters:relatedSuggestions", async () => {
    const all = await matters.list();
    const out: Array<{ a: string; b: string; reason: string; basis: string }> = [];
    const fingerprints: Array<{ id: string; title: string; cnr: string; fir: string; parties: string[]; impugnedOrder: string }> = [];
    for (const m of all.filter((x) => !x.archived)) {
      const store = await matters.store(m.id);
      const profile = store.profile();
      const details = store.work.details();
      const nb = await matters.notebook(m.id);
      const impugned = details.impugnedEventId ? nb.events.find((e) => e.id === details.impugnedEventId)?.description ?? "" : "";
      const fir = [m.title, ...store.listSources().map((s) => s.name)].join(" ").match(/\b(?:FIR|F\.I\.R\.?)\s*(?:No\.?)?\s*[A-Z0-9/-]{2,}/i)?.[0] ?? "";
      fingerprints.push({
        id: m.id,
        title: m.title,
        cnr: profile.cnr || details.cnr,
        fir,
        parties: [...store.parties().map((p) => p.nameInRecord), details.petitioner, details.respondent].filter(Boolean),
        impugnedOrder: impugned,
      });
    }
    for (const r of detectRelatedMatters(fingerprints)) out.push(r);
    return out;
  });
  handle("records:templates", async (proceeding: string) => templatesFor(String(proceeding ?? "")));
  handle("records:applyTemplate", async (matterId: string, key: string) => {
    const store = await matters.store(String(matterId));
    const proceeding = store.profile().proceeding || store.profile().caseType;
    const t = templatesFor(proceeding).find((x) => x.key === String(key));
    if (!t) throw new Error(`TEMPLATE_NOT_FOUND: ${String(key)}`);
    for (const q of t.columns) store.work.addRecordColumn(q, { actor: "advocate" });
    return { columns: t.columns.length };
  });
  // Phase 7 (K3): the advocate confirms a proposed element column, or rejects it.
  handle("records:decideColumn", async (matterId: string, columnId: string, decision: string) => {
    if (decision !== "confirmed" && decision !== "rejected") throw new Error("BAD_DECISION: confirmed or rejected");
    return (await matters.store(String(matterId))).work.decideRecordColumn(String(columnId ?? ""), decision, { actor: "advocate" });
  });
  handle("mail:importEml", async (matterId: string) => {
    if (!window) return { messages: 0, attachments: [] };
    const r = await dialog.showOpenDialog(window, { title: "Import saved email messages", properties: ["openFile", "multiSelections"], filters: [{ name: "Email message", extensions: ["eml"] }] });
    if (r.canceled) return { messages: 0, attachments: [] };
    const out = await mail.importEmlFiles(matterId, r.filePaths);
    ingest.enqueue(matterId);
    return out;
  });
  handle("mail:getAccount", () => {
    const a = readSettings().mail as MailAccount | undefined;
    return a ? { ...a, hasPassword: existsSync(mailSecretFile()) } : null;
  });
  handle("mail:setAccount", (account: Record<string, unknown>, password: string) => {
    const a: MailAccount = { host: String(account?.host ?? ""), port: Number(account?.port ?? 993), secure: account?.secure !== false, user: String(account?.user ?? "") };
    if (!a.host || !a.user) throw new Error("MAIL_ACCOUNT_INCOMPLETE: host and user are needed");
    writeSetting("mail", a);
    if (password) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("SECRET_STORE_UNAVAILABLE: the operating system's secret store is not available");
      writeFileSync(mailSecretFile(), safeStorage.encryptString(String(password)));
    }
    return { ...a, hasPassword: existsSync(mailSecretFile()) };
  });
  handle("mail:fetch", async (matterId: string, filter: Record<string, unknown>) => {
    const a = readSettings().mail as MailAccount | undefined;
    if (!a || !existsSync(mailSecretFile())) throw new Error("MAIL_ACCOUNT_MISSING: set the authorised mailbox first");
    const password = safeStorage.decryptString(readFileSync(mailSecretFile()));
    const out = await mail.importFromImap(matterId, a, password, {
      from: filter?.from ? String(filter.from) : undefined,
      subject: filter?.subject ? String(filter.subject) : undefined,
      since: filter?.since ? String(filter.since) : undefined,
    });
    ingest.enqueue(matterId);
    return out;
  });
  handle("dialog:pickFiles", async () => {
    if (!window) return [];
    const result = await dialog.showOpenDialog(window, {
      title: "Add PDF files to the matter",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Documents", extensions: ["pdf", "docx", "txt", "png", "jpg", "jpeg"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle("dialog:pickFolder", async () => {
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, { title: "Choose the folder of the matter", properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  // C2, W4: create a matter from a folder, a CNR or an email. The advocate confirms the title.
  handle("intake:folder", async () => {
    if (!window) return null;
    const picked = await dialog.showOpenDialog(window, { title: "Choose the folder of the matter", properties: ["openDirectory"] });
    const folder = picked.canceled ? null : picked.filePaths[0];
    if (!folder) return null;
    const m = await matters.create(path.basename(folder));
    const results = await matters.addFolder(m.id, folder);
    ingest.enqueue(m.id);
    return { matter: m, added: results.filter((r) => r.outcome === "added").length, refused: results.filter((r) => r.outcome === "refused").length };
  });
  handle("intake:cnr", async (cnr: string, court: string) => {
    const clean = String(cnr ?? "").trim().toUpperCase();
    if (!clean) throw new Error("CNR_REQUIRED: a CNR is needed");
    if (clean.length > 40) throw new Error("BAD_CNR: the CNR is too long");
    const title = String(court ?? "").trim() ? `${String(court).trim()} — CNR ${clean}` : `CNR ${clean}`;
    const m = await matters.create(title);
    const store = await matters.store(m.id);
    store.setProfile({ cnr: clean, court: String(court ?? "").trim() }, { actor: "advocate" });
    await filing.setDetails(m.id, { cnr: clean, court: String(court ?? "").trim() });
    return m;
  });
  handle("intake:email", async () => {
    if (!window) return null;
    const picked = await dialog.showOpenDialog(window, { title: "Choose a saved email message", properties: ["openFile", "multiSelections"], filters: [{ name: "Email message", extensions: ["eml"] }] });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const m = await matters.create(path.basename(picked.filePaths[0], path.extname(picked.filePaths[0])));
    const out = await mail.importEmlFiles(m.id, picked.filePaths);
    ingest.enqueue(m.id);
    return { matter: m, messages: out.messages, attachments: out.attachments.length };
  });
  // C1, C3, C6, C10: the universal matter.
  handle("matter:profile", async (matterId: string) => (await matters.store(String(matterId))).profile());
  handle("matter:setProfile", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).setProfile(
      {
        ...(input?.court !== undefined ? { court: String(input.court) } : {}),
        ...(input?.bench !== undefined ? { bench: String(input.bench) } : {}),
        ...(input?.practiceArea !== undefined ? { practiceArea: String(input.practiceArea) } : {}),
        ...(input?.caseType !== undefined ? { caseType: String(input.caseType) } : {}),
        ...(input?.proceeding !== undefined ? { proceeding: String(input.proceeding) } : {}),
        ...(input?.side !== undefined ? { side: String(input.side) } : {}),
        ...(input?.caseNumber !== undefined ? { caseNumber: String(input.caseNumber) } : {}),
        ...(input?.cnr !== undefined ? { cnr: String(input.cnr) } : {}),
        ...(input?.filingDate !== undefined ? { filingDate: String(input.filingDate) } : {}),
        ...(input?.institutionDate !== undefined ? { institutionDate: String(input.institutionDate) } : {}),
        ...(input?.governingDate !== undefined ? { governingDate: String(input.governingDate) } : {}),
        ...(input?.stage !== undefined ? { stage: String(input.stage) } : {}),
        ...(input?.relief !== undefined ? { relief: String(input.relief) } : {}),
      },
      { actor: "advocate" },
    ),
  );
  handle("matter:classification", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const profile = store.profile();
    const partyRows = store.parties().map((p) => ({ role: p.role, nameInRecord: p.nameInRecord }));
    const details = store.work.details();
    if (details.petitioner.trim()) partyRows.push({ role: "petitioner", nameInRecord: details.petitioner });
    if (details.respondent.trim()) partyRows.push({ role: "respondent", nameInRecord: details.respondent });
    return proposeClassification({ title: store.matter().title, profile: { ...profile, court: profile.court || details.court, cnr: profile.cnr || details.cnr }, parties: partyRows, sourceNames: store.listSources().map((s) => s.name) });
  });
  handle("matter:applyClassification", async (matterId: string, proposal: Record<string, unknown>) => {
    const store = await matters.store(String(matterId));
    const profile = store.setProfile(
      {
        practiceArea: String(proposal?.practiceArea ?? ""),
        caseType: String(proposal?.caseType ?? ""),
        court: String(proposal?.court ?? ""),
        proceeding: String(proposal?.proceeding ?? ""),
        stage: String(proposal?.stage ?? ""),
      },
      { actor: "advocate" },
    );
    const details = await filing.setDetails(String(matterId), { court: profile.court });
    return { profile, details };
  });
  handle("matter:related", (matterId: string) => matters.relatedFor(String(matterId)));
  handle("matter:addRelated", async (matterId: string, toId: string, relation: string, note: string) => {
    const store = await matters.store(String(matterId));
    if (!(await matters.list()).some((m) => m.id === String(toId))) throw new Error("MATTER_NOT_FOUND: the related matter is not on this computer");
    store.addRelated(String(toId), String(relation) as never, String(note ?? ""), { actor: "advocate" });
    return matters.relatedFor(String(matterId));
  });
  handle("matter:removeRelated", async (matterId: string, toId: string, relation: string) => {
    (await matters.store(String(matterId))).removeRelated(String(toId), String(relation), { actor: "advocate" });
    return matters.relatedFor(String(matterId));
  });
  handle("matter:extend", async (matterId: string, input: { title: string; relation: string; court?: string; proceeding?: string }) => {
    const old = await matters.store(String(matterId));
    const title = String(input?.title ?? "").trim();
    if (!title) throw new Error("TITLE_REQUIRED: the new matter needs a title");
    const m = await matters.create(title);
    const next = await matters.store(m.id);
    next.setProfile({ court: String(input?.court ?? old.profile().court), proceeding: String(input?.proceeding ?? old.profile().proceeding) }, { actor: "advocate" });
    for (const p of old.parties()) next.addParty(p.contactId, p.role, p.nameInRecord, { actor: "advocate" }, p.counsel);
    next.addRelated(String(matterId), String(input?.relation ?? "connected") as never, `Extended from ${old.matter().title}.`, { actor: "advocate" });
    return m;
  });
  handle("advocate:set-enrolment", (number: string, year: string) => {
    const clean = String(number ?? "").replace(/\s+/g, "");
    if (!clean) throw new Error("ENROLMENT_REQUIRED: the enrolment number is empty");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("SECRET_STORE_UNAVAILABLE: the operating system's secret store is not available");
    mkdirSync(path.dirname(enrolmentFile()), { recursive: true });
    writeFileSync(enrolmentFile(), safeStorage.encryptString(clean));
    advocateStore.setProfileField("enrolment_stored", "yes", { actor: "advocate" });
    advocateStore.setProfileField("enrolment_year", String(year ?? ""), { actor: "advocate" });
    return enrolmentState();
  });
  handle("advocate:enrolment-state", () => enrolmentState());
  handle("advocate:clear-enrolment", () => {
    try {
      unlinkSync(enrolmentFile());
    } catch {
      // Already absent.
    }
    advocateStore.setProfileField("enrolment_stored", "", { actor: "advocate" });
    return enrolmentState();
  });
  handle("library:list", (filter?: { q?: string; kind?: string; status?: string }) =>
    library.list(filter).map((item) => ({ ...item, path: library.fileFor(item.id)?.path })),
  );
  handle("library:importFiles", async () => {
    if (!window) return { added: 0, duplicates: 0, refused: ["the window is not open"], items: [] };
    const r = await dialog.showOpenDialog(window, { title: "Import files into the Knowledge Library", properties: ["openFile", "multiSelections"], filters: [{ name: "Documents", extensions: ["pdf", "docx", "doc", "odt", "txt", "md", "csv", "xlsx", "pptx", "html", "htm", "eml", "msg", "zip"] }] });
    if (r.canceled) return { added: 0, duplicates: 0, refused: [], items: [] };
    return library.importFiles(r.filePaths);
  });
  handle("library:importFolder", async () => {
    if (!window) return { added: 0, duplicates: 0, refused: ["the window is not open"], items: [] };
    const r = await dialog.showOpenDialog(window, { title: "Import a folder into the Knowledge Library", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { added: 0, duplicates: 0, refused: [], items: [] };
    return library.importFolder(r.filePaths[0]);
  });
  handle("library:update", (id: string, input: Record<string, unknown>) =>
    advocateStore.updateLibraryItem(String(id), {
      ...(input?.title !== undefined ? { title: String(input.title) } : {}),
      ...(input?.kind !== undefined ? { kind: String(input.kind) } : {}),
      ...(input?.status !== undefined ? { status: String(input.status) } : {}),
      ...(input?.author !== undefined ? { author: String(input.author) } : {}),
      ...(input?.itemDate !== undefined ? { itemDate: String(input.itemDate) } : {}),
      ...(input?.matterId !== undefined ? { matterId: input.matterId ? String(input.matterId) : null } : {}),
      ...(input?.court !== undefined ? { court: String(input.court) } : {}),
      ...(input?.scope !== undefined ? { scope: String(input.scope) } : {}),
      ...(input?.notes !== undefined ? { notes: String(input.notes) } : {}),
      ...(Array.isArray(input?.tags) ? { tags: (input.tags as unknown[]).map(String) } : {}),
    }, { actor: "advocate" }),
  );
  handle("library:setStatus", (id: string, status: string) => advocateStore.setLibraryStatus(String(id), String(status), { actor: "advocate" }));
  // Phase 10 (F5, G3, M2, M3).
  handle("memory:answer", (matterId: string, question: string) => matters.answerMemory(String(matterId), String(question ?? "")));
  handle("outcomes:list", (matterId: string) => matters.outcomes(String(matterId)));
  handle("outcomes:record", (matterId: string, input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_OUTCOME: an outcome record is needed");
    return matters.recordOutcome(String(matterId), {
      result: String(input.result ?? "") as never,
      subject: String(input.subject ?? ""),
      court: input.court === undefined ? undefined : String(input.court),
      decidedOn: String(input.decidedOn ?? ""),
      sourceId: input.sourceId === undefined || input.sourceId === null ? null : String(input.sourceId),
      summary: input.summary === undefined ? undefined : String(input.summary),
      supersedes: input.supersedes === undefined || input.supersedes === null ? null : String(input.supersedes),
    });
  });
  handle("library:roles", () => library.roles());
  handle("precedents:list", async (matterId: string, limit?: number) => {
    const store = await matters.store(String(matterId));
    const profile = store.profile();
    const details = store.work.details();
    return library.precedents({ court: details.court || profile.court, proceeding: profile.proceeding, practiceArea: profile.practiceArea }, Number(limit) || 3);
  });
  handle("advocate:graph", () => advocateStore.graph());
  handle("advocate:rebuild-graph", async () => advocateStore.rebuildGraph(await matters.allOutcomes(), { actor: "advocate" }));
  handle("advocate:graph-walk", (kind: string, id: string, depth: number) => advocateStore.graphWalk(String(kind) as never, String(id), Number(depth) || 1));
  handle("library:open", async (id: string) => {
    const f = library.fileFor(String(id));
    if (!f) throw new Error(`NOT_FOUND: no library item ${String(id)}`);
    return shell.openPath(f.path);
  });
  handle("library:reveal", (id: string) => {
    const f = library.fileFor(String(id));
    if (f) shell.showItemInFolder(f.path);
  });
  handle("chat:get", (matterId: string) => agent.getChat(matterId));
  handle("models:list", () => agent.listModels());
  handle("models:get", () => agent.currentModel());
  handle("models:set", (key: string) => agent.setModel(String(key ?? "")));
  // Phase 7 (O5): the model per role — drafting, extraction, critic — saved in settings.json.
  // Each key must name a model with credentials; an absent key falls back to the chat's model.
  handle("models:roles", () => roleModels());
  handle("models:setRole", async (role: string, key: string | null) => {
    if (!MODEL_ROLES.includes(role as ModelRole)) throw new Error(`BAD_ROLE: ${MODEL_ROLES.join(", ")}`);
    if (key == null || key === "") {
      writeSetting("roleModels", { ...roleModels(), [role]: null });
      return roleModels();
    }
    const models = await agent.listModels();
    if (!models.some((m) => m.key === key)) throw new Error(`BAD_MODEL: ${key} is not a model with credentials`);
    writeSetting("roleModels", { ...roleModels(), [role]: key });
    return roleModels();
  });
  handle("effort:get", () => agent.getEffort());
  handle("effort:set", (level: string) => agent.setEffort(String(level ?? "")));
  handle("chat:send", (matterId: string, text: string) => {
    // The turn runs in the background; progress arrives as chat events.
    void agent.send(matterId, String(text ?? ""));
  });
}

/** The height of our title bar. The renderer's bar and the window controls use the same value. */
const TITLE_BAR_HEIGHT = 40;

function createWindow(): void {
  // No File, Edit, View, Window bar. macOS keeps the menus that carry its standard shortcuts.
  Menu.setApplicationMenu(
    process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null,
  );
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Open Advocate",
    show: false,
    // One title bar of our own: the renderer draws it, the system draws only the window controls over it.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#ffffff", symbolColor: "#1c1c1c", height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  // The editor frame may move only within its own origin (WD-078).
  window.webContents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame) return;
    if (event.url.startsWith(`${EO_ORIGIN}/`) || event.url === "about:blank") return;
    event.preventDefault();
  });
  window.once("ready-to-show", () => window?.show());
  if (rendererDevUrl) void window.loadURL(rendererDevUrl);
  else void window.loadFile(rendererFile);
  window.on("closed", () => {
    window = null;
  });
}

/** V4-1: which research sources may be reached. Each is on until the advocate turns it off. */
function researchSettings(): ResearchSettings {
  const r = (readSettings().researchSources ?? {}) as Partial<ResearchSettings>;
  return { aws: r.aws !== false, indiaCode: r.indiaCode !== false, web: r.web !== false };
}

const SOURCES: SourceName[] = ["aws_sc", "aws_hc", "indiacode", "web"];
function sourceName(s: unknown): SourceName {
  if (!SOURCES.includes(s as SourceName)) throw new Error(`BAD_SOURCE: one of ${SOURCES.join(", ")}`);
  return s as SourceName;
}

/** V3-4: the appearance the advocate chose. */
function appearance(): "system" | "light" | "dark" {
  const a = readSettings().appearance;
  return a === "light" || a === "dark" ? a : "system";
}

function lockFact(file: string, pick: (j: Record<string, unknown>) => string): string {
  try {
    return pick(JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>);
  } catch {
    return "not installed";
  }
}

/** V3-4: versions and folders, for the Settings page. */
function appInfo() {
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    euroOffice: lockFact(path.join(euroOfficeRoot(), "vendor.lock.json"), (j) => String(j.tag ?? "unknown")),
    validator: lockFact(path.join(resourcesRoot(), "ulos", platformKey(), "vendor.lock.json"), (j) => `copied ${String(j.copiedAt ?? "unknown").slice(0, 10)}`),
    folders: { matters: matters.root, userData: app.getPath("userData") },
    signingKey: signer ? signer.fingerprint() : null,
  };
}

/** Non-secret application settings in the user data folder. */
function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** O5: the model keys by role (drafting, extraction, critic), saved in settings.json. */
const MODEL_ROLES = ["drafting", "extraction", "critic"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

function roleModels(): Record<ModelRole, string | null> {
  const rm = readSettings().roleModels;
  const out = { drafting: null, extraction: null, critic: null } as Record<ModelRole, string | null>;
  if (rm && typeof rm === "object") {
    for (const role of MODEL_ROLES) {
      const key = (rm as Record<string, unknown>)[role];
      if (typeof key === "string" && key.trim()) out[role] = key.trim();
    }
  }
  return out;
}

function roleModelKey(role: ModelRole): string | null {
  return roleModels()[role];
}

function writeSetting(key: string, value: unknown): void {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), [key]: value }, null, 2));
}

let testModelInstalled = false;
function exposeTestHooks(): void {
  // Read-only hooks for the Playwright tests. Present only when OPENADVO_TEST=1.
  if (process.env.OPENADVO_TEST !== "1") return;
  (globalThis as Record<string, unknown>).__openadvoTest = {
    agentToolNames: (matterId: string) => agent.toolNames(matterId),
    // The scripted test model (src/main/test-model.ts): installed on first use, then chosen.
    setModelScript: async (script: unknown) => {
      const tm = await import("./test-model.ts");
      if (!testModelInstalled) {
        tm.installTestModel(await agent.runtimeForTests());
        testModelInstalled = true;
      }
      tm.setModelScript(script as never);
      await agent.setModel(tm.TEST_MODEL_KEY);
    },
    releaseModel: async (name: string) => (await import("./test-model.ts")).releaseModel(name),
    modelSeen: async () => (await import("./test-model.ts")).seen,
    // O10: run one tool of a session through its own code, as the model would (no model in tests).
    callAgentTool: (matterId: string, name: string, params: Record<string, unknown>) => agent.callToolForTest(matterId, name, params),
    agentSessionId: (matterId: string) => agent.sessionId(matterId),
    mattersRoot: () => matters.root,
    ingestIdle: () => ingest.idle(),
    // Stands in for the agent's propose_correction tool, so a test needs no model.
    proposeCorrection: (matterId: string, input: { draftId: string; anchor: string; expected: string; replacement: string; reason: string }) =>
      drafts.proposeCorrection(matterId, input),
    // The same functions the agent's step 6 to 10 tools call, so tests need no model.
    work: () => workHost,
    // The agent's fill_record_cell, so a test needs no model.
    fillRecordCell: (matterId: string, input: { source: string; column: string; answer: string; quote: string; page: number; line: number }) =>
      recordTables.fillByAgent(matterId, input, "", findSource),
    readMemoryAsAgent: (matterId: string) => matters.memory(matterId),
    // The agent's propose_memory_note (V2-8), so a test needs no model.
    proposeMemoryAsAgent: (matterId: string, text: string, reason: string) => matters.proposeMemory(matterId, text, reason),
    // V4: answer the research sources' requests from fixtures (url substring → body), so tests need no network.
    setResearchFixtures: (fixtures: Array<{ match: string; body: string; type?: string; status?: number; base64?: boolean }>) => {
      setFetcher(async (url, init) => {
        const f = fixtures.find((x) => url.includes(x.match));
        if (!f) return new Response("not in the fixtures", { status: 404 });
        const bytes = f.base64 ? Buffer.from(f.body, "base64") : Buffer.from(f.body);
        const range = init?.headers?.range ? /bytes=(\d+)-(\d+)?/.exec(init.headers.range) : null;
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) + 1 : bytes.length;
          return new Response(bytes.subarray(start, end), { status: 206, headers: { "content-range": `bytes ${start}-${end - 1}/${bytes.length}`, "content-type": f.type ?? "application/octet-stream" } });
        }
        return new Response(bytes, { status: f.status ?? 200, headers: { "content-type": f.type ?? "text/plain" } });
      });
      return true;
    },
    // V4-3: the loop with a scripted model (labels to answers), so tests need no model.
    // O5 (K2): an optional second script runs the critic and opposing-counsel passes on a
    // distinct critic model, so the end-to-end path exercises the role's model too.
    runStudioScripted: async (matterId: string, issueId: string, script: Array<{ match: string; answer: string }>, criticScript?: Array<{ match: string; answer: string }>, draftingScript?: Array<{ match: string; answer: string }>) => {
      const answer = (model: string, rows: Array<{ match: string; answer: string }>) => ({
        model,
        complete: async (_s: string, user: string) => rows.find((x) => user.includes(x.match))?.answer ?? "{}",
      });
      const fake = new ArgumentStudio(
        matters,
        async () => answer("test/scripted", script),
        (id) => window?.webContents.send("studio:changed", id),
        criticScript || draftingScript
          ? async (role) => {
              if (role === "critic" && criticScript) return answer("test/critic", criticScript);
              if (role === "drafting" && draftingScript) return answer("test/drafting", draftingScript);
              return null;
            }
          : null,
      );
      await fake.start(matterId, issueId, { rounds: 1, generators: 2 });
      await fake.idle(matterId);
      return (await matters.store(matterId)).studio.runs().at(-1);
    },
    studioTool: (matterId: string, tool: string, params: Record<string, unknown>) => studioTools(hub, studio, matters)(matterId, tool, params, ""),
    checkReminders: () => notifyReminders(),
    recordUsageForTest: async (matterId: string, totalTokens: number) => (await matters.store(matterId)).appendEvent({ actor: "agent" }, "agent.usage", null, { model: "test", input: totalTokens, output: 0, totalTokens, cost: 0.01 }),
    // V5-11: the rehearsal with a scripted model. O5 (K2): the bench questions run on the
    // drafting model and the objections on the critic model when the scripts are given.
    rehearseScripted: async (matterId: string, script: Array<{ match: string; answer: string }>, criticScript?: Array<{ match: string; answer: string }>, draftingScript?: Array<{ match: string; answer: string }>) => {
      const answer = (model: string, rows: Array<{ match: string; answer: string }>) => ({
        model,
        complete: async (_s: string, user: string, _id?: string, onUsage?: (u: { input: number; output: number; totalTokens: number; cost: number }) => void) => {
          onUsage?.({ input: 60, output: 40, totalTokens: 100, cost: 0 });
          return rows.find((x) => user.includes(x.match))?.answer ?? "{}";
        },
      });
      const fake = new ArgumentStudio(
        matters,
        async () => answer("test/scripted", script),
        undefined,
        criticScript || draftingScript
          ? async (role) => {
              if (role === "critic" && criticScript) return answer("test/critic", criticScript);
              if (role === "drafting" && draftingScript) return answer("test/drafting", draftingScript);
              return null;
            }
          : null,
      );
      return fake.rehearse(matterId);
    },
    importEml: async (matterId: string, paths: string[]) => {
      const out = await mail.importEmlFiles(matterId, paths);
      ingest.enqueue(matterId);
      return out;
    },
    portalContentsUrl: () => (portal.isOpen() ? "open" : "closed"),
    portalEval: (code: string) => portal.evaluateForTest(code),
    // Phase 3 (S10): the browser's state and visible text, for the tests.
    browserState: () => browser.state(),
    browserRead: (tabId?: string) => browser.read(tabId),
    browserBookmarks: () => browser.listBookmarks(),
  };
}

// Decision 21: the Pi extensions. Bundled ones are the packages in extensions/ (the placeholder); added ones live in the app's Pi folder.
/**
 * Decision 22: Pi's agent folder is the application's own folder, so every Pi extension keeps its
 * settings and logs there, never in the owner's ~/.pi/agent. Model credentials and models are
 * still read from the owner's Pi folder (decision 16), captured here before the switch.
 */
let ownerPiHome: string | null = null;
function claimPiAgentDir(): void {
  if (ownerPiHome) return;
  ownerPiHome = getAgentDir();
  process.env.PI_CODING_AGENT_DIR = piAgentDir();
}
function piAgentDir(): string {
  return path.join(app.getPath("userData"), "pi-agent");
}
/** The tool policy file and its review log (native-harness-parts section 2), written with defaults on first start. */
function toolPolicy(): PolicyStore {
  const store = new PolicyStore(path.join(app.getPath("userData"), "tool-policy.json"), path.join(app.getPath("userData"), "logs", "tool-policy.jsonl"));
  store.ensure();
  return store;
}

/** The agent's tools, for Settings → Tool permissions: the matter tools, the firm tools, the plan, helpers and MCP. */
function policyTools(): Array<{ name: string; label: string }> {
  const base = [...AGENT_TOOLS, ...FIRM_TOOLS, ...PLAN_TOOLS, "start_helper", "helper_output", "stop_helper", "steer_helper", "mcp__*"];
  const mcpServers = (() => {
    try {
      const cfg = JSON.parse(readFileSync(path.join(piAgentDir(), "mcp.json"), "utf8")) as { mcpServers?: Record<string, unknown> };
      return Object.keys(cfg.mcpServers ?? {});
    } catch {
      return [];
    }
  })();
  const mcpRows = mcpServers.map((s) => `mcp__${s}__*`);
  const names = [...new Set<string>([...base, ...mcpRows, ...Object.keys(agent.policyStore().read().tools).filter((n) => n.startsWith("mcp__"))])].sort();
  return names.map((name) => ({
    name,
    label: name.startsWith("mcp__") ? `MCP: ${name === "mcp__*" ? "every server, every tool" : name.replace(/^mcp__/, "").replace(/__\*$/, "") + " (every tool)"}` : name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
  }));
}

/** O10: the Firm Agent's folder in user data: its Pi session, messages, handoffs, trace and usage. */
function firmAgentDir(): string {
  return path.join(app.getPath("userData"), "firm-agent");
}
let piExtensionsManager: PiExtensions | null = null;
function piExtensions(): PiExtensions {
  if (!piExtensionsManager) {
    piExtensionsManager = new PiExtensions({
      agentDir: piAgentDir(),
      bundledRoot: path.join(app.getAppPath(), "extensions"),
      loadDisabled: () => {
        const v = readSettings().disabledExtensions;
        return Array.isArray(v) ? v.map(String) : [];
      },
      saveDisabled: (ids) => writeSetting("disabledExtensions", ids),
    });
  }
  return piExtensionsManager;
}

function resourcesRoot(): string {
  return process.env.OPENADVO_RESOURCES ? path.resolve(process.env.OPENADVO_RESOURCES) : path.join(app.getAppPath(), "resources");
}

function euroOfficeRoot(): string {
  if (process.env.OPENADVO_EO_ROOT) return path.resolve(process.env.OPENADVO_EO_ROOT);
  return path.join(app.getAppPath(), "resources", "euro-office", platformKey());
}

// V5-25: a crash writes a local dump in the user data folder; nothing is uploaded. Recent log lines are kept for a diagnostics file.
crashReporter.start({ uploadToServer: false });
captureLogs();

/** V5-20: notify due reminders while the application runs. */
async function notifyReminders(): Promise<number> {
  if (!matters) return 0;
  const due = await dueReminders(matters);
  for (const r of due) {
    if (Notification.isSupported() && process.env.OPENADVO_TEST !== "1") new Notification({ title: `Reminder: ${r.title}`, body: r.text }).show();
    window?.webContents.send("reminders:due", r);
  }
  return due.length;
}

app.whenReady().then(() => {
  claimPiAgentDir();
  setInterval(() => void notifyReminders().catch((e) => console.error(`reminders: ${(e as Error).message}`)), 60_000);
  editorHost = new EditorHost({
    eoRoot: euroOfficeRoot(),
    hostDir: path.join(app.getAppPath(), "src", "editor-host"),
    fontDataDir: path.join(app.getPath("userData"), "euro-office-fonts"),
    logFile: path.join(app.getPath("userData"), "logs", "editor-host.log"),
  });
  editorHost.register();
  matters = new Matters(mattersRoot());
  const workingRoot = path.join(app.getPath("userData"), "draft-work");
  mkdirSync(workingRoot, { recursive: true });
  ulos = ulosPaths(resourcesRoot());
  research = new Research(matters, ulos);
  drafts = new Drafts(matters, {
    x2t: euroOfficePaths(euroOfficeRoot()).x2t,
    workingRoot,
    openInEditor: (file, name, kind, readOnly, meta) => editorHost.open(file, name, kind, readOnly, meta),
    legalBlockers: (id, draftId, revisionId) => research.legalBlockers(id, draftId, revisionId),
    // Phase 6: the advocate's profile for the signature blocks and the vakalatnama.
    profile: () => {
      const fields = advocateStore.profile().fields;
      return {
        name: fields["name"] ?? "",
        role: fields["role"] ?? "",
        barCouncil: fields["bar_council"] ?? "",
        address: fields["chamber_address"] ?? "",
      };
    },
    // Phase 6 (A7): the approved preferences, with the reason each one applies.
    approvedPreferences: () => {
      const out: Record<string, { value: string; reason: string | null }> = {};
      for (const p of advocateStore.preferences()) if (p.status === "approved") out[p.key] = { value: p.value, reason: p.reason };
      return out;
    },
    // Phase 6 (A7): the same correction twice proposes a preference, and a lesson is proposed with it (F2).
    onCorrectionRepeated: async (input) => {
      try {
        advocateStore.proposePreference({ key: input.key, value: input.value, reason: input.reason }, { actor: "agent" });
        advocateStore.proposeMemory(
          { type: "lesson", subject: "a correction the advocate made twice", relation: "led to", object: `${input.key}: ${input.value}`, confidence: 0.9 },
          { actor: "agent" },
        );
      } catch {
        // a refused proposal is recorded in the store's own refusal table; the undo still stands
      }
    },
    // Phase 6 (F2): a citation inserted in more than one matter proposes an advocate memory record.
    onCitationInserted: async (input) => {
      let mattersWithIt = 0;
      for (const summary of await matters.list()) {
        try {
          const store = await matters.store(summary.id);
          const inserted = store.eventsWithAction("citation.inserted").some((e) => (e.data as { citation?: string } | null)?.citation === input.citation);
          if (inserted) mattersWithIt += 1;
        } catch {
          // a matter that cannot be opened is not counted
        }
      }
      if (mattersWithIt >= 2) {
        try {
          advocateStore.proposeMemory(
            { type: "court_practice", subject: input.citation, relation: "frequently cited", object: `cited in ${mattersWithIt} matters`, confidence: mattersWithIt },
            { actor: "agent" },
          );
        } catch {
          // a refused proposal is recorded in the store's own refusal table
        }
      }
    },
    // Phase 6 (P4): the law library's rows for a statutory reference.
    statuteLookup: (act, section) => hub.statuteRows(act, section),
    // Phase 6 (P1): the highest indexed paragraph of each saved authority's judgment.
    authorityParagraphs: (matterId) => hub.authorityParagraphs(matterId),
    // Phase 6 (A7): the questions a task asks once.
    preferenceQuestions: (keys) => {
      const approved: Record<string, unknown> = {};
      for (const p of advocateStore.preferences()) if (p.status === "approved") approved[p.key] = p.value;
      return preferenceQuestions(keys, approved);
    },
  });
  signer = KeyFileSigner.create(path.join(app.getPath("userData"), "manifest-signing.key"));
  filing = new Filing(matters, euroOfficePaths(euroOfficeRoot()).x2t, signer);
  progress = new Progress(matters, filing, research, drafts);
  mail = new Mail(matters);
  portal = new Portal(
    matters,
    portalOptionsFromEnv((matterId, detail) => {
      ingest.enqueue(matterId);
      matterChanged(matterId);
      emitChat({ matterId, event: { type: "CUSTOM", name: "openadvo.chat_message", value: { id: randomUUID(), role: "notice", text: `Captured from the court portal: ${detail.name} (${detail.outcome}).` }, timestamp: Date.now() } as never });
    }),
  );
  // V5-23: the firm's contacts, in the user data folder.
  contacts = new Contacts(path.join(app.getPath("userData"), "contacts.json"));
  // V5-8: the second OCR engine, when its models are vendored (npm run vendor:ocr).
  setPpocrDir(ppocrDir(resourcesRoot()));
  advocateStore = AdvocateStore.open(app.getPath("userData"));
  intelStore = IntelStore.open(app.getPath("userData"));
  workHost = agentWorkHost({ matters, research, drafts, portal, ulos, advocate: advocateStore });
  // V4: the Research and Argument Studio.
  hub = new ResearchHub(matters, path.join(app.getPath("userData"), "corpus"), researchSettings, (text) => window?.webContents.send("studio:progress", text));
  studio = new ArgumentStudio(matters, () => agent.completer(), (id) => window?.webContents.send("studio:changed", id), (role) => agent.completerFor(roleModelKey(role)));
  // Phase 6 (P3): the shared verification record of public law and the indexed judgment
  // paragraphs, reached through the one corpus owner.
  research.sharedCheck = (input) => {
    try {
      hub.law.recordSharedCitationCheck(input);
    } catch {
      // the record is a log; a refused row is not a failed check
    }
  };
  research.sharedChecksOf = (citation) => {
    try {
      return hub.law.sharedChecks(citation);
    } catch {
      return [];
    }
  };
  research.authorityParagraph = (citation) => {
    try {
      const id = hub.law.byCitation(citation)[0] ?? null;
      const judgment = id ? hub.law.judgment(id) : null;
      return judgment ? judgment.paragraphs : null;
    } catch {
      return null;
    }
  };
  recordTables = new RecordTables(matters);
  library = new Library(advocateStore, path.join(app.getPath("userData"), "library"));
  proposals = new MatterProposals(path.join(app.getPath("userData"), "matter-proposals.json"));
  courtIntel = new CourtIntel({
    intel: intelStore,
    advocate: advocateStore,
    store: (id) => matters.store(id),
    filingFiles: (id) => filing.files(id),
    dirs: { builtIn: path.join(app.getAppPath(), "adapters"), vendored: path.join(resourcesRoot(), "adapters"), advocate: path.join(app.getPath("userData"), "adapters") },
    docsDir: path.join(app.getPath("userData"), "intel", "docs"),
  });
  filing.courtRules = (id) => courtIntel.compliance(id);
  // Phase 8 (Q3): the practice packs are read from `packs/`. The matter's pack is chosen from its
  // proceeding, its practice area, its court, or the default pack. The filing set, limitation and
  // workflow come from the pack; the core holds no SLP constant.
  practicePacks = new PracticePacks(path.join(app.getAppPath(), "packs"));
  const practiceChoice = async (id: string, target?: { court: string; caseType: string } | null) => {
    const store = await matters.store(id);
    const profile = store.profile();
    const details = store.work.details();
    return practicePacks.choiceFor({ ...profile, court: target?.court ?? profile.court, caseType: target?.caseType ?? profile.caseType }, details.court, courtIntel.profile().practice);
  };
  // Phase 6 (L1, P5) and phase 8: the target's proceeding pack drives the required documents, and
  // the pack lists' freshness is the rule-currency row. A court target wins; with none, the
  // matter's practice pack supplies the plan.
  const targetPack = async (id: string): Promise<FilingPack | null> => {
    const store = await matters.store(id);
    const target = store.filingTarget();
    if (target) {
      const adapter = courtIntel.adapterFor(target.court);
      const proceeding = (adapter?.proceedings ?? []).find((p) => p.caseType === target.caseType) ?? null;
      if (adapter && proceeding && proceeding.requiredParts.length > 0) {
        return {
          requiredParts: proceeding.requiredParts,
          caseType: proceeding.caseType,
          limitation: proceeding.limitation ?? null,
          packId: adapter.id,
          packTitle: adapter.title,
          proceeding: proceeding.key,
          proceedingTitle: proceeding.title,
          source: "court-target",
          workflow: [],
        };
      }
    }
    const choice = await practiceChoice(id, target);
    const plan = choice ? filingPlan(choice) : null;
    if (!plan) return null;
    return {
      requiredParts: plan.documents.map((d) => d.title),
      caseType: plan.caseType,
      limitation: plan.limitation,
      packId: plan.packId,
      packTitle: plan.packTitle,
      proceeding: plan.proceedingKey,
      proceedingTitle: plan.proceedingTitle,
      source: plan.source,
      documents: plan.documents as FilingPack["documents"],
      annexureParts: plan.annexureParts,
      unmappedParts: plan.unmappedParts,
      lateDocuments: choice?.proceeding?.lateDocuments as FilingPack["lateDocuments"],
      workflow: plan.workflow,
    };
  };
  filing.proceedingPack = (id) => targetPack(id);
  filing.packFreshness = async (id) => {
    const store = await matters.store(id);
    const target = store.filingTarget();
    if (!target) return [];
    const adapter = courtIntel.adapterFor(target.court);
    if (!adapter) return [];
    return listsForCaseType(adapter, target.caseType)
      .filter((l) => l.kind === "checklist")
      .map((l) => {
        const list = courtIntel.readList(adapter.id, l.key);
        return { list: list?.title ?? l.title, state: (list?.freshness?.state ?? "fresh") as "fresh" | "stale", since: list?.freshness?.since ?? "" };
      });
  };
  skillRegistry = new SkillRegistry({ builtIn: path.join(app.getAppPath(), "skills"), advocate: path.join(app.getPath("userData"), "skills") }, AGENT_TOOLS);
  agent = new Agent(
    {
      listSources: (id) => matters.listSources(id),
      listPages: (id, sourceId, from, to) => matters.listPages(id, sourceId, from, to),
      searchLines: (id, query, limit) => matters.searchLines(id, query, limit),
      notebook: (id) => matters.notebook(id),
      drafts: (id, kind) => drafts.readDrafts(id, kind),
      paragraphSource: (id, anchor) => drafts.paragraphSourceAnywhere(id, anchor),
      checkDraft: (id, draftId) => drafts.check(id, draftId),
      proposeCorrection: (id, input, sessionId) => drafts.proposeCorrection(id, input, sessionId),
      work: workHost,
      // O10: the Firm Agent (FIRM_AGENT_ID) has its own folder and no matter store.
      matterTitle: (id) => (id === FIRM_AGENT_ID ? Promise.resolve("Firm") : matters.title(id)),
      recordSession: (id, sessionId, model) => (id === FIRM_AGENT_ID ? Promise.resolve() : matters.recordAgentSession(id, sessionId, model)),
      emit: emitChat,
      loadModelKey: () => {
        const v = readSettings().model;
        return typeof v === "string" && v ? v : null;
      },
      saveModelKey: (key) => writeSetting("model", key),
      loadEffort: () => {
        const v = readSettings().effort;
        return typeof v === "string" && v ? v : null;
      },
      saveEffort: (level) => writeSetting("effort", level),
      planStrength: () => (readSettings().planStrength === "most" ? "most" : "long"),
      chatDir: async (id) => {
        if (id !== FIRM_AGENT_ID) return matters.chatDir(id);
        const dir = firmAgentDir();
        await mkdir(dir, { recursive: true });
        return dir;
      },
      readMemory: (id) => matters.memory(id),
      // Phase 6 (A7): the approved preferences with their reasons, for a skill's context package.
      listApprovedPreferences: () => advocateStore.preferences().filter((p) => p.status === "approved").map((p) => ({ key: p.key, value: p.value, reason: p.reason })),
      // Phase 7 (O5): a skill's role maps to a model role — drafting (drafting), intake and
      // evidence (extraction), review and strategy (critic) — and the role's model runs it.
      roleModel: (role) => {
        const mapped: Record<string, ModelRole> = { drafting: "drafting", intake: "extraction", evidence: "extraction", review: "critic", strategy: "critic" };
        const modelRole = mapped[role];
        return modelRole ? roleModelKey(modelRole) : null;
      },
      proposeMemory: async (id, text, reason, sessionId) => (await matters.proposeMemory(id, text, reason, sessionId)).id,
      recordTable: (id) => recordTables.describe(id),
      fillRecordCell: (id, input, sessionId) => recordTables.fillByAgent(id, input, sessionId, findSource),
      studio: (id, tool, params, sessionId) => studioTools(hub, studio, matters)(id, tool, params, sessionId),
      policy: async (id) => {
        if (id === FIRM_AGENT_ID) return { budgetTokens: null, usedTokens: 0 };
        const store = await matters.store(id);
        const p = store.policy();
        return { ...p, usedTokens: store.usage().tokens };
      },
      // The party rule: a web query or URL that names a party of the open matter asks first.
      parties: async (id) => {
        if (id === FIRM_AGENT_ID) return [];
        const all = contacts.list();
        return (await matters.store(id))
          .parties()
          .flatMap((p) => [p.nameInRecord, all.find((c) => c.id === p.contactId)?.name ?? ""])
          .filter((s) => s.trim().length > 0);
      },
      partyRule: () => readSettings().partyRule !== false,
      recordUsage: async (id, usage, sessionId) => {
        // O10: the Firm Agent's usage is kept in its own folder; no matter pays for it.
        if (id === FIRM_AGENT_ID) {
          await appendFile(path.join(firmAgentDir(), "usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), sessionId, ...usage }) + "\n");
          return;
        }
        await (await matters.store(id)).appendEvent({ actor: "agent", sessionId }, "agent.usage", null, usage);
      },
      harness: {
        registry: (fresh) => skillRegistry.get(fresh === true),
        store: (id) => matters.store(id),
        ensureFind: (id) => ensureFindIndex(matters, id),
        rules: (id) => courtIntel.rulesContext(id),
        forumRefusal: (id, courts) => courtIntel.forumRefusal(id, courts),
        packRefusal: async (id, packs) => skillPackRefusal(packs, await practiceChoice(id)),
        // Phase 10 (M2): the approved precedents of the Knowledge Library, best first.
        precedents: async (id) => {
          const store = await matters.store(id);
          const profile = store.profile();
          const details = store.work.details();
          return library.precedents({ court: details.court || profile.court, proceeding: profile.proceeding, practiceArea: profile.practiceArea });
        },
      },
      browser: {
        open: async ({ url, visible }) => {
          const id = browser.open(url, { agent: true, activate: visible === true });
          await browser.wait(id, { timeoutMs: 15_000 }).catch(() => undefined);
          const tab = browser.state().tabs.find((t) => t.id === id);
          return `Opened ${tab?.url ?? url} in tab ${id}${visible ? " (visible to the advocate)" : " (hidden agent page)"}.`;
        },
        tabs: async () => {
          const s = browser.state();
          return s.tabs.length === 0
            ? "No browser tab is open."
            : s.tabs.map((t) => `- ${t.id}${t.id === s.activeTabId ? " (active)" : ""}${t.agent ? " (agent)" : ""}: ${t.title || "New tab"} — ${t.url}${t.loading ? " (loading)" : ""}${t.error ? ` (error: ${t.error})` : ""}`).join("\n");
        },
        navigate: async ({ tabId, url }) => {
          const id = tabId ?? browser.state().activeTabId;
          if (!id) throw new MatterStoreError("BROWSER_TAB_MISSING", "open a browser tab first");
          await browser.navigate(id, url);
          return `Now at ${browser.state().tabs.find((t) => t.id === id)?.url ?? url}.`;
        },
        snapshot: (tabId) => browser.snapshot(tabId),
        read: (tabId, selector) => browser.read(tabId, selector),
        click: (tabId, input) => browser.click(tabId, input),
        fill: (tabId, input) => browser.fill(tabId, input),
        screenshot: (tabId, matterId, fullPage) => browser.screenshot(tabId, matterId, fullPage),
        wait: (tabId, input) => browser.wait(tabId, input),
        downloadToMatter: (tabId, matterId, url) => browser.downloadToMatter(tabId, matterId, url),
        handToAdvocate: async (tabId) => browser.handToAdvocate(tabId),
        close: async (tabId) => {
          browser.close(tabId);
          return `Closed ${tabId}.`;
        },
      },
      proposeMatter: async (matterId, input) => {
        const sourceMatterTitle = await matters.title(matterId);
        const p = proposals.add({ ...input, sourceMatterId: matterId, sourceMatterTitle });
        emitChat({
          matterId,
          event: {
            type: "CUSTOM",
            name: "openadvo.chat_message",
            value: { id: randomUUID(), role: "notice", text: `A matter is proposed: ${p.title}. Open Home to create it or dismiss it.` },
            timestamp: Date.now(),
          } as never,
        });
        return `Proposed the matter "${p.title}" (${p.id}). The advocate decides on Home; you cannot create it.`;
      },
      evidence: async (matterId, tool, params, sessionId) => {
        const store = await matters.store(matterId);
        const sourceOf = (v: unknown) => {
          const q = String(v ?? "").trim();
          return store.listSources().find((s) => s.id === q || s.name === q) ?? null;
        };
        if (tool === "list_facts") {
          const facts = store.evidence.facts({ status: params.status ? String(params.status) : undefined, type: params.type ? String(params.type) : undefined, q: params.q ? String(params.q) : undefined });
          return facts.length
            ? facts.map((f) => `- ${f.id} [${f.status}/${f.type}] ${f.date || "no date"}${f.amount ? ` ₹${f.amount}` : ""}: ${f.text}${f.sourceName ? ` (${f.sourceName}, p. ${f.page}, l. ${f.line})` : ""}`).join("\n")
            : "No fact is recorded yet.";
        }
        if (tool === "propose_fact") {
          const source = sourceOf(params.source);
          const f = store.evidence.addFact({ text: String(params.text ?? ""), type: String(params.type ?? "fact"), sourceId: source?.id ?? null, anchorId: source ? (store.sourceLines(source.id).find((l) => l.page === Number(params.page) && l.line === Number(params.line))?.id ?? null) : null, page: params.page == null ? null : Number(params.page), line: params.line == null ? null : Number(params.line), date: String(params.date ?? ""), amount: String(params.amount ?? ""), parties: Array.isArray(params.parties) ? params.parties.map(String) : [], relief: String(params.relief ?? ""), method: "agent" }, { actor: "agent", sessionId });
          return `Recorded candidate fact ${f.id}. The advocate decides.`;
        }
        if (tool === "list_evidence") {
          const rows = store.evidence.evidenceList({ q: params.q ? String(params.q) : undefined });
          return rows.length ? rows.map((e) => `- ${e.id} ${e.exhibitNumber || "(no exhibit)"} [${e.authenticity}/${e.status}] ${e.sourceName}: ${e.statement || e.notes || "no statement"}${e.witness ? `; witness ${e.witness}` : ""}`).join("\n") : "No evidence is recorded yet.";
        }
        if (tool === "propose_evidence") {
          const source = sourceOf(params.source);
          if (!source) throw new MatterStoreError("SOURCE_NOT_FOUND", String(params.source ?? ""));
          const e = store.evidence.addEvidence({ sourceId: source.id, exhibitNumber: String(params.exhibit_number ?? ""), witness: String(params.witness ?? ""), statement: String(params.statement ?? ""), givenBy: String(params.given_by ?? ""), givenAt: String(params.given_at ?? ""), electronic: params.electronic === true, device: String(params.device ?? "") }, { actor: "agent", sessionId });
          return `Recorded candidate evidence ${e.id}. The advocate decides authenticity and admissibility.`;
        }
        if (tool === "list_matter_memory") {
          const rows = store.evidence.memory({ status: params.status ? String(params.status) : undefined, type: params.type ? String(params.type) : undefined, q: params.q ? String(params.q) : undefined });
          return rows.length ? rows.map((m) => `- ${m.memoryId} [${m.status}/${m.type}] ${m.subject} ${m.relation} ${m.object}${m.supersedes ? " (supersedes an earlier record)" : ""}`).join("\n") : "No typed matter memory yet.";
        }
        if (tool === "propose_matter_memory") {
          const source = sourceOf(params.source);
          const m = store.evidence.proposeMemory({ type: String(params.type ?? "fact_from_document"), subject: String(params.subject ?? ""), relation: String(params.relation ?? "is"), object: String(params.object ?? ""), sourceId: source?.id ?? null, validFrom: params.valid_from ? String(params.valid_from) : null, validUntil: params.valid_until ? String(params.valid_until) : null, confidence: params.confidence == null ? null : Number(params.confidence), supersedes: params.supersedes ? String(params.supersedes) : null }, { actor: "agent", sessionId });
          return `Proposed matter memory ${m.memoryId}. The advocate decides.`;
        }
        if (tool === "get_jurisdiction") {
          const r = store.evidence.jurisdiction();
          return r ? JSON.stringify(r, null, 2) : "No jurisdiction report yet. It is built after the record is read.";
        }
        if (tool === "get_timeline") {
          const nb = await matters.notebook(matterId);
          const rows = buildTimeline(nb.events, store.evidence.facts());
          return rows.length ? rows.map((e) => `- ${e.date || "no date"} [${e.kind}] ${e.text}${e.sourceName ? ` (${e.sourceName}, p. ${e.page}, l. ${e.line})` : ""}`).join("\n") : "No timeline entry yet.";
        }
        if (tool === "list_document_parts") {
          const rows = store.evidence.parts(params.source_id ? String(params.source_id) : undefined);
          return rows.length ? rows.map((p) => `- ${p.sourceName}, p. ${p.page}, l. ${p.line} [${p.kind}] ${p.text}`).join("\n") : "No document structure is read yet.";
        }
        if (tool === "get_contradictions") {
          const nb = await matters.notebook(matterId);
          const rows = detectContradictions(store.evidence.facts(), nb.events.map((e) => ({ id: e.id, dateStart: e.dateStart, description: e.description, sourceId: e.sourceId, page: e.page, line: e.line })));
          return rows.length ? rows.map((c) => `- ${c.kind}: ${c.values.map((v) => `${v.value} (${v.text.slice(0, 120)})`).join(" / ")}`).join("\n") : "No contradiction is found.";
        }
        throw new MatterStoreError("UNKNOWN_TOOL", tool);
      },
      firm: {
        matters: () => docket(matters, progress),
        openItems: async (id) => (await progress.inbox(id)).map((i) => ({ kind: i.kind, title: i.title, blocks: i.blocks, tab: i.tab })),
        hearings: async (id) => (await matters.store(id)).hearings().map((h) => ({ date: h.date, bench: h.bench, nextDate: h.nextDate, nextDateStatus: h.nextDateStatus })),
        workflows: async () => allWorkflows(customWorkflows()),
        advocateMemory: async () => ({ memory: advocateStore.memory(), preferences: advocateStore.preferences() }),
      },
    },
    { agentDir: piAgentDir(), piHome: ownerPiHome ?? getAgentDir(), model: process.env.OPENADVO_MODEL || undefined, extensions: piExtensions(), policy: toolPolicy() },
  );
  ingest = new Ingest(matters, (matterId) => window?.webContents.send("ingest:update", matterId), (matterId) => analyzeMatter(matters, matterId, courtIntel));
  browser = new Browser({
    window: () => window,
    userData: app.getPath("userData"),
    matters,
    onCapture: (capture: BrowserCapture) => {
      ingest.enqueue(capture.matterId);
      matterChanged(capture.matterId);
      emitChat({
        matterId: capture.matterId,
        event: {
          type: "CUSTOM",
          name: "openadvo.chat_message",
          value: { id: randomUUID(), role: "notice", text: `Downloaded in the browser: ${capture.name} (${capture.outcome}).` },
          timestamp: Date.now(),
        } as never,
      });
    },
    onState: (state) => window?.webContents.send(BROWSER_STATE_EVENT, state),
    onShortcut: (shortcut) => window?.webContents.send("browser:shortcut", shortcut),
  });
  registerBridge();
  registerIntelBridge(handle, { intel: courtIntel, matters });
  registerHarnessBridge(handle, { matters, agent, progress, skills: skillRegistry, packs: practicePacks, advocate: advocateStore, intel: intelStore, corpus: () => hub?.corpus ?? null });
  exposeTestHooks();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  void agent?.disposeAll();
  matters?.closeAll();
  advocateStore?.close();
  intelStore?.close();
});
