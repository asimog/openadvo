/**
 * H13: document operations on the stored PDFs. Every operation writes a new source; the original
 * is never changed. A redaction records the original hash, the page and the area in the operation
 * log. The annexure manager is in the filing work. Main-process code only.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import type { Matters } from "./matters.ts";
import type { DocumentOperation } from "../shared/evidence.ts";

export interface DocumentOpResult {
  operation: DocumentOperation;
  sources: Array<{ id: string; name: string }>;
}

async function bytesOf(matters: Matters, matterId: string, sourceId: string): Promise<{ bytes: Uint8Array; name: string; sha256: string }> {
  const store = await matters.store(matterId);
  const source = store.getSource(sourceId);
  if (!source) throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
  return { bytes: new Uint8Array(await readFile(store.blobPath(source.sha256))), name: source.name, sha256: source.sha256 };
}

async function addOutput(matters: Matters, matterId: string, name: string, bytes: Uint8Array): Promise<{ id: string; name: string }> {
  const dir = path.join(tmpdir(), "openadvo-docops", randomUUID());
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name.replace(/[\\/:*?"<>|]/g, "_"));
  await writeFile(file, bytes);
  try {
    const [result] = await matters.addFiles(matterId, [file], { actor: "advocate" });
    if (!result?.source) throw new Error(result?.reason ?? result?.outcome ?? "the output was refused");
    return { id: result.source.id, name: result.source.name };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const pageName = (name: string, suffix: string) => `${name.replace(/\.pdf$/i, "")} ${suffix}.pdf`;

export async function extractPages(matters: Matters, matterId: string, sourceId: string, pages: number[]): Promise<DocumentOpResult> {
  const source = await bytesOf(matters, matterId, sourceId);
  const src = await PDFDocument.load(source.bytes);
  const out = await PDFDocument.create();
  const valid = [...new Set(pages.map((p) => Math.floor(p)).filter((p) => p >= 1 && p <= src.getPageCount()))].sort((a, b) => a - b);
  if (valid.length === 0) throw new Error("PAGES_REQUIRED: give at least one page that the document has");
  const copied = await out.copyPages(src, valid.map((p) => p - 1));
  for (const p of copied) out.addPage(p);
  const bytes = await out.save();
  const added = await addOutput(matters, matterId, pageName(source.name, `pages ${valid.join(",")}`), bytes);
  const store = await matters.store(matterId);
  const operation = store.evidence.addOperation({ kind: "extract", inputs: [{ sourceId, pages: valid }], outputSourceId: added.id, log: { originalSha256: source.sha256, pages: valid } });
  return { operation, sources: [added] };
}

export async function splitDocument(matters: Matters, matterId: string, sourceId: string, ranges: number[][]): Promise<DocumentOpResult> {
  const source = await bytesOf(matters, matterId, sourceId);
  const src = await PDFDocument.load(source.bytes);
  const clean = ranges.map((r) => r.map((p) => Math.floor(p)).filter((p) => p >= 1 && p <= src.getPageCount())).filter((r) => r.length > 0);
  if (clean.length === 0) throw new Error("RANGES_REQUIRED: give at least one page range");
  const outputs: Array<{ id: string; name: string }> = [];
  for (const [i, range] of clean.entries()) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, [...new Set(range)].sort((a, b) => a - b).map((p) => p - 1));
    for (const p of copied) out.addPage(p);
    outputs.push(await addOutput(matters, matterId, pageName(source.name, `part ${i + 1}`), await out.save()));
  }
  const store = await matters.store(matterId);
  const operation = store.evidence.addOperation({ kind: "split", inputs: [{ sourceId, pages: clean.flat() }], outputSourceId: outputs[0]?.id ?? null, log: { originalSha256: source.sha256, ranges: clean, outputs: outputs.map((o) => o.id) } });
  return { operation, sources: outputs };
}

export async function mergeDocuments(matters: Matters, matterId: string, sourceIds: string[]): Promise<DocumentOpResult> {
  if (sourceIds.length < 2) throw new Error("SOURCES_REQUIRED: merging needs at least two documents");
  const out = await PDFDocument.create();
  const inputs: Array<{ sourceId: string; pages?: number[] }> = [];
  const names: string[] = [];
  for (const sourceId of sourceIds) {
    const source = await bytesOf(matters, matterId, sourceId);
    const src = await PDFDocument.load(source.bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
    inputs.push({ sourceId });
    names.push(source.name);
  }
  const added = await addOutput(matters, matterId, pageName(names[0], "merged"), await out.save());
  const store = await matters.store(matterId);
  const operation = store.evidence.addOperation({ kind: "merge", inputs, outputSourceId: added.id, log: { order: names } });
  return { operation, sources: [added] };
}

export async function reorderDocument(matters: Matters, matterId: string, sourceId: string, order: number[]): Promise<DocumentOpResult> {
  const source = await bytesOf(matters, matterId, sourceId);
  const src = await PDFDocument.load(source.bytes);
  const valid = order.map((p) => Math.floor(p)).filter((p) => p >= 1 && p <= src.getPageCount());
  if (valid.length !== src.getPageCount() || new Set(valid).size !== valid.length) throw new Error("ORDER_REQUIRED: give every page once");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, valid.map((p) => p - 1));
  for (const p of copied) out.addPage(p);
  const added = await addOutput(matters, matterId, pageName(source.name, "reordered"), await out.save());
  const store = await matters.store(matterId);
  const operation = store.evidence.addOperation({ kind: "reorder", inputs: [{ sourceId, pages: valid }], outputSourceId: added.id, log: { order: valid, originalSha256: source.sha256 } });
  return { operation, sources: [added] };
}

export interface MarkArea {
  page: number;
  /** Fractions of the page, from the top-left, as the reader sees it. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function markDocument(matters: Matters, matterId: string, sourceId: string, area: MarkArea, kind: "highlight" | "annotate" | "redact"): Promise<DocumentOpResult> {
  const source = await bytesOf(matters, matterId, sourceId);
  const src = await PDFDocument.load(source.bytes);
  const page = src.getPage(Math.floor(area.page) - 1);
  if (!page) throw new Error(`PAGE_NOT_FOUND: ${area.page}`);
  const { width, height } = page.getSize();
  const x = Math.max(0, Math.min(1, area.x)) * width;
  const y = Math.max(0, Math.min(1, area.y)) * height;
  const w = Math.max(0, Math.min(1, area.w)) * width;
  const h = Math.max(0, Math.min(1, area.h)) * height;
  // The reader's y is from the top; PDF y is from the bottom.
  const rect = { x, y: height - y - h, width: w, height: h };
  if (kind === "highlight") page.drawRectangle({ ...rect, color: rgb(1, 0.9, 0.2), opacity: 0.35 });
  else if (kind === "annotate") page.drawRectangle({ ...rect, borderColor: rgb(0.2, 0.4, 0.9), borderWidth: 1.5 });
  else page.drawRectangle({ ...rect, color: rgb(0, 0, 0), opacity: 1 });
  const added = await addOutput(matters, matterId, pageName(source.name, kind), await src.save());
  const store = await matters.store(matterId);
  const operation = store.evidence.addOperation({
    kind,
    inputs: [{ sourceId, pages: [area.page] }],
    outputSourceId: added.id,
    log: { originalSha256: source.sha256, page: area.page, area, rect, kind, redaction: kind === "redact" },
  });
  return { operation, sources: [added] };
}
