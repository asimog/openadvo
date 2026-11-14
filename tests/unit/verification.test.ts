import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraft } from "../../src/lib/verification/index.ts";
import type { CheckEvent, CheckParagraph } from "../../src/lib/verification/index.ts";

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
