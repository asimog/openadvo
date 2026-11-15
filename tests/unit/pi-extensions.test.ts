/**
 * Decision 22: the bundled Pi extensions load through the application's loader; a confidential
 * matter loads none; Pi's built-in tools are never active; the helper-agent policy is written.
 * Needs npm run vendor:extensions (skips without it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentSession, defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { BUILTIN_TOOL_NAMES, PiExtensions } from "../../src/main/pi-extensions.ts";

const bundledRoot = path.resolve(import.meta.dirname, "..", "..", "resources", "pi-extensions");
const vendored = existsSync(path.join(bundledRoot, "vendor.lock.json"));
const WANTED = ["pi-subagent-manager", "pi-context-decisions", "pi-checklist", "pi-context-prune", "pi-context-usage", "pi-cache-graph"];

function manager(disabled: string[] = []) {
  const agentDir = mkdtempSync(path.join(tmpdir(), "openadvo-pi-"));
  let off = disabled;
  return { agentDir, ext: new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => off, saveDisabled: (ids) => (off = ids) }) };
}

const appTool = defineTool({ name: "list_sources", label: "List sources", description: "test", parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text", text: "none" }], details: {} }) });

test("the six bundled extensions load with their tools and commands", { skip: !vendored && "run npm run vendor:extensions" }, async () => {
  const { ext } = manager();
  const loader = await ext.loader({ systemPrompt: "test", confidential: false });
  const { errors } = loader.getExtensions();
  assert.deepEqual(errors, []);
  const list = ext.list();
  for (const name of WANTED) {
    const x = list.find((e) => e.id === name);
    assert.ok(x, `${name} is listed`);
    assert.equal(x.error, null, `${name} loaded`);
    assert.ok(x.tools.length + x.commands.length > 0, `${name} registers a tool or a command`);
  }
  const tools = list.flatMap((e) => e.tools);
  for (const t of ["checklist_create", "checklist_read", "checklist_update", "context_tree_query", "agent_spawn"]) assert.ok(tools.includes(t), `${t} is registered`);
});

test("a confidential matter loads no third-party extension", { skip: !vendored && "run npm run vendor:extensions" }, async () => {
  const { ext } = manager();
  const loader = await ext.loader({ systemPrompt: "test", confidential: true });
  const names = loader.getExtensions().extensions.map((e) => e.path);
  assert.ok(names.every((p) => p.includes("openadvo-policy")), `only the host guard: ${JSON.stringify(names)}`);
});

test("a session with the extensions has no built-in Pi tool, and the app's tool is active", { skip: !vendored && "run npm run vendor:extensions" }, async () => {
  const { ext, agentDir } = manager();
  const loader = await ext.loader({ systemPrompt: "test", confidential: false });
  const { session } = await createAgentSession({
    cwd: agentDir,
    agentDir,
    resourceLoader: loader,
    settingsManager: ext.settings(),
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
    excludeTools: [...BUILTIN_TOOL_NAMES],
    customTools: [appTool],
  });
  try {
    const active = session.getActiveToolNames();
    assert.ok(active.includes("list_sources"));
    assert.ok(active.includes("checklist_create"));
    for (const b of BUILTIN_TOOL_NAMES) assert.ok(!active.includes(b), `${b} is not active`);
  } finally {
    session.dispose();
  }
});

test("a bundled extension can be turned off", { skip: !vendored && "run npm run vendor:extensions" }, async () => {
  const { ext } = manager(["pi-checklist"]);
  const loader = await ext.loader({ systemPrompt: "test", confidential: false });
  const tools = loader.getExtensions().extensions.flatMap((e) => [...e.tools.keys()]);
  assert.ok(!tools.includes("checklist_create"));
  assert.equal(ext.list().find((e) => e.id === "pi-checklist")?.enabled, false);
});

test("the helper-agent policy allows only listed tools and blocks the built-in ones", () => {
  const { ext, agentDir } = manager();
  ext.writeSubagentPolicy(["list_sources"]);
  const settings = JSON.parse(readFileSync(path.join(agentDir, "subagent-manager", "settings.json"), "utf8")) as Record<string, unknown>;
  assert.equal(settings.toolFiltering, "allowed");
  assert.equal(settings.subagentExtensions, false);
  const coder = readFileSync(path.join(agentDir, "subagent-manager", "agents", "coder.yml"), "utf8");
  assert.match(coder, /allow:\n {4}- list_sources/);
  assert.match(coder, /block:\n {4}- read\n {4}- bash/);
  assert.match(coder, /models: null/);
});
