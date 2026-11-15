/**
 * N2, I1, O1, O3, O4, O8, Q2: skill runs with pi-ai's faux model and a real matter store
 * (docs/specs/harness-and-stores.md section 4). One faux model serves the Matter Agent and the
 * skill sessions; a router answers each by its prompt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { SkillRegistry } from "../../src/main/skills.ts";
import { AGENT_TOOLS } from "../../src/main/agent.ts";
import { SKILL_RUN_MARKER } from "../../src/main/skill-runner.ts";
import { CHAT_MESSAGE_EVENT, PLAN_EVENT, type Plan } from "../../src/shared/api.ts";
import type { ReportCard } from "../../src/shared/skills.ts";
import { MATTER, agentFixture, until } from "./agent-fixture.ts";

type Msg = ReturnType<typeof fauxAssistantMessage>;
type Ctx = { messages: unknown[] };
const isSkill = (c: Ctx) => JSON.stringify(c.messages).includes(SKILL_RUN_MARKER);
const json = (v: unknown) => "Here is the output.\n```json\n" + JSON.stringify(v) + "\n```";

function router(agent: (c: Ctx, n: number) => Msg, skill: (c: Ctx, n: number) => Msg) {
  let a = 0;
  let s = 0;
  const step = (c: Ctx) => (isSkill(c) ? skill(c, s++) : agent(c, a++));
  return Array.from({ length: 80 }, () => step as never);
}

function skillFile(dir: string, folder: string, text: string) {
  mkdirSync(path.join(dir, folder), { recursive: true });
  writeFileSync(path.join(dir, folder, "SKILL.md"), text);
}

async function fixture(opts: { budget?: { budgetTokens: number | null; usedTokens: number }; issues?: string[] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "oa-runner-"));
  const store = await MatterStore.create(path.join(root, "matters"), "Runner v. Test", { actor: "advocate" });
  const file = path.join(root, "Order.txt");
  writeFileSync(file, "ORDER\nThe petition is dismissed on 12 March 2019.\n");
  const added = await store.addFile(file, { actor: "advocate" });
  const sourceId = added.source!.id;
  const skills = path.join(root, "skills");
  skillFile(skills, "chronology", "---\nname: test-chronology\nid: SK-900\nversion: 0.1.0\ntitle: Test chronology\ndescription: Lists dates.\nrole: chronology\noutput: list\nrequired_context: [sources]\npermitted_tools: [list_sources, list_events]\nchecks: [schema, anchors, p3_dates]\n---\nList the dates with anchors.\n");
  skillFile(skills, "issues", "---\nname: test-issues\nid: SK-901\nversion: 0.1.0\ntitle: Test issues\ndescription: Proposes issues.\nrole: strategy\noutput: list\nrequired_context: [sources, issues]\npermitted_tools: [list_sources, propose_issue]\napproval_points: [before_write]\n---\nPropose the issues.\n");
  const registry = new SkillRegistry({ builtIn: path.join(root, "none"), advocate: skills }, AGENT_TOOLS);
  const issues: string[] = opts.issues ?? [];
  const f = await agentFixture({
    host: {
      listSources: async () => store.listSources(),
      readMemory: async () => "",
      notebook: async () => store.notebook(),
      policy: async () => opts.budget ?? { budgetTokens: null, usedTokens: 0 },
      work: { proposeIssue: async (_m: string, text: string) => (issues.push(text), "Recorded as a candidate issue.") } as never,
      harness: { registry: (fresh) => registry.get(fresh === true), store: async () => store, ensureFind: async () => undefined },
    },
  });
  const cards = () =>
    f.events
      .filter((e) => (e.event as { name?: string }).name === CHAT_MESSAGE_EVENT)
      .map((e) => (e.event as unknown as { value: { skillRun?: ReportCard } }).value.skillRun)
      .filter((c): c is ReportCard => !!c);
  return { ...f, store, sourceId, issues, cards, close: async () => { await f.agent.disposeAll(); store.close(); } };
}

test("a skill run: the package is recorded, only the skill's tools are given, the gate asks for one rewrite, and the report card is shown", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    let skillSaw = "";
    let agentSaw = "";
    f.core.setResponses(
      router(
        (c, n) => {
          if (n === 0) return fauxAssistantMessage([fauxToolCall("run_skill", { skill: "sk-900", request: "list the dates", reason: "a chronology request" })], { stopReason: "toolUse" });
          agentSaw = JSON.stringify(c.messages.at(-1));
          return fauxAssistantMessage("The chronology skill ran.");
        },
        (c, n) => {
          if (n === 0) {
            skillSaw = JSON.stringify(c.messages);
            return fauxAssistantMessage([fauxToolCall("list_sources", {})], { stopReason: "toolUse" });
          }
          if (n === 1) return fauxAssistantMessage(json({ items: [{ title: "Dismissal", detail: "12 March 2019", anchors: ["invented-anchor-1"] }] }));
          return fauxAssistantMessage(json({ items: [{ title: "Dismissal", detail: "12 March 2019", anchors: [f.sourceId] }], not_read: ["page 2"] }));
        },
      ),
    );
    await f.agent.send(MATTER, "List the dates of the matter.");
    // Scope (Q2): the skill session holds its two tools and none of the Matter Agent's others.
    assert.match(skillSaw, /list_sources/);
    assert.doesNotMatch(skillSaw, /propose_issue|submit_filing|start_helper|run_skill/);
    assert.match(skillSaw, /<context-package id=\\"pkg-/);
    assert.match(skillSaw, /Order\.txt/);
    const runs = f.store.skillRuns();
    assert.equal(runs.length, 1);
    const run = runs[0];
    assert.equal(run.state, "done");
    assert.equal(run.report!.attempts, 2);
    assert.equal(run.report!.rewrites, 1);
    assert.deepEqual(run.report!.checks.map((c) => [c.name, c.result]), [["schema", "passed"], ["anchors", "passed"], ["p3_dates", "not_available"]]);
    assert.deepEqual(run.report!.toolsUsed, [{ name: "list_sources", calls: 1, errors: 0 }]);
    assert.deepEqual(run.report!.notRead, ["page 2"]);
    const pkg = f.store.contextPackage(run.packageId!)!;
    assert.equal(pkg.skillId, "SK-900");
    assert.deepEqual(pkg.included.map((i) => i.id), [f.sourceId]);
    assert.match(agentSaw, /done/);
    assert.equal(f.cards().at(-1)?.state, "done");
    assert.ok(f.texts("notice").some((t) => /Skill SK-900 "Test chronology" v0.1.0 picked: a chronology request/.test(t)));
    assert.ok(f.texts("notice").some((t) => /rewrite 1 of 2/.test(t)));
    assert.ok((await f.trace()).some((l) => l.type === "skill_end" && l.run === run.id && l.state === "done"));
    assert.ok(f.store.verifyChain().ok);
  } finally {
    await f.close();
  }
});

test("the gate: after two rewrites the run needs review and opens a review item; the same inputs reuse the package", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const bad = json({ items: [{ title: "x", detail: "y", anchors: ["nowhere"] }] });
    f.core.setResponses(
      router(
        (_c, n) => (n === 0 || n === 2 ? fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-900", request: "dates", reason: "test" })], { stopReason: "toolUse" }) : fauxAssistantMessage("ok")),
        () => fauxAssistantMessage(bad),
      ),
    );
    await f.agent.send(MATTER, "first");
    const [run] = f.store.skillRuns();
    assert.equal(run.state, "needs_review");
    assert.equal(run.report!.attempts, 3);
    const item = f.store.listReviewItems().find((r) => r.kind === "skill_run");
    assert.ok(item && item.status === "open");
    assert.equal(run.report!.reviewItemId, item!.id);
    await f.agent.send(MATTER, "again");
    const runs = f.store.skillRuns();
    assert.equal(runs.length, 2);
    assert.equal(runs[0].packageId, runs[1].packageId);
    assert.ok(f.texts("notice").some((t) => /the same package as an earlier run/.test(t)));
  } finally {
    await f.close();
  }
});

test("an approval point before_write asks the advocate; without the advocate's yes the write does not happen", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses(
      router(
        (_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-901", request: "issues", reason: "test" })], { stopReason: "toolUse" }) : fauxAssistantMessage("ok")),
        (_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("propose_issue", { text: "Limitation" })], { stopReason: "toolUse" }) : fauxAssistantMessage(json({ items: [] }))),
      ),
    );
    const sent = f.agent.send(MATTER, "Propose the issues.");
    await until(() => f.questions().length === 1, "the approval card");
    const q = f.questions()[0];
    assert.match(q.message, /Skill SK-901 wants to write with propose_issue/);
    await f.agent.answerQuestion(MATTER, q.id, "Do not allow");
    await sent;
    assert.deepEqual(f.issues, []);
    const [run] = f.store.skillRuns();
    assert.equal(run.state, "done");
    assert.deepEqual(run.report!.toolsUsed, [{ name: "propose_issue", calls: 1, errors: 1 }]);
  } finally {
    await f.close();
  }
});

test("refusals: a plan waiting for approval and a used budget stop a run before any work", async () => {
  const f = await fixture({ budget: { budgetTokens: 100, usedTokens: 100 } });
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses(router((_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-900", request: "x", reason: "y" })], { stopReason: "toolUse" }) : fauxAssistantMessage("ok")), () => fauxAssistantMessage("never")));
    // The matter's budget stops the chat itself first; a run needs the chat. Test the runner's own refusal on a plan.
    await f.agent.send(MATTER, "go");
    assert.equal(f.store.skillRuns().length, 0);
    assert.ok(f.texts("notice").some((t) => /budget of 100 tokens is used/.test(t)));
  } finally {
    await f.close();
  }
  const g = await fixture();
  try {
    await g.agent.getChat(MATTER);
    g.core.setResponses(
      router(
        (_c, n) =>
          n === 0
            ? fauxAssistantMessage([fauxToolCall("plan_set", { title: "Review", items: [{ text: "Run the chronology skill", skill: "SK-900" }, { text: "Report" }] })], { stopReason: "toolUse" })
            : n === 1
              ? fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-900", request: "x", reason: "y" })], { stopReason: "toolUse" })
              : fauxAssistantMessage("ok"),
        () => fauxAssistantMessage(json({ items: [] })),
      ),
    );
    await g.agent.send(MATTER, "Plan it.");
    const plan = (await g.agent.getChat(MATTER)).plan!;
    assert.equal(plan.approval, "pending");
    assert.equal(plan.items[0].skill, "SK-900");
    // plan_set ended the turn; the next message tries a run, which is refused while the plan waits.
    await g.agent.send(MATTER, "Run it anyway.");
    const [run] = g.store.skillRuns();
    assert.equal(run.state, "refused");
    assert.match(run.report!.reason, /waits for the advocate's approval/);
    await g.agent.approvePlan(MATTER);
    const approved = g.events.filter((e) => (e.event as { name?: string }).name === PLAN_EVENT).map((e) => (e.event as unknown as { value: Plan }).value).at(-1)!;
    assert.equal(approved.approval, "approved");
    assert.ok(g.texts("advocate").includes("The plan is approved. Carry it out."));
  } finally {
    await g.close();
  }
});

test("parallel runs: two run_skill calls in one message run at once, each with its own record", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses(
      router(
        (_c, n) =>
          n === 0
            ? fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-900", request: "dates one", reason: "a" }), fauxToolCall("run_skill", { skill: "SK-900", request: "dates two", reason: "b" })], { stopReason: "toolUse" })
            : fauxAssistantMessage("ok"),
        () => fauxAssistantMessage(json({ items: [] })),
      ),
    );
    await f.agent.send(MATTER, "two runs");
    const runs = f.store.skillRuns();
    assert.equal(runs.length, 2);
    assert.deepEqual(runs.map((r) => r.state), ["done", "done"]);
    assert.notEqual(runs[0].id, runs[1].id);
    assert.notEqual(runs[0].packageId, runs[1].packageId);
    assert.deepEqual(new Set(runs.map((r) => r.request)), new Set(["dates one", "dates two"]));
  } finally {
    await f.close();
  }
});

test("a run cut off by a restart is interrupted when the conversation opens, and /resume continues it with its package", async () => {
  const f = await fixture();
  try {
    f.store.startSkillRun({ id: "run-cut00001", skillId: "SK-900", skillVersion: "0.1.0", request: "dates", reason: "before the restart" }, { actor: "system" });
    await f.agent.getChat(MATTER);
    assert.equal(f.store.skillRun("run-cut00001")!.state, "interrupted");
    assert.ok((await f.agent.getChat(MATTER)).messages.some((m) => /1 skill run was interrupted by a restart/.test(m.text)));
    let resumeSaw = "";
    f.core.setResponses(
      router(
        (c, n) => {
          if (n === 0) {
            resumeSaw = JSON.stringify(c.messages.at(-1));
            return fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-900", request: "dates", reason: "resume", resume: "run-cut00001" })], { stopReason: "toolUse" });
          }
          return fauxAssistantMessage("resumed");
        },
        () => fauxAssistantMessage(json({ items: [] })),
      ),
    );
    await f.agent.send(MATTER, "/resume run-cut00001");
    assert.match(resumeSaw, /resume \\"run-cut00001\\"/);
    const run = f.store.skillRun("run-cut00001")!;
    assert.equal(run.state, "done");
    assert.equal(f.store.skillRuns().length, 1);
  } finally {
    await f.close();
  }
});

test("a / command calls the skill through the Matter Agent; an unknown skill is an error the model sees", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    let saw = "";
    f.core.setResponses(
      router(
        (c, n) => {
          if (n === 0) {
            saw = JSON.stringify(c.messages.at(-1));
            return fauxAssistantMessage([fauxToolCall("run_skill", { skill: "SK-999", request: "x", reason: "y" })], { stopReason: "toolUse" });
          }
          return fauxAssistantMessage("no such skill");
        },
        () => fauxAssistantMessage("never"),
      ),
    );
    await f.agent.send(MATTER, "/SK-900 the dates in @[source:abc Order.txt]");
    assert.match(saw, /Call run_skill now with skill \\"SK-900\\"/);
    assert.match(saw, /pinned/);
    const t = await f.trace();
    assert.ok(t.some((l) => l.type === "tool" && l.tool === "run_skill" && l.error === true));
    assert.equal(f.store.skillRuns().length, 0);
  } finally {
    await f.close();
  }
});
