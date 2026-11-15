/**
 * B11, B14: the matter's filing target (court and case type), the state of each checklist item,
 * and the registry's defects. Part of the matter store (decision 4): MatterStore calls these
 * inside its own writes, with one event each. Only the advocate sets a target, ticks an item or
 * marks a defect cured.
 */
import type { DatabaseSync } from "node:sqlite";
import type { CheckState, DefectRow, FilingTarget } from "../../shared/intel.ts";

export const FILING_CHECKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS filing_target (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  court TEXT NOT NULL,
  case_type TEXT NOT NULL,
  list_key TEXT,
  adapter_id TEXT,
  set_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS filing_check (
  list_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'done', 'not_applicable')),
  note TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  PRIMARY KEY (list_id, item_id)
) STRICT;
CREATE TABLE IF NOT EXISTS defect (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  class_key TEXT,
  class_title TEXT,
  step TEXT,
  state TEXT NOT NULL CHECK (state IN ('open', 'cured')),
  created_at TEXT NOT NULL,
  cured_at TEXT
) STRICT;
`;

export function target(db: DatabaseSync): FilingTarget | null {
  const r = db.prepare("SELECT * FROM filing_target WHERE id = 1").get() as Record<string, unknown> | undefined;
  return r ? { court: String(r.court), caseType: String(r.case_type), listKey: r.list_key == null ? null : String(r.list_key), adapterId: r.adapter_id == null ? null : String(r.adapter_id), setAt: String(r.set_at) } : null;
}

export function setTarget(db: DatabaseSync, t: Omit<FilingTarget, "setAt">): void {
  db.prepare("INSERT INTO filing_target (id, court, case_type, list_key, adapter_id, set_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET court = excluded.court, case_type = excluded.case_type, list_key = excluded.list_key, adapter_id = excluded.adapter_id, set_at = excluded.set_at").run(
    t.court,
    t.caseType,
    t.listKey,
    t.adapterId,
    new Date().toISOString(),
  );
}

export function checkStates(db: DatabaseSync, listIds: string[]): Map<string, { state: CheckState; note: string; decidedAt: string }> {
  const out = new Map<string, { state: CheckState; note: string; decidedAt: string }>();
  for (const listId of listIds) {
    for (const r of db.prepare("SELECT * FROM filing_check WHERE list_id = ?").all(listId) as Array<Record<string, unknown>>) {
      out.set(`${r.list_id}:${r.item_id}`, { state: r.state as CheckState, note: String(r.note), decidedAt: String(r.decided_at) });
    }
  }
  return out;
}

export function setCheck(db: DatabaseSync, listId: string, itemId: string, state: CheckState, note: string): void {
  db.prepare("INSERT INTO filing_check (list_id, item_id, state, note, decided_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(list_id, item_id) DO UPDATE SET state = excluded.state, note = excluded.note, decided_at = excluded.decided_at").run(
    listId,
    itemId,
    state,
    note.slice(0, 1000),
    new Date().toISOString(),
  );
}

export function defects(db: DatabaseSync): DefectRow[] {
  return (db.prepare("SELECT * FROM defect ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    classKey: r.class_key == null ? null : String(r.class_key),
    classTitle: r.class_title == null ? null : String(r.class_title),
    step: r.step == null ? null : String(r.step),
    state: r.state as DefectRow["state"],
    createdAt: String(r.created_at),
    curedAt: r.cured_at == null ? null : String(r.cured_at),
  }));
}
