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

async function store(): Promise<MatterStore> {
  return MatterStore.create(mkdtempSync(path.join(tmpdir(), "p7-theory-")), "Theory", { actor: "advocate" });
}

test("K1: an issue names the facts it rests on; unknown facts are refused", async () => {
  const s = await store();
  const fact = s.evidence.addFact({ text: "The order was passed on 12.03.2024.", type: "fact", sourceId: null, anchorId: null, page: null, line: null, date: "2024-03-12" }, { actor: "system" });
  const issue = s.work.addIssue("Was the order passed without jurisdiction?", { actor: "agent" }, [fact.id]);
  assert.deepEqual(issue.factIds, [fact.id]);
  assert.equal(issue.status, "candidate");
  // An unknown fact id is refused, and nothing is written.
  assert.throws(() => s.work.addIssue("Another issue", { actor: "agent" }, ["no-such-fact"]), (e: Error) => (e as MatterStoreError).code === "FACT_NOT_FOUND");
  // The view reads the ties from the row.
  const read = s.work.listIssues().find((i) => i.id === issue.id)!;
  assert.deepEqual(read.factIds, [fact.id]);
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
