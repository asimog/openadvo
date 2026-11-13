/**
 * End-to-end tests against the built application (npm run build first).
 * Spec: docs/specs/v0-app-and-matter-store.md.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, appendFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "../..");

interface Dirs {
  home: string;
  userData: string;
  inbox: string;
}

async function makeDirs(): Promise<Dirs> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e-"));
  const dirs = { home: path.join(base, "matters"), userData: path.join(base, "user-data"), inbox: path.join(base, "inbox") };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
  return dirs;
}

function pdf(label: string): string {
  return `%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
}

async function launch(dirs: Dirs, extraEnv: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repo],
    env: { ...process.env, OPENADVO_HOME: dirs.home, OPENADVO_USER_DATA: dirs.userData, OPENADVO_TEST: "1", ...extraEnv },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function stubFilePicker(app: ElectronApplication, files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog;
  }, files);
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

test("create, add, duplicate, refuse, restart, integrity", async () => {
  const dirs = await makeDirs();
  const judgment = path.join(dirs.inbox, "impugned-judgment.pdf");
  const annexure = path.join(dirs.inbox, "annexure-p1.pdf");
  const again = path.join(dirs.inbox, "impugned-judgment (copy).pdf");
  const note = path.join(dirs.inbox, "note.txt");
  await writeFile(judgment, pdf("judgment"));
  await writeFile(annexure, pdf("annexure"));
  await writeFile(again, pdf("judgment"));
  await writeFile(note, "not a pdf");

  let { app, page } = await launch(dirs);
  await createMatter(page, "Petitioner v. Respondent");
  await stubFilePicker(app, [judgment, annexure, again, note]);
  await page.getByRole("button", { name: "Add files" }).click();
  const status = page.getByTestId("notice");
  await expect(status).toContainText("2 added");
  await expect(status).toContainText("1 already in the matter");
  await expect(status).toContainText("1 refused");
  await expect(page.getByRole("heading", { name: "Sources (2)" })).toBeVisible();
  // The same file again: still two sources.
  await stubFilePicker(app, [judgment]);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(status).toContainText("0 added");
  await expect(page.getByRole("heading", { name: "Sources (2)" })).toBeVisible();
  const id = await matterId(app);
  await app.close();

  // Restart: every source is listed with its hash.
  ({ app, page } = await launch(dirs));
  await page.getByRole("button", { name: "Petitioner v. Respondent" }).click();
  await expect(page.getByRole("heading", { name: "Sources (2)" })).toBeVisible();
  await page.getByRole("button", { name: "impugned-judgment.pdf" }).click();
  await page.getByText("Hash, origins and events").click();
  await expect(page.getByTestId("detail-sha256")).toHaveText(/^[0-9a-f]{64}$/);
  const sha = (await page.getByTestId("detail-sha256").textContent())!;
  await expect(page.getByRole("table", { name: "Events" })).toContainText("source.origin_added");
  await app.close();

  // A missing blob and a changed blob are reported on the next open.
  const blobs = path.join(dirs.home, id, "blobs");
  const others = (await readdir(blobs)).filter((b) => b !== sha);
  await rm(path.join(blobs, sha));
  await appendFile(path.join(blobs, others[0]), "tampered");
  ({ app, page } = await launch(dirs));
  await page.getByRole("button", { name: "Petitioner v. Respondent" }).click();
  await expect(page.getByTestId("notice")).toContainText("missing or changed");
  await expect(page.getByText("Missing", { exact: true })).toBeVisible();
  await expect(page.getByText("Changed", { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Events" })).toContainText("source.missing");
  await expect(page.getByRole("table", { name: "Events" })).toContainText("source.changed");
  await app.close();
});

test("the renderer has no file or Node access; the bridge exposes only named functions", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  const probe = await page.evaluate(() => ({
    require: typeof (globalThis as any).require,
    process: typeof (globalThis as any).process,
    bridge: Object.keys((globalThis as any).openadvo).sort(),
  }));
  expect(probe.require).toBe("undefined");
  expect(probe.process).toBe("undefined");
  expect(probe.bridge).toEqual(
    [
      "addFiles", "createMatter", "getChat", "getModel", "listEvents", "listMatters", "listModels", "listOrigins",
      "closeView", "listSources", "onChatEvent", "openMatter", "openSourceView", "pathsForFiles", "pickFiles", "sendChat", "setModel",
      "getSourcePages", "listJobs", "listReviewItems", "onIngestUpdate", "resolveReviewItem", "skipReviewItem",
    ].sort(),
  );
  await app.close();
});

test("the agent session has exactly our tool, and its id is recorded", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  await createMatter(page, "Tool allowlist");
  const id = await matterId(app);
  const tools = await app.evaluate((_e, m) => (globalThis as any).__openadvoTest.agentToolNames(m), id);
  expect(tools).toEqual(["list_sources", "read_source_text", "search_sources"]);
  const sessionId = await app.evaluate((_e, m) => (globalThis as any).__openadvoTest.agentSessionId(m), id);
  const events = await page.evaluate((m) => (globalThis as any).openadvo.listEvents(m), id);
  const started = events.find((e: any) => e.action === "agent.session_started");
  expect(started?.sessionId).toBe(sessionId);
  expect(started?.actor).toBe("agent");
  await app.close();
});

test("live: the agent lists the sources (needs OPENADVO_LIVE_MODEL)", async () => {
  test.skip(!process.env.OPENADVO_LIVE_MODEL, "set OPENADVO_LIVE_MODEL=provider/model to run against a real model");
  const dirs = await makeDirs();
  const file = path.join(dirs.inbox, "writ-petition.pdf");
  await writeFile(file, pdf("writ"));
  const { app, page } = await launch(dirs, { OPENADVO_MODEL: process.env.OPENADVO_LIVE_MODEL! });
  await createMatter(page, "Live agent");
  await stubFilePicker(app, [file]);
  await page.getByRole("button", { name: "Add files" }).click();
  await page.getByLabel("Message to the agent").fill("list the sources");
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("Used tool: list_sources", { timeout: 90_000 });
  await expect(log.locator('[data-role="agent"]').last()).toContainText("writ-petition.pdf", { timeout: 90_000 });
  await app.close();
});

test("live: the model picker lists pi-ai models and switches the session model (needs OPENADVO_LIVE_MODEL)", async () => {
  test.skip(!process.env.OPENADVO_LIVE_MODEL, "set OPENADVO_LIVE_MODEL=provider/model to run against a real model");
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  await createMatter(page, "Model picker");
  const models: Array<{ key: string }> = await page.evaluate(() => (globalThis as any).openadvo.listModels());
  expect(models.length).toBeGreaterThan(0);
  const target = models.find((m) => m.key === process.env.OPENADVO_LIVE_MODEL) ?? models[0];
  const chosen = await page.evaluate((k) => (globalThis as any).openadvo.setModel(k), target.key);
  expect(chosen).toBe(target.key);
  expect(await page.evaluate(() => (globalThis as any).openadvo.getModel())).toBe(target.key);
  await app.close();
  // The choice is saved for the next run.
  const again = await launch(dirs);
  expect(await again.page.evaluate(() => (globalThis as any).openadvo.getModel())).toBe(target.key);
  await again.app.close();
});
