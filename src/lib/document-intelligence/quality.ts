/**
 * Phase 11 (H14): the OCR and document quality metrics. The page metrics come from the rendered
 * page: blur from the variance of the Laplacian, skew from the projection profile. The document
 * score comes from the pages, the OCR confidence and the page numbers. It reports; it never
 * changes a page. Plain library (decision 6).
 */
import type { DocumentQuality, PageQuality, QualityIssue } from "../../shared/quality.ts";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Read one rendered page. Blur is 0 to 100 (higher is sharper). Skew is the angle in degrees
 * that best aligns the dark pixels into rows, from -5 to 5. A blank page has no skew.
 */
export async function pageQuality(png: Buffer): Promise<PageQuality> {
  const { createCanvas, loadImage } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
  const img = await loadImage(png);
  const scale = Math.min(1, 480 / Math.max(1, img.width));
  const w = Math.max(32, Math.round(img.width * scale));
  const h = Math.max(32, Math.round(img.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const grey = new Uint8Array(w * h);
  let dark = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grey[p] = g;
    if (g < 160) dark++;
  }

  // Blur: the variance of the 4-neighbour Laplacian. Text has sharp edges and a high variance.
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const lap = 4 * grey[p] - grey[p - 1] - grey[p + 1] - grey[p - w] - grey[p + w];
      sum += lap;
      sum2 += lap * lap;
      n++;
    }
  }
  const variance = n > 0 ? sum2 / n - (sum / n) ** 2 : 0;
  const blur = n > 0 ? clamp(Math.round(100 * (1 - Math.exp(-variance / 400))), 0, 100) : 0;

  // Skew: the angle whose row projection is the most uneven. A blank page has none.
  let skew = 0;
  if (dark >= Math.max(40, grey.length * 0.002)) {
    let best = -1;
    for (let deg = -5; deg <= 5; deg += 0.5) {
      const t = Math.tan((deg * Math.PI) / 180);
      const pad = Math.ceil(Math.abs(t) * w) + 2;
      const bins = new Float64Array(h + 2 * pad);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (grey[y * w + x] < 160) bins[Math.round(y - x * t) + pad]++;
        }
      }
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < bins.length; i++) {
        s1 += bins[i];
        s2 += bins[i] * bins[i];
      }
      const mean = s1 / bins.length;
      const v = s2 / bins.length - mean * mean;
      if (v > best) {
        best = v;
        skew = deg;
      }
    }
  }
  return { blur, skew: Math.round(skew * 10) / 10 };
}

/** The number printed on a page, from its last or first lines, and the total it names. */
export function pageNumber(text: string): { number: number; total: number | null } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates = [...lines.slice(0, 3), ...lines.slice(-3)];
  for (const line of candidates) {
    let m = /^page\s+(\d{1,4})(?:\s+(?:of|\/)\s+(\d{1,4}))?$/i.exec(line);
    if (m) return { number: Number(m[1]), total: m[2] ? Number(m[2]) : null };
    m = /^[-–—]?\s*(\d{1,4})\s*[-–—]?$/.exec(line);
    if (m) return { number: Number(m[1]), total: null };
    m = /^(\d{1,4})\s+(?:of|\/)\s+(\d{1,4})$/i.exec(line);
    if (m) return { number: Number(m[1]), total: Number(m[2]) };
  }
  return null;
}

export interface QualityPage {
  page: number;
  text: string;
  kind: "born_digital" | "ocr" | "none";
  confidence?: number | null;
  quality?: PageQuality | null;
}

/**
 * The document's score and issues. A clean document scores 100. Every issue costs its weight, and
 * the score never hides an issue: each one is listed with its page.
 */
export function documentQuality(input: { sourceId: string; pages: QualityPage[]; expectedPages?: number | null; asOf?: string }): DocumentQuality {
  const issues: QualityIssue[] = [];
  const seen = new Map<string, number>();
  let imageMetrics = false;
  const numbers: number[] = [];
  let total: number | null = null;

  for (const page of [...input.pages].sort((a, b) => a.page - b.page)) {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (page.kind === "none" || text.length === 0) {
      issues.push({ kind: "blank_page", page: page.page, detail: `Page ${page.page} has no text.`, weight: 20 });
      continue;
    }
    if (text.length < 20) issues.push({ kind: "short_page", page: page.page, detail: `Page ${page.page} holds only ${text.length} characters.`, weight: 3 });
    if (page.confidence != null && page.confidence > 0 && page.confidence < 60) {
      issues.push({ kind: "low_confidence", page: page.page, detail: `Page ${page.page} was read with OCR confidence ${Math.round(page.confidence)} of 100.`, weight: 8 });
    }
    if (page.quality) {
      imageMetrics = true;
      if (page.quality.blur < 35) issues.push({ kind: "blur", page: page.page, detail: `Page ${page.page} is blurred (sharpness ${page.quality.blur} of 100).`, weight: 8 });
      if (Math.abs(page.quality.skew) > 1.5) issues.push({ kind: "skew", page: page.page, detail: `Page ${page.page} is skewed by ${page.quality.skew} degrees.`, weight: 5 });
    }
    const key = text.toLowerCase();
    if (key.length >= 120) {
      const first = seen.get(key);
      if (first != null) issues.push({ kind: "duplicate_page", page: page.page, detail: `Page ${page.page} repeats the text of page ${first}.`, weight: 15 });
      else seen.set(key, page.page);
    }
    const pn = pageNumber(page.text);
    if (pn) {
      numbers.push(pn.number);
      if (pn.total) total = Math.max(total ?? 0, pn.total);
    }
  }

  // Missing pages: only when the document numbers most of its pages.
  if (numbers.length >= 2 && numbers.length >= Math.ceil(input.pages.length * 0.4)) {
    const low = Math.min(...numbers);
    const high = Math.max(...numbers, total ?? 0);
    const have = new Set(numbers);
    const missing: number[] = [];
    for (let p = low; p <= high; p++) if (!have.has(p)) missing.push(p);
    if (missing.length > 0 && missing.length <= 30) {
      issues.push({ kind: "missing_page", page: null, detail: `The page numbers skip ${missing.join(", ")}.`, weight: Math.min(45, 15 * missing.length) });
    }
  }

  const expected = input.expectedPages ?? total;
  if (expected && expected > input.pages.length) {
    issues.push({ kind: "short_document", page: null, detail: `The document names ${expected} pages but ${input.pages.length} were read.`, weight: 15 });
  }

  const score = clamp(100 - issues.reduce((s, i) => s + i.weight, 0), 0, 100);
  return { sourceId: input.sourceId, score, issues, pages: input.pages.length, expectedPages: expected ?? null, imageMetrics, asOf: input.asOf ?? new Date().toISOString() };
}
