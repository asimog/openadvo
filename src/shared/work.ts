/** Records of steps 6 to 10, shared by the main process, the bridge and the renderer. */

export interface MatterDetails {
  petitioner: string;
  respondent: string;
  caseNumber: string;
  cnr: string;
  court: string;
  /** The Notebook event of the impugned judgment. Limitation starts from its date. */
  impugnedEventId: string | null;
  updatedAt: string | null;
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
}

export interface FilingSetRecord {
  id: string;
  manifest: { matter: string; createdAt: string; files: FilingFile[]; rules: string; limitation: string | null };
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
