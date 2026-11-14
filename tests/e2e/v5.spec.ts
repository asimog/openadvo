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

test("v5 C: quick check, voice, an overruling treatment, the rehearsal and bench trends", async () => {
  const { parquetWriteBuffer } = await import("hyparquet-writer");
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev5c-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER", "The petitioner has been in custody since 05.01.2020 and bail was refused on 12.03.2024."]));
  const parquet = Buffer.from(
    parquetWriteBuffer({
      columnData: [
        { name: "title", data: ["ELDECO HOUSING AND INDUSTRIES LIMITED versus ASHOK VIDYARTHI", "RAM LAL versus STATE"], type: "STRING" },
        { name: "case_id", data: ["2023 INSC 1043", "2023 INSC 1047"], type: "STRING" },
        { name: "decision_date", data: ["30-11-2023", "04-12-2023"], type: "STRING" },
        { name: "disposal_nature", data: ["Appeal(s) allowed", "Appeal(s) dismissed"], type: "STRING" },
        { name: "path", data: ["2023_16_872_887", "2023_15_808_820"], type: "STRING" },
      ],
    }),
  ).toString("base64");
  const { app, page } = await start(base);
  const call = bridge(page);
  try {
    await app.evaluate((_e, b) => (globalThis as any).__openadvoTest.setResearchFixtures([{ match: "metadata/parquet/year=2023/metadata.parquet", body: b, base64: true }]), parquet);
    const matterId = await matterWith(page, app, "Authorities v. Rehearsal", [order]);
    for (const e of (await call<any>("getNotebook", matterId)).events) await call("confirmEvent", matterId, e.id);
    const issue = await call<any>("addIssue", matterId, "Whether bail could be refused without weighing four years of custody?");
    await call("decideIssue", matterId, issue.id, "accepted", "Arises.");
    await call("addAuthority", matterId, { citation: "2023 INSC 1043", parties: "Eldeco Housing v. Ashok Vidyarthi", decisionDate: "2023-11-29", paragraph: "12", proposition: "p", role: "supporting", issueId: issue.id });
    await call("indexSupremeCourt", [2023]);

    // ---- V5-9: quick check, labelled not verified ----
    await page.getByRole("tab", { name: "Studio" }).click();
    await page.getByRole("button", { name: "Quick check the citations" }).click();
    await expect(page.getByTestId("quick-check").locator('[data-outcome="mismatch"]')).toContainText("decision date");
    await expect(page.getByTestId("quick-check")).toContainText("Quick check, not verified");

    // ---- V5-10: voice and an overruling by a smaller bench ----
    const row = page.getByTestId("authority-row").first();
    await row.getByLabel("Voice of the authority").selectOption("holding");
    await row.getByRole("button", { name: "Set voice" }).click();
    await expect(row).toContainText("Voice confirmed");
    await row.getByRole("button", { name: "Record treatment" }).click();
    await row.getByLabel("Treated by (citation)").fill("2024 INSC 5");
    await row.getByLabel("Its date").fill("2024-01-10");
    await row.getByLabel("Its bench strength").fill("2");
    await row.getByLabel("Date of the authority").fill("2023-11-30");
    await row.getByLabel("Bench strength of the authority").fill("3");
    await row.getByRole("button", { name: "Save treatment" }).click();
    await expect(row.getByTestId("treatment")).toContainText("overruled");
    const kinds = (await call<any[]>("listReviewItems", matterId)).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["authority_overruled", "treatment_check"]));

    // ---- V5-12: bench trends, descriptive ----
    await page.getByRole("button", { name: "Show the trends" }).click();
    await expect(page.getByTestId("bench-trends")).toContainText("2023");
    await expect(page.getByTestId("bench-trends")).toContainText("50%");

    // ---- V5-11: the rehearsal, with a scripted model ----
    await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.rehearseScripted(id, [
      { match: "bench is most likely", answer: JSON.stringify({ questions: [{ question: "How long has the petitioner been in custody?", answer: "Since 05.01.2020, as E1 records.", events: [{ ref: "E1", quote: "in custody since 05.01.2020" }] }] }) },
      { match: "As counsel for the respondent at the admission hearing", answer: JSON.stringify({ objections: [{ category: "delay", objection: "The petition was filed late.", response: "A1 at para 12.", authorities: [{ ref: "A1", paragraph: "12" }] }] }) },
    ]), matterId);
    await page.getByTestId("studio").getByRole("tab", { name: "Rehearsal" }).click();
    await expect(page.getByTestId("rehearsal")).toContainText("How long has the petitioner been in custody?");
    await expect(page.getByTestId("rehearsal")).toContainText("The petition was filed late.");
    const ch = page.getByTestId("challenge").first();
    await ch.getByRole("button", { name: "Accept" }).click();
    await expect(ch).toHaveAttribute("data-status", "accepted");
  } finally {
    await app.close();
  }
});

test("v5 D: Word round trip and compare, the victim-name defect, limitation with the certified-copy exclusion", async () => {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev5d-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER", "The High Court dismissed the appeal by judgment dated 12.03.2024.", "The statement of Meena was recorded on 02.01.2024."]));
  const { app, page } = await start(base);
  const call = bridge(page);
  try {
    const matterId = await matterWith(page, app, "Word v. Compare", [order]);
    for (const e of (await call<any>("getNotebook", matterId)).events) await call("confirmEvent", matterId, e.id);
    const lod = await call<any>("generateListOfDates", matterId);

    // ---- V5-13: open in Word (a copy), bring the edited copy back, compare ----
    const opened = await call<any>("openInWord", matterId, lod.revision.id);
    expect(opened.file).toMatch(/\.docx$/);
    const edited = path.join(base, "edited.docx");
    await writeFile(edited, await Packer.toBuffer(new Document({ sections: [{ children: ["LIST OF DATES", "12.03.2024 The High Court dismissed the appeal.", "02.01.2024 The statement of Meena was recorded."].map((t) => new Paragraph({ children: [new TextRun(t)] })) }] })));
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, edited);
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Word v. Compare" }).first().click();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    const tools = page.locator(".draft-row", { hasText: "LIST OF DATES" });
    await tools.getByRole("button", { name: "Compare and Word" }).click();
    await tools.getByRole("button", { name: "Bring back the edited copy" }).click();
    await expect(page.getByTestId("word-note")).toContainText("The edited copy is revision 2.");
    await tools.getByRole("button", { name: "Close" }).click();
    await tools.getByRole("button", { name: "Compare and Word" }).click();
    await tools.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(page.getByTestId("diff")).toContainText("The High Court dismissed the appeal.");
    expect(await page.getByTestId("diff").locator("li").count()).toBeGreaterThan(0);

    // ---- V5-15: a protected victim's name is a defect ----
    await page.getByTestId("detail-victim-protected").check();
    await page.getByTestId("detail-victim-names").fill("Meena");
    await page.getByRole("button", { name: "Save matter details" }).click();
    await expect.poll(async () => (await call<any>("getFiling", matterId)).details.victimNames).toEqual(["Meena"]);
    const check = await call<any>("checkDraft", matterId, lod.draft.id);
    expect(check.defects.some((d: any) => d.kind === "victim_identity")).toBe(true);

    // ---- V5-16: limitation with the certified-copy exclusion ----
    const judgment = (await call<any>("getNotebook", matterId)).events.find((e: any) => e.dateStart === "2024-03-12");
    await call("setMatterDetails", matterId, { impugnedEventId: judgment.id, copyApplied: "2024-03-20", copyReceived: "2024-04-05" });
    const lim = await call<any>("computeLimitation", matterId);
    expect(lim.working).toContain("17 day(s) excluded");
    expect(lim.deadline).toBe("2024-06-27");
  } finally {
    await app.close();
  }
});
