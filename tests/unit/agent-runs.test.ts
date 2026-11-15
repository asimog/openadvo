/**
 * The agent framework (docs/specs/agent-framework.md) with pi-ai's faux model:
 * one listener per session (H-25, defect B1-1), Stop stops helpers (B1-2), nested writes
 * carry their own actor id (B1-4), a failed Studio call is an error, the run trace, and the
 * tool rules of section 6. A test extension stands in for pi-subagent-manager.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentSession, ExtensionAPI, InlineExtension, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Agent, TRACE_FILE, type AgentHost } from "../../src/main/agent.ts";
import { PiExtensions } from "../../src/main/pi-extensions.ts";
import { CHAT_MESSAGE_EVENT, type ChatEvent } from "../../src/shared/api.ts";

const PROVIDER = "faux-runs";
const MATTER = "m1";

interface Helpers {
  threads: Array<{ path: string; state: string }>;
  stopped: string[];
}

/** Stands in for pi-subagent-manager: agent_status, agent_stop, and a tool that calls another tool. */
function fakeHelpers(h: Helpers): InlineExtension {
  return {
    name: "fake-helpers",
    factory: (pi: ExtensionAPI) => {
      pi.registerTool({
        name: "agent_status",
        label: "agent_status",
        description: "test",
        parameters: Type.Object({ path: Type.Optional(Type.String()) }),
        execute: async () => ({ content: [{ type: "text", text: JSON.stringify(h.threads) }], details: h.threads }),
      });
      pi.registerTool({
        name: "agent_stop",
        label: "agent_stop",
        description: "test",
        parameters: Type.Object({ path: Type.String() }),
        execute: async (_id, p: { path: string }) => {
          h.stopped.push(p.path);
          return { content: [{ type: "text", text: "stopped" }], details: {} };
        },
      });
      pi.registerTool({
        name: "agent_spawn",
        label: "agent_spawn",
        description: "test: runs propose_issue as a helper would",
        parameters: Type.Object({}),
        execute: async (_id, _p, _s, _u, ctx) => {
          const out = await (ctx as unknown as { executeTool: (n: string, a: unknown) => Promise<{ isError: boolean }> }).executeTool("propose_issue", { text: "Helper's issue" });
          return { content: [{ type: "text", text: out.isError ? "failed" : "done" }], details: {} };
        },
      });
    },
  };
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openadvo-runs-"));
  const agentDir = path.join(root, "pi-agent");
  const piHome = path.join(root, "owner-pi");
  const chatDir = path.join(root, "chat");
  const bundledRoot = path.join(root, "no-bundled");
  for (const d of [agentDir, piHome, chatDir, bundledRoot]) mkdirSync(d, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const events: ChatEvent[] = [];
  const usage: number[] = [];
  const actors: string[] = [];
  const helpers: Helpers = { threads: [], stopped: [] };
  let studio: (tool: string) => Promise<string> = async () => "ok";
  const known: Partial<AgentHost> = {
    matterTitle: async () => "Test v. State",
    chatDir: async () => chatDir,
    recordSession: async () => undefined,
    emit: (e) => events.push(e),
    loadModelKey: () => null,
    saveModelKey: () => undefined,
    loadEffort: () => null,
    saveEffort: () => undefined,
    policy: async () => ({ budgetTokens: null, usedTokens: 0 }),
    recordUsage: async (_m, u) => {
      usage.push(u.totalTokens);
    },
    studio: async (_m, tool) => studio(tool),
    notebook: async () => ({ events: Array.from({ length: 3000 }, (_, i) => ({ id: `e${i}`, dateStart: "2020-01-01", dateEnd: "2020-01-01", dateType: "exact", kind: "factual", status: "confirmed", text: `Event number ${i} with some words`, excluded: false, conflicts: [], anchor: null })), readiness: { ready: true, jobsPending: 0, openReviewItems: 0 } }) as never,
    work: {
      proposeIssue: async (_m: string, _t: string, actor: string) => {
        actors.push(actor);
        return "Recorded.";
      },
    } as never,
  };
  const host = new Proxy(known, {
    get: (t, k) => (k in t ? t[k as keyof AgentHost] : () => Promise.reject(new Error(`host.${String(k)} not in this test`))),
  }) as AgentHost;
  const extensions = new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => [], saveDisabled: () => undefined });
  const agent = new Agent(host, { agentDir, piHome, extensions, inlineExtensions: [fakeHelpers(helpers)] });
  const core = createFauxCore({ provider: PROVIDER, models: [{ id: "m" }] });
  const runtime = await (agent as unknown as { modelRuntime(): Promise<ModelRuntime> }).modelRuntime();
  runtime.registerProvider(PROVIDER, { name: "Faux", baseUrl: "http://localhost", api: core.api, streamSimple: core.streamSimple, models: core.models.map((m) => ({ ...m, type: "chat" })) } as never);
  writeFileSync(path.join(piHome, "auth.json"), JSON.stringify({ [PROVIDER]: { type: "api_key", key: "test-key" } }));
  const session = async () => (await (agent as unknown as { chats: Map<string, Promise<{ session: AgentSession }>> }).chats.get(MATTER))!.session;
  const trace = async () => {
    await agent.flushTraces();
    return readFileSync(path.join(chatDir, TRACE_FILE), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  };
  const count = (type: string) => events.filter((e) => e.event.type === type).length;
  const texts = (role: string) =>
    events
      .filter((e) => (e.event as { name?: string }).name === CHAT_MESSAGE_EVENT)
      .map((e) => (e.event as unknown as { value: { role: string; text: string } }).value)
      .filter((m) => m.role === role)
      .map((m) => m.text);
  return { agent, core, events, usage, actors, helpers, session, trace, count, texts, chatDir, setStudio: (f: typeof studio) => (studio = f) };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

test("B1-1 (H-25): a turn that a helper's result starts is a run the window sees, saves and counts", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const s = await f.session();
    f.core.setResponses([fauxAssistantMessage("The helper found two authorities.")]);
    // pi-subagent-manager hands a wait:false result back like this (src/index.ts).
    await s.sendCustomMessage({ customType: "subagent-result", content: "Helper result", display: true }, { triggerTurn: true });
    await until(() => f.count("RUN_FINISHED") === 1, "the run to finish");
    assert.equal(f.count("RUN_STARTED"), 1);
    const chat = await f.agent.getChat(MATTER);
    assert.equal(chat.busy, false);
    assert.equal(chat.messages.filter((m) => m.role === "agent").at(-1)?.text, "The helper found two authorities.");
    assert.equal(f.usage.length, 1, "the usage of the run is recorded");
    const saved = JSON.parse(readFileSync(path.join(f.chatDir, "messages.json"), "utf8")) as Array<{ text: string }>;
    assert.ok(saved.some((m) => m.text === "The helper found two authorities."), "the run is saved");
  } finally {
    await f.agent.disposeAll();
  }
});

test("B1-2: Stop stops the running helpers and says how many", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    f.helpers.threads = [
      { path: "/root/research", state: "running" },
      { path: "/root/reader", state: "starting" },
      { path: "/root/old", state: "completed" },
    ];
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    f.core.setResponses([async () => (await gate, fauxAssistantMessage("late"))]);
    const run = f.agent.send(MATTER, "research this");
    await until(() => f.core.state.callCount >= 1, "the model call");
    // The faux model ignores the abort signal, so its answer is released while Stop waits.
    const stopping = f.agent.stop(MATTER);
    setTimeout(open, 50);
    assert.equal(await stopping, true);
    await run;
    assert.deepEqual(f.helpers.stopped.sort(), ["/root/reader", "/root/research"]);
    assert.ok(f.texts("notice").some((t) => /Stopped by the advocate\. 2 helper agents stopped\./.test(t)));
  } finally {
    await f.agent.disposeAll();
  }
});

test("B1-4: a write made through another tool carries <session id>/<parent call id>", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const sessionId = await f.agent.sessionId(MATTER);
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("propose_issue", { text: "Own issue" }, { id: "own-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("agent_spawn", {}, { id: "spawn-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    await f.agent.send(MATTER, "go");
    assert.deepEqual(f.actors, [sessionId, `${sessionId}/spawn-1`]);
  } finally {
    await f.agent.disposeAll();
  }
});

test("a failed Studio call is an error to the model and the window, and the trace records it", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    f.setStudio(async () => {
      throw new Error("SOURCE_UNREACHABLE: India Code did not answer");
    });
    let seen = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("search_statutes", { query: "section 483" }, { id: "st-1" })], { stopReason: "toolUse" }),
      (context) => {
        seen = JSON.stringify(context.messages.at(-1));
        return fauxAssistantMessage("It failed.");
      },
    ]);
    await f.agent.send(MATTER, "find it");
    assert.match(seen, /"isError":true/);
    assert.match(seen, /SOURCE_UNREACHABLE/);
    assert.ok(f.texts("tool").includes("Tool failed: search_statutes"));
    const lines = await f.trace();
    const call = lines.find((l) => l.type === "tool" && l.callId === "st-1");
    assert.equal(call?.error, true);
    assert.equal(typeof call?.ms, "number");
    assert.ok(lines.some((l) => l.type === "run_start") && lines.some((l) => l.type === "run_end"));
    assert.ok(!JSON.stringify(lines).includes("section 483"), "the trace holds no tool arguments");
  } finally {
    await f.agent.disposeAll();
  }
});

test("Stop ends a tool call that does not return", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    let called = false;
    f.setStudio(() => {
      called = true;
      return new Promise<string>(() => undefined);
    });
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("web_search", { query: "x" })], { stopReason: "toolUse" }), fauxAssistantMessage("after")]);
    const run = f.agent.send(MATTER, "search");
    await until(() => called, "the tool call");
    await f.agent.stop(MATTER);
    await run;
    const chat = await f.agent.getChat(MATTER);
    assert.equal(chat.busy, false);
  } finally {
    await f.agent.disposeAll();
  }
});

test("tool rules: long results are cut with a hint; reading tools are read-only; writers are sequential", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const s = await f.session();
    const def = (name: string) => s.getToolDefinition(name) as unknown as { annotations?: { readOnlyHint?: boolean }; executionMode?: string };
    assert.equal(def("read_source_text").annotations?.readOnlyHint, true);
    assert.equal(def("get_chronology").annotations?.readOnlyHint, true);
    assert.equal(def("propose_correction").executionMode, "sequential");
    assert.equal(def("propose_paragraph").executionMode, "sequential");
    assert.notEqual(def("propose_correction").annotations?.readOnlyHint, true);
    // The Matter Agent's context strategy is loaded (spec section 7).
    assert.equal(s.extensionRunner.hasHandlers("context"), true);
    assert.equal(s.extensionRunner.hasHandlers("session_before_compact"), true);
    assert.equal(s.settingsManager.getCompactionSettings().keepRecentTokens, 30_000);
    let seen = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("get_chronology", {})], { stopReason: "toolUse" }),
      (context) => {
        seen = JSON.stringify(context.messages.at(-1));
        return fauxAssistantMessage("ok");
      },
    ]);
    await f.agent.send(MATTER, "chronology");
    assert.ok(seen.length < 60_000, `the result is bounded (${seen.length} characters)`);
    assert.match(seen, /Output cut at/);
  } finally {
    await f.agent.disposeAll();
  }
});
