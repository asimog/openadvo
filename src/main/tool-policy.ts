/**
 * The tool policy (docs/specs/native-harness-parts.md section 2): a native part of the harness.
 * One `tool_call` hook in every session decides each call: allow, ask
 * (an approval card in the chat) or deny. Pi's built-in tools and credential paths are always
 * denied (decision 2). Helper calls run through the parent's tools, so the same hook checks them.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";

export type Rule = "allow" | "ask" | "deny";

export interface ToolPolicy {
  /** The rule for a tool with no rule of its own. */
  default: Rule;
  tools: Record<string, Rule>;
}

export const DEFAULT_POLICY: ToolPolicy = { default: "allow", tools: {} };

/** Pi's built-in tools. They never run in Open Advocate (decision 2). */
export const ALWAYS_DENIED = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"] as const;

/** Argument text that names a credential file. Such a call is refused on every tool. */
const CREDENTIAL = [/auth\.json/i, /(^|[\\/])\.env($|[.\\/])/i, /[\\/]\.ssh[\\/]/i, /manifest-signing\.key/i, /models\.json/i];

function isRule(v: unknown): v is Rule {
  return v === "allow" || v === "ask" || v === "deny";
}

/** A policy read from untrusted JSON: unknown values become the defaults. */
export function cleanPolicy(v: unknown): ToolPolicy {
  const o = (v && typeof v === "object" ? v : {}) as { default?: unknown; tools?: unknown };
  const tools: Record<string, Rule> = {};
  if (o.tools && typeof o.tools === "object") for (const [k, r] of Object.entries(o.tools as Record<string, unknown>)) if (isRule(r) && /^[\w.:-]{1,80}$/.test(k)) tools[k] = r;
  return { default: isRule(o.default) ? o.default : DEFAULT_POLICY.default, tools };
}

/** Every string in the arguments, at any depth. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

export interface Decision {
  rule: Rule;
  /** Why a deny is a deny; shown to the model. */
  reason?: string;
}

/** The rule for one call. The fixed denials come first; the file cannot loosen them. */
export function decide(policy: ToolPolicy, toolName: string, args: unknown): Decision {
  if ((ALWAYS_DENIED as readonly string[]).includes(toolName)) return { rule: "deny", reason: "Pi's built-in file and shell tools are off in Open Advocate." };
  if (strings(args).some((s) => CREDENTIAL.some((re) => re.test(s)))) return { rule: "deny", reason: "A call that names a credential file is refused." };
  const rule = policy.tools[toolName] ?? policy.default;
  return rule === "deny" ? { rule, reason: `The advocate's tool policy refuses ${toolName}.` } : { rule };
}

/** The policy file and the review log, in the application's user data. */
export class PolicyStore {
  private file: string;
  private logFile: string;

  constructor(file: string, logFile: string) {
    this.file = file;
    this.logFile = logFile;
  }

  read(): ToolPolicy {
    try {
      return cleanPolicy(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return { ...DEFAULT_POLICY, tools: {} };
    }
  }

  write(policy: ToolPolicy): ToolPolicy {
    const clean = cleanPolicy(policy);
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(clean, null, 2) + "\n");
    return clean;
  }

  /** Write the defaults when there is no file yet. */
  ensure(): void {
    try {
      readFileSync(this.file);
    } catch {
      this.write(DEFAULT_POLICY);
    }
  }

  /** One line per deny or ask. Never the arguments. */
  log(entry: { conversation: string; tool: string; rule: Rule; outcome: string; reason?: string }): void {
    try {
      mkdirSync(path.dirname(this.logFile), { recursive: true });
      appendFileSync(this.logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
    } catch {
      // The log never stops a run.
    }
  }
}

export type Approval = "once" | "conversation" | "refuse";

export const APPROVAL_OPTIONS: Record<Approval, string> = {
  once: "Allow once",
  conversation: "Allow for this conversation",
  refuse: "Refuse",
};

/**
 * The guard of one session. `ask` shows the approval card and waits; Stop or a new conversation
 * cancels it, which refuses. "Allow for this conversation" is kept for the session's life only.
 */
export function policyExtension(opts: {
  store: PolicyStore;
  conversation: string;
  label: (toolName: string) => string;
  ask: (title: string, signal: AbortSignal | undefined) => Promise<Approval>;
}): InlineExtension {
  return {
    name: "openadvo-policy",
    hidden: true,
    factory: (pi) => {
      const allowed = new Set<string>();
      pi.on("tool_call", async (event, ctx) => {
        const d = decide(opts.store.read(), event.toolName, event.input);
        if (d.rule === "allow") return undefined;
        if (d.rule === "deny") {
          opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "deny", outcome: "refused", reason: d.reason });
          return { block: true, reason: d.reason };
        }
        if (allowed.has(event.toolName)) return undefined;
        const answer = await opts.ask(`The agent wants to use ${opts.label(event.toolName)}.`, (ctx as { signal?: AbortSignal }).signal);
        opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "ask", outcome: answer });
        if (answer === "conversation") allowed.add(event.toolName);
        if (answer === "refuse") return { block: true, reason: "The advocate refused this call." };
        return undefined;
      });
    },
  };
}
