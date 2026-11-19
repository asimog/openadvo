/**
 * Electron main process: the window, the bridge handlers, the matter store and the agent.
 */
import { Menu, Notification, app, BrowserWindow, crashReporter, dialog, ipcMain, safeStorage, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { existsSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Matters } from "./matters.ts";
import { registerBridge } from "./bridge.ts";
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
import { renderPagePng } from "../lib/document-intelligence/index.ts";
import { setFetcher } from "../lib/research-sources/http.ts";
import type { ResearchSettings } from "../shared/studio.ts";
import { Portal, portalOptionsFromEnv } from "./portal.ts";
import { Mail, type MailAccount } from "./mail.ts";
import { agentWorkHost } from "./agent-work.ts";
import { importCaseDocuments } from "./case-import.ts";
import { SkillRegistry } from "./skills.ts";
import { registerHarnessBridge } from "./harness-bridge.ts";
import { registerIntelBridge } from "./intel-bridge.ts";
import { CourtIntel } from "./court-intel.ts";
import { Integrations } from "./integrations.ts";
import { SkillImport } from "./skill-import.ts";
import { PracticePacks } from "./packs.ts";
import { filingPlan, skillPackRefusal } from "../lib/packs/index.ts";
import { detectStorageFolders, insideRoot, storageReady, type StorageProvider } from "../lib/storage/index.ts";
import { testAgent } from "../lib/builders/index.ts";
import { HUMAN_ONLY_PATTERN, NEVER_IN_A_SKILL } from "../lib/skills/roles.ts";
import { CATALOGUE } from "../lib/drafting/documents.ts";
import { responseProposal } from "../lib/triggers/index.ts";
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
let integrations: Integrations;
let skillImporter: SkillImport;
/** C2: the matters the agent proposed in the chat. */
let proposals: MatterProposals;

/** Steps 6 to 10 notify the window that a matter changed (a capture, a proposal). */
export function matterChanged(matterId: string): void {
  window?.webContents.send("ingest:update", matterId);
}

/** S9: a local event reaches the trigger table. It writes fires only; it starts nothing. */
export function fireTrigger(matterId: string, event: import("../shared/triggers.ts").TriggerEvent, subject: string): void {
  try {
    advocateStore.fireTriggers({ matterId, event, subject }, { actor: "agent" });
  } catch (e) {
    console.error(`trigger ${event}: ${(e as Error).message}`);
  }
}

/** The IMAP account: host, port and user in settings; the password encrypted with safeStorage (decision 9). */
export function mailSecretFile(): string {
  return path.join(app.getPath("userData"), "mail-secret.bin");
}

/** A2: the enrolment number, encrypted with the operating system's secret store. */
export function enrolmentFile(): string {
  return path.join(app.getPath("userData"), "enrolment.bin");
}

export function enrolmentState(): { stored: boolean; last4: string | null } {
  try {
    if (!existsSync(enrolmentFile()) || !safeStorage.isEncryptionAvailable()) return { stored: false, last4: null };
    const number = safeStorage.decryptString(readFileSync(enrolmentFile()));
    return { stored: true, last4: number.replace(/\s+/g, "").slice(-4) || null };
  } catch {
    return { stored: false, last4: null };
  }
}

/** C2 and A9: one matter from the fields the advocate confirmed, with its parties and next date. */
export async function createMatterFromFields(input: { title: string; cnr?: string; court?: string; petitioner?: string; respondent?: string; stage?: string; nextDate?: string; sourceUrl?: string }): Promise<Awaited<ReturnType<Matters["create"]>>> {
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

export function customWorkflows() {
  try {
    return parseCustom(JSON.parse(readFileSync(workflowsFile(), "utf8")));
  } catch {
    return [];
  }
}

export function saveWorkflows(list: ReturnType<typeof customWorkflows>) {
  mkdirSync(path.dirname(workflowsFile()), { recursive: true });
  writeFileSync(workflowsFile(), JSON.stringify(list, null, 2));
  return allWorkflows(list);
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
  // The app has no native menu bar, so the right-click menu is the only edit menu. It also
  // offers the selection to the chat composer as context.
  window.webContents.on("context-menu", (_event, params) => {
    const selection = params.selectionText.trim();
    const items: MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" });
    } else if (selection) {
      items.push({ role: "copy" }, { type: "separator" }, { role: "selectAll" });
    }
    if (selection) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Add to context", click: () => window?.webContents.send("context:add", params.selectionText) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: window ?? undefined });
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
export function appearance(): "system" | "light" | "dark" {
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
export function appInfo() {
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

export function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** O5: the model keys by role (drafting, extraction, critic), saved in settings.json. */
export const MODEL_ROLES = ["drafting", "extraction", "critic"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export function roleModels(): Record<ModelRole, string | null> {
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

export function writeSetting(key: string, value: unknown): void {
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
export function policyTools(): Array<{ name: string; label: string }> {
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

export function resourcesRoot(): string {
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
    if (advocateStore) fireTrigger(r.matterId, "deadline_approaching", r.text);
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
  hub = new ResearchHub(matters, path.join(app.getPath("userData"), "corpus"), researchSettings, (text) => window?.webContents.send("studio:progress", text), advocateStore);
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
  integrations = new Integrations(advocateStore, path.join(app.getPath("userData"), "integrations"));
  integrations.sync();
  skillImporter = new SkillImport(path.join(app.getPath("userData"), "skills"), AGENT_TOOLS);
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
      importCaseDocuments: async (id, input) => {
        if (!ingest) throw new Error("INGEST_NOT_READY: the reader is not open yet");
        return importCaseDocuments({ matters, ingest, hub }, id, input);
      },
      rebuildNotebook: (id) => matters.rebuildNotebook(id),
      reviewItems: async (id) => (await matters.store(id)).listReviewItems(),
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
        // Phase 11 (N5): the workflows the advocate built.
        workflow: (id) => advocateStore.workflow(id),
        workflows: () => advocateStore.workflows(),
        agentProfile: (id) => advocateStore.agent(id),
        agents: () => advocateStore.agents(),
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
        if (tool === "list_foreign_elements") {
          const rows = store.foreignElements();
          const routes = store.foreignRoutes();
          return rows.length
            ? `${rows.map((f) => `- ${f.id} [${f.status}/${f.kind}] ${f.subject}${f.country ? ` (${f.country})` : ""}${f.detail ? `: ${f.detail}` : ""}`).join("\n")}\nRoutes:\n${routes.map((r) => `- [${r.status}] ${r.route} (${r.basis}; ${r.source})`).join("\n") || "No route is open."}`
            : "No foreign element is recorded.";
        }
        if (tool === "propose_foreign_element") {
          const source = sourceOf(params.source);
          const f = store.proposeForeignElement(
            { kind: String(params.kind ?? "") as never, subject: String(params.subject ?? ""), country: String(params.country ?? ""), detail: String(params.detail ?? ""), sourceId: source?.id ?? null },
            { actor: "agent", sessionId },
          );
          return `Proposed foreign element ${f.id}: ${f.subject} (${f.country}). The advocate confirms or rejects it.`;
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
  ingest = new Ingest(matters, (matterId) => window?.webContents.send("ingest:update", matterId), (matterId) => analyzeMatter(matters, matterId, courtIntel), (matterId, name) => fireTrigger(matterId, "new_document", name));
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
  registerBridge(handle, {
    matters,
    agent,
    piExtensions,
    recordTables,
    studio,
    hub,
    research,
    drafts,
    filing,
    portal,
    library,
    advocateStore,
    intelStore,
    courtIntel,
    contacts,
    progress,
    proposals,
    practicePacks,
    skillRegistry,
    skillImporter,
    ingest,
    mail,
    signer,
    researchSettings,
    sourceName,
    emitChat,
    browser,
    editorHost,
    integrations,
    ulos,
    workHost,
    readSettings,
    writeSetting,
    appInfo,
    appearance,
    customWorkflows,
    saveWorkflows,
    policyTools,
    fireTrigger,
    matterChanged,
    createMatterFromFields,
    resourcesRoot,
    enrolmentFile,
    enrolmentState,
    mailSecretFile,
    roleModels,
    MODEL_ROLES,
  });
  registerIntelBridge(handle, { intel: courtIntel, matters, onEvent: (matterId, event, subject) => fireTrigger(matterId, event, subject) });
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
