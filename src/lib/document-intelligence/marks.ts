/**
 * H4: signature, stamp and seal marks from a rendered page. Image rules only; a mark is a
 * candidate that the advocate reads, never a legal finding. Plain library.
 */
export interface MarkInput {
  kind: "signature" | "stamp" | "seal" | "handwriting";
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  note: string;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

function box(): Box {
  return { x0: Number.POSITIVE_INFINITY, y0: Number.POSITIVE_INFINITY, x1: 0, y1: 0, n: 0 };
}

function add(b: Box, x: number, y: number): void {
  b.x0 = Math.min(b.x0, x);
  b.y0 = Math.min(b.y0, y);
  b.x1 = Math.max(b.x1, x);
  b.y1 = Math.max(b.y1, y);
  b.n++;
}

function toMark(b: Box, kind: MarkInput["kind"], scale: number, pageHeight: number, note: string): MarkInput | null {
  if (b.n < 80 || b.x1 <= b.x0 || b.y1 <= b.y0) return null;
  return {
    kind,
    x: b.x0 / scale,
    y: pageHeight - b.y1 / scale,
    w: (b.x1 - b.x0) / scale,
    h: (b.y1 - b.y0) / scale,
    confidence: Math.min(0.9, 0.35 + b.n / 5000),
    note,
  };
}

/** Detect red and blue ink clusters (stamp, seal) and a dark signature in the lower part of the page. */
export async function detectMarks(png: Buffer, pageHeight: number, scale = 2.5): Promise<MarkInput[]> {
  const { createCanvas, loadImage } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const red = box();
  const blue = box();
  const darkBottom = box();
  const bottom = canvas.height * 0.75;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 120 && r > g * 1.35 && r > b * 1.35) add(red, x, y);
      else if (b > 120 && b > r * 1.35 && b > g * 1.15) add(blue, x, y);
      else if (r < 80 && g < 80 && b < 80 && y > bottom) add(darkBottom, x, y);
    }
  }
  return [
    toMark(red, "stamp", scale, pageHeight, "A red ink cluster: a stamp or seal, advocate to verify."),
    toMark(blue, "seal", scale, pageHeight, "A blue ink cluster: a seal or signature, advocate to verify."),
    toMark(darkBottom, "signature", scale, pageHeight, "A dark ink cluster in the lower part: a signature or handwriting, advocate to verify."),
  ].filter((m): m is MarkInput => m !== null);
}
