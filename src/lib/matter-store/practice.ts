/**
 * V5-19 to V5-23: hearings, reminders, the matter's policy (budget and confidentiality) and its
 * parties. Part of the matter store (decision 4). Every write here is the advocate's.
 * Plain library. Spec: docs/archive/2026-11-15/specs/v5.md.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MatterProfile, MatterRelation, RelatedMatter } from "../../shared/work.ts";

export const PRACTICE_SCHEMA = `
CREATE TABLE IF NOT EXISTS hearing (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  bench TEXT NOT NULL DEFAULT '',
  directions TEXT NOT NULL DEFAULT '',
  next_date TEXT NOT NULL DEFAULT '',
  next_date_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (next_date_status IN ('confirmed', 'inferred')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS reminder (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'notified', 'done')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS matter_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  confidential INTEGER NOT NULL DEFAULT 0,
  budget_tokens INTEGER,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS matter_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  court TEXT NOT NULL DEFAULT '',
  bench TEXT NOT NULL DEFAULT '',
  practice_area TEXT NOT NULL DEFAULT '',
  case_type TEXT NOT NULL DEFAULT '',
  proceeding TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL DEFAULT '',
  case_number TEXT NOT NULL DEFAULT '',
  cnr TEXT NOT NULL DEFAULT '',
  filing_date TEXT NOT NULL DEFAULT '',
  institution_date TEXT NOT NULL DEFAULT '',
  governing_date TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  relief TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS related_matter (
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (to_id, relation)
) STRICT;
CREATE TABLE IF NOT EXISTS party (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  role TEXT NOT NULL,
  name_in_record TEXT NOT NULL,
  counsel TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS impact_check (
  source_id TEXT PRIMARY KEY,
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS task_proposal (
  id TEXT PRIMARY KEY,
  hearing_id TEXT NOT NULL,
  text TEXT NOT NULL,
  due_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  created_at TEXT NOT NULL,
  decided_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS cross_question (
  id TEXT PRIMARY KEY,
  witness TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('contradiction', 'evidence')),
  target_id TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT NOT NULL
) STRICT;
`;

export interface Hearing {
  id: string;
  date: string;
  bench: string;
  directions: string;
  nextDate: string;
  nextDateStatus: "confirmed" | "inferred";
  notes: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  status: "open" | "notified" | "done";
  createdAt: string;
}

/** Phase 7 (K8): one compliance task proposed from a hearing's directions. */
export interface TaskProposal {
  id: string;
  hearingId: string;
  text: string;
  /** "" or YYYY-MM-DD. */
  dueAt: string;
  status: "open" | "accepted" | "rejected";
  author: "advocate" | "agent";
  createdAt: string;
  decidedAt: string;
}

/** Phase 7 (K9): one cross-examination question, tied to a contradiction or a recorded statement. */
export interface CrossQuestion {
  id: string;
  witness: string;
  question: string;
  targetKind: "contradiction" | "evidence";
  targetId: string;
  author: "advocate" | "agent";
  status: "candidate" | "accepted" | "rejected";
  createdAt: string;
  decidedAt: string;
}

export interface Policy {
  confidential: boolean;
  budgetTokens: number | null;
}

export interface Party {
  id: string;
  contactId: string;
  role: string;
  nameInRecord: string;
  /** C8: counsel for this party, as the record gives it. */
  counsel: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function hearings(db: DatabaseSync): Hearing[] {
  return (db.prepare("SELECT * FROM hearing ORDER BY date, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    date: String(r.date),
    bench: String(r.bench),
    directions: String(r.directions),
    nextDate: String(r.next_date),
    nextDateStatus: r.next_date_status as Hearing["nextDateStatus"],
    notes: String(r.notes),
    createdAt: String(r.created_at),
  }));
}

export function addHearing(db: DatabaseSync, h: Omit<Hearing, "id" | "createdAt">): Hearing {
  if (!ISO_DATE.test(h.date)) throw new Error("BAD_DATE: the hearing date is YYYY-MM-DD");
  if (h.nextDate && !ISO_DATE.test(h.nextDate)) throw new Error("BAD_DATE: the next date is YYYY-MM-DD");
  const id = randomUUID();
  db.prepare("INSERT INTO hearing VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, h.date, h.bench.slice(0, 300), h.directions.slice(0, 4000), h.nextDate, h.nextDateStatus === "inferred" ? "inferred" : "confirmed", h.notes.slice(0, 4000), new Date().toISOString());
  return hearings(db).find((x) => x.id === id)!;
}

export function reminders(db: DatabaseSync): Reminder[] {
  return (db.prepare("SELECT * FROM reminder ORDER BY due_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    dueAt: String(r.due_at),
    status: r.status as Reminder["status"],
    createdAt: String(r.created_at),
  }));
}

export function addReminder(db: DatabaseSync, text: string, dueAt: string): Reminder {
  const t = text.trim().slice(0, 500);
  if (!t) throw new Error("TEXT_REQUIRED: a reminder needs its text");
  if (Number.isNaN(Date.parse(dueAt))) throw new Error("BAD_DATE: the reminder needs a date and time");
  const id = randomUUID();
  db.prepare("INSERT INTO reminder VALUES (?, ?, ?, 'open', ?)").run(id, t, new Date(dueAt).toISOString(), new Date().toISOString());
  return reminders(db).find((x) => x.id === id)!;
}

export function setReminderStatus(db: DatabaseSync, id: string, status: Reminder["status"]): void {
  db.prepare("UPDATE reminder SET status = ? WHERE id = ?").run(status, id);
}

// ---- Phase 7 (K8): the compliance tasks of a hearing's directions ----

export function taskProposals(db: DatabaseSync): TaskProposal[] {
  return (db.prepare("SELECT * FROM task_proposal ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map(taskRow);
}

function taskRow(r: Record<string, unknown>): TaskProposal {
  return {
    id: String(r.id),
    hearingId: String(r.hearing_id),
    text: String(r.text),
    dueAt: String(r.due_at ?? ""),
    status: r.status as TaskProposal["status"],
    author: r.author as "advocate" | "agent",
    createdAt: String(r.created_at),
    decidedAt: String(r.decided_at ?? ""),
  };
}

/**
 * A task is proposed from a hearing's directions — the agent's as a proposal, the advocate's
 * recorded at once. The hearing must exist.
 */
export function proposeTask(db: DatabaseSync, input: { hearingId: string; text: string; dueAt?: string; ctx: { actor: "advocate" | "agent" } }): TaskProposal {
  const t = input.text.trim().slice(0, 500);
  if (!t) throw new Error("TEXT_REQUIRED: a compliance task needs its text");
  if (!db.prepare("SELECT 1 FROM hearing WHERE id = ?").get(input.hearingId)) throw new Error("HEARING_NOT_FOUND: the compliance task names its hearing");
  const due = input.dueAt?.trim() ?? "";
  if (due && !ISO_DATE.test(due)) throw new Error("BAD_DATE: the due date is YYYY-MM-DD or empty");
  const id = randomUUID();
  const at = new Date().toISOString();
  const decided = input.ctx.actor === "advocate" ? at : "";
  db.prepare("INSERT INTO task_proposal (id, hearing_id, text, due_at, status, author, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    input.hearingId,
    t,
    due,
    input.ctx.actor === "advocate" ? "accepted" : "open",
    input.ctx.actor,
    at,
    decided,
  );
  // The advocate's own task becomes its reminder at once; the agent's waits for the decision.
  if (input.ctx.actor === "advocate") acceptTaskReminder(db, { ...taskRow(db.prepare("SELECT * FROM task_proposal WHERE id = ?").get(id) as Record<string, unknown>) });
  return taskProposals(db).find((x) => x.id === id)!;
}

/** The reminder an accepted task becomes. */
function acceptTaskReminder(db: DatabaseSync, p: TaskProposal): Reminder {
  const due = p.dueAt ? new Date(`${p.dueAt}T09:00:00`).toISOString() : new Date().toISOString();
  return addReminder(db, `Compliance (${p.hearingId.slice(0, 8)}): ${p.text}`, due);
}

/** Human-only (decision 5): the advocate accepts a proposed task — it becomes a reminder — or rejects it. */
export function decideTask(db: DatabaseSync, id: string, accept: boolean): { task: TaskProposal; reminder: Reminder | null } {
  const r = db.prepare("SELECT * FROM task_proposal WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) throw new Error("TASK_NOT_FOUND: no such compliance task");
  const task = taskRow(r);
  if (task.status !== "open") throw new Error("ALREADY_DECIDED: the compliance task is " + task.status);
  if (task.author !== "agent") throw new Error("HUMAN_ONLY_PROPOSAL: the advocate's own task stands decided at once");
  const at = new Date().toISOString();
  db.prepare("UPDATE task_proposal SET status = ?, decided_at = ? WHERE id = ?").run(accept ? "accepted" : "rejected", at, id);
  let reminder: Reminder | null = null;
  if (accept) reminder = acceptTaskReminder(db, { ...task, status: "accepted" });
  return { task: taskProposals(db).find((x) => x.id === id)!, reminder };
}

// ---- Phase 7 (K9): the cross-examination plan ----

export function crossQuestions(db: DatabaseSync): CrossQuestion[] {
  return (db.prepare("SELECT * FROM cross_question ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    witness: String(r.witness ?? ""),
    question: String(r.question),
    targetKind: r.target_kind as CrossQuestion["targetKind"],
    targetId: String(r.target_id),
    author: r.author as "advocate" | "agent",
    status: r.status as CrossQuestion["status"],
    createdAt: String(r.created_at),
    decidedAt: String(r.decided_at ?? ""),
  }));
}

/**
 * A cross-examination question is proposed from the record: it names the contradiction or the
 * recorded statement it springs from. The target must exist; a question with no target is
 * refused.
 */
export function proposeCrossQuestion(db: DatabaseSync, input: { witness?: string; question: string; targetKind: "contradiction" | "evidence"; targetId: string; ctx: { actor: "advocate" | "agent" } }): CrossQuestion {
  const q = input.question.trim().slice(0, 1000);
  if (!q) throw new Error("QUESTION_REQUIRED: a cross-examination question needs its text");
  if (!q.trim().endsWith("?")) throw new Error("QUESTION_FORM: a cross-examination question ends with a question mark");
  const known =
    input.targetKind === "evidence"
      ? db.prepare("SELECT 1 FROM evidence WHERE id = ?").get(input.targetId)
      : // A contradiction is keyed by its values' fact ids: the review items carry it as detail
        // text, so the target is the fact the contradiction joins.
        db.prepare("SELECT 1 FROM fact WHERE id = ?").get(input.targetId);
  if (!known) throw new Error(`TARGET_NOT_FOUND: ${input.targetKind} ${input.targetId} is not in the record`);
  const id = randomUUID();
  const at = new Date().toISOString();
  const advocate = input.ctx.actor === "advocate";
  db.prepare("INSERT INTO cross_question (id, witness, question, target_kind, target_id, author, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    (input.witness ?? "").trim().slice(0, 200),
    q,
    input.targetKind,
    input.targetId,
    input.ctx.actor,
    advocate ? "accepted" : "candidate",
    at,
    advocate ? at : "",
  );
  return crossQuestions(db).find((x) => x.id === id)!;
}

/** Human-only (decision 5): the advocate accepts or rejects a proposed question. */
export function decideCrossQuestion(db: DatabaseSync, id: string, decision: "accepted" | "rejected"): CrossQuestion {
  const r = db.prepare("SELECT * FROM cross_question WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) throw new Error("QUESTION_NOT_FOUND: no such cross-examination question");
  const q = crossQuestions(db).find((x) => x.id === id)!;
  if (q.status !== "candidate") throw new Error("ALREADY_DECIDED: the question is " + q.status);
  const at = new Date().toISOString();
  db.prepare("UPDATE cross_question SET status = ?, decided_at = ? WHERE id = ?").run(decision, at, id);
  return crossQuestions(db).find((x) => x.id === id)!;
}

export function policy(db: DatabaseSync): Policy {
  const r = db.prepare("SELECT * FROM matter_policy WHERE id = 1").get() as Record<string, unknown> | undefined;
  return { confidential: Number(r?.confidential ?? 0) === 1, budgetTokens: r?.budget_tokens == null ? null : Number(r.budget_tokens) };
}

export function setPolicy(db: DatabaseSync, p: Policy): Policy {
  const budget = p.budgetTokens != null && Number.isFinite(p.budgetTokens) && p.budgetTokens > 0 ? Math.round(p.budgetTokens) : null;
  db.prepare("INSERT INTO matter_policy VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET confidential = excluded.confidential, budget_tokens = excluded.budget_tokens, updated_at = excluded.updated_at").run(p.confidential ? 1 : 0, budget, new Date().toISOString());
  return policy(db);
}

export function parties(db: DatabaseSync): Party[] {
  return (db.prepare("SELECT * FROM party ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), contactId: String(r.contact_id), role: String(r.role), nameInRecord: String(r.name_in_record), counsel: String(r.counsel ?? "") }));
}

export function addParty(db: DatabaseSync, contactId: string, role: string, nameInRecord: string, counsel = ""): Party {
  const id = randomUUID();
  db.prepare("INSERT INTO party (id, contact_id, role, name_in_record, counsel, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, contactId, role.slice(0, 60), nameInRecord.slice(0, 300), counsel.slice(0, 300), new Date().toISOString());
  return parties(db).find((x) => x.id === id)!;
}

/** C1: the one row of the matter profile. Empty fields are valid; nothing is guessed. */
export function matterProfile(db: DatabaseSync): MatterProfile {
  const r = db.prepare("SELECT * FROM matter_profile WHERE id = 1").get() as Record<string, unknown> | undefined;
  return {
    court: String(r?.court ?? ""),
    bench: String(r?.bench ?? ""),
    practiceArea: String(r?.practice_area ?? ""),
    caseType: String(r?.case_type ?? ""),
    proceeding: String(r?.proceeding ?? ""),
    side: String(r?.side ?? ""),
    caseNumber: String(r?.case_number ?? ""),
    cnr: String(r?.cnr ?? ""),
    filingDate: String(r?.filing_date ?? ""),
    institutionDate: String(r?.institution_date ?? ""),
    governingDate: String(r?.governing_date ?? ""),
    stage: String(r?.stage ?? ""),
    relief: String(r?.relief ?? ""),
    updatedAt: r?.updated_at == null ? null : String(r.updated_at),
  };
}

export function setMatterProfile(db: DatabaseSync, input: Partial<Omit<MatterProfile, "updatedAt">>): MatterProfile {
  const current = matterProfile(db);
  const next = { ...current, ...input };
  const date = (v: string | undefined) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) return "";
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v! : "";
  };
  db.prepare(
    `INSERT INTO matter_profile (id, court, bench, practice_area, case_type, proceeding, side, case_number, cnr, filing_date, institution_date, governing_date, stage, relief, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET court = excluded.court, bench = excluded.bench, practice_area = excluded.practice_area, case_type = excluded.case_type,
       proceeding = excluded.proceeding, side = excluded.side, case_number = excluded.case_number, cnr = excluded.cnr,
       filing_date = excluded.filing_date, institution_date = excluded.institution_date, governing_date = excluded.governing_date,
       stage = excluded.stage, relief = excluded.relief, updated_at = excluded.updated_at`,
  ).run(
    next.court.slice(0, 300),
    next.bench.slice(0, 300),
    next.practiceArea.slice(0, 120),
    next.caseType.slice(0, 200),
    next.proceeding.slice(0, 120),
    next.side.slice(0, 60),
    next.caseNumber.slice(0, 200),
    next.cnr.slice(0, 40),
    date(next.filingDate),
    date(next.institutionDate),
    date(next.governingDate),
    next.stage.slice(0, 200),
    next.relief.slice(0, 3000),
    new Date().toISOString(),
  );
  return matterProfile(db);
}

/** C6: one edge, stored in this matter. The main process writes the mirror row. */
export function relatedMatters(db: DatabaseSync): RelatedMatter[] {
  return (db.prepare("SELECT * FROM related_matter ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    toId: String(r.to_id),
    relation: r.relation as MatterRelation,
    note: String(r.note),
    createdAt: String(r.created_at),
  }));
}

export function addRelatedMatter(db: DatabaseSync, toId: string, relation: MatterRelation, note: string): RelatedMatter {
  db.prepare("INSERT OR REPLACE INTO related_matter (to_id, relation, note, created_at) VALUES (?, ?, ?, ?)").run(toId, relation, note.slice(0, 1000), new Date().toISOString());
  return relatedMatters(db).find((x) => x.toId === toId && x.relation === relation)!;
}

export function removeRelatedMatter(db: DatabaseSync, toId: string, relation: string): void {
  db.prepare("DELETE FROM related_matter WHERE to_id = ? AND relation = ?").run(toId, relation);
}

/** V5-19: true the first time a source is checked for impact; false after. */
export function markImpactChecked(db: DatabaseSync, sourceId: string): boolean {
  return Number(db.prepare("INSERT OR IGNORE INTO impact_check VALUES (?, ?)").run(sourceId, new Date().toISOString()).changes) > 0;
}
