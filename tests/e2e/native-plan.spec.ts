/**
 * The native plan in the window (docs/specs/native-harness-parts.md section 4): the panel with
 * items, statuses, dependencies and subtasks; its fold to the status line; Clear plan; an item the
 * advocate adds by typing; the rules that block a wrong update; and the plan after a restart.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

type App = Awaited<ReturnType<typeof electron.launch>>;

async function launch(home?: string, userData?: string) {
  const base = home && userData ? path.dirname(home) : await mkdtemp(path.join(tmpdir(), "oa-plan-"));
  const matterRoot = home ?? path.join(base, "matters");
  const data = userData ?? path.join(base, "user-data");
  await mkdir(matterRoot, { recursive: true });
  await mkdir(data, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: matterRoot, OPENADVO_USER_DATA: data, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, home: matterRoot, userData: data };
}

async function newMatter(app: App, page: Page, title: string) {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  return (await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters()) as Array<{ id: string }>))[0].id;
}

async function script(app: App, value: unknown) {
  await app.evaluate(async (_e, s) => (globalThis as any).__openadvoTest.setModelScript(s), value);
}

async function idle(page: Page, matterId: string) {
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
}

test("the plan panel shows statuses, dependencies and subtasks; it folds; Clear plan works", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Plan panel");
  await script(app, {
    agent: [
      {
        tools: [
          {
            name: "plan_set",
            args: {
              title: "Application for condonation",
              items: [
                { text: "Read the record", subtasks: ["Pages 1 to 10", "Pages 11 to 20"], tags: ["record-reader"] },
                { text: "Draft the grounds", depends_on: [1], tags: ["drafter"] },
              ],
            },
          },
        ],
      },
      { text: "The plan is set." },
    ],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Plan the application."]);
  await idle(page, matterId);
  const panel = page.getByTestId("plan-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Application for condonation");
  await expect(page.getByTestId("plan-item-1")).toContainText("Read the record");
  await expect(page.getByTestId("plan-item-1")).toContainText("Pages 1 to 10");
  await expect(page.getByTestId("plan-item-2")).toContainText("Draft the grounds");
  await expect(page.getByTestId("plan-item-2")).toContainText("Waiting");
  await expect(page.getByTestId("plan-item-2")).toContainText("After 1");
  await expect(page.getByTestId("plan-item-1")).toContainText("record-reader");
  await page.screenshot({ path: path.join(repo, "test-results", "plan-panel.png") });

  // The fold: the panel collapses to the pinned status line, which keeps the progress.
  await panel.getByText("Application for condonation").click();
  await expect(page.getByTestId("plan-item-1")).toBeHidden();
  await expect(page.getByTestId("status-line")).toContainText("Plan 0/2");

  // Clear plan is the advocate's own action.
  await panel.getByText("Application for condonation").click();
  await panel.getByRole("button", { name: "Clear plan" }).click();
  await expect(page.getByTestId("plan-panel")).toHaveCount(0);
  await expect(page.getByTestId("status-line")).not.toContainText("Plan ");
  await app.close();
});

test("a dependency blocks a start, a subtask blocks done, and the advocate adds an item by typing", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Plan rules");
  await script(app, {
    agent: [
      {
        tools: [
          {
            name: "plan_set",
            args: {
              title: "Plan",
              items: [
                { text: "Read the record", subtasks: ["First half", "Second half"] },
                { text: "Draft the grounds", depends_on: [1] },
              ],
            },
          },
        ],
      },
      { text: "Set." },
    ],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Plan."]);
  await idle(page, matterId);
  const call = (name: string, params: Record<string, unknown>) =>
    app.evaluate((_e, a) => (globalThis as any).__openadvoTest.callAgentTool(a.m, a.n, a.p), { m: matterId, n: name, p: params });
  await expect(call("plan_update", { item: 2, status: "ongoing" })).rejects.toThrow(/waits for item 1 to be done/);
  await expect(call("plan_update", { item: 1, status: "done" })).rejects.toThrow(/open subtasks/);
  await call("plan_update", { item: 1, subtask: 1, subtask_done: true });
  await call("plan_update", { item: 1, subtask: 2, subtask_done: true });
  await call("plan_update", { item: 1, status: "done" });
  await call("plan_update", { item: 2, status: "ongoing" });
  await expect(page.getByTestId("plan-item-2")).toHaveAttribute("data-status", "ongoing");

  // The advocate types an item; it needs no model run.
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "add to the plan: Check Order XXII"]);
  await expect(page.getByTestId("plan-item-3")).toContainText("Check Order XXII");
  await expect(page.getByTestId("plan-item-3")).toContainText("added by the advocate");
  await app.close();
});

test("Settings sets how strongly the agent is asked to keep a plan", async () => {
  const { app, page } = await launch();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const group = page.getByTestId("plan-strength");
  await expect(group).toBeVisible();
  await group.getByLabel("For most work: almost every task").check();
  expect(await page.evaluate(() => (globalThis as any).openadvo.getPlanStrength())).toBe("most");
  await group.getByLabel("Only for long work: three or more steps").check();
  expect(await page.evaluate(() => (globalThis as any).openadvo.getPlanStrength())).toBe("long");
  await app.close();
});

test("the plan survives a restart", async () => {
  const first = await launch();
  const matterId = await newMatter(first.app, first.page, "Plan restart");
  await script(first.app, {
    agent: [{ tools: [{ name: "plan_set", args: { title: "Filing work", items: [{ text: "Check the limitation" }, { text: "Draft the application", depends_on: [1] }] } }] }, { text: "Set." }],
  });
  await first.page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Plan the filing."]);
  await idle(first.page, matterId);
  // A new conversation keeps the plan.
  await first.page.evaluate((m) => (globalThis as any).openadvo.newConversation(m), matterId);
  const next = await first.page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect((next.plan as { title: string }).title).toBe("Filing work");
  await first.app.evaluate(({ app }) => app.exit(0));
  await first.app.close().catch(() => undefined);

  const second = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: first.home, OPENADVO_USER_DATA: first.userData, OPENADVO_TEST: "1" }) });
  const page = await second.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect((chat.plan as { title: string }).title).toBe("Filing work");
  expect((chat.plan as { items: Array<{ text: string }> }).items.map((i) => i.text)).toEqual(["Check the limitation", "Draft the application"]);
  await second.close();
});
