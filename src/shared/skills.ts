/** N1, N2, I1, O2, O7, O9: skills, skill runs, context packages and side questions, shared by main and renderer. */

export const ROLES = ["intake", "jurisdiction", "research", "evidence", "chronology", "drafting", "review", "strategy", "filing", "hearing", "monitoring", "memory"] as const;
export type Role = (typeof ROLES)[number];

export const OUTPUT_TYPES = ["draft", "chart", "report", "list", "record"] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const PACKAGE_TYPES = ["matter", "research", "drafting", "strategy", "evidence_review", "hearing", "filing", "monitoring"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

/** The question a package answers decides its ranking (architecture.md section 5). */
export const QUESTION_TYPES = ["law", "happened", "agreed", "client_wants", "court_directed"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The kinds of record a skill can ask the package for. */
export const CONTEXT_KINDS = ["sources", "lines", "events", "conflicts", "issues", "authorities", "drafts", "memory", "rules", "preferences"] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

/** Checks the gate can run. Any other name reports "not available yet". */
export const AVAILABLE_CHECKS = ["schema", "anchors", "no_unverified_claims", "severity_floor"] as const;

export const APPROVAL_POINTS = ["before_start", "before_write"] as const;
export type ApprovalPoint = (typeof APPROVAL_POINTS)[number];

export interface SkillDefinition {
  id: string;
  version: string;
  /** Pi's skill name: lower case and hyphens. */
  name: string;
  title: string;
  description: string;
  role: Role;
  packs: string[];
  courts: string[];
  proceedings: string[];
  inputs: string[];
  requiredContext: ContextKind[];
  permittedTools: string[];
  output: OutputType;
  checks: string[];
  approvalPoints: ApprovalPoint[];
  budgetTokens: number | null;
  packageType: PackageType;
  questionType: QuestionType | null;
  tests: string[];
  author: "built-in" | "advocate";
  /** The review status of feature N6: "not reviewed" until reviewed. */
  review: string;
  /** N6: the stored review score, its date and its legal failure modes. */
  reviewScore?: number | null;
  reviewMax?: number | null;
  reviewAt?: string | null;
  reviewFailureModes?: string[];
  /** N6: the version of the review record, when one exists. */
  reviewVersion?: string | null;
  /** The instructions (the body of SKILL.md). */
  body: string;
  file: string;
}

export interface SkillSummary {
  id: string;
  version: string;
  name: string;
  title: string;
  description: string;
  role: Role | string;
  output: string;
  permittedTools: string[];
  checks: string[];
  approvalPoints: string[];
  requiredContext: string[];
  /** Phase 8: the packs the skill serves. */
  packs: string[];
  author: string;
  review: string;
  reviewScore?: number | null;
  reviewMax?: number | null;
  reviewAt?: string | null;
  reviewFailureModes?: string[];
  reviewVersion?: string | null;
  file: string;
  /** Why the skill cannot run, or null. */
  error: string | null;
  /** Another version with the same id is listed and this one does not run. */
  shadowed: boolean;
}

export interface RoleSummary {
  role: Role;
  description: string;
  tools: string[];
  skills: string[];
}

export interface PackageItemRecord {
  id: string;
  kind: string;
  label: string;
  tokens: number;
  flags: string[];
  /** Set when the text was shortened to fit; the anchors were kept. */
  shortened?: boolean;
}

export interface PackageExclusion {
  id: string;
  kind: string;
  label: string;
  reason: string;
}

export interface ContextPackageRecord {
  id: string;
  runId: string | null;
  skillId: string;
  skillVersion: string;
  packageType: PackageType;
  questionType: QuestionType;
  hash: string;
  tokens: number;
  budget: number;
  included: PackageItemRecord[];
  excluded: PackageExclusion[];
  createdAt: string;
  /** True when the run reused a package recorded earlier with the same hash. */
  cached?: boolean;
}

export const RUN_STATES = ["running", "done", "needs_review", "failed", "stopped", "interrupted", "refused"] as const;
export type RunState = (typeof RUN_STATES)[number];

export interface CheckResult {
  name: string;
  result: "passed" | "failed" | "not_available";
  detail: string;
}

export interface ReportCard {
  runId: string;
  skillId: string;
  skillVersion: string;
  skillTitle: string;
  state: RunState;
  reason: string;
  request: string;
  attempts: number;
  rewrites: number;
  checks: CheckResult[];
  toolsUsed: Array<{ name: string; calls: number; errors: number }>;
  tokens: { input: number; output: number; total: number };
  cost: number;
  durationMs: number;
  packageId: string | null;
  packageTokens: number;
  notRead: string[];
  /** The validated output, or the last output when the gate refused it. */
  output: unknown;
  reviewItemId: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface SkillRunRecord {
  id: string;
  skillId: string;
  skillVersion: string;
  state: RunState;
  request: string;
  reason: string;
  packageId: string | null;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  report: ReportCard | null;
}

/** One line of the Jobs view: a chat run, a helper or a skill run. */
export interface JobRow {
  id: string;
  kind: "chat" | "helper" | "skill";
  title: string;
  state: string;
  startedAt: string | null;
  endedAt: string | null;
  tokens: number;
  cost: number;
  tools: number;
  errors: number;
  /** For a skill run. */
  packageId?: string | null;
}

export interface SideMessage {
  id: string;
  role: "question" | "answer" | "notice";
  text: string;
}

export interface SideThread {
  id: string;
  matterId: string;
  busy: boolean;
  messages: SideMessage[];
  tools: string[];
}

/** A record the advocate can add to the context with @. */
export interface ContextCandidate {
  kind: "source" | "event" | "draft" | "issue" | "authority";
  id: string;
  label: string;
}

/** N7: a skill file the advocate previewed, before it is installed. */
export interface SkillImportPreview {
  id: string;
  file: string;
  raw: string;
  name: string;
  skillId: string;
  version: string;
  title: string;
  errors: string[];
  findings: Array<{ pattern: string; quote: string }>;
  permittedTools: string[];
  installable: boolean;
}

export interface InstalledSkill {
  previewId: string;
  skillId: string;
  name: string;
  folder: string;
  file: string;
}
