/** V2-1: files other than PDF. Spec: docs/specs/v2.md. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { createCanvas } from "@napi-rs/canvas";
import { MEDIA, detectMediaType, docxParagraphs, paginate, textLines, LINES_PER_TEXT_PAGE } from "../../src/lib/document-intelligence/formats.ts";
import { processSource, stopOcr } from "../../src/lib/document-intelligence/index.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";

after(() => stopOcr());

async function docx(paras: string[]): Promise<Uint8Array> {
  const doc = new Document({ sections: [{ children: paras.map((t) => new Paragraph({ children: [new TextRun(t)] })) }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

function png(lines: string[]): Uint8Array {
  const canvas = createCanvas(1400, 120 + lines.length * 70);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.font = "44px serif";
  lines.forEach((l, i) => ctx.fillText(l, 60, 90 + i * 70));
  return new Uint8Array(canvas.toBuffer("image/png"));
}

test("the media type comes from the first bytes, and text needs a .txt name", async () => {
  assert.equal(detectMediaType(new TextEncoder().encode("%PDF-1.7\n"), "a.bin"), MEDIA.pdf);
  assert.equal(detectMediaType(await docx(["x"]), "a.docx"), MEDIA.docx);
  assert.equal(detectMediaType(png(["x"]), "a.png"), MEDIA.png);
  assert.equal(detectMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "a.jpg"), MEDIA.jpeg);
  assert.equal(detectMediaType(new TextEncoder().encode("Dated 12.03.2024"), "note.txt"), MEDIA.text);
  assert.equal(detectMediaType(new TextEncoder().encode("Dated 12.03.2024"), "note.csv"), null);
  assert.equal(detectMediaType(new Uint8Array([0x61, 0, 0x62]), "bin.txt"), null);
  assert.equal(detectMediaType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "a.zip"), null);
});

test("a DOCX gives one line per paragraph; text gives one line per line; pages hold 50 lines", async () => {
  assert.deepEqual(docxParagraphs(await docx(["Order dated 12.03.2024", "", "Rights & duties <of> parties"])), ["Order dated 12.03.2024", "Rights & duties <of> parties"]);
  assert.deepEqual(textLines(new TextEncoder().encode("﻿First line\r\n\r\n  second   line  \n")), ["First line", "second line"]);
  const pages = paginate(Array.from({ length: 120 }, (_, i) => `line ${i + 1}`));
  assert.equal(pages.length, 3);
  assert.equal(pages[0].lines.length, LINES_PER_TEXT_PAGE);
  assert.equal(pages[2].lines[0].text, "line 101");
  assert.equal(pages[2].lines[0].line, 1);
});

test("processSource reads DOCX and text as text layer, and an image by OCR", async () => {
  const d = await processSource(await docx(["The appeal was filed on 12.03.2024."]), MEDIA.docx);
  assert.equal(d[0].kind, "born_digital");
  assert.equal(d[0].lines[0].text, "The appeal was filed on 12.03.2024.");
  const t = await processSource(new TextEncoder().encode("Notice issued on 1 April 2024"), MEDIA.text);
  assert.equal(t[0].text, "Notice issued on 1 April 2024");
  const img = await processSource(png(["ORDER OF THE HIGH COURT", "The appeal is dismissed."]), MEDIA.png);
  assert.equal(img.length, 1);
  assert.equal(img[0].kind, "ocr");
  assert.match(img[0].text, /appeal is dismissed/i);
  assert.ok(img[0].ocr && img[0].ocr.engine === "tesseract.js");
});

test("the matter store records the detected media type and still refuses other files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-fmt-"));
  try {
    const store = await MatterStore.create(path.join(root, "m"), "Fmt", { actor: "advocate" });
    const f1 = path.join(root, "brief.docx");
    await writeFile(f1, await docx(["hello"]));
    const f2 = path.join(root, "data.csv");
    await writeFile(f2, "a,b");
    const ok = await store.addFile(f1, { actor: "advocate" });
    const bad = await store.addFile(f2, { actor: "advocate" });
    assert.equal(ok.source?.mediaType, MEDIA.docx);
    assert.equal(bad.outcome, "refused");
    assert.match(bad.reason ?? "", /format not accepted/);
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
