/** Matter record types. Types only: shared by the library, the main process and the renderer. */

export type Actor = "advocate" | "agent" | "system";
export type SourceStatus = "ok" | "missing" | "changed";

export interface MatterSummary {
  id: string;
  title: string;
  createdAt: string;
  folder: string;
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

export type DraftKind = "list_of_dates" | "synopsis" | "questions_of_law" | "grounds";

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

export interface ParagraphSource {
  draftId: string;
  anchor: string;
  text: string;
  eventIds: string[];
  events: ParagraphSourceEvent[];
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
}

export interface GeneratedDraft {
  draft: DraftRecord;
  revision: RevisionRecord;
}

/** One anchor written into a draft's DOCX, and the Notebook events it links to. */
export interface ParagraphLinkRecord {
  draftId: string;
  anchor: string;
  /** The revision whose DOCX first carried this anchor. */
  revisionId: string | null;
  /** The paragraph text when the link was made. */
  text: string;
  eventIds: string[];
  createdAt: string;
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
