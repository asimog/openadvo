// Screenshots of the built application for a visual review. Not a test. Usage: node .agents/shots.mjs <outDir>
import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";

const out = path.resolve(process.argv[2] ?? "shots");
await mkdir(out, { recursive: true });
const base = await mkdtemp(path.join(tmpdir(), "oa-shots-"));
const inbox = path.join(base, "inbox");
await mkdir(inbox, { recursive: true });
const lines = [
  "JUDGMENT",
  "The writ petition was dismissed on 12.03.2024 by the learned Single Judge after hearing both sides.",
  "The petitioner applied for a certified copy of the order the next day.",
  "Notice was issued to the respondent on 02.01.2024.",
];
const docx = path.join(inbox, "judgment.docx");
await writeFile(docx, await Packer.toBuffer(new Document({ sections: [{ children: lines.map((t) => new Paragraph({ children: [new TextRun(t)] })) }] })));
const env = { ...process.env, OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
await page.waitForLoadState("domcontentloaded");
const shot = async (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
await page.waitForTimeout(1500);
await shot("01-landing");
await page.getByRole("button", { name: "New matter" }).click();
await page.getByLabel("Matter title").fill("Ram Kumar v. State of Delhi");
await page.getByRole("button", { name: "Create matter" }).click();
await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
}, docx);
await page.getByRole("button", { name: "Add files" }).click();
await page.waitForTimeout(4000);
await shot("02-matter");
for (const tab of ["Sources", "Procedural history", "Chronology", "Research", "Filing"]) {
  await page.getByRole("tab", { name: tab }).click();
  await page.waitForTimeout(600);
  await shot(`03-${tab.replace(/\s+/g, "-").toLowerCase()}`);
}
await app.close();
console.log(out);
