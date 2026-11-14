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
  updatedAt: string | null;
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
  method: "portal_browser" | "email" | "filing_receipt";
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

export interface FilingState {
  details: MatterDetails;
  annexures: AnnexureRecord[];
  limitation: LimitationRecord | null;
  compliance: { version: string; results: ComplianceResult[] };
  /** What still blocks the filing approval. Empty when the filing set can be made. */
  blockers: string[];
  filingSet: FilingSetRecord | null;
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
