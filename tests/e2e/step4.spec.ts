/**
 * Step 4 end-to-end: the List of Dates and Synopsis as a DOCX in the vendored Word editor,
 * against the built application. Spec: docs/specs/v0-list-of-dates-and-synopsis.md.
 * Needs the vendored Euro-Office release (`npm run vendor`).
 */
import { test, expect, _electron as electron, type ElectronApplication, type Frame, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { platformKey } from "../../src/lib/euro-office/platform.ts";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const vendored = existsSync(path.join(repo, "resources", "euro-office", platformKey(), "converter"));

// Two saves and two editor sessions make this test slower than the others.
test.describe.configure({ timeout: 300_000 });

/** One page of text with three dated lines, so the Notebook extracts three events. */
async function brief(file: string): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  [
    "IN THE SUPREME COURT OF INDIA",
    "1. The writ petition was filed on 02.01.2023.",
    "2. The High Court dismissed the writ petition by its judgment dated 12.03.2024.",
    "3. The petitioner filed a review petition on 01.04.2024.",
  ].forEach((text, i) => page.drawText(text, { x: 60, y: 780 - i * 24, size: 12, font }));
  await writeFile(file, await doc.save());
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

/** The frame of the Euro-Office Word editor inside the draft frame. */
async function editorFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 200; i += 1) {
    const frame = page.frames().find((f) => f.url().includes("/documenteditor/main/index.html"));
    if (frame) {
      const ready = await frame.evaluate(() => {
        try {
          const api = (globalThis as any).Asc.editor.getJsApi();
          return api.GetDocument().GetAllParagraphs().length > 0;
        } catch {
          return false;
        }
      });
      if (ready) return frame;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("the Word editor frame did not become ready");
}

test("generate, show source, edit and save twice, approve", async () => {
  test.skip(!vendored, "the Euro-Office release is not vendored; run npm run vendor");
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e4-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const file = path.join(inbox, "brief.pdf");
  await brief(file);
  const { app, page } = await launch(base);

  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill("Step four");
  await page.getByRole("button", { name: "Create matter" }).click();
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
  const matterId: string = await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters())[0].id);

  // Rule 1 of the spec: nothing unconfirmed enters generated prose.
  await page.getByRole("tab", { name: "Matter", exact: true }).click();
  await page.getByRole("button", { name: "Generate List of Dates" }).click();
  await expect(page.getByTestId("drafts-error")).toContainText("confirm at least one Notebook event");

  const confirmed = await page.evaluate(async (id) => {
    const notebook = await (globalThis as any).openadvo.getNotebook(id);
    for (const event of notebook.events) await (globalThis as any).openadvo.confirmEvent(id, event.id);
    return (await (globalThis as any).openadvo.getNotebook(id)).events.length;
  }, matterId);
  expect(confirmed).toBe(3);
  // Generate the List of Dates; the DOCX opens in the Word editor, with the harness bar in the chat dock.
  await page.getByRole("button", { name: "Generate List of Dates" }).click();
  const frame = page.getByTestId("draft-frame");
  await expect(frame).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("draft-status")).toContainText("Revision 1");
  // The editor fills the view to its top edge; the harness bar sits in the chat dock, left of the editor.
  const view = (await page.getByTestId("work-view").boundingBox())!;
  const frameBox = (await frame.boundingBox())!;
  expect(Math.abs(frameBox.y - view.y)).toBeLessThan(2);
  expect(Math.abs(frameBox.height - view.height)).toBeLessThan(2);
  const bar = (await page.getByTestId("harness-bar").boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(frameBox.x);
  const editor = await editorFrame(page);
  await expect(page.getByText("Opening the Word editor…")).toBeHidden({ timeout: 120_000 });

  // The generated DOCX carries one anchor per event paragraph and the paragraph links are stored.
  const revision = await page.evaluate(async (id) => {
    const drafts = await (globalThis as any).openadvo.listDrafts(id);
    const detail = await (globalThis as any).openadvo.getRevision(id, drafts[0].head.id);
    return {
      seq: detail.seq,
      author: detail.author,
      anchors: detail.paragraphs.map((p: { anchor: string | null }) => p.anchor).filter(Boolean).length,
      paragraphs: detail.paragraphs.length,
    };
  }, matterId);
  expect(revision.anchors).toBe(3);
  expect(revision.author).toBe("generator");
  // Show source: put the cursor in the second date paragraph through the editor's own API, then use the bar.
  await editor.evaluate(() => {
    const api = (globalThis as any).Asc.editor.getJsApi();
    const document = api.GetDocument();
    const paragraph = document.GetAllParagraphs().find((p: any) => p.GetText().includes("dismissed"));
    paragraph.Select();
  });
  await page.getByRole("button", { name: "Show source of this paragraph" }).click();
  const source = page.getByTestId("paragraph-source");
  await expect(source).toBeVisible({ timeout: 20_000 });
  await expect(source).toContainText("The High Court dismissed the writ petition");
  await expect(source).toContainText("brief.pdf, p. 1, l. 3");

  // A paragraph with no anchor says so.
  await editor.evaluate(() => {
    const api = (globalThis as any).Asc.editor.getJsApi();
    api.GetDocument().GetAllParagraphs()[0].Select();
  });
  await page.getByRole("button", { name: "Show source of this paragraph" }).click();
  await expect(page.getByTestId("draft-message")).toContainText("no source link");
  // Edit and save: a human save makes a new revision with a base revision.
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.keyboard.type(" EDIT-ONE", { delay: 25 });
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByTestId("draft-status")).toContainText("Revision 2", { timeout: 60_000 });
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.keyboard.type(" EDIT-TWO", { delay: 25 });
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByTestId("draft-status")).toContainText("Revision 3", { timeout: 60_000 });

  const revisions = await page.evaluate(async (id) => {
    const drafts = await (globalThis as any).openadvo.listDrafts(id);
    const head = drafts[0].head;
    const detail = await (globalThis as any).openadvo.getRevision(id, head.id);
    const first = await (globalThis as any).openadvo.getRevision(id, (await (globalThis as any).openadvo.listDrafts(id))[0].head.id);
    return { count: drafts[0].revisionCount, headSeq: head.seq, base: head.baseRevisionId, author: head.author, anchors: detail.paragraphs.filter((p: { anchor: string | null }) => p.anchor).length, headId: head.id, firstId: first.id };
  }, matterId);
  expect(revisions.count).toBe(3);
  expect(revisions.headSeq).toBe(3);
  expect(revisions.base).not.toBeNull();
  expect(revisions.author).toBe("advocate");
  // The anchors survived two editor saves.
  expect(revisions.anchors).toBe(3);
  // Step 5: the checks on the stored revision. The typed words carry no date, so no defect is found.
  await page.getByRole("button", { name: "Check draft" }).click();
  const check = page.getByTestId("draft-check");
  await expect(check).toContainText("Check of revision 3: 0 defect(s) in 3 statement(s)");
  await expect(check).toContainText("Not checked: Party names and case number match the matter");
  await expect(page.getByTestId("draft-verification")).toContainText("Facts checked: 0 defect(s). Gate: Needs additional instructions. Citations: not verified");
  const checkedEvent = await page.evaluate(async (id) => {
    const events = await (globalThis as any).openadvo.listEvents(id);
    return events.filter((e: { action: string }) => e.action === "draft.checked").length;
  }, matterId);
  expect(checkedEvent).toBe(1);
  // Approve one revision (human-only action); the status shows it.
  await page.getByRole("button", { name: "Approve revision" }).click();
  await expect(page.getByTestId("draft-status")).toContainText("Approved by advocate", { timeout: 30_000 });
  const approved = await page.evaluate(async (id) => {
    const drafts = await (globalThis as any).openadvo.listDrafts(id);
    return { approvedSeq: drafts[0].approved?.seq ?? null, headSeq: drafts[0].head?.seq ?? null };
  }, matterId);
  expect(approved.approvedSeq).toBe(3);

  // The approved revision keeps its content controls in the stored DOCX (the anchor of each event paragraph).
  const stored = await page.evaluate(async (id) => {
    const drafts = await (globalThis as any).openadvo.listDrafts(id);
    const detail = await (globalThis as any).openadvo.getRevision(id, drafts[0].approved!.id);
    return detail.paragraphs.filter((p: { anchor: string | null }) => p.anchor).length;
  }, matterId);
  expect(stored).toBe(3);
  // Leave the editor before closing the application: the editor frame holds the document.
  await page.getByRole("button", { name: "Back to matter" }).click();
  await expect(page.getByTestId("draft-frame")).toBeHidden({ timeout: 30_000 });
  await app.close();
});





