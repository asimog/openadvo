/** V5-13 to V5-17: compare, hygiene, victim names, limitation exclusion, disclosure, paper book, conversion check. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { conversionCheck, copyExclusion, diffParagraphs, disclosureBlockers, disclosureBlocks, extendDeadline, paperBook, protectedNamesIn, reporterOnlyCitations } from "../../src/lib/filing/v5.ts";

test("compare: unchanged, added, removed and changed paragraphs", () => {
  const d = diffParagraphs(["A", "B", "C", "D"], ["A", "B2", "C", "E", "F"]);
  assert.deepEqual(d, [
    { op: "same", text: "A" },
    { op: "changed", before: "B", after: "B2" },
    { op: "same", text: "C" },
    { op: "changed", before: "D", after: "E" },
    { op: "added", text: "F" },
  ]);
  assert.deepEqual(diffParagraphs(["X"], []), [{ op: "removed", text: "X" }]);
});

test("hygiene: reporter-only citations, and protected names as whole words", () => {
  assert.deepEqual(reporterOnlyCitations("As held in (2014) 8 SCC 273 and AIR 1978 SC 597."), ["(2014) 8 SCC 273", "AIR 1978 SC 597"]);
  assert.deepEqual(reporterOnlyCitations("As held in 2014 INSC 463, (2014) 8 SCC 273."), []);
  assert.deepEqual(protectedNamesIn("The statement of Meena was recorded.", ["Meena", "Ravi"]), ["Meena"]);
  assert.deepEqual(protectedNamesIn("Meenakshi Road", ["Meena"]), []);
});

test("limitation: the certified-copy time is excluded with its working; missing or disordered dates exclude nothing", () => {
  const ex = copyExclusion("2024-03-12", "2024-03-20", "2024-04-05", 90);
  assert.equal(ex.days, 17);
  assert.match(ex.working, /17 day\(s\) excluded.*section 12\(2\)/);
  assert.equal(extendDeadline("2024-06-10", 17), "2024-06-27");
  assert.equal(copyExclusion("2024-03-12", null, "2024-04-05", 90).days, 0);
  assert.equal(copyExclusion("2024-03-12", "2024-04-05", "2024-03-20", 90).days, 0);
  assert.equal(copyExclusion("2024-03-12", "2024-07-01", "2024-07-05", 90).days, 0, "applied after the period ran");
});

test("disclosure: attested citations stand apart and are never called verified; failed citations block it", () => {
  const blocks = disclosureBlocks({
    matter: "Ram v. State",
    generatedAt: "2026-11-15T00:00:00Z",
    model: "opencode-go/deepseek-v4.1-flash",
    assistance: ["The agent assisted."],
    citations: [{ citation: "1950 INSC 1", outcome: "verified", attested: false, reason: null }, { citation: "2023 INSC 99999", outcome: "failed", attested: true, reason: "not found" }],
    provisions: [],
    attestations: [{ citation: "2023 INSC 99999", reason: "too recent", at: "2026-11-14T10:00:00Z" }],
  }).map((b) => b.text);
  assert.ok(blocks.includes("1950 INSC 1: verified by the independent validator."));
  assert.ok(!blocks.some((t) => t.startsWith("2023 INSC 99999: failed")));
  assert.ok(blocks.some((t) => /2023 INSC 99999: attested by the advocate .* is advocate-attested and is not verified\./.test(t)));
  assert.deepEqual(disclosureBlockers([{ citation: "X", outcome: "unresolved", attested: false, reason: null }, { citation: "Y", outcome: "failed", attested: true, reason: null }]), ["X: unresolved, not attested"]);
});

test("paper book: an index page, every page in order, page numbers and one bookmark per part", async () => {
  const part = async (n: number) => {
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.TimesRoman);
    for (let i = 0; i < n; i++) d.addPage([595, 842]).drawText(`page ${i + 1}`, { x: 50, y: 800, size: 12, font: f });
    return d.save();
  };
  const book = await paperBook("Ram v. State", [{ title: "Synopsis", bytes: await part(2) }, { title: "Annexure P-1", bytes: await part(3) }]);
  assert.deepEqual(book.index, [{ title: "Synopsis", from: 2, to: 3 }, { title: "Annexure P-1", from: 4, to: 6 }]);
  const doc = await PDFDocument.load(book.bytes);
  assert.equal(doc.getPageCount(), 6);
  assert.ok(doc.catalog.get(PDFName.of("Outlines")), "the book has bookmarks");
});

test("conversion check: every paragraph in order, whatever the line breaks", () => {
  const paras = ["1. The petitioner was arrested on 05.01.2020.", "2. Bail was refused on 12.03.2024."];
  assert.deepEqual(conversionCheck(paras, "1. The petitioner was arrested\non 05.01.2020.\n2. Bail was refused on 12.03.2024."), { ok: true, missing: [] });
  assert.equal(conversionCheck(paras, "1. The petitioner was arrested on 05.01.2020.").ok, false);
  assert.equal(conversionCheck(paras, "2. Bail was refused on 12.03.2024. 1. The petitioner was arrested on 05.01.2020.").ok, false, "order matters");
});
