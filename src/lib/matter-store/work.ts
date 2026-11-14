/**
 * The matter store, second part: records of steps 6 to 10 (decision 4: still the single writer).
 * Plain library: no Electron import and no Pi import (decision 6).
 *
 * Every write is either the advocate's (human-only, decision 5), the agent's (a candidate or a
 * proposal), or the system's (a computed record). Each write appends an event to the matter's
 * event record. Specs: docs/specs/v0-research.md, v0-citations.md, v0-filing.md,
 * v0-capture.md, v0-agent-filing.md.
 */
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { MatterStoreError, type MatterStore } from "./index.ts";
import type { WriteContext } from "../../shared/records.ts";
import type {
  AdverseReview,
  AnnexureRecord,
  Attestation,
  AuthorityRecord,
  CaptureRecord,
  CitationCheck,
  FilingConfirmation,
  FilingSetRecord,
  IssueRecord,
  LimitationRecord,
  MatterDetails,
  MemorandumRecord,
  DuplicatePair,
  MemoryProposal,
  RecordCell,
  RecordColumn,
  RecordTable,
} from "../../shared/work.ts";

export const WORK_SCHEMA = `
CREATE TABLE IF NOT EXISTS matter_details (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  petitioner TEXT NOT NULL DEFAULT '',
  respondent TEXT NOT NULL DEFAULT '',
  case_number TEXT NOT NULL DEFAULT '',
  cnr TEXT NOT NULL DEFAULT '',
  court TEXT NOT NULL DEFAULT '',
  impugned_event_id TEXT,
  updated_at TEXT NOT NULL,
  interim_relief TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE IF NOT EXISTS source_type (
  source_id TEXT PRIMARY KEY,
  proposed TEXT NOT NULL,
  matched TEXT NOT NULL,
  method TEXT NOT NULL,
  proposed_at TEXT NOT NULL,
  confirmed TEXT,
  decided_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS duplicate_pair (
  source_a TEXT NOT NULL,
  source_b TEXT NOT NULL,
  overlap REAL NOT NULL,
  review_item_id TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('same', 'different')),
  decided_at TEXT,
  PRIMARY KEY (source_a, source_b)
) STRICT;
CREATE TABLE IF NOT EXISTS lod_row (
  event_id TEXT PRIMARY KEY,
  position INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS memory_proposal (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS legal_issue (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'accepted', 'rejected')),
  reason TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS authority (
  id TEXT PRIMARY KEY,
  citation TEXT NOT NULL,
  parties TEXT NOT NULL DEFAULT '',
  decision_date TEXT NOT NULL DEFAULT '',
  paragraph TEXT NOT NULL DEFAULT '',
  proposition TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('supporting', 'adverse', 'distinguishable', 'other')),
  issue_id TEXT,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'adopted', 'rejected')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS memorandum (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  issue_id TEXT,
  body TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  refs TEXT NOT NULL,
  unresolved TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS citation_check (
  id TEXT PRIMARY KEY,
  citation TEXT NOT NULL,
  draft_id TEXT,
  revision_id TEXT,
  parties TEXT,
  decision_date TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'failed', 'unresolved', 'not_applicable')),
  reason TEXT,
  record TEXT NOT NULL,
  checked_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS citation_attestation (
  id TEXT PRIMARY KEY,
  citation TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor = 'advocate'),
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS adverse_review (
  id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL CHECK (outcome IN ('found_addressed', 'none_found', 'incomplete')),
  coverage TEXT NOT NULL,
  note TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor = 'advocate'),
  at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS annexure (
  source_id TEXT PRIMARY KEY REFERENCES source(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS limitation (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  start_event_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  deadline TEXT NOT NULL,
  working TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS filing_set (
  id TEXT PRIMARY KEY,
  manifest TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  folder TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS filing_confirmation (
  id TEXT PRIMARY KEY,
  filing_set_id TEXT NOT NULL REFERENCES filing_set(id),
  payload_sha256 TEXT NOT NULL,
  step INTEGER NOT NULL CHECK (step IN (1, 2)),
  actor TEXT NOT NULL CHECK (actor = 'advocate'),
  at TEXT NOT NULL,
  UNIQUE (filing_set_id, step)
) STRICT;
CREATE TABLE IF NOT EXISTS capture (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source(id),
  method TEXT NOT NULL CHECK (method IN ('portal_browser', 'email', 'filing_receipt')),
  url TEXT NOT NULL,
  detail TEXT NOT NULL,
  captured_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS memorandum_no_update BEFORE UPDATE ON memorandum BEGIN SELECT RAISE(ABORT, 'memoranda are written once'); END;
CREATE TRIGGER IF NOT EXISTS citation_check_no_update BEFORE UPDATE ON citation_check BEGIN SELECT RAISE(ABORT, 'checks are written once'); END;
CREATE TRIGGER IF NOT EXISTS attestation_no_update BEFORE UPDATE ON citation_attestation BEGIN SELECT RAISE(ABORT, 'attestations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS attestation_no_delete BEFORE DELETE ON citation_attestation BEGIN SELECT RAISE(ABORT, 'attestations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS adverse_no_update BEFORE UPDATE ON adverse_review BEGIN SELECT RAISE(ABORT, 'reviews are append-only'); END;
CREATE TRIGGER IF NOT EXISTS confirmation_no_update BEFORE UPDATE ON filing_confirmation BEGIN SELECT RAISE(ABORT, 'confirmations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS confirmation_no_delete BEFORE DELETE ON filing_confirmation BEGIN SELECT RAISE(ABORT, 'confirmations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS filing_set_no_update BEFORE UPDATE ON filing_set BEGIN SELECT RAISE(ABORT, 'filing sets are written once'); END;
CREATE TABLE IF NOT EXISTS record_column (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS record_cell (
  source_id TEXT NOT NULL,
  column_id TEXT NOT NULL REFERENCES record_column(id),
  answer TEXT NOT NULL,
  quote TEXT NOT NULL,
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  anchor_id TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, column_id)
) STRICT;
`;

const now = () => new Date().toISOString();

function human(ctx: WriteContext, what: string): void {
  if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", `only the advocate ${what}`);
}

function author(ctx: WriteContext): "advocate" | "agent" {
  if (ctx.actor === "advocate" || ctx.actor === "agent") return ctx.actor;
  throw new MatterStoreError("BAD_ACTOR", "the advocate or the agent writes this record");
}

const clean = (s: unknown, max = 4000) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export class WorkStore {
  private store: MatterStore;
  private db: DatabaseSync;

  constructor(store: MatterStore, db: DatabaseSync) {
    this.store = store;
    this.db = db;
  }

  private event(ctx: WriteContext, action: string, subject: string | null, data: Record<string, unknown> | null) {
    this.store.appendEvent(ctx, action, subject, data);
  }

  // ---- V1-5: the record table (v1 spec; after Mike's tabular review) ----

  recordTable(): RecordTable {
    const columns = (this.db.prepare("SELECT * FROM record_column ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map(
      (r): RecordColumn => ({ id: String(r.id), question: String(r.question), createdAt: String(r.created_at) }),
    );
    const cells = (this.db.prepare("SELECT * FROM record_cell").all() as Array<Record<string, unknown>>).map(
      (r): RecordCell => ({
        sourceId: String(r.source_id),
        columnId: String(r.column_id),
        answer: String(r.answer),
        quote: String(r.quote),
        page: Number(r.page),
        line: Number(r.line),
        anchorId: String(r.anchor_id),
        author: r.author as RecordCell["author"],
        status: r.status as RecordCell["status"],
        updatedAt: String(r.updated_at),
      }),
    );
    return { columns, cells };
  }

  /** Human-only: the advocate asks a question of every source. */
  addRecordColumn(question: string, ctx: WriteContext): RecordColumn {
    human(ctx, "adds a record table column");
    const q = clean(question, 300);
    if (!q) throw new MatterStoreError("COLUMN_TEXT_REQUIRED", "a column needs its question");
    const id = randomUUID();
    this.db.prepare("INSERT INTO record_column (id, question, created_at) VALUES (?, ?, ?)").run(id, q, now());
    this.event(ctx, "record_column.added", id, { question: q });
    return this.recordTable().columns.find((c) => c.id === id)!;
  }

  /**
   * One cell. The caller has already found the quote on the named line (main/record-table.ts).
   * The agent's cell is a candidate; a new answer replaces the old one and is a candidate again.
   */
  fillRecordCell(input: Omit<RecordCell, "author" | "status" | "updatedAt">, ctx: WriteContext): RecordCell {
    const who = author(ctx);
    if (!this.recordTable().columns.some((c) => c.id === input.columnId)) throw new MatterStoreError("COLUMN_NOT_FOUND", input.columnId);
    const answer = clean(input.answer, 1000);
    if (!answer) throw new MatterStoreError("ANSWER_REQUIRED", "a cell needs an answer");
    const status = who === "advocate" ? "confirmed" : "candidate";
    this.db
      .prepare(
        "INSERT INTO record_cell (source_id, column_id, answer, quote, page, line, anchor_id, author, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT (source_id, column_id) DO UPDATE SET answer = excluded.answer, quote = excluded.quote, page = excluded.page, line = excluded.line, anchor_id = excluded.anchor_id, author = excluded.author, status = excluded.status, updated_at = excluded.updated_at",
      )
      .run(input.sourceId, input.columnId, answer, clean(input.quote, 1000), input.page, input.line, input.anchorId, who, status, now());
    this.event(ctx, "record_cell.filled", `${input.sourceId}/${input.columnId}`, { author: who, page: input.page, line: input.line });
    return this.recordTable().cells.find((c) => c.sourceId === input.sourceId && c.columnId === input.columnId)!;
  }

  /** Human-only: confirm or clear one cell. */
  decideRecordCell(sourceId: string, columnId: string, decision: "confirm" | "clear", ctx: WriteContext): RecordTable {
    human(ctx, "confirms or clears a record table cell");
    const exists = this.db.prepare("SELECT 1 FROM record_cell WHERE source_id = ? AND column_id = ?").get(sourceId, columnId);
    if (!exists) throw new MatterStoreError("CELL_NOT_FOUND", `${sourceId}/${columnId}`);
    if (decision === "confirm") this.db.prepare("UPDATE record_cell SET status = 'confirmed', updated_at = ? WHERE source_id = ? AND column_id = ?").run(now(), sourceId, columnId);
    else this.db.prepare("DELETE FROM record_cell WHERE source_id = ? AND column_id = ?").run(sourceId, columnId);
    this.event(ctx, `record_cell.${decision === "confirm" ? "confirmed" : "cleared"}`, `${sourceId}/${columnId}`, null);
    return this.recordTable();
  }

  // ---- V2-2: document type ----

  /** System: record a proposal once per source. A later run never replaces it. */
  proposeSourceType(sourceId: string, type: string, matched: string, method: string): boolean {
    const r = this.db.prepare("INSERT INTO source_type (source_id, proposed, matched, method, proposed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").run(sourceId, type, matched, method, now());
    if (Number(r.changes) === 0) return false;
    this.event({ actor: "system" }, "source.type_proposed", sourceId, { type, matched, method });
    return true;
  }

  /** Sources whose text is read and that have no type yet. */
  sourcesWithoutType(): string[] {
    return (this.db.prepare("SELECT j.source_id FROM ingest_job j LEFT JOIN source_type t ON t.source_id = j.source_id WHERE j.state = 'done' AND t.source_id IS NULL").all() as Array<{ source_id: string }>).map((r) => String(r.source_id));
  }

  /** Human-only: the advocate confirms the proposal or sets another type. */
  setSourceType(sourceId: string, type: string, ctx: WriteContext): void {
    human(ctx, "sets a document type");
    if (!this.store.getSource(sourceId)) throw new MatterStoreError("SOURCE_NOT_FOUND", sourceId);
    this.db
      .prepare("INSERT INTO source_type (source_id, proposed, matched, method, proposed_at, confirmed, decided_at) VALUES (?, ?, '', 'advocate', ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET confirmed = excluded.confirmed, decided_at = excluded.decided_at")
      .run(sourceId, type, now(), type, now());
    this.event(ctx, "source.type_set", sourceId, { type });
  }

  // ---- V2-3: same text, different files ----

  listDuplicates(): DuplicatePair[] {
    return (this.db.prepare("SELECT * FROM duplicate_pair ORDER BY rowid").all() as Array<Record<string, unknown>>).map((r) => ({
      sourceA: String(r.source_a),
      sourceB: String(r.source_b),
      overlap: Number(r.overlap),
      reviewItemId: String(r.review_item_id),
      decision: (r.decision ?? null) as DuplicatePair["decision"],
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
    }));
  }

  /** System: open one review item per new pair. A pair already recorded is not opened again. */
  recordDuplicates(pairs: Array<{ a: string; b: string; overlap: number }>): number {
    let opened = 0;
    for (const p of pairs) {
      const [a, b] = p.a < p.b ? [p.a, p.b] : [p.b, p.a];
      if (this.db.prepare("SELECT 1 FROM duplicate_pair WHERE source_a = ? AND source_b = ?").get(a, b)) continue;
      const na = this.store.getSource(a)?.name ?? a;
      const nb = this.store.getSource(b)?.name ?? b;
      const id = this.store.openReviewItem(
        "possible_duplicate",
        a,
        null,
        `${na} and ${nb} have ${Math.round(p.overlap * 100)}% of their text in common. Both files are kept. Decide whether they are the same document.`,
      );
      this.db.prepare("INSERT INTO duplicate_pair (source_a, source_b, overlap, review_item_id) VALUES (?, ?, ?, ?)").run(a, b, p.overlap, id);
      opened++;
    }
    return opened;
  }

  /** Human-only: same document or different documents. Nothing is merged or hidden. */
  decideDuplicate(reviewItemId: string, decision: "same" | "different", ctx: WriteContext): DuplicatePair {
    human(ctx, "decides a possible duplicate");
    const pair = this.listDuplicates().find((d) => d.reviewItemId === reviewItemId);
    if (!pair) throw new MatterStoreError("DUPLICATE_NOT_FOUND", reviewItemId);
    this.store.decideReviewItem(reviewItemId, "resolved", ctx);
    this.db.prepare("UPDATE duplicate_pair SET decision = ?, decided_at = ? WHERE review_item_id = ?").run(decision, now(), reviewItemId);
    this.event(ctx, "duplicate.decided", reviewItemId, { sourceA: pair.sourceA, sourceB: pair.sourceB, decision });
    return this.listDuplicates().find((d) => d.reviewItemId === reviewItemId)!;
  }

  // ---- V2-5: the List of Dates rows ----

  lodRows(): string[] {
    return (this.db.prepare("SELECT event_id FROM lod_row ORDER BY position").all() as Array<{ event_id: string }>).map((r) => String(r.event_id));
  }

  /** Human-only: the rows of the List of Dates. An empty list clears the selection (every confirmed event). */
  setLodRows(eventIds: string[], ctx: WriteContext): string[] {
    human(ctx, "chooses the List of Dates rows");
    const known = new Set(this.store.listNotebookEvents().filter((e) => e.status === "confirmed").map((e) => e.id));
    for (const id of eventIds) if (!known.has(id)) throw new MatterStoreError("EVENT_NOT_CONFIRMED", id);
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM lod_row");
      const ins = this.db.prepare("INSERT INTO lod_row (event_id, position) VALUES (?, ?)");
      [...new Set(eventIds)].forEach((id, i) => ins.run(id, i + 1));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.event(ctx, "list_of_dates.rows_set", null, { rows: eventIds.length });
    return this.lodRows();
  }

  // ---- V2-8: memory proposals ----

  listMemoryProposals(): MemoryProposal[] {
    return (this.db.prepare("SELECT * FROM memory_proposal ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      text: String(r.text),
      reason: String(r.reason),
      status: r.status as MemoryProposal["status"],
      createdAt: String(r.created_at),
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
    }));
  }

  /** The agent proposes; it never writes memory.md. */
  proposeMemory(text: string, reason: string, ctx: WriteContext): MemoryProposal {
    if (ctx.actor !== "agent") throw new MatterStoreError("AGENT_ONLY", "memory proposals come from the agent; the advocate edits the memory directly");
    const t = String(text ?? "").trim().slice(0, 2000);
    if (!t) throw new MatterStoreError("TEXT_REQUIRED", "a proposal needs its text");
    const id = randomUUID();
    this.db.prepare("INSERT INTO memory_proposal (id, text, reason, status, created_at) VALUES (?, ?, ?, 'open', ?)").run(id, t, clean(reason, 500), now());
    this.event(ctx, "memory.proposed", id, { reason: clean(reason, 500) });
    return this.listMemoryProposals().find((m) => m.id === id)!;
  }

  /** Human-only. The caller appends an accepted text to memory.md (main/matters.ts). */
  decideMemoryProposal(id: string, accept: boolean, ctx: WriteContext): MemoryProposal {
    human(ctx, "decides a memory proposal");
    const m = this.listMemoryProposals().find((x) => x.id === id);
    if (!m) throw new MatterStoreError("PROPOSAL_NOT_FOUND", id);
    if (m.status !== "open") throw new MatterStoreError("ALREADY_DECIDED", id);
    this.db.prepare("UPDATE memory_proposal SET status = ?, decided_at = ? WHERE id = ?").run(accept ? "accepted" : "rejected", now(), id);
    this.event(ctx, `memory.proposal_${accept ? "accepted" : "rejected"}`, id, null);
    return this.listMemoryProposals().find((x) => x.id === id)!;
  }

  // ---- Matter details (workflow 2; step 1 second version, needed by steps 5, 9) ----

  details(): MatterDetails {
    const r = this.db.prepare("SELECT * FROM matter_details WHERE id = 1").get() as Record<string, unknown> | undefined;
    return {
      petitioner: String(r?.petitioner ?? ""),
      respondent: String(r?.respondent ?? ""),
      caseNumber: String(r?.case_number ?? ""),
      cnr: String(r?.cnr ?? ""),
      court: String(r?.court ?? ""),
      impugnedEventId: r?.impugned_event_id == null ? null : String(r.impugned_event_id),
      interimRelief: String(r?.interim_relief ?? ""),
      updatedAt: r?.updated_at == null ? null : String(r.updated_at),
    };
  }

  /** Human-only: what the advocate records about the matter. Missing information stays empty, never guessed. */
  setDetails(input: Partial<Omit<MatterDetails, "updatedAt">>, ctx: WriteContext): MatterDetails {
    human(ctx, "records the matter details");
    const d = { ...this.details(), ...input };
    this.db
      .prepare(
        `INSERT INTO matter_details (id, petitioner, respondent, case_number, cnr, court, impugned_event_id, interim_relief, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET petitioner = excluded.petitioner, respondent = excluded.respondent,
           case_number = excluded.case_number, cnr = excluded.cnr, court = excluded.court,
           impugned_event_id = excluded.impugned_event_id, interim_relief = excluded.interim_relief, updated_at = excluded.updated_at`,
      )
      .run(clean(d.petitioner, 300), clean(d.respondent, 300), clean(d.caseNumber, 200), clean(d.cnr, 40), clean(d.court, 300), d.impugnedEventId ?? null, clean(d.interimRelief, 2000), now());
    const after = this.details();
    this.event(ctx, "matter.details_set", null, { ...after });
    return after;
  }

  // ---- Notebook E: legal issues; the case conference decides them (workflow 5E, 7E) ----

  listIssues(): IssueRecord[] {
    return (this.db.prepare("SELECT * FROM legal_issue ORDER BY created_at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      text: String(r.text),
      author: r.author as "advocate" | "agent",
      status: r.status as IssueRecord["status"],
      reason: r.reason == null ? null : String(r.reason),
      createdAt: String(r.created_at),
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
    }));
  }

  /** The advocate's issue is accepted at once; the agent's is a candidate for the conference. */
  addIssue(text: string, ctx: WriteContext): IssueRecord {
    const who = author(ctx);
    const t = clean(text, 1000);
    if (!t) throw new MatterStoreError("ISSUE_TEXT_REQUIRED", "an issue needs its text");
    const id = randomUUID();
    const status = who === "advocate" ? "accepted" : "candidate";
    this.db.prepare("INSERT INTO legal_issue (id, text, author, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, t, who, status, now(), who === "advocate" ? now() : null);
    this.event(ctx, "issue.added", id, { author: who, status });
    return this.listIssues().find((i) => i.id === id)!;
  }

  /** Human-only (decision 5): the case conference accepts or rejects an issue, with a reason. */
  decideIssue(id: string, decision: "accepted" | "rejected", reason: string, ctx: WriteContext): IssueRecord {
    human(ctx, "decides an issue");
    const r = clean(reason, 1000);
    if (!r) throw new MatterStoreError("REASON_REQUIRED", "a conference decision needs a reason");
    const res = this.db.prepare("UPDATE legal_issue SET status = ?, reason = ?, decided_at = ? WHERE id = ?").run(decision, r, now(), id);
    if (res.changes === 0) throw new MatterStoreError("ISSUE_NOT_FOUND", id);
    this.event(ctx, `issue.${decision}`, id, { reason: r });
    return this.listIssues().find((i) => i.id === id)!;
  }

  // ---- Notebook F: authorities ----

  listAuthorities(): AuthorityRecord[] {
    return (this.db.prepare("SELECT * FROM authority ORDER BY created_at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      citation: String(r.citation),
      parties: String(r.parties),
      decisionDate: String(r.decision_date),
      paragraph: String(r.paragraph),
      proposition: String(r.proposition),
      role: r.role as AuthorityRecord["role"],
      issueId: r.issue_id == null ? null : String(r.issue_id),
      author: r.author as "advocate" | "agent",
      status: r.status as AuthorityRecord["status"],
      createdAt: String(r.created_at),
    }));
  }

  addAuthority(input: Omit<AuthorityRecord, "id" | "author" | "status" | "createdAt">, ctx: WriteContext): AuthorityRecord {
    const who = author(ctx);
    const citation = clean(input.citation, 200);
    if (!citation) throw new MatterStoreError("CITATION_REQUIRED", "an authority needs its citation");
    if (!["supporting", "adverse", "distinguishable", "other"].includes(input.role)) throw new MatterStoreError("BAD_ROLE", String(input.role));
    if (input.issueId && !this.listIssues().some((i) => i.id === input.issueId)) throw new MatterStoreError("ISSUE_NOT_FOUND", input.issueId);
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO authority (id, citation, parties, decision_date, paragraph, proposition, role, issue_id, author, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, citation, clean(input.parties, 500), clean(input.decisionDate, 20), clean(input.paragraph, 20), clean(input.proposition, 1000), input.role, input.issueId ?? null, who, who === "advocate" ? "adopted" : "candidate", now());
    this.event(ctx, "authority.added", id, { citation, role: input.role, author: who });
    return this.listAuthorities().find((a) => a.id === id)!;
  }

  /** Human-only: adopt or reject an authority the agent proposed. */
  decideAuthority(id: string, decision: "adopted" | "rejected", ctx: WriteContext): AuthorityRecord {
    human(ctx, "adopts or rejects an authority");
    const res = this.db.prepare("UPDATE authority SET status = ? WHERE id = ?").run(decision, id);
    if (res.changes === 0) throw new MatterStoreError("AUTHORITY_NOT_FOUND", id);
    this.event(ctx, `authority.${decision}`, id, null);
    return this.listAuthorities().find((a) => a.id === id)!;
  }

  // ---- Memoranda (workflow 7D). The references are checked before the memorandum is stored. ----

  listMemoranda(): MemorandumRecord[] {
    return (this.db.prepare("SELECT * FROM memorandum ORDER BY created_at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      issueId: r.issue_id == null ? null : String(r.issue_id),
      body: String(r.body),
      author: r.author as "advocate" | "agent",
      refs: JSON.parse(String(r.refs)) as string[],
      unresolved: JSON.parse(String(r.unresolved)) as string[],
      createdAt: String(r.created_at),
    }));
  }

  addMemorandum(input: { title: string; issueId: string | null; body: string; refs: string[]; unresolved: string[] }, ctx: WriteContext): MemorandumRecord {
    const who = author(ctx);
    const title = clean(input.title, 300);
    if (!title || !input.body.trim()) throw new MatterStoreError("MEMO_EMPTY", "a memorandum needs a title and a body");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO memorandum (id, title, issue_id, body, author, refs, unresolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, title, input.issueId ?? null, input.body.slice(0, 60000), who, JSON.stringify(input.refs), JSON.stringify(input.unresolved), now());
    this.event(ctx, "memorandum.written", id, { title, refs: input.refs.length, unresolved: input.unresolved.length });
    return this.listMemoranda().find((m) => m.id === id)!;
  }

  // ---- Citation checks (step 7). The outcome is the validator's; the store keeps its record. ----

  addCitationCheck(input: Omit<CitationCheck, "id" | "checkedAt" | "attested">, ctx: WriteContext): CitationCheck {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO citation_check (id, citation, draft_id, revision_id, parties, decision_date, outcome, reason, record, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.citation, input.draftId, input.revisionId, input.parties, input.decisionDate, input.outcome, input.reason, input.record, now());
    this.event(ctx, "citation.checked", id, { citation: input.citation, outcome: input.outcome, reason: input.reason, draftId: input.draftId });
    return this.listCitationChecks().find((c) => c.id === id)!;
  }

  listCitationChecks(): CitationCheck[] {
    const attested = new Set(this.listAttestations().map((a) => a.citation));
    return (this.db.prepare("SELECT * FROM citation_check ORDER BY checked_at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      citation: String(r.citation),
      draftId: r.draft_id == null ? null : String(r.draft_id),
      revisionId: r.revision_id == null ? null : String(r.revision_id),
      parties: r.parties == null ? null : String(r.parties),
      decisionDate: r.decision_date == null ? null : String(r.decision_date),
      outcome: r.outcome as CitationCheck["outcome"],
      reason: r.reason == null ? null : String(r.reason),
      record: String(r.record),
      checkedAt: String(r.checked_at),
      attested: attested.has(String(r.citation)),
    }));
  }

  /** Human-only (workflow 9B): an attestation is recorded as an attestation, never as verified. */
  attestCitation(citation: string, reason: string, ctx: WriteContext): Attestation {
    human(ctx, "attests a citation");
    const r = clean(reason, 1000);
    if (!r) throw new MatterStoreError("REASON_REQUIRED", "an attestation needs its reason");
    const c = clean(citation, 200);
    const id = randomUUID();
    this.db.prepare("INSERT INTO citation_attestation (id, citation, reason, actor, at) VALUES (?, ?, ?, 'advocate', ?)").run(id, c, r, now());
    this.event(ctx, "citation.attested", id, { citation: c, reason: r });
    return this.listAttestations().find((a) => a.id === id)!;
  }

  listAttestations(): Attestation[] {
    return (this.db.prepare("SELECT * FROM citation_attestation ORDER BY at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      citation: String(r.citation),
      reason: String(r.reason),
      at: String(r.at),
    }));
  }

  // ---- Adverse-authority review (workflow 9C) ----

  /** Human-only. "None found" needs the coverage it is stated within. */
  recordAdverseReview(outcome: AdverseReview["outcome"], coverage: string, note: string, ctx: WriteContext): AdverseReview {
    human(ctx, "records the adverse-authority review");
    if (!["found_addressed", "none_found", "incomplete"].includes(outcome)) throw new MatterStoreError("BAD_OUTCOME", String(outcome));
    const cov = clean(coverage, 2000);
    if (outcome === "none_found" && !cov) throw new MatterStoreError("COVERAGE_REQUIRED", "'none found' needs the search coverage it is stated within");
    if (outcome === "found_addressed" && !this.listAuthorities().some((a) => a.role === "adverse" && a.status !== "rejected")) {
      throw new MatterStoreError("NO_ADVERSE_AUTHORITY", "record the adverse authority in the Notebook before 'found and addressed'");
    }
    const id = randomUUID();
    this.db.prepare("INSERT INTO adverse_review (id, outcome, coverage, note, actor, at) VALUES (?, ?, ?, ?, 'advocate', ?)").run(id, outcome, cov, clean(note, 2000), now());
    this.event(ctx, "adverse_review.recorded", id, { outcome });
    return this.adverseReview()!;
  }

  adverseReview(): AdverseReview | null {
    const r = this.db.prepare("SELECT * FROM adverse_review ORDER BY at DESC, rowid DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    return r ? { id: String(r.id), outcome: r.outcome as AdverseReview["outcome"], coverage: String(r.coverage), note: String(r.note), at: String(r.at) } : null;
  }

  // ---- Annexures (workflow 8E) ----

  listAnnexures(): AnnexureRecord[] {
    return (this.db.prepare("SELECT a.source_id, a.position, a.title, s.name, s.sha256 FROM annexure a JOIN source s ON s.id = a.source_id ORDER BY a.position").all() as Array<Record<string, unknown>>).map((r, i) => ({
      sourceId: String(r.source_id),
      label: `Annexure P-${i + 1}`,
      title: String(r.title),
      sourceName: String(r.name),
      sha256: String(r.sha256),
    }));
  }

  /** Human-only: the advocate sets the annexures and their order. The labels follow the order. */
  setAnnexures(items: Array<{ sourceId: string; title: string }>, ctx: WriteContext): AnnexureRecord[] {
    human(ctx, "sets the annexures");
    const ids = new Set<string>();
    for (const it of items) {
      if (ids.has(it.sourceId)) throw new MatterStoreError("DUPLICATE_ANNEXURE", it.sourceId);
      ids.add(it.sourceId);
      const src = this.store.getSource(it.sourceId);
      if (!src) throw new MatterStoreError("SOURCE_NOT_FOUND", it.sourceId);
      if (src.mediaType !== "application/pdf") throw new MatterStoreError("ANNEXURE_NOT_PDF", `${src.name} is not a PDF. An annexure goes into the filing set as it is, so it must be a PDF.`);
    }
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM annexure");
      const ins = this.db.prepare("INSERT INTO annexure (source_id, position, title) VALUES (?, ?, ?)");
      items.forEach((it, i) => ins.run(it.sourceId, i + 1, clean(it.title, 300) || (this.store.getSource(it.sourceId)?.name ?? "Annexure")));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    const out = this.listAnnexures();
    this.event(ctx, "annexures.set", null, { annexures: out.map((a) => ({ label: a.label, sourceId: a.sourceId })) });
    return out;
  }

  // ---- Limitation (workflow 9E): computed by the system, confirmed by the advocate ----

  addLimitation(input: Omit<LimitationRecord, "id" | "confirmedAt" | "createdAt">): LimitationRecord {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO limitation (id, rule, start_event_id, start_date, days, deadline, working, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.rule, input.startEventId, input.startDate, input.days, input.deadline, input.working, now());
    this.event({ actor: "system" }, "limitation.computed", id, { deadline: input.deadline, rule: input.rule });
    return this.limitation()!;
  }

  limitation(): LimitationRecord | null {
    const r = this.db.prepare("SELECT * FROM limitation ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    return r
      ? {
          id: String(r.id),
          rule: String(r.rule),
          startEventId: String(r.start_event_id),
          startDate: String(r.start_date),
          days: Number(r.days),
          deadline: String(r.deadline),
          working: String(r.working),
          confirmedAt: r.confirmed_at == null ? null : String(r.confirmed_at),
          createdAt: String(r.created_at),
        }
      : null;
  }

  /** Human-only: the advocate confirms the computation as shown. */
  confirmLimitation(id: string, ctx: WriteContext): LimitationRecord {
    human(ctx, "confirms the limitation computation");
    const latest = this.limitation();
    if (!latest || latest.id !== id) throw new MatterStoreError("STALE_LIMITATION", "a newer computation exists; confirm that one");
    this.db.prepare("UPDATE limitation SET confirmed_at = ? WHERE id = ?").run(now(), id);
    this.event(ctx, "limitation.confirmed", id, { deadline: latest.deadline });
    return this.limitation()!;
  }

  // ---- Filing sets and their confirmations (workflow 10, 11) ----

  addFilingSet(manifest: Record<string, unknown>, folder: string, ctx: WriteContext): FilingSetRecord {
    human(ctx, "makes the filing set");
    const text = JSON.stringify(manifest);
    const payload = createHash("sha256").update(text).digest("hex");
    const id = randomUUID();
    this.db.prepare("INSERT INTO filing_set (id, manifest, payload_sha256, folder, created_at) VALUES (?, ?, ?, ?, ?)").run(id, text, payload, folder, now());
    this.event(ctx, "filing_set.made", id, { payloadSha256: payload });
    return this.filingSet(id)!;
  }

  filingSet(id?: string): FilingSetRecord | null {
    const r = (id
      ? this.db.prepare("SELECT * FROM filing_set WHERE id = ?").get(id)
      : this.db.prepare("SELECT * FROM filing_set ORDER BY created_at DESC, rowid DESC LIMIT 1").get()) as Record<string, unknown> | undefined;
    if (!r) return null;
    const confirmations = (this.db.prepare("SELECT * FROM filing_confirmation WHERE filing_set_id = ? ORDER BY step").all(String(r.id)) as Array<Record<string, unknown>>).map(
      (c): FilingConfirmation => ({ step: Number(c.step) as 1 | 2, payloadSha256: String(c.payload_sha256), at: String(c.at) }),
    );
    return {
      id: String(r.id),
      manifest: JSON.parse(String(r.manifest)) as FilingSetRecord["manifest"],
      payloadSha256: String(r.payload_sha256),
      folder: String(r.folder),
      createdAt: String(r.created_at),
      confirmations,
    };
  }

  /**
   * Human-only (workflow 11): a confirmation is bound to the payload hash the advocate saw.
   * The second needs the first, and a payload that changed is refused.
   */
  confirmFiling(filingSetId: string, payloadSha256: string, step: 1 | 2, ctx: WriteContext): FilingSetRecord {
    human(ctx, "confirms a filing");
    const set = this.filingSet(filingSetId);
    if (!set) throw new MatterStoreError("FILING_SET_NOT_FOUND", filingSetId);
    const latest = this.filingSet();
    if (latest?.id !== set.id) throw new MatterStoreError("STALE_FILING_SET", "a newer filing set exists");
    if (set.payloadSha256 !== payloadSha256) throw new MatterStoreError("PAYLOAD_MISMATCH", "the confirmation names another payload");
    if (step !== 1 && step !== 2) throw new MatterStoreError("BAD_STEP", String(step));
    if (step === 2 && !set.confirmations.some((c) => c.step === 1)) throw new MatterStoreError("FIRST_CONFIRMATION_REQUIRED", "confirm the filing set first");
    this.db.prepare("INSERT INTO filing_confirmation (id, filing_set_id, payload_sha256, step, actor, at) VALUES (?, ?, ?, ?, 'advocate', ?)").run(randomUUID(), set.id, payloadSha256, step, now());
    this.event(ctx, `filing.confirmed_${step}`, set.id, { payloadSha256 });
    return this.filingSet(set.id)!;
  }

  // ---- Capture provenance (workflow 3; Appendix B-B kind 2) ----

  addCapture(sourceId: string, method: CaptureRecord["method"], url: string, detail: Record<string, unknown>, ctx: WriteContext): CaptureRecord {
    const id = randomUUID();
    this.db.prepare("INSERT INTO capture (id, source_id, method, url, detail, captured_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, sourceId, method, url, JSON.stringify(detail), now());
    this.event(ctx, "source.captured", sourceId, { method, url, ...detail });
    return this.listCaptures().find((c) => c.id === id)!;
  }

  listCaptures(): CaptureRecord[] {
    return (this.db.prepare("SELECT * FROM capture ORDER BY captured_at").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      sourceId: String(r.source_id),
      method: r.method as CaptureRecord["method"],
      url: String(r.url),
      detail: JSON.parse(String(r.detail)) as Record<string, unknown>,
      capturedAt: String(r.captured_at),
    }));
  }
}
