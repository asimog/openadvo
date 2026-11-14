/**
 * V5-8: vendor the second OCR engine's models: PP-OCRv3 English detection and recognition
 * (ONNX, from the RapidOCR model repository at a pinned revision) and the English character
 * dictionary from PaddleOCR. Every file is checked against its pinned SHA-256 and listed in
 * resources/models/ppocr/vendor.lock.json. Licence as recorded at the source: Apache-2.0.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PPOCR_FILES, ppocrDir } from "../src/lib/document-intelligence/ppocr.ts";

const repo = path.resolve(import.meta.dirname, "..");
const dir = ppocrDir(path.join(repo, "resources"));
mkdirSync(dir, { recursive: true });
const lock: Record<string, string> = {};
for (const f of PPOCR_FILES) {
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`vendor-ocr: ${f.url} answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== f.sha256) throw new Error(`vendor-ocr: ${f.name} has SHA-256 ${sha}, expected ${f.sha256}`);
  writeFileSync(path.join(dir, f.name), bytes);
  lock[f.name] = sha;
  console.log(`vendor-ocr: ${f.name} ${bytes.length} bytes`);
}
writeFileSync(path.join(dir, "vendor.lock.json"), JSON.stringify({ engine: "PP-OCRv3 (ONNX)", licence: "Apache-2.0", fetchedAt: new Date().toISOString(), files: lock }, null, 2));
