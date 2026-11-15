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
}
