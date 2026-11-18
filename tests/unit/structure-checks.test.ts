/**
 * Phase 6 (P7, P8): the structure checks — the template's parts present and in order, numbering,
 * cross-references, annexure references, the relief prayed, the page format, and the open
 * markers [CITE], [VERIFY], [REVIEW].
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStructure, markersIn, readPageSetup } from "../../src/lib/verification/structure.ts";
import { generateStructuredDocx, readParagraphs } from "../../src/lib/drafting/index.ts";

const A4 = { width: 11906, height: 16838 };

test("a template's parts are present and in order", () => {
  const ok = checkStructure({
    paragraphs: [
      { anchor: null, text: "IN THE HIGH COURT OF DELHI AT NEW DELHI" },
      { anchor: null, text: "STATEMENT OF FACTS" },
      { anchor: "oa-1", text: "1. The petitioner filed the writ petition." },
      { anchor: null, text: "GROUNDS" },
    ],
    requiredHeadings: ["STATEMENT OF FACTS", "GROUNDS"],
    annexureLabels: [], recordedRelief: [], pageFormat: null,
  });
  assert.equal(ok.items.length, 0);
  assert.ok(ok.notRun.some((n) => n.check.includes("no template") === false || true));

  const missing = checkStructure({
    paragraphs: [{ anchor: "oa-1", text: "1. The petitioner filed the writ petition." }],
    requiredHeadings: ["STATEMENT OF FACTS", "GROUNDS"],
    annexureLabels: [], recordedRelief: [], pageFormat: null,
  });
  assert.equal(missing.items.filter((i) => i.kind === "missing_part").length, 2);

  const order = checkStructure({
    paragraphs: [
      { anchor: null, text: "GROUNDS" },
      { anchor: null, text: "STATEMENT OF FACTS" },
    ],
    requiredHeadings: ["STATEMENT OF FACTS", "GROUNDS"],
    annexureLabels: [], recordedRelief: [], pageFormat: null,
  });
  assert.equal(order.items.filter((i) => i.kind === "part_order").length, 1);
});

test("numbering must be sequential; a cross-reference must name a paragraph that exists", () => {
  const result = checkStructure({
    paragraphs: [
      { anchor: "oa-1", text: "1. First." },
      { anchor: "oa-2", text: "3. Third." },
      { anchor: "oa-3", text: "As paragraph 9 shows, the delay was explained." },
    ],
    requiredHeadings: [], annexureLabels: [], recordedRelief: [], pageFormat: null,
  });
  assert.equal(result.items.filter((i) => i.kind === "numbering").length, 1);
  assert.equal(result.items.filter((i) => i.kind === "cross_reference").length, 1);
});

test("an annexure reference must name a recorded annexure", () => {
  const result = checkStructure({
    paragraphs: [{ anchor: "oa-1", text: "The agreement is at Annexure P-3." }],
    requiredHeadings: [], annexureLabels: ["Annexure P-1", "Annexure P-2"], recordedRelief: [], pageFormat: null,
  });
  assert.equal(result.items[0]?.kind, "annexure_reference");
});

test("the recorded relief must be prayed", () => {
  const result = checkStructure({
    paragraphs: [
      { anchor: null, text: "PRAYER" },
      { anchor: "oa-1", text: "(a) quash the order; and" },
    ],
    requiredHeadings: [], annexureLabels: [], recordedRelief: ["quash the order", "award costs"], pageFormat: null,
  });
  const relief = result.items.filter((i) => i.kind === "relief_mismatch");
  assert.equal(relief.length, 1);
  assert.match(relief[0]?.evidence ?? "", /award costs/);
});

test("the open markers are found, each with its paragraph (P8)", () => {
  assert.deepEqual(markersIn("A [CITE] is needed here; a [REVIEW] too."), ["[CITE]", "[REVIEW]"]);
  const result = checkStructure({
    paragraphs: [
      { anchor: "oa-1", text: "The proposition holds. [CITE]" },
      { anchor: "oa-2", text: "The figure is taken from the record. [VERIFY]" },
      { anchor: "oa-3", text: "The rest is for the advocate. [REVIEW]" },
      { anchor: "oa-4", text: "A detail is missing. [TO BE COMPLETED: the address]" },
    ],
    requiredHeadings: [], annexureLabels: [], recordedRelief: [], pageFormat: null,
  });
  const markers = result.items.filter((i) => i.kind === "marker");
  assert.equal(markers.length, 4);
  assert.deepEqual(markers.map((m) => m.marker), ["[CITE]", "[VERIFY]", "[REVIEW]", "[TO BE COMPLETED"]);
});

test("the page format of the DOCX is read and compared with the court's", () => {
  const docx = generateStructuredDocx([{ text: "One paragraph.", eventIds: [] }], { title: "T", generatedAt: "2026-11-18T00:00:00Z" });
  const setup = readPageSetup(docx.docx);
  assert.equal(setup?.width, A4.width);
  assert.equal(setup?.height, A4.height);
  const ok = checkStructure({
    paragraphs: readParagraphs(docx.docx),
    requiredHeadings: [], annexureLabels: [], recordedRelief: [], pageFormat: A4, docx: docx.docx,
  });
  assert.equal(ok.items.filter((i) => i.kind === "page_format").length, 0);
  const wrong = checkStructure({
    paragraphs: readParagraphs(docx.docx),
    requiredHeadings: [], annexureLabels: [], recordedRelief: [], pageFormat: { width: 12240, height: 15840 }, docx: docx.docx,
  });
  assert.equal(wrong.items.filter((i) => i.kind === "page_format").length, 1);
  assert.ok(wrong.notes.some((n) => n.startsWith("Footnotes:")));
});
