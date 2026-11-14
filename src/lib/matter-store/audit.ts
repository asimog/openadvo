/**
 * V5-1, V5-2, V5-3, V5-4: the event chain, refused writes, the Inspector's lookups and the Find
 * index. Part of the matter store (decision 4). Plain library. Spec: docs/specs/v5.md.
 */
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ChainCheck, FindHit, FindRow, Inspection, Refusal } from "../../shared/audit.ts";
export type { ChainCheck, FindHit, FindRow, Inspection, Refusal };

export const AUDIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS refusal (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  code TEXT NOT NULL,
  reason TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS refusal_no_update BEFORE UPDATE ON refusal BEGIN SELECT RAISE(ABORT, 'refusals are append-only'); END;
CREATE TRIGGER IF NOT EXISTS refusal_no_delete BEFORE DELETE ON refusal BEGIN SELECT RAISE(ABORT, 'refusals are append-only'); END;
CREATE VIRTUAL TABLE IF NOT EXISTS find_fts USING fts5(kind UNINDEXED, ref UNINDEXED, label UNINDEXED, text, tokenize = 'unicode61');
CREATE TABLE IF NOT EXISTS find_state (id INTEGER PRIMARY KEY CHECK (id = 1), event_seq INTEGER NOT NULL, built_at TEXT NOT NULL) STRICT;
`;

/** JSON with sorted keys, so a hash does not depend on key order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}

export interface ChainRow {
  seq: number;
  at: string;
  actor: string;
  action: string;
  subject: string | null;
  session_id: string | null;
  data: string | null;
  prev_hash: string | null;
}

/** The hash of one event: its fields and the hash before it. */
export function eventHash(r: ChainRow): string {
  return createHash("sha256")
    .update(canonical({ seq: r.seq, at: r.at, actor: r.actor, action: r.action, subject: r.subject, session: r.session_id, data: r.data, prev: r.prev_hash }))
    .digest("hex");
}


export function verifyChain(db: DatabaseSync): ChainCheck {
  const rows = db.prepare("SELECT seq, at, actor, action, subject, session_id, data, prev_hash, hash FROM event ORDER BY seq").all() as unknown as Array<ChainRow & { hash: string | null }>;
  let unchained = 0;
  let prev: string | null = null;
  let started = false;
  for (const r of rows) {
    if (r.hash == null) {
      if (started) return { ok: false, events: rows.length, unchained, head: prev, firstBreak: { seq: Number(r.seq), problem: "an event without a hash after the chain began" } };
      unchained++;
      continue;
    }
    if (started && r.prev_hash !== prev) return { ok: false, events: rows.length, unchained, head: prev, firstBreak: { seq: Number(r.seq), problem: "its link to the event before does not match (an event was removed, added or reordered)" } };
    started = true;
    const h = eventHash({ ...r, seq: Number(r.seq) });
    if (h !== r.hash) return { ok: false, events: rows.length, unchained, head: prev, firstBreak: { seq: Number(r.seq), problem: "its content does not match its hash (the event was changed)" } };
    prev = r.hash;
  }
  return { ok: true, events: rows.length, unchained, head: prev, firstBreak: null };
}


export function addRefusal(db: DatabaseSync, r: Omit<Refusal, "id" | "at">): void {
  db.prepare("INSERT INTO refusal VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), new Date().toISOString(), r.actor, r.action.slice(0, 120), r.code.slice(0, 80), r.reason.slice(0, 1000));
}

export function listRefusals(db: DatabaseSync, limit = 200): Refusal[] {
  return (db.prepare("SELECT * FROM refusal ORDER BY at DESC, rowid DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    at: String(r.at),
    actor: String(r.actor),
    action: String(r.action),
    code: String(r.code),
    reason: String(r.reason),
  }));
}

// ---- V5-3: the Inspector ----

/** The tables a record can live in, with the kind name the Inspector shows. */
export const RECORD_TABLES: Array<{ kind: string; table: string; id: string }> = [
  { kind: "source", table: "source", id: "id" },
  { kind: "event", table: "notebook_event", id: "id" },
  { kind: "draft", table: "draft", id: "id" },
  { kind: "revision", table: "revision", id: "id" },
  { kind: "review item", table: "review_item", id: "id" },
  { kind: "issue", table: "legal_issue", id: "id" },
  { kind: "authority", table: "authority", id: "id" },
  { kind: "memorandum", table: "memorandum", id: "id" },
  { kind: "provision", table: "provision", id: "id" },
  { kind: "argument", table: "argument", id: "id" },
  { kind: "argument run", table: "argument_run", id: "id" },
  { kind: "anchor", table: "anchor", id: "id" },
  { kind: "date conflict", table: "date_conflict", id: "id" },
  { kind: "filing set", table: "filing_set", id: "id" },
];

function tableExists(db: DatabaseSync, t: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(t);
}


/** Ids a record names: uuids, Notebook event ids and anchor ids. */
export function idsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) out.add(m[0]);
  for (const m of text.matchAll(/\bev:[0-9a-f]{64}:\d+:\d+:(?:r?\d+)\b/g)) out.add(m[0]);
  for (const m of text.matchAll(/\b[0-9a-f]{64}:\d+:\d+\b/g)) out.add(m[0]);
  return [...out];
}

export function inspect(db: DatabaseSync, id: string): Inspection | null {
  let found: { kind: string; record: Record<string, unknown> } | null = null;
  for (const t of RECORD_TABLES) {
    if (!tableExists(db, t.table)) continue;
    const r = db.prepare(`SELECT * FROM ${t.table} WHERE ${t.id} = ?`).get(id) as Record<string, unknown> | undefined;
    if (r) {
      found = { kind: t.kind, record: r };
      break;
    }
  }
  if (!found) return null;
  const events = (db.prepare("SELECT seq, at, actor, action, data FROM event WHERE subject = ? OR instr(coalesce(data, ''), ?) > 0 ORDER BY seq").all(id, id) as Array<Record<string, unknown>>).map((e) => ({
    seq: Number(e.seq),
    at: String(e.at),
    actor: String(e.actor),
    action: String(e.action),
    data: e.data == null ? null : JSON.parse(String(e.data)),
  }));
  const own = JSON.stringify(found.record);
  const kindOf = (x: string): string | null => {
    for (const t of RECORD_TABLES) {
      if (tableExists(db, t.table) && db.prepare(`SELECT 1 FROM ${t.table} WHERE ${t.id} = ?`).get(x)) return t.kind;
    }
    return null;
  };
  const linksOut = idsIn(own)
    .filter((x) => x !== id)
    .map((x) => ({ kind: kindOf(x), id: x }))
    .filter((l): l is { kind: string; id: string } => l.kind !== null);
  const linksIn: Inspection["linksIn"] = [];
  for (const t of RECORD_TABLES) {
    if (!tableExists(db, t.table)) continue;
    const cols = (db.prepare(`PRAGMA table_info(${t.table})`).all() as Array<{ name: string; type: string }>).filter((c) => c.name !== t.id && /TEXT/i.test(c.type));
    for (const c of cols) {
      const rows = db.prepare(`SELECT ${t.id} AS rid FROM ${t.table} WHERE instr(coalesce(${c.name}, ''), ?) > 0 LIMIT 50`).all(id) as Array<{ rid: string }>;
      for (const r of rows) if (r.rid !== id && !linksIn.some((l) => l.id === r.rid)) linksIn.push({ kind: t.kind, id: String(r.rid), field: c.name });
    }
  }
  return { kind: found.kind, id, record: found.record, events, linksOut, linksIn };
}

// ---- V5-4: Find ----



export function findQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"*`)
    .join(" ");
}

export function findIndexSeq(db: DatabaseSync): number | null {
  const r = db.prepare("SELECT event_seq FROM find_state WHERE id = 1").get() as { event_seq: number } | undefined;
  return r ? Number(r.event_seq) : null;
}

/** Replace the derived index. It can always be dropped and rebuilt to an equal result. */
export function replaceFindIndex(db: DatabaseSync, rows: FindRow[], eventSeq: number): void {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM find_fts");
    const ins = db.prepare("INSERT INTO find_fts (kind, ref, label, text) VALUES (?, ?, ?, ?)");
    for (const r of rows) if (r.text.trim()) ins.run(r.kind, r.ref, r.label, r.text);
    db.prepare("INSERT OR REPLACE INTO find_state VALUES (1, ?, ?)").run(eventSeq, new Date().toISOString());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function find(db: DatabaseSync, q: string, limit = 40): FindHit[] {
  const fq = findQuery(q);
  if (!fq) return [];
  return (db.prepare("SELECT kind, ref, label, text, snippet(find_fts, 3, '[', ']', '…', 14) AS snip FROM find_fts WHERE find_fts MATCH ? ORDER BY bm25(find_fts) LIMIT ?").all(fq, limit) as Array<Record<string, unknown>>).map((r) => ({
    kind: String(r.kind),
    ref: String(r.ref),
    label: String(r.label),
    text: String(r.text),
    snippet: String(r.snip),
  }));
}
