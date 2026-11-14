import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "../../src/shared/markdown.ts";

test("V1-2: headings, lists, code and paragraphs", () => {
  const blocks = parseMarkdown("## Sources\n\n- **one.pdf**: 3 pages\n- two.pdf\n\n1. first\n2. second\n\n```\nraw *text*\n```\nA line\nwraps.");
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "list", "list", "code", "paragraph"]);
  const list = blocks[1] as Extract<(typeof blocks)[number], { kind: "list" }>;
  assert.equal(list.ordered, false);
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0][0], { kind: "bold", children: [{ kind: "text", text: "one.pdf" }] });
  assert.equal((blocks[2] as { ordered: boolean }).ordered, true);
  assert.equal((blocks[3] as { text: string }).text, "raw *text*");
});

test("V1-2: inline spans; snake_case is not emphasis; a link keeps its address", () => {
  assert.deepEqual(parseInline("use `read_draft` and list_sources"), [
    { kind: "text", text: "use " },
    { kind: "code", text: "read_draft" },
    { kind: "text", text: " and list_sources" },
  ]);
  const flat = parseInline("a list_sources b").map((s) => (s.kind === "text" ? s.text : `<${s.kind}>`)).join("");
  assert.equal(flat, "a list_sources b");
  assert.deepEqual(parseInline("[court](https://example.org)"), [{ kind: "link", text: "court", href: "https://example.org" }]);
  assert.deepEqual(parseInline("*it*"), [{ kind: "italic", children: [{ kind: "text", text: "it" }] }]);
});
