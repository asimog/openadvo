import { test } from "node:test";
import assert from "node:assert/strict";
import { readParagraphs } from "../../src/lib/drafting/index.ts";
import { bodyParagraphs, conferenceBlocks, generateStructured, petitionBlocks, prayerDefect, TITLES, TO_COMPLETE } from "../../src/lib/drafting/structured.ts";

const base = {
  petitioner: "Ram Kumar",
  respondent: "State of Delhi",
  court: "High Court of Delhi",
  caseNumber: "CRL.A. No. 12 of 2023",
  impugnedDate: "2024-03-12",
  impugnedEventId: "ev:1",
  questions: ["Whether the High Court erred in law?"],
  grounds: ["A. Because the finding is perverse."],
  annexures: [{ label: "Annexure P-1", title: "Impugned judgment" }],
  year: 2026,
};

test("V1-7: a complete petition carries no marker, copies the approved text, and its prayer passes rule 24", () => {
  const blocks = petitionBlocks(base);
  const texts = blocks.map((b) => b.text);
  assert.ok(!texts.some((t) => t.includes(TO_COMPLETE)));
  assert.ok(texts.includes("Whether the High Court erred in law?"));
  assert.ok(texts.includes("A. Because the finding is perverse."));
  assert.ok(texts.includes("Annexure P-1: Impugned judgment"));
  assert.equal(prayerDefect(texts, { date: "2024-03-12", caseNumber: base.caseNumber }), null);
  assert.match(prayerDefect(texts, { date: "2024-03-13", caseNumber: base.caseNumber }) ?? "", /13\.03\.2024/);
});

test("V1-7: an unrecorded detail becomes a marker; a DOCX round trip keeps the paragraphs", () => {
  const blocks = petitionBlocks({ ...base, respondent: "", impugnedDate: null, impugnedEventId: null, grounds: [] });
  const marked = blocks.filter((b) => b.text.includes(TO_COMPLETE));
  assert.ok(marked.some((b) => b.text.includes("respondent")));
  assert.ok(marked.some((b) => b.text.includes("date of the impugned judgment")));
  assert.ok(marked.some((b) => b.text.includes("Grounds")));
  const g = generateStructured(blocks, { title: "PETITION", generatedAt: "2026-11-14T00:00:00Z" });
  const read = readParagraphs(g.docx);
  assert.equal(read.filter((p) => p.anchor).length, g.paragraphs.length);
  assert.equal(read.filter((p) => p.text.includes(TO_COMPLETE)).length, marked.length);
});

test("V1-7: the draft title is dropped when its text is copied", () => {
  assert.deepEqual(bodyParagraphs([{ text: "GROUNDS" }, { text: "" }, { text: "A. Because" }], TITLES.grounds), ["A. Because"]);
});

test("V1-6: the conference package lists records and states what is missing", () => {
  const ev = { id: "e1", dateStart: "2020-01-02", dateEnd: "2020-01-02", dateText: "02.01.2020", description: "Suit filed", kind: "procedural" as const, reading: "text_layer" as const, sourceName: "plaint.pdf", page: 1, line: 3 };
  const texts = conferenceBlocks({
    details: { petitioner: "A", respondent: "B", court: "", caseNumber: "", cnr: "", impugned: null },
    procedural: [ev],
    factual: [],
    issues: [{ text: "Limitation", status: "accepted", author: "advocate", reason: "Core" }],
    authorities: [{ citation: "2020 INSC 1", parties: "X v Y", role: "adverse", status: "adopted", proposition: "p", outcome: "verified" }],
    adverseReview: null,
    memoranda: [],
    openReviewItems: [{ kind: "ocr", detail: "page 2" }],
  }).map((b) => b.text);
  assert.ok(texts.includes("02.01.2020: Suit filed [plaint.pdf, p. 1, l. 3]"));
  assert.ok(texts.some((t) => t.includes("2020 INSC 1") && t.includes("validator: verified")));
  assert.ok(texts.some((t) => t.startsWith("Matter details not recorded: High Court, High Court case number, CNR, impugned judgment")));
  assert.ok(texts.some((t) => t.includes("not available")));
});
