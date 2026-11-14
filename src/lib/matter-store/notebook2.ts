/**
 * V5-7 and V5-8: OCR disputes, event corrections and date anchors. Part of the matter store
 * (decision 4). The system opens disputes and anchor questions; only the advocate decides.
 * Plain library. Spec: docs/specs/v5.md.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const NOTEBOOK2_SCHEMA = `
CREATE TABLE IF NOT EXISTS ocr_dispute (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  anchor_id TEXT NOT NULL,
  reading_a TEXT NOT NULL,
  engine_a TEXT NOT NULL,
  reading_b TEXT NOT NULL,
  engine_b TEXT NOT NULL,
  tokens_a TEXT NOT NULL,
  tokens_b TEXT NOT NULL,
  review_item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'decided')),
  choice TEXT CHECK (choice IS NULL OR choice IN ('a', 'b', 'typed')),
  decided_text TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS event_correction (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  date_text TEXT NOT NULL,
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS date_anchor (
  source_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  review_item_id TEXT,
  at TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS correction_no_update BEFORE UPDATE ON event_correction BEGIN SELECT RAISE(ABORT, 'corrections are append-only'); END;
CREATE TRIGGER IF NOT EXISTS correction_no_delete BEFORE DELETE ON event_correction BEGIN SELECT RAISE(ABORT, 'corrections are append-only'); END;
`;

export interface OcrDispute {
  id: string;
  sourceId: string;
  page: number;
  line: number;
  anchorId: string;
  readingA: string;
  engineA: string;
  readingB: string;
  engineB: string;
  tokensA: string[];
  tokensB: string[];
  reviewItemId: string;
  status: "open" | "decided";
  choice: "a" | "b" | "typed" | null;
  decidedText: string | null;
  decidedAt: string | null;
}

export function listDisputes(db: DatabaseSync, sourceId?: string): OcrDispute[] {
  const rows = (sourceId ? db.prepare("SELECT * FROM ocr_dispute WHERE source_id = ? ORDER BY page, line").all(sourceId) : db.prepare("SELECT * FROM ocr_dispute ORDER BY created_at, page, line").all()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    sourceId: String(r.source_id),
    page: Number(r.page),
    line: Number(r.line),
    anchorId: String(r.anchor_id),
    readingA: String(r.reading_a),
    engineA: String(r.engine_a),
    readingB: String(r.reading_b),
    engineB: String(r.engine_b),
    tokensA: JSON.parse(String(r.tokens_a)),
    tokensB: JSON.parse(String(r.tokens_b)),
    reviewItemId: String(r.review_item_id),
    status: r.status as OcrDispute["status"],
    choice: (r.choice ?? null) as OcrDispute["choice"],
    decidedText: r.decided_text == null ? null : String(r.decided_text),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
  }));
}

export function insertDispute(db: DatabaseSync, d: Omit<OcrDispute, "id" | "status" | "choice" | "decidedText" | "decidedAt">): string {
  const id = randomUUID();
  db.prepare("INSERT INTO ocr_dispute (id, source_id, page, line, anchor_id, reading_a, engine_a, reading_b, engine_b, tokens_a, tokens_b, review_item_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)")
    .run(id, d.sourceId, d.page, d.line, d.anchorId, d.readingA, d.engineA, d.readingB, d.engineB, JSON.stringify(d.tokensA), JSON.stringify(d.tokensB), d.reviewItemId, new Date().toISOString());
  return id;
}

export function decideDispute(db: DatabaseSync, id: string, choice: "a" | "b" | "typed", text: string): void {
  db.prepare("UPDATE ocr_dispute SET status = 'decided', choice = ?, decided_text = ?, decided_at = ? WHERE id = ?").run(choice, text, new Date().toISOString(), id);
}

export interface EventCorrection {
  id: string;
  eventId: string;
  dateText: string;
  dateStart: string;
  dateEnd: string;
  description: string;
  reason: string;
  at: string;
}

export function listCorrections(db: DatabaseSync, eventId?: string): EventCorrection[] {
  const rows = (eventId ? db.prepare("SELECT * FROM event_correction WHERE event_id = ? ORDER BY at, rowid").all(eventId) : db.prepare("SELECT * FROM event_correction ORDER BY at, rowid").all()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    dateText: String(r.date_text),
    dateStart: String(r.date_start),
    dateEnd: String(r.date_end),
    description: String(r.description),
    reason: String(r.reason),
    at: String(r.at),
  }));
}

export function addCorrection(db: DatabaseSync, c: Omit<EventCorrection, "id" | "at">): EventCorrection {
  const id = randomUUID();
  const at = new Date().toISOString();
  db.prepare("INSERT INTO event_correction VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, c.eventId, c.dateText, c.dateStart, c.dateEnd, c.description, c.reason, at);
  return { ...c, id, at };
}

export function dateAnchor(db: DatabaseSync, sourceId: string): { date: string; reviewItemId: string | null } | null {
  const r = db.prepare("SELECT date, review_item_id FROM date_anchor WHERE source_id = ?").get(sourceId) as { date: string; review_item_id: string | null } | undefined;
  return r ? { date: String(r.date), reviewItemId: r.review_item_id == null ? null : String(r.review_item_id) } : null;
}
