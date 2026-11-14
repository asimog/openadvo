/**
 * V1-2: a small markdown parser for the agent's chat text (v1 spec). Pure data out: blocks and
 * inline spans. The renderer turns them into React elements; no raw HTML is ever set.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; text: string }
  | { kind: "quote"; children: Inline[] };

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\n]+?\*|_[^_\n]+?_)|(\[[^\]\n]+\]\([^)\s]+\))/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
    const token = m[0];
    if (m[1]) out.push({ kind: "code", text: token.slice(1, -1) });
    else if (m[2]) out.push({ kind: "bold", children: parseInline(token.slice(2, -2)) });
    else if (m[3]) {
      // An underscore inside a word (snake_case) is not emphasis.
      const before = rest[m.index - 1] ?? " ";
      if (token.startsWith("_") && /\w/.test(before)) out.push({ kind: "text", text: token });
      else out.push({ kind: "italic", children: parseInline(token.slice(1, -1)) });
    } else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      out.push({ kind: "link", text: lm[1], href: lm[2] });
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", children: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: "heading", level: Math.min(h[1].length, 3) as 1 | 2 | 3, children: parseInline(h[2].trim()) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const items: Inline[][] = [parseInline((bullet ?? numbered)![1])];
      while (i + 1 < lines.length) {
        const next = ordered ? NUMBERED.exec(lines[i + 1]) : BULLET.exec(lines[i + 1]);
        if (!next) break;
        items.push(parseInline(next[1]));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      blocks.push({ kind: "quote", children: parseInline(q[1]) });
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}
