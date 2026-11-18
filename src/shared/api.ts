/**
 * The bridge contract between the preload script and the renderer.
 * Types, and one constant name. The renderer calls these named functions; it has no other access.
 */
import type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftKind, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft, DraftCheck, DraftDefect, AgentChanges } from "./records.ts";
export type { AgentChanges, AgentChange } from "./records.ts";
import type { InboxItem, ProgressStage, DuplicatePair, MemoryProposal, RecordColumn, RecordTable, Workflow, ManifestCheck, AdverseReview, AnnexureRecord, Attestation, AuthorityRecord, CitationCheck, FilingSetRecord, FilingState, IssueRecord, LimitationRecord, MatterDetails, MatterProfile, MatterProposal, MatterRelation, RelatedMatter, ResearchState } from "./work.ts";
export type * from "./work.ts";
export type * from "./studio.ts";
export type {
  AdapterHealth,
  AuthorityFacts,
  CitationKey,
  Coverage,
  KnowledgeHealthView,
  KnowledgeHit,
  KnowledgeScope,
  LawCounts,
  LawManifest,
  LawManifestAct,
  ResearchPlan,
  ResearchPlanStep,
  RetrievalResult,
  SearchMode,
  SourceFileRow,
  VerificationCheck,
} from "./law.ts";
export type * from "./audit.ts";
export type * from "./practice.ts";
import type { Contact, CrossQuestion, Hearing, Reminder, TaskProposal } from "./practice.ts";
export type { Entity, OcrDispute } from "./audit.ts";
import type { ChainCheck, Refusal, Inspection, FindHit, Entity, OcrDispute } from "./audit.ts";
import type { Assessment, Challenge, QuickCheck, Treatment, ArgumentRun, ArgumentRecord, CorpusPart, ProvisionRecord, ResearchDocument, ResearchHit, ResearchSettings, StudioState, TheoryRecord } from "./studio.ts";
import type { KnowledgeHealthView, KnowledgeScope, LawCounts, ResearchPlan, RetrievalResult, SearchMode } from "./law.ts";

import type { AGUIEvent } from "@ag-ui/core";
import type { ContextCandidate, ContextPackageRecord, JobRow, ReportCard, RoleSummary, SideThread, SkillRunRecord, SkillSummary } from "./skills.ts";
import type { AdvocateProfile, IntelSource, Freshness, LibraryImportResult, LibraryItem, LibraryStatus, MemoryRecord, PreferenceRecord, StoreChains } from "./stores.ts";
import type { BrowserBookmark, BrowserBounds, BrowserShortcut, BrowserState, BrowserVisit, CaseListProposal, CaseListResult } from "./browser.ts";
import type { PackSummary } from "./packs.ts";
import type { LibraryRoleGroup, MemoryAnswer, OutcomeInput, OutcomeRecord, PrecedentOffer } from "./knowledge.ts";
import type { AdvocateGraphView, GraphNodeKind } from "./knowledge.ts";
export type * from "./packs.ts";
export type * from "./browser.ts";
import type { Contradiction, DocumentOperation, DocumentPart, EvidenceRecord, FactRecord, ForumClause, JurisdictionReport, MatterEdge, PageMark, RecordTemplate, RelatedProposal, SourceRelation, TimelineEntry } from "./evidence.ts";
export type * from "./evidence.ts";
export type * from "./skills.ts";
export type * from "./stores.ts";
export type * from "./knowledge.ts";
export type * from "./intel.ts";
import type { AdapterSummary, BenchRow, DefectRow, FormatCheckResult, MatterChecklist, PackList, AdapterProceeding } from "./intel.ts";
import type { DirectoryCourt } from "../lib/court-directory/index.ts";
import type { ClassificationProposal } from "../lib/classification/index.ts";
export type { DirectoryCourt };

export type { AGUIEvent };
export type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord, IngestJob, PageRecord, ReviewItem, AnchorRecord, Notebook, NotebookEvent, DateConflict, DraftKind, DraftRecord, RevisionRecord, RevisionDetail, ParagraphSource, GeneratedDraft, DraftCheck, DraftDefect };

/** One entry of the phase 6 document catalogue (L3). */
export type CatalogueEntry = { kind: DraftKind; title: string; group: string; groupLabel: string; note: string };

export type ChatRole = "advocate" | "agent" | "tool" | "notice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** A tool call, shown with ChatToolCalls. Set on a role "tool" message. */
  tool?: ToolCallView;
  /** A helper's lifecycle event, grouped into one card per helper. */
  helper?: HelperEventView;
  /** N2: the report card of a skill run, shown as a card. */
  skillRun?: ReportCard;
}

/** One tool call as the chat shows it (native-harness-parts section 2). */
export interface ToolCallView {
  name: string;
  /** What the call acted on: the query, the URL, the source, the task. */
  target?: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  /** The refusal or failure, in one line. */
  error?: string;
  /** Set when a helper made the call. */
  helperId?: string;
  helperName?: string;
}

/** One event in a helper's life, as the chat groups it. */
export interface HelperEventView {
  /** The helper id. Absent for a notice about several helpers. */
  id?: string;
  name?: string;
  type?: string;
  event: "started" | "progress" | "question" | "finished" | "failed" | "stopped" | "interrupted" | "recap";
  /** The progress line or the question. */
  detail?: string;
}

/** What the last run used, for the Context panel. */
export interface RunSummary {
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHit: number | null;
  cost: number;
}

/** The matter's totals, from its trace. */
export interface CostSummary {
  runs: number;
  helpers: number;
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}
/** CUSTOM event whose value is `{ lastRun, cost }` after a run. */
export const COST_EVENT = "openadvo.cost";

/**
 * Streamed from the main process while the agent works: AG-UI protocol events
 * (engineering.md EC-11), one matter each. A run is RUN_STARTED, then text and tool-call
 * events, then RUN_FINISHED or RUN_ERROR. An advocate message or a notice of the
 * application is a CUSTOM event named CHAT_MESSAGE_EVENT whose value is a ChatMessage.
 */
export interface ChatEvent {
  matterId: string;
  event: AGUIEvent;
}

/** The name of the CUSTOM event that carries one ChatMessage of the application. */
export const CHAT_MESSAGE_EVENT = "openadvo.chat_message";

/** The CUSTOM event that carries the status lines of the Pi extensions: { [key]: lines }. */
export const EXTENSION_STATUS_EVENT = "openadvo.extension_status";

/**
 * H-12: the CUSTOM event that carries the open questions of the Pi extensions: ExtensionQuestion[].
 * A question arrives during a run, and the run waits for the answer, so it is not a RUN_FINISHED interrupt.
 */
export const EXTENSION_QUESTIONS_EVENT = "openadvo.extension_questions";

/**
 * O10: the Firm Agent's conversation id in every chat bridge function. A colon cannot be in a
 * matter folder's name, so it never equals a matter id (docs/specs/agent-framework.md section 2).
 */
export const FIRM_AGENT_ID = "firm:agent";

/** O10: an instruction the Firm Agent proposes for one matter. Only the advocate takes it there. */
export interface FirmHandoff {
  id: string;
  matterId: string;
  matterTitle: string;
  instruction: string;
  reason: string;
  createdAt: string;
}

/** The plan (native-harness-parts section 4). */
export const PLAN_STATUSES = ["planned", "ongoing", "done", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export interface PlanItem {
  n: number;
  text: string;
  status: PlanStatus;
  /** Item numbers that must be done before this item starts. */
  dependsOn: number[];
  /** At most 3; the item cannot be done while one is open. */
  subtasks: Array<{ text: string; done: boolean }>;
  /** Short labels, for example the helper doing it or the draft it changes. */
  tags: string[];
  /** O1: the skill this step runs, when it is a skill run. */
  skill?: string;
}
export interface Plan {
  title: string;
  items: PlanItem[];
  updatedAt: string;
  /** O1: long work waits for the advocate. "pending" until the advocate approves it; absent for a plan that needs none. */
  approval?: "pending" | "approved";
  approvedAt?: string;
}
/** O9: CUSTOM event whose value is a side thread (SideThread). */
export const SIDE_EVENT = "openadvo.side_thread";
/** CUSTOM event whose value is the conversation's plan (Plan or null). */
export const PLAN_EVENT = "openadvo.plan";

/** The context meter (native-harness-parts section 5): after each run. */
export interface ContextMeter {
  /** Estimated tokens in the context, or null right after compaction. */
  tokens: number | null;
  window: number;
  percent: number | null;
  /** The last run's cache reads and writes, in tokens. */
  cacheRead: number;
  cacheWrite: number;
}
/** Settings → Tool permissions (native-harness-parts section 2). */
export interface ToolPolicyView {
  policy: { default: "allow" | "ask" | "deny"; tools: Record<string, "allow" | "ask" | "deny"> };
  tools: Array<{ name: string; label: string }>;
  /** The party-name rule for web_search and web_fetch. */
  partyRule: boolean;
}

/** A helper as the window shows it (native-harness-parts section 3). */
export interface HelperView {
  id: string;
  /** From the task, not the type. */
  name: string;
  type: string;
  background: boolean;
  state: "running" | "done" | "failed" | "stopped" | "interrupted";
  /** True when its result waits for "Use results" or the advocate's next message. */
  waiting: boolean;
  /** The question it stopped to ask, until the parent answers it. */
  question?: string;
  startedAt: string;
  endedAt?: string;
}
/** CUSTOM event whose value is the conversation's helpers (HelperView[]). */
export const HELPERS_EVENT = "openadvo.helpers";

/** CUSTOM event whose value is the conversation's ContextMeter. */
export const CONTEXT_EVENT = "openadvo.context";

/** O10: CUSTOM event whose value is the Firm Agent's open handoffs (FirmHandoff[]). */
export const FIRM_HANDOFFS_EVENT = "openadvo.firm_handoffs";

/** H-12: the AG-UI interrupt reason of a question from a Pi extension. */
export const EXTENSION_QUESTION_REASON = "openadvo.extension_question";

/**
 * H-12: one question from a Pi extension (ctx.ui.select, confirm, input, editor), in the shape of an
 * AG-UI Interrupt. The advocate answers it with answerExtensionQuestion, or dismisses it (null),
 * which gives the extension its default answer.
 */
export interface ExtensionQuestion {
  id: string;
  reason: typeof EXTENSION_QUESTION_REASON;
  /** The extension's title for the question. */
  message: string;
  /** What the answer must be: a JSON Schema. */
  responseSchema: Record<string, unknown>;
  /** ISO 8601. After this time the question gets its default answer. */
  expiresAt?: string;
  metadata: {
    kind: "select" | "confirm" | "input" | "editor";
    /** confirm: the extension's message under the title. */
    detail?: string;
    /** select: the choices, in order. */
    options?: string[];
    placeholder?: string;
    /** editor: the starting text. */
    prefill?: string;
    /** Who asks: "Open Advocate" for its own approvals; absent for an extension. */
    asker?: string;
  };
}

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  model: string | null;
  /** Status lines that Pi extensions set (setStatus, setWidget with text), by key. */
  status?: Record<string, string[]>;
  /** H-12: the open questions of the Pi extensions, oldest first. */
  questions?: ExtensionQuestion[];
  /** O10: the Firm Agent's open handoffs. Only in the Firm Agent's state. */
  handoffs?: FirmHandoff[];
  /** The agent's plan for long work, or null. */
  plan?: Plan | null;
  /** The context meter after the last run. */
  context?: ContextMeter;
  /** The helpers of this conversation since it opened, newest last. */
  helpers?: HelperView[];
  /** The Pi session behind this conversation. */
  sessionId?: string;
  /** The last run's tokens, cache and cost. */
  lastRun?: RunSummary;
  /** The matter's totals from its trace. */
  cost?: CostSummary;
}

/** One Pi extension (decision 21). */
export interface PiExtensionInfo {
  id: string;
  kind: "bundled" | "added";
  version: string | null;
  source: string;
  enabled: boolean;
  tools: string[];
  commands: string[];
  error: string | null;
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
  // V1 (docs/archive/2026-11-15/specs/v1.md). Human-only where marked.
  /** Human-only (V1-10). */
  renameMatter(matterId: string, title: string): Promise<MatterSummary>;
  /** Human-only (V1-10). Nothing is deleted. */
  setMatterArchived(matterId: string, archived: boolean): Promise<void>;
  /** V1-1: end the conversation; a new Pi session file starts. */
  newConversation(matterId: string): Promise<ChatState>;
  getMemory(matterId: string): Promise<string>;
  /** Human-only (V1-3). */
  setMemory(matterId: string, text: string): Promise<string>;
  /** Decision 21: the Pi extensions, bundled and added. A change reopens idle conversations. */
  listExtensions(): Promise<PiExtensionInfo[]>;
  addExtension(source: string): Promise<PiExtensionInfo[]>;
  removeExtension(source: string): Promise<PiExtensionInfo[]>;
  setExtensionEnabled(id: string, enabled: boolean): Promise<PiExtensionInfo[]>;
  listWorkflows(): Promise<Workflow[]>;
  saveWorkflow(input: { id?: string; title: string; body: string }): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<Workflow[]>;
  getRecordTable(matterId: string): Promise<RecordTable>;
  /** Human-only (V1-5). */
  addRecordColumn(matterId: string, question: string): Promise<RecordColumn>;
  /** Phase 7 (K3): the advocate confirms a proposed element column, or rejects it. */
  decideRecordColumn(matterId: string, columnId: string, decision: "confirmed" | "rejected"): Promise<RecordColumn>;
  /** Human-only (V1-5). */
  decideRecordCell(matterId: string, sourceId: string, columnId: string, decision: "confirm" | "clear"): Promise<RecordTable>;
  // V2 (docs/archive/2026-11-15/specs/v2.md). Human-only where marked.
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
  // V3 (docs/archive/2026-11-15/specs/v3.md).
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
  /** Phase 7 (O5): the model per role (drafting, extraction, critic); null means the chat's model. */
  getRoleModels(): Promise<{ drafting: string | null; extraction: string | null; critic: string | null }>;
  setRoleModel(role: "drafting" | "extraction" | "critic", key: string | null): Promise<{ drafting: string | null; extraction: string | null; critic: string | null }>;
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
  /** C2, W4: create a matter from a folder, a CNR or an email. Human-only. */
  pickFolder(): Promise<string | null>;
  intakeFolder(): Promise<{ matter: MatterSummary; added: number; refused: number } | null>;
  intakeCnr(cnr: string, court: string): Promise<MatterSummary>;
  intakeEmail(): Promise<{ matter: MatterSummary; messages: number; attachments: number } | null>;
  /** C1: the universal matter fields. */
  getMatterProfile(matterId: string): Promise<MatterProfile>;
  setMatterProfile(matterId: string, input: Partial<Omit<MatterProfile, "updatedAt">>): Promise<MatterProfile>;
  /** C3: a classification proposal; applying it is the advocate's decision. */
  proposeClassification(matterId: string): Promise<ClassificationProposal>;
  applyClassification(matterId: string, proposal: ClassificationProposal): Promise<{ profile: MatterProfile; details: MatterDetails }>;
  /** C6: related matters, both the edges this matter records and the edges others record to it. */
  listRelatedMatters(matterId: string): Promise<RelatedMatter[]>;
  addRelatedMatter(matterId: string, toId: string, relation: MatterRelation, note: string): Promise<RelatedMatter[]>;
  removeRelatedMatter(matterId: string, toId: string, relation: string): Promise<RelatedMatter[]>;
  /** C10: a later stage or related proceeding, as a new linked matter. */
  extendMatter(matterId: string, input: { title: string; relation: MatterRelation; court?: string; proceeding?: string }): Promise<MatterSummary>;
  /** C2: a matter the agent proposed in the chat. Only the advocate creates it. */
  proposalsList(): Promise<MatterProposal[]>;
  proposalCreate(id: string): Promise<MatterSummary>;
  proposalDismiss(id: string): Promise<MatterProposal[]>;
  // Phase 4: documents, evidence and facts.
  evidenceFacts(matterId: string, filter?: { status?: string; type?: string; sourceId?: string; q?: string }): Promise<FactRecord[]>;
  evidenceAddFact(matterId: string, input: { text: string; type: string; sourceId?: string | null; anchorId?: string | null; page?: number | null; line?: number | null; eventId?: string | null; date?: string; amount?: string; parties?: string[]; relief?: string }): Promise<FactRecord>;
  /** Human-only. */
  evidenceDecideFact(matterId: string, id: string, status: "confirmed" | "disputed" | "rejected"): Promise<FactRecord>;
  /** Human-only. */
  evidenceSupersedeFact(matterId: string, id: string, input: { text: string; type?: string; date?: string; amount?: string; parties?: string[]; relief?: string }): Promise<FactRecord>;
  /** Human-only. */
  evidenceLinkFact(matterId: string, id: string, input: { issueIds?: string[]; argumentIds?: string[]; relief?: string }): Promise<FactRecord>;
  evidenceContradictions(matterId: string): Promise<Contradiction[]>;
  evidenceList(matterId: string, filter?: { sourceId?: string; q?: string }): Promise<EvidenceRecord[]>;
  evidenceAdd(matterId: string, input: { sourceId: string; exhibitNumber?: string; witness?: string; statement?: string; givenBy?: string; givenAt?: string; electronic?: boolean; device?: string; admissibility?: string; notes?: string }): Promise<EvidenceRecord>;
  /** Human-only. */
  evidenceUpdate(matterId: string, id: string, input: { exhibitNumber?: string; witness?: string; statement?: string; givenBy?: string; givenAt?: string; electronic?: boolean; device?: string; authenticity?: EvidenceRecord["authenticity"]; admissibility?: string; notes?: string; status?: EvidenceRecord["status"] }): Promise<EvidenceRecord>;
  evidenceParts(matterId: string, sourceId?: string): Promise<DocumentPart[]>;
  evidenceRelations(matterId: string): Promise<SourceRelation[]>;
  /** Human-only. */
  evidenceDecideRelation(matterId: string, reviewItemId: string, decision: "same" | "different"): Promise<SourceRelation[]>;
  evidenceEdges(matterId: string, filter?: { fromKind?: string; fromId?: string; toKind?: string; toId?: string }): Promise<MatterEdge[]>;
  matterMemory(matterId: string, filter?: { status?: string; type?: string; q?: string }): Promise<MemoryRecord[]>;
  matterMemoryPropose(matterId: string, input: { type: string; subject: string; relation: string; object: string; sourceId?: string | null; anchorId?: string | null; validFrom?: string | null; validUntil?: string | null; confidence?: number | null; supersedes?: string | null }): Promise<MemoryRecord>;
  /** Human-only. */
  matterMemoryDecide(matterId: string, id: string, status: string): Promise<MemoryRecord>;
  evidenceMarks(matterId: string, sourceId?: string): Promise<PageMark[]>;
  documentOperations(matterId: string): Promise<DocumentOperation[]>;
  documentOperation(matterId: string, input: { kind: "extract" | "split" | "merge" | "reorder" | "annotate" | "highlight" | "redact"; sourceId?: string; sourceIds?: string[]; pages?: number[]; ranges?: number[][]; order?: number[]; area?: { page: number; x: number; y: number; w: number; h: number } }): Promise<{ operation: DocumentOperation; sources: Array<{ id: string; name: string }> }>;
  jurisdictionGet(matterId: string): Promise<JurisdictionReport | null>;
  /** Human-only. */
  jurisdictionSet(matterId: string, report: JurisdictionReport): Promise<JurisdictionReport>;
  forumClauses(matterId: string): Promise<ForumClause[]>;
  timeline(matterId: string): Promise<TimelineEntry[]>;
  relatedSuggestions(): Promise<RelatedProposal[]>;
  recordTemplates(proceeding: string): Promise<RecordTemplate[]>;
  applyRecordTemplate(matterId: string, key: string): Promise<{ columns: number }>;
  closeView(url: string): Promise<void>;
  listJobs(matterId: string): Promise<IngestJob[]>;
  getSourcePages(matterId: string, sourceId: string): Promise<PageRecord[]>;
  listReviewItems(matterId: string): Promise<ReviewItem[]>;
  /** Human-only actions (decision 5). */
  resolveReviewItem(matterId: string, itemId: string): Promise<ReviewItem>;
  skipReviewItem(matterId: string, itemId: string): Promise<ReviewItem>;
  onIngestUpdate(listener: (matterId: string) => void): () => void;
  // V5 (docs/archive/2026-11-15/specs/v5.md).
  verifyRecordChain(matterId: string): Promise<ChainCheck>;
  listRefusals(matterId: string): Promise<Refusal[]>;
  inspectRecord(matterId: string, id: string): Promise<Inspection | null>;
  findInMatter(matterId: string, q: string): Promise<FindHit[]>;
  listMatterFiles(matterId: string): Promise<Array<{ path: string; size: number; isDir: boolean; files?: number }>>;
  openMatterFile(matterId: string, rel: string): Promise<boolean>;
  listJobsOverview(matterId: string): Promise<{ reading: Array<IngestJob & { name: string }>; runs: ArgumentRun[]; running: string | null; indexing: string | null }>;
  stopArgumentLoop(matterId: string): Promise<boolean>;
  listHearings(matterId: string): Promise<Hearing[]>;
  /** Phase 7 (K8): the compliance tasks proposed from a hearing's directions. */
  listTasks(matterId: string): Promise<TaskProposal[]>;
  addTask(matterId: string, hearingId: string, text: string, dueAt: string): Promise<TaskProposal>;
  decideTask(matterId: string, id: string, accept: boolean): Promise<{ task: TaskProposal; reminder: Reminder | null }>;
  /** Phase 7 (K9): the cross-examination plan. */
  listCrossQuestions(matterId: string): Promise<CrossQuestion[]>;
  proposeCrossQuestion(matterId: string, input: { witness?: string; question: string; targetKind: "contradiction" | "evidence"; targetId: string }): Promise<CrossQuestion>;
  decideCrossQuestion(matterId: string, id: string, decision: "accepted" | "rejected"): Promise<CrossQuestion>;
  /** Human-only (V5-19). */
  addHearing(matterId: string, h: { date: string; bench?: string; directions?: string; nextDate?: string; nextDateStatus?: "confirmed" | "inferred"; notes?: string }): Promise<Hearing>;
  listReminders(matterId: string): Promise<Reminder[]>;
  addReminder(matterId: string, text: string, dueAt: string): Promise<Reminder>;
  doneReminder(matterId: string, id: string): Promise<Reminder[]>;
  getPolicy(matterId: string): Promise<{ confidential: boolean; budgetTokens: number | null; usage: { runs: number; tokens: number; cost: number } }>;
  /** Human-only (V5-21). */
  setPolicy(matterId: string, p: { confidential: boolean; budgetTokens: number | null }): Promise<{ confidential: boolean; budgetTokens: number | null; usage: { runs: number; tokens: number; cost: number } }>;
  /** V5-22: stop the agent's run between steps. */
  stopChat(matterId: string): Promise<boolean>;
  /** H-12: answer a Pi extension's question: a choice, true or false, or text. null dismisses it. */
  answerExtensionQuestion(matterId: string, questionId: string, answer: string | boolean | null): Promise<void>;
  /** O10, human-only: the advocate took a Firm Agent handoff to its matter, or dismissed it. Returns the handoffs left. */
  closeFirmHandoff(id: string): Promise<FirmHandoff[]>;
  /** Settings → Tool permissions: the policy and the agent's tools. */
  getToolPolicy(): Promise<ToolPolicyView>;
  setToolPolicy(policy: ToolPolicyView["policy"], partyRule?: boolean): Promise<ToolPolicyView>;
  /** The advocate stops or steers one helper, or sends the waiting background results to the agent. */
  stopHelper(conversationId: string, helperId: string): Promise<void>;
  steerHelper(conversationId: string, helperId: string, text: string): Promise<void>;
  useHelperResults(conversationId: string): Promise<void>;
  /** Settings: how strongly the agent is asked to keep a plan. */
  getPlanStrength(): Promise<"long" | "most">;
  setPlanStrength(value: "long" | "most"): Promise<"long" | "most">;
  /** The matter's runs and helpers with tokens, cache and cost, as CSV text; the window saves it. */
  costCsv(matterId: string): Promise<string>;
  /** Human-only: clear the conversation's plan. */
  clearPlan(conversationId: string): Promise<void>;
  // ---- Phase 1: harness and stores ----
  /** N1, O2: the skill registry and the roles; fresh reads the skill files again. */
  listSkills(fresh?: boolean): Promise<{ skills: SkillSummary[]; roles: RoleSummary[]; folders: { builtIn: string; advocate: string }; practicePacks: PackSummary[] }>;
  /** N2: the skill runs of a matter, newest first, with their report cards. */
  listSkillRuns(matterId: string): Promise<SkillRunRecord[]>;
  /** I1: one recorded context package: what was included, what was left out, and why. */
  getContextPackage(matterId: string, packageId: string): Promise<ContextPackageRecord | null>;
  /** O7: the Jobs view of a matter: chat runs, helpers and skill runs. */
  listRunJobs(matterId: string): Promise<JobRow[]>;
  /** O3: resume an interrupted skill run. */
  resumeSkillRun(matterId: string, runId: string): Promise<void>;
  /** O1, human-only: approve the plan that waits; the agent then carries it out. */
  approvePlan(matterId: string): Promise<void>;
  /** O9: ask a side question in a thread, or open a new thread (threadId null). */
  askSide(matterId: string, threadId: string | null, question: string, view: string): Promise<SideThread>;
  /** O9: discard a side thread. */
  discardSide(matterId: string, threadId: string): Promise<void>;
  /** O9: the side threads of the matter's conversation. */
  listSide(matterId: string): Promise<SideThread[]>;
  /** N3: the records "@" can add to the context, from this matter only. */
  contextCandidates(matterId: string, query: string): Promise<ContextCandidate[]>;
  /** R1: the Review Inbox across matters and the advocate profile, blocking items first. */
  inboxAll(): Promise<Array<InboxItem & { matterId: string | null; matterTitle: string }>>;
  /** G5: the advocate's search over every open matter and the judgment index. */
  searchAll(query: string): Promise<Array<{ matterId: string | null; matterTitle: string; kind: string; ref: string; label: string; snippet: string }>>;
  /** Q4: the advocate profile in advocate.db. */
  getAdvocateProfile(): Promise<AdvocateProfile>;
  /** Q4, human-only: set one profile field; an empty value removes it. */
  setAdvocateProfile(key: string, value: string): Promise<AdvocateProfile>;
  /** A2: the enrolment number is encrypted with the operating system's secret store. */
  setAdvocateEnrolment(number: string, year: string): Promise<{ stored: boolean; last4: string | null }>;
  advocateEnrolmentState(): Promise<{ stored: boolean; last4: string | null }>;
  clearAdvocateEnrolment(): Promise<{ stored: boolean; last4: string | null }>;
  /** Q4: advocate memory records. */
  listAdvocateMemory(): Promise<MemoryRecord[]>;
  /** Q4, human-only: decide one advocate memory record. */
  decideAdvocateMemory(id: string, status: "confirmed" | "rejected" | "tentative" | "archived" | "deprecated"): Promise<MemoryRecord>;
  /** Q4: the advocate's preferences. */
  listPreferences(): Promise<PreferenceRecord[]>;
  /** Q4, human-only: approve or reject a proposed preference. */
  decidePreference(id: string, decision: "approved" | "rejected"): Promise<PreferenceRecord>;
  /** M1: the Knowledge Library. */
  libraryList(filter?: { q?: string; kind?: string; status?: string }): Promise<LibraryItem[]>;
  libraryImportFiles(): Promise<LibraryImportResult>;
  libraryImportFolder(): Promise<LibraryImportResult>;
  libraryUpdate(id: string, input: { title?: string; kind?: string; status?: string; author?: string; itemDate?: string; matterId?: string | null; court?: string; scope?: string; notes?: string; tags?: string[] }): Promise<LibraryItem>;
  librarySetStatus(id: string, status: LibraryStatus): Promise<LibraryItem>;
  /** Open the stored file in its own application. Returns the error, or "". */
  libraryOpen(id: string): Promise<string>;
  libraryReveal(id: string): Promise<void>;
  /** Q4: the sources of intel.db with their freshness. */
  listIntelSources(): Promise<Array<IntelSource & { freshness: Freshness }>>;
  /** Q4: the hash chains of advocate.db and intel.db. */
  storeChains(): Promise<StoreChains>;
  // ---- Phase 2: local legal intelligence and filing readiness ----
  /** B1: search the court directory (offline). */
  searchCourts(query: string): Promise<{ version: string; note: string; courts: DirectoryCourt[] }>;
  /** B1: the appeal route from a court. */
  appealRoute(courtId: string): Promise<Array<{ id: string; name: string; appealNote: string | null }>>;
  /** The advocate's courts and practice areas, which decide what is needed. */
  getCourtProfile(): Promise<{ courts: string[]; practice: string[] }>;
  /** Human-only: set the advocate's courts and practice areas. */
  setCourtProfile(input: { courts?: string[]; practice?: string[] }): Promise<{ courts: string[]; practice: string[] }>;
  /** Court Intelligence: the advocate's courts, adapters and lists. Nothing is downloaded. */
  courtOverview(): Promise<Array<{ court: DirectoryCourt; route: Array<{ id: string; name: string }>; adapter: AdapterSummary | null; lists: Array<{ key: string; kind: string; title: string; source: string; recommended: boolean; caseTypes: string[]; built: PackList | null }>; proceedings: AdapterProceeding[]; benches: BenchRow[] }>>;
  /** Every adapter in its tier, with its version, error or shadowing. */
  listAdapters(fresh?: boolean): Promise<AdapterSummary[]>;
  /** Human-only: copy an adapter into the advocate's folder to change it. */
  forkAdapter(id: string): Promise<AdapterSummary>;
  /** Human-only: add an adapter from an adapter.json file. */
  addAdapter(file: string): Promise<AdapterSummary>;
  /** Build (or rebuild) one list now: downloads only its document. */
  buildList(adapterId: string, key: string): Promise<PackList>;
  /** A built list, or null. */
  getList(adapterId: string, key: string): Promise<PackList | null>;
  /** B10, human-only: correct an item (n) or add one (n null), with its source. */
  editList(listId: string, change: { n: number | null; text: string; source: string; ref?: string }): Promise<PackList>;
  /** B2, human-only: upload a source document by hand. */
  uploadSource(adapterId: string, sourceKey: string, file: string): Promise<{ sourceKey: string; pages: number }>;
  /** B7, human-only: add a bench row with its source. */
  addBench(input: { court: string; date: string; bench: string; judges: string; source: string }): Promise<BenchRow>;
  /** B11, human-only: the matter's court and case type; the lists it needs are built now. */
  setFilingTarget(matterId: string, court: string, caseType: string): Promise<MatterChecklist>;
  /** B11: the matter's checklist with its states. */
  getChecklist(matterId: string): Promise<MatterChecklist>;
  /** B11, human-only: tick an item, untick it, or mark it not applicable (with the reason). */
  checkItem(matterId: string, listId: string, itemId: string, state: "open" | "done" | "not_applicable", note: string): Promise<void>;
  /** B13: the court's format checks on the newest filing set. */
  formatChecks(matterId: string): Promise<{ results: FormatCheckResult[]; reason: string | null }>;
  /** B14: the matter's registry defects. */
  listDefects(matterId: string): Promise<DefectRow[]>;
  /** B14, human-only: paste the registry's defect list. */
  importDefects(matterId: string, text: string): Promise<DefectRow[]>;
  /** B14, human-only: mark a defect cured, or open again. */
  setDefect(matterId: string, id: string, cured: boolean): Promise<DefectRow[]>;
  /** Compact the conversation now (Pi's compaction with the kind's summary form). */
  compactChat(conversationId: string): Promise<ContextMeter>;
  listContacts(): Promise<Contact[]>;
  addContact(c: { name: string; kind: string; email?: string; phone?: string; notes?: string }): Promise<Contact>;
  removeContact(id: string): Promise<Contact[]>;
  listParties(matterId: string): Promise<Array<{ id: string; contactId: string; role: string; nameInRecord: string; counsel: string; contact: Contact | null }>>;
  addParty(matterId: string, contactId: string, role: string, nameInRecord: string, counsel?: string): Promise<unknown>;
  getDocket(): Promise<Array<{ matterId: string; title: string; stage: string; next: string; nextHearing: { date: string; status: string } | null; limitation: string | null; openItems: number; reminders: Array<{ id: string; text: string; dueAt: string; status: string }> }>>;
  generateQuestions(matterId: string): Promise<{ file: string; questions: number }>;
  previewDiagnostics(): Promise<Array<{ name: string; description: string; bytes: number }>>;
  writeDiagnostics(): Promise<{ path: string; bytes: number } | null>;
  onReminderDue(listener: (r: { matterId: string; title: string; text: string }) => void): () => void;
  listRevisions(matterId: string, draftId: string): Promise<RevisionRecord[]>;
  compareRevisions(matterId: string, a: string, b: string): Promise<Array<{ op: "same" | "added" | "removed"; text: string } | { op: "changed"; before: string; after: string }>>;
  openInWord(matterId: string, revisionId: string): Promise<{ file: string; revisionId: string }>;
  /** Human-only (V5-13): the edited copy becomes a new revision. Null when the advocate cancels. */
  importFromWord(matterId: string, revisionId: string): Promise<RevisionRecord | null>;
  filingResult(matterId: string): Promise<{ state: "none" | "unknown" | "submitted" | "not_submitted"; at: string | null; diary: string | null }>;
  /** Human-only (V5-18). */
  reconcileFiling(matterId: string, outcome: "submitted" | "not_submitted", diary: string): Promise<{ state: string }>;
  /** V5-9: not verification. */
  quickCheckCitations(matterId: string): Promise<QuickCheck[]>;
  /** Human-only (V5-12). */
  benchTrends(): Promise<Array<{ year: number; total: number; allowed: number; dismissed: number; disposed: number; other: number }>>;
  /** The phase 6 document catalogue, for the picker. */
  draftCatalogue(): Promise<CatalogueEntry[]>;
  /** Phase 6 (L6): a revision against its rendered PDF, both ways. */
  compareRevisionWithPdf(matterId: string, revisionId: string): Promise<{ ok: boolean; missing: string[]; extra: string[] }>;
  /** Human-only (A7): the advocate answers a preference question inside a task. The answer is approved at once. */
  setPreference(key: string, value: string, task: string): Promise<PreferenceRecord>;
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
  // V4 (docs/archive/2026-11-15/specs/v4.md). Human-only where marked.
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
  /** Phase 7 (K4, K5): the case theories and the dissent panel. */
  addTheory(matterId: string, input: { title: string; statement: string; issueIds?: string[]; burden?: string; standard?: string }): Promise<TheoryRecord>;
  decideTheory(matterId: string, id: string, decision: "primary" | "alternative" | "rejected", reason: string): Promise<TheoryRecord>;
  askDissent(matterId: string, question: string): Promise<{ answers: Array<{ role: string; model: string; answer: string; refused: string }>; split: boolean; splitPair: Array<{ role: string; model: string }> | null }>;
  /** Phase 5: one search over the law library, judgment paragraphs and the bound matter. */
  knowledgeSearch(matterId: string, query: string, opts?: { mode?: SearchMode; scopes?: KnowledgeScope[]; date?: string | null; court?: string | null; limit?: number }): Promise<RetrievalResult>;
  /** Phase 5: law counts, the set manifest and one health row per scope. */
  knowledgeHealth(matterId: string): Promise<KnowledgeHealthView>;
  /** Human-only: load the owner's ten-instrument first wave from India Code. */
  knowledgeLoadFirstWave(): Promise<{ acts: number; provisions: number; setHash: string; counts: LawCounts }>;
  /** Index a judgment's paragraphs and treatment edges after its PDF has been read. */
  knowledgeIndexJudgment(matterId: string, ref: string): Promise<{ indexed: boolean; paragraphs: number; edges: number; reason?: string }>;
  /** Human-only: keep a case-specific copy of a library provision in this matter's Studio. */
  knowledgeSaveProvision(matterId: string, provisionId: string): Promise<ProvisionRecord>;
  /** The matter's research plans, proposed by the agent and approved by the advocate. */
  knowledgePlans(matterId: string): Promise<ResearchPlan[]>;
  /** Human-only: approve or stop a research plan. */
  decideResearchPlan(matterId: string, id: string, decision: "approved" | "stopped"): Promise<ResearchPlan>;
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
  generateDraft(matterId: string, kind: DraftKind): Promise<GeneratedDraft>;
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
  // Phase 3 (S10): the built-in browser in the right pane.
  browserState(): Promise<BrowserState>;
  browserOpen(url?: string): Promise<string>;
  browserClose(tabId: string): Promise<BrowserState>;
  browserActivate(tabId: string): Promise<BrowserState>;
  browserNavigate(tabId: string, url: string): Promise<string>;
  browserBack(tabId: string): Promise<void>;
  browserForward(tabId: string): Promise<void>;
  browserReload(tabId: string): Promise<void>;
  browserStop(tabId: string): Promise<void>;
  browserSetBounds(bounds: BrowserBounds): Promise<void>;
  browserSetVisible(visible: boolean): Promise<void>;
  /** The matter a browser download becomes a source of, or null. */
  browserSetMatter(matterId: string | null): Promise<void>;
  browserBookmarks(): Promise<BrowserBookmark[]>;
  /** Human-only: the star. Returns the new bookmark, or null when it removed one. */
  browserToggleBookmark(tabId: string): Promise<BrowserBookmark | null>;
  browserRemoveBookmark(id: string): Promise<BrowserBookmark[]>;
  browserOpenBookmark(id: string): Promise<string>;
  browserHistory(): Promise<BrowserVisit[]>;
  browserClearHistory(): Promise<BrowserVisit[]>;
  /** A9: read the open portal's case list and propose one matter per case. */
  browserProposeCaseList(): Promise<CaseListResult>;
  /** A9, human-only: create the ticked proposals as matters. */
  browserCreateMatters(cases: CaseListProposal[]): Promise<{ created: number; matterIds: string[]; refused: string[] }>;
  onBrowserState(listener: (state: BrowserState) => void): () => void;
  onBrowserShortcut(listener: (shortcut: BrowserShortcut["type"]) => void): () => void;
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
    decisions: Array<{ anchor: string; decision: "keep" | "undo"; reason?: string }>,
  ): Promise<RevisionRecord>;
  // ---- Phase 10: memory and knowledge ----
  /** F5: the deterministic answer to one memory question, with its record links. */
  answerMemory(matterId: string, question: string): Promise<MemoryAnswer>;
  /** M3: the matter's outcome records, newest first. */
  listOutcomes(matterId: string): Promise<OutcomeRecord[]>;
  /** M3, human-only: enter what the court did. A correction supersedes. */
  recordOutcome(matterId: string, input: OutcomeInput): Promise<OutcomeRecord>;
  /** M2: the library grouped by its four roles, the precedents and the rest. */
  libraryRoles(): Promise<LibraryRoleGroup[]>;
  /** M2: the approved precedents for the matter, best first, with the reason of each. */
  listPrecedents(matterId: string, limit?: number): Promise<PrecedentOffer[]>;
  /** G3: the advocate memory graph's edges and counts. */
  advocateGraph(): Promise<AdvocateGraphView>;
  /** G3, human-only: rebuild the derived advocate graph from the stores. */
  rebuildAdvocateGraph(): Promise<AdvocateGraphView>;
  /** G3: one node's neighbours, one to three steps out. */
  walkAdvocateGraph(kind: GraphNodeKind, id: string, depth: number): Promise<AdvocateGraphView["edges"]>;
}
