/** V5-6 to V5-8: entities, corrections, date anchors, the second OCR engine and disputes. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { caseNumberConflicts, extractEntities, lineEntities } from "../../src/lib/notebook/entities.ts";
import { compareReadings, criticalTokens, ctcDecode, groupLines, ppocrAvailable, readPage, regions, setPpocrDir } from "../../src/lib/document-intelligence/ppocr.ts";
import { extractRelative } from "../../src/lib/notebook/index.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { stopOcr } from "../../src/lib/document-intelligence/index.ts";

after(() => stopOcr());
const adv = { actor: "advocate" as const };
const L = (text: string, line = 1) => ({ anchorId: `a:${line}`, sourceId: "s", page: 1, line, text });

test("entities: statutes, case numbers, amounts, citations and parties, each with its anchor", () => {
  const v = (text: string) => lineEntities(L(text)).map((e) => `${e.kind}:${e.value}`);
  assert.deepEqual(v("convicted under Sections 302 and 34 of the Indian Penal Code"), ["statute:s. 302 IPC", "statute:s. 34 IPC"]);
  assert.deepEqual(v("bail u/s 483 BNSS was refused"), ["statute:s. 483 BNSS"]);
  assert.deepEqual(v("petition under Article 136 of the Constitution of India"), ["statute:Art. 136 Constitution"]);
  assert.deepEqual(v("in Crl. M.C. No. 1234 of 2023 the court"), ["case_number:CRL. M.C. 1234/2023"]);
  assert.deepEqual(v("a fine of Rs. 10,000/- and Rs 2 lakh"), ["amount:10000", "amount:200000"]);
  assert.deepEqual(v("relying on 2023 INSC 1043 and (2014) 8 SCC 273 and AIR 1978 SC 597"), ["citation:2023 INSC 1043", "citation:(2014) 8 SCC 273", "citation:AIR 1978 SC 597"]);
  assert.deepEqual(v("Ram Kumar v. State of Delhi"), ["party:RAM KUMAR", "party:STATE OF DELHI"]);
  const all = extractEntities([L("in Crl. M.C. No. 1234 of 2023", 1), L("Crl. M.C. No. 1234 of 2022 was filed", 2)]);
  assert.deepEqual(caseNumberConflicts(all), [{ key: "CRL. M.C. 1234", values: ["CRL. M.C. 1234/2023", "CRL. M.C. 1234/2022"], anchors: ["a:1", "a:2"] }]);
});

test("relative dates: a file without a date asks once; the advocate's base date dates the phrase", () => {
  const lines = [{ ...L("He was produced before the Magistrate the next day.", 1), reading: "text_layer" as const }];
  const missing: string[] = [];
  assert.equal(extractRelative(lines, new Set(), null, (_l, p) => missing.push(p)).length, 0);
  assert.deepEqual(missing, ["the next day"]);
  const ev = extractRelative(lines, new Set(), "2024-03-12");
  assert.equal(ev[0].dateStart, "2024-03-13");
  assert.match(ev[0].dateText, /base date given by the advocate/);
});

test("the second engine: CTC decoding, regions, line grouping and the critical-token comparison", () => {
  const chars = ["", "a", "b", "1"];
  // steps: a a blank b 1 1  -> "ab1"
  const s = new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(ctcDecode(s, 6, 4, chars).text, "ab1");
  const prob = new Float32Array(20 * 10);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 12; x++) prob[y * 20 + x] = 0.9;
  const r = regions(prob, 20, 10);
  assert.equal(r.length, 1);
  assert.ok(r[0].w > 10 && r[0].h > 4, "the box is unclipped");
  assert.equal(groupLines([{ x: 50, y: 10, w: 20, h: 10 }, { x: 0, y: 11, w: 30, h: 10 }, { x: 0, y: 40, w: 30, h: 10 }]).map((l) => l.length).join(","), "2,1");
  assert.deepEqual(criticalTokens("Order dated 12.03.2024, Rs. 10,000 under s. 302."), ["12.03.2024", "10,000", "302"]);
  const a = [{ line: 1, x: 10, y: 100, w: 200, h: 12, text: "dated 12.03.2024" }, { line: 2, x: 10, y: 80, w: 200, h: 12, text: "no numbers here" }];
  const b = [{ line: 1, x: 10, y: 101, w: 200, h: 12, text: "dated 12.08.2024" }, { line: 2, x: 10, y: 80, w: 200, h: 12, text: "no numbers hcre" }];
  assert.deepEqual(compareReadings(a, b), [{ line: 1, readingA: "dated 12.03.2024", readingB: "dated 12.08.2024", tokensA: ["12.03.2024"], tokensB: ["12.08.2024"] }]);
});

test("the second engine reads a rendered page (when its models are vendored)", { skip: (setPpocrDir(path.resolve("resources/models/ppocr")), !ppocrAvailable()) }, async () => {
  const c = createCanvas(1200, 200);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1200, 200);
  ctx.fillStyle = "#000";
  ctx.font = "40px serif";
  ctx.fillText("Order dated 12.03.2024 under Section 302", 40, 110);
  const out = await readPage(c.toBuffer("image/png"), 80);
  assert.equal(out.lines.length, 1);
  assert.deepEqual(criticalTokens(out.lines[0].text), ["12.03.2024", "302"]);
});

test("the store: a dispute blocks confirming its event until the advocate decides; corrections keep the original", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-v5b-"));
  const store = await MatterStore.create(path.join(root, "m"), "Disputes", adv);
  try {
    const f = path.join(root, "scan.txt");
    await writeFile(f, "x");
    const src = (await store.addFile(f, adv)).source!;
    store.startJob(src.id);
    store.recordPage(src.id, {
      page: 1, width: 595, height: 842, kind: "ocr", text: "Order dated 12.03.2024",
      lines: [{ line: 1, x: 50, y: 700, w: 300, h: 14, text: "Order dated 12.03.2024" }],
      ocr: { engine: "tesseract.js", version: "7", confidence: 90 },
      second: { engine: "pp-ocrv3-onnx", version: "PP-OCRv3 en", confidence: 88, text: "Order dated 12.08.2024", disagreements: [{ line: 1, readingA: "Order dated 12.03.2024", readingB: "Order dated 12.08.2024", tokensA: ["12.03.2024"], tokensB: ["12.08.2024"] }] },
    });
    store.finishJob(src.id, 1);
    const d = store.disputes()[0];
    assert.equal(d.status, "open");
    assert.ok(store.listReviewItems().some((r) => r.kind === "ocr_dispute" && r.id === d.reviewItemId));
    store.recordEvents(src.id, [{ id: `ev:${d.anchorId}:1`, sourceId: src.id, anchorId: d.anchorId, page: 1, line: 1, dateText: "12.03.2024", dateStart: "2024-03-12", dateEnd: "2024-03-12", dateType: "explicit", description: "Order dated 12.03.2024", kind: "procedural", reading: "ocr", method: "rules-v3" }], "rules-v3");
    assert.equal(store.listNotebookEvents()[0].disputed, "open");
    assert.throws(() => store.decideEvent(`ev:${d.anchorId}:1`, "confirmed", adv), /OCR_DISPUTED/);
    assert.throws(() => store.decideDispute(d.id, "b", "", { actor: "agent" }), /HUMAN_ONLY/);
    store.decideDispute(d.id, "b", "", adv);
    assert.equal(store.listNotebookEvents()[0].disputed, "replaced");
    store.decideEvent(`ev:${d.anchorId}:1`, "confirmed", adv);
    store.correctEvent(`ev:${d.anchorId}:1`, { dateStart: "2024-08-12", description: "Order dated 12.08.2024" }, "The second reading matches the certified copy.", adv);
    const e = store.listNotebookEvents()[0];
    assert.equal(e.dateStart, "2024-08-12");
    assert.equal(e.dateText, "12.08.2024");
    assert.equal(e.corrected?.original.dateStart, "2024-03-12");
    assert.throws(() => store.correctEvent(e.id, { dateStart: "12/08/2024", description: "x" }, "r", adv), /BAD_DATE/);
    assert.equal(store.askDateAnchor(src.id, "needs a date"), true);
    assert.equal(store.askDateAnchor(src.id, "needs a date"), false, "asked once per file");
    store.setDateAnchor(src.id, "2024-01-01", adv);
    assert.equal(store.dateAnchor(src.id), "2024-01-01");
    assert.ok(store.listReviewItems().filter((r) => r.kind === "date_anchor").every((r) => r.status === "resolved"));
    assert.equal(store.verifyChain().ok, true);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
});
