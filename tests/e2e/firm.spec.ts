/**
 * O10: the Firm Agent on Home (docs/specs/agent-framework.md section 2). Its session has the
 * firm tools only; its tools read the firm's matters; an instruction it proposes for a matter
 * waits on Home, and "Open in the matter" puts it in that matter's composer, unsent.
 * No model is needed: the tools run through their own code by a test hook.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const FIRM = "firm:agent";

async function launch() {
  const base = await mkdtemp(path.join(tmpdir(), "oa-firm-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function createMatter(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

test("O10: the Firm Agent on Home reads the firm and hands an instruction to a matter only through the advocate", async () => {
  const { app, page } = await launch();
  await createMatter(page, "Sharma v. State");
  await page.getByRole("button", { name: "Home" }).click();
  const panel = page.getByTestId("firm-chat");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Firm Agent" })).toBeVisible();
  await expect(panel).toContainText("It does not read a matter's documents");

  const tools: string[] = await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.agentToolNames(id), FIRM);
  for (const t of ["list_matters", "matter_overview", "list_hearings", "list_workflows", "read_workflow", "propose_matter_instruction"]) expect(tools).toContain(t);
  for (const t of ["read_source_text", "list_events", "read_draft", "submit_filing", "read", "bash"]) expect(tools).not.toContain(t);

  const list: string = await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.callAgentTool(id, "list_matters", {}), FIRM);
  expect(list).toContain("Sharma v. State");
  const matterId = /\[matter:([^\]]+)\] Sharma v\. State/.exec(list)?.[1];
  expect(matterId).toBeTruthy();

  await app.evaluate(
    (_e, a) => (globalThis as any).__openadvoTest.callAgentTool(a.firm, "propose_matter_instruction", { matter_id: a.id, instruction: "List the sources and say which pages are unreadable.", reason: "The record is new." }),
    { firm: FIRM, id: matterId },
  );
  const card = panel.getByTestId("firm-handoff");
  await expect(card).toContainText("For Sharma v. State");
  await expect(card).toContainText("List the sources and say which pages are unreadable.");
  await page.screenshot({ path: path.join(repo, "test-results", "firm-agent-home.png") });

  await card.getByRole("button", { name: "Open in the matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Sharma v. State" })).toBeVisible();
  // The instruction is in the matter's composer, not sent: the matter's chat has no advocate message.
  await expect(page.getByLabel("Message to the agent")).toContainText("List the sources and say which pages are unreadable.");
  const chat = await page.evaluate((id) => (globalThis as any).openadvo.getChat(id), matterId);
  expect(chat.messages.filter((m: { role: string }) => m.role === "advocate")).toHaveLength(0);
  const firm = await page.evaluate((id) => (globalThis as any).openadvo.getChat(id), FIRM);
  expect(firm.handoffs).toHaveLength(0);
  await app.close();
});
