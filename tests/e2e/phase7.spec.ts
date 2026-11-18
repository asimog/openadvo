/**
 * Phase 7 end-to-end: the exit path of docs/specs/argument-and-hearings.md.
 *
 * A matter with an accepted issue tied to its facts; the interim-relief element chart with its
 * gap closed and a proposed element confirmed; a theory decided; the argument loop and the
 * rehearsal with the scripted model; the hearing recorded with directions; the compliance tasks
 * proposed and accepted; the cross-examination question decided; the dissent panel asked; the
 * hearing brief and the oral outline generated from the records before the date.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");

const bridge = (page: Page) => <T,>(name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (globalThis as any).openadvo[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

/** One page with the order and the custody line, so the record has anchored facts and events. */
async function brief(file: string): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  [
    "IN THE HIGH COURT OF DELHI",
    "1. The impugned order was passed on 12.03.2024 without hearing the petitioner.",
    "2. The petitioner filed the writ petition on 02.04.2024.",
    "3. The Court directed the respondent to file a reply within four weeks.",
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

test("phase 7: issue ties, the element chart, the theory, the tasks, the cross-exam, the panel, the brief and the outline", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "oa-p7-"));
  const inbox = path.join(base, "inbox");
  await mkdir(inbox, { recursive: true });
  const file = path.join(inbox, "brief.pdf");
  await brief(file);
  const { app, page } = await launch(base);
  const call = bridge(page);

  await page.getByRole("button", { name: "New matter" }).first().click();
  await page.getByLabel("Matter title").fill("Phase seven");
  await page.getByRole("button", { name: "Create matter" }).click();
  const matterId = ((await call<Array<{ id: string }>>("listMatters"))[0]).id;

  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await page.getByRole("button", { name: "Add files" }).click();
  await expect(page.getByText("brief.pdf")).toBeVisible({ timeout: 120_000 });
  await app.evaluate(() => (globalThis as any).__openadvoTest.ingestIdle());
  const notebook = await call<{ events: Array<{ id: string }> }>("getNotebook", matterId);
  for (const event of notebook.events) await call("confirmEvent", matterId, event.id);
  await call("setMatterProfile", matterId, { stage: "Notice issued", proceeding: "interim injunction", relief: "Quash the impugned order" });

  // ---- K1: the issue names its facts; the Conference view shows the ties ----
  const facts = await call<Array<{ id: string; text: string }>>("evidenceFacts", matterId);
  expect(facts.length).toBeGreaterThan(0);
  const issueAnswer = await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.matterId, "propose_issue", { text: "Was the impugned order passed without hearing the petitioner?", fact_ids: input.factIds }),
    { matterId, factIds: facts.slice(0, 2).map((f) => f.id) },
  );
  expect(String(issueAnswer)).toContain("candidate issue");
  const issues = (await call<{ issues: Array<{ id: string; status: string; factIds: string[] }> }>("getResearch", matterId)).issues;
  const issue = issues.find((i) => i.status === "candidate")!;
  expect(issue.factIds).toEqual(facts.slice(0, 2).map((f) => f.id));
  await call("decideIssue", matterId, issue.id, "accepted", "the record raises it");
  // The issues and their fact ties are shown in the Studio's Conference part.
  await page.getByRole("tab", { name: "Studio" }).click();
  await expect(page.getByTestId("issue-facts")).toContainText("brief.pdf", { timeout: 15_000 });
  await expect(page.getByTestId("issue-facts")).toContainText("Quash the impugned order");

  // ---- K3: the interim-relief element chart; a gap closed by an anchored cell; a proposed element confirmed ----
  await call("applyRecordTemplate", matterId, "interim_relief");
  let table = await call<{ columns: Array<{ id: string; question: string; status: string }>; cells: Array<{ columnId: string; status: string }> }>("getRecordTable", matterId);
  expect(table.columns.map((c) => c.question)).toEqual(["Prima facie case", "Balance of convenience", "Irreparable injury"]);
  const sources = await call<Array<{ id: string; name: string }>>("listSources", matterId);
  await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.fillRecordCell(input.matterId, {
      source: input.sourceName,
      column: "Prima facie case",
      answer: "The order was passed without a hearing.",
      quote: "without hearing the petitioner",
      page: 1,
      line: 2,
    }),
    { matterId, sourceName: sources[0].name },
  );
  table = await call<{ columns: Array<{ id: string; question: string; status: string }>; cells: Array<{ columnId: string; status: string }> }>("getRecordTable", matterId);
  const cell = table.cells.find((c) => c.columnId === table.columns[0].id)!;
  await call("decideRecordCell", matterId, sources[0].id, table.columns[0].id, "confirm");
  void cell;
  // The agent proposes an element of the issue; the advocate confirms the column.
  await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.matterId, "propose_elements", { issue_id: input.issueId, elements: ["Service of the impugned order"] }),
    { matterId, issueId: issue.id },
  );
  table = await call<{ columns: Array<{ id: string; question: string; status: string }>; cells: Array<{ columnId: string; status: string }> }>("getRecordTable", matterId);
  const proposedColumn = table.columns.find((c) => c.status === "candidate")!;
  expect(proposedColumn.question).toBe("Service of the impugned order");
  await call("decideRecordColumn", matterId, proposedColumn.id, "confirmed");

  // ---- K4: the theory, proposed by the agent, decided by the advocate ----
  const theoryAnswer = await app.evaluate(
    (_e, id) => (globalThis as any).__openadvoTest.callAgentTool(id, "propose_theory", {
      title: "The order is void for want of notice",
      statement: "The record holds no notice before the order, so the authority decided without hearing the petitioner.",
      issue_ids: [],
      burden: "the petitioner",
      standard: "preponderance",
    }),
    matterId,
  );
  expect(String(theoryAnswer)).toContain("waits as an alternative");
  const theories = (await call<{ theories: Array<{ id: string; status: string }> }>("getStudio", matterId)).theories;
  await call("decideTheory", matterId, theories[0].id, "primary", "the record supports it");
  await page.getByRole("tab", { name: "Studio" }).click();
  await page.getByTestId("studio").getByRole("tab", { name: "Strategy" }).click();
  await expect(page.getByTestId("strategy-panel")).toBeVisible();
  await expect(page.getByTestId("theory-list")).toContainText("The order is void for want of notice");
  await expect(page.getByTestId("record-gaps")).toContainText("Balance of convenience");

  // ---- K2: the argument loop, then the standing on the Strategy view ----
  const acceptedIssue = (await call<{ issues: Array<{ id: string; status: string }> }>("getResearch", matterId)).issues.find((i) => i.status === "accepted")!;
  await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.runStudioScripted(
      input.matterId,
      input.issueId,
      [
        { match: "TASK: Propose", answer: JSON.stringify({ arguments: [{ claim: "The order was passed without hearing the petitioner.", reasoning: "E1 records the order and E2 records the petition; the record holds no notice.", events: [{ ref: "E1", quote: "without hearing the petitioner" }] }] }) },
        { match: "better", answer: '{"better":"A"}' },
      ],
      [
        { match: "critical questions", answer: '{"questions":["Was any notice issued before the order?"]}' },
        { match: "counsel for the respondent", answer: JSON.stringify({ arguments: [{ kind: "undercut", claim: "The record's silence on notice does not prove none was issued.", reasoning: "E1 records only that the order does not mention a hearing.", events: [{ ref: "E1", quote: "without hearing the petitioner" }] }] }) },
      ],
    ),
    { matterId, issueId: acceptedIssue.id },
  );
  const studio = await call<{ arguments: Array<{ id: string; status: string; attacks: string | null }> }>("getStudio", matterId);
  const argument = studio.arguments.find((a) => a.status === "candidate" && !a.attacks)!;
  await call("decideArgument", matterId, argument.id, "accepted");
  await expect(page.getByTestId("standing-list")).toContainText("The order was passed without hearing", { timeout: 15_000 });
  // The advocate rejects the opponent's standing attack, so the argument stands for the outline.
  const attack = studio.arguments.find((a) => a.status === "candidate" && a.attacks)!;
  await call("decideArgument", matterId, attack.id, "rejected");

  // ---- The rehearsal, with a scripted model, and one bench question accepted ----
  await app.evaluate(
    (_e, id) => (globalThis as any).__openadvoTest.rehearseScripted(id, [
      { match: "bench is most likely", answer: JSON.stringify({ questions: [{ question: "Was the petitioner heard before the order?", answer: "No; E1 records the order was passed without hearing the petitioner.", events: [{ ref: "E1", quote: "without hearing the petitioner" }] }] }) },
      { match: "As counsel for the respondent at the admission hearing", answer: JSON.stringify({ objections: [{ category: "delay", objection: "The petition is late.", response: "It was filed within time, as E2 records.", events: [{ ref: "E2", quote: "filed the writ petition on 02.04.2024" }] }] }) },
    ]),
    matterId,
  );
  const challenges = (await call<{ challenges: Array<{ id: string; kind: string; status: string }> }>("getStudio", matterId)).challenges;
  const benchQuestion = challenges.find((c) => c.kind === "bench_question")!;
  await call("decideChallenge", matterId, benchQuestion.id, "accepted");
  const objection = challenges.find((c) => c.kind === "objection")!;
  await call("decideChallenge", matterId, objection.id, "accepted");

  // ---- K8: the hearing with directions; the compliance tasks proposed and accepted ----
  const hearing = await call<{ id: string }>("addHearing", matterId, { date: "2026-11-10", bench: "Justice X", directions: "Reply affidavit within four weeks; list after four weeks.", nextDate: "2026-12-15", nextDateStatus: "confirmed" });
  const taskAnswer = await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.matterId, "propose_compliance_tasks", {
      hearing_id: input.hearingId,
      tasks: [{ text: "File the reply affidavit", due_at: "2026-12-08" }],
    }),
    { matterId, hearingId: hearing.id },
  );
  expect(String(taskAnswer)).toContain("Compliance tasks proposed");
  let tasks = await call<Array<{ id: string; status: string; text: string }>>("listTasks", matterId);
  expect(tasks[0].text).toBe("File the reply affidavit");
  await call("decideTask", matterId, tasks[0].id, true);
  const reminders = await call<Array<{ text: string }>>("listReminders", matterId);
  expect(reminders.some((r) => r.text.includes("File the reply affidavit"))).toBe(true);

  // ---- K9: the cross-examination question, from a recorded statement ----
  const sourcesForEvidence = await call<Array<{ id: string; name: string }>>("listSources", matterId);
  const statement = await call<{ id: string }>("evidenceAdd", matterId, { sourceId: sourcesForEvidence[0].id, statement: "I received no notice of the order before it was passed.", givenBy: "W1", givenAt: "2024-03-13" });
  const evidence = await call<Array<{ id: string; statement: string }>>("evidenceList", matterId);
  expect(evidence.length).toBeGreaterThan(0);
  const crossAnswer = await app.evaluate(
    (_e, input) => (globalThis as any).__openadvoTest.callAgentTool(input.matterId, "propose_cross_questions", {
      questions: [{ question: "Your statement records no notice of the order, does it?", witness: "W1", target_kind: "evidence", target_id: input.evidenceId }],
    }),
    { matterId, evidenceId: statement.id },
  );
  expect(String(crossAnswer)).toContain("Cross-examination plan");
  const cross = await call<Array<{ id: string; status: string }>>("listCrossQuestions", matterId);
  await call("decideCrossQuestion", matterId, cross[0].id, "accepted");

  // ---- K5: the dissent panel, with the scripted model; one answer, no split ----
  await app.evaluate((_e, script) => (globalThis as any).__openadvoTest.setModelScript({ agent: [{ text: JSON.stringify({ answer: "The record does not state that any notice was issued before the order.", events: [{ ref: "E1", quote: "without hearing the petitioner" }] }) }] }), null);
  const panel = await call<{ answers: Array<{ role: string; model: string; answer: string; refused: string }>; split: boolean }>("askDissent", matterId, "Was any notice issued before the order?");
  expect(panel.answers.length).toBeGreaterThanOrEqual(1);
  expect(panel.answers[0].refused).toBe("");
  expect(panel.split).toBe(false);

  // ---- K6, K7: the hearing brief and the oral outline, before the date ----
  const briefDraft = await call<{ draft: { id: string } }>("generateDraft", matterId, "hearing_brief");
  const briefHead = (await call<Array<{ id: string; kind: string; head: { id: string } }>>("listDrafts", matterId)).find((d) => d.id === briefDraft.draft.id)!.head;
  const briefText = (await call<{ paragraphs: Array<{ text: string }> }>("getRevision", matterId, briefHead.id)).paragraphs.map((p) => p.text).join("\n");
  expect(briefText).toContain("HEARING BRIEF");
  expect(briefText).toContain("Notice issued");
  expect(briefText).toContain("interim injunction");
  expect(briefText).toContain("2026-12-15");
  expect(briefText).toContain("Reply affidavit within four weeks");
  expect(briefText).toContain("brief.pdf, p. 1, l. 4");
  expect(briefText).toContain("Was the petitioner heard before the order?");
  expect(briefText).toContain("The petition is late.");
  expect(briefText).toContain("No outcome is predicted");

  const outline = await call<{ draft: { id: string } }>("generateDraft", matterId, "oral_outline");
  const outlineHead = (await call<Array<{ id: string; kind: string; head: { id: string } }>>("listDrafts", matterId)).find((d) => d.id === outline.draft.id)!.head;
  const outlineText = (await call<{ paragraphs: Array<{ text: string }> }>("getRevision", matterId, outlineHead.id)).paragraphs.map((p) => p.text).join("\n");
  expect(outlineText).toContain("ORAL OUTLINE");
  expect(outlineText).toContain("The order was passed without hearing the petitioner.");
  expect(outlineText).toContain("Rebuttal notes");
  expect(outlineText).toContain("Compilation of authorities");

  // The window shows the hearing prep group in the picker on the Matter tab.
  await page.getByRole("tab", { name: "Matter", exact: true }).click();
  await expect(page.getByTestId("cross-examination").getByTestId("cross-target")).toContainText("brief.pdf");
  await expect(page.getByTestId("new-draft").getByLabel("Document group")).toContainText("Hearing preparation");
  await page.screenshot({ path: path.join(repo, "test-results", "phase7-strategy.png") });
  await app.close();
});
