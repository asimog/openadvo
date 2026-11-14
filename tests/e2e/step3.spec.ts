/**
 * Step 3 end-to-end: the Notebook from a dropped brief, against the built application.
 * Spec: docs/specs/v0-notebook.md.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

async function brief(file: string): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const write = (page: ReturnType<typeof doc.addPage>, lines: string[]) =>
    lines.forEach((t, i) => page.drawText(t, { x: 60, y: 780 - i * 22, size: 11, font }));
  write(doc.addPage([595, 842]), [
    "LIST OF DATES",
    "The petitioner purchased the land in March 2019.",
    "The writ petition was filed on 02.01.2023.",
    "The High Court dismissed the writ petition by its judgment dated 12.03.2024.",
  ]);
  write(doc.addPage([595, 842]), [
    "SYNOPSIS",
    "By judgment dated 13.03.2024 the High Court dismissed the writ petition.",
    "Thereafter the petitioner approached this Court.",
  ]);
  await writeFile(file, await doc.save());
}

test("the Notebook: events, a flagged date conflict, human decisions, chronology and source links", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e3-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const file = path.join(inbox, "list-of-dates.pdf");
  await brief(file);
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "m"), OPENADVO_USER_DATA: path.join(base, "u"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill("Step three");
  await page.getByRole("button", { name: "Create matter" }).click();
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await page.getByRole("button", { name: "Add files" }).click();

  // The conflict is flagged and the Notebook is not ready until it is decided.
  await expect(page.getByTestId("readiness")).toContainText("1 review item(s) open", { timeout: 60_000 });
  await page.getByRole("tab", { name: "Factual Matrix" }).click();
  const matrix = page.getByRole("table", { name: "Factual Matrix" });
  await expect(matrix.locator("tbody tr")).toHaveCount(4);
  await expect(matrix).toContainText("01.03.2019 – 31.03.2019");
  await expect(matrix).not.toContainText("Thereafter");
  const conflicts = page.getByRole("region", { name: "Date conflicts" });
  await conflicts.getByRole("button", { name: "Keep 12.03.2024" }).click();
  await expect(page.getByTestId("readiness")).toContainText("Notebook ready");

  // Human decisions.
  const filed = matrix.locator("tr", { hasText: "02.01.2023" });
  await filed.getByRole("button", { name: "Confirm" }).click();
  await expect(filed).toContainText("Confirmed");
  const land = matrix.locator("tr", { hasText: "purchased the land" });
  await land.getByRole("button", { name: "Exclude" }).click();
  await page.getByRole("tab", { name: "Chronology" }).click();
  const chronology = page.getByRole("table", { name: "Chronology" });
  await expect(chronology).not.toContainText("purchased the land");
  await page.getByLabel("Show excluded events").check();
  await expect(chronology).toContainText("purchased the land");

  // Procedural history holds the procedural events only.
  await page.getByRole("tab", { name: "Procedural history" }).click();
  const proc = page.getByRole("table", { name: "Procedural history" });
  await expect(proc.locator("tbody tr")).toHaveCount(3);

  // A source link opens the source at the page and line.
  await proc.getByRole("button", { name: "list-of-dates.pdf, p. 2, l. 2" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByTestId("page-lines").locator('li[data-focus="true"]')).toContainText("By judgment dated 13.03.2024");
  await app.close();
});
