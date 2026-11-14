/**
 * V4 end to end, against the built application. Spec: docs/specs/v4.md. The research sources
 * answer from fixtures (test hook setResearchFixtures) and the argument loop uses a scripted
 * model (test hook runStudioScripted), so the test needs no network and no model.
 */
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parquetWriteBuffer } from "hyparquet-writer";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
test.describe.configure({ timeout: 240_000 });

async function pdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 60, y: 780 - i * 24, size: 12, font }));
  return doc.save();
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

const SECTION = {
  uuid: "d7d4a61a-75dd-45ff-867e-e7da3affdd8e",
  handle: "123456789/514257",
  metadata: {
    "dc.identifier.collection": [{ value: "SECTION" }],
    "dc.title": [{ value: "Special powers of High Court or Court of Session regarding bail." }],
    "dc.identifier.act_name": [{ value: "The Bharatiya Nagarik Suraksha Sanhita, 2023" }],
    "dc.identifier.section_number": [{ value: "483" }],
    "dc.identifier.repealed": [{ value: "false" }],
    "dc.identifier.section_page_note": [{ value: "(1) A High Court or Court of Session may direct that any person accused of an offence and in custody be released on bail." }],
  },
};

const bridge = (page: Page) => <T>(fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (globalThis as any).openadvo[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test("v4: index, search, read and save from the sources; the argument loop; decisions; Grounds; weak points", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2ev4-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const order = path.join(base, "inbox", "order.pdf");
  await writeFile(order, await pdf(["ORDER OF THE HIGH COURT", "The High Court refused regular bail on 12.03.2024 without reference to the period of custody."]));
  const parquet = new Uint8Array(
    parquetWriteBuffer({
      columnData: [
        { name: "title", data: ["ELDECO HOUSING AND INDUSTRIES LIMITED versus ASHOK VIDYARTHI AND OTHERS"], type: "STRING" },
        { name: "petitioner", data: ["ELDECO HOUSING AND INDUSTRIES LIMITED"], type: "STRING" },
        { name: "respondent", data: ["ASHOK VIDYARTHI AND OTHERS"], type: "STRING" },
        { name: "judge", data: ["VIKRAM NATH"], type: "STRING" },
        { name: "citation", data: ["[2023] 16 S.C.R. 872"], type: "STRING" },
        { name: "case_id", data: ["2023 INSC 1043"], type: "STRING" },
        { name: "cnr", data: ["ESCR010008242023"], type: "STRING" },
        { name: "decision_date", data: ["30-11-2023"], type: "STRING" },
        { name: "disposal_nature", data: ["Appeal(s) allowed"], type: "STRING" },
        { name: "path", data: ["2023_16_872_887"], type: "STRING" },
      ],
    }),
  );
  const judgment = await pdf(["2023 INSC 1043", "12. Long custody without trial is a ground for bail."]);
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const call = bridge(page);
  try {
    await app.evaluate((_e, f) => (globalThis as any).__openadvoTest.setResearchFixtures(f), [
      { match: "metadata/parquet/year=2023/metadata.parquet", body: b64(parquet), base64: true },
      { match: "2023_16_872_887_EN.pdf", body: b64(judgment), base64: true, type: "application/pdf" },
      { match: "/discover/search/objects", body: JSON.stringify({ _embedded: { searchResult: { page: { totalElements: 1 }, _embedded: { objects: [{ _embedded: { indexableObject: SECTION } }] } } } }), type: "application/json" },
      { match: "/core/items/", body: JSON.stringify(SECTION), type: "application/json" },
      { match: "html.duckduckgo.com", body: '<div class="result results_links web-result"><a class="result__a" href="https://example.org/bail">Bail after long custody</a><a class="result__snippet">A note on bail</a></div>', type: "text/html" },
    ]);
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Ram v. State");
    await page.getByRole("button", { name: "Create matter" }).click();
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, order);
    await page.getByRole("button", { name: "Add files" }).click();
    await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
    const matterId: string = (await call<any[]>("listMatters"))[0].id;
    for (const e of (await call<any>("getNotebook", matterId)).events) await call("confirmEvent", matterId, e.id);
    const issue = await call<any>("addIssue", matterId, "Whether bail was refused without considering the period of custody?");
    await call("decideIssue", matterId, issue.id, "accepted", "Arises from the order.");

    // ---- V4-1: index and search the Supreme Court; read and save a judgment ----
    await page.getByRole("tab", { name: "Studio" }).click();
    await page.getByTestId("studio").getByRole("tab", { name: "Search", exact: true }).click();
    await page.getByLabel("Supreme Court years").fill("2023");
    await page.getByRole("button", { name: "Index Supreme Court years" }).click();
    await expect(page.getByTestId("index-panel").locator("summary")).toContainText("Supreme Court 2023–2023 (1 years, 1 judgments)");
    await page.getByLabel("Research query").fill("eldeco");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("research-hits")).toContainText("2023 INSC 1043");
    await page.getByTestId("research-hits").getByRole("button", { name: "Read" }).click();
    await expect(page.getByTestId("reader-lines")).toContainText("Long custody without trial is a ground for bail.");
    await page.getByLabel("Paragraph relied on").fill("12");
    await page.getByLabel("Proposition").fill("Long custody without trial is a ground for bail.");
    await page.getByRole("button", { name: "Save as authority" }).click();
    await expect(page.getByTestId("studio-sources")).toContainText("Saved as an authority: 2023 INSC 1043.");
    const au = (await call<any>("getResearch", matterId)).authorities[0];
    expect([au.citation, au.paragraph, au.sourceRef, au.status]).toEqual(["2023 INSC 1043", "12", "sc:2023_16_872_887", "adopted"]);

    // ---- India Code: search and save a provision ----
    await page.getByLabel("Source").selectOption("indiacode");
    await page.getByLabel("Research query").fill("section 483 BNSS");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("research-notice")).toContainText("current text");
    await page.getByTestId("research-hits").getByRole("button", { name: "Save provision" }).click();
    await expect(page.getByTestId("studio-sources")).toContainText("Saved: The Bharatiya Nagarik Suraksha Sanhita, 2023, section 483.");

    // ---- The web: discovery only; a switched-off source says so ----
    await page.getByLabel("Source").selectOption("web");
    await page.getByLabel("Research query").fill("bail long custody");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("research-notice")).toContainText("discovery only");
    await call("setResearchSettings", { aws: true, indiaCode: true, web: false });
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("research-error")).toContainText("SOURCE_OFF");
    await call("setResearchSettings", { aws: true, indiaCode: true, web: true });

    // ---- The agent's tool reaches the same index ----
    const toolText = await app.evaluate((_e, id) => (globalThis as any).__openadvoTest.studioTool(id, "search_judgments", { court: "sc", query: "2023 INSC 1043" }), matterId);
    expect(toolText).toContain("ref: sc:2023_16_872_887");

    // ---- The research log ----
    await page.getByRole("tab", { name: "Research log" }).click();
    await expect(page.getByTestId("research-log")).toContainText("aws_sc fetch judgment");
    await expect(page.getByTestId("research-log")).toContainText("indiacode search");

    // ---- V4-3: the loop with a scripted model ----
    const ev = (await call<any>("getNotebook", matterId)).events.find((e: any) => e.description.includes("refused regular bail"));
    expect(ev).toBeTruthy();
    const arg = {
      claim: "The High Court erred in refusing bail without weighing the period of custody.",
      reasoning: "E1 records that bail was refused without reference to custody; A1 at para 12 holds long custody is a ground for bail, under P1.",
      events: [{ ref: "E1", quote: "without reference to the period of custody" }],
      authorities: [{ ref: "A1", paragraph: "12" }],
      provisions: ["P1"],
    };
    const run = await app.evaluate((_e, a) => (globalThis as any).__openadvoTest.runStudioScripted(a.m, a.i, a.s), {
      m: matterId,
      i: issue.id,
      s: [
        { match: "TASK: Propose up to", answer: JSON.stringify({ arguments: [arg] }) },
        { match: "TASK: List the critical questions", answer: '{"questions":["Was the delay caused by the accused?"]}' },
        { match: "TASK: As counsel for", answer: JSON.stringify({ arguments: [{ kind: "undercut", claim: "Custody alone does not decide bail where the trial is near its end.", reasoning: "A1 treats custody as one factor; E1 shows only that custody was not discussed.", events: [{ ref: "E1", quote: "refused regular bail" }], authorities: [{ ref: "A1", paragraph: "12" }], provisions: [] }] }) },
        { match: "TASK: Which argument", answer: '{"better":"A"}' },
      ],
    });
    expect(run.status).toBe("done");
    expect(run.stats.rejected.DUPLICATE).toBe(1);
    await page.getByRole("tab", { name: "Arguments" }).click();
    const card = page.getByTestId("argument");
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-computed", "out");
    await expect(card).toContainText("Was the delay caused by the accused?");
    await expect(card).toContainText("[2023 INSC 1043]");
    await card.getByRole("button", { name: "Reject attack" }).click();
    await expect(card).toHaveAttribute("data-computed", "in");
    await card.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(card).toHaveAttribute("data-status", "accepted");
    await card.getByRole("button", { name: "Send to Grounds" }).click();
    await expect(page.getByTestId("studio-arguments")).toContainText("Proposed in the Grounds as a tracked insertion.");
    const changes = await call<any[]>("agentChanges", matterId);
    expect(changes.some((c) => c.title.toUpperCase() === "GROUNDS" && c.changes.length === 1)).toBe(true);

    // ---- V4-4: the weak-points report in the conference package ----
    const wp = await call<any[]>("getWeakPoints", matterId);
    expect(wp).toEqual([{ claim: arg.claim, questions: ["Was the delay caused by the accused?"], attacks: [] }]);
    const conf = await call<any>("generateDraft", matterId, "conference");
    const confText: string[] = (await call<any>("getRevision", matterId, conf.revision.id)).paragraphs.map((p: any) => p.text);
    expect(confText).toContain("8A. Weak points of the accepted arguments (Studio)");
    expect(confText).toContain("Open question: Was the delay caused by the accused?");
  } finally {
    await app.close();
  }
});
