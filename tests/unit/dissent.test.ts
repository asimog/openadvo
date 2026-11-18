/**
 * Phase 7 (K5): the dissent panel. Every configured model answers once; an unanchored answer is
 * kept with its reason, never dropped; the split rule is mechanical and never a judgment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDissent, type PanelMember } from "../../src/lib/studio/dissent.ts";
import type { LoopContext } from "../../src/lib/studio/index.ts";

const ctx: LoopContext = {
  matter: "X v. Y",
  issue: "all",
  events: [{ id: "ev:a", date: "12.03.2024", text: "The impugned order was passed on 12.03.2024 without hearing the petitioner.", source: "order.pdf, p. 1, l. 2" }],
  authorities: [{ id: "au:1", citation: "2023 INSC 1043", parties: "X v. Y", paragraph: "12", proposition: "An authority must hear the affected party.", role: "supporting", citationFailed: false }],
  provisions: [],
};

const member = (role: string, model: string, answer: () => string): PanelMember => ({
  role,
  model,
  complete: async () => answer(),
});

test("each model answers once; the answers are returned in the panel's order", async () => {
  const result = await runDissent("Is the order void?", ctx, [
    member("chat", "a/model-1", () => JSON.stringify({ answer: "Yes, because E1 records that no hearing was held.", events: [{ ref: "E1", quote: "without hearing the petitioner" }], authorities: [] })),
    member("drafting", "a/model-2", () => JSON.stringify({ answer: "Yes, because E1 records that no hearing was held.", events: [{ ref: "E1", quote: "without hearing the petitioner" }], authorities: [] })),
  ]);
  assert.equal(result.answers.length, 2);
  assert.deepEqual(result.answers.map((a) => a.role), ["chat", "drafting"]);
  assert.ok(result.answers.every((a) => !a.refused && a.answer.length > 0));
  // The two answers agree: no split.
  assert.equal(result.split, false);
  assert.equal(result.splitPair, null);
});

test("an unanchored answer is kept with its reason, never dropped silently", async () => {
  const result = await runDissent("Is the order void?", ctx, [
    member("critic", "a/critic", () => JSON.stringify({ answer: "Yes, because fairness demands a hearing.", events: [], authorities: [] })),
  ]);
  assert.equal(result.answers.length, 1);
  assert.equal(result.answers[0].answer, "");
  assert.match(result.answers[0].refused, /not anchored/);
});

test("a model error is a refusal, not a crash", async () => {
  const result = await runDissent("Is the order void?", ctx, [
    member("chat", "a/model", () => {
      throw new Error("provider down");
    }),
  ]);
  assert.equal(result.answers[0].refused, "provider down");
});

test("the split rule is mechanical: two grounded answers that overlap less than the duplicate threshold split", async () => {
  const a = "The order is void because no hearing was held before it; the record holds none.";
  const b = "The remedy is the statutory appeal, whose tribunal can hear the parties afresh.";
  const result = await runDissent("What is the right path?", ctx, [
    member("chat", "a/model-1", () => JSON.stringify({ answer: a, events: [{ ref: "E1", quote: "without hearing the petitioner" }] })),
    member("critic", "a/model-2", () => JSON.stringify({ answer: b, events: [{ ref: "E1", quote: "without hearing the petitioner" }] })),
  ]);
  assert.equal(result.split, true);
  assert.deepEqual(result.splitPair?.map((x) => x.role), ["chat", "critic"]);

  // A refusal alone never splits the panel.
  const oneVoice = await runDissent("What is the right path?", ctx, [
    member("chat", "a/model-1", () => JSON.stringify({ answer: a, events: [{ ref: "E1", quote: "without hearing the petitioner" }] })),
    member("critic", "a/critic", () => JSON.stringify({ answer: "Fairness.", events: [] })),
  ]);
  assert.equal(oneVoice.split, false);
});
