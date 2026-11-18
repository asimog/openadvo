/**
 * Phase 11 (S9): the trigger table. A fire proposes the named skills and responses; it starts
 * nothing until the advocate starts it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_TRIGGERS, checkTrigger, matchTriggers, responseProposal } from "../../src/lib/triggers/index.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";

test("S9: the default triggers cover the ten events and each names its skills or responses", () => {
  assert.equal(DEFAULT_TRIGGERS.length, 10);
  assert.deepEqual([...new Set(DEFAULT_TRIGGERS.map((t) => t.event))].sort(), ["amendment", "citation_change", "deadline_approaching", "defect_received", "email", "hearing_date", "instruction", "new_document", "order", "stage_change"]);
  for (const t of DEFAULT_TRIGGERS) {
    const check = checkTrigger(t);
    assert.deepEqual(check.errors, [], t.id);
    assert.ok(t.skills.length > 0 || t.responses.length > 0, t.id);
  }
  const bad = checkTrigger({ id: "x", event: "lunch", title: "", skills: ["nope"], responses: ["sleep"] });
  assert.ok(bad.errors.some((e) => /id must start with trg-/.test(e)));
  assert.ok(bad.errors.some((e) => /event must be one of/.test(e)));
  assert.ok(bad.errors.some((e) => /skill ids must be SK-nnn/.test(e)));
  assert.ok(bad.errors.some((e) => /unknown responses/.test(e)));
});

test("S9: only an enabled trigger matches; each response is a proposal with a tab", () => {
  const all = DEFAULT_TRIGGERS.map((t, i) => ({ ...t, createdAt: "", updatedAt: "", enabled: i !== 0 }));
  assert.deepEqual(matchTriggers(all, "new_document"), []);
  assert.equal(matchTriggers(all, "order").length, 1);
  const p = responseProposal("recalculate_deadlines", "the order dated 12.10.2026");
  assert.match(p.detail, /nothing is confirmed/);
  assert.equal(p.tab, "proceedings");
  assert.match(responseProposal("letter", "x").detail, /you decide what is sent/);
});

test("S9: the store seeds the defaults; a fire is written, starts nothing and waits for the advocate", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-trigger-"));
  const store = AdvocateStore.open(dir);
  try {
    assert.equal(store.triggers().length, 10);
    const fires = store.fireTriggers({ event: "new_document", matterId: "matter-a", subject: "new-order.pdf" }, { actor: "agent" });
    assert.equal(fires.length, 1);
    assert.equal(fires[0].state, "proposed");
    assert.deepEqual(fires[0].skills, ["SK-002", "SK-009"]);
    assert.ok(fires[0].responses.includes("rebuild_chronology"));
    assert.equal(store.triggerFires("proposed").length, 1);
    assert.throws(() => store.decideTriggerFire(fires[0].id, "started", { actor: "agent" }), /human|HUMAN/);
    const started = store.decideTriggerFire(fires[0].id, "started", { actor: "advocate" });
    assert.equal(started.state, "started");
    assert.throws(() => store.decideTriggerFire(fires[0].id, "dismissed", { actor: "advocate" }), /DECIDED/);
    const one = store.triggers().find((t) => t.id === "trg-defect")!;
    const saved = store.saveTrigger({ ...one, title: "A defect is returned", responses: ["flag_issues", "letter"] }, { actor: "advocate" });
    assert.deepEqual(saved.responses, ["flag_issues", "letter"]);
    assert.equal(store.setTriggerEnabled("trg-defect", false, { actor: "advocate" }).enabled, false);
    assert.equal(store.fireTriggers({ event: "defect_received", matterId: "m", subject: "defect list" }, { actor: "agent" }).length, 0);
    assert.equal(store.verifyChain().ok, true);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
