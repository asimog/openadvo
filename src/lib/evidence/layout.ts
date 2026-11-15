/**
 * H3: page layout from the stored line boxes. Headers, footers, footnotes and paragraphs, each
 * with its line anchor. Tables are left to the reader when the boxes are not reliable.
 * Plain library.
 */
import type { DocumentPartKind } from "../../shared/evidence.ts";
import type { EvidenceLine } from "./facts.ts";

export interface LayoutPart {
  kind: DocumentPartKind;
  text: string;
  sourceId: string;
  anchorId: string;
  page: number;
  line: number;
  ref: string;
}

export function extractLayout(lines: EvidenceLine[]): LayoutPart[] {
  const out: LayoutPart[] = [];
  const byPage = new Map<number, EvidenceLine[]>();
  for (const l of lines) byPage.set(l.page, [...(byPage.get(l.page) ?? []), l]);
  for (const [page, pageLines] of byPage) {
    const height = pageLines.find((l) => l.pageHeight)?.pageHeight ?? Math.max(...pageLines.map((l) => (l.y ?? 0) + (l.h ?? 12)), 842);
    const ordered = [...pageLines].sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
    for (const l of ordered) {
      const top = (l.y ?? 0) + (l.h ?? 12);
      if (top >= height * 0.9) out.push({ kind: "header", text: l.text, sourceId: l.sourceId, anchorId: l.anchorId, page, line: l.line, ref: "header" });
      else if ((l.y ?? 0) <= height * 0.22 && /^\s*(?:\d{1,3}|[*†‡])\s/.test(l.text)) out.push({ kind: "footnote", text: l.text, sourceId: l.sourceId, anchorId: l.anchorId, page, line: l.line, ref: "footnote" });
      else if ((l.y ?? 0) <= height * 0.08) out.push({ kind: "footer", text: l.text, sourceId: l.sourceId, anchorId: l.anchorId, page, line: l.line, ref: "footer" });
    }
    // Paragraphs: a gap larger than 1.6 line heights starts a new paragraph.
    let block: EvidenceLine[] = [];
    const flush = () => {
      if (block.length === 0) return;
      const first = block[0];
      out.push({ kind: "paragraph", text: block.map((l) => l.text).join(" ").slice(0, 2000), sourceId: first.sourceId, anchorId: first.anchorId, page, line: first.line, ref: "paragraph" });
      block = [];
    };
    for (let i = 0; i < ordered.length; i++) {
      const l = ordered[i];
      const prev = ordered[i - 1];
      const gap = prev ? (prev.y ?? 0) - (l.y ?? 0) : 0;
      const h = Math.max(l.h ?? 12, 1);
      if (prev && gap > h * 1.6) flush();
      block.push(l);
    }
    flush();
  }
  return out.slice(0, 800);
}
