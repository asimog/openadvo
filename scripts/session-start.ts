/**
 * The start check for a coding-agent work session (docs/agent-guide.md section 1).
 * It answers, from the repository alone: can the project start, can it be tested, where is
 * the work, and what did the last session hand over. It prints facts and changes nothing.
 *
 *   npm run session:start            Node, git, vendored parts, Pi reference, type check
 *   npm run session:start -- --unit  also the unit tests
 *   npm run session:start -- --quick no type check
 *
 * Exit code 1 when Node is too old, node_modules is missing, or a check that ran failed.
 * Missing vendored parts are warnings: the tests that need them skip with a message.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const failures: string[] = [];
const warnings: string[] = [];

function line(label: string, value: string): void {
  console.log(`${label.padEnd(22)} ${value}`);
}

function run(command: string, commandArgs: string[]): { status: number | null; out: string } {
  // npm is a script on Windows and needs the shell (agent-guide pitfall 7); git does not.
  const shell = command === "npm" && process.platform === "win32";
  const r = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", shell });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function newest(dir: string, count: number, filter: (name: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => filter(name) && statSync(path.join(dir, name)).isFile())
    .map((name) => ({ name, time: statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .slice(0, count)
    .map((e) => path.relative(root, path.join(dir, e.name)).split(path.sep).join("/"));
}

function hasContent(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

console.log("Open Advocate: session start check\n");

// Tools.
const engines = (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { engines?: { node?: string } }).engines?.node ?? "";
const need = /(\d+)\.(\d+)/.exec(engines);
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeOk = !need || major > Number(need[1]) || (major === Number(need[1]) && minor >= Number(need[2]));
line("Node", `${process.versions.node} (needs ${engines || "any"})${nodeOk ? "" : "  FAIL"}`);
if (!nodeOk) failures.push(`Node ${process.versions.node} is older than ${engines}`);
if (!existsSync(path.join(root, "node_modules"))) failures.push("node_modules is missing: run npm install");

// Git.
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).out;
const head = run("git", ["log", "-1", "--format=%h %s"]).out;
const dirty = run("git", ["status", "--porcelain"]).out;
line("Branch", branch);
line("Last commit", head);
line("Working tree", dirty ? `${dirty.split("\n").length} changed paths (read git status before you start)` : "clean");
if (dirty) warnings.push("the working tree has changes from an earlier session");

// Vendored parts (docs/agent-guide.md section 3).
const vendored: [string, string, string][] = [
  ["Euro-Office", "resources/euro-office", "npm run vendor"],
  ["ulos validator", "resources/ulos", "npm run vendor:ulos"],
  ["PP-OCR models", "resources/models/ppocr", "npm run vendor:ocr"],
  ["Whisper model", "resources/models/Xenova", "npm run vendor:voice"],
  ["Pi extensions", "resources/pi-extensions/node_modules", "npm run vendor:extensions"],
];
for (const [name, rel, fix] of vendored) {
  const ok = hasContent(path.join(root, rel));
  line(name, ok ? "present" : `missing (${fix})`);
  if (!ok) warnings.push(`${name} is missing; its tests skip`);
}

// The Pi reference folder (docs/repo-map.md).
const piReference = process.env.PI_REFERENCE ?? path.resolve(root, "..", "pireference");
const piReferenceOk = existsSync(path.join(piReference, "REFERENCE.md"));
line("Pi reference", piReferenceOk ? piReference : `missing at ${piReference}`);
if (!piReferenceOk) warnings.push("the Pi reference folder is missing; see docs/repo-map.md");

// Where the work stands.
console.log("");
const prompts = newest(path.join(root, ".agents", "prompts"), 1, (n) => n.endsWith(".md"));
const logs = newest(path.join(root, ".agents", "logs"), 3, (n) => n.endsWith(".md"));
const notes = newest(path.join(root, ".agents", "logs"), 1, (n) => n.endsWith("-notes-for-agents.md"));
line("Newest prompt", prompts[0] ?? "none");
line("Notes for agents", notes[0] ?? "none");
logs.forEach((l, i) => line(i === 0 ? "Newest logs" : "", l));

// Checks that run.
console.log("");
if (!args.has("--quick") && failures.length === 0) {
  const tc = run("npm", ["run", "typecheck"]);
  line("Type check", tc.status === 0 ? "exit 0" : `exit ${tc.status}  FAIL`);
  if (tc.status !== 0) {
    failures.push("npm run typecheck failed");
    console.log(tc.out.split("\n").slice(-20).join("\n"));
  }
}
if (args.has("--unit") && failures.length === 0) {
  const unit = run("npm", ["run", "test:unit"]);
  const counts = ["tests", "pass", "fail", "skipped"]
    .map((k) => new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(unit.out)?.[1])
    .map((v, i) => `${["tests", "pass", "fail", "skipped"][i]} ${v ?? "?"}`)
    .join(", ");
  line("Unit tests", `exit ${unit.status}; ${counts}${unit.status === 0 ? "" : "  FAIL"}`);
  if (unit.status !== 0) failures.push("npm run test:unit failed");
}

console.log("");
for (const w of warnings) console.log(`warning: ${w}`);
for (const f of failures) console.error(`FAIL: ${f}`);
console.log(failures.length === 0 ? "Ready. Read the newest prompt, then the notes for agents." : "Not ready. Fix the failures first.");
process.exit(failures.length === 0 ? 0 : 1);
