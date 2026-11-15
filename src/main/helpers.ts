/**
 * Helpers (docs/specs/native-harness-parts.md section 3): a native part of the harness.
 * `start_helper` runs one helper session in process to its end and returns
 * its result. Every tool call of the helper runs through the calling agent's `ctx.executeTool`,
 * so the tool policy and the nested call id apply. A helper never starts a turn by itself:
 * parallel helpers are several `start_helper` calls in one message.
 */
import { defineTool, type AgentSession, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { HELPER_LIMITS, HELPER_TYPES, type HelperType } from "./helper-types.ts";

/** What a tool's context gives a tool: the callable tools and a way to run them through the hooks. */
interface ToolContext {
  tools: ReadonlyArray<{ name: string; label?: string; description: string; parameters: unknown }>;
  executeTool(name: string, args: unknown, options?: { signal?: AbortSignal }): Promise<{ result: { content: Array<{ type: string; text?: string }>; details?: unknown }; isError: boolean }>;
}

export interface HelperUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export interface HelperDeps {
  /** A fresh in-memory session with this prompt and these tools, on the conversation's model. */
  createSession(input: { prompt: string; tools: ToolDefinition[]; thinkingLevel: HelperType["thinkingLevel"] }): Promise<AgentSession>;
  /** Helpers running now in this conversation, at every depth. */
  slots: { running: number };
  limits?: Partial<typeof HELPER_LIMITS>;
}

/** The tool that starts a helper. `caller` is null for a Firm or Matter Agent, or the helper type that calls it. */
export function startHelperTool(deps: HelperDeps, caller: { type: string | null; root?: ToolContext }): ToolDefinition {
  const limits = { ...HELPER_LIMITS, ...deps.limits };
  const allowed = caller.type === null ? HELPER_TYPES.map((t) => t.name) : caller.type === "legal-research" ? ["record-reader"] : [];
  const choices = HELPER_TYPES.filter((t) => allowed.includes(t.name));
  return defineTool({
    name: "start_helper",
    label: "Start helper",
    description: [
      "Start one helper agent and wait for its result. It works with a fresh context on one task and returns a short result with record ids. To run helpers at the same time, call start_helper several times in one message.",
      `At most ${limits.maxConcurrent} helpers run at once. A helper never speaks to the advocate and never approves anything.`,
      "Types: " + choices.map((t) => `${t.name}: ${t.description}`).join(" "),
      "The task must say the objective, what to read first, the output wanted and the limits.",
    ].join("\n"),
    parameters: Type.Object({
      type: Type.Unsafe<string>(StringEnum(choices.map((t) => t.name)) as never),
      task: Type.String({ description: "The objective, the records to start from, the output wanted, and the limits." }),
    }),
    execute: async (_id, params, signal, onUpdate, ctx) => {
      const type = choices.find((t) => t.name === params.type);
      if (!type) throw new Error(`This agent may not start a ${params.type} helper.`);
      const root = caller.root ?? (ctx as unknown as ToolContext);
      if (deps.slots.running >= limits.maxConcurrent) throw new Error(`${limits.maxConcurrent} helpers are already running. Wait for one to finish.`);
      deps.slots.running++;
      // The slot is free when the helper ends, or at once when the call is stopped.
      let freed = false;
      const free = () => {
        if (!freed) deps.slots.running--;
        freed = true;
      };
      signal?.addEventListener("abort", free, { once: true });
      try {
        return await runHelper(deps, type, params.task, root, signal, (text) => onUpdate?.({ content: [{ type: "text", text }], details: {} }), limits);
      } finally {
        signal?.removeEventListener("abort", free);
        free();
      }
    },
  });
}

async function runHelper(
  deps: HelperDeps,
  type: HelperType,
  task: string,
  root: ToolContext,
  signal: AbortSignal | undefined,
  progress: (text: string) => void,
  limits: typeof HELPER_LIMITS,
) {
  // The helper's tools: the caller's tools named in the type's allowlist, each run through the caller's hooks.
  const byName = new Map(root.tools.map((t) => [t.name, t]));
  const tools: ToolDefinition[] = [];
  for (const name of type.tools) {
    if (name === "start_helper") {
      tools.push(startHelperTool(deps, { type: type.name, root }));
      continue;
    }
    const t = byName.get(name);
    if (!t) continue;
    tools.push(
      defineTool({
        name: t.name,
        label: t.label ?? t.name,
        description: t.description,
        parameters: t.parameters as never,
        execute: async (_hid, args, s) => {
          progress(`${type.name}: ${t.name}`);
          const out = await root.executeTool(t.name, args, { signal: s });
          if (out.isError) throw new Error(out.result.content.map((c) => c.text ?? "").join("\n") || `${t.name} failed`);
          return { content: out.result.content as never, details: {} };
        },
      }),
    );
  }
  const session = await deps.createSession({ prompt: type.prompt, tools, thinkingLevel: type.thinkingLevel });
  const usage: HelperUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
  let turns = 0;
  let why: string | null = null;
  let last = "";
  const stop = (reason: string) => {
    why ??= reason;
    void session.abort();
  };
  const unsubscribe = session.subscribe((e) => {
    if (e.type === "turn_end" && ++turns >= limits.maxTurns) stop(`it reached ${limits.maxTurns} turns`);
    if (e.type === "message_end") {
      const m = e.message as { role?: string; content?: Array<{ type: string; text?: string }>; usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; totalTokens?: number; cost?: { total?: number } } };
      if (m.role !== "assistant") return;
      const text = (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      if (text.trim()) last = text;
      usage.input += m.usage?.input ?? 0;
      usage.output += m.usage?.output ?? 0;
      usage.cacheRead += m.usage?.cacheRead ?? 0;
      usage.cacheWrite += m.usage?.cacheWrite ?? 0;
      usage.totalTokens += m.usage?.totalTokens ?? 0;
      usage.cost += m.usage?.cost?.total ?? 0;
    }
  });
  const onAbort = () => stop("the advocate stopped it");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => stop(`it ran for ${Math.round(limits.timeoutMs / 60000)} minutes`), limits.timeoutMs);
  timer.unref?.();
  progress(`${type.name}: started`);
  try {
    if (signal?.aborted) throw new Error("Stopped by the advocate.");
    await session.prompt(task);
    await session.waitForIdle();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
    session.dispose();
  }
  if (signal?.aborted) throw new Error("Stopped by the advocate.");
  let text = last.trim() || "The helper returned no text.";
  if (text.length > limits.resultChars) text = `${text.slice(0, limits.resultChars)}\n\n[The helper's result was cut at ${limits.resultChars} characters.]`;
  if (why) text = `The helper was stopped because ${why}. Its last text:\n\n${text}`;
  progress(`${type.name}: finished`);
  return { content: [{ type: "text" as const, text: `${type.name} helper result:\n\n${text}` }], details: { type: type.name, turns }, usage: { ...usage, cost: { total: usage.cost } } as never };
}
