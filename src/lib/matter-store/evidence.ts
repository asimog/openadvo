/**
 * Phase 4: the matter store's evidence part. Facts, the evidence repository, document structure,
 * source relations, the matter evidence graph, typed matter memory, page marks, document
 * operations, forum clauses and the jurisdiction report. One writer (decision 4). The agent
 * proposes; only the advocate confirms, disputes, supersedes or records an admissibility note.
 * Plain library.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { MatterStoreError, type MatterStore } from "./index.ts";
import type { WriteContext } from "../../shared/records.ts";
import type { MemoryRecord, MemoryStatus, MemoryType } from "../../shared/stores.ts";
import { ADVOCATE_SCOPE_TYPES, MEMORY_STATUSES, MEMORY_TYPES } from "../../shared/stores.ts";
import type {
  Contradiction,
  DocumentOperation,
  DocumentPart,
  DocumentPartKind,
  EvidenceRecord,
  EvidenceStatus,
  FactRecord,
  FactStatus,
  FactType,
  ForumClause,
  JurisdictionReport,
  MatterEdge,
  PageMark,
  RelationKind,
  SourceRelation,
} from "../../shared/evidence.ts";
import { DOCUMENT_PARTS, EDGE_RELATIONS, FACT_STATUSES, FACT_TYPES, MARK_KINDS, OPERATION_KINDS, RELATION_KINDS } from "../../shared/evidence.ts";

export const EVIDENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS fact (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (${FACT_TYPES.map((t) => `'${t}'`).join(", ")})),
  status TEXT NOT NULL CHECK (status IN (${FACT_STATUSES.map((s) => `'${s}'`).join(", ")})),
  source_id TEXT,
  anchor_id TEXT,
  page INTEGER,
  line INTEGER,
  event_id TEXT,
  fact_date TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  parties TEXT NOT NULL DEFAULT '[]',
  issue_ids TEXT NOT NULL DEFAULT '[]',
  argument_ids TEXT NOT NULL DEFAULT '[]',
  relief TEXT NOT NULL DEFAULT '',
  supersedes TEXT,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent', 'system')),
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS fact_by_source ON fact (source_id, page, line);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  exhibit_number TEXT NOT NULL DEFAULT '',
  witness TEXT NOT NULL DEFAULT '',
  statement TEXT NOT NULL DEFAULT '',
  given_by TEXT NOT NULL DEFAULT '',
  given_at TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL DEFAULT '',
  electronic INTEGER NOT NULL DEFAULT 0,
  device TEXT NOT NULL DEFAULT '',
  authenticity TEXT NOT NULL CHECK (authenticity IN ('candidate', 'authentic', 'disputed', 'rejected')),
  admissibility TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'rejected')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS document_part (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${DOCUMENT_PARTS.map((k) => `'${k}'`).join(", ")})),
  text TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS part_by_source ON document_part (source_id, page, line);
CREATE TABLE IF NOT EXISTS source_relation (
  source_a TEXT NOT NULL,
  source_b TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN (${RELATION_KINDS.map((r) => `'${r}'`).join(", ")})),
  reason TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  review_item_id TEXT,
  decision TEXT CHECK (decision IN ('same', 'different')),
  decided_at TEXT,
  PRIMARY KEY (source_a, source_b, relation)
) STRICT;
CREATE TABLE IF NOT EXISTS matter_edge (
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN (${EDGE_RELATIONS.map((r) => `'${r}'`).join(", ")})),
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL DEFAULT '',
  built_from TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (from_kind, from_id, relation, to_kind, to_id)
) STRICT;
CREATE TABLE IF NOT EXISTS memory (
  memory_id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (${MEMORY_TYPES.map((t) => `'${t}'`).join(", ")})),
  subject TEXT NOT NULL,
  relation TEXT NOT NULL,
  object TEXT NOT NULL,
  source_id TEXT,
  anchor_id TEXT,
  recorded_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  confidence REAL,
  status TEXT NOT NULL CHECK (status IN (${MEMORY_STATUSES.map((s) => `'${s}'`).join(", ")})),
  scope TEXT NOT NULL CHECK (scope = 'matter'),
  supersedes TEXT REFERENCES memory(memory_id),
  proposed_by TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS memory_no_delete BEFORE DELETE ON memory BEGIN SELECT RAISE(ABORT, 'memory records change status, never vanish'); END;
CREATE TABLE IF NOT EXISTS page_mark (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${MARK_KINDS.map((k) => `'${k}'`).join(", ")})),
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS document_operation (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (${OPERATION_KINDS.map((k) => `'${k}'`).join(", ")})),
  inputs TEXT NOT NULL,
  output_source_id TEXT,
  log TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS source_analysis (
  source_id TEXT PRIMARY KEY,
  analysed_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS forum_clause (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('exclusive', 'non_exclusive', 'seat', 'venue', 'courts')),
  anchor_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS jurisdiction_report (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  report TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
`;

const now = () => new Date().toISOString();
const clean = (s: unknown, max = 4000) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const json = <T>(s: unknown, fallback: T): T => {
  try {
    const v = JSON.parse(String(s ?? "")) as T;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

function human(ctx: WriteContext, what: string): void {
  if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", `only the advocate ${what}`);
}

function author(ctx: WriteContext): "advocate" | "agent" | "system" {
  if (ctx.actor === "advocate" || ctx.actor === "agent" || ctx.actor === "system") return ctx.actor;
  throw new MatterStoreError("BAD_ACTOR", "the advocate, the agent or the system writes this record");
}

function factRow(r: Record<string, unknown>): FactRecord {
  return {
    id: String(r.id),
    text: String(r.text),
    type: r.type as FactType,
    status: r.status as FactStatus,
    sourceId: r.source_id == null ? null : String(r.source_id),
    sourceName: r.source_name == null ? null : String(r.source_name),
    anchorId: r.anchor_id == null ? null : String(r.anchor_id),
    page: r.page == null ? null : Number(r.page),
    line: r.line == null ? null : Number(r.line),
    eventId: r.event_id == null ? null : String(r.event_id),
    date: String(r.fact_date ?? ""),
    amount: String(r.amount ?? ""),
    parties: json<string[]>(r.parties, []),
    issueIds: json<string[]>(r.issue_ids, []),
    argumentIds: json<string[]>(r.argument_ids, []),
    relief: String(r.relief ?? ""),
    supersedes: r.supersedes == null ? null : String(r.supersedes),
    author: r.author as FactRecord["author"],
    createdAt: String(r.created_at),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
  };
}

function evidenceRow(r: Record<string, unknown>): EvidenceRecord {
  return {
    id: String(r.id),
    sourceId: String(r.source_id),
    sourceName: r.source_name == null ? String(r.source_id) : String(r.source_name),
    exhibitNumber: String(r.exhibit_number),
    witness: String(r.witness),
    statement: String(r.statement),
    givenBy: String(r.given_by),
    givenAt: String(r.given_at),
    hash: String(r.hash),
    electronic: Number(r.electronic) === 1,
    device: String(r.device),
    authenticity: r.authenticity as EvidenceStatus,
    admissibility: String(r.admissibility),
    notes: String(r.notes),
    status: r.status as EvidenceRecord["status"],
    createdAt: String(r.created_at),
  };
}

function partRow(r: Record<string, unknown>): DocumentPart {
  return {
    id: String(r.id),
    sourceId: String(r.source_id),
    sourceName: r.source_name == null ? String(r.source_id) : String(r.source_name),
    kind: r.kind as DocumentPartKind,
    text: String(r.text),
    anchorId: String(r.anchor_id),
    page: Number(r.page),
    line: Number(r.line),
    ref: String(r.ref),
    createdAt: String(r.created_at),
  };
}

function relationRow(r: Record<string, unknown>): SourceRelation {
  return {
    sourceA: String(r.source_a),
    sourceB: String(r.source_b),
    nameA: r.name_a == null ? String(r.source_a) : String(r.name_a),
    nameB: r.name_b == null ? String(r.source_b) : String(r.name_b),
    relation: r.relation as RelationKind,
    reason: String(r.reason),
    confidence: Number(r.confidence),
    reviewItemId: r.review_item_id == null ? null : String(r.review_item_id),
    decision: (r.decision ?? null) as SourceRelation["decision"],
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
  };
}

function memoryRow(r: Record<string, unknown>): MemoryRecord {
  return {
    memoryId: String(r.memory_id),
    type: r.type as MemoryType,
    subject: String(r.subject),
    relation: String(r.relation),
    object: String(r.object),
    sourceId: r.source_id == null ? null : String(r.source_id),
    matterId: null,
    recordedAt: String(r.recorded_at),
    validFrom: r.valid_from == null ? null : String(r.valid_from),
    validUntil: r.valid_until == null ? null : String(r.valid_until),
    confidence: r.confidence == null ? null : Number(r.confidence),
    status: r.status as MemoryStatus,
    scope: "matter",
    supersedes: r.supersedes == null ? null : String(r.supersedes),
    proposedBy: String(r.proposed_by),
  };
}

function edgeRow(r: Record<string, unknown>): MatterEdge {
  return {
    fromKind: String(r.from_kind),
    fromId: String(r.from_id),
    relation: r.relation as MatterEdge["relation"],
    toKind: String(r.to_kind),
    toId: String(r.to_id),
    evidenceRef: String(r.evidence_ref),
    builtFrom: String(r.built_from),
    builtAt: String(r.built_at),
  };
}

export class EvidenceStore {
  private store: MatterStore;
  private db: DatabaseSync;

  constructor(store: MatterStore, db: DatabaseSync) {
    this.store = store;
    this.db = db;
  }

  private event(ctx: WriteContext, action: string, subject: string | null, data: Record<string, unknown> | null) {
    this.store.appendEvent(ctx, action, subject, data);
  }

  // ---- H8: facts ----

  facts(filter: { status?: string; type?: string; sourceId?: string; q?: string } = {}): FactRecord[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.status) {
      where.push("f.status = ?");
      args.push(filter.status);
    }
    if (filter.type) {
      where.push("f.type = ?");
      args.push(filter.type);
    }
    if (filter.sourceId) {
      where.push("f.source_id = ?");
      args.push(filter.sourceId);
    }
    const q = filter.q?.trim().toLowerCase();
    if (q) {
      where.push("(lower(f.text) LIKE ? OR lower(f.parties) LIKE ? OR lower(f.amount) LIKE ?)");
      for (let i = 0; i < 3; i++) args.push(`%${q}%`);
    }
    const sql = `SELECT f.*, s.name AS source_name FROM fact f LEFT JOIN source s ON s.id = f.source_id${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY f.created_at, f.rowid`;
    return (this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(factRow);
  }

  /** A candidate fact from the agent or the system; the advocate's fact is confirmed at once. */
  addFact(input: { text: string; type: string; sourceId?: string | null; anchorId?: string | null; page?: number | null; line?: number | null; eventId?: string | null; date?: string; amount?: string; parties?: string[]; relief?: string; method?: string }, ctx: WriteContext): FactRecord {
    const text = clean(input.text, 1000);
    if (!text) throw new MatterStoreError("FACT_TEXT_REQUIRED", "a fact needs its text");
    if (!(FACT_TYPES as readonly string[]).includes(input.type)) throw new MatterStoreError("BAD_FACT_TYPE", String(input.type));
    const who = author(ctx);
    if (who !== "advocate" && input.sourceId && this.db.prepare("SELECT 1 FROM fact WHERE source_id = ? AND anchor_id = ? AND text = ?").get(input.sourceId, input.anchorId ?? null, text)) {
      throw new MatterStoreError("FACT_EXISTS", "the same fact is already recorded from that line");
    }
    const id = randomUUID();
    const status: FactStatus = who === "advocate" ? "confirmed" : "candidate";
    const factDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? (input.date ?? "") : "";
    this.db
      .prepare("INSERT INTO fact (id, text, type, status, source_id, anchor_id, page, line, event_id, fact_date, amount, parties, issue_ids, argument_ids, relief, author, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?)")
      .run(String(id), text, input.type, status, input.sourceId ?? null, input.anchorId ?? null, input.page ?? null, input.line ?? null, input.eventId ?? null, factDate, clean(input.amount, 40), JSON.stringify((input.parties ?? []).map((p) => clean(p, 200)).filter(Boolean).slice(0, 20)), clean(input.relief, 1000), who, now(), who === "advocate" ? now() : null);
    this.event(ctx, "fact.added", id, { type: input.type, status, sourceId: input.sourceId ?? null, page: input.page ?? null, line: input.line ?? null, method: input.method ?? "" });
    return this.facts().find((f) => f.id === id)!;
  }

  /** Human-only: confirm, dispute or reject one fact. */
  decideFact(id: string, status: "confirmed" | "disputed" | "rejected", ctx: WriteContext): FactRecord {
    human(ctx, "decides a fact");
    if (status !== "confirmed" && status !== "disputed" && status !== "rejected") throw new MatterStoreError("BAD_STATUS", status);
    const res = this.db.prepare("UPDATE fact SET status = ?, decided_at = ? WHERE id = ?").run(status, now(), id);
    if (res.changes === 0) throw new MatterStoreError("FACT_NOT_FOUND", id);
    this.event(ctx, `fact.${status}`, id, null);
    return this.facts().find((f) => f.id === id)!;
  }

  /** Human-only: a corrected fact supersedes the old one; the old record stays. */
  supersedeFact(id: string, input: { text: string; type?: string; date?: string; amount?: string; parties?: string[]; relief?: string }, ctx: WriteContext): FactRecord {
    human(ctx, "supersedes a fact");
    const old = this.facts().find((f) => f.id === id);
    if (!old) throw new MatterStoreError("FACT_NOT_FOUND", id);
    const text = clean(input.text, 1000);
    if (!text) throw new MatterStoreError("FACT_TEXT_REQUIRED", "a fact needs its text");
    const next = this.addFact(
      {
        text,
        type: input.type ?? old.type,
        sourceId: old.sourceId,
        anchorId: old.anchorId,
        page: old.page,
        line: old.line,
        eventId: old.eventId,
        date: input.date ?? old.date,
        amount: input.amount ?? old.amount,
        parties: input.parties ?? old.parties,
        relief: input.relief ?? old.relief,
      },
      { actor: "advocate" },
    );
    this.db.prepare("UPDATE fact SET supersedes = ? WHERE id = ?").run(id, next.id);
    this.db.prepare("UPDATE fact SET status = 'superseded', decided_at = ? WHERE id = ?").run(now(), id);
    this.event(ctx, "fact.superseded", id, { by: next.id });
    return this.facts().find((f) => f.id === next.id)!;
  }

  /** Human-only: link a fact to issues, arguments and the relief. */
  linkFact(id: string, input: { issueIds?: string[]; argumentIds?: string[]; relief?: string }, ctx: WriteContext): FactRecord {
    human(ctx, "links a fact");
    const f = this.facts().find((x) => x.id === id);
    if (!f) throw new MatterStoreError("FACT_NOT_FOUND", id);
    this.db.prepare("UPDATE fact SET issue_ids = ?, argument_ids = ?, relief = ? WHERE id = ?").run(JSON.stringify(input.issueIds ?? f.issueIds), JSON.stringify(input.argumentIds ?? f.argumentIds), clean(input.relief ?? f.relief, 1000), id);
    this.event(ctx, "fact.linked", id, { issues: (input.issueIds ?? f.issueIds).length, arguments: (input.argumentIds ?? f.argumentIds).length });
    return this.facts().find((x) => x.id === id)!;
  }

  /** System: open one review item per contradiction. The values stay visible. */
  recordContradictions(contradictions: Contradiction[]): number {
    let opened = 0;
    for (const c of contradictions) {
      const detail = c.values.map((v) => `${v.value} (${v.text.slice(0, 120)})`).join(" / ");
      if (this.store.listReviewItems().some((r) => r.kind === "contradiction" && r.detail === detail)) continue;
      this.store.openReviewItem("contradiction", c.values[0]?.sourceId ?? null, c.values[0]?.page ?? null, `Contradiction of ${c.kind}: ${detail}`);
      opened++;
    }
    return opened;
  }

  // ---- H7: evidence ----

  evidenceList(filter: { sourceId?: string; q?: string } = {}): EvidenceRecord[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.sourceId) {
      where.push("e.source_id = ?");
      args.push(filter.sourceId);
    }
    if (filter.q?.trim()) {
      where.push("(lower(e.exhibit_number) LIKE ? OR lower(e.witness) LIKE ? OR lower(e.statement) LIKE ? OR lower(e.notes) LIKE ?)");
      for (let i = 0; i < 4; i++) args.push(`%${filter.q.trim().toLowerCase()}%`);
    }
    const sql = `SELECT e.*, s.name AS source_name FROM evidence e LEFT JOIN source s ON s.id = e.source_id${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY e.created_at, e.rowid`;
    return (this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(evidenceRow);
  }

  addEvidence(input: { sourceId: string; exhibitNumber?: string; witness?: string; statement?: string; givenBy?: string; givenAt?: string; electronic?: boolean; device?: string; authenticity?: EvidenceStatus; admissibility?: string; notes?: string }, ctx: WriteContext): EvidenceRecord {
    const source = this.store.getSource(input.sourceId);
    if (!source) throw new MatterStoreError("SOURCE_NOT_FOUND", input.sourceId);
    const who = author(ctx);
    const id = randomUUID();
    const authenticity = input.authenticity && ["candidate", "authentic", "disputed", "rejected"].includes(input.authenticity) ? input.authenticity : "candidate";
    this.db
      .prepare("INSERT INTO evidence (id, source_id, exhibit_number, witness, statement, given_by, given_at, hash, electronic, device, authenticity, admissibility, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.sourceId, clean(input.exhibitNumber, 60), clean(input.witness, 200), clean(input.statement, 4000), clean(input.givenBy, 200), clean(input.givenAt, 60), source.sha256, input.electronic ? 1 : 0, clean(input.device, 300), authenticity, clean(input.admissibility, 2000), clean(input.notes, 4000), who === "advocate" ? "confirmed" : "candidate", now());
    this.event(ctx, "evidence.added", id, { sourceId: input.sourceId, exhibitNumber: input.exhibitNumber ?? "", electronic: input.electronic === true });
    return this.evidenceList().find((e) => e.id === id)!;
  }

  /** Human-only: authenticity, admissibility, the chain and the notes. */
  updateEvidence(id: string, input: { exhibitNumber?: string; witness?: string; statement?: string; givenBy?: string; givenAt?: string; electronic?: boolean; device?: string; authenticity?: EvidenceStatus; admissibility?: string; notes?: string; status?: "candidate" | "confirmed" | "rejected" }, ctx: WriteContext): EvidenceRecord {
    human(ctx, "updates the evidence record");
    const e = this.evidenceList().find((x) => x.id === id);
    if (!e) throw new MatterStoreError("EVIDENCE_NOT_FOUND", id);
    this.db
      .prepare("UPDATE evidence SET exhibit_number = ?, witness = ?, statement = ?, given_by = ?, given_at = ?, electronic = ?, device = ?, authenticity = ?, admissibility = ?, notes = ?, status = ? WHERE id = ?")
      .run(clean(input.exhibitNumber ?? e.exhibitNumber, 60), clean(input.witness ?? e.witness, 200), clean(input.statement ?? e.statement, 4000), clean(input.givenBy ?? e.givenBy, 200), clean(input.givenAt ?? e.givenAt, 60), (input.electronic ?? e.electronic) ? 1 : 0, clean(input.device ?? e.device, 300), input.authenticity ?? e.authenticity, clean(input.admissibility ?? e.admissibility, 2000), clean(input.notes ?? e.notes, 4000), input.status ?? e.status, id);
    this.event(ctx, "evidence.updated", id, { authenticity: input.authenticity ?? e.authenticity, status: input.status ?? e.status });
    return this.evidenceList().find((x) => x.id === id)!;
  }

  // ---- H6: document structure ----

  parts(sourceId?: string): DocumentPart[] {
    const sql = `SELECT p.*, s.name AS source_name FROM document_part p LEFT JOIN source s ON s.id = p.source_id${sourceId ? " WHERE p.source_id = ?" : ""} ORDER BY p.source_id, p.page, p.line`;
    return (this.db.prepare(sql).all(...(sourceId ? [sourceId] : [])) as Array<Record<string, unknown>>).map(partRow);
  }

  /** System: replace one source's parts. The extraction is deterministic. */
  setParts(sourceId: string, parts: Array<{ kind: DocumentPartKind; text: string; anchorId: string; page: number; line: number; ref?: string }>): number {
    this.db.prepare("DELETE FROM document_part WHERE source_id = ?").run(sourceId);
    const ins = this.db.prepare("INSERT INTO document_part (id, source_id, kind, text, anchor_id, page, line, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const p of parts.slice(0, 500)) ins.run(randomUUID(), sourceId, p.kind, clean(p.text, 1000), p.anchorId, p.page, p.line, clean(p.ref, 120), now());
    this.event({ actor: "system" }, "document.parts_set", sourceId, { parts: parts.length });
    return parts.length;
  }

  // ---- H5: source relations ----

  relations(): SourceRelation[] {
    return (this.db.prepare("SELECT r.*, a.name AS name_a, b.name AS name_b FROM source_relation r LEFT JOIN source a ON a.id = r.source_a LEFT JOIN source b ON b.id = r.source_b ORDER BY r.rowid").all() as Array<Record<string, unknown>>).map(relationRow);
  }

  /** System: record one proposal and its review item. A pair already recorded is not opened again. */
  recordRelation(input: { a: string; b: string; relation: RelationKind; reason: string; confidence: number }): number {
    const [a, b] = input.a < input.b ? [input.a, input.b] : [input.b, input.a];
    if (this.db.prepare("SELECT 1 FROM source_relation WHERE source_a = ? AND source_b = ? AND relation = ?").get(a, b, input.relation)) return 0;
    const na = this.store.getSource(a)?.name ?? a;
    const nb = this.store.getSource(b)?.name ?? b;
    const reviewItemId = this.store.openReviewItem("source_relation", a, null, `${na} and ${nb}: possible ${input.relation.replace(/_/g, " ")}. ${input.reason}`);
    this.db.prepare("INSERT INTO source_relation (source_a, source_b, relation, reason, confidence, review_item_id) VALUES (?, ?, ?, ?, ?, ?)").run(a, b, input.relation, clean(input.reason, 1000), input.confidence, reviewItemId);
    return 1;
  }

  /** Human-only: same or different; nothing is merged. */
  decideRelation(reviewItemId: string, decision: "same" | "different", ctx: WriteContext): SourceRelation[] {
    human(ctx, "decides a source relation");
    const r = this.relations().find((x) => x.reviewItemId === reviewItemId);
    if (!r) throw new MatterStoreError("RELATION_NOT_FOUND", reviewItemId);
    this.store.decideReviewItem(reviewItemId, "resolved", ctx);
    this.db.prepare("UPDATE source_relation SET decision = ?, decided_at = ? WHERE review_item_id = ?").run(decision, now(), reviewItemId);
    this.event(ctx, "source.relation_decided", reviewItemId, { decision, relation: r.relation });
    return this.relations();
  }

  // ---- G2: the matter evidence graph ----

  edges(filter: { fromKind?: string; fromId?: string; toKind?: string; toId?: string } = {}): MatterEdge[] {
    const where: string[] = [];
    const args: string[] = [];
    for (const [k, v] of Object.entries(filter)) {
      if (!v) continue;
      const col = k === "fromKind" ? "from_kind" : k === "fromId" ? "from_id" : k === "toKind" ? "to_kind" : "to_id";
      where.push(`${col} = ?`);
      args.push(v);
    }
    return (this.db.prepare(`SELECT * FROM matter_edge${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY from_kind, from_id, relation, to_kind, to_id`).all(...args) as Array<Record<string, unknown>>).map(edgeRow);
  }

  addEdge(fromKind: string, fromId: string, relation: MatterEdge["relation"], toKind: string, toId: string, evidenceRef = "", builtFrom = "record"): void {
    this.db.prepare("INSERT OR IGNORE INTO matter_edge (from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(fromKind, fromId, relation, toKind, toId, evidenceRef, builtFrom, now());
  }

  /** System: rebuild the graph from facts, evidence, parts, events, issues and record cells. */
  rebuildEdges(): number {
    this.db.exec("DELETE FROM matter_edge");
    for (const f of this.facts()) {
      if (f.sourceId) this.addEdge("fact", f.id, "derived_from", "source", f.sourceId, f.anchorId ?? "", "fact");
      if (f.eventId) this.addEdge("fact", f.id, "about", "event", f.eventId, f.anchorId ?? "", "fact");
      for (const issue of f.issueIds) this.addEdge("fact", f.id, "proves_element", "issue", issue, f.anchorId ?? "", "fact");
      for (const arg of f.argumentIds) this.addEdge("fact", f.id, "supports", "argument", arg, f.anchorId ?? "", "fact");
      if (f.type === "admission") this.addEdge("fact", f.id, "admits", "source", f.sourceId ?? "", f.anchorId ?? "", "fact");
      if (f.type === "denial") this.addEdge("fact", f.id, "denies", "source", f.sourceId ?? "", f.anchorId ?? "", "fact");
    }
    for (const e of this.evidenceList()) this.addEdge("evidence", e.id, "derived_from", "source", e.sourceId, e.hash, "evidence");
    for (const p of this.parts()) this.addEdge("part", p.id, "part_of", "source", p.sourceId, p.anchorId, "structure");
    for (const ev of this.store.listNotebookEvents()) this.addEdge("event", ev.id, "derived_from", "source", ev.sourceId, ev.anchorId, "notebook");
    for (const i of this.store.work.listIssues()) this.addEdge("issue", i.id, "about", "matter", this.store.matter().id, "", "issue");
    for (const c of this.store.work.recordTable().cells) this.addEdge("record_cell", `${c.sourceId}/${c.columnId}`, "derived_from", "source", c.sourceId, c.anchorId, "record_cell");
    return this.edges().length;
  }

  // ---- F1, F3, F4: typed matter memory ----

  memory(filter: { status?: string; type?: string; q?: string } = {}): MemoryRecord[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    if (filter.type) {
      where.push("type = ?");
      args.push(filter.type);
    }
    if (filter.q?.trim()) {
      where.push("(lower(subject) LIKE ? OR lower(object) LIKE ? OR lower(relation) LIKE ?)");
      for (let i = 0; i < 3; i++) args.push(`%${filter.q.trim().toLowerCase()}%`);
    }
    return (this.db.prepare(`SELECT * FROM memory${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY recorded_at, rowid`).all(...args) as Array<Record<string, unknown>>).map(memoryRow);
  }

  proposeMemory(input: { type: string; subject: string; relation: string; object: string; sourceId?: string | null; anchorId?: string | null; validFrom?: string | null; validUntil?: string | null; confidence?: number | null; supersedes?: string | null }, ctx: WriteContext): MemoryRecord {
    if (!(MEMORY_TYPES as readonly string[]).includes(input.type)) throw new MatterStoreError("BAD_TYPE", `unknown memory type ${input.type}`);
    if (ADVOCATE_SCOPE_TYPES.includes(input.type as never)) throw new MatterStoreError("ADVOCATE_SCOPE", `${input.type} belongs in advocate memory`);
    const subject = clean(input.subject, 300);
    const object = clean(input.object, 2000);
    if (!subject || !object) throw new MatterStoreError("BAD_MEMORY", "a memory record needs a subject and an object");
    const who = author(ctx);
    if (who === "system") throw new MatterStoreError("BAD_ACTOR", "the system does not propose memory");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO memory (memory_id, type, subject, relation, object, source_id, anchor_id, recorded_at, valid_from, valid_until, confidence, status, scope, supersedes, proposed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'matter', ?, ?)")
      .run(id, input.type, subject, clean(input.relation, 120) || "is", object, input.sourceId ?? null, input.anchorId ?? null, now(), input.validFrom ?? null, input.validUntil ?? null, input.confidence ?? null, who === "advocate" ? "confirmed" : "proposed", input.supersedes ?? null, who);
    this.event(ctx, "matter_memory.proposed", id, { type: input.type, supersedes: input.supersedes ?? null });
    return this.memory().find((m) => m.memoryId === id)!;
  }

  /** Human-only: confirm, reject, make tentative, expire, archive or deprecate. */
  decideMemory(id: string, status: MemoryStatus, ctx: WriteContext): MemoryRecord {
    human(ctx, "decides a matter memory record");
    if (!(MEMORY_STATUSES as readonly string[]).includes(status)) throw new MatterStoreError("BAD_STATUS", status);
    const row = this.db.prepare("SELECT * FROM memory WHERE memory_id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new MatterStoreError("NOT_FOUND", `no matter memory record ${id}`);
    this.db.prepare("UPDATE memory SET status = ?, decided_at = ? WHERE memory_id = ?").run(status, now(), id);
    if (status === "confirmed" && row.supersedes) this.db.prepare("UPDATE memory SET status = 'superseded', decided_at = ? WHERE memory_id = ?").run(now(), String(row.supersedes));
    this.event(ctx, "matter_memory.decided", id, { status });
    return this.memory().find((m) => m.memoryId === id)!;
  }

  // ---- H4: page marks ----

  marks(sourceId?: string): PageMark[] {
    const rows = (sourceId ? this.db.prepare("SELECT * FROM page_mark WHERE source_id = ? ORDER BY page, kind").all(sourceId) : this.db.prepare("SELECT * FROM page_mark ORDER BY source_id, page, kind").all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ id: String(r.id), sourceId: String(r.source_id), page: Number(r.page), kind: r.kind as PageMark["kind"], x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h), confidence: Number(r.confidence), note: String(r.note), createdAt: String(r.created_at) }));
  }

  addMark(input: Omit<PageMark, "id" | "createdAt">): PageMark {
    const id = randomUUID();
    this.db.prepare("INSERT INTO page_mark (id, source_id, page, kind, x, y, w, h, confidence, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.sourceId, input.page, input.kind, input.x, input.y, input.w, input.h, input.confidence, clean(input.note, 500), now());
    this.event({ actor: "system" }, "page.marked", input.sourceId, { page: input.page, kind: input.kind });
    return this.marks(input.sourceId).find((m) => m.id === id)!;
  }

  clearMarks(sourceId: string): void {
    this.db.prepare("DELETE FROM page_mark WHERE source_id = ?").run(sourceId);
  }

  /** True when the extraction has read this source once. */
  isAnalysed(sourceId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM source_analysis WHERE source_id = ?").get(sourceId);
  }

  markAnalysed(sourceId: string): void {
    this.db.prepare("INSERT OR REPLACE INTO source_analysis (source_id, analysed_at) VALUES (?, ?)").run(sourceId, now());
  }

  // ---- H13: document operations ----

  operations(): DocumentOperation[] {
    return (this.db.prepare("SELECT * FROM document_operation ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      kind: r.kind as DocumentOperation["kind"],
      inputs: json<Array<{ sourceId: string; pages?: number[] }>>(r.inputs, []),
      outputSourceId: r.output_source_id == null ? null : String(r.output_source_id),
      log: json<Record<string, unknown>>(r.log, {}),
      createdAt: String(r.created_at),
    }));
  }

  addOperation(input: Omit<DocumentOperation, "id" | "createdAt">, ctx: WriteContext = { actor: "advocate" }): DocumentOperation {
    const id = randomUUID();
    this.db.prepare("INSERT INTO document_operation (id, kind, inputs, output_source_id, log, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.kind, JSON.stringify(input.inputs), input.outputSourceId ?? null, JSON.stringify(input.log), now());
    this.event(ctx, "document.operation", id, { kind: input.kind, output: input.outputSourceId ?? null });
    return this.operations().find((o) => o.id === id)!;
  }

  // ---- D3: forum clauses ----

  forumClauses(): ForumClause[] {
    return (this.db.prepare("SELECT f.*, s.name AS source_name FROM forum_clause f LEFT JOIN source s ON s.id = f.source_id ORDER BY f.source_id, f.page, f.line").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      sourceId: String(r.source_id),
      sourceName: String(r.source_name ?? r.source_id),
      text: String(r.text),
      kind: r.kind as ForumClause["kind"],
      anchorId: String(r.anchor_id),
      page: Number(r.page),
      line: Number(r.line),
    }));
  }

  setForumClauses(sourceId: string, clauses: Array<Omit<ForumClause, "id" | "sourceId" | "sourceName">>): number {
    this.db.prepare("DELETE FROM forum_clause WHERE source_id = ?").run(sourceId);
    const ins = this.db.prepare("INSERT INTO forum_clause (id, source_id, text, kind, anchor_id, page, line, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const c of clauses.slice(0, 100)) ins.run(randomUUID(), sourceId, clean(c.text, 1000), c.kind, c.anchorId, c.page, c.line, now());
    this.event({ actor: "system" }, "forum.clauses_set", sourceId, { clauses: clauses.length });
    return clauses.length;
  }

  // ---- D1: jurisdiction report ----

  jurisdiction(): JurisdictionReport | null {
    const r = this.db.prepare("SELECT report FROM jurisdiction_report WHERE id = 1").get() as { report: string } | undefined;
    return r ? (json<JurisdictionReport>(r.report, null as never) as JurisdictionReport | null) : null;
  }

  setJurisdiction(report: JurisdictionReport, ctx: WriteContext): JurisdictionReport {
    human(ctx, "records the jurisdiction report");
    this.db.prepare("INSERT INTO jurisdiction_report (id, report, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET report = excluded.report, updated_at = excluded.updated_at").run(JSON.stringify(report), now());
    this.event(ctx, "jurisdiction.recorded", null, { undetermined: report.undetermined, forum: report.forum });
    return this.jurisdiction()!;
  }

  setJurisdictionSystem(report: JurisdictionReport): JurisdictionReport {
    this.db.prepare("INSERT INTO jurisdiction_report (id, report, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET report = excluded.report, updated_at = excluded.updated_at").run(JSON.stringify(report), now());
    this.event({ actor: "system" }, "jurisdiction.proposed", null, { undetermined: report.undetermined, forum: report.forum });
    return this.jurisdiction()!;
  }
}
