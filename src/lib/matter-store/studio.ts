/**
 * The matter store, third part: the Research and Argument Studio (v4 spec, V4-2 and V4-3).
 * Still the single writer (decision 4). The agent and the argument loop write candidates; the
 * advocate decides (decision 5). Plain library.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { MatterStoreError, type MatterStore } from "./index.ts";
import type { WriteContext } from "../../shared/records.ts";
import type { ArgumentRecord, ArgumentRejection, ArgumentRun, ProvisionRecord } from "../../shared/studio.ts";

export const STUDIO_SCHEMA = `
CREATE TABLE IF NOT EXISTS provision (
  id TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,
  act TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  repealed INTEGER NOT NULL,
  url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'adopted', 'rejected')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS argument_run (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  model TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  generators INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  stats TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS argument (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES argument_run(id),
  issue_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  ground TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('petitioner', 'respondent')),
  claim TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  events TEXT NOT NULL,
  authorities TEXT NOT NULL,
  provisions TEXT NOT NULL,
  questions TEXT NOT NULL DEFAULT '[]',
  elo REAL NOT NULL DEFAULT 1000,
  attacks TEXT,
  attack_kind TEXT CHECK (attack_kind IS NULL OR attack_kind IN ('rebut', 'undercut', 'undermine')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'accepted', 'rejected')),
  decided_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS argument_rejection (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  ground TEXT NOT NULL,
  stance TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL,
  claim TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS argument_no_delete BEFORE DELETE ON argument BEGIN SELECT RAISE(ABORT, 'arguments are marked, never deleted'); END;
CREATE TRIGGER IF NOT EXISTS rejection_no_update BEFORE UPDATE ON argument_rejection BEGIN SELECT RAISE(ABORT, 'rejections are append-only'); END;
`;

const now = () => new Date().toISOString();
const clean = (s: unknown, max = 4000) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function who(ctx: WriteContext): "advocate" | "agent" {
  if (ctx.actor === "advocate" || ctx.actor === "agent") return ctx.actor;
  throw new MatterStoreError("BAD_ACTOR", "the advocate or the agent writes this record");
}

function human(ctx: WriteContext, what: string): void {
  if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", `only the advocate ${what}`);
}

export class StudioStore {
  private store: MatterStore;
  private db: DatabaseSync;

  constructor(store: MatterStore, db: DatabaseSync) {
    this.store = store;
    this.db = db;
  }

  // ---- V4-2: statutory provisions ----

  listProvisions(): ProvisionRecord[] {
    return (this.db.prepare("SELECT * FROM provision ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      sourceRef: String(r.source_ref),
      act: String(r.act),
      section: String(r.section),
      title: String(r.title),
      text: String(r.text),
      repealed: Number(r.repealed) === 1,
      url: String(r.url),
      retrievedAt: String(r.retrieved_at),
      author: r.author as "advocate" | "agent",
      status: r.status as ProvisionRecord["status"],
      createdAt: String(r.created_at),
    }));
  }

  addProvision(input: Omit<ProvisionRecord, "id" | "author" | "status" | "createdAt">, ctx: WriteContext): ProvisionRecord {
    const by = who(ctx);
    const existing = this.listProvisions().find((p) => p.sourceRef === input.sourceRef && p.status !== "rejected");
    if (existing) return existing;
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO provision VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, clean(input.sourceRef, 200), clean(input.act, 300), clean(input.section, 40), clean(input.title, 300), String(input.text ?? "").slice(0, 40_000), input.repealed ? 1 : 0, clean(input.url, 500), input.retrievedAt, by, by === "advocate" ? "adopted" : "candidate", now());
    this.store.appendEvent(ctx, "provision.added", id, { act: input.act, section: input.section, repealed: input.repealed });
    return this.listProvisions().find((p) => p.id === id)!;
  }

  decideProvision(id: string, decision: "adopted" | "rejected", ctx: WriteContext): ProvisionRecord {
    human(ctx, "adopts or rejects a provision");
    const r = this.db.prepare("UPDATE provision SET status = ? WHERE id = ?").run(decision, id);
    if (Number(r.changes) === 0) throw new MatterStoreError("PROVISION_NOT_FOUND", id);
    this.store.appendEvent(ctx, `provision.${decision}`, id, null);
    return this.listProvisions().find((p) => p.id === id)!;
  }

  // ---- V4-3: argument runs ----

  startRun(input: { issueId: string; model: string; rounds: number; generators: number }, ctx: WriteContext): ArgumentRun {
    const id = randomUUID();
    this.db.prepare("INSERT INTO argument_run (id, issue_id, model, rounds, generators, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)").run(id, input.issueId, input.model, input.rounds, input.generators, now());
    this.store.appendEvent(ctx, "argument_run.started", id, { issueId: input.issueId, model: input.model, rounds: input.rounds, generators: input.generators });
    return this.run(id)!;
  }

  finishRun(id: string, status: "done" | "failed", stats: Record<string, unknown>, error: string | null): ArgumentRun {
    this.db.prepare("UPDATE argument_run SET status = ?, stats = ?, error = ?, finished_at = ? WHERE id = ?").run(status, JSON.stringify(stats), error, now(), id);
    this.store.appendEvent({ actor: "system" }, `argument_run.${status}`, id, { ...stats, error });
    return this.run(id)!;
  }

  run(id: string): ArgumentRun | undefined {
    return this.runs().find((r) => r.id === id);
  }

  runs(): ArgumentRun[] {
    return (this.db.prepare("SELECT * FROM argument_run ORDER BY started_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      issueId: String(r.issue_id),
      model: String(r.model),
      rounds: Number(r.rounds),
      generators: Number(r.generators),
      status: r.status as ArgumentRun["status"],
      stats: JSON.parse(String(r.stats)) as Record<string, unknown>,
      error: r.error == null ? null : String(r.error),
      startedAt: String(r.started_at),
      finishedAt: r.finished_at == null ? null : String(r.finished_at),
    }));
  }

  /** An argument that passed the code checks. Written by the loop (the system). */
  addArgument(input: Omit<ArgumentRecord, "id" | "status" | "decidedAt" | "createdAt" | "elo" | "questions">): ArgumentRecord {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO argument (id, run_id, issue_id, round, ground, stance, claim, reasoning, events, authorities, provisions, attacks, attack_kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?)",
      )
      .run(id, input.runId, input.issueId, input.round, input.ground, input.stance, clean(input.claim, 1500), clean(input.reasoning, 6000), JSON.stringify(input.events), JSON.stringify(input.authorities), JSON.stringify(input.provisions), input.attacks, input.attackKind, now());
    return this.argument(id)!;
  }

  setQuestions(id: string, questions: string[]): void {
    this.db.prepare("UPDATE argument SET questions = ? WHERE id = ?").run(JSON.stringify(questions.map((q) => clean(q, 500)).filter(Boolean).slice(0, 8)), id);
  }

  setElo(id: string, elo: number): void {
    this.db.prepare("UPDATE argument SET elo = ? WHERE id = ?").run(Math.round(elo * 10) / 10, id);
  }

  argument(id: string): ArgumentRecord | undefined {
    const r = this.db.prepare("SELECT * FROM argument WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.toArgument(r) : undefined;
  }

  arguments(issueId?: string): ArgumentRecord[] {
    const rows = (issueId ? this.db.prepare("SELECT * FROM argument WHERE issue_id = ? ORDER BY created_at, rowid").all(issueId) : this.db.prepare("SELECT * FROM argument ORDER BY created_at, rowid").all()) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toArgument(r));
  }

  private toArgument(r: Record<string, unknown>): ArgumentRecord {
    return {
      id: String(r.id),
      runId: String(r.run_id),
      issueId: String(r.issue_id),
      round: Number(r.round),
      ground: String(r.ground),
      stance: r.stance as ArgumentRecord["stance"],
      claim: String(r.claim),
      reasoning: String(r.reasoning),
      events: JSON.parse(String(r.events)),
      authorities: JSON.parse(String(r.authorities)),
      provisions: JSON.parse(String(r.provisions)),
      questions: JSON.parse(String(r.questions)),
      elo: Number(r.elo),
      attacks: r.attacks == null ? null : String(r.attacks),
      attackKind: r.attack_kind == null ? null : (String(r.attack_kind) as ArgumentRecord["attackKind"]),
      status: r.status as ArgumentRecord["status"],
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
      createdAt: String(r.created_at),
    };
  }

  /** Human-only: accept or reject an argument. */
  decideArgument(id: string, decision: "accepted" | "rejected", ctx: WriteContext): ArgumentRecord {
    human(ctx, "accepts or rejects an argument");
    const r = this.db.prepare("UPDATE argument SET status = ?, decided_at = ? WHERE id = ?").run(decision, now(), id);
    if (Number(r.changes) === 0) throw new MatterStoreError("ARGUMENT_NOT_FOUND", id);
    this.store.appendEvent(ctx, `argument.${decision}`, id, null);
    return this.argument(id)!;
  }

  addRejection(input: Omit<ArgumentRejection, "id" | "createdAt">): void {
    this.db
      .prepare("INSERT INTO argument_rejection VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), input.runId, input.round, input.ground, input.stance, input.reason, clean(input.detail, 600), clean(input.claim, 600), now());
  }

  /** The last `n` rejections of one cell of the archive, newest first (the loop's typed memory). */
  rejections(filter: { runId?: string; ground?: string; stance?: string } = {}, n = 200): ArgumentRejection[] {
    const where: string[] = [];
    const args: string[] = [];
    for (const [k, col] of [["runId", "run_id"], ["ground", "ground"], ["stance", "stance"]] as const) {
      if (filter[k]) {
        where.push(`${col} = ?`);
        args.push(filter[k]!);
      }
    }
    const rows = this.db.prepare(`SELECT * FROM argument_rejection ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, rowid DESC LIMIT ${Math.max(1, Math.min(n, 1000))}`).all(...args) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      runId: String(r.run_id),
      round: Number(r.round),
      ground: String(r.ground),
      stance: String(r.stance),
      reason: String(r.reason),
      detail: String(r.detail),
      claim: String(r.claim),
      createdAt: String(r.created_at),
    }));
  }
}
