/**
 * Q4: the hash-chained event record of a canonical store (decision 12). The same chain as
 * matter.db (src/lib/matter-store/audit.ts): each event carries the hash of the one before it
 * and of its own content, and the table is append-only. Plain library (decision 6).
 */
import type { DatabaseSync } from "node:sqlite";
import { eventHash, verifyChain, type ChainCheck } from "../matter-store/audit.ts";
import type { WriteContext } from "../../shared/records.ts";

export type { ChainCheck };

export const CHAIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS event (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('advocate', 'agent', 'system')),
  action TEXT NOT NULL,
  subject TEXT,
  session_id TEXT,
  data TEXT,
  prev_hash TEXT,
  hash TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON event BEGIN SELECT RAISE(ABORT, 'event table is append-only'); END;
CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON event BEGIN SELECT RAISE(ABORT, 'event table is append-only'); END;
`;

/** A refused write of a store, with a stable upper-case code. */
export class StoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** Append one chained event. Call it inside the write it records. */
export function appendChained(db: DatabaseSync, ctx: WriteContext, action: string, subject: string | null, data: Record<string, unknown> | null): void {
  const last = db.prepare("SELECT seq, hash FROM event ORDER BY seq DESC LIMIT 1").get() as { seq: number; hash: string } | undefined;
  const row = { seq: Number(last?.seq ?? 0) + 1, at: new Date().toISOString(), actor: ctx.actor, action, subject, session_id: ctx.sessionId ?? null, data: data ? JSON.stringify(data) : null, prev_hash: last?.hash ?? null };
  db.prepare("INSERT INTO event (seq, at, actor, action, subject, session_id, data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    row.seq,
    row.at,
    row.actor,
    row.action,
    row.subject,
    row.session_id,
    row.data,
    row.prev_hash,
    eventHash(row),
  );
}

export function checkChain(db: DatabaseSync): ChainCheck {
  return verifyChain(db);
}

/** Run `fn` in one transaction: the write and its event land together or not at all. */
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function humanOnly(ctx: WriteContext, what: string): void {
  if (ctx.actor !== "advocate") throw new StoreError("HUMAN_ONLY", `only the advocate ${what}`);
}
