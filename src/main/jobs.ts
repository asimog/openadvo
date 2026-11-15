/**
 * O7: the rows of the Jobs view. Chat runs and helpers come from the run trace
 * (`chat/trace.jsonl`, agent-framework section 5); skill runs from matter.db, with their package
 * and report card. The trace holds no arguments or results, so this shows no client text.
 */
import type { JobRow, SkillRunRecord } from "../shared/skills.ts";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function jobRows(trace: ReadonlyArray<Record<string, unknown>>, runs: readonly SkillRunRecord[]): JobRow[] {
  const chat = new Map<string, JobRow>();
  const helpers: JobRow[] = [];
  for (const line of trace) {
    const type = line.type;
    const at = typeof line.at === "string" ? line.at : null;
    const run = typeof line.run === "string" ? line.run : null;
    if (type === "run_start" && run) {
      chat.set(run, { id: run, kind: "chat", title: "Chat run", state: "running", startedAt: at, endedAt: null, tokens: 0, cost: 0, tools: 0, errors: 0 });
    } else if (type === "tool" && run) {
      const row = chat.get(run);
      if (row) {
        row.tools++;
        if (line.error === true) row.errors++;
      }
    } else if (type === "run_end" && run) {
      const row = chat.get(run) ?? { id: run, kind: "chat" as const, title: "Chat run", state: "running", startedAt: null, endedAt: null, tokens: 0, cost: 0, tools: 0, errors: 0 };
      row.state = line.failed === true ? "failed" : line.stopped === true ? "stopped" : "done";
      row.endedAt = at;
      row.tokens = n(line.tokens);
      row.cost = n(line.cost);
      chat.set(run, row);
    } else if (type === "helper_end") {
      helpers.push({ id: String(line.helper ?? ""), kind: "helper", title: `Helper ${String(line.name ?? "")} (${String(line.helperType ?? "")})`, state: "ended", startedAt: null, endedAt: at, tokens: n(line.tokens), cost: n(line.cost), tools: 0, errors: 0 });
    }
  }
  const skills: JobRow[] = runs.map((r) => ({
    id: r.id,
    kind: "skill",
    title: `${r.skillId} v${r.skillVersion}${r.report ? ` ${r.report.skillTitle}` : ""}`,
    state: r.state,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    tokens: r.report?.tokens.total ?? 0,
    cost: r.report?.cost ?? 0,
    tools: r.report?.toolsUsed.reduce((k, t) => k + t.calls, 0) ?? 0,
    errors: r.report?.toolsUsed.reduce((k, t) => k + t.errors, 0) ?? 0,
    packageId: r.packageId,
  }));
  const all = [...chat.values(), ...helpers, ...skills];
  return all.sort((a, b) => String(b.startedAt ?? b.endedAt ?? "").localeCompare(String(a.startedAt ?? a.endedAt ?? "")));
}
