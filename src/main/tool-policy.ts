/**
 * The tool policy (docs/specs/native-harness-parts.md section 2): a native part of the harness.
 * One `tool_call` hook in every session decides each call: allow, ask
 * (an approval card in the chat) or deny. Pi's built-in tools and credential paths are always
 * denied (decision 2). Helper calls run through the parent's tools, so the same hook checks them.
 *
 * A deny is final. An ask waits in a queue, one at a time. A party name in a web query or a URL
 * asks first (the party rule). An MCP server or tool has its own rule. An error in the hook
 * blocks the call (fail closed), never allows it.
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

/** Tools whose arguments may name a party of the matter. */
export const PARTY_TOOLS = ["web_search", "web_fetch"] as const;

function isRule(v: unknown): v is Rule {
  return v === "allow" || v === "ask" || v === "deny";
}

/** A policy read from untrusted JSON: unknown values become the defaults. */
export function cleanPolicy(v: unknown): ToolPolicy {
  const o = (v && typeof v === "object" ? v : {}) as { default?: unknown; tools?: unknown };
  const tools: Record<string, Rule> = {};
  if (o.tools && typeof o.tools === "object") for (const [k, r] of Object.entries(o.tools as Record<string, unknown>)) if (isRule(r) && /^[\w.:*_-]{1,80}$/.test(k)) tools[k] = r;
  return { default: isRule(o.default) ? o.default : DEFAULT_POLICY.default, tools };
}

/** Every string in the arguments, at any depth. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

/** The rule of a tool: its own, then its MCP server's, then the default. */
export function ruleFor(policy: ToolPolicy, toolName: string): Rule {
  if (policy.tools[toolName]) return policy.tools[toolName];
  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (mcp) {
    const server = mcp[1];
    const serverRule = policy.tools[`mcp__${server}__*`] ?? policy.tools[`mcp__${server}`] ?? policy.tools["mcp__*"];
    if (serverRule) return serverRule;
  }
  return policy.default;
}

export interface Decision {
  rule: Rule;
  /** Why a deny is a deny; shown to the model. */
  reason?: string;
}

/** A party name that the arguments contain, or null. Names shorter than three characters are ignored. */
export function partyIn(args: unknown, parties: readonly string[]): string | null {
  const text = strings(args).join("\n").toLowerCase();
  for (const p of parties) {
    const name = p.trim().toLowerCase();
    if (name.length >= 3 && text.includes(name)) return p;
  }
  return null;
}

/** The rule for one call. The fixed denials come first; the file cannot loosen them. */
export function decide(policy: ToolPolicy, toolName: string, args: unknown, opts?: { parties?: readonly string[]; partyRule?: boolean }): Decision {
  if ((ALWAYS_DENIED as readonly string[]).includes(toolName)) return { rule: "deny", reason: "Pi's built-in file and shell tools are off in Open Advocate." };
  if (strings(args).some((s) => CREDENTIAL.some((re) => re.test(s)))) return { rule: "deny", reason: "A call that names a credential file is refused." };
  const rule = ruleFor(policy, toolName);
  if (rule === "deny") return { rule, reason: `The advocate's tool policy refuses ${toolName}.` };
  if (rule === "ask") return { rule };
  if ((PARTY_TOOLS as readonly string[]).includes(toolName) && opts?.partyRule !== false) {
    const party = partyIn(args, opts?.parties ?? []);
    if (party) return { rule: "ask", reason: `The call names ${party}, a party to this matter.` };
  }
  return { rule };
}

/** What the approval card says the call will do: the tool, and its query, URL or field. */
export function describeCall(toolName: string, args: unknown): string {
  const o = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const first = (...keys: string[]): string | null => {
    for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
    return null;
  };
  if (toolName === "web_search") {
    const q = first("query", "q");
    if (q) return ` Query: “${q.slice(0, 500)}”.`;
  }
  if (toolName === "web_fetch") {
    const u = first("url", "href");
    if (u) return ` URL: ${u.slice(0, 500)}.`;
  }
  const field = first("field", "selector", "label");
  if (field) return ` Field: “${field.slice(0, 200)}”.`;
  const text = first("text", "value", "query", "citation");
  if (text) return ` With: “${text.slice(0, 200)}”.`;
  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (mcp) return ` MCP server ${mcp[1]}, tool ${mcp[2]}.`;
  return "";
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

/** Ten minutes: an unanswered approval for a background helper's call refuses. */
export const BACKGROUND_APPROVAL_MS = 10 * 60_000;

function approvalTimeout(): number {
  if (process.env.OPENADVO_TEST !== "1") return BACKGROUND_APPROVAL_MS;
  const n = Number(process.env.OPENADVO_TEST_APPROVAL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : BACKGROUND_APPROVAL_MS;
}

/**
 * The guard of one session. `ask` shows the approval card and waits; Stop or a new conversation
 * cancels it, which refuses. "Allow for this conversation" is kept for the session's life only.
 * Calls wait in a queue, one approval at a time.
 */
export function policyExtension(opts: {
  store: PolicyStore;
  conversation: string;
  label: (toolName: string) => string;
  ask: (title: string, signal: AbortSignal | undefined) => Promise<Approval>;
  /** The parties of the open matter, for the party rule. */
  parties?: () => readonly string[];
  /** The party rule is on unless the advocate turned it off. */
  partyRule?: () => boolean;
  /** A `policy` line for trace.jsonl, for each ask and deny. */
  trace?: (line: { tool: string; rule: Rule; outcome: string; reason?: string }) => void;
  /** A text line in the chat when a call is refused. */
  notice?: (text: string) => void;
}): InlineExtension {
  return {
    name: "openadvo-policy",
    hidden: true,
    factory: (pi) => {
      const allowed = new Set<string>();
      /** One approval at a time: each ask waits for the one before it. */
      let queue: Promise<unknown> = Promise.resolve();
      const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
        const next = queue.then(work, work);
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      };
      pi.on("tool_call", async (event, ctx) => {
        try {
          const d = decide(opts.store.read(), event.toolName, event.input, { parties: opts.parties?.() ?? [], partyRule: opts.partyRule?.() });
          if (d.rule === "allow") return undefined;
          if (d.rule === "deny") {
            opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "deny", outcome: "refused", reason: d.reason });
            opts.trace?.({ tool: event.toolName, rule: "deny", outcome: "refused", reason: d.reason ? "policy or fixed denial" : undefined });
            opts.notice?.(`The tool policy refused ${opts.label(event.toolName)}. ${d.reason ?? ""}`.trim());
            return { block: true, reason: d.reason };
          }
          if (allowed.has(event.toolName)) return undefined;
          const detail = describeCall(event.toolName, event.input);
          const why = d.reason ? ` ${d.reason}` : "";
          const title = `The agent wants to use ${opts.label(event.toolName)}.${why}${detail}`;
          const answer = await oneAtATime(async () => {
            const parent = (ctx as { signal?: AbortSignal }).signal;
            // A background helper has no turn of its own: an unanswered card refuses after ten minutes.
            if (!event.parentToolCallId) return { answer: await opts.ask(title, parent), timedOut: false };
            let timedOut = false;
            const control = new AbortController();
            const timer = setTimeout(() => {
              timedOut = true;
              control.abort();
            }, approvalTimeout());
            timer.unref?.();
            const onAbort = () => control.abort();
            parent?.addEventListener("abort", onAbort, { once: true });
            try {
              return { answer: await opts.ask(title, control.signal), timedOut };
            } finally {
              clearTimeout(timer);
              parent?.removeEventListener("abort", onAbort);
            }
          });
          if (answer.timedOut) {
            opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "ask", outcome: "timeout" });
            opts.trace?.({ tool: event.toolName, rule: "ask", outcome: "timeout" });
            opts.notice?.(`The approval for ${opts.label(event.toolName)} timed out, so the call was refused.`);
            return { block: true, reason: "The approval timed out, so the call is refused." };
          }
          opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "ask", outcome: answer.answer });
          opts.trace?.({ tool: event.toolName, rule: "ask", outcome: answer.answer });
          if (answer.answer === "conversation") allowed.add(event.toolName);
          if (answer.answer === "refuse") {
            opts.notice?.(`The advocate refused ${opts.label(event.toolName)}.`);
            return { block: true, reason: "The advocate refused this call." };
          }
          return undefined;
        } catch {
          // Fail closed: an error in the policy never allows a call.
          opts.store.log({ conversation: opts.conversation, tool: event.toolName, rule: "deny", outcome: "error" });
          opts.trace?.({ tool: event.toolName, rule: "deny", outcome: "error", reason: "policy error" });
          opts.notice?.(`The tool policy could not decide ${opts.label(event.toolName)}, so it refused the call.`);
          return { block: true, reason: "The tool policy could not decide this call, so it is refused." };
        }
      });
    },
  };
}
