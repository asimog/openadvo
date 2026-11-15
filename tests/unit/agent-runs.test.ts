/**
 * The agent framework (docs/specs/agent-framework.md) with pi-ai's faux model:
 * one listener per session (H-25, defect B1-1), nested writes carry their own actor id (B1-4),
 * a failed Studio call is an error, the run trace, the tool rules of section 6, and the context
 * meter of native-harness-parts section 5. Helpers have their own tests (helpers.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { AgentHost } from "../../src/main/agent.ts";
import { MATTER, agentFixture, until } from "./agent-fixture.ts";

/** A tool that calls another tool through Pi, as a codemode script or a helper does. */
const nestedCaller: InlineExtension = {
  name: "nested-caller",
  factory: (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "nested_caller",
      label: "nested_caller",
      description: "test: runs propose_issue through ctx.executeTool",
      parameters: Type.Object({}),
      execute: async (_id, _p, _s, _u, ctx) => {
        const out = await (ctx as unknown as { executeTool: (n: string, a: unknown) => Promise<{ isError: boolean }> }).executeTool("propose_issue", { text: "Nested issue" });
        return { content: [{ type: "text", text: out.isError ? "failed" : "done" }], details: {} };
      },
    });
  },
};

async function fixture() {
  const actors: string[] = [];
  let studio: (tool: string) => Promise<string> = async () => "ok";
  const host: Partial<AgentHost> = {
    studio: async (_m, tool) => studio(tool),
    notebook: async () => ({ events: Array.from({ length: 3000 }, (_, i) => ({ id: `e${i}`, dateStart: "2020-01-01", dateEnd: "2020-01-01", dateType: "exact", kind: "factual", status: "confirmed", text: `Event number ${i} with some words`, excluded: false, conflicts: [], anchor: null })), readiness: { ready: true, jobsPending: 0, openReviewItems: 0 } }) as never,
    work: {
      proposeIssue: async (_m: string, _t: string, actor: string) => {
        actors.push(actor);
        return "Recorded.";
      },
    } as never,
  };
  const f = await agentFixture({ host, inlineExtensions: [nestedCaller], provider: "faux-runs" });
  return { ...f, actors, setStudio: (fn: typeof studio) => (studio = fn) };
}

test("B1-1 (H-25): a turn that a helper's result starts is a run the window sees, saves and counts", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const s = await f.session();
    f.core.setResponses([fauxAssistantMessage("The helper found two authorities.")]);
    // An extension that hands work back with sendMessage(triggerTurn) starts a turn like this.
    await s.sendCustomMessage({ customType: "subagent-result", content: "Helper result", display: true }, { triggerTurn: true });
    await until(() => f.count("RUN_FINISHED") === 1, "the run to finish");
    assert.equal(f.count("RUN_STARTED"), 1);
    const chat = await f.agent.getChat(MATTER);
    assert.equal(chat.busy, false);
    assert.equal(chat.messages.filter((m) => m.role === "agent").at(-1)?.text, "The helper found two authorities.");
    assert.equal(f.usage.length, 1, "the usage of the run is recorded");
    const saved = JSON.parse(readFileSync(path.join(f.chatDir, "messages.json"), "utf8")) as Array<{ text: string }>;
    assert.ok(saved.some((m) => m.text === "The helper found two authorities."), "the run is saved");
  } finally {
    await f.agent.disposeAll();
  }
});

test("B1-4: a write made through another tool carries <session id>/<parent call id>", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const sessionId = await f.agent.sessionId(MATTER);
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("propose_issue", { text: "Own issue" }, { id: "own-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("nested_caller", {}, { id: "spawn-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    await f.agent.send(MATTER, "go");
    assert.deepEqual(f.actors, [sessionId, `${sessionId}/spawn-1`]);
  } finally {
    await f.agent.disposeAll();
  }
});

test("a failed Studio call is an error to the model and the window, and the trace records it", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    f.setStudio(async () => {
      throw new Error("SOURCE_UNREACHABLE: India Code did not answer");
    });
    let seen = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("search_statutes", { query: "section 483" }, { id: "st-1" })], { stopReason: "toolUse" }),
      (context) => {
        seen = JSON.stringify(context.messages.at(-1));
        return fauxAssistantMessage("It failed.");
      },
    ]);
    await f.agent.send(MATTER, "find it");
    assert.match(seen, /"isError":true/);
    assert.match(seen, /SOURCE_UNREACHABLE/);
    // The tool row changes in place to failed, with the error and its duration.
    const row = (await f.agent.getChat(MATTER)).messages.find((m) => m.id === "st-1");
    assert.equal(row?.tool?.status, "error");
    assert.match(row?.tool?.error ?? "", /SOURCE_UNREACHABLE/);
    assert.equal(typeof row?.tool?.durationMs, "number");
    const lines = await f.trace();
    const call = lines.find((l) => l.type === "tool" && l.callId === "st-1");
    assert.equal(call?.error, true);
    assert.equal(typeof call?.ms, "number");
    assert.ok(lines.some((l) => l.type === "run_start") && lines.some((l) => l.type === "run_end"));
    assert.ok(!JSON.stringify(lines).includes("section 483"), "the trace holds no tool arguments");
  } finally {
    await f.agent.disposeAll();
  }
});

test("Stop ends a tool call that does not return", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    let called = false;
    f.setStudio(() => {
      called = true;
      return new Promise<string>(() => undefined);
    });
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("web_search", { query: "x" })], { stopReason: "toolUse" }), fauxAssistantMessage("after")]);
    const run = f.agent.send(MATTER, "search");
    await until(() => called, "the tool call");
    await f.agent.stop(MATTER);
    await run;
    const chat = await f.agent.getChat(MATTER);
    assert.equal(chat.busy, false);
  } finally {
    await f.agent.disposeAll();
  }
});

test("tool rules: long results are cut with a hint; reading tools are read-only; writers are sequential", async () => {
  const f = await fixture();
  try {
    await f.agent.getChat(MATTER);
    const s = await f.session();
    const def = (name: string) => s.getToolDefinition(name) as unknown as { annotations?: { readOnlyHint?: boolean }; executionMode?: string };
    assert.equal(def("read_source_text").annotations?.readOnlyHint, true);
    assert.equal(def("get_chronology").annotations?.readOnlyHint, true);
    assert.equal(def("propose_correction").executionMode, "sequential");
    assert.equal(def("propose_paragraph").executionMode, "sequential");
    assert.notEqual(def("propose_correction").annotations?.readOnlyHint, true);
    // The Matter Agent's context strategy is loaded (spec section 7).
    assert.equal(s.extensionRunner.hasHandlers("context"), true);
    assert.equal(s.extensionRunner.hasHandlers("session_before_compact"), true);
    assert.equal(s.settingsManager.getCompactionSettings().keepRecentTokens, 30_000);
    let seen = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("get_chronology", {})], { stopReason: "toolUse" }),
      (context) => {
        seen = JSON.stringify(context.messages.at(-1));
        return fauxAssistantMessage("ok");
      },
    ]);
    await f.agent.send(MATTER, "chronology");
    assert.ok(seen.length < 60_000, `the result is bounded (${seen.length} characters)`);
    assert.match(seen, /Output cut at/);
  } finally {
    await f.agent.disposeAll();
  }
});
