/**
 * Phase 11 (N5): the agent builder. A named agent is checked against the registry, the drafting
 * catalogue and the tool scopes; a test runs the same checks and each skill's review.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkAgent, testAgent } from "../../src/lib/builders/index.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import { HUMAN_ONLY_PATTERN, NEVER_IN_A_SKILL } from "../../src/lib/skills/roles.ts";
import type { SkillDefinition } from "../../src/shared/skills.ts";

function skill(id: string, tools: string[], review = "reviewed 2026-11-18: 24/26; no legal failure mode"): SkillDefinition {
  return {
    id, version: "1.0.0", name: id.toLowerCase(), title: id, description: "A skill.", role: "drafting", packs: ["general"], courts: [], proceedings: [], inputs: [], requiredContext: ["sources"], permittedTools: tools, output: "draft", checks: ["schema", "anchors"], approvalPoints: [], budgetTokens: null, packageType: "drafting", questionType: null, tests: [], author: "built-in", review, body: "A body.", file: "x",
  };
}

const skills = new Map<string, SkillDefinition>([
  ["SK-103", skill("SK-103", ["list_sources", "read_source_text", "propose_fact"])],
  ["SK-027", skill("SK-027", ["list_sources", "check_draft", "propose_correction"], "review needed: the record is for version 0.9.0")],
]);
const deps = { skills, draftKinds: ["writ_petition", "bail_application"], humanOnly: HUMAN_ONLY_PATTERN, never: NEVER_IN_A_SKILL };

const raw = {
  id: "agent-bail",
  version: "1.0.0",
  title: "Bail agent",
  task: "Draft a bail application from the record.",
  instructions: "Read the custody record, the FIR and the charge-sheet status. Propose; never decide.",
  skills: ["SK-103"],
  template: "bail_application",
  sources: ["the FIR", "the custody record"],
  requiredContext: ["sources", "events"],
  tools: ["list_sources", "read_source_text"],
  output: "draft",
  checks: ["schema", "anchors"],
  approvals: ["before_write"],
};

test("N5: the agent check accepts a named agent inside the registry and the tool scopes", () => {
  const check = checkAgent(raw, deps);
  assert.deepEqual(check.errors, []);
  assert.equal(check.value?.skills[0], "SK-103");
  assert.equal(check.value?.template, "bail_application");
  assert.equal(check.value?.approvals[0], "before_write");
});

test("N5: an unknown skill, a tool outside the skills, a human-only tool, a bad template, output, check or approval is refused", () => {
  const noSkill = checkAgent({ ...raw, skills: ["SK-999"] }, deps);
  assert.ok(noSkill.errors.some((e) => /no skill SK-999/.test(e)));
  const outside = checkAgent({ ...raw, tools: ["list_sources", "web_search"] }, deps);
  assert.ok(outside.errors.some((e) => /tools outside the chosen skills: web_search/.test(e)));
  const human = checkAgent({ ...raw, tools: ["list_sources", "approve_revision"] }, deps);
  assert.ok(human.errors.some((e) => /human-only/.test(e)));
  const badTemplate = checkAgent({ ...raw, template: "invented_form" }, deps);
  assert.ok(badTemplate.errors.some((e) => /template must be one of the document kinds/.test(e)));
  const badOutput = checkAgent({ ...raw, output: "novel" }, deps);
  assert.ok(badOutput.errors.some((e) => /output must be one of/.test(e)));
  const badCheck = checkAgent({ ...raw, checks: ["telepathy"] }, deps);
  assert.ok(badCheck.errors.some((e) => /unknown checks: telepathy/.test(e)));
  const badApproval = checkAgent({ ...raw, approvals: ["after_lunch"] }, deps);
  assert.ok(badApproval.errors.some((e) => /unknown approval points/.test(e)));
  const badContext = checkAgent({ ...raw, requiredContext: ["weather"] }, deps);
  assert.ok(badContext.errors.some((e) => /unknown required context/.test(e)));
});

test("N5: the agent test names an unreviewed skill and fails the test", () => {
  const agent = checkAgent({ ...raw, skills: ["SK-103", "SK-027"] }, deps).value!;
  const result = testAgent(agent, deps);
  assert.equal(result.ok, false);
  assert.ok(result.skills.find((s) => s.id === "SK-027" && !s.ok));
  assert.ok(result.errors.some((e) => /SK-027/.test(e)));
  const good = testAgent(checkAgent(raw, deps).value!, deps);
  assert.equal(good.ok, true);
});

test("N5: an agent is saved as a version; an edit supersedes the old row", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-agent-"));
  const store = AdvocateStore.open(dir);
  try {
    const one = store.saveAgent(raw, deps, { actor: "advocate" });
    assert.equal(one.version, "1.0.0");
    const two = store.saveAgent({ ...one, title: "Bail agent v2" }, deps, { actor: "advocate" });
    assert.equal(two.version, "1.1.0");
    assert.equal(store.agents().length, 1);
    assert.equal(store.agents()[0].title, "Bail agent v2");
    assert.throws(() => store.saveAgent({ ...raw, id: "agent-bad", version: "1.0.0", skills: [] }, deps, { actor: "advocate" }), /BAD_AGENT/);
    assert.throws(() => store.saveAgent(raw, deps, { actor: "agent" }), /human|HUMAN/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
