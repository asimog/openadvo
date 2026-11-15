/**
 * Q4: intel.db, the local intelligence store (decision 12; architecture.md sections 3 and 8).
 * Phase 1 builds the store, its versioned source rows, the freshness rule (decision 16) and the
 * hash-chained audit. The court directory and the packs fill it from phase 2 (features B1 to B17).
 * One writer: this class. Plain library.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CHAIN_SCHEMA, StoreError, appendChained, checkChain, inTransaction, type ChainCheck } from "../store-chain/index.ts";
import { ACCESS_METHODS, type AccessMethod, type Freshness, type IntelSource } from "../../shared/stores.ts";
import type { WriteContext } from "../../shared/records.ts";
import { PACKS_SCHEMA, benchRow, listRow, type NewItem } from "./packs.ts";
import type { AdapterProceeding, BenchRow, ListKind, PackList } from "../../shared/intel.ts";

export type { NewItem };

export const INTEL_DB = "intel.db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS source (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  owner TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  checked_by TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  access_method TEXT NOT NULL CHECK (access_method IN (${ACCESS_METHODS.map((m) => `'${m}'`).join(", ")})),
  reliability TEXT NOT NULL,
  check_days INTEGER NOT NULL CHECK (check_days > 0),
  superseded_by TEXT REFERENCES source(id),
  UNIQUE (key, version)
) STRICT;
CREATE TRIGGER IF NOT EXISTS source_no_delete BEFORE DELETE ON source BEGIN SELECT RAISE(ABORT, 'source rows are versioned, never deleted'); END;
`;

const DAY = 86_400_000;

/** Decision 16: stale once the check interval has passed since the row was retrieved. */
export function freshness(row: Pick<IntelSource, "retrievedAt" | "checkDays">, now: Date = new Date()): Freshness {
  const due = new Date(Date.parse(row.retrievedAt) + row.checkDays * DAY);
  return { state: now.getTime() > due.getTime() ? "stale" : "fresh", since: due.toISOString().slice(0, 10) };
}

/** The result word of a check that depends on these rows: never "passed" when one is stale. */
export function checkWord(rows: ReadonlyArray<Pick<IntelSource, "retrievedAt" | "checkDays">>, passed: boolean, now: Date = new Date()): "passed" | "failed" | "unconfirmed" {
  if (!passed) return "failed";
  return rows.some((r) => freshness(r, now).state === "stale") ? "unconfirmed" : "passed";
}

function row(r: Record<string, unknown>): IntelSource {
  return {
    id: String(r.id),
    key: String(r.key),
    version: Number(r.version),
    name: String(r.name),
    sourceUrl: String(r.source_url),
    owner: String(r.owner),
    retrievedAt: String(r.retrieved_at),
    checkedBy: String(r.checked_by),
    validFrom: r.valid_from == null ? null : String(r.valid_from),
    validUntil: r.valid_until == null ? null : String(r.valid_until),
    accessMethod: r.access_method as AccessMethod,
    reliability: String(r.reliability),
    checkDays: Number(r.check_days),
    supersededBy: r.superseded_by == null ? null : String(r.superseded_by),
  };
}

export interface SourceInput {
  key: string;
  name: string;
  sourceUrl: string;
  owner: string;
  retrievedAt: string;
  checkedBy: string;
  validFrom?: string | null;
  validUntil?: string | null;
  accessMethod: AccessMethod;
  reliability: string;
  checkDays: number;
}

export class IntelStore {
  readonly file: string;
  private db: DatabaseSync;

  private constructor(file: string, db: DatabaseSync) {
    this.file = file;
    this.db = db;
  }

  static open(dir: string): IntelStore {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, INTEL_DB);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(CHAIN_SCHEMA);
    db.exec(SCHEMA);
    db.exec(PACKS_SCHEMA);
    if (!db.prepare("SELECT 1 FROM event LIMIT 1").get()) appendChained(db, { actor: "system" }, "intel_store.created", null, null);
    return new IntelStore(file, db);
  }

  close(): void {
    this.db.close();
  }

  verifyChain(): ChainCheck {
    return checkChain(this.db);
  }

  /** The current version of every source (rows not superseded). */
  sources(): IntelSource[] {
    return (this.db.prepare("SELECT * FROM source WHERE superseded_by IS NULL ORDER BY name").all() as Array<Record<string, unknown>>).map(row);
  }

  /** Every version of one source, oldest first. */
  history(key: string): IntelSource[] {
    return (this.db.prepare("SELECT * FROM source WHERE key = ? ORDER BY version").all(key) as Array<Record<string, unknown>>).map(row);
  }

  /**
   * Record a source, or a new version of it. The older version stays and points at the new one.
   * Access methods are an official feed, the advocate's own session, or a manual upload
   * (architecture section 8); never CAPTCHA solving or bulk harvesting.
   */
  recordSource(input: SourceInput, ctx: WriteContext): IntelSource {
    if (ctx.actor === "agent") throw new StoreError("PROPOSAL_ONLY", "the agent proposes rule-pack changes; it does not write intel.db");
    const key = input.key.trim();
    if (!/^[a-z0-9][a-z0-9._:-]{0,120}$/.test(key)) throw new StoreError("BAD_KEY", `a source key is lower case letters, digits and . _ : -: ${input.key}`);
    if (!(ACCESS_METHODS as readonly string[]).includes(input.accessMethod)) throw new StoreError("BAD_ACCESS", `unknown access method ${input.accessMethod}`);
    if (!Number.isInteger(input.checkDays) || input.checkDays < 1) throw new StoreError("BAD_INTERVAL", "the check interval is a whole number of days, at least 1");
    if (Number.isNaN(Date.parse(input.retrievedAt))) throw new StoreError("BAD_DATE", `not a date: ${input.retrievedAt}`);
    if (!/^https?:\/\//.test(input.sourceUrl) && input.accessMethod !== "manual_upload") throw new StoreError("BAD_URL", "a feed or a session source needs its web address");
    const id = randomUUID();
    inTransaction(this.db, () => {
      const prev = this.db.prepare("SELECT id, version FROM source WHERE key = ? AND superseded_by IS NULL").get(key) as { id: string; version: number } | undefined;
      const version = Number(prev?.version ?? 0) + 1;
      this.db
        .prepare("INSERT INTO source (id, key, version, name, source_url, owner, retrieved_at, checked_by, valid_from, valid_until, access_method, reliability, check_days, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
        .run(id, key, version, input.name.trim(), input.sourceUrl.trim(), input.owner.trim(), input.retrievedAt, input.checkedBy.trim(), input.validFrom ?? null, input.validUntil ?? null, input.accessMethod, input.reliability.trim(), input.checkDays);
      if (prev) this.db.prepare("UPDATE source SET superseded_by = ? WHERE id = ?").run(id, prev.id);
      appendChained(this.db, ctx, prev ? "source.versioned" : "source.recorded", id, { key, version });
    });
    return row(this.db.prepare("SELECT * FROM source WHERE id = ?").get(id) as Record<string, unknown>);
  }

  /** The current version of a source by its key, or null. */
  currentSource(key: string): IntelSource | null {
    const r = this.db.prepare("SELECT * FROM source WHERE key = ? AND superseded_by IS NULL").get(key) as Record<string, unknown> | undefined;
    return r ? row(r) : null;
  }

  source(id: string): IntelSource | null {
    const r = this.db.prepare("SELECT * FROM source WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? row(r) : null;
  }

  // ---- Phase 2: documents (B2) ----

  /** Record a downloaded document and its lines, once per content. */
  recordDoc(input: { sha256: string; sourceId: string; url: string; bytes: number; pages: Array<{ page: number; lines: string[] }>; pagesWithText: number }, ctx: WriteContext): void {
    if (ctx.actor === "agent") throw new StoreError("PROPOSAL_ONLY", "the agent does not write intel.db");
    if (this.db.prepare("SELECT 1 FROM doc WHERE sha256 = ?").get(input.sha256)) return;
    inTransaction(this.db, () => {
      this.db.prepare("INSERT INTO doc (sha256, source_id, url, bytes, pages, pages_with_text, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.sha256, input.sourceId, input.url, input.bytes, input.pages.length, input.pagesWithText, new Date().toISOString());
      const ins = this.db.prepare("INSERT INTO doc_line (sha256, page, line, text) VALUES (?, ?, ?, ?)");
      for (const p of input.pages) p.lines.forEach((t, i) => ins.run(input.sha256, p.page, i + 1, t));
      appendChained(this.db, ctx, "doc.recorded", input.sha256, { sourceId: input.sourceId, pages: input.pages.length });
    });
  }

  /** The newest document recorded for any version of a source key, if any. */
  docOfKey(key: string): { sha256: string; url: string; pages: number; pagesWithText: number; sourceId: string } | null {
    const r = this.db.prepare("SELECT d.sha256, d.url, d.pages, d.pages_with_text, d.source_id FROM doc d JOIN source s ON s.id = d.source_id WHERE s.key = ? ORDER BY d.fetched_at DESC LIMIT 1").get(key) as Record<string, unknown> | undefined;
    return r ? { sha256: String(r.sha256), url: String(r.url), pages: Number(r.pages), pagesWithText: Number(r.pages_with_text), sourceId: String(r.source_id) } : null;
  }

  docLines(sha256: string): Array<{ page: number; line: number; text: string }> {
    return (this.db.prepare("SELECT page, line, text FROM doc_line WHERE sha256 = ? ORDER BY page, line").all(sha256) as Array<Record<string, unknown>>).map((r) => ({ page: Number(r.page), line: Number(r.line), text: String(r.text) }));
  }

  // ---- Phase 2: lists (B4 to B6, B10) ----

  /** Record a new version of a list. The current version of the same adapter and key points at it. */
  recordList(input: { adapterId: string; adapterVersion: string; court: string; key: string; kind: ListKind; title: string; sourceId: string | null; items: NewItem[] }, ctx: WriteContext): PackList {
    if (ctx.actor === "agent") throw new StoreError("PROPOSAL_ONLY", "the agent proposes rule-pack changes; it does not write intel.db");
    const id = randomUUID();
    inTransaction(this.db, () => {
      const prev = this.db.prepare("SELECT id, version FROM pack_list WHERE adapter_id = ? AND key = ? AND superseded_by IS NULL").get(input.adapterId, input.key) as { id: string; version: number } | undefined;
      const version = Number(prev?.version ?? 0) + 1;
      this.db
        .prepare("INSERT INTO pack_list (id, adapter_id, adapter_version, court, key, kind, title, version, source_id, built_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
        .run(id, input.adapterId, input.adapterVersion, input.court, input.key, input.kind, input.title, version, input.sourceId, new Date().toISOString());
      const ins = this.db.prepare("INSERT INTO pack_item (id, list_id, n, text, ref, quote, status, page, line, found, skill, value, entered_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      input.items.forEach((it, i) =>
        ins.run(randomUUID(), id, i + 1, it.text, it.ref ?? null, it.quote ?? null, it.status, it.page ?? null, it.line ?? null, it.found ?? null, it.skill ?? null, it.value ?? null, it.enteredSource ?? null),
      );
      if (prev) this.db.prepare("UPDATE pack_list SET superseded_by = ? WHERE id = ?").run(id, prev.id);
      appendChained(this.db, ctx, prev ? "list.versioned" : "list.built", id, { adapter: input.adapterId, version: input.adapterVersion, key: input.key, items: input.items.length, verified: input.items.filter((i) => i.status === "verified").length });
    });
    return this.list(id)!;
  }

  list(id: string): PackList | null {
    const r = this.db.prepare("SELECT * FROM pack_list WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? listRow(this.db, r) : null;
  }

  currentList(adapterId: string, key: string): PackList | null {
    const r = this.db.prepare("SELECT * FROM pack_list WHERE adapter_id = ? AND key = ? AND superseded_by IS NULL").get(adapterId, key) as Record<string, unknown> | undefined;
    return r ? listRow(this.db, r) : null;
  }

  /** The current lists, of one court or of all. */
  lists(court?: string): PackList[] {
    const rows = (court ? this.db.prepare("SELECT * FROM pack_list WHERE superseded_by IS NULL AND court = ? ORDER BY key").all(court) : this.db.prepare("SELECT * FROM pack_list WHERE superseded_by IS NULL ORDER BY court, key").all()) as Array<Record<string, unknown>>;
    return rows.map((r) => listRow(this.db, r));
  }

  listHistory(adapterId: string, key: string): PackList[] {
    return (this.db.prepare("SELECT * FROM pack_list WHERE adapter_id = ? AND key = ? ORDER BY version").all(adapterId, key) as Array<Record<string, unknown>>).map((r) => listRow(this.db, r));
  }

  /**
   * B10, human-only: the advocate corrects an item (n) or adds one (n null), with the source the
   * advocate gives. The result is a new version of the list; the item is "advocate-entered".
   */
  editList(listId: string, change: { n: number | null; text: string; source: string; ref?: string }, ctx: WriteContext): PackList {
    if (ctx.actor !== "advocate") throw new StoreError("HUMAN_ONLY", "only the advocate corrects a rule pack");
    const cur = this.list(listId);
    if (!cur) throw new StoreError("NOT_FOUND", `no list ${listId}`);
    if (cur.supersededBy) throw new StoreError("OLD_VERSION", "correct the current version of the list");
    const text = change.text.trim();
    const source = change.source.trim();
    if (!text || !source) throw new StoreError("BAD_ITEM", "an advocate-entered item needs its text and its source");
    if (change.n !== null && !cur.items.some((i) => i.n === change.n)) throw new StoreError("NOT_FOUND", `the list has no item ${change.n}`);
    const entered: NewItem = { text, ref: change.ref?.trim() || null, status: "advocate_entered", enteredSource: source };
    const items: NewItem[] = cur.items.map((i) => (i.n === change.n ? entered : { text: i.text, ref: i.ref, quote: i.quote, status: i.status, page: i.page, line: i.line, found: i.found, skill: i.skill, value: i.value, enteredSource: i.enteredSource }));
    if (change.n === null) items.push(entered);
    return this.recordList({ adapterId: cur.adapterId, adapterVersion: cur.adapterVersion, court: cur.court, key: cur.key, kind: cur.kind, title: cur.title, sourceId: cur.sourceId, items }, ctx);
  }

  // ---- Phase 2: bench rows (B7) and proceeding packs (Q1) ----

  benches(court: string): BenchRow[] {
    return (this.db.prepare("SELECT * FROM bench WHERE court = ? ORDER BY date DESC, created_at DESC").all(court) as Array<Record<string, unknown>>).map(benchRow);
  }

  addBench(input: { court: string; date: string; bench: string; judges: string; source: string }, ctx: WriteContext): BenchRow {
    if (ctx.actor !== "advocate") throw new StoreError("HUMAN_ONLY", "only the advocate enters bench rows");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new StoreError("BAD_DATE", "the date is YYYY-MM-DD");
    if (!input.judges.trim() || !input.source.trim()) throw new StoreError("BAD_BENCH", "a bench row needs its judges and its source");
    const id = randomUUID();
    inTransaction(this.db, () => {
      this.db.prepare("INSERT INTO bench (id, court, date, bench, judges, source, entered_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.court, input.date, input.bench.trim(), input.judges.trim(), input.source.trim(), ctx.actor, new Date().toISOString());
      appendChained(this.db, ctx, "bench.added", id, { court: input.court, date: input.date });
    });
    return this.benches(input.court).find((b) => b.id === id)!;
  }

  /** Record an adapter's proceeding packs once per adapter version. */
  recordProceedings(adapterId: string, adapterVersion: string, items: AdapterProceeding[], ctx: WriteContext): number {
    let n = 0;
    inTransaction(this.db, () => {
      const ins = this.db.prepare("INSERT OR IGNORE INTO proceeding (adapter_id, adapter_version, key, court, case_type, body, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const p of items) n += Number(ins.run(adapterId, adapterVersion, p.key, p.court, p.caseType, JSON.stringify(p), new Date().toISOString()).changes);
      if (n) appendChained(this.db, ctx, "proceedings.recorded", adapterId, { version: adapterVersion, count: n });
    });
    return n;
  }

  proceedings(court?: string): Array<AdapterProceeding & { adapterId: string; adapterVersion: string }> {
    const rows = (court ? this.db.prepare("SELECT * FROM proceeding WHERE court = ?").all(court) : this.db.prepare("SELECT * FROM proceeding").all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...(JSON.parse(String(r.body)) as AdapterProceeding), adapterId: String(r.adapter_id), adapterVersion: String(r.adapter_version) }));
  }
}
