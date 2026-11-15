/**
 * Context, cost and Compact now in the window (docs/specs/native-harness-parts.md sections 4 to 6):
 * `/context` and `/cost` print text; old tool results are summarised once with refs and
 * recall_result returns the original; Compact now acts; the cost CSV comes from the matter page.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const MARKER = "MARKER-UNIQUE-SENTENCE-12345";

type App = Awaited<ReturnType<typeof electron.launch>>;

async function launch() {
  const base = await mkdtemp(path.join(tmpdir(), "oa-context-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, base };
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

async function notices(page: Page, matterId: string): Promise<string[]> {
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  return (chat.messages as Array<{ role: string; text: string }>).filter((x) => x.role === "notice").map((x) => x.text);
}

async function idle(page: Page, matterId: string) {
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
}

async function seen(app: App): Promise<Array<{ queue: string; last: string; all: string }>> {
  return app.evaluate(async () => (globalThis as any).__openadvoTest.modelSeen()) as never;
}

test("/context and /cost print text; each run adds a tokens-and-cost line; the CSV has the runs", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Context and cost");
  await script(app, { agent: [{ text: "Ready." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Hello."]);
  await idle(page, matterId);
  // The run's numbers live in the Context tab, not in a line after every message.
  expect((await notices(page, matterId)).some((t) => t.startsWith("This run:"))).toBe(false);
  await page.getByTestId("context-tab").click();
  const panel = page.getByTestId("context-panel");
  await expect(panel).toBeVisible();
  for (const label of ["Session", "Messages", "Provider", "Model", "Context limit", "Total tokens in context", "Usage", "Input tokens (last run)", "Output tokens (last run)", "Cache read (last run)", "Cache hit (last run)", "Cost (last run)", "Runs in this matter"]) {
    await expect(panel).toContainText(label);
  }
  await page.screenshot({ path: path.join(repo, "test-results", "context-panel.png") });
  await page.getByTestId("chat-tab").click();

  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "/context"]);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Context (these are estimates; the provider's own totals can differ).")]));
  const contextText = (await notices(page, matterId)).find((t) => t.startsWith("Context (these are estimates")) ?? "";
  expect(contextText).toContain("System prompt: about");
  expect(contextText).toContain("Tool definitions: about");
  expect(contextText).toContain("Messages: about");
  expect(contextText).toContain("Free: about");

  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "/cost"]);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Runs and helpers")]));
  const costText = (await notices(page, matterId)).find((t) => t.startsWith("Runs and helpers")) ?? "";
  expect(costText).toContain("Run ");
  expect(costText).toContain("Total:");

  const csv = await page.evaluate((m) => (globalThis as any).openadvo.costCsv(m), matterId);
  expect(csv.startsWith('"Kind","Name","Id"')).toBe(true);
  expect(csv).toContain('"Run"');
  await expect(page.getByRole("button", { name: "Export cost CSV" })).toBeVisible();
  await app.close();
});

test("old tool results are summarised with refs, and recall_result returns the original", async () => {
  const { app, page, base } = await launch();
  const matterId = await newMatter(app, page, "Summaries");
  const file = path.join(base, "record.txt");
  const paragraph = `${MARKER}. ${"The application was listed before the Registrar on 4 March 2024 and the order was passed. ".repeat(30)}`;
  await writeFile(file, paragraph);
  await page.evaluate(([m, f]) => (globalThis as any).openadvo.addFiles(m, [f]), [matterId, file]);
  await app.evaluate(async () => (globalThis as any).__openadvoTest.ingestIdle());
  await expect.poll(async () => ((await page.evaluate((m) => (globalThis as any).openadvo.listSources(m), matterId)) as unknown[]).length, { timeout: 60000 }).toBeGreaterThan(0);
  const sources = await page.evaluate((m) => (globalThis as any).openadvo.listSources(m), matterId);
  const sourceName = (sources as Array<{ name: string }>)[0].name;

  const reads = Array.from({ length: 8 }, () => ({ name: "read_source_text", args: { source: sourceName } }));
  await script(app, {
    agent: [
      { tools: reads },
      { text: "Read the record." },
      { tools: [{ name: "recall_result", args: { ref: "t1" } }] },
      { text: "Recalled the original." },
    ],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Read the record eight times."]);
  await idle(page, matterId);
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Now answer again."]);
  await idle(page, matterId);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringMatching(/Summarised \d+ earlier tool result/)]));
  const requests = await seen(app);
  // The summary replaced the original in the context, and the ref brought it back to the model.
  expect(requests.some((r) => r.queue === "agent" && r.all.includes("[t1] Summary"))).toBe(true);
  expect(requests.some((r) => r.queue === "agent" && r.all.includes(MARKER))).toBe(true);
  await app.close();
});

test("Compact now acts from the pinned status line", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Compact now");
  await script(app, { agent: [{ text: "First." }, { text: "Second." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "One."]);
  await idle(page, matterId);
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Two."]);
  await idle(page, matterId);
  const button = page.getByTestId("context-tab");
  await button.click();
  const compact = page.getByTestId("context-panel").getByRole("button", { name: "Compact now" });
  await expect(compact).toBeVisible({ timeout: 30000 });
  await compact.click();
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringMatching(/compacted|Not compacted/i)]));
  await app.close();
});
