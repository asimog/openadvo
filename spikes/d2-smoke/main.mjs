// D2 smoke test. Runs in the real Electron main process (not ELECTRON_RUN_AS_NODE).
// Checks: (1) the Pi SDK loads and creates a session here; (2) the session has only our tool;
// (3) SQLite works here. Optional (4): one model turn that calls our tool, when credentials exist.
// Usage: npx electron spikes/d2-smoke/main.mjs [--prompt]
import { app } from "electron";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const results = { electron: process.versions.electron, node: process.versions.node, isMainProcess: process.type === "browser" };
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "result.json");

async function run() {
  // (3) SQLite in the main process: built-in node:sqlite.
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const dir = mkdtempSync(path.join(tmpdir(), "oa-d2-"));
    const db = new DatabaseSync(path.join(dir, "t.db"));
    db.exec("CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT) STRICT");
    db.prepare("INSERT INTO t VALUES (?, ?)").run("a", "1");
    const row = db.prepare("SELECT v FROM t WHERE k = ?").get("a");
    db.close();
    results.sqlite = { ok: row?.v === "1", module: "node:sqlite", file: dir };
  } catch (e) { results.sqlite = { ok: false, error: String(e) }; }

  // (1) and (2) Pi SDK.
  try {
    const pi = await import("@earendil-works/pi-coding-agent");
    const { Type } = await import("typebox");
    let calls = 0;
    const listSources = pi.defineTool({
      name: "list_sources", label: "List sources",
      description: "List the source files of the open matter.",
      parameters: Type.Object({}),
      execute: async () => { calls++; return { content: [{ type: "text", text: "1. impugned-judgment.pdf sha256 abc" }], details: {} }; },
    });
    const resourceLoader = {
      getExtensions: () => ({ extensions: [], errors: [], runtime: pi.createExtensionRuntime() }),
      getSkills: () => ({ skills: [], diagnostics: [] }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => "You are a test assistant. Use list_sources when asked about sources.",
      getSystemPromptSource: () => undefined,
      getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
      extendResources: () => {}, reload: async () => {},
    };
    const cwd = mkdtempSync(path.join(tmpdir(), "oa-d2-cwd-"));
    const modelRuntime = await pi.ModelRuntime.create();
    const available = await modelRuntime.getAvailable();
    const want = process.env.OPENADVO_MODEL;
    const model = want ? available.find((m) => `${m.provider}/${m.id}` === want) : available[0];
    const { session } = await pi.createAgentSession({
      cwd, agentDir: path.join(cwd, "agent"), modelRuntime, model, resourceLoader,
      settingsManager: pi.SettingsManager.inMemory({ compaction: { enabled: false } }),
      sessionManager: pi.SessionManager.inMemory(cwd),
      tools: ["list_sources"], customTools: [listSources],
    });
    results.pi = {
      ok: true, version: (await import("@earendil-works/pi-coding-agent/package.json", { with: { type: "json" } }).catch(() => ({ default: {} }))).default.version,
      activeTools: session.getActiveToolNames(), allTools: session.getAllTools().map((t) => t.name),
      availableModels: available.length, model: session.model ? `${session.model.provider}/${session.model.id}` : null,
    };
    results.onlyOurTool = JSON.stringify(results.pi.activeTools) === JSON.stringify(["list_sources"]);
    if (process.argv.includes("--prompt") && session.model) {
      await session.prompt("List the sources of this matter.");
      results.promptRun = { toolCalls: calls, reply: (session.getLastAssistantText() || "").slice(0, 300) };
    }
    session.dispose();
  } catch (e) { results.pi = { ok: false, error: String(e?.stack || e) }; }
}

app.whenReady().then(run).finally(() => {
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  app.exit(0);
});
