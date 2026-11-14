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
import { EventType, type AGUIEvent } from "@ag-ui/core";
import { CHAT_MESSAGE_EVENT } from "../shared/api.ts";
import type { ChatEvent, ChatMessage, ChatState, EffortLevel, EffortState, ModelChoice } from "../shared/api.ts";

type ThinkingLevel = EffortLevel;
const EFFORT_LEVELS: readonly EffortLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
import type { Api, Model } from "@earendil-works/pi-ai";
import type { DraftCheck, DraftKind, ParagraphSource, RevisionRecord } from "../shared/records.ts";

/** One correction the agent proposed in a run, as the AG-UI interrupt reports it. */
export interface ProposedCorrection {
  draftId: string;
  title: string;
  revisionId: string;
  seq: number;
  anchor: string;
  before: string;
  after: string;
  substantive: boolean;
  reason: string;
}

/** The AG-UI interrupt reason for an agent change the advocate must keep or undo. */
export const DRAFT_CHANGE_INTERRUPT = "openadvo.draft_change";

/** One AG-UI interrupt per proposed change. The answer is keep or undo, given by a bridge function. */
export function draftChangeInterrupts(proposals: ProposedCorrection[]) {
  return proposals.map((p) => ({
    id: `${p.revisionId}:${p.anchor}`,
    reason: DRAFT_CHANGE_INTERRUPT,
    message: `Keep or undo the agent's change to a paragraph of ${p.title}.`,
    responseSchema: { type: "object", properties: { decision: { enum: ["keep", "undo"] } }, required: ["decision"] },
    metadata: { ...p },
  }));
}

/**
 * The allowlist (decision 2). Every tool reads, except propose_correction, which writes only a
 * proposal: tracked changes in a new revision that keep nothing until the advocate decides
 * (editor-design items a, e; decision 5 keeps Keep and Undo off this list).
 */
export const AGENT_TOOLS = [
  "list_sources",
  "read_source_text",
  "search_sources",
  "list_events",
  "get_chronology",
  "read_draft",
  "get_paragraph_source",
  "check_draft",
  "propose_correction",
] as const;

/** At most this many pages per read_source_text call, so one result never crowds the model out. */
export const MAX_PAGES_PER_READ = 10;

/** One draft of the matter, as `read_draft` returns it. */
export interface AgentDraft {
  draftId: string;
  kind: DraftKind;
  title: string;
  revision: RevisionRecord;
  paragraphs: Array<{ anchor: string | null; text: string; eventIds: string[] }>;
}

export interface AgentHost {
  listSources(matterId: string): Promise<SourceRecord[]>;
  listPages(matterId: string, sourceId: string, from: number, to: number): Promise<PageRecord[]>;
  searchLines(matterId: string, query: string, limit: number): Promise<AnchorRecord[]>;
  notebook(matterId: string): Promise<Notebook>;
  drafts(matterId: string, kind?: DraftKind): Promise<AgentDraft[]>;
  paragraphSource(matterId: string, anchor: string): Promise<ParagraphSource | null>;
  checkDraft(matterId: string, draftId: string): Promise<DraftCheck>;
  proposeCorrection(
    matterId: string,
    input: { draftId: string; anchor: string; expected: string; replacement: string; reason: string },
    sessionId: string,
  ): Promise<{ revision: RevisionRecord; before: string; after: string; substantive: boolean }>;
  matterTitle(matterId: string): Promise<string>;
  recordSession(matterId: string, sessionId: string, model: string | null): Promise<void>;
  emit(event: ChatEvent): void;
  /** The model the advocate chose last ("provider/id"), or null. Not a secret. */
  loadModelKey(): string | null;
  saveModelKey(key: string): void;
  /** The reasoning effort the advocate chose last, or null. */
  loadEffort(): string | null;
  saveEffort(level: string): void;
}

/** The application's default model (owner, 2026-11-14; decisions.md choice 17). Used when it has credentials. */
export const DEFAULT_MODEL = "opencode-go/deepseek-v4.1-flash";

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
    "The drafts are the generated List of Dates and the Synopsis: read_draft reads the live text of the latest revision of each draft, with the anchor of every paragraph, and get_paragraph_source follows one anchor to its Notebook events and source lines. No model writes the generated text.",
    "check_draft runs the fixed factual checks on the latest stored revision of one draft and lists each defect with its evidence.",
    "propose_correction proposes new text for one paragraph. It becomes a tracked change by you in a new revision. Nothing is kept until the advocate keeps or undoes it; you cannot keep or undo. Give the paragraph's exact current text as expected_text. Propose only what the sources or the Notebook support, and give the reason with its source line.",
    "When you state a fact from a source, cite it as [source name, p. N, l. M]. OCR text is a single reading, not cross-checked: say so when you rely on it.",
    "Apart from proposals, you cannot add, change or delete anything in the matter. The advocate decides every legal point.",
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

export function formatDraft(d: AgentDraft): string {
  const head = `== ${d.title} (${d.kind}), revision ${d.revision.seq}, sha256 ${d.revision.sha256}`;
  return [head, ...d.paragraphs.map((p) => (p.anchor ? `[anchor ${p.anchor}] ${p.text}` : `[no anchor] ${p.text}`))].join("\n");
}

export function formatCheck(c: DraftCheck, title: string): string {
  const head = `${title}, revision ${c.seq}: ${c.statementsChecked} statement(s) checked, ${c.defects.length} defect(s). Method: ${c.method}. Gate: ${c.gate?.label ?? "not computed"}.`;
  const defects = c.defects.map(
    (d) => `- [${d.kind}] paragraph ${d.paragraph}${d.anchor ? ` (anchor ${d.anchor})` : ""}: ${d.text}\n  Evidence: ${d.evidence}\n  Action: ${d.action}`,
  );
  const notRun = c.notRun.map((n) => `- Not run: ${n.check}. ${n.reason}`);
  return [head, ...defects, ...notRun].join("\n");
}

export function formatParagraphSource(s: ParagraphSource): string {
  const head = `Paragraph ${s.anchor}. ${s.events.length} Notebook event(s):`;
  return [
    head,
    ...s.events.map((e) => {
      const date = e.dateStart === e.dateEnd ? e.dateStart : `${e.dateStart} to ${e.dateEnd}`;
      const reading = e.reading === "ocr" ? ", OCR single reading" : "";
      return `${date} (${e.dateText}) ${e.description} — [${e.sourceName}, p. ${e.page}, l. ${e.line}${reading}] id ${e.id}`;
    }),
  ].join("\n");
}

function formatSources(sources: SourceRecord[]): string {  if (sources.length === 0) return "The matter has no sources.";
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
  /** Corrections proposed in the current run. They become the run's AG-UI interrupts. */
  proposals: ProposedCorrection[];
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
   * the application default (DEFAULT_MODEL), Pi's own default model setting,
   * then pi-ai's first available model.
   */
  private model(): Promise<Model<Api> | undefined> {
    this.selected ??= (async () => {
      const runtime = await this.modelRuntime();
      const wanted = this.options.model ?? this.host.loadModelKey() ?? undefined;
      if (wanted) {
        const r = resolveCliModel({ cliModel: wanted, modelRuntime: runtime });
        if (r.model && runtime.hasConfiguredAuth(r.model.provider)) return r.model;
      }
      const ours = (await runtime.getAvailable()).find((m) => keyOf(m) === DEFAULT_MODEL);
      if (ours) return ours;
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

  /** The reasoning effort for new sessions: the advocate's saved choice, else "off". */
  private effort(): ThinkingLevel {
    const saved = this.host.loadEffort();
    return (EFFORT_LEVELS as readonly string[]).includes(saved ?? "") ? (saved as ThinkingLevel) : "off";
  }

  /**
   * The reasoning effort in use and the levels the current model accepts.
   * A model with no reasoning accepts only "off". An open session reports what it really uses.
   */
  async getEffort(): Promise<EffortState> {
    for (const chat of this.chats.values()) {
      const c = await chat.catch(() => null);
      if (c) return { level: c.session.thinkingLevel, available: c.session.getAvailableThinkingLevels() };
    }
    const model = await this.model();
    const wanted = this.effort();
    if (!model?.reasoning) return { level: "off", available: ["off"] };
    return { level: wanted, available: [...EFFORT_LEVELS] };
  }

  /** Set the reasoning effort for every open session and for new ones. The session clamps it to what its model accepts. */
  async setEffort(level: string): Promise<EffortState> {
    if (!(EFFORT_LEVELS as readonly string[]).includes(level)) throw new Error(`unknown reasoning effort: ${level}`);
    this.host.saveEffort(level);
    for (const chat of this.chats.values()) {
      const c = await chat.catch(() => null);
      if (c) c.session.setThinkingLevel(level as ThinkingLevel);
    }
    return this.getEffort();
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
    const readDraft = defineTool({
      name: "read_draft",
      label: "Read draft",
      description: "Read the live text of the latest revision of the List of Dates and the Synopsis, paragraph by paragraph, with the anchor of each paragraph.",
      parameters: Type.Object({
        kind: Type.Optional(Type.Union([Type.Literal("list_of_dates"), Type.Literal("synopsis")])),
      }),
      execute: async (_id, params) => {
        const drafts = await host.drafts(matterId, params.kind);
        const text = drafts.length
          ? drafts.map(formatDraft).join("\n\n")
          : "The matter has no draft yet. The advocate generates one from confirmed Notebook events.";
        return { content: [{ type: "text", text }], details: { drafts: drafts.length } };
      },
    });
    const getParagraphSource = defineTool({
      name: "get_paragraph_source",
      label: "Get paragraph source",
      description: "Follow one paragraph anchor (from read_draft) to its Notebook events and their source lines.",
      parameters: Type.Object({
        anchor: Type.String({ description: "The anchor of one draft paragraph." }),
      }),
      execute: async (_id, params) => {
        const source = await host.paragraphSource(matterId, params.anchor);
        const text = source ? formatParagraphSource(source) : `No paragraph link matches "${params.anchor}". Use read_draft to see the anchors.`;
        return { content: [{ type: "text", text }], details: { events: source?.events.length ?? 0 } };
      },
    });
    const draftOfKind = async (kind: DraftKind) => (await host.drafts(matterId, kind))[0];
    const draftKind = Type.Union([Type.Literal("list_of_dates"), Type.Literal("synopsis")]);
    const checkDraftTool = defineTool({
      name: "check_draft",
      label: "Check draft",
      description: "Run the fixed factual checks on the latest stored revision of one draft: source links, dates against the Notebook, and agreement between the List of Dates and the Synopsis.",
      parameters: Type.Object({ draft: draftKind }),
      execute: async (_id, params) => {
        const draft = await draftOfKind(params.draft);
        if (!draft) return { content: [{ type: "text", text: "That draft does not exist yet." }], details: { defects: 0 } };
        const result = await host.checkDraft(matterId, draft.draftId);
        return { content: [{ type: "text", text: formatCheck(result, draft.title) }], details: { defects: result.defects.length } };
      },
    });
    const proposeCorrection = defineTool({
      name: "propose_correction",
      label: "Propose correction",
      description:
        "Propose new text for one paragraph of a draft. It is written as a tracked change by the agent in a new revision. The advocate keeps or undoes it. Fails when expected_text is not the paragraph's current text, or the paragraph already has an undecided change.",
      parameters: Type.Object({
        draft: draftKind,
        anchor: Type.String({ description: "The paragraph anchor, from read_draft." }),
        expected_text: Type.String({ description: "The paragraph's exact current text, from read_draft." }),
        new_text: Type.String({ description: "The whole new text of the paragraph." }),
        reason: Type.String({ description: "Why, with the source line that supports it." }),
      }),
      execute: async (_id, params) => {
        const draft = await draftOfKind(params.draft);
        if (!draft) return { content: [{ type: "text", text: "That draft does not exist yet." }], details: { proposed: false } };
        const chat = await this.chats.get(matterId);
        const result = await host.proposeCorrection(
          matterId,
          { draftId: draft.draftId, anchor: params.anchor, expected: params.expected_text, replacement: params.new_text, reason: params.reason },
          chat?.session.sessionId ?? "",
        );
        chat?.proposals.push({
          draftId: draft.draftId,
          title: draft.title,
          revisionId: result.revision.id,
          seq: result.revision.seq,
          anchor: params.anchor,
          before: result.before,
          after: result.after,
          substantive: result.substantive,
          reason: params.reason,
        });
        const text = `Proposed as a tracked change in ${draft.title}, revision ${result.revision.seq}${result.substantive ? " (substantive: the advocate decides it on its own)" : ""}. The advocate will keep or undo it.`;
        return { content: [{ type: "text", text }], details: { proposed: true } };
      },
    });
    const runtime = await this.modelRuntime();
    const model = await this.model();
    const { session } = await createAgentSession({
      cwd: this.options.agentDir,
      agentDir: this.options.agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: this.effort(),
      resourceLoader: resourceLoader(title),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      sessionManager: SessionManager.inMemory(this.options.agentDir),
      tools: [...AGENT_TOOLS],
      customTools: [listSources, readSourceText, searchSources, listEvents, getChronology, readDraft, getParagraphSource, checkDraftTool, proposeCorrection],
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
    return { session, state, proposals: [] };
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
    const emit = (event: Record<string, unknown>) => this.host.emit({ matterId, event: { timestamp: Date.now(), ...event } as unknown as AGUIEvent });
    /** A message of the application itself (the advocate's text, a notice): stored, and sent as a CUSTOM event. */
    const push = (message: ChatMessage) => {
      state.messages.push(message);
      emit({ type: EventType.CUSTOM, name: CHAT_MESSAGE_EVENT, value: message });
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
    const threadId = session.sessionId;
    const runId = randomUUID();
    chat.proposals = [];
    state.busy = true;
    emit({ type: EventType.RUN_STARTED, threadId, runId });
    let current: ChatMessage | null = null;
    let failure: string | null = null;
    const endText = () => {
      if (current) emit({ type: EventType.TEXT_MESSAGE_END, messageId: current.id });
      current = null;
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        if (!current) {
          current = { id: randomUUID(), role: "agent", text: "" };
          state.messages.push(current);
          emit({ type: EventType.TEXT_MESSAGE_START, messageId: current.id, role: "assistant" });
        }
        const delta = event.assistantMessageEvent.delta;
        current.text += delta;
        // AG-UI refuses an empty delta.
        if (delta) emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: current.id, delta });
      } else if (event.type === "message_end") {
        endText();
        // A failed model call ends the turn without an exception. It becomes RUN_ERROR; never silence.
        const ended = event.message as { role?: string; stopReason?: string; errorMessage?: string };
        if (ended.role === "assistant" && ended.stopReason === "error") failure = `The model call failed: ${ended.errorMessage || "no reason given"}`;
      } else if (event.type === "tool_execution_start") {
        endText();
        state.messages.push({ id: event.toolCallId, role: "tool", text: `Used tool: ${event.toolName}` });
        emit({ type: EventType.TOOL_CALL_START, toolCallId: event.toolCallId, toolCallName: event.toolName });
      } else if (event.type === "tool_execution_end") {
        emit({ type: EventType.TOOL_CALL_END, toolCallId: event.toolCallId });
        if (event.isError) push({ id: randomUUID(), role: "tool", text: `Tool failed: ${event.toolName}` });
      }
    });
    try {
      await session.prompt(clean);
    } catch (e) {
      failure = `The agent stopped with an error: ${(e as Error).message}`;
    } finally {
      unsubscribe();
      endText();
      state.busy = false;
      if (failure) {
        state.messages.push({ id: randomUUID(), role: "notice", text: failure });
        emit({ type: EventType.RUN_ERROR, message: failure });
      } else if (chat.proposals.length > 0) {
        // Human in the loop (decisions.md choice 21): the run waits for the advocate. Each
        // interrupt is one agent change. The answer is a bridge function (decision 5), and the
        // next run on the thread is an ordinary run.
        const interrupts = draftChangeInterrupts(chat.proposals);
        state.messages.push({
          id: randomUUID(),
          role: "notice",
          text: `The agent proposed ${interrupts.length} change(s). Keep or undo each one.`,
        });
        emit({ type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: "interrupt", interrupts } });
      } else {
        emit({ type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: "success" } });
      }
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
