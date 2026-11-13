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

import type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext, IngestJob, AnchorRecord, PageRecord, PageInput, ReviewItem, ReviewStatus, TextKind, JobState } from "../../shared/records.ts";

export type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext, IngestJob, AnchorRecord, PageRecord, PageInput, ReviewItem, ReviewStatus, TextKind, JobState };

/** An anchor id: the source's SHA-256, the page and the line. It survives a rename. */
export function anchorId(sha256: string, page: number, line: number): string {
  return `${sha256}:${page}:${line}`;
}

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
CREATE TABLE IF NOT EXISTS ingest_job (
  source_id TEXT PRIMARY KEY REFERENCES source(id),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'done', 'failed')),
  pages INTEGER,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS page (
  source_id TEXT NOT NULL REFERENCES source(id),
  page INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('born_digital', 'ocr', 'none')),
  width REAL NOT NULL,
  height REAL NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (source_id, page)
) STRICT;
CREATE TABLE IF NOT EXISTS anchor (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source(id),
  sha256 TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  text TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS anchor_by_page ON anchor (source_id, page, line);
CREATE TABLE IF NOT EXISTS ocr_reading (
  source_id TEXT NOT NULL REFERENCES source(id),
  page INTEGER NOT NULL,
  engine TEXT NOT NULL,
  version TEXT NOT NULL,
  confidence REAL NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (source_id, page, engine)
) STRICT;
CREATE TABLE IF NOT EXISTS review_item (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source_id TEXT,
  page INTEGER,
  detail TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'skipped')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS page_no_update BEFORE UPDATE ON page BEGIN SELECT RAISE(ABORT, 'pages are written once'); END;
CREATE TRIGGER IF NOT EXISTS page_no_delete BEFORE DELETE ON page BEGIN SELECT RAISE(ABORT, 'pages are written once'); END;
CREATE TRIGGER IF NOT EXISTS anchor_no_update BEFORE UPDATE ON anchor BEGIN SELECT RAISE(ABORT, 'anchors are written once'); END;
CREATE TRIGGER IF NOT EXISTS anchor_no_delete BEFORE DELETE ON anchor BEGIN SELECT RAISE(ABORT, 'anchors are written once'); END;
CREATE TRIGGER IF NOT EXISTS ocr_no_update BEFORE UPDATE ON ocr_reading BEGIN SELECT RAISE(ABORT, 'OCR readings are written once'); END;
CREATE TRIGGER IF NOT EXISTS ocr_no_delete BEFORE DELETE ON ocr_reading BEGIN SELECT RAISE(ABORT, 'OCR readings are written once'); END;
CREATE TRIGGER IF NOT EXISTS review_no_delete BEFORE DELETE ON review_item BEGIN SELECT RAISE(ABORT, 'review items are marked, never deleted'); END;
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

  // ---- Document intelligence records (step 2). Computed elsewhere, written only here. ----

  listJobs(): IngestJob[] {
    const rows = this.db.prepare("SELECT source_id, state, pages, started_at, finished_at, error FROM ingest_job").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      sourceId: String(r.source_id),
      state: r.state as JobState,
      pages: r.pages == null ? null : Number(r.pages),
      startedAt: r.started_at == null ? null : String(r.started_at),
      finishedAt: r.finished_at == null ? null : String(r.finished_at),
      error: r.error == null ? null : String(r.error),
    }));
  }

  /** Sources that need a job: no job yet, or a job left running by a previous run. */
  sourcesToIngest(): SourceRecord[] {
    const jobs = new Map(this.listJobs().map((j) => [j.sourceId, j]));
    return this.listSources().filter((s) => {
      const j = jobs.get(s.id);
      return s.status === "ok" && (!j || j.state === "queued" || j.state === "running");
    });
  }

  startJob(sourceId: string): void {
    const source = this.getSource(sourceId);
    if (!source) throw new MatterStoreError("SOURCE_NOT_FOUND", sourceId);
    const exists = this.db.prepare("SELECT 1 FROM page WHERE source_id = ? LIMIT 1").get(sourceId);
    if (exists) throw new MatterStoreError("ALREADY_INGESTED", `${source.name} already has page records`);
    this.db
      .prepare("INSERT INTO ingest_job (source_id, state, started_at) VALUES (?, 'running', ?) ON CONFLICT(source_id) DO UPDATE SET state = 'running', started_at = excluded.started_at, error = NULL, finished_at = NULL")
      .run(sourceId, now());
    this.appendEvent({ actor: "system" }, "ingest.started", sourceId, { name: source.name });
  }

  /** Write one page, its line anchors, its OCR reading, and a review item when it has no text. */
  recordPage(sourceId: string, page: PageInput): void {
    const source = this.getSource(sourceId);
    if (!source) throw new MatterStoreError("SOURCE_NOT_FOUND", sourceId);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT INTO page (source_id, page, kind, width, height, text) VALUES (?, ?, ?, ?, ?, ?)")
        .run(sourceId, page.page, page.kind, page.width, page.height, page.text);
      const insert = this.db.prepare("INSERT INTO anchor (id, source_id, sha256, page, line, x, y, w, h, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const l of page.lines) insert.run(anchorId(source.sha256, page.page, l.line), sourceId, source.sha256, page.page, l.line, l.x, l.y, l.w, l.h, l.text);
      if (page.ocr) {
        this.db
          .prepare("INSERT INTO ocr_reading (source_id, page, engine, version, confidence, text) VALUES (?, ?, ?, ?, ?, ?)")
          .run(sourceId, page.page, page.ocr.engine, page.ocr.version, page.ocr.confidence, page.text);
        this.appendEvent({ actor: "system" }, "ocr.read", sourceId, { page: page.page, engine: page.ocr.engine, confidence: page.ocr.confidence });
      }
      if (page.kind === "none") {
        this.openReviewItem("page_without_text", sourceId, page.page, `Page ${page.page} of ${source.name} has no text layer, and OCR found no text.`);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  finishJob(sourceId: string, pages: number): void {
    this.db.prepare("UPDATE ingest_job SET state = 'done', pages = ?, finished_at = ? WHERE source_id = ?").run(pages, now(), sourceId);
    const counts = this.db.prepare("SELECT kind, COUNT(*) AS n FROM page WHERE source_id = ? GROUP BY kind").all(sourceId) as Array<{ kind: string; n: number }>;
    this.appendEvent({ actor: "system" }, "ingest.finished", sourceId, { pages, kinds: Object.fromEntries(counts.map((c) => [c.kind, Number(c.n)])) });
  }

  failJob(sourceId: string, error: string): void {
    const source = this.getSource(sourceId);
    this.db.prepare("UPDATE ingest_job SET state = 'failed', finished_at = ?, error = ? WHERE source_id = ?").run(now(), error, sourceId);
    this.openReviewItem("file_unreadable", sourceId, null, `${source?.name ?? sourceId} could not be read: ${error}`);
    this.appendEvent({ actor: "system" }, "ingest.failed", sourceId, { error });
  }

  private openReviewItem(kind: string, sourceId: string | null, page: number | null, detail: string): void {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO review_item (id, kind, source_id, page, detail, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
      .run(id, kind, sourceId, page, detail, now());
    this.appendEvent({ actor: "system" }, "review_item.opened", id, { kind, sourceId, page });
  }

  listReviewItems(): ReviewItem[] {
    const rows = this.db
      .prepare("SELECT id, kind, source_id, page, detail, status, created_at, decided_at, decided_by FROM review_item ORDER BY created_at")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      sourceId: r.source_id == null ? null : String(r.source_id),
      page: r.page == null ? null : Number(r.page),
      detail: String(r.detail),
      status: r.status as ReviewStatus,
      createdAt: String(r.created_at),
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
      decidedBy: r.decided_by == null ? null : (String(r.decided_by) as Actor),
    }));
  }

  /** A human decision on a review item (decision 5). */
  decideReviewItem(id: string, status: "resolved" | "skipped", ctx: WriteContext): ReviewItem {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate decides a review item");
    const item = this.listReviewItems().find((r) => r.id === id);
    if (!item) throw new MatterStoreError("REVIEW_ITEM_NOT_FOUND", id);
    if (item.status !== "open") throw new MatterStoreError("ALREADY_DECIDED", id);
    this.db.prepare("UPDATE review_item SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?").run(status, now(), ctx.actor, id);
    this.appendEvent(ctx, `review_item.${status}`, id, { kind: item.kind });
    return this.listReviewItems().find((r) => r.id === id)!;
  }

  private anchorRows(sql: string, ...args: Array<string | number>): AnchorRecord[] {
    const rows = this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      sourceId: String(r.source_id),
      sha256: String(r.sha256),
      page: Number(r.page),
      line: Number(r.line),
      x: Number(r.x),
      y: Number(r.y),
      w: Number(r.w),
      h: Number(r.h),
      text: String(r.text),
    }));
  }

  /** Pages of one source with their line anchors, optionally a page range. */
  listPages(sourceId: string, from = 1, to = Number.MAX_SAFE_INTEGER): PageRecord[] {
    const pages = this.db
      .prepare("SELECT page, kind, width, height, text FROM page WHERE source_id = ? AND page BETWEEN ? AND ? ORDER BY page")
      .all(sourceId, from, to) as Array<Record<string, unknown>>;
    const ocr = new Map(
      (this.db.prepare("SELECT page, engine, version, confidence FROM ocr_reading WHERE source_id = ?").all(sourceId) as Array<Record<string, unknown>>).map((r) => [
        Number(r.page),
        { engine: String(r.engine), version: String(r.version), confidence: Number(r.confidence) },
      ]),
    );
    const lines = this.anchorRows("SELECT * FROM anchor WHERE source_id = ? AND page BETWEEN ? AND ? ORDER BY page, line", sourceId, from, to);
    return pages.map((p) => ({
      sourceId,
      page: Number(p.page),
      kind: p.kind as TextKind,
      width: Number(p.width),
      height: Number(p.height),
      text: String(p.text),
      ocr: ocr.get(Number(p.page)) ?? null,
      lines: lines.filter((l) => l.page === Number(p.page)),
    }));
  }

  /** Lines that contain the query (case-insensitive), in source and page order. */
  searchLines(query: string, limit = 50): AnchorRecord[] {
    const q = query.trim();
    if (!q) return [];
    const escaped = q.replace(/[\\%_]/g, (c) => "\\" + c);
    return this.anchorRows("SELECT a.* FROM anchor a JOIN source s ON s.id = a.source_id WHERE a.text LIKE ? ESCAPE '\\' ORDER BY s.added_at, a.page, a.line LIMIT ?", `%${escaped}%`, limit);
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
