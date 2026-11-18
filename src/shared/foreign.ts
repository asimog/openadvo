/**
 * Phase 11 (D4): foreign elements as route facts. An element is a record of the matter; a route
 * is a question the law may open, with its provisions and its source. A route never decides.
 */

export const FOREIGN_KINDS = ["foreign_party", "foreign_judgment", "foreign_award", "foreign_seat", "foreign_asset"] as const;
export type ForeignKind = (typeof FOREIGN_KINDS)[number];

export const FOREIGN_STATUSES = ["proposed", "confirmed", "rejected"] as const;
export type ForeignStatus = (typeof FOREIGN_STATUSES)[number];

export interface ForeignElement {
  id: string;
  kind: ForeignKind;
  /** The party, the judgment, the award, the seat or the asset, in the advocate's or the record's words. */
  subject: string;
  /** Where it was read: the party name, the clause or the source. */
  detail: string;
  country: string;
  sourceId: string | null;
  anchorId: string | null;
  status: ForeignStatus;
  proposedBy: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface ForeignElementInput {
  kind: ForeignKind;
  subject: string;
  detail?: string;
  country?: string;
  sourceId?: string | null;
  anchorId?: string | null;
}

export interface ForeignRoute {
  /** The route, in one line. */
  route: string;
  /** The provisions it reads. */
  basis: string;
  /** The Act and the sections. */
  source: string;
  /** A route whose element is not confirmed says so. */
  status: "proposed" | "confirmed";
  note: string;
}
