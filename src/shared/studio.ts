/**
 * Types of the Research and Argument Studio (v4 spec), shared by main, preload and renderer.
 */

/** V4-2: a statutory provision saved from India Code. */
export interface ProvisionRecord {
  id: string;
  /** "indiacode:<item id>". */
  sourceRef: string;
  act: string;
  section: string;
  title: string;
  text: string;
  repealed: boolean;
  url: string;
  retrievedAt: string;
  author: "advocate" | "agent";
  status: "candidate" | "adopted" | "rejected";
  createdAt: string;
}

export const GROUNDS = ["jurisdictional", "procedural", "evidentiary", "statutory", "constitutional", "precedent"] as const;
export type Ground = (typeof GROUNDS)[number];
export const STANCES = ["petitioner", "respondent"] as const;
export type Stance = (typeof STANCES)[number];

export const REJECTION_REASONS = ["MODEL_ERROR", "SCHEMA", "UNGROUNDED_FACT", "UNKNOWN_AUTHORITY", "FAILED_CITATION", "REPEALED_PROVISION", "DUPLICATE", "NO_GROUNDING"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface ArgumentRun {
  id: string;
  issueId: string;
  model: string;
  rounds: number;
  generators: number;
  status: "running" | "done" | "failed";
  stats: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ArgumentRecord {
  id: string;
  runId: string;
  issueId: string;
  round: number;
  ground: string;
  stance: Stance;
  claim: string;
  reasoning: string;
  /** Confirmed Notebook events the argument relies on, each with the words quoted from its line. */
  events: Array<{ id: string; quote: string }>;
  /** Authorities of the matter, with the paragraph relied on. */
  authorities: Array<{ id: string; paragraph: string }>;
  /** Provisions of the matter. */
  provisions: string[];
  /** Critical questions the argument does not answer (the critic's list). */
  questions: string[];
  /** Pairwise rating within its cell. Orders the cell; it is not a probability. */
  elo: number;
  /** The argument this one attacks, when it is an attack. */
  attacks: string | null;
  attackKind: "rebut" | "undercut" | "undermine" | null;
  status: "candidate" | "accepted" | "rejected";
  decidedAt: string | null;
  createdAt: string;
}

export interface ArgumentRejection {
  id: string;
  runId: string;
  round: number;
  ground: string;
  stance: string;
  reason: string;
  detail: string;
  claim: string;
  createdAt: string;
}

/** Computed by code (grounded semantics), never by a model. */
export type ArgumentStatus = "in" | "out" | "undecided";

/** V5-10. */
export interface Assessment {
  authorityId: string;
  support: string | null;
  supportBasis: string;
  supportStatus: "candidate" | "confirmed";
  voice: string | null;
  voiceBasis: string;
  voiceStatus: "candidate" | "confirmed";
}

export interface Treatment {
  id: string;
  authorityId: string;
  kind: "overruled" | "doubted" | "distinguished" | "followed" | "referred_to_larger_bench";
  byCitation: string;
  byDate: string;
  byBench: number | null;
  authorityDate: string;
  authorityBench: number | null;
  note: string;
  author: "advocate" | "agent";
  reviewItemId: string | null;
  createdAt: string;
}

/** V5-11: one entry of the challenge register. */
export interface Challenge {
  id: string;
  runId: string;
  kind: "bench_question" | "objection";
  category: string;
  text: string;
  answer: string;
  refs: string[];
  origin: "generated" | "verified_defect";
  status: "open" | "accepted" | "rejected";
  createdAt: string;
}

/** V5-9. Never a verification: labelled "Quick check, not verified". */
export interface QuickCheck {
  citation: string;
  outcome: "found" | "not_found" | "mismatch" | "unavailable";
  field: string | null;
  detail: string;
}

export interface StudioState {
  assessments: Assessment[];
  treatments: Treatment[];
  challenges: Challenge[];
  provisions: ProvisionRecord[];
  runs: ArgumentRun[];
  arguments: Array<ArgumentRecord & { computed: ArgumentStatus }>;
  rejections: ArgumentRejection[];
  /** Whether the loop can run now, and why not. */
  loop: { available: boolean; detail: string; running: string | null };
}

/** One result of a research search, from any source. */
export interface ResearchHit {
  source: "aws_sc" | "aws_hc" | "indiacode" | "web";
  /** Id to read it again: a judgment id, an India Code item id, or a URL. */
  ref: string;
  title: string;
  /** One line of what it is: court, date, citation; Act and section; or the page snippet. */
  detail: string;
  url: string;
  /** India Code: the repealed flag. */
  repealed?: boolean;
  /** A web result that names a neutral citation found in the local index: the court's own copy. */
  courtCopy?: { ref: string; insc: string; title: string };
}

export interface ResearchSettings {
  aws: boolean;
  indiaCode: boolean;
  web: boolean;
}

export interface CorpusPart {
  source: "sc" | "hc";
  year: number;
  court: string;
  courtName: string;
  rows: number;
  at: string;
}

/** What a read returns: the text by page and line, with where it came from. */
export interface ResearchDocument {
  source: ResearchHit["source"];
  ref: string;
  title: string;
  detail: string;
  url: string;
  sha256: string | null;
  pages: Array<{ page: number; lines: Array<{ line: number; text: string }> }>;
  /** A short notice about what the text is (current text only; discovery only). */
  notice: string;
}
