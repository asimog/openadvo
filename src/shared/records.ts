/** Matter record types. Types only: shared by the library, the main process and the renderer. */

export type Actor = "advocate" | "agent" | "system";
export type SourceStatus = "ok" | "missing" | "changed";

export interface MatterSummary {
  id: string;
  title: string;
  createdAt: string;
  folder: string;
  /** V1-10. */
  archived?: boolean;
}

export interface SourceRecord {
  id: string;
  sha256: string;
  name: string;
  size: number;
  mediaType: string;
  addedAt: string;
  status: SourceStatus;
  checkedAt: string | null;
  origins: number;
  /** V2-2: the document type. A proposal is a candidate until the advocate confirms or sets it. */
  docType?: { type: string; status: "candidate" | "confirmed"; matched: string } | null;
}

export interface OriginRecord {
  id: number;
  sourceId: string;
  originalName: string;
  originalPath: string;
  addedAt: string;
  actor: Actor;
}

export interface EventRecord {
  seq: number;
  at: string;
  actor: Actor;
  action: string;
  subject: string | null;
  sessionId: string | null;
  data: Record<string, unknown> | null;
}

export interface AddFileResult {
  path: string;
  outcome: "added" | "duplicate" | "refused";
  source?: SourceRecord;
  reason?: string;
}

export interface WriteContext {
  actor: Actor;
  sessionId?: string | null;
}

export type TextKind = "born_digital" | "ocr" | "none";
export type JobState = "queued" | "running" | "done" | "failed";
export type ReviewStatus = "open" | "resolved" | "skipped";

export interface IngestJob {
  sourceId: string;
  state: JobState;
  pages: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

/** A line anchor: the source's SHA-256, the page and the line. Its id survives a rename. */
export interface AnchorRecord {
  id: string;
  sourceId: string;
  sha256: string;
  page: number;
  line: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface PageRecord {
  sourceId: string;
  page: number;
  kind: TextKind;
  width: number;
  height: number;
  text: string;
  ocr: { engine: string; version: string; confidence: number } | null;
  lines: AnchorRecord[];
}

export interface ReviewItem {
  id: string;
  kind: string;
  sourceId: string | null;
  page: number | null;
  detail: string;
  status: ReviewStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: Actor | null;
  /** Step 5: the draft whose check found this defect. Null for a source or Notebook item. */
  draftId: string | null;
}

/** One page as document intelligence returns it (input to the matter store). */
export interface PageInput {
  page: number;
  width: number;
  height: number;
  kind: TextKind;
  text: string;
  lines: Array<{ line: number; x: number; y: number; w: number; h: number; text: string }>;
  ocr?: { engine: string; version: string; confidence: number };
  /** V5-8: the second engine's reading and the lines where the two disagree on a critical token. */
  second?: { engine: string; version: string; confidence: number; text: string; disagreements: Array<{ line: number; readingA: string; readingB: string; tokensA: string[]; tokensB: string[] }> };
  /** H4: signature, stamp and seal marks, candidates for the advocate. */
  marks?: Array<{ kind: "signature" | "stamp" | "seal" | "handwriting"; x: number; y: number; w: number; h: number; confidence: number; note: string }>;
}

export type EventStatus = "candidate" | "confirmed" | "rejected";
export type EventDecision = "confirmed" | "rejected" | "excluded" | "included";

/** One event of the Factual Matrix: the fields of workflow section 6. */
export interface NotebookEvent {
  id: string;
  sourceId: string;
  sourceName: string;
  anchorId: string;
  page: number;
  line: number;
  dateText: string;
  dateStart: string;
  dateEnd: string;
  dateType: "explicit" | "inferred" | "range";
  description: string;
  kind: "procedural" | "factual";
  reading: "text_layer" | "ocr";
  method: string;
  status: EventStatus;
  excluded: boolean;
  conflicts: string[];
  /** V5-7: the advocate's latest correction, with the text as extracted. */
  corrected?: { reason: string; at: string; original: { dateText: string; dateStart: string; dateEnd: string; description: string } } | null;
  /** V5-8: "open" while its line has an undecided OCR dispute; "replaced" when the advocate chose another reading. */
  disputed?: "open" | "replaced" | null;
}

export interface DateConflict {
  id: string;
  eventA: string;
  eventB: string;
  status: "open" | "resolved";
  resolution: string | null;
  reviewItemId: string;
}

export interface Readiness {
  ready: boolean;
  jobsPending: number;
  openReviewItems: number;
}

export interface Notebook {
  events: NotebookEvent[];
  conflicts: DateConflict[];
  readiness: Readiness;
}

// ---- Step 4: drafts and revisions (work products). The matter store writes them. ----

export const DRAFT_KINDS = [
  // Records of the matter (deterministic generation from confirmed records).
  "list_of_dates",
  "synopsis",
  "questions_of_law",
  "grounds",
  // Pleadings and petitions (L3).
  "petition",
  "writ_petition",
  "plaint",
  "written_statement",
  "replication",
  "appeal_memo",
  "revision_petition",
  "counter_affidavit",
  "rejoinder",
  "memo_of_parties",
  "vakalatnama",
  "appendix_of_provisions",
  // Applications (L3).
  "application_interim",
  "application_stay",
  "application_exemption",
  "application_early_hearing",
  "condonation",
  // Evidence and submissions (L3, L8).
  "affidavit",
  "written_submissions",
  // Pre-litigation and notices (L3).
  "legal_notice",
  "notice_reply",
  // Notes, summaries and indices (L3).
  "chronology",
  "briefing_note",
  "case_summary",
  "research_memo",
  "index",
  "conference",
  // Hearing preparation (phase 7: K6, K7).
  "hearing_brief",
  "oral_outline",
  // Letters to the client; the advocate sends them (L3).
  "client_letter",
  "hearing_update",
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/** A generator wrote the revision, or the advocate saved it from the editor. */
export type RevisionAuthor = "generator" | "advocate" | "agent";

export interface RevisionRecord {
  id: string;
  draftId: string;
  /** 1 for the first revision of a draft. */
  seq: number;
  sha256: string;
  size: number;
  /** The revision this one is based on. Null for a generator's first revision. */
  baseRevisionId: string | null;
  author: RevisionAuthor;
  createdAt: string;
  /** Set by the advocate's approval only (decision 5). */
  approvedAt: string | null;
  approvedBy: "advocate" | null;
}

export interface DraftRecord {
  id: string;
  kind: DraftKind;
  title: string;
  createdAt: string;
  revisionCount: number;
  /** The latest revision. */
  head: RevisionRecord | null;
  /** The latest approved revision, or null. */
  approved: RevisionRecord | null;
}

/** One paragraph of a revision as the DOCX carries it. `anchor` is null for a paragraph without a link. */
export interface DraftParagraph {
  anchor: string | null;
  text: string;
}

export interface RevisionDetail extends RevisionRecord {
  paragraphs: DraftParagraph[];
}

/** The Notebook fields a generated paragraph links to (build-plan section 5.2). */
export interface ParagraphSourceEvent {
  id: string;
  dateStart: string;
  dateEnd: string;
  dateText: string;
  description: string;
  kind: "procedural" | "factual";
  reading: "text_layer" | "ocr";
  sourceId: string;
  sourceName: string;
  anchorId: string;
  page: number;
  line: number;
}

/** One fact behind a generated paragraph, for "Show source of this paragraph" (L2). */
export interface ParagraphSourceFact {
  id: string;
  text: string;
  type: string;
  status: string;
  sourceName: string | null;
  anchorId: string | null;
  page: number | null;
  line: number | null;
}

/** One evidence statement behind a generated paragraph (the witness rule, L8). */
export interface ParagraphSourceEvidence {
  id: string;
  statement: string;
  givenBy: string;
  givenAt: string;
  witness: string;
  exhibitNumber: string;
  sourceName: string;
}

export interface ParagraphSource {
  draftId: string;
  anchor: string;
  text: string;
  eventIds: string[];
  events: ParagraphSourceEvent[];
  factIds: string[];
  facts: ParagraphSourceFact[];
  evidenceIds: string[];
  evidence: ParagraphSourceEvidence[];
}

/** One defect of a draft check (step 5). The plain library `lib/verification` owns the rules. */
export interface DraftDefect {
  kind: string;
  /** The position of the paragraph in the draft, from 1. */
  paragraph: number;
  anchor: string | null;
  text: string;
  evidence: string;
  action: string;
}

/** The reviewer note above the check result (P9): what was read, the items for judgment, the currency of what was used, and what to do before relying on it. */
export interface ReviewerNote {
  /** Sources with lines that the checks read, of all the sources of the matter. Null when not counted. */
  sources: { read: number; of: number } | null;
  /** The open items for judgment, by severity, the highest first. Nothing downstream may lower one. */
  items: Array<{ severity: string; label: string; count: number }>;
  /** Every rule, statute and source the check used, with its currency state. */
  currency: string[];
  /** What the advocate does before relying on this draft. */
  beforeRelying: string[];
}

/** The result of the deterministic checks on one stored revision. */
export interface DraftCheck {
  draftId: string;
  revisionId: string;
  seq: number;
  method: string;
  checkedAt: string;
  statementsChecked: number;
  defects: DraftDefect[];
  /** Checks that could not run, each with its reason. */
  notRun: Array<{ check: string; reason: string }>;
  /** Review items this check opened, and defects whose item was already open. */
  reviewItems: { opened: number; alreadyOpen: number };
  /** The quality-gate state of this draft (workflow 9), from one tested mapping. */
  gate: { state: string; label: string; reasons: string[]; notAvailable: string[] };
  /** The grounding check (P1): grounded statements of checked statements, or null when nothing to check. */
  grounding: { score: number; checked: number; grounded: number } | null;
  /** The reviewer note (P9). */
  reviewerNote: ReviewerNote;
  /** The preference questions this task asks once (A7): the keys it needs that have no approved value. */
  preferenceQuestions: Array<{ key: string; title: string; question: string; values: string[] | null; free: boolean; default: string }>;
}

export interface GeneratedDraft {
  draft: DraftRecord;
  revision: RevisionRecord;
}

/** One anchor written into a draft's DOCX, and the records it links to. */
export interface ParagraphLinkRecord {
  draftId: string;
  anchor: string;
  /** The revision whose DOCX first carried this anchor. */
  revisionId: string | null;
  /** The paragraph text when the link was made. */
  text: string;
  eventIds: string[];
  /** The facts this paragraph states (L2). */
  factIds: string[];
  /** The evidence statements this paragraph organizes (L8). */
  evidenceIds: string[];
  createdAt: string;
}

/** One paragraph a generator hands the store, with the ids of the records it states (L2). */
export interface ParagraphLinkInput {
  anchor: string;
  text: string;
  eventIds: string[];
  factIds?: string[];
  evidenceIds?: string[];
}

/** An event as the extraction rules produce it (input to the matter store). */
export interface EventInput {
  id: string;
  sourceId: string;
  anchorId: string;
  page: number;
  line: number;
  dateText: string;
  dateStart: string;
  dateEnd: string;
  dateType: "explicit" | "inferred" | "range";
  description: string;
  kind: "procedural" | "factual";
  reading: "text_layer" | "ocr";
  method: string;
}

/** One paragraph that holds an agent change the advocate has not decided (step 5). */
export interface AgentChange {
  anchor: string;
  before: string;
  after: string;
  /** Editor-design item g: touches a date, a number or an amount. Never part of Keep all. */
  substantive: boolean;
}

/** The undecided agent changes of one draft, read from its head revision. */
export interface AgentChanges {
  draftId: string;
  title: string;
  revisionId: string;
  seq: number;
  changes: AgentChange[];
}
