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
import type { SourceRecord } from "../lib/matter-store/index.ts";
import type { ChatEvent, ChatMessage, ChatState, ModelChoice } from "../shared/api.ts";
import type { Api, Model } from "@earendil-works/pi-ai";

/** The allowlist. Step 1 has one read-only tool (spec rule 5). */
export const AGENT_TOOLS = ["list_sources"] as const;

export interface AgentHost {
  listSources(matterId: string): Promise<SourceRecord[]>;
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
    "You can read the matter's source list with the list_sources tool. You have no other tool.",
    "You cannot add, change or delete anything in the matter. The advocate decides every legal point.",
    "When a request needs a capability you do not have, say so plainly. Never invent sources, hashes or facts.",
    "Write short, plain sentences.",
  ].join("\n");
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
      customTools: [listSources],
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
