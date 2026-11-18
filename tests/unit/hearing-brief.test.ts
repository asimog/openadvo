/**
 * Phase 7 (K6, K7): the hearing brief and the oral outline, generated from the records. No
 * outcome is predicted anywhere in either document.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hearingBriefPart, oralOutlinePart, type DraftingInput } from "../../src/lib/drafting/parts.ts";
import { templateOf } from "../../src/lib/drafting/documents.ts";

const INPUT: DraftingInput = {
  details: { title: "X v Y", court: "High Court of Delhi", caseNumber: "123/2026", cnr: "", petitioner: "X", respondent: "Y", interimRelief: "" },
  advocate: { name: "A. Advocate", role: "Advocate", barCouncil: "", address: "" },
  events: [],
  facts: [],
  evidence: [],
  authorities: [{ citation: "2023 INSC 1043", parties: "X v. Y", paragraph: "12", proposition: "An authority must hear the affected party.", role: "supporting" }],
  provisions: [],
  annexures: [],
  issues: [{ text: "Was the petitioner heard?", status: "accepted" }],
  allegations: [],
  memorandum: null,
  proceeding: { caseType: "W.P.(C)", provisions: [] },
  approved: { questions: [], grounds: [] },
  stage: "Notice issued",
  hearings: [
    { date: "2026-11-10", bench: "Justice X", directions: "Reply affidavit within four weeks.", nextDate: "2026-12-15", nextDateStatus: "confirmed" },
  ],
  orderDirections: [{ text: "Reply to be filed within four weeks.", sourceName: "order.pdf", page: 2, line: 4 }],
  openItems: [{ kind: "draft_defect.marker_review", detail: "Writ petition, paragraph 9 holds an open marker." }],
  challenges: [
    { kind: "bench_question", text: "Was the impugned order served on the petitioner?", answer: "Yes; the receipt is at E1.", status: "accepted" },
    { kind: "objection", text: "The petition is premature.", answer: "The alternative remedy decides only accounts.", status: "accepted" },
    { kind: "objection", text: "The delay is unexplained.", answer: "", status: "open" },
  ],
  arguments: [
    { claim: "The order was passed without hearing the petitioner.", reasoning: "No notice was issued; the record holds none.", computed: "in", elo: 1012 },
    { claim: "The alternative remedy is inefficacious.", reasoning: "The appeal decides only accounts; the right is constitutional.", computed: "undecided", elo: 998 },
    { claim: "The petitioner is entitled to costs.", reasoning: "", computed: "out", elo: 990 },
  ],
};

test("K6: the hearing brief is one page from the records, with the anchors, and predicts nothing", () => {
  const blocks = hearingBriefPart(INPUT);
  const text = blocks.map((b) => b.text).join("\n");
  assert.match(text, /HEARING BRIEF/);
  assert.match(text, /Posture: Notice issued/);
  assert.match(text, /What is listed/);
  assert.match(text, /2026-12-15/, "the next date is shown");
  assert.match(text, /order\.pdf, p\. 2, l\. 4/, "the direction carries its anchor");
  assert.match(text, /Open items/);
  assert.match(text, /Bench questions and answers/);
  assert.match(text, /Was the impugned order served/);
  assert.match(text, /Objections of opposing counsel/);
  assert.match(text, /Challenge register/);
  assert.match(text, /No outcome is predicted/);
  assert.doesNotMatch(text, /will win|likely to succeed|probability/i);
  // The catalogue kind builds the same part.
  const t = templateOf("hearing_brief")!;
  assert.ok(t.build(INPUT).length > 4);
  assert.equal(t.group, "hearing");
});

test("K6: the brief says so when a record is missing", () => {
  const empty = hearingBriefPart({ ...INPUT, hearings: [], orderDirections: [], challenges: [], openItems: [] });
  const text = empty.map((b) => b.text).join("\n");
  assert.match(text, /no hearing is recorded yet/i);
  assert.match(text, /No direction of a recorded order/i);
  assert.match(text, /the register is empty/i);
});

test("K7: the oral outline puts the standing arguments first, strongest first, and never more than four", () => {
  const blocks = oralOutlinePart(INPUT);
  const text = blocks.map((b) => b.text).join("\n");
  assert.match(text, /ORAL OUTLINE/);
  const points = blocks.filter((b) => /^\d+\. /.test(b.text));
  assert.equal(points.length, 2, "the out argument is not a point");
  assert.match(points[0].text, /without hearing the petitioner/, "the standing argument leads");
  assert.match(points[0].text, /stands/);
  assert.match(points[1].text, /alternative remedy/, "the undecided argument is second");
  assert.match(points[1].text, /undecided/);
  assert.match(text, /Rebuttal notes/);
  assert.match(text, /The petition is premature/);
  assert.match(text, /Compilation of authorities/);
  assert.match(text, /2023 INSC 1043, paragraph 12/);
  assert.doesNotMatch(text, /will win|likely to succeed|probability/i);
  // The catalogue kind builds the same part.
  const t = templateOf("oral_outline")!;
  assert.ok(t.build(INPUT).length > 4);
  assert.equal(t.group, "hearing");
});

test("K7: the outline says so when no argument stands", () => {
  const empty = oralOutlinePart({ ...INPUT, arguments: [] });
  assert.match(empty.map((b) => b.text).join("\n"), /No accepted argument stands/);
});
