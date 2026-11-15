/**
 * The scripted test model for end-to-end tests (native-parts prompt, section 1). Loaded only
 * when OPENADVO_TEST=1 (src/main/index.ts exposeTestHooks, by a dynamic import). A test sets a
 * JSON script with `__openadvoTest.setModelScript`; each model request takes the next step of
 * its queue: helpers' requests from the helper queue, the agents' from the agent queue.
 * Summary requests get a fixed summary. A step can wait until the test releases it.
 */
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export const TEST_PROVIDER = "openadvo-test";
export const TEST_MODEL_KEY = `${TEST_PROVIDER}/scripted`;

export interface ScriptStep {
  /** The reply's text. */
  text?: string;
  /** Tool calls of the reply, in order. */
  tools?: Array<{ name: string; args?: Record<string, unknown>; id?: string }>;
  /** Wait until the test calls releaseModel(hold). */
  hold?: string;
}

export interface ModelScript {
  agent?: ScriptStep[];
  helper?: ScriptStep[];
}

const queues: { agent: ScriptStep[]; helper: ScriptStep[] } = { agent: [], helper: [] };
const holds = new Map<string, { promise: Promise<void>; release: () => void }>();
/** What each request saw, for assertions: the queue and the last message as text. */
export const seen: Array<{ queue: string; last: string }> = [];

function hold(name: string) {
  let h = holds.get(name);
  if (!h) {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    h = { promise, release };
    holds.set(name, h);
  }
  return h;
}

export function setModelScript(script: ModelScript): void {
  queues.agent = [...(script.agent ?? [])];
  queues.helper = [...(script.helper ?? [])];
  seen.length = 0;
}

export function releaseModel(name: string): void {
  hold(name).release();
}

/** Register the provider on the agent's model runtime. The key is in the provider, so no credential file is written. */
export function installTestModel(runtime: ModelRuntime): void {
  const core = createFauxCore({ provider: TEST_PROVIDER, models: [{ id: "scripted" }] });
  const step = async (context: { messages: unknown[] }) => {
    const all = JSON.stringify(context.messages);
    const last = JSON.stringify(context.messages.at(-1) ?? "");
    if (/Summarise this conversation|Summarise this tool result/.test(last)) return fauxAssistantMessage("Summary of the earlier part (test model).");
    const queue = all.includes("You are a helper agent of Open Advocate") ? "helper" : "agent";
    seen.push({ queue, last: last.slice(0, 4000) });
    const next = queues[queue].shift();
    if (!next) return fauxAssistantMessage(`(test model: no scripted ${queue} reply)`);
    if (next.hold) await hold(next.hold).promise;
    if (next.tools?.length) return fauxAssistantMessage(next.tools.map((t) => fauxToolCall(t.name, (t.args ?? {}) as never, t.id ? { id: t.id } : undefined)), { stopReason: "toolUse" });
    return fauxAssistantMessage(next.text ?? "");
  };
  // Every request goes to the same step function, which reads the queues.
  core.setResponses(Array.from({ length: 10_000 }, () => step as never));
  runtime.registerProvider(TEST_PROVIDER, {
    name: "Open Advocate test model",
    baseUrl: "http://localhost",
    apiKey: "test",
    api: core.api,
    streamSimple: core.streamSimple,
    models: core.models.map((m) => ({ ...m, type: "chat", contextWindow: 200_000 })),
  } as never);
}
