/**
 * The native tool policy in the window (docs/specs/native-harness-parts.md section 2): a deny is
 * refused with a text line and the tool is hidden from the next conversation; an ask shows the card
 * with the query; each choice works; the party rule asks; Settings changes a rule.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

type App = Awaited<ReturnType<typeof electron.launch>>;

async function launch(extra: Record<string, string> = {}) {
  const base = await mkdtemp(path.join(tmpdir(), "oa-policy-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1", ...extra }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, userData, home };
}

async function newMatter(app: App, page: Awaited<ReturnType<typeof launch>>["page"], title: string) {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  return (await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters()) as Array<{ id: string }>))[0].id;
}

async function script(app: App, value: unknown) {
  await app.evaluate(async (_e, s) => (globalThis as any).__openadvoTest.setModelScript(s), value);
}

async function notices(page: Awaited<ReturnType<typeof launch>>["page"], matterId: string): Promise<string[]> {
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  return (chat.messages as Array<{ role: string; text: string }>).filter((x) => x.role === "notice").map((x) => x.text);
}

async function idle(page: Awaited<ReturnType<typeof launch>>["page"], matterId: string) {
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
}

async function seen(app: App): Promise<Array<{ queue: string; last: string }>> {
  return app.evaluate(async () => (globalThis as any).__openadvoTest.modelSeen()) as never;
}

test("a deny is refused with a text line, and the tool is hidden from the next conversation", async () => {
  const { app, page, home } = await launch();
  const matterId = await newMatter(app, page, "Policy deny");
  await page.evaluate((p) => (globalThis as any).openadvo.setToolPolicy(p), { default: "allow", tools: { web_search: "deny" } });
  await script(app, { agent: [{ tools: [{ name: "web_search", args: { query: "the order" } }] }, { text: "I could not search." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Search the web."]);
  await idle(page, matterId);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("The tool policy refused Web search.")]));
  const requests = await seen(app);
  expect(requests.some((r) => r.last.includes("tool policy refuses web_search"))).toBe(true);
  // The trace has a policy line for the deny.
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const folder = readdirSync(home).map((d) => path.join(home, d)).find((d) => existsSync(path.join(d, "chat", "trace.jsonl")));
  expect(folder).toBeTruthy();
  const trace = readFileSync(path.join(folder!, "chat", "trace.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(trace.some((l) => l.type === "policy" && l.tool === "web_search" && l.rule === "deny")).toBe(true);

  // Hidden before the next run: the model never sees the tool again.
  await page.evaluate((m) => (globalThis as any).openadvo.newConversation(m), matterId);
  const names = await app.evaluate(async (_e, m) => (globalThis as any).__openadvoTest.agentToolNames(m), matterId);
  expect(names).not.toContain("web_search");
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Refused by the tool policy, so hidden from the agent: web_search")]));
  await app.close();
});

test("an ask shows the card with the query, and each choice works; one approval at a time", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Policy ask");
  await page.evaluate((p) => (globalThis as any).openadvo.setToolPolicy(p), { default: "allow", tools: { web_search: "ask" } });
  const card = page.getByTestId("approval-card");
  const send = (text: string) => page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, text]);

  // Refuse: the card names the query.
  await script(app, { agent: [{ tools: [{ name: "web_search", args: { query: "the impugned order" } }] }, { text: "Refused." }] });
  const refused = send("Search.");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toContainText("The agent wants to use Web search. Query: “the impugned order”.");
  await card.getByRole("button", { name: "Refuse" }).click();
  await refused;
  await idle(page, matterId);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("The advocate refused Web search.")]));

  // Two calls in one message wait in a queue: one card, then the next after the first answer.
  await page.evaluate((p) => (globalThis as any).openadvo.setToolPolicy(p), { default: "allow", tools: { list_sources: "ask" } });
  await script(app, {
    agent: [{ tools: [{ name: "list_sources", args: {} }, { name: "list_sources", args: {} }] }, { text: "Both listed." }],
  });
  const queued = send("List the sources twice.");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toContainText("List sources");
  await card.getByRole("button", { name: "Allow once" }).click();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByRole("button", { name: "Allow for this conversation" }).click();
  await queued;
  await idle(page, matterId);

  // The conversation-wide answer holds: no third card.
  await script(app, { agent: [{ tools: [{ name: "list_sources", args: {} }] }, { text: "Listed." }] });
  await send("List once more.");
  await idle(page, matterId);
  await expect(card).toHaveCount(0);
  await app.close();
});

test("the party rule asks when a web query names a party of the matter", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Party rule");
  const contact = await page.evaluate(async () => (await (globalThis as any).openadvo.addContact({ name: "Acme Steel", kind: "opposing_party" })) as { id: string });
  await page.evaluate(([m, c]) => (globalThis as any).openadvo.addParty(m, c, "opposing", "Acme Steel"), [matterId, contact.id]);
  // A new conversation reads the parties of the matter.
  await page.evaluate((m) => (globalThis as any).openadvo.newConversation(m), matterId);
  const card = page.getByTestId("approval-card");
  await script(app, { agent: [{ tools: [{ name: "web_search", args: { query: "Acme Steel v State latest order" } }] }, { text: "No search." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Search the party."]);
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toContainText("names Acme Steel, a party to this matter");
  await card.getByRole("button", { name: "Refuse" }).click();
  await idle(page, matterId);

  // The party rule can be turned off in Settings: the same query then runs without a card.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByLabel("Ask when a web search or a web page names a party");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByTestId("tool-permissions")).toContainText("Saved.");
  await page.getByRole("button", { name: "Party rule", exact: true }).click();
  await page.evaluate((m) => (globalThis as any).openadvo.newConversation(m), matterId);
  await script(app, { agent: [{ tools: [{ name: "web_search", args: { query: "Acme Steel v State latest order" } }] }, { text: "No card." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Search the party again."]);
  await idle(page, matterId);
  await expect(card).toHaveCount(0);
  await app.close();
});

test("an unanswered approval for a background helper refuses after the timeout", async () => {
  const { app, page } = await launch({ OPENADVO_TEST_APPROVAL_TIMEOUT_MS: "1200" });
  const matterId = await newMatter(app, page, "Approval timeout");
  await page.evaluate((p) => (globalThis as any).openadvo.setToolPolicy(p), { default: "allow", tools: { web_search: "ask" } });
  await script(app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "legal-research", task: "Search the web for the order.", background: true, name: "Web helper" } }] }, { text: "Started." }],
    helper: [{ tools: [{ name: "web_search", args: { query: "the order" } }] }, { text: "The search was refused." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Search in the background."]);
  const card = page.getByTestId("approval-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("The approval for Web search timed out, so the call was refused.")]));
  await expect(page.getByTestId("status-line").getByRole("button", { name: "Use results" })).toBeVisible({ timeout: 30000 });
  await app.close();
});

test("Settings changes a tool rule and the next conversation uses it", async () => {
  const { app, page, userData } = await launch();
  const matterId = await newMatter(app, page, "Policy settings");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const perms = page.getByTestId("tool-permissions");
  await perms.getByLabel("Rule for List sources").selectOption("ask");
  await expect(perms).toContainText("Saved.");
  const file = path.join(userData, "tool-policy.json");
  const { readFileSync } = await import("node:fs");
  expect(JSON.parse(readFileSync(file, "utf8")).tools).toEqual({ list_sources: "ask" });
  // Back to the matter, whose conversation takes the new rule.
  await page.getByRole("button", { name: "Policy settings", exact: true }).click();
  await expect(page.getByTestId("chat-dock")).toBeVisible();
  await page.evaluate((m) => (globalThis as any).openadvo.newConversation(m), matterId);
  await script(app, { agent: [{ tools: [{ name: "list_sources", args: {} }] }, { text: "Allowed." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "List the sources."]);
  const card = page.getByTestId("approval-card");
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByRole("button", { name: "Refuse" }).click();
  await idle(page, matterId);
  await app.close();
});
