/**
 * Phase 7 (K3): the record-table gaps — a column with no confirmed cell is a gap — and the
 * interim-relief element template.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordGaps, template, templatesFor } from "../../src/lib/evidence/templates.ts";

test("the interim-relief template holds the three conditions", () => {
  const t = template("interim_relief")!;
  assert.deepEqual(t.columns, ["Prima facie case", "Balance of convenience", "Irreparable injury"]);
  assert.ok(templatesFor("interim injunction").some((x) => x.key === "interim_relief"));
});

test("a column with no confirmed cell is a gap; a confirmed cell closes it; a rejected column is not read", () => {
  const columns = [
    { id: "c1", question: "Prima facie case" },
    { id: "c2", question: "Balance of convenience" },
    { id: "c3", question: "Irreparable injury" },
  ];
  const cells = [
    { columnId: "c1", status: "confirmed" },
    { columnId: "c2", status: "candidate" },
  ];
  const gaps = recordGaps(columns, cells);
  // c1 is confirmed: no gap. c2 holds only a candidate: still a gap. c3 holds nothing: a gap.
  assert.deepEqual(
    gaps.map((g) => g.question),
    ["Balance of convenience", "Irreparable injury"],
  );

  // A confirmed cell in c2 closes its gap.
  const closed = recordGaps(columns, [...cells, { columnId: "c2", status: "confirmed" }]);
  assert.deepEqual(closed.map((g) => g.question), ["Irreparable injury"]);
});
