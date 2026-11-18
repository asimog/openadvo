/**
 * Phase 10 (M3): outcome records of a matter. What the court did, in the advocate's words, with
 * the order as its source. A correction is a new row that supersedes the old one; the old row
 * stays. Part of the matter store: MatterStore owns the write and its event.
 */
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { OUTCOME_RESULTS, type OutcomeInput, type OutcomeRecord } from "../../shared/knowledge.ts";

export const OUTCOME_SCHEMA = `
CREATE TABLE IF NOT EXISTS outcome (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN (${OUTCOME_RESULTS.map((r) => `'${r}'`).join(", ")})),
  subject TEXT NOT NULL,
  court TEXT NOT NULL DEFAULT '',
  decided_on TEXT NOT NULL,
  source_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  entered_at TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  supersedes TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded'))
) STRICT;
CREATE INDEX IF NOT EXISTS outcome_matter ON outcome(matter_id, decided_on);
`;

function row(r: Record<string, unknown>): OutcomeRecord {
  return {
    id: String(r.id),
    matterId: String(r.matter_id),
    result: r.result as OutcomeRecord["result"],
    subject: String(r.subject),
    court: String(r.court),
    decidedOn: String(r.decided_on),
    sourceId: r.source_id == null ? null : String(r.source_id),
    summary: String(r.summary),
    enteredAt: String(r.entered_at),
    enteredBy: String(r.entered_by),
    supersedes: r.supersedes == null ? null : String(r.supersedes),
    status: r.status as OutcomeRecord["status"],
  };
}

/** Every outcome of the matter, newest decision first. The superseded rows stay for the history. */
export function outcomes(db: DatabaseSync, matterId: string): OutcomeRecord[] {
  return (db.prepare("SELECT * FROM outcome WHERE matter_id = ? ORDER BY decided_on DESC, rowid DESC").all(matterId) as Array<Record<string, unknown>>).map(row);
}

/** Insert one outcome. A superseded row is marked in the same write; nothing is deleted. */
export function insertOutcome(db: DatabaseSync, matterId: string, input: OutcomeInput, at: string, by: string): OutcomeRecord {
  if (!(OUTCOME_RESULTS as readonly string[]).includes(input.result)) throw new Error(`BAD_RESULT: ${input.result}`);
  const subject = input.subject.trim().slice(0, 500);
  if (!subject) throw new Error("BAD_OUTCOME: an outcome record needs its subject in the advocate's words");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.decidedOn)) throw new Error("BAD_DATE: the outcome date is YYYY-MM-DD");
  if (input.supersedes) {
    const old = db.prepare("SELECT matter_id, status FROM outcome WHERE id = ?").get(input.supersedes) as { matter_id: string; status: string } | undefined;
    if (!old || old.matter_id !== matterId) throw new Error(`NOT_FOUND: no outcome ${input.supersedes} in this matter`);
    if (old.status !== "active") throw new Error("ALREADY_SUPERSEDED: this outcome was already corrected");
  }
  const id = randomUUID();
  db.prepare(
    "INSERT INTO outcome (id, matter_id, result, subject, court, decided_on, source_id, summary, entered_at, entered_by, supersedes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')",
  ).run(id, matterId, input.result, subject, (input.court ?? "").trim().slice(0, 300), input.decidedOn, input.sourceId ?? null, (input.summary ?? "").trim().slice(0, 4000), at, by, input.supersedes ?? null);
  if (input.supersedes) db.prepare("UPDATE outcome SET status = 'superseded' WHERE id = ?").run(input.supersedes);
  return outcomes(db, matterId).find((o) => o.id === id)!;
}
