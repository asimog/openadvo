/** J2: the research plan is proposed by the agent, approved by the advocate, and records each step. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";

test("J2: a plan is a proposal until the advocate approves it; steps record hits and gaps", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-plan-"));
  let store: MatterStore | null = null;
  try {
    store = await MatterStore.create(root, "Plan test", { actor: "advocate" });
    const plan = store.researchPlans.add(
      {
        question: "Is the written statement in time?",
        governingDate: "2026-11-18",
        steps: [
          { question: "What does the rule say?", mode: "statute", scopes: ["statute", "procedure"] },
          { question: "What did the court hold?", mode: "paragraph", scopes: ["research"] },
        ],
      },
      { actor: "agent" },
    );
    assert.equal(plan.status, "proposed");
    assert.equal(plan.author, "agent");
    assert.equal(plan.steps.length, 2);
    assert.equal(plan.steps[0].status, "planned");

    assert.throws(() => store!.researchPlans.decide(plan.id, "approved", { actor: "agent" }), /HUMAN_ONLY/);
    const approved = store.researchPlans.decide(plan.id, "approved", { actor: "advocate" });
    assert.equal(approved.status, "approved");

    const one = store.researchPlans.setStep(plan.id, 1, { status: "done", hits: 3, note: "The rule gives 30 days." }, { actor: "agent" });
    assert.equal(one.status, "running");
    assert.equal(one.steps[0].status, "done");
    assert.equal(one.steps[0].hits, 3);
    const two = store.researchPlans.setStep(plan.id, 2, { status: "not_reached", note: "No judgment was read." }, { actor: "agent" });
    assert.equal(two.status, "done");
    assert.equal(two.steps[1].status, "not_reached");
    assert.equal(store.researchPlans.list().length, 1);
    assert.ok(store.listEvents().some((event) => event.action === "research_plan.approved"));
  } finally {
    store?.close();
    await rm(root, { recursive: true, force: true });
  }
});
