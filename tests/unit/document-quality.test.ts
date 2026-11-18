/**
 * Phase 11 (H14): the page metrics and the document quality score. The score reports; it never
 * changes a page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { documentQuality, pageNumber, pageQuality } from "../../src/lib/document-intelligence/quality.ts";

function page(n: number, text: string, over: Partial<{ kind: "born_digital" | "ocr" | "none"; confidence: number; blur: number; skew: number }> = {}) {
  return { page: n, text, kind: over.kind ?? "born_digital", confidence: over.confidence ?? null, quality: over.blur != null || over.skew != null ? { blur: over.blur ?? 90, skew: over.skew ?? 0 } : null };
}

test("H14: a clean document scores 100 and the page numbers are read", () => {
  const q = documentQuality({ sourceId: "s", pages: [page(1, "Page 1 of 3\nTHE COURT\nA long and clean page of text that says enough."), page(2, "Page 2 of 3\nA second clean page of text that says enough."), page(3, "Page 3 of 3\nA third clean page of text that says enough.")] });
  assert.equal(q.score, 100);
  assert.deepEqual(q.issues, []);
  assert.equal(q.expectedPages, 3);
  assert.equal(pageNumber("9\nsomething")?.number, 9);
  assert.equal(pageNumber("Page 4 of 12")?.total, 12);
  assert.equal(pageNumber("no number here"), null);
});

test("H14: a blank page, a short page, a duplicate and a low confidence each cost their points", () => {
  const text = "A page long enough to be compared with another page of the document, with many words in it, and enough of them to pass the duplicate length, so the second copy is found.";
  const q = documentQuality({
    sourceId: "s",
    pages: [page(1, "short", { kind: "ocr", confidence: 42, blur: 20, skew: 4 }), page(2, text), page(3, text), page(4, "", { kind: "none" })],
  });
  const kinds = q.issues.map((i) => i.kind);
  for (const k of ["short_page", "low_confidence", "blur", "skew", "duplicate_page", "blank_page"]) assert.ok(kinds.includes(k as never), k);
  assert.ok(q.score < 70);
  assert.equal(q.imageMetrics, true);
});

test("H14: missing page numbers and a short read are found", () => {
  const q = documentQuality({
    sourceId: "s",
    pages: [page(1, "Page 1 of 6\nA long page of text for the quality check, with enough words to pass."), page(2, "Page 2 of 6\nAnother long page of text for the quality check, with enough words."), page(4, "Page 4 of 6\nA third long page of text for the quality check, with enough words.")],
  });
  assert.ok(q.issues.some((i) => i.kind === "missing_page" && /3/.test(i.detail)));
  assert.ok(q.issues.some((i) => i.kind === "short_document" && /6 pages/.test(i.detail)));
});

test("H14: the image metrics of a sharp page and a flat page are different", async () => {
  const sharp = createCanvas(420, 560);
  const sc = sharp.getContext("2d");
  sc.fillStyle = "#fff";
  sc.fillRect(0, 0, 420, 560);
  sc.fillStyle = "#000";
  for (let y = 40; y < 520; y += 18) sc.fillRect(30, y, 340, 2);
  const sharpQ = await pageQuality(sharp.toBuffer("image/png"));
  const flat = createCanvas(420, 560);
  const fc = flat.getContext("2d");
  fc.fillStyle = "#fff";
  fc.fillRect(0, 0, 420, 560);
  const flatQ = await pageQuality(flat.toBuffer("image/png"));
  assert.ok(sharpQ.blur > flatQ.blur, `${sharpQ.blur} > ${flatQ.blur}`);
  assert.ok(Math.abs(sharpQ.skew) <= 1.5, `straight lines: ${sharpQ.skew}`);

  const tilted = createCanvas(420, 560);
  const tc = tilted.getContext("2d");
  tc.fillStyle = "#fff";
  tc.fillRect(0, 0, 420, 560);
  tc.translate(210, 280);
  tc.rotate((3 * Math.PI) / 180);
  tc.fillStyle = "#000";
  for (let y = -240; y < 240; y += 18) tc.fillRect(-170, y, 340, 2);
  const tiltedQ = await pageQuality(tilted.toBuffer("image/png"));
  assert.ok(Math.abs(tiltedQ.skew) > 1.5, `tilted lines: ${tiltedQ.skew}`);
});
