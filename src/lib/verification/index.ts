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
  /** V1-7 rule 23: a paragraph still holds a "[TO BE COMPLETED" marker. */
  | "incomplete"
  /** V1-7 rule 24: the prayer does not name the impugned judgment's date or case number. */
  | "prayer_mismatch"
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
  | "missing_in_other_draft"
  /** A case number the draft states is neither the matter's nor in any source. */
  | "case_number_mismatch"
  /** A name close to a recorded party name, but not the same. */
  | "party_name_mismatch"
  /** V5-14: a citation in reporter form with no neutral citation; the validator cannot check it. */
  | "reporter_citation"
  /** V5-14: a provision the matter records as repealed is relied on. */
  | "repealed_provision"
  /** V5-15: a protected victim's name appears in the draft. */
  | "victim_identity"
  // ---- Phase 6 ----
  /** P6: a paragraph links to a fact that is not confirmed. */
  | "fact_not_confirmed"
  /** P6: a paragraph states a disputed fact as a fact. */
  | "fact_disputed"
  /** P6: a paragraph states a fact with an open contradiction, which is never resolved silently. */
  | "fact_contradiction"
  /** P6: a paragraph's only source is an inference, so the advocate judges it. */
  | "inference_source"
  /** P8: an open [CITE] marker. */
  | "marker_cite"
  /** P8: an open [VERIFY] marker. */
  | "marker_verify"
  /** P8: an open [REVIEW] marker. */
  | "marker_review"
  /** P1: a quoted string appears in no anchored line, fact or statement. */
  | "quote_unmatched"
  /** P1: a quote too short for any source to verify. */
  | "quote_too_short"
  /** P1: a page reference names no page the record holds. */
  | "page_missing"
  /** P1: a paragraph number cited for a saved authority does not exist in it. */
  | "authority_paragraph_missing"
  /** P4: the law library holds no row for the statutory reference. */
  | "statute_not_found"
  /** P4: the provision is repealed or omitted. */
  | "statute_repealed"
  /** P4: the provision is not in force on the governing date. */
  | "statute_not_yet_in_force"
  /** P4: the provision ceased before the governing date. */
  | "statute_ceased"
  /** P4: the row is not the current version. */
  | "statute_wrong_version"
  /** P4: the row was never verified, or changed, or was unreachable (ruling R-3). */
  | "statute_unconfirmed"
  /** P7: a template part is missing or out of order, or a structural rule fails. */
  | "missing_part"
  | "part_order"
  | "numbering"
  | "cross_reference"
  | "annexure_reference"
  | "relief_mismatch"
  | "page_format"
  /** L8: an affidavit paragraph links to no recorded statement of the deponent. */
  | "affidavit_unlinked";

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
  /** The facts the anchor links to (phase 6, L2). */
  factIds?: string[];
  /** The evidence statements the anchor organizes (phase 6, L8). */
  evidenceIds?: string[];
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

/** A fact as the phase 6 checks read it (P6). */
export interface CheckFact {
  id: string;
  text: string;
  type: string;
  status: string;
  sourceName: string | null;
  page: number | null;
  line: number | null;
}

/** An open contradiction of the matter (phase 4), as the checks read it. */
export interface CheckContradiction {
  kind: string;
  values: Array<{ factId: string | null; text: string; sourceName: string | null; page: number | null; line: number | null }>;
}

export interface CheckInput {
  paragraphs: CheckParagraph[];
  events: CheckEvent[];
  /** The facts of the matter (phase 6, P6). */
  facts?: CheckFact[];
  /** The open contradictions (phase 6, P6): never resolved silently. */
  contradictions?: CheckContradiction[];
  /** The draft's kind, for the kind-specific rules (the witness rule, L8). */
  kind?: string;
  /** The other draft of the pair (Synopsis for a List of Dates, and the reverse), when it exists. */
  other?: { title: string; paragraphs: CheckParagraph[] };
  /** False for drafts outside the List of Dates and Synopsis pair. Default true. */
  paired?: boolean;
  /** What the advocate recorded about the matter (empty strings when not recorded). */
  matter?: { petitioner: string; respondent: string; caseNumber: string };
  /** Case numbers ("N/YYYY") that the sources state. */
  recordCaseNumbers?: string[];
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

function whereFact(f: CheckFact): string {
  return f.sourceName ? `${f.sourceName}${f.page != null ? `, p. ${f.page}` : ""}${f.line != null ? `, l. ${f.line}` : ""}` : "no source recorded";
}

/** The closing note the affidavit generator writes after the deponent's statements (L8). */
const AFFIDAVIT_NOTE = "The statements above are the deponent's own recorded words";
const AFFIDAVIT_KINDS = new Set(["affidavit", "counter_affidavit", "rejoinder"]);

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
 * 1. A paragraph that states a date must link to a Notebook event or a fact (9A: every factual statement has a source).
 * 2. A link must lead to a record the matter holds.
 * 3. A linked event must be confirmed and not excluded; a linked fact must be confirmed, with its
 *    disputes and open contradictions reported, never resolved silently, and an inference labelled
 *    for the advocate to judge (P6).
 * 4. Every date the paragraph states must be a date of one of its linked events, or a date that
 *    the event's own source line states (9A: dates match the Factual Matrix).
 * 5. Where the other draft links the same event, both state it with the same dates, and an event
 *    stated here is stated there (9D: the Synopsis agrees with the List of Dates).
 * For an affidavit kind, every numbered statement must link to a recorded statement of the
 * deponent (L8, the witness rule).
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
    const factIds = p.factIds ?? [];
    if (dates.length === 0 && p.eventIds.length === 0 && factIds.length === 0) return;
    statementsChecked += 1;
    const base = { paragraph, anchor: p.anchor, text };

    if (p.eventIds.length === 0 && factIds.length === 0) {
      defects.push({
        ...base,
        kind: "no_source",
        evidence: `The paragraph states ${dates.map(display).join(", ") || "facts"} and links to no Notebook event and no fact.`,
        action: "Insert the statement from the Notebook or the Facts tab, or remove it.",
      });
      return;
    }

    // Phase 6 (P6): the linked facts must be confirmed; a dispute or an open contradiction is
    // never resolved silently, and an inference is labelled for the advocate to judge.
    for (const id of factIds) {
      const fact = input.facts?.find((f) => f.id === id);
      if (!fact) {
        defects.push({
          ...base,
          kind: "fact_not_confirmed",
          evidence: `The paragraph links to fact ${id}, and the Facts tab does not hold it.`,
          action: "Insert the statement from the Facts tab again, or remove it.",
        });
        continue;
      }
      if (fact.status === "disputed") {
        defects.push({
          ...base,
          kind: "fact_disputed",
          evidence: `The linked fact (${whereFact(fact)}) is disputed in the record: ${fact.text}`,
          action: "Resolve the dispute on the Facts tab, or state the fact as disputed.",
        });
      } else if (fact.status !== "confirmed") {
        defects.push({
          ...base,
          kind: "fact_not_confirmed",
          evidence: `The linked fact (${whereFact(fact)}) is ${fact.status} in the record.`,
          action: "Confirm the fact on the Facts tab, or remove the paragraph.",
        });
      }
      if (fact.type === "inference") {
        defects.push({
          ...base,
          kind: "inference_source",
          evidence: `The linked fact is an inference (${whereFact(fact)}), not a record statement: ${fact.text}`,
          action: "The paragraph rests on an inference; either ground it in the record or present it as the client's case.",
        });
      }
      // P6: an open contradiction on a stated fact is never resolved silently.
      const open = (input.contradictions ?? []).find((c) => c.values.some((v) => v.factId === fact.id));
      if (open) {
        const sides = open.values.map((v) => `"${v.text}" (${v.sourceName ? `${v.sourceName}${v.page != null ? `, p. ${v.page}` : ""}` : "no source"})`).join(" against ");
        defects.push({
          ...base,
          kind: "fact_contradiction",
          evidence: `The record contradicts itself on this fact (${open.kind}): ${sides}.`,
          action: "Resolve the contradiction on the Facts tab, or state both readings in the draft.",
        });
      }
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

  const notRun: NotRun[] = [];
  if (input.paired !== false && !input.other) notRun.push({ check: "The Synopsis agrees with the List of Dates", reason: "The other draft does not exist yet." });

  // Phase 6 (L8, the witness rule): an affidavit's numbered statement paragraphs must each link
  // to a recorded statement of the deponent. The generator's own lead paragraph, the markers
  // and the closing note are exempt; every other composed paragraph is flagged, because the
  // agent may organize the deponent's words, never compose the evidence.
  if (input.kind && AFFIDAVIT_KINDS.has(input.kind)) {
    let statements = 0;
    let unlinked = 0;
    input.paragraphs.forEach((p, i) => {
      const text = p.text.trim();
      const numbered = /^(\d{1,3})\.\s/.exec(text);
      if (!numbered || Number(numbered[1]) < 2) return;
      if (text.startsWith(AFFIDAVIT_NOTE) || text.includes("[TO BE COMPLETED") || text.includes("[REVIEW")) return;
      statements += 1;
      if ((p.evidenceIds ?? []).length === 0) {
        unlinked += 1;
        defects.push({
          kind: "affidavit_unlinked",
          paragraph: i + 1,
          anchor: p.anchor,
          text,
          evidence: "The affidavit paragraph links to no recorded statement of the deponent. The witness rule holds: the agent organizes the deponent's own words, it does not compose the evidence.",
          action: "Record the deponent's words on the Evidence tab and insert them, or write the paragraph yourself in the editor.",
        });
      }
    });
    if (statements === 0) notRun.push({ check: "Every affidavit statement is the deponent's own recorded words", reason: "The affidavit holds no numbered statement paragraph yet." });
  }

  // Case numbers (9A): a number the draft states must be the matter's or appear in a source.
  if (input.recordCaseNumbers) {
    const known = new Set(input.recordCaseNumbers);
    for (const n of caseNumbers(input.matter?.caseNumber ?? "")) known.add(n);
    input.paragraphs.forEach((p, i) => {
      for (const n of caseNumbers(p.text)) {
        if (known.has(n)) continue;
        statementsChecked++;
        defects.push({
          kind: "case_number_mismatch",
          paragraph: i + 1,
          anchor: p.anchor,
          text: p.text,
          evidence: `The draft states case number ${n.replace("/", " of ")}. No source states it, and the matter records ${input.matter?.caseNumber || "no case number"}.`,
          action: "Correct the number, or add the source that states it.",
        });
      }
    });
  } else {
    notRun.push({ check: "Case numbers match the record", reason: "The source text was not supplied." });
  }

  // Party names (9A): a near miss of a recorded name is a defect. An exact match passes.
  const names = [input.matter?.petitioner ?? "", input.matter?.respondent ?? ""].map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    notRun.push({ check: "Party names match the matter", reason: "The matter records no party names. Record them on the Matter tab." });
  } else {
    input.paragraphs.forEach((p, i) => {
      for (const name of names) {
        const near = nearMiss(p.text, name);
        if (!near) continue;
        defects.push({
          kind: "party_name_mismatch",
          paragraph: i + 1,
          anchor: p.anchor,
          text: p.text,
          evidence: `The draft writes "${near}". The matter records the party as "${name}".`,
          action: "Correct the name, or correct the party name recorded on the Matter tab.",
        });
      }
    });
  }
  return { method: METHOD, defects, statementsChecked, notRun };
}

// ---- The quality-gate state (workflow 9, "Quality-gate outcome"). ----

/** The workflow's states, in the order in which the first that applies is shown. */
export const GATE_STATES = [
  "blocked_source_verification",
  "needs_correction",
  "blocked_legal_review",
  "blocked_filing_compliance",
  "needs_instructions",
  "ready_for_advocate_review",
] as const;
export type GateState = (typeof GATE_STATES)[number];

export const GATE_LABEL: Record<GateState, string> = {
  blocked_source_verification: "Blocked pending source verification",
  needs_correction: "Needs correction",
  blocked_legal_review: "Blocked pending legal review",
  blocked_filing_compliance: "Blocked pending filing compliance",
  needs_instructions: "Needs additional instructions",
  ready_for_advocate_review: "Ready for advocate review",
};

/** The review-item kind of one defect kind. */
export function defectItemKind(kind: DefectKind): string {
  return `draft_defect.${kind}`;
}

/** Which state a defect holds the draft in. A defect about the source link blocks; the others need correction. The severity of an item is this mapping (P9). */
export const DEFECT_STATE: Record<DefectKind, GateState> = {
  no_source: "blocked_source_verification",
  broken_link: "blocked_source_verification",
  event_not_confirmed: "blocked_source_verification",
  date_mismatch: "needs_correction",
  case_number_mismatch: "needs_correction",
  party_name_mismatch: "needs_correction",
  drafts_disagree: "needs_correction",
  missing_in_other_draft: "needs_correction",
  incomplete: "needs_instructions",
  prayer_mismatch: "needs_correction",
  reporter_citation: "needs_instructions",
  repealed_provision: "needs_correction",
  victim_identity: "needs_correction",
  // Phase 6: the same single mapping; nothing downstream may lower one (P9).
  fact_not_confirmed: "blocked_source_verification",
  fact_disputed: "needs_correction",
  fact_contradiction: "needs_correction",
  inference_source: "needs_instructions",
  marker_cite: "needs_correction",
  marker_verify: "blocked_source_verification",
  marker_review: "blocked_legal_review",
  quote_unmatched: "blocked_source_verification",
  quote_too_short: "needs_correction",
  page_missing: "needs_correction",
  authority_paragraph_missing: "needs_correction",
  statute_not_found: "needs_instructions",
  statute_repealed: "needs_correction",
  statute_not_yet_in_force: "needs_correction",
  statute_ceased: "needs_correction",
  statute_wrong_version: "needs_correction",
  statute_unconfirmed: "blocked_legal_review",
  missing_part: "needs_correction",
  part_order: "needs_correction",
  numbering: "needs_correction",
  cross_reference: "needs_correction",
  annexure_reference: "needs_correction",
  relief_mismatch: "needs_correction",
  page_format: "needs_correction",
  affidavit_unlinked: "blocked_legal_review",
};

export interface GateInput {
  /** The kinds of the open review items of this draft (`draft_defect.<kind>`). */
  openItemKinds: string[];
  /** Checks that could not run (validator outcome `unresolved`). */
  notRun: NotRun[];
  /** Agent changes in the revision that the advocate has not decided. */
  undecidedChanges: number;
  /** What holds the draft for legal review (steps 6, 7): unattested citations, the adverse-authority review. */
  legal?: string[];
}

export interface Gate {
  state: GateState;
  label: string;
  /** Every reason that applies, not only the first. */
  reasons: string[];
  /** Gates that later steps own. They are never shown as passed. */
  notAvailable: string[];
}

/**
 * The one mapping from open review items, unresolved checks and undecided agent changes to the
 * gate state (workflow 9). Legal review (steps 6, 7) and filing compliance (step 8) do not exist
 * yet: they are listed as not available, and they never count as passed.
 */
export function gateState(input: GateInput): Gate {
  const hits = new Map<GateState, string[]>();
  const add = (state: GateState, reason: string) => hits.set(state, [...(hits.get(state) ?? []), reason]);
  const counts = new Map<string, number>();
  for (const k of input.openItemKinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [itemKind, n] of counts) {
    const kind = itemKind.startsWith("draft_defect.") ? (itemKind.slice("draft_defect.".length) as DefectKind) : null;
    const state = kind && kind in DEFECT_STATE ? DEFECT_STATE[kind] : "needs_correction";
    add(state, `${n} open review item(s): ${kind ?? itemKind}`);
  }
  if (input.undecidedChanges > 0) add("needs_correction", `${input.undecidedChanges} agent change(s) not decided`);
  for (const n of input.notRun) add("needs_instructions", `Not checked: ${n.check}. ${n.reason}`);
  for (const l of input.legal ?? []) add("blocked_legal_review", l);
  const state = GATE_STATES.find((s) => hits.has(s)) ?? "ready_for_advocate_review";
  return {
    state,
    label: GATE_LABEL[state],
    reasons: GATE_STATES.flatMap((s) => hits.get(s) ?? []),
    notAvailable: ["Filing compliance: decided for the whole petition on the Filing tab (step 8)"],
  };
}


/** "No. 123 of 2024", "No. 123/2024": normalised to "123/2024". */
export function caseNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bNo\.?\s*(\d{1,7})\s*(?:of|\/)\s*((?:19|20)\d\d)\b/gi)) {
    const n = `${Number(m[1])}/${m[2]}`;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** The words of `text` that come close to `name` (one to two letters off) without being it. */
export function nearMiss(text: string, name: string): string | null {
  const target = words(name);
  if (target.length === 0) return null;
  const joined = target.join(" ");
  const w = words(text);
  const limit = Math.max(1, Math.min(2, Math.floor(joined.length / 6)));
  for (let i = 0; i + target.length <= w.length; i++) {
    const window = w.slice(i, i + target.length).join(" ");
    if (window === joined) continue;
    const dist = editDistance(window, joined);
    if (dist > 0 && dist <= limit && window[0] === joined[0]) return window;
  }
  return null;
}
