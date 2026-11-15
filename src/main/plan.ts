/**
 * The plan (docs/specs/native-harness-parts.md section 4): the agent's task list for long work,
 * shown as a plan card in the chat. A native part of the harness. The agent sets and updates it;
 * only the advocate clears it (decision 5).
 */
import { defineTool } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { PLAN_STATUSES, type Plan, type PlanStatus } from "../shared/api.ts";

export const MAX_PLAN_ITEMS = 10;
export const PLAN_TOOLS = ["plan_set", "plan_update"] as const;

/** Where a conversation keeps its plan: the state, the file and the window. */
export interface PlanStore {
  get(): Plan | null;
  set(plan: Plan | null): Promise<void>;
}

export function formatPlan(p: Plan): string {
  const done = p.items.filter((i) => i.status === "done").length;
  const counted = p.items.filter((i) => i.status !== "cancelled").length;
  return [`Plan: ${p.title} (${done} of ${counted} done)`, ...p.items.map((i) => `${i.n}. [${i.status}] ${i.text}`)].join("\n");
}

const status = Type.Unsafe<PlanStatus>(StringEnum(PLAN_STATUSES) as never);

export function planTools(store: PlanStore) {
  return [
    defineTool({
      name: "plan_set",
      label: "Set plan",
      description: `Set the plan for work with three or more steps, before you start it. It replaces the current plan. At most ${MAX_PLAN_ITEMS} short items, in order; each starts as planned. The advocate sees it as a card in the chat.`,
      parameters: Type.Object({
        title: Type.String({ description: "What the plan is for, in a few words." }),
        items: Type.Array(Type.String({ description: "One step, in a short sentence." }), { minItems: 1, maxItems: MAX_PLAN_ITEMS }),
      }),
      execute: async (_id, p) => {
        const items = p.items.map((t) => t.trim()).filter(Boolean);
        if (items.length === 0 || items.length > MAX_PLAN_ITEMS) throw new Error(`A plan has 1 to ${MAX_PLAN_ITEMS} items.`);
        const plan: Plan = { title: p.title.trim() || "Plan", items: items.map((text, i) => ({ n: i + 1, text, status: "planned" })), updatedAt: new Date().toISOString() };
        await store.set(plan);
        return { content: [{ type: "text", text: formatPlan(plan) }], details: {} };
      },
    }),
    defineTool({
      name: "plan_update",
      label: "Update plan",
      description: "Set the status of one plan item by its number: planned, ongoing, done or cancelled. Keep one item ongoing while you work on it, and mark it done when it is done.",
      parameters: Type.Object({ item: Type.Integer({ minimum: 1, maximum: MAX_PLAN_ITEMS }), status }),
      execute: async (_id, p) => {
        const plan = store.get();
        if (!plan) throw new Error("There is no plan. Set one with plan_set.");
        const item = plan.items.find((i) => i.n === p.item);
        if (!item) throw new Error(`The plan has no item ${p.item}.`);
        const next: Plan = { ...plan, items: plan.items.map((i) => (i.n === p.item ? { ...i, status: p.status } : i)), updatedAt: new Date().toISOString() };
        await store.set(next);
        return { content: [{ type: "text", text: formatPlan(next) }], details: {} };
      },
    }),
  ];
}
