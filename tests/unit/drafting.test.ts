import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  eventSentence,
  generateListOfDates,
  generateSynopsis,
  newAnchor,
  readParagraphs,
} from "../../src/lib/drafting/index.ts";
import type { DraftEvent } from "../../src/lib/drafting/index.ts";

const GENERATED_AT = "2026-11-14T00:00:00.000Z";
const OPTIONS = { title: "List of Dates", generatedAt: GENERATED_AT };

function draftEvent(overrides: Partial<DraftEvent> & { id: string }): DraftEvent {
  const event: DraftEvent = {
    dateStart: "2024-03-12",
    dateEnd: "2024-03-12",
    dateText: "12.03.2024",
    description: "The High Court dismissed the writ petition.",
    kind: "procedural",
    reading: "text_layer",
    sourceName: "judgment.pdf",
    page: 4,
    line: 2,
    ...overrides,
  };
  // A start date without an end date is a single date, not a range.
  if (overrides.dateStart !== undefined && overrides.dateEnd === undefined) event.dateEnd = overrides.dateStart;
  return event;
}

function documentXml(docx: Buffer): string {
  const part = unzipSync(new Uint8Array(docx))["word/document.xml"];
  assert.ok(part, "the DOCX has word/document.xml");
  return strFromU8(part);
}

/** A small DOCX with one part: word/document.xml. readParagraphs needs no other part. */
function rawDocx(documentXml: string): Buffer {
  const files = { "word/document.xml": strToU8(documentXml) };
  return Buffer.from(zipSync(files, { level: 6, mtime: new Date(GENERATED_AT) }));
}

test("newAnchor: oa- and 32 lowercase hex characters, and every anchor is different", () => {
  const anchors = Array.from({ length: 200 }, () => newAnchor());
  for (const anchor of anchors) assert.match(anchor, /^oa-[0-9a-f]{32}$/);
  assert.equal(new Set(anchors).size, anchors.length);
});

test("List of Dates: a Heading 1 title, then one paragraph per event in date order", () => {
  const events = [
    draftEvent({ id: "c", dateStart: "2024-03-12", description: "The High Court dismissed the writ petition." }),
    draftEvent({ id: "a", dateStart: "2023-01-02", description: "The writ petition was filed." }),
    draftEvent({ id: "b", dateStart: "2024-02-01", dateEnd: "2024-02-29", description: "The parties exchanged pleadings." }),
  ];
  const doc = generateListOfDates(events, OPTIONS);
  assert.deepEqual(doc.paragraphs.map((p) => p.text), [
    "02.01.2023: The writ petition was filed.",
    "01.02.2024 – 29.02.2024: The parties exchanged pleadings.",
    "12.03.2024: The High Court dismissed the writ petition.",
  ]);
  const read = readParagraphs(doc.docx);
  assert.deepEqual(read[0], { anchor: null, text: "List of Dates" });
  assert.deepEqual(read.slice(1).map((p) => p.text), doc.paragraphs.map((p) => p.text));
  assert.ok(documentXml(doc.docx).includes('<w:pStyle w:val="Heading1"/>'));
});

test("List of Dates: order is date, then source name, then page, then line", () => {
  const events = [
    draftEvent({ id: "d", sourceName: "b.pdf", page: 1, line: 2 }),
    draftEvent({ id: "c", sourceName: "a.pdf", page: 5, line: 1 }),
    draftEvent({ id: "b", sourceName: "a.pdf", page: 2, line: 9 }),
    draftEvent({ id: "a", sourceName: "a.pdf", page: 2, line: 3 }),
  ];
  const doc = generateListOfDates(events, OPTIONS);
  assert.deepEqual(doc.paragraphs.map((p) => p.eventIds), [["a"], ["b"], ["c"], ["d"]]);
});

test("List of Dates: every event appears once, and one paragraph links to one event", () => {
  const events = [
    draftEvent({ id: "e1", dateStart: "2023-01-02" }),
    draftEvent({ id: "e2", dateStart: "2024-02-01", dateEnd: "2024-02-29" }),
    draftEvent({ id: "e3", dateStart: "2024-03-12" }),
  ];
  const doc = generateListOfDates(events, OPTIONS);
  assert.equal(doc.paragraphs.length, events.length);
  const ids = doc.paragraphs.flatMap((p) => p.eventIds);
  assert.deepEqual(ids.slice().sort(), events.map((e) => e.id).sort());
  for (const p of doc.paragraphs) assert.equal(p.eventIds.length, 1);
});

test("readParagraphs round-trips both generators: anchors, text and sdt tags match", () => {
  const events = [
    draftEvent({ id: "e1", dateStart: "2023-01-02" }),
    draftEvent({ id: "e2", dateStart: "2024-02-01", dateEnd: "2024-02-29" }),
  ];
  const docs = [
    generateListOfDates(events, OPTIONS),
    generateSynopsis(events, { ...OPTIONS, title: "Synopsis" }),
  ];
  for (const doc of docs) {
    const read = readParagraphs(doc.docx);
    const anchored = read.filter((p) => p.anchor !== null);
    assert.deepEqual(anchored, doc.paragraphs.map((p) => ({ anchor: p.anchor, text: p.text })));
    assert.equal(new Set(anchored.map((p) => p.anchor)).size, anchored.length);
    const xml = documentXml(doc.docx);
    assert.ok(!xml.includes("{{"), "the sentinel runs are removed");
    assert.equal((xml.match(/<w:sdt>/g) ?? []).length, doc.paragraphs.length);
    assert.equal((xml.match(/<w:id w:val="\d+"\/>/g) ?? []).length, doc.paragraphs.length);
    for (const p of doc.paragraphs) assert.ok(xml.includes(`<w:tag w:val="${p.anchor}"/>`));
  }
});

test("deterministic: the same input gives the same text and the same bytes apart from anchors", () => {
  const events = [
    draftEvent({ id: "e1", dateStart: "2023-01-02" }),
    draftEvent({ id: "e2", dateStart: "2024-02-01", dateEnd: "2024-02-29" }),
  ];
  const first = generateListOfDates(events, OPTIONS);
  const second = generateListOfDates(events, OPTIONS);
  assert.deepEqual(first.paragraphs.map((p) => p.text), second.paragraphs.map((p) => p.text));
  const firstZip = unzipSync(new Uint8Array(first.docx));
  const secondZip = unzipSync(new Uint8Array(second.docx));
  assert.deepEqual(Object.keys(firstZip).sort(), Object.keys(secondZip).sort());
  for (const name of Object.keys(firstZip)) {
    if (name === "word/document.xml") continue;
    assert.deepEqual(firstZip[name], secondZip[name], `part ${name}`);
  }
  const normalise = (bytes: Uint8Array) => strFromU8(bytes).replace(/oa-[0-9a-f]{32}/g, "ANCHOR");
  assert.equal(normalise(firstZip["word/document.xml"]), normalise(secondZip["word/document.xml"]));
});

test("the generated date is written into the DOCX core properties, not into the text", () => {
  const doc = generateListOfDates([], OPTIONS);
  const core = strFromU8(unzipSync(new Uint8Array(doc.docx))["docProps/core.xml"]);
  assert.ok(core.includes(`<dcterms:created xsi:type="dcterms:W3CDTF">${GENERATED_AT}</dcterms:created>`));
  assert.deepEqual(readParagraphs(doc.docx), [{ anchor: null, text: "List of Dates" }]);
});

test("Synopsis: one sentence per event, a final DRAFT note, and a heading", () => {
  const events = [
    draftEvent({ id: "e1", dateStart: "2023-01-02", description: "The writ petition was filed." }),
    draftEvent({ id: "e2", dateStart: "2024-02-01", dateEnd: "2024-02-29", description: "The parties exchanged pleadings." }),
  ];
  const doc = generateSynopsis(events, { ...OPTIONS, title: "Synopsis" });
  const texts = doc.paragraphs.map((p) => p.text);
  assert.equal(texts.length, events.length + 1);
  assert.equal(
    texts[0],
    "On 02.01.2023, The writ petition was filed.",
  );
  assert.equal(
    texts[1],
    "Between 01.02.2024 and 29.02.2024, The parties exchanged pleadings.",
  );
  assert.equal(texts[texts.length - 1], "DRAFT: generated from confirmed Notebook events only. Not verified.");
  assert.deepEqual(doc.paragraphs[doc.paragraphs.length - 1].eventIds, []);
  const read = readParagraphs(doc.docx);
  assert.equal(read[0].anchor, null);
  assert.equal(read[0].text, "Synopsis");
  const last = read[read.length - 1];
  assert.match(last.anchor ?? "", /^oa-[0-9a-f]{32}$/);
  assert.equal(last.text, texts[texts.length - 1]);
});

test("a range renders the range in the List of Dates and in eventSentence", () => {
  const range = draftEvent({
    id: "r",
    dateStart: "2024-02-01",
    dateEnd: "2024-02-29",
    description: "The parties exchanged pleadings",
  });
  assert.equal(eventSentence(range), "Between 01.02.2024 and 29.02.2024, The parties exchanged pleadings.");
  const list = generateListOfDates([range], OPTIONS);
  assert.equal(list.paragraphs[0].text, "01.02.2024 – 29.02.2024: The parties exchanged pleadings");
  const single = draftEvent({ id: "s", dateStart: "2024-01-02", description: "The petition was filed." });
  assert.equal(eventSentence(single), "On 02.01.2024, The petition was filed.");
  const question = draftEvent({ id: "q", description: "Is the petition maintainable?" });
  assert.equal(eventSentence(question), "On 12.03.2024, Is the petition maintainable?");
});

test("XML escaping: &, < and > in a description survive the DOCX and decode on read", () => {
  const description = 'Notice under Section 80 & "urgent" <listing> exceeded > 10 days';
  const doc = generateListOfDates([draftEvent({ id: "x", description })], OPTIONS);
  assert.equal(doc.paragraphs[0].text, `12.03.2024: ${description}`);
  const xml = documentXml(doc.docx);
  assert.ok(xml.includes("&amp;"));
  assert.ok(xml.includes("&lt;listing&gt;"));
  const read = readParagraphs(doc.docx);
  assert.equal(read[1].text, `12.03.2024: ${description}`);
});

test("readParagraphs: tracked deleted text is skipped and inserted text is kept", () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    "<w:p><w:r><w:t xml:space=\"preserve\">The Court </w:t></w:r>" +
    '<w:del w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:delText xml:space="preserve">dismissed </w:delText></w:r></w:del>' +
    '<w:ins w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>allowed</w:t></w:r></w:ins>' +
    '<w:r><w:t xml:space="preserve"> the petition.</w:t></w:r></w:p>' +
    "<w:p><w:r><w:t>Keep </w:t></w:r>" +
    '<w:del w:id="3" w:author="A"><w:r><w:t>drop</w:t></w:r></w:del>' +
    "<w:r><w:t>this.</w:t></w:r></w:p>" +
    "</w:body></w:document>";
  assert.deepEqual(readParagraphs(rawDocx(xml)), [
    { anchor: null, text: "The Court allowed the petition." },
    { anchor: null, text: "Keep this." },
  ]);
});

test("readParagraphs: the anchor is the tag of the enclosing content control, and empty paragraphs are skipped", () => {
  const anchor = "oa-00000000000000000000000000000001";
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    "<w:p/>" +
    "<w:p><w:r><w:t>Plain paragraph</w:t></w:r></w:p>" +
    '<w:sdt><w:sdtPr><w:alias w:val="Open Advocate paragraph"/><w:tag w:val="' +
    anchor +
    '"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Anchored paragraph</w:t></w:r></w:p></w:sdtContent></w:sdt>' +
    "<w:p></w:p>" +
    "<w:p><w:r><w:t xml:space=\"preserve\"> </w:t></w:r></w:p>" +
    "</w:body></w:document>";
  assert.deepEqual(readParagraphs(rawDocx(xml)), [
    { anchor: null, text: "Plain paragraph" },
    { anchor, text: "Anchored paragraph" },
  ]);
});

test("an empty event list gives a heading only, and the Synopsis still has its DRAFT note", () => {
  const list = generateListOfDates([], OPTIONS);
  assert.deepEqual(list.paragraphs, []);
  assert.deepEqual(readParagraphs(list.docx), [{ anchor: null, text: "List of Dates" }]);
  const synopsis = generateSynopsis([], { ...OPTIONS, title: "Synopsis" });
  assert.equal(synopsis.paragraphs.length, 1);
  assert.deepEqual(synopsis.paragraphs[0].eventIds, []);
  assert.equal(synopsis.paragraphs[0].text, "DRAFT: generated from confirmed Notebook events only. Not verified.");
});
