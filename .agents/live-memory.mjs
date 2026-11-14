// One live turn: does a real model use propose_memory_note? Not a test. Usage: node .agents/live-memory.mjs <model>
import { _electron as electron } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const model = process.argv[2] ?? "opencode-go/deepseek-v4.1-flash";
const base = await mkdtemp(path.join(tmpdir(), "oa-live-"));
const env = { ...process.env, OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_MODEL: model };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");
const oa = (fn, ...args) => page.evaluate(([f, a]) => globalThis.openadvo[f](...a), [fn, args]);
const m = await oa("createMatter", "Live memory");
await oa("openMatter", m.id);
await oa("sendChat", m.id, "For this matter, remember this lasting instruction from me: the client does not want interim relief sought. Propose it as a memory note.");
const start = Date.now();
let state;
do {
  await new Promise((r) => setTimeout(r, 2000));
  state = await oa("getChat", m.id);
} while (state.busy && Date.now() - start < 180_000);
const proposals = await oa("listMemoryProposals", m.id);
const memory = await oa("getMemory", m.id);
console.log(JSON.stringify({ busy: state.busy, tools: state.messages.filter((x) => x.role === "tool").map((x) => x.text), proposals: proposals.map((p) => ({ text: p.text, status: p.status })), memoryEmpty: memory.trim() === "" }, null, 2));
await app.close();
