/**
 * Pi extensions in Open Advocate (decision 21; docs/specs/native-harness-parts.md).
 *
 * Two kinds: bundled extensions, which are the Pi packages in the application's `extensions/`
 * folder (today only the placeholder), and packages the advocate adds, which Pi's own package
 * manager installs into the application's Pi folder and records in its settings.json. Every
 * session loads them. The harness parts that were extensions are native code now. The tool
 * policy (src/main/tool-policy.ts) blocks Pi's built-in file and shell tools (decision 2).
 * Pi's agent folder is the application's own folder (decision 22). No Electron import here.
 */
import {
  DefaultPackageManager,
  DefaultResourceLoader,
  SettingsManager,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  initTheme,
  type ExtensionUIContext,
  type InlineExtension,
  type LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXTENSION_QUESTION_REASON, type ExtensionQuestion } from "../shared/api.ts";

/** Pi's built-in tools. They never run in Open Advocate (decision 2). */
export const BUILTIN_TOOL_NAMES = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"] as const;


export interface ExtensionInfo {
  /** The package name (bundled) or the source string (added). */
  id: string;
  kind: "bundled" | "added";
  version: string | null;
  source: string;
  enabled: boolean;
  /** Tools and commands seen at the last session load, and its error, if any. */
  tools: string[];
  commands: string[];
  error: string | null;
}

interface Bundled {
  name: string;
  version: string;
  dir: string;
  entries: string[];
}

export interface PiExtensionsOptions {
  /** The application's own Pi folder (not ~/.pi/agent). */
  agentDir: string;
  /** The application's extensions/ folder: one Pi package per folder. */
  bundledRoot: string;
  loadDisabled: () => string[];
  saveDisabled: (ids: string[]) => void;
}

export class PiExtensions {
  private options: PiExtensionsOptions;
  /** Last load result per resolved extension path. */
  private seen = new Map<string, { tools: string[]; commands: string[]; error: string | null }>();

  constructor(options: PiExtensionsOptions) {
    this.options = options;
  }

  /** The application's Pi settings (packages, compaction, MCP servers). File-backed in agentDir. */
  settings(): SettingsManager {
    return SettingsManager.create(this.options.agentDir, this.options.agentDir);
  }

  private packages(settings = this.settings()): DefaultPackageManager {
    return new DefaultPackageManager({ cwd: this.options.agentDir, agentDir: this.options.agentDir, settingsManager: settings });
  }

  /** The bundled packages: each folder of bundledRoot whose package.json names Pi extensions. */
  bundled(): Bundled[] {
    if (!existsSync(this.options.bundledRoot)) return [];
    const out: Bundled[] = [];
    for (const name of readdirSync(this.options.bundledRoot).sort()) {
      const dir = path.join(this.options.bundledRoot, name);
      try {
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string; version?: string; pi?: { extensions?: string[] } };
        const entries = pkg.pi?.extensions ?? [];
        if (entries.length) out.push({ name: pkg.name ?? name, version: pkg.version ?? "0.0.0", dir, entries });
      } catch {
        // Not a package.
      }
    }
    return out;
  }

  private enabledBundledPaths(): string[] {
    const off = new Set(this.options.loadDisabled());
    return this.bundled()
      .filter((b) => !off.has(b.name))
      .flatMap((b) => b.entries.map((e) => path.resolve(b.dir, e)));
  }

  /** The resource loader for one session. */
  async loader(input: { systemPrompt: string; extraFactories?: InlineExtension[] }): Promise<DefaultResourceLoader> {
    // The guard is the tool policy (src/main/tool-policy.ts), added by the agent to every session.
    const factories: InlineExtension[] = [{ name: "mcp", factory: createMcpExtension(), replaceable: true }, { name: "codemode", factory: createCodemodeExtension(), replaceable: true }, { name: "tool_search", factory: createToolSearchExtension(), replaceable: true }, ...(input.extraFactories ?? [])];
    const loader = new DefaultResourceLoader({
      cwd: this.options.agentDir,
      agentDir: this.options.agentDir,
      settingsManager: this.settings(),
      systemPrompt: input.systemPrompt,
      additionalExtensionPaths: this.enabledBundledPaths(),
      extensionFactories: factories,
    });
    await loader.reload();
    this.remember(loader.getExtensions());
    return loader;
  }

  private remember(result: LoadExtensionsResult): void {
    for (const e of result.extensions) this.seen.set(e.resolvedPath, { tools: [...e.tools.keys()], commands: [...e.commands.keys()], error: null });
    for (const err of result.errors) this.seen.set(path.resolve(err.path), { tools: [], commands: [], error: err.error });
  }

  private seenUnder(dir: string): { tools: string[]; commands: string[]; error: string | null } {
    const out = { tools: [] as string[], commands: [] as string[], error: null as string | null };
    const root = path.resolve(dir).toLowerCase();
    for (const [p, s] of this.seen) {
      if (!path.resolve(p).toLowerCase().startsWith(root)) continue;
      out.tools.push(...s.tools);
      out.commands.push(...s.commands);
      out.error ??= s.error;
    }
    return out;
  }

  list(): ExtensionInfo[] {
    const off = new Set(this.options.loadDisabled());
    const bundled: ExtensionInfo[] = this.bundled().map((b) => ({ id: b.name, kind: "bundled", version: b.version, source: `npm:${b.name}@${b.version}`, enabled: !off.has(b.name), ...this.seenUnder(b.dir) }));
    const pm = this.packages();
    const added: ExtensionInfo[] = pm.listConfiguredPackages().map((p) => {
      const dir = p.installedPath ?? pm.getInstalledPath(p.source, p.scope);
      let version: string | null = null;
      try {
        if (dir) version = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version?: string }).version ?? null;
      } catch {
        // Not installed yet.
      }
      const s = dir ? this.seenUnder(dir) : { tools: [], commands: [], error: "not installed" };
      return { id: p.source, kind: "added", version, source: p.source, enabled: true, ...s };
    });
    return [...bundled, ...added];
  }

  /** Install a package (npm:, git:, a URL or a local folder) and record it in the Pi settings. */
  async add(source: string): Promise<ExtensionInfo[]> {
    const clean = source.trim();
    if (!clean) throw new Error("Give a source: npm:<name>@<version>, git:<host>/<repo>@<ref>, or a folder.");
    await this.packages().installAndPersist(clean);
    return this.list();
  }

  async remove(source: string): Promise<ExtensionInfo[]> {
    await this.packages().removeAndPersist(source);
    return this.list();
  }

  setEnabled(id: string, enabled: boolean): ExtensionInfo[] {
    if (!this.bundled().some((b) => b.name === id)) throw new Error(`not a bundled extension: ${id}`);
    const off = new Set(this.options.loadDisabled());
    if (enabled) off.delete(id);
    else off.add(id);
    this.options.saveDisabled([...off]);
    return this.list();
  }
}

/** Where extension output goes: notices in the matter's chat, a status line per key, and questions. */
export interface ExtensionUiHost {
  notice(text: string): void;
  status(key: string, lines: string[] | undefined): void;
  /** H-12: the matter's open questions. Without it, a question gets its default answer at once. */
  questions?: ExtensionQuestions;
}

/** The longest text answer the window accepts for one question. */
const MAX_ANSWER = 100_000;

/** How a question ended. Only "answered" carries the advocate's value. */
export type QuestionEnd = { how: "answered"; value: string | boolean } | { how: "dismissed" | "expired" | "cancelled" };

/**
 * H-12: the open questions of one matter's Pi extensions. A question waits until the advocate
 * answers or dismisses it, its time runs out, or the extension cancels it. No Electron import.
 */
export class ExtensionQuestions {
  private open = new Map<string, { question: ExtensionQuestion; end: (e: QuestionEnd) => void }>();
  private onChange: (questions: ExtensionQuestion[]) => void;

  constructor(onChange: (questions: ExtensionQuestion[]) => void) {
    this.onChange = onChange;
  }

  list(): ExtensionQuestion[] {
    return [...this.open.values()].map((q) => q.question);
  }

  ask(spec: ExtensionQuestion["metadata"] & { title: string }, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<QuestionEnd> {
    const { title, ...metadata } = spec;
    if (opts.signal?.aborted) return Promise.resolve({ how: "cancelled" });
    const id = randomUUID();
    const timeout = typeof opts.timeout === "number" && opts.timeout > 0 ? opts.timeout : undefined;
    // The window shows text without terminal codes; the schema and the answer check use the same text.
    const shown: ExtensionQuestion["metadata"] = {
      ...metadata,
      ...(metadata.detail !== undefined ? { detail: plain(metadata.detail) } : {}),
      ...(metadata.options ? { options: metadata.options.map((o) => plain(String(o))) } : {}),
    };
    const question: ExtensionQuestion = {
      id,
      reason: EXTENSION_QUESTION_REASON,
      message: plain(title),
      responseSchema: schemaOf(shown),
      ...(timeout ? { expiresAt: new Date(Date.now() + timeout).toISOString() } : {}),
      metadata: shown,
    };
    return new Promise<QuestionEnd>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => end({ how: "cancelled" });
      const end = (e: QuestionEnd) => {
        if (!this.open.delete(id)) return;
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        this.onChange(this.list());
        resolve(e);
      };
      this.open.set(id, { question, end });
      if (timeout) timer = setTimeout(() => end({ how: "expired" }), timeout);
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      this.onChange(this.list());
    });
  }

  /** The advocate's answer. null dismisses the question. Throws on an unknown question or a wrong answer. */
  answer(id: string, value: string | boolean | null): void {
    const q = this.open.get(id);
    if (!q) throw new Error("QUESTION_CLOSED: the question is no longer open");
    if (value === null) return q.end({ how: "dismissed" });
    const { kind, options } = q.question.metadata;
    if (kind === "confirm") {
      if (typeof value !== "boolean") throw new Error("BAD_ANSWER: answer yes or no");
    } else if (typeof value !== "string") {
      throw new Error("BAD_ANSWER: the answer is text");
    } else if (kind === "select" && !options?.includes(value)) {
      throw new Error("BAD_ANSWER: choose one of the options");
    } else if (value.length > MAX_ANSWER) {
      throw new Error(`BAD_ANSWER: the answer is longer than ${MAX_ANSWER} characters`);
    }
    q.end({ how: "answered", value });
  }

  /** Every open question gets its default answer (Stop, a new conversation, a reload). */
  cancelAll(): void {
    for (const q of [...this.open.values()]) q.end({ how: "cancelled" });
  }
}

function schemaOf(m: ExtensionQuestion["metadata"]): Record<string, unknown> {
  if (m.kind === "confirm") return { type: "boolean" };
  if (m.kind === "select") return { type: "string", enum: m.options ?? [] };
  return { type: "string", maxLength: MAX_ANSWER };
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
const plain = (s: string) => s.replace(ANSI, "");

let themeReady = false;
function currentTheme(): unknown {
  if (!themeReady) {
    initTheme("dark");
    themeReady = true;
  }
  return (globalThis as Record<symbol, unknown>)[Symbol.for("@earendil-works/pi-coding-agent:theme")];
}

/**
 * The extension UI for the window. It follows Pi's RPC UI: notices and status lines work; a
 * terminal screen is shown once as text (harness-hardening H-11). A question (select, confirm,
 * input, editor) waits in the chat for the advocate's answer (H-12). A question that is
 * dismissed, cancelled or out of time gets its default answer; a notice says so when time runs out.
 */
export function extensionUi(host: ExtensionUiHost): ExtensionUIContext {
  type Opts = { signal?: AbortSignal; timeout?: number };
  const ask = async (spec: ExtensionQuestion["metadata"] & { title: string }, opts?: Opts): Promise<string | boolean | undefined> => {
    if (!host.questions) {
      host.notice(`An extension asked: "${plain(spec.title)}". This window cannot show the question, so it got the default answer.`);
      return undefined;
    }
    const end = await host.questions.ask(spec, opts);
    if (end.how === "answered") return end.value;
    if (end.how === "expired") host.notice(`The question "${plain(spec.title)}" ran out of time, so it got the default answer.`);
    return undefined;
  };
  const ui = {
    select: async (title: string, options: string[], opts?: Opts) => {
      const choices = (options ?? []).map(String);
      const v = await ask({ kind: "select", title, options: choices }, opts);
      // The extension receives its own option string, not the cleaned copy shown in the window.
      return typeof v === "string" ? choices[choices.map(plain).indexOf(v)] : undefined;
    },
    confirm: async (title: string, message: string, opts?: Opts) => (await ask({ kind: "confirm", title, ...(message ? { detail: message } : {}) }, opts)) === true,
    input: async (title: string, placeholder?: string, opts?: Opts) => {
      const v = await ask({ kind: "input", title, ...(placeholder ? { placeholder } : {}) }, opts);
      return typeof v === "string" ? v : undefined;
    },
    editor: async (title: string, prefill?: string) => {
      const v = await ask({ kind: "editor", title, ...(prefill ? { prefill } : {}) });
      return typeof v === "string" ? v : undefined;
    },
    notify: (message: string) => host.notice(plain(message)),
    onTerminalInput: () => () => {},
    setStatus: (key: string, text: string | undefined) => host.status(key, text === undefined ? undefined : [plain(text)]),
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (key: string, content: unknown) => {
      if (content === undefined) host.status(key, undefined);
      else if (Array.isArray(content)) host.status(key, content.map((l) => plain(String(l))));
    },
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    /** A terminal screen: render it once at 100 columns and show it as text. */
    custom: async (factory: (tui: unknown, theme: unknown, keys: unknown, done: (r: unknown) => void) => unknown) => {
      let finished: unknown;
      const tui = { requestRender: () => {}, stop: () => {}, start: () => {}, terminal: { columns: 100, rows: 40 }, setFocus: () => {} };
      const keys = { matches: () => false, getKeys: () => [], getHint: () => "" };
      try {
        const component = (await factory(tui, currentTheme(), keys, (r) => (finished = r))) as { render?: (w: number) => string[]; dispose?: () => void } | undefined;
        const lines = component?.render?.(100) ?? [];
        component?.dispose?.();
        if (lines.length) host.notice("```\n" + lines.map(plain).join("\n").replace(/```/g, "'''") + "\n```");
        else host.notice("This extension screen needs Pi's terminal interface. It has no text form in the window yet.");
      } catch (e) {
        host.notice(`This extension screen needs Pi's terminal interface (${(e as Error).message}).`);
      }
      return finished;
    },
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    get theme() {
      return currentTheme();
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Themes are not used in the window." }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
  return ui as unknown as ExtensionUIContext;
}
