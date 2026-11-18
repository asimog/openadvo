/**
 * Phase 10 end-to-end (docs/specs/memory-and-knowledge.md section 5): an old matter's memory
 * answers with their records, an outcome record, an approved precedent offered first for a new
 * draft, and the advocate memory graph. The owner's real brief is the phase exit (lesson L3).
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

async function makeDirs(): Promise<{ home: string; userData: string; inbox: string }> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e-phase10-"));
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

test("phase 10: memory answers, an outcome, an approved precedent and the advocate graph", async () => {
  const dirs = await makeDirs();
  const fir = path.join(dirs.inbox, "FIR.txt");
  await writeFile(fir, ["FIRST INFORMATION REPORT", "FIR No. 44 of 2024", "1. The complainant says the accused took 50000 rupees on 02.01.2024.", "2. The accused was arrested on 05.01.2024."].join("\n"));
  const precedent = path.join(dirs.inbox, "Delhi bail application precedent.docx");
  await writeFile(precedent, "A precedent of a bail application for the Delhi High Court.");
  const { app, page } = await launch(dirs);
  const call = <T,>(name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (globalThis as any).openadvo[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

  await createMatter(page, "State v. Accused");
  const id = await matterId(app);
  await page.evaluate((m) => (globalThis as any).openadvo.setCourtProfile({ courts: ["in.hc.delhi"], practice: ["criminal"] }), id);
  await call("setMatterProfile", id, { court: "High Court of Delhi", proceeding: "Bail application", caseType: "Bail application", practiceArea: "criminal" });
  await page.evaluate(([m, f]) => (globalThis as any).openadvo.addFiles(m, [f]), [id, fir]);
  await expect(page.getByText("FIR.txt")).toBeVisible({ timeout: 120_000 });
  await app.evaluate(() => (globalThis as any).__openadvoTest.ingestIdle());

  // The hearing and the typed memory the answers read.
  await call("addHearing", id, { date: "2026-10-01", bench: "Delhi High Court", directions: "List on 12.10.2026.", nextDate: "2026-10-12", nextDateStatus: "confirmed" });
  await call("matterMemoryPropose", id, { type: "advocate_decision", subject: "the bail application", relation: "is", object: "to press the custody ground first" });
  await call("matterMemoryPropose", id, { type: "client_instruction", subject: "the client", relation: "instructed", object: "file the bail application this week" });

  // ---- The memory answers ----
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByTestId("memory-question-what_decided").click();
  await expect(page.getByTestId("memory-answer")).toContainText("you decided to press the custody ground first", { timeout: 20_000 });
  await expect(page.getByTestId("memory-answer")).toContainText("Directions at the hearing of 2026-10-01");
  await page.getByTestId("memory-question-instructions").click();
  await expect(page.getByTestId("memory-answer")).toContainText("the client instructed: file the bail application this week");
  await page.getByTestId("memory-question-since_last_hearing").click();
  await expect(page.getByTestId("memory-answer")).toContainText("New document: FIR.txt");

  // ---- The outcome record ----
  await page.getByLabel("Outcome result").selectOption("allowed");
  await page.getByLabel("Outcome subject").fill("bail on the custody ground");
  await page.getByLabel("Outcome court").fill("Delhi High Court");
  await page.getByLabel("Outcome date").fill("2026-10-12");
  await page.getByTestId("outcome-record").click();
  await expect(page.getByTestId("outcome-list")).toContainText("bail on the custody ground");
  await expect(page.getByTestId("outcome-list")).toContainText("allowed");
  const outcomes = await call<Array<{ result: string; status: string }>>("listOutcomes", id);
  expect(outcomes.map((o) => [o.result, o.status])).toEqual([["allowed", "active"]]);

  // ---- An approved precedent is offered first ----
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, precedent);
  const imported = await call<{ items: Array<{ id: string }> }>("libraryImportFiles");
  expect(imported.items.length).toBe(1);
  await call("libraryUpdate", imported.items[0].id, { title: "Delhi bail application precedent", kind: "pleading", status: "approved", court: "in.hc.delhi", scope: "bail" });
  const offers = await call<Array<{ title: string; reason: string }>>("listPrecedents", id, 3);
  expect(offers[0].title).toBe("Delhi bail application precedent");
  expect(offers[0].reason).toContain("approved");
  expect(offers[0].reason).toContain("in.hc.delhi");
  await page.getByRole("tab", { name: "Matter", exact: true }).click();
  await expect(page.getByTestId("precedent-offers")).toContainText("Delhi bail application precedent", { timeout: 20_000 });

  // ---- The advocate memory graph ----
  const graph = await call<{ edges: Array<{ relation: string }>; counts: Array<{ relation: string; n: number }> }>("rebuildAdvocateGraph");
  expect(graph.edges.some((e) => e.relation === "approved")).toBe(true);
  expect(graph.edges.some((e) => e.relation === "succeeded_when")).toBe(true);
  await page.getByTestId("nav-knowledge").click();
  await expect(page.getByTestId("advocate-graph")).toContainText("approved", { timeout: 20_000 });
  await expect(page.getByTestId("library-role-precedent")).toContainText("Delhi bail application precedent");
  await page.screenshot({ path: path.join(repo, "test-results", "phase10-memory.png") });
  await app.close();
});
