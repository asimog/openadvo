/**
 * Phase 5: law, research and authority. Types shared by the main process, the preload bridge and
 * the renderer. No side effects. Spec: docs/specs/law-research-authority.md.
 */

// ---- E3, D2: statutes with versions ----

export const INSTRUMENT_KINDS = ["act", "rules", "regulation", "notification", "practice_direction"] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export const STATUTE_SOURCES = ["indiacode", "upload", "akn", "set"] as const;
export type StatuteSource = (typeof STATUTE_SOURCES)[number];

/** The result of the last check of a row against its source (decision 16, ruling R-4). */
export const CHECK_STATES = ["never", "verified", "changed", "unreachable"] as const;
export type CheckState = (typeof CHECK_STATES)[number];

export interface StatuteAct {
  id: string;
  kind: InstrumentKind;
  title: string;
  number: string;
  year: string;
  /** "CENTRAL", a State's name, or a court's name for its rules. */
  jurisdiction: string;
  enacted: string | null;
  /** The commencement date as ISO, or null when the source's text is not one date. */
  enforced: string | null;
  /** The commencement as the source writes it. */
  enforcedText: string;
  repealed: boolean;
  source: StatuteSource;
  sourceUrl: string;
  /** The India Code item id, or the SHA-256 of an uploaded file. */
  sourceRef: string;
  retrievedAt: string;
  checkedAt: string | null;
  checkIntervalDays: number;
  provisions: number;
  stale: boolean;
}

export const PROVISION_KINDS = ["section", "schedule", "rule", "order", "article", "preamble"] as const;
export type ProvisionKind = (typeof PROVISION_KINDS)[number];

export const PROVISION_STATUSES = ["in_force", "repealed", "omitted", "superseded"] as const;
export type ProvisionStatus = (typeof PROVISION_STATUSES)[number];

export interface Provision {
  id: string;
  actId: string;
  actTitle: string;
  kind: ProvisionKind;
  number: string;
  heading: string;
  text: string;
  footnotes: string;
  version: number;
  textHash: string;
  validFrom: string | null;
  validUntil: string | null;
  status: ProvisionStatus;
  order: number;
  sourceRef: string;
  sourceUrl: string;
  retrievedAt: string;
  checkedAt: string | null;
  check: CheckState;
  /** True when the last check is older than the Act's check interval, or was never made. */
  stale: boolean;
}

export const STATUTE_EVENT_KINDS = ["commencement", "insertion", "substitution", "omission", "repeal", "amendment", "renumbering", "savings", "transitional"] as const;
export type StatuteEventKind = (typeof STATUTE_EVENT_KINDS)[number];

export interface StatuteEvent {
  id: string;
  actId: string;
  /** The provision number, or "" for the whole Act. */
  provision: string;
  kind: StatuteEventKind;
  /** "provision" when the source states a change to the whole provision; "part" for a clause,
   *  proviso, explanation, illustration, schedule entry or item. Absent means "provision". */
  scope?: "provision" | "part";
  /** The words that name the part, when scope is "part" ("the second clause of Exception 1"). */
  part?: string;
  /** The amending instrument, as the source names it ("Act 1 of 1997"). */
  byAct: string;
  bySection: string;
  date: string | null;
  datePrecision: "day" | "year" | "none";
  /** The words of the source that state the event. */
  quote: string;
  source: "footnote" | "act" | "advocate";
}

export type InForceState = "in_force" | "not_yet_in_force" | "repealed" | "omitted" | "undetermined";

/** D2: the law on the governing date. A fact with its basis; the advocate confirms it. */
export interface InForceResult {
  actId: string;
  actTitle: string;
  provision: string;
  date: string;
  state: InForceState;
  version: Provision | null;
  basis: string[];
  events: StatuteEvent[];
  /** Other Acts the advocate recorded as the earlier or later law for this provision. */
  crosswalk: Crosswalk[];
  check: CheckState;
  stale: boolean;
}

export interface Crosswalk {
  id: string;
  fromActId: string;
  fromActTitle: string;
  fromProvision: string;
  toActId: string;
  toActTitle: string;
  toProvision: string;
  basis: string;
  similarity: number | null;
  status: "proposed" | "confirmed" | "rejected";
  author: "advocate" | "agent" | "system";
  createdAt: string;
}

export interface ProvisionCheck {
  provisionId: string;
  at: string;
  state: CheckState;
  detail: string;
  newVersion: number | null;
}

/** One Act of the shipped list (statutes/acts.json): its India Code id, never its text. */
export interface StatuteSetEntry {
  id: string;
  title: string;
  actId: string;
  number: string;
  year: string;
  enacted: string;
  enforced: string;
  repealed: boolean;
  items: number;
  have: boolean;
}

// ---- E1, E4, G1: judgments, passages and the legal knowledge graph ----

export interface JudgmentPara {
  judgmentId: string;
  para: number;
  /** The paragraph number as the judgment prints it, or "" when it prints none. */
  label: string;
  page: number;
  line: number;
  text: string;
  role: PassageRole | null;
  roleStatus: "candidate" | "confirmed" | null;
}

export const PASSAGE_ROLES = ["ratio", "obiter", "submission", "lower_court", "dissent", "concurrence", "facts", "direction"] as const;
export type PassageRole = (typeof PASSAGE_ROLES)[number];

export const LEGAL_RELATIONS = [
  "cites",
  "follows",
  "distinguishes",
  "overrules",
  "doubts",
  "refers_to_larger_bench",
  "affirms",
  "reverses",
  "modifies",
  "per_incuriam",
  "interprets",
  "amended_by",
  "supports",
  "opposes",
] as const;
export type LegalRelation = (typeof LEGAL_RELATIONS)[number];

export interface LegalEdge {
  id: string;
  fromKind: string;
  fromId: string;
  relation: LegalRelation;
  toKind: string;
  toId: string;
  /** Where the words that state the relation are: "<judgment id>#p<para>". */
  evidenceRef: string;
  quote: string;
  status: "candidate" | "confirmed" | "rejected";
  builtFrom: string;
  builtAt: string;
}

export interface JudgmentIdentity {
  id: string;
  court: string;
  courtName: string;
  title: string;
  decisionDate: string;
  citations: string[];
  caseNumbers: string[];
  judges: string[];
  benchStrength: number;
  paragraphs: number;
  indexedAt: string | null;
}

// ---- E5, E6, E7 ----

export type BindingLabel = "binding" | "persuasive" | "not_binding" | "undetermined";

export interface BindingResult {
  label: BindingLabel;
  reasons: string[];
  /** Facts the result needs and does not have. */
  unresolved: string[];
}

export interface BindingRecord extends BindingResult {
  authorityId: string;
  citation: string;
  forum: string;
  at: string;
  status: "candidate" | "confirmed";
}

export interface LegalConflict {
  id: string;
  kind: "treatment" | "larger_bench_reference" | "courts_differ";
  subject: string;
  a: string;
  b: string;
  detail: string;
  status: "open" | "reviewed";
  createdAt: string;
}

export const PROPOSITION_KINDS = ["proposition", "interpretation", "test", "burden", "procedural_principle", "remedy", "limitation_principle", "jurisdiction_principle"] as const;
export type PropositionKind = (typeof PROPOSITION_KINDS)[number];

export interface PropositionPassage {
  side: "supports" | "adverse";
  judgmentId: string;
  citation: string;
  para: string;
  quote: string;
}

export interface Proposition {
  id: string;
  kind: PropositionKind;
  text: string;
  provisions: string[];
  passages: PropositionPassage[];
  status: "proposed" | "confirmed" | "superseded" | "rejected";
  verifiedOn: string | null;
  author: "advocate" | "agent";
  createdAt: string;
  updatedAt: string;
}

// ---- G6, G7, J1: retrieval ----

export const KNOWLEDGE_SCOPES = ["advocate", "firm", "statute", "procedure", "matter", "research", "session"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const SEARCH_MODES = [
  "natural",
  "phrase",
  "boolean",
  "citation",
  "party",
  "judge",
  "court",
  "statute",
  "paragraph",
  "proposition",
  "fact_pattern",
  "connected",
  "historical",
  "cross_jurisdiction",
] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export interface KnowledgeHit {
  id: string;
  scope: KnowledgeScope;
  kind: string;
  title: string;
  text: string;
  /** Where to open it: a provision id, "<judgment id>#p<n>", a source line anchor, a record id. */
  anchor: string;
  date: string | null;
  /** 3 the Supreme Court, 2 a High Court, 1 other; 0 when it is not an authority. */
  authority: number;
  verification: string;
  stale: boolean;
  score: number;
  /** Which retrievers found it: "text", "vector", "graph", "filter". */
  why: string[];
}

export interface RetrievalResult {
  query: string;
  mode: SearchMode;
  hits: KnowledgeHit[];
  /** What was not searched, and why. Coverage is always stated (J2). */
  notSearched: Array<{ scope: KnowledgeScope; reason: string }>;
  vectors: "on" | "off";
  ms: number;
}

export interface IndexHealth {
  name: string;
  owner: string;
  rows: number;
  builtAt: string | null;
  state: "ok" | "empty" | "stale" | "off";
  detail: string;
}

// ---- J2 to J6, H11 ----

export interface ResearchPlanStep {
  n: number;
  question: string;
  mode: SearchMode;
  scopes: KnowledgeScope[];
  status: "planned" | "done" | "not_reached";
  hits: number;
  note: string;
}

export interface ResearchPlan {
  id: string;
  question: string;
  issueId: string | null;
  governingDate: string | null;
  steps: ResearchPlanStep[];
  status: "proposed" | "approved" | "running" | "done" | "stopped";
  /** J2 completeness: issues with no authority, authorities not checked, sources not reached. */
  completeness: { issuesWithoutAuthority: string[]; authoritiesNotChecked: string[]; sourcesNotReached: string[] };
  author: "advocate" | "agent";
  createdAt: string;
  updatedAt: string;
}

export interface AdverseHit {
  issueId: string | null;
  issue: string;
  hit: KnowledgeHit;
  reason: string;
}

export interface AuthorityAnalysis {
  authorityId: string;
  citation: string;
  title: string;
  court: string;
  decisionDate: string;
  benchStrength: number;
  judges: string[];
  roles: Array<{ role: PassageRole; para: string; text: string; status: string }>;
  treatments: LegalEdge[];
  provisions: Array<{ ref: string; state: InForceState | "not_in_library" }>;
  binding: BindingResult;
  conflicts: LegalConflict[];
  notRead: string | null;
}

export const DELIVERABLE_KINDS = [
  "case_law_matrix",
  "statutory_matrix",
  "issue_authority_matrix",
  "proposition_table",
  "adverse_authority_report",
  "research_memorandum",
  "opinion",
  "written_submissions",
  "strategy_report",
  "historical_law_report",
  "comparative_report",
] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export interface ResearchHistoryEntry {
  id: string;
  at: string;
  query: string;
  mode: SearchMode;
  hits: number;
  /** Law only: provision and judgment ids. Never a fact of a matter. */
  lawRefs: string[];
  actor: string;
}

export interface VaultAnswer {
  question: string;
  hits: Array<{ sourceId: string; sourceName: string; page: number; line: number; text: string; issue: string | null }>;
  groups: Array<{ issue: string; count: number }>;
  coverage: { sources: number; searched: number; withoutText: number };
}

export interface VaultAnomaly {
  kind: "no_text" | "no_date" | "duplicate" | "low_confidence" | "unclassified" | "failed";
  sourceId: string;
  sourceName: string;
  detail: string;
}

// ---- Review notes on a plan, a memorandum or a deliverable (the plan-review pattern) ----

export const ANNOTATION_KINDS = ["comment", "replace", "delete", "insert", "global"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface Annotation {
  id: string;
  targetKind: "plan" | "research_plan" | "memorandum" | "deliverable" | "draft";
  targetId: string;
  kind: AnnotationKind;
  /** The words the note is about, copied from the target. Empty for a global note. */
  quote: string;
  /** The advocate's comment, or the replacement text. */
  body: string;
  status: "open" | "sent" | "withdrawn";
  createdAt: string;
}

// ---- Session logs ----

export interface SessionLogEntry {
  seq: number;
  at: string;
  /** "<pi session id>#<segment>". A compaction closes a segment and opens the next. */
  session: string;
  kind: string;
  data: Record<string, unknown> | null;
}

export interface FirmMatterRow {
  matterId: string;
  title: string;
  stage: string;
  court: string;
  nextDate: string | null;
  updatedAt: string;
}
