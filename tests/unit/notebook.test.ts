import { test } from "node:test";
import assert from "node:assert/strict";
import { findDates, extractEvents, findConflicts, eventKind } from "../../src/lib/notebook/index.ts";

test("Indian court date formats, day first", () => {
  const cases: Array<[string, string, string]> = [
    ["dismissed on 12.03.2024.", "2024-03-12", "explicit"],
    ["dated 05/11/2023", "2023-11-05", "explicit"],
    ["on 1-2-2022", "2022-02-01", "explicit"],
    ["on 12th March, 2024", "2024-03-12", "explicit"],
    ["on the 3rd day of January, 2021", "2021-01-03", "explicit"],
    ["on March 12, 2024", "2024-03-12", "explicit"],
    ["on 12.03.24", "2024-03-12", "inferred"],
  ];
  for (const [text, iso, type] of cases) {
    const [d] = findDates(text);
    assert.ok(d, text);
    assert.equal(d.start, iso, text);
    assert.equal(d.type, type, text);
  }
});

test("a month and year is a range; vague words and impossible dates are not dates", () => {
  const [r] = findDates("in February, 2024 the respondent");
  assert.deepEqual([r.start, r.end, r.type], ["2024-02-01", "2024-02-29", "range"]);
  assert.equal(findDates("thereafter the petitioner").length, 0);
  assert.equal(findDates("on 31.02.2024").length, 0);
  assert.equal(findDates("Section 12.3 of the Act").length, 0);
  // "12th March, 2024" is one date, not also a range "March, 2024".
  assert.equal(findDates("on 12th March, 2024").length, 1);
});

test("events: one per date on a line, joined with the next line, with kind and anchor", () => {
  const lines = [
    { anchorId: "h:1:1", sourceId: "s", page: 1, line: 1, text: "The writ petition was filed on 02.01.2023 and" },
    { anchorId: "h:1:2", sourceId: "s", page: 1, line: 2, text: "notice was issued on 10.01.2023." },
    { anchorId: "h:1:3", sourceId: "s", page: 1, line: 3, text: "The petitioner bought the land in March 2019." },
    { anchorId: "h:1:4", sourceId: "s", page: 1, line: 4, text: "No date here." },
  ];
  const events = extractEvents(lines, "text_layer");
  assert.equal(events.length, 3);
  assert.equal(events[0].description, "The writ petition was filed on 02.01.2023 and notice was issued on 10.01.2023.");
  assert.equal(events[0].kind, "procedural");
  assert.equal(events[0].anchorId, "h:1:1");
  assert.equal(events[1].dateStart, "2023-01-10");
  assert.equal(events[2].kind, "factual");
  assert.equal(events[2].dateType, "range");
  assert.equal(eventKind("The High Court pronounced its judgment"), "procedural");
});

test("conflicts: the same act with different dates is flagged; different acts are not", () => {
  const ev = (id: string, anchorId: string, description: string, date: string) =>
    ({ id, anchorId, description, dateStart: date, dateEnd: date, kind: eventKind(description) });
  const pairs = findConflicts([
    ev("a", "x:1:1", "The High Court dismissed the writ petition by its judgment dated 12.03.2024", "2024-03-12"),
    ev("b", "y:4:9", "By judgment dated 13.03.2024 the High Court dismissed the writ petition", "2024-03-13"),
    ev("c", "y:5:2", "The petitioner filed a review application before the High Court on 01.04.2024", "2024-04-01"),
    ev("d", "x:1:1", "The High Court dismissed the writ petition by its judgment dated 12.03.2024", "2024-03-12"),
  ]);
  assert.deepEqual(pairs, [["a", "b"], ["b", "d"]]);
});
