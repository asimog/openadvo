/**
 * Phase 6 (A7): the learned preferences. A preference key is asked once, inside the first task
 * where it matters, or proposed after the advocate makes the same correction twice. The advocate
 * approves every proposal. Every place the application or the agent applies a preference names
 * it: "applied because <key>: <value> (<reason>)".
 *
 * Plain library: no Electron import, no Pi import (decision 6).
 */
import type { PreferenceQuestion } from "../../shared/stores.ts";

export type { PreferenceQuestion };

export interface PreferenceKey {
  key: string;
  title: string;
  /** The question the first task asks. */
  question: string;
  /** The tasks where the key matters: "drafting", "citation", "research", "hearing". */
  mattersIn: string[];
  /** The fixed values, when the key has them. */
  values?: string[];
  /** The value used until the advocate answers. The application says when it used one. */
  default: string;
  /** True when the value is the advocate's own words, not a fixed value. */
  free?: boolean;
}

export const PREFERENCE_KEYS: PreferenceKey[] = [
  {
    key: "citation_format",
    title: "Citation format",
    question: "How should a citation read in your drafts?",
    mattersIn: ["drafting", "citation"],
    values: ["neutral_first", "parties_first"],
    default: "neutral_first",
  },
  {
    key: "drafting_style",
    title: "Drafting style",
    question: "What drafting style should the agent follow in your drafts?",
    mattersIn: ["drafting"],
    default: "",
    free: true,
  },
  {
    key: "pleading_structure",
    title: "Pleading structure",
    question: "Is there a pleading structure you always follow?",
    mattersIn: ["drafting"],
    default: "",
    free: true,
  },
  {
    key: "paragraph_length",
    title: "Paragraph length",
    question: "How long should a drafted paragraph be?",
    mattersIn: ["drafting"],
    values: ["short", "medium", "long"],
    default: "medium",
  },
  {
    key: "research_depth",
    title: "Research depth",
    question: "How deep should a research run go by default?",
    mattersIn: ["research"],
    values: ["quick", "standard", "deep"],
    default: "standard",
  },
  {
    key: "output_format",
    title: "Output format",
    question: "Which format do you want a finished document delivered in?",
    mattersIn: ["drafting"],
    values: ["docx", "pdf"],
    default: "docx",
  },
  {
    key: "briefs_other_counsel",
    title: "Briefing other counsel",
    question: "Do you brief other counsel to argue your matters?",
    mattersIn: ["hearing"],
    values: ["yes", "no"],
    default: "no",
  },
];

export function preferenceKeyOf(key: string): PreferenceKey | null {
  return PREFERENCE_KEYS.find((k) => k.key === key) ?? null;
}

/** One question a task returns when the key it needs has no approved value. The type lives in shared/stores.ts. */

/** The questions a task returns: every named key with no approved value. */
export function preferenceQuestions(keys: string[], approved: Record<string, unknown>): PreferenceQuestion[] {
  const out: PreferenceQuestion[] = [];
  for (const key of keys) {
    if (key in approved) continue;
    const k = preferenceKeyOf(key);
    if (!k) continue;
    out.push({ key: k.key, title: k.title, question: k.question, values: k.values ?? null, free: Boolean(k.free), default: k.default });
  }
  return out;
}

/** Normalise a correction reason so two wordings of one correction match. */
export function normaliseReason(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
}

/**
 * The preference the second identical correction proposes: the key whose words the reason
 * matches, and the value it states. Null when the reason matches no key.
 */
export function correctionPreference(reason: string): { key: string; value: string } | null {
  const r = normaliseReason(reason);
  if (!r) return null;
  if (r.includes("neutral citation")) return { key: "citation_format", value: "neutral_first" };
  if (r.includes("reporter") || r.includes("citation first")) return { key: "citation_format", value: "parties_first" };
  if (r.includes("paragraph") || r.includes("shorter") || r.includes("brief")) {
    if (r.includes("long")) return { key: "paragraph_length", value: "long" };
    if (r.includes("medium")) return { key: "paragraph_length", value: "medium" };
    return { key: "paragraph_length", value: "short" };
  }
  if (r.includes("structure") || r.includes("pleading")) return { key: "pleading_structure", value: reason.trim() };
  if (r.length > 3) return { key: "drafting_style", value: reason.trim() };
  return null;
}

/** The note every applied preference carries. */
export function appliedBecause(key: string, value: string, reason: string | null): string {
  return reason
    ? `applied because ${key}: ${value} (${reason})`
    : `applied because ${key}: ${value} (no reason recorded with the preference)`;
}

/** The note when no preference is approved and the default was used instead. */
export function defaultUsed(key: string): string {
  const k = preferenceKeyOf(key);
  const value = k ? k.default : "(unknown key)";
  return `no ${key} preference is approved: the default ${value} was used`;
}

/** One saved authority as the draft cites it, in the advocate's citation format (L5). */
export function formatCitation(authority: { citation: string; parties: string; paragraph: string }, format: string): string {
  const cite = authority.citation.trim();
  const parties = authority.parties.trim();
  const at = authority.paragraph.trim() ? `, paragraph ${authority.paragraph.trim()}` : "";
  if (format === "parties_first") return `${parties ? `${parties} (` : ""}${cite}${parties ? ")" : ""}${at}`;
  return `${cite}${parties ? `, ${parties}` : ""}${at}`;
}
