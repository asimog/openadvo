/** V1-2: the agent's markdown as React elements. No raw HTML; a link shows as text with its address. */
import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "../../shared/markdown.ts";

function inline(spans: Inline[]): ReactNode[] {
  return spans.map((s, i) => {
    if (s.kind === "text") return s.text;
    if (s.kind === "bold") return <strong key={i}>{inline(s.children)}</strong>;
    if (s.kind === "italic") return <em key={i}>{inline(s.children)}</em>;
    if (s.kind === "code") return <code key={i}>{s.text}</code>;
    return (
      <span key={i} className="md-link" title={s.href}>
        {s.text} ({s.href})
      </span>
    );
  });
}

export function Markdown(props: { text: string }) {
  return (
    <div className="md">
      {parseMarkdown(props.text).map((b, i) => {
        if (b.kind === "heading") {
          const Tag = (["h3", "h4", "h5"] as const)[b.level - 1];
          return <Tag key={i}>{inline(b.children)}</Tag>;
        }
        if (b.kind === "paragraph") return <p key={i}>{inline(b.children)}</p>;
        if (b.kind === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if (b.kind === "quote") return <blockquote key={i}>{inline(b.children)}</blockquote>;
        const Tag = b.ordered ? "ol" : "ul";
        return <Tag key={i}>{b.items.map((item, n) => <li key={n}>{inline(item)}</li>)}</Tag>;
      })}
    </div>
  );
}
