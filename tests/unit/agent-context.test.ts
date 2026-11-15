/**
 * The context strategy per agent kind (src/main/agent-context.ts; docs/specs/agent-framework.md
 * section 7): tool-result clearing and the compaction summary form.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTEXT_STRATEGY, clearOldToolResults, placeholder, summaryPrompt } from "../../src/main/agent-context.ts";

const big = "x".repeat(5000);
function result(toolName: string, text: string) {
  return { role: "toolResult", toolName, toolCallId: `${toolName}-${Math.random()}`, content: [{ type: "text", text }] };
}

test("below the trigger nothing is cleared, so the request keeps its cached prefix", () => {
  const messages = [{ role: "user", content: "hi" }, result("read_source_text", big)];
  assert.equal(clearOldToolResults(messages, CONTEXT_STRATEGY.matter.clearing, 1_000_000), undefined);
});

test("the Matter Agent keeps the last 6 results, small results and the matter memory", () => {
  const messages = [
    { role: "user", content: "start" },
    result("read_matter_memory", big),
    result("list_sources", "3 sources"),
    ...Array.from({ length: 8 }, () => result("read_source_text", big)),
  ];
  const out = clearOldToolResults(messages, CONTEXT_STRATEGY.matter.clearing, 1000);
  assert.ok(out, "something is cleared above the trigger");
  const texts = out.map((m) => JSON.stringify(m.content));
  assert.match(texts[1], /x{100}/, "read_matter_memory is never cleared");
  assert.match(texts[2], /3 sources/, "a short result stays");
  const reads = out.slice(3);
  assert.equal(reads.filter((m) => JSON.stringify(m.content).includes(placeholder("read_source_text"))).length, 2, "the two oldest of eight long reads are cleared");
  assert.equal(reads.slice(2).every((m) => JSON.stringify(m.content).includes("xxxx")), true, "the last six stay");
  assert.equal((messages[3].content as Array<{ text: string }>)[0].text, big, "the input is not changed; only the request is");
});

test("the Firm Agent clears harder: all but the last 3 results, of any size", () => {
  const messages = Array.from({ length: 5 }, (_, i) => result("matter_status", `matter ${i}`));
  const out = clearOldToolResults(messages, CONTEXT_STRATEGY.firm.clearing, 10);
  assert.ok(out);
  assert.equal(out.filter((m) => JSON.stringify(m.content).includes("cleared to save context")).length, 2);
});

test("the matter summary form has the six parts in order and keeps anchors exact", () => {
  const prompt = summaryPrompt("matter", "advocate: draft the grounds", "earlier summary");
  const parts = CONTEXT_STRATEGY.matter.summaryParts;
  assert.equal(parts.length, 6);
  let at = -1;
  for (const [i, p] of parts.entries()) {
    const next = prompt.indexOf(`## ${i + 1}. ${p}`);
    assert.ok(next > at, `part ${i + 1} in order`);
    at = next;
  }
  assert.match(prompt, /Keep every record id, anchor, page and line number exactly/);
  assert.match(prompt, /A model's inference is not a fact/);
  assert.match(prompt, /<previous-summary>\nearlier summary/);
});

test("the Matter Agent keeps more recent context than the Firm Agent", () => {
  assert.ok(CONTEXT_STRATEGY.matter.keepRecentTokens > CONTEXT_STRATEGY.firm.keepRecentTokens);
});
