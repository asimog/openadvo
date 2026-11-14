/**
 * V5-19 to V5-23: hearings, reminders, the matter's policy (budget and confidentiality) and its
 * parties. Part of the matter store (decision 4). Every write here is the advocate's.
 * Plain library. Spec: docs/specs/v5.md.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

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
CREATE TABLE IF NOT EXISTS party (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  role TEXT NOT NULL,
  name_in_record TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS impact_check (
  source_id TEXT PRIMARY KEY,
  at TEXT NOT NULL
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

export interface Policy {
  confidential: boolean;
  budgetTokens: number | null;
}

export interface Party {
  id: string;
  contactId: string;
  role: string;
  nameInRecord: string;
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
  return (db.prepare("SELECT * FROM party ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), contactId: String(r.contact_id), role: String(r.role), nameInRecord: String(r.name_in_record) }));
}

export function addParty(db: DatabaseSync, contactId: string, role: string, nameInRecord: string): Party {
  const id = randomUUID();
  db.prepare("INSERT INTO party VALUES (?, ?, ?, ?, ?)").run(id, contactId, role.slice(0, 60), nameInRecord.slice(0, 300), new Date().toISOString());
  return parties(db).find((x) => x.id === id)!;
}

/** V5-19: true the first time a source is checked for impact; false after. */
export function markImpactChecked(db: DatabaseSync, sourceId: string): boolean {
  return Number(db.prepare("INSERT OR IGNORE INTO impact_check VALUES (?, ?)").run(sourceId, new Date().toISOString()).changes) > 0;
}
