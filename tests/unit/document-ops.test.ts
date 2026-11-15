/** H13: document operations write new PDFs and keep the original. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { Matters } from "../../src/main/matters.ts";
import { extractPages, markDocument, mergeDocuments, reorderDocument, splitDocument } from "../../src/main/document-ops.ts";

async function pdfFile(dir: string, pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const file = path.join(dir, `source-${pages}.pdf`);
  writeFileSync(file, await doc.save());
  return file;
}

async function pageCount(matters: Matters, matterId: string, sourceId: string): Promise<number> {
  const f = await matters.sourceFile(matterId, sourceId);
  const doc = await PDFDocument.load(await import("node:fs/promises").then((fs) => fs.readFile(f.path)));
  return doc.getPageCount();
}

test("H13: extract, split, merge, reorder and redact write new sources and keep a log", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-docops-"));
  try {
    const matters = new Matters(path.join(dir, "matters"));
    const m = await matters.create("Document operations");
    const file = await pdfFile(dir, 3);
    const [added] = await matters.addFiles(m.id, [file]);
    const sourceId = added.source!.id;
    const extracted = await extractPages(matters, m.id, sourceId, [1, 3]);
    assert.equal(await pageCount(matters, m.id, extracted.sources[0].id), 2);
    const split = await splitDocument(matters, m.id, sourceId, [[1], [2, 3]]);
    assert.equal(split.sources.length, 2);
    assert.equal(await pageCount(matters, m.id, split.sources[1].id), 2);
    const merged = await mergeDocuments(matters, m.id, [split.sources[0].id, split.sources[1].id]);
    assert.equal(await pageCount(matters, m.id, merged.sources[0].id), 3);
    const reordered = await reorderDocument(matters, m.id, sourceId, [3, 2, 1]);
    assert.equal(await pageCount(matters, m.id, reordered.sources[0].id), 3);
    const redacted = await markDocument(matters, m.id, sourceId, { page: 2, x: 0.1, y: 0.1, w: 0.4, h: 0.1 }, "redact");
    assert.equal(redacted.operation.kind, "redact");
    assert.equal(redacted.operation.log.redaction, true);
    assert.ok(redacted.operation.log.originalSha256);
    const store = await matters.store(m.id);
    assert.ok(store.evidence.operations().length >= 5);
    assert.ok(store.listSources().length >= 5);
    assert.equal(store.verifyChain().ok, true);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows may hold a file for a moment.
    }
  }
});
