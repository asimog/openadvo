/**
 * Phase 3 end to end: the built-in browser in the right pane (S10) and the case list (A9).
 * Spec: docs/specs/advocate-matters-browser.md. The pages are served from this test process.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

interface Dirs { home: string; userData: string }

async function makeDirs(): Promise<Dirs> {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e-phase3-"));
  const dirs = { home: path.join(base, "matters"), userData: path.join(base, "user-data") };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
  return dirs;
}

async function launch(dirs: Dirs): Promise<{ app: ElectronApplication; page: Page }> {
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

async function browserState(app: ElectronApplication): Promise<{ tabs: Array<{ id: string; url: string; title: string; loading: boolean; agent: boolean }>; activeTabId: string | null }> {
  return app.evaluate(() => (globalThis as any).__openadvoTest.browserState());
}

async function waitForTitle(app: ElectronApplication, part: string, title: string): Promise<void> {
  await expect.poll(async () => (await browserState(app)).tabs.find((t) => t.url.includes(part))?.title, { timeout: 15_000 }).toBe(title);
}

async function matterId(app: ElectronApplication): Promise<string> {
  const root: string = await app.evaluate(() => (globalThis as any).__openadvoTest.mattersRoot());
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root);
  expect(entries.length).toBe(1);
  return entries[0];
}

let server: Server;
let base = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const page = (title: string, body: string) =>
      `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
    if (url.startsWith("/one")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page("First page", `<p>Welcome to page one.</p><a href="/two">Go to page two</a>`));
    } else if (url.startsWith("/two")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page("Second page", `<p>Welcome to page two.</p>`));
    } else if (url.startsWith("/cases")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page("Case list", `<table><tr><th>CNR</th><th>Court</th><th>Parties</th><th>Stage</th><th>Next date</th></tr><tr><td>DLHC010001232024</td><td>Delhi High Court</td><td>Asha v. State</td><td>Arguments</td><td>01-12-2026</td></tr></table>`));
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("S10: the browser sits on the right, with tabs, a bookmark and a new-tab page; the agent drives a hidden page through the accessibility tree", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  await createMatter(page, "Browser matter");

  await page.getByTestId("titlebar-browser").click();
  const pane = page.getByTestId("matter-view");
  await expect(pane.getByTestId("browser-strip")).toBeVisible();
  await expect(pane.getByTestId("browser-newtab")).toBeVisible();

  // The right pane is right of the chat dock. The panels settle after the pane opens.
  await expect.poll(async () => {
    const c = (await page.getByTestId("chat-dock").boundingBox())!;
    const p = (await pane.getByTestId("right-pane").boundingBox())!;
    return p.x - (c.x + c.width);
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(-2);

  await pane.locator('input[aria-label="Address"]').fill(`${base}/one`);
  await pane.locator('input[aria-label="Address"]').press("Enter");
  await waitForTitle(app, "/one", "First page");
  const tab = (await browserState(app)).tabs.find((t) => t.url.includes("/one"))!;
  const text: string = await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.browserRead(id), tab.id);
  expect(text).toContain("Welcome to page one.");

  // The star adds a bookmark; the bar shows it.
  await pane.getByTestId("browser-star").click();
  await expect(pane.getByTestId("browser-bookmarks")).toContainText("First page");

  // The plus opens the new-tab page; the bookmark opens in the active tab.
  await pane.getByTestId("browser-new-tab").click();
  await expect(pane.getByTestId("browser-newtab")).toBeVisible();
  await pane.locator('input[aria-label="Address"]').fill(`${base}/two`);
  await pane.locator('input[aria-label="Address"]').press("Enter");
  await waitForTitle(app, "/two", "Second page");
  await pane.getByTestId("browser-bookmark").first().click();
  await expect.poll(async () => {
    const s = await browserState(app);
    return s.tabs.find((t) => t.id === s.activeTabId)?.url;
  }, { timeout: 15_000 }).toBe(`${base}/one`);

  // The Matter tab returns to the notebook; the browser bar goes away.
  await pane.getByTestId("browser-matter-tab").click();
  await expect(pane.getByTestId("work-view")).toBeVisible();
  await expect(pane.getByTestId("browser-bar")).toHaveCount(0);

  // A browser tab takes it back.
  await pane.getByTestId("browser-tab").first().click();
  await expect(pane.getByTestId("browser-bar")).toBeVisible();

  // The agent drives a hidden browser page through the accessibility tree.
  const id = await matterId(app);
  const opened: string = await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "browser_open", { url: input.url, visible: false }), { id, url: `${base}/one` });
  expect(opened).toContain("hidden agent page");
  const agentTab = (await browserState(app)).tabs.find((t) => t.agent)!;
  expect(agentTab.id).toBeTruthy();
  const snapshot: string = await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "browser_snapshot", { tab_id: input.tabId }), { id, tabId: agentTab.id });
  expect(snapshot).toContain("Welcome to page one");
  const ref = /@(e\d+) link "Go to page two"/.exec(snapshot)?.[1];
  if (ref) {
    await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "browser_click", { tab_id: input.tabId, ref: input.ref }), { id, tabId: agentTab.id, ref });
    await expect.poll(async () => (await browserState(app)).tabs.find((t) => t.id === agentTab.id)?.url, { timeout: 15_000 }).toContain("/two");
    const read: string = await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "browser_read", { tab_id: input.tabId }), { id, tabId: agentTab.id });
    expect(read).toContain("Welcome to page two");
  }
  const hand: string = await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "browser_hand_to_advocate", { tab_id: input.tabId }), { id, tabId: agentTab.id });
  expect(hand).toContain("visible tab");
  await app.close();
});

test("S10, A9: Browser in the navigation opens the browser outside a matter; the case list becomes matters with the CNR, court, parties, stage and next date", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  // Browser in the navigation opens the browser outside a matter.
  await page.getByTestId("nav-browser").click();
  const pane = page.getByTestId("browser-page");
  await expect(pane.getByTestId("browser-page-pane")).toBeVisible();
  await expect(pane.getByTestId("browser-newtab")).toBeVisible();
  await pane.locator('input[aria-label="Address"]').fill(`${base}/cases`);
  await pane.locator('input[aria-label="Address"]').press("Enter");
  await waitForTitle(app, "/cases", "Case list");

  await app.evaluate(async (_e, script) => (globalThis as any).__openadvoTest.setModelScript(script), {
    agent: [{ text: JSON.stringify({ cases: [{ title: "Asha v. State", cnr: "DLHC010001232024", court: "Delhi High Court", petitioner: "Asha", respondent: "State", stage: "Arguments", nextDate: "2026-12-01" }] }) }],
  });

  await pane.getByTestId("browser-import-case-list").click();
  await expect(pane.getByTestId("browser-caselist")).toBeVisible();
  await expect(pane.getByTestId("browser-caselist")).toContainText("Asha v. State");
  await page.getByRole("button", { name: "Create 1 matter" }).click();
  await expect(page.getByRole("button", { name: "Asha v. State" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Asha v. State" }).click();
  const id = await matterId(app);
  const filing = await page.evaluate((m) => (globalThis as any).openadvo.getFiling(m), id);
  expect(filing.details.cnr).toBe("DLHC010001232024");
  expect(filing.details.court).toBe("Delhi High Court");
  expect(filing.details.petitioner).toBe("Asha");
  expect(filing.details.respondent).toBe("State");
  await app.close();
});

test("A1 to A6, M1: setup builds the Practice Profile and the Knowledge Library", async () => {
  const dirs = await makeDirs();
  const libraryFolder = path.join(dirs.home, "past-work");
  await mkdir(path.join(libraryFolder, "judgments", "2024"), { recursive: true });
  await writeFile(path.join(libraryFolder, "judgments", "2024", "bail judgment.pdf"), "%PDF-1.4\n% judgment\n%%EOF\n");
  await writeFile(path.join(libraryFolder, "notes.txt"), "A note on bail.");
  const { app, page } = await launch(dirs);

  await page.getByTestId("nav-onboarding").click();
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.getByLabel("Name").fill("A. Advocate");
  await page.getByLabel("State Bar Council").fill("Delhi");
  await page.getByLabel("Enrolment number (optional)").fill("D/1234/2018");
  await page.getByLabel("Year").fill("2018");
  await page.getByLabel("Chamber address").fill("Lawyers Chambers, Delhi");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 2: one court from the directory.
  await expect(page.getByTestId("onboarding-courts")).toBeVisible();
  await page.getByLabel("Add a court").fill("Supreme Court");
  await expect(page.getByRole("button", { name: "Add" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: criminal is the primary practice area.
  await page.getByTestId("onboarding-work").getByText("criminal", { exact: true }).click();
  await page.getByLabel("Primary practice area").selectOption("criminal");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 4: import the folder.
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, libraryFolder);
  await page.getByTestId("onboarding-import-folder").click();
  await expect(page.getByText("2 added", { exact: false })).toBeVisible();
  await page.getByTestId("onboarding-library-next").click();

  // Step 5: finish.
  await page.getByTestId("onboarding-finish").click();
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await expect(page.getByTestId("profile-practice-map")).toContainText("criminal");
  await expect(page.getByTestId("profile-court-map")).toContainText("Supreme Court");
  await expect(page.getByTestId("profile-library")).toContainText("2 items");

  const state = await page.evaluate(() => (globalThis as any).openadvo.advocateEnrolmentState());
  expect(state.stored).toBe(true);
  expect(state.last4).toBe("2018");
  const library = await page.evaluate(() => (globalThis as any).openadvo.libraryList());
  expect(library.length).toBe(2);
  expect(library.every((x: any) => x.status === "unreviewed")).toBe(true);
  expect(library.find((x: any) => x.kind === "judgment")?.scope).toBe("judgments/2024");
  await app.close();
});

test("C1, C3, C5, C6, C10: the matter profile, classification, related matter and extension", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  await createMatter(page, "Asha v. State");
  const view = page.getByTestId("matter-view");
  await view.getByTestId("work-view").getByRole("tab", { name: "Matter", exact: true }).click();

  await view.getByTestId("matter-profile").getByLabel("Court").fill("Delhi High Court");
  await view.getByTestId("matter-profile").getByLabel("Proceeding", { exact: true }).selectOption("Bail application");
  await view.getByTestId("matter-profile").getByLabel("CNR").fill("DLHC010001232024");
  await view.getByTestId("matter-profile").getByLabel("Stage").selectOption("Arguments");
  await view.getByTestId("matter-profile-save").click();
  await expect(view.getByText("The matter profile is saved.")).toBeVisible();

  await view.getByTestId("matter-classify").click();
  await expect(view.getByTestId("classification-proposal")).toContainText("criminal");
  await view.getByTestId("classification-apply").click();
  await expect(view.getByTestId("matter-profile")).toContainText("Bail application");

  // A second matter, linked as an appeal from the first.
  await page.getByRole("button", { name: "Home" }).click();
  await createMatter(page, "Asha v. State (appeal)");
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("navigation", { name: "Side navigation" }).getByRole("button", { name: "Asha v. State", exact: true }).click();
  await page.getByTestId("matter-view").getByTestId("work-view").getByRole("tab", { name: "Matter", exact: true }).click();
  const related = page.getByTestId("matter-view").getByTestId("related-matters");
  await related.getByLabel("Related matter", { exact: true }).selectOption({ label: "Asha v. State (appeal)" });
  await related.getByLabel("Relation", { exact: true }).selectOption("appeal_from");
  await related.getByRole("button", { name: "Link", exact: true }).click();
  await expect(related).toContainText("Asha v. State (appeal)");

  // Extend: a new linked matter opens.
  await related.getByText("Add a later stage or a related proceeding").click();
  await related.getByLabel("New matter title").fill("Asha v. State (revision)");
  await related.getByLabel("New matter relation").selectOption("revision_of");
  await related.getByRole("button", { name: "Create the linked matter" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Asha v. State (revision)" })).toBeVisible();
  const all = await page.evaluate(() => (globalThis as any).openadvo.listMatters());
  expect(all.length).toBe(3);
  await app.close();
});

test("C2, H1, W4, R2: add a matter from a folder, a CNR and an email; Home shows the dashboard", async () => {
  const dirs = await makeDirs();
  const folder = path.join(dirs.home, "intake-folder");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "petition.pdf"), "%PDF-1.4\n% petition\n%%EOF\n");
  await writeFile(path.join(folder, "annexure.pdf"), "%PDF-1.4\n% annexure\n%%EOF\n");
  const eml = path.join(dirs.home, "client.eml");
  await writeFile(eml, "From: client@example.com\nTo: advocate@example.com\nSubject: Instructions\nDate: Mon, 16 Nov 2026 10:00:00 +0530\nMessage-ID: <one@example.com>\nContent-Type: text/plain\n\nPlease file the petition.\n");
  const { app, page } = await launch(dirs);

  // From a folder.
  await page.getByTestId("nav-matters").click();
  await page.getByTestId("add-existing-matter").click();
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, folder);
  await page.getByTestId("intake-folder").click();
  await expect(page.getByRole("heading", { level: 2, name: "intake-folder" })).toBeVisible();
  await page.getByTestId("matter-view").getByTestId("work-view").getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sources (2)" })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();

  // From a CNR.
  await page.getByTestId("nav-matters").click();
  await page.getByTestId("add-existing-matter").click();
  await page.getByLabel("CNR").fill("DLHC010001232024");
  await page.getByLabel("Court").fill("Delhi High Court");
  await page.getByTestId("intake-cnr").click();
  await expect(page.getByRole("heading", { level: 2, name: /CNR DLHC010001232024/ })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();

  // From an email.
  await page.getByTestId("nav-matters").click();
  await page.getByTestId("add-existing-matter").click();
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, eml);
  await page.getByTestId("intake-email").click();
  await expect(page.getByRole("heading", { level: 2, name: "client" })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();

  // Home shows the dashboard and every matter.
  await expect(page.getByTestId("home-dashboard")).toBeVisible();
  await expect(page.getByTestId("dash-matters")).toContainText("3");
  await expect(page.getByTestId("dash-updates")).toContainText("phase 13");
  await app.close();
});

test("C2: a matter proposed in the chat waits for the advocate and is created from Home", async () => {
  const dirs = await makeDirs();
  const { app, page } = await launch(dirs);
  await createMatter(page, "Source matter");
  const id = await matterId(app);
  const out: string = await app.evaluate((_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.id, "propose_matter", {
    title: "Chat v. State",
    cnr: "DLHC010001239999",
    court: "Delhi High Court",
    petitioner: "Chat",
    respondent: "State",
    stage: "Arguments",
    next_date: "2026-12-10",
    reason: "The client's email describes this case.",
  }), { id });
  expect(out).toContain("Chat v. State");
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByTestId("dash-proposals")).toContainText("Chat v. State");
  await page.getByTestId("proposal-create").first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Chat v. State" })).toBeVisible();
  await app.close();
});
