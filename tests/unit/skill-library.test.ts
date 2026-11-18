/**
 * Phase 8 (N4, N6): the phase 8 skill library. Every row of docs/skills.md section 2 that phase 8
 * owns is a skill; each loads, carries its review record with its version, and passes its fixture
 * test. The fixture briefs are named in docs/specs/practice-packs.md section 4; no gold set exists
 * (questions Q-3), and the test says that in its name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { SkillRegistry } from "../../src/main/skills.ts";
import { AGENT_TOOLS } from "../../src/main/agent.ts";
import { skillsForPrompt } from "../../src/lib/skills/index.ts";
import { fixtureForSkill, propertyDefects } from "../../src/lib/skills/skill-tests.ts";

const repo = path.resolve(import.meta.dirname, "../..");

const PHASE_8 = [
  // Every proceeding.
  "SK-001", "SK-002", "SK-003", "SK-004", "SK-005", "SK-006", "SK-007", "SK-008", "SK-009", "SK-010", "SK-011", "SK-012",
  "SK-013", "SK-014", "SK-015", "SK-016", "SK-017", "SK-018", "SK-019", "SK-020", "SK-021", "SK-022", "SK-023", "SK-024",
  "SK-025", "SK-026", "SK-027", "SK-029", "SK-030", "SK-031", "SK-032", "SK-033",
  // Criminal.
  "SK-101", "SK-102", "SK-103", "SK-104", "SK-105", "SK-106", "SK-107", "SK-108", "SK-109", "SK-110", "SK-113", "SK-114",
  // Civil.
  "SK-201", "SK-202", "SK-203", "SK-204", "SK-205", "SK-206", "SK-207", "SK-208", "SK-210",
  // Constitutional and writ.
  "SK-301", "SK-302", "SK-303", "SK-304", "SK-305", "SK-307", "SK-308", "SK-309",
];

const registry = new SkillRegistry({ builtIn: path.join(repo, "skills"), advocate: path.join(tmpdir(), "no-such-folder") }, AGENT_TOOLS).get();

test("N4: the phase 8 rows of the skill library are present, once each", () => {
  assert.equal(PHASE_8.length, 61);
  assert.equal(registry.all.length, 61);
  assert.deepEqual([...registry.active.keys()].sort(), [...PHASE_8].sort());
  assert.deepEqual(registry.all.filter((s) => s.error).map((s) => [s.id, s.error]), []);
});

test("N4: every skill names its pack, loads inside its role, and says what it does and when to call it", () => {
  const packs = new Set(["general", "criminal", "civil", "writ", "slp"]);
  for (const s of registry.active.values()) {
    assert.ok(s.packs.length > 0 && s.packs.every((p) => packs.has(p)), `${s.id}: packs`);
    assert.ok(s.description.length >= 80 && /Use it when/i.test(s.description), `${s.id}: description`);
    assert.ok(s.inputs.length > 0, `${s.id}: inputs`);
    assert.ok(s.requiredContext.length > 0, `${s.id}: context`);
    assert.ok(s.tests.length > 0, `${s.id}: tests`);
    assert.ok(s.body.length >= 200, `${s.id}: body`);
  }
});

test("N6: each skill's review record is kept with its version, scores at least 24 of 26, and finds no legal failure mode", () => {
  for (const s of registry.active.values()) {
    assert.equal(s.reviewVersion, s.version, `${s.id}: review version`);
    assert.equal(s.reviewMax, 26, `${s.id}: max`);
    assert.ok((s.reviewScore ?? 0) >= 24, `${s.id}: score ${s.reviewScore}`);
    assert.deepEqual(s.reviewFailureModes, [], `${s.id}: failure modes`);
    assert.match(s.review, /^reviewed \d{4}-\d{2}-\d{2}: \d+\/26; no legal failure mode$/, `${s.id}: review line`);
  }
});

test("N6: every skill passes its fixture brief and its expected properties (fixture briefs only, no gold set)", () => {
  for (const s of registry.active.values()) {
    const fixture = fixtureForSkill(s);
    assert.ok(fixture, `${s.id}: no fixture brief`);
    assert.ok(s.tests.includes(fixture.id), `${s.id}: the fixture is named in tests`);
    assert.deepEqual(propertyDefects(s, fixture), [], s.id);
  }
});

test("the prompt lists every skill and its role, so the Matter Agent can pick one and say which", () => {
  const prompt = skillsForPrompt(registry);
  for (const id of PHASE_8) assert.ok(prompt.includes(id), id);
  assert.match(prompt, /SK-103 \(Regular bail application/);
});
