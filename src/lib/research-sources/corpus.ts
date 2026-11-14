/**
 * V4-1: the local index of judgment metadata (SQLite FTS5) and the cache of fetched judgment
 * PDFs and their text. Reference data shared by all matters; it is not a matter fact, so it
 * lives in the user data folder, not in a matter folder. Plain library.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { JudgmentMeta } from "./aws.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS judgment (
  id TEXT PRIMARY KEY, court TEXT NOT NULL, court_name TEXT NOT NULL, title TEXT NOT NULL,
  petitioner TEXT NOT NULL, respondent TEXT NOT NULL, judge TEXT NOT NULL, citation TEXT NOT NULL,
  insc TEXT NOT NULL, cnr TEXT NOT NULL, decision_date TEXT NOT NULL, disposal TEXT NOT NULL,
  pdf_url TEXT NOT NULL, year INTEGER NOT NULL
) STRICT;
CREATE VIRTUAL TABLE IF NOT EXISTS judgment_fts USING fts5(id UNINDEXED, title, parties, judge, refs, tokenize = 'unicode61');
CREATE TABLE IF NOT EXISTS indexed_part (
  source TEXT NOT NULL, year INTEGER NOT NULL, court TEXT NOT NULL, court_name TEXT NOT NULL,
  rows INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (source, year, court)
) STRICT;
CREATE TABLE IF NOT EXISTS judgment_file (
  id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, size INTEGER NOT NULL, pages INTEGER NOT NULL, fetched_at TEXT NOT NULL
) STRICT;
`;

export interface IndexedPart {
  source: "sc" | "hc";
  year: number;
  court: string;
  courtName: string;
  rows: number;
  at: string;
}

export interface CachedPage {
  page: number;
  kind: string;
  lines: Array<{ line: number; text: string }>;
}

/** Words of a query as FTS5 terms: each a quoted prefix, so punctuation never breaks the query. */
export function ftsQuery(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1);
  return words.map((w) => `"${w}"*`).join(" ");
}

export class Corpus {
  readonly folder: string;
  private db: DatabaseSync;

  constructor(folder: string) {
    this.folder = folder;
    mkdirSync(path.join(folder, "pdf"), { recursive: true });
    this.db = new DatabaseSync(path.join(folder, "corpus.db"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /** Replace one part (a Supreme Court year, or one High Court in one year). */
  putPart(part: Omit<IndexedPart, "rows" | "at">, rows: JudgmentMeta[]): IndexedPart {
    const at = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      const old = this.db.prepare("SELECT id FROM judgment WHERE court = ? AND year = ? AND (court = 'sc' OR court_name = ?)").all(part.source, part.year, part.courtName) as Array<{ id: string }>;
      const delFts = this.db.prepare("DELETE FROM judgment_fts WHERE id = ?");
      const delJ = this.db.prepare("DELETE FROM judgment WHERE id = ?");
      for (const o of old) {
        delFts.run(o.id);
        delJ.run(o.id);
      }
      const ins = this.db.prepare("INSERT OR REPLACE INTO judgment VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const fts = this.db.prepare("INSERT INTO judgment_fts (id, title, parties, judge, refs) VALUES (?, ?, ?, ?, ?)");
      for (const r of rows) {
        ins.run(r.id, r.court, r.courtName, r.title, r.petitioner, r.respondent, r.judge, r.citation, r.insc, r.cnr, r.decisionDate, r.disposal, r.pdfUrl, r.year);
        delFts.run(r.id);
        fts.run(r.id, r.title, `${r.petitioner} ${r.respondent}`, r.judge, `${r.citation} ${r.insc} ${r.insc.replace(/\s+/g, "")} ${r.cnr} ${r.decisionDate} ${r.disposal}`);
      }
      this.db.prepare("INSERT OR REPLACE INTO indexed_part VALUES (?, ?, ?, ?, ?, ?)").run(part.source, part.year, part.court, part.courtName, rows.length, at);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { ...part, rows: rows.length, at };
  }

  parts(): IndexedPart[] {
    return (this.db.prepare("SELECT * FROM indexed_part ORDER BY source, court_name, year").all() as Array<Record<string, unknown>>).map((r) => ({
      source: r.source as "sc" | "hc",
      year: Number(r.year),
      court: String(r.court),
      courtName: String(r.court_name),
      rows: Number(r.rows),
      at: String(r.at),
    }));
  }

  private row(r: Record<string, unknown>): JudgmentMeta {
    return {
      id: String(r.id),
      court: r.court as "sc" | "hc",
      courtName: String(r.court_name),
      title: String(r.title),
      petitioner: String(r.petitioner),
      respondent: String(r.respondent),
      judge: String(r.judge),
      citation: String(r.citation),
      insc: String(r.insc),
      cnr: String(r.cnr),
      decisionDate: String(r.decision_date),
      disposal: String(r.disposal),
      pdfUrl: String(r.pdf_url),
      year: Number(r.year),
    };
  }

  get(id: string): JudgmentMeta | undefined {
    const r = this.db.prepare("SELECT * FROM judgment WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.row(r) : undefined;
  }

  /** Best matches first (BM25). Filters: court ("sc" or "hc"), year range. */
  search(query: string, opts: { court?: "sc" | "hc"; from?: number; to?: number; limit?: number } = {}): JudgmentMeta[] {
    const q = ftsQuery(query);
    if (!q) return [];
    const where = ["judgment_fts MATCH ?"];
    const args: Array<string | number> = [q];
    if (opts.court) {
      where.push("j.court = ?");
      args.push(opts.court);
    }
    if (opts.from) {
      where.push("j.year >= ?");
      args.push(opts.from);
    }
    if (opts.to) {
      where.push("j.year <= ?");
      args.push(opts.to);
    }
    args.push(Math.min(opts.limit ?? 20, 100));
    const rows = this.db
      .prepare(`SELECT j.* FROM judgment_fts f JOIN judgment j ON j.id = f.id WHERE ${where.join(" AND ")} ORDER BY bm25(judgment_fts, 0, 4, 3, 1, 2) LIMIT ?`)
      .all(...args) as Array<Record<string, unknown>>;
    return rows.map((r) => this.row(r));
  }

  /** A judgment by its neutral citation ("2023 INSC 1043"), when that year is indexed. */
  byInsc(insc: string): JudgmentMeta | undefined {
    const n = insc.replace(/\s+/g, " ").trim().toUpperCase();
    const r = this.db.prepare("SELECT * FROM judgment WHERE upper(insc) = ?").get(n) as Record<string, unknown> | undefined;
    return r ? this.row(r) : undefined;
  }

  // ---- fetched judgments ----

  private textFile(id: string): string {
    return path.join(this.folder, "pdf", `${createHash("sha256").update(id).digest("hex").slice(0, 32)}.json`);
  }

  cachedText(id: string): { sha256: string; pages: CachedPage[] } | null {
    const f = this.textFile(id);
    if (!existsSync(f)) return null;
    return JSON.parse(readFileSync(f, "utf8")) as { sha256: string; pages: CachedPage[] };
  }

  /** Keep a fetched PDF by SHA-256 and its text by page and line. */
  putFile(id: string, bytes: Uint8Array, pages: CachedPage[]): { sha256: string; path: string } {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const pdf = path.join(this.folder, "pdf", `${sha256}.pdf`);
    if (!existsSync(pdf)) writeFileSync(pdf, bytes);
    writeFileSync(this.textFile(id), JSON.stringify({ sha256, pages }));
    this.db.prepare("INSERT OR REPLACE INTO judgment_file VALUES (?, ?, ?, ?, ?)").run(id, sha256, bytes.length, pages.length, new Date().toISOString());
    return { sha256, path: pdf };
  }

  filePath(id: string): string | null {
    const r = this.db.prepare("SELECT sha256 FROM judgment_file WHERE id = ?").get(id) as { sha256: string } | undefined;
    return r ? path.join(this.folder, "pdf", `${r.sha256}.pdf`) : null;
  }
}
