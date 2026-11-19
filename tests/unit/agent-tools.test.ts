/**
 * The agent's legal tool surface: one retrieval tool and one memorandum tool. The discovery
 * tools find a source to open; they are not retrieval. This test keeps a second search or a
 * second unverified memorandum from returning.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS } from "../../src/main/agent.ts";
import { READ_LAW_TOOLS, ROLE_TABLE, WRITING_TOOLS } from "../../src/lib/skills/roles.ts";

test("the agent has one legal retrieval tool and explicit discovery tools", () => {
  const tools: string[] = [...AGENT_TOOLS];
  assert.ok(tools.includes("search_knowledge"), "search_knowledge is the retrieval tool");
  assert.ok(tools.includes("discover_judgments"), "judgment discovery is named as discovery");
  assert.ok(tools.includes("discover_statutes"), "statute discovery is named as discovery");
  assert.ok(tools.includes("read_judgment"), "a discovered judgment is opened by ref");
  assert.ok(tools.includes("read_statute_section"), "a discovered statute is opened by id");
  assert.ok(tools.includes("import_case_documents"), "a case number can become sources");
  assert.ok(tools.includes("rebuild_notebook"), "the Notebook extraction can be re-run");
  assert.ok(!tools.includes("search_judgments"), "no second judgment search");
  assert.ok(!tools.includes("search_statutes"), "no second statute search");
  const searches = tools.filter((name) => name.startsWith("search_"));
  assert.deepEqual(searches.sort(), ["search_citation_index", "search_knowledge", "search_sources"], "only the matter, source and legal retrieval searches remain");
});

test("the agent has one memorandum tool and it verifies its grounding", () => {
  const tools: string[] = [...AGENT_TOOLS];
  assert.ok(tools.includes("write_research_memo"));
  assert.ok(!tools.includes("write_memorandum"), "the unverified memorandum tool is gone");
  assert.equal(tools.filter((name) => name.endsWith("_memo") || name.includes("memorandum")).length, 1, "one memorandum tool");
});

test("the law role and its skills see the discovery names, never the old search names", () => {
  assert.ok(READ_LAW_TOOLS.includes("discover_judgments"));
  assert.ok(READ_LAW_TOOLS.includes("discover_statutes"));
  assert.ok(!(READ_LAW_TOOLS as readonly string[]).includes("search_judgments"));
  assert.ok(!(READ_LAW_TOOLS as readonly string[]).includes("search_statutes"));
  const agentTools: string[] = [...AGENT_TOOLS];
  for (const name of READ_LAW_TOOLS) assert.ok(agentTools.includes(name), `${name} is a tool of the agent`);
  assert.ok(ROLE_TABLE.research.tools.includes("write_research_memo"));
  assert.ok(!ROLE_TABLE.research.tools.includes("write_memorandum"));
  assert.ok(WRITING_TOOLS.has("write_research_memo"));
  assert.ok(!WRITING_TOOLS.has("write_memorandum"));
});
