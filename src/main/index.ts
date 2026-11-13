/**
 * Electron main process: the window, the bridge handlers, the matter store and the agent.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Matters } from "./matters.ts";
import { Agent } from "./agent.ts";
import type { ChatEvent } from "../shared/api.ts";

// Tests and the proof run may point the application at separate folders.
if (process.env.OPENADVO_USER_DATA) app.setPath("userData", path.resolve(process.env.OPENADVO_USER_DATA));

const here = import.meta.dirname;
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const rendererFile = path.join(here, "../renderer/index.html");

let window: BrowserWindow | null = null;
let matters: Matters;
let agent: Agent;

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
  handle("matters:open", (matterId: string) => matters.openMatter(matterId));
  handle("sources:list", (matterId: string) => matters.listSources(matterId));
  handle("sources:origins", (matterId: string, sourceId: string) => matters.listOrigins(matterId, sourceId));
  handle("sources:add", (matterId: string, paths: unknown) => {
    const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    return matters.addFiles(matterId, list, { actor: "advocate" });
  });
  handle("events:list", (matterId: string) => matters.listEvents(matterId));
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
  window.once("ready-to-show", () => window?.show());
  if (rendererDevUrl) void window.loadURL(rendererDevUrl);
  else void window.loadFile(rendererFile);
  window.on("closed", () => {
    window = null;
  });
}

function exposeTestHooks(): void {
  // Read-only hooks for the Playwright tests. Present only when OPENADVO_TEST=1.
  if (process.env.OPENADVO_TEST !== "1") return;
  (globalThis as Record<string, unknown>).__openadvoTest = {
    agentToolNames: (matterId: string) => agent.toolNames(matterId),
    agentSessionId: (matterId: string) => agent.sessionId(matterId),
    mattersRoot: () => matters.root,
  };
}

app.whenReady().then(() => {
  matters = new Matters(mattersRoot());
  agent = new Agent(
    {
      listSources: (id) => matters.listSources(id),
      matterTitle: (id) => matters.title(id),
      recordSession: (id, sessionId, model) => matters.recordAgentSession(id, sessionId, model),
      emit: emitChat,
    },
    { agentDir: path.join(app.getPath("userData"), "pi-agent"), model: process.env.OPENADVO_MODEL || undefined },
  );
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
