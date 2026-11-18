/** Records of steps 6 to 10, shared by the main process, the bridge and the renderer. */

export interface MatterDetails {
  petitioner: string;
  respondent: string;
  caseNumber: string;
  cnr: string;
  court: string;
  /** The Notebook event of the impugned judgment. Limitation starts from its date. */
  impugnedEventId: string | null;
  /** V2-6: the interim relief sought, as the advocate words it. Empty when none. */
  interimRelief: string;
  /** V5-15: the victim's identity is protected in this matter; the names that must not appear in a draft. */
  victimProtected: boolean;
  victimNames: string[];
  /** V5-16: when the certified copy of the impugned judgment was applied for and received (YYYY-MM-DD). */
  copyApplied: string;
  copyReceived: string;
  updatedAt: string | null;
}

/** C1: the universal matter fields. The advocate records them; the agent only proposes. */
export interface MatterProfile {
  court: string;
  bench: string;
  /** C3: the practice area and the case type the advocate confirms. */
  practiceArea: string;
  caseType: string;
  /** The proceeding type: a bail application, a suit, a writ, an appeal, an execution or an arbitration petition. */
  proceeding: string;
  /** Petitioner, respondent, applicant, accused, appellant or a neutral word. */
  side: string;
  caseNumber: string;
  cnr: string;
  /** YYYY-MM-DD, or "". */
  filingDate: string;
  institutionDate: string;
  governingDate: string;
  stage: string;
  relief: string;
  updatedAt: string | null;
}

export const MATTER_RELATIONS = [
  "appeal_from",
  "revision_of",
  "review_of",
  "cross_petition",
  "counterclaim",
  "transfer_petition",
  "connected",
  "fir_behind",
  "arbitration",
  "common_parties",
  "common_evidence",
] as const;
export type MatterRelation = (typeof MATTER_RELATIONS)[number];

export interface RelatedMatter {
  toId: string;
  relation: MatterRelation;
  note: string;
  createdAt: string;
  /** The other matter's title, set by the main process for the view. */
  title?: string;
  /** True when the other matter records the edge to this one. */
  incoming?: boolean;
  /** The matter that holds the edge, for an incoming row. */
  fromId?: string;
}

/** C2: a matter the agent proposes in the chat; only the advocate creates it. */
export interface MatterProposal {
  id: string;
  title: string;
  cnr: string;
  court: string;
  petitioner: string;
  respondent: string;
  stage: string;
  nextDate: string;
  reason: string;
  sourceMatterId: string;
  sourceMatterTitle: string;
  status: "open" | "created" | "dismissed";
  createdAt: string;
}

/** V2-3: two sources with nearly the same text. Nothing is merged. */
export interface DuplicatePair {
  sourceA: string;
  sourceB: string;
  overlap: number;
  reviewItemId: string;
  decision: "same" | "different" | null;
  decidedAt: string | null;
}

/** V2-8: a note the agent proposes for the matter memory. */
export interface MemoryProposal {
  id: string;
  text: string;
  reason: string;
  status: "open" | "accepted" | "rejected";
  createdAt: string;
  decidedAt: string | null;
}

export interface IssueRecord {
  id: string;
  text: string;
  author: "advocate" | "agent";
  status: "candidate" | "accepted" | "rejected";
  reason: string | null;
  /** Phase 7 (K1): the facts the issue rests on. */
  factIds: string[];
  createdAt: string;
  decidedAt: string | null;
}

export interface AuthorityRecord {
  id: string;
  citation: string;
  parties: string;
  decisionDate: string;
  paragraph: string;
  proposition: string;
  role: "supporting" | "adverse" | "distinguishable" | "other";
  issueId: string | null;
  /** V4-2: where research found it ("sc:<path>", "hc:<file>"); null when added by hand. */
  sourceRef?: string | null;
  author: "advocate" | "agent";
  status: "candidate" | "adopted" | "rejected";
  createdAt: string;
}

export interface MemorandumRecord {
  id: string;
  title: string;
  issueId: string | null;
  body: string;
  author: "advocate" | "agent";
  /** References that resolved to a record of the matter. */
  refs: string[];
  /** References that did not resolve. The memorandum shows them as such. */
  unresolved: string[];
  createdAt: string;
}

export type ValidatorOutcome = "verified" | "failed" | "unresolved" | "not_applicable";

export interface CitationCheck {
  id: string;
  citation: string;
  draftId: string | null;
  revisionId: string | null;
  parties: string | null;
  decisionDate: string | null;
  outcome: ValidatorOutcome;
  reason: string | null;
  /** The validator's own verification record, as JSON. */
  record: string;
  checkedAt: string;
  /** The advocate attested this citation. An attestation is never shown as verified. */
  attested: boolean;
}

export interface Attestation {
  id: string;
  citation: string;
  reason: string;
  at: string;
}

export interface AdverseReview {
  id: string;
  outcome: "found_addressed" | "none_found" | "incomplete";
  coverage: string;
  note: string;
  at: string;
}

export interface AnnexureRecord {
  sourceId: string;
  label: string;
  title: string;
  sourceName: string;
  sha256: string;
}

export interface LimitationRecord {
  id: string;
  rule: string;
  startEventId: string;
  startDate: string;
  days: number;
  deadline: string;
  working: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface FilingConfirmation {
  step: 1 | 2;
  payloadSha256: string;
  at: string;
}

export interface FilingFile {
  /** V5-17: the PDF's text compared with the approved DOCX paragraphs. */
  conversion?: { ok: boolean; missing: string[] };
  name: string;
  role: string;
  sha256: string;
  size: number;
  pdfa: boolean;
  /** V1-8: the approved revision the file was rendered from (petition documents only). */
  revisionId?: string;
  revisionSeq?: number;
  revisionSha256?: string;
}

/** V1-8: one approval in the manifest's trail. */
export interface ManifestApproval {
  what: string;
  by: "advocate";
  at: string;
}

export interface ManifestCheck {
  ok: boolean;
  digest: "match" | "mismatch" | "absent";
  signature: "valid" | "invalid" | "not_signed";
  files: Array<{ name: string; outcome: "match" | "mismatch" | "missing" }>;
}

export interface FilingSetRecord {
  id: string;
  manifest: { matter: string; createdAt: string; files: FilingFile[]; rules: string; limitation: string | null; approvals?: ManifestApproval[]; digest?: string; publicKey?: string; signature?: string };
  payloadSha256: string;
  folder: string;
  createdAt: string;
  confirmations: FilingConfirmation[];
}

export interface CaptureRecord {
  id: string;
  sourceId: string;
  method: "portal_browser" | "browser" | "email" | "filing_receipt";
  url: string;
  detail: Record<string, unknown>;
  capturedAt: string;
}

/** One compliance rule's result (workflow 9E). */
export interface ComplianceResult {
  rule: string;
  title: string;
  source: string;
  outcome: "pass" | "defect" | "not_checked";
  detail: string;
}

/** The pack the filing reads, as the Filing tab shows it. */
export interface FilingPackInfo {
  id: string;
  title: string;
  proceeding: string;
  source: "court-target" | "proceeding" | "practice" | "court" | "default";
  limitation: { id: string; title: string; days: number; source: string } | null;
  workflow: Array<{ text: string; skill?: string }>;
}

export interface FilingState {
  details: MatterDetails;
  annexures: AnnexureRecord[];
  limitation: LimitationRecord | null;
  compliance: { version: string; results: ComplianceResult[] };
  /** What still blocks the filing approval. Empty when the filing set can be made. */
  blockers: string[];
  filingSet: FilingSetRecord | null;
  /** Phase 6: the required documents of the pack. */
  required: Array<{ kind: string; title: string }>;
  /** Phase 6: the pack parts the application cannot map to a document, as the pack names them. */
  unmapped: string[];
  /** Phase 8: the court target's pack or the practice pack, with its limitation and workflow. */
  pack: FilingPackInfo | null;
}

export interface ResearchState {
  issues: IssueRecord[];
  authorities: AuthorityRecord[];
  memoranda: MemorandumRecord[];
  citations: CitationCheck[];
  attestations: Attestation[];
  adverseReview: AdverseReview | null;
  /** The citation validator: where it is and whether it can run. */
  validator: { available: boolean; detail: string };
  /** Phase 6 (P3): the coverage of the checks — checked N of M, with the honest note. */
  coverage: { checked: number; of: number; note: string } | null;
  /** Phase 6 (P3): the shared verification record's rows for this matter's citations. */
  sharedChecks: Array<{ citation: string; rows: Array<{ citation: string; outcome: string; against: string; at: string; by: string }> }>;
}

/** V1-4: a named, reusable instruction to the agent. */
export interface Workflow {
  id: string;
  title: string;
  body: string;
  builtIn: boolean;
}

/** V1-5: one question of the record table. */
export interface RecordColumn {
  id: string;
  question: string;
  /** Phase 7 (K3): the advocate's column is confirmed at once; the agent's (a proposed element) is a candidate. */
  author: "advocate" | "agent";
  status: "candidate" | "confirmed" | "rejected";
  /** The issue a proposed element belongs to. */
  issueId: string | null;
  createdAt: string;
}

/** V1-5: the answer for one source and one column, with the quoted line. */
export interface RecordCell {
  sourceId: string;
  columnId: string;
  answer: string;
  quote: string;
  page: number;
  line: number;
  anchorId: string;
  author: "agent" | "advocate";
  status: "candidate" | "confirmed";
  updatedAt: string;
}

export interface RecordTable {
  columns: RecordColumn[];
  cells: RecordCell[];
}

/** V3-1: one stage of the matter's progress (lib/progress owns the computation). */
export interface ProgressStage {
  id: string;
  title: string;
  state: "not_started" | "in_progress" | "done" | "blocked";
  status: string;
  next: string;
  tab: string;
}

/** V3-2: one thing that waits for the advocate. */
export interface InboxItem {
  id: string;
  kind: string;
  /** True when it refuses a draft, an approval or the filing set until decided. */
  blocks: boolean;
  title: string;
  detail: string;
  /** The tab where the advocate decides it. */
  tab: string;
  reviewItemId?: string;
  sourceId?: string;
  /** S9: the trigger fire this item stands for. */
  triggerId?: string;
}
