/**
 * Phase 10 (G3): the advocate memory graph. The edges come from approved preferences, advocate
 * memory, the library and the outcome records; the graph holds no client fact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAdvocateEdges, courtIn } from "../../src/lib/advocate-store/graph.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import type { AdvocateGraphInput } from "../../src/shared/knowledge.ts";
import type { MemoryRecord } from "../../src/shared/stores.ts";

function mem(over: Partial<MemoryRecord> & { memoryId: string; type: MemoryRecord["type"]; subject: string; object: string }): MemoryRecord {
  return {
    relation: "is",
    sourceId: null,
    anchorId: null,
    matterId: null,
    recordedAt: "2026-11-01T10:00:00.000Z",
    validFrom: null,
    validUntil: null,
    confidence: null,
    status: "confirmed",
    scope: "advocate",
    supersedes: null,
    proposedBy: "advocate",
    ...over,
  };
}

const input = (over: Partial<AdvocateGraphInput> = {}): AdvocateGraphInput => ({
  memory: [
    mem({ memoryId: "m-precedent", type: "approved_precedent", subject: "bail order", object: "the Delhi High Court form, in the bail matter" }),
    mem({ memoryId: "m-lesson", type: "lesson", subject: "surety", object: "ask for two sureties" }),
    mem({ memoryId: "m-rejected", type: "court_practice", subject: "oral mentioning", object: "not allowed at 10.30", status: "rejected" }),
  ],
  preferences: [{ id: "p-1", key: "citation_format", value: "SCC", reason: "the Delhi High Court format the advocate uses", status: "approved" }],
  library: [{ id: "lib-1", title: "Bail application precedent", kind: "pleading", status: "approved", court: "in.hc.delhi", scope: "bail" }],
  outcomes: [{ id: "o-1", matterId: "matter-a", result: "allowed", subject: "bail on the custody ground", court: "Delhi High Court", decidedOn: "2026-10-01" }],
  now: "2026-11-18T00:00:00.000Z",
  ...over,
});

test("G3: the preference, the approved memory, the library and the outcome each make their edge", () => {
  const edges = buildAdvocateEdges(input());
  const has = (from: string, relation: string, to: string) => edges.some((e) => e.fromKind === from && e.relation === relation && e.toKind === to);
  assert.ok(has("advocate", "prefers", "preference"));
  assert.ok(has("preference", "applies_in", "court"));
  assert.ok(has("advocate", "approved", "precedent"));
  assert.ok(has("advocate", "approved", "lesson"));
  assert.ok(has("precedent", "applies_in", "court"));
  assert.ok(has("outcome", "succeeded_when", "proposition"));
  assert.ok(has("outcome", "applies_in", "court"));
  const rejected = edges.find((e) => e.relation === "rejected");
  assert.ok(rejected);
  assert.equal(rejected!.toKind, "proposition");
});

test("G3: no client fact reaches the graph; the outcome contributes its result and legal subject only", () => {
  const edges = buildAdvocateEdges(input());
  const text = JSON.stringify(edges);
  assert.ok(!/matter-a|client|party|witness|exhibit/i.test(text.replace(/"fromId":"matter-a"/, "")));
  const outcome = edges.find((e) => e.fromKind === "outcome" && e.fromId === "o-1");
  assert.ok(outcome);
  assert.ok(outcome!.toId.includes("bail-on-the-custody-ground"));
});

test("G3: the same records rebuild the same edges; the store writes them and walks them", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-graph-"));
  const store = AdvocateStore.open(dir);
  try {
    store.proposePreference({ key: "citation_format", value: "SCC", reason: "Delhi High Court format" }, { actor: "advocate" });
    for (const p of store.preferences()) store.decidePreference(p.id, "approved", { actor: "advocate" });
    store.proposeMemory({ type: "approved_precedent", subject: "bail order", relation: "is", object: "Delhi High Court form" }, { actor: "agent" });
    for (const m of store.memory()) store.decideMemory(m.memoryId, "confirmed", { actor: "advocate" });
    const view = store.rebuildGraph([{ id: "o-1", matterId: "matter-a", result: "allowed", subject: "bail on the custody ground", court: "Delhi High Court", decidedOn: "2026-10-01" }], { actor: "advocate" });
    assert.ok(view.edges.length >= 5);
    assert.ok(view.builtAt);
    const again = store.rebuildGraph([{ id: "o-1", matterId: "matter-a", result: "allowed", subject: "bail on the custody ground", court: "Delhi High Court", decidedOn: "2026-10-01" }], { actor: "advocate" });
    assert.deepEqual(again.edges.map((e) => [e.fromKind, e.fromId, e.relation, e.toKind, e.toId]), view.edges.map((e) => [e.fromKind, e.fromId, e.relation, e.toKind, e.toId]));
    const walked = store.graphWalk("advocate", "self", 2);
    assert.ok(walked.some((e) => e.relation === "prefers"));
    assert.ok(walked.some((e) => e.toKind === "court"));
    assert.notEqual(store.verifyChain().ok, false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("G3: a court id is read only when the advocate wrote it", () => {
  assert.equal(courtIn("the Delhi High Court format"), "in.hc.delhi");
  assert.equal(courtIn("in.hc.bombay"), "in.hc.bombay");
  assert.equal(courtIn("a chambers practice"), null);
  assert.equal(courtIn("the Supreme Court rules"), "in.sc");
});
