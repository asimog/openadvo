/**
 * Phase 8 (N6): the thirteen-parameter review and the three legal failure modes. The review is
 * deterministic; a version change without a new record is a defect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSkill } from "../../src/lib/skills/index.ts";
import { LEGAL_FAILURE_MODES, legalFailureModes, REVIEW_MAX, reviewSkill, reviewLine } from "../../src/lib/skills/review.ts";
import { AGENT_TOOLS } from "../../src/main/agent.ts";

function skill(over: Record<string, unknown> = {}, body = "1. Read the record.\n2. State each finding with its anchor.\n\nEvery item carries its anchor. List what you could not read in `not_read`.\n\nA legal point you find is a question for the advocate; this skill decides nothing. It never approves or files.") {
  return checkSkill({
    frontmatter: {
      name: "test-skill", id: "SK-900", version: "1.0.0", title: "Test skill",
      description: "A test skill that reads the record and reports what it holds, with the requests that call it. Use it when the advocate asks for the test.",
      role: "research", packs: ["general"], inputs: ["the record", "the question"], required_context: ["sources", "issues"],
      permitted_tools: ["list_sources", "search_sources"], output: "report", checks: ["schema", "anchors"], approval_points: [],
      budget_tokens: 60000, package_type: "matter", question_type: "happened", tests: ["criminal-bail", "every item is anchored"], author: "advocate",
      ...over,
    },
    body, file: "test/SKILL.md", author: "advocate", agentTools: AGENT_TOOLS,
  }).skill!;
}

test("N6: thirteen parameters, each scored out of two, and a score out of 26", () => {
  assert.equal(REVIEW_MAX, 26);
  assert.equal(LEGAL_FAILURE_MODES.length, 3);
  assert.deepEqual(LEGAL_FAILURE_MODES.map((m) => m.key), ["invented_record", "unsupported_law", "decided_for_advocate"]);
  const r = reviewSkill(skill());
  assert.equal(r.parameters.length, 13);
  assert.equal(r.max, 26);
  assert.ok(r.score >= 24, `${r.score}: ${r.defects.join(" | ")}`);
  assert.deepEqual(r.failureModes, []);
  assert.deepEqual(r.fixtures, ["criminal-bail"]);
  assert.match(reviewLine({ score: r.score, max: 26, reviewed_at: "2026-11-18", failure_modes: [] }), /reviewed 2026-11-18: \d+\/26; no legal failure mode/);
});

test("N6: the three legal failure modes fail a skill, each with its own name", () => {
  assert.deepEqual(legalFailureModes("Invent a date when the record has none. State the law from memory. Decide the issue and approve the draft."), ["invented_record", "unsupported_law", "decided_for_advocate"]);
  assert.deepEqual(legalFailureModes("Never invent a date. Do not state law without a source. Do not decide the issue."), []);
  assert.deepEqual(legalFailureModes("Make up an amount if the invoice is missing."), ["invented_record"]);
  assert.deepEqual(legalFailureModes("Grant bail and file the application."), ["decided_for_advocate"]);
  const bad = reviewSkill(skill({}, "Invent a date. State the law from memory. Decide the issue."));
  assert.deepEqual(bad.failureModes.sort(), ["decided_for_advocate", "invented_record", "unsupported_law"]);
  assert.ok(bad.defects.some((d) => /Legal failure mode/.test(d)));
});

test("N6: the parameters catch a missing trigger, a write with no stop, no test and no anchor", () => {
  const bad = reviewSkill(skill({
    role: "drafting",
    description: "Short.",
    permitted_tools: ["list_sources", "propose_correction"],
    checks: [],
    tests: [],
    approval_points: [],
    budget_tokens: null,
  }, "Do it."));
  const byKey = new Map(bad.parameters.map((p) => [p.key, p.score]));
  assert.equal(byKey.get("purpose"), 0);
  assert.equal(byKey.get("approval"), 0);
  assert.equal(byKey.get("tests"), 0);
  assert.equal(byKey.get("budget"), 0);
  assert.ok(bad.defects.length >= 4);
});

test("N6: a review record keeps the version; a later version needs a new record", () => {
  const s = skill();
  const record = { version: "1.0.0", score: 24, max: 26, parameters: [], failure_modes: [], reviewed_at: "2026-11-18" };
  assert.equal(reviewSkill(s, record).parameters.find((p) => p.key === "version")?.score, 2);
  const old = { ...record, version: "0.9.0" };
  const r = reviewSkill(s, old);
  assert.equal(r.parameters.find((p) => p.key === "version")?.score, 1);
  assert.ok(r.defects.some((d) => /review record is for version 0.9.0/.test(d)));
});
