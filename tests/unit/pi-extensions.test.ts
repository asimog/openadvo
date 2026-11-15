/**
 * Decisions 22 to 25: the bundled Pi extensions load in every session; Pi's built-in tools are
 * never active; pi-permission-system enforces the application's policy and writes its log in the
 * application's Pi folder; the helper-agent policy is written. Needs npm run vendor:extensions.
 * A faux model (pi-ai) scripts the tool calls, so no real model is used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModelRuntime, createAgentSession, defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { BUILTIN_TOOL_NAMES, ExtensionQuestions, PiExtensions, extensionUi } from "../../src/main/pi-extensions.ts";
import { AGENT_TOOLS, closeSession } from "../../src/main/agent.ts";
import { HELPER_TYPES, RETIRED_HELPER_TYPES } from "../../src/main/helper-types.ts";

const bundledRoot = path.resolve(import.meta.dirname, "..", "..", "resources", "pi-extensions");
const vendored = existsSync(path.join(bundledRoot, "vendor.lock.json"));
const skip = !vendored && "run npm run vendor:extensions";
const WANTED = ["pi-subagent-manager", "pi-context-decisions", "pi-checklist", "pi-context-prune", "pi-context-usage", "pi-cache-graph", "@gotgenes/pi-permission-system"];

/** A fresh application Pi folder, set as Pi's agent folder as the application does (decision 23). */
function manager(disabled: string[] = []) {
  const agentDir = mkdtempSync(path.join(tmpdir(), "openadvo-pi-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let off = disabled;
  const ext = new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => off, saveDisabled: (ids) => (off = ids) });
  ext.writePermissionPolicy();
  return { agentDir, ext };
}

function tool(name: string, ran: string[]) {
  return defineTool({
    name,
    label: name,
    description: "test",
    parameters: Type.Object({ path: Type.Optional(Type.String()) }),
    execute: async () => {
      ran.push(name);
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  });
}

test("the seven bundled extensions load with their tools and commands", { skip }, async () => {
  const { ext } = manager();
  const loader = await ext.loader({ systemPrompt: "test" });
  assert.deepEqual(loader.getExtensions().errors, []);
  const list = ext.list();
  for (const name of WANTED) {
    const x = list.find((e) => e.id === name);
    assert.ok(x, `${name} is listed`);
    assert.equal(x.error, null, `${name} loaded`);
    assert.ok(x.tools.length + x.commands.length > 0, `${name} registers a tool or a command`);
  }
  assert.ok(!list.some((e) => e.id === "@narumitw/pi-btw"), "pi-btw is not bundled");
  for (const t of ["checklist_create", "context_tree_query", "agent_spawn"]) assert.ok(list.flatMap((e) => e.tools).includes(t), `${t} is registered`);
});

test("the permission policy denies Pi's built-in tools, shell commands and credential files, and survives an edit", () => {
  const { ext } = manager();
  const file = ext.permissionPolicyFile();
  const first = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(first.permission["*"], "allow");
  assert.deepEqual(first.permission.bash, { "*": "deny" });
  for (const t of BUILTIN_TOOL_NAMES.filter((t) => t !== "bash")) assert.equal(first.permission[t], "deny");
  assert.equal(first.permission.path["*auth.json"], "deny");
  assert.equal(first.permissionReviewLog, true);
  // The advocate edits the file and loosens a safety rule; the next start puts it back and keeps the rest.
  first.permission.web_fetch = "deny";
  first.permission.bash = { "*": "allow" };
  first.yoloMode = true;
  writeFileSync(file, JSON.stringify(first));
  ext.writePermissionPolicy();
  const second = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(second.permission.web_fetch, "deny");
  assert.deepEqual(second.permission.bash, { "*": "deny" });
  assert.equal(second.yoloMode, false);
});

test("in a session, the permission system hides a denied tool, blocks a credential path, and logs in the app's folder", { skip }, async () => {
  const { ext, agentDir } = manager();
  const policy = JSON.parse(readFileSync(ext.permissionPolicyFile(), "utf8"));
  policy.permission.probe_denied = "deny";
  writeFileSync(ext.permissionPolicyFile(), JSON.stringify(policy));
  const core = createFauxCore({ provider: "faux-test", models: [{ id: "m" }] });
  const loader = await ext.loader({
    systemPrompt: "test",
    extraFactories: [
      (pi) =>
        pi.registerProvider("faux-test", {
          name: "Faux",
          baseUrl: "http://localhost",
          apiKey: "test",
          api: core.api,
          streamSimple: core.streamSimple,
          models: core.models.map((m) => ({ ...m, type: "chat" })),
        } as never),
    ],
  });
  const ran: string[] = [];
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: null });
  const { session } = await createAgentSession({
    modelRuntime,
    cwd: agentDir,
    agentDir,
    resourceLoader: loader,
    settingsManager: ext.settings(),
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
    excludeTools: [...BUILTIN_TOOL_NAMES],
    customTools: [tool("probe_allowed", ran), tool("probe_denied", ran), tool("probe_path", ran)],
  });
  try {
    const active = session.getActiveToolNames();
    for (const b of BUILTIN_TOOL_NAMES) assert.ok(!active.includes(b), `${b} is not active`);
    const model = modelRuntime.getModel("faux-test", "m");
    assert.ok(model, "the faux model is registered");
    await session.setModel(model as never);
    (core as unknown as { setResponses: (r: unknown[]) => void }).setResponses([
      fauxAssistantMessage([fauxToolCall("probe_allowed", {}), fauxToolCall("probe_denied", {}), fauxToolCall("probe_path", { path: path.join(agentDir, "auth.json") })], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const ends: Array<{ name: string; error: boolean }> = [];
    session.subscribe((e) => {
      if (e.type === "tool_execution_end") ends.push({ name: e.toolName, error: e.isError, text: JSON.stringify(e.result).slice(0, 300) } as never);
    });
    await session.prompt("go");
    if (process.env.PROBE_DEBUG) console.log(JSON.stringify(ends, null, 1));
    assert.deepEqual(ran, ["probe_allowed"], "only the allowed tool ran");
    assert.equal(ends.find((e) => e.name === "probe_denied")?.error, true, "the denied tool call failed");
    assert.equal(ends.find((e) => e.name === "probe_path")?.error, true, "the credential path was blocked");
    const logs = path.join(agentDir, "extensions", "pi-permission-system", "logs");
    assert.ok(existsSync(logs), "the logs folder is in the application's Pi folder");
    const review = readdirSync(logs).map((f) => readFileSync(path.join(logs, f), "utf8")).join(String.fromCharCode(10));
    assert.match(review, /permission_request\.blocked/, "the block is in the review log");
    assert.match(review, /probe_path/);
  } finally {
    session.dispose();
  }
});

test("a bundled extension can be turned off", { skip }, async () => {
  const { ext } = manager(["pi-checklist"]);
  const loader = await ext.loader({ systemPrompt: "test" });
  assert.ok(!loader.getExtensions().extensions.flatMap((e) => [...e.tools.keys()]).includes("checklist_create"));
  assert.equal(ext.list().find((e) => e.id === "pi-checklist")?.enabled, false);
});

test("the helper-agent policy: the four Open Advocate types, the limits, and no tools for the coding types", () => {
  const { ext, agentDir } = manager();
  ext.writeSubagentPolicy(AGENT_TOOLS);
  const base = path.join(agentDir, "subagent-manager");
  const settings = JSON.parse(readFileSync(path.join(base, "settings.json"), "utf8")) as Record<string, unknown>;
  assert.equal(settings.toolFiltering, "allowed");
  assert.equal(settings.subagentExtensions, false);
  assert.deepEqual([settings.maxLevels, settings.maxConcurrent, settings.maxThreads], [3, 4, 24]);
  for (const t of RETIRED_HELPER_TYPES) {
    const overlay = readFileSync(path.join(base, "agents", `${t}.yml`), "utf8");
    assert.match(overlay, /allow: \[\]/, `${t} has no tools`);
    assert.match(overlay, /block:\n {4}- read\n {4}- bash/);
  }
  const allow = (name: string) => {
    const file = readFileSync(path.join(base, "agents", `${name}.md`), "utf8");
    return [...file.split("block:")[0].matchAll(/^ {4}- (\S+)$/gm)].map((m) => m[1]);
  };
  for (const t of HELPER_TYPES) {
    const tools = allow(t.name);
    assert.ok(tools.length > 0, `${t.name} has tools`);
    for (const x of tools) assert.ok((AGENT_TOOLS as readonly string[]).includes(x) || x.startsWith("agent_"), `${t.name}: ${x} is an application tool or a manager control`);
    assert.ok(!tools.some((x) => (BUILTIN_TOOL_NAMES as readonly string[]).includes(x)), `${t.name} gets no built-in tool`);
  }
  assert.ok(allow("legal-research").includes("agent_spawn"), "legal-research may start helpers");
  for (const t of ["record-reader", "critic", "drafter"]) assert.ok(!allow(t).includes("agent_spawn"), `${t} may not start helpers`);
  assert.ok(!allow("record-reader").some((x) => /^(propose|save|add|write|fill|record|assess)_/.test(x)), "record-reader writes nothing");
  assert.ok(!allow("critic").some((x) => /^propose_/.test(x)), "critic changes no text");
});

test("H-12: an 'ask' rule of the permission system becomes a question; Yes runs the tool, No withholds it", { skip }, async () => {
  const { ext, agentDir } = manager();
  const policy = JSON.parse(readFileSync(ext.permissionPolicyFile(), "utf8"));
  policy.permission.probe_ask = "ask";
  writeFileSync(ext.permissionPolicyFile(), JSON.stringify(policy));
  const core = createFauxCore({ provider: "faux-ask", models: [{ id: "m" }] });
  const loader = await ext.loader({
    systemPrompt: "test",
    extraFactories: [
      (pi) =>
        pi.registerProvider("faux-ask", {
          name: "Faux",
          baseUrl: "http://localhost",
          apiKey: "test",
          api: core.api,
          streamSimple: core.streamSimple,
          models: core.models.map((m) => ({ ...m, type: "chat" })),
        } as never),
    ],
  });
  const ran: string[] = [];
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: null });
  const { session } = await createAgentSession({
    modelRuntime,
    cwd: agentDir,
    agentDir,
    resourceLoader: loader,
    settingsManager: ext.settings(),
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
    excludeTools: [...BUILTIN_TOOL_NAMES],
    customTools: [tool("probe_ask", ran)],
  });
  // The window's answers: the first question gets "Yes", the second "No".
  const answers = ["Yes", "No"];
  const asked: string[] = [];
  const questions = new ExtensionQuestions((open) => {
    for (const q of open) {
      if (asked.includes(q.id)) continue;
      asked.push(q.id);
      assert.ok(q.metadata.options?.includes("Yes") && q.metadata.options.includes("No"), "the question offers Yes and No");
      const answer = answers.shift();
      setTimeout(() => questions.answer(q.id, answer ?? null), 0);
    }
  });
  try {
    await session.bindExtensions({ uiContext: extensionUi({ notice: () => undefined, status: () => undefined, questions }), mode: "rpc" });
    await session.setModel(modelRuntime.getModel("faux-ask", "m") as never);
    (core as unknown as { setResponses: (r: unknown[]) => void }).setResponses([
      fauxAssistantMessage([fauxToolCall("probe_ask", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("probe_ask", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const ends: boolean[] = [];
    session.subscribe((e) => {
      if (e.type === "tool_execution_end") ends.push(e.isError);
    });
    await session.prompt("go");
    assert.equal(asked.length, 2, "each call asked the advocate");
    assert.deepEqual(ran, ["probe_ask"], "only the approved call ran");
    assert.deepEqual(ends, [false, true], "the refused call failed");
  } finally {
    // session_shutdown lets pi-permission-system close its forwarding socket; dispose() alone leaves it open.
    await closeSession(session, "quit");
  }
});
