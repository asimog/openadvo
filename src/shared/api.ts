/**
 * The bridge contract between the preload script and the renderer.
 * Types, and one constant name. The renderer calls these named functions; it has no other access.
 */
import type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft, DraftCheck, DraftDefect, AgentChanges } from "./records.ts";
export type { AgentChanges, AgentChange } from "./records.ts";
import type { ManifestCheck, AdverseReview, AnnexureRecord, Attestation, AuthorityRecord, CitationCheck, FilingSetRecord, FilingState, IssueRecord, LimitationRecord, MatterDetails, ResearchState } from "./work.ts";
export type * from "./work.ts";

import type { AGUIEvent } from "@ag-ui/core";

export type { AGUIEvent };
export type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft, DraftCheck, DraftDefect };

export type ChatRole = "advocate" | "agent" | "tool" | "notice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

/**
 * Streamed from the main process while the agent works: AG-UI protocol events
 * (decisions.md choice 21), one matter each. A run is RUN_STARTED, then text and tool-call
 * events, then RUN_FINISHED or RUN_ERROR. An advocate message or a notice of the
 * application is a CUSTOM event named CHAT_MESSAGE_EVENT whose value is a ChatMessage.
 */
export interface ChatEvent {
  matterId: string;
  event: AGUIEvent;
}

/** The name of the CUSTOM event that carries one ChatMessage of the application. */
export const CHAT_MESSAGE_EVENT = "openadvo.chat_message";

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

/** How much the model reasons before it answers. The model decides which levels it accepts. */
export type EffortLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface EffortState {
  level: EffortLevel;
  /** The levels the current model accepts. A model with no reasoning accepts only "off". */
  available: EffortLevel[];
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
  getEffort(): Promise<EffortState>;
  setEffort(level: EffortLevel): Promise<EffortState>;
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
  /** Step 5: the deterministic checks on the latest stored revision of a draft. It changes no draft. */
  checkDraft(matterId: string, draftId: string): Promise<DraftCheck>;
  /** Human-only actions (decision 5). `bytes` are the editor's Editor.bin, converted to DOCX in the main process. */
  saveRevision(matterId: string, draftId: string, bytes: Uint8Array, baseRevisionId: string): Promise<RevisionRecord>;
  approveRevision(matterId: string, revisionId: string): Promise<DraftRecord>;
  /** Step 6: start the Questions of Law or Grounds draft (title only). */
  generateDraft(matterId: string, kind: "questions_of_law" | "grounds" | "petition" | "conference"): Promise<GeneratedDraft>;
  getResearch(matterId: string): Promise<ResearchState>;
  addIssue(matterId: string, text: string): Promise<IssueRecord>;
  /** Human-only: the case conference decides an issue, with a reason. */
  decideIssue(matterId: string, id: string, decision: "accepted" | "rejected", reason: string): Promise<IssueRecord>;
  addAuthority(matterId: string, input: { citation: string; parties?: string; decisionDate?: string; paragraph?: string; proposition?: string; role: AuthorityRecord["role"]; issueId?: string | null }): Promise<AuthorityRecord>;
  /** Human-only. */
  decideAuthority(matterId: string, id: string, decision: "adopted" | "rejected"): Promise<AuthorityRecord>;
  /** Step 7: run the citation validator. */
  checkCitations(matterId: string, draftId: string | null): Promise<CitationCheck[]>;
  /** Human-only: an attestation, never shown as verified. */
  attestCitation(matterId: string, citation: string, reason: string): Promise<Attestation>;
  /** Human-only. */
  recordAdverseReview(matterId: string, outcome: AdverseReview["outcome"], coverage: string, note: string): Promise<AdverseReview>;
  searchCitationIndex(query: string): Promise<Array<{ citation: string; parties: string; date: string; caseNumber: string }>>;
  /** Step 8. */
  getFiling(matterId: string): Promise<FilingState>;
  /** Human-only. */
  setMatterDetails(matterId: string, input: Partial<Omit<MatterDetails, "updatedAt">>): Promise<MatterDetails>;
  /** Human-only. */
  setAnnexures(matterId: string, items: Array<{ sourceId: string; title: string }>): Promise<AnnexureRecord[]>;
  computeLimitation(matterId: string): Promise<LimitationRecord>;
  /** Human-only. */
  confirmLimitation(matterId: string, id: string): Promise<LimitationRecord>;
  /** Human-only: approve for filing; makes the PDF/A filing set. */
  approveForFiling(matterId: string): Promise<FilingSetRecord>;
  /** Human-only: confirmation 1 or 2, bound to the payload hash. */
  confirmFiling(matterId: string, filingSetId: string, payloadSha256: string, step: 1 | 2): Promise<FilingSetRecord>;
  revealFilingSet(matterId: string): Promise<void>;
  /** V1-8: recompute the manifest digest and the file hashes of the newest filing set. */
  verifyFilingManifest(matterId: string): Promise<ManifestCheck | null>;
  /** Step 10: speech to text on this machine. Text for the composer only; voice confirms nothing. */
  voiceStatus(): Promise<{ available: boolean; detail: string }>;
  transcribe(samples: Float32Array): Promise<string>;
  /** Step 9. */
  openPortal(matterId: string): Promise<string>;
  importEmail(matterId: string): Promise<{ messages: number; attachments: Array<{ message: string; name: string; outcome: string }> }>;
  getMailAccount(): Promise<{ host: string; port: number; secure: boolean; user: string; hasPassword: boolean } | null>;
  setMailAccount(account: { host: string; port: number; secure: boolean; user: string }, password: string): Promise<{ host: string; port: number; secure: boolean; user: string; hasPassword: boolean }>;
  fetchMail(matterId: string, filter: { from?: string; subject?: string; since?: string }): Promise<{ messages: number; attachments: Array<{ message: string; name: string; outcome: string }> }>;
  /** The agent changes not yet decided, per draft (step 5). */
  agentChanges(matterId: string): Promise<AgentChanges[]>;
  /** Human-only (decision 5): keep or undo agent changes in the head revision. Makes a new revision. */
  decideAgentChanges(
    matterId: string,
    draftId: string,
    baseRevisionId: string,
    decisions: Array<{ anchor: string; decision: "keep" | "undo" }>,
  ): Promise<RevisionRecord>;
}
