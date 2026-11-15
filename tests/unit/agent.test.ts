/**
 * The Agent class (src/main/agent.ts) with pi-ai's faux model, so no real model is used.
 * Harness hardening H-1 (two quick sends start one run; a message sent during a run is a
 * follow-up) and H-3 (the model is resolved again when none was found and when the
 * credentials change). The owner's Pi folder is a temporary folder with a test key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { Agent, type AgentHost } from "../../src/main/agent.ts";
import { CHAT_MESSAGE_EVENT, type ChatEvent } from "../../src/shared/api.ts";

const PROVIDER = "faux-agent";
const MATTER = "m1";

interface Fixture {
  agent: Agent;
  events: ChatEvent[];
  core: ReturnType<typeof createFauxCore>;
  piHome: string;
  sessions: Array<string | null>;
  signIn: () => void;
  signOut: () => void;
  runs: () => number;
  notices: () => string[];
}

async function fixture(): Promise<Fixture> {
  const root = mkdtempSync(path.join(tmpdir(), "openadvo-agent-"));
  const agentDir = path.join(root, "pi-agent");
  const piHome = path.join(root, "owner-pi");
  const chatDir = path.join(root, "chat");
  for (const d of [agentDir, piHome, chatDir]) mkdirSync(d, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const events: ChatEvent[] = [];
  const sessions: Array<string | null> = [];
  const known: Partial<AgentHost> = {
    matterTitle: async () => "Test v. State",
    chatDir: async () => chatDir,
    recordSession: async (_m, _s, model) => {
      sessions.push(model);
    },
    emit: (e) => events.push(e),
    loadModelKey: () => null,
    saveModelKey: () => undefined,
    loadEffort: () => null,
    saveEffort: () => undefined,
    policy: async () => ({ budgetTokens: null, usedTokens: 0 }),
    recordUsage: async () => undefined,
  };
  // Tools are never called in these tests; any other host method fails loudly.
  const host = new Proxy(known, {
    get: (t, k) => (k in t ? t[k as keyof AgentHost] : () => Promise.reject(new Error(`host.${String(k)} not in this test`))),
  }) as AgentHost;
  const agent = new Agent(host, { agentDir, piHome });
  const core = createFauxCore({ provider: PROVIDER, models: [{ id: "m" }] });
  // The provider is known to Pi, but has no credentials until auth.json has its key.
  const runtime = await (agent as unknown as { modelRuntime(): Promise<ModelRuntime> }).modelRuntime();
  runtime.registerProvider(PROVIDER, {
    name: "Faux",
    baseUrl: "http://localhost",
    api: core.api,
    streamSimple: core.streamSimple,
    models: core.models.map((m) => ({ ...m, type: "chat" })),
  } as never);
  const auth = path.join(piHome, "auth.json");
  const texts = (role: string) =>
    events
      .filter((e) => (e.event as { name?: string }).name === CHAT_MESSAGE_EVENT)
      .map((e) => (e.event as unknown as { value: { role: string; text: string } }).value)
      .filter((m) => m.role === role)
      .map((m) => m.text);
  return {
    agent,
    events,
    core,
    piHome,
    sessions,
    signIn: () => writeFileSync(auth, JSON.stringify({ [PROVIDER]: { type: "api_key", key: "test-key" } })),
    signOut: () => rmSync(auth, { force: true }),
    runs: () => events.filter((e) => e.event.type === "RUN_STARTED").length,
    notices: () => texts("notice"),
  };
}

/** A response that waits until the test opens the gate, so a run stays in progress. */
function gated(text: string) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  return { open, step: async () => (await gate, fauxAssistantMessage(text)) };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

test("H-3: no model at first; after sign-in the open session takes the model without a restart", async () => {
  const f = await fixture();
  try {
    const first = await f.agent.getChat(MATTER);
    assert.equal(first.model, null);
    assert.ok(first.messages.some((m) => m.role === "notice" && /No model is available/.test(m.text)));
    assert.equal(await f.agent.currentModel(), null);

    await f.agent.send(MATTER, "hello");
    assert.equal(f.runs(), 0, "no run starts without a model");
    assert.ok(f.notices().some((t) => /no model is available/.test(t)));

    f.signIn();
    assert.equal(await f.agent.currentModel(), `${PROVIDER}/m`, "the model is resolved again, not kept as none");
    assert.deepEqual((await f.agent.listModels()).map((m) => m.key), [`${PROVIDER}/m`]);
    const after = await f.agent.getChat(MATTER);
    assert.equal(after.model, `${PROVIDER}/m`, "the open session uses the model");
    assert.ok(f.notices().includes(`The agent now uses the model ${PROVIDER}/m.`));
    assert.equal(f.sessions.at(-1), `${PROVIDER}/m`, "the session's model is recorded");

    f.core.setResponses([fauxAssistantMessage("Answer one.")]);
    await f.agent.send(MATTER, "hello again");
    assert.equal(f.runs(), 1);
    const chat = await f.agent.getChat(MATTER);
    assert.equal(chat.messages.filter((m) => m.role === "agent").at(-1)?.text, "Answer one.");
  } finally {
    await f.agent.disposeAll();
  }
});

test("H-3: when the credentials are removed, the model list and the current model follow", async () => {
  const f = await fixture();
  try {
    f.signIn();
    assert.equal(await f.agent.currentModel(), `${PROVIDER}/m`);
    f.signOut();
    assert.deepEqual(await f.agent.listModels(), []);
    assert.equal(await f.agent.currentModel(), null);
    f.signIn();
    assert.equal(await f.agent.currentModel(), `${PROVIDER}/m`);
  } finally {
    await f.agent.disposeAll();
  }
});

test("H-1: two quick sends start one run, and the second message is not lost", async () => {
  const f = await fixture();
  f.signIn();
  try {
    await f.agent.getChat(MATTER);
    const g = gated("First answer.");
    f.core.setResponses([g.step, fauxAssistantMessage("Second answer.")]);
    const a = f.agent.send(MATTER, "first");
    const b = f.agent.send(MATTER, "second");
    await b;
    const told = f.notices().filter((t) => /still working|Queued/.test(t));
    assert.equal(told.length, 1, "the advocate is told what happened to the second message");
    g.open();
    await a;
    assert.equal(f.runs(), 1, "the second send did not start a run");
  } finally {
    await f.agent.disposeAll();
  }
});

test("H-1 and H-21: a message sent during a run is a follow-up that the agent reads in the same run", async () => {
  const f = await fixture();
  f.signIn();
  try {
    await f.agent.getChat(MATTER);
    const g = gated("First answer.");
    let seen = "";
    f.core.setResponses([
      g.step,
      (context) => {
        seen = JSON.stringify(context.messages);
        return fauxAssistantMessage("Follow-up answer.");
      },
    ]);
    const a = f.agent.send(MATTER, "first");
    await until(() => f.core.state.callCount >= 1, "the first model call");
    await f.agent.send(MATTER, "and also this");
    assert.ok(f.notices().some((t) => t.startsWith("Queued")), "the message is queued as a follow-up");
    g.open();
    await a;
    assert.equal(f.runs(), 1, "the follow-up runs inside the same run");
    assert.match(seen, /and also this/, "the model received the follow-up");
    const agentTexts = (await f.agent.getChat(MATTER)).messages.filter((m) => m.role === "agent").map((m) => m.text);
    assert.deepEqual(agentTexts, ["First answer.", "Follow-up answer."]);
  } finally {
    await f.agent.disposeAll();
  }
});
