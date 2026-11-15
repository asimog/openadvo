/** Phase 2: court adapters, built lists, matter checklists, format checks and defects (docs/specs/court-adapters.md). */

export const LIST_KINDS = ["checklist", "list", "workflow", "rules"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const FORMAT_CHECKS = ["pdf_max_mb", "pdf_searchable", "pdf_a", "pdf_bookmarks", "pdf_page_size"] as const;
export type FormatCheckKind = (typeof FORMAT_CHECKS)[number];

export interface AdapterSource {
  key: string;
  title: string;
  kind: string;
  owner: string;
  checkDays: number;
  reliability: string;
  /** The fallback address of the document. */
  url?: string;
  /** Find the document on the court's own page by the words of its link. */
  locate?: { index: string; linkText: string };
}

export interface AdapterItem {
  text: string;
  /** The words of the rule that support the item. The framework finds them in the document. */
  quote?: string;
  /** Where it is, as the rule names it: "Order XXI rule 3(1)(b)". */
  ref?: string;
  /** Workflow step: the skill that does it. */
  skill?: string;
  /** A value the item carries, for example a number of days. */
  value?: string | number;
}

export interface AdapterList {
  key: string;
  kind: ListKind;
  title: string;
  /** When the list is needed: the case types, and the practice areas for which it is recommended. */
  needs?: { caseTypes?: string[]; practice?: string[] };
  source: string;
  items?: AdapterItem[];
  /** A "rules" list: the numbered rules between two headings become the items. */
  extract?: { start: string; end?: string };
  /** The part of the document the items' quotes must be found in: from the words of one heading to the next. */
  scope?: { start: string; end?: string };
}

export interface AdapterFormatCheck {
  key: string;
  title: string;
  check: FormatCheckKind;
  value?: number | string;
  source: string;
  quote?: string;
  ref?: string;
}

export interface AdapterDefect {
  key: string;
  title: string;
  /** Words that identify the defect in a registry's defect list. */
  match: string[];
  /** What to do before re-filing. */
  step: string;
  source?: string;
  quote?: string;
}

export interface AdapterProceeding {
  key: string;
  title: string;
  court: string;
  caseType: string;
  provisions: string[];
  limitation?: { days: number; from: string; source: string; quote?: string; ref?: string };
  requiredParts: string[];
  checklist?: string;
  workflow?: string;
  stages: string[];
  intakeQuestions: string[];
  skills: string[];
}

export interface AdapterDefinition {
  id: string;
  version: string;
  title: string;
  courts: string[];
  author: string;
  review: string;
  hosts: string[];
  general: Record<string, string>;
  sources: AdapterSource[];
  lists: AdapterList[];
  formatChecks: AdapterFormatCheck[];
  defects: AdapterDefect[];
  proceedings: AdapterProceeding[];
}

export type AdapterTier = "built-in" | "vendored" | "advocate";

export interface AdapterSummary {
  id: string;
  version: string;
  title: string;
  courts: string[];
  tier: AdapterTier;
  folder: string;
  author: string;
  review: string;
  error: string | null;
  /** A higher version of the same id runs instead. */
  shadowed: boolean;
  lists: Array<{ key: string; kind: ListKind; title: string; caseTypes: string[]; practice: string[] }>;
  proceedings: Array<{ key: string; title: string; caseType: string }>;
  general: Record<string, string>;
  /** Recommended for the advocate's practice areas. */
  recommended: string[];
}

export type ItemStatus = "verified" | "not_found" | "no_quote" | "advocate_entered";

export interface PackItem {
  id: string;
  n: number;
  text: string;
  ref: string | null;
  quote: string | null;
  status: ItemStatus;
  page: number | null;
  line: number | null;
  /** The words found in the document, as read. */
  found: string | null;
  skill: string | null;
  value: string | null;
  /** For an advocate-entered item: the source the advocate gave. */
  enteredSource: string | null;
}

export interface PackList {
  id: string;
  adapterId: string;
  adapterVersion: string;
  court: string;
  key: string;
  kind: ListKind;
  title: string;
  version: number;
  sourceId: string | null;
  builtAt: string;
  supersededBy: string | null;
  items: PackItem[];
  /** Filled when read: the source's freshness and whether a higher adapter version is active. */
  freshness?: { state: "fresh" | "stale"; since: string } | null;
  upgrade?: string | null;
}

export interface BenchRow {
  id: string;
  court: string;
  date: string;
  bench: string;
  judges: string;
  source: string;
  enteredBy: string;
  createdAt: string;
}

export interface FilingTarget {
  court: string;
  caseType: string;
  listKey: string | null;
  adapterId: string | null;
  setAt: string;
}

export type CheckState = "open" | "done" | "not_applicable";

export interface MatterCheckRow {
  listId: string;
  listTitle: string;
  item: PackItem;
  state: CheckState;
  note: string;
  decidedAt: string | null;
}

export interface MatterChecklist {
  target: FilingTarget | null;
  list: PackList | null;
  rows: MatterCheckRow[];
  /** Why there is no list, when there is none. */
  reason: string | null;
  /** Every checklist of the court for the case type. */
  lists: PackList[];
}

export interface FormatCheckResult {
  key: string;
  title: string;
  file: string;
  result: "pass" | "fail" | "not_checked";
  detail: string;
  ref: string | null;
}

export interface DefectRow {
  id: string;
  text: string;
  /** The court's defect class it matched, or null. */
  classKey: string | null;
  classTitle: string | null;
  step: string | null;
  state: "open" | "cured";
  createdAt: string;
  curedAt: string | null;
}
