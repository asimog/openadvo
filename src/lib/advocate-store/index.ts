/**
 * Q4: advocate.db, the advocate store (decision 12; architecture.md section 3). It owns the
 * profile, the preferences and advocate memory. One writer: this class. Every write appends a
 * hash-chained event. Only the advocate approves a preference or confirms a memory record, and
 * a matter's facts never enter advocate scope (architecture.md section 6). Plain library.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CHAIN_SCHEMA, StoreError, appendChained, checkChain, humanOnly, inTransaction, type ChainCheck } from "../store-chain/index.ts";
import { ADVOCATE_SCOPE_TYPES, MEMORY_STATUSES, MEMORY_TYPES, type AdvocateProfile, type MemoryRecord, type MemoryStatus, type MemoryType, type PreferenceRecord } from "../../shared/stores.ts";
import type { WriteContext } from "../../shared/records.ts";

export const ADVOCATE_DB = "advocate.db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS preference (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  proposed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS memory (
  memory_id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (${MEMORY_TYPES.map((t) => `'${t}'`).join(", ")})),
  subject TEXT NOT NULL,
  relation TEXT NOT NULL,
  object TEXT NOT NULL,
  source_id TEXT,
  matter_id TEXT,
  recorded_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  confidence REAL,
  status TEXT NOT NULL CHECK (status IN (${MEMORY_STATUSES.map((t) => `'${t}'`).join(", ")})),
  scope TEXT NOT NULL CHECK (scope = 'advocate'),
  supersedes TEXT REFERENCES memory(memory_id),
  proposed_by TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS memory_no_delete BEFORE DELETE ON memory BEGIN SELECT RAISE(ABORT, 'memory records change status, never vanish'); END;
`;

function memoryRow(r: Record<string, unknown>): MemoryRecord {
  return {
    memoryId: String(r.memory_id),
    type: r.type as MemoryType,
    subject: String(r.subject),
    relation: String(r.relation),
    object: String(r.object),
    sourceId: r.source_id == null ? null : String(r.source_id),
    matterId: r.matter_id == null ? null : String(r.matter_id),
    recordedAt: String(r.recorded_at),
    validFrom: r.valid_from == null ? null : String(r.valid_from),
    validUntil: r.valid_until == null ? null : String(r.valid_until),
    confidence: r.confidence == null ? null : Number(r.confidence),
    status: r.status as MemoryStatus,
    scope: "advocate",
    supersedes: r.supersedes == null ? null : String(r.supersedes),
    proposedBy: String(r.proposed_by),
  };
}

function preferenceRow(r: Record<string, unknown>): PreferenceRecord {
  return {
    id: String(r.id),
    key: String(r.key),
    value: String(r.value),
    reason: String(r.reason),
    status: r.status as PreferenceRecord["status"],
    proposedBy: String(r.proposed_by),
    createdAt: String(r.created_at),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
  };
}

const PROFILE_KEYS = /^[a-z][a-z0-9_]{0,40}$/;

export class AdvocateStore {
  readonly file: string;
  private db: DatabaseSync;

  private constructor(file: string, db: DatabaseSync) {
    this.file = file;
    this.db = db;
  }

  /** Open advocate.db in `dir`, creating it and its schema when missing. */
  static open(dir: string): AdvocateStore {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, ADVOCATE_DB);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(CHAIN_SCHEMA);
    db.exec(SCHEMA);
    const store = new AdvocateStore(file, db);
    if (!db.prepare("SELECT 1 FROM event LIMIT 1").get()) appendChained(db, { actor: "system" }, "advocate_store.created", null, null);
    return store;
  }

  close(): void {
    this.db.close();
  }

  verifyChain(): ChainCheck {
    return checkChain(this.db);
  }

  // ---- profile ----

  profile(): AdvocateProfile {
    const rows = this.db.prepare("SELECT key, value FROM profile ORDER BY key").all() as Array<{ key: string; value: string }>;
    const fields = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { name: fields.name ?? null, role: fields.role ?? null, fields };
  }

  /** The advocate sets one profile field. An empty value removes it. */
  setProfileField(key: string, value: string, ctx: WriteContext): AdvocateProfile {
    humanOnly(ctx, "changes the profile");
    if (!PROFILE_KEYS.test(key)) throw new StoreError("BAD_KEY", `a profile key is lower case letters, digits and _: ${key}`);
    const clean = value.trim().slice(0, 500);
    inTransaction(this.db, () => {
      if (clean) this.db.prepare("INSERT INTO profile (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, clean, new Date().toISOString());
      else this.db.prepare("DELETE FROM profile WHERE key = ?").run(key);
      appendChained(this.db, ctx, "profile.set", key, { key, removed: !clean });
    });
    return this.profile();
  }

  // ---- preferences ----

  preferences(): PreferenceRecord[] {
    return (this.db.prepare("SELECT * FROM preference ORDER BY created_at").all() as Array<Record<string, unknown>>).map(preferenceRow);
  }

  /** The agent (or the application) proposes a preference; the advocate decides. */
  proposePreference(input: { key: string; value: string; reason: string }, ctx: WriteContext): PreferenceRecord {
    const key = input.key.trim();
    const value = input.value.trim();
    const reason = input.reason.trim();
    if (!key || !value || !reason) throw new StoreError("BAD_PREFERENCE", "a preference needs a key, a value and the reason it applies");
    const id = randomUUID();
    inTransaction(this.db, () => {
      this.db.prepare("INSERT INTO preference (id, key, value, reason, status, proposed_by, created_at, decided_at) VALUES (?, ?, ?, ?, 'proposed', ?, ?, NULL)").run(id, key, value, reason, ctx.actor, new Date().toISOString());
      appendChained(this.db, ctx, "preference.proposed", id, { key });
    });
    return this.preferences().find((p) => p.id === id)!;
  }

  /** Human-only: approve or reject. An approved preference supersedes the approved one of the same key. */
  decidePreference(id: string, decision: "approved" | "rejected", ctx: WriteContext): PreferenceRecord {
    humanOnly(ctx, "decides a preference");
    const row = this.db.prepare("SELECT * FROM preference WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new StoreError("NOT_FOUND", `no preference ${id}`);
    if (row.status !== "proposed") throw new StoreError("DECIDED", `the preference is already ${String(row.status)}`);
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      if (decision === "approved") this.db.prepare("UPDATE preference SET status = 'superseded' WHERE key = ? AND status = 'approved'").run(String(row.key));
      this.db.prepare("UPDATE preference SET status = ?, decided_at = ? WHERE id = ?").run(decision, at, id);
      appendChained(this.db, ctx, "preference.decided", id, { decision });
    });
    return this.preferences().find((p) => p.id === id)!;
  }

  // ---- advocate memory ----

  memory(status?: MemoryStatus): MemoryRecord[] {
    const rows = status
      ? this.db.prepare("SELECT * FROM memory WHERE status = ? ORDER BY recorded_at").all(status)
      : this.db.prepare("SELECT * FROM memory ORDER BY recorded_at").all();
    return (rows as Array<Record<string, unknown>>).map(memoryRow);
  }

  /** A proposal of an advocate-scope record. A matter's facts are refused: they never cross matters. */
  proposeMemory(input: { type: MemoryType; subject: string; relation: string; object: string; sourceId?: string | null; validFrom?: string | null; validUntil?: string | null; confidence?: number | null; supersedes?: string | null }, ctx: WriteContext): MemoryRecord {
    if (!(MEMORY_TYPES as readonly string[]).includes(input.type)) throw new StoreError("BAD_TYPE", `unknown memory type ${input.type}`);
    if (!ADVOCATE_SCOPE_TYPES.includes(input.type)) throw new StoreError("CROSS_MATTER_FACT", `a ${input.type.replace(/_/g, " ")} belongs to its matter, not to advocate memory`);
    const subject = input.subject.trim();
    const object = input.object.trim();
    if (!subject || !object) throw new StoreError("BAD_MEMORY", "a memory record needs a subject and an object");
    if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) throw new StoreError("BAD_MEMORY", "confidence is from 0 to 1");
    if (input.supersedes && !this.db.prepare("SELECT 1 FROM memory WHERE memory_id = ?").get(input.supersedes)) throw new StoreError("NOT_FOUND", `no memory record ${input.supersedes}`);
    const id = randomUUID();
    inTransaction(this.db, () => {
      this.db
        .prepare("INSERT INTO memory (memory_id, type, subject, relation, object, source_id, matter_id, recorded_at, valid_from, valid_until, confidence, status, scope, supersedes, proposed_by) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'proposed', 'advocate', ?, ?)")
        .run(id, input.type, subject, input.relation.trim() || "is", object, input.sourceId ?? null, new Date().toISOString(), input.validFrom ?? null, input.validUntil ?? null, input.confidence ?? null, input.supersedes ?? null, ctx.actor);
      appendChained(this.db, ctx, "memory.proposed", id, { type: input.type, supersedes: input.supersedes ?? null });
    });
    return this.memory().find((m) => m.memoryId === id)!;
  }

  /**
   * Human-only: confirm, reject, archive or mark tentative. Confirming a record that supersedes
   * another marks the older one superseded; the older record stays, so corrections keep their history.
   */
  decideMemory(id: string, status: "confirmed" | "rejected" | "tentative" | "archived" | "deprecated", ctx: WriteContext): MemoryRecord {
    humanOnly(ctx, "decides a memory record");
    const row = this.db.prepare("SELECT * FROM memory WHERE memory_id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new StoreError("NOT_FOUND", `no memory record ${id}`);
    inTransaction(this.db, () => {
      this.db.prepare("UPDATE memory SET status = ? WHERE memory_id = ?").run(status, id);
      if (status === "confirmed" && row.supersedes) this.db.prepare("UPDATE memory SET status = 'superseded' WHERE memory_id = ?").run(String(row.supersedes));
      appendChained(this.db, ctx, "memory.decided", id, { status });
    });
    return this.memory().find((m) => m.memoryId === id)!;
  }
}
