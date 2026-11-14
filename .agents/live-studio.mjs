// One live run of the Studio: real AWS index, real India Code, real model. Not a test.
// Usage: node .agents/live-studio.mjs [model]   (after npm run build)
import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const model = process.argv[2] ?? "opencode-go/deepseek-v4.1-flash";
const base = await mkdtemp(path.join(tmpdir(), "oa-live-studio-"));
await mkdir(path.join(base, "inbox"), { recursive: true });
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.TimesRoman);
const pg = doc.addPage([595, 842]);
[
  "IN THE HIGH COURT OF RAJASTHAN",
  "The petitioner was arrested on 05.01.2020 and has been in custody since then.",
  "The charge-sheet was filed on 10.06.2020. Trial has not commenced till date.",
  "By order dated 12.03.2024 the High Court refused regular bail without reference to the period of custody.",
].forEach((t, i) => pg.drawText(t, { x: 50, y: 780 - i * 24, size: 11, font }));
const file = path.join(base, "inbox", "order.pdf");
await writeFile(file, await doc.save());
const env = { ...process.env, OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_MODEL: model };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");
const oa = (fn, ...args) => page.evaluate(([f, a]) => globalThis.openadvo[f](...a), [fn, args]);
const t0 = Date.now();
const log = (...x) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...x);
const m = await oa("createMatter", "Live Studio v. State");
await oa("openMatter", m.id);
await oa("addFiles", m.id, [file]);
let nb;
for (let i = 0; i < 60; i++) {
  nb = await oa("getNotebook", m.id);
  if (nb.events.length && nb.readiness.jobsPending === 0) break;
  await new Promise((r) => setTimeout(r, 1000));
}
for (const e of nb.events) await oa("confirmEvent", m.id, e.id);
log("events confirmed", nb.events.length);
const issue = await oa("addIssue", m.id, "Whether the High Court erred in refusing regular bail without considering four years of custody and the delay in trial?");
await oa("decideIssue", m.id, issue.id, "accepted", "Live run.");
log("indexed", JSON.stringify((await oa("indexSupremeCourt", [2021, 2022, 2023])).map((p) => [p.year, p.rows])));
const webHits = (await oa("researchSearch", m.id, "web", "2023 INSC Supreme Court bail long incarceration delay in trial Article 21")).hits;
const linkedHit = webHits.find((h) => h.courtCopy);
log("web hits", webHits.length, "with court copy:", linkedHit?.courtCopy?.insc ?? "none");
const hits = linkedHit ? [{ ref: linkedHit.courtCopy.ref }] : (await oa("researchSearch", m.id, "aws_sc", "state")).hits;
const r = await oa("researchRead", m.id, "aws_sc", hits[0].ref);
log("read", r.title, r.pages.length, "pages; first line:", r.pages[0]?.lines[0]?.text);
await oa("saveJudgment", m.id, hits[0].ref, { paragraph: "", proposition: "Bail and the period of custody (as read in the judgment).", role: "supporting", issueId: issue.id });
const ic = await oa("researchSearch", m.id, "indiacode", "section 483 Bharatiya Nagarik Suraksha Sanhita");
const sec = ic.hits.find((h) => /\b483\b/.test(h.detail));
log("india code", ic.hits.length, sec?.title);
if (sec) await oa("saveProvision", m.id, sec.ref);
const web = await oa("researchSearch", m.id, "web", "Supreme Court bail long custody delay in trial");
log("web", web.hits.length, web.hits[0]?.url);
const runId = await oa("startArgumentLoop", m.id, issue.id, { rounds: Number(process.argv[3] ?? 2), generators: 2 });
log("loop started", runId);
let st;
for (let i = 0; i < 300; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  st = await oa("getStudio", m.id);
  if (!st.loop.running) break;
}
const run = st.runs.at(-1);
log("run", run.status, JSON.stringify(run.stats), run.error ?? "");
for (const a of st.arguments) log(`ARG [${a.computed}] ${a.attacks ? `${a.attackKind} -> ${a.attacks.slice(0, 6)}` : `${a.ground}/${a.stance}`} elo ${a.elo}: ${a.claim}\n      questions: ${a.questions.join(" | ")}`);
for (const x of st.rejections) log(`REJECTED ${x.reason}: ${x.detail}`);
const shots = process.argv[4];
if (shots) {
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Live Studio v. State" }).first().click();
  await page.getByRole("tab", { name: "Studio" }).click();
  await page.getByRole("tab", { name: "Arguments" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "studio-arguments.png") });
  await page.getByTestId("studio").getByRole("tab", { name: "Search", exact: true }).click();
  await page.getByLabel("Research query").fill("2022 INSC 155");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByTestId("research-hits").getByRole("button", { name: "Read" }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, "studio-search.png") });
}
await app.close();
