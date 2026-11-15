/**
 * The context strategy of each agent kind (docs/specs/agent-framework.md section 7), as one
 * inline Pi extension. Two Pi hooks do the work:
 * - `context`: before each model request, old tool results are replaced by a short placeholder.
 *   The session file keeps every result; only the request changes (Pi docs/extensions.md).
 * - `session_before_compact`: the summary is written in the kind's own form, with the session's
 *   model (as in Pi's examples/extensions/custom-compaction.ts). On any failure Pi's default runs.
 */
import { randomUUID } from "node:crypto";
import { convertToLlm, serializeConversation, type ExtensionAPI, type InlineExtension } from "@earendil-works/pi-coding-agent";

export type AgentKind = "firm" | "matter";

export interface ClearingPolicy {
  /** Clear only when the request is above this share of the model's context window. */
  triggerShare: number;
  /** The most recent tool results that always stay. */
  keep: number;
  /** Results shorter than this stay (they cost little and are often ids). */
  minChars: number;
  /** Tools whose results are never cleared. */
  exclude: readonly string[];
}

export interface ContextStrategy {
  clearing: ClearingPolicy;
  /** Pi's compaction.keepRecentTokens for this kind. */
  keepRecentTokens: number;
  /** The parts of the compaction summary, in order. */
  summaryParts: readonly string[];
}

export const CONTEXT_STRATEGY: Record<AgentKind, ContextStrategy> = {
  matter: {
    clearing: { triggerShare: 0.5, keep: 6, minChars: 2000, exclude: ["read_matter_memory"] },
    keepRecentTokens: 30_000,
    summaryParts: [
      "The task, in the advocate's own words",
      "The advocate's instructions and decisions, quoted, with dates",
      "Records touched, by id and anchor (sources with page and line; events; drafts and paragraph anchors; authorities; issues)",
      "Proposals waiting for the advocate",
      "Open questions and what is not verified",
      "Next steps",
    ],
  },
  firm: {
    clearing: { triggerShare: 0.3, keep: 3, minChars: 0, exclude: [] },
    keepRecentTokens: 12_000,
    summaryParts: [
      "The advocate's request, in the advocate's own words",
      "Open items per matter, by matter id",
      "The advocate's instructions and decisions, quoted, with dates",
      "Next steps",
    ],
  },
};

/** A message as the `context` hook sees it; only tool results are changed. */
interface Message {
  role: string;
  toolName?: string;
  toolCallId?: string;
  content?: unknown;
}

function textLength(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((n: number, c: { type?: string; text?: string }) => n + (c?.type === "text" && typeof c.text === "string" ? c.text.length : 0), 0);
}

/** About four characters per token; enough to decide when to clear. */
export function estimateTokens(messages: readonly Message[]): number {
  return Math.ceil(messages.reduce((n, m) => n + textLength(m.content) + 16, 0) / 4);
}

export function placeholder(toolName: string): string {
  return `[Earlier result of ${toolName} cleared to save context. Call ${toolName} again if you need it.]`;
}

/**
 * Replace old tool results with a placeholder. Returns undefined when nothing changes, so the
 * request keeps its cached prefix.
 */
export function clearOldToolResults<T extends Message>(messages: readonly T[], policy: ClearingPolicy, contextWindow: number): T[] | undefined {
  if (contextWindow > 0 && estimateTokens(messages) <= contextWindow * policy.triggerShare) return undefined;
  const results = messages.map((m, i) => ({ m, i })).filter(({ m }) => m.role === "toolResult");
  const old = results.slice(0, Math.max(0, results.length - policy.keep));
  const clear = new Set(
    old
      .filter(({ m }) => !policy.exclude.includes(m.toolName ?? "") && textLength(m.content) >= policy.minChars && !(textLength(m.content) < 200 && /cleared to save context/.test(JSON.stringify(m.content))))
      .map(({ i }) => i),
  );
  if (clear.size === 0) return undefined;
  return messages.map((m, i) => (clear.has(i) ? ({ ...m, content: [{ type: "text", text: placeholder(m.toolName ?? "the tool") }] } as T) : m));
}

export function summaryPrompt(kind: AgentKind, conversation: string, previous?: string): string {
  const parts = CONTEXT_STRATEGY[kind].summaryParts.map((p, i) => `## ${i + 1}. ${p}`).join("\n");
  return [
    "Summarise this conversation of an advocate's legal assistant so that the work can continue.",
    "Use exactly these headings, in this order. Write \"None.\" under a heading with nothing to report.",
    parts,
    "Rules: quote the advocate's words exactly. Keep every record id, anchor, page and line number exactly as written. Do not state a fact that is not in the conversation. A model's inference is not a fact. Keep both sides of any conflict.",
    previous ? `<previous-summary>\n${previous}\n</previous-summary>` : "",
    `<conversation>\n${conversation}\n</conversation>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The inline extension for one agent kind. */
export function contextExtension(kind: AgentKind): InlineExtension {
  const strategy = CONTEXT_STRATEGY[kind];
  return {
    name: `openadvo-context-${kind}`,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on("context", (event, ctx) => {
        const messages = clearOldToolResults(event.messages as unknown as Message[], strategy.clearing, ctx.model?.contextWindow ?? 0);
        return messages ? { messages: messages as never } : undefined;
      });
      pi.on("session_before_compact", async (event, ctx) => {
        const model = ctx.model;
        if (!model) return undefined;
        const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = event.preparation;
        try {
          const conversation = serializeConversation(convertToLlm([...messagesToSummarize, ...turnPrefixMessages]));
          const response = await ctx.modelRegistry.complete(
            model,
            { messages: [{ role: "user", content: [{ type: "text", text: summaryPrompt(kind, conversation, previousSummary) }], timestamp: Date.now() }] },
            { maxTokens: 8192, signal: event.signal, cacheRetention: "none", sessionId: randomUUID() } as never,
          );
          const summary = response.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n");
          if (!summary.trim()) return undefined;
          return { compaction: { summary, firstKeptEntryId, tokensBefore, usage: response.usage } };
        } catch {
          // Pi's default compaction runs instead.
          return undefined;
        }
      });
    },
  };
}
