/**
 * O9 (harness-build.md HB-1): a side question has no writing tool, the tool policy applies to
 * its calls, and the main conversation does not change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { SIDE_MARKER, SIDE_TOOLS } from "../../src/main/side-questions.ts";
import { WRITING_TOOLS } from "../../src/lib/skills/roles.ts";
import { MATTER, agentFixture } from "./agent-fixture.ts";

type Ctx = { messages: unknown[] };
const isSide = (c: Ctx) => JSON.stringify(c.messages).includes(SIDE_MARKER);

test("a side thread reads with the reading tools only, sees a copy of the chat, and leaves the main conversation as it was", async () => {
  let sources = 0;
  const f = await agentFixture({ host: { listSources: async () => (sources++, []) } });
  try {
    let a = 0;
    f.core.setResponses(Array.from({ length: 20 }, () => ((c: Ctx) => (isSide(c) ? side(c) : a++ === 0 ? fauxAssistantMessage("The matter has no sources yet.") : fauxAssistantMessage("main again"))) as never));
    let sideSaw = "";
    let s = 0;
    function side(c: Ctx) {
      if (s++ === 0) {
        sideSaw = JSON.stringify(c.messages);
        return fauxAssistantMessage([fauxToolCall("list_sources", {})], { stopReason: "toolUse" });
      }
      return fauxAssistantMessage("There are no sources, so nothing was filed yet.");
    }
    await f.agent.send(MATTER, "What is in the matter?");
    const before = await f.agent.getChat(MATTER);
    const session = await f.session();
    const piBefore = session.messages.length;
    const thread = await f.agent.sideAsk(MATTER, null, "Was anything filed?", "Overview tab");
    assert.deepEqual(thread.messages.map((m) => [m.role, m.text]), [["question", "Was anything filed?"], ["answer", "There are no sources, so nothing was filed yet."]]);
    assert.equal(sources, 1);
    // Its tools: reading only, never a writing tool, the plan, helpers or filing.
    assert.ok(thread.tools.length > 0 && thread.tools.every((t) => (SIDE_TOOLS as readonly string[]).includes(t)));
    for (const t of thread.tools) assert.ok(!WRITING_TOOLS.has(t), t);
    for (const t of ["propose_correction", "propose_issue", "plan_set", "start_helper", "run_skill", "submit_filing", "web_search"]) assert.doesNotMatch(sideSaw, new RegExp(`"name":"${t}"`));
    // The copy of the main conversation and the open view are in its prompt.
    assert.match(sideSaw, /What is in the matter\?/);
    assert.match(sideSaw, /Overview tab/);
    // The main conversation did not change.
    const after = await f.agent.getChat(MATTER);
    assert.equal(after.messages.length, before.messages.length);
    assert.equal(session.messages.length, piBefore);
    // A follow-up stays in the same thread; Discard ends it.
    s = 1;
    const next = await f.agent.sideAsk(MATTER, thread.id, "And the drafts?", "Overview tab");
    assert.equal(next.messages.length, 4);
    await f.agent.sideDiscard(MATTER, thread.id);
    assert.deepEqual(await f.agent.sideThreads(MATTER), []);
    await assert.rejects(f.agent.sideAsk(MATTER, thread.id, "again", ""), /SIDE_CLOSED/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("the tool policy applies inside a side thread: a refused tool and an ask are both errors to the side model", async () => {
  const f = await agentFixture({ host: { listSources: async () => [], notebook: async () => ({ events: [], conflicts: [], readiness: { ready: true, jobsPending: 0, openReviewItems: 0 } }) } });
  try {
    await f.agent.getChat(MATTER);
    f.policy.write({ default: "allow", tools: { list_sources: "deny", list_events: "ask" } });
    let s = 0;
    const results: string[] = [];
    f.core.setResponses(
      Array.from({ length: 10 }, () =>
        ((c: Ctx) => {
          if (!isSide(c)) return fauxAssistantMessage("main");
          if (s++ === 0) return fauxAssistantMessage([fauxToolCall("list_sources", {}), fauxToolCall("list_events", {})], { stopReason: "toolUse" });
          results.push(JSON.stringify(c.messages.slice(-2)));
          return fauxAssistantMessage("I could not read them.");
        }) as never,
      ),
    );
    await f.agent.sideAsk(MATTER, null, "List everything.", "");
    assert.match(results[0], /refuses list_sources/);
    assert.match(results[0], /a side question cannot ask for it/);
  } finally {
    await f.agent.disposeAll();
  }
});
