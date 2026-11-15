/**
 * The extension system after the native rebuild (docs/specs/native-harness-parts.md):
 * the placeholder is the only bundled extension; it loads, registers one command and no tool,
 * can be turned off, and its notice and question reach the chat. No name of the seven packages
 * that became native parts is left in the code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PiExtensions } from "../../src/main/pi-extensions.ts";
import { MATTER, agentFixture, until } from "./agent-fixture.ts";

const repo = path.resolve(import.meta.dirname, "..", "..");
const bundledRoot = path.join(repo, "extensions");
const GONE = ["pi-subagent-manager", "pi-checklist", "pi-permission-system", "pi-context-prune", "pi-context-usage", "pi-cache-graph", "pi-context-decisions"];

function manager(disabled: string[] = []) {
  const agentDir = mkdtempSync(path.join(tmpdir(), "openadvo-pi-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let off = disabled;
  return new PiExtensions({ agentDir, bundledRoot, loadDisabled: () => off, saveDisabled: (ids) => (off = ids) });
}

test("the placeholder is the only bundled extension; it loads with one command and no tool", async () => {
  const ext = manager();
  const loader = await ext.loader({ systemPrompt: "test" });
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  const placeholder = loaded.extensions.find((e) => e.resolvedPath.includes(path.join("extensions", "placeholder")));
  assert.ok(placeholder, "the placeholder loads");
  assert.deepEqual([...placeholder.commands.keys()], ["placeholder"]);
  assert.deepEqual([...placeholder.tools.keys()], [], "it gives the model nothing");
  const list = ext.list();
  assert.deepEqual(list.map((e) => [e.id, e.kind, e.version, e.enabled]), [["openadvo-placeholder", "bundled", "1.0.0", true]]);
});

test("a bundled extension can be turned off", async () => {
  const ext = manager(["openadvo-placeholder"]);
  const loader = await ext.loader({ systemPrompt: "test" });
  assert.ok(!loader.getExtensions().extensions.some((e) => e.resolvedPath.includes(path.join("extensions", "placeholder"))));
  assert.equal(ext.list()[0].enabled, false);
});

test("/placeholder shows a notice, and /placeholder ask asks one question in the chat", async () => {
  const f = await agentFixture({ bundledRoot });
  try {
    await f.agent.getChat(MATTER);
    await f.agent.send(MATTER, "/placeholder");
    assert.ok(f.texts("notice").includes("The placeholder extension works. It adds no tool and reads nothing."));
    const run = f.agent.send(MATTER, "/placeholder ask");
    await until(() => f.questions().length === 1, "the question");
    const q = f.questions()[0];
    assert.equal(q.message, "Placeholder question");
    assert.equal(q.metadata.kind, "confirm");
    assert.equal(q.metadata.asker, undefined, "an extension's question, not an approval");
    await f.agent.answerQuestion(MATTER, q.id, true);
    await run;
    assert.ok(f.texts("notice").includes("Placeholder: you answered yes."));
  } finally {
    await f.agent.disposeAll();
  }
});

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|js|json|yml)$/.test(name)) out.push(p);
  }
  return out;
}

test("no name of the seven packages that became native parts is left in the code or the build", () => {
  const checked = [...files(path.join(repo, "src")), ...files(path.join(repo, "extensions")), ...files(path.join(repo, "scripts")), path.join(repo, "package.json"), path.join(repo, "electron-builder.yml")];
  const hits: string[] = [];
  for (const file of checked) {
    const text = readFileSync(file, "utf8");
    for (const name of GONE) if (text.includes(name)) hits.push(`${path.relative(repo, file)}: ${name}`);
  }
  assert.deepEqual(hits, []);
});
