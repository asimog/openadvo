/**
 * Phase 11 (S9): the trigger table's plain rules. A trigger names an event, the skills it starts
 * and the automated responses it proposes. A fire is a proposal; only the advocate starts it.
 * Plain library (decision 6).
 */
import { TRIGGER_EVENTS, TRIGGER_RESPONSES, type TriggerDefinition, type TriggerEvent, type TriggerResponse } from "../../shared/triggers.ts";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** The triggers written on first start. The advocate can disable or change each one. */
export const DEFAULT_TRIGGERS: Array<Omit<TriggerDefinition, "createdAt" | "updatedAt">> = [
  { id: "trg-new-document", event: "new_document", title: "A new document is read", skills: ["SK-002", "SK-009"], responses: ["rebuild_chronology", "update_context"], enabled: true },
  { id: "trg-new-order", event: "order", title: "A new order or judgment arrives", skills: ["SK-008", "SK-022"], responses: ["flag_issues", "recalculate_deadlines"], enabled: true },
  { id: "trg-hearing", event: "hearing_date", title: "A hearing date is recorded", skills: ["SK-018", "SK-019"], responses: ["recalculate_deadlines"], enabled: true },
  { id: "trg-stage", event: "stage_change", title: "The stage changes", skills: ["SK-006"], responses: ["update_context", "reassess_arguments"], enabled: true },
  { id: "trg-deadline", event: "deadline_approaching", title: "A deadline is near", skills: ["SK-005"], responses: ["recalculate_deadlines"], enabled: true },
  { id: "trg-defect", event: "defect_received", title: "The registry returns a defect", skills: ["SK-025"], responses: ["flag_issues"], enabled: true },
  { id: "trg-email", event: "email", title: "A message arrives", skills: ["SK-002"], responses: ["flag_issues"], enabled: true },
  { id: "trg-instruction", event: "instruction", title: "The client gives an instruction", skills: [], responses: ["flag_issues"], enabled: true },
  { id: "trg-amendment", event: "amendment", title: "An amendment or notification arrives", skills: ["SK-006"], responses: ["reassess_arguments"], enabled: true },
  { id: "trg-citation", event: "citation_change", title: "A citation's treatment changes", skills: ["SK-027"], responses: ["flag_issues"], enabled: true },
];

export interface TriggerCheck {
  trigger: Omit<TriggerDefinition, "createdAt" | "updatedAt"> | null;
  errors: string[];
}

export function checkTrigger(raw: unknown): TriggerCheck {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  if (!/^trg-[a-z0-9-]+$/.test(id)) errors.push(`id must start with trg-, not "${id}"`);
  const event = str(o.event) as TriggerEvent;
  if (!(TRIGGER_EVENTS as readonly string[]).includes(event)) errors.push(`event must be one of ${TRIGGER_EVENTS.join(", ")}`);
  const title = str(o.title);
  if (!title) errors.push("title is required");
  const skills = strs(o.skills).map((s) => s.toUpperCase());
  const badSkills = skills.filter((s) => !/^SK-\d{3}$/.test(s));
  if (badSkills.length) errors.push(`skill ids must be SK-nnn: ${badSkills.join(", ")}`);
  const responses = strs(o.responses) as TriggerResponse[];
  const badResponses = responses.filter((r) => !(TRIGGER_RESPONSES as readonly string[]).includes(r));
  if (badResponses.length) errors.push(`unknown responses: ${badResponses.join(", ")}`);
  if (skills.length === 0 && responses.length === 0) errors.push("a trigger needs at least one skill or one response");
  if (errors.length) return { trigger: null, errors };
  return { errors, trigger: { id, event, title, skills, responses, enabled: o.enabled !== false } };
}

export function matchTriggers(triggers: readonly TriggerDefinition[], event: TriggerEvent): TriggerDefinition[] {
  return triggers.filter((t) => t.enabled && t.event === event);
}

export interface ResponseProposal {
  kind: string;
  title: string;
  detail: string;
  tab: string;
}

/** The review item an automated response proposes. It never changes a draft or a deadline itself. */
export function responseProposal(response: TriggerResponse, subject: string): ResponseProposal {
  const what = subject.trim() || "the matter";
  switch (response) {
    case "rebuild_chronology":
      return { kind: "trigger_chronology", title: "Rebuild the chronology", detail: `The trigger fired for ${what}. The agent proposes a fresh chronology from the record; it does not change the existing one.`, tab: "chronology" };
    case "update_context":
      return { kind: "trigger_context", title: "Update the context", detail: `The trigger fired for ${what}. The next run should read the new record.`, tab: "overview" };
    case "flag_issues":
      return { kind: "trigger_issues", title: "Check the affected issues", detail: `The trigger fired for ${what}. The agent proposes which issues may be affected.`, tab: "research" };
    case "research_task":
      return { kind: "trigger_research", title: "Research task", detail: `The trigger fired for ${what}. The agent proposes a research question for you.`, tab: "research" };
    case "letter":
      return { kind: "trigger_letter", title: "Draft a letter or update", detail: `The trigger fired for ${what}. The agent proposes a letter or an update; you decide what is sent.`, tab: "drafts" };
    case "recalculate_deadlines":
      return { kind: "trigger_deadline", title: "Recalculate the deadlines", detail: `The trigger fired for ${what}. The agent proposes a fresh limitation working; nothing is confirmed.`, tab: "proceedings" };
    case "reassess_arguments":
      return { kind: "trigger_arguments", title: "Reassess the arguments", detail: `The trigger fired for ${what}. The agent proposes which arguments may change.`, tab: "research" };
  }
}
