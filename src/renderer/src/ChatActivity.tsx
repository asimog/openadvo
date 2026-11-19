import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatMessage, ChatSystemMessage, ChatToolCalls, type ChatToolCallItem } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { CheckCircleIcon, QuestionMarkCircleIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import type { ChatMessage as ChatRecord, ContextMeter, CostSummary, HelperEventView, HelperView, ModelChoice, RunSummary } from "../../shared/api.ts";

const api = window.openadvo;

/** A ring for the Context tab: the share of the window in use. */
export function UsageRing(props: { percent: number | null; size?: number }) {
  const size = props.size ?? 16;
  const p = Math.max(0, Math.min(100, props.percent ?? 0));
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="usage-ring">
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--color-track)" strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeDasharray={`${(p / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return "?";
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

function duration(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function toolItems(calls: ChatRecord[]): ChatToolCallItem[] {
  return calls.map((m) => ({
    key: m.id,
    name: m.tool?.name ?? "tool",
    status: m.tool?.status === "error" ? "error" : m.tool?.status === "running" ? "running" : "complete",
    target: m.tool?.target,
    duration: duration(m.tool?.durationMs),
    node: m.tool?.helperName ? `helper: ${m.tool.helperName}` : undefined,
    errorMessage: m.tool?.error,
  }));
}

/** The tool calls of the agent, as Astryx ChatToolCalls. A run of calls is one collapsible group. */
export function ToolCallGroup(props: { calls: ChatRecord[] }) {
  const detailed = props.calls.filter((m) => m.tool?.args || m.tool?.result || m.tool?.error);
  return (
    <ChatMessage sender="assistant">
      <ChatToolCalls calls={toolItems(props.calls)} label={`${props.calls.length} tool call${props.calls.length === 1 ? "" : "s"}`} />
      {detailed.length ? (
        <details className="tool-detail">
          <summary>What the agent did ({detailed.length})</summary>
          {detailed.map((m) => (
            <div key={m.id} className="tool-detail-row" data-status={m.tool?.status}>
              <Text weight="semibold">{m.tool?.name}</Text>
              {m.tool?.target ? <Text type="supporting">Target: {m.tool.target}</Text> : null}
              {m.tool?.args ? (
                <div>
                  <Text type="supporting">Arguments</Text>
                  <pre className="tool-text">{m.tool.args}</pre>
                </div>
              ) : null}
              {m.tool?.result ? (
                <div>
                  <Text type="supporting">Result</Text>
                  <pre className="tool-text">{m.tool.result}</pre>
                </div>
              ) : null}
              {m.tool?.error ? <div className="notice" role="alert">{m.tool.error}</div> : null}
            </div>
          ))}
        </details>
      ) : null}
    </ChatMessage>
  );
}

const HELPER_STATUS: Record<NonNullable<HelperEventView["event"]>, { label: string; dot: "accent" | "success" | "error" | "warning" | "neutral" }> = {
  started: { label: "Working", dot: "accent" },
  progress: { label: "Working", dot: "accent" },
  question: { label: "A question waits", dot: "warning" },
  finished: { label: "Done", dot: "success" },
  failed: { label: "Failed", dot: "error" },
  stopped: { label: "Stopped", dot: "neutral" },
  interrupted: { label: "Interrupted", dot: "warning" },
  recap: { label: "Final recap", dot: "success" },
};

/**
 * One helper, one card (native-harness-parts section 3): its name, type, status, progress and
 * questions, the tools it used, and the advocate's Stop and Steer. The events come from the
 * chat's notice lines; the live state comes from the helper list.
 */
export function HelperActivity(props: { conversationId: string; events: ChatRecord[]; tools: ChatRecord[]; live?: HelperView }) {
  const [steering, setSteering] = useState(false);
  const [instruction, setInstruction] = useState("");
  const last = props.events.at(-1)?.helper;
  const name = props.live?.name ?? last?.name ?? props.tools[0]?.tool?.helperName ?? "Helper";
  const type = props.live?.type ?? last?.type ?? "helper";
  const event = last?.event ?? "started";
  const status = HELPER_STATUS[event];
  const running = props.live?.state === "running";
  const waiting = props.live?.waiting === true;
  const activity = props.events.filter((m) => m.helper?.detail && (m.helper.event === "progress" || m.helper.event === "question" || m.helper.event === "failed" || m.helper.event === "stopped"));
  return (
    <ChatSystemMessage icon={<Icon icon={UserGroupIcon} size="sm" color="secondary" />}>
      <Card variant="muted" padding={2}>
        <div className="helper-card" data-testid="helper-card" data-helper-id={props.live?.id ?? last?.id ?? ""} data-state={props.live?.state ?? event}>
          <div className="helper-head">
            <StatusDot variant={status.dot} label={status.label} />
            <Text weight="semibold">{name}</Text>
            <Badge label={type} />
            <Text type="supporting">
              {waiting ? "Result waiting" : status.label}
            </Text>
            <span className="helper-actions">
              {running ? (
                <Button label="Steer" size="sm" variant="ghost" clickAction={() => setSteering((v) => !v)} />
              ) : null}
              {running ? (
                <Button label="Stop" size="sm" variant="ghost" clickAction={async () => api.stopHelper(props.conversationId, props.live?.id ?? last?.id ?? "")} />
              ) : null}
            </span>
          </div>
          {activity.length ? (
            <div className="helper-activity">
              {activity.map((m) => (
                <Text key={m.id} type="supporting">
                  {m.helper?.event === "question" ? "Question: " : m.helper?.event === "failed" ? "Failed: " : m.helper?.event === "stopped" ? "Stopped: " : ""}
                  {m.helper?.detail}
                </Text>
              ))}
            </div>
          ) : null}
          {props.tools.length ? <ChatToolCalls calls={toolItems(props.tools)} label={`${props.tools.length} helper tool call${props.tools.length === 1 ? "" : "s"}`} /> : null}
          {steering ? (
            <div className="helper-steer">
              <input
                className="text-input"
                aria-label={`Instruction for ${name}`}
                placeholder="Add an instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <Button
                label="Send"
                size="sm"
                isDisabled={!instruction.trim()}
                clickAction={async () => {
                  await api.steerHelper(props.conversationId, props.live?.id ?? last?.id ?? "", instruction.trim());
                  setSteering(false);
                  setInstruction("");
                }}
              />
              <Button label="Cancel" size="sm" variant="ghost" clickAction={() => setSteering(false)} />
            </div>
          ) : null}
        </div>
      </Card>
    </ChatSystemMessage>
  );
}

/** A notice about several helpers: the Final Recap. */
export function HelperRecap(props: { message: ChatRecord }) {
  return (
    <ChatSystemMessage icon={<Icon icon={CheckCircleIcon} size="sm" color="secondary" />}>
      <Text type="supporting">{props.message.text}</Text>
    </ChatSystemMessage>
  );
}

/** A helper's question, when no card holds it (an interrupted conversation). */
export function HelperNotice(props: { message: ChatRecord }) {
  return (
    <ChatSystemMessage icon={<Icon icon={QuestionMarkCircleIcon} size="sm" color="secondary" />}>
      <Text type="supporting">{props.message.text}</Text>
    </ChatSystemMessage>
  );
}

/** The order and grouping of the chat: a run of tool calls, one card per helper, plain messages. */
export type ChatBlock =
  | { kind: "message"; message: ChatRecord }
  | { kind: "tools"; key: string; calls: ChatRecord[] }
  | { kind: "helper"; key: string; id: string; events: ChatRecord[]; tools: ChatRecord[] };

export function chatBlocks(messages: ChatRecord[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const helperAt = new Map<string, number>();
  for (const m of messages) {
    const helperId = m.tool?.helperId ?? m.helper?.id;
    if (helperId && (m.role === "tool" || m.helper)) {
      const at = helperAt.get(helperId);
      if (at !== undefined) {
        const block = blocks[at] as Extract<ChatBlock, { kind: "helper" }>;
        if (m.role === "tool") block.tools.push(m);
        else block.events.push(m);
      } else {
        helperAt.set(helperId, blocks.length);
        blocks.push({ kind: "helper", key: `helper-${helperId}`, id: helperId, events: m.helper ? [m] : [], tools: m.role === "tool" ? [m] : [] });
      }
      continue;
    }
    if (m.role === "tool") {
      const last = blocks.at(-1);
      if (last?.kind === "tools") last.calls.push(m);
      else blocks.push({ kind: "tools", key: `tools-${m.id}`, calls: [m] });
      continue;
    }
    blocks.push({ kind: "message", message: m });
  }
  return blocks;
}

/**
 * The Context tab, in the shape of the OpenCode context panel: every number in one place.
 * Estimates from Pi are marked; the provider's own totals can differ.
 */
export function ContextPanel(props: {
  conversationId: string;
  title: string;
  busy: boolean;
  sessionId?: string;
  model: string | null;
  messages: number;
  meter: ContextMeter | null;
  lastRun?: RunSummary;
  cost?: CostSummary;
  helpers: HelperView[];
  onCompact: () => Promise<void>;
}) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  useEffect(() => {
    void api.listModels().then(setModels, () => setModels([]));
  }, []);
  const key = props.model ?? "";
  const slash = key.indexOf("/");
  const provider = slash > 0 ? key.slice(0, slash) : key || "—";
  const model = models.find((m) => m.key === key);
  const modelName = model?.name || (slash > 0 ? key.slice(slash + 1) : key) || "—";
  const m = props.meter;
  const used = m?.tokens ?? props.lastRun?.total ?? null;
  const window = m?.window ?? 0;
  const percent = m?.percent ?? (used !== null && window ? (used / window) * 100 : null);
  const helpersRunning = props.helpers.filter((h) => h.state === "running").length;
  const helpersWaiting = props.helpers.filter((h) => h.waiting).length;
  return (
    <div className="context-panel" data-testid="context-panel" aria-label="Context">
      <div className="context-head">
        <HStack gap={2} vAlign="center">
          <UsageRing percent={percent} size={22} />
          <VStack gap={0}>
            <Text weight="semibold">Context</Text>
            <Text type="supporting">
              {used === null ? "Not measured yet" : `${formatTokens(used)} of ${formatTokens(window)} tokens`}
            </Text>
          </VStack>
        </HStack>
        <Button label="Compact now" size="sm" variant="secondary" isDisabled={props.busy} clickAction={props.onCompact} />
      </div>
      {percent !== null ? <ProgressBar label={`Context ${Math.round(percent)}% used`} value={Math.round(percent)} max={100} /> : null}
      <MetadataList label={{ position: "top" }}>
        <MetadataListItem label="Session">{props.title}</MetadataListItem>
        <MetadataListItem label="Session id">{props.sessionId ? props.sessionId.slice(0, 18) : "—"}</MetadataListItem>
        <MetadataListItem label="Messages">{String(props.messages)}</MetadataListItem>
        <MetadataListItem label="Provider">{provider}</MetadataListItem>
        <MetadataListItem label="Model">{modelName}</MetadataListItem>
        <MetadataListItem label="Context limit">{window ? window.toLocaleString("en-IN") : "—"}</MetadataListItem>
        <MetadataListItem label="Total tokens in context">{used === null ? "—" : used.toLocaleString("en-IN")}</MetadataListItem>
        <MetadataListItem label="Usage">{percent === null ? "—" : `${Math.round(percent)}%`}</MetadataListItem>
        <MetadataListItem label="Input tokens (last run)">{props.lastRun ? props.lastRun.input.toLocaleString("en-IN") : "—"}</MetadataListItem>
        <MetadataListItem label="Output tokens (last run)">{props.lastRun ? props.lastRun.output.toLocaleString("en-IN") : "—"}</MetadataListItem>
        <MetadataListItem label="Cache read (last run)">{props.lastRun ? props.lastRun.cacheRead.toLocaleString("en-IN") : "—"}</MetadataListItem>
        <MetadataListItem label="Cache written (last run)">{props.lastRun ? props.lastRun.cacheWrite.toLocaleString("en-IN") : "—"}</MetadataListItem>
        <MetadataListItem label="Cache hit (last run)">{props.lastRun?.cacheHit == null ? "—" : `${props.lastRun.cacheHit}%`}</MetadataListItem>
        <MetadataListItem label="Cost (last run)">{props.lastRun ? (props.lastRun.cost > 0 ? `$${props.lastRun.cost.toFixed(4)}` : "$0") : "—"}</MetadataListItem>
        <MetadataListItem label="Runs in this matter">{props.cost ? String(props.cost.runs) : "0"}</MetadataListItem>
        <MetadataListItem label="Helpers in this matter">{props.cost ? String(props.cost.helpers) : "0"}</MetadataListItem>
        <MetadataListItem label="Total tokens in this matter">{props.cost ? props.cost.total.toLocaleString("en-IN") : "0"}</MetadataListItem>
        <MetadataListItem label="Total cost in this matter">{props.cost && props.cost.cost > 0 ? `$${props.cost.cost.toFixed(4)}` : "$0"}</MetadataListItem>
        <MetadataListItem label="Helpers now">
          {props.helpers.length === 0 ? "None" : [helpersRunning ? `${helpersRunning} running` : "", helpersWaiting ? `${helpersWaiting} waiting` : ""].filter(Boolean).join(", ") || "None running"}
        </MetadataListItem>
      </MetadataList>
      <Text type="supporting">Pi estimates these numbers; the provider's own totals can differ. Old tool results are summarised once at the end of a run, and recall_result returns an original.</Text>
    </div>
  );
}
