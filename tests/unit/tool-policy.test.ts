/**
 * The tool policy (docs/specs/native-harness-parts.md section 2): the rules, the fixed denials, the approval card, and the review log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { APPROVAL_OPTIONS, PolicyStore, cleanPolicy, decide, DEFAULT_POLICY } from "../../src/main/tool-policy.ts";
import { MATTER, agentFixture, until } from "./agent-fixture.ts";

test("rules: the default, a tool's own rule, and the fixed denials the file cannot loosen", () => {
  const p = { default: "allow" as const, tools: { web_search: "ask" as const, portal_click: "deny" as const, bash: "allow" as const } };
  assert.equal(decide(p, "list_sources", {}).rule, "allow");
  assert.equal(decide(p, "web_search", { query: "x" }).rule, "ask");
  assert.equal(decide(p, "portal_click", {}).rule, "deny");
  assert.equal(decide(p, "bash", { command: "ls" }).rule, "deny", "a built-in tool stays denied even when the file allows it");
  for (const arg of ["C:/Users/x/.pi/agent/auth.json", "/home/x/.env", "/home/x/.env.local", "C:\\x\\.ssh\\id_rsa", "manifest-signing.key", "models.json"]) {
    assert.equal(decide(p, "web_fetch", { url: arg }).rule, "deny", arg);
  }
  assert.equal(decide(p, "web_fetch", { url: "https://indiacode.nic.in/environment" }).rule, "allow", "a word that only looks like .env is not a credential path");
  assert.equal(decide({ default: "ask", tools: {} }, "anything", {}).rule, "ask");
  // MCP rules: per server, then every MCP tool, then the default.
  assert.equal(decide({ default: "allow", tools: { "mcp__court__*": "deny" } }, "mcp__court__search", {}).rule, "deny");
  assert.equal(decide({ default: "allow", tools: { "mcp__court__*": "ask" } }, "mcp__court__search", {}).rule, "ask");
  assert.equal(decide({ default: "allow", tools: { "mcp__*": "ask" } }, "mcp__other__list", {}).rule, "ask");
  assert.equal(decide({ default: "allow", tools: { "mcp__*": "ask" } }, "list_sources", {}).rule, "allow");
  assert.equal(decide({ default: "allow", tools: { "mcp__court__search": "deny", "mcp__court__*": "allow" } }, "mcp__court__search", {}).rule, "deny", "the tool's own rule wins");
});

test("the policy file: defaults on first start; bad values become the defaults", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openadvo-policy-"));
  const store = new PolicyStore(path.join(dir, "tool-policy.json"), path.join(dir, "log.jsonl"));
  store.ensure();
  assert.deepEqual(store.read(), DEFAULT_POLICY);
  assert.deepEqual(cleanPolicy({ default: "maybe", tools: { web_search: "ask", x: "sometimes", "bad name!": "deny" } }), { default: "allow", tools: { web_search: "ask" } });
});

test("deny: the call is refused, the model is told why, and the log has no arguments", async () => {
  const f = await agentFixture({ host: { studio: async () => "should not run" } });
  try {
    await f.agent.getChat(MATTER);
    // The policy is read at every call; a change after the conversation opened applies at once.
    f.policy.write({ default: "allow", tools: { web_search: "deny" } });
    let seen = "";
    f.core.setResponses([
      fauxAssistantMessage([fauxToolCall("web_search", { query: "secret client name" })], { stopReason: "toolUse" }),
      (c) => {
        seen = JSON.stringify(c.messages.at(-1));
        return fauxAssistantMessage("ok");
      },
    ]);
    await f.agent.send(MATTER, "search");
    assert.match(seen, /tool policy refuses web_search/);
    const log = f.policyLog();
    assert.deepEqual(log.map((l) => [l.tool, l.rule, l.outcome]), [["web_search", "deny", "refused"]]);
    assert.ok(!JSON.stringify(log).includes("secret client name"));
  } finally {
    await f.agent.disposeAll();
  }
});

test("ask: the run waits on an approval card; Allow once runs it once, Allow for this conversation keeps it, Refuse blocks it", async () => {
  let ran = 0;
  const f = await agentFixture({ policy: { default: "allow", tools: { web_search: "ask" } }, host: { studio: async () => (ran++, "results") } });
  try {
    await f.agent.getChat(MATTER);
    const call = () => fauxAssistantMessage([fauxToolCall("web_search", { query: "x" })], { stopReason: "toolUse" });
    f.core.setResponses([call(), fauxAssistantMessage("a"), call(), fauxAssistantMessage("b"), call(), fauxAssistantMessage("c"), call(), fauxAssistantMessage("d")]);
    const answerNext = async (choice: string) => {
      await until(() => f.questions().length === 1, "the approval card");
      const q = f.questions()[0];
      assert.equal(q.message, "The agent wants to use Web search. Query: “x”.");
      assert.equal(q.metadata.asker, "Open Advocate");
      assert.deepEqual(q.metadata.options, Object.values(APPROVAL_OPTIONS));
      await f.agent.answerQuestion(MATTER, q.id, choice);
    };
    let run = f.agent.send(MATTER, "1");
    await answerNext("Refuse");
    await run;
    assert.equal(ran, 0, "refused");
    run = f.agent.send(MATTER, "2");
    await answerNext("Allow once");
    await run;
    assert.equal(ran, 1);
    run = f.agent.send(MATTER, "3");
    await answerNext("Allow for this conversation");
    await run;
    assert.equal(ran, 2);
    await f.agent.send(MATTER, "4");
    assert.equal(ran, 3, "no second card in the same conversation");
    assert.deepEqual(f.policyLog().map((l) => l.outcome), ["refuse", "once", "conversation"]);
  } finally {
    await f.agent.disposeAll();
  }
});

test("ask: Stop refuses the waiting call", async () => {
  let ran = 0;
  const f = await agentFixture({ policy: { default: "allow", tools: { web_search: "ask" } }, host: { studio: async () => (ran++, "results") } });
  try {
    await f.agent.getChat(MATTER);
    f.core.setResponses([fauxAssistantMessage([fauxToolCall("web_search", { query: "x" })], { stopReason: "toolUse" }), fauxAssistantMessage("after")]);
    const run = f.agent.send(MATTER, "go");
    await until(() => f.questions().length === 1, "the approval card");
    await f.agent.stop(MATTER);
    await run;
    assert.equal(ran, 0);
    assert.equal(f.questions().length, 0);
  } finally {
    await f.agent.disposeAll();
  }
});
