import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraft } from "../../src/lib/verification/index.ts";
import type { CheckEvent, CheckParagraph } from "../../src/lib/verification/index.ts";
import { buildReviewerNote, lowersSeverity, maxSeverity, severityOfKind } from "../../src/lib/verification/reviewer-note.ts";

function event(id: string, date: string, overrides: Partial<CheckEvent> = {}): CheckEvent {
  const [y, m, d] = date.split("-");
  return { id, dateStart: date, dateEnd: date, dateText: `${d}.${m}.${y}`, description: "", status: "confirmed", excluded: false, sourceName: "judgment.pdf", page: 1, line: 2, ...overrides };
}

const EVENTS = [event("e1", "2023-01-02"), event("e2", "2024-03-12"), event("e3", "2024-04-01")];

const LIST: CheckParagraph[] = [
  { anchor: null, text: "LIST OF DATES", eventIds: [] },
  { anchor: "oa-1", text: "02.01.2023: The writ petition was filed on 02.01.2023.", eventIds: ["e1"] },
  { anchor: "oa-2", text: "12.03.2024: The High Court dismissed the writ petition.", eventIds: ["e2"] },
  { anchor: "oa-3", text: "01.04.2024: The petitioner filed a review petition.", eventIds: ["e3"] },
];

const SYNOPSIS: CheckParagraph[] = [
  { anchor: null, text: "SYNOPSIS", eventIds: [] },
  { anchor: "os-1", text: "On 02.01.2023, the writ petition was filed.", eventIds: ["e1"] },
  { anchor: "os-2", text: "On 12.03.2024, the High Court dismissed the writ petition.", eventIds: ["e2"] },
  { anchor: "os-3", text: "On 01.04.2024, the petitioner filed a review petition.", eventIds: ["e3"] },
  { anchor: "os-4", text: "DRAFT. Not verified.", eventIds: [] },
];

test("a generated draft has no defect, and the checks that cannot run are named", () => {
  const result = checkDraft({ paragraphs: LIST, events: EVENTS, other: { title: "Synopsis", paragraphs: SYNOPSIS } });
  assert.deepEqual(result.defects, []);
  assert.equal(result.statementsChecked, 3);
  assert.deepEqual(result.notRun.map((n) => n.check), ["Case numbers match the record", "Party names match the matter"]);
});

test("the heading and the draft note are not statements", () => {
  const result = checkDraft({ paragraphs: SYNOPSIS, events: EVENTS });
  assert.equal(result.statementsChecked, 3);
  assert.equal(result.notRun.length, 3);
});

test("three planted errors are all found: a wrong date, a statement with no source, a disagreement", () => {
  const list = LIST.map((p) => ({ ...p }));
  // 1. The advocate's typing changed a date.
  list[2].text = "13.03.2024: The High Court dismissed the writ petition.";
  // 2. A typed statement with a date and no link.
  list.push({ anchor: null, text: "The special leave petition was filed on 05.05.2024.", eventIds: [] });
  // 3. The Synopsis states another date for the review petition.
  const synopsis = SYNOPSIS.map((p) => ({ ...p }));
  synopsis[3].text = "On 02.04.2024, the petitioner filed a review petition.";

  const result = checkDraft({ paragraphs: list, events: EVENTS, other: { title: "Synopsis", paragraphs: synopsis } });
  const kinds = result.defects.map((d) => `${d.paragraph}:${d.kind}`);
  assert.deepEqual(kinds, ["3:date_mismatch", "3:drafts_disagree", "4:drafts_disagree", "5:no_source"]);
  const mismatch = result.defects[0];
  assert.match(mismatch.evidence, /states 13\.03\.2024/);
  assert.match(mismatch.evidence, /Factual Matrix has 12\.03\.2024 \(judgment\.pdf, p\. 1, l\. 2/);
  assert.equal(mismatch.anchor, "oa-2");
  assert.match(result.defects[3].evidence, /05\.05\.2024/);
  for (const d of result.defects) assert.ok(d.action.length > 0);
});

test("a date inside the description that the event also carries is not a defect; a range matches both ends", () => {
  const events = [event("r1", "2019-03-01", { dateEnd: "2019-03-31", dateText: "March 2019" })];
  const ok = checkDraft({ paragraphs: [{ anchor: "a", text: "01.03.2019 – 31.03.2019: The land was measured.", eventIds: ["r1"] }], events });
  assert.deepEqual(ok.defects, []);
  const bad = checkDraft({ paragraphs: [{ anchor: "a", text: "01.03.2019 – 30.04.2019: The land was measured.", eventIds: ["r1"] }], events });
  assert.deepEqual(bad.defects.map((d) => d.kind), ["date_mismatch"]);
});

test("a second date that the event's own source line states is not a defect", () => {
  const events = [event("e1", "1988-03-18", { description: "on the date of the incident, i.e. 18.3.1988, reported on 19.3.1988" })];
  const paragraphs = [{ anchor: "a", text: "18.03.1988: on the date of the incident, i.e. 18.3.1988, reported on 19.3.1988", eventIds: ["e1"] }];
  assert.deepEqual(checkDraft({ paragraphs, events }).defects, []);
});

test("an event that is no longer confirmed, an excluded event and a broken link are defects", () => {
  const events = [event("e1", "2023-01-02", { status: "rejected" }), event("e2", "2024-03-12", { excluded: true }), event("e3", "2024-04-01", { status: "candidate" })];
  const paragraphs = [...LIST.slice(1), { anchor: "oa-9", text: "06.06.2024: An order was passed.", eventIds: ["gone"] }];
  const result = checkDraft({ paragraphs, events });
  assert.deepEqual(result.defects.map((d) => d.kind), ["event_not_confirmed", "event_not_confirmed", "event_not_confirmed", "broken_link"]);
  assert.match(result.defects[0].evidence, /rejected/);
  assert.match(result.defects[1].evidence, /excluded/);
  assert.match(result.defects[2].evidence, /not confirmed/);
});

test("an event stated here and absent from the other draft is reported once", () => {
  const synopsis = SYNOPSIS.filter((p) => p.anchor !== "os-2");
  const result = checkDraft({ paragraphs: LIST, events: EVENTS, other: { title: "Synopsis", paragraphs: synopsis } });
  assert.deepEqual(result.defects.map((d) => `${d.paragraph}:${d.kind}`), ["3:missing_in_other_draft"]);
  assert.match(result.defects[0].action, /Add the event to the Synopsis/);
});

// ---- Phase 6 (P6): the fact checks ----

const FACTS = [
  { id: "f1", text: "The order was served on 01.04.2024.", type: "fact", status: "confirmed", sourceName: "affidavit.pdf", page: 1, line: 3 },
  { id: "f2", text: "The respondent admits the service.", type: "admission", status: "disputed", sourceName: "affidavit.pdf", page: 2, line: 1 },
  { id: "f3", text: "The petitioner was out of the country.", type: "inference", status: "confirmed", sourceName: "passport.pdf", page: 5, line: 2 },
];

test("P6: a paragraph linked to a disputed, unconfirmed or inferred fact is an item, and an open contradiction is never resolved silently", () => {
  const paragraphs = [
    { anchor: "oa-1", text: "The respondent admits the service.", eventIds: [], factIds: ["f2"] },
    { anchor: "oa-2", text: "The petitioner was out of the country.", eventIds: [], factIds: ["f3"] },
    { anchor: "oa-3", text: "The order was served.", eventIds: [], factIds: ["gone"] },
  ];
  const contradictions = [
    { kind: "date", values: [{ factId: "f2", text: "served on 01.04.2024", sourceName: "affidavit.pdf", page: 1, line: 3 }, { factId: "f2", text: "served on 03.04.2024", sourceName: "reply.pdf", page: 1, line: 1 }] },
  ];
  const result = checkDraft({ paragraphs, events: [], facts: FACTS, contradictions, kind: "writ_petition" });
  const kinds = result.defects.map((d) => d.kind).sort();
  assert.ok(kinds.includes("fact_disputed"));
  assert.ok(kinds.includes("inference_source"));
  assert.ok(kinds.includes("fact_not_confirmed"));
  assert.ok(kinds.includes("fact_contradiction"));
  const contradiction = result.defects.find((d) => d.kind === "fact_contradiction");
  assert.match(contradiction?.evidence ?? "", /contradicts itself/);
  const inference = result.defects.find((d) => d.kind === "inference_source");
  assert.match(inference?.evidence ?? "", /an inference/);
});

test("P6: a paragraph whose facts are all confirmed and uncontradicted has no fact item", () => {
  const result = checkDraft({
    paragraphs: [{ anchor: "oa-1", text: "The order was served.", eventIds: [], factIds: ["f1"] }],
    events: [],
    facts: FACTS,
    kind: "writ_petition",
  });
  assert.deepEqual(result.defects, []);
});

// ---- Phase 6 (L7): the witness rule on the affidavit kinds ----

test("L7: an affidavit statement without a recorded statement of the deponent is a defect; one with it passes", () => {
  const affidavit = { anchor: "a", text: "AFFIDAVIT", eventIds: [], factIds: [] };
  const lead = { anchor: "b", text: "1. I am the petitioner. I am competent to swear this affidavit.", eventIds: [], factIds: [] };
  const linked = { anchor: "c", text: "2. I received the order.", eventIds: [], factIds: [], evidenceIds: ["ev1"] };
  const composed = { anchor: "d", text: "3. The delay was neither intentional nor deliberate.", eventIds: [], factIds: [] };
  const result = checkDraft({ paragraphs: [affidavit, lead, linked, composed], events: [], kind: "affidavit" });
  assert.deepEqual(result.defects.map((d) => d.kind), ["affidavit_unlinked"]);
  assert.match(result.defects[0].evidence, /the deponent's own words/);
});

// ---- Phase 6 (P9): the reviewer note and the severity floor ----

test("P9: the reviewer note counts the items by severity, highest first, and says what to do", () => {
  const note = buildReviewerNote({
    defects: [{ kind: "no_source" }, { kind: "date_mismatch" }, { kind: "date_mismatch" }],
    openItemKinds: ["draft_defect.marker_cite", "skill_run"],
    sources: { read: 2, of: 5 },
    currency: ["Limitation Act 1963 s 5: never verified (unconfirmed)"],
  });
  assert.equal(note.sources?.read, 2);
  assert.deepEqual(
    note.items.map((i) => `${i.severity}:${i.count}`),
    ["blocker:1", "correction:4"],
  );
  assert.ok(note.beforeRelying.some((b) => b.includes("blocking")));
  assert.ok(note.beforeRelying.some((b) => b.includes("not confirmed current")));
});

test("P9: the severity of a kind comes from one mapping, and nothing downstream may lower one", () => {
  assert.equal(severityOfKind("no_source"), "blocker");
  assert.equal(severityOfKind("date_mismatch"), "correction");
  assert.equal(severityOfKind("statute_unconfirmed"), "blocker");
  assert.equal(severityOfKind("an_unknown_kind"), "correction");
  assert.equal(maxSeverity(["note", "correction", "note"]), "correction");
  assert.equal(lowersSeverity("note", "blocker"), true);
  assert.equal(lowersSeverity("blocker", "blocker"), false);
});
