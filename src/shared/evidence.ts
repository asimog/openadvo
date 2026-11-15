/** Phase 4: facts, evidence, document structure, relations, the evidence graph and jurisdiction. */

export const FACT_TYPES = ["fact", "admission", "denial", "disputed", "missing", "inference", "instruction", "decision"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_STATUSES = ["candidate", "confirmed", "disputed", "rejected", "superseded"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export interface FactRecord {
  id: string;
  text: string;
  type: FactType;
  status: FactStatus;
  sourceId: string | null;
  sourceName: string | null;
  anchorId: string | null;
  page: number | null;
  line: number | null;
  eventId: string | null;
  /** YYYY-MM-DD, or "". */
  date: string;
  amount: string;
  parties: string[];
  issueIds: string[];
  argumentIds: string[];
  relief: string;
  supersedes: string | null;
  author: "advocate" | "agent" | "system";
  createdAt: string;
  decidedAt: string | null;
}

export const EVIDENCE_STATUSES = ["candidate", "authentic", "disputed", "rejected"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export interface EvidenceRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  exhibitNumber: string;
  witness: string;
  statement: string;
  givenBy: string;
  givenAt: string;
  /** The source's SHA-256, so the chain names the bytes. */
  hash: string;
  electronic: boolean;
  device: string;
  authenticity: EvidenceStatus;
  admissibility: string;
  notes: string;
  status: "candidate" | "confirmed" | "rejected";
  createdAt: string;
}

export const DOCUMENT_PARTS = ["title", "parties", "facts", "grounds", "prayer", "allegation", "admission", "denial", "witness", "exhibit", "direction", "annexure", "header", "footer", "footnote", "table", "paragraph", "other"] as const;
export type DocumentPartKind = (typeof DOCUMENT_PARTS)[number];

export interface DocumentPart {
  id: string;
  sourceId: string;
  sourceName: string;
  kind: DocumentPartKind;
  text: string;
  anchorId: string;
  page: number;
  line: number;
  ref: string;
  createdAt: string;
}

export const RELATION_KINDS = ["annexure_of", "reply_to", "certified_copy_of", "version_of", "related"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export interface SourceRelation {
  sourceA: string;
  sourceB: string;
  nameA: string;
  nameB: string;
  relation: RelationKind;
  reason: string;
  confidence: number;
  reviewItemId: string | null;
  decision: "same" | "different" | null;
  decidedAt: string | null;
}

export const EDGE_RELATIONS = ["supports", "contradicts", "admits", "denies", "depends_on", "relies_on", "attacks", "derived_from", "proves_element", "part_of", "about"] as const;
export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

export interface MatterEdge {
  fromKind: string;
  fromId: string;
  relation: EdgeRelation;
  toKind: string;
  toId: string;
  evidenceRef: string;
  builtFrom: string;
  builtAt: string;
}

export const MARK_KINDS = ["signature", "stamp", "seal", "handwriting"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface PageMark {
  id: string;
  sourceId: string;
  page: number;
  kind: MarkKind;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  note: string;
  createdAt: string;
}

export const OPERATION_KINDS = ["annotate", "highlight", "split", "merge", "reorder", "extract", "redact", "convert", "export"] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export interface DocumentOperation {
  id: string;
  kind: OperationKind;
  inputs: Array<{ sourceId: string; pages?: number[] }>;
  outputSourceId: string | null;
  log: Record<string, unknown>;
  createdAt: string;
}

export interface JurisdictionReport {
  forum: string;
  courtType: string;
  territorialBasis: string;
  subjectBasis: string;
  provisions: string[];
  alternativeForums: string[];
  limitation: string;
  appealRoute: string;
  applicableRules: string[];
  unresolvedFacts: string[];
  /** True when a field could not be settled; the report then says why. */
  undetermined: boolean;
  basis: string[];
  updatedAt: string | null;
}

export interface ForumClause {
  id: string;
  sourceId: string;
  sourceName: string;
  text: string;
  kind: "exclusive" | "non_exclusive" | "seat" | "venue" | "courts";
  anchorId: string;
  page: number;
  line: number;
}

export interface Contradiction {
  key: string;
  kind: "date" | "amount" | "name" | "event";
  values: Array<{ value: string; factId: string; text: string; sourceId: string | null; page: number | null; line: number | null }>;
  reviewItemId?: string;
}

export interface TimelineEntry {
  id: string;
  date: string;
  dateEnd: string;
  dateText: string;
  text: string;
  kind: "procedural" | "factual" | "payment" | "communication" | "limitation" | "order";
  sourceId: string | null;
  sourceName: string | null;
  page: number | null;
  line: number | null;
  status: string;
}

export interface RecordTemplate {
  key: string;
  title: string;
  proceeding: string;
  columns: string[];
}

/** C7: a possible link between two matters. The advocate makes the link. */
export interface RelatedProposal {
  a: string;
  b: string;
  reason: string;
  basis: "cnr" | "fir" | "parties" | "impugned_order";
}
