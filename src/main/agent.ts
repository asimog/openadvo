/**
 * The agent: one Pi session per open matter, embedded in the main process (decision 2).
 *
 * The session gets only the tools in AGENT_TOOLS. Our own ResourceLoader loads no
 * extensions, skills, prompt templates or context files, so nothing else can add a tool.
 * The Pi session records agent activity; the matter store records only the session id
 * (decision 7). No Electron import here, so tests can run it in plain Node.
 */
import {
  ModelRuntime,
  SessionManager,
  getAgentDir,
  resolveCliModel,
  SettingsManager,
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  type AgentSession,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import type { AnchorRecord, PageRecord, SourceRecord, Notebook, NotebookEvent } from "../lib/matter-store/index.ts";
import type { ChatEvent, ChatMessage, ChatState, ModelChoice } from "../shared/api.ts";
import type { Api, Model } from "@earendil-works/pi-ai";

/** The allowlist. Step 1 has one read-only tool (spec rule 5). */
/** The allowlist. Every tool is read only (decision 2; step 1 rule 5). */
export const AGENT_TOOLS = ["list_sources", "read_source_text", "search_sources", "list_events", "get_chronology"] as const;

/** At most this many pages per read_source_text call, so one result never crowds the model out. */
export const MAX_PAGES_PER_READ = 10;

export interface AgentHost {
  listSources(matterId: string): Promise<SourceRecord[]>;
  listPages(matterId: string, sourceId: string, from: number, to: number): Promise<PageRecord[]>;
  searchLines(matterId: string, query: string, limit: number): Promise<AnchorRecord[]>;
  notebook(matterId: string): Promise<Notebook>;
  matterTitle(matterId: string): Promise<string>;
  recordSession(matterId: string, sessionId: string, model: string | null): Promise<void>;
  emit(event: ChatEvent): void;
  /** The model the advocate chose last ("provider/id"), or null. Not a secret. */
  loadModelKey(): string | null;
  saveModelKey(key: string): void;
}

export interface AgentOptions {
  /** Pi's own folder for this application. Never the owner's ~/.pi. */
  agentDir: string;
  /** "provider/model" from OPENADVO_MODEL. It wins over the saved choice. */
  model?: string;
}

function systemPrompt(title: string): string {
  return [
    "You are the Open Advocate agent. You work for an Advocate-on-Record of the Supreme Court of India.",
    `The open matter is: ${title}.`,
    "Your tools are read only: list_sources (the source files), read_source_text (the text of pages of one source, line by line) and search_sources (find a phrase; returns source, page and line).",
    "The Notebook holds dated events extracted by fixed rules: list_events (every field, with filters) and get_chronology (the events the advocate has not excluded, by date). Events are candidates until the advocate confirms them. You cannot confirm, reject or exclude anything.",
    "When you state a fact from a source, cite it as [source name, p. N, l. M]. OCR text is a single reading, not cross-checked: say so when you rely on it.",
    "You cannot add, change or delete anything in the matter. The advocate decides every legal point.",
    "When a request needs a capability you do not have, say so plainly. Never invent sources, hashes or facts.",
    "Write short, plain sentences.",
  ].join("\n");
}

const KIND_LABEL: Record<string, string> = {
  born_digital: "text layer",
  ocr: "OCR, single reading, not cross-checked",
  none: "no text found",
};

/** Find a source by id, exact name, or a unique part of its name. */
export function findSource(sources: SourceRecord[], ref: string): SourceRecord | string {
  const r = ref.trim().toLowerCase();
  const exact = sources.find((s) => s.id === ref || s.name.toLowerCase() === r);
  if (exact) return exact;
  const partial = sources.filter((s) => s.name.toLowerCase().includes(r));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return `"${ref}" matches ${partial.length} sources: ${partial.map((s) => s.name).join("; ")}. Name one exactly.`;
  return `No source matches "${ref}". Use list_sources to see the names.`;
}

export function formatPages(source: SourceRecord, pages: PageRecord[]): string {
  if (pages.length === 0) return `${source.name}: no page text is stored for that range yet. Text extraction may still be running.`;
  return pages
    .map((p) => {
      const head = `== ${source.name}, page ${p.page} (${KIND_LABEL[p.kind] ?? p.kind}${p.ocr ? `, confidence ${Math.round(p.ocr.confidence)}%` : ""})`;
      return [head, ...p.lines.map((l) => `[l. ${l.line}] ${l.text}`)].join("\n");
    })
    .join("\n\n");
}

export function formatEvent(e: NotebookEvent): string {
  const date = e.dateStart === e.dateEnd ? e.dateStart : `${e.dateStart} to ${e.dateEnd}`;
  const flags = [
    e.status,
    e.dateType !== "explicit" ? `date ${e.dateType}` : "",
    e.reading === "ocr" ? "OCR single reading" : "",
    e.excluded ? "excluded from the chronology" : "",
    e.conflicts.length ? "DATE CONFLICT open" : "",
  ].filter(Boolean).join(", ");
  return `${date} (${e.dateText}) [${e.kind}; ${flags}] ${e.description} — [${e.sourceName}, p. ${e.page}, l. ${e.line}] id ${e.id}`;
}

function formatSources(sources: SourceRecord[]): string {
  if (sources.length === 0) return "The matter has no sources.";
  const lines = sources.map(
    (s, i) => `${i + 1}. ${s.name} | sha256 ${s.sha256} | ${s.size} bytes | status ${s.status} | added ${s.origins} time(s)`,
  );
  return `${sources.length} source(s):\n${lines.join("\n")}`;
}

function keyOf(model: Model<Api>): string {
  return `${model.provider}/${model.id}`;
}

function resourceLoader(title: string): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt(title),
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

interface MatterChat {
  session: AgentSession;
  state: ChatState;
}

export class Agent {
  private host: AgentHost;
  private options: AgentOptions;
  private runtime: Promise<ModelRuntime> | null = null;
  private chats = new Map<string, Promise<MatterChat>>();

  constructor(host: AgentHost, options: AgentOptions) {
    this.host = host;
    this.options = options;
  }

  private selected: Promise<Model<Api> | undefined> | null = null;

  private modelRuntime(): Promise<ModelRuntime> {
    // Pi's own credential and model store, as the owner set it up (decisions.md choice 16).
    this.runtime ??= ModelRuntime.create();
    return this.runtime;
  }

  /**
   * The model for new sessions. Order: OPENADVO_MODEL, the advocate's saved choice,
   * Pi's own default model setting, then pi-ai's first available model.
   */
  private model(): Promise<Model<Api> | undefined> {
    this.selected ??= (async () => {
      const runtime = await this.modelRuntime();
      const wanted = this.options.model ?? this.host.loadModelKey() ?? undefined;
      if (wanted) {
        const r = resolveCliModel({ cliModel: wanted, modelRuntime: runtime });
        if (r.model && runtime.hasConfiguredAuth(r.model.provider)) return r.model;
      }
      const piSettings = SettingsManager.create(this.options.agentDir, getAgentDir());
      const provider = piSettings.getDefaultProvider();
      const id = piSettings.getDefaultModel();
      const available = await runtime.getAvailable();
      if (provider && id) {
        const found = available.find((m) => m.provider === provider && m.id === id);
        if (found) return found;
      }
      return available[0];
    })();
    return this.selected;
  }

  /** pi-ai's list of models that have credentials. */
  async listModels(): Promise<ModelChoice[]> {
    const runtime = await this.modelRuntime();
    const available = await runtime.getAvailable();
    return available.map((m) => ({ key: keyOf(m), provider: m.provider, id: m.id, name: m.name }));
  }

  async currentModel(): Promise<string | null> {
    const m = await this.model();
    return m ? keyOf(m) : null;
  }

  /** Select a model for every open session and for new ones. The choice is saved; Pi's own default is not changed. */
  async setModel(key: string): Promise<string> {
    const runtime = await this.modelRuntime();
    const available = await runtime.getAvailable();
    const model = available.find((m) => keyOf(m) === key);
    if (!model) throw new Error(`model not available: ${key}`);
    this.selected = Promise.resolve(model);
    this.host.saveModelKey(key);
    for (const chat of this.chats.values()) {
      const c = await chat.catch(() => null);
      if (!c) continue;
      await c.session.setModel(model);
      c.state.model = key;
    }
    return key;
  }

  private chat(matterId: string): Promise<MatterChat> {
    let chat = this.chats.get(matterId);
    if (!chat) {
      chat = this.start(matterId);
      chat.catch(() => this.chats.delete(matterId));
      this.chats.set(matterId, chat);
    }
    return chat;
  }

  private async start(matterId: string): Promise<MatterChat> {
    const title = await this.host.matterTitle(matterId);
    const host = this.host;
    const listSources = defineTool({
      name: "list_sources",
      label: "List sources",
      description: "List the source files of the open matter: name, SHA-256, size in bytes, status and how many times it was added.",
      parameters: Type.Object({}),
      execute: async () => {
        const sources = await host.listSources(matterId);
        return { content: [{ type: "text", text: formatSources(sources) }], details: { count: sources.length } };
      },
    });
    const readSourceText = defineTool({
      name: "read_source_text",
      label: "Read source text",
      description: `Read the stored text of pages of one source, line by line, with page and line numbers. At most ${MAX_PAGES_PER_READ} pages per call.`,
      parameters: Type.Object({
        source: Type.String({ description: "The source's name (or a unique part of it) or its id." }),
        from_page: Type.Optional(Type.Integer({ minimum: 1, description: "First page, default 1." })),
        to_page: Type.Optional(Type.Integer({ minimum: 1, description: "Last page." })),
      }),
      execute: async (_id, params) => {
        const found = findSource(await host.listSources(matterId), params.source);
        if (typeof found === "string") return { content: [{ type: "text", text: found }], details: { pages: 0 } };
        const from = params.from_page ?? 1;
        const to = Math.min(params.to_page ?? from + MAX_PAGES_PER_READ - 1, from + MAX_PAGES_PER_READ - 1);
        const pages = await host.listPages(matterId, found.id, from, to);
        return { content: [{ type: "text", text: formatPages(found, pages) }], details: { pages: pages.length } };
      },
    });
    const searchSources = defineTool({
      name: "search_sources",
      label: "Search sources",
      description: "Find lines that contain a phrase, in every source of the matter. Returns source, page, line and the line text.",
      parameters: Type.Object({
        query: Type.String({ description: "The phrase to find. Case does not matter." }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }),
      execute: async (_id, params) => {
        const sources = new Map((await host.listSources(matterId)).map((s) => [s.id, s.name]));
        const hits = await host.searchLines(matterId, params.query, params.limit ?? 30);
        const text = hits.length
          ? hits.map((h) => `[${sources.get(h.sourceId) ?? h.sourceId}, p. ${h.page}, l. ${h.line}] ${h.text}`).join("\n")
          : `No line contains "${params.query}".`;
        return { content: [{ type: "text", text }], details: { hits: hits.length } };
      },
    });
    const listEvents = defineTool({
      name: "list_events",
      label: "List Notebook events",
      description: "List the Notebook's dated events with every field: date, date type, kind, status, reading, conflicts and source line.",
      parameters: Type.Object({
        kind: Type.Optional(Type.Union([Type.Literal("procedural"), Type.Literal("factual")])),
        status: Type.Optional(Type.Union([Type.Literal("candidate"), Type.Literal("confirmed"), Type.Literal("rejected")])),
        from_date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        to_date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
      }),
      execute: async (_id, p) => {
        const nb = await host.notebook(matterId);
        const events = nb.events
          .filter((e) => (!p.kind || e.kind === p.kind) && (!p.status || e.status === p.status))
          .filter((e) => (!p.from_date || e.dateEnd >= p.from_date) && (!p.to_date || e.dateStart <= p.to_date))
          .slice(0, p.limit ?? 150);
        const head = `${events.length} of ${nb.events.length} events. Notebook ${nb.readiness.ready ? "ready" : `not ready (${nb.readiness.jobsPending} files still being read, ${nb.readiness.openReviewItems} review items open)`}.`;
        return { content: [{ type: "text", text: [head, ...events.map(formatEvent)].join("\n") }], details: { events: events.length } };
      },
    });
    const getChronology = defineTool({
      name: "get_chronology",
      label: "Get chronology",
      description: "The chronology: events the advocate has not excluded or rejected, in date order.",
      parameters: Type.Object({}),
      execute: async () => {
        const nb = await host.notebook(matterId);
        const events = nb.events.filter((e) => !e.excluded && e.status !== "rejected");
        return { content: [{ type: "text", text: events.length ? events.map(formatEvent).join("\n") : "The chronology is empty." }], details: { events: events.length } };
      },
    });
    const runtime = await this.modelRuntime();
    const model = await this.model();
    const { session } = await createAgentSession({
      cwd: this.options.agentDir,
      agentDir: this.options.agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: "off",
      resourceLoader: resourceLoader(title),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      sessionManager: SessionManager.inMemory(this.options.agentDir),
      tools: [...AGENT_TOOLS],
      customTools: [listSources, readSourceText, searchSources, listEvents, getChronology],
    });
    const active = session.getActiveToolNames();
    if (active.length !== AGENT_TOOLS.length || !AGENT_TOOLS.every((t) => active.includes(t))) {
      session.dispose();
      throw new Error(`agent tool allowlist violated: ${JSON.stringify(active)}`);
    }
    const modelName = session.model ? `${session.model.provider}/${session.model.id}` : null;
    await host.recordSession(matterId, session.sessionId, modelName);
    const state: ChatState = { messages: [], busy: false, model: modelName };
    if (!modelName) {
      state.messages.push({
        id: randomUUID(),
        role: "notice",
        text: "No model is available. Sign in to a model provider with Pi first.",
      });
    }
    return { session, state };
  }

  /** The active tool names of a matter's session. Used by tests and the startup check. */
  async toolNames(matterId: string): Promise<string[]> {
    return (await this.chat(matterId)).session.getActiveToolNames();
  }

  async sessionId(matterId: string): Promise<string> {
    return (await this.chat(matterId)).session.sessionId;
  }

  async getChat(matterId: string): Promise<ChatState> {
    const { state } = await this.chat(matterId);
    return { ...state, messages: [...state.messages] };
  }

  async send(matterId: string, text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    const chat = await this.chat(matterId);
    const { session, state } = chat;
    const push = (message: ChatMessage) => {
      state.messages.push(message);
      this.host.emit({ matterId, type: "message", message });
    };
    push({ id: randomUUID(), role: "advocate", text: clean });
    if (!session.model) {
      push({ id: randomUUID(), role: "notice", text: "The agent cannot answer: no model is available." });
      return;
    }
    if (state.busy) {
      push({ id: randomUUID(), role: "notice", text: "The agent is still working. Wait for the answer, then send again." });
      return;
    }
    state.busy = true;
    this.host.emit({ matterId, type: "busy", busy: true });
    let current: ChatMessage | null = null;
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        if (!current) {
          current = { id: randomUUID(), role: "agent", text: "" };
          push({ ...current });
        }
        current.text += event.assistantMessageEvent.delta;
        const target = state.messages.find((m) => m.id === current!.id);
        if (target) target.text = current.text;
        this.host.emit({ matterId, type: "delta", messageId: current.id, delta: event.assistantMessageEvent.delta });
      } else if (event.type === "message_end") {
        current = null;
      } else if (event.type === "tool_execution_start") {
        push({ id: randomUUID(), role: "tool", text: `Used tool: ${event.toolName}` });
      } else if (event.type === "tool_execution_end" && event.isError) {
        push({ id: randomUUID(), role: "tool", text: `Tool failed: ${event.toolName}` });
      }
    });
    try {
      await session.prompt(clean);
    } catch (e) {
      push({ id: randomUUID(), role: "notice", text: `The agent stopped with an error: ${(e as Error).message}` });
    } finally {
      unsubscribe();
      state.busy = false;
      this.host.emit({ matterId, type: "busy", busy: false });
    }
  }

  async disposeAll(): Promise<void> {
    for (const chat of this.chats.values()) {
      try {
        (await chat).session.dispose();
      } catch {
        // A session that failed to start has nothing to dispose.
      }
    }
    this.chats.clear();
  }
}
