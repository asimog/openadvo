/** V3-1: matter progress is a plain function of the records. Spec: docs/specs/v3.md. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matterProgress, type ProgressInput } from "../../src/lib/progress/index.ts";

const empty: ProgressInput = {
  sources: { total: 0, failed: 0, missingOrChanged: 0, reading: 0 },
  events: { candidate: 0, confirmed: 0, openConflicts: 0 },
  details: { petitioner: false, respondent: false, court: false, caseNumber: false, impugned: false },
  research: { issuesAccepted: 0, issuesCandidate: 0, adverseReview: false, blockedCitations: 0 },
  drafts: [{ title: "Synopsis", approved: false, exists: false }, { title: "Petition", approved: false, exists: false }],
  blockers: ["P-1: Not approved: Synopsis, Petition."],
  filingSet: { exists: false, confirmations: 0 },
  receipt: false,
};

const state = (i: ProgressInput) => Object.fromEntries(matterProgress(i).map((s) => [s.id, s.state]));

test("a new matter: nothing started, and the first next action is to add the record", () => {
  const stages = matterProgress(empty);
  assert.equal(stages.length, 8);
  assert.equal(stages[0].state, "not_started");
  assert.match(stages[0].next, /Add the impugned judgment/);
  assert.equal(state(empty).verification, "not_started");
});

test("conflicts and unreadable files block; a finished matter has every stage done", () => {
  assert.equal(state({ ...empty, sources: { total: 2, failed: 1, missingOrChanged: 0, reading: 0 } }).record, "blocked");
  const nb = matterProgress({ ...empty, events: { candidate: 1, confirmed: 3, openConflicts: 2 } }).find((s) => s.id === "notebook")!;
  assert.equal(nb.state, "blocked");
  assert.equal(nb.next, "Resolve 2 date conflict(s) in the Chronology.");
  const done: ProgressInput = {
    sources: { total: 3, failed: 0, missingOrChanged: 0, reading: 0 },
    events: { candidate: 0, confirmed: 9, openConflicts: 0 },
    details: { petitioner: true, respondent: true, court: true, caseNumber: true, impugned: true },
    research: { issuesAccepted: 2, issuesCandidate: 0, adverseReview: true, blockedCitations: 0 },
    drafts: [{ title: "Synopsis", approved: true, exists: true }],
    blockers: [],
    filingSet: { exists: true, confirmations: 2 },
    receipt: true,
  };
  assert.ok(matterProgress(done).every((s) => s.state === "done" && s.next === ""));
  assert.equal(matterProgress({ ...done, research: { ...done.research, blockedCitations: 1 } }).find((s) => s.id === "research")!.state, "blocked");
  assert.match(matterProgress({ ...done, details: { ...done.details, court: false, caseNumber: false } }).find((s) => s.id === "details")!.next, /court and case number/);
});
