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

import { WORK_SCHEMA, WorkStore } from "./work.ts";
import { STUDIO_SCHEMA, StudioStore } from "./studio.ts";
import { ACCEPTED_TEXT, detectMediaType } from "../document-intelligence/formats.ts";
import type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext, IngestJob, AnchorRecord, PageRecord, PageInput, ReviewItem, ReviewStatus, TextKind, JobState, NotebookEvent, DateConflict, Readiness, Notebook, EventInput, EventDecision, EventStatus, DraftKind, RevisionAuthor, DraftRecord, RevisionRecord, ParagraphLinkRecord } from "../../shared/records.ts";

export type { Actor, SourceStatus, MatterSummary, SourceRecord, OriginRecord, EventRecord, AddFileResult, WriteContext, IngestJob, AnchorRecord, PageRecord, PageInput, ReviewItem, ReviewStatus, TextKind, JobState, NotebookEvent, DateConflict, Readiness, Notebook, EventInput, EventDecision, EventStatus, DraftKind, RevisionAuthor, DraftRecord, RevisionRecord, ParagraphLinkRecord };

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
  decided_by TEXT,
  draft_id TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS page_no_update BEFORE UPDATE ON page BEGIN SELECT RAISE(ABORT, 'pages are written once'); END;
CREATE TRIGGER IF NOT EXISTS page_no_delete BEFORE DELETE ON page BEGIN SELECT RAISE(ABORT, 'pages are written once'); END;
CREATE TRIGGER IF NOT EXISTS anchor_no_update BEFORE UPDATE ON anchor BEGIN SELECT RAISE(ABORT, 'anchors are written once'); END;
CREATE TRIGGER IF NOT EXISTS anchor_no_delete BEFORE DELETE ON anchor BEGIN SELECT RAISE(ABORT, 'anchors are written once'); END;
CREATE TRIGGER IF NOT EXISTS ocr_no_update BEFORE UPDATE ON ocr_reading BEGIN SELECT RAISE(ABORT, 'OCR readings are written once'); END;
CREATE TRIGGER IF NOT EXISTS ocr_no_delete BEFORE DELETE ON ocr_reading BEGIN SELECT RAISE(ABORT, 'OCR readings are written once'); END;
CREATE TRIGGER IF NOT EXISTS review_no_delete BEFORE DELETE ON review_item BEGIN SELECT RAISE(ABORT, 'review items are marked, never deleted'); END;
CREATE TABLE IF NOT EXISTS notebook_extract (
  source_id TEXT PRIMARY KEY REFERENCES source(id),
  events INTEGER NOT NULL,
  method TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS notebook_event (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source(id),
  anchor_id TEXT NOT NULL REFERENCES anchor(id),
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  date_text TEXT NOT NULL,
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  date_type TEXT NOT NULL CHECK (date_type IN ('explicit', 'inferred', 'range')),
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('procedural', 'factual')),
  reading TEXT NOT NULL CHECK (reading IN ('text_layer', 'ocr')),
  method TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS event_decision (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES notebook_event(id),
  decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'excluded', 'included')),
  actor TEXT NOT NULL CHECK (actor = 'advocate'),
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS date_conflict (
  id TEXT PRIMARY KEY,
  event_a TEXT NOT NULL REFERENCES notebook_event(id),
  event_b TEXT NOT NULL REFERENCES notebook_event(id),
  review_item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  resolution TEXT,
  UNIQUE (event_a, event_b)
) STRICT;
CREATE TRIGGER IF NOT EXISTS notebook_event_no_update BEFORE UPDATE ON notebook_event BEGIN SELECT RAISE(ABORT, 'events are written once'); END;
CREATE TRIGGER IF NOT EXISTS notebook_event_no_delete BEFORE DELETE ON notebook_event BEGIN SELECT RAISE(ABORT, 'events are written once'); END;
CREATE TRIGGER IF NOT EXISTS decision_no_update BEFORE UPDATE ON event_decision BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS decision_no_delete BEFORE DELETE ON event_decision BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS conflict_no_delete BEFORE DELETE ON date_conflict BEGIN SELECT RAISE(ABORT, 'conflicts are marked, never deleted'); END;

-- Step 4: drafts and revisions (work products). A revision is append-only; an approval is its own row.
CREATE TABLE IF NOT EXISTS draft (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('list_of_dates', 'synopsis', 'questions_of_law', 'grounds', 'petition', 'conference', 'condonation')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS revision (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES draft(id),
  seq INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  base_revision_id TEXT REFERENCES revision(id),
  author TEXT NOT NULL CHECK (author IN ('generator', 'advocate', 'agent')),
  created_at TEXT NOT NULL,
  UNIQUE (draft_id, seq)
) STRICT;
CREATE TABLE IF NOT EXISTS revision_approval (
  revision_id TEXT PRIMARY KEY REFERENCES revision(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor = 'advocate')
) STRICT;
CREATE TABLE IF NOT EXISTS paragraph_link (
  draft_id TEXT NOT NULL REFERENCES draft(id),
  anchor TEXT NOT NULL,
  revision_id TEXT REFERENCES revision(id),
  event_ids TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, anchor)
) STRICT;
CREATE TRIGGER IF NOT EXISTS draft_no_delete BEFORE DELETE ON draft BEGIN SELECT RAISE(ABORT, 'drafts are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS revision_no_update BEFORE UPDATE ON revision BEGIN SELECT RAISE(ABORT, 'revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS revision_no_delete BEFORE DELETE ON revision BEGIN SELECT RAISE(ABORT, 'revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS approval_no_update BEFORE UPDATE ON revision_approval BEGIN SELECT RAISE(ABORT, 'approvals are append-only'); END;
CREATE TRIGGER IF NOT EXISTS approval_no_delete BEFORE DELETE ON revision_approval BEGIN SELECT RAISE(ABORT, 'approvals are append-only'); END;
CREATE TRIGGER IF NOT EXISTS paragraph_link_no_update BEFORE UPDATE ON paragraph_link BEGIN SELECT RAISE(ABORT, 'paragraph links are append-only'); END;
CREATE TRIGGER IF NOT EXISTS paragraph_link_no_delete BEFORE DELETE ON paragraph_link BEGIN SELECT RAISE(ABORT, 'paragraph links are never deleted'); END;
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


async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** V1-10: an archived matter has this marker file in its folder. Nothing else changes. */
export const ARCHIVED_FILE = "archived";

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
      if (row) out.push({ id: row.id, title: row.title, createdAt: row.created_at, folder, archived: await exists(path.join(folder, ARCHIVED_FILE)) });
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
    db.exec("PRAGMA journal_mode = WAL;");
    MatterStore.migrate(db);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    db.exec(WORK_SCHEMA);
    db.exec(STUDIO_SCHEMA);
    // V4-2: an authority found in a research source keeps its reference.
    const au = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'authority'").get() as { sql?: string } | undefined;
    if (au?.sql && !au.sql.includes("source_ref")) db.exec("ALTER TABLE authority ADD COLUMN source_ref TEXT;");
    // V2-6: interim relief in the matter details.
    const md = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'matter_details'").get() as { sql?: string } | undefined;
    if (md?.sql && !md.sql.includes("interim_relief")) db.exec("ALTER TABLE matter_details ADD COLUMN interim_relief TEXT NOT NULL DEFAULT '';");
    return db;
  }

  /**
   * Step 5: a revision may be authored by the agent (a proposal of tracked changes).
   * A matter made before step 5 has the older CHECK; the table is rebuilt once, rows kept.
   */
  private static migrate(db: DatabaseSync): void {
    // Step 5: a review item may belong to a draft (a defect the checks found).
    const items = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_item'").get() as { sql?: string } | undefined;
    if (items?.sql && !items.sql.includes("draft_id")) db.exec("ALTER TABLE review_item ADD COLUMN draft_id TEXT;");
    // Step 6: drafts of the kinds questions_of_law and grounds. V1: petition and conference.
    const draft = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'draft'").get() as { sql?: string } | undefined;
    if (draft?.sql && !draft.sql.includes("'condonation'")) {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec("BEGIN");
      try {
        db.exec(`CREATE TABLE draft_step6 (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('list_of_dates', 'synopsis', 'questions_of_law', 'grounds', 'petition', 'conference', 'condonation')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO draft_step6 SELECT id, kind, title, created_at FROM draft;
DROP TABLE draft;
ALTER TABLE draft_step6 RENAME TO draft;`);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'revision'").get() as { sql?: string } | undefined;
    if (!row?.sql || row.sql.includes("'agent'")) return;
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN");
    try {
      db.exec(`CREATE TABLE revision_step5 (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES draft(id),
  seq INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  base_revision_id TEXT REFERENCES revision(id),
  author TEXT NOT NULL CHECK (author IN ('generator', 'advocate', 'agent')),
  created_at TEXT NOT NULL,
  UNIQUE (draft_id, seq)
) STRICT;
INSERT INTO revision_step5 SELECT id, draft_id, seq, sha256, size, base_revision_id, author, created_at FROM revision;
DROP TABLE revision;
ALTER TABLE revision_step5 RENAME TO revision;`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }

  /** V3-5: a consistent copy of matter.db at `dest` (SQLite VACUUM INTO). `dest` must not exist. */
  snapshot(dest: string): void {
    this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  }

  private workStore: WorkStore | null = null;
  private studioStore: StudioStore | null = null;

  /** V4: the Research and Argument Studio. */
  get studio(): StudioStore {
    this.studioStore ??= new StudioStore(this, this.db);
    return this.studioStore;
  }
  /** The records of steps 6 to 10 (work.ts), on the same database. */
  get work(): WorkStore {
    this.workStore ??= new WorkStore(this, this.db);
    return this.workStore;
  }

  matter(): MatterSummary {
    const row = this.db.prepare("SELECT id, title, created_at FROM matter LIMIT 1").get() as {
      id: string;
      title: string;
      created_at: string;
    };
    return { id: row.id, title: row.title, createdAt: row.created_at, folder: this.folder };
  }

  /** V1-10: the advocate renames the matter. The id and the folder do not change. */
  rename(title: string, ctx: WriteContext): MatterSummary {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate renames a matter");
    const clean = title.trim();
    if (!clean) throw new MatterStoreError("MATTER_TITLE_REQUIRED", "a matter needs a title");
    const before = this.matter().title;
    this.db.prepare("UPDATE matter SET title = ?").run(clean);
    this.appendEvent(ctx, "matter.renamed", this.matter().id, { from: before, to: clean });
    return this.matter();
  }

  blobPath(sha256: string): string {
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new MatterStoreError("BAD_HASH", sha256);
    return path.join(this.folder, BLOBS, sha256);
  }

  /** Store bytes once, at `blobs/<sha256>`. Returns the hash that names them. */
  async putBlob(bytes: Buffer): Promise<{ sha256: string; size: number }> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const blob = this.blobPath(sha256);
    if (!(await exists(blob))) {
      const tmp = `${blob}.${randomUUID()}.tmp`;
      await writeFile(tmp, bytes, { flag: "wx" });
      await rename(tmp, blob);
    }
    return { sha256, size: bytes.length };
  }

  /** Read a blob and check it against its own SHA-256. A changed file is reported, never trusted. */
  async readBlob(sha256: string): Promise<Buffer> {
    const bytes = await readFile(this.blobPath(sha256));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== sha256) throw new MatterStoreError("BLOB_CHANGED", `blob ${sha256} now hashes to ${actual}`);
    return bytes;
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
    const mediaType = detectMediaType(bytes, path.basename(resolved));
    if (!mediaType) {
      this.appendEvent(ctx, "source.refused", null, { name: path.basename(resolved), reason: "format not accepted" });
      return { path: file, outcome: "refused", reason: `format not accepted (accepted: ${ACCEPTED_TEXT})` };
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
      .run(id, sha256, name, bytes.length, mediaType, at, at);
    this.addOrigin(id, name, resolved, ctx);
    this.appendEvent(ctx, "source.added", id, { name, sha256, size: bytes.length, mediaType });
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
                (SELECT COUNT(*) FROM origin o WHERE o.source_id = s.id) AS origins,
                t.proposed AS t_proposed, t.confirmed AS t_confirmed, t.matched AS t_matched
         FROM source s LEFT JOIN source_type t ON t.source_id = s.id ORDER BY s.added_at, s.name`,
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
      docType:
        r.t_proposed == null
          ? null
          : {
              type: String(r.t_confirmed ?? r.t_proposed),
              status: r.t_confirmed == null ? ("candidate" as const) : ("confirmed" as const),
              matched: String(r.t_matched ?? ""),
            },
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

  /** Opens a review item for the system. Only the advocate decides it. */
  openReviewItem(kind: string, sourceId: string | null, page: number | null, detail: string): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO review_item (id, kind, source_id, page, detail, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
      .run(id, kind, sourceId, page, detail, now());
    this.appendEvent({ actor: "system" }, "review_item.opened", id, { kind, sourceId, page });
    return id;
  }

  /**
   * Step 5: open one review item per defect of a draft check, unless the same defect (kind and
   * detail) is already open for that draft. The system opens; only the advocate decides.
   */
  openDraftDefects(draftId: string, revisionId: string, defects: Array<{ kind: string; detail: string }>): { opened: number; alreadyOpen: number } {
    this.getDraft(draftId);
    const open = new Set(
      this.listReviewItems()
        .filter((r) => r.draftId === draftId && r.status === "open")
        .map((r) => `${r.kind}\n${r.detail}`),
    );
    let opened = 0;
    let alreadyOpen = 0;
    for (const d of defects) {
      const key = `${d.kind}\n${d.detail}`;
      if (open.has(key)) {
        alreadyOpen++;
        continue;
      }
      open.add(key);
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO review_item (id, kind, source_id, page, detail, status, created_at, draft_id) VALUES (?, ?, NULL, NULL, ?, 'open', ?, ?)")
        .run(id, d.kind, d.detail, now(), draftId);
      this.appendEvent({ actor: "system" }, "review_item.opened", id, { kind: d.kind, draftId, revisionId });
      opened++;
    }
    return { opened, alreadyOpen };
  }

  listReviewItems(): ReviewItem[] {
    const rows = this.db
      .prepare("SELECT id, kind, source_id, page, detail, status, created_at, decided_at, decided_by, draft_id FROM review_item ORDER BY created_at")
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
      draftId: r.draft_id == null ? null : String(r.draft_id),
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

  // ---- Notebook records (step 3). Computed by lib/notebook, written only here. ----

  /** Sources whose text is read and whose events are not yet extracted. */
  sourcesToExtract(): SourceRecord[] {
    const done = new Set((this.db.prepare("SELECT source_id FROM notebook_extract").all() as Array<{ source_id: string }>).map((r) => r.source_id));
    const read = new Set(this.listJobs().filter((j) => j.state === "done").map((j) => j.sourceId));
    return this.listSources().filter((s) => read.has(s.id) && !done.has(s.id));
  }

  /** Every stored line of one source, in page and line order, with the reading of its page. */
  sourceLines(sourceId: string): Array<AnchorRecord & { reading: "text_layer" | "ocr" }> {
    const kinds = new Map((this.db.prepare("SELECT page, kind FROM page WHERE source_id = ?").all(sourceId) as Array<{ page: number; kind: string }>).map((r) => [Number(r.page), r.kind]));
    return this.anchorRows("SELECT * FROM anchor WHERE source_id = ? ORDER BY page, line", sourceId).map((a) => ({
      ...a,
      reading: kinds.get(a.page) === "ocr" ? "ocr" : "text_layer",
    }));
  }

  recordEvents(sourceId: string, events: EventInput[], method: string): void {
    this.db.exec("BEGIN");
    try {
      const insert = this.db.prepare(
        "INSERT INTO notebook_event (id, source_id, anchor_id, page, line, date_text, date_start, date_end, date_type, description, kind, reading, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const at = now();
      for (const e of events) insert.run(e.id, sourceId, e.anchorId, e.page, e.line, e.dateText, e.dateStart, e.dateEnd, e.dateType, e.description, e.kind, e.reading, e.method, at);
      this.db.prepare("INSERT INTO notebook_extract (source_id, events, method, at) VALUES (?, ?, ?, ?)").run(sourceId, events.length, method, at);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.appendEvent({ actor: "system" }, "notebook.events_extracted", sourceId, { events: events.length, method });
  }

  /** Flag date conflicts. A pair already recorded is not flagged again. */
  recordConflicts(pairs: Array<[string, string]>): number {
    let added = 0;
    for (const [a, b] of pairs) {
      const exists = this.db.prepare("SELECT 1 FROM date_conflict WHERE (event_a = ? AND event_b = ?) OR (event_a = ? AND event_b = ?)").get(a, b, b, a);
      if (exists) continue;
      const rows = this.db.prepare("SELECT id, source_id, page, line, date_text FROM notebook_event WHERE id IN (?, ?)").all(a, b) as Array<Record<string, unknown>>;
      const name = (sid: unknown) => this.getSource(String(sid))?.name ?? String(sid);
      const describe = (r: Record<string, unknown>) => `${r.date_text} (${name(r.source_id)}, p. ${r.page}, l. ${r.line})`;
      const ra = rows.find((r) => r.id === a)!;
      const rb = rows.find((r) => r.id === b)!;
      const reviewId = this.openReviewItem("date_conflict", String(ra.source_id), Number(ra.page), `Conflicting dates for the same event: ${describe(ra)} and ${describe(rb)}.`);
      const id = randomUUID();
      this.db.prepare("INSERT INTO date_conflict (id, event_a, event_b, review_item_id, status) VALUES (?, ?, ?, ?, 'open')").run(id, a, b, reviewId);
      this.appendEvent({ actor: "system" }, "notebook.conflict_flagged", id, { eventA: a, eventB: b });
      added++;
    }
    return added;
  }

  /** A human decision on an event (decision 5). Nothing is deleted; the latest decision counts. */
  decideEvent(eventId: string, decision: EventDecision, ctx: WriteContext): void {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate decides an event");
    const exists = this.db.prepare("SELECT 1 FROM notebook_event WHERE id = ?").get(eventId);
    if (!exists) throw new MatterStoreError("EVENT_NOT_FOUND", eventId);
    this.db.prepare("INSERT INTO event_decision (event_id, decision, actor, at) VALUES (?, ?, 'advocate', ?)").run(eventId, decision, now());
    this.appendEvent(ctx, `notebook.event_${decision}`, eventId, null);
  }

  /** A human resolution of a date conflict: the event id whose date is right, or "both". */
  resolveConflict(conflictId: string, resolution: string, ctx: WriteContext): void {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate resolves a conflict");
    const row = this.db.prepare("SELECT event_a, event_b, review_item_id, status FROM date_conflict WHERE id = ?").get(conflictId) as Record<string, unknown> | undefined;
    if (!row) throw new MatterStoreError("CONFLICT_NOT_FOUND", conflictId);
    if (row.status !== "open") throw new MatterStoreError("ALREADY_DECIDED", conflictId);
    if (![row.event_a, row.event_b, "both"].includes(resolution)) throw new MatterStoreError("BAD_RESOLUTION", resolution);
    this.db.prepare("UPDATE date_conflict SET status = 'resolved', resolution = ? WHERE id = ?").run(resolution, conflictId);
    this.appendEvent(ctx, "notebook.conflict_resolved", conflictId, { resolution });
    const item = this.listReviewItems().find((r) => r.id === row.review_item_id);
    if (item && item.status === "open") this.decideReviewItem(item.id, "resolved", ctx);
  }

  listConflicts(): DateConflict[] {
    const rows = this.db.prepare("SELECT id, event_a, event_b, review_item_id, status, resolution FROM date_conflict").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      eventA: String(r.event_a),
      eventB: String(r.event_b),
      reviewItemId: String(r.review_item_id),
      status: r.status as "open" | "resolved",
      resolution: r.resolution == null ? null : String(r.resolution),
    }));
  }

  listNotebookEvents(): NotebookEvent[] {
    const rows = this.db
      .prepare(
        `SELECT e.*, s.name AS source_name,
           (SELECT decision FROM event_decision d WHERE d.event_id = e.id AND d.decision IN ('confirmed','rejected') ORDER BY seq DESC LIMIT 1) AS status,
           (SELECT decision FROM event_decision d WHERE d.event_id = e.id AND d.decision IN ('excluded','included') ORDER BY seq DESC LIMIT 1) AS visibility
         FROM notebook_event e JOIN source s ON s.id = e.source_id
         ORDER BY e.date_start, s.added_at, e.page, e.line`,
      )
      .all() as Array<Record<string, unknown>>;
    const conflicts = this.listConflicts().filter((c) => c.status === "open");
    return rows.map((r) => ({
      id: String(r.id),
      sourceId: String(r.source_id),
      sourceName: String(r.source_name),
      anchorId: String(r.anchor_id),
      page: Number(r.page),
      line: Number(r.line),
      dateText: String(r.date_text),
      dateStart: String(r.date_start),
      dateEnd: String(r.date_end),
      dateType: r.date_type as NotebookEvent["dateType"],
      description: String(r.description),
      kind: r.kind as NotebookEvent["kind"],
      reading: r.reading as NotebookEvent["reading"],
      method: String(r.method),
      status: (r.status == null ? "candidate" : String(r.status)) as EventStatus,
      excluded: r.visibility === "excluded",
      conflicts: conflicts.filter((c) => c.eventA === r.id || c.eventB === r.id).map((c) => c.id),
    }));
  }

  /** Notebook readiness (Appendix B-D): no job queued or running, and no review item open. */
  readiness(): Readiness {
    const jobsPending = this.sourcesToIngest().length;
    // Draft defects belong to the draft's gate, not to the Notebook's readiness.
    const openReviewItems = this.listReviewItems().filter((r) => r.status === "open" && r.draftId === null).length;
    return { ready: jobsPending === 0 && openReviewItems === 0, jobsPending, openReviewItems };
  }

  notebook(): Notebook {
    return { events: this.listNotebookEvents(), conflicts: this.listConflicts(), readiness: this.readiness() };
  }

  // ---- Drafts and revisions (step 4). Computed by lib/drafting; written only here. ----

  private revisionFromRow(r: Record<string, unknown>): RevisionRecord {
    return {
      id: String(r.id),
      draftId: String(r.draft_id),
      seq: Number(r.seq),
      sha256: String(r.sha256),
      size: Number(r.size),
      baseRevisionId: r.base_revision_id == null ? null : String(r.base_revision_id),
      author: r.author as RevisionAuthor,
      createdAt: String(r.created_at),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
      approvedBy: r.approved_at == null ? null : "advocate",
    };
  }

  /** The revisions of one draft, oldest first. */
  private revisionsOf(draftId: string): RevisionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, a.at AS approved_at FROM revision r
         LEFT JOIN revision_approval a ON a.revision_id = r.id
         WHERE r.draft_id = ? ORDER BY r.seq`,
      )
      .all(draftId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.revisionFromRow(r));
  }

  private draftFromRow(r: Record<string, unknown>): DraftRecord {
    const id = String(r.id);
    const revisions = this.revisionsOf(id);
    const head = revisions.length > 0 ? revisions[revisions.length - 1] : null;
    const approved = [...revisions].reverse().find((x) => x.approvedAt !== null) ?? null;
    return {
      id,
      kind: r.kind as DraftKind,
      title: String(r.title),
      createdAt: String(r.created_at),
      revisionCount: revisions.length,
      head,
      approved,
    };
  }

  listDrafts(): DraftRecord[] {
    const rows = this.db.prepare("SELECT id, kind, title, created_at FROM draft ORDER BY created_at").all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.draftFromRow(r));
  }

  getDraft(draftId: string): DraftRecord {
    const row = this.db.prepare("SELECT id, kind, title, created_at FROM draft WHERE id = ?").get(draftId) as Record<string, unknown> | undefined;
    if (!row) throw new MatterStoreError("DRAFT_NOT_FOUND", draftId);
    return this.draftFromRow(row);
  }

  getRevision(revisionId: string): RevisionRecord {
    const row = this.db
      .prepare("SELECT r.*, a.at AS approved_at FROM revision r LEFT JOIN revision_approval a ON a.revision_id = r.id WHERE r.id = ?")
      .get(revisionId) as Record<string, unknown> | undefined;
    if (!row) throw new MatterStoreError("REVISION_NOT_FOUND", revisionId);
    return this.revisionFromRow(row);
  }

  headRevision(draftId: string): RevisionRecord | null {
    const revisions = this.revisionsOf(draftId);
    return revisions.length > 0 ? revisions[revisions.length - 1] : null;
  }

  /** The DOCX bytes of one revision, checked against the revision's SHA-256. */
  async revisionBytes(revisionId: string): Promise<Buffer> {
    return this.readBlob(this.getRevision(revisionId).sha256);
  }

  /**
   * Create a draft with its first revision (author `generator`) and the paragraph links.
   * One transaction for the rows; the blob is written before it.
   */
  async createDraftWithRevision(
    kind: DraftKind,
    title: string,
    docx: Buffer,
    paragraphs: Array<{ anchor: string; text: string; eventIds: string[] }>,
    ctx: WriteContext,
  ): Promise<{ draft: DraftRecord; revision: RevisionRecord }> {
    const { sha256, size } = await this.putBlob(docx);
    const draftId = randomUUID();
    const revisionId = randomUUID();
    const at = now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO draft (id, kind, title, created_at) VALUES (?, ?, ?, ?)").run(draftId, kind, title, at);
      this.db
        .prepare("INSERT INTO revision (id, draft_id, seq, sha256, size, base_revision_id, author, created_at) VALUES (?, ?, 1, ?, ?, NULL, 'generator', ?)")
        .run(revisionId, draftId, sha256, size, at);
      const insert = this.db.prepare(
        "INSERT INTO paragraph_link (draft_id, anchor, revision_id, event_ids, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const p of paragraphs) insert.run(draftId, p.anchor, revisionId, JSON.stringify(p.eventIds), p.text, at);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.appendEvent(ctx, "draft.generated", draftId, { kind, title, revisionId, paragraphs: paragraphs.length });
    return { draft: this.getDraft(draftId), revision: this.getRevision(revisionId) };
  }

  /**
   * V1: a regenerated document (petition, conference package) as a new revision of its draft,
   * author generator, with its paragraph links. The base is the head.
   */
  async addGeneratedRevision(
    draftId: string,
    docx: Buffer,
    paragraphs: Array<{ anchor: string; text: string; eventIds: string[] }>,
    ctx: WriteContext,
  ): Promise<RevisionRecord> {
    const head = this.getDraft(draftId).head;
    if (!head) throw new MatterStoreError("DRAFT_NOT_FOUND", draftId);
    const { sha256, size } = await this.putBlob(docx);
    const id = randomUUID();
    const at = now();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT INTO revision (id, draft_id, seq, sha256, size, base_revision_id, author, created_at) VALUES (?, ?, ?, ?, ?, ?, 'generator', ?)")
        .run(id, draftId, head.seq + 1, sha256, size, head.id, at);
      const insert = this.db.prepare("INSERT INTO paragraph_link (draft_id, anchor, revision_id, event_ids, text, created_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const p of paragraphs) insert.run(draftId, p.anchor, id, JSON.stringify(p.eventIds), p.text, at);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.appendEvent(ctx, "draft.regenerated", id, { draftId, base: head.id, sha256, paragraphs: paragraphs.length });
    return this.getRevision(id);
  }

  /**
   * A human save: a new revision based on the current head (WD-007 to WD-010).
   * A save with no base revision is refused; a stale base is refused.
   */
  async saveRevision(draftId: string, docx: Buffer, baseRevisionId: string, ctx: WriteContext): Promise<RevisionRecord> {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate saves a revision");
    if (!baseRevisionId) throw new MatterStoreError("BASE_REQUIRED", "a human save needs a base revision");
    const draft = this.getDraft(draftId);
    const head = draft.head;
    if (!head) throw new MatterStoreError("DRAFT_NOT_FOUND", draftId);
    if (head.id !== baseRevisionId) {
      throw new MatterStoreError("DOC_STALE_BASE", `the draft now has revision ${head.seq} (base was ${baseRevisionId})`);
    }
    const { sha256, size } = await this.putBlob(docx);
    const id = randomUUID();
    const at = now();
    this.db
      .prepare("INSERT INTO revision (id, draft_id, seq, sha256, size, base_revision_id, author, created_at) VALUES (?, ?, ?, ?, ?, ?, 'advocate', ?)")
      .run(id, draftId, head.seq + 1, sha256, size, head.id, at);
    this.appendEvent(ctx, "revision.saved", id, { draftId, base: head.id, sha256, size });
    return this.getRevision(id);
  }

  /**
   * The agent's proposal: a new revision whose DOCX holds the agent's tracked changes
   * (editor-design item a). The base must be the head; nothing is kept until the advocate decides.
   */
  async proposeRevision(draftId: string, docx: Buffer, baseRevisionId: string, data: Record<string, unknown>, ctx: WriteContext): Promise<RevisionRecord> {
    if (ctx.actor !== "agent") throw new MatterStoreError("AGENT_ONLY", "a proposal is the agent's");
    return this.insertRevision(draftId, docx, baseRevisionId, "agent", "revision.proposed", data, ctx);
  }

  /** The advocate keeps or undoes agent changes (decision 5): a new revision, author advocate. */
  async decideRevision(draftId: string, docx: Buffer, baseRevisionId: string, data: Record<string, unknown>, ctx: WriteContext): Promise<RevisionRecord> {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate keeps or undoes a change");
    return this.insertRevision(draftId, docx, baseRevisionId, "advocate", "agent_change.decided", data, ctx);
  }

  private async insertRevision(
    draftId: string,
    docx: Buffer,
    baseRevisionId: string,
    author: RevisionAuthor,
    action: string,
    data: Record<string, unknown>,
    ctx: WriteContext,
  ): Promise<RevisionRecord> {
    const head = this.getDraft(draftId).head;
    if (!head) throw new MatterStoreError("DRAFT_NOT_FOUND", draftId);
    if (head.id !== baseRevisionId) throw new MatterStoreError("DOC_STALE_BASE", `the draft now has revision ${head.seq}`);
    const { sha256, size } = await this.putBlob(docx);
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO revision (id, draft_id, seq, sha256, size, base_revision_id, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, draftId, head.seq + 1, sha256, size, head.id, author, now());
    this.appendEvent(ctx, action, id, { draftId, base: head.id, sha256, ...data });
    return this.getRevision(id);
  }

  /** A human approval of one revision (decision 5). */
  approveRevision(revisionId: string, ctx: WriteContext): RevisionRecord {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate approves a revision");
    const revision = this.getRevision(revisionId);
    this.db.prepare("INSERT OR IGNORE INTO revision_approval (revision_id, at, actor) VALUES (?, ?, 'advocate')").run(revisionId, now());
    this.appendEvent(ctx, "revision.approved", revisionId, { draftId: revision.draftId, seq: revision.seq });
    return this.getRevision(revisionId);
  }

  listParagraphLinks(draftId: string): ParagraphLinkRecord[] {
    const rows = this.db
      .prepare("SELECT draft_id, anchor, revision_id, event_ids, text, created_at FROM paragraph_link WHERE draft_id = ? ORDER BY created_at")
      .all(draftId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      draftId: String(r.draft_id),
      anchor: String(r.anchor),
      revisionId: r.revision_id == null ? null : String(r.revision_id),
      text: String(r.text),
      eventIds: JSON.parse(String(r.event_ids)) as string[],
      createdAt: String(r.created_at),
    }));
  }

  getParagraphLink(draftId: string, anchor: string): ParagraphLinkRecord | undefined {
    return this.listParagraphLinks(draftId).find((l) => l.anchor === anchor);
  }

  /** Record the link for an anchor the editor inserted. One link per anchor per draft. */
  recordParagraphLink(draftId: string, anchor: string, revisionId: string, eventIds: string[], text: string): void {
    this.getDraft(draftId);
    this.db
      .prepare("INSERT INTO paragraph_link (draft_id, anchor, revision_id, event_ids, text, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(draftId, anchor, revisionId, JSON.stringify(eventIds), text, now());
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
