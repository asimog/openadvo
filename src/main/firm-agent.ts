/**
 * O10: the Firm Agent (docs/specs/agent-framework.md section 2). One per advocate; a solo
 * practitioner is a firm. It reads the firm's summary (every open matter's stage, hearings,
 * deadlines, open items and reminders) and the advocate's workflows. It never reads a matter's
 * documents or facts, so it cannot carry one matter's facts into another. It writes nothing in
 * a store: an instruction for a matter is a proposal that the advocate takes there, or not.
 */
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { FirmHandoff } from "../shared/api.ts";
import type { Workflow } from "../shared/work.ts";

/** One open matter, as the docket shows it (src/main/practice.ts DocketRow). */
export interface FirmMatterRow {
  matterId: string;
  title: string;
  stage: string;
  next: string;
  nextHearing: { date: string; status: string } | null;
  limitation: string | null;
  openItems: number;
  reminders: Array<{ id: string; text: string; dueAt: string; status: string }>;
}

/** What the Firm Agent may read. Each function is a summary, never a document. */
export interface FirmHost {
  /** Every open (not archived) matter. */
  matters(): Promise<FirmMatterRow[]>;
  /** One matter's open Review Inbox items: kind, title and whether it blocks. No detail text. */
  openItems(matterId: string): Promise<Array<{ kind: string; title: string; blocks: boolean; tab: string }>>;
  /** One matter's hearings: date, bench and next date. */
  hearings(matterId: string): Promise<Array<{ date: string; bench: string; nextDate: string; nextDateStatus: string }>>;
  /** The workflows: built in and the advocate's own. */
  workflows(): Promise<Workflow[]>;
  /** Q4: advocate memory and preferences from advocate.db. Never a matter's facts. Absent: not available. */
  advocateMemory?(): Promise<{ memory: Array<{ type: string; subject: string; relation: string; object: string; status: string }>; preferences: Array<{ key: string; value: string; reason: string; status: string }> }>;
}

/** The Firm Agent's tools. The start check requires each of them. */
export const FIRM_TOOLS = ["list_matters", "matter_overview", "list_hearings", "list_workflows", "read_workflow", "read_advocate_memory", "propose_matter_instruction"] as const;
/** Firm tools that change nothing. */
export const FIRM_READ_ONLY = new Set<string>(["list_matters", "matter_overview", "list_hearings", "list_workflows", "read_workflow", "read_advocate_memory"]);

export function firmSystemPrompt(): string {
  return [
    "You are the Firm Agent of Open Advocate. You work for an advocate who practises before Indian courts and tribunals. An advocate runs a firm, even alone: you see the whole firm, and the advocate decides every legal point.",
    "Your tools: list_matters (every open matter: stage, next step, next hearing, limitation deadline, open Review Inbox items, reminders), matter_overview (one matter: its open items, hearings and reminders), list_hearings (next hearing dates across matters, by date), list_workflows and read_workflow (the firm's workflows: built in and the advocate's own), read_advocate_memory (the advocate's confirmed memory records and approved preferences; never a matter's facts).",
    "You cannot read a matter's documents, Notebook, drafts or research, and you never state a fact of a case. Each matter's own Matter Agent works on its record. Never carry what you know of one matter into another.",
    "To get work done in a matter, use propose_matter_instruction: the advocate sees your instruction on Home and decides whether to take it to that matter. Nothing is sent to a matter by you. Propose only clear, short instructions, with the reason.",
    "Use the ids your tools return. A list is a snapshot: call the tool again for fresh numbers. A date marked inferred or not confirmed is not confirmed; say so.",
    "Not available yet: the Knowledge Library (templates, memos and playbooks the advocate uploads). If the advocate asks for it, say so plainly. A proposed memory record or preference is not confirmed until the advocate confirms it.",
    "Never predict the outcome of a case. Never give a probability of success. Write short, plain sentences.",
  ].join("\n");
}

export function formatMatterRow(m: FirmMatterRow): string {
  const parts = [
    `stage: ${m.stage}${m.next ? `; next step: ${m.next}` : ""}`,
    m.nextHearing ? `next hearing ${m.nextHearing.date} (${m.nextHearing.status})` : "no next hearing recorded",
    m.limitation ? `limitation ${m.limitation}` : "",
    `${m.openItems} open Review Inbox item${m.openItems === 1 ? "" : "s"}`,
    m.reminders.length ? `${m.reminders.length} open reminder${m.reminders.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `[matter:${m.matterId}] ${m.title} — ${parts.join("; ")}`;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

/**
 * The Firm Agent's tools. `propose` records a handoff in the Firm Agent's conversation and tells
 * the window; it writes no store.
 */
export function firmTools(host: FirmHost, propose: (h: Omit<FirmHandoff, "id" | "createdAt">) => Promise<FirmHandoff>) {
  const open = async (id: string) => {
    const m = (await host.matters()).find((x) => x.matterId === id);
    // A wrong id is an error the model can correct, never an empty answer.
    if (!m) throw new Error(`No open matter has the id ${id}. Use list_matters for the ids.`);
    return m;
  };
  return [
    defineTool({
      name: "list_matters",
      label: "List matters",
      description: "Every open matter of the firm, one line each: id, title, current stage and next step, next hearing, limitation deadline, open Review Inbox items, open reminders. Reads no document. A snapshot: call again for fresh numbers.",
      parameters: Type.Object({}),
      execute: async () => {
        const rows = await host.matters();
        return text(rows.length ? [`${rows.length} open matter(s), by next hearing:`, ...rows.map(formatMatterRow)].join("\n") : "The firm has no open matter.");
      },
    }),
    defineTool({
      name: "matter_overview",
      label: "Matter overview",
      description: "One open matter in more detail: its summary line, its open Review Inbox items (kind, title, whether it blocks), its hearings and its open reminders. Reads no document and states no fact of the case.",
      parameters: Type.Object({ matter_id: Type.String({ description: "The id from list_matters, without the 'matter:' prefix." }) }),
      execute: async (_id, p) => {
        const m = await open(p.matter_id);
        const [items, hearings] = await Promise.all([host.openItems(m.matterId), host.hearings(m.matterId)]);
        return text(
          [
            formatMatterRow(m),
            `Open Review Inbox items (${items.length}):`,
            ...items.map((i) => `- ${i.title} (${i.kind}; ${i.blocks ? "blocks the work" : "does not block"}; decided on the ${i.tab} tab)`),
            `Hearings (${hearings.length}):`,
            ...hearings.map((h) => `- ${h.date}${h.bench ? `, ${h.bench}` : ""}${h.nextDate ? `; next date ${h.nextDate} (${h.nextDateStatus})` : ""}`),
            `Open reminders (${m.reminders.length}):`,
            ...m.reminders.map((r) => `- ${r.text}, due ${r.dueAt}`),
          ].join("\n"),
        );
      },
    }),
    defineTool({
      name: "list_hearings",
      label: "List hearings",
      description: "The next hearing date of each open matter, in date order, between two dates if given (YYYY-MM-DD).",
      parameters: Type.Object({
        from_date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        to_date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
      }),
      execute: async (_id, p) => {
        const rows = (await host.matters())
          .filter((m) => m.nextHearing && (!p.from_date || m.nextHearing.date >= p.from_date) && (!p.to_date || m.nextHearing.date <= p.to_date))
          .sort((a, b) => (a.nextHearing!.date < b.nextHearing!.date ? -1 : 1));
        return text(rows.length ? rows.map((m) => `${m.nextHearing!.date} (${m.nextHearing!.status}) [matter:${m.matterId}] ${m.title}`).join("\n") : "No next hearing is recorded in that period.");
      },
    }),
    defineTool({
      name: "list_workflows",
      label: "List workflows",
      description: "The firm's workflows: built-in ones and the advocate's own, with their ids.",
      parameters: Type.Object({}),
      execute: async () => {
        const ws = await host.workflows();
        return text(ws.length ? ws.map((w) => `[workflow:${w.id}] ${w.title} (${w.builtIn ? "built in" : "the advocate's own"})`).join("\n") : "No workflow yet.");
      },
    }),
    defineTool({
      name: "read_workflow",
      label: "Read workflow",
      description: "The full instruction of one workflow, by its id from list_workflows.",
      parameters: Type.Object({ workflow_id: Type.String() }),
      execute: async (_id, p) => {
        const w = (await host.workflows()).find((x) => x.id === p.workflow_id);
        if (!w) throw new Error(`No workflow has the id ${p.workflow_id}. Use list_workflows for the ids.`);
        return text(`${w.title} (${w.builtIn ? "built in" : "the advocate's own"})\n\n${w.body}`);
      },
    }),
    defineTool({
      name: "read_advocate_memory",
      label: "Read advocate memory",
      description: "The advocate's memory (advocate.db): confirmed records of preferences, approved precedents, lessons and court practice, and the approved preferences. Proposals waiting for the advocate are listed as proposed. It never holds a matter's facts.",
      parameters: Type.Object({}),
      execute: async () => {
        if (!host.advocateMemory) return text("Advocate memory is not available in this build.");
        const { memory, preferences } = await host.advocateMemory();
        const kept = memory.filter((m) => m.status === "confirmed" || m.status === "proposed");
        const prefs = preferences.filter((p) => p.status === "approved" || p.status === "proposed");
        if (!kept.length && !prefs.length) return text("Advocate memory is empty: no record and no preference yet.");
        return text(
          [
            ...kept.map((m) => `- ${m.type.replace(/_/g, " ")}: ${m.subject} ${m.relation} ${m.object} (${m.status})`),
            ...prefs.map((p) => `- preference ${p.key}: ${p.value} (${p.status}; applied because ${p.reason})`),
          ].join("\n"),
        );
      },
    }),
    defineTool({
      name: "propose_matter_instruction",
      label: "Propose matter instruction",
      description: "Propose an instruction for one open matter's agent, with the reason. The advocate sees it on Home and decides whether to open the matter with it. Nothing is sent to the matter by this tool.",
      parameters: Type.Object({
        matter_id: Type.String({ description: "The id from list_matters." }),
        instruction: Type.String({ description: "The instruction, as the advocate would type it in the matter's chat." }),
        reason: Type.String({ description: "Why, in one or two sentences." }),
      }),
      execute: async (_id, p) => {
        const m = await open(p.matter_id);
        const h = await propose({ matterId: m.matterId, matterTitle: m.title, instruction: p.instruction.trim(), reason: p.reason.trim() });
        return text(`Proposed for ${m.title} (${h.id}). It waits for the advocate on Home; nothing was sent to the matter.`);
      },
    }),
  ];
}
