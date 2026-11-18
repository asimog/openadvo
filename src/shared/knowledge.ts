/**
 * Phase 10: memory answers (F5), the advocate memory graph (G3), knowledge in use (M2) and
 * outcome records (M3). Shared by main, preload and renderer; no side effects.
 */
import type { LibraryItem, MemoryRecord } from "./stores.ts";

/** The six standard questions of F5, plus a plain search. */
export type MemoryQuestionKind = "what_decided" | "why_rejected" | "disputed_facts" | "instructions" | "since_last_hearing" | "expired_assumptions" | "search";

export interface MemoryAnswerLine {
  text: string;
  /** The ids of the records the line rests on. */
  recordIds: string[];
  /** The anchors of those records, when they have one. */
  anchors: string[];
}

export interface MemoryAnswerRecord {
  kind: "memory" | "issue" | "fact" | "event" | "hearing" | "argument" | "source" | "draft" | "limitation";
  id: string;
  label: string;
  anchor: string | null;
}

export interface MemoryAnswer {
  question: string;
  kind: MemoryQuestionKind;
  title: string;
  asOf: string;
  answer: MemoryAnswerLine[];
  records: MemoryAnswerRecord[];
  gaps: string[];
  notRead: string[];
}

/** One of the six buttons the Memory tab shows. */
export interface MemoryQuestion {
  kind: Exclude<MemoryQuestionKind, "search">;
  title: string;
  question: string;
}

/** The six questions the Memory tab offers, in the order the advocate asks them. */
export const MEMORY_QUESTIONS: MemoryQuestion[] = [
  { kind: "what_decided", title: "What was decided", question: "What was decided in this matter?" },
  { kind: "why_rejected", title: "Why an argument was rejected", question: "Why was an argument rejected, and by whom?" },
  { kind: "disputed_facts", title: "Which facts are disputed", question: "Which facts are disputed?" },
  { kind: "instructions", title: "Which instructions were given", question: "Which instructions did the client give?" },
  { kind: "since_last_hearing", title: "What changed since the last hearing", question: "What changed since the last hearing?" },
  { kind: "expired_assumptions", title: "Which assumptions expired", question: "Which assumptions have expired or been superseded?" },
];

/** The records the answerer reads. A snapshot is built by the matter store, tested on its own. */
export interface MemorySnapshot {
  asOf: string;
  matterTitle: string;
  memory: MemoryRecord[];
  issues: Array<{ id: string; text: string; status: "candidate" | "accepted" | "rejected"; reason: string | null; factIds: string[]; createdAt: string; decidedAt: string | null }>;
  facts: Array<{ id: string; text: string; status: "candidate" | "confirmed" | "disputed" | "rejected" | "superseded"; anchorId: string | null; sourceId: string | null; date: string; type: string }>;
  events: Array<{ id: string; sourceId: string; sourceName: string; anchorId: string; dateStart: string; description: string; kind: "procedural" | "factual"; status: string; excluded: boolean; conflicts: string[] }>;
  hearings: Array<{ id: string; date: string; bench: string; directions: string; nextDate: string; notes: string; createdAt: string }>;
  arguments: Array<{ id: string; issueId: string; claim: string; stance: string; status: "candidate" | "accepted" | "rejected"; decidedAt: string | null; createdAt: string }>;
  sources: Array<{ id: string; name: string; addedAt: string }>;
  drafts: Array<{ id: string; title: string; createdAt: string }>;
  limitation: { id: string; rule: string; deadline: string; working: string; confirmedAt: string | null } | null;
  conflicts: Array<{ id: string; status: "open" | "resolved"; eventIds: string[] }>;
}

// ---- G3: the advocate memory graph ----

export const GRAPH_NODE_KINDS = ["advocate", "court", "practice_area", "preference", "precedent", "lesson", "court_practice", "outcome", "skill", "proposition"] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_RELATIONS = ["prefers", "rejected", "approved", "supersedes", "used_in", "succeeded_when", "failed_because", "applies_in", "derived_from"] as const;
export type GraphRelation = (typeof GRAPH_RELATIONS)[number];

export interface AdvocateGraphEdge {
  fromKind: GraphNodeKind;
  fromId: string;
  relation: GraphRelation;
  toKind: GraphNodeKind;
  toId: string;
  /** The record the edge was read from. */
  evidenceRef: string;
  builtFrom: string;
  builtAt: string;
}

export interface AdvocateGraphView {
  edges: AdvocateGraphEdge[];
  counts: Array<{ fromKind: GraphNodeKind; relation: GraphRelation; toKind: GraphNodeKind; n: number }>;
  builtAt: string | null;
}

/** The inputs of the graph. It reads advocate memory, the library and the outcomes, never a client fact. */
export interface AdvocateGraphInput {
  memory: MemoryRecord[];
  preferences: Array<{ id: string; key: string; value: string; reason: string; status: string }>;
  library: Array<{ id: string; title: string; kind: string; status: string; court: string; scope: string }>;
  outcomes: Array<{ id: string; matterId: string; result: string; subject: string; court: string; decidedOn: string }>;
  /** Other matters' outcomes are read as records, never as facts. The advocate's own words only. */
  now: string;
}

// ---- M2: knowledge in use ----

export const LIBRARY_ROLES = ["position", "playbook", "drafting_style", "common_error", "precedent", "other"] as const;
export type LibraryRole = (typeof LIBRARY_ROLES)[number];

/** The library grouped by role, for the Knowledge page. */
export interface LibraryRoleGroup {
  role: LibraryRole;
  title: string;
  items: LibraryItem[];
}

export interface PrecedentOffer {
  id: string;
  title: string;
  court: string;
  scope: string;
  itemDate: string;
  status: string;
  kind: string;
  /** Why it is offered first. */
  reason: string;
  rank: number;
}

/** The matter facts a precedent offer reads: its court, its proceeding and its practice area. */
export interface PrecedentSubject {
  court: string;
  proceeding: string;
  practiceArea: string;
}

// ---- M3: outcome records ----

export const OUTCOME_RESULTS = ["allowed", "dismissed", "partly_allowed", "settled", "withdrawn", "disposed", "other"] as const;
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

export interface OutcomeRecord {
  id: string;
  matterId: string;
  result: OutcomeResult;
  /** The legal question or the relief, in the advocate's words. Never a client fact. */
  subject: string;
  court: string;
  decidedOn: string;
  sourceId: string | null;
  summary: string;
  enteredAt: string;
  enteredBy: string;
  supersedes: string | null;
  status: "active" | "superseded";
}

export interface OutcomeInput {
  result: OutcomeResult;
  subject: string;
  court?: string;
  decidedOn: string;
  sourceId?: string | null;
  summary?: string;
  supersedes?: string | null;
}
