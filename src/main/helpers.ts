/**
 * Helpers (docs/specs/native-harness-parts.md section 3): a native part of the harness.
 * A `HelperManager` holds the helpers of one conversation: foreground and background jobs,
 * steering, Stop, the wait for results, the Final Recap and the files under `chat/helpers/`.
 * Every tool call of a helper runs through the calling agent's `ctx.executeTool`, so the tool
 * policy and the nested call id apply. A helper never starts a turn of the parent: a finished
 * result waits for the advocate.
 */
import { defineTool, type AgentSession, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HELPER_LIMITS, HELPER_TYPES, type HelperType } from "./helper-types.ts";
import type { HelperEventView, HelperView } from "../shared/api.ts";

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
  /** A fresh session with this prompt and these tools, on the conversation's model. */
  createSession(input: { prompt: string; tools: ToolDefinition[]; thinkingLevel: HelperType["thinkingLevel"] }): Promise<AgentSession>;
  /** Helpers running now in this conversation, at every depth. */
  slots: { running: number };
  limits?: Partial<typeof HELPER_LIMITS>;
}

export interface HelperToolNotice {
  id: string;
  helper: { id: string; name: string; type: string };
  name: string;
  target?: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  error?: string;
}

export interface HelperManagerOptions {
  chatDir: string;
  limits?: Partial<typeof HELPER_LIMITS>;
  /** The conversation's model, for the record. */
  model(): string;
  createSession(input: { prompt: string; tools: ToolDefinition[]; thinkingLevel: HelperType["thinkingLevel"]; helperId: string }): Promise<AgentSession>;
  /** The parent's last ~30k characters of conversation, as a frozen block for a fork. */
  parentContext(): string;
  /** A text line in the parent's chat, with the helper event the window groups. */
  text(line: string, event?: HelperEventView): void;
  /** One tool call of a helper, for its card (ChatToolCalls). Called at start and at end. */
  tool?(event: HelperToolNotice): void;
  /** The helpers as the window shows them, after any change. */
  changed(views: HelperView[]): void;
  /** Cost per helper, with the conversation (host.recordUsage). */
  usage(usage: HelperUsage & { model: string }, sessionId: string, helper: { id: string; name: string; type: string }): Promise<void>;
}

interface HelperRecord {
  id: string;
  /** The id of the start_helper call that made it, for the tool calls it runs. */
  callId: string;
  name: string;
  type: HelperType;
  background: boolean;
  state: HelperView["state"];
  /** Its result waits for "Use results" or the advocate's next message. */
  waiting: boolean;
  startedAt: string;
  endedAt?: string;
  task: string;
  question?: string;
  output: string;
  usage: HelperUsage;
  sessionId: string;
  turns: number;
  /** The lifecycle has ended; a late event must not change it again. */
  settled: boolean;
}

const HELPER_FILE = "helpers.json";
const HELPER_DIR = "helpers";

/** The test-only values (native-parts prompt section 5): set only when OPENADVO_TEST=1. */
export function testNumber(name: string, fallback: number): number {
  if (process.env.OPENADVO_TEST !== "1") return fallback;
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** A short name from the task, not the type. */
export function nameFromTask(task: string, given?: string): string {
  const asked = (given ?? "").trim();
  if (asked) return asked.slice(0, 48);
  const flat = task.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  const cut = flat.split(/[.;:]/)[0] ?? flat;
  let words = cut.split(" ").slice(0, 7);
  // A name does not end on a joining word.
  const stop = new Set(["the", "a", "an", "of", "to", "and", "or", "for", "on", "in", "with", "from", "at", "by"]);
  while (words.length > 1 && stop.has((words.at(-1) ?? "").toLowerCase().replace(/[^a-z]/g, ""))) words = words.slice(0, -1);
  const name = words.join(" ");
  if (name.length <= 48) return name || "Helper";
  const at = name.slice(0, 48).lastIndexOf(" ");
  return `${(at > 12 ? name.slice(0, at) : name.slice(0, 48)).trimEnd()}…`;
}

/** The short target of a helper's tool call, for its card. */
export function shortTarget(args: unknown): string | undefined {
  const o = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const any = pick(o.task) ?? pick(o.query) ?? pick(o.url) ?? pick(o.source) ?? pick(o.citation) ?? pick(o.title) ?? pick(o.text) ?? pick(o.field) ?? pick(o.helper) ?? pick(o.ref);
  if (!any) return undefined;
  return any.length > 120 ? `${any.slice(0, 117).trimEnd()}…` : any;
}

function page(text: string, chars: number, n: number): { text: string; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(text.length / chars));
  const at = Math.min(Math.max(1, Math.floor(n || 1)), pages);
  return { text: text.slice((at - 1) * chars, at * chars), pages, page: at };
}

/** A time for a text line: seconds under a minute, minutes above. */
export function duration(ms: number): string {
  return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} second${Math.round(ms / 1000) === 1 ? "" : "s"}` : `${Math.round(ms / 60_000)} minutes`;
}

/** One conversation's helpers. */
export class HelperManager {
  private opts: HelperManagerOptions;
  private limits: typeof HELPER_LIMITS;
  private records = new Map<string, HelperRecord>();
  private sessions = new Map<string, AgentSession>();
  /** The helper's answer waiter while it has an open question. */
  private answers = new Map<string, (answer: string) => void>();
  /** The foreground caller's waiter, so Stop ends it at once. */
  private finishes = new Map<string, (why: "done" | "question") => void>();
  private slots = { running: 0 };
  /** Background helpers started since the last recap; a recap needs more than one. */
  private backgroundStarted = 0;

  constructor(opts: HelperManagerOptions) {
    this.opts = opts;
    this.limits = { ...HELPER_LIMITS, ...opts.limits };
  }

  /** The helpers as the window shows them, oldest first. */
  views(): HelperView[] {
    return [...this.records.values()].map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type.name,
      background: r.background,
      state: r.state,
      waiting: r.waiting,
      question: r.question,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    }));
  }

  /** The helper behind a tool call of the parent (a nested call id), or undefined. */
  forCall(callId: string): { id: string; name: string; type: string } | undefined {
    for (const r of this.records.values()) {
      if (r.callId && (callId === r.callId || callId.startsWith(`${r.callId}/`))) return { id: r.id, name: r.name, type: r.type.name };
    }
    return undefined;
  }

  /** After a restart a running helper is interrupted, with the partial output it left. */
  async restore(): Promise<number> {
    let saved: Array<Partial<HelperRecord> & { typeName?: string }> = [];
    try {
      saved = JSON.parse(await readFile(path.join(this.opts.chatDir, HELPER_FILE), "utf8"));
    } catch {
      return 0;
    }
    let interrupted = 0;
    for (const s of Array.isArray(saved) ? saved : []) {
      const type = HELPER_TYPES.find((t) => t.name === s.typeName || t.name === (s.type as unknown as string));
      if (!type || !s.id || !s.startedAt) continue;
      const wasRunning = s.state === "running";
      if (wasRunning) interrupted++;
      this.records.set(s.id, {
        id: String(s.id),
        callId: String(s.callId ?? ""),
        name: String(s.name ?? nameFromTask(String(s.task ?? ""))),
        type,
        background: s.background === true,
        state: wasRunning ? "interrupted" : ((s.state as HelperView["state"]) ?? "interrupted"),
        waiting: wasRunning ? false : s.waiting === true,
        startedAt: String(s.startedAt),
        endedAt: s.endedAt ? String(s.endedAt) : undefined,
        task: String(s.task ?? ""),
        question: wasRunning ? undefined : s.question ? String(s.question) : undefined,
        output: String(s.output ?? ""),
        usage: s.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
        sessionId: String(s.sessionId ?? ""),
        turns: Number(s.turns ?? 0),
        settled: true,
      });
    }
    if (this.records.size) this.opts.changed(this.views());
    if (interrupted) {
      const names = [...this.records.values()].filter((r) => r.state === "interrupted").map((r) => r.name);
      this.opts.text(`Interrupted: ${names.join(", ")}. ${interrupted === 1 ? "A helper was" : "Helpers were"} running when the application closed. Partial output is in ${HELPER_DIR}/.`);
    }
    return interrupted;
  }

  /**
   * Start one helper. A foreground helper returns its result (or its question) when it ends; after
   * the wait limit it becomes a background job. A background helper returns its job id at once.
   */
  async start(type: HelperType, task: string, input: { background?: boolean; forkContext?: boolean; name?: string }, root: ToolContext, signal?: AbortSignal, callId = ""): Promise<string> {
    if (this.slots.running >= this.limits.maxConcurrent) throw new Error(`${this.limits.maxConcurrent} helpers are already running. Wait for one to finish.`);
    const id = randomUUID();
    const record: HelperRecord = {
      id,
      callId,
      name: nameFromTask(task, input.name),
      type,
      background: input.background === true,
      state: "running",
      waiting: false,
      startedAt: new Date().toISOString(),
      task,
      output: "",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
      sessionId: "",
      turns: 0,
      settled: false,
    };
    this.records.set(id, record);
    this.slots.running++;
    if (record.background) this.backgroundStarted++;
    this.opts.text(`Helper ${record.name} (${type.name}) started${record.background ? ` in the background, job ${id.slice(0, 8)}` : ""}.`, { id, name: record.name, type: type.name, event: "started" });
    this.opts.changed(this.views());
    await this.persist();

    let finish!: (why: "done" | "question") => void;
    const finished = new Promise<"done" | "question">((resolve) => (finish = resolve));
    this.finishes.set(id, finish);
    const run = this.run(record, type, task, input.forkContext === true, root, signal, finish).catch((e) => {
      if (!record.settled) {
        record.state = signal?.aborted ? "stopped" : "failed";
        record.endedAt = new Date().toISOString();
        record.output ||= `The helper failed: ${(e as Error).message}`;
        this.opts.text(`Helper ${record.name} failed: ${(e as Error).message}`, { id, name: record.name, type: type.name, event: "failed", detail: (e as Error).message });
        record.settled = true;
        this.slots.running = Math.max(0, this.slots.running - 1);
      }
      finish("done");
    });

    if (record.background) {
      void run;
      return `Helper ${record.name} started in the background (job ${id}). Its result waits; the advocate's next message or "Use results" brings it to you. Do not wait for it.`;
    }

    // Foreground: wait for the result, or until the wait limit turns it into a background job.
    const waitMs = testNumber("OPENADVO_TEST_HELPER_WAIT_MS", this.limits.foregroundWaitMs);
    let timer: NodeJS.Timeout | undefined;
    const waited = await Promise.race([
      finished,
      new Promise<"wait">((resolve) => {
        timer = setTimeout(() => resolve("wait"), waitMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    if (waited === "wait") {
      record.background = true;
      this.backgroundStarted++;
      await this.persist();
      this.opts.changed(this.views());
      void run;
      return `Helper ${record.name} is still working after ${duration(waitMs)}. It is now a background job (${id}); its result waits for the advocate's next message or "Use results".`;
    }
    if (waited === "question") return this.questionText(record);
    return this.resultText(record);
  }

  private async run(record: HelperRecord, type: HelperType, task: string, fork: boolean, root: ToolContext, signal: AbortSignal | undefined, finish: (why: "done" | "question") => void): Promise<void> {
    const tools = this.helperTools(record, type, root);
    const forkBlock = fork ? `\n\n<parent-conversation>\n${this.opts.parentContext()}\n</parent-conversation>\n\nA copy of the parent's conversation is above. It is frozen: it is not your conversation, and you cannot change it.` : "";
    const session = await this.opts.createSession({ prompt: `${type.prompt}${forkBlock}`, tools, thinkingLevel: type.thinkingLevel, helperId: record.id });
    if (record.settled) {
      session.dispose();
      finish("done");
      return;
    }
    record.sessionId = session.sessionId;
    this.sessions.set(record.id, session);
    let why: string | null = null;
    let last = "";
    const stop = (reason: string) => {
      why ??= reason;
      void session.abort();
      // An idle helper waits on an answer; the sentinel lets the loop end.
      this.answers.get(record.id)?.("");
    };
    const onAbort = () => stop("the advocate stopped it");
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeoutMs = testNumber("OPENADVO_TEST_HELPER_TIMEOUT_MS", this.limits.timeoutMs);
    const timeout = setTimeout(() => stop(`it ran for ${duration(timeoutMs)}`), timeoutMs);
    timeout.unref?.();
    const unsubscribe = session.subscribe((e) => {
      if (e.type === "turn_end" && ++record.turns >= this.limits.maxTurns) stop(`it reached ${this.limits.maxTurns} turns`);
      if (e.type === "message_end") {
        const m = e.message as {
          role?: string;
          content?: Array<{ type: string; text?: string }>;
          usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; totalTokens?: number; cost?: { total?: number } };
        };
        if (m.role !== "assistant") return;
        const text = (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        if (text.trim()) last = text;
        record.usage.input += m.usage?.input ?? 0;
        record.usage.output += m.usage?.output ?? 0;
        record.usage.cacheRead += m.usage?.cacheRead ?? 0;
        record.usage.cacheWrite += m.usage?.cacheWrite ?? 0;
        record.usage.totalTokens += m.usage?.totalTokens ?? 0;
        record.usage.cost += m.usage?.cost?.total ?? 0;
      }
    });
    try {
      let next = task;
      for (;;) {
        if (why || signal?.aborted || record.settled) break;
        await session.prompt(next);
        await session.waitForIdle();
        if (!record.question) break;
        // It handed back a question. The foreground call already returned it; the parent's
        // answer (steer_helper) or the advocate's arrives here and resumes the same session.
        finish("question");
        const answer = await new Promise<string>((resolve) => this.answers.set(record.id, resolve));
        this.answers.delete(record.id);
        if (!answer || why || record.settled) break;
        record.question = undefined;
        record.state = "running";
        this.opts.changed(this.views());
        next = answer;
      }
    } catch (e) {
      why ??= (e as Error).message;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      this.answers.delete(record.id);
    }
    if (record.settled) {
      session.dispose();
      this.finishes.delete(record.id);
      finish("done");
      return;
    }
    record.settled = true;
    record.output = last.trim() || record.output || "The helper returned no text.";
    await this.opts.usage({ model: this.opts.model(), ...record.usage }, session.sessionId, { id: record.id, name: record.name, type: record.type.name }).catch(() => undefined);
    this.sessions.delete(record.id);
    this.slots.running = Math.max(0, this.slots.running - 1);
    session.dispose();
    record.endedAt = new Date().toISOString();
    record.waiting = record.background && why === null;
    record.state = signal?.aborted || why === "the advocate stopped it" ? "stopped" : why ? "failed" : "done";
    const note = why ? ` (stopped because ${why})` : "";
    this.opts.text(`Helper ${record.name} ${record.state === "done" ? "finished" : record.state}${note}.${record.waiting ? " Its result waits for the advocate's next message or Use results." : ""}`, {
      id: record.id,
      name: record.name,
      type: record.type.name,
      event: record.state === "done" ? "finished" : record.state === "failed" ? "failed" : "stopped",
      detail: why ?? undefined,
    });
    await this.writePartial(record);
    await this.persist();
    this.opts.changed(this.views());
    this.finishes.delete(record.id);
    finish("done");
    this.finalRecap();
  }

  private helperTools(record: HelperRecord, type: HelperType, root: ToolContext): ToolDefinition[] {
    const byName = new Map(root.tools.map((t) => [t.name, t]));
    const tools: ToolDefinition[] = [];
    for (const name of type.tools) {
      if (name === "start_helper") {
        if (type.name !== "legal-research") continue;
        tools.push(this.startTool({ type: type.name, root }) as never);
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
            // A helper's tool call is shown in its own card, at start and at end. The parent's
            // event stream does not carry a background helper's calls after start_helper returned.
            const noticeId = `helper-tool-${randomUUID()}`;
            const startedAt = Date.now();
            const helper = { id: record.id, name: record.name, type: record.type.name };
            this.opts.tool?.({ id: noticeId, helper, name: t.name, target: shortTarget(args), status: "running" });
            let reported = false;
            try {
              const out = await root.executeTool(t.name, args, { signal: s });
              const text = out.result.content.map((c) => c.text ?? "").join("\n").trim();
              if (out.isError) {
                this.opts.tool?.({ id: noticeId, helper, name: t.name, target: shortTarget(args), status: "error", durationMs: Date.now() - startedAt, error: (text || `${t.name} failed`).slice(0, 300) });
                reported = true;
                throw new Error(text || `${t.name} failed`);
              }
              this.opts.tool?.({ id: noticeId, helper, name: t.name, target: shortTarget(args), status: "done", durationMs: Date.now() - startedAt });
              reported = true;
              return { content: out.result.content as never, details: {} };
            } catch (e) {
              if (!reported) this.opts.tool?.({ id: noticeId, helper, name: t.name, target: shortTarget(args), status: "error", durationMs: Date.now() - startedAt, error: (e as Error).message.slice(0, 300) });
              throw e;
            }
          },
        }),
      );
    }
    // The two tools every helper has (native-parts prompt section 2.2).
    tools.push(
      defineTool({
        name: "helper_update",
        label: "Report progress",
        description: "Send one short line of progress to the agent that started you. It appears in the advocate's chat. Use it at each milestone, not for every step.",
        parameters: Type.Object({ text: Type.String({ description: "One short line." }) }),
        execute: async (_id, p) => {
          const line = p.text.trim();
          if (!line) return { content: [{ type: "text" as const, text: "Nothing to report." }], details: {} };
          this.opts.text(`Helper ${record.name}: ${line}`, { id: record.id, name: record.name, type: record.type.name, event: "progress", detail: line });
          return { content: [{ type: "text" as const, text: "Reported." }], details: {} };
        },
      }),
      defineTool({
        name: "helper_ask",
        label: "Ask the parent",
        description: "Stop and put one question to the agent that started you. Use it only when the answer changes what you do. The agent answers with steer_helper, which resumes you.",
        parameters: Type.Object({ question: Type.String({ description: "One question, with what you need to continue." }) }),
        execute: async (_id, p) => {
          record.question = p.question.trim();
          this.opts.text(`Helper ${record.name} asks: ${record.question}`, { id: record.id, name: record.name, type: record.type.name, event: "question", detail: record.question });
          void this.persist();
          this.opts.changed(this.views());
          return { content: [{ type: "text" as const, text: "Your question went to the agent. Stop here; the answer resumes you." }], details: {}, terminate: true };
        },
      }),
    );
    return tools;
  }

  /** The start_helper tool, for a Matter Agent (type null) or a legal-research helper. */
  startTool(caller: { type: string | null; root?: ToolContext }): ToolDefinition {
    const allowed = caller.type === null ? HELPER_TYPES.map((t) => t.name) : caller.type === "legal-research" ? ["record-reader"] : [];
    const choices = HELPER_TYPES.filter((t) => allowed.includes(t.name));
    return defineTool({
      name: "start_helper",
      label: "Start helper",
      description: [
        "Start one helper agent on one task. It works on a fresh context, or with a frozen copy of this conversation (fork_context), and returns a short result with record ids.",
        `At most ${this.limits.maxConcurrent} helpers run at once, ${this.limits.maxTurns} turns and ${Math.round(this.limits.timeoutMs / 60000)} minutes each. A helper never speaks to the advocate and never approves anything.`,
        "Background (background: true): it returns a job id at once; its result waits for the advocate's next message or Use results, and never starts a turn. To run several foreground helpers at the same time, call start_helper several times in one message.",
        "Types: " + choices.map((t) => `${t.name}: ${t.description}`).join(" "),
        "The task must say the objective, what to read first, the output wanted and the limits.",
      ].join("\n"),
      parameters: Type.Object({
        type: Type.Unsafe<string>(StringEnum(choices.map((t) => t.name)) as never),
        task: Type.String({ description: "The objective, the records to start from, the output wanted, and the limits." }),
        background: Type.Optional(Type.Boolean({ description: "Run it in the background and return a job id at once." })),
        fork_context: Type.Optional(Type.Boolean({ description: "Give it a frozen copy of this conversation (last 30k characters), for example for a critic." })),
        name: Type.Optional(Type.String({ description: "A short name for the helper. It comes from the task when you give none." })),
      }),
      execute: async (_id, params, signal, _onUpdate, ctx) => {
        const type = choices.find((t) => t.name === params.type);
        if (!type) throw new Error(`This agent may not start a ${params.type} helper.`);
        const root = caller.root ?? (ctx as unknown as ToolContext);
        const text = await this.start(type, params.task, { background: params.background, forkContext: params.fork_context, name: params.name }, root, signal, _id);
        return { content: [{ type: "text" as const, text }], details: { type: type.name } };
      },
    });
  }

  /** One page of a helper's output, as the helper_output tool returns it. A long result is never cut. */
  outputText(id: string, pageNumber = 1): string {
    const record = this.records.get(id);
    if (!record) throw new Error(`No helper ${id} in this conversation.`);
    const p = page(record.output || "The helper has not reported any output yet.", this.limits.resultChars, pageNumber);
    const head = `Helper ${record.name} (${record.state}): page ${p.page} of ${p.pages}.\n\n`;
    return `${head}${p.text}${p.pages > 1 ? `\n\n[Page ${p.page} of ${p.pages}. Call helper_output with helper "${record.id}" and page ${p.page < p.pages ? p.page + 1 : p.page} for the rest.]` : ""}`;
  }

  /** An instruction to a running helper, or the answer to its question. */
  async steer(id: string, text: string): Promise<void> {
    const record = this.records.get(id);
    const session = this.sessions.get(id);
    if (!record) throw new Error(`No helper ${id} in this conversation.`);
    const instruction = text.trim();
    if (!instruction) throw new Error("The instruction is empty.");
    if (!session) throw new Error(`Helper ${record.name} is not running.`);
    if (record.question) {
      this.opts.text(`Helper ${record.name} was answered and continues.`, { id: record.id, name: record.name, type: record.type.name, event: "progress", detail: "answered and continues" });
      this.answers.get(id)?.(instruction);
      return;
    }
    await session.steer(instruction);
    this.opts.text(`Helper ${record.name} was steered: ${instruction}`, { id: record.id, name: record.name, type: record.type.name, event: "progress", detail: `steered: ${instruction}` });
  }

  /** Stop one helper. */
  async stop(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`No helper ${id} in this conversation.`);
    if (record.settled || !this.sessions.has(id)) return;
    record.state = "stopped";
    record.waiting = false;
    record.endedAt = new Date().toISOString();
    record.settled = true;
    this.slots.running = Math.max(0, this.slots.running - 1);
    this.answers.get(id)?.("");
    this.answers.delete(id);
    this.finishes.get(id)?.("done");
    this.finishes.delete(id);
    // Do not wait for a model call that ignores the abort: Stop ends the call at once.
    void this.sessions.get(id)?.abort().catch(() => undefined);
    this.sessions.delete(id);
    this.opts.text(`Helper ${record.name} stopped by the advocate.`, { id: record.id, name: record.name, type: record.type.name, event: "stopped", detail: "stopped by the advocate" });
    await this.writePartial(record);
    await this.persist();
    this.opts.changed(this.views());
  }

  /** Stop on the chat stops every helper of the conversation. */
  async stopAll(): Promise<number> {
    const running = [...this.records.values()].filter((r) => !r.settled && this.sessions.has(r.id));
    await Promise.all(running.map((r) => this.stop(r.id)));
    return running.length;
  }

  /** The ready results, as one block for the parent agent. They are then delivered. */
  takeResults(): { count: number; text: string } {
    const ready = [...this.records.values()].filter((r) => r.waiting);
    if (!ready.length) return { count: 0, text: "" };
    const body = ready.map((r) => `### ${r.name} (${r.type.name}, ${r.state})\n${r.output}`).join("\n\n");
    for (const r of ready) r.waiting = false;
    this.backgroundStarted = 0;
    this.opts.changed(this.views());
    void this.persist();
    return { count: ready.length, text: `Results of ${ready.length} background helper${ready.length === 1 ? "" : "s"}:\n\n${body}` };
  }

  /** A helper that asked has no result; the question went to the parent and the chat. */
  private questionText(record: HelperRecord): string {
    return `${record.type.name} helper ${record.name} stopped to ask a question. Answer it with steer_helper (helper ${record.id}), which resumes the same session:\n\n${record.question ?? "No question was given."}`;
  }

  private resultText(record: HelperRecord): string {
    if (record.output.length <= this.limits.resultChars) return `${record.type.name} helper result (${record.name}):\n\n${record.output}`;
    return `${record.type.name} helper result (${record.name}): page 1 of ${Math.ceil(record.output.length / this.limits.resultChars)}.\n\n${record.output.slice(0, this.limits.resultChars)}\n\n[The result is long. Call helper_output with helper "${record.id}" and page 2 to read the rest.]`;
  }

  /** One notice when every background helper has finished. */
  private finalRecap(): void {
    if (this.backgroundStarted < 2) return;
    const backgrounds = [...this.records.values()].filter((r) => r.background);
    if (backgrounds.some((r) => !r.settled)) return;
    const waiting = backgrounds.filter((r) => r.waiting).length;
    this.backgroundStarted = 0;
    this.opts.text(`Final recap: ${backgrounds.length} background helpers finished (${backgrounds.map((r) => `${r.name}: ${r.state}`).join(", ")}).${waiting ? ` ${waiting} result${waiting === 1 ? "" : "s"} wait for the advocate's next message or Use results.` : ""}`, { event: "recap" });
  }

  private async writePartial(record: HelperRecord): Promise<void> {
    try {
      const dir = path.join(this.opts.chatDir, HELPER_DIR);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${record.id}.txt`), record.output);
    } catch {
      // A record that cannot be written never stops a run.
    }
  }

  private async persist(): Promise<void> {
    try {
      await mkdir(this.opts.chatDir, { recursive: true });
      const saved = [...this.records.values()].map((r) => ({
        id: r.id,
        callId: r.callId,
        name: r.name,
        type: r.type.name,
        typeName: r.type.name,
        background: r.background,
        state: r.state,
        waiting: r.waiting,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        task: r.task,
        question: r.question,
        output: r.output,
        usage: r.usage,
        sessionId: r.sessionId,
        turns: r.turns,
      }));
      await writeFile(path.join(this.opts.chatDir, HELPER_FILE), JSON.stringify(saved, null, 2));
    } catch {
      // Never fail a run for a file.
    }
  }

  /** Tests: the helpers and their output. */
  all(): Array<{ id: string; name: string; state: string; waiting: boolean; question?: string; output: string }> {
    return [...this.records.values()].map((r) => ({ id: r.id, name: r.name, state: r.state, waiting: r.waiting, question: r.question, output: r.output }));
  }
}

/** The tools of a Matter Agent that reach its helpers (native-parts prompt section 2.2). */
export function helperTools(manager: HelperManager): ToolDefinition[] {
  return [
    manager.startTool({ type: null }),
    defineTool({
      name: "helper_output",
      label: "Read a helper's output",
      description: `Read one page (${HELPER_LIMITS.resultChars} characters) of a helper's output or partial output. A long result is read in pages, never cut.`,
      parameters: Type.Object({
        helper: Type.String({ description: "The helper id." }),
        page: Type.Optional(Type.Integer({ minimum: 1, description: "The page, starting at 1." })),
      }),
      execute: async (_id, p) => ({ content: [{ type: "text" as const, text: manager.outputText(p.helper, p.page ?? 1) }], details: {} }),
    }),
    defineTool({
      name: "stop_helper",
      label: "Stop a helper",
      description: "Stop one running helper of this conversation.",
      parameters: Type.Object({ helper: Type.String({ description: "The helper id." }) }),
      execute: async (_id, p) => {
        await manager.stop(p.helper);
        return { content: [{ type: "text" as const, text: `Helper ${p.helper} stopped.` }], details: {} };
      },
    }),
    defineTool({
      name: "steer_helper",
      label: "Steer a helper",
      description: "Add one instruction to a running helper, or answer the question it stopped to ask. The helper continues in the same session.",
      parameters: Type.Object({
        helper: Type.String({ description: "The helper id." }),
        text: Type.String({ description: "The instruction or the answer." }),
      }),
      execute: async (_id, p) => {
        await manager.steer(p.helper, p.text);
        return { content: [{ type: "text" as const, text: `Helper ${p.helper} received the instruction.` }], details: {} };
      },
    }),
  ];
}
