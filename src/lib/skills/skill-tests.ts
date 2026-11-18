/**
 * Phase 8 (N6): the deterministic skill tests. No model is called and no gold set exists
 * (questions Q-3). Each skill names a fixture brief; the test checks the skill's specification
 * and runs a sample output of its type through the evaluator gate with the fixture's anchors.
 */
import type { ContextKind, OutputType, SkillDefinition } from "../../shared/skills.ts";
import { runGate } from "./gate.ts";
import { WRITING_TOOLS } from "./roles.ts";

export interface FixtureBrief {
  id: string;
  title: string;
  pack: string;
  /** The record ids the fixture holds. A sample output anchors to these. */
  anchors: string[];
  context: ContextKind[];
}

export const FIXTURE_BRIEFS: FixtureBrief[] = [
  {
    id: "criminal-bail",
    title: "A bail application after four months in custody",
    pack: "criminal",
    anchors: ["src-fir:1:4", "ev-arrest", "ev-remand-1", "ev-remand-2", "fact-custody", "issue-bail"],
    context: ["sources", "lines", "events", "conflicts", "issues", "authorities", "drafts", "memory", "rules", "preferences"],
  },
  {
    id: "civil-injunction",
    title: "An interim injunction over a threatened dispossession",
    pack: "civil",
    anchors: ["src-notice:2:8", "src-reply:1:3", "fact-title", "fact-threat", "issue-injunction"],
    context: ["sources", "lines", "events", "conflicts", "issues", "authorities", "drafts", "memory", "rules", "preferences"],
  },
  {
    id: "writ-maintainability",
    title: "A writ against an order with a statutory appeal",
    pack: "writ",
    anchors: ["src-order:1:2", "src-appeal-order:2:5", "fact-order", "fact-remedy", "issue-maintainability"],
    context: ["sources", "lines", "events", "conflicts", "issues", "authorities", "drafts", "memory", "rules", "preferences"],
  },
  ...([
    ["commercial-arbitration", "A Section 34 challenge to an award on the record", "commercial", ["src-award:4:9", "fact-award", "fact-clause", "issue-jurisdiction"]],
    ["family", "A maintenance application on the income record", "family", ["src-income:2:6", "fact-income", "fact-need", "issue-maintenance"]],
    ["property", "A partition suit on a title chain with a gap", "property", ["src-deed:1:4", "fact-title", "fact-share", "issue-partition"]],
    ["insolvency", "A Section 7 application on the default record", "insolvency", ["src-ledger:3:2", "fact-debt", "fact-default", "issue-admission"]],
    ["banking", "A SARFAESI challenge to a possession notice", "banking", ["src-notice:2:7", "fact-debt", "fact-measure", "issue-section-17"]],
    ["tax", "An ITAT appeal on an assessment and a demand", "tax", ["src-assessment:5:3", "fact-demand", "fact-ground", "issue-appeal"]],
    ["service", "A CAT application on a punishment order", "service", ["src-order:1:1", "fact-charge", "fact-punishment", "issue-service"]],
    ["consumer", "A consumer complaint on a deficient service", "consumer", ["src-invoice:1:5", "fact-service", "fact-loss", "issue-deficiency"]],
    ["ip", "An infringement suit on a registered mark", "ip", ["src-registration:1:2", "fact-mark", "fact-use", "issue-infringement"]],
    ["environmental", "An NGT application on a breached clearance condition", "environmental", ["src-clearance:2:1", "fact-condition", "fact-harm", "issue-ngt"]],
    ["competition", "A CCI information on an anti-competitive practice", "competition", ["src-agreement:3:4", "fact-market", "fact-practice", "issue-competition"]],
    ["administrative", "A statutory appeal on a reasoned order", "administrative", ["src-order:4:2", "fact-power", "fact-ground", "issue-appeal"]],
    ["insurance", "A repudiation challenge on the policy clause", "insurance", ["src-policy:2:8", "fact-cover", "fact-repudiation", "issue-insurance"]],
    ["immigration", "A writ against a deportation order", "immigration", ["src-order:1:6", "fact-status", "fact-order", "issue-deportation"]],
    ["rera", "A RERA complaint on a delayed project", "rera", ["src-agreement:2:2", "fact-project", "fact-delay", "issue-rera"]],
    ["motor", "A motor accident claim on the medical and income record", "motor", ["src-medical:1:3", "fact-accident", "fact-loss", "issue-compensation"]],
    ["cheque", "A Section 138 complaint on a dishonoured cheque", "cheque", ["src-cheque:1:1", "fact-cheque", "fact-dishonour", "issue-offence"]],
  ] as const).map(([id, title, pack, anchors]) => ({
    id,
    title,
    pack,
    anchors: [...anchors],
    context: ["sources", "lines", "events", "conflicts", "issues", "authorities", "drafts", "memory", "rules", "preferences"] as ContextKind[],
  })),
];

export function fixtureById(id: string): FixtureBrief | null {
  return FIXTURE_BRIEFS.find((f) => f.id === id) ?? null;
}

/** The fixture a skill names in `tests`, or the one of its pack, or null for a general skill. */
export function fixtureForSkill(skill: SkillDefinition): FixtureBrief | null {
  for (const t of skill.tests) {
    const f = fixtureById(t);
    if (f) return f;
  }
  const pack = skill.packs.find((p) => p !== "general");
  return pack ? (FIXTURE_BRIEFS.find((f) => f.pack === pack) ?? null) : null;
}

export interface ExpectedProperties {
  /** The pack is known and the skill's scope is stated. */
  packScope: boolean;
  /** The output carries anchors. */
  anchors: boolean;
  /** A writing skill stops before its first write. */
  beforeWrite: boolean;
  /** A witness or affidavit skill states the witness rule. */
  witness: boolean;
  /** The body never decides a legal point for the advocate. */
  legalQuestion: boolean;
  /** The output type's sample passes the gate with the fixture's anchors. */
  gate: boolean;
  /** The fixture holds every context kind the skill asks for. */
  context: boolean;
}

const PACKS = ["general", "criminal", "civil", "writ", "slp", "commercial", "family", "property", "insolvency", "banking", "tax", "service", "consumer", "ip", "environmental", "competition", "administrative", "insurance", "immigration", "rera", "motor", "cheque"];

/** A sample output of the skill's type, built from the fixture's anchors. */
export function sampleOutput(type: OutputType, fixture: FixtureBrief): unknown {
  const a = fixture.anchors[0] ?? "fixture-anchor";
  const text = `The fixture brief ${fixture.id} supports this item.`;
  switch (type) {
    case "report":
      return { summary: `${fixture.title}: the fixture report.`, findings: [{ text, anchors: [a] }], not_verified: [], not_read: [] };
    case "list":
      return { items: [{ title: "The fixture item", detail: text, anchors: [a], blocks: false }], not_read: [] };
    case "chart":
      return { columns: ["Question", "Record"], rows: [{ cells: ["What the record holds", text], anchors: [a] }], not_read: [] };
    case "record":
      return { records: [{ fields: { item: text }, anchors: [a] }], not_read: [] };
    case "draft":
      return { title: `The fixture ${fixture.id}`, paragraphs: [{ text, anchors: [a] }], not_read: [] };
  }
}

/** The expected properties of one skill against its fixture. */
export function expectedProperties(skill: SkillDefinition, fixture: FixtureBrief | null): ExpectedProperties {
  const writes = skill.permittedTools.some((t) => WRITING_TOOLS.has(t));
  const witness = /affidavit|deponent|witness/i.test(`${skill.title} ${skill.description}`);
  const legalQuestion = /question for the advocate|not a conclusion|decides? nothing|never decide|legal point/i.test(skill.body);
  const gate = fixture
    ? runGate({ type: skill.output, checks: skill.checks, text: "```json\n" + JSON.stringify(sampleOutput(skill.output, fixture)) + "\n```", resolves: (x) => fixture.anchors.includes(x) }).ok
    : false;
  return {
    packScope: skill.packs.length > 0 && skill.packs.every((p) => PACKS.includes(p)),
    anchors: skill.checks.includes("anchors"),
    beforeWrite: !writes || skill.approvalPoints.includes("before_write"),
    witness: !witness || /witness rule|own recorded words|deponent/i.test(skill.body),
    legalQuestion,
    gate,
    context: !!fixture && skill.requiredContext.every((k) => fixture.context.includes(k)),
  };
}

/** Every property that failed, as the test message says. */
export function propertyDefects(skill: SkillDefinition, fixture: FixtureBrief | null): string[] {
  const e = expectedProperties(skill, fixture);
  const out: string[] = [];
  if (!e.packScope) out.push("the pack scope is missing or unknown");
  if (!e.anchors) out.push("the anchors check is missing");
  if (!e.beforeWrite) out.push("a writing skill has no before_write approval point");
  if (!e.witness) out.push("the witness rule is not stated");
  if (!e.legalQuestion) out.push("the body does not say that a legal point is a question for the advocate");
  if (!fixture) out.push("no fixture brief is named");
  else {
    if (!e.gate) out.push(`a sample ${skill.output} output does not pass the gate`);
    if (!e.context) out.push(`the fixture lacks a required context kind: ${skill.requiredContext.filter((k) => !fixture.context.includes(k)).join(", ")}`);
  }
  return out;
}
