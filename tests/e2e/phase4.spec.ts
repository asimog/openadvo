/**
 * Phase 4 end to end: facts, structure, evidence, contradictions, the jurisdiction report, typed
 * memory, record-table templates and a document operation. Spec: docs/specs/documents-evidence-facts.md.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

async function makeDirs(): Promise<{ home: string; userData: string; inbox: string }> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e-phase4-"));
  const dirs = { home: path.join(base, "matters"), userData: path.join(base, "user-data"), inbox: path.join(base, "inbox") };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
  return dirs;
}

async function launch(dirs: { home: string; userData: string }): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: dirs.home, OPENADVO_USER_DATA: dirs.userData, OPENADVO_TEST: "1" }) });
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

async function matterId(app: ElectronApplication): Promise<string> {
  const root: string = await app.evaluate(() => (globalThis as any).__openadvoTest.mattersRoot());
  const entries = await readdir(root);
  expect(entries.length).toBe(1);
  return entries[0];
}

async function makeRecord(file: string): Promise<string> {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "IN THE HIGH COURT OF DELHI",
    "Asha v. State",
    "FACTS",
    "The defendant paid Rs. 5,00,000 on 12.03.2024.",
    "The defendant admitted that the agreement was signed on 1 January 2024.",
    "GROUNDS",
    "The order is arbitrary and without reasons.",
    "PRAYER",
    "It is therefore prayed that the order be quashed.",
    "The courts at Delhi shall have exclusive jurisdiction over this dispute.",
    "The Court directed the respondent to file a reply within four weeks.",
    "Annexure P-1 is the arrest memo.",
  ];
  lines.forEach((line, i) => page1.drawText(line, { x: 50, y: 780 - i * 22, size: 11, font }));
  await writeFile(file, await doc.save());
  return file;
}

test("Phase 4: a read record becomes facts, structure, evidence, contradictions, jurisdiction and memory", async () => {
  const dirs = await makeDirs();
  const pdf = await makeRecord(path.join(dirs.inbox, "record.pdf"));
  const { app, page } = await launch(dirs);
  await createMatter(page, "Phase 4 matter");
  const id = await matterId(app);
  await page.evaluate((m) => (globalThis as any).openadvo.setCourtProfile({ courts: ["in.hc.delhi"], practice: ["civil"] }), id);
  await page.evaluate((m) => (globalThis as any).openadvo.setMatterProfile(m, { court: "High Court of Delhi", proceeding: "Civil suit", caseType: "Civil suit" }), id);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, pdf);
  await page.getByRole("button", { name: "Add files" }).click();
  await app.evaluate(() => (globalThis as any).__openadvoTest.ingestIdle());

  const view = page.getByTestId("matter-view").getByTestId("work-view");
  await view.getByRole("tab", { name: "Facts", exact: true }).click();
  await expect(page.getByTestId("facts-panel")).toBeVisible();
  await expect(page.getByTestId("fact-row").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("fact-list")).toContainText("5,00,000");

  await view.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(page.getByTestId("structure-panel")).toContainText("PRAYER");
  await expect(page.getByTestId("structure-panel")).toContainText("Annexure P-1");

  await view.getByRole("tab", { name: "Jurisdiction", exact: true }).click();
  await expect(page.getByTestId("jurisdiction-panel")).toContainText("High Court of Delhi");
  await expect(page.getByTestId("forum-clauses")).toContainText("exclusive");

  // A contradiction: two facts with the same words and different dates.
  const facts = await page.evaluate((m) => (globalThis as any).openadvo.evidenceAddFact(m, { text: "The defendant paid the amount on 1 January 2024.", type: "fact", date: "2024-01-01" }), id);
  await page.evaluate((m) => (globalThis as any).openadvo.evidenceAddFact(m, { text: "The defendant paid the amount on 1 February 2024.", type: "fact", date: "2024-02-01" }), id);
  const contradictions = await page.evaluate((m) => (globalThis as any).openadvo.evidenceContradictions(m), id);
  expect(contradictions.some((c: any) => c.kind === "date")).toBe(true);

  // The evidence repository.
  const sources = await page.evaluate((m) => (globalThis as any).openadvo.listSources(m), id);
  await page.evaluate((input) => (globalThis as any).openadvo.evidenceAdd(input.m, { sourceId: input.sourceId, exhibitNumber: "P-1", witness: "PW-1", statement: "The witness identifies the notice.", givenBy: "Asha", givenAt: "12.03.2024", admissibility: "Original seen." }), { m: id, sourceId: sources[0].id });
  await view.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByTestId("evidence-list")).toContainText("PW-1");
  await expect(page.getByTestId("source-relations")).toBeVisible();

  // Typed memory: propose and confirm.
  await view.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByLabel("Memory subject").fill("notice");
  await page.getByLabel("Memory relation").fill("was served on");
  await page.getByLabel("Memory object").fill("2 January 2024");
  await page.getByTestId("memory-propose").click();
  await expect(page.getByTestId("memory-list")).toContainText("notice was served on 2 January 2024");
  await expect(page.getByTestId("memory-list")).toContainText("confirmed");
  // The agent's proposal waits for the advocate.
  await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "propose_matter_memory", { type: "fact_from_document", subject: "arrest", relation: "was made on", object: "1 January 2024" }), { id });
  await view.getByRole("tab", { name: "Facts", exact: true }).click();
  await view.getByRole("tab", { name: "Memory", exact: true }).click();
  await expect(page.getByTestId("memory-list")).toContainText("arrest was made on 1 January 2024");
  await page.getByTestId("memory-list").getByRole("button", { name: "Confirm" }).first().click();
  await expect(page.getByTestId("memory-list")).toContainText("confirmed");

  // The record table template.
  await view.getByRole("tab", { name: "Record table", exact: true }).click();
  await expect(page.getByTestId("record-templates")).toBeVisible();
  await page.getByLabel("Record table template").selectOption("plaint_admissions");
  await page.getByRole("button", { name: "Add the template columns" }).click();
  await expect(page.getByTestId("record-table")).toContainText("Plaint allegation");

  // A document operation writes a new source.
  const before = (await page.evaluate((m) => (globalThis as any).openadvo.listSources(m), id)).length;
  const op = await page.evaluate((input) => (globalThis as any).openadvo.documentOperation(input.m, { kind: "extract", sourceId: input.sourceId, pages: [1] }), { m: id, sourceId: sources[0].id });
  expect(op.operation.kind).toBe("extract");
  const after = (await page.evaluate((m) => (globalThis as any).openadvo.listSources(m), id)).length;
  expect(after).toBe(before + 1);
  expect(facts.id).toBeTruthy();
  await app.close();
});
