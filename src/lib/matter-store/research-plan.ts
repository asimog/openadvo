/**
 * J2: the research plan. The agent proposes the questions, modes and scopes; the advocate
 * approves the plan before a long run. The plan records what was reached and what was not.
 * Plain library (decision 6); it writes only to this matter.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ResearchPlan, ResearchPlanStep, SearchMode, KnowledgeScope } from "../../shared/law.ts";
import type { WriteContext } from "../../shared/records.ts";
import { MatterStoreError, type MatterStore } from "./index.ts";

export const RESEARCH_PLAN_SCHEMA = `
CREATE TABLE IF NOT EXISTS research_plan (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  issue_id TEXT,
  governing_date TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'running', 'done', 'stopped')),
  completeness TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
`;

export interface ResearchPlanInput {
  question: string;
  issueId?: string | null;
  governingDate?: string | null;
  steps: Array<{ question: string; mode: SearchMode; scopes: KnowledgeScope[] }>;
}

const now = () => new Date().toISOString();
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export class ResearchPlanStore {
  private store: MatterStore;
  private db: DatabaseSync;

  constructor(store: MatterStore, db: DatabaseSync) {
    this.store = store;
    this.db = db;
  }

  private row(r: Record<string, unknown>): ResearchPlan {
    return {
      id: String(r.id),
      question: String(r.question),
      issueId: (r.issue_id as string | null) ?? null,
      governingDate: (r.governing_date as string | null) || null,
      steps: JSON.parse(String(r.steps)) as ResearchPlanStep[],
      status: r.status as ResearchPlan["status"],
      completeness: JSON.parse(String(r.completeness)) as ResearchPlan["completeness"],
      author: r.author as ResearchPlan["author"],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  list(): ResearchPlan[] {
    return (this.db.prepare("SELECT * FROM research_plan ORDER BY created_at DESC, rowid DESC").all() as Array<Record<string, unknown>>).map((row) => this.row(row));
  }

  get(id: string): ResearchPlan | null {
    const row = this.db.prepare("SELECT * FROM research_plan WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.row(row) : null;
  }

  add(input: ResearchPlanInput, ctx: WriteContext): ResearchPlan {
    if (!clean(input.question, 2_000)) throw new MatterStoreError("NO_QUESTION", "a research plan needs a question");
    if (input.steps.length === 0 || input.steps.length > 12) throw new MatterStoreError("BAD_STEPS", "a research plan needs 1 to 12 steps");
    const author = ctx.actor === "advocate" ? "advocate" : "agent";
    const id = randomUUID();
    const at = now();
    const steps: ResearchPlanStep[] = input.steps.map((step, index) => ({
      n: index + 1,
      question: clean(step.question, 1_000),
      mode: step.mode,
      scopes: step.scopes,
      status: "planned",
      hits: 0,
      note: "",
    }));
    this.db
      .prepare("INSERT INTO research_plan (id, question, issue_id, governing_date, steps, status, completeness, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, clean(input.question, 2_000), input.issueId ?? null, input.governingDate ?? "", JSON.stringify(steps), author === "advocate" ? "approved" : "proposed", JSON.stringify({ issuesWithoutAuthority: [], authoritiesNotChecked: [], sourcesNotReached: [] }), author, at, at);
    this.store.appendEvent(ctx, "research_plan.proposed", id, { question: clean(input.question, 300), steps: steps.length, author });
    return this.get(id)!;
  }

  /** Human-only: approve or stop the plan before or during the run. */
  decide(id: string, decision: "approved" | "stopped", ctx: WriteContext): ResearchPlan {
    if (ctx.actor !== "advocate") throw new MatterStoreError("HUMAN_ONLY", "only the advocate decides a research plan");
    const at = now();
    const r = this.db.prepare("UPDATE research_plan SET status = ?, updated_at = ? WHERE id = ?").run(decision, at, id);
    if (Number(r.changes) === 0) throw new MatterStoreError("NOT_FOUND", id);
    this.store.appendEvent(ctx, `research_plan.${decision}`, id, null);
    return this.get(id)!;
  }

  /** The agent records a step's result; it never changes the plan's approval. */
  setStep(id: string, n: number, patch: { status?: ResearchPlanStep["status"]; hits?: number; note?: string }, ctx: WriteContext): ResearchPlan {
    const plan = this.get(id);
    if (!plan) throw new MatterStoreError("NOT_FOUND", id);
    const step = plan.steps.find((row) => row.n === n);
    if (!step) throw new MatterStoreError("NOT_FOUND", `step ${n}`);
    if (patch.status) step.status = patch.status;
    if (typeof patch.hits === "number") step.hits = Math.max(0, patch.hits);
    if (patch.note !== undefined) step.note = clean(patch.note, 1_000);
    const status: ResearchPlan["status"] = plan.steps.every((row) => row.status === "done" || row.status === "not_reached") ? "done" : "running";
    this.db.prepare("UPDATE research_plan SET steps = ?, status = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(plan.steps), status, now(), id);
    this.store.appendEvent(ctx, "research_plan.step", id, { step: n, status: step.status, hits: step.hits });
    return this.get(id)!;
  }
}
