/**
 * Step 5 end-to-end: an agent change to a draft, kept or undone by the advocate in the chat
 * card, and the approval gate. Spec: docs/specs/v0-verification.md.
 * The agent's propose_correction tool is stood in for by the test hook, so no model is needed.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { existsSync } from "node:fs";
import { platformKey } from "../../src/lib/euro-office/platform.ts";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const vendored = existsSync(path.join(repo, "resources", "euro-office", platformKey(), "converter"));
test.describe.configure({ timeout: 180_000 });

async function brief(file: string): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  [
    "IN THE SUPREME COURT OF INDIA",
    "1. The writ petition was filed on 02.01.2023.",
    "2. The High Court dismissed the writ petition by its judgment dated 12.03.2024.",
  ].forEach((text, i) => page.drawText(text, { x: 60, y: 780 - i * 24, size: 12, font }));
  await writeFile(file, await doc.save());
}

test("agent changes: keep, undo, and no approval while one is undecided", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e5-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const file = path.join(inbox, "brief.pdf");
  await brief(file);
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  await page.getByRole("button", { name: "New matter" }).click();
  await page.getByLabel("Matter title").fill("Step five");
  await page.getByRole("button", { name: "Create matter" }).click();
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
  const matterId: string = await page.evaluate(async () => (await (globalThis as any).openadvo.listMatters())[0].id);

  const draft = await page.evaluate(async (id) => {
    const oa = (globalThis as any).openadvo;
    for (const e of (await oa.getNotebook(id)).events) await oa.confirmEvent(id, e.id);
    const { draft } = await oa.generateListOfDates(id);
    const detail = await oa.getRevision(id, draft.head.id);
    return { id: draft.id, paragraphs: detail.paragraphs.filter((p: any) => p.anchor) };
  }, matterId);
  expect(draft.paragraphs.length).toBe(2);
  const [p1, p2] = draft.paragraphs as Array<{ anchor: string; text: string }>;

  // The agent proposes a wording change and a date change (substantive, item g).
  for (const [p, replacement] of [
    [p1, p1.text.replace("was filed", "was presented")],
    [p2, p2.text.replace("12.03.2024", "13.03.2024")],
  ] as const) {
    await app.evaluate(
      (_e, a) => (globalThis as any).__openadvoTest.proposeCorrection(a.matterId, a.input),
      { matterId, input: { draftId: draft.id, anchor: p.anchor, expected: p.text, replacement, reason: "test" } },
    );
  }

  // Item h: the head revision cannot be approved while a change is undecided.
  const refused = await page.evaluate(async (id) => {
    const oa = (globalThis as any).openadvo;
    const head = (await oa.listDrafts(id))[0].head;
    try {
      await oa.approveRevision(id, head.id);
      return "approved";
    } catch (e) {
      return String((e as Error).message);
    }
  }, matterId);
  expect(refused).toContain("AGENT_CHANGES_UNDECIDED");

  // Re-enter the matter: the dock reads the undecided changes from the head revision.
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Step five" }).first().click();
  const card = page.getByTestId("agent-changes-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("2 agent change(s) not decided");
  await expect(card.getByTestId("agent-change")).toHaveCount(2);
  await expect(card.locator('[data-substantive="yes"]')).toContainText("13.03.2024");

  // Item c: the open revision's harness bar counts the undecided changes (needs the vendored editor).
  if (vendored) {
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByRole("button", { name: "Open latest" }).click();
    await expect(page.getByTestId("draft-undecided")).toHaveText("2 agent change(s) not decided", { timeout: 60_000 });
  }

  // Keep all covers the wording change only.
  await card.getByRole("button", { name: "Keep all wording changes (1)" }).click();
  await expect(card).toContainText("1 agent change(s) not decided", { timeout: 30_000 });
  await card.locator('[data-substantive="yes"]').getByRole("button", { name: "Undo" }).click();
  await expect(card).toBeHidden({ timeout: 30_000 });
  // The open draft moved to the new head revision, which holds no undecided change.
  if (vendored) {
    await expect(page.getByTestId("draft-status")).toContainText("Revision 5", { timeout: 60_000 });
    await expect(page.getByTestId("draft-undecided")).toHaveCount(0);
  }

  const result = await page.evaluate(async (id) => {
    const oa = (globalThis as any).openadvo;
    const head = (await oa.listDrafts(id))[0].head;
    const detail = await oa.getRevision(id, head.id);
    await oa.approveRevision(id, head.id);
    const after = (await oa.listDrafts(id))[0];
    return { seq: head.seq, author: head.author, texts: detail.paragraphs.map((p: any) => p.text), approved: after.approved?.seq ?? null };
  }, matterId);
  expect(result.seq).toBe(5);
  expect(result.author).toBe("advocate");
  expect(result.texts).toContain(p1.text.replace("was filed", "was presented"));
  expect(result.texts).toContain(p2.text);
  expect(result.approved).toBe(5);
  await app.close();
});
