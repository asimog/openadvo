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
