/**
 * Phase 8: practice packs (docs/specs/practice-packs.md, docs/skills.md section 2.6). A pack is
 * content: proceedings, courts, acts by version, templates, checklists, record columns, stages,
 * intake questions, skills, evidence requirements and terms. It owns no matter fact.
 */

export const PACK_IDS = [
  "criminal",
  "civil",
  "writ",
  "slp",
  "commercial",
  "family",
  "property",
  "insolvency",
  "banking",
  "tax",
  "service",
  "consumer",
  "ip",
  "environmental",
  "competition",
  "administrative",
  "insurance",
  "immigration",
  "rera",
  "motor",
  "cheque",
] as const;
export type PackId = (typeof PACK_IDS)[number];

export interface PackLimitation {
  id: string;
  title: string;
  days: number;
  from: string;
  source: string;
  ref?: string;
}

export interface PackDocument {
  kind: string;
  title: string;
}

export interface PackWorkflowStep {
  text: string;
  skill?: string;
}

export interface PackTerm {
  term: string;
  meaning: string;
}

export interface PackProceeding {
  key: string;
  title: string;
  caseType: string;
  courts: string[];
  provisions: string[];
  limitation: PackLimitation | null;
  requiredParts: string[];
  /** The documents the filing set builds, in its order. */
  documents: PackDocument[];
  /** Parts the annexure manager owns. */
  annexureParts: string[];
  /** Parts the document catalogue cannot map: reported, never dropped silently. */
  unmappedParts: string[];
  /** Documents the pack adds when limitation has run (the condonation application). */
  lateDocuments: PackDocument[];
  workflow: PackWorkflowStep[];
  stages: string[];
  intakeQuestions: string[];
  skills: string[];
  recordColumns: string[];
  evidence: string[];
  terms: PackTerm[];
}

export interface PackAct {
  act: string;
  /** A version only where a source records it; otherwise "not recorded". */
  version: string;
  source: string;
}

export interface PackTemplate {
  kind: string;
  title: string;
  note: string;
}

export interface PracticePack {
  id: string;
  version: string;
  title: string;
  /** The Practice Profile practice areas the pack serves. */
  practice: string[];
  courts: string[];
  /** True for the pack that applies when the matter names no pack (the SLP pack). */
  default?: boolean;
  acts: PackAct[];
  templates: PackTemplate[];
  proceedings: PackProceeding[];
  terms: PackTerm[];
}

export interface PackSummary {
  id: string;
  version: string;
  title: string;
  practice: string[];
  courts: string[];
  isDefault: boolean;
  proceedings: Array<{ key: string; title: string; caseType: string; courts: string[] }>;
  acts: PackAct[];
  skills: string[];
  error: string | null;
}

/** Where the application found the matter's pack. "default" means no pack was chosen. */
export type PackSource = "court-target" | "proceeding" | "practice" | "court" | "default";

export interface PackChoice {
  pack: PracticePack;
  proceeding: PackProceeding | null;
  source: PackSource;
  /** The reason, for the Filing tab and the skill gate. */
  reason: string;
}

export interface PackFilingPlan {
  packId: string;
  packTitle: string;
  proceedingKey: string;
  proceedingTitle: string;
  caseType: string;
  source: PackSource;
  documents: PackDocument[];
  annexureParts: string[];
  unmappedParts: string[];
  limitation: PackLimitation | null;
  workflow: PackWorkflowStep[];
}
