/**
 * Phase 8 (N6): the skill review before ship. Thirteen parameters, each scored 0 to 2 out of 26,
 * and three legal failure modes that fail the skill whatever the score. The score is kept with
 * the version in `review.json` beside the skill. Plain library (decision 6).
 */
import { ROLE_TABLE } from "./roles.ts";
import { WRITING_TOOLS } from "./roles.ts";
import type { SkillDefinition } from "../../shared/skills.ts";
import { PACK_IDS } from "../../shared/packs.ts";

export const REVIEW_MAX = 26;

export interface ReviewParameter {
  key: string;
  title: string;
  score: 0 | 1 | 2;
  detail: string;
}

export interface SkillReview {
  version: string;
  score: number;
  max: number;
  parameters: ReviewParameter[];
  failureModes: string[];
  defects: string[];
  reviewedAt: string;
  fixtures: string[];
}

export interface ReviewRecord {
  version: string;
  score: number;
  max: number;
  parameters: ReviewParameter[];
  failure_modes: string[];
  reviewed_at: string;
  fixtures?: string[];
}

/** The three legal failure modes. The record says which one applies, never a generic "bad". */
export const LEGAL_FAILURE_MODES = [
  { key: "invented_record", title: "Invented record: a fact, date, amount, name or anchor the record does not hold" },
  { key: "unsupported_law", title: "Unsupported law: a statement of law with no authority, statute or source behind it" },
  { key: "decided_for_advocate", title: "Decided for the advocate: an issue, draft, authority or filing decided, accepted or approved" },
] as const;

const FIXTURES = ["criminal-bail", "civil-injunction", "writ-maintainability", "commercial-arbitration", "family", "property", "insolvency", "banking", "tax", "service", "consumer", "ip", "environmental", "competition", "administrative", "insurance", "immigration", "rera", "motor", "cheque"] as const;

const KNOWN_PACKS = ["general", ...PACK_IDS];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const NEGATED = /\b(not|never|no|without|refuse|forbid|avoid)\b/i;

const DANGER: Array<{ mode: (typeof LEGAL_FAILURE_MODES)[number]["key"]; re: RegExp }> = [
  { mode: "invented_record", re: /\b(invent|make up|fabricate|assume (a|the) (date|fact|amount|name)|guess (the|a) (date|fact|amount|name)|plausible (date|fact|amount|name))\b/i },
  { mode: "unsupported_law", re: /\b(from memory|without (a )?(citation|authority|source)|rely on your (own )?knowledge of the law)\b/i },
  { mode: "decided_for_advocate", re: /\b(decide (the|this) issue|approve the draft|accept the authority|grant bail|hold that the|conclude that the .* is (valid|invalid|liable)|file the (petition|application))\b/i },
];

/** The legal failure modes a skill's own words show. A negated sentence is not a finding. */
export function legalFailureModes(body: string): string[] {
  const found = new Set<string>();
  for (const s of sentences(body)) {
    if (NEGATED.test(s)) continue;
    for (const d of DANGER) if (d.re.test(s)) found.add(d.mode);
  }
  return [...found];
}

/**
 * Review one skill. `record` is the stored review record, when the caller has it: the version
 * must agree. `reviewSkill` is deterministic, so the test suite recomputes every score.
 */
export function reviewSkill(skill: SkillDefinition, record?: ReviewRecord | null): SkillReview {
  const p: ReviewParameter[] = [];
  const add = (key: string, title: string, score: 0 | 1 | 2, detail: string) => p.push({ key, title, score, detail });
  const body = skill.body;

  const description = skill.description.trim();
  add("purpose", "Purpose and triggers", description.length >= 80 && /when the advocate|use it when|use this when/i.test(description) ? 2 : description.length >= 40 ? 1 : 0, description.length >= 80 ? "The description says what the skill does and when to call it." : "The description is short; name the requests that call it.");

  const goodPacks = skill.packs.filter((x) => KNOWN_PACKS.includes(x));
  add("scope", "Pack, court and proceeding scope", skill.packs.length > 0 && goodPacks.length === skill.packs.length ? 2 : 0, goodPacks.length ? `Packs: ${goodPacks.join(", ")}. Courts: ${skill.courts.join(", ") || "any"}. Proceedings: ${skill.proceedings.join(", ") || "any"}.` : "No known pack is named.");

  add("inputs", "Inputs", skill.inputs.length >= 2 ? 2 : skill.inputs.length === 1 ? 1 : 0, skill.inputs.length ? `The run needs: ${skill.inputs.join("; ")}.` : "No input is named.");

  add("context", "Required context", skill.requiredContext.length >= 2 ? 2 : skill.requiredContext.length === 1 ? 1 : 0, skill.requiredContext.length ? `The package includes: ${skill.requiredContext.join(", ")}.` : "No context kind is named.");

  const outside = skill.permittedTools.filter((t) => !ROLE_TABLE[skill.role].tools.includes(t));
  add("tools", "Permitted tools", skill.permittedTools.length > 0 && outside.length === 0 ? 2 : skill.permittedTools.length > 0 ? 1 : 0, outside.length ? `Outside the ${skill.role} role: ${outside.join(", ")}.` : `${skill.permittedTools.length} tool(s), all inside the ${skill.role} role.`);

  add("output", "Output schema", skill.output ? (skill.output === "chart" ? 2 : 1) : 0, `The output is a ${skill.output}; the gate checks its shape.`);

  const anchors = skill.checks.includes("anchors");
  add("anchors", "Anchors and provenance", anchors ? 2 : 0, anchors ? "Every output item carries an anchor; the gate refuses an anchor of no record." : "The anchors check is missing.");

  add("checks", "Checks", skill.checks.includes("schema") && anchors ? 2 : skill.checks.includes("schema") ? 1 : 0, skill.checks.join(", "));

  const writes = skill.permittedTools.some((t) => WRITING_TOOLS.has(t));
  const stops = skill.approvalPoints.includes("before_write");
  add("approval", "Approval points", writes ? (stops ? 2 : 0) : 2, writes ? (stops ? "A writing skill stops before its first write." : "A writing tool has no before_write stop.") : "The skill proposes nothing that needs a write stop.");

  add("budget", "Budget", skill.budgetTokens != null && skill.budgetTokens >= 20_000 && skill.budgetTokens <= 200_000 ? 2 : skill.budgetTokens != null ? 1 : 0, skill.budgetTokens ? `${skill.budgetTokens} tokens.` : "No budget is set.");

  const fixture = skill.tests.find((t) => (FIXTURES as readonly string[]).includes(t));
  add("tests", "Tests", fixture && skill.tests.length >= 2 ? 2 : skill.tests.length ? 1 : 0, skill.tests.length ? `Tests: ${skill.tests.join("; ")}.` : "No test is named.");

  const steps = /(^|\n)\s*(\d+[.)]|[-*])\s+/.test(body);
  const anchorRule = /anchor/i.test(body);
  const notRead = /not_read|not read/i.test(body);
  const witness = /witness rule|deponent|own recorded words/i.test(body);
  const legalQuestion = /question for the advocate|not a conclusion|decides? nothing|legal point/i.test(body);
  const needsWitness = ["SK-033", "SK-110"].includes(skill.id) || /affidavit|deponent|witness/i.test(skill.title);
  const instructions = body.length >= 200 && steps && anchorRule && notRead && (!needsWitness || witness) && legalQuestion;
  add("instructions", "Instructions", instructions ? 2 : body.length >= 150 && steps ? 1 : 0, instructions ? "The body states the steps, the anchors, not_read, the witness rule where it applies, and the line between a question and a decision." : "The body is missing a step, the anchor rule, not_read, the witness rule or the legal-question rule.");

  const versionOk = /^\d+\.\d+\.\d+$/.test(skill.version) && (skill.author === "built-in" || skill.author === "advocate");
  const recordOk = !record || (record.version === skill.version && record.max === REVIEW_MAX);
  add("version", "Version and author", versionOk && recordOk ? 2 : versionOk ? 1 : 0, recordOk ? `Version ${skill.version}, ${skill.author}.` : `The review record is for version ${record?.version}; this skill is ${skill.version}.`);

  const failureModes = [...new Set([...legalFailureModes(body), ...(record?.failure_modes ?? [])])];
  const defects: string[] = [];
  for (const x of p) if (x.score === 0) defects.push(`${x.title}: ${x.detail}`);
  if (record && record.version !== skill.version) defects.push(`The review record is for version ${record.version}; this skill is ${skill.version}.`);
  if (failureModes.length) defects.push(`Legal failure mode: ${failureModes.join(", ")}`);
  return {
    version: skill.version,
    score: p.reduce((n, x) => n + x.score, 0),
    max: REVIEW_MAX,
    parameters: p,
    failureModes,
    defects,
    reviewedAt: new Date().toISOString().slice(0, 10),
    fixtures: skill.tests.filter((t) => (FIXTURES as readonly string[]).includes(t)),
  };
}

/** A short line for the window: the score, the date and the failure modes. */
export function reviewLine(record: Pick<ReviewRecord, "score" | "max" | "reviewed_at" | "failure_modes"> | null): string {
  if (!record) return "not reviewed";
  const failures = record.failure_modes.length ? `; legal failure mode: ${record.failure_modes.join(", ")}` : "; no legal failure mode";
  return `reviewed ${record.reviewed_at}: ${record.score}/${record.max}${failures}`;
}
