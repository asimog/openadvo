/**
 * Phase 2 in the window (docs/specs/court-adapters.md section 5): the advocate's courts decide
 * what is prepared; Court Intelligence builds one list on demand (only its document is fetched,
 * through the test fetcher); the pack editor; a matter's court and case type, its checklist in
 * the filing compliance list, and its defects. The fixture adapter is the advocate's own.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

const ADAPTER = {
  id: "test-bombay",
  version: "1.0.0",
  title: "Test adapter for the Bombay High Court",
  courts: ["in.hc.bombay"],
  author: "test",
  hosts: ["court.example"],
  general: { website: "https://court.example/" },
  sources: [{ key: "rules", title: "Test Rules, 2020", kind: "rules", owner: "Test", checkDays: 30, reliability: "official", locate: { index: "https://court.example/rules", linkText: "Test Rules, 2020" } }],
  lists: [
    {
      key: "filing.petition",
      kind: "checklist",
      title: "Filing a petition",
      needs: { caseTypes: ["PET"], practice: ["civil"] },
      source: "rules",
      items: [
        { text: "An affidavit supports the petition.", quote: "Every petition shall be supported by an affidavit of the petitioner", ref: "rule 1" },
        { text: "Three spare copies are filed.", quote: "The petitioner shall file three spare copies of the petition", ref: "rule 2" },
        { text: "A court fee stamp of the right value.", quote: "court fee stamps of the value prescribed in the schedule", ref: "rule 9" },
      ],
    },
  ],
  formatChecks: [],
  defects: [{ key: "pagination", title: "Pagination", match: ["paginat"], step: "Paginate the index continuously." }],
  proceedings: [],
};

async function rulesPdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595.28, 841.89]);
  ["TEST RULES, 2020", "1. Every petition shall be supported by an affidavit of the petitioner.", "2. The petitioner shall file three spare copies of the petition."].forEach((t, i) => page.drawText(t, { x: 50, y: 790 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save()).toString("base64");
}

async function launch() {
  const base = await mkdtemp(path.join(tmpdir(), "oa-phase2-"));
  const home = path.join(base, "matters");
  const userData = path.join(base, "user-data");
  await mkdir(home, { recursive: true });
  await mkdir(path.join(userData, "adapters", ADAPTER.id), { recursive: true });
  await writeFile(path.join(userData, "adapters", ADAPTER.id, "adapter.json"), JSON.stringify(ADAPTER));
  const app = await electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME: home, OPENADVO_USER_DATA: userData, OPENADVO_TEST: "1" }) });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const pdf = await rulesPdf();
  await app.evaluate(
    (_e, b64) =>
      (globalThis as any).__openadvoTest.setResearchFixtures([
        { match: "court.example/rules", body: '<a href="/docs/r2020.pdf">Test Rules, 2020</a>', type: "text/html" },
        { match: "court.example/docs/r2020.pdf", body: b64, base64: true, type: "application/pdf" },
      ]),
    pdf,
  );
  return { app, page };
}

const bridge = (page: Page) => <T,>(name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (globalThis as any).openadvo[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

test("the profile's courts decide what is prepared; Court Intelligence builds one list on demand; the pack editor", async () => {
  const { app, page } = await launch();
  const call = bridge(page);
  // Court Intelligence before any court: nothing is prepared or downloaded.
  await page.getByTestId("nav-court").click();
  await expect(page.getByTestId("no-courts")).toBeVisible();
  // The profile: add a court from the directory and a practice area.
  await page.getByTestId("nav-profile").click();
  const prof = page.getByTestId("court-profile");
  await prof.getByLabel("Add a court").fill("Bombay");
  await prof.getByTestId("court-hits").getByRole("listitem").filter({ hasText: "High Court of Bombay" }).getByRole("button", { name: "Add" }).click();
  await expect(prof.getByTestId("profile-courts")).toContainText("High Court of Bombay");
  await prof.getByTestId("profile-practice").getByLabel("civil").check();
  await expect.poll(async () => (await call<{ practice: string[] }>("getCourtProfile")).practice).toEqual(["civil"]);

  // Court Intelligence: the court, its adapter and a list that is recommended and not built.
  await page.getByTestId("nav-court").click();
  const card = page.getByTestId("court-in.hc.bombay");
  await expect(card).toContainText("Appeal route: High Court of Bombay → Supreme Court of India");
  const row = card.getByTestId("court-list-filing.petition");
  await expect(row).toContainText("recommended for your practice");
  await expect(row).toContainText("not built");
  await row.getByRole("button", { name: "Prepare" }).click();
  const list = card.getByTestId("list-filing.petition");
  await expect(list).toContainText("2 of 3 items found in the source");
  await expect(list.getByTestId("pack-item").nth(0)).toHaveAttribute("data-status", "verified");
  await expect(list.getByTestId("pack-item").nth(2)).toHaveAttribute("data-status", "not_found");
  await page.screenshot({ path: path.join(repo, "test-results", "phase2-court-intel.png") });

  // The pack editor: the advocate corrects item 3 with its source; a new version.
  await list.getByTestId("pack-item").nth(2).getByRole("button", { name: "Correct" }).click();
  const editor = list.getByTestId("pack-editor");
  await editor.getByLabel("Item 3").fill("Court fee as per the Bombay Court Fees Act schedule.");
  await editor.getByLabel("Its source").fill("Registry notice of 1 March 2026");
  await editor.getByRole("button", { name: "Save as a new version" }).click();
  await expect(card.getByTestId("list-filing.petition")).toContainText("Version 2");
  await expect(card.getByTestId("list-filing.petition").getByTestId("pack-item").nth(2)).toHaveAttribute("data-status", "advocate_entered");

  // The adapters: built-in, and the advocate's own fixture.
  await expect(page.getByTestId("adapter-in-sc-built-in")).toContainText("Supreme Court of India 1.0.0");
  await expect(page.getByTestId("adapter-test-bombay-advocate")).toBeVisible();
  await app.close();
});

test("a matter: its court and case type build what it needs; ticks join the filing compliance list; defects", async () => {
  const { app, page } = await launch();
  const call = bridge(page);
  await call("setCourtProfile", { courts: ["in.hc.bombay"], practice: ["civil"] });
  await page.getByRole("button", { name: "New matter" }).first().click();
  await page.getByLabel("Matter title").fill("Filing v. Ready");
  await page.getByRole("button", { name: "Create matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Filing v. Ready" })).toBeVisible();
  const matterId = ((await call<Array<{ id: string }>>("listMatters"))[0]).id;
  await page.getByRole("tab", { name: "Filing" }).click();
  const box = page.getByTestId("court-checklist");
  await expect(box.getByTestId("checklist-reason")).toContainText("Choose the court and the case type");
  await box.getByTestId("target-court").selectOption("in.hc.bombay");
  await box.getByLabel("Case type").fill("PET");
  await box.getByRole("button", { name: "Set the court and case type" }).click();
  await expect(box.getByTestId("checklist-row")).toHaveCount(3);
  await box.getByTestId("checklist-row").nth(0).getByRole("button", { name: "Done" }).click();
  await expect(box.getByTestId("checklist-row").nth(0)).toHaveAttribute("data-state", "done");
  await box.getByTestId("checklist-row").nth(1).getByLabel("Why it does not apply").fill("e-filed; no paper copies");
  await box.getByTestId("checklist-row").nth(1).getByRole("button", { name: "Not applicable" }).click();
  await expect(box.getByTestId("checklist-row").nth(1)).toHaveAttribute("data-state", "not_applicable");
  const filing = await call<{ compliance: { results: Array<{ rule: string; outcome: string }> }; blockers: string[] }>("getFiling", matterId);
  const court = filing.compliance.results.filter((r) => r.rule.startsWith("C-"));
  expect(court.map((r) => [r.rule, r.outcome])).toEqual([["C-filing.petition-1", "pass"], ["C-filing.petition-2", "pass"], ["C-filing.petition-3", "not_checked"]]);
  expect(filing.blockers.some((b) => b.startsWith("C-"))).toBe(false);
  // Format checks need a filing set; the window says so.
  await box.getByRole("button", { name: "Run the format checks" }).click();
  await expect(box.getByTestId("format-reason")).toContainText("states no format check yet");
  // Defects: matched to the court's classes.
  await box.getByLabel("Defect list").fill("1. Index not paginated\n2. Vakalatnama not signed");
  await box.getByRole("button", { name: "Record the defects" }).click();
  await expect(box.getByTestId("defects")).toContainText("Pagination: Paginate the index continuously.");
  await expect(box.getByTestId("defects")).toContainText("No defect class of this court matches");
  await page.screenshot({ path: path.join(repo, "test-results", "phase2-checklist.png") });
  await app.close();
});
