/**
 * Phase 11 (D4): the foreign elements of a matter. The store owns the rows; the routes are
 * derived by the plain library. Only the advocate confirms an element or rejects it.
 */
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { FOREIGN_KINDS, type ForeignElement, type ForeignElementInput } from "../../shared/foreign.ts";

export const FOREIGN_SCHEMA = `
CREATE TABLE IF NOT EXISTS foreign_element (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (${FOREIGN_KINDS.map((k) => `'${k}'`).join(", ")})),
  subject TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  source_id TEXT,
  anchor_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  proposed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS foreign_element_kind ON foreign_element(kind, status);
`;

function row(r: Record<string, unknown>): ForeignElement {
  return {
    id: String(r.id),
    kind: r.kind as ForeignElement["kind"],
    subject: String(r.subject),
    detail: String(r.detail),
    country: String(r.country),
    sourceId: r.source_id == null ? null : String(r.source_id),
    anchorId: r.anchor_id == null ? null : String(r.anchor_id),
    status: r.status as ForeignElement["status"],
    proposedBy: String(r.proposed_by),
    createdAt: String(r.created_at),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
  };
}

export function foreignElements(db: DatabaseSync): ForeignElement[] {
  return (db.prepare("SELECT * FROM foreign_element ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map(row);
}

/** Insert one element. The same kind and subject is not inserted twice. */
export function insertForeignElement(db: DatabaseSync, input: ForeignElementInput, proposedBy: string, at: string, status: "proposed" | "confirmed"): ForeignElement {
  if (!(FOREIGN_KINDS as readonly string[]).includes(input.kind)) throw new Error(`BAD_KIND: ${input.kind}`);
  const subject = input.subject.trim().slice(0, 400);
  if (!subject) throw new Error("BAD_ELEMENT: a foreign element needs its subject");
  const existing = db.prepare("SELECT * FROM foreign_element WHERE kind = ? AND subject = ?").get(input.kind, subject) as Record<string, unknown> | undefined;
  if (existing) return row(existing);
  const id = randomUUID();
  db.prepare("INSERT INTO foreign_element (id, kind, subject, detail, country, source_id, anchor_id, status, proposed_by, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    input.kind,
    subject,
    (input.detail ?? "").trim().slice(0, 2000),
    (input.country ?? "").trim().slice(0, 120),
    input.sourceId ?? null,
    input.anchorId ?? null,
    status,
    proposedBy,
    at,
    status === "confirmed" ? at : null,
  );
  return foreignElements(db).find((e) => e.id === id)!;
}

export function decideForeignElement(db: DatabaseSync, id: string, decision: "confirmed" | "rejected", at: string): ForeignElement {
  const existing = db.prepare("SELECT status FROM foreign_element WHERE id = ?").get(id) as { status: string } | undefined;
  if (!existing) throw new Error(`NOT_FOUND: no foreign element ${id}`);
  if (existing.status !== "proposed") throw new Error("ALREADY_DECIDED: this element is already decided");
  db.prepare("UPDATE foreign_element SET status = ?, decided_at = ? WHERE id = ?").run(decision, at, id);
  return foreignElements(db).find((e) => e.id === id)!;
}
