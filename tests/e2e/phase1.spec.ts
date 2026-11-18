/**
 * Phase 1 in the window (docs/specs/harness-and-stores.md section 7), with the scripted model:
 * the exit path of build-plan.md phase 1 (the plan card before long work, a skill run with its
 * context package and report card, a side question, the Jobs view), then the navigation, the
 * Review Inbox across matters, Workflows & Skills, the advocate profile and the store records.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
type App = Awaited<ReturnType<typeof electron.launch>>;

async function launch() {
  const base = await mkdtemp(path.join(tmpdir(), "oa-phase1-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, base };
}

async function newMatter(page: Page, title: string): Promise<string> {
  await page.getByRole("button", { name: "New matter" }).first().click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  const all = (await page.evaluate(() => (globalThis as any).openadvo.listMatters())) as Array<{ id: string; title: string }>;
  return all.find((m) => m.title === title)!.id;
}

async function script(app: App, value: unknown) {
  await app.evaluate(async (_e, s) => (globalThis as any).__openadvoTest.setModelScript(s), value);
}

async function idle(page: Page, matterId: string) {
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
}

const out = (v: unknown) => "The output:\n```json\n" + JSON.stringify(v) + "\n```";

test("the phase 1 exit path: plan card and approval, a skill run with its package and report card, a side question, the Jobs view", async () => {
  const { app, page, base } = await launch();
  const matterId = await newMatter(page, "Exit v. Path");
  const file = path.join(base, "Order.txt");
  await writeFile(file, "ORDER\nThe petition was dismissed on 12 March 2019.\nThe review was filed on 3 April 2019.\n");
  await page.evaluate(([m, f]) => (globalThis as any).openadvo.addFiles(m, [f]), [matterId, file]);

  await script(app, {
    agent: [
      { tools: [{ name: "plan_set", args: { title: "Chronology review", items: [{ text: "Run the contradiction report", skill: "SK-011" }, { text: "Report to the advocate" }] } }] },
      { tools: [{ name: "run_skill", args: { skill: "SK-011", request: "Check the chronology for contradictions.", reason: "a chronology request" } }] },
      { text: "The contradiction report is done. It found one item for you to decide." },
    ],
    skill: [{ text: out({ items: [{ title: "Dismissal date", detail: "12 March 2019 is read from the order; confirm it.", anchors: [], blocks: false }], not_read: [] }) }],
    side: [{ text: "The order says the petition was dismissed on 12 March 2019." }],
  });

  // 1. The plan card before long work: the plan waits for approval.
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Check the chronology for contradictions."]);
  await idle(page, matterId);
  await expect(page.getByTestId("plan-panel")).toContainText("Chronology review");
  await expect(page.getByTestId("plan-pending")).toBeVisible();
  await expect(page.getByTestId("plan-item-1")).toContainText("SK-011");
  await page.screenshot({ path: path.join(repo, "test-results", "phase1-plan-pending.png") });

  // 2. Approve: the agent runs the skill; the report card shows in the chat.
  await page.getByRole("button", { name: "Approve plan" }).click();
  await idle(page, matterId);
  const card = page.getByTestId("report-card").last();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveAttribute("data-state", "done");
  await expect(card).toContainText("SK-011");
  await expect(card).toContainText("schema: passed");
  await card.getByRole("button", { name: /Show the package/ }).click();
  await expect(card.getByTestId("package-view")).toContainText("Received");
  await expect(card.getByTestId("package-view")).toContainText("Not received");
  await page.screenshot({ path: path.join(repo, "test-results", "phase1-report-card.png") });
  const runs = (await page.evaluate((m) => (globalThis as any).openadvo.listSkillRuns(m), matterId)) as Array<{ state: string; packageId: string | null; skillId: string }>;
  expect(runs.map((r) => [r.skillId, r.state])).toEqual([["SK-011", "done"]]);
  expect(runs[0].packageId).toBeTruthy();

  // 3. A side question: read only, and nothing returns to the chat unless brought in.
  const before = ((await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)) as { messages: unknown[] }).messages.length;
  await page.getByTestId("side-question").click();
  const side = page.getByTestId("side-panel");
  await side.getByLabel("Ask a follow-up").fill("When was the petition dismissed?");
  await side.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(side.getByTestId("side-answer")).toContainText("12 March 2019");
  const after = ((await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)) as { messages: unknown[] }).messages.length;
  expect(after).toBe(before);
  await side.getByRole("button", { name: "Bring into chat" }).click();
  await expect(page.getByLabel("Message to the agent")).toContainText("From a side question");
  await page.screenshot({ path: path.join(repo, "test-results", "phase1-side-question.png") });
  await side.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("side-panel")).toHaveCount(0);

  // 4. The Jobs view: the chat runs and the skill run, with its report card and package.
  await page.getByTestId("jobs-tab").click();
  const jobs = page.getByTestId("jobs-panel");
  await expect(jobs.getByTestId("job-skill")).toHaveAttribute("data-state", "done");
  await expect(jobs.getByTestId("job-chat").first()).toBeVisible();
  await jobs.getByTestId("job-skill").getByRole("button", { name: "Open" }).click();
  await expect(jobs.getByTestId("report-card")).toContainText("SK-011");
  await jobs.getByRole("button", { name: /Show the package/ }).click();
  await expect(jobs.getByTestId("package-view")).toBeVisible();
  await page.screenshot({ path: path.join(repo, "test-results", "phase1-jobs.png") });

  // 5. "/" lists the skills in the composer.
  await page.getByTestId("chat-tab").click();
  const input = page.getByLabel("Message to the agent");
  await input.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type("/SK-0");
  await expect(page.getByRole("option", { name: /SK-011 Contradiction report/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await app.close();
});

test("navigation, the Review Inbox across matters, Workflows & Skills, the profile and the store records", async () => {
  const { app, page } = await launch();
  // The left pane of advocate-workflow.md section 3; views of later phases say so.
  for (const name of ["New matter", "Search", "Home", "Review Inbox", "Matters", "Calendar", "Research", "Knowledge", "Court Intelligence", "Browser", "Workflows & Skills", "Advocate profile", "Settings"]) {
    await expect(page.getByRole("button", { name, exact: true }).first()).toBeVisible();
  }
  await page.getByTestId("nav-research").click();
  await expect(page.getByTestId("research-page").getByTestId("not-built")).toContainText("phase 5");
  await page.getByTestId("nav-browser").click();
  await expect(page.getByTestId("browser-page").getByTestId("browser-page-pane")).toBeVisible();
  await page.getByTestId("nav-knowledge").click();
  await expect(page.getByTestId("library-page")).toBeVisible();
  await page.getByTestId("nav-court").click();
  await expect(page.getByTestId("court-page").getByTestId("not-built")).toContainText("phase 13");

  // Workflows & Skills: the phase 8 library, the practice packs and the twelve roles.
  await page.getByTestId("nav-skills").click();
  for (const id of ["SK-008", "SK-011", "SK-012", "SK-027"]) await expect(page.getByTestId(`skill-${id}`)).toContainText("reviewed");
  for (const id of ["criminal", "civil", "writ", "slp"]) await expect(page.getByTestId(`pack-${id}`)).toBeVisible();
  await expect(page.getByTestId("roles-list")).toContainText("chronology");

  // A skill run that fails the gate three times goes to the Review Inbox, which blocks.
  const matterId = await newMatter(page, "Inbox v. Gate");
  const bad = { text: "```json\n{\"items\": [{\"title\": \"x\"}]}\n```" };
  await script(app, {
    agent: [{ tools: [{ name: "run_skill", args: { skill: "SK-011", request: "dates", reason: "test" } }] }, { text: "It needs your review." }],
    skill: [bad, bad, bad],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Check the dates."]);
  await idle(page, matterId);
  await expect(page.getByTestId("report-card").last()).toHaveAttribute("data-state", "needs_review", { timeout: 30000 });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("nav-inbox").click();
  const item = page.getByTestId("firm-inbox-item").filter({ hasText: "Skill run needs review" });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-blocks", "true");
  await expect(item).toContainText("Inbox v. Gate");
  await page.screenshot({ path: path.join(repo, "test-results", "phase1-inbox.png") });
  // Keyboard: Enter opens the matter of the current item.
  await page.getByTestId("firm-inbox-list").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Inbox v. Gate" })).toBeVisible();

  // The advocate profile: the name goes to the foot of the pane; advocate.db's chain is intact.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("nav-profile").click();
  await page.getByTestId("profile-page").getByLabel("Name").fill("A. Advocate");
  await page.getByTestId("profile-page").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("nav-profile")).toContainText("A. Advocate");
  const chains = (await page.evaluate(() => (globalThis as any).openadvo.storeChains())) as { advocate: { ok: boolean; events: number }; intel: { ok: boolean } };
  expect(chains.advocate.ok).toBe(true);
  expect(chains.advocate.events).toBeGreaterThanOrEqual(3);
  expect(chains.intel.ok).toBe(true);
  await app.close();
});
