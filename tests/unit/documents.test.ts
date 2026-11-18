/**
 * Phase 6 (L1, L2, L3, L8): the document catalogue. Every kind builds from the records, the
 * record parts keep the ids of their records, the witness rule organizes only the deponent's own
 * words, the court format matches the adapter's own rules, and the pack's parts map to documents.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATALOGUE, COURT_FORMATS, courtFormat, GROUP_LABEL, packToDocuments, templateOf } from "../../src/lib/drafting/documents.ts";
import { affidavitPart, factsPart, prayers } from "../../src/lib/drafting/parts.ts";
import { readParagraphs } from "../../src/lib/drafting/index.ts";
import { readPageSetup } from "../../src/lib/verification/structure.ts";
import { generateStructured, TO_COMPLETE } from "../../src/lib/drafting/structured.ts";
import type { DraftingInput } from "../../src/lib/drafting/parts.ts";
import { DRAFT_KINDS } from "../../src/shared/records.ts";

const INPUT: DraftingInput = {
  details: { title: "X v Y", court: "High Court of Delhi", caseNumber: "123/2024", cnr: "CNR-1", petitioner: "X", respondent: "Y", interimRelief: "stay the order" },
  advocate: { name: "A. Advocate", role: "Advocate", barCouncil: "Bar Council of Delhi", address: "Chambers 1" },
  events: [
    { id: "e1", dateStart: "2024-03-12", dateEnd: "2024-03-12", dateText: "12.03.2024", description: "The order was passed.", kind: "factual", reading: "text_layer", sourceName: "order.pdf", page: 1, line: 3 },
  ],
  facts: [
    { id: "f1", text: "The order was passed on 12 March 2024.", type: "fact", status: "confirmed", date: "2024-03-12", relief: "", sourceName: "order.pdf", page: 1, line: 3 },
    { id: "f2", text: "The respondent admits service.", type: "admission", status: "confirmed", date: "", relief: "", sourceName: "affidavit.pdf", page: 2, line: 1 },
    { id: "f3", text: "The claim is for the refund of the deposit.", type: "fact", status: "confirmed", date: "", relief: "direct the refund of the deposit", sourceName: "notice.pdf", page: 1, line: 1 },
  ],
  evidence: [
    { id: "ev1", statement: "I received the order on 15 March 2024.", givenBy: "X", givenAt: "2024-03-16", witness: "X", exhibitNumber: "", sourceName: "affidavit.pdf" },
    { id: "ev2", statement: "I could not file the appeal in time because I was ill.", givenBy: "X", givenAt: "2024-04-02", witness: "X", exhibitNumber: "", sourceName: "affidavit.pdf" },
  ],
  authorities: [{ citation: "2024 INSC 23", parties: "X v Y", paragraph: "15", proposition: "delay is explained by illness", role: "supporting" }],
  provisions: [{ act: "Limitation Act, 1963", section: "5", title: "Extension of period", repealed: false, source: "indiacode:limitation" }],
  annexures: [{ label: "Annexure P-1", title: "The order" }],
  issues: [{ text: "Was the delay explained?", status: "accepted" }],
  allegations: [{ text: "The petitioner never served the notice.", ref: "4", sourceName: "plaint.pdf", page: 3, line: 2 }],
  memorandum: { title: "Limitation", body: "The delay is explained by illness.", unresolved: [] },
  proceeding: { caseType: "W.P.(C)", provisions: [] },
  approved: { questions: [], grounds: [] },
  stage: "Drafting",
  hearings: [
    { date: "2026-11-10", bench: "Justice X", directions: "Reply affidavit within four weeks.", nextDate: "2026-12-15", nextDateStatus: "confirmed" },
  ],
  orderDirections: [
    { text: "Reply to be filed within four weeks.", sourceName: "order.pdf", page: 2, line: 4 },
  ],
  openItems: [{ kind: "draft_defect.marker_review", detail: "Writ petition, paragraph 9 holds an open marker." }],
  challenges: [
    { kind: "bench_question", text: "Was the authority's order served on the petitioner?", answer: "Yes; the receipt is at E1.", status: "accepted" },
    { kind: "objection", text: "The petition is premature: the alternative remedy was not used.", answer: "The remedy is inefficacious; see A1.", status: "accepted" },
    { kind: "objection", text: "The delay of two days is unexplained.", answer: "", status: "open" },
  ],
  arguments: [
    { claim: "The order was passed without hearing the petitioner.", reasoning: "No notice was issued before the order; the record holds none.", computed: "in", elo: 1012 },
    { claim: "The alternative remedy is inefficacious.", reasoning: "The statutory appeal decides only accounts; the right asserted is constitutional.", computed: "undecided", elo: 998 },
  ],
};

test("every kind of the catalogue builds, and every DraftKind is covered", () => {
  for (const template of CATALOGUE) {
    const blocks = template.build(INPUT);
    assert.ok(blocks.length > 0, `${template.kind} built no part`);
    assert.ok(GROUP_LABEL[template.group], `${template.kind} has an unknown group`);
    const g = generateStructured(blocks, { title: template.title, generatedAt: "2026-11-18T00:00:00Z" });
    const paragraphs = readParagraphs(g.docx);
    assert.ok(paragraphs.length > 1, `${template.kind} produced no paragraph`);
  }
  // Every new kind of the union has a template; the record kinds keep their dedicated paths.
  const catalogueKinds = new Set(CATALOGUE.map((t) => t.kind));
  for (const kind of DRAFT_KINDS) {
    if (["list_of_dates", "synopsis", "questions_of_law", "grounds", "petition", "conference", "condonation"].includes(kind)) continue;
    assert.ok(catalogueKinds.has(kind), `${kind} has no template`);
  }
});

test("a slot part says on screen that the advocate or the agent writes it (lesson L2)", () => {
  const writ = templateOf("writ_petition")!.build(INPUT);
  assert.ok(writ.some((b) => b.text.includes("[REVIEW")), "the writ petition's grounds are a slot");
  const affidavit = templateOf("affidavit")!.build(INPUT);
  assert.ok(affidavit.every((b) => !b.text.includes("[REVIEW") || b.text.includes("deponent")), "the affidavit's statements are not a slot");
});

test("the facts part keeps the ids of the confirmed facts it states (L2)", () => {
  const blocks = factsPart(INPUT);
  const withIds = blocks.filter((b) => (b.factIds ?? []).length > 0);
  assert.equal(withIds.length, 3);
  assert.deepEqual(withIds.map((b) => b.factIds), [["f1"], ["f2"], ["f3"]]);
});

test("the prayers are generated from the recorded relief (L2)", () => {
  const blocks = prayers(INPUT, "It is most respectfully prayed that this Hon'ble Court may be pleased to:");
  const joined = blocks.map((b) => b.text).join(" ");
  assert.match(joined, /\(a\) direct the refund of the deposit; and/);
  assert.match(joined, /\(b\) pass such other order/);
});

test("the witness rule: the affidavit organizes only the deponent's own recorded words (L8)", () => {
  const blocks = affidavitPart(INPUT, "X");
  const statements = blocks.filter((b) => (b.evidenceIds ?? []).length > 0);
  assert.equal(statements.length, 2);
  assert.equal(statements[0]?.evidenceIds?.[0], "ev1");
  assert.equal(statements[1]?.evidenceIds?.[0], "ev2");
  // The statements are the deponent's words, in the order they were given, and nothing is composed.
  assert.equal(statements[0]?.text, "2. I received the order on 15 March 2024.");
  assert.equal(statements[1]?.text, "3. I could not file the appeal in time because I was ill.");
  const note = blocks.find((b) => b.text.includes("the deponent's own recorded words"));
  assert.ok(note, "the affidavit says its words are the deponent's");
});

test("the witness rule: no recorded statement is a marker, never invented prose (L8)", () => {
  const blocks = affidavitPart({ ...INPUT, evidence: [] }, "X");
  assert.ok(blocks.some((b) => b.text.includes(TO_COMPLETE)));
  assert.ok(blocks.some((b) => b.text.includes("the deponent's own words")));
});

test("the court format matches the adapter's own rule text (L1)", () => {
  const adapter = JSON.parse(readFileSync(path.join("adapters", "in-hc-delhi", "adapter.json"), "utf8")) as { lists: Array<{ key: string; items: Array<{ text: string }> }> };
  const items = adapter.lists.find((l) => l.key === "filing.efiling_format")?.items ?? [];
  assert.match(items[0]?.text ?? "", /A4/i);
  assert.match(items[0]?.text ?? "", /2 cm/i);
  assert.match(items[0]?.text ?? "", /4 cm/i);
  assert.match(items[1]?.text ?? "", /Times New Roman/i);
  assert.match(items[1]?.text ?? "", /size 14/i);
  assert.match(items[1]?.text ?? "", /1\.5/);
  const format = courtFormat("in.hc.delhi");
  assert.equal(format, COURT_FORMATS["in.hc.delhi"]);
  assert.match(format.source, /rule 6.1/);
  // The values the rule states, in twips: A4, margins 2 cm top and bottom, 4 cm left and right.
  assert.equal(format.pageWidth, 11906);
  assert.equal(format.margin.top, 2 * 567);
  assert.equal(format.margin.left, 4 * 567);
  assert.equal(format.sizeHalfPoints, 28);
  assert.equal(format.lineSpacing, 360);
  // A court without a known format gets the default, and says so.
  const unknown = courtFormat("in.sc");
  assert.match(unknown.source, /No court format is recorded/);
});

test("a draft generated for the Delhi High Court is born in the court's format", () => {
  const blocks = templateOf("writ_petition")!.build(INPUT);
  const g = generateStructured(blocks, { title: "WRIT PETITION", generatedAt: "2026-11-18T00:00:00Z", format: courtFormat("in.hc.delhi") });
  const setup = readPageSetup(g.docx);
  assert.equal(setup?.width, COURT_FORMATS["in.hc.delhi"].pageWidth);
  assert.equal(setup?.height, COURT_FORMATS["in.hc.delhi"].pageHeight);
});

test("the pack's required parts map to documents, annexures, or an honest unmapped report", () => {
  const dhc = packToDocuments(["Memo of parties", "Writ petition", "Affidavit", "Annexures", "Vakalatnama"]);
  assert.deepEqual(dhc.documents.map((d) => d.kind), ["memo_of_parties", "writ_petition", "affidavit", "vakalatnama"]);
  assert.deepEqual(dhc.annexures, ["Annexures"]);
  assert.deepEqual(dhc.unmapped, []);

  const sc = packToDocuments(["List of dates", "Certified copy of the impugned judgment", "Special leave petition (Form No. 28)", "Appendix of provisions", "Annexures", "Affidavit"]);
  assert.deepEqual(sc.documents.map((d) => d.kind), ["list_of_dates", "petition", "appendix_of_provisions", "affidavit"]);
  assert.deepEqual(sc.annexures, ["Certified copy of the impugned judgment", "Annexures"]);

  const unknown = packToDocuments(["Writ petition", "A part no application knows"]);
  assert.deepEqual(unknown.unmapped, ["A part no application knows"]);
});
