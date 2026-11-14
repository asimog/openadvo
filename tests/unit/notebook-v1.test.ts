import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDescription, extractEvents, findConflicts, findDates, runningLines } from "../../src/lib/notebook/index.ts";

test("V1-9: a time range is not a date; a date with one separator still is", () => {
  assert.equal(findDates("heard from 4-4.30 in chambers").length, 0);
  assert.equal(findDates("listed at 10.30.11 hrs").length, 0);
  assert.equal(findDates("order dated 12.03.2024").length, 1);
  assert.equal(findDates("order dated 12-03-24").length, 1);
});

test("V1-9: a running footer on three pages gives no event", () => {
  const lines = [1, 2, 3].flatMap((page) => [
    { anchorId: `a${page}`, sourceId: "s", page, line: 1, text: `${["The suit was filed", "Notice issued", "The appeal was heard"][page - 1]} on 0${page}.01.2020.` },
    { anchorId: `f${page}`, sourceId: "s", page, line: 2, text: `05-06-2020 (Page ${page} of 3)` },
  ]);
  const running = runningLines(lines);
  assert.deepEqual([...running].sort(), ["f1", "f2", "f3"]);
  const events = extractEvents(lines, "text_layer");
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => !e.description.includes("Page")));
});

test("V1-9: list numbering is removed from the description", () => {
  assert.equal(cleanDescription("2. In brief, the suit was filed"), "In brief, the suit was filed");
  assert.equal(cleanDescription("(iii) the order was passed"), "the order was passed");
  assert.equal(cleanDescription("a) notice was issued"), "notice was issued");
  assert.equal(cleanDescription("12.03.2024: notice issued"), "12.03.2024: notice issued");
});

test("V1-9: metadata lines are not compared for date conflicts", () => {
  const base = { kind: "procedural" as const };
  const pairs = findConflicts([
    { ...base, id: "1", anchorId: "x", description: "Decided On: 05.06.2020 judgment high court appeal", dateStart: "2020-06-05", dateEnd: "2020-06-05" },
    { ...base, id: "2", anchorId: "y", description: "Decided On: 07.08.2019 judgment high court appeal", dateStart: "2019-08-07", dateEnd: "2019-08-07" },
  ]);
  assert.equal(pairs.length, 0);
});
