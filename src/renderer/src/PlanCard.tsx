import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import type { ContextMeter, Plan } from "../../shared/api.ts";

const api = window.openadvo;

const STATUS_LABEL: Record<Plan["items"][number]["status"], string> = {
  planned: "Planned",
  ongoing: "Working",
  done: "Done",
  cancelled: "Cancelled",
};

/** The agent's plan for long work (native-harness-parts section 4). Only the advocate clears it. */
export function PlanCard(props: { conversationId: string; plan: Plan }) {
  const { plan } = props;
  const done = plan.items.filter((i) => i.status === "done").length;
  const counted = plan.items.filter((i) => i.status !== "cancelled").length;
  return (
    <section className="question-card plan-card" aria-label={`Plan: ${plan.title}`} data-testid="plan-card">
      <Text type="supporting">The agent's plan · {done} of {counted} done</Text>
      <Text weight="semibold">{plan.title}</Text>
      <ol className="plan-items">
        {plan.items.map((i) => (
          <li key={i.n} data-status={i.status}>
            <span className={`plan-status plan-${i.status}`}>{STATUS_LABEL[i.status]}</span> {i.text}
          </li>
        ))}
      </ol>
      <div className="question-options">
        <Button label="Clear plan" size="sm" variant="ghost" clickAction={() => api.clearPlan(props.conversationId)} />
      </div>
    </section>
  );
}

function k(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

/** The context meter and Compact now (native-harness-parts section 5). */
export function ContextMeterView(props: { meter: ContextMeter | null; busy: boolean; onCompact: () => Promise<void> }) {
  const m = props.meter;
  if (!m || !m.window) return null;
  const used = m.tokens === null ? "not known until the next answer" : `${k(m.tokens)} of ${k(m.window)}${m.percent === null ? "" : ` (${Math.round(m.percent)} %)`}`;
  const cache = m.cacheRead + m.cacheWrite > 0 ? `Last run: ${k(m.cacheRead)} tokens read from the cache, ${k(m.cacheWrite)} written to it.` : "Last run: no cache use reported.";
  return (
    <div className="dock-meter" data-testid="context-meter" title={cache}>
      <Text type="supporting">Context {used}</Text>
      <Button label="Compact now" size="sm" variant="ghost" isDisabled={props.busy} clickAction={props.onCompact} />
    </div>
  );
}
