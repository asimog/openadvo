/**
 * The plan, the context meter and Compact now (docs/specs/native-harness-parts.md sections 4
 * and 5), with pi-ai's faux model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { CONTEXT_EVENT, PLAN_EVENT } from "../../src/shared/api.ts";
import { MATTER, agentFixture } from "./agent-fixture.ts";

const last = (c: { messages: unknown[] }) => JSON.stringify(c.messages.at(-1));

test("plan: the agent sets and updates it; the window is told; it is saved; only the advocate clears it", async () => {
  const f = await agentFixture();
  try {
    await f.agent.getChat(MATTER);
    let afterUpdate = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("plan_set", { title: "Draft the SLP", items: ["Read the impugned order", "List the dates", "Draft the grounds"] })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("plan_update", { item: 1, status: "done" }), fauxToolCall("plan_update", { item: 2, status: "ongoing" })], { stopReason: "toolUse" }),
      (c) => {
        afterUpdate = last(c);
        return fauxAssistantMessage("Working on it.");
      },
    ]);
    await f.agent.send(MATTER, "draft the SLP");
    const plan = (await f.agent.getChat(MATTER)).plan;
    assert.equal(plan?.title, "Draft the SLP");
    assert.deepEqual(plan?.items.map((i) => i.status), ["done", "ongoing", "planned"]);
    assert.match(afterUpdate, /1 of 3 done/);
    assert.ok(f.events.some((e) => (e.event as { name?: string }).name === PLAN_EVENT));
    assert.equal(JSON.parse(readFileSync(path.join(f.chatDir, "plan.json"), "utf8")).items.length, 3, "saved in the chat folder");
    await f.agent.clearPlan(MATTER);
    assert.equal((await f.agent.getChat(MATTER)).plan, null);
  } finally {
    await f.agent.disposeAll();
  }
});

test("plan: more than 10 items, or an update with no plan, is an error the model sees", async () => {
  const f = await agentFixture();
  try {
    await f.agent.getChat(MATTER);
    let a = "";
    let b = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("plan_update", { item: 1, status: "done" })], { stopReason: "toolUse" }),
      (c) => {
        a = last(c);
        return fauxAssistantMessage([fauxToolCall("plan_set", { title: "Too long", items: Array.from({ length: 11 }, (_, i) => `step ${i}`) })], { stopReason: "toolUse" });
      },
      (c) => {
        b = last(c);
        return fauxAssistantMessage("ok");
      },
    ]);
    await f.agent.send(MATTER, "go");
    assert.match(a, /"isError":true/);
    assert.match(a, /There is no plan/);
    assert.match(b, /"isError":true/);
    assert.equal((await f.agent.getChat(MATTER)).plan ?? null, null);
  } finally {
    await f.agent.disposeAll();
  }
});

test("the context meter after a run, and Compact now on a short conversation says why nothing happened", async () => {
  const f = await agentFixture();
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses([fauxAssistantMessage("First answer."), fauxAssistantMessage("Second answer."), fauxAssistantMessage("## 1. The task, in the advocate's own words\nhello\n## 6. Next steps\nNone.")]);
    await f.agent.send(MATTER, "hello");
    await f.agent.send(MATTER, "again");
    const meter = (await f.agent.getChat(MATTER)).context;
    assert.ok(meter, "the state carries the meter");
    assert.ok(meter.window > 0, "the context window is known");
    assert.equal(typeof meter.cacheRead, "number");
    assert.ok(f.events.some((e) => (e.event as { name?: string }).name === CONTEXT_EVENT));
    const after = await f.agent.compact(MATTER);
    assert.ok(after.window > 0);
    // Pi does not compact a conversation this short; the advocate is told Pi's reason.
    assert.ok(f.texts("notice").some((t) => t.startsWith("Not compacted: Nothing to compact")));
    const lines = await f.trace();
    assert.ok(lines.some((l) => l.type === "compaction" && l.reason === "manual" && l.failed === true));
    assert.ok(lines.some((l) => l.type === "run_end" && typeof l.cacheRead === "number"));
  } finally {
    await f.agent.disposeAll();
  }
});
