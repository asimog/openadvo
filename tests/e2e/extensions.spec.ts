/**
 * The extension system in the window, after the native rebuild (docs/specs/native-harness-parts.md):
 * the placeholder is listed and turns off and on; its command shows a notice; its question is
 * answered in the chat (H-12); and Settings → Tool permissions saves a rule to the policy file.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

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

test("Settings lists the placeholder extension, which turns off and on, and saves a tool permission", async () => {
  const { app, page, userData } = await launch();
  await page.getByRole("button", { name: "Settings" }).click();
  const panel = page.getByTestId("pi-extensions");
  await expect(panel.getByTestId("pi-extension-openadvo-placeholder")).toBeVisible();
  const box = panel.getByTestId("pi-extension-openadvo-placeholder").getByRole("checkbox");
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  expect((await page.evaluate(() => (globalThis as any).openadvo.listExtensions())).map((x: any) => x.id)).toEqual(["openadvo-placeholder"]);

  // Tool permissions: the policy file is in user data; a rule chosen in the window is saved there.
  const policyFile = path.join(userData, "tool-policy.json");
  expect(existsSync(policyFile)).toBe(true);
  const perms = page.getByTestId("tool-permissions");
  await expect(perms.getByTestId("tool-rule-web_search")).toBeVisible();
  await perms.getByLabel("Rule for Web search").selectOption("ask");
  await expect(perms).toContainText("Saved.");
  expect(JSON.parse(readFileSync(policyFile, "utf8")).tools).toEqual({ web_search: "ask" });
  await page.screenshot({ path: path.join(repo, "test-results", "tool-permissions.png") });
  expect(await app.evaluate(() => process.env.PI_CODING_AGENT_DIR)).toBe(path.join(userData, "pi-agent"));
  await app.close();
});

test("H-12: the placeholder's command and its question work in the chat; Stop closes a waiting question", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Extension questions");
  const card = page.getByTestId("extension-question");
  const send = (text: string) => page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, text]);

  await send("/placeholder");
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toContain("The placeholder extension works. It adds no tool and reads nothing.");

  // confirm, answered Yes.
  const first = send("/placeholder ask");
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveAttribute("data-kind", "confirm");
  await expect(card).toContainText("An extension asks");
  await expect(card).toContainText("Placeholder question");
  await expect(page.getByText("Working…")).toBeVisible();
  await page.screenshot({ path: path.join(repo, "test-results", "extension-question-confirm.png") });
  await card.getByRole("button", { name: "Yes" }).click();
  await first;
  await expect(card).toHaveCount(0);
  expect(await notices(page, matterId)).toContain("Placeholder: you answered yes.");

  // Dismissed: the default answer is no.
  const second = send("/placeholder ask");
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByRole("button", { name: "Dismiss" }).click();
  await second;
  await expect(card).toHaveCount(0);
  expect(await notices(page, matterId)).toContain("Placeholder: you answered no, or dismissed the question.");

  // A wrong answer is refused by the bridge, and the question stays open.
  const third = send("/placeholder ask");
  await expect(card).toBeVisible({ timeout: 30000 });
  const qid = (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).questions[0].id;
  await expect(page.evaluate(([m, q]) => (globalThis as any).openadvo.answerExtensionQuestion(m, q, "yes"), [matterId, qid])).rejects.toThrow(/BAD_ANSWER/);
  await expect(card).toBeVisible();

  // Stop while a question waits: the question closes with its default answer and the run ends.
  await page.getByRole("button", { name: "Stop" }).click();
  await third;
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Working…")).toHaveCount(0);
  expect((await notices(page, matterId)).filter((t) => t === "Placeholder: you answered yes.")).toHaveLength(1);
  await app.close();
});
