/**
 * N1: the skill format and the registry (decision 14; docs/skills.md section 1). A skill file is
 * Pi's SKILL.md with Open Advocate's fields in the frontmatter. This library checks a parsed file
 * and builds the registry; reading the files with Pi's parser is in src/main/skills.ts
 * (decision 6). Plain library.
 */
import {
  APPROVAL_POINTS,
  CONTEXT_KINDS,
  OUTPUT_TYPES,
  PACKAGE_TYPES,
  QUESTION_TYPES,
  ROLES,
  type ApprovalPoint,
  type ContextKind,
  type OutputType,
  type PackageType,
  type QuestionType,
  type Role,
  type RoleSummary,
  type SkillDefinition,
  type SkillSummary,
} from "../../shared/skills.ts";
import { HUMAN_ONLY_PATTERN, NEVER_IN_A_SKILL, ROLE_TABLE } from "./roles.ts";
import { reviewLine, type ReviewRecord } from "./review.ts";

export { ROLE_TABLE, READ_MATTER_TOOLS, READ_LAW_TOOLS, WRITING_TOOLS, NEVER_IN_A_SKILL } from "./roles.ts";

export interface LoadedSkill {
  skill: SkillDefinition | null;
  summary: SkillSummary;
}

function list(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Compare two versions "1.2.3": numbers part by part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Check one parsed skill file. Returns the skill, or null with the error on the summary.
 * `agentTools` are the tools the Matter Agent has; a skill may name only those.
 */
export function checkSkill(input: { frontmatter: Record<string, unknown>; body: string; file: string; author: "built-in" | "advocate"; agentTools: readonly string[]; review?: ReviewRecord | null }): LoadedSkill {
  const f = input.frontmatter;
  const errors: string[] = [];
  const id = String(f.id ?? "").trim();
  const version = String(f.version ?? "").trim();
  const name = String(f.name ?? "").trim();
  if (!/^SK-\d{3}$/.test(id)) errors.push(`id must be SK-nnn, not "${id}"`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version must be n.n.n, not "${version}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errors.push("name must be lower case letters, digits and single hyphens (Pi's skill name)");
  const description = String(f.description ?? "").trim();
  if (!description) errors.push("description is required: what the skill does and the requests that should call it");
  const title = String(f.title ?? "").trim() || name;
  const role = String(f.role ?? "").trim() as Role;
  if (!(ROLES as readonly string[]).includes(role)) errors.push(`role must be one of ${ROLES.join(", ")}`);
  const output = String(f.output ?? "").trim() as OutputType;
  if (!(OUTPUT_TYPES as readonly string[]).includes(output)) errors.push(`output must be one of ${OUTPUT_TYPES.join(", ")}`);
  const requiredContext = list(f.required_context) as ContextKind[];
  const badContext = requiredContext.filter((k) => !(CONTEXT_KINDS as readonly string[]).includes(k));
  if (badContext.length) errors.push(`unknown required context: ${badContext.join(", ")}`);
  const permittedTools = list(f.permitted_tools);
  if (permittedTools.length === 0) errors.push("permitted_tools must name at least one tool");
  const human = permittedTools.filter((t) => HUMAN_ONLY_PATTERN.test(t));
  if (human.length) errors.push(`human-only actions are never agent tools (decision 5): ${human.join(", ")}`);
  const never = permittedTools.filter((t) => (NEVER_IN_A_SKILL as readonly string[]).includes(t));
  if (never.length) errors.push(`no skill may have these tools: ${never.join(", ")}`);
  const unknown = permittedTools.filter((t) => !input.agentTools.includes(t) && !human.includes(t) && !never.includes(t));
  if (unknown.length) errors.push(`the agent has no tool named ${unknown.join(", ")}`);
  if ((ROLES as readonly string[]).includes(role)) {
    const outside = permittedTools.filter((t) => !ROLE_TABLE[role].tools.includes(t) && !human.includes(t) && !never.includes(t) && !unknown.includes(t));
    if (outside.length) errors.push(`outside the ${role} role's tool scope: ${outside.join(", ")}`);
  }
  const approvalPoints = list(f.approval_points) as ApprovalPoint[];
  const badPoints = approvalPoints.filter((p) => !(APPROVAL_POINTS as readonly string[]).includes(p));
  if (badPoints.length) errors.push(`unknown approval points: ${badPoints.join(", ")}`);
  const packageType = (String(f.package_type ?? "matter").trim() || "matter") as PackageType;
  if (!(PACKAGE_TYPES as readonly string[]).includes(packageType)) errors.push(`package_type must be one of ${PACKAGE_TYPES.join(", ")}`);
  const q = f.question_type == null ? null : (String(f.question_type).trim() as QuestionType);
  if (q && !(QUESTION_TYPES as readonly string[]).includes(q)) errors.push(`question_type must be one of ${QUESTION_TYPES.join(", ")}`);
  const budget = f.budget_tokens == null ? null : Number(f.budget_tokens);
  if (budget !== null && (!Number.isInteger(budget) || budget < 1000)) errors.push("budget_tokens must be a whole number of at least 1000");
  if (!input.body.trim()) errors.push("the instructions (the body of SKILL.md) are empty");
  const checks = list(f.checks);
  if (!checks.includes("schema")) checks.unshift("schema");
  const record = input.review ?? null;
  let review = reviewLine(record);
  if (input.author === "built-in") {
    if (!record) {
      review = "not reviewed";
      errors.push("review needed: no review record (feature N6); run scripts/review-skills.ts");
    } else if (record.version !== version) {
      review = `review needed: the record is for version ${record.version}`;
      errors.push(`review needed: the review record is for version ${record.version}, not ${version}`);
    } else if (record.max !== 26) {
      errors.push(`review needed: the review record's maximum is ${record.max}, not 26`);
    }
    if (record?.failure_modes.length) errors.push(`the review found a legal failure mode: ${record.failure_modes.join(", ")}`);
  }
  const summary: SkillSummary = {
    id: id || "(no id)",
    version: version || "0.0.0",
    name,
    title,
    description,
    role,
    output,
    permittedTools,
    checks,
    approvalPoints,
    requiredContext,
    packs: list(f.packs),
    author: input.author,
    review,
    reviewScore: record?.score ?? null,
    reviewMax: record?.max ?? null,
    reviewAt: record?.reviewed_at ?? null,
    reviewFailureModes: record?.failure_modes ?? [],
    reviewVersion: record?.version ?? null,
    file: input.file,
    error: errors.length ? errors.join("; ") : null,
    shadowed: false,
  };
  if (errors.length) return { skill: null, summary };
  return {
    summary,
    skill: {
      id,
      version,
      name,
      title,
      description,
      role,
      packs: list(f.packs),
      courts: list(f.courts),
      proceedings: list(f.proceedings),
      inputs: list(f.inputs),
      requiredContext,
      permittedTools,
      output,
      checks,
      approvalPoints,
      budgetTokens: budget,
      packageType,
      questionType: q,
      tests: list(f.tests),
      author: input.author,
      review,
      reviewScore: record?.score ?? null,
      reviewMax: record?.max ?? null,
      reviewAt: record?.reviewed_at ?? null,
      reviewFailureModes: record?.failure_modes ?? [],
      reviewVersion: record?.version ?? null,
      body: input.body.trim(),
      file: input.file,
    },
  };
}

export interface Registry {
  /** Every skill file found, with its error or shadowing. */
  all: SkillSummary[];
  /** The skill that runs for each id: the highest version without an error. */
  active: Map<string, SkillDefinition>;
}

/** Built-in and advocate skills together. The same id: both are listed, the higher version runs. */
export function buildRegistry(loaded: LoadedSkill[]): Registry {
  const active = new Map<string, SkillDefinition>();
  for (const l of loaded) {
    if (!l.skill) continue;
    const have = active.get(l.skill.id);
    if (!have || compareVersions(l.skill.version, have.version) > 0) active.set(l.skill.id, l.skill);
  }
  const all = loaded.map((l) => {
    const winner = active.get(l.summary.id);
    return { ...l.summary, shadowed: !!l.skill && !!winner && winner.file !== l.skill.file };
  });
  all.sort((a, b) => a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
  return { all, active };
}

export function roleSummaries(registry: Registry): RoleSummary[] {
  return ROLES.map((role) => ({
    role,
    description: ROLE_TABLE[role].description,
    tools: ROLE_TABLE[role].tools,
    skills: [...registry.active.values()].filter((s) => s.role === role).map((s) => s.id),
  }));
}

/**
 * Find the skill a "/" command names: the id (SK-008, sk-008) or the Pi name.
 * Returns the skill and the rest of the text, or null.
 */
export function skillCommand(text: string, registry: Registry): { skill: SkillDefinition; rest: string } | null {
  const m = /^\/([A-Za-z0-9-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const word = m[1];
  const skill = [...registry.active.values()].find((s) => s.id.toLowerCase() === word.toLowerCase() || s.name === word.toLowerCase());
  return skill ? { skill, rest: (m[2] ?? "").trim() } : null;
}

/** The skill list in the Matter Agent's prompt: what each does and when to pick it. */
export function skillsForPrompt(registry: Registry): string {
  const active = [...registry.active.values()];
  if (active.length === 0) return "No skills are installed.";
  return active.map((s) => `- ${s.id} (${s.title}, v${s.version}, role ${s.role}, output ${s.output}): ${s.description}`).join("\n");
}
