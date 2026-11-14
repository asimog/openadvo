/**
 * V2 end to end, against the built application. Spec: docs/specs/v2.md (V2-1 to V2-6, V2-8).
 * V2-6 condonation and V2-7 signing are in steps6to10.spec.ts, where a filing set is made.
 * The agent's propose_memory_note is called through the test hook, so the test needs no model.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
test.describe.configure({ timeout: 240_000 });

const LINES = [
  "JUDGMENT",
  "The writ petition was dismissed on 12.03.2024 by the learned Single Judge after hearing both sides at length.",
  "The petitioner applied for a certified copy of the order the next day.",
  "The learned Single Judge held that the petitioner had an alternative remedy before the appellate authority under the statute and that the writ court would not interfere with the order of assessment at this stage of the proceedings.",
  "The petitioner contends that the order was passed without notice and in breach of the principles of natural justice, and that the alternative remedy is no bar in such a case.",
];

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

test("v2: DOCX and text sources, type, same-text pair, relative date, List of Dates rows, memory proposal, interim relief", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev2-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const docxFile = path.join(inbox, "judgment.docx");
  const doc = new Document({ sections: [{ children: LINES.map((t) => new Paragraph({ children: [new TextRun(t)] })) }] });
  await writeFile(docxFile, await Packer.toBuffer(doc));
  const txtFile = path.join(inbox, "judgment-copy.txt");
  await writeFile(txtFile, LINES.join("\n"));
  const { app, page } = await launch(base);
  const call = bridge(page);
  try {
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Formats v. Rules");
    await page.getByRole("button", { name: "Create matter" }).click();
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
    }, [docxFile, txtFile]);
    await page.getByRole("button", { name: "Add files" }).click();
    const matterId: string = (await call<any[]>("listMatters"))[0].id;
    await expect.poll(async () => (await call<any[]>("listSources", matterId)).map((s) => s.docType?.type ?? null), { timeout: 60_000 }).toEqual(["judgment", "judgment"]);
    const sources = await call<any[]>("listSources", matterId);
    expect(sources.map((s) => s.mediaType).sort()).toEqual(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);

    // ---- V2-3: one review item for the same-text pair; the advocate decides; nothing is merged ----
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    const dup = page.locator(".review-list li", { hasText: "of their text in common" });
    await expect(dup).toBeVisible({ timeout: 30_000 });
    await dup.getByRole("button", { name: "Same document" }).click();
    await expect.poll(async () => (await call<any[]>("listDuplicates", matterId))[0]?.decision).toBe("same");
    expect((await call<any[]>("listSources", matterId)).length).toBe(2);

    // ---- V2-1 and V2-2: the DOCX shows its text; the advocate sets the type ----
    await page.getByRole("tab", { name: "Sources" }).click();
    await page.getByRole("button", { name: "judgment.docx" }).click();
    await expect(page.getByTestId("viewer-state")).toContainText("DOCX: no PDF view");
    await expect(page.getByTestId("page-lines")).toContainText("The writ petition was dismissed on 12.03.2024");
    await page.getByTestId("doc-type").getByLabel("Document type").selectOption("order");
    await page.getByTestId("doc-type").getByRole("button", { name: "Set type" }).click();
    await expect.poll(async () => (await call<any[]>("listSources", matterId)).find((s) => s.name === "judgment.docx")?.docType).toEqual({ type: "order", status: "confirmed", matched: expect.any(String) });

    // ---- V2-4: "the next day" is an inferred date, named with its base ----
    const nb = await call<any>("getNotebook", matterId);
    const rel = nb.events.filter((e: any) => e.dateText.includes("the next day"));
    expect(rel.length).toBe(2);
    expect(rel[0].dateStart).toBe("2024-03-13");
    expect(rel[0].dateType).toBe("inferred");
    expect(rel[0].dateText).toContain("from 12.03.2024");

    // ---- V2-5: choose the List of Dates rows ----
    for (const e of nb.events) await call("confirmEvent", matterId, e.id);
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Formats v. Rules" }).first().click();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByTestId("lod-rows").locator("summary").click();
    await page.getByTestId("lod-rows").getByLabel(/^Keep "the next day"/).first().check();
    await page.getByTestId("lod-rows").getByRole("button", { name: "Save rows" }).click();
    await expect(page.getByTestId("lod-rows").locator("summary")).toContainText("1 chosen");
    const lod = await call<any>("generateListOfDates", matterId);
    const lodParas = (await call<any>("getRevision", matterId, lod.revision.id)).paragraphs.filter((p: any) => p.anchor);
    expect(lodParas.length).toBe(1);
    expect(lodParas[0].text).toContain("13.03.2024");

    // ---- V2-8: the agent proposes a memory note; the advocate adds it ----
    await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.proposeMemoryAsAgent(id, "Client wants no interim relief in the trial court.", "The advocate said so in chat."), matterId);
    await page.getByRole("tab", { name: "Sources" }).click();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await expect(page.getByTestId("memory-proposal")).toContainText("Client wants no interim relief");
    await page.getByTestId("memory-proposal").getByRole("button", { name: "Add to memory" }).click();
    await expect(page.getByTestId("memory-text")).toHaveValue(/Client wants no interim relief in the trial court\./);
    await expect(page.getByTestId("memory-proposal")).toHaveCount(0);
    expect(await call<string>("getMemory", matterId)).toContain("Client wants no interim relief");

    // ---- V2-6: interim relief in the matter details goes into the petition ----
    await page.getByTestId("detail-interim").fill("stay the operation of the impugned judgment");
    await page.getByRole("button", { name: "Save matter details" }).click();
    await expect.poll(async () => (await call<any>("getFiling", matterId)).details.interimRelief).toBe("stay the operation of the impugned judgment");
    const pet = await call<any>("generateDraft", matterId, "petition");
    const petText: string[] = (await call<any>("getRevision", matterId, pet.revision.id)).paragraphs.map((p: any) => p.text);
    expect(petText).toContain("7. PRAYER FOR INTERIM RELIEF");
    expect(petText).toContain("(a) stay the operation of the impugned judgment; and");
  } finally {
    await app.close();
  }
});
