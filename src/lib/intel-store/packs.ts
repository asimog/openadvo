/**
 * Phase 2 (B2 to B7, B10, Q1): documents, built lists, their items, bench rows and proceeding
 * packs in intel.db. Part of the intel store: IntelStore calls these inside its own writes, with
 * one chained event each. A list is versioned: a rebuild or an advocate's correction makes a new
 * version, and the old one stays readable.
 */
import type { DatabaseSync } from "node:sqlite";
import type { BenchRow, ItemStatus, ListKind, PackItem, PackList } from "../../shared/intel.ts";

export const PACKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS doc (
  sha256 TEXT PRIMARY KEY,
  source_id TEXT REFERENCES source(id),
  url TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  pages INTEGER NOT NULL,
  pages_with_text INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS doc_line (
  sha256 TEXT NOT NULL REFERENCES doc(sha256),
  page INTEGER NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (sha256, page, line)
) STRICT;
CREATE TABLE IF NOT EXISTS pack_list (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  court TEXT NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checklist', 'list', 'workflow', 'rules')),
  title TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_id TEXT REFERENCES source(id),
  built_at TEXT NOT NULL,
  superseded_by TEXT REFERENCES pack_list(id),
  UNIQUE (adapter_id, key, version)
) STRICT;
CREATE TABLE IF NOT EXISTS pack_item (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES pack_list(id),
  n INTEGER NOT NULL,
  text TEXT NOT NULL,
  ref TEXT,
  quote TEXT,
  status TEXT NOT NULL CHECK (status IN ('verified', 'not_found', 'no_quote', 'advocate_entered')),
  page INTEGER,
  line INTEGER,
  found TEXT,
  skill TEXT,
  value TEXT,
  entered_source TEXT
) STRICT;
CREATE TRIGGER IF NOT EXISTS pack_item_no_update BEFORE UPDATE ON pack_item BEGIN SELECT RAISE(ABORT, 'items are written once; a change is a new list version'); END;
CREATE TRIGGER IF NOT EXISTS pack_list_no_delete BEFORE DELETE ON pack_list BEGIN SELECT RAISE(ABORT, 'lists are versioned, never deleted'); END;
CREATE TABLE IF NOT EXISTS bench (
  id TEXT PRIMARY KEY,
  court TEXT NOT NULL,
  date TEXT NOT NULL,
  bench TEXT NOT NULL,
  judges TEXT NOT NULL,
  source TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS proceeding (
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  key TEXT NOT NULL,
  court TEXT NOT NULL,
  case_type TEXT NOT NULL,
  body TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (adapter_id, adapter_version, key)
) STRICT;
`;

export interface NewItem {
  text: string;
  ref?: string | null;
  quote?: string | null;
  status: ItemStatus;
  page?: number | null;
  line?: number | null;
  found?: string | null;
  skill?: string | null;
  value?: string | null;
  enteredSource?: string | null;
}

export function itemRow(r: Record<string, unknown>): PackItem {
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id),
    n: Number(r.n),
    text: String(r.text),
    ref: s(r.ref),
    quote: s(r.quote),
    status: r.status as ItemStatus,
    page: r.page == null ? null : Number(r.page),
    line: r.line == null ? null : Number(r.line),
    found: s(r.found),
    skill: s(r.skill),
    value: s(r.value),
    enteredSource: s(r.entered_source),
  };
}

export function listRow(db: DatabaseSync, r: Record<string, unknown>): PackList {
  const items = (db.prepare("SELECT * FROM pack_item WHERE list_id = ? ORDER BY n").all(String(r.id)) as Array<Record<string, unknown>>).map(itemRow);
  return {
    id: String(r.id),
    adapterId: String(r.adapter_id),
    adapterVersion: String(r.adapter_version),
    court: String(r.court),
    key: String(r.key),
    kind: r.kind as ListKind,
    title: String(r.title),
    version: Number(r.version),
    sourceId: r.source_id == null ? null : String(r.source_id),
    builtAt: String(r.built_at),
    supersededBy: r.superseded_by == null ? null : String(r.superseded_by),
    items,
  };
}

export function benchRow(r: Record<string, unknown>): BenchRow {
  return {
    id: String(r.id),
    court: String(r.court),
    date: String(r.date),
    bench: String(r.bench),
    judges: String(r.judges),
    source: String(r.source),
    enteredBy: String(r.entered_by),
    createdAt: String(r.created_at),
  };
}
