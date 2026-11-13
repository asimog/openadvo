/**
 * Step 2 end-to-end: text, OCR, review items and the Euro-Office PDF view, against the built application.
 * Spec: docs/specs/v0-document-intelligence.md.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { renderPagePng, stopOcr } from "../../src/lib/document-intelligence/index.ts";
import { platformKey } from "../../src/lib/euro-office/platform.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const vendored = existsSync(path.join(repo, "resources", "euro-office", platformKey(), "converter"));

test.afterAll(() => stopOcr());

/** Page 1 has a text layer, page 2 is the same page as an image, page 3 is blank. */
async function brief(file: string): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const p1 = doc.addPage([595, 842]);
  p1.drawText("IN THE SUPREME COURT OF INDIA", { x: 150, y: 780, size: 16, font });
  p1.drawText("The High Court dismissed the writ petition on 12.03.2024.", { x: 72, y: 720, size: 12, font });
  const png = await renderPagePng(await doc.save(), 1, 2.5);
  const image = await doc.embedPng(png);
  doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  doc.addPage([595, 842]);
  await writeFile(file, await doc.save());
}

async function launch(): Promise<{ app: ElectronApplication; page: Page; inbox: string }> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e2-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const app = await electron.launch({
    args: [repo],
    env: { ...process.env, OPENADVO_HOME: path.join(base, "m"), OPENADVO_USER_DATA: path.join(base, "u"), OPENADVO_TEST: "1" },
  });
  const page = await app.firstWindow();
  return { app, page, inbox };
}

test("a dropped PDF is read: text layer, OCR, a review item for the blank page, and the PDF editor view", async () => {
  const { app, page, inbox } = await launch();
  const file = path.join(inbox, "brief.pdf");
  await brief(file);
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill("Step two");
  await page.getByRole("button", { name: "Create matter" }).click();
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(page.getByText("3 pp.")).toBeVisible({ timeout: 60_000 });

  // The blank page opened a review item; the advocate skips it.
  const review = page.getByRole("list", { name: "Review items" });
  await expect(review).toContainText("Page 3 of brief.pdf has no text layer");
  await review.getByRole("button", { name: "Skip" }).click();
  await expect(review).toContainText("Skipped by advocate");

  // The page text, line by line.
  await page.getByRole("button", { name: "brief.pdf" }).click();
  const lines = page.getByTestId("page-lines");
  await expect(lines).toContainText("IN THE SUPREME COURT OF INDIA");
  await expect(page.getByText("Text layer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText(/^OCR: single reading, not cross-checked/)).toBeVisible();
  await expect(lines).toContainText(/writ petition/i);

  // The Euro-Office PDF editor opens the source, read only.
  if (vendored) {
    await expect(page.getByTestId("viewer-state")).toHaveText("Opened read only in the Euro-Office PDF editor.", { timeout: 60_000 });
  } else {
    await expect(page.getByTestId("viewer-error")).toContainText("npm run vendor");
  }
  await app.close();
});
