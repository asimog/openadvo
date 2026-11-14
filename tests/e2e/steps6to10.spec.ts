/**
 * Steps 6 to 10 end to end, against the built application. Specs: docs/specs/v0-research.md,
 * v0-citations.md, v0-filing.md, v0-capture.md, v0-agent-filing.md.
 *
 * The model is stood in for by the agent's own tool functions (the test hook `work`), so every
 * agent action goes through the same code a real turn uses. The court portal is a local HTTP
 * server, so capture, upload, submit and the receipt run for real. Citations are checked by the
 * vendored `ulos` against its court database (npm run vendor:ulos). Needs the vendored Euro-Office
 * release for the PDF/A filing set.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { platformKey } from "../../src/lib/euro-office/platform.ts";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const vendored = existsSync(path.join(repo, "resources", "euro-office", platformKey(), "converter"));
const ulos = existsSync(path.join(repo, "resources", "ulos", platformKey(), "data", "ulos.db"));
test.describe.configure({ timeout: 300_000 });

async function pdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 60, y: 780 - i * 24, size: 12, font }));
  return doc.save();
}

/** A local stand-in for the court portal: a record to download, a filing form, a receipt. */
async function fakePortal(record: Uint8Array): Promise<{ server: Server; url: string; received: () => { fields: string; bytes: number } | null }> {
  let received: { fields: string; bytes: number } | null = null;
  const server = createServer((req, res) => {
    if (req.url === "/record.pdf") {
      res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="impugned-order.pdf"' });
      return res.end(Buffer.from(record));
    }
    if (req.url === "/file") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<!doctype html><title>E-filing</title><form method="post" action="/submit" enctype="multipart/form-data">
        <label for="case">Case title</label><input id="case" name="case">
        <label for="doc">Petition</label><input id="doc" type="file" name="doc">
        <button id="go" type="submit">File</button></form>`);
    }
    if (req.url === "/submit" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        received = { fields: body.toString("latin1").slice(0, 4000), bytes: body.length };
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<!doctype html><title>Receipt</title><h1>Diary No. 4242 of 2024</h1><p>Filing received.</p>");
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<!doctype html><title>Case status</title><h1>Case status</h1><a id="dl" href="/record.pdf">Judgment</a>');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}/`, received: () => received };
}

async function launch(base: string, portal: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1", OPENADVO_PORTAL_URL: portal }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

const bridge = (page: Page) => <T>(fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (globalThis as any).openadvo[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const work = (app: ElectronApplication) => <T>(fn: string, ...args: unknown[]) =>
  app.evaluate((_e, [f, a]) => (globalThis as any).__openadvoTest.work()[f](...a), [fn, args] as const) as Promise<T>;

test("steps 6 to 10: research, citations, grounds, filing set, capture, agent filing, receipt, email", async () => {
  test.skip(!vendored || !ulos, "needs the vendored Euro-Office release and ulos (npm run vendor, npm run vendor:ulos)");
  const base = await mkdtemp(path.join(tmpdir(), "oa-e2e6-"));
  await mkdir(path.join(base, "inbox"), { recursive: true });
  const brief = path.join(base, "inbox", "judgment.pdf");
  await writeFile(brief, await pdf([
    "IN THE HIGH COURT OF JUDICATURE",
    "Writ Petition No. 12 of 2023: Shankar Teli v. State of Rajasthan",
    "1. The writ petition was filed on 02.01.2023.",
    "2. The High Court dismissed the writ petition by its judgment dated 12.03.2024.",
  ]));
  const portalServer = await fakePortal(await pdf(["ORDER OF THE HIGH COURT", "Dated 12.03.2024"]));
  const { app, page } = await launch(base, portalServer.url);
  const call = bridge(page);
  const agent = work(app);
  try {
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Shankar Teli v. State");
    await page.getByRole("button", { name: "Create matter" }).click();
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, brief);
    await page.getByRole("button", { name: "Add files" }).click();
    await expect(page.getByText("1 pp.")).toBeVisible({ timeout: 120_000 });
    const matterId: string = (await call<any[]>("listMatters"))[0].id;
    const nb = await call<any>("getNotebook", matterId);
    for (const e of nb.events) await call("confirmEvent", matterId, e.id);
    const judgment = nb.events.find((e: any) => e.dateStart === "2024-03-12");
    expect(judgment).toBeTruthy();

    // ---- Matter details, through the form on the Matter tab ----
    await page.getByRole("tab", { name: "Chronology" }).click();
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByTestId("detail-petitioner").fill("Shankar Teli");
    await page.getByTestId("detail-respondent").fill("State of Rajasthan");
    await page.getByTestId("detail-case-number").fill("Writ Petition No. 12 of 2023");
    await page.getByTestId("detail-court").fill("High Court of Rajasthan");
    await page.getByTestId("detail-impugned").selectOption(judgment.id);
    await page.getByRole("button", { name: "Save matter details" }).click();
    await expect(page.getByTestId("matter-details")).toContainText("Saved");

    // ---- Step 6: the agent proposes an issue; the advocate decides it at the conference ----
    await agent("proposeIssue", matterId, "Whether the High Court erred in dismissing the writ petition without notice.");
    await page.getByRole("tab", { name: "Research" }).click();
    const issue = page.getByTestId("issue").first();
    await expect(issue).toHaveAttribute("data-status", "candidate");
    await issue.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByTestId("research-error")).toContainText("needs a reason");
    await issue.getByLabel("Reason").fill("Arguable on the record");
    await issue.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByTestId("issue").first()).toHaveAttribute("data-status", "accepted");

    // The advocate records an authority; the agent records one more (a candidate).
    await page.getByTestId("authority-citation").fill("1950 INSC 1");
    await page.getByLabel("Parties").fill("Ram Krishna Ramnath Agarwal v. Secretary, Municipal Committee");
    await page.getByLabel("Decision date (YYYY-MM-DD)").fill("1950-03-14");
    await page.getByRole("button", { name: "Add authority" }).click();
    await expect(page.getByTestId("authority")).toHaveCount(1);
    await agent("addAuthority", matterId, { citation: "1950 INSC 2", parties: "", decisionDate: "", paragraph: "", proposition: "adverse view", role: "adverse", issueId: null });

    // The citation index is a finding aid.
    await page.getByLabel("Citation index search").fill("BHAWANIPORE");
    await page.getByRole("button", { name: "Search index" }).click();
    await expect(page.getByTestId("index-hits")).toContainText("1950 INSC 2");

    // A memorandum must be grounded in the matter's records.
    await expect(agent("writeMemorandum", matterId, { title: "Bare", issueId: null, body: "No references at all [event:00000000-0000]." })).rejects.toThrow(/MEMO_UNGROUNDED/);
    const memo = await agent<string>("writeMemorandum", matterId, {
      title: "Memorandum on the dismissal",
      issueId: null,
      body: `Established fact: the writ petition was dismissed [event:${judgment.id}] [judgment.pdf, p. 1, l. 4]. Proposition: notice was required [event:ffffffff-ffff].`,
    });
    expect(memo).toContain("2 reference(s) resolved");
    expect(memo).toContain("unresolved");

    // ---- Grounds: the agent inserts paragraphs as tracked changes; the advocate keeps them ----
    const g1 = await agent<any>("proposeParagraph", matterId, { kind: "grounds", after: null, text: "Because the High Court did not follow 1950 INSC 1, as the order at Annexure P-1 shows.", reason: "issue 1" }, "");
    await agent("proposeParagraph", matterId, { kind: "grounds", after: g1.proposal.anchor, text: "Because 2023 INSC 99999 is not a judgment of this Court.", reason: "planted" }, "");
    const grounds = (await call<any[]>("listDrafts", matterId)).find((d) => d.kind === "grounds");
    let changes = (await call<any[]>("agentChanges", matterId)).find((g) => g.draftId === grounds.id);
    expect(changes.changes.map((c: any) => c.before)).toEqual(["", ""]);
    const kept = await call<any>("decideAgentChanges", matterId, grounds.id, changes.revisionId, changes.changes.map((c: any) => ({ anchor: c.anchor, decision: "keep" })));
    expect(kept.author).toBe("advocate");

    // ---- Step 7: the validator checks the citations ----
    await page.getByRole("tab", { name: "Matter", exact: true }).click();
    await page.getByRole("tab", { name: "Research" }).click();
    await expect(page.getByTestId("validator-status")).toContainText("ulos");
    await page.getByRole("button", { name: "Check all citations" }).click();
    await expect(page.locator('[data-testid="citation-check"][data-outcome="verified"]').first()).toContainText("1950 INSC 1", { timeout: 60_000 });
    const failing = page.locator('[data-testid="citation-check"]', { hasText: "2023 INSC 99999" });
    await expect(failing).toHaveAttribute("data-outcome", /failed|unresolved/);

    // Grounds cannot be approved: an unattested citation and no adverse-authority review.
    await expect(call("approveRevision", matterId, kept.id)).rejects.toThrow(/LEGAL_REVIEW_BLOCKED.*2023 INSC 99999.*Adverse-authority review: not recorded/);
    const gate = await call<any>("checkDraft", matterId, grounds.id);
    expect(gate.gate.label).toBe("Blocked pending legal review");

    await failing.getByLabel("Attestation reason for 2023 INSC 99999").fill("Planted for the test; the advocate attests it");
    await failing.getByRole("button", { name: "Attest" }).click();
    await expect(page.locator('[data-testid="citation-check"]', { hasText: "2023 INSC 99999" })).toContainText("Attested by advocate (not verified)");
    await page.getByTestId("adverse-outcome").selectOption("none_found");
    await page.getByRole("button", { name: "Record review" }).click();
    await expect(page.getByTestId("research-error")).toContainText("coverage");
    await page.getByTestId("adverse-coverage").fill("Citation index 1950 to 2023, party and subject search");
    await page.getByRole("button", { name: "Record review" }).click();
    await expect(page.getByTestId("adverse-status")).toContainText("none_found");
    await call("approveRevision", matterId, kept.id);

    // ---- The other petition documents, approved by the advocate ----
    await call("generateListOfDates", matterId);
    await call("generateSynopsis", matterId);
    await agent("proposeParagraph", matterId, { kind: "questions_of_law", after: null, text: "Whether a writ petition may be dismissed without notice to the petitioner?", reason: "issue 1" }, "");
    const qol = (await call<any[]>("listDrafts", matterId)).find((d) => d.kind === "questions_of_law");
    changes = (await call<any[]>("agentChanges", matterId)).find((g) => g.draftId === qol.id);
    await call("decideAgentChanges", matterId, qol.id, changes.revisionId, [{ anchor: changes.changes[0].anchor, decision: "keep" }]);
    for (const d of await call<any[]>("listDrafts", matterId)) if (!d.approved || d.approved.id !== d.head.id) await call("approveRevision", matterId, d.head.id);

    // ---- V1-6: the case-conference package, from the records only ----
    const conf = await call<any>("generateDraft", matterId, "conference");
    const confText = (await call<any>("getRevision", matterId, conf.revision.id)).paragraphs.map((p: any) => p.text);
    expect(confText).toContain("Shankar Teli versus State of Rajasthan.");
    expect(confText.some((t: string) => t.includes("1950 INSC 1") && t.includes("validator: verified"))).toBe(true);
    expect(confText.some((t: string) => t.startsWith("none_found. Coverage: Citation index 1950 to 2023"))).toBe(true);

    // ---- Step 8: annexures, limitation, compliance, approval for filing ----
    await page.getByRole("tab", { name: "Filing" }).click();
    await expect(page.locator('[data-rule="R-0"]')).toHaveAttribute("data-outcome", "not_checked");
    await expect(page.locator('[data-rule="P-3"]')).toHaveAttribute("data-outcome", "defect");
    await page.getByTestId("annexure-pick").first().check();
    await page.getByRole("button", { name: "Save annexures" }).click();
    await expect(page.locator('[data-rule="P-3"]')).toHaveAttribute("data-outcome", "pass");
    // ---- V1-7: the petition from the matter details and the approved Questions of Law and Grounds ----
    await expect(page.locator('[data-rule="P-1"]')).toContainText("Petition");
    const pet = await call<any>("generateDraft", matterId, "petition");
    const petText: string[] = (await call<any>("getRevision", matterId, pet.revision.id)).paragraphs.map((p: any) => p.text);
    expect(petText).toContain("Whether a writ petition may be dismissed without notice to the petitioner?");
    expect(petText.some((t) => t.startsWith("(a) grant special leave") && t.includes("12.03.2024") && t.includes("Writ Petition No. 12 of 2023"))).toBe(true);
    expect(petText.some((t) => t.includes("[TO BE COMPLETED"))).toBe(false);
    const petCheck = await call<any>("checkDraft", matterId, pet.draft.id);
    expect(petCheck.defects.filter((d: any) => d.kind === "prayer_mismatch" || d.kind === "incomplete")).toEqual([]);
    // The petition repeats the Grounds' citations: the validator checks them in the petition too.
    await call("checkCitations", matterId, pet.draft.id);
    await call("approveRevision", matterId, pet.revision.id);
    await page.getByRole("button", { name: "Compute limitation" }).click();
    await expect(page.getByTestId("limitation")).toContainText("Last day: 10.06.2024 (not confirmed)");
    await expect(page.getByTestId("filing-blockers")).toContainText("P-4");
    await page.getByRole("button", { name: "Confirm limitation" }).click();
    await expect(page.getByTestId("limitation")).toContainText("(confirmed by you)");
    await expect(page.getByTestId("filing-blockers")).toHaveCount(0);
    await page.getByRole("button", { name: "Approve for filing and make the filing set" }).click();
    await expect(page.getByTestId("filing-set")).toBeVisible({ timeout: 180_000 });
    const filing = await call<any>("getFiling", matterId);
    const set = filing.filingSet;
    expect(set.manifest.files.map((f: any) => [f.role, f.pdfa])).toEqual([
      ["synopsis", true], ["list_of_dates", true], ["petition", true], ["questions_of_law", true], ["grounds", true], ["annexure", false],
    ]);
    expect(filing.compliance.results.find((r: any) => r.rule === "P-5").outcome).toBe("pass");
    const manifestOnDisk = readFileSync(path.join(set.folder, "manifest.json"), "utf8");
    expect(JSON.parse(manifestOnDisk).files.length).toBe(6);
    // V1-8: the manifest digest and the file hashes verify; the approval trail is in the manifest.
    expect(set.manifest.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(set.manifest.approvals.at(-1).what).toBe("Approved for filing");
    await page.getByRole("button", { name: "Verify the manifest" }).click();
    await expect(page.getByTestId("manifest-check")).toContainText("Manifest verified");

    // ---- Step 9: the court record, captured in the visible portal window ----
    await page.getByRole("button", { name: "Open court portal" }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__openadvoTest.portalContentsUrl())).toBe("open");
    await app.evaluate(() => (globalThis as any).__openadvoTest.portalEval("document.getElementById('dl').click(); true"));
    await expect.poll(async () => (await call<any[]>("listSources", matterId)).map((s) => s.name), { timeout: 30_000 }).toContain("impugned-order.pdf");
    const captured = (await call<any[]>("listEvents", matterId)).find((e) => e.action === "source.captured");
    expect(captured.data.url).toBe(`${portalServer.url}record.pdf`);
    expect(captured.data.method).toBe("portal_browser");

    // ---- Step 10: agent-operated filing, bound to the payload hash ----
    await agent("portal", matterId, "portal_navigate", { url: `${portalServer.url}file` });
    expect(await agent<string>("portal", matterId, "portal_read", {})).toContain("#doc (input:file)");
    await agent("portal", matterId, "portal_fill", { selector: "#case", value: "Shankar Teli v. State of Rajasthan" });
    await expect(agent("portal", matterId, "portal_click", { selector: "#go" })).rejects.toThrow(/submit control/);
    const petition = set.manifest.files[0].name;
    await expect(agent("portal", matterId, "upload_filing_file", { selector: "#doc", file_name: petition })).rejects.toThrow(/FILING_NOT_CONFIRMED/);
    await expect(call("confirmFiling", matterId, set.id, "0".repeat(64), 1)).rejects.toThrow(/PAYLOAD_MISMATCH/);
    await page.getByRole("button", { name: "Confirm the filing set (1 of 2)" }).click();
    await expect(page.getByRole("button", { name: "Filing set confirmed (1 of 2)" })).toBeVisible();
    await expect(agent("portal", matterId, "upload_filing_file", { selector: "#doc", file_name: "not-in-set.pdf" })).rejects.toThrow(/NOT_IN_FILING_SET/);
    expect(await agent<string>("portal", matterId, "upload_filing_file", { selector: "#doc", file_name: petition })).toContain(set.manifest.files[0].sha256.slice(0, 12));
    await expect(agent("portal", matterId, "submit_filing", { selector: "#go" })).rejects.toThrow(/confirmation 2/);
    await page.getByRole("button", { name: "Confirm the filing (2 of 2)" }).click();
    await expect(page.getByRole("button", { name: "Filing confirmed (2 of 2)" })).toBeVisible();
    await agent("portal", matterId, "submit_filing", { selector: "#go" });
    await expect.poll(() => portalServer.received()?.bytes ?? 0, { timeout: 30_000 }).toBeGreaterThan(20_000);
    expect(portalServer.received()!.fields).toContain("Shankar Teli v. State of Rajasthan");
    await expect.poll(() => agent<string>("portal", matterId, "portal_read", {}), { timeout: 30_000 }).toContain("Diary No. 4242 of 2024");
    expect(await agent<string>("portal", matterId, "save_portal_receipt", {})).toContain("Portal receipt");
    const events = await call<any[]>("listEvents", matterId);
    expect(events.some((e) => e.action === "filing.submitted" && e.data.payloadSha256 === set.payloadSha256)).toBe(true);
    expect(events.some((e) => e.action === "source.captured" && e.data.method === "filing_receipt")).toBe(true);

    // ---- Step 9: client email, from a saved message ----
    const attachment = Buffer.from(await pdf(["Client letter", "Dated 01.04.2024"])).toString("base64").replace(/.{76}/g, "$&\r\n");
    const eml = path.join(base, "inbox", "client.eml");
    await writeFile(eml, [
      "From: Client <client@example.com>", "To: Advocate <aor@example.com>", "Subject: Documents for the SLP", "Date: Mon, 1 Apr 2024 10:00:00 +0530",
      "Message-ID: <abc123@example.com>", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="b1"', "",
      "--b1", "Content-Type: text/plain", "", "Please find the letter attached.", "",
      "--b1", "Content-Type: application/pdf", 'Content-Disposition: attachment; filename="client-letter.pdf"', "Content-Transfer-Encoding: base64", "", attachment, "",
      "--b1", "Content-Type: application/zip", 'Content-Disposition: attachment; filename="logo.zip"', "Content-Transfer-Encoding: base64", "", "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "", "--b1--", "",
    ].join("\r\n"));
    const mailed = await app.evaluate((_e, a) => (globalThis as any).__openadvoTest.importEml(a.m, [a.f]), { m: matterId, f: eml });
    expect(mailed.attachments).toEqual([
      { message: "client@example.com: Documents for the SLP", name: "client-letter.pdf", outcome: "added" },
      { message: "client@example.com: Documents for the SLP", name: "logo.zip", outcome: "skipped: format not accepted" },
    ]);
    const mailEvent = (await call<any[]>("listEvents", matterId)).find((e) => e.action === "source.captured" && e.data.method === "email");
    expect(mailEvent.data.url).toBe("mid:abc123@example.com");
  } finally {
    await app.close();
    portalServer.server.close();
  }
});
