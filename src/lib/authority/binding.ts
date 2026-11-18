/**
 * E5: the binding-effect check. It is a fact with reasons, not a score. A missing fact gives
 * `undetermined`; it never guesses. The court hierarchy and the territory decide, and a later
 * decision does not bind an earlier governing date.
 *
 * Plain library (decision 6). The advocate decides the legal point.
 */
import type { AuthorityFacts, BindingResult } from "../../shared/law.ts";

export interface BindingQuestion {
  /** The forum court id or name: "sc", "delhi-high-court", "district-delhi". */
  court: string;
  jurisdiction?: string | null;
  territory?: string | null;
  /** The governing date, YYYY-MM-DD. */
  date?: string | null;
}

const STOP = new Set(["the", "of", "and", "court", "high", "supreme", "india", "state", "district"]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function shares(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = new Set(words(a));
  return words(b).some((word) => left.has(word));
}

function isSupreme(court: string): boolean {
  return /^(sc|supreme)/i.test(court) || /supreme court/i.test(court);
}

function isHighCourt(court: string): boolean {
  return /^(hc|high court)/i.test(court) || /high court/i.test(court);
}

function treatmentLabel(treatment: string | null | undefined): string | null {
  if (!treatment) return null;
  const value = treatment.toLowerCase();
  for (const label of ["overruled", "reversed", "doubted", "distinguished", "followed", "affirmed", "modified"]) {
    if (value.includes(label)) return label;
  }
  return null;
}

/**
 * The binding / persuasive label for one authority, for the question's court and date. The
 * reasons name the facts used. A role that is not the court's holding (dissent, submission,
 * obiter) never binds.
 */
export function bindingEffect(facts: AuthorityFacts, question: BindingQuestion): BindingResult {
  const reasons: string[] = [];
  const unresolved: string[] = [];
  const court = String(facts.court ?? "").trim();
  const role = facts.role ?? null;
  const treatment = treatmentLabel(facts.treatment);

  if (role === "dissent" || role === "submission") {
    return { label: "not_binding", reasons: [`The passage is a ${role === "dissent" ? "dissent" : "counsel's submission"}, not the court's holding.`], unresolved };
  }
  if (treatment === "overruled" || treatment === "reversed") {
    return { label: "not_binding", reasons: [`The authority is recorded as ${treatment}.`], unresolved };
  }
  if (treatment === "doubted" || treatment === "distinguished") {
    return { label: "persuasive", reasons: [`The authority is recorded as ${treatment}; it is not treated as binding for this proposition.`], unresolved };
  }
  if (!facts.decisionDate) {
    unresolved.push("decision date");
    return { label: "undetermined", reasons: ["The decision date is not recorded, so the governing-date rule cannot be applied."], unresolved };
  }
  if (question.date && facts.decisionDate > question.date) {
    return { label: "not_binding", reasons: [`The decision is dated ${facts.decisionDate}, later than the governing date ${question.date}.`], unresolved };
  }
  if (role === "obiter") {
    return { label: "persuasive", reasons: ["The passage is obiter, not the ratio of the decision."], unresolved };
  }

  if (isSupreme(court)) {
    reasons.push("The Supreme Court binds every court in India.");
    return { label: "binding", reasons, unresolved };
  }

  if (isHighCourt(court)) {
    if (!facts.courtName) {
      unresolved.push("High Court and its territory");
      return { label: "undetermined", reasons: ["The High Court is not identified, so its territory cannot be settled."], unresolved };
    }
    if (isSupreme(question.court)) {
      return { label: "persuasive", reasons: [`${facts.courtName} is a High Court; its decision is persuasive, not binding, in the Supreme Court.`], unresolved };
    }
    if (shares(facts.courtName, question.court) || shares(facts.courtName, question.territory) || shares(facts.courtName, question.jurisdiction)) {
      return { label: "binding", reasons: [`${facts.courtName} binds the courts in its own territory.`], unresolved };
    }
    if (!question.court) {
      unresolved.push("the forum court");
      return { label: "undetermined", reasons: ["The forum court is not recorded, so the High Court's territory cannot be compared."], unresolved };
    }
    return { label: "persuasive", reasons: [`${facts.courtName} is persuasive outside its own territory.`], unresolved };
  }

  if (!question.court) {
    unresolved.push("the forum court");
    return { label: "undetermined", reasons: ["The forum court is not recorded."], unresolved };
  }
  if (role === "concurrence") {
    return { label: "persuasive", reasons: ["A concurrence is persuasive; the majority is the binding holding."], unresolved };
  }
  return { label: "persuasive", reasons: [`${(facts.courtName ?? court) || "The authority"} is not shown to bind this forum.`], unresolved };
}
