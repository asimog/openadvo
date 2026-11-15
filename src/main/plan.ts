/**
 * The plan (docs/specs/native-harness-parts.md section 4): the agent's task list for long work.
 * A native part of the harness. The rules are enforced here, not by the model: at most 10 items;
 * done is final; a cancelled item can be planned again; an item starts only when the items it
 * depends on are done; at most 3 subtasks, and an item is done only when its subtasks are.
 * The agent sets and updates the plan; the advocate can add an item and clear it (decision 5).
 */
import { defineTool } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { PLAN_STATUSES, type Plan, type PlanItem, type PlanStatus } from "../shared/api.ts";

export const MAX_PLAN_ITEMS = 10;
export const MAX_SUBTASKS = 3;
export const PLAN_TOOLS = ["plan_set", "plan_update"] as const;

/** Where a conversation keeps its plan: the state, the file and the window. `line` is the text line for the chat. */
export interface PlanStore {
  get(): Plan | null;
  set(plan: Plan | null, line: string): Promise<void>;
}

const NEXT: Record<PlanStatus, PlanStatus[]> = {
  planned: ["ongoing", "done", "cancelled"],
  ongoing: ["done", "cancelled", "planned"],
  done: [],
  cancelled: ["planned"],
};

export function progress(p: Plan): string {
  const counted = p.items.filter((i) => i.status !== "cancelled");
  return `${counted.filter((i) => i.status === "done").length}/${counted.length}`;
}

export function formatPlan(p: Plan): string {
  return [
    `Plan: ${p.title} (${progress(p)} done)`,
    ...p.items.map((i) => {
      const deps = i.dependsOn.length ? ` (after ${i.dependsOn.join(", ")})` : "";
      const tags = i.tags.length ? ` [${i.tags.join(", ")}]` : "";
      const subs = i.subtasks.map((s, k) => `\n   ${String.fromCharCode(97 + k)}. [${s.done ? "x" : " "}] ${s.text}`).join("");
      return `${i.n}. [${i.status}] ${i.text}${deps}${tags}${subs}`;
    }),
  ].join("\n");
}

/** Check a status change against the rules. Returns the reason it is refused, or null. */
export function refuse(plan: Plan, item: PlanItem, status: PlanStatus): string | null {
  if (item.status === status) return null;
  if (!NEXT[item.status].includes(status)) return `Item ${item.n} cannot go from ${item.status} to ${status}.${item.status === "done" ? " Done is final." : ""}`;
  if (status === "ongoing" || status === "done") {
    const open = item.dependsOn.filter((d) => plan.items.find((x) => x.n === d)?.status !== "done");
    if (open.length) return `Item ${item.n} waits for item${open.length > 1 ? "s" : ""} ${open.join(", ")} to be done.`;
  }
  if (status === "done" && item.subtasks.some((s) => !s.done)) return `Item ${item.n} has open subtasks.`;
  return null;
}

function cleanItems(input: Array<{ text: string; depends_on?: number[]; subtasks?: string[]; tags?: string[] }>): PlanItem[] {
  const items = input.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text);
  if (items.length === 0 || items.length > MAX_PLAN_ITEMS) throw new Error(`A plan has 1 to ${MAX_PLAN_ITEMS} items.`);
  return items.map((x, i) => {
    const n = i + 1;
    const dependsOn = [...new Set(x.depends_on ?? [])];
    for (const d of dependsOn) if (d >= n || d < 1) throw new Error(`Item ${n} can depend only on earlier items; ${d} is not one.`);
    const subtasks = (x.subtasks ?? []).map((t) => t.trim()).filter(Boolean);
    if (subtasks.length > MAX_SUBTASKS) throw new Error(`Item ${n} has more than ${MAX_SUBTASKS} subtasks.`);
    return { n, text: x.text, status: "planned" as const, dependsOn, subtasks: subtasks.map((text) => ({ text, done: false })), tags: (x.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4) };
  });
}

/** The advocate adds an item by typing it ("add to the plan: …"). It starts as planned. */
export function addItem(plan: Plan | null, text: string): Plan {
  const base: Plan = plan ?? { title: "Plan", items: [], updatedAt: "" };
  if (base.items.length >= MAX_PLAN_ITEMS) throw new Error(`The plan already has ${MAX_PLAN_ITEMS} items.`);
  const item: PlanItem = { n: base.items.length + 1, text: text.trim(), status: "planned", dependsOn: [], subtasks: [], tags: ["added by the advocate"] };
  return { ...base, items: [...base.items, item], updatedAt: new Date().toISOString() };
}

const status = Type.Unsafe<PlanStatus>(StringEnum(PLAN_STATUSES) as never);

export function planTools(store: PlanStore) {
  const text = (p: Plan) => ({ content: [{ type: "text" as const, text: formatPlan(p) }], details: {} });
  return [
    defineTool({
      name: "plan_set",
      label: "Set plan",
      description: `Set the plan for work with three or more steps, before you start it. It replaces the current plan. At most ${MAX_PLAN_ITEMS} short items, in order; each starts as planned. An item may depend on earlier items (depends_on, by number), have up to ${MAX_SUBTASKS} subtasks and a few tags (for example the helper doing it). The advocate sees it in the plan panel.`,
      parameters: Type.Object({
        title: Type.String({ description: "What the plan is for, in a few words." }),
        items: Type.Array(
          Type.Object({
            text: Type.String({ description: "One step, in a short sentence." }),
            depends_on: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
            subtasks: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_SUBTASKS })),
            tags: Type.Optional(Type.Array(Type.String())),
          }),
          { minItems: 1, maxItems: MAX_PLAN_ITEMS },
        ),
      }),
      execute: async (_id, p) => {
        const plan: Plan = { title: p.title.trim() || "Plan", items: cleanItems(p.items), updatedAt: new Date().toISOString() };
        await store.set(plan, `Plan set: ${plan.title}, ${plan.items.length} items.`);
        return text(plan);
      },
    }),
    defineTool({
      name: "plan_update",
      label: "Update plan",
      description: "Change one plan item by its number: its status (planned, ongoing, done, cancelled), a subtask done or open (by its number, 1 to 3), or its tags. Keep one item ongoing while you work on it. Done is final. An item starts only when the items it depends on are done, and is done only when its subtasks are done.",
      parameters: Type.Object({
        item: Type.Integer({ minimum: 1, maximum: MAX_PLAN_ITEMS }),
        status: Type.Optional(status),
        subtask: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SUBTASKS })),
        subtask_done: Type.Optional(Type.Boolean()),
        tags: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_id, p) => {
        const plan = store.get();
        if (!plan) throw new Error("There is no plan. Set one with plan_set.");
        const item = plan.items.find((i) => i.n === p.item);
        if (!item) throw new Error(`The plan has no item ${p.item}.`);
        let next: PlanItem = { ...item, subtasks: item.subtasks.map((s) => ({ ...s })) };
        const changes: string[] = [];
        if (p.subtask !== undefined) {
          const s = next.subtasks[p.subtask - 1];
          if (!s) throw new Error(`Item ${item.n} has no subtask ${p.subtask}.`);
          if (item.status === "done") throw new Error(`Item ${item.n} is done. Done is final.`);
          s.done = p.subtask_done ?? true;
          changes.push(`subtask ${String.fromCharCode(96 + p.subtask)} ${s.done ? "done" : "open"}`);
        }
        if (p.tags) {
          next.tags = p.tags.map((t) => t.trim()).filter(Boolean).slice(0, 4);
          changes.push(`tags ${next.tags.join(", ") || "none"}`);
        }
        if (p.status !== undefined && p.status !== item.status) {
          const why = refuse({ ...plan, items: plan.items.map((i) => (i.n === item.n ? next : i)) }, next, p.status);
          if (why) throw new Error(why);
          next = { ...next, status: p.status };
          changes.push(p.status);
        }
        if (!changes.length) return text(plan);
        const updated: Plan = { ...plan, items: plan.items.map((i) => (i.n === item.n ? next : i)), updatedAt: new Date().toISOString() };
        await store.set(updated, `Plan ${progress(updated)}: item ${item.n} "${item.text}" ${changes.join("; ")}.`);
        return text(updated);
      },
    }),
  ];
}
