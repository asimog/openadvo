/**
 * V3-7 smoke test: the folder that `npm run dist` makes runs on its own. It starts the built
 * executable (not the development Electron), makes a matter, reads a PDF and opens it in the
 * vendored PDF editor, and shows the versions. Skipped when the build folder does not exist.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const executable =
  process.platform === "win32"
    ? path.join(repo, "release", "win-unpacked", "Open Advocate.exe")
    : process.platform === "darwin"
      ? path.join(repo, "release", "mac", "Open Advocate.app", "Contents", "MacOS", "Open Advocate")
      : path.join(repo, "release", "linux-unpacked", "open-advocate");

test.describe.configure({ timeout: 240_000 });

test("dist: the built application starts, reads a PDF, opens the PDF editor and shows its versions", async () => {
  test.skip(!existsSync(executable), "run `npm run dist` first");
  const base = await mkdtemp(path.join(tmpdir(), "oa-dist-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const file = path.join(base, "inbox", "order.pdf");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  doc.addPage([595, 842]).drawText("The appeal was dismissed on 12.03.2024.", { x: 60, y: 760, size: 12, font });
  await writeFile(file, await doc.save());
  // An image, read by OCR: proves tesseract and the native canvas module inside the build.
  const image = path.join(base, "inbox", "photo.png");
  const canvas = createCanvas(1400, 200);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1400, 200);
  ctx.fillStyle = "#000";
  ctx.font = "48px serif";
  ctx.fillText("Notice issued on 01.04.2024", 60, 110);
  await writeFile(image, canvas.toBuffer("image/png"));
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user") }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Built v. Installed");
    await page.getByRole("button", { name: "Create matter" }).click();
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: p })) as typeof dialog.showOpenDialog;
    }, [file, image]);
    await page.getByRole("button", { name: "Add files" }).click();
    await expect(page.getByText("1 pp.")).toHaveCount(2, { timeout: 120_000 });
    const nb = await page.evaluate(async () => { const oa = (globalThis as any).openadvo; const m = (await oa.listMatters())[0]; return oa.getNotebook(m.id); });
    expect(nb.events.some((e: any) => e.reading === "ocr" && e.dateStart === "2024-04-01")).toBe(true);
    await page.getByRole("button", { name: "order.pdf" }).click();
    await expect(page.getByTestId("viewer-state")).toContainText("Opened read only", { timeout: 90_000 });
    await page.getByRole("button", { name: "Back to matter" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByTestId("versions")).toContainText("1.2.0");
    await expect(page.getByTestId("versions")).toContainText("v9.3.6");
  } finally {
    await app.close();
  }
});
