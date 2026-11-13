/**
 * The matter store: the single writer of matter facts (decision 4).
 *
 * A matter is a folder: `matter.db` (SQLite) and `blobs/<sha256>`.
 * Plain library: no Electron import and no Pi import (decision 6).
 * Spec: docs/specs/v0-app-and-matter-store.md.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext } from "../../shared/records.ts";

export type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext };

export class MatterStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

const SCHEMA_VERSION = 1;
const DB_FILE = "matter.db";
const BLOBS = "blobs";
const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS matter (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS source (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  added_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'missing', 'changed')),
  checked_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS origin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES source(id),
  original_name TEXT NOT NULL,
  original_path TEXT NOT NULL,
  added_at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('advocate', 'agent', 'system'))
) STRICT;
CREATE TABLE IF NOT EXISTS event (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('advocate', 'agent', 'system')),
  action TEXT NOT NULL,
  subject TEXT,
  session_id TEXT,
  data TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON event
  BEGIN SELECT RAISE(ABORT, 'event table is append-only'); END;
CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON event
  BEGIN SELECT RAISE(ABORT, 'event table is append-only'); END;
CREATE TRIGGER IF NOT EXISTS origin_no_update BEFORE UPDATE ON origin
  BEGIN SELECT RAISE(ABORT, 'origin table is append-only'); END;
CREATE TRIGGER IF NOT EXISTS origin_no_delete BEFORE DELETE ON origin
  BEGIN SELECT RAISE(ABORT, 'origin table is append-only'); END;
CREATE TRIGGER IF NOT EXISTS source_no_delete BEFORE DELETE ON source
  BEGIN SELECT RAISE(ABORT, 'sources are marked, never deleted'); END;
CREATE TRIGGER IF NOT EXISTS matter_no_delete BEFORE DELETE ON matter
  BEGIN SELECT RAISE(ABORT, 'matters are never deleted'); END;
`;

function now(): string {
  return new Date().toISOString();
}

export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

function isPdf(bytes: Buffer): boolean {
  return bytes.length >= PDF_MAGIC.length && bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Matter folders under a root. A folder without `matter.db` is not a matter. */
export async function listMatters(root: string): Promise<MatterSummary[]> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const out: MatterSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, entry.name);
    if (!(await exists(path.join(folder, DB_FILE)))) continue;
    const db = new DatabaseSync(path.join(folder, DB_FILE), { readOnly: true });
    try {
      const row = db.prepare("SELECT id, title, created_at FROM matter LIMIT 1").get() as
        | { id: string; title: string; created_at: string }
        | undefined;
      if (row) out.push({ id: row.id, title: row.title, createdAt: row.created_at, folder });
    } finally {
      db.close();
    }
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

export class MatterStore {
  readonly folder: string;
  private db: DatabaseSync;

  private constructor(folder: string, db: DatabaseSync) {
    this.folder = folder;
    this.db = db;
  }

  /** Create a new matter folder under `root`. */
  static async create(root: string, title: string, ctx: WriteContext): Promise<MatterStore> {
    const clean = title.trim();
    if (!clean) throw new MatterStoreError("MATTER_TITLE_REQUIRED", "a matter needs a title");
    const id = randomUUID();
    const folder = path.join(root, id);
    await mkdir(path.join(folder, BLOBS), { recursive: true });
    const store = new MatterStore(folder, MatterStore.openDb(folder));
    store.db.prepare("INSERT INTO matter (id, title, created_at, schema_version) VALUES (?, ?, ?, ?)").run(
      id,
      clean,
      now(),
      SCHEMA_VERSION,
    );
    store.appendEvent(ctx, "matter.created", id, { title: clean });
    return store;
  }

  /** Open an existing matter folder. */
  static async open(folder: string): Promise<MatterStore> {
    if (!(await exists(path.join(folder, DB_FILE)))) {
      throw new MatterStoreError("MATTER_NOT_FOUND", `no ${DB_FILE} in ${folder}`);
    }
    await mkdir(path.join(folder, BLOBS), { recursive: true });
    return new MatterStore(folder, MatterStore.openDb(folder));
  }

  private static openDb(folder: string): DatabaseSync {
    const db = new DatabaseSync(path.join(folder, DB_FILE));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    return db;
  }

  close(): void {
    this.db.close();
  }

  matter(): MatterSummary {
    const row = this.db.prepare("SELECT id, title, created_at FROM matter LIMIT 1").get() as {
      id: string;
      title: string;
      created_at: string;
    };
    return { id: row.id, title: row.title, createdAt: row.created_at, folder: this.folder };
  }

  blobPath(sha256: string): string {
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new MatterStoreError("BAD_HASH", sha256);
    return path.join(this.folder, BLOBS, sha256);
  }

  /** Add one file. The same bytes are stored once; a second add records an origin. */
  async addFile(file: string, ctx: WriteContext): Promise<AddFileResult> {
    const resolved = path.resolve(file);
    let bytes: Buffer;
    try {
      const info = await stat(resolved);
      if (!info.isFile()) return { path: file, outcome: "refused", reason: "not a file" };
      bytes = await readFile(resolved);
    } catch (e) {
      return { path: file, outcome: "refused", reason: `cannot read: ${(e as Error).message}` };
    }
    if (!isPdf(bytes)) {
      this.appendEvent(ctx, "source.refused", null, { name: path.basename(resolved), reason: "not a PDF" });
      return { path: file, outcome: "refused", reason: "not a PDF (the file does not start with %PDF-)" };
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const name = path.basename(resolved);
    const existing = this.db.prepare("SELECT id FROM source WHERE sha256 = ?").get(sha256) as
      | { id: string }
      | undefined;
    if (existing) {
      this.addOrigin(existing.id, name, resolved, ctx);
      this.appendEvent(ctx, "source.origin_added", existing.id, { name, sha256 });
      return { path: file, outcome: "duplicate", source: this.getSource(existing.id) };
    }
    const blob = this.blobPath(sha256);
    if (!(await exists(blob))) {
      const tmp = `${blob}.${randomUUID()}.tmp`;
      await writeFile(tmp, bytes, { flag: "wx" });
      await rename(tmp, blob);
    }
    const id = randomUUID();
    const at = now();
    this.db
      .prepare(
        "INSERT INTO source (id, sha256, name, size, media_type, added_at, status, checked_at) VALUES (?, ?, ?, ?, ?, ?, 'ok', ?)",
      )
      .run(id, sha256, name, bytes.length, "application/pdf", at, at);
    this.addOrigin(id, name, resolved, ctx);
    this.appendEvent(ctx, "source.added", id, { name, sha256, size: bytes.length });
    return { path: file, outcome: "added", source: this.getSource(id) };
  }

  private addOrigin(sourceId: string, name: string, originalPath: string, ctx: WriteContext): void {
    this.db
      .prepare("INSERT INTO origin (source_id, original_name, original_path, added_at, actor) VALUES (?, ?, ?, ?, ?)")
      .run(sourceId, name, originalPath, now(), ctx.actor);
  }

  getSource(id: string): SourceRecord | undefined {
    return this.listSources().find((s) => s.id === id);
  }

  listSources(): SourceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.sha256, s.name, s.size, s.media_type, s.added_at, s.status, s.checked_at,
                (SELECT COUNT(*) FROM origin o WHERE o.source_id = s.id) AS origins
         FROM source s ORDER BY s.added_at, s.name`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      sha256: String(r.sha256),
      name: String(r.name),
      size: Number(r.size),
      mediaType: String(r.media_type),
      addedAt: String(r.added_at),
      status: r.status as SourceStatus,
      checkedAt: r.checked_at == null ? null : String(r.checked_at),
      origins: Number(r.origins),
    }));
  }

  listOrigins(sourceId: string): OriginRecord[] {
    const rows = this.db
      .prepare("SELECT id, source_id, original_name, original_path, added_at, actor FROM origin WHERE source_id = ? ORDER BY id")
      .all(sourceId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      sourceId: String(r.source_id),
      originalName: String(r.original_name),
      originalPath: String(r.original_path),
      addedAt: String(r.added_at),
      actor: r.actor as Actor,
    }));
  }

  /**
   * Hash every blob again. A missing blob is marked `missing`, other bytes are marked `changed`.
   * A status change writes one event. Nothing is hidden and nothing is deleted.
   */
  async checkIntegrity(ctx: WriteContext = { actor: "system" }): Promise<SourceRecord[]> {
    for (const source of this.listSources()) {
      const blob = this.blobPath(source.sha256);
      let status: SourceStatus = "ok";
      let actual: string | null = null;
      if (!(await exists(blob))) status = "missing";
      else {
        actual = await sha256OfFile(blob);
        if (actual !== source.sha256) status = "changed";
      }
      this.db.prepare("UPDATE source SET status = ?, checked_at = ? WHERE id = ?").run(status, now(), source.id);
      if (status !== source.status) {
        const action = status === "ok" ? "source.restored" : `source.${status}`;
        this.appendEvent(ctx, action, source.id, { name: source.name, expected: source.sha256, actual });
      }
    }
    return this.listSources();
  }

  appendEvent(ctx: WriteContext, action: string, subject: string | null, data: Record<string, unknown> | null): void {
    this.db
      .prepare("INSERT INTO event (at, actor, action, subject, session_id, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(now(), ctx.actor, action, subject, ctx.sessionId ?? null, data ? JSON.stringify(data) : null);
  }

  listEvents(limit = 500): EventRecord[] {
    const rows = this.db
      .prepare("SELECT seq, at, actor, action, subject, session_id, data FROM event ORDER BY seq DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      seq: Number(r.seq),
      at: String(r.at),
      actor: r.actor as Actor,
      action: String(r.action),
      subject: r.subject == null ? null : String(r.subject),
      sessionId: r.session_id == null ? null : String(r.session_id),
      data: r.data == null ? null : (JSON.parse(String(r.data)) as Record<string, unknown>),
    }));
  }
}
