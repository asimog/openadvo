import { test } from "node:test";
import assert from "node:assert/strict";
import { generateListOfDates, readParagraphs } from "../../src/lib/drafting/index.ts";
import {
  AGENT_AUTHOR,
  decideChanges,
  isSubstantive,
  pendingChanges,
  proposeReplacement,
  wordDiff,
} from "../../src/lib/tracked-changes/index.ts";

const DATE = "2026-11-14T00:00:00Z";

function draft() {
  return generateListOfDates(
    [
      {
        id: "e1",
        dateStart: "2024-03-12",
        dateEnd: "2024-03-12",
        dateText: "12.03.2024",
        description: "The High Court dismissed the writ petition.",
        kind: "procedural",
        reading: "text_layer",
        sourceName: "judgment.pdf",
        page: 4,
        line: 2,
      },
    ],
    { title: "LIST OF DATES", generatedAt: DATE },
  );
}

test("word diff marks only the changed words", () => {
  assert.deepEqual(wordDiff("On 12.03.2024, the court", "On 13.03.2024, the court"), [
    { op: "same", text: "On " },
    { op: "del", text: "12.03.2024," },
    { op: "ins", text: "13.03.2024," },
    { op: "same", text: " the court" },
  ]);
});

test("a date change is substantive; a wording change is not", () => {
  assert.equal(isSubstantive("On 12.03.2024, x", "On 13.03.2024, x"), true);
  assert.equal(isSubstantive("in March", "in April"), true);
  assert.equal(isSubstantive("the court dismissed", "the High Court dismissed"), false);
});

test("a proposal is a tracked change by the agent; live text is the new text", () => {
  const g = draft();
  const p = g.paragraphs[0];
  const after = p.text.replace("dismissed", "allowed");
  const { docx, change } = proposeReplacement(g.docx, { anchor: p.anchor, expected: p.text, replacement: after, date: DATE });
  assert.equal(change.substantive, false);
  const pending = pendingChanges(docx);
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0], { anchor: p.anchor, before: p.text, after, substantive: false });
  assert.equal(readParagraphs(docx).find((x) => x.anchor === p.anchor)?.text, after);
  assert.equal(pendingChanges(docx, "someone else").length, 0);
  assert.equal(AGENT_AUTHOR, "Open Advocate agent");
});

test("keep leaves the new text; undo restores the old text; neither leaves marks", () => {
  const g = draft();
  const p = g.paragraphs[0];
  const after = p.text.replace("12.03.2024", "13.03.2024");
  const { docx } = proposeReplacement(g.docx, { anchor: p.anchor, expected: p.text, replacement: after, date: DATE });
  assert.equal(pendingChanges(docx)[0].substantive, true);
  const kept = decideChanges(docx, [{ anchor: p.anchor, decision: "keep" }]);
  assert.equal(pendingChanges(kept).length, 0);
  assert.equal(readParagraphs(kept).find((x) => x.anchor === p.anchor)?.text, after);
  const undone = decideChanges(docx, [{ anchor: p.anchor, decision: "undo" }]);
  assert.equal(pendingChanges(undone).length, 0);
  assert.equal(readParagraphs(undone).find((x) => x.anchor === p.anchor)?.text, p.text);
});

test("a stale expected text, a second proposal and an empty decision are refused", () => {
  const g = draft();
  const p = g.paragraphs[0];
  assert.throws(() => proposeReplacement(g.docx, { anchor: p.anchor, expected: "other text", replacement: "x", date: DATE }), /DOC_STALE_TARGET/);
  assert.throws(() => proposeReplacement(g.docx, { anchor: "oa-" + "0".repeat(32), expected: p.text, replacement: "x", date: DATE }), /DOC_TARGET_NOT_FOUND/);
  const { docx } = proposeReplacement(g.docx, { anchor: p.anchor, expected: p.text, replacement: p.text + " Again.", date: DATE });
  assert.throws(() => proposeReplacement(docx, { anchor: p.anchor, expected: p.text + " Again.", replacement: "y", date: DATE }), /DOC_UNDECIDED_CHANGE/);
  assert.throws(() => decideChanges(g.docx, [{ anchor: p.anchor, decision: "keep" }]), /NO_PENDING_CHANGE/);
});
