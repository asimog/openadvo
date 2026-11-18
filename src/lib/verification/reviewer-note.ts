/**
 * Phase 6 (P9): the reviewer note above every output, and the severity floor. The severity of an
 * item is its gate state, from one mapping; nothing downstream may lower one. The note says what
 * was read, the items for judgment, the currency of every rule and statute used, and what to do
 * before relying on the output.
 *
 * Plain library: no Electron import, no Pi import (decision 6).
 */
import type { ReviewerNote } from "../../shared/records.ts";
import { DEFECT_STATE, GATE_STATES, type DefectKind, type GateState } from "./index.ts";

/** The severities, lowest first. The gate states map onto them. */
export const SEVERITIES = ["note", "correction", "blocker"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  note: "For judgment",
  correction: "Needs correction",
  blocker: "Blocks",
};

/** The severity of a gate state, from the one mapping. */
export function severityOfGateState(state: GateState): Severity {
  if (state === "ready_for_advocate_review") return "note";
  if (state === "needs_correction" || state === "needs_instructions") return "correction";
  return "blocker";
}

/** The severity of a defect kind, from the same mapping. An unknown kind is a correction, never a note. */
export function severityOfKind(kind: string): Severity {
  const state = (kind in DEFECT_STATE ? DEFECT_STATE[kind as DefectKind] : null) ?? "needs_correction";
  return severityOfGateState(state);
}

/** The highest severity of a list (the severity floor: a merge never lowers one). */
export function maxSeverity(severities: Severity[]): Severity {
  let out: Severity = "note";
  for (const s of severities) if (SEVERITIES.indexOf(s) > SEVERITIES.indexOf(out)) out = s;
  return out;
}

/** True when a reported severity is lower than the actual one: the skill gate fails on this (P9). */
export function lowersSeverity(reported: Severity, actual: Severity): boolean {
  return SEVERITIES.indexOf(reported) < SEVERITIES.indexOf(actual);
}

export interface ReviewerNoteInput {
  /** The defects the checks found on this output. */
  defects: Array<{ kind: string }>;
  /** The kinds of the open review items of this draft (`draft_defect.<kind>` and the rest). */
  openItemKinds: string[];
  /** Sources with lines the checks read, of all the sources of the matter. Null when not counted. */
  sources: { read: number; of: number } | null;
  /** Every rule, statute and source the check used, with its currency state. */
  currency: string[];
}

/**
 * The reviewer note of one output. The items count by severity, highest first, and nothing
 * lowers a severity: the note is built from the one mapping, never from a downstream's choice.
 */
export function buildReviewerNote(input: ReviewerNoteInput): ReviewerNote {
  const counts = new Map<Severity, number>();
  for (const d of input.defects) {
    const s = severityOfKind(d.kind);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const itemKind of input.openItemKinds) {
    const kind = itemKind.startsWith("draft_defect.") ? itemKind.slice("draft_defect.".length) : itemKind;
    const s = severityOfKind(kind);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const items = (["blocker", "correction", "note"] as Severity[])
    .map((severity) => ({ severity, label: SEVERITY_LABEL[severity], count: counts.get(severity) ?? 0 }))
    .filter((x) => x.count > 0);

  const beforeRelying: string[] = [];
  const blockers = counts.get("blocker") ?? 0;
  if (blockers > 0) beforeRelying.push(`Resolve the ${blockers} blocking item(s) first: the draft cannot be approved while one is open.`);
  const corrections = counts.get("correction") ?? 0;
  if (corrections > 0) beforeRelying.push(`Correct the ${corrections} item(s) that need correction, then run the check again.`);
  beforeRelying.push("Every error found names its evidence; check each one against the record before relying on the draft.");
  const unconfirmed = input.currency.filter((c) => c.includes("unconfirmed") || c.includes("never") || c.includes("stale"));
  if (unconfirmed.length > 0) beforeRelying.push(`${unconfirmed.length} rule(s) or source(s) used here are not confirmed current: verify them against the official source before filing.`);

  return {
    sources: input.sources,
    items,
    currency: input.currency.slice(0, 30),
    beforeRelying,
  };
}

/** The note as one text block, for a tool result or a card. */
export function reviewerNoteText(note: ReviewerNote): string {
  const parts: string[] = [];
  if (note.sources) parts.push(`Sources read: ${note.sources.read} of ${note.sources.of}.`);
  for (const i of note.items) parts.push(`${i.label}: ${i.count}.`);
  for (const c of note.currency) parts.push(`Currency: ${c}`);
  for (const b of note.beforeRelying) parts.push(`Before relying: ${b}`);
  return parts.join(" ");
}

export { GATE_STATES };
