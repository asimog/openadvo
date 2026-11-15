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
import { ADVOCATE_SCOPE_TYPES, LIBRARY_KINDS, LIBRARY_STATUSES, MEMORY_STATUSES, MEMORY_TYPES, type AdvocateProfile, type LibraryItem, type LibraryKind, type LibraryStatus, type MemoryRecord, type MemoryStatus, type MemoryType, type PreferenceRecord } from "../../shared/stores.ts";
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
CREATE TABLE IF NOT EXISTS library_item (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${LIBRARY_KINDS.map((k) => `'${k}'`).join(", ")})),
  status TEXT NOT NULL CHECK (status IN (${LIBRARY_STATUSES.map((s) => `'${s}'`).join(", ")})),
  author TEXT NOT NULL DEFAULT '',
  item_date TEXT NOT NULL DEFAULT '',
  matter_id TEXT,
  court TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS library_item_sha ON library_item(sha256);
CREATE TRIGGER IF NOT EXISTS library_item_no_delete BEFORE DELETE ON library_item BEGIN SELECT RAISE(ABORT, 'library items are marked, never deleted'); END;
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

function libraryRow(r: Record<string, unknown>): LibraryItem {
  return {
    id: String(r.id),
    title: String(r.title),
    kind: r.kind as LibraryKind,
    status: r.status as LibraryStatus,
    author: String(r.author),
    itemDate: String(r.item_date),
    matterId: r.matter_id == null ? null : String(r.matter_id),
    court: String(r.court),
    scope: String(r.scope),
    sourceName: String(r.source_name),
    sha256: String(r.sha256),
    size: Number(r.size),
    notes: String(r.notes),
    tags: JSON.parse(String(r.tags ?? "[]")) as string[],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
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

  // ---- M1: the Knowledge Library ----

  library(filter: { q?: string; kind?: string; status?: string; limit?: number } = {}): LibraryItem[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.kind) {
      where.push("kind = ?");
      args.push(filter.kind);
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    const q = filter.q?.trim().toLowerCase();
    if (q) {
      where.push("(lower(title) LIKE ? OR lower(source_name) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ? OR lower(court) LIKE ? OR lower(scope) LIKE ?)");
      for (let i = 0; i < 6; i++) args.push(`%${q}%`);
    }
    const limit = Math.min(Math.max(Number(filter.limit) || 500, 1), 2000);
    const sql = `SELECT * FROM library_item${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ${limit}`;
    return (this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(libraryRow);
  }

  libraryBySha(sha256: string): LibraryItem | undefined {
    const row = this.db.prepare("SELECT * FROM library_item WHERE sha256 = ?").get(sha256) as Record<string, unknown> | undefined;
    return row ? libraryRow(row) : undefined;
  }

  /** Human-only: one imported file enters the library. The file itself is written by the main process. */
  addLibraryItem(input: { title: string; kind: string; status?: string; author?: string; itemDate?: string; matterId?: string | null; court?: string; scope?: string; sourceName: string; sha256: string; size: number; notes?: string; tags?: string[] }, ctx: WriteContext): LibraryItem {
    humanOnly(ctx, "adds a library item");
    if (!(LIBRARY_KINDS as readonly string[]).includes(input.kind)) throw new StoreError("BAD_KIND", `unknown library kind ${input.kind}`);
    const status = input.status ?? "unreviewed";
    if (!(LIBRARY_STATUSES as readonly string[]).includes(status)) throw new StoreError("BAD_STATUS", `unknown library status ${status}`);
    const title = input.title.trim().slice(0, 300);
    const sourceName = input.sourceName.trim().slice(0, 300);
    if (!title || !sourceName) throw new StoreError("BAD_ITEM", "a library item needs a title and a source name");
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new StoreError("BAD_SHA", "a library item needs the file's SHA-256");
    if (!Number.isFinite(input.size) || input.size < 0) throw new StoreError("BAD_SIZE", "the file size is not valid");
    const existing = this.libraryBySha(input.sha256);
    if (existing) throw new StoreError("DUPLICATE", `the same bytes are already in the library as ${existing.title}`);
    const id = randomUUID();
    const at = new Date().toISOString();
    const tags = (input.tags ?? []).map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, 30);
    inTransaction(this.db, () => {
      this.db
        .prepare("INSERT INTO library_item (id, title, kind, status, author, item_date, matter_id, court, scope, source_name, sha256, size, notes, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, title, input.kind, status, (input.author ?? "").trim().slice(0, 200), /^\d{4}-\d{2}-\d{2}$/.test(input.itemDate ?? "") ? input.itemDate! : "", input.matterId ?? null, (input.court ?? "").trim().slice(0, 300), (input.scope ?? "").trim().slice(0, 500), sourceName, input.sha256, Math.round(input.size), (input.notes ?? "").trim().slice(0, 5000), JSON.stringify(tags), at, at);
      appendChained(this.db, ctx, "library.added", id, { title, kind: input.kind, sha256: input.sha256, scope: input.scope ?? "" });
    });
    return this.library().find((x) => x.id === id)!;
  }

  /** Human-only: correct the metadata or the precedent status. The file bytes never change. */
  updateLibraryItem(id: string, input: { title?: string; kind?: string; status?: string; author?: string; itemDate?: string; matterId?: string | null; court?: string; scope?: string; notes?: string; tags?: string[] }, ctx: WriteContext): LibraryItem {
    humanOnly(ctx, "corrects a library item");
    const row = this.db.prepare("SELECT * FROM library_item WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new StoreError("NOT_FOUND", `no library item ${id}`);
    const current = libraryRow(row);
    const kind = input.kind ?? current.kind;
    if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) throw new StoreError("BAD_KIND", `unknown library kind ${kind}`);
    const status = input.status ?? current.status;
    if (!(LIBRARY_STATUSES as readonly string[]).includes(status)) throw new StoreError("BAD_STATUS", `unknown library status ${status}`);
    const tags = (input.tags ?? current.tags).map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, 30);
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      this.db
        .prepare("UPDATE library_item SET title = ?, kind = ?, status = ?, author = ?, item_date = ?, matter_id = ?, court = ?, scope = ?, notes = ?, tags = ?, updated_at = ? WHERE id = ?")
        .run(
          (input.title ?? current.title).trim().slice(0, 300) || current.title,
          kind,
          status,
          (input.author ?? current.author).trim().slice(0, 200),
          /^\d{4}-\d{2}-\d{2}$/.test(input.itemDate ?? current.itemDate) ? (input.itemDate ?? current.itemDate) : current.itemDate,
          input.matterId !== undefined ? input.matterId : current.matterId,
          (input.court ?? current.court).trim().slice(0, 300),
          (input.scope ?? current.scope).trim().slice(0, 500),
          (input.notes ?? current.notes).trim().slice(0, 5000),
          JSON.stringify(tags),
          at,
          id,
        );
      appendChained(this.db, ctx, "library.updated", id, { status, kind });
    });
    return this.library().find((x) => x.id === id)!;
  }

  setLibraryStatus(id: string, status: string, ctx: WriteContext): LibraryItem {
    humanOnly(ctx, "changes a library item's status");
    if (!(LIBRARY_STATUSES as readonly string[]).includes(status)) throw new StoreError("BAD_STATUS", `unknown library status ${status}`);
    return this.updateLibraryItem(id, { status }, ctx);
  }
}
