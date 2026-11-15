/**
 * N2, I1, O3, O7: skill runs and context packages in matter.db. Part of the matter store
 * (decision 4): MatterStore calls these inside its own writes, with one event each.
 */
import type { DatabaseSync } from "node:sqlite";
import type { ContextPackageRecord, ReportCard, RunState, SkillRunRecord } from "../../shared/skills.ts";

export const SKILL_RUN_SCHEMA = `
CREATE TABLE IF NOT EXISTS context_package (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  skill_id TEXT NOT NULL,
  skill_version TEXT NOT NULL,
  package_type TEXT NOT NULL,
  question_type TEXT NOT NULL,
  hash TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  included TEXT NOT NULL,
  excluded TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS context_package_hash ON context_package(hash);
CREATE TRIGGER IF NOT EXISTS context_package_no_update BEFORE UPDATE ON context_package BEGIN SELECT RAISE(ABORT, 'packages are written once'); END;
CREATE TRIGGER IF NOT EXISTS context_package_no_delete BEFORE DELETE ON context_package BEGIN SELECT RAISE(ABORT, 'packages are written once'); END;
CREATE TABLE IF NOT EXISTS skill_run (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  skill_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'needs_review', 'failed', 'stopped', 'interrupted', 'refused')),
  request TEXT NOT NULL,
  reason TEXT NOT NULL,
  package_id TEXT REFERENCES context_package(id),
  session_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  report TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS skill_run_no_delete BEFORE DELETE ON skill_run BEGIN SELECT RAISE(ABORT, 'skill runs are kept'); END;
`;

function parse<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function packageRow(r: Record<string, unknown>): ContextPackageRecord {
  return {
    id: String(r.id),
    runId: r.run_id == null ? null : String(r.run_id),
    skillId: String(r.skill_id),
    skillVersion: String(r.skill_version),
    packageType: r.package_type as ContextPackageRecord["packageType"],
    questionType: r.question_type as ContextPackageRecord["questionType"],
    hash: String(r.hash),
    tokens: Number(r.tokens),
    budget: Number(r.budget),
    included: parse(r.included, []),
    excluded: parse(r.excluded, []),
    createdAt: String(r.created_at),
  };
}

export function runRow(r: Record<string, unknown>): SkillRunRecord {
  return {
    id: String(r.id),
    skillId: String(r.skill_id),
    skillVersion: String(r.skill_version),
    state: r.state as RunState,
    request: String(r.request),
    reason: String(r.reason),
    packageId: r.package_id == null ? null : String(r.package_id),
    sessionId: r.session_id == null ? null : String(r.session_id),
    startedAt: String(r.started_at),
    endedAt: r.ended_at == null ? null : String(r.ended_at),
    report: parse<ReportCard | null>(r.report, null),
  };
}

export function insertPackage(db: DatabaseSync, p: ContextPackageRecord): void {
  db.prepare("INSERT INTO context_package (id, run_id, skill_id, skill_version, package_type, question_type, hash, tokens, budget, included, excluded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    p.id,
    p.runId,
    p.skillId,
    p.skillVersion,
    p.packageType,
    p.questionType,
    p.hash,
    p.tokens,
    p.budget,
    JSON.stringify(p.included),
    JSON.stringify(p.excluded),
    p.createdAt,
  );
}

export function packageByHash(db: DatabaseSync, hash: string): ContextPackageRecord | null {
  const r = db.prepare("SELECT * FROM context_package WHERE hash = ? ORDER BY created_at DESC LIMIT 1").get(hash) as Record<string, unknown> | undefined;
  return r ? packageRow(r) : null;
}

export function packageById(db: DatabaseSync, id: string): ContextPackageRecord | null {
  const r = db.prepare("SELECT * FROM context_package WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? packageRow(r) : null;
}

export function listRuns(db: DatabaseSync): SkillRunRecord[] {
  return (db.prepare("SELECT * FROM skill_run ORDER BY started_at DESC").all() as Array<Record<string, unknown>>).map(runRow);
}

export function runById(db: DatabaseSync, id: string): SkillRunRecord | null {
  const r = db.prepare("SELECT * FROM skill_run WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? runRow(r) : null;
}
