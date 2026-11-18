/**
 * Phase 7 (K4): case theory rows — proposed by the agent, decided by the advocate, no status
 * outside the three; and K1: the issue's fact ties ride the issue row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore, MatterStoreError } from "../../src/lib/matter-store/index.ts";
import { strategyView } from "../../src/lib/studio/strategy.ts";
import type { ArgumentRecord, ArgumentStatus } from "../../src/shared/studio.ts";

async function store(): Promise<MatterStore> {
  return MatterStore.create(mkdtempSync(path.join(tmpdir(), "p7-theory-")), "Theory", { actor: "advocate" });
}

test("K1: an issue names the facts it rests on; unknown facts are refused", async () => {
  const s = await store();
  const fact = s.evidence.addFact({ text: "The order was passed on 12.03.2024.", type: "fact", sourceId: null, anchorId: null, page: null, line: null, date: "2024-03-12" }, { actor: "system" });
  const issue = s.work.addIssue("Was the order passed without jurisdiction?", { actor: "agent" }, [fact.id]);
  assert.deepEqual(issue.factIds, [fact.id]);
  assert.equal(issue.status, "candidate");
  // The fact's own list mirrors the tie for the Facts tab.
  assert.deepEqual(s.evidence.facts().find((f) => f.id === fact.id)!.issueIds, [issue.id]);
  // An unknown fact id is refused, and nothing is written.
  assert.throws(() => s.work.addIssue("Another issue", { actor: "agent" }, ["no-such-fact"]), (e: Error) => (e as MatterStoreError).code === "FACT_NOT_FOUND");
  // The view reads the ties from the row.
  const read = s.work.listIssues().find((i) => i.id === issue.id)!;
  assert.deepEqual(read.factIds, [fact.id]);
  // The advocate's Facts-tab path writes the same issue column, and unlinking moves the tie.
  const second = s.work.addIssue("Was notice served?", { actor: "advocate" });
  s.evidence.linkFact(fact.id, { issueIds: [second.id] }, { actor: "advocate" });
  assert.deepEqual(s.work.listIssues().find((i) => i.id === second.id)!.factIds, [fact.id]);
  assert.deepEqual(s.work.listIssues().find((i) => i.id === issue.id)!.factIds, []);
  assert.deepEqual(s.evidence.facts().find((f) => f.id === fact.id)!.issueIds, [second.id]);
  // An unknown issue is refused before the fact or the issue rows change.
  assert.throws(() => s.evidence.linkFact(fact.id, { issueIds: ["no-issue"] }, { actor: "advocate" }), (e: Error) => (e as MatterStoreError).code === "ISSUE_NOT_FOUND");
  assert.deepEqual(s.evidence.facts().find((f) => f.id === fact.id)!.issueIds, [second.id]);
});

test("K4: a theory is proposed — the agent's waits, the advocate's is primary; the advocate decides its place", async () => {
  const s = await store();
  const issue = s.work.addIssue("Was the order passed without jurisdiction?", { actor: "advocate" });
  const proposed = s.studio.addTheory({ title: "The order is void for want of notice", statement: "The record holds no notice before the order, so the authority decided without hearing the petitioner.", issueIds: [issue.id], burden: "the petitioner", standard: "preponderance" }, { actor: "agent" });
  assert.equal(proposed.status, "alternative", "the agent's theory waits");
  assert.equal(proposed.author, "agent");
  assert.deepEqual(proposed.issueIds, [issue.id]);
  assert.equal(proposed.burden, "the petitioner");

  const own = s.studio.addTheory({ title: "The order is appealable only", statement: "The right path is the statutory appeal, argued on its own record.", issueIds: [] }, { actor: "advocate" });
  assert.equal(own.status, "primary", "the advocate's theory is primary at once");

  const decided = s.studio.decideTheory(proposed.id, "primary", "the record supports it", { actor: "advocate" });
  assert.equal(decided.status, "primary");
  assert.equal(decided.reason, "the record supports it");

  // A theory that names an unknown issue is refused.
  assert.throws(() => s.studio.addTheory({ title: "t", statement: "s", issueIds: ["no-issue"] }, { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "ISSUE_NOT_FOUND");
  // A decision without a reason is refused.
  assert.throws(() => s.studio.decideTheory(own.id, "rejected", "", { actor: "advocate" }), (e: Error) => (e as MatterStoreError).code === "REASON_REQUIRED");
  // Only the advocate decides.
  assert.throws(() => s.studio.decideTheory(own.id, "rejected", "why", { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "HUMAN_ONLY");
  assert.ok(s.studio.theories().length >= 2);
});

test("K4: the Strategy view assembles the standing, the attack that fells an out argument, the dependencies and the weaknesses", () => {
  const arg = (id: string, claim: string, computed: ArgumentStatus, over: Partial<ArgumentRecord & { computed: ArgumentStatus }> = {}): ArgumentRecord & { computed: ArgumentStatus } => ({
    id,
    runId: "r1",
    issueId: "i1",
    round: 1,
    ground: "precedent",
    stance: "petitioner",
    claim,
    reasoning: "From the record.",
    events: [],
    authorities: [],
    provisions: [],
    questions: [],
    elo: 1000,
    attacks: null,
    attackKind: null,
    status: "accepted",
    decidedAt: null,
    createdAt: "2026-11-18T00:00:00Z",
    ...over,
    computed,
  });
  const standing = arg("a1", "The order was passed without a hearing.", "in");
  const felled = arg("a2", "The petition is within time.", "out");
  const attack = arg("x1", "The record shows the petition was filed late.", "in", { attacks: "a2", attackKind: "undercut" });
  const rejected = arg("a3", "A theory the advocate rejected.", "in", { status: "rejected" });
  const theory = { id: "t1", title: "No notice", statement: "No notice was issued.", issueIds: ["i1"], burden: "the petitioner", standard: "preponderance", author: "advocate" as const, status: "primary" as const, reason: null, createdAt: "", decidedAt: null };
  const dropped = { ...theory, id: "t2", title: "Dropped", status: "rejected" as const };
  const view = strategyView({
    arguments: [standing, felled, attack, rejected],
    theories: [theory, dropped],
    issues: [{ id: "i1", text: "Was the order passed without a hearing?" }],
    weakPoints: [{ claim: standing.claim, questions: ["Was notice issued?"], attacks: [] }],
    gaps: [{ columnId: "c2", question: "Balance of convenience" }],
  });
  // Only the live theories, and only the advocate's accepted main arguments, stand.
  assert.deepEqual(view.theories.map((t) => t.id), ["t1"]);
  assert.deepEqual(view.standing.map((a) => a.id), ["a1", "a2"]);
  assert.equal(view.standing[0].issue, "Was the order passed without a hearing?", "the standing is read per issue");
  assert.equal(view.standing[0].felledBy, null);
  // The attack that fells the out argument is named in its own words.
  assert.equal(view.standing[1].standing, "out");
  assert.equal(view.standing[1].felledBy, attack.claim);
  // The attack graph's dependency is listed, and the rejected argument is not.
  assert.deepEqual(view.dependencies.map((d) => [d.attackerId, d.targetId, d.kind]), [["x1", "a2", "undercut"]]);
  // The weaknesses are the loop's weak points and the record-table gaps.
  assert.deepEqual(view.weaknesses.weakPoints.map((w) => w.claim), [standing.claim]);
  assert.deepEqual(view.weaknesses.gaps.map((g) => g.question), ["Balance of convenience"]);
});
