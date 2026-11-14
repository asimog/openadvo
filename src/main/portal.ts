/**
 * The visible court-portal browser (build-plan steps 9 and 10; workflow 3, 11).
 *
 * One separate, visible window with its own session, no Node integration and no preload. The
 * advocate signs in and solves CAPTCHA there; the application never does. Navigation stays on
 * the allowed origins. Every PDF downloaded in it becomes a source of the open matter, with the
 * URL as its capture provenance (step 9). The agent may read, fill and click in it (step 10), but:
 * - a submit control is refused to `browser_click`; only `submit_filing` presses it, and only
 *   after both confirmations bound to the payload hash of the newest filing set;
 * - `upload_filing_file` accepts only files of that filing set whose bytes still match the manifest.
 * Specs: docs/specs/v0-capture.md, docs/specs/v0-agent-filing.md.
 */
import { BrowserWindow, session, type WebContents } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Matters } from "./matters.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";

export const DEFAULT_PORTAL = "https://www.sci.gov.in/";
const DEFAULT_ORIGINS = ["https://www.sci.gov.in", "https://sci.gov.in", "https://main.sci.gov.in", "https://efiling.sci.gov.in", "https://services.ecourts.gov.in"];

export interface PortalOptions {
  /** The first page. Tests point it at a local portal (OPENADVO_PORTAL_URL). */
  home: string;
  /** Origins the window may show. */
  origins: string[];
  /** A source was captured: the window refreshes the matter. */
  onCaptured: (matterId: string, detail: { name: string; outcome: string }) => void;
}

export function portalOptionsFromEnv(onCaptured: PortalOptions["onCaptured"]): PortalOptions {
  const test = process.env.OPENADVO_PORTAL_URL;
  if (test) return { home: test, origins: [new URL(test).origin], onCaptured };
  return { home: DEFAULT_PORTAL, origins: DEFAULT_ORIGINS, onCaptured };
}

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export class Portal {
  private matters: Matters;
  private options: PortalOptions;
  private win: BrowserWindow | null = null;
  private matterId: string | null = null;

  constructor(matters: Matters, options: PortalOptions) {
    this.matters = matters;
    this.options = options;
  }

  private allowed(url: string): boolean {
    try {
      return this.options.origins.includes(new URL(url).origin);
    } catch {
      return false;
    }
  }

  /** Open (or bring forward) the visible portal window for one matter. */
  async open(matterId: string, url?: string): Promise<string> {
    await this.matters.store(matterId);
    this.matterId = matterId;
    const target = url && this.allowed(url) ? url : this.options.home;
    if (url && !this.allowed(url)) throw new MatterStoreError("PORTAL_ORIGIN_REFUSED", `${url} is not a court portal origin this window may open`);
    if (!this.win || this.win.isDestroyed()) this.win = this.create();
    await this.win.loadURL(target);
    this.win.show();
    return this.win.webContents.getURL();
  }

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  private create(): BrowserWindow {
    const ses = session.fromPartition("persist:oa-portal");
    const win = new BrowserWindow({
      width: 1200,
      height: 860,
      title: "Court portal (Open Advocate)",
      show: false,
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    win.removeMenu();
    const guard = (event: { preventDefault: () => void }, url: string) => {
      if (!this.allowed(url)) event.preventDefault();
    };
    win.webContents.on("will-navigate", guard);
    win.webContents.on("will-redirect", guard);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (this.allowed(url)) void win.loadURL(url);
      return { action: "deny" };
    });
    if (!(ses as unknown as { __oaDownloads?: boolean }).__oaDownloads) {
      (ses as unknown as { __oaDownloads?: boolean }).__oaDownloads = true;
      ses.on("will-download", (_event, item) => {
        const matterId = this.matterId;
        const url = item.getURL();
        const pageUrl = this.win?.webContents.getURL() ?? "";
        const dir = path.join(tmpdir(), "openadvo-capture", randomUUID());
        const name = item.getFilename() || "download.pdf";
        const file = path.join(dir, name);
        void mkdir(dir, { recursive: true });
        item.setSavePath(file);
        item.once("done", (_e, state) => {
          if (state !== "completed" || !matterId) return;
          void this.capture(matterId, file, url, pageUrl).finally(() => rm(dir, { recursive: true, force: true }).catch(() => undefined));
        });
      });
    }
    return win;
  }

  /** Step 9: one downloaded file into the matter, with its capture provenance. */
  private async capture(matterId: string, file: string, url: string, pageUrl: string): Promise<void> {
    const bytes = await readFile(file);
    const store = await this.matters.store(matterId);
    if (!isPdf(bytes)) {
      this.options.onCaptured(matterId, { name: path.basename(file), outcome: "refused: not a PDF" });
      return;
    }
    const [result] = await this.matters.addFiles(matterId, [file], { actor: "advocate" });
    if (!result.source) {
      this.options.onCaptured(matterId, { name: path.basename(file), outcome: result.reason ?? result.outcome });
      return;
    }
    // Appendix B-B kind 2: the same court listing captured again is recorded, not added twice.
    const before = store.work.listCaptures().find((c) => c.url === url);
    store.work.addCapture(result.source.id, "portal_browser", url, {
      pageUrl,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...(before ? { sameListingAs: before.id } : {}),
    }, { actor: "advocate" });
    this.options.onCaptured(matterId, { name: result.source.name, outcome: result.outcome });
  }

  private contents(): WebContents {
    if (!this.win || this.win.isDestroyed()) throw new MatterStoreError("PORTAL_NOT_OPEN", "open the court portal first");
    return this.win.webContents;
  }

  // ---- Agent tools (step 10). Each acts only in the portal window. ----

  /** The page's URL, title and visible text, with the form fields the agent may fill. */
  async read(): Promise<string> {
    const wc = this.contents();
    return wc.executeJavaScript(`(() => {
      const fields = [...document.querySelectorAll("input, select, textarea, button, a[href]")].slice(0, 200).map((el) => {
        const id = el.id ? "#" + el.id : el.name ? el.tagName.toLowerCase() + "[name='" + el.name + "']" : "";
        const label = (el.labels && el.labels[0] ? el.labels[0].innerText : el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 80);
        const type = el.tagName.toLowerCase() + (el.type ? ":" + el.type : "");
        return id ? "- " + id + " (" + type + ") " + label : null;
      }).filter(Boolean);
      return "URL: " + location.href + "\\nTitle: " + document.title + "\\n\\n" + document.body.innerText.slice(0, 6000) + "\\n\\nFields:\\n" + fields.join("\\n");
    })()`);
  }

  async navigate(url: string): Promise<string> {
    if (!this.allowed(url)) throw new MatterStoreError("PORTAL_ORIGIN_REFUSED", `${url} is not an allowed court portal origin`);
    await this.contents().loadURL(url);
    return this.contents().getURL();
  }

  async fill(selector: string, value: string): Promise<string> {
    const wc = this.contents();
    const r = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "not found";
      if (el.type === "file" || el.type === "password") return "refused: " + el.type;
      el.focus(); el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    })()`);
    if (r !== "filled") throw new MatterStoreError("PORTAL_FILL_REFUSED", `${selector}: ${r}`);
    return r;
  }

  /** A click on a submit control is refused here: filing goes through submitFiling. */
  async click(selector: string): Promise<string> {
    const wc = this.contents();
    const r = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "not found";
      const submit = (el.tagName === "BUTTON" && (el.type || "submit") === "submit") || (el.tagName === "INPUT" && (el.type === "submit" || el.type === "image"));
      if (submit) return "refused: submit control";
      el.click();
      return "clicked";
    })()`);
    if (r !== "clicked") throw new MatterStoreError("PORTAL_CLICK_REFUSED", `${selector}: ${r}`);
    return r;
  }

  /** Put one file of the newest filing set into a file input, after the first confirmation. */
  async uploadFilingFile(matterId: string, selector: string, fileName: string): Promise<string> {
    const set = await this.confirmedSet(matterId, 1);
    const f = set.manifest.files.find((x) => x.name === fileName);
    if (!f) throw new MatterStoreError("NOT_IN_FILING_SET", `${fileName} is not a file of the filing set`);
    const full = path.join(set.folder, f.name);
    const sha = createHash("sha256").update(await readFile(full)).digest("hex");
    if (sha !== f.sha256) throw new MatterStoreError("PAYLOAD_CHANGED", `${fileName} changed after the filing set was made`);
    const dbg = this.contents().debugger;
    if (!dbg.isAttached()) dbg.attach("1.3");
    const { root } = (await dbg.sendCommand("DOM.getDocument")) as { root: { nodeId: number } };
    const { nodeId } = (await dbg.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector })) as { nodeId: number };
    if (!nodeId) throw new MatterStoreError("PORTAL_FIELD_NOT_FOUND", selector);
    await dbg.sendCommand("DOM.setFileInputFiles", { nodeId, files: [full] });
    await this.contents().executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event("change", { bubbles: true })); true`);
    return `${fileName} (sha256 ${sha.slice(0, 12)}) put in ${selector}`;
  }

  /**
   * V5-18: the result of the newest filing set's submission, from the matter's events. After a
   * submit, the result is "unknown" until a receipt is saved or the advocate reconciles it.
   */
  async resultState(matterId: string): Promise<{ state: "none" | "unknown" | "submitted" | "not_submitted"; at: string | null; diary: string | null }> {
    const store = await this.matters.store(matterId);
    const set = store.work.filingSet();
    if (!set) return { state: "none", at: null, diary: null };
    let out: { state: "none" | "unknown" | "submitted" | "not_submitted"; at: string | null; diary: string | null } = { state: "none", at: null, diary: null };
    for (const e of [...store.listEvents(5000)].reverse()) {
      if (e.action === "filing.submitted" && e.subject === set.id) out = { state: "unknown", at: e.at, diary: null };
      else if (e.action === "source.captured" && e.data?.method === "filing_receipt" && out.state === "unknown") out = { state: "submitted", at: e.at, diary: null };
      else if (e.action === "filing.reconciled" && e.subject === set.id) out = { state: e.data?.outcome === "submitted" ? "submitted" : "not_submitted", at: e.at, diary: (e.data?.diary as string | null) ?? null };
    }
    return out;
  }

  /** Human-only (V5-18): the advocate records what the portal shows after an uncertain submission. */
  async reconcile(matterId: string, outcome: "submitted" | "not_submitted", diary: string): Promise<{ state: string }> {
    const store = await this.matters.store(matterId);
    const set = store.work.filingSet();
    if (!set) throw new MatterStoreError("NO_FILING_SET", "there is no filing set");
    const now = await this.resultState(matterId);
    if (now.state !== "unknown") throw new MatterStoreError("NOTHING_TO_RECONCILE", `the submission result is ${now.state}`);
    store.appendEvent({ actor: "advocate" }, "filing.reconciled", set.id, { outcome, diary: diary.trim() || null });
    return { state: outcome };
  }

  /** Press the submit control, only after both confirmations bound to the newest filing set. */
  async submitFiling(matterId: string, selector: string): Promise<string> {
    // V5-18: never submit again while the last result is unknown or after a recorded submission.
    const result = await this.resultState(matterId);
    if (result.state === "unknown") throw new MatterStoreError("FILING_RESULT_UNKNOWN", "the last submission's result is not known. The advocate checks the portal (diary search or the e-filing dashboard) and reconciles it first.");
    if (result.state === "submitted") throw new MatterStoreError("FILING_ALREADY_SUBMITTED", "this filing set is recorded as submitted");
    const set = await this.confirmedSet(matterId, 2);
    // After a reconciled "not submitted", a new attempt needs new confirmations.
    if (result.state === "not_submitted" && ![1, 2].every((step) => set.confirmations.some((c) => c.step === step && c.at > (result.at ?? "")))) {
      throw new MatterStoreError("FILING_NOT_CONFIRMED", "the last attempt was not submitted; the advocate confirms the filing set again (1 of 2, then 2 of 2) before a new attempt");
    }
    const wc = this.contents();
    const r = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "not found";
      if (el.form && typeof el.form.requestSubmit === "function") el.form.requestSubmit(el); else el.click();
      return "submitted";
    })()`);
    if (r !== "submitted") throw new MatterStoreError("PORTAL_SUBMIT_FAILED", `${selector}: ${r}`);
    await (await this.matters.store(matterId)).appendEvent({ actor: "agent" }, "filing.submitted", set.id, { payloadSha256: set.payloadSha256, selector });
    return `submitted the filing set ${set.payloadSha256.slice(0, 12)}`;
  }

  private async confirmedSet(matterId: string, steps: 1 | 2) {
    const set = (await this.matters.store(matterId)).work.filingSet();
    if (!set) throw new MatterStoreError("NO_FILING_SET", "the advocate has not approved a filing set");
    for (let s = 1; s <= steps; s++) {
      const c = set.confirmations.find((x) => x.step === s);
      if (!c || c.payloadSha256 !== set.payloadSha256) {
        throw new MatterStoreError("FILING_NOT_CONFIRMED", `confirmation ${s} of the filing set ${set.payloadSha256.slice(0, 12)} is missing. Only the advocate confirms.`);
      }
    }
    return set;
  }

  /** The page now shown, saved as a PDF source with capture method filing_receipt. */
  async saveReceipt(matterId: string): Promise<string> {
    const wc = this.contents();
    const pdf = await wc.printToPDF({});
    const dir = path.join(tmpdir(), "openadvo-capture", randomUUID());
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `Portal receipt ${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`);
    try {
      await writeFile(file, pdf);
      const [result] = await this.matters.addFiles(matterId, [file], { actor: "agent" });
      if (!result.source) throw new MatterStoreError("RECEIPT_NOT_SAVED", result.reason ?? result.outcome);
      const store = await this.matters.store(matterId);
      const set = store.work.filingSet();
      store.work.addCapture(result.source.id, "filing_receipt", wc.getURL(), { filingSetId: set?.id ?? null, payloadSha256: set?.payloadSha256 ?? null }, { actor: "agent" });
      return result.source.name;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Tests only (OPENADVO_TEST=1): run a script in the portal page, as the advocate's hand would. */
  evaluateForTest(code: string): Promise<unknown> {
    return this.contents().executeJavaScript(code);
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}
