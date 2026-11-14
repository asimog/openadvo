/**
 * V5-10: support, voice and treatment of authorities; V5-11: the challenge register of the
 * hearing rehearsal. Part of the matter store (decision 4). The agent proposes; the advocate
 * confirms. Plain library. Spec: docs/specs/v5.md.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const AUTHORITY2_SCHEMA = `
CREATE TABLE IF NOT EXISTS authority_assessment (
  authority_id TEXT PRIMARY KEY,
  support TEXT CHECK (support IS NULL OR support IN ('supports', 'partially_supports', 'does_not_support', 'contrary', 'cannot_assess')),
  support_basis TEXT NOT NULL DEFAULT '',
  support_status TEXT NOT NULL DEFAULT 'candidate' CHECK (support_status IN ('candidate', 'confirmed')),
  voice TEXT CHECK (voice IS NULL OR voice IN ('holding', 'obiter', 'counsel_submission', 'lower_court_view', 'dissent', 'concurrence', 'unknown')),
  voice_basis TEXT NOT NULL DEFAULT '',
  voice_status TEXT NOT NULL DEFAULT 'candidate' CHECK (voice_status IN ('candidate', 'confirmed')),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS treatment (
  id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('overruled', 'doubted', 'distinguished', 'followed', 'referred_to_larger_bench')),
  by_citation TEXT NOT NULL,
  by_date TEXT NOT NULL DEFAULT '',
  by_bench INTEGER,
  authority_date TEXT NOT NULL DEFAULT '',
  authority_bench INTEGER,
  note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL CHECK (author IN ('advocate', 'agent')),
  review_item_id TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS challenge (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bench_question', 'objection')),
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  answer TEXT NOT NULL,
  refs TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('generated', 'verified_defect')),
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
  created_at TEXT NOT NULL
) STRICT;
`;

export const SUPPORTS = ["supports", "partially_supports", "does_not_support", "contrary", "cannot_assess"] as const;
export const VOICES = ["holding", "obiter", "counsel_submission", "lower_court_view", "dissent", "concurrence", "unknown"] as const;
export const TREATMENTS = ["overruled", "doubted", "distinguished", "followed", "referred_to_larger_bench"] as const;

export interface Assessment {
  authorityId: string;
  support: (typeof SUPPORTS)[number] | null;
  supportBasis: string;
  supportStatus: "candidate" | "confirmed";
  voice: (typeof VOICES)[number] | null;
  voiceBasis: string;
  voiceStatus: "candidate" | "confirmed";
}

export interface Treatment {
  id: string;
  authorityId: string;
  kind: (typeof TREATMENTS)[number];
  byCitation: string;
  byDate: string;
  byBench: number | null;
  authorityDate: string;
  authorityBench: number | null;
  note: string;
  author: "advocate" | "agent";
  reviewItemId: string | null;
  createdAt: string;
}

export interface Challenge {
  id: string;
  runId: string;
  kind: "bench_question" | "objection";
  category: string;
  text: string;
  answer: string;
  refs: string[];
  origin: "generated" | "verified_defect";
  status: "open" | "accepted" | "rejected";
  createdAt: string;
}

export function assessments(db: DatabaseSync): Assessment[] {
  return (db.prepare("SELECT * FROM authority_assessment").all() as Array<Record<string, unknown>>).map((r) => ({
    authorityId: String(r.authority_id),
    support: (r.support ?? null) as Assessment["support"],
    supportBasis: String(r.support_basis),
    supportStatus: r.support_status as Assessment["supportStatus"],
    voice: (r.voice ?? null) as Assessment["voice"],
    voiceBasis: String(r.voice_basis),
    voiceStatus: r.voice_status as Assessment["voiceStatus"],
  }));
}

/** Set support or voice. The agent's value is a candidate; the advocate's is confirmed. */
export function assess(db: DatabaseSync, authorityId: string, field: "support" | "voice", value: string, basis: string, confirmed: boolean): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO authority_assessment (authority_id, updated_at) VALUES (?, ?)").run(authorityId, now);
  db.prepare(`UPDATE authority_assessment SET ${field} = ?, ${field}_basis = ?, ${field}_status = ?, updated_at = ? WHERE authority_id = ?`).run(value, basis.slice(0, 1000), confirmed ? "confirmed" : "candidate", now, authorityId);
}

export function treatments(db: DatabaseSync): Treatment[] {
  return (db.prepare("SELECT * FROM treatment ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    authorityId: String(r.authority_id),
    kind: r.kind as Treatment["kind"],
    byCitation: String(r.by_citation),
    byDate: String(r.by_date),
    byBench: r.by_bench == null ? null : Number(r.by_bench),
    authorityDate: String(r.authority_date),
    authorityBench: r.authority_bench == null ? null : Number(r.authority_bench),
    note: String(r.note),
    author: r.author as Treatment["author"],
    reviewItemId: r.review_item_id == null ? null : String(r.review_item_id),
    createdAt: String(r.created_at),
  }));
}

export function insertTreatment(db: DatabaseSync, t: Omit<Treatment, "id" | "createdAt" | "reviewItemId">, reviewItemId: string | null): Treatment {
  const id = randomUUID();
  db.prepare("INSERT INTO treatment VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, t.authorityId, t.kind, t.byCitation.slice(0, 200), t.byDate, t.byBench, t.authorityDate, t.authorityBench, t.note.slice(0, 1000), t.author, reviewItemId, new Date().toISOString());
  return treatments(db).find((x) => x.id === id)!;
}

/**
 * The deterministic overruling check (I rule 7). Returns what to flag, or null. Missing bench
 * strength or dates give a question, never a guess.
 */
export function overrulingCheck(t: Pick<Treatment, "kind" | "byDate" | "byBench" | "authorityDate" | "authorityBench" | "byCitation">): { kind: "missing_facts" | "smaller_bench" | "earlier_judgment"; detail: string } | null {
  if (t.kind !== "overruled") return null;
  if (t.byBench == null || t.authorityBench == null || !t.byDate || !t.authorityDate) {
    return { kind: "missing_facts", detail: `The bench strength and the date of both judgments are needed to check the overruling by ${t.byCitation}.` };
  }
  if (t.byBench < t.authorityBench) return { kind: "smaller_bench", detail: `${t.byCitation} (a bench of ${t.byBench}) is recorded as overruling a judgment of a bench of ${t.authorityBench}.` };
  if (t.byDate < t.authorityDate) return { kind: "earlier_judgment", detail: `${t.byCitation} (${t.byDate}) is earlier than the judgment it is recorded as overruling (${t.authorityDate}).` };
  return null;
}

export function challenges(db: DatabaseSync): Challenge[] {
  return (db.prepare("SELECT * FROM challenge ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    kind: r.kind as Challenge["kind"],
    category: String(r.category),
    text: String(r.text),
    answer: String(r.answer),
    refs: JSON.parse(String(r.refs)),
    origin: r.origin as Challenge["origin"],
    status: r.status as Challenge["status"],
    createdAt: String(r.created_at),
  }));
}

export function insertChallenge(db: DatabaseSync, c: Omit<Challenge, "id" | "createdAt" | "status">): void {
  db.prepare("INSERT INTO challenge VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)").run(randomUUID(), c.runId, c.kind, c.category.slice(0, 60), c.text.slice(0, 1000), c.answer.slice(0, 2000), JSON.stringify(c.refs), c.origin, new Date().toISOString());
}

export function decideChallenge(db: DatabaseSync, id: string, status: "accepted" | "rejected"): boolean {
  return Number(db.prepare("UPDATE challenge SET status = ? WHERE id = ?").run(status, id).changes) > 0;
}

// ---- V5-9 and V5-12: quick check and bench trends, over the judgment index ----

export type QuickOutcome = "found" | "not_found" | "mismatch" | "unavailable";

export interface QuickCheck {
  citation: string;
  outcome: QuickOutcome;
  /** The field that differs, for a mismatch. */
  field: string | null;
  detail: string;
}

const words = (s: string) => new Set(s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["STATE", "UNION", "INDIA", "OTHERS", "VERSUS", "THROUGH"].includes(w)));

/**
 * Compare a citation with the index, using the parties and date the matter records. Labelled
 * "Quick check, not verified" by every caller; the gates never read it (I rules 14 to 16).
 */
export function quickCheck(
  citation: string,
  recorded: { parties: string; decisionDate: string },
  index: { yearIndexed(year: number): boolean; byInsc(insc: string): { title: string; decisionDate: string } | undefined },
): QuickCheck {
  const m = /^(\d{4})\s*INSC\s*(\d+)$/i.exec(citation.replace(/\s+/g, " ").trim());
  if (!m) return { citation, outcome: "unavailable", field: null, detail: "Not a neutral citation; the quick check reads only neutral citations." };
  if (!index.yearIndexed(Number(m[1]))) return { citation, outcome: "unavailable", field: null, detail: `Supreme Court ${m[1]} is not in the local index.` };
  const j = index.byInsc(`${m[1]} INSC ${m[2]}`);
  if (!j) return { citation, outcome: "not_found", field: null, detail: `No judgment ${m[1]} INSC ${m[2]} in the indexed year.` };
  if (recorded.decisionDate && j.decisionDate && recorded.decisionDate !== j.decisionDate) {
    return { citation, outcome: "mismatch", field: "decision date", detail: `The matter records ${recorded.decisionDate}; the index says ${j.decisionDate} (${j.title}).` };
  }
  if (recorded.parties.trim()) {
    const a = words(recorded.parties);
    const b = words(j.title);
    const common = [...a].filter((w) => b.has(w)).length;
    if (a.size > 0 && common === 0) return { citation, outcome: "mismatch", field: "parties", detail: `The matter records "${recorded.parties}"; the index says "${j.title}".` };
  }
  return { citation, outcome: "found", field: null, detail: j.title };
}

export type DisposalClass = "allowed" | "dismissed" | "disposed" | "other";

export function disposalClass(text: string): DisposalClass {
  const t = text.toLowerCase();
  if (/allowed|set aside|quashed|granted/.test(t) && !/dismiss/.test(t)) return "allowed";
  if (/dismiss/.test(t)) return "dismissed";
  if (/dispos/.test(t)) return "disposed";
  return "other";
}
