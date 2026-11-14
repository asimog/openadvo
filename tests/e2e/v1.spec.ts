/**
 * V1 end to end, against the built application. Spec: docs/specs/v1.md (V1-1, V1-3, V1-4,
 * V1-5, V1-10). The agent's record-table tool is called through the test hook, so the test
 * needs no model; it runs the same function a real turn uses.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
test.describe.configure({ timeout: 240_000 });

async function pdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 60, y: 780 - i * 24, size: 12, font }));
  return doc.save();
}

async function launch(base: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

const bridge = (page: Page) => <T>(fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (globalThis as any).openadvo[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test("v1: record table, memory, workflows, durable chat, rename and archive", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev1-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER OF THE HIGH COURT", "The appeal is dismissed with costs of Rs. 10,000.", "Dated 12.03.2024"]));
  let { app, page } = await launch(base);
  let call = bridge(page);
  try {
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Ram v. State");
    await page.getByRole("button", { name: "Create matter" }).click();
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, order);
    await page.getByRole("button", { name: "Add files" }).click();
    await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
    const matterId: string = (await call<any[]>("listMatters"))[0].id;

    // ---- V1-5: the record table ----
    await page.getByRole("tab", { name: "Record table" }).click();
    await page.getByTestId("record-question").fill("Relief granted");
    await page.getByRole("button", { name: "Add column" }).click();
    await expect(page.getByTestId("record-cell")).toHaveAttribute("data-status", "empty");
    const fill = (input: Record<string, unknown>) => app.evaluate((_e, [id, i]) => (globalThis as any).__openadvoTest.fillRecordCell(id, i), [matterId, input] as const) as Promise<string>;
    const refused = await fill({ source: "order.pdf", column: "Relief granted", answer: "Allowed", quote: "the appeal is allowed", page: 1, line: 2 });
    expect(refused).toContain("QUOTE_NOT_FOUND");
    const filled = await fill({ source: "order.pdf", column: "Relief granted", answer: "Appeal dismissed with costs", quote: "the appeal is  DISMISSED with costs", page: 1, line: 2 });
    expect(filled).toContain("candidate");
    await page.getByRole("tab", { name: "Research" }).click();
    await page.getByRole("tab", { name: "Record table" }).click();
    await expect(page.getByTestId("record-cell")).toHaveAttribute("data-status", "candidate");
    await page.getByTestId("record-cell").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByTestId("record-cell")).toHaveAttribute("data-status", "confirmed");

    // ---- V1-3: matter memory, written by the advocate only ----
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByTestId("memory-text").fill("Client prefers no interim relief.");
    await page.getByRole("button", { name: "Save memory" }).click();
    await expect(page.getByTestId("memory")).toContainText("Saved.");
    const folder: string = (await call<any[]>("listMatters"))[0].folder;
    expect(await readFile(path.join(folder, "memory.md"), "utf8")).toBe("Client prefers no interim relief.");
    const events = await call<any[]>("listEvents", matterId);
    expect(events.some((e) => e.action === "memory.saved" && e.actor === "advocate")).toBe(true);
    expect(await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.agentToolNames(id), matterId)).toEqual(expect.arrayContaining(["read_matter_memory", "list_record_table", "fill_record_cell"]));

    // ---- V1-4: workflows ----
    const builtIn = await call<any[]>("listWorkflows");
    expect(builtIn.filter((w) => w.builtIn).length).toBe(6);
    const after = await call<any[]>("saveWorkflow", { title: "Bail check", body: "List every bail order." });
    expect(after.at(-1)).toMatchObject({ title: "Bail check", builtIn: false });
    await expect(call("deleteWorkflow", "builtin-research")).rejects.toThrow(/WORKFLOW_BUILT_IN/);

    // ---- V1-1: the chat folder exists, and saved messages come back after a restart ----
    const chatDir = path.join(folder, "chat");
    expect((await readdir(chatDir)).includes("pi")).toBe(true);
    await writeFile(path.join(chatDir, "messages.json"), JSON.stringify([{ id: "m1", role: "advocate", text: "List the sources." }]));

    // ---- V1-10: rename ----
    await page.getByTestId("matter-title").fill("Ram Kumar v. State of Delhi");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ram Kumar v. State of Delhi" })).toBeVisible();

    await app.close();
    ({ app, page } = await launch(base));
    call = bridge(page);
    const chat = await call<any>("getChat", matterId);
    expect(chat.messages.map((m: any) => m.text)).toEqual(["List the sources."]);
    const fresh = await call<any>("newConversation", matterId);
    expect(fresh.messages).toEqual([]);
    expect((await readdir(chatDir)).some((f) => /^messages-.*\.json$/.test(f))).toBe(true);

    // ---- V1-10: archive and restore ----
    await page.getByRole("button", { name: "Ram Kumar v. State of Delhi" }).click();
    await page.getByRole("button", { name: "Archive matter" }).click();
    await expect(page.getByTestId("archived-matters")).toContainText("Ram Kumar v. State of Delhi");
    expect(await page.locator(".astryx-app-shell-sidenav").getByText("Ram Kumar v. State of Delhi").count()).toBe(0);
    await page.getByTestId("archived-matters").getByRole("button", { name: "Restore" }).click();
    await expect(page.getByTestId("archived-matters")).toHaveCount(0);
    await expect(page.locator(".astryx-app-shell-sidenav").getByText("Ram Kumar v. State of Delhi")).toBeVisible();
  } finally {
    await app.close();
  }
});
