/**
 * Phase 5: the law store. Statutes and court rules as versioned provision rows (E3, D2),
 * judgment paragraphs (E1), the legal knowledge graph (G1) and the vector rows (G6), all in
 * `corpus.db`. Law is shared and can change: a change never overwrites, it adds a version and
 * closes the earlier one. Every write appends a chained event (decision 12). The full-text,
 * edge and vector tables are indexes that `rebuild()` makes again from the rows (decision 13).
 * Plain library (decision 6).
 */
import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { CHAIN_SCHEMA, StoreError, appendChained, inTransaction } from "../store-chain/index.ts";
import { inForceOn, isStale } from "../statutes/inforce.ts";
import { textHash } from "../statutes/structure.ts";
import type { WriteContext } from "../../shared/records.ts";
import type { CheckState, InForceResult, InstrumentKind, LegalEdge, LegalRelation, Provision, ProvisionCheck, ProvisionKind, ProvisionStatus, StatuteAct, StatuteEvent, StatuteSource } from "../../shared/law.ts";

export const LAW_SCHEMA = `
CREATE TABLE IF NOT EXISTS statute_act (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, number TEXT NOT NULL, year TEXT NOT NULL,
  jurisdiction TEXT NOT NULL, enacted TEXT, enforced TEXT, enforced_text TEXT NOT NULL, repealed INTEGER NOT NULL,
  source TEXT NOT NULL, source_url TEXT NOT NULL, source_ref TEXT NOT NULL, retrieved_at TEXT NOT NULL,
  checked_at TEXT, check_interval_days INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS statute_provision (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL, heading TEXT NOT NULL,
  text TEXT NOT NULL, footnotes TEXT NOT NULL, version INTEGER NOT NULL, text_hash TEXT NOT NULL,
  valid_from TEXT, valid_until TEXT, status TEXT NOT NULL, ord INTEGER NOT NULL, under TEXT NOT NULL,
  page INTEGER, line INTEGER, source_ref TEXT NOT NULL, source_url TEXT NOT NULL, retrieved_at TEXT NOT NULL,
  checked_at TEXT, check_state TEXT NOT NULL, current INTEGER NOT NULL,
  UNIQUE (act_id, kind, number, under, version)
) STRICT;
CREATE INDEX IF NOT EXISTS statute_provision_act ON statute_provision (act_id, current, ord);
CREATE VIRTUAL TABLE IF NOT EXISTS provision_fts USING fts5(id UNINDEXED, number, heading, text, act, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS statute_event (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, provision TEXT NOT NULL, kind TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'provision', part TEXT NOT NULL DEFAULT '',
  by_act TEXT NOT NULL,
  by_section TEXT NOT NULL, date TEXT, date_precision TEXT NOT NULL, quote TEXT NOT NULL, source TEXT NOT NULL,
  UNIQUE (act_id, provision, kind, by_act, quote)
) STRICT;
CREATE TABLE IF NOT EXISTS statute_check (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, provision_id TEXT NOT NULL, at TEXT NOT NULL, state TEXT NOT NULL,
  detail TEXT NOT NULL, new_version INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS judgment_para (
  judgment_id TEXT NOT NULL, para INTEGER NOT NULL, label TEXT NOT NULL, page INTEGER NOT NULL, line INTEGER NOT NULL,
  text TEXT NOT NULL, role TEXT, role_status TEXT, PRIMARY KEY (judgment_id, para)
) STRICT;
CREATE VIRTUAL TABLE IF NOT EXISTS para_fts USING fts5(judgment_id UNINDEXED, para UNINDEXED, text, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS judgment_identity (
  id TEXT PRIMARY KEY, court TEXT NOT NULL, court_name TEXT NOT NULL, title TEXT NOT NULL, decision_date TEXT NOT NULL,
  citations TEXT NOT NULL, judges TEXT NOT NULL, bench_strength INTEGER NOT NULL, paragraphs INTEGER NOT NULL, indexed_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS citation_key (key TEXT NOT NULL, judgment_id TEXT NOT NULL, PRIMARY KEY (key, judgment_id)) STRICT;
CREATE TABLE IF NOT EXISTS legal_edge (
  id TEXT PRIMARY KEY, from_kind TEXT NOT NULL, from_id TEXT NOT NULL, relation TEXT NOT NULL, to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL, evidence_ref TEXT NOT NULL, quote TEXT NOT NULL, status TEXT NOT NULL, built_from TEXT NOT NULL, built_at TEXT NOT NULL,
  UNIQUE (from_kind, from_id, relation, to_kind, to_id, evidence_ref)
) STRICT;
CREATE INDEX IF NOT EXISTS legal_edge_to ON legal_edge (to_kind, to_id, relation);
CREATE INDEX IF NOT EXISTS legal_edge_from ON legal_edge (from_kind, from_id, relation);
CREATE TABLE IF NOT EXISTS vector (
  scope TEXT NOT NULL, id TEXT NOT NULL, model TEXT NOT NULL, dim INTEGER NOT NULL, text_hash TEXT NOT NULL, v BLOB NOT NULL,
  PRIMARY KEY (scope, id)
) STRICT;
CREATE TABLE IF NOT EXISTS index_build (name TEXT PRIMARY KEY, rows INTEGER NOT NULL, built_at TEXT NOT NULL) STRICT;
`;

export interface InstrumentInput {
  kind: InstrumentKind;
  title: string;
  number: string;
  year: string;
  jurisdiction: string;
  enacted: string | null;
  enforced: string | null;
  enforcedText: string;
  repealed: boolean;
  source: StatuteSource;
  sourceUrl: string;
  sourceRef: string;
  checkIntervalDays?: number;
  provisions: Array<{
    kind: ProvisionKind;
    number: string;
    heading: string;
    text: string;
    footnotes?: string;
    order: number;
    under?: string;
    page?: number | null;
    line?: number | null;
    sourceRef?: string;
    sourceUrl?: string;
    gone?: "repealed" | "omitted" | null;
    events?: Array<Omit<StatuteEvent, "id" | "actId">>;
  }>;
}

export interface PutResult {
  act: StatuteAct;
  added: number;
  unchanged: number;
  changed: number;
}

export interface ProvisionHit {
  provision: Provision;
  rank: number;
}

export interface ParaInput {
  para: number;
  label: string;
  page: number;
  line: number;
  text: string;
}

export interface ParaHit {
  judgmentId: string;
  para: number;
  label: string;
  page: number;
  line: number;
  text: string;
  rank: number;
}

/** FTS5 terms: each word a quoted prefix; `phrase` keeps the words together. */
export function ftsTerms(q: string, phrase = false): string {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1);
  if (words.length === 0) return "";
  return phrase ? `"${words.join(" ")}"` : words.map((w) => `"${w}"*`).join(" OR ");
}

export function instrumentId(source: StatuteSource, sourceRef: string): string {
  return `${source === "upload" ? "up" : source === "akn" ? "akn" : "ic"}:${sourceRef}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export class LawStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(CHAIN_SCHEMA);
    db.exec(LAW_SCHEMA);
  }

  // ---- E3: instruments and versioned provisions ----

  private actRow(r: Record<string, unknown>): StatuteAct {
    const n = this.db.prepare("SELECT count(*) AS n FROM statute_provision WHERE act_id = ? AND current = 1").get(String(r.id)) as { n: number };
    return {
      id: String(r.id),
      kind: r.kind as InstrumentKind,
      title: String(r.title),
      number: String(r.number),
      year: String(r.year),
      jurisdiction: String(r.jurisdiction),
      enacted: (r.enacted as string | null) ?? null,
      enforced: (r.enforced as string | null) ?? null,
      enforcedText: String(r.enforced_text),
      repealed: Number(r.repealed) === 1,
      source: r.source as StatuteSource,
      sourceUrl: String(r.source_url),
      sourceRef: String(r.source_ref),
      retrievedAt: String(r.retrieved_at),
      checkedAt: (r.checked_at as string | null) ?? null,
      checkIntervalDays: Number(r.check_interval_days),
      provisions: Number(n.n),
      stale: isStale((r.checked_at as string | null) ?? String(r.retrieved_at), Number(r.check_interval_days)),
    };
  }

  private provRow(r: Record<string, unknown>, interval?: number, title?: string): Provision {
    const act = interval === undefined || title === undefined ? (this.db.prepare("SELECT title, check_interval_days FROM statute_act WHERE id = ?").get(String(r.act_id)) as { title: string; check_interval_days: number } | undefined) : undefined;
    const days = interval ?? Number(act?.check_interval_days ?? 30);
    return {
      id: String(r.id),
      actId: String(r.act_id),
      actTitle: title ?? String(act?.title ?? ""),
      kind: r.kind as ProvisionKind,
      number: String(r.number),
      heading: String(r.heading),
      text: String(r.text),
      footnotes: String(r.footnotes),
      version: Number(r.version),
      textHash: String(r.text_hash),
      validFrom: (r.valid_from as string | null) ?? null,
      validUntil: (r.valid_until as string | null) ?? null,
      status: r.status as ProvisionStatus,
      order: Number(r.ord),
      under: String(r.under ?? ""),
      sourceRef: String(r.source_ref),
      sourceUrl: String(r.source_url),
      retrievedAt: String(r.retrieved_at),
      checkedAt: (r.checked_at as string | null) ?? null,
      check: r.check_state as CheckState,
      stale: isStale((r.checked_at as string | null) ?? String(r.retrieved_at), days),
    };
  }

  private index(p: { id: string; number: string; heading: string; text: string }, actTitle: string): void {
    this.db.prepare("DELETE FROM provision_fts WHERE id = ?").run(p.id);
    this.db.prepare("INSERT INTO provision_fts (id, number, heading, text, act) VALUES (?, ?, ?, ?, ?)").run(p.id, p.number, p.heading, p.text, actTitle);
  }

  /**
   * Store an instrument as read from its source. A provision whose text is the same as the
   * current version is left as it is. A provision whose text differs gets a new version; the
   * earlier version stays, closed on the day the change was seen. Nothing is deleted.
   */
  putInstrument(input: InstrumentInput, ctx: WriteContext): PutResult {
    if (!input.title.trim()) throw new StoreError("NO_TITLE", "an instrument needs a title");
    if (!input.sourceRef.trim()) throw new StoreError("NO_SOURCE", "an instrument needs its source reference");
    const id = instrumentId(input.source, input.sourceRef);
    const now = new Date().toISOString();
    let added = 0;
    let unchanged = 0;
    let changed = 0;
    inTransaction(this.db, () => {
      const had = this.db.prepare("SELECT id FROM statute_act WHERE id = ?").get(id);
      this.db
        .prepare(
          `INSERT INTO statute_act (id, kind, title, number, year, jurisdiction, enacted, enforced, enforced_text, repealed, source, source_url, source_ref, retrieved_at, checked_at, check_interval_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET title = excluded.title, enacted = excluded.enacted, enforced = excluded.enforced, enforced_text = excluded.enforced_text,
             repealed = excluded.repealed, source_url = excluded.source_url, retrieved_at = excluded.retrieved_at, checked_at = excluded.checked_at`,
        )
        .run(id, input.kind, input.title, input.number, input.year, input.jurisdiction, input.enacted, input.enforced, input.enforcedText, input.repealed ? 1 : 0, input.source, input.sourceUrl, input.sourceRef, now, now, input.checkIntervalDays ?? 30);
      const current = this.db.prepare("SELECT * FROM statute_provision WHERE act_id = ? AND kind = ? AND number = ? AND under = ? AND current = 1");
      const insert = this.db.prepare(
        `INSERT INTO statute_provision (id, act_id, kind, number, heading, text, footnotes, version, text_hash, valid_from, valid_until, status, ord, under, page, line, source_ref, source_url, retrieved_at, checked_at, check_state, current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 1)`,
      );
      const event = this.db.prepare("INSERT OR IGNORE INTO statute_event (id, act_id, provision, kind, scope, part, by_act, by_section, date, date_precision, quote, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const p of input.provisions) {
        const under = p.under ?? "";
        const hash = textHash(p.text);
        const status: ProvisionStatus = p.gone ?? "in_force";
        const old = current.get(id, p.kind, p.number, under) as Record<string, unknown> | undefined;
        for (const e of p.events ?? []) event.run(randomUUID(), id, e.provision, e.kind, e.scope ?? "provision", e.part ?? "", e.byAct, e.bySection, e.date, e.datePrecision, e.quote, e.source);
        if (old && String(old.text_hash) === hash) {
          this.db.prepare("UPDATE statute_provision SET checked_at = ?, check_state = 'verified', footnotes = ?, heading = ?, status = ? WHERE id = ?").run(now, p.footnotes ?? "", p.heading, status, String(old.id));
          unchanged++;
          continue;
        }
        const version = old ? Number(old.version) + 1 : 1;
        if (old) {
          this.db.prepare("UPDATE statute_provision SET current = 0, valid_until = ?, status = 'superseded' WHERE id = ?").run(today(), String(old.id));
          this.db.prepare("DELETE FROM provision_fts WHERE id = ?").run(String(old.id));
          changed++;
        } else added++;
        const pid = `${id}#${p.kind}:${p.number}${under ? `@${createHash("sha256").update(under).digest("hex").slice(0, 8)}` : ""}:v${version}`;
        // The first version's start is the instrument's commencement; a later version starts the day the change was seen.
        insert.run(pid, id, p.kind, p.number, p.heading, p.text, p.footnotes ?? "", version, hash, old ? today() : null, status, p.order, under, p.page ?? null, p.line ?? null, p.sourceRef ?? input.sourceRef, p.sourceUrl ?? input.sourceUrl, now, now);
        this.index({ id: pid, number: p.number, heading: p.heading, text: p.text }, input.title);
      }
      appendChained(this.db, ctx, had ? "statute.refreshed" : "statute.added", id, { title: input.title, source: input.source, added, unchanged, changed });
    });
    return { act: this.act(id)!, added, unchanged, changed };
  }

  acts(): StatuteAct[] {
    return (this.db.prepare("SELECT * FROM statute_act ORDER BY title").all() as Array<Record<string, unknown>>).map((r) => this.actRow(r));
  }

  act(id: string): StatuteAct | null {
    const r = this.db.prepare("SELECT * FROM statute_act WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.actRow(r) : null;
  }

  /** The current provisions of an instrument, in the source's order. */
  provisions(actId: string): Provision[] {
    const a = this.act(actId);
    if (!a) return [];
    return (this.db.prepare("SELECT * FROM statute_provision WHERE act_id = ? AND current = 1 ORDER BY ord, number").all(actId) as Array<Record<string, unknown>>).map((r) => this.provRow(r, a.checkIntervalDays, a.title));
  }

  provision(id: string): Provision | null {
    const r = this.db.prepare("SELECT * FROM statute_provision WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.provRow(r) : null;
  }

  /** Every stored version of one provision number, newest first. */
  versions(actId: string, number: string): Provision[] {
    return (this.db.prepare("SELECT * FROM statute_provision WHERE act_id = ? AND number = ? COLLATE NOCASE ORDER BY version DESC").all(actId, number) as Array<Record<string, unknown>>).map((r) => this.provRow(r));
  }

  events(actId: string, provision?: string): StatuteEvent[] {
    const rows = (provision === undefined
      ? this.db.prepare("SELECT * FROM statute_event WHERE act_id = ? ORDER BY date").all(actId)
      : this.db.prepare("SELECT * FROM statute_event WHERE act_id = ? AND (provision = ? COLLATE NOCASE OR provision = '') ORDER BY date").all(actId, provision)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ id: String(r.id), actId: String(r.act_id), provision: String(r.provision), kind: r.kind as StatuteEvent["kind"], scope: (r.scope as "provision" | "part" | undefined) ?? "provision", part: String(r.part ?? ""), byAct: String(r.by_act), bySection: String(r.by_section), date: (r.date as string | null) ?? null, datePrecision: r.date_precision as StatuteEvent["datePrecision"], quote: String(r.quote), source: r.source as StatuteEvent["source"] }));
  }

  /** An event the advocate records (a repeal date, a commencement notification). Human only. */
  addEvent(e: Omit<StatuteEvent, "id" | "source">, ctx: WriteContext): StatuteEvent {
    if (ctx.actor !== "advocate") throw new StoreError("HUMAN_ONLY", "only the advocate records a statute event");
    if (!this.act(e.actId)) throw new StoreError("NOT_FOUND", e.actId);
    if (!e.quote.trim()) throw new StoreError("NO_QUOTE", "an event needs the words of its source");
    const id = randomUUID();
    inTransaction(this.db, () => {
      this.db.prepare("INSERT INTO statute_event (id, act_id, provision, kind, scope, part, by_act, by_section, date, date_precision, quote, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'advocate')").run(id, e.actId, e.provision, e.kind, e.scope ?? "provision", e.part ?? "", e.byAct, e.bySection, e.date, e.datePrecision, e.quote);
      appendChained(this.db, ctx, "statute.event", e.actId, { provision: e.provision, kind: e.kind, date: e.date });
    });
    return { ...e, id, source: "advocate" };
  }

  /**
   * Verification at the time of use (decision 16, ruling R-4). `read` reads the provision's text
   * from its source now. Same text: verified. Different text: a new version is stored and the
   * result is "changed". A source that cannot be reached: "unreachable"; the row stays as it was
   * and a check that depends on it is unconfirmed.
   */
  async verify(provisionId: string, read: (p: Provision) => Promise<{ text: string; footnotes?: string; heading?: string }>, ctx: WriteContext = { actor: "system" }): Promise<ProvisionCheck> {
    const p = this.provision(provisionId);
    if (!p) throw new StoreError("NOT_FOUND", provisionId);
    const at = new Date().toISOString();
    let state: CheckState;
    let detail: string;
    let newVersion: number | null = null;
    try {
      const now = await read(p);
      if (textHash(now.text) === p.textHash) {
        state = "verified";
        detail = "The source gives the same text.";
      } else {
        state = "changed";
        const r = this.db.prepare("SELECT * FROM statute_provision WHERE id = ?").get(p.id) as Record<string, unknown>;
        const act = this.act(p.actId)!;
        if (Number(r.current) === 1) {
          newVersion = p.version + 1;
          inTransaction(this.db, () => {
            this.db.prepare("UPDATE statute_provision SET current = 0, valid_until = ?, status = 'superseded', checked_at = ?, check_state = 'changed' WHERE id = ?").run(today(), at, p.id);
            this.db.prepare("DELETE FROM provision_fts WHERE id = ?").run(p.id);
            const pid = p.id.replace(/:v\d+$/, `:v${newVersion}`);
            this.db
              .prepare(
                `INSERT INTO statute_provision (id, act_id, kind, number, heading, text, footnotes, version, text_hash, valid_from, valid_until, status, ord, under, page, line, source_ref, source_url, retrieved_at, checked_at, check_state, current)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'in_force', ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 1)`,
              )
              .run(pid, p.actId, p.kind, p.number, now.heading ?? p.heading, now.text, now.footnotes ?? p.footnotes, newVersion, textHash(now.text), today(), p.order, String(r.under), r.page as number | null, r.line as number | null, p.sourceRef, p.sourceUrl, at, at);
            this.index({ id: pid, number: p.number, heading: now.heading ?? p.heading, text: now.text }, act.title);
            appendChained(this.db, ctx, "statute.changed", p.id, { number: p.number, from: p.version, to: newVersion });
          });
        }
        detail = `The source gives a different text. Version ${newVersion ?? p.version + 1} holds it; version ${p.version} is kept.`;
      }
    } catch (e) {
      state = "unreachable";
      detail = (e as Error).message.slice(0, 300);
    }
    if (state !== "changed") this.db.prepare("UPDATE statute_provision SET check_state = ?, checked_at = CASE WHEN ? = 'verified' THEN ? ELSE checked_at END WHERE id = ?").run(state, state, at, p.id);
    this.db.prepare("INSERT INTO statute_check (provision_id, at, state, detail, new_version) VALUES (?, ?, ?, ?, ?)").run(p.id, at, state, detail, newVersion);
    return { provisionId: p.id, at, state, detail, newVersion };
  }

  checks(provisionId: string): ProvisionCheck[] {
    return (this.db.prepare("SELECT * FROM statute_check WHERE provision_id = ? ORDER BY seq DESC LIMIT 50").all(provisionId) as Array<Record<string, unknown>>).map((r) => ({ provisionId: String(r.provision_id), at: String(r.at), state: r.state as CheckState, detail: String(r.detail), newVersion: (r.new_version as number | null) ?? null }));
  }

  /** D2: the law on a governing date, with its basis. */
  inForce(actId: string, number: string, date: string): InForceResult {
    const act = this.act(actId);
    if (!act) throw new StoreError("NOT_FOUND", actId);
    const versions = this.versions(actId, number);
    const events = this.events(actId, number);
    const a = inForceOn({ act, versions, events, date });
    return { actId, actTitle: act.title, provision: versions[0]?.number ?? number, date, state: a.state, version: a.version, basis: a.basis, events, crosswalk: [], check: a.check, stale: a.version ? a.version.stale : act.stale };
  }

  /** Full text over the current provisions. `kinds` and `jurisdiction` filter the instruments. */
  searchProvisions(query: string, opts: { phrase?: boolean; raw?: boolean; kinds?: InstrumentKind[]; jurisdiction?: string; actId?: string; limit?: number } = {}): ProvisionHit[] {
    const q = opts.raw ? query : ftsTerms(query, opts.phrase);
    if (!q) return [];
    const where = ["provision_fts MATCH ?"];
    const args: Array<string | number> = [q];
    if (opts.kinds?.length) {
      where.push(`a.kind IN (${opts.kinds.map(() => "?").join(", ")})`);
      args.push(...opts.kinds);
    }
    if (opts.jurisdiction) {
      where.push("a.jurisdiction = ? COLLATE NOCASE");
      args.push(opts.jurisdiction);
    }
    if (opts.actId) {
      where.push("a.id = ?");
      args.push(opts.actId);
    }
    args.push(Math.min(opts.limit ?? 20, 200));
    let rows: Array<Record<string, unknown>>;
    try {
      rows = this.db
        .prepare(`SELECT p.*, a.title AS act_title, a.check_interval_days AS days, bm25(provision_fts, 0, 6, 5, 1, 2) AS rank FROM provision_fts f JOIN statute_provision p ON p.id = f.id JOIN statute_act a ON a.id = p.act_id WHERE ${where.join(" AND ")} ORDER BY rank LIMIT ?`)
        .all(...args) as Array<Record<string, unknown>>;
    } catch (e) {
      throw new StoreError("BAD_QUERY", `the search text is not a valid query: ${(e as Error).message}`);
    }
    return rows.map((r) => ({ provision: this.provRow(r, Number(r.days), String(r.act_title)), rank: Number(r.rank) }));
  }

  /** "Section 138 of the Negotiable Instruments Act": the provision by its number and the Act's name. */
  findProvision(number: string, actWords: string): Provision[] {
    const words = actWords.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !["the", "act", "code", "and", "rules"].includes(w));
    const acts = this.acts().filter((a) => words.length > 0 && words.every((w) => a.title.toLowerCase().includes(w)));
    const out: Provision[] = [];
    for (const a of acts) {
      const r = this.db.prepare("SELECT * FROM statute_provision WHERE act_id = ? AND number = ? COLLATE NOCASE AND current = 1 ORDER BY ord").all(a.id, number) as Array<Record<string, unknown>>;
      for (const x of r) out.push(this.provRow(x, a.checkIntervalDays, a.title));
    }
    return out;
  }

  // ---- E1: judgment paragraphs ----

  putJudgment(id: string, meta: { court: string; courtName: string; title: string; decisionDate: string; citations: string[]; judges: string[] }, paras: ParaInput[], ctx: WriteContext): void {
    const at = new Date().toISOString();
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM para_fts WHERE judgment_id = ?").run(id);
      const keep = new Map((this.db.prepare("SELECT para, role, role_status FROM judgment_para WHERE judgment_id = ? AND role_status = 'confirmed'").all(id) as Array<{ para: number; role: string; role_status: string }>).map((r) => [r.para, r]));
      this.db.prepare("DELETE FROM judgment_para WHERE judgment_id = ?").run(id);
      const ins = this.db.prepare("INSERT INTO judgment_para (judgment_id, para, label, page, line, text, role, role_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      const fts = this.db.prepare("INSERT INTO para_fts (judgment_id, para, text) VALUES (?, ?, ?)");
      for (const p of paras) {
        const k = keep.get(p.para);
        ins.run(id, p.para, p.label, p.page, p.line, p.text, k?.role ?? null, k?.role_status ?? null);
        fts.run(id, p.para, p.text);
      }
      this.db
        .prepare("INSERT OR REPLACE INTO judgment_identity (id, court, court_name, title, decision_date, citations, judges, bench_strength, paragraphs, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, meta.court, meta.courtName, meta.title, meta.decisionDate, JSON.stringify(meta.citations), JSON.stringify(meta.judges), meta.judges.length, paras.length, at);
      this.db.prepare("DELETE FROM citation_key WHERE judgment_id = ?").run(id);
      const key = this.db.prepare("INSERT OR IGNORE INTO citation_key (key, judgment_id) VALUES (?, ?)");
      for (const c of meta.citations) key.run(citationKey(c), id);
      appendChained(this.db, ctx, "judgment.indexed", id, { paragraphs: paras.length });
    });
  }

  judgment(id: string): { id: string; court: string; courtName: string; title: string; decisionDate: string; citations: string[]; judges: string[]; benchStrength: number; paragraphs: number; indexedAt: string } | null {
    const r = this.db.prepare("SELECT * FROM judgment_identity WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? { id: String(r.id), court: String(r.court), courtName: String(r.court_name), title: String(r.title), decisionDate: String(r.decision_date), citations: JSON.parse(String(r.citations)) as string[], judges: JSON.parse(String(r.judges)) as string[], benchStrength: Number(r.bench_strength), paragraphs: Number(r.paragraphs), indexedAt: String(r.indexed_at) } : null;
  }

  /** The judgment a citation names, when it is indexed. */
  byCitation(citation: string): string[] {
    return (this.db.prepare("SELECT judgment_id FROM citation_key WHERE key = ?").all(citationKey(citation)) as Array<{ judgment_id: string }>).map((r) => r.judgment_id);
  }

  paras(judgmentId: string, from = 1, to = 1_000_000): ParaInput[] {
    return (this.db.prepare("SELECT para, label, page, line, text FROM judgment_para WHERE judgment_id = ? AND para BETWEEN ? AND ? ORDER BY para").all(judgmentId, from, to) as Array<Record<string, unknown>>).map((r) => ({ para: Number(r.para), label: String(r.label), page: Number(r.page), line: Number(r.line), text: String(r.text) }));
  }

  searchParas(query: string, opts: { phrase?: boolean; raw?: boolean; judgmentIds?: string[]; court?: string; limit?: number } = {}): ParaHit[] {
    const q = opts.raw ? query : ftsTerms(query, opts.phrase);
    if (!q) return [];
    const where = ["para_fts MATCH ?"];
    const args: Array<string | number> = [q];
    if (opts.judgmentIds?.length) {
      where.push(`f.judgment_id IN (${opts.judgmentIds.map(() => "?").join(", ")})`);
      args.push(...opts.judgmentIds);
    }
    if (opts.court) {
      where.push("j.court = ?");
      args.push(opts.court);
    }
    args.push(Math.min(opts.limit ?? 30, 300));
    let rows: Array<Record<string, unknown>>;
    try {
      rows = this.db
        .prepare(`SELECT p.*, bm25(para_fts) AS rank FROM para_fts f JOIN judgment_para p ON p.judgment_id = f.judgment_id AND p.para = f.para JOIN judgment_identity j ON j.id = f.judgment_id WHERE ${where.join(" AND ")} ORDER BY rank LIMIT ?`)
        .all(...args) as Array<Record<string, unknown>>;
    } catch (e) {
      throw new StoreError("BAD_QUERY", `the search text is not a valid query: ${(e as Error).message}`);
    }
    return rows.map((r) => ({ judgmentId: String(r.judgment_id), para: Number(r.para), label: String(r.label), page: Number(r.page), line: Number(r.line), text: String(r.text), rank: Number(r.rank) }));
  }

  // ---- G1, G4: the legal knowledge graph ----

  /** Replace the candidate edges built from one judgment. Confirmed and rejected edges stay. */
  putEdges(builtFrom: string, edges: Array<Omit<LegalEdge, "id" | "status" | "builtFrom" | "builtAt">>, ctx: WriteContext): number {
    const at = new Date().toISOString();
    let n = 0;
    inTransaction(this.db, () => {
      this.db.prepare("DELETE FROM legal_edge WHERE built_from = ? AND status = 'candidate'").run(builtFrom);
      const ins = this.db.prepare("INSERT OR IGNORE INTO legal_edge (id, from_kind, from_id, relation, to_kind, to_id, evidence_ref, quote, status, built_from, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)");
      for (const e of edges) n += Number(ins.run(randomUUID(), e.fromKind, e.fromId, e.relation, e.toKind, e.toId, e.evidenceRef, e.quote.slice(0, 600), builtFrom, at).changes);
      appendChained(this.db, ctx, "graph.edges", builtFrom, { edges: n });
    });
    return n;
  }

  decideEdge(id: string, status: "confirmed" | "rejected", ctx: WriteContext): void {
    if (ctx.actor !== "advocate") throw new StoreError("HUMAN_ONLY", "only the advocate confirms or rejects a treatment");
    inTransaction(this.db, () => {
      const r = this.db.prepare("UPDATE legal_edge SET status = ? WHERE id = ?").run(status, id);
      if (Number(r.changes) === 0) throw new StoreError("NOT_FOUND", id);
      appendChained(this.db, ctx, `graph.edge.${status}`, id, null);
    });
  }

  edges(filter: { fromKind?: string; fromId?: string; toKind?: string; toId?: string; relations?: LegalRelation[]; limit?: number } = {}): LegalEdge[] {
    const where = ["status != 'rejected'"];
    const args: Array<string | number> = [];
    for (const [col, v] of [["from_kind", filter.fromKind], ["from_id", filter.fromId], ["to_kind", filter.toKind], ["to_id", filter.toId]] as const) {
      if (v) {
        where.push(`${col} = ?`);
        args.push(v);
      }
    }
    if (filter.relations?.length) {
      where.push(`relation IN (${filter.relations.map(() => "?").join(", ")})`);
      args.push(...filter.relations);
    }
    args.push(Math.min(filter.limit ?? 200, 2000));
    return (this.db.prepare(`SELECT * FROM legal_edge WHERE ${where.join(" AND ")} ORDER BY built_at DESC LIMIT ?`).all(...args) as Array<Record<string, unknown>>).map(edgeRow);
  }

  /**
   * Walk the graph from one node, both ways, to `depth` hops (a recursive query). Each node comes
   * back once, with the hop count and the relation that reached it.
   */
  walk(kind: string, id: string, opts: { relations?: LegalRelation[]; depth?: number; limit?: number } = {}): Array<{ kind: string; id: string; hops: number; relation: string; direction: "out" | "in"; evidenceRef: string }> {
    const depth = Math.min(Math.max(opts.depth ?? 2, 1), 4);
    const rel = opts.relations?.length ? `AND e.relation IN (${opts.relations.map((r) => `'${r.replace(/[^a-z_]/g, "")}'`).join(", ")})` : "";
    const rows = this.db
      .prepare(
        `WITH RECURSIVE reach(kind, id, hops, relation, direction, evidence_ref) AS (
           SELECT ?, ?, 0, '', 'out', ''
           UNION
           SELECT CASE WHEN e.from_kind = r.kind AND e.from_id = r.id THEN e.to_kind ELSE e.from_kind END,
                  CASE WHEN e.from_kind = r.kind AND e.from_id = r.id THEN e.to_id ELSE e.from_id END,
                  r.hops + 1, e.relation,
                  CASE WHEN e.from_kind = r.kind AND e.from_id = r.id THEN 'out' ELSE 'in' END, e.evidence_ref
           FROM reach r JOIN legal_edge e ON ((e.from_kind = r.kind AND e.from_id = r.id) OR (e.to_kind = r.kind AND e.to_id = r.id))
           WHERE r.hops < ? AND e.status != 'rejected' ${rel}
         )
         SELECT kind, id, min(hops) AS hops, relation, direction, evidence_ref FROM reach WHERE hops > 0 GROUP BY kind, id ORDER BY hops LIMIT ?`,
      )
      .all(kind, id, depth, Math.min(opts.limit ?? 100, 1000)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ kind: String(r.kind), id: String(r.id), hops: Number(r.hops), relation: String(r.relation), direction: r.direction as "out" | "in", evidenceRef: String(r.evidence_ref) }));
  }

  // ---- G6: vector rows ----

  putVector(scope: string, id: string, model: string, text: string, v: Float32Array): void {
    this.db.prepare("INSERT OR REPLACE INTO vector (scope, id, model, dim, text_hash, v) VALUES (?, ?, ?, ?, ?, ?)").run(scope, id, model, v.length, textHash(text), new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  }

  /** The ids of a scope that have no vector of this model for their present text. */
  hasVector(scope: string, id: string, model: string, text: string): boolean {
    const r = this.db.prepare("SELECT text_hash FROM vector WHERE scope = ? AND id = ? AND model = ?").get(scope, id, model) as { text_hash: string } | undefined;
    return r?.text_hash === textHash(text);
  }

  vectors(scope: string, model: string): Array<{ id: string; v: Float32Array }> {
    return (this.db.prepare("SELECT id, v FROM vector WHERE scope = ? AND model = ?").all(scope, model) as Array<{ id: string; v: Uint8Array }>).map((r) => ({ id: r.id, v: new Float32Array(r.v.buffer.slice(r.v.byteOffset, r.v.byteOffset + r.v.byteLength)) }));
  }

  // ---- G8: rebuild and health ----

  /** Make the full-text tables again from the rows. Returns the row counts. */
  rebuild(): { provisions: number; paragraphs: number } {
    const at = new Date().toISOString();
    let provisions = 0;
    let paragraphs = 0;
    inTransaction(this.db, () => {
      this.db.exec("DELETE FROM provision_fts; DELETE FROM para_fts;");
      for (const r of this.db.prepare("SELECT p.id, p.number, p.heading, p.text, a.title FROM statute_provision p JOIN statute_act a ON a.id = p.act_id WHERE p.current = 1").all() as Array<Record<string, unknown>>) {
        this.db.prepare("INSERT INTO provision_fts (id, number, heading, text, act) VALUES (?, ?, ?, ?, ?)").run(String(r.id), String(r.number), String(r.heading), String(r.text), String(r.title));
        provisions++;
      }
      for (const r of this.db.prepare("SELECT judgment_id, para, text FROM judgment_para").all() as Array<Record<string, unknown>>) {
        this.db.prepare("INSERT INTO para_fts (judgment_id, para, text) VALUES (?, ?, ?)").run(String(r.judgment_id), Number(r.para), String(r.text));
        paragraphs++;
      }
      const put = this.db.prepare("INSERT OR REPLACE INTO index_build (name, rows, built_at) VALUES (?, ?, ?)");
      put.run("provision_fts", provisions, at);
      put.run("para_fts", paragraphs, at);
    });
    return { provisions, paragraphs };
  }

  counts(): { acts: number; provisions: number; versions: number; stale: number; judgments: number; paragraphs: number; edges: number; vectors: number; builds: Array<{ name: string; rows: number; builtAt: string }> } {
    const n = (sql: string) => Number((this.db.prepare(sql).get() as { n: number }).n);
    const acts = this.acts();
    let stale = 0;
    for (const a of acts) stale += this.provisions(a.id).filter((p) => p.stale).length;
    return {
      acts: acts.length,
      provisions: n("SELECT count(*) AS n FROM statute_provision WHERE current = 1"),
      versions: n("SELECT count(*) AS n FROM statute_provision"),
      stale,
      judgments: n("SELECT count(*) AS n FROM judgment_identity"),
      paragraphs: n("SELECT count(*) AS n FROM judgment_para"),
      edges: n("SELECT count(*) AS n FROM legal_edge WHERE status != 'rejected'"),
      vectors: n("SELECT count(*) AS n FROM vector"),
      builds: (this.db.prepare("SELECT * FROM index_build").all() as Array<Record<string, unknown>>).map((r) => ({ name: String(r.name), rows: Number(r.rows), builtAt: String(r.built_at) })),
    };
  }
}

function edgeRow(r: Record<string, unknown>): LegalEdge {
  return { id: String(r.id), fromKind: String(r.from_kind), fromId: String(r.from_id), relation: r.relation as LegalRelation, toKind: String(r.to_kind), toId: String(r.to_id), evidenceRef: String(r.evidence_ref), quote: String(r.quote), status: r.status as LegalEdge["status"], builtFrom: String(r.built_from), builtAt: String(r.built_at) };
}

/** A citation as a lookup key: case, spaces and brackets never count. */
export function citationKey(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
