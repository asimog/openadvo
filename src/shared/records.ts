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
