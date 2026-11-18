/** RAG-1: the ten-instrument first wave, the PDF body parser, OCR repair, import and manifest. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { LawStore } from "../../src/lib/law-store/index.ts";
import { FIRST_WAVE } from "../../src/lib/statutes/first-wave.ts";
import { parseStatutePages, type PdfPage } from "../../src/lib/statutes/act-text.ts";
import { importInstrument, type LawSource } from "../../src/lib/law-import/index.ts";
import type { FetchedAct, FetchedActText, FetchedProvision } from "../../src/lib/statutes/indiacode.ts";

function page(number: number, lines: string[]): PdfPage {
  return { page: number, lines: lines.map((text, line) => ({ line: line + 1, text })) };
}

test("RAG-1: the owner's first wave is ten instruments, with the current and repealed criminal codes", () => {
  assert.equal(FIRST_WAVE.length, 10);
  assert.deepEqual(FIRST_WAVE.map((item) => item.short), ["Constitution", "BNS", "BNSS", "BSA", "IPC", "CrPC", "Evidence Act", "CPC", "General Clauses Act", "Limitation Act"]);
  assert.equal(FIRST_WAVE.find((item) => item.short === "IPC")?.repealed, true);
  assert.equal(FIRST_WAVE.find((item) => item.short === "BNS")?.replaces, "Indian Penal Code, 1860");
  assert.equal(FIRST_WAVE.find((item) => item.short === "Constitution")?.kind, "constitution");
  assert.equal(FIRST_WAVE.find((item) => item.short === "CPC")?.source, "indiacode-sections");
});

test("RAG-1: the PDF body parser skips the arrangement and keeps page, line and chapter", () => {
  const pages: PdfPage[] = [
    page(1, ["THE INDIAN PENAL CODE", "ARRANGEMENT OF SECTIONS", "CHAPTER I", "1. Title and extent of operation of the Code.", "420. Cheating and dishonestly inducing delivery of property."]),
    page(2, ["ACT NO. 45 OF 1860", "[6th October, 1860.]", "CHAPTER I", "1. Title and extent of operation of the Code.—This Act shall be called the Indian Penal Code.", "CHAPTER XVII", "419. Punishment for cheating.—Whoever cheats shall be punished.", "420. Cheating and dishonestly inducing delivery of property.—Whoever cheats and thereby dishonestly induces the person deceived to deliver any property, shall be punished.", "421. Dishonest or fraudulent removal.—Whoever dishonestly removes property."]),
  ];
  const rows = parseStatutePages(pages, "section", { maxJump: 1000 });
  assert.equal(rows[0].number, "1");
  assert.equal(rows[0].page, 2);
  assert.equal(rows[0].line, 4);
  assert.equal(rows[0].under, "CHAPTER I");
  assert.match(rows[0].text, /This Act shall be called the Indian Penal Code/);
  const cheating = rows.find((row) => row.number === "420");
  assert.ok(cheating);
  assert.equal(cheating.page, 2);
  assert.equal(cheating.under, "CHAPTER XVII");
  assert.match(cheating.text, /Whoever cheats/);
  assert.ok(!rows.some((row) => row.text === "Cheating and dishonestly inducing delivery of property."), "the arrangement entry is not kept");
});

test("RAG-1: the Constitution starts at article 1, and a footnote marker before 226 is stripped", () => {
  const pages: PdfPage[] = [
    page(1, ["THE CONSTITUTION OF INDIA", "CONTENTS", "1. Name and territory of the Union."]),
    page(2, ["WE, THE PEOPLE OF INDIA, having solemnly resolved", "PART I", "1. Name and territory of the Union.—(1) India, that is Bharat, shall be a Union of States.", "PART III", "CHAPTER V", "225. Jurisdiction of existing High Courts.—The jurisdiction of the existing High Courts shall be the same.", "2[226. Power of High Courts to issue certain writs.—(1) Notwithstanding anything in article 32, every High Court shall have power.", "227. Power of superintendence over all courts.—Every High Court shall have superintendence."]),
  ];
  const rows = parseStatutePages(pages, "article", { start: /^\s*1\.\s+Name and territory of the Union[. ]*[—–-]{1,2}/, maxJump: 1000 });
  assert.equal(rows.find((row) => row.number === "1")?.page, 2);
  const article = rows.find((row) => row.number === "226");
  assert.ok(article);
  assert.equal(article.under, "PART III / CHAPTER V");
  assert.match(article.text, /Power of High Courts/);
});

test("RAG-1: the repealed CrPC OCR numbers 482-484 are repaired, not invented", () => {
  const pages: PdfPage[] = [
    page(1, ["THE CODE OF CRIMINAL PROCEDURE, 1973", "ARRANGEMENT OF SECTIONS", "481. Public servant concerned in sale not to purchase.", "rn2. Saving of inherent powers of High Court."]),
    page(2, ["No. 2 OF 1974", "CHAPTER XXXVII", "481. A public servant having any duty to perform in connection with the sale of any property shall not purchase it.", "4g,2.- Nothing in this Code shall be deemed to limit or affect the inherent powers of the High Court.", "4.83. Duty of High Court to exercise continuous superintendence.", "4-84. Repeal and savings."]),
  ];
  const rows = parseStatutePages(pages, "section");
  const section = rows.find((row) => row.number === "482");
  assert.ok(section);
  assert.match(section.text, /inherent powers of the High Court/);
  assert.ok(rows.some((row) => row.number === "483"));
  assert.ok(rows.some((row) => row.number === "484"));
});

test("RAG-1: the manifest records the source files and a stable set hash", () => {
  const law = new LawStore(new DatabaseSync(":memory:"));
  const put = law.putInstrument(
    {
      kind: "act",
      title: "The Test Act, 2026",
      number: "1",
      year: "2026",
      jurisdiction: "CENTRAL",
      enacted: null,
      enforced: null,
      enforcedText: "",
      repealed: false,
      source: "indiacode",
      sourceUrl: "https://indiacode.gov.in/items/test",
      sourceRef: "test-act",
      provisions: [{ kind: "section", number: "1", heading: "Short title", text: "This Act may be called the Test Act, 2026.", order: 1, page: 1, line: 1 }],
    },
    { actor: "system" },
  );
  law.putSourceFile({ actId: put.act.id, itemUuid: "test-act", pdfUrl: "https://indiacode.gov.in/test.pdf", pdfSha256: "a".repeat(64), textUrl: "https://indiacode.gov.in/test.pdf.txt", textSha256: "b".repeat(64), note: "test" });
  const first = law.manifest();
  assert.equal(first.acts.length, 1);
  assert.equal(first.provisions, 1);
  assert.equal(first.acts[0].sourceFiles[0].pdfSha256, "a".repeat(64));
  assert.match(first.setHash, /^[a-f0-9]{64}$/);
  assert.equal(law.manifest().setHash, first.setHash, "the same rows give the same set hash");
});

function fakeSectionAct(): FetchedAct {
  return { sourceRef: "test-item", sourceUrl: "https://indiacode.gov.in/items/test-item", title: "The Test Act, 2026", actId: "TEST_ACT", number: "1", year: "2026", jurisdiction: "CENTRAL", enacted: null, enforced: null, enforcedText: "", repealed: false };
}

function fakeProvisions(count: number): FetchedProvision[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "section" as const,
    number: String(index + 1),
    heading: `Section ${index + 1}`,
    text: `The text of section ${index + 1} of the Test Act.`,
    footnotes: "",
    textHash: "",
    order: index + 1,
    under: "CHAPTER I",
    sourceRef: `section-${index + 1}`,
    sourceUrl: "https://indiacode.gov.in/items/section",
    gone: null,
    events: [],
  }));
}

function sourceWith(sectionCount: number, textPages: PdfPage[]): LawSource {
  return {
    fetchAct: async () => ({ act: fakeSectionAct(), provisions: fakeProvisions(sectionCount) }),
    fetchActText: async () => ({
      itemUuid: "test-text",
      title: "The Test Text Act, 2026",
      handle: "123/test",
      sourceUrl: "https://indiacode.gov.in/handle/123/test",
      pdfUrl: "https://indiacode.gov.in/test.pdf",
      pdfSha256: "c".repeat(64),
      pdfBytes: new Uint8Array([1, 2, 3]),
      textUrl: "https://indiacode.gov.in/test.pdf.txt",
      textSha256: "d".repeat(64),
      text: "test",
      retrievedAt: "2026-11-18T00:00:00Z",
    }),
    processPdf: async () => textPages,
  };
}

test("RAG-1: two same-numbered rules under different source items are both current", () => {
  const law = new LawStore(new DatabaseSync(":memory:"));
  const put = law.putInstrument(
    {
      kind: "act",
      title: "The Test Rules, 2026",
      number: "1",
      year: "2026",
      jurisdiction: "CENTRAL",
      enacted: null,
      enforced: null,
      enforcedText: "",
      repealed: false,
      source: "indiacode",
      sourceUrl: "https://indiacode.gov.in/items/rules",
      sourceRef: "test-rules",
      provisions: [
        { kind: "rule", number: "4A", heading: "First order", text: "The first order's rule 4A.", order: 1, sourceKey: "item-a" },
        { kind: "rule", number: "4A", heading: "Second order", text: "The second order's rule 4A.", order: 2, sourceKey: "item-b" },
      ],
    },
    { actor: "system" },
  );
  assert.equal(put.added, 2);
  assert.equal(put.changed, 0);
  assert.deepEqual(law.provisions(put.act.id).map((row) => [row.number, row.sourceKey]), [["4A", "item-a"], ["4A", "item-b"]]);
});

test("RAG-1: a section-based instrument imports through the section items, with no source file", async () => {
  const law = new LawStore(new DatabaseSync(":memory:"));
  const item = FIRST_WAVE.find((entry) => entry.short === "BNS")!;
  const result = await importInstrument(law, item, () => undefined, sourceWith(2, []));
  assert.equal(result.textBased, false);
  assert.equal(result.provisions, 2);
  assert.equal(law.acts().length, 1);
  assert.equal(law.sourceFiles().length, 0);
});

test("RAG-1: a text-based instrument imports through the PDF pages and records the source hash", async () => {
  const law = new LawStore(new DatabaseSync(":memory:"));
  const item = FIRST_WAVE.find((entry) => entry.short === "CrPC")!;
  const pages: PdfPage[] = [
    page(1, ["THE CODE OF CRIMINAL PROCEDURE, 1973", "ARRANGEMENT OF SECTIONS"]),
    page(2, ["No. 2 OF 1974", ...Array.from({ length: 50 }, (_, index) => `${index + 1}. The text of section ${index + 1}.—This is the body of the section.`)]),
  ];
  const result = await importInstrument(law, item, () => undefined, sourceWith(0, pages));
  assert.equal(result.textBased, true);
  assert.equal(result.provisions, 50);
  assert.equal(law.sourceFiles().length, 1);
  assert.equal(law.sourceFiles()[0].pdfSha256, "c".repeat(64));
  assert.match(law.sourceFiles()[0].textSha256, /^[a-f0-9]{64}$/);
});
