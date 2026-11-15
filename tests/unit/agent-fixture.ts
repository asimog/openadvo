/**
 * A faux-model Agent for unit tests: a temporary Pi folder, a host that fails loudly on any
 * method a test did not give, a temporary tool-policy store, and helpers to read what the
 * window received. Not a test file itself.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentSession, InlineExtension, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createFauxCore } from "@earendil-works/pi-ai";
import { Agent, TRACE_FILE, type AgentHost } from "../../src/main/agent.ts";
import { PiExtensions } from "../../src/main/pi-extensions.ts";
import { PolicyStore, type ToolPolicy } from "../../src/main/tool-policy.ts";
import { CHAT_MESSAGE_EVENT, EXTENSION_QUESTIONS_EVENT, type ChatEvent, type ExtensionQuestion } from "../../src/shared/api.ts";

export const MATTER = "m1";

export async function agentFixture(opts: { host?: Partial<AgentHost>; inlineExtensions?: InlineExtension[]; policy?: ToolPolicy; provider?: string; bundledRoot?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openadvo-agent-"));
  const agentDir = path.join(root, "pi-agent");
  const piHome = path.join(root, "owner-pi");
  const chatDir = path.join(root, "chat");
  const bundledRoot = opts.bundledRoot ?? path.join(root, "no-bundled");
  for (const d of [agentDir, piHome, chatDir]) mkdirSync(d, { recursive: true });
  if (!opts.bundledRoot) mkdirSync(bundledRoot, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const events: ChatEvent[] = [];
  const usage: number[] = [];
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
    ...opts.host,
  };
  const host = new Proxy(known, {
    get: (t, k) => (k in t ? t[k as keyof AgentHost] : () => Promise.reject(new Error(`host.${String(k)} not in this test`))),
  }) as AgentHost;
  const policy = new PolicyStore(path.join(root, "tool-policy.json"), path.join(root, "logs", "tool-policy.jsonl"));
  if (opts.policy) policy.write(opts.policy);
  const extensions = new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => [], saveDisabled: () => undefined });
  const agent = new Agent(host, { agentDir, piHome, extensions, policy, inlineExtensions: opts.inlineExtensions });
  const provider = opts.provider ?? "faux-agent";
  const core = createFauxCore({ provider, models: [{ id: "m" }] });
  const runtime = await (agent as unknown as { modelRuntime(): Promise<ModelRuntime> }).modelRuntime();
  runtime.registerProvider(provider, { name: "Faux", baseUrl: "http://localhost", api: core.api, streamSimple: core.streamSimple, models: core.models.map((m) => ({ ...m, type: "chat" })) } as never);
  writeFileSync(path.join(piHome, "auth.json"), JSON.stringify({ [provider]: { type: "api_key", key: "test-key" } }));
  const session = async (id = MATTER) => (await (agent as unknown as { chats: Map<string, Promise<{ session: AgentSession }>> }).chats.get(id))!.session;
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
  /** The questions the window was last told about. */
  const questions = (): ExtensionQuestion[] => {
    const last = events.filter((e) => (e.event as { name?: string }).name === EXTENSION_QUESTIONS_EVENT).at(-1);
    return last ? ((last.event as unknown as { value: ExtensionQuestion[] }).value ?? []) : [];
  };
  const policyLog = () => {
    try {
      return readFileSync(path.join(root, "logs", "tool-policy.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
      return [];
    }
  };
  return { agent, core, events, usage, session, trace, count, texts, questions, policy, policyLog, chatDir, root };
}

export async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}
