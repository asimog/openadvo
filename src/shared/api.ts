/**
 * The bridge contract between the preload script and the renderer.
 * Types only. The renderer calls these named functions; it has no other access.
 */
import type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft } from "./records.ts";

export type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft };

export type ChatRole = "advocate" | "agent" | "tool" | "notice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

/** Streamed from the main process while the agent works. */
export type ChatEvent =
  | { matterId: string; type: "message"; message: ChatMessage }
  | { matterId: string; type: "delta"; messageId: string; delta: string }
  | { matterId: string; type: "busy"; busy: boolean };

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  model: string | null;
}

/** One model from pi-ai's list of models that have credentials. */
export interface ModelChoice {
  key: string; // "provider/id"
  provider: string;
  id: string;
  name: string;
}

export interface OpenAdvoApi {
  // Queries
  listMatters(): Promise<MatterSummary[]>;
  openMatter(matterId: string): Promise<SourceRecord[]>;
  listSources(matterId: string): Promise<SourceRecord[]>;
  listOrigins(matterId: string, sourceId: string): Promise<OriginRecord[]>;
  listEvents(matterId: string): Promise<EventRecord[]>;
  getChat(matterId: string): Promise<ChatState>;
  listModels(): Promise<ModelChoice[]>;
  getModel(): Promise<string | null>;
  // Actions
  createMatter(title: string): Promise<MatterSummary>;
  addFiles(matterId: string, paths: string[]): Promise<AddFileResult[]>;
  pickFiles(): Promise<string[]>;
  pathsForFiles(files: File[]): string[];
  sendChat(matterId: string, text: string): Promise<void>;
  setModel(key: string): Promise<string>;
  /** Open a source read only in the Euro-Office PDF editor. Returns the URL for a sandboxed frame. */
  openSourceView(matterId: string, sourceId: string): Promise<string>;
  closeView(url: string): Promise<void>;
  listJobs(matterId: string): Promise<IngestJob[]>;
  getSourcePages(matterId: string, sourceId: string): Promise<PageRecord[]>;
  listReviewItems(matterId: string): Promise<ReviewItem[]>;
  /** Human-only actions (decision 5). */
  resolveReviewItem(matterId: string, itemId: string): Promise<ReviewItem>;
  skipReviewItem(matterId: string, itemId: string): Promise<ReviewItem>;
  onIngestUpdate(listener: (matterId: string) => void): () => void;
  getNotebook(matterId: string): Promise<Notebook>;
  /** Human-only actions on Notebook events (decision 5). */
  confirmEvent(matterId: string, eventId: string): Promise<Notebook>;
  rejectEvent(matterId: string, eventId: string): Promise<Notebook>;
  excludeEvent(matterId: string, eventId: string): Promise<Notebook>;
  includeEvent(matterId: string, eventId: string): Promise<Notebook>;
  /** resolution: the id of the event whose date is right, or "both". */
  resolveConflict(matterId: string, conflictId: string, resolution: string): Promise<Notebook>;
  onChatEvent(listener: (event: ChatEvent) => void): () => void;
  // Step 4: drafts and revisions.
  listDrafts(matterId: string): Promise<DraftRecord[]>;
  /** One revision with its live paragraphs and the anchor of each (WD-013: live text only). */
  getRevision(matterId: string, revisionId: string): Promise<RevisionDetail>;
  /** The Notebook events one paragraph anchor links to, with their source lines. */
  getParagraphSource(matterId: string, draftId: string, anchor: string): Promise<ParagraphSource | null>;
  /** Deterministic generation from confirmed Notebook events only. */
  generateListOfDates(matterId: string): Promise<GeneratedDraft>;
  generateSynopsis(matterId: string): Promise<GeneratedDraft>;
  /** Open a revision in the Euro-Office Word editor. Returns the URL for a sandboxed frame. */
  openRevisionInEditor(matterId: string, revisionId: string): Promise<string>;
  /** Insert one confirmed event's sentence at the cursor: the anchor is recorded before the editor adds it. */
  insertFromNotebook(matterId: string, draftId: string, eventId: string): Promise<{ anchor: string; text: string }>;
  /** Human-only actions (decision 5). `bytes` are the editor's Editor.bin, converted to DOCX in the main process. */
  saveRevision(matterId: string, draftId: string, bytes: Uint8Array, baseRevisionId: string): Promise<RevisionRecord>;
  approveRevision(matterId: string, revisionId: string): Promise<DraftRecord>;
}
