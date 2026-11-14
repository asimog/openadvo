/**
 * The bridge contract between the preload script and the renderer.
 * Types, and one constant name. The renderer calls these named functions; it has no other access.
 */
import type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft, DraftCheck, DraftDefect, AgentChanges } from "./records.ts";
export type { AgentChanges, AgentChange } from "./records.ts";
import type { InboxItem, ProgressStage, DuplicatePair, MemoryProposal, RecordColumn, RecordTable, Workflow, ManifestCheck, AdverseReview, AnnexureRecord, Attestation, AuthorityRecord, CitationCheck, FilingSetRecord, FilingState, IssueRecord, LimitationRecord, MatterDetails, ResearchState } from "./work.ts";
export type * from "./work.ts";
export type * from "./studio.ts";
export type * from "./audit.ts";
export type { Entity, OcrDispute } from "./audit.ts";
import type { ChainCheck, Refusal, Inspection, FindHit, Entity, OcrDispute } from "./audit.ts";
import type { Assessment, Challenge, QuickCheck, Treatment, ArgumentRun, ArgumentRecord, CorpusPart, ProvisionRecord, ResearchDocument, ResearchHit, ResearchSettings, StudioState } from "./studio.ts";

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

/** V3-4. */
export type Appearance = "system" | "light" | "dark";

export interface AppInfo {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  euroOffice: string;
  validator: string;
  folders: { matters: string; userData: string };
  signingKey: string | null;
}

export interface OpenAdvoApi {
  // Queries
  listMatters(): Promise<MatterSummary[]>;
  // V1 (docs/specs/v1.md). Human-only where marked.
  /** Human-only (V1-10). */
  renameMatter(matterId: string, title: string): Promise<MatterSummary>;
  /** Human-only (V1-10). Nothing is deleted. */
  setMatterArchived(matterId: string, archived: boolean): Promise<void>;
  /** V1-1: end the conversation; a new Pi session file starts. */
  newConversation(matterId: string): Promise<ChatState>;
  getMemory(matterId: string): Promise<string>;
  /** Human-only (V1-3). */
  setMemory(matterId: string, text: string): Promise<string>;
  listWorkflows(): Promise<Workflow[]>;
  saveWorkflow(input: { id?: string; title: string; body: string }): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<Workflow[]>;
  getRecordTable(matterId: string): Promise<RecordTable>;
  /** Human-only (V1-5). */
  addRecordColumn(matterId: string, question: string): Promise<RecordColumn>;
  /** Human-only (V1-5). */
  decideRecordCell(matterId: string, sourceId: string, columnId: string, decision: "confirm" | "clear"): Promise<RecordTable>;
  // V2 (docs/specs/v2.md). Human-only where marked.
  /** Human-only (V2-2). */
  setSourceType(matterId: string, sourceId: string, type: string): Promise<SourceRecord[]>;
  listDuplicates(matterId: string): Promise<DuplicatePair[]>;
  /** Human-only (V2-3). Nothing is merged. */
  decideDuplicate(matterId: string, reviewItemId: string, decision: "same" | "different"): Promise<DuplicatePair>;
  getListOfDatesRows(matterId: string): Promise<string[]>;
  /** Human-only (V2-5). An empty list clears the choice. */
  setListOfDatesRows(matterId: string, eventIds: string[]): Promise<string[]>;
  listMemoryProposals(matterId: string): Promise<MemoryProposal[]>;
  /** Human-only (V2-8). An accepted text is added to memory.md. */
  decideMemoryProposal(matterId: string, id: string, accept: boolean): Promise<MemoryProposal[]>;
  // V3 (docs/specs/v3.md).
  getProgress(matterId: string): Promise<ProgressStage[]>;
  getInbox(matterId: string): Promise<InboxItem[]>;
  /** V3-3: lines of the matter's sources that contain the words. */
  searchSources(matterId: string, query: string): Promise<AnchorRecord[]>;
  getAppInfo(): Promise<AppInfo>;
  getAppearance(): Promise<Appearance>;
  setAppearance(mode: Appearance): Promise<Appearance>;
  /** V3-5: asks where to save; null when the advocate cancels. */
  exportMatter(matterId: string): Promise<{ path: string; files: number; bytes: number } | null>;
  /** V2-7: the fingerprint of the manifest signing key, or null when manifests cannot be signed. */
  signingFingerprint(): Promise<string | null>;
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
  // V5 (docs/specs/v5.md).
  verifyRecordChain(matterId: string): Promise<ChainCheck>;
  listRefusals(matterId: string): Promise<Refusal[]>;
  inspectRecord(matterId: string, id: string): Promise<Inspection | null>;
  findInMatter(matterId: string, q: string): Promise<FindHit[]>;
  listMatterFiles(matterId: string): Promise<Array<{ path: string; size: number; isDir: boolean; files?: number }>>;
  openMatterFile(matterId: string, rel: string): Promise<boolean>;
  listJobsOverview(matterId: string): Promise<{ reading: Array<IngestJob & { name: string }>; runs: ArgumentRun[]; running: string | null; indexing: string | null }>;
  stopArgumentLoop(matterId: string): Promise<boolean>;
  /** V5-9: not verification. */
  quickCheckCitations(matterId: string): Promise<QuickCheck[]>;
  /** V5-12: descriptive, advisory. */
  benchTrends(): Promise<Array<{ year: number; total: number; allowed: number; dismissed: number; disposed: number; other: number }>>;
  /** Human-only (V5-10): the advocate's value is confirmed. */
  assessAuthority(matterId: string, authorityId: string, field: "support" | "voice", value: string, basis: string): Promise<Assessment>;
  addTreatment(matterId: string, input: { authorityId: string; kind: Treatment["kind"]; byCitation: string; byDate?: string; byBench?: number | null; authorityDate?: string; authorityBench?: number | null; note?: string }): Promise<Treatment>;
  runRehearsal(matterId: string): Promise<{ runId: string; added: number; rejected: number }>;
  /** Human-only (V5-11). */
  decideChallenge(matterId: string, id: string, status: "accepted" | "rejected"): Promise<Challenge[]>;
  getEntities(matterId: string): Promise<{ entities: Entity[]; conflicts: Array<{ key: string; values: string[]; anchors: string[] }> }>;
  /** Human-only (V5-7). */
  correctEvent(matterId: string, eventId: string, input: { dateStart: string; dateEnd?: string; description: string }, reason: string): Promise<Notebook>;
  /** Human-only (V5-7). */
  setDateAnchor(matterId: string, sourceId: string, date: string): Promise<{ added: number; notebook: Notebook }>;
  listOcrDisputes(matterId: string, sourceId?: string): Promise<OcrDispute[]>;
  /** Human-only (V5-8). */
  decideOcrDispute(matterId: string, id: string, choice: "a" | "b" | "typed", typed?: string): Promise<{ dispute: OcrDispute; added: number }>;
  // V4 (docs/specs/v4.md). Human-only where marked.
  getStudio(matterId: string): Promise<StudioState>;
  getResearchLog(matterId: string): Promise<EventRecord[]>;
  researchSearch(matterId: string, source: ResearchHit["source"], query: string, opts?: { from?: number; to?: number; limit?: number }): Promise<{ hits: ResearchHit[]; notice: string }>;
  researchRead(matterId: string, source: ResearchHit["source"], ref: string): Promise<ResearchDocument>;
  /** Saves as an adopted authority (the advocate's own save). */
  saveJudgment(matterId: string, ref: string, input: { paragraph?: string; proposition?: string; role?: string; issueId?: string | null }): Promise<AuthorityRecord>;
  saveProvision(matterId: string, ref: string): Promise<ProvisionRecord>;
  /** Human-only. */
  decideProvision(matterId: string, id: string, decision: "adopted" | "rejected"): Promise<ProvisionRecord>;
  /** Starts the argument loop; returns the run id. */
  startArgumentLoop(matterId: string, issueId: string, opts?: { rounds?: number; generators?: number }): Promise<string>;
  /** Human-only. */
  decideArgument(matterId: string, id: string, decision: "accepted" | "rejected"): Promise<ArgumentRecord>;
  /** Proposes an accepted argument as a tracked insertion in the Grounds. */
  argumentToGrounds(matterId: string, id: string): Promise<string>;
  getWeakPoints(matterId: string): Promise<Array<{ claim: string; questions: string[]; attacks: Array<{ kind: string; claim: string }> }>>;
  corpusParts(): Promise<CorpusPart[]>;
  indexSupremeCourt(years: number[]): Promise<CorpusPart[]>;
  listHighCourts(year: number): Promise<Array<{ code: string; name: string }>>;
  indexHighCourt(code: string, year: number): Promise<CorpusPart[]>;
  getResearchSettings(): Promise<ResearchSettings>;
  setResearchSettings(s: ResearchSettings): Promise<ResearchSettings>;
  onStudioChanged(listener: (matterId: string) => void): () => void;
  onStudioProgress(listener: (text: string) => void): () => void;
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
  generateDraft(matterId: string, kind: "questions_of_law" | "grounds" | "petition" | "conference" | "condonation"): Promise<GeneratedDraft>;
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
