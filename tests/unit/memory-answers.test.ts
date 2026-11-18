/**
 * Phase 10 (F5): the six memory questions, answered deterministically from a snapshot. The test
 * proves each answer, its record links and its gaps; it calls no model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerMemoryQuestion, classifyQuestion } from "../../src/lib/memory-answers/index.ts";
import { MEMORY_QUESTIONS, type MemorySnapshot } from "../../src/shared/knowledge.ts";
import type { MemoryRecord } from "../../src/shared/stores.ts";

function mem(over: Partial<MemoryRecord> & { memoryId: string; type: MemoryRecord["type"]; subject: string; object: string }): MemoryRecord {
  return {
    relation: "is",
    sourceId: "src-1",
    anchorId: "sha-1:2:4",
    matterId: null,
    recordedAt: "2026-11-01T10:00:00.000Z",
    validFrom: null,
    validUntil: null,
    confidence: null,
    status: "confirmed",
    scope: "matter",
    supersedes: null,
    proposedBy: "advocate",
    ...over,
  };
}

function snapshot(over: Partial<MemorySnapshot> = {}): MemorySnapshot {
  return {
    asOf: "2026-11-18T09:00:00.000Z",
    matterTitle: "State v. Example",
    memory: [
      mem({ memoryId: "m-decision", type: "advocate_decision", subject: "the bail application", object: "to press the custody ground first" }),
      mem({ memoryId: "m-rejected", type: "rejected_argument", subject: "the argument that the FIR is delayed", object: "the delay is explained in the complaint" }),
      mem({ memoryId: "m-dispute", type: "disputed_fact", subject: "the date of arrest", object: "05.01.2024 in the FIR, 06.01.2024 in the remand order" }),
      mem({ memoryId: "m-instruction", type: "client_instruction", subject: "the client", object: "file the bail application this week", status: "confirmed" }),
      mem({ memoryId: "m-expired", type: "lesson", subject: "surety", object: "the client can offer one surety", validUntil: "2026-10-01", status: "expired" }),
      mem({ memoryId: "m-super", type: "fact_from_document", subject: "the amount", object: "50000 rupees", status: "superseded" }),
    ],
    issues: [
      { id: "i-1", text: "Whether the applicant is entitled to bail", status: "accepted", reason: "the custody period is long", factIds: ["f-1"], createdAt: "2026-10-01T00:00:00.000Z", decidedAt: "2026-10-02T00:00:00.000Z" },
      { id: "i-2", text: "Whether the FIR is delayed", status: "rejected", reason: "the complaint explains the delay", factIds: [], createdAt: "2026-10-01T00:00:00.000Z", decidedAt: "2026-10-03T00:00:00.000Z" },
    ],
    facts: [
      { id: "f-1", text: "The applicant was arrested on 05.01.2024", status: "confirmed", anchorId: "sha-1:1:3", sourceId: "src-1", date: "2024-01-05", type: "date" },
      { id: "f-2", text: "The amount paid was 50000 rupees", status: "disputed", anchorId: "sha-1:2:8", sourceId: "src-1", date: "2024-01-02", type: "amount" },
    ],
    events: [
      { id: "e-1", sourceId: "src-order", sourceName: "Order 12.10.2026.pdf", anchorId: "sha-2:1:2", dateStart: "2026-10-12", description: "The court directed the respondent to file a reply.", kind: "procedural", status: "confirmed", excluded: false, conflicts: [] },
    ],
    hearings: [
      { id: "h-1", date: "2026-10-01", bench: "Delhi High Court", directions: "List on 12.10.2026.", nextDate: "2026-10-12", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "h-2", date: "2026-10-12", bench: "Delhi High Court", directions: "Reply within two weeks.", nextDate: "2026-11-20", notes: "", createdAt: "2026-10-12T00:00:00.000Z" },
    ],
    arguments: [
      { id: "a-1", issueId: "i-1", claim: "the custody period is long", stance: "support", status: "accepted", decidedAt: "2026-10-03T00:00:00.000Z", createdAt: "2026-10-02T00:00:00.000Z" },
      { id: "a-2", issueId: "i-2", claim: "the FIR is delayed", stance: "support", status: "rejected", decidedAt: "2026-10-03T00:00:00.000Z", createdAt: "2026-10-02T00:00:00.000Z" },
    ],
    sources: [{ id: "src-1", name: "FIR.txt", addedAt: "2026-11-15T10:00:00.000Z" }],
    drafts: [{ id: "d-1", title: "Bail application", createdAt: "2026-11-16T10:00:00.000Z" }],
    limitation: null,
    conflicts: [],
    ...over,
  };
}

test("F5: the six standard questions are the six the Memory tab offers", () => {
  assert.equal(MEMORY_QUESTIONS.length, 6);
  const kinds = MEMORY_QUESTIONS.map((q) => q.kind);
  assert.deepEqual(kinds, ["what_decided", "why_rejected", "disputed_facts", "instructions", "since_last_hearing", "expired_assumptions"]);
  for (const q of MEMORY_QUESTIONS) assert.equal(classifyQuestion(q.question), q.kind, q.kind);
});

test("F5: what was decided names the decisions, issues, arguments and directions", () => {
  const a = answerMemoryQuestion(snapshot(), "What was decided in this matter?");
  assert.equal(a.kind, "what_decided");
  assert.ok(a.answer.some((l) => /you decided to press the custody ground first/.test(l.text)));
  assert.ok(a.answer.some((l) => /Issue accepted: Whether the applicant is entitled to bail/.test(l.text)));
  assert.ok(a.answer.some((l) => /Argument accepted/.test(l.text)));
  assert.ok(a.answer.some((l) => /Directions at the hearing of 2026-10-12/.test(l.text)));
  assert.ok(a.records.some((r) => r.kind === "memory" && r.id === "m-decision" && r.anchor === "sha-1:2:4"));
  assert.ok(a.records.some((r) => r.kind === "issue" && r.id === "i-1" && r.anchor === "sha-1:1:3"));
  assert.deepEqual(a.gaps, []);
});

test("F5: why an argument was rejected carries the reason and a gap when the reason is missing", () => {
  const a = answerMemoryQuestion(snapshot(), "Why was the argument rejected?");
  assert.equal(a.kind, "why_rejected");
  assert.ok(a.answer.some((l) => /Argument rejected: the FIR is delayed\. The reason recorded: the delay is explained in the complaint/.test(l.text)));
  assert.ok(a.records.some((r) => r.kind === "argument" && r.id === "a-2"));
  const noReason = answerMemoryQuestion(
    snapshot({ memory: [], arguments: [{ id: "a-9", issueId: "i-1", claim: "the missing reason", stance: "support", status: "rejected", decidedAt: null, createdAt: "2026-10-02T00:00:00.000Z" }] }),
    "Why was this argument rejected?",
  );
  assert.ok(noReason.gaps.some((g) => /reason for rejecting/.test(g)));
});

test("F5: disputed facts list the fact, the memory record and the open conflict with both anchors", () => {
  const withConflict = snapshot({
    conflicts: [{ id: "c-1", status: "open", eventIds: ["e-1"] }],
  });
  const a = answerMemoryQuestion(withConflict, "Which facts are disputed?");
  assert.equal(a.kind, "disputed_facts");
  assert.ok(a.answer.some((l) => /Disputed fact: The amount paid was 50000 rupees/.test(l.text)));
  assert.ok(a.answer.some((l) => /Disputed in memory: the date of arrest/.test(l.text)));
  assert.ok(a.answer.some((l) => /Date conflict, open/.test(l.text)));
  assert.ok(a.records.some((r) => r.kind === "fact" && r.id === "f-2" && r.anchor === "sha-1:2:8"));
});

test("F5: instructions name who gave them, when and their state", () => {
  const a = answerMemoryQuestion(snapshot(), "Which instructions did the client give?");
  assert.equal(a.kind, "instructions");
  assert.ok(a.answer.some((l) => /the client instructed: file the bail application this week/.test(l.text)));
  const empty = answerMemoryQuestion(snapshot({ memory: [] }), "Which instructions did the client give?");
  assert.ok(empty.gaps.some((g) => /No client instruction is recorded/.test(g)));
});

test("F5: what changed since the last hearing measures from the last hearing and lists each record", () => {
  const a = answerMemoryQuestion(snapshot(), "What changed since the last hearing?");
  assert.equal(a.kind, "since_last_hearing");
  assert.ok(a.answer[0].text.includes("2026-10-12"));
  assert.ok(a.answer.some((l) => /New document: FIR\.txt/.test(l.text)));
  assert.ok(a.answer.some((l) => /New draft: Bail application/.test(l.text)));
  assert.ok(a.records.some((r) => r.kind === "source" && r.id === "src-1"));
  const noHearing = answerMemoryQuestion(snapshot({ hearings: [] }), "What changed since the last hearing?");
  assert.ok(noHearing.gaps.some((g) => /No hearing is recorded/.test(g)));
});

test("F5: expired assumptions name the date and the record that replaces it", () => {
  const withReplacement = snapshot({
    memory: [
      mem({ memoryId: "m-old", type: "lesson", subject: "surety", object: "the client can offer one surety", validUntil: "2026-10-01", status: "superseded" }),
      mem({ memoryId: "m-new", type: "lesson", subject: "surety", object: "the client can offer two sureties", supersedes: "m-old" }),
    ],
  });
  const a = answerMemoryQuestion(withReplacement, "Which assumptions have expired?");
  assert.equal(a.kind, "expired_assumptions");
  assert.ok(a.answer.some((l) => /the client can offer one surety: superseded/.test(l.text)));
  assert.ok(a.answer.some((l) => /The record surety replaces it/.test(l.text)));
  const unconfirmed = answerMemoryQuestion(snapshot({ limitation: { id: "l-1", rule: "90 days", deadline: "2026-12-01", working: "from the judgment", confirmedAt: null } }), "Which assumptions expired?");
  assert.ok(unconfirmed.answer.some((l) => /limitation working .* is not confirmed/.test(l.text)));
  assert.ok(unconfirmed.gaps.some((g) => /limitation deadline is unconfirmed/.test(g)));
});

test("F5: a question outside the six is a search, and it says so; no hit is a gap", () => {
  const a = answerMemoryQuestion(snapshot(), "What do the records say about the surety?");
  assert.equal(a.kind, "search");
  assert.equal(a.title, "Memory search");
  assert.ok(a.answer.some((l) => /the client can offer one surety/.test(l.text)));
  const none = answerMemoryQuestion(snapshot({ memory: [], facts: [], issues: [], events: [], hearings: [], arguments: [], sources: [], drafts: [] }), "What do the records say about a helicopter?");
  assert.ok(none.gaps.some((g) => /No record holds the words: helicopter/.test(g)));
});
