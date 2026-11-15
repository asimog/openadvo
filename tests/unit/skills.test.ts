/**
 * N1, O2, O4: the skill format, the registry, the roles and the evaluator gate
 * (docs/specs/harness-and-stores.md sections 2 and 4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRegistry, checkSkill, compareVersions, roleSummaries, skillCommand, ROLE_TABLE } from "../../src/lib/skills/index.ts";
import { MAX_REWRITES, extractOutput, gateDecision, runGate, schemaDefects } from "../../src/lib/skills/gate.ts";
import { SkillRegistry, loadSkillDir } from "../../src/main/skills.ts";
import { AGENT_TOOLS } from "../../src/main/agent.ts";
import { ROLES } from "../../src/shared/skills.ts";

const repo = path.resolve(import.meta.dirname, "../..");

function fm(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "test-skill",
    id: "SK-900",
    version: "0.1.0",
    title: "Test skill",
    description: "A test.",
    role: "chronology",
    output: "list",
    required_context: ["events"],
    permitted_tools: ["list_sources", "list_events"],
    checks: ["anchors"],
    ...over,
  };
}

const load = (over: Record<string, unknown>, body = "Do the work.", file = "a/SKILL.md") => checkSkill({ frontmatter: fm(over), body, file, author: "advocate", agentTools: AGENT_TOOLS });

test("the built-in skills load with no error, each inside its role's tool scope", () => {
  const registry = new SkillRegistry({ builtIn: path.join(repo, "skills"), advocate: path.join(tmpdir(), "no-such-folder") }, AGENT_TOOLS).get();
  assert.deepEqual(registry.all.map((s) => [s.id, s.error]), [["SK-008", null], ["SK-011", null], ["SK-012", null], ["SK-027", null]]);
  for (const s of registry.active.values()) {
    assert.equal(s.author, "built-in");
    assert.equal(s.review, "not reviewed");
    for (const t of s.permittedTools) assert.ok(ROLE_TABLE[s.role].tools.includes(t), `${s.id}: ${t} outside ${s.role}`);
    assert.ok(s.checks.includes("schema"));
  }
});

test("a skill file is refused with its reasons: bad id, unknown tool, human-only action, a portal tool, outside the role", () => {
  assert.match(load({ id: "S-1" }).summary.error!, /id must be SK-nnn/);
  assert.match(load({ version: "1" }).summary.error!, /version must be n.n.n/);
  assert.match(load({ name: "Bad Name" }).summary.error!, /name must be lower case/);
  assert.match(load({ permitted_tools: ["no_such_tool"] }).summary.error!, /the agent has no tool named no_such_tool/);
  assert.match(load({ permitted_tools: ["approve_revision"] }).summary.error!, /human-only actions are never agent tools/);
  assert.match(load({ permitted_tools: ["submit_filing"] }).summary.error!, /no skill may have these tools: submit_filing/);
  assert.match(load({ permitted_tools: ["propose_issue"] }).summary.error!, /outside the chronology role's tool scope: propose_issue/);
  assert.match(load({ output: "essay" }).summary.error!, /output must be one of/);
  assert.match(load({ required_context: ["gossip"] }).summary.error!, /unknown required context: gossip/);
  assert.match(load({ approval_points: ["sometimes"] }).summary.error!, /unknown approval points/);
  assert.match(load({ budget_tokens: 10 }).summary.error!, /budget_tokens/);
  assert.match(load({}, "  ").summary.error!, /instructions .* are empty/);
  const ok = load({});
  assert.equal(ok.summary.error, null);
  assert.deepEqual(ok.skill!.checks, ["schema", "anchors"]);
  assert.equal(ok.skill!.packageType, "matter");
});

test("the same id twice: both versions are listed and the higher one runs; a broken file never runs", () => {
  const a = load({ version: "0.1.0" }, "old", "builtin/SKILL.md");
  const b = load({ version: "0.10.0" }, "new", "advocate/SKILL.md");
  const broken = load({ id: "SK-901", permitted_tools: ["no_such_tool"] }, "x", "broken/SKILL.md");
  const registry = buildRegistry([a, b, broken]);
  assert.equal(registry.active.get("SK-900")!.body, "new");
  assert.equal(registry.active.has("SK-901"), false);
  assert.deepEqual(registry.all.map((s) => [s.id, s.version, s.shadowed]), [["SK-900", "0.10.0", false], ["SK-900", "0.1.0", true], ["SK-901", "0.1.0", false]]);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
});

test("the advocate's own skills load from user data next to the built-in ones", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-skills-"));
  mkdirSync(path.join(dir, "mine"));
  writeFileSync(path.join(dir, "mine", "SKILL.md"), "---\nname: my-check\nid: SK-950\nversion: 1.0.0\ntitle: My check\ndescription: Mine.\nrole: review\noutput: list\npermitted_tools: [check_draft]\n---\nCheck the drafts.\n");
  const loaded = loadSkillDir(dir, "advocate", AGENT_TOOLS);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].skill?.author, "advocate");
  assert.equal(loaded[0].skill?.body, "Check the drafts.");
});

test("roles: twelve, each a tool scope; the registry names the skills of each", () => {
  assert.equal(ROLES.length, 12);
  const registry = buildRegistry([load({})]);
  const chronology = roleSummaries(registry).find((r) => r.role === "chronology")!;
  assert.deepEqual(chronology.skills, ["SK-900"]);
  for (const r of ROLES) assert.ok(!ROLE_TABLE[r].tools.includes("submit_filing"));
});

test("a / command names a skill by id or by name", () => {
  const registry = buildRegistry([load({})]);
  assert.equal(skillCommand("/SK-900 check the dates", registry)?.rest, "check the dates");
  assert.equal(skillCommand("/sk-900", registry)?.skill.id, "SK-900");
  assert.equal(skillCommand("/test-skill now", registry)?.skill.id, "SK-900");
  assert.equal(skillCommand("/placeholder", registry), null);
  assert.equal(skillCommand("SK-900", registry), null);
});

test("the gate: the schema, the anchors, verification claims, and checks that are not built", () => {
  const out = (v: unknown) => "Here it is.\n```json\n" + JSON.stringify(v) + "\n```";
  assert.equal(extractOutput("no json here").value, null);
  assert.deepEqual(schemaDefects("list", { items: [{ title: "a" }] }), ["items[0].anchors must be an array of strings", "items[0] needs a title and a detail"]);
  const good = runGate({ type: "list", checks: ["schema", "anchors", "no_unverified_claims", "p3_dates"], text: out({ items: [{ title: "Conflict", detail: "two dates", anchors: ["ev:1"] }] }), resolves: (a) => a === "ev:1" });
  assert.equal(good.ok, true);
  assert.deepEqual(good.checks.map((c) => [c.name, c.result]), [["schema", "passed"], ["anchors", "passed"], ["no_unverified_claims", "passed"], ["p3_dates", "not_available"]]);
  const bad = runGate({ type: "list", checks: ["schema", "anchors", "no_unverified_claims"], text: out({ items: [{ title: "Cite", detail: "The citation is verified.", anchors: ["made-up-id"] }] }), resolves: () => false });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.checks.map((c) => c.result), ["passed", "failed", "failed"]);
  assert.equal(bad.defects.length, 2);
  const ok2 = runGate({ type: "list", checks: ["no_unverified_claims"], text: out({ items: [{ title: "Cite", detail: "The validator reported it verified. Another is not verified.", anchors: [] }] }), resolves: () => true });
  assert.equal(ok2.ok, true);
  const broken = runGate({ type: "report", checks: ["schema", "anchors"], text: "```json\n{oops\n```", resolves: () => true });
  assert.deepEqual(broken.checks.map((c) => c.result), ["failed", "failed"]);
});

test("the gate allows at most two rewrites, then the run needs review", () => {
  assert.equal(MAX_REWRITES, 2);
  assert.equal(gateDecision(1, true), "accept");
  assert.equal(gateDecision(1, false), "rewrite");
  assert.equal(gateDecision(2, false), "rewrite");
  assert.equal(gateDecision(3, false), "review");
});
