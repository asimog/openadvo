/**
 * Pi extensions in Open Advocate (docs/harness-hardening.md section 3; decision 22).
 *
 * Two kinds: bundled extensions, vendored at build time into resources/pi-extensions
 * (scripts/vendor-pi-extensions.ts), and packages the advocate adds, which Pi's own package
 * manager installs into the application's Pi folder and records in its settings.json.
 * Every session loads them (decision 25 removed the confidential exception). A host guard and
 * pi-permission-system block Pi's built-in file and shell tools (decisions 2, 24). Pi's agent
 * folder is the application's own folder (decision 23). No Electron import here.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Pi's built-in tools. They never run in Open Advocate (decision 2). */
export const BUILTIN_TOOL_NAMES = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"] as const;

/** The control tools of pi-subagent-manager. Helper agents may coordinate with these. */
const SUBAGENT_CONTROLS = ["agent_output", "agent_pause", "agent_status", "agent_steer", "agent_stop", "agent_types", "agent_update", "agent_wait"];
/** Files no tool may read or write, on every path-aware tool (pi-permission-system "path" rules). */
const CREDENTIAL_PATHS = ["*auth.json", "*.env", "*.env.*", "*/.ssh/*", "*manifest-signing.key", "*models.json"];
/** The agent types pi-subagent-manager ships. Each gets a host-owned overlay. */
const SUBAGENT_TYPES = ["architect", "coder", "researcher", "reviewer", "tasker", "writer"];

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
  /** resources/pi-extensions. */
  bundledRoot: string;
  loadDisabled: () => string[];
  saveDisabled: (ids: string[]) => void;
}

/** A host-owned file: written on every start so a change elsewhere never widens it. */
function writeOwned(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
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

  bundled(): Bundled[] {
    const lockFile = path.join(this.options.bundledRoot, "vendor.lock.json");
    if (!existsSync(lockFile)) return [];
    const lock = JSON.parse(readFileSync(lockFile, "utf8")) as { extensions: Record<string, { version: string; entries: string[] }> };
    return Object.entries(lock.extensions).map(([name, e]) => ({ name, version: e.version, dir: path.join(this.options.bundledRoot, "node_modules", name), entries: e.entries }));
  }

  private enabledBundledPaths(): string[] {
    const off = new Set(this.options.loadDisabled());
    return this.bundled()
      .filter((b) => !off.has(b.name))
      .flatMap((b) => b.entries.map((e) => path.resolve(b.dir, e)));
  }

  /**
   * pi-subagent-manager, least privilege: only listed tools; each bundled type may use the app's
   * tools and the manager's controls, never Pi's built-in tools; types inherit the chat's model;
   * no extension reloads inside a helper.
   */
  writeSubagentPolicy(appTools: readonly string[]): void {
    const base = path.join(this.options.agentDir, "subagent-manager");
    const settingsFile = path.join(base, "settings.json");
    let current: Record<string, unknown> = {};
    try {
      current = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    } catch {
      // No settings yet.
    }
    writeOwned(settingsFile, JSON.stringify({ ...current, toolFiltering: "allowed", subagentExtensions: false, housekeepingEnabled: false }, null, 2));
    const allow = [...appTools, ...SUBAGENT_CONTROLS].map((t) => `    - ${t}`).join("\n");
    for (const type of SUBAGENT_TYPES) {
      writeOwned(path.join(base, "agents", `${type}.yml`), `# Written by Open Advocate on every start. Pi's built-in tools stay off.\nmodels: null\ntools:\n  allow:\n${allow}\n  block:\n${BUILTIN_TOOL_NAMES.map((t) => `    - ${t}`).join("\n")}\n`);
    }
  }

  /** The policy file of @gotgenes/pi-permission-system. Pi's agent folder is agentDir (decision 23). */
  permissionPolicyFile(): string {
    return path.join(this.options.agentDir, "extensions", "pi-permission-system", "config.json");
  }

  /**
   * pi-permission-system (decision 24). Written on first start; the advocate may edit it. On every
   * start the safety rules are put back: Pi's built-in tools and every shell command are denied,
   * and credential files are denied on every path-aware tool. Everything else defaults to allow,
   * because an "ask" in the window gets the default answer (harness-hardening H-13). The review
   * log stays on and is written in the application's Pi folder, never in ~/.pi/agent.
   */
  writePermissionPolicy(): void {
    const file = this.permissionPolicyFile();
    let current: { permission?: Record<string, unknown> } & Record<string, unknown> = {};
    try {
      current = JSON.parse(readFileSync(file, "utf8")) as typeof current;
    } catch {
      current = {
        permissionReviewLog: true,
        debugLog: false,
        yoloMode: false,
        permission: { "*": "allow", mcp: { "*": "allow" }, skill: { "*": "allow" }, external_directory: "allow" },
      };
    }
    const permission = { ...(current.permission ?? {}) };
    for (const t of BUILTIN_TOOL_NAMES) if (t !== "bash") permission[t] = "deny";
    permission.bash = { "*": "deny" };
    const paths: Record<string, unknown> = typeof permission.path === "object" && permission.path ? { ...(permission.path as Record<string, unknown>) } : { "*": "allow" };
    for (const p of CREDENTIAL_PATHS) paths[p] = "deny";
    permission.path = paths;
    writeOwned(file, JSON.stringify({ ...current, yoloMode: false, permission }, null, 2) + "\n");
  }

  /** The resource loader for one session. */
  async loader(input: { systemPrompt: string; extraFactories?: InlineExtension[] }): Promise<DefaultResourceLoader> {
    const guard: InlineExtension = {
      name: "openadvo-policy",
      hidden: true,
      factory: (pi) => {
        const blocked = new Set<string>(BUILTIN_TOOL_NAMES);
        pi.on("tool_call", (event) => (blocked.has(event.toolName) ? { block: true, reason: "Pi's built-in file and shell tools are off in Open Advocate." } : undefined));
      },
    };
    const factories: InlineExtension[] = [guard, { name: "mcp", factory: createMcpExtension(), replaceable: true }, { name: "codemode", factory: createCodemodeExtension(), replaceable: true }, { name: "tool_search", factory: createToolSearchExtension(), replaceable: true }, ...(input.extraFactories ?? [])];
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

/** Where extension output goes: notices in the matter's chat, and a status line per key. */
export interface ExtensionUiHost {
  notice(text: string): void;
  status(key: string, lines: string[] | undefined): void;
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
 * terminal screen is shown once as text; a question to the advocate is not supported yet and
 * gets its default answer, with a notice that says so (harness-hardening H-12).
 */
export function extensionUi(host: ExtensionUiHost): ExtensionUIContext {
  const unsupported = (what: string, title: string) => host.notice(`An extension asked: "${title}". ${what} from an extension is not built yet, so it got the default answer.`);
  const ui = {
    select: async (title: string) => (unsupported("Choosing an option", title), undefined),
    confirm: async (title: string) => (unsupported("Confirming", title), false),
    input: async (title: string) => (unsupported("Typing an answer", title), undefined),
    editor: async (title: string) => (unsupported("Editing text", title), undefined),
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
