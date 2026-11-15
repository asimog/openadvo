/** Q4: the records of advocate.db and intel.db, shared by main, preload and renderer. */

/** Memory types of architecture.md section 6. */
export const MEMORY_TYPES = [
  "fact_from_document",
  "fact_from_party",
  "admission",
  "disputed_fact",
  "missing_fact",
  "client_instruction",
  "advocate_decision",
  "accepted_argument",
  "rejected_argument",
  "procedural_event",
  "preference",
  "approved_precedent",
  "lesson",
  "court_practice",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Types that may live in advocate scope: law and the advocate's own ways, never a matter's facts (architecture section 6). */
export const ADVOCATE_SCOPE_TYPES: readonly MemoryType[] = ["preference", "approved_precedent", "lesson", "court_practice"];

export const MEMORY_STATUSES = ["proposed", "tentative", "confirmed", "rejected", "superseded", "expired", "deprecated", "archived"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryRecord {
  memoryId: string;
  type: MemoryType;
  subject: string;
  relation: string;
  object: string;
  sourceId: string | null;
  matterId: string | null;
  recordedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  confidence: number | null;
  status: MemoryStatus;
  scope: "advocate" | "matter";
  supersedes: string | null;
  proposedBy: string;
}

export interface PreferenceRecord {
  id: string;
  key: string;
  value: string;
  /** Why it applies: shown as "applied because …". */
  reason: string;
  status: "proposed" | "approved" | "rejected" | "superseded";
  proposedBy: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdvocateProfile {
  name: string | null;
  role: string | null;
  /** Every key the profile holds, for the profile page. */
  fields: Record<string, string>;
}

export const ACCESS_METHODS = ["official_feed", "advocate_session", "manual_upload"] as const;
export type AccessMethod = (typeof ACCESS_METHODS)[number];

export interface IntelSource {
  id: string;
  /** A stable key: the same source across versions. */
  key: string;
  version: number;
  name: string;
  sourceUrl: string;
  owner: string;
  retrievedAt: string;
  checkedBy: string;
  validFrom: string | null;
  validUntil: string | null;
  accessMethod: AccessMethod;
  reliability: string;
  checkDays: number;
  supersededBy: string | null;
}

/** Decision 16: a row past its check interval is stale; a check on it is "unconfirmed", never "passed". */
export interface Freshness {
  state: "fresh" | "stale";
  /** The date the row went stale, or goes stale. */
  since: string;
}

export interface StoreChains {
  advocate: { ok: boolean; events: number; firstBreak: { seq: number; problem: string } | null };
  intel: { ok: boolean; events: number; firstBreak: { seq: number; problem: string } | null };
}
