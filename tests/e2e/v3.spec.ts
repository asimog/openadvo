/**
 * V3 end to end, against the built application. Spec: docs/specs/v3.md (V3-1 to V3-6).
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
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

test("v3: progress, review inbox, command bar, settings, export, finish", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev3-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER", "The appeal was dismissed on 12.03.2024.", "The appellant applied for a certified copy the next day."]));
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Progress v. Polish");
    await page.getByRole("button", { name: "Create matter" }).click();
    // V3-6: the window title names the matter.
    await expect.poll(() => page.title()).toBe("Progress v. Polish — Open Advocate");
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, order);
    await page.getByRole("button", { name: "Add files" }).click();
    await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
    // V3-6: a notice can be closed.
    await page.getByRole("button", { name: "Close notice" }).click();
    await expect(page.getByTestId("notice")).toHaveCount(0);

    // ---- V3-1: progress on the Matter tab ----
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await expect(page.locator('[data-stage="record"]').first()).toHaveAttribute("data-state", "done");
    await expect(page.locator('[data-stage="notebook"]').first()).toHaveAttribute("data-state", "in_progress");
    await expect(page.getByTestId("next-step")).toContainText("Confirm, reject or exclude");

    // ---- V3-2: the review inbox, keyboard operable ----
    await expect(page.getByRole("tab", { name: /^Review \(\d+\)$/ })).toBeVisible();
    await page.getByRole("tab", { name: /^Review/ }).click();
    await expect(page.getByTestId("inbox-item").first()).toBeVisible();
    await expect(page.getByTestId("inbox")).toContainText("Candidate events");
    await page.getByTestId("inbox").focus();
    const events = page.locator('[data-testid="inbox-item"][data-kind="candidate_events"]');
    const index = Number(await events.getAttribute("data-index"));
    for (let i = 0; i < index; i++) await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Chronology" })).toHaveAttribute("aria-selected", "true");
    // V3-6: the inferred date carries its mark; dates read dd.mm.yyyy.
    await expect(page.locator(".events-table")).toContainText("13.03.2024");
    await expect(page.locator(".events-table")).toContainText("inferred");

    // ---- V3-3: the command bar ----
    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-bar")).toBeVisible();
    await page.getByRole("textbox", { name: "Command" }).fill("research");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("command-bar")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Studio" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+K");
    await page.getByRole("textbox", { name: "Command" }).fill("certified copy");
    await expect(page.getByRole("option", { name: /certified copy.*order\.pdf, p\. 1, l\. 3/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("source-view")).toBeVisible();
    await expect(page.getByTestId("page-lines").locator('[data-focus="true"]')).toContainText("certified copy");

    // ---- V3-5: export the matter ----
    const zipPath = path.join(base, "export.zip");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
    }, zipPath);
    await page.getByRole("button", { name: "Back to matter" }).click();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByRole("button", { name: "Export matter" }).click();
    await expect(page.getByTestId("matter-admin-note")).toContainText("Exported");
    const files = Object.keys(unzipSync(new Uint8Array(await readFile(zipPath))));
    expect(files).toContain("matter.db");
    expect(files.some((f) => f.startsWith("blobs/"))).toBe(true);
    expect(files.some((f) => /settings|signing|secret/.test(f))).toBe(false);

    // ---- V3-4: settings ----
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByTestId("settings")).toBeVisible();
    await expect(page.getByTestId("versions")).toContainText("Electron");
    await expect(page.getByTestId("signing-fingerprint")).toHaveText(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
    await page.getByLabel("Dark").check();
    await expect.poll(() => page.evaluate(() => (globalThis as any).document.documentElement.getAttribute("data-theme"))).toBe("dark");
    const settings = JSON.parse(await readFile(path.join(base, "user", "settings.json"), "utf8"));
    expect(settings.appearance).toBe("dark");
    await page.getByLabel("Follow the system").check();
  } finally {
    await app.close();
  }
});
