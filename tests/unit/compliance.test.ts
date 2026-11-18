/**
 * Phase 7 (K8, K9): the compliance tasks of a hearing's directions, and the cross-examination
 * questions from the record. Every decision is the advocate's (decision 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { MatterStoreError } from "../../src/lib/matter-store/index.ts";

async function storeWithHearing(): Promise<{ s: MatterStore; hearingId: string }> {
  const s = await MatterStore.create(mkdtempSync(path.join(tmpdir(), "p7-hearing-")), "X v. Y", { actor: "advocate" });
  const h = s.addHearing({ date: "2026-11-10", bench: "Justice X", directions: "Reply affidavit within four weeks; list after four weeks.", nextDate: "2026-12-15", nextDateStatus: "confirmed", notes: "" }, { actor: "advocate" });
  return { s, hearingId: h.id };
}

test("K8: the agent's task waits; an accepted task becomes a reminder; a rejected one stays refused", async () => {
  const { s, hearingId } = await storeWithHearing();
  const proposed = s.proposeTask({ hearingId, text: "File the reply affidavit", dueAt: "2026-12-08" }, { actor: "agent" });
  assert.equal(proposed.status, "open");
  assert.equal(s.reminders().length, 0, "no reminder before the decision");

  const { task, reminder } = s.decideTask(proposed.id, true, { actor: "advocate" });
  assert.equal(task.status, "accepted");
  assert.ok(reminder, "the accepted task became a reminder");
  assert.match(reminder.text, /File the reply affidavit/);
  assert.equal(s.reminders().length, 1);

  const refused = s.proposeTask({ hearingId, text: "Serve the copy on the other side" }, { actor: "agent" });
  const rejected = s.decideTask(refused.id, false, { actor: "advocate" });
  assert.equal(rejected.task.status, "rejected");
  assert.equal(rejected.reminder, null);
  assert.equal(s.reminders().length, 1, "the rejected task added no reminder");

  // The advocate's own task is a reminder at once.
  const own = s.proposeTask({ hearingId, text: "Brief counsel" }, { actor: "advocate" });
  assert.equal(own.status, "accepted");
  assert.equal(s.reminders().length, 2);
  // A task of an unknown hearing is refused.
  assert.throws(() => s.proposeTask({ hearingId: "no-hearing", text: "x" }, { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "BAD_TASK");
  // Only the advocate decides.
  assert.throws(() => s.decideTask(proposed.id, true, { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "HUMAN_ONLY");
});

test("K9: a question names its contradiction or statement; a question with no target is refused", async () => {
  const s = await MatterStore.create(mkdtempSync(path.join(tmpdir(), "p7-cross-")), "X v. Y", { actor: "advocate" });
  const file = path.join(s.folder, "w.txt");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, "I was at the shop on 12.03.2024. The accused was not with me.", "utf8");
  const source = (await s.addFile(file, { actor: "advocate" })).source!;
  const ev = s.evidence.addEvidence({ sourceId: source.id, statement: "I was at the shop on 12.03.2024. The accused was not with me.", givenBy: "W1", givenAt: "2024-03-13" }, { actor: "advocate" });
  void ev;
  const fact = s.evidence.addFact({ text: "The witness places the accused at the shop.", type: "fact", sourceId: source.id, anchorId: null, page: 1, line: 1 }, { actor: "system" });

  // A question on a recorded statement.
  const q1 = s.proposeCrossQuestion({ witness: "W1", question: "You say the accused was with you; the record of your statement says otherwise. Which is true?", targetKind: "evidence", targetId: ev.id }, { actor: "agent" });
  assert.equal(q1.status, "candidate");
  // The plan lists the question with the record it springs from and its anchors.
  assert.equal(q1.target?.sourceName, "w.txt");
  assert.equal(q1.target?.text, "I was at the shop on 12.03.2024. The accused was not with me.");
  assert.equal(q1.target?.givenBy, "W1");
  // A question on a contradiction (the fact it joins).
  const q2 = s.proposeCrossQuestion({ question: "Your two versions of 12.03.2024 cannot both be true, can they?", targetKind: "contradiction", targetId: fact.id }, { actor: "agent" });
  assert.equal(q2.status, "candidate");
  assert.equal(q2.target?.page, 1);
  assert.equal(q2.target?.line, 1);

  // A question with no target in the record is refused.
  assert.throws(() => s.proposeCrossQuestion({ question: "Where were you?", targetKind: "evidence", targetId: "no-such-statement" }, { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "BAD_CROSS_QUESTION");
  // A statement, not a question, is refused.
  assert.throws(() => s.proposeCrossQuestion({ question: "You were at the shop.", targetKind: "evidence", targetId: ev.id }, { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "BAD_CROSS_QUESTION");

  const decided = s.decideCrossQuestion(q1.id, "accepted", { actor: "advocate" });
  assert.equal(decided.status, "accepted");
  assert.throws(() => s.decideCrossQuestion(q1.id, "rejected", { actor: "advocate" }), (e: Error) => (e as MatterStoreError).code === "BAD_CROSS_QUESTION", "already decided");
  assert.throws(() => s.decideCrossQuestion(q2.id, "accepted", { actor: "agent" }), (e: Error) => (e as MatterStoreError).code === "HUMAN_ONLY");
});
