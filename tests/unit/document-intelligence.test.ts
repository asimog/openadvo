import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { processPdf, extractText, renderPagePng, stopOcr } from "../../src/lib/document-intelligence/index.ts";
import { MatterStore, anchorId } from "../../src/lib/matter-store/index.ts";

after(() => stopOcr());

/** Page 1: born-digital text. Page 2: the same text as an image only (a "scan"). Page 3: blank. */
async function fixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const p1 = doc.addPage([595, 842]);
  p1.drawText("IN THE SUPREME COURT OF INDIA", { x: 150, y: 780, size: 16, font });
  p1.drawText("The High Court dismissed the writ petition on 12.03.2024.", { x: 72, y: 720, size: 12, font });
  p1.drawText("Special Leave Petition (Civil) No. 1234 of 2024", { x: 72, y: 700, size: 12, font });
  const textOnly = await doc.save();
  const png = await renderPagePng(textOnly, 1, 2.5);
  const image = await doc.embedPng(png);
  doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  doc.addPage([595, 842]);
  return doc.save();
}

test("born-digital text, OCR of a scanned page, and a page without text", async () => {
  const pages = await processPdf(await fixture());
  assert.equal(pages.length, 3);
  assert.equal(pages[0].kind, "born_digital");
  assert.equal(pages[0].lines[0].text, "IN THE SUPREME COURT OF INDIA");
  assert.match(pages[0].lines[1].text, /dismissed the writ petition on 12\.03\.2024/);
  assert.equal(pages[1].kind, "ocr");
  assert.ok(pages[1].ocr && pages[1].ocr.confidence > 50);
  assert.match(pages[1].text, /writ petition/i);
  // OCR line boxes use the same PDF coordinates as the text layer, within a few points.
  assert.ok(Math.abs(pages[1].lines[0].y - pages[0].lines[0].y) < 8);
  assert.equal(pages[2].kind, "none");
  assert.equal(pages[2].lines.length, 0);
});

test("a file that is not a readable PDF fails, it is not hidden", async () => {
  await assert.rejects(() => extractText(new TextEncoder().encode("%PDF-1.4\nbroken")));
});

test("the matter store records pages, anchors, OCR readings, review items, and searches lines", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-di-"));
  try {
    const bytes = await fixture();
    const file = path.join(root, "slp.pdf");
    await writeFile(file, bytes);
    const store = await MatterStore.create(path.join(root, "m"), "Store test", { actor: "advocate" });
    const source = (await store.addFile(file, { actor: "advocate" })).source!;
    assert.deepEqual(store.sourcesToIngest().map((s) => s.id), [source.id]);
    store.startJob(source.id);
    const pages = await processPdf(bytes, (p) => store.recordPage(source.id, p));
    store.finishJob(source.id, pages.length);
    assert.equal(store.sourcesToIngest().length, 0);
    assert.equal(store.listJobs()[0].state, "done");

    const stored = store.listPages(source.id);
    assert.deepEqual(stored.map((p) => p.kind), ["born_digital", "ocr", "none"]);
    assert.equal(stored[1].ocr?.engine, "tesseract.js");
    assert.equal(stored[0].lines[1].id, anchorId(source.sha256, 1, 2));

    const hits = store.searchLines("writ petition");
    assert.ok(hits.length >= 2);
    assert.deepEqual(hits[0], { ...hits[0], page: 1, line: 2, sha256: source.sha256 });
    assert.equal(store.searchLines("100%_").length, 0);

    const items = store.listReviewItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "page_without_text");
    assert.equal(items[0].page, 3);
    assert.throws(() => store.decideReviewItem(items[0].id, "resolved", { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(store.decideReviewItem(items[0].id, "skipped", { actor: "advocate" }).status, "skipped");
    assert.throws(() => store.startJob(source.id), /ALREADY_INGESTED/);

    const actions = store.listEvents().map((e) => e.action);
    for (const a of ["ingest.started", "ocr.read", "review_item.opened", "ingest.finished", "review_item.skipped"]) assert.ok(actions.includes(a), a);
    const folder = store.folder;
    store.close();

    const db = new DatabaseSync(path.join(folder, "matter.db"));
    assert.throws(() => db.exec("UPDATE anchor SET text = 'x'"), /written once/);
    assert.throws(() => db.exec("DELETE FROM page"), /written once/);
    assert.throws(() => db.exec("DELETE FROM review_item"), /never deleted/);
    db.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
