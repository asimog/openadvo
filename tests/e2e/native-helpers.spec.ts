/**
 * Native helpers in the window (docs/specs/native-harness-parts.md section 3): a foreground
 * helper's progress and result, background helpers with one Final Recap and "Use results",
 * Steer and Stop from the status line, Stop on the chat, and an interruption after a restart.
 * The scripted test model (src/main/test-model.ts) answers both queues.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

type App = Awaited<ReturnType<typeof electron.launch>>;

async function launch(extra: Record<string, string> = {}) {
  const base = await mkdtemp(path.join(tmpdir(), "oa-helpers-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1", ...extra }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, home, userData };
}

async function newMatter(app: App, page: Awaited<ReturnType<typeof launch>>["page"], title: string) {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  const all = await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters()) as Array<{ id: string }>);
  return all[0].id;
}

async function script(app: App, value: unknown) {
  await app.evaluate(async (_e, s) => (globalThis as any).__openadvoTest.setModelScript(s), value);
}

async function notices(page: Awaited<ReturnType<typeof launch>>["page"], matterId: string): Promise<string[]> {
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  return (chat.messages as Array<{ role: string; text: string }>).filter((x) => x.role === "notice").map((x) => x.text);
}

async function seen(app: App): Promise<Array<{ queue: string; last: string; all: string }>> {
  return app.evaluate(async () => (globalThis as any).__openadvoTest.modelSeen()) as never;
}

test("a foreground helper reports progress and returns its result to the agent", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Foreground helper");
  await script(app, {
    agent: [
      { tools: [{ name: "start_helper", args: { type: "record-reader", task: "Read pages 2 to 4 of the petition and report the dates.", name: "Petition dates" } }] },
      { text: "The helper read the pages." },
    ],
    helper: [{ tools: [{ name: "helper_update", args: { text: "Reading page 3." } }] }, { text: "Page 3, line 7: the order was passed on 4 March 2024." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Read the petition."]);
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
  await expect.poll(() => notices(page, matterId), { timeout: 60000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Petition dates: Reading page 3.")]));
  await expect.poll(() => notices(page, matterId), { timeout: 60000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Petition dates finished.")]));
  const requests = await seen(app);
  expect(requests.some((r) => r.queue === "agent" && r.last.includes("Page 3, line 7: the order was passed on 4 March 2024."))).toBe(true);
  await app.close();
});

test("two background helpers end with one Final Recap, and Use results sends both results", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Background helpers");
  await script(app, {
    agent: [
      { tools: [
        { name: "start_helper", args: { type: "legal-research", task: "Find authority on condonation of delay.", background: true, name: "Delay authority" } },
        { name: "start_helper", args: { type: "critic", task: "Test the grounds against the record.", background: true, name: "Grounds critic" } },
      ] },
      { text: "Both helpers are working; I will wait for their results." },
      { text: "Used the two results." },
    ],
    helper: [{ text: "Authority: the delay is explained by the certified copy." }, { text: "The grounds miss the date of the order." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Check the delay and the grounds."]);
  await expect.poll(() => notices(page, matterId), { timeout: 60000 }).toEqual(expect.arrayContaining([expect.stringContaining("Final recap: 2 background helpers finished")]));
  // One recap, not one per helper.
  expect((await notices(page, matterId)).filter((t) => t.startsWith("Final recap:")).length).toBe(1);
  await expect(page.getByTestId("status-line").getByRole("button", { name: "Use results" })).toBeVisible({ timeout: 30000 });
  await page.getByTestId("status-line").getByRole("button", { name: "Use results" }).click();
  await expect.poll(() => notices(page, matterId), { timeout: 60000 }).toContain("The results of 2 background helpers go to the agent.");
  const requests = await seen(app);
  expect(requests.some((r) => r.queue === "agent" && r.last.includes("Results of 2 background helpers") && r.last.includes("certified copy") && r.last.includes("date of the order"))).toBe(true);
  // Cost per helper is recorded with the matter: /cost lists both.
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "/cost"]);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Delay authority (legal-research)")]));
  await app.close();
});

test("Steer and Stop from the status line, and Stop on the chat stops every helper", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Steer and stop");
  await script(app, {
    agent: [
      { tools: [
        { name: "start_helper", args: { type: "legal-research", task: "Research the limitation point.", background: true, name: "Limitation" } },
        { name: "start_helper", args: { type: "critic", task: "Check the synopsis.", background: true, name: "Synopsis critic" } },
      ] },
      { text: "Two helpers are working." },
    ],
    helper: [{ hold: "hold-1" }, { hold: "hold-2" }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Start two helpers."]);
  const line = page.getByTestId("status-line");
  await expect(line).toContainText("2 helpers running", { timeout: 30000 });
  await line.getByRole("button", { name: "Helpers" }).click();
  await page.getByRole("menuitem", { name: /Steer Limitation/ }).click();
  await page.getByLabel("Instruction for Limitation").fill("Add the High Court view.");
  await page.getByRole("button", { name: "Send to helper" }).click();
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Limitation was steered: Add the High Court view.")]));
  // Stop one helper from the status line, then Stop on the chat stops the other.
  await line.getByRole("button", { name: "Helpers" }).click();
  await page.getByRole("menuitem", { name: /Stop Limitation/ }).click();
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Limitation stopped by the advocate.")]));
  await page.getByTestId("chat-dock").getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Synopsis critic stopped by the advocate.")]));
  await app.evaluate(async () => (globalThis as any).__openadvoTest.releaseModel("hold-1"));
  await app.evaluate(async () => (globalThis as any).__openadvoTest.releaseModel("hold-2"));
  await app.close();
});

test("after a background start_helper returns, the helper uses the parent's tools and its result goes with the next message", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Background tool use");
  await script(app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "record-reader", task: "Count the sources of this matter.", background: true, name: "Source counter" } }] }, { text: "Started." }],
    helper: [{ tools: [{ name: "list_sources", args: {} }] }, { text: "The matter has no sources." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Count the sources in the background."]);
  await expect.poll(() => notices(page, matterId), { timeout: 60000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Source counter finished.")]));
  expect((await notices(page, matterId)).some((t) => t.includes("failed"))).toBe(false);

  // The result waits; the advocate's next message carries it, and no turn starts by itself.
  await script(app, { agent: [{ text: "Used the source count." }] });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Now continue."]);
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("The results of 1 background helper go with this message.")]));
  const requests = await seen(app);
  expect(requests.some((r) => r.queue === "agent" && r.last.includes("The matter has no sources."))).toBe(true);
  await app.close();
});

test("a foreground helper that outlasts the wait becomes a background job, and its result waits", async () => {
  const { app, page } = await launch({ OPENADVO_TEST_HELPER_WAIT_MS: "700" });
  const matterId = await newMatter(app, page, "Wait limit");
  await script(app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "critic", task: "Check the synopsis.", name: "Slow critic" } }] }, { text: "It is still working." }],
    helper: [{ hold: "slow" }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Check the synopsis."]);
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
  // The parent is told in the tool result that the helper is still working and is now a job.
  const requests = await seen(app);
  expect(requests.some((r) => r.queue === "agent" && r.last.includes("is still working after 1 second. It is now a background job"))).toBe(true);
  const midway = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect((midway.helpers as Array<{ background: boolean; state: string }>)[0]).toMatchObject({ background: true, state: "running" });
  await app.evaluate(async () => (globalThis as any).__openadvoTest.releaseModel("slow"));
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Slow critic finished.")]));
  const after = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect((after.helpers as Array<{ waiting: boolean }>)[0].waiting).toBe(true);
  await app.close();
});

test("fork context gives the helper a frozen copy of the conversation", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Fork context");
  await script(app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "critic", task: "Test the date against the record.", name: "Date critic", fork_context: true } }] }, { text: "Checked." }],
    helper: [{ text: "The date is consistent with the record." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "The order is dated 4 March 2024."]);
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60000 }).toBe(false);
  const requests = await seen(app);
  const helperRequest = requests.find((r) => r.queue === "helper");
  expect(helperRequest?.all).toContain("<parent-conversation>");
  expect(helperRequest?.all).toContain("The order is dated 4 March 2024.");
  await app.close();
});

test("a helper's question is answered with Steer, which resumes the same session", async () => {
  const { app, page } = await launch();
  const matterId = await newMatter(app, page, "Helper question");
  await script(app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "record-reader", task: "Read the order and report its date.", background: true, name: "Order reader" } }] }, { text: "Started." }],
    helper: [{ tools: [{ name: "helper_ask", args: { question: "Which order do you mean?" } }] }, { text: "The order dated 4 March 2024." }],
  });
  await page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Read the order."]);
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Order reader asks: Which order do you mean?")]));
  const line = page.getByTestId("status-line");
  await line.getByRole("button", { name: "Helpers" }).click();
  await page.getByRole("menuitem", { name: /Steer Order reader/ }).click();
  await page.getByLabel("Instruction for Order reader").fill("The order dated 4 March 2024.");
  await page.getByRole("button", { name: "Send to helper" }).click();
  await expect.poll(() => notices(page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Order reader finished.")]));
  const requests = await seen(app);
  expect(requests.some((r) => r.queue === "helper" && r.all.includes("The order dated 4 March 2024."))).toBe(true);
  await app.close();
});

test("after a restart, a helper that was running shows as interrupted", async () => {
  const first = await launch();
  const matterId = await newMatter(first.app, first.page, "Interrupted helper");
  await script(first.app, {
    agent: [{ tools: [{ name: "start_helper", args: { type: "record-reader", task: "Read the whole record.", background: true, name: "Record reader" } }] }, { text: "Started." }],
    helper: [{ hold: "never" }],
  });
  await first.page.evaluate(([m, t]) => (globalThis as any).openadvo.sendChat(m, t), [matterId, "Read the record."]);
  await expect.poll(() => notices(first.page, matterId), { timeout: 30000 }).toEqual(expect.arrayContaining([expect.stringContaining("Helper Record reader (record-reader) started in the background")]));
  // Exit at once, as a crash or a power cut would: no orderly stop of the helper.
  await first.app.evaluate(({ app }) => app.exit(0));
  await first.app.close().catch(() => undefined);

  const second = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: first.home, OPENADVO_USER_DATA: first.userData, OPENADVO_TEST: "1" }) });
  const page = await second.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const chat = await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId);
  expect((chat.helpers as Array<{ state: string }>)[0].state).toBe("interrupted");
  expect((chat.messages as Array<{ role: string; text: string }>).some((x) => x.role === "notice" && x.text.startsWith("Interrupted: Record reader."))).toBe(true);
  await second.close();
});
