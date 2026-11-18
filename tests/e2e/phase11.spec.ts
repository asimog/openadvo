/**
 * Phase 11 end-to-end (docs/specs/builders-and-integrations.md section 10): the commercial pack
 * and a Section 34 matter, a foreign element and its routes, a document quality score, a built
 * workflow with a gate, a skill import, an integration manifest and a trigger fire.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const out = (v: unknown) => "The output:\n```json\n" + JSON.stringify(v) + "\n```";

async function makeDirs(): Promise<{ home: string; userData: string; inbox: string }> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e-phase11-"));
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

test("phase 11: the Section 34 pack, foreign routes, quality, a workflow with a gate, skill import, an integration and a trigger", async () => {
  const dirs = await makeDirs();
  const fir = path.join(dirs.inbox, "award.txt");
  await writeFile(fir, ["ARBITRAL AWARD", "The seat of arbitration shall be Singapore.", "1. The award was received on 02.01.2024."].join("\n"));
  const { app, page } = await launch(dirs);
  const call = <T,>(name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (globalThis as any).openadvo[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

  await createMatter(page, "Acme v. Beta");
  const id = await matterId(app);
  await page.evaluate((m) => (globalThis as any).openadvo.setCourtProfile({ courts: ["in.hc.delhi"], practice: ["commercial"] }), id);
  await call("setMatterProfile", id, { court: "High Court of Delhi", proceeding: "Section 34 challenge", caseType: "Arbitration petition under Section 34", practiceArea: "commercial" });
  await page.evaluate(([m, f]) => (globalThis as any).openadvo.addFiles(m, [f]), [id, fir]);
  await expect(page.getByText("award.txt")).toBeVisible({ timeout: 120_000 });
  await app.evaluate(() => (globalThis as any).__openadvoTest.ingestIdle());

  // ---- The commercial pack and the Section 34 filing plan ----
  await page.getByRole("tab", { name: "Filing" }).click();
  await expect(page.getByTestId("filing-pack")).toContainText("Commercial and arbitration", { timeout: 20_000 });
  await expect(page.getByTestId("filing-pack")).toContainText("Section 34 challenge");
  await expect(page.getByTestId("required-documents")).toContainText("Application under Section 34");
  await expect(page.getByTestId("required-documents")).toContainText("Vakalatnama");

  // ---- The skill library has the new pack ----
  await page.getByTestId("nav-skills").click();
  await page.getByTestId("skill-pack-filter").selectOption("commercial");
  await expect(page.getByTestId("skill-SK-409")).toBeVisible();
  await expect(page.getByTestId("skill-SK-409")).toContainText("reviewed");

  // ---- The foreign element and its route ----
  await page.getByTestId("nav-matters").click();
  await page.getByText("Acme v. Beta").first().click();
  const foreign = await call<Array<{ kind: string; status: string }>>("listForeignElements", id);
  expect(foreign.some((f) => f.kind === "foreign_seat")).toBe(true);
  const routes = await call<Array<{ route: string; basis: string; status: string }>>("foreignRoutes", id);
  expect(routes.some((r) => /law of the seat/.test(r.route))).toBe(true);
  await page.getByRole("tab", { name: "Jurisdiction", exact: true }).click();
  await expect(page.getByTestId("foreign-elements")).toContainText("Singapore");
  await expect(page.getByTestId("foreign-routes")).toContainText("law of the seat");

  // ---- The document quality score ----
  const sources = await call<Array<{ id: string; name: string }>>("listSources", id);
  const quality = await call<{ score: number; pages: number; issues: Array<{ kind: string }> }>("documentQuality", id, sources[0].id);
  expect(quality.pages).toBe(1);
  expect(quality.score).toBe(100);
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByTestId("document-quality")).toContainText("100/100");

  // ---- The trigger fire from the new document ----
  const fires = await call<Array<{ id: string; event: string; state: string }>>("listTriggerFires", id);
  const documentFire = fires.find((f) => f.event === "new_document");
  expect(documentFire?.state).toBe("proposed");
  const dismissed = await call<{ state: string }>("decideTriggerFire", documentFire!.id, "dismissed");
  expect(dismissed.state).toBe("dismissed");

  // ---- A built workflow, run with a gate ----
  const workflow = await call<{ id: string; version: string }>("saveBuiltWorkflow", {
    id: "wf-phase11",
    title: "Read and chronologise",
    description: "Read the new record and make the chronology.",
    inputs: [],
    steps: [
      { id: "intake", skill: "SK-002", request: "Read the record and report what it holds.", when: "always", gate: "none", onFailure: "stop" },
      { id: "chronology", skill: "SK-009", request: "Make the chronology from the record.", when: "always", gate: "before", onFailure: "stop" },
    ],
  });
  expect(workflow.version).toBe("1.0.0");
  await app.evaluate(async (_e, script) => (globalThis as any).__openadvoTest.setModelScript(script), {
    agent: [
      { tools: [{ name: "run_workflow", args: { workflow: "wf-phase11", inputs: {} } }] },
      { text: "The workflow ran and its report is in the matter." },
    ],
    skill: [
      { text: out({ items: [{ title: "The award", detail: "The record holds the award and the seat.", anchors: [], blocks: false }], not_read: [] }) },
      { text: out({ title: "CHRONOLOGY", paragraphs: [{ text: "02.01.2024: the award was received.", anchors: [] }], not_read: [] }) },
    ],
  });
  await call("runWorkflow", id, "wf-phase11", {});
  const question = page.getByTestId("extension-question").filter({ hasText: "Workflow Read and chronologise" });
  await expect(question).toBeVisible({ timeout: 90_000 });
  await question.getByRole("button", { name: "Yes" }).click();
  await expect.poll(async () => {
    const runs = await call<Array<{ state: string; steps: Array<{ state: string }> }>>("listWorkflowRuns", id);
    return runs[0]?.state;
  }, { timeout: 120_000 }).toBe("done");
  const runs = await call<Array<{ state: string; steps: Array<{ id: string; state: string }> }>>("listWorkflowRuns", id);
  expect(runs[0].steps.map((s) => [s.id, s.state])).toEqual([["intake", "done"], ["chronology", "done"]]);

  // ---- The skill import ----
  const skillFile = path.join(dirs.inbox, "SKILL.md");
  await writeFile(skillFile, ["---", "name: my-award-check", "id: SK-901", "version: 1.0.0", "title: My award check", "description: Checks an award record and proposes the questions the advocate should ask, with each question tied to its record.", "role: evidence", "permitted_tools: [list_sources, read_source_text, list_facts]", "output: list", "required_context: [sources, events]", "checks: [schema, anchors]", "approval_points: []", "tests: [commercial-arbitration]", "author: advocate", "---", "", "# My award check", "", "Read the award and propose the questions. A legal point is a question for the advocate."].join("\n"));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, skillFile);
  const preview = await call<{ id: string; skillId: string; installable: boolean }>("previewSkillImport");
  expect(preview.skillId).toBe("SK-901");
  expect(preview.installable).toBe(true);
  const installed = await call<{ name: string }>("installSkillImport", preview.id);
  expect(installed.name).toBe("my-award-check");
  const skills = await call<{ skills: Array<{ id: string; author: string }> }>("listSkills", true);
  expect(skills.skills.some((s) => s.id === "SK-901" && s.author === "advocate")).toBe(true);

  // ---- An integration manifest ----
  const manifest = path.join(dirs.inbox, "integration.json");
  await writeFile(manifest, JSON.stringify({
    id: "court-search", version: "1.0.0", title: "Court search", description: "Reads a court page through the advocate's session.",
    capabilities: ["court", "fetch"], permissions: ["network", "matter.read"],
    inputs: [{ name: "court", type: "string" }], outputs: [{ name: "rows", type: "rows" }],
    events: { emits: ["cause_list.read"], subscribes: [] },
    lifecycle: { install: ["create the settings"], enable: ["open a tab"], disable: ["close the tab"], remove: ["keep the record"] },
    audit: { records: ["every fetch"], where: "the matter trace" },
    failure: { mode: "disable", message: "The page did not load; the integration is disabled." },
    disable: { state: "read_only" },
  }, null, 2));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, manifest);
  const added = await call<{ id: string; enabled: boolean; error: string | null }>("addIntegration");
  expect(added.id).toBe("court-search");
  expect(added.error).toBeNull();
  const enabled = await call<{ enabled: boolean }>("setIntegrationEnabled", "court-search", true);
  expect(enabled.enabled).toBe(true);

  await page.screenshot({ path: path.join(repo, "test-results", "phase11-builders.png") });
  await app.close();
});
