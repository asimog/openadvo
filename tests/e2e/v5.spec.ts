/**
 * V5 end to end, against the built application. Spec: docs/specs/v5.md.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

/** An image where the two engines disagree: Tesseract reads "Rs. 0,589", PP-OCR "Rs. 6,589". */
async function disputedScan(): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const small = createCanvas(420, 40);
  const s = small.getContext("2d");
  s.fillStyle = "#fff";
  s.fillRect(0, 0, 420, 40);
  s.fillStyle = "#222";
  s.font = "16px serif";
  s.fillText("Paid Rs. 6,589 on 31.08.2019", 6, 26);
  const big = createCanvas(1260, 120);
  const b = big.getContext("2d");
  b.filter = "blur(2.4px)";
  b.drawImage(small, 0, 0, 1260, 120);
  return big.toBuffer("image/png");
}

test("v5 B: entities, a correction, a base date and an OCR dispute decided by the advocate", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev5b-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const note = path.join(base, "inbox", "note.txt");
  await writeFile(note, ["Ram Kumar v. State of Delhi", "He was produced before the Magistrate the next day.", "Crl. M.C. No. 1234 of 2023 was dismissed on 12.03.2024.", "Crl. M.C. No. 1234 of 2022 is cited in the reply.", "He was convicted under Section 302 of the Indian Penal Code."].join("\n"));
  const scan = path.join(base, "inbox", "receipt.png");
  await writeFile(scan, await disputedScan());
  const secondEngine = existsSync(path.join(repo, "resources", "models", "ppocr", "det.onnx"));
  const { app, page } = await start(base);
  const call = bridge(page);
  try {
    const matterId = await matterWith(page, app, "Entities v. Disputes", [note, scan]);

    // ---- V5-6: entities ----
    await page.getByRole("tab", { name: "Entities" }).click();
    await expect(page.getByTestId("entities")).toContainText("s. 302 IPC");
    await expect(page.getByTestId("entity-conflicts")).toContainText("CRL. M.C. 1234 is given with different years");

    // ---- V5-7: the base date for "the next day" ----
    await page.getByRole("tab", { name: /^Review/ }).click();
    await page.getByTestId("date-anchor").getByLabel("Base date").fill("2024-03-12");
    await page.getByTestId("date-anchor").getByRole("button", { name: "Set the base date" }).click();
    await expect.poll(async () => (await call<any>("getNotebook", matterId)).events.some((e: any) => e.dateStart === "2024-03-13" && e.dateText.includes("base date given by the advocate"))).toBe(true);

    // ---- V5-7: correct an event; the extracted text stays readable ----
    const nb = await call<any>("getNotebook", matterId);
    const dismissed = nb.events.find((e: any) => e.description.includes("was dismissed"));
    await page.getByRole("tab", { name: "Chronology" }).click();
    const row = page.locator(".events-table tr", { hasText: "was dismissed" });
    await row.getByRole("button", { name: "Correct" }).click();
    await row.getByLabel("Corrected start date").fill("2024-03-13");
    await row.getByLabel("Corrected end date").fill("2024-03-13");
    await row.getByLabel("Reason for the correction").fill("The certified copy shows 13.03.2024.");
    await row.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator(".events-table tr", { hasText: "was dismissed" })).toContainText("13.03.2024");
    await expect(page.locator(".events-table tr", { hasText: "was dismissed" })).toContainText("Corrected");
    const after = (await call<any>("getNotebook", matterId)).events.find((e: any) => e.id === dismissed.id);
    expect(after.corrected.original.dateStart).toBe("2024-03-12");

    // ---- V5-8: the OCR dispute (needs the second engine's models: npm run vendor:ocr) ----
    if (secondEngine) {
      const scanEvent = (await call<any>("getNotebook", matterId)).events.find((e: any) => e.dateStart === "2019-08-31");
      expect(scanEvent.disputed).toBe("open");
      await expect(call("confirmEvent", matterId, scanEvent.id)).rejects.toThrow(/OCR_DISPUTED/);
      await page.getByRole("tab", { name: /^Review/ }).click();
      const dispute = page.getByTestId("ocr-dispute");
      await expect(dispute).toContainText("Rs. 0,589");
      await expect(dispute).toContainText("Rs. 6,589");
      await dispute.getByRole("button", { name: "Use the second reading" }).click();
      await expect.poll(async () => (await call<any>("getNotebook", matterId)).events.some((e: any) => e.description.includes("6,589") && e.method.endsWith("+decided"))).toBe(true);
      const old = (await call<any>("getNotebook", matterId)).events.find((e: any) => e.id === scanEvent.id);
      expect(old.disputed).toBe("replaced");
    }
  } finally {
    await app.close();
  }
});
