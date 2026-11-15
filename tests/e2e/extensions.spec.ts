/**
 * Decision 22: the Pi extensions in the window. Settings lists the bundled extensions; an
 * extension command typed in a matter's chat runs and shows its output as text.
 * Needs npm run vendor:extensions.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const vendored = existsSync(path.join(repo, "resources", "pi-extensions", "vendor.lock.json"));
const BUNDLED = ["pi-subagent-manager", "pi-context-decisions", "pi-checklist", "pi-context-prune", "pi-context-usage", "pi-cache-graph", "@gotgenes/pi-permission-system"];

async function launch() {
  const base = await mkdtemp(path.join(tmpdir(), "oa-ext-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, userData };
}

test("settings lists the bundled Pi extensions, and one can be turned off and on", async () => {
  test.skip(!vendored, "run npm run vendor:extensions");
  const { app, page } = await launch();
  await page.getByRole("button", { name: "Settings" }).click();
  const panel = page.getByTestId("pi-extensions");
  await expect(panel).toBeVisible();
  for (const name of BUNDLED) await expect(panel.getByTestId(`pi-extension-${name}`)).toBeVisible();
  const box = panel.getByTestId("pi-extension-pi-cache-graph").getByRole("checkbox");
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
  expect((await page.evaluate(() => (globalThis as any).openadvo.listExtensions())).find((x: any) => x.id === "pi-cache-graph").enabled).toBe(false);
  await box.click();
  await expect(box).toBeChecked();
  await app.close();
});

test("an extension command typed in the chat runs and shows its output", async () => {
  test.skip(!vendored, "run npm run vendor:extensions");
  const { app, page, userData } = await launch();
  // Decisions 23 and 24: Pi's agent folder is the app's own, and the permission policy is written there.
  const policyFile = path.join(userData, "pi-agent", "extensions", "pi-permission-system", "config.json");
  expect(existsSync(policyFile)).toBe(true);
  expect(await app.evaluate(() => process.env.PI_CODING_AGENT_DIR)).toBe(path.join(userData, "pi-agent"));
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill("Extension command");
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Extension command" })).toBeVisible();
  const id = await app.evaluate(() => (globalThis as any).__openadvoTest.lastMatterId?.() ?? null);
  const matterId = id ?? (await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters())[0].id));
  await page.evaluate((m) => (globalThis as any).openadvo.sendChat(m, "/context"), matterId);
  const log = page.getByTestId("chat-log");
  await expect(log.locator("[data-role=notice]").last()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(repo, "test-results", "extension-command.png") });
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  const notices = chat.messages.filter((x: any) => x.role === "notice").map((x: any) => x.text);
  console.log(JSON.stringify(notices, null, 1).slice(0, 3000));
  expect(notices.length).toBeGreaterThan(0);
  await app.close();
});

/** A new matter in the window; returns its id. */
async function newMatter(app: Awaited<ReturnType<typeof launch>>["app"], page: Awaited<ReturnType<typeof launch>>["page"], title: string) {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  const id = await app.evaluate(() => (globalThis as any).__openadvoTest.lastMatterId?.() ?? null);
  return (id ?? (await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters())[0].id))) as string;
}

async function notices(page: Awaited<ReturnType<typeof launch>>["page"], matterId: string): Promise<string[]> {
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  return chat.messages.filter((x: any) => x.role === "notice").map((x: any) => x.text);
}

test("H-12: an extension's questions are answered in the chat, and the extension waits for the answer", async () => {
  test.skip(!vendored, "run npm run vendor:extensions");
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Extension questions");
  const card = page.getByTestId("extension-question");
  const send = (text: string) => page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, text]);

  // confirm, answered Yes: pi-checklist clears and says so.
  const first = send("/checklist clear");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveAttribute("data-kind", "confirm");
  await expect(card).toContainText("Clear checklist?");
  await expect(page.getByText("Working…")).toBeVisible();
  const open = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect(open.questions).toHaveLength(1);
  expect(open.questions[0]).toMatchObject({ reason: "openadvo.extension_question", message: "Clear checklist?", responseSchema: { type: "boolean" } });
  await page.screenshot({ path: path.join(repo, "test-results", "extension-question-confirm.png") });
  await card.getByRole("button", { name: "Yes" }).click();
  await first;
  await expect(card).toHaveCount(0);
  expect(await notices(page, matterId)).toContain("checklist cleared");

  // confirm, dismissed: the default answer is no, so nothing is cleared.
  const second = send("/checklist clear");
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByRole("button", { name: "Dismiss" }).click();
  await second;
  await expect(card).toHaveCount(0);
  expect((await notices(page, matterId)).filter((t) => t === "checklist cleared")).toHaveLength(1);

  // select: pi-context-prune runs the chosen subcommand.
  const third = send("/pruner");
  await expect(card).toHaveAttribute("data-kind", "select", { timeout: 30000 });
  await page.screenshot({ path: path.join(repo, "test-results", "extension-question-select.png") });
  await card.getByRole("button", { name: /^stats/ }).click();
  await third;
  expect((await notices(page, matterId)).some((t) => t.startsWith("pruner stats"))).toBe(true);

  // A wrong answer is refused by the bridge, and the question stays open.
  const fourth = send("/checklist clear");
  await expect(card).toBeVisible({ timeout: 30000 });
  const qid = (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).questions[0].id;
  await expect(page.evaluate(([m, q]) => (globalThis as any).openadvo.answerExtensionQuestion(m, q, "yes"), [matterId, qid])).rejects.toThrow(/BAD_ANSWER/);
  await expect(card).toBeVisible();

  // Stop while a question waits: the question closes with its default answer and the run ends.
  await page.getByRole("button", { name: "Stop" }).click();
  await fourth;
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Working…")).toHaveCount(0);
  expect((await notices(page, matterId)).filter((t) => t === "checklist cleared")).toHaveLength(1);
  expect(await notices(page, matterId)).toContain("Stopped by the advocate.");
  await app.close();
});
