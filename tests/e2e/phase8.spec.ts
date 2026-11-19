/**
 * Phase 8 end-to-end (docs/specs/practice-packs.md section 5): the practice packs in the window,
 * a criminal matter's bail skill run with its report card, and the SLP pack on the Filing tab.
 * The owner's real briefs are the phase exit (lesson L3); this test proves the window path.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
type App = Awaited<ReturnType<typeof electron.launch>>;

const bridge = (page: Page) => <T,>(name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (globalThis as any).openadvo[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;
const out = (v: unknown) => "The output:\n```json\n" + JSON.stringify(v) + "\n```";

async function launch(base: string): Promise<{ app: App; page: Page }> {
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function idle(page: Page, matterId: string) {
  await expect.poll(async () => (await page.evaluate((m) => (globalThis as any).openadvo.getChat(m), matterId)).busy, { timeout: 60_000 }).toBe(false);
}

test("phase 8: the four packs, a bail skill with its review, and the pack on the Filing tab", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-p8-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const brief = path.join(inbox, "FIR.txt");
  await writeFile(
    brief,
    [
      "FIRST INFORMATION REPORT",
      "FIR No. 44 of 2024, Police Station Connaught Place",
      "1. The complainant says the accused took 50000 rupees on 02.01.2024.",
      "2. The accused was arrested on 05.01.2024 and remanded on 06.01.2024.",
    ].join("\n"),
  );
  const { app, page } = await launch(base);
  const call = bridge(page);

  await page.getByRole("button", { name: "New matter" }).first().click();
  await page.getByLabel("Matter title").fill("State v. Accused");
  await page.getByRole("button", { name: "Create matter" }).click();
  const matterId = ((await call<Array<{ id: string }>>("listMatters"))[0]).id;
  await page.evaluate(([m, f]) => (globalThis as any).openadvo.addFiles(m, [f]), [matterId, brief]);
  await expect(page.getByRole("button", { name: "FIR.txt" })).toBeVisible({ timeout: 120_000 });
  await app.evaluate(() => (globalThis as any).__openadvoTest.ingestIdle());
  const nb = await call<{ events: Array<{ id: string }> }>("getNotebook", matterId);
  for (const e of nb.events) await call("confirmEvent", matterId, e.id);
  await call("setMatterProfile", matterId, { practiceArea: "criminal", caseType: "Bail application", proceeding: "Bail application" });

  // ---- The Filing tab: the criminal pack, its proceeding and its workflow ----
  await page.getByRole("tab", { name: "Filing" }).click();
  await expect(page.getByTestId("filing-pack")).toContainText("Criminal", { timeout: 20_000 });
  await expect(page.getByTestId("filing-pack")).toContainText("Regular bail");
  await expect(page.getByTestId("pack-workflow")).toContainText("SK-103");
  await expect(page.getByTestId("required-documents")).toContainText("Application for Regular Bail");
  await expect(page.getByTestId("required-documents")).toContainText("Vakalatnama");

  // ---- Workflows & Skills: four packs, the review score, and the pack filter ----
  await page.getByTestId("nav-skills").click();
  for (const id of ["criminal", "civil", "writ", "slp"]) await expect(page.getByTestId(`pack-${id}`)).toBeVisible();
  await expect(page.getByTestId("pack-slp")).toContainText("default");
  await page.getByTestId("skill-pack-filter").selectOption("criminal");
  await expect(page.getByTestId("skill-SK-103")).toBeVisible();
  await expect(page.getByTestId("skill-SK-103")).toContainText("reviewed");
  await expect(page.getByTestId("skill-SK-103")).toContainText("criminal");
  await expect(page.getByTestId("skill-SK-103")).toContainText("Regular bail");
  // A skill of another pack is not listed under this filter.
  await expect(page.getByTestId("skill-SK-304")).toHaveCount(0);

  // ---- A bail skill run on the scripted model: the report card and the record ----
  await page.getByTestId("nav-matters").click();
  await page.getByText("State v. Accused").first().click();
  await app.evaluate(async (_e, s) => (globalThis as any).__openadvoTest.setModelScript(s), {
    agent: [
      { tools: [{ name: "run_skill", args: { skill: "SK-103", request: "Draft the regular bail application.", reason: "the advocate asked for a bail application" } }] },
      { text: "The bail draft is ready for the advocate." },
    ],
    skill: [{ text: out({ title: "APPLICATION FOR REGULAR BAIL", paragraphs: [{ text: "1. The applicant was arrested on 05.01.2024 and remanded on 06.01.2024.", anchors: [] }], not_read: ["The charge-sheet is not in the record."] }) }],
  });
  await page.evaluate((m) => (globalThis as any).openadvo.sendChat(m, "Draft the regular bail application."), matterId);
  await expect(page.getByTestId("report-card").last()).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await idle(page, matterId);
  const runs = await call<Array<{ skillId: string; state: string }>>("listSkillRuns", matterId);
  expect(runs.map((r) => [r.skillId, r.state])).toContainEqual(["SK-103", "done"]);
  await page.screenshot({ path: path.join(repo, "test-results", "phase8-packs.png") });
  await app.close();
});
