/**
 * V2-1: files other than PDF. Detects the media type from the first bytes of a file, and reads
 * DOCX and plain text into pages of lines. Plain library: no Electron import, no Pi import.
 * Spec: docs/specs/v2.md (V2-1).
 */
import { unzipSync, strFromU8 } from "fflate";

export const MEDIA = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  text: "text/plain",
  png: "image/png",
  jpeg: "image/jpeg",
} as const;

export type MediaType = (typeof MEDIA)[keyof typeof MEDIA];

/** For DOCX and text, a "page" is a block of this many lines (V2-1). */
export const LINES_PER_TEXT_PAGE = 50;

const starts = (bytes: Uint8Array, magic: number[]) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

function includesAscii(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(text, "latin1"));
}

/** The media type of a file, from its first bytes (and, for text, its name). Null when not accepted. */
export function detectMediaType(bytes: Uint8Array, name: string): MediaType | null {
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return MEDIA.pdf;
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MEDIA.png;
  if (starts(bytes, [0xff, 0xd8, 0xff])) return MEDIA.jpeg;
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) && includesAscii(bytes, "word/document.xml")) return MEDIA.docx;
  if (/\.txt$/i.test(name) && bytes.length > 0) {
    if (bytes.subarray(0, 8192).includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return MEDIA.text;
    } catch {
      return null;
    }
  }
  return null;
}

/** The reason a file is refused, for the event record and the advocate. */
export const ACCEPTED_TEXT = "PDF, DOCX, plain text (.txt), PNG or JPEG";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? "";
  });
}

/** The text of each non-empty paragraph of a DOCX body, in order. */
export function docxParagraphs(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("the DOCX has no word/document.xml");
  const body = strFromU8(xml);
  const out: string[] = [];
  for (const para of body.split(/<\/w:p>/)) {
    let text = "";
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    for (let m = re.exec(para); m; m = re.exec(para)) text += m[1] !== undefined ? decodeXml(m[1]) : " ";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) out.push(clean);
  }
  return out;
}

/** The non-empty lines of a UTF-8 text file. */
export function textLines(bytes: Uint8Array): string[] {
  return new TextDecoder("utf-8")
    .decode(bytes)
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export interface TextPage {
  page: number;
  width: number;
  height: number;
  text: string;
  lines: Array<{ line: number; x: number; y: number; w: number; h: number; text: string }>;
}

/**
 * Split lines into pages of LINES_PER_TEXT_PAGE. The boxes are a plain A4 layout so that every
 * anchor has a box; there is no PDF view for these sources (V2-1).
 */
export function paginate(lines: string[]): TextPage[] {
  const pages: TextPage[] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_TEXT_PAGE) {
    const chunk = lines.slice(i, i + LINES_PER_TEXT_PAGE);
    pages.push({
      page: pages.length + 1,
      width: 595,
      height: 842,
      text: chunk.join("\n"),
      lines: chunk.map((text, j) => ({ line: j + 1, x: 50, y: 800 - j * 15, w: 495, h: 12, text })),
    });
  }
  return pages;
}
