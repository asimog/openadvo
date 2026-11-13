/**
 * Electron main process: the window, the bridge handlers, the matter store and the agent.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Matters } from "./matters.ts";
import { Agent } from "./agent.ts";
import { Ingest } from "./ingest.ts";
import { Drafts } from "./drafts.ts";
import { EditorHost, registerEditorScheme, EO_ORIGIN } from "./editor-host.ts";
import { euroOfficePaths, platformKey } from "../lib/euro-office/platform.ts";
import type { ChatEvent } from "../shared/api.ts";
import type { DraftKind } from "../shared/records.ts";

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
    return fn(...(args as A));
  });
}

function emitChat(event: ChatEvent): void {
  window?.webContents.send("chat:event", event);
}

function registerBridge(): void {
  handle("matters:list", () => matters.list());
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
  handle("drafts:approveRevision", (matterId: string, revisionId: string) => drafts.approveRevision(matterId, revisionId));
  handle("dialog:pickFiles", async () => {
    if (!window) return [];
    const result = await dialog.showOpenDialog(window, {
      title: "Add PDF files to the matter",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle("chat:get", (matterId: string) => agent.getChat(matterId));
  handle("models:list", () => agent.listModels());
  handle("models:get", () => agent.currentModel());
  handle("models:set", (key: string) => agent.setModel(String(key ?? "")));
  handle("chat:send", (matterId: string, text: string) => {
    // The turn runs in the background; progress arrives as chat events.
    void agent.send(matterId, String(text ?? ""));
  });
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Open Advocate",
    show: false,
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

function writeSetting(key: string, value: unknown): void {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), [key]: value }, null, 2));
}

function exposeTestHooks(): void {
  // Read-only hooks for the Playwright tests. Present only when OPENADVO_TEST=1.
  if (process.env.OPENADVO_TEST !== "1") return;
  (globalThis as Record<string, unknown>).__openadvoTest = {
    agentToolNames: (matterId: string) => agent.toolNames(matterId),
    agentSessionId: (matterId: string) => agent.sessionId(matterId),
    mattersRoot: () => matters.root,
    ingestIdle: () => ingest.idle(),
  };
}

function euroOfficeRoot(): string {
  if (process.env.OPENADVO_EO_ROOT) return path.resolve(process.env.OPENADVO_EO_ROOT);
  return path.join(app.getAppPath(), "resources", "euro-office", platformKey());
}

app.whenReady().then(() => {
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
  drafts = new Drafts(matters, {
    x2t: euroOfficePaths(euroOfficeRoot()).x2t,
    workingRoot,
    openInEditor: (file, name, kind, readOnly, meta) => editorHost.open(file, name, kind, readOnly, meta),
  });
  agent = new Agent(
    {
      listSources: (id) => matters.listSources(id),
      listPages: (id, sourceId, from, to) => matters.listPages(id, sourceId, from, to),
      searchLines: (id, query, limit) => matters.searchLines(id, query, limit),
      notebook: (id) => matters.notebook(id),
      drafts: (id, kind) => drafts.readDrafts(id, kind),
      paragraphSource: (id, anchor) => drafts.paragraphSourceAnywhere(id, anchor),
      matterTitle: (id) => matters.title(id),
      recordSession: (id, sessionId, model) => matters.recordAgentSession(id, sessionId, model),
      emit: emitChat,
      loadModelKey: () => {
        const v = readSettings().model;
        return typeof v === "string" && v ? v : null;
      },
      saveModelKey: (key) => writeSetting("model", key),
    },
    { agentDir: path.join(app.getPath("userData"), "pi-agent"), model: process.env.OPENADVO_MODEL || undefined },
  );
  ingest = new Ingest(matters, (matterId) => window?.webContents.send("ingest:update", matterId));
  registerBridge();
  exposeTestHooks();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  void agent?.disposeAll();
  matters?.closeAll();
});
