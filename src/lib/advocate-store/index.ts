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
import { GRAPH_SCHEMA, buildAdvocateEdges } from "./graph.ts";
import { checkIntegrationManifest } from "../integrations/index.ts";
import { bumpVersion, checkAgent, checkWorkflow } from "../builders/index.ts";
import { DEFAULT_TRIGGERS, checkTrigger, matchTriggers } from "../triggers/index.ts";
import type { AdvocateGraphEdge, AdvocateGraphView, GraphNodeKind } from "../../shared/knowledge.ts";
import type { IntegrationRecord } from "../../shared/integrations.ts";
import type { AgentProfile, WorkflowDefinition } from "../../shared/builders.ts";
import type { SkillDefinition } from "../../shared/skills.ts";
import type { TriggerDefinition, TriggerFire, TriggerFireInput } from "../../shared/triggers.ts";
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

const INTEGRATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS integration (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  manifest TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS workflow (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  superseded_by TEXT,
  PRIMARY KEY (id, version)
) STRICT;
CREATE TABLE IF NOT EXISTS agent (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  superseded_by TEXT,
  PRIMARY KEY (id, version)
) STRICT;
CREATE TABLE IF NOT EXISTS trigger (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  title TEXT NOT NULL,
  skills TEXT NOT NULL,
  responses TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS trigger_fire (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  event TEXT NOT NULL,
  matter_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  skills TEXT NOT NULL,
  responses TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('proposed', 'started', 'dismissed')),
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
`;

function memoryRow(r: Record<string, unknown>): MemoryRecord {
  return {
    memoryId: String(r.memory_id),
    type: r.type as MemoryType,
    subject: String(r.subject),
    relation: String(r.relation),
    object: String(r.object),
    sourceId: r.source_id == null ? null : String(r.source_id),
    anchorId: null,
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
    db.exec(GRAPH_SCHEMA);
    db.exec(INTEGRATION_SCHEMA);
    const store = new AdvocateStore(file, db);
    // S9: the default trigger table is written once. The advocate can disable or change each row.
    if (!db.prepare("SELECT 1 FROM trigger LIMIT 1").get()) {
      const at = new Date().toISOString();
      const insert = db.prepare("INSERT INTO trigger (id, event, title, skills, responses, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const t of DEFAULT_TRIGGERS) insert.run(t.id, t.event, t.title, JSON.stringify(t.skills), JSON.stringify(t.responses), t.enabled ? 1 : 0, at, at);
      appendChained(db, { actor: "system" }, "triggers.seeded", null, { triggers: DEFAULT_TRIGGERS.length });
    }
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

  // ---- G3: the advocate memory graph ----

  /**
   * Rebuild the edge table from the advocate's own records and the matter outcomes. The graph is
   * derived (decision 13): the edges own nothing and are written again from the canonical rows.
   */
  rebuildGraph(outcomes: Array<{ id: string; matterId: string; result: string; subject: string; court: string; decidedOn: string }>, ctx: WriteContext): AdvocateGraphView {
    const at = new Date().toISOString();
    const edges = buildAdvocateEdges({ memory: this.memory(), preferences: this.preferences(), library: this.library(), outcomes, now: at });
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM edge").run();
      const insert = this.db.prepare("INSERT INTO edge (from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const e of edges) insert.run(e.fromKind, e.fromId, e.relation, e.toKind, e.toId, e.evidenceRef, e.builtFrom, e.builtAt);
      this.db.prepare("INSERT INTO graph_build (id, built_at, edges) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET built_at = excluded.built_at, edges = excluded.edges").run(at, edges.length);
      appendChained(this.db, ctx, "advocate.graph_rebuilt", null, { edges: edges.length });
    });
    return this.graph();
  }

  /** The edges, their counts and the last build's date. */
  graph(): AdvocateGraphView {
    const edges = (this.db.prepare("SELECT * FROM edge ORDER BY from_kind, from_id, relation, to_kind, to_id").all() as Array<Record<string, unknown>>).map((r) => ({
      fromKind: String(r.from_kind) as GraphNodeKind,
      fromId: String(r.from_id),
      relation: String(r.relation) as AdvocateGraphEdge["relation"],
      toKind: String(r.to_kind) as GraphNodeKind,
      toId: String(r.to_id),
      evidenceRef: String(r.evidence_ref),
      builtFrom: String(r.built_from),
      builtAt: String(r.built_at),
    }));
    const counts = (this.db.prepare("SELECT from_kind, relation, to_kind, COUNT(*) AS n FROM edge GROUP BY from_kind, relation, to_kind ORDER BY from_kind, relation, to_kind").all() as Array<Record<string, unknown>>).map((r) => ({
      fromKind: String(r.from_kind) as GraphNodeKind,
      relation: String(r.relation) as AdvocateGraphEdge["relation"],
      toKind: String(r.to_kind) as GraphNodeKind,
      n: Number(r.n),
    }));
    const build = this.db.prepare("SELECT built_at FROM graph_build WHERE id = 1").get() as { built_at: string } | undefined;
    return { edges, counts, builtAt: build?.built_at ?? null };
  }

  /** One node's neighbours, one or two steps out. It reads the edge table only. */
  graphWalk(kind: GraphNodeKind, id: string, depth = 1): AdvocateGraphEdge[] {
    let frontier = [{ kind, id }];
    const seen = new Set<string>();
    const out: AdvocateGraphEdge[] = [];
    const d = Math.max(1, Math.min(3, Math.floor(depth)));
    for (let step = 0; step < d; step++) {
      const next: Array<{ kind: GraphNodeKind; id: string }> = [];
      for (const node of frontier) {
        const rows = this.db.prepare("SELECT * FROM edge WHERE (from_kind = ? AND from_id = ?) OR (to_kind = ? AND to_id = ?) ORDER BY relation, from_id, to_id").all(node.kind, node.id, node.kind, node.id) as Array<Record<string, unknown>>;
        for (const r of rows) {
          const key = `${r.from_kind}:${r.from_id}:${r.relation}:${r.to_kind}:${r.to_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            fromKind: String(r.from_kind) as GraphNodeKind,
            fromId: String(r.from_id),
            relation: String(r.relation) as AdvocateGraphEdge["relation"],
            toKind: String(r.to_kind) as GraphNodeKind,
            toId: String(r.to_id),
            evidenceRef: String(r.evidence_ref),
            builtFrom: String(r.built_from),
            builtAt: String(r.built_at),
          });
          const other = String(r.from_kind) === node.kind && String(r.from_id) === node.id ? { kind: String(r.to_kind) as GraphNodeKind, id: String(r.to_id) } : { kind: String(r.from_kind) as GraphNodeKind, id: String(r.from_id) };
          if (!next.some((x) => x.kind === other.kind && x.id === other.id)) next.push(other);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return out;
  }

  // ---- Y1: the integration registry ----

  integrations(): IntegrationRecord[] {
    return (this.db.prepare("SELECT * FROM integration ORDER BY title, id").all() as Array<Record<string, unknown>>).map((r) => {
      const check = checkIntegrationManifest(JSON.parse(String(r.manifest)));
      return {
        id: String(r.id),
        version: String(r.version),
        title: String(r.title),
        enabled: Number(r.enabled) === 1,
        error: r.error == null ? null : String(r.error),
        manifest: check.manifest,
        installedAt: String(r.installed_at),
        updatedAt: String(r.updated_at),
      };
    });
  }

  /** Install or refresh one manifest. An invalid manifest is kept with its errors and cannot run. */
  upsertIntegration(raw: unknown, ctx: WriteContext): IntegrationRecord {
    const check = checkIntegrationManifest(raw);
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    if (!id) throw new StoreError("BAD_INTEGRATION", "the manifest has no id");
    const at = new Date().toISOString();
    const version = String(o.version ?? "0.0.0");
    const title = String(o.title ?? id);
    inTransaction(this.db, () => {
      this.db
        .prepare("INSERT INTO integration (id, version, title, manifest, enabled, error, installed_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, title = excluded.title, manifest = excluded.manifest, error = excluded.error, updated_at = excluded.updated_at")
        .run(id, version, title, JSON.stringify(raw), check.errors.length ? check.errors.join("; ") : null, at, at);
      appendChained(this.db, ctx, "integration.installed", id, { version, valid: !check.errors.length });
    });
    return this.integrations().find((x) => x.id === id)!;
  }

  /** Human-only: enable or disable an integration. A refused manifest never enables. */
  setIntegrationEnabled(id: string, enabled: boolean, ctx: WriteContext): IntegrationRecord {
    humanOnly(ctx, "enables an integration");
    const row = this.db.prepare("SELECT error FROM integration WHERE id = ?").get(id) as { error: string | null } | undefined;
    if (!row) throw new StoreError("NOT_FOUND", `no integration ${id}`);
    if (enabled && row.error) throw new StoreError("INTEGRATION_INVALID", row.error);
    inTransaction(this.db, () => {
      this.db.prepare("UPDATE integration SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, new Date().toISOString(), id);
      appendChained(this.db, ctx, "integration.enabled", id, { enabled });
    });
    return this.integrations().find((x) => x.id === id)!;
  }

  // ---- N5: the built workflows and agents ----

  private workflowRow(r: Record<string, unknown>): WorkflowDefinition {
    const definition = JSON.parse(String(r.definition)) as Omit<WorkflowDefinition, "createdAt" | "supersededBy">;
    return { ...definition, createdAt: String(r.created_at), supersededBy: r.superseded_by == null ? null : String(r.superseded_by) };
  }

  private agentRow(r: Record<string, unknown>): AgentProfile {
    const definition = JSON.parse(String(r.definition)) as Omit<AgentProfile, "createdAt" | "supersededBy">;
    return { ...definition, createdAt: String(r.created_at), supersededBy: r.superseded_by == null ? null : String(r.superseded_by) };
  }

  workflows(): WorkflowDefinition[] {
    return (this.db.prepare("SELECT * FROM workflow WHERE superseded_by IS NULL ORDER BY title, id").all() as Array<Record<string, unknown>>).map((r) => this.workflowRow(r));
  }

  workflow(id: string): WorkflowDefinition | null {
    const r = this.db.prepare("SELECT * FROM workflow WHERE id = ? AND superseded_by IS NULL").get(id) as Record<string, unknown> | undefined;
    return r ? this.workflowRow(r) : null;
  }

  workflowHistory(id: string): WorkflowDefinition[] {
    return (this.db.prepare("SELECT * FROM workflow WHERE id = ? ORDER BY created_at, version").all(id) as Array<Record<string, unknown>>).map((r) => this.workflowRow(r));
  }

  /** Human-only: save a workflow. An edit is a new version; the old row stays and points to it. */
  saveWorkflow(raw: unknown, skillIds: readonly string[], ctx: WriteContext): WorkflowDefinition {
    humanOnly(ctx, "saves a workflow");
    const given = typeof (raw as { id?: unknown })?.id === "string" ? String((raw as { id: string }).id) : "";
    const active = given ? this.workflow(given) : null;
    const id = active?.id ?? (/^wf-[a-z0-9-]+$/.test(given) ? given : `wf-${randomUUID()}`);
    const version = active ? bumpVersion(active.version) : "1.0.0";
    const check = checkWorkflow({ ...(raw as object), id, version }, new Map(skillIds.map((s) => [s, { id: s, title: s }])));
    if (!check.value) throw new StoreError("BAD_WORKFLOW", check.errors.join("; "));
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      if (active) this.db.prepare("UPDATE workflow SET superseded_by = ? WHERE id = ? AND version = ?").run(version, id, active.version);
      this.db.prepare("INSERT INTO workflow (id, version, title, description, definition, created_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, NULL)").run(id, version, check.value!.title, check.value!.description, JSON.stringify(check.value), at);
      appendChained(this.db, ctx, "workflow.saved", id, { version, steps: check.value!.steps.length });
    });
    return this.workflow(id)!;
  }

  deleteWorkflow(id: string, ctx: WriteContext): void {
    humanOnly(ctx, "removes a workflow");
    if (!this.workflow(id)) throw new StoreError("NOT_FOUND", `no workflow ${id}`);
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM workflow WHERE id = ? AND superseded_by IS NULL").run(id);
      appendChained(this.db, ctx, "workflow.removed", id, null);
    });
  }

  agents(): AgentProfile[] {
    return (this.db.prepare("SELECT * FROM agent WHERE superseded_by IS NULL ORDER BY title, id").all() as Array<Record<string, unknown>>).map((r) => this.agentRow(r));
  }

  agent(id: string): AgentProfile | null {
    const r = this.db.prepare("SELECT * FROM agent WHERE id = ? AND superseded_by IS NULL").get(id) as Record<string, unknown> | undefined;
    return r ? this.agentRow(r) : null;
  }

  saveAgent(raw: unknown, deps: { skills: ReadonlyMap<string, SkillDefinition>; draftKinds: readonly string[]; humanOnly: RegExp; never: readonly string[] }, ctx: WriteContext): AgentProfile {
    humanOnly(ctx, "saves an agent");
    const given = typeof (raw as { id?: unknown })?.id === "string" ? String((raw as { id: string }).id) : "";
    const active = given ? this.agent(given) : null;
    const id = active?.id ?? (/^agent-[a-z0-9-]+$/.test(given) ? given : `agent-${randomUUID()}`);
    const version = active ? bumpVersion(active.version) : "1.0.0";
    const check = checkAgent({ ...(raw as object), id, version }, deps);
    if (!check.value) throw new StoreError("BAD_AGENT", check.errors.join("; "));
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      if (active) this.db.prepare("UPDATE agent SET superseded_by = ? WHERE id = ? AND version = ?").run(version, id, active.version);
      this.db.prepare("INSERT INTO agent (id, version, title, definition, created_at, superseded_by) VALUES (?, ?, ?, ?, ?, NULL)").run(id, version, check.value!.title, JSON.stringify(check.value), at);
      appendChained(this.db, ctx, "agent.saved", id, { version, skills: check.value!.skills.length });
    });
    return this.agent(id)!;
  }

  deleteAgent(id: string, ctx: WriteContext): void {
    humanOnly(ctx, "removes an agent");
    if (!this.agent(id)) throw new StoreError("NOT_FOUND", `no agent ${id}`);
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM agent WHERE id = ? AND superseded_by IS NULL").run(id);
      appendChained(this.db, ctx, "agent.removed", id, null);
    });
  }

  // ---- S9: the trigger table ----

  triggers(): TriggerDefinition[] {
    return (this.db.prepare("SELECT * FROM trigger ORDER BY event, title, id").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      event: String(r.event) as TriggerDefinition["event"],
      title: String(r.title),
      skills: JSON.parse(String(r.skills)) as string[],
      responses: JSON.parse(String(r.responses)) as TriggerDefinition["responses"],
      enabled: Number(r.enabled) === 1,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /** Human-only: add or change a trigger. */
  saveTrigger(raw: unknown, ctx: WriteContext): TriggerDefinition {
    humanOnly(ctx, "saves a trigger");
    const check = checkTrigger(raw);
    if (!check.trigger) throw new StoreError("BAD_TRIGGER", check.errors.join("; "));
    const t = check.trigger;
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      this.db
        .prepare("INSERT INTO trigger (id, event, title, skills, responses, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET event = excluded.event, title = excluded.title, skills = excluded.skills, responses = excluded.responses, enabled = excluded.enabled, updated_at = excluded.updated_at")
        .run(t.id, t.event, t.title, JSON.stringify(t.skills), JSON.stringify(t.responses), t.enabled ? 1 : 0, at, at);
      appendChained(this.db, ctx, "trigger.saved", t.id, { event: t.event, enabled: t.enabled });
    });
    return this.triggers().find((x) => x.id === t.id)!;
  }

  setTriggerEnabled(id: string, enabled: boolean, ctx: WriteContext): TriggerDefinition {
    humanOnly(ctx, "enables a trigger");
    const have = this.triggers().find((t) => t.id === id);
    if (!have) throw new StoreError("NOT_FOUND", `no trigger ${id}`);
    return this.saveTrigger({ ...have, enabled }, ctx);
  }

  deleteTrigger(id: string, ctx: WriteContext): TriggerDefinition[] {
    humanOnly(ctx, "removes a trigger");
    if (!this.triggers().some((t) => t.id === id)) throw new StoreError("NOT_FOUND", `no trigger ${id}`);
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM trigger WHERE id = ?").run(id);
      appendChained(this.db, ctx, "trigger.removed", id, null);
    });
    return this.triggers();
  }

  /** Match the enabled triggers and write one fire for each. A fire starts nothing. */
  fireTriggers(input: TriggerFireInput, ctx: WriteContext): TriggerFire[] {
    const out: TriggerFire[] = [];
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      for (const t of matchTriggers(this.triggers(), input.event)) {
        const id = randomUUID();
        this.db.prepare("INSERT INTO trigger_fire (id, trigger_id, event, matter_id, subject, skills, responses, state, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, NULL)").run(id, t.id, t.event, input.matterId, input.subject.slice(0, 500), JSON.stringify(t.skills), JSON.stringify(t.responses), at);
        appendChained(this.db, ctx, "trigger.fired", id, { trigger: t.id, event: t.event, matter: input.matterId });
        out.push(this.triggerFires().find((f) => f.id === id)!);
      }
    });
    return out;
  }

  triggerFires(state?: TriggerFire["state"]): TriggerFire[] {
    const rows = state ? this.db.prepare("SELECT * FROM trigger_fire WHERE state = ? ORDER BY created_at DESC, rowid DESC").all(state) : this.db.prepare("SELECT * FROM trigger_fire ORDER BY created_at DESC, rowid DESC").all();
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      triggerId: String(r.trigger_id),
      event: String(r.event) as TriggerFire["event"],
      matterId: String(r.matter_id),
      subject: String(r.subject),
      skills: JSON.parse(String(r.skills)) as string[],
      responses: JSON.parse(String(r.responses)) as TriggerFire["responses"],
      state: String(r.state) as TriggerFire["state"],
      createdAt: String(r.created_at),
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
    }));
  }

  /** Human-only: start the fire's skills or dismiss it. Starting is a chat instruction, in main. */
  decideTriggerFire(id: string, state: "started" | "dismissed", ctx: WriteContext): TriggerFire {
    humanOnly(ctx, "decides a trigger fire");
    const have = this.triggerFires().find((f) => f.id === id);
    if (!have) throw new StoreError("NOT_FOUND", `no trigger fire ${id}`);
    if (have.state !== "proposed") throw new StoreError("DECIDED", `the fire is already ${have.state}`);
    inTransaction(this.db, () => {
      this.db.prepare("UPDATE trigger_fire SET state = ?, decided_at = ? WHERE id = ?").run(state, new Date().toISOString(), id);
      appendChained(this.db, ctx, `trigger.${state}`, id, { trigger: have.triggerId });
    });
    return this.triggerFires().find((f) => f.id === id)!;
  }
}
