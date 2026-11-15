import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { HelperView, Plan, PlanItem } from "../../shared/api.ts";

const api = window.openadvo;

const STATUS: Record<PlanItem["status"], { label: string; dot: "neutral" | "accent" | "success" | "warning" }> = {
  planned: { label: "Planned", dot: "neutral" },
  ongoing: { label: "Working", dot: "accent" },
  done: { label: "Done", dot: "success" },
  cancelled: { label: "Cancelled", dot: "warning" },
};

function counts(plan: Plan) {
  const counted = plan.items.filter((i) => i.status !== "cancelled");
  return { done: counted.filter((i) => i.status === "done").length, total: counted.length };
}

/**
 * The plan panel (native-harness-parts section 4; owner: "checklist must have some ui"): a
 * compact checklist above the chat log, from Astryx components. It folds to the status line.
 * Clear plan is human-only (decision 5).
 */
export function PlanPanel(props: { conversationId: string; plan: Plan }) {
  const { plan } = props;
  const [open, setOpen] = useState(true);
  const { done, total } = counts(plan);
  return (
    <section className="plan-panel" aria-label={`Plan: ${plan.title}`} data-testid="plan-panel">
      <Collapsible
        isOpen={open}
        onOpenChange={setOpen}
        trigger={
          <span className="plan-trigger">
            <Text weight="semibold">{plan.title}</Text> <Text type="supporting">{done} of {total} done</Text>
          </span>
        }
      >
        <ProgressBar label={`Plan progress: ${done} of ${total} done`} value={done} max={Math.max(total, 1)} />
        <List density="compact">
          {plan.items.map((i) => {
            const blocked = (i.status === "planned" && i.dependsOn.some((d) => plan.items.find((x) => x.n === d)?.status !== "done")) || false;
            return (
              <ListItem
                key={i.n}
                data-testid={`plan-item-${i.n}`}
                data-status={i.status}
                startContent={<StatusDot variant={blocked ? "warning" : STATUS[i.status].dot} label={blocked ? "Waiting" : STATUS[i.status].label} />}
                label={
                  <span className={i.status === "cancelled" ? "plan-cancelled" : undefined}>
                    {i.n}. {i.text}
                  </span>
                }
                description={
                  i.dependsOn.length || i.subtasks.length ? (
                    <span>
                      {i.dependsOn.length ? `After ${i.dependsOn.join(", ")}. ` : ""}
                      {i.subtasks.map((s, k) => (
                        <span key={k} className="plan-subtask" data-done={s.done}>
                          {s.done ? "☑" : "☐"} {s.text}{" "}
                        </span>
                      ))}
                    </span>
                  ) : undefined
                }
                endContent={
                  <span className="plan-tags">
                    <Text type="supporting">{blocked ? "Waiting" : STATUS[i.status].label}</Text>
                    {i.tags.map((t) => (
                      <Badge key={t} label={t} />
                    ))}
                  </span>
                }
              />
            );
          })}
        </List>
        <div className="question-options">
          <Button label="Clear plan" size="sm" variant="ghost" clickAction={() => api.clearPlan(props.conversationId)} />
        </div>
      </Collapsible>
    </section>
  );
}

/**
 * The pinned status line (native-parts prompt, section 1): plan progress, running helpers and
 * waiting results. The Context tab holds the context numbers and Compact now; this line stays
 * for the work the advocate follows.
 */
export function StatusLine(props: { conversationId: string; plan: Plan | null; helpers: HelperView[]; busy: boolean }) {
  const [steering, setSteering] = useState<HelperView | null>(null);
  const [instruction, setInstruction] = useState("");
  const parts: string[] = [];
  if (props.plan) {
    const { done, total } = counts(props.plan);
    parts.push(`Plan ${done}/${total}`);
  }
  const running = props.helpers.filter((h) => h.state === "running");
  if (running.length) parts.push(`${running.length} helper${running.length === 1 ? "" : "s"} running`);
  const waiting = props.helpers.filter((h) => h.waiting).length;
  if (waiting) parts.push(`${waiting} result${waiting === 1 ? "" : "s"} waiting`);
  if (!parts.length) return null;
  return (
    <div className="status-line" data-testid="status-line">
      <Text type="supporting">{parts.join(" · ")}</Text>
      {running.length ? (
        <DropdownMenu
          button={{ label: "Helpers", variant: "ghost", size: "sm", children: "Helpers" }}
          menuWidth={300}
          items={running.flatMap((h) => [
            { label: `Stop ${h.name}`, onClick: () => void api.stopHelper(props.conversationId, h.id) },
            { label: `Steer ${h.name}…`, onClick: () => setSteering(h) },
          ])}
        />
      ) : null}
      {waiting ? <Button label="Use results" size="sm" variant="secondary" isDisabled={props.busy} clickAction={() => api.useHelperResults(props.conversationId)} /> : null}
      {steering ? (
        <span className="steer-form">
          <input className="text-input" aria-label={`Instruction for ${steering.name}`} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <Button
            label="Send to helper"
            size="sm"
            isDisabled={!instruction.trim()}
            clickAction={async () => {
              await api.steerHelper(props.conversationId, steering.id, instruction.trim());
              setSteering(null);
              setInstruction("");
            }}
          />
          <Button label="Cancel" size="sm" variant="ghost" clickAction={() => setSteering(null)} />
        </span>
      ) : null}
    </div>
  );
}
