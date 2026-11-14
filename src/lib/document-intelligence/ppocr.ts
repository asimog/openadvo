/**
 * V5-8: the second OCR engine. PP-OCRv3 (English) through ONNX Runtime: a text detector finds
 * text regions, a recogniser reads each, and a CTC decoder turns scores into characters. It is
 * an independent engine from Tesseract (different models, different method), so where the two
 * disagree on a critical token the line is a dispute. Plain library. Spec: docs/specs/v5.md.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LineBox } from "./index.ts";

const REV = "1cfba2e90fc938db55889873735088de210cc173";
export const PPOCR_ENGINE = "pp-ocrv3-onnx";
export const PPOCR_FILES = [
  { name: "det.onnx", url: `https://huggingface.co/SWHL/RapidOCR/resolve/${REV}/PP-OCRv4/en_PP-OCRv3_det_infer.onnx`, sha256: "f139598bc2af4e4b6fe98dec11574e30edfdd91fc94ac1425c18ace3bd5a866b" },
  { name: "rec.onnx", url: `https://huggingface.co/SWHL/RapidOCR/resolve/${REV}/PP-OCRv3/en_PP-OCRv3_rec_infer.onnx`, sha256: "ef7abd8bd3629ae57ea2c28b425c1bd258a871b93fd2fe7c433946ade9b5d9ea" },
  { name: "en_dict.txt", url: "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/en_dict.txt", sha256: "5662df9d2d03f0e8ca0d3b0649d6acbab904b6a14b3d3521463c71c37c668ce3" },
];

export function ppocrDir(resourcesRoot: string): string {
  return path.join(resourcesRoot, "models", "ppocr");
}

let modelDir: string | null = null;

/** Set where the models are (the application calls this at start). */
export function setPpocrDir(dir: string): void {
  modelDir = dir;
}

export function ppocrAvailable(): boolean {
  return !!modelDir && PPOCR_FILES.every((f) => existsSync(path.join(modelDir!, f.name)));
}

type Ort = typeof import("onnxruntime-node");
interface Engine {
  ort: Ort;
  det: import("onnxruntime-node").InferenceSession;
  rec: import("onnxruntime-node").InferenceSession;
  chars: string[];
}
let engine: Promise<Engine> | null = null;

async function load(): Promise<Engine> {
  engine ??= (async () => {
    if (!ppocrAvailable()) throw new Error("PPOCR_NOT_INSTALLED: run npm run vendor:ocr");
    const ort = (await import("onnxruntime-node")) as Ort;
    const det = await ort.InferenceSession.create(path.join(modelDir!, "det.onnx"));
    const rec = await ort.InferenceSession.create(path.join(modelDir!, "rec.onnx"));
    const dict = readFileSync(path.join(modelDir!, "en_dict.txt"), "utf8").split(/\r?\n/).filter((c) => c.length > 0);
    // Index 0 is the CTC blank; the dictionary follows; the model adds a space at the end.
    return { ort, det, rec, chars: ["", ...dict, " "] };
  })();
  return engine;
}

interface Img {
  width: number;
  height: number;
  /** RGBA bytes. */
  data: Uint8ClampedArray;
}

async function decode(png: Buffer): Promise<Img> {
  const { createCanvas, loadImage } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, data: d.data };
}

/** Bilinear-free nearest resize of a region into a float tensor (BGR, normalised). */
function tensorOf(img: Img, x0: number, y0: number, w: number, h: number, outW: number, outH: number, mean: number[], std: number[]): Float32Array {
  const t = new Float32Array(3 * outW * outH);
  const plane = outW * outH;
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(img.height - 1, Math.max(0, Math.floor(y0 + ((y + 0.5) * h) / outH)));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, Math.floor(x0 + ((x + 0.5) * w) / outW)));
      const i = (sy * img.width + sx) * 4;
      const o = y * outW + x;
      // BGR order, as the models were trained.
      t[o] = (img.data[i + 2] / 255 - mean[0]) / std[0];
      t[plane + o] = (img.data[i + 1] / 255 - mean[1]) / std[1];
      t[2 * plane + o] = (img.data[i] / 255 - mean[2]) / std[2];
    }
  }
  return t;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Text regions: threshold the probability map and take connected components, then unclip. */
export function regions(prob: Float32Array, mw: number, mh: number, thresh = 0.3, boxThresh = 0.5): Region[] {
  const seen = new Uint8Array(mw * mh);
  const out: Region[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mw * mh; start++) {
    if (seen[start] || prob[start] < thresh) continue;
    let minX = mw, minY = mh, maxX = 0, maxY = 0, n = 0, sum = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % mw;
      const y = (p - x) / mw;
      n++;
      sum += prob[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - mw, p + mw]) {
        if (q < 0 || q >= mw * mh || seen[q] || prob[q] < thresh) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === mw - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w < 3 || h < 3 || sum / n < boxThresh) continue;
    // Unclip: grow the box by area * 1.6 / perimeter, as PP-OCR's post-processing does.
    const d = (w * h * 1.6) / (2 * (w + h));
    out.push({ x: Math.max(0, minX - d), y: Math.max(0, minY - d), w: Math.min(mw, w + 2 * d), h: Math.min(mh, h + 2 * d) });
  }
  return out;
}

/** Group regions into lines: regions that share most of their height are one line, left to right. */
export function groupLines(rs: Region[]): Region[][] {
  const sorted = [...rs].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lines: Region[][] = [];
  for (const r of sorted) {
    const line = lines.find((l) => {
      const top = Math.min(...l.map((x) => x.y));
      const bottom = Math.max(...l.map((x) => x.y + x.h));
      const overlap = Math.min(bottom, r.y + r.h) - Math.max(top, r.y);
      return overlap > 0.5 * Math.min(r.h, bottom - top);
    });
    if (line) line.push(r);
    else lines.push([r]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a[0].y - b[0].y);
}

/** Greedy CTC decoding: the best class per step, repeats and blanks removed. */
export function ctcDecode(scores: Float32Array, steps: number, classes: number, chars: string[]): { text: string; confidence: number } {
  let text = "";
  let prev = -1;
  let confSum = 0;
  let confN = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestV = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = scores[t * classes + c];
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    if (best !== 0 && best !== prev) {
      text += chars[best] ?? "";
      confSum += bestV;
      confN++;
    }
    prev = best;
  }
  return { text, confidence: confN ? confSum / confN : 0 };
}

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_H = 48;

/**
 * Read one page image (PNG) with the second engine. Line boxes are returned in PDF points
 * (origin bottom left) like Tesseract's, so the two readings can be matched line by line.
 */
export async function readPage(png: Buffer, pageHeight: number, scale = 2.5): Promise<{ lines: LineBox[]; confidence: number }> {
  const e = await load();
  const img = await decode(png);
  const ratio = Math.min(1, 960 / Math.max(img.width, img.height));
  const mw = Math.max(32, Math.round((img.width * ratio) / 32) * 32);
  const mh = Math.max(32, Math.round((img.height * ratio) / 32) * 32);
  const detIn = new e.ort.Tensor("float32", tensorOf(img, 0, 0, img.width, img.height, mw, mh, DET_MEAN, DET_STD), [1, 3, mh, mw]);
  const detOut = await e.det.run({ [e.det.inputNames[0]]: detIn });
  const prob = detOut[e.det.outputNames[0]].data as Float32Array;
  const sx = img.width / mw;
  const sy = img.height / mh;
  const found = regions(prob, mw, mh).map((r) => ({ x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }));
  const lines: LineBox[] = [];
  let confSum = 0;
  for (const line of groupLines(found)) {
    const parts: string[] = [];
    let lineConf = 0;
    for (const r of line) {
      const outW = Math.max(16, Math.min(2400, Math.round((REC_H * r.w) / Math.max(1, r.h))));
      const recIn = new e.ort.Tensor("float32", tensorOf(img, r.x, r.y, r.w, r.h, outW, REC_H, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), [1, 3, REC_H, outW]);
      const out = (await e.rec.run({ [e.rec.inputNames[0]]: recIn }))[e.rec.outputNames[0]];
      const [, steps, classes] = out.dims as number[];
      const d = ctcDecode(out.data as Float32Array, steps, classes, e.chars);
      if (d.text.trim()) parts.push(d.text.trim());
      lineConf += d.confidence;
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const x = Math.min(...line.map((r) => r.x));
    const top = Math.min(...line.map((r) => r.y));
    const right = Math.max(...line.map((r) => r.x + r.w));
    const bottom = Math.max(...line.map((r) => r.y + r.h));
    lines.push({ line: lines.length + 1, x: x / scale, y: pageHeight - bottom / scale, w: (right - x) / scale, h: (bottom - top) / scale, text });
    confSum += lineConf / line.length;
  }
  return { lines, confidence: lines.length ? (confSum / lines.length) * 100 : 0 };
}

// ---- Agreement on critical tokens ----

/** Tokens a misreading must not change: anything with a digit (dates, amounts, numbers, sections, citations). */
export function criticalTokens(text: string): string[] {
  return (text.match(/[A-Za-z]*\d[\w.,/-]*/g) ?? []).map((t) => t.toLowerCase().replace(/[.,/-]+$/, "")).filter(Boolean);
}

export interface Disagreement {
  /** The Tesseract line it concerns. */
  line: number;
  readingA: string;
  readingB: string;
  tokensA: string[];
  tokensB: string[];
}

function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/**
 * Match each first-engine line with the second engine's line that overlaps it most in height,
 * and report the lines whose critical tokens differ. A line the second engine did not find is
 * a disagreement when it has critical tokens.
 */
export function compareReadings(a: LineBox[], b: LineBox[]): Disagreement[] {
  const out: Disagreement[] = [];
  for (const la of a) {
    let best: LineBox | null = null;
    let bestOverlap = 0;
    for (const lb of b) {
      const overlap = Math.min(la.y + la.h, lb.y + lb.h) - Math.max(la.y, lb.y);
      const xOverlap = Math.min(la.x + la.w, lb.x + lb.w) - Math.max(la.x, lb.x);
      if (overlap > bestOverlap && xOverlap > 0) {
        bestOverlap = overlap;
        best = lb;
      }
    }
    const ta = criticalTokens(la.text);
    const tb = best && bestOverlap > 0.4 * Math.min(la.h, best.h) ? criticalTokens(best.text) : null;
    if (ta.length === 0 && (!tb || tb.length === 0)) continue;
    if (tb && same(ta, tb)) continue;
    out.push({ line: la.line, readingA: la.text, readingB: best && tb ? best.text : "(not found by the second engine)", tokensA: ta, tokensB: tb ?? [] });
  }
  return out;
}
