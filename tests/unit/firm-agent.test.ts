/**
 * The Firm Agent (feature O10; docs/specs/agent-framework.md section 2) with pi-ai's faux model:
 * its own session and folder, firm tools only, no matter documents, the firm context strategy,
 * and instructions handed to a matter only through the advocate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Agent, type AgentHost } from "../../src/main/agent.ts";
import { FIRM_TOOLS, type FirmHost } from "../../src/main/firm-agent.ts";
import { PiExtensions, BUILTIN_TOOL_NAMES } from "../../src/main/pi-extensions.ts";
import { FIRM_AGENT_ID, FIRM_HANDOFFS_EVENT, type ChatEvent } from "../../src/shared/api.ts";

const PROVIDER = "faux-firm";

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openadvo-firm-"));
  const agentDir = path.join(root, "pi-agent");
  const piHome = path.join(root, "owner-pi");
  const firmDir = path.join(root, "firm-agent");
  const bundledRoot = path.join(root, "no-bundled");
  for (const d of [agentDir, piHome, firmDir, bundledRoot]) mkdirSync(d, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const events: ChatEvent[] = [];
  const firm: FirmHost = {
    matters: async () => [
      { matterId: "m-a", title: "Sharma v. State", stage: "Draft the petition", next: "Confirm the dates", nextHearing: { date: "2026-12-01", status: "confirmed" }, limitation: "2026-12-10", openItems: 2, reminders: [{ id: "r1", text: "Call the clerk", dueAt: "2026-11-20", status: "open" }] },
      { matterId: "m-b", title: "Gupta v. Union", stage: "Read the record", next: "", nextHearing: null, limitation: null, openItems: 0, reminders: [] },
    ],
    openItems: async (id) => (id === "m-a" ? [{ kind: "date_conflict", title: "Date conflict", blocks: true, tab: "chronology" }] : []),
    hearings: async (id) => (id === "m-a" ? [{ date: "2026-11-01", bench: "Court 3", nextDate: "2026-12-01", nextDateStatus: "confirmed" }] : []),
    workflows: async () => [{ id: "w1", title: "Bail checklist", body: "Check the custody period, then...", builtIn: false }],
    advocateMemory: async () => ({
      memory: [
        { type: "preference", subject: "citation format", relation: "is", object: "SCC first", status: "confirmed" },
        { type: "lesson", subject: "old lesson", relation: "is", object: "gone", status: "rejected" },
      ],
      preferences: [{ key: "paragraph_length", value: "short", reason: "the advocate asked", status: "approved" }],
    }),
  };
  const known: Partial<AgentHost> = {
    matterTitle: async (id) => (id === FIRM_AGENT_ID ? "Firm" : "?"),
    chatDir: async (id) => {
      assert.equal(id, FIRM_AGENT_ID, "the Firm Agent never opens a matter's chat folder");
      return firmDir;
    },
    recordSession: async () => undefined,
    emit: (e) => events.push(e),
    loadModelKey: () => null,
    saveModelKey: () => undefined,
    loadEffort: () => null,
    saveEffort: () => undefined,
    policy: async () => ({ budgetTokens: null, usedTokens: 0 }),
    recordUsage: async () => undefined,
    // The plan strength and the party rule are settings, not matter readers.
    planStrength: () => "long",
    partyRule: () => true,
    firm,
  };
  // Any matter reader the Firm Agent touched would fail loudly.
  const host = new Proxy(known, {
    get: (t, k) => (k in t ? t[k as keyof AgentHost] : () => Promise.reject(new Error(`host.${String(k)} is not for the Firm Agent`))),
  }) as AgentHost;
  const extensions = new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => [], saveDisabled: () => undefined });
  const agent = new Agent(host, { agentDir, piHome, extensions });
  const core = createFauxCore({ provider: PROVIDER, models: [{ id: "m" }] });
  const runtime = await (agent as unknown as { modelRuntime(): Promise<ModelRuntime> }).modelRuntime();
  runtime.registerProvider(PROVIDER, { name: "Faux", baseUrl: "http://localhost", api: core.api, streamSimple: core.streamSimple, models: core.models.map((m) => ({ ...m, type: "chat" })) } as never);
  writeFileSync(path.join(piHome, "auth.json"), JSON.stringify({ [PROVIDER]: { type: "api_key", key: "test-key" } }));
  const session = async () => (await (agent as unknown as { chats: Map<string, Promise<{ session: AgentSession }>> }).chats.get(FIRM_AGENT_ID))!.session;
  /** What the model saw as the result of its last tool call. */
  const lastResult = (seen: { v: string }) => (context: { messages: unknown[] }) => {
    seen.v = JSON.stringify(context.messages.at(-1));
    return fauxAssistantMessage("ok");
  };
  return { agent, core, events, session, firmDir, lastResult };
}

test("O10: the Firm Agent has the firm tools only: no matter tools and no built-in tools", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const active = (await f.session()).getActiveToolNames();
    for (const t of FIRM_TOOLS) assert.ok(active.includes(t), `${t} is active`);
    for (const t of ["read_source_text", "list_events", "read_draft", "propose_correction", "search_sources", "submit_filing"]) assert.ok(!active.includes(t), `${t} is not a firm tool`);
    assert.ok(!active.some((t) => (BUILTIN_TOOL_NAMES as readonly string[]).includes(t)));
    const s = await f.session();
    assert.equal(s.settingsManager.getCompactionSettings().keepRecentTokens, 12_000, "the firm context strategy");
    assert.equal(s.extensionRunner.hasHandlers("context"), true);
    assert.match(s.systemPrompt, /Firm Agent/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("O10: list_matters and matter_overview give the firm's summary, with no documents", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const a = { v: "" };
    const b = { v: "" };
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("list_matters", {})], { stopReason: "toolUse" }),
      f.lastResult(a),
      fauxAssistantMessage([fauxToolCall("matter_overview", { matter_id: "m-a" })], { stopReason: "toolUse" }),
      f.lastResult(b),
    ]);
    await f.agent.send(FIRM_AGENT_ID, "what is pending?");
    assert.match(a.v, /m-a/);
    assert.match(a.v, /Sharma v\. State/);
    assert.match(a.v, /next hearing 2026-12-01/);
    assert.match(a.v, /2 open Review Inbox item/);
    await f.agent.send(FIRM_AGENT_ID, "and Sharma?");
    assert.match(b.v, /Date conflict/);
    assert.match(b.v, /blocks/);
    assert.match(b.v, /Court 3/);
    assert.match(b.v, /Call the clerk/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("O10: an unknown matter id is an error, not an empty answer", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const a = { v: "" };
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("matter_overview", { matter_id: "nope" })], { stopReason: "toolUse" }), f.lastResult(a)]);
    await f.agent.send(FIRM_AGENT_ID, "overview");
    assert.match(a.v, /"isError":true/);
    assert.match(a.v, /No open matter has the id nope/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("O10: an instruction for a matter waits for the advocate on Home; it is never sent to the matter", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("propose_matter_instruction", { matter_id: "m-a", instruction: "Resolve the date conflict first.", reason: "It blocks the petition." })], { stopReason: "toolUse" }),
      fauxAssistantMessage("Proposed."),
    ]);
    await f.agent.send(FIRM_AGENT_ID, "what should I do on Sharma?");
    const chat = await f.agent.getChat(FIRM_AGENT_ID);
    assert.equal(chat.handoffs?.length, 1);
    const h = chat.handoffs![0];
    assert.deepEqual([h.matterId, h.matterTitle, h.instruction, h.reason], ["m-a", "Sharma v. State", "Resolve the date conflict first.", "It blocks the petition."]);
    assert.ok(f.events.some((e) => (e.event as { name?: string }).name === FIRM_HANDOFFS_EVENT), "the window is told");
    assert.ok(existsSync(path.join(f.firmDir, "handoffs.json")), "it survives a restart");
    const left = await f.agent.closeFirmHandoff(h.id);
    assert.deepEqual(left, []);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.firmDir, "handoffs.json"), "utf8")), []);
  } finally {
    await f.agent.disposeAll();
  }
});

test("O10: an instruction for a matter that is not open is refused", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const a = { v: "" };
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("propose_matter_instruction", { matter_id: "closed", instruction: "x", reason: "y" })], { stopReason: "toolUse" }), f.lastResult(a)]);
    await f.agent.send(FIRM_AGENT_ID, "go");
    assert.match(a.v, /"isError":true/);
    assert.equal((await f.agent.getChat(FIRM_AGENT_ID)).handoffs?.length ?? 0, 0);
  } finally {
    await f.agent.disposeAll();
  }
});

test("O10: the firm's workflows are readable", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const a = { v: "" };
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("read_workflow", { workflow_id: "w1" })], { stopReason: "toolUse" }), f.lastResult(a)]);
    await f.agent.send(FIRM_AGENT_ID, "show the bail checklist");
    assert.match(a.v, /Bail checklist/);
    assert.match(a.v, /custody period/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("Q4 and O10: the Firm Agent reads advocate memory: confirmed records and approved preferences, never a rejected one", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(FIRM_AGENT_ID);
    const a = { v: "" };
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("read_advocate_memory", {})], { stopReason: "toolUse" }), f.lastResult(a)]);
    await f.agent.send(FIRM_AGENT_ID, "what do you know of my preferences?");
    assert.match(a.v, /citation format is SCC first \(confirmed\)/);
    assert.match(a.v, /preference paragraph_length: short \(approved; applied because the advocate asked\)/);
    assert.doesNotMatch(a.v, /old lesson/);
  } finally {
    await f.agent.disposeAll();
  }
});
