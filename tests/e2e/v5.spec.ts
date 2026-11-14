/**
 * V5 end to end, against the built application. Spec: docs/specs/v5.md.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
test.describe.configure({ timeout: 240_000 });

export async function pdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 780 - i * 22, size: 11, font }));
  return doc.save();
}

export async function start(base: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

export const bridge = (page: Page) => <T>(fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (globalThis as any).openadvo[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

export async function matterWith(page: Page, app: ElectronApplication, title: string, files: string[]): Promise<string> {
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill(title);
  await page.getByRole("button", { name: "Create matter" }).click();
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: p })) as typeof dialog.showOpenDialog;
  }, files);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(page.getByText(/\d+ pp\./)).toHaveCount(files.length, { timeout: 120_000 });
  return (await bridge(page)<any[]>("listMatters")).find((m) => m.title === title).id;
}

test("v5 A: the record chain, refused requests, the Inspector, Find, files and jobs", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev5a-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER", "The appeal was dismissed on 12.03.2024 for want of prosecution."]));
  const { app, page } = await start(base);
  const call = bridge(page);
  try {
    const matterId = await matterWith(page, app, "Chain v. Record", [order]);
    // A refused request is kept: the advocate cannot approve a revision that does not exist.
    await expect(call("approveRevision", matterId, "no-such-revision")).rejects.toThrow();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByRole("button", { name: "Verify the record" }).click();
    await expect(page.getByTestId("chain-check")).toHaveAttribute("data-ok", "true");
    await expect(page.getByTestId("chain-check")).toContainText("Record verified");
    await page.getByTestId("refusals").locator("summary").click();
    await expect(page.getByTestId("refusals")).toContainText("drafts:approve");

    // ---- Find, from the command bar: a source line opens the source at that line ----
    await page.keyboard.press("Control+K");
    await page.getByRole("textbox", { name: "Command" }).fill("want of prosecution");
    await expect(page.getByRole("option", { name: /prosecution/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("page-lines").locator('[data-focus="true"]')).toContainText("want of prosecution");
    // ---- The Inspector, from the source ----
    await page.getByRole("button", { name: "Inspect the source record" }).click();
    await expect(page.getByRole("dialog")).toContainText("Inspector: source");
    await expect(page.getByTestId("inspector-raw")).toContainText("order.pdf");
    await expect(page.getByTestId("inspector")).toContainText("source.added");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Back to matter" }).click();

    // ---- Files and jobs ----
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByTestId("files").locator("summary").click();
    await expect(page.getByTestId("files")).toContainText("matter.db");
    await expect(page.getByTestId("files")).toContainText("blobs/ (1 stored file(s)");
    await page.getByTestId("jobs").locator("summary").click();
    await expect(page.getByTestId("jobs")).toContainText("Read order.pdf");
  } finally {
    await app.close();
  }
});
