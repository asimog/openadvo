/**
 * Document intelligence: text with page and line anchors, and OCR of pages without text.
 * Plain library: no Electron import, no Pi import (decision 6). It computes; the matter store writes.
 * Spec: docs/specs/v0-document-intelligence.md.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MEDIA, docxParagraphs, paginate, textLines } from "./formats.ts";

const nodeRequire = createRequire(import.meta.url);

export interface LineBox {
  /** 1-based line number on the page, top to bottom. */
  line: number;
  /** Box in PDF points; origin at the page's bottom left. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export type TextKind = "born_digital" | "ocr" | "none";

export interface PageText {
  page: number;
  width: number;
  height: number;
  kind: TextKind;
  text: string;
  lines: LineBox[];
  /** Present when kind is "ocr". */
  ocr?: { engine: string; version: string; confidence: number };
}

/** A page with fewer printable characters than this is treated as having no text layer. */
export const MIN_TEXT_CHARS = 20;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const lib = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJs;
    lib.GlobalWorkerOptions.workerSrc = pathToFileURL(nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).toString();
    return lib;
  })();
  return pdfjsPromise;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Group text items into lines by their baseline, top to bottom, left to right. */
export function groupLines(items: TextItem[]): LineBox[] {
  const rows: Array<{ y: number; h: number; items: TextItem[] }> = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5];
    const h = Math.max(item.height, Math.abs(item.transform[3]) || 0, 1);
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, Math.min(r.h, h) * 0.5));
    if (row) {
      row.items.push(item);
      row.h = Math.max(row.h, h);
    } else rows.push({ y, h, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row, i) => {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    let lastEnd: number | null = null;
    for (const it of row.items) {
      const x = it.transform[4];
      if (lastEnd !== null && x - lastEnd > row.h * 0.15 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
      text += it.str;
      lastEnd = x + it.width;
    }
    const xs = row.items.map((it) => it.transform[4]);
    const ends = row.items.map((it) => it.transform[4] + it.width);
    const x = Math.min(...xs);
    return { line: i + 1, x, y: row.y, w: Math.max(...ends) - x, h: row.h, text: text.replace(/\s+/g, " ").trim() };
  });
}

function printable(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** Read the text layer of every page. Pages with too little text are returned with kind "none". */
export async function extractText(bytes: Uint8Array): Promise<PageText[]> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = groupLines(content.items as TextItem[]);
      const text = lines.map((l) => l.text).join("\n");
      pages.push({
        page: n,
        width: viewport.width,
        height: viewport.height,
        kind: printable(text) >= MIN_TEXT_CHARS ? "born_digital" : "none",
        text: printable(text) >= MIN_TEXT_CHARS ? text : "",
        lines: printable(text) >= MIN_TEXT_CHARS ? lines : [],
      });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Render one page to PNG for OCR (pdfjs with @napi-rs/canvas in Node). */
export async function renderPagePng(bytes: Uint8Array, pageNumber: number, scale = 2.5): Promise<Buffer> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const { createCanvas } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await task.destroy();
  }
}

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let ocrWorker: Promise<TesseractWorker> | null = null;

export const OCR_ENGINE = "tesseract.js";

export function ocrVersion(): string {
  return (nodeRequire("tesseract.js/package.json") as { version: string }).version;
}

async function worker(): Promise<TesseractWorker> {
  ocrWorker ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    // English data from the @tesseract.js-data/eng package: nothing is downloaded at run time.
    const langPath = path.join(path.dirname(nodeRequire.resolve("@tesseract.js-data/eng/package.json")), "4.0.0");
    return createWorker("eng", 1, { langPath, cacheMethod: "none", gzip: true });
  })();
  return ocrWorker;
}

/**
 * OCR one rendered page. Line boxes are converted to PDF points (origin bottom left)
 * so OCR anchors and born-digital anchors use one coordinate system.
 */
export async function ocrPage(png: Buffer, pageWidth: number, pageHeight: number, scale = 2.5): Promise<{ text: string; confidence: number; lines: LineBox[] }> {
  const w = await worker();
  const result = await w.recognize(png, {}, { text: true, blocks: true });
  const lines: LineBox[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const l of para.lines ?? []) {
        const text = l.text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const b = l.bbox;
        lines.push({
          line: lines.length + 1,
          x: b.x0 / scale,
          y: pageHeight - b.y1 / scale,
          w: (b.x1 - b.x0) / scale,
          h: (b.y1 - b.y0) / scale,
          text,
        });
      }
    }
  }
  void pageWidth;
  return { text: lines.map((l) => l.text).join("\n"), confidence: result.data.confidence, lines };
}

/** Stop the OCR worker (application shutdown, tests). */
export async function stopOcr(): Promise<void> {
  if (!ocrWorker) return;
  const w = await ocrWorker;
  ocrWorker = null;
  await w.terminate();
}

/**
 * Process one PDF: text layer first, then OCR for every page without text.
 * `onPage` receives each finished page, so results can be stored as they arrive.
 */
export async function processPdf(bytes: Uint8Array, onPage?: (page: PageText) => Promise<void> | void): Promise<PageText[]> {
  const pages = await extractText(bytes);
  for (const page of pages) {
    if (page.kind === "none") {
      const png = await renderPagePng(bytes, page.page);
      const ocr = await ocrPage(png, page.width, page.height);
      if (printable(ocr.text) > 0) {
        page.kind = "ocr";
        page.text = ocr.text;
        page.lines = ocr.lines;
        page.ocr = { engine: OCR_ENGINE, version: ocrVersion(), confidence: ocr.confidence };
      }
    }
    await onPage?.(page);
  }
  return pages;
}

/** Read an image (PNG or JPEG) by OCR as one page (V2-1). Its size in pixels is its page size. */
export async function processImage(bytes: Uint8Array, onPage?: (page: PageText) => Promise<void> | void): Promise<PageText[]> {
  const { loadImage } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
  const img = await loadImage(Buffer.from(bytes));
  const ocr = await ocrPage(Buffer.from(bytes), img.width, img.height, 1);
  const found = printable(ocr.text) > 0;
  const page: PageText = {
    page: 1,
    width: img.width,
    height: img.height,
    kind: found ? "ocr" : "none",
    text: found ? ocr.text : "",
    lines: found ? ocr.lines : [],
    ...(found ? { ocr: { engine: OCR_ENGINE, version: ocrVersion(), confidence: ocr.confidence } } : {}),
  };
  await onPage?.(page);
  return [page];
}

/** Process one source by its media type (V2-1). */
export async function processSource(bytes: Uint8Array, mediaType: string, onPage?: (page: PageText) => Promise<void> | void): Promise<PageText[]> {
  if (mediaType === MEDIA.pdf) return processPdf(bytes, onPage);
  if (mediaType === MEDIA.png || mediaType === MEDIA.jpeg) return processImage(bytes, onPage);
  if (mediaType === MEDIA.docx || mediaType === MEDIA.text) {
    const lines = mediaType === MEDIA.docx ? docxParagraphs(bytes) : textLines(bytes);
    const pages: PageText[] = paginate(lines).map((p) => ({ ...p, kind: "born_digital" as const }));
    for (const p of pages) await onPage?.(p);
    return pages;
  }
  throw new Error(`not supported: ${mediaType}`);
}
