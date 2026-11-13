/**
 * Factual verification and draft consistency (build-plan step 5; workflow 9A and 9D).
 * A plain library: no Electron import, no Pi import (decision 6). It reads a draft's live
 * paragraphs and the Notebook events they link to, and returns defects. It decides nothing:
 * each defect names its evidence and the action the advocate takes.
 *
 * Every rule is deterministic. No model reads the draft here.
 */
import { findDates } from "../notebook/index.ts";

export const METHOD = "checks-v1";

export type DefectKind =
  /** A paragraph states a date and links to no Notebook event. */
  | "no_source"
  /** A paragraph states a date that none of its linked events carries. */
  | "date_mismatch"
  /** A paragraph links to an event that is not confirmed, or that the advocate excluded. */
  | "event_not_confirmed"
  /** A paragraph links to an event that the Notebook no longer holds. */
  | "broken_link"
  /** The other draft states the same event with other dates. */
  | "drafts_disagree"
  /** The other draft does not state an event that this draft states. */
  | "missing_in_other_draft";

export interface Defect {
  kind: DefectKind;
  /** The position of the paragraph in the draft, from 1. */
  paragraph: number;
  anchor: string | null;
  /** The live text of the paragraph. */
  text: string;
  /** What the check found, with the values it compared. */
  evidence: string;
  /** What the advocate does about it. */
  action: string;
}

export interface CheckParagraph {
  anchor: string | null;
  /** The live text. Tracked deleted text is never part of it (WD-013). */
  text: string;
  /** The Notebook events the anchor links to. Empty when there is no link. */
  eventIds: string[];
}

export interface CheckEvent {
  id: string;
  dateStart: string;
  dateEnd: string;
  /** The date as the source wrote it. */
  dateText: string;
  /** The source line of the event. A date it states is a date of the event. */
  description: string;
  status: "candidate" | "confirmed" | "rejected";
  excluded: boolean;
  sourceName: string;
  page: number;
  line: number;
}

export interface CheckInput {
  paragraphs: CheckParagraph[];
  events: CheckEvent[];
  /** The other draft of the pair (Synopsis for a List of Dates, and the reverse), when it exists. */
  other?: { title: string; paragraphs: CheckParagraph[] };
}

/** A check that v0 cannot run, with the reason. It is reported, never passed silently (lesson L2). */
export interface NotRun {
  check: string;
  reason: string;
}

export interface CheckResult {
  method: string;
  defects: Defect[];
  /** Paragraphs that state a date or carry a link: the statements the checks looked at. */
  statementsChecked: number;
  notRun: NotRun[];
}

function isoDatesOf(text: string): string[] {
  const out: string[] = [];
  for (const hit of findDates(text)) {
    out.push(hit.start);
    if (hit.end !== hit.start) out.push(hit.end);
  }
  return [...new Set(out)];
}

function display(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function where(e: CheckEvent): string {
  return `${e.sourceName}, p. ${e.page}, l. ${e.line}`;
}

/** The dates each event is stated with, per event id, in one draft. */
function datesByEvent(paragraphs: CheckParagraph[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of paragraphs) {
    const dates = isoDatesOf(p.text);
    for (const id of p.eventIds) {
      const set = map.get(id) ?? new Set<string>();
      for (const d of dates) set.add(d);
      map.set(id, set);
    }
  }
  return map;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/**
 * Check one draft. The rules, in order, for each paragraph:
 * 1. A paragraph that states a date must link to a Notebook event (9A: every factual statement has a source).
 * 2. A link must lead to an event the Notebook holds.
 * 3. A linked event must be confirmed and not excluded (Appendix B-C: only checked dates in prose).
 * 4. Every date the paragraph states must be a date of one of its linked events, or a date that
 *    the event's own source line states (9A: dates match the Factual Matrix).
 * 5. Where the other draft links the same event, both state it with the same dates, and an event
 *    stated here is stated there (9D: the Synopsis agrees with the List of Dates).
 */
export function checkDraft(input: CheckInput): CheckResult {
  const byId = new Map(input.events.map((e) => [e.id, e]));
  const defects: Defect[] = [];
  let statementsChecked = 0;
  const otherDates = input.other ? datesByEvent(input.other.paragraphs) : null;
  const reportedMissing = new Set<string>();

  input.paragraphs.forEach((p, index) => {
    const paragraph = index + 1;
    const text = p.text.trim();
    const dates = isoDatesOf(text);
    if (dates.length === 0 && p.eventIds.length === 0) return;
    statementsChecked += 1;
    const base = { paragraph, anchor: p.anchor, text };

    if (p.eventIds.length === 0) {
      defects.push({
        ...base,
        kind: "no_source",
        evidence: `The paragraph states ${dates.map(display).join(", ")} and links to no Notebook event.`,
        action: "Insert the statement from the Notebook, or remove it.",
      });
      return;
    }

    const linked: CheckEvent[] = [];
    for (const id of p.eventIds) {
      const event = byId.get(id);
      if (!event) {
        defects.push({
          ...base,
          kind: "broken_link",
          evidence: `The paragraph links to event ${id}, and the Notebook does not hold it.`,
          action: "Insert the statement from the Notebook again, or remove it.",
        });
        continue;
      }
      linked.push(event);
      if (event.status !== "confirmed" || event.excluded) {
        const state = event.excluded ? "excluded" : event.status === "rejected" ? "rejected" : "not confirmed";
        defects.push({
          ...base,
          kind: "event_not_confirmed",
          evidence: `The linked event ${display(event.dateStart)} (${where(event)}) is ${state} in the Notebook.`,
          action: "Confirm or include the event in the Notebook, or remove the paragraph.",
        });
      }
    }

    if (linked.length > 0) {
      const allowed = new Set<string>();
      for (const e of linked) {
        allowed.add(e.dateStart);
        allowed.add(e.dateEnd);
        for (const d of isoDatesOf(e.description)) allowed.add(d);
      }
      const wrong = dates.filter((d) => !allowed.has(d));
      if (wrong.length > 0) {
        const matrix = linked.map((e) => `${e.dateStart === e.dateEnd ? display(e.dateStart) : `${display(e.dateStart)} – ${display(e.dateEnd)}`} (${where(e)}, written "${e.dateText}")`).join("; ");
        defects.push({
          ...base,
          kind: "date_mismatch",
          evidence: `The paragraph states ${wrong.map(display).join(", ")}. The Factual Matrix has ${matrix}.`,
          action: "Correct the date in the draft, or correct the event in the Notebook.",
        });
      }
    }

    if (otherDates && input.other) {
      for (const id of p.eventIds) {
        if (!byId.has(id)) continue;
        const there = otherDates.get(id);
        if (!there) {
          if (reportedMissing.has(id)) continue;
          reportedMissing.add(id);
          defects.push({
            ...base,
            kind: "missing_in_other_draft",
            evidence: `The ${input.other.title} does not state this event.`,
            action: `Add the event to the ${input.other.title}, or remove it here.`,
          });
          continue;
        }
        const here = new Set(dates);
        if (!sameSet(here, there)) {
          defects.push({
            ...base,
            kind: "drafts_disagree",
            evidence: `This draft states ${[...here].map(display).join(", ") || "no date"}. The ${input.other.title} states ${[...there].map(display).join(", ") || "no date"} for the same event.`,
            action: "Make the two drafts state the same date.",
          });
        }
      }
    }
  });

  const notRun: NotRun[] = [
    { check: "Party names and case number match the matter", reason: "The matter records no parties and no case number yet." },
  ];
  if (!input.other) notRun.push({ check: "The Synopsis agrees with the List of Dates", reason: "The other draft does not exist yet." });
  return { method: METHOD, defects, statementsChecked, notRun };
}
