/**
 * Native helpers (docs/specs/native-harness-parts.md section 3) with pi-ai's faux model. One
 * faux model serves the Matter Agent and its helpers; a router answers each by its prompt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { startHelperTool } from "../../src/main/helpers.ts";
import { MATTER, agentFixture, until } from "./agent-fixture.ts";

type Msg = ReturnType<typeof fauxAssistantMessage>;
const isHelper = (c: { messages: unknown[] }) => JSON.stringify(c.messages).includes("You are a helper agent of Open Advocate");
/** The text of the last tool result the caller saw. */
const lastResult = (c: { messages: unknown[] }) => JSON.stringify(c.messages.at(-1));

function router(agent: (c: { messages: unknown[] }, n: number) => Msg | Promise<Msg>, helper: (c: { messages: unknown[] }, n: number) => Msg | Promise<Msg>) {
  let a = 0;
  let h = 0;
  const step = (c: { messages: unknown[] }) => (isHelper(c) ? helper(c, h++) : agent(c, a++));
  return Array.from({ length: 60 }, () => step as never);
}

test("a helper runs with its type's tools only; its calls carry the nested id; its result returns to the agent", async () => {
  const actors: string[] = [];
  const f = await agentFixture({
    host: {
      listSources: async () => [],
      work: { addAuthority: async (_m: string, _i: unknown, actor: string) => (actors.push(actor), "Recorded as a candidate authority.") } as never,
    },
  });
  try {
    await f.agent.getChat(MATTER);
    const sid = await f.agent.sessionId(MATTER);
    let agentSaw = "";
    let helperSaw = "";
    f.core.setResponses(
      router(
        (c, n) => {
          if (n === 0) return fauxAssistantMessage([fauxToolCall("start_helper", { type: "legal-research", task: "Find the leading case." }, { id: "sh-1" })], { stopReason: "toolUse" });
          agentSaw = lastResult(c);
          return fauxAssistantMessage("Done.");
        },
        (c, n) => {
          if (n === 0) return fauxAssistantMessage([fauxToolCall("add_authority", { citation: "2019 INSC 1", role: "supporting" }), fauxToolCall("propose_issue", { text: "not mine" })], { stopReason: "toolUse" });
          helperSaw = lastResult(c);
          return fauxAssistantMessage("Found one authority: 2019 INSC 1.");
        },
      ),
    );
    await f.agent.send(MATTER, "research");
    assert.deepEqual(actors, [`${sid}/sh-1`], "the helper's write carries <session id>/<start_helper call id>");
    assert.match(helperSaw, /not found|not available|Tool propose_issue/i, "propose_issue is not a legal-research tool");
    assert.match(agentSaw, /legal-research helper result/);
    assert.match(agentSaw, /Found one authority: 2019 INSC 1\./);
    const lines = await f.trace();
    assert.ok(lines.some((l) => l.type === "tool" && l.tool === "add_authority" && l.parent === "sh-1"), "the trace shows the helper's call under its start_helper call");
  } finally {
    await f.agent.disposeAll();
  }
});

test("a helper's calls pass the tool policy", async () => {
  let searched = 0;
  const f = await agentFixture({ policy: { default: "allow", tools: { web_search: "deny" } }, host: { studio: async () => (searched++, "results") } });
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses(
      router(
        (_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("start_helper", { type: "legal-research", task: "Search the web." })], { stopReason: "toolUse" }) : fauxAssistantMessage("ok")),
        (_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("web_search", { query: "x" })], { stopReason: "toolUse" }) : fauxAssistantMessage("Could not search.")),
      ),
    );
    await f.agent.send(MATTER, "go");
    assert.equal(searched, 0);
    assert.deepEqual(f.policyLog().map((l) => [l.tool, l.outcome]), [["web_search", "refused"]]);
  } finally {
    await f.agent.disposeAll();
  }
});

test("helpers of one message run at the same time, and a fifth over the limit fails at once", async () => {
  const f = await agentFixture();
  try {
    await f.agent.getChat(MATTER);
    let inFlight = 0;
    let most = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let agentSaw = "";
    const five = Array.from({ length: 5 }, (_, i) => fauxToolCall("start_helper", { type: "record-reader", task: `Read part ${i}.` }, { id: `h${i}` }));
    f.core.setResponses(
      router(
        (c, n) => {
          if (n === 0) return fauxAssistantMessage(five, { stopReason: "toolUse" });
          agentSaw = JSON.stringify(c.messages.slice(-5));
          return fauxAssistantMessage("ok");
        },
        async () => {
          inFlight++;
          most = Math.max(most, inFlight);
          await gate;
          inFlight--;
          return fauxAssistantMessage("Part read.");
        },
      ),
    );
    const run = f.agent.send(MATTER, "read everything");
    await until(() => inFlight === 4, "four helpers at once");
    open();
    await run;
    assert.equal(most, 4);
    assert.equal((agentSaw.match(/record-reader helper result/g) ?? []).length, 4);
    assert.match(agentSaw, /4 helpers are already running/);
  } finally {
    await f.agent.disposeAll();
  }
});

test("spawn rights: only legal-research starts helpers, and only record-reader helpers", () => {
  const deps = { slots: { running: 0 }, createSession: async () => assert.fail("not started") };
  const enumOf = (t: { parameters: unknown }) => (t.parameters as { properties: { type: { enum: string[] } } }).properties.type.enum;
  assert.deepEqual(enumOf(startHelperTool(deps, { type: null })), ["legal-research", "record-reader", "critic", "drafter"]);
  assert.deepEqual(enumOf(startHelperTool(deps, { type: "legal-research" })), ["record-reader"]);
  for (const t of ["record-reader", "critic", "drafter"]) assert.deepEqual(enumOf(startHelperTool(deps, { type: t })), [], `${t} starts nothing`);
});

test("Stop stops a running helper, and the notice says so", async () => {
  const f = await agentFixture();
  try {
    await f.agent.getChat(MATTER);
    let helperStarted = false;
    f.core.setResponses(
      router(
        (_c, n) => (n === 0 ? fauxAssistantMessage([fauxToolCall("start_helper", { type: "critic", task: "Check the grounds." })], { stopReason: "toolUse" }) : fauxAssistantMessage("after")),
        () => {
          helperStarted = true;
          return new Promise<Msg>(() => undefined);
        },
      ),
    );
    const run = f.agent.send(MATTER, "check");
    await until(() => helperStarted, "the helper's model call");
    assert.equal(await f.agent.stop(MATTER), true);
    await run;
    assert.ok(f.texts("notice").includes("Stopped by the advocate. 1 helper agent stopped."));
    assert.equal((await f.agent.getChat(MATTER)).busy, false);
  } finally {
    await f.agent.disposeAll();
  }
});
