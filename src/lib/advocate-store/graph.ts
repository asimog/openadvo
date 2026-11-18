/**
 * Phase 10 (G3): the advocate memory graph's plain rules. The graph is a derived edge table
 * (decision 13): it is rebuilt from advocate memory, the preferences, the library and the outcome
 * records, and owns nothing. It holds no client fact: an outcome contributes its result and its
 * legal subject, never a party or a piece of evidence.
 */
import type { AdvocateGraphEdge, AdvocateGraphInput, GraphNodeKind } from "../../shared/knowledge.ts";

export const GRAPH_SCHEMA = `
CREATE TABLE IF NOT EXISTS edge (
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL DEFAULT '',
  built_from TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (from_kind, from_id, relation, to_kind, to_id)
) STRICT;
CREATE TABLE IF NOT EXISTS graph_build (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  built_at TEXT NOT NULL,
  edges INTEGER NOT NULL
) STRICT;
`;

const PRECEDENT_KINDS = ["pleading", "submission", "template"];

/** A court node id in a free-text reason, or null. It reads only what the advocate wrote. */
export function courtIn(text: string): string | null {
  const id = /\b(in\.[a-z0-9.]+)\b/i.exec(text);
  if (id) return id[1].toLowerCase();
  if (/supreme court/i.test(text)) return "in.sc";
  if (/delhi high court/i.test(text)) return "in.hc.delhi";
  if (/high court/i.test(text)) return "in.hc";
  if (/district court/i.test(text)) return "in.dj";
  if (/tribunal/i.test(text)) return "in.tribunal";
  return null;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "unstated";
}

function edge(fromKind: GraphNodeKind, fromId: string, relation: AdvocateGraphEdge["relation"], toKind: GraphNodeKind, toId: string, evidenceRef: string, builtFrom: string, at: string): AdvocateGraphEdge {
  return { fromKind, fromId, relation, toKind, toId, evidenceRef, builtFrom, builtAt: at };
}

/** Build every edge. The order is stable, so a rebuild of the same records writes the same rows. */
export function buildAdvocateEdges(input: AdvocateGraphInput): AdvocateGraphEdge[] {
  const at = input.now;
  const out: AdvocateGraphEdge[] = [];
  const seen = new Set<string>();
  const add = (e: AdvocateGraphEdge): void => {
    const key = `${e.fromKind}:${e.fromId}:${e.relation}:${e.toKind}:${e.toId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // Preferences: what the advocate prefers, and the court it applies in.
  for (const p of input.preferences.filter((x) => x.status === "approved").sort((a, b) => a.id.localeCompare(b.id))) {
    add(edge("advocate", "self", "prefers", "preference", p.id, `preference:${p.id}`, "preference", at));
    const court = courtIn(`${p.key} ${p.value} ${p.reason}`);
    if (court) add(edge("preference", p.id, "applies_in", "court", court, `preference:${p.id}`, "preference", at));
  }

  // Advocate memory: approved records, rejected positions and corrections.
  for (const m of [...input.memory].sort((a, b) => a.memoryId.localeCompare(b.memoryId))) {
    const ref = `memory:${m.memoryId}`;
    if (m.type === "approved_precedent" && m.status === "confirmed") {
      add(edge("advocate", "self", "approved", "precedent", m.memoryId, ref, "memory", at));
      const court = courtIn(`${m.subject} ${m.object}`);
      if (court) add(edge("precedent", m.memoryId, "applies_in", "court", court, ref, "memory", at));
    } else if (m.type === "lesson" && m.status === "confirmed") {
      add(edge("advocate", "self", "approved", "lesson", m.memoryId, ref, "memory", at));
    } else if (m.type === "court_practice" && m.status === "confirmed") {
      add(edge("advocate", "self", "approved", "court_practice", m.memoryId, ref, "memory", at));
      const court = courtIn(`${m.subject} ${m.object}`);
      if (court) add(edge("court_practice", m.memoryId, "applies_in", "court", court, ref, "memory", at));
    } else if (m.status === "rejected") {
      add(edge("advocate", "self", "rejected", "proposition", `prop:${slug(m.subject)}`, ref, "memory", at));
    }
    if (m.supersedes) add(edge("advocate", "self", "supersedes", "proposition", `prop:${slug(m.subject)}`, ref, "memory", at));
  }

  // The library: an approved document the advocate may use again, and its court.
  for (const i of [...input.library].filter((x) => x.status === "approved" && PRECEDENT_KINDS.includes(x.kind)).sort((a, b) => a.id.localeCompare(b.id))) {
    const ref = `library:${i.id}`;
    add(edge("advocate", "self", "approved", "precedent", i.id, ref, "library", at));
    const court = courtIn(i.court) ?? courtIn(i.title);
    if (court) add(edge("precedent", i.id, "applies_in", "court", court, ref, "library", at));
  }

  // Outcomes: what the court did, in the advocate's own words. The legal subject only.
  for (const o of [...input.outcomes].sort((a, b) => a.id.localeCompare(b.id))) {
    const ref = `outcome:${o.id}`;
    const proposition = `prop:${slug(o.subject)}`;
    const relation = o.result === "allowed" || o.result === "partly_allowed" ? "succeeded_when" : o.result === "dismissed" ? "failed_because" : "derived_from";
    add(edge("outcome", o.id, relation, "proposition", proposition, ref, "outcome", at));
    const court = courtIn(o.court);
    if (court) add(edge("outcome", o.id, "applies_in", "court", court, ref, "outcome", at));
  }

  return out;
}
