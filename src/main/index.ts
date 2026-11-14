/**
 * Electron main process: the window, the bridge handlers, the matter store and the agent.
 */
import { Menu, app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Matters } from "./matters.ts";
import { Agent, findSource } from "./agent.ts";
import { RecordTables } from "./record-table.ts";
import { allWorkflows, parseCustom, remove as removeWorkflow, upsert as upsertWorkflow } from "../lib/workflows/index.ts";
import { Ingest } from "./ingest.ts";
import { Drafts } from "./drafts.ts";
import { EditorHost, registerEditorScheme, EO_ORIGIN } from "./editor-host.ts";
import { euroOfficePaths, platformKey } from "../lib/euro-office/platform.ts";
import { Research } from "./research.ts";
import { Filing } from "./filing.ts";
import { KeyFileSigner } from "./signing.ts";
import { Progress } from "./progress.ts";
import { ArgumentStudio, ResearchHub, type SourceName } from "./studio.ts";
import { researchLog, studioTools } from "./studio-tools.ts";
import { ensureFindIndex, listMatterFiles } from "./audit.ts";
import { setFetcher } from "../lib/research-sources/http.ts";
import type { ResearchSettings } from "../shared/studio.ts";
import { Portal, portalOptionsFromEnv } from "./portal.ts";
import { Mail, type MailAccount } from "./mail.ts";
import { agentWorkHost } from "./agent-work.ts";
import { searchCitationIndex, ulosPaths, type UlosPaths } from "../lib/ulos/index.ts";
import { transcribe, voiceAvailable } from "../lib/voice/index.ts";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AgentWorkHost } from "./agent.ts";
import type { ChatEvent } from "../shared/api.ts";
import type { DraftKind } from "../shared/records.ts";

// Tests and the proof run may point the application at separate folders.
if (process.env.OPENADVO_USER_DATA) app.setPath("userData", path.resolve(process.env.OPENADVO_USER_DATA));

const here = import.meta.dirname;
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const rendererFile = path.join(here, "../renderer/index.html");

registerEditorScheme();

let window: BrowserWindow | null = null;
let editorHost: EditorHost;
let matters: Matters;
let agent: Agent;
let ingest: Ingest;
let drafts: Drafts;
let research: Research;
let filing: Filing;
let portal: Portal;
let mail: Mail;
let ulos: UlosPaths;
let workHost: AgentWorkHost;
let recordTables: RecordTables;
let signer: KeyFileSigner | null = null;
let progress: Progress;
let hub: ResearchHub;
let studio: ArgumentStudio;

/** Steps 6 to 10 notify the window that a matter changed (a capture, a proposal). */
function matterChanged(matterId: string): void {
  window?.webContents.send("ingest:update", matterId);
}

/** The IMAP account: host, port and user in settings; the password encrypted with safeStorage (decision 9). */
function mailSecretFile(): string {
  return path.join(app.getPath("userData"), "mail-secret.bin");
}

function mattersRoot(): string {
  if (process.env.OPENADVO_HOME) return path.resolve(process.env.OPENADVO_HOME);
  return path.join(app.getPath("documents"), "Open Advocate", "Matters");
}

/** Only our own renderer page may call the bridge. */
function trusted(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (rendererDevUrl && url.startsWith(rendererDevUrl)) return true;
  return url === pathToFileURL(rendererFile).href;
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error(`refused: ${channel} from an untrusted page`);
    try {
      return await fn(...(args as A));
    } catch (e) {
      await recordRefusal(args[0], "advocate", channel, e);
      throw e;
    }
  });
}

/** V5-2: a refused request about a matter is kept in that matter's refusal table. */
async function recordRefusal(matterId: unknown, actor: string, action: string, e: unknown): Promise<void> {
  const code = (e as { code?: string }).code ?? /^([A-Z][A-Z_]{3,})\b/.exec((e as Error).message ?? "")?.[1];
  if (!code || typeof matterId !== "string" || !matters) return;
  try {
    if (!(await matters.list()).some((m) => m.id === matterId)) return;
    (await matters.store(matterId)).refuse(actor, action, code, String((e as Error).message ?? e));
  } catch {
    // The refusal record is best effort; the original error still reaches the caller.
  }
}

function emitChat(event: ChatEvent): void {
  window?.webContents.send("chat:event", event);
}

function workflowsFile(): string {
  return path.join(app.getPath("userData"), "workflows.json");
}

function customWorkflows() {
  try {
    return parseCustom(JSON.parse(readFileSync(workflowsFile(), "utf8")));
  } catch {
    return [];
  }
}

function saveWorkflows(list: ReturnType<typeof customWorkflows>) {
  mkdirSync(path.dirname(workflowsFile()), { recursive: true });
  writeFileSync(workflowsFile(), JSON.stringify(list, null, 2));
  return allWorkflows(list);
}

function registerBridge(): void {
  handle("matters:list", () => matters.list());
  // V1-10: rename and archive (human-only).
  handle("matters:rename", (matterId: string, title: string) => matters.rename(matterId, String(title ?? "")));
  handle("matters:archive", (matterId: string, archived: boolean) => matters.setArchived(matterId, archived === true));
  // V1-1: a new conversation.
  handle("chat:new", (matterId: string) => agent.newConversation(matterId));
  // V1-3: matter memory (human-only write).
  handle("memory:get", (matterId: string) => matters.memory(matterId));
  handle("memory:set", (matterId: string, text: string) => matters.setMemory(matterId, String(text ?? "")));
  // V1-4: workflows.
  handle("workflows:list", () => allWorkflows(customWorkflows()));
  handle("workflows:save", (input: { id?: string; title: string; body: string }) => saveWorkflows(upsertWorkflow(customWorkflows(), input)));
  handle("workflows:delete", (id: string) => saveWorkflows(removeWorkflow(customWorkflows(), String(id))));
  // V1-5: the record table. Columns and decisions are human-only.
  handle("records:get", (matterId: string) => recordTables.table(matterId));
  handle("records:addColumn", (matterId: string, question: string) => recordTables.addColumn(matterId, String(question ?? "")));
  handle("records:decide", (matterId: string, sourceId: string, columnId: string, decision: string) => {
    if (decision !== "confirm" && decision !== "clear") throw new Error("BAD_DECISION: confirm or clear");
    return recordTables.decide(matterId, sourceId, columnId, decision);
  });
  // V2 (docs/specs/v2.md). Every write here is human-only.
  handle("sources:setType", (matterId: string, sourceId: string, type: string) => matters.setSourceType(matterId, sourceId, String(type)));
  handle("duplicates:list", (matterId: string) => matters.listDuplicates(matterId));
  handle("duplicates:decide", (matterId: string, reviewItemId: string, decision: string) => {
    if (decision !== "same" && decision !== "different") throw new Error("BAD_DECISION: same or different");
    return matters.decideDuplicate(matterId, reviewItemId, decision);
  });
  handle("lod:getRows", (matterId: string) => matters.lodRows(matterId));
  handle("lod:setRows", (matterId: string, ids: unknown) => matters.setLodRows(matterId, Array.isArray(ids) ? ids.map(String) : []));
  handle("memory:proposals", (matterId: string) => matters.listMemoryProposals(matterId));
  handle("memory:decideProposal", (matterId: string, id: string, accept: boolean) => matters.decideMemoryProposal(matterId, String(id), accept === true));
  handle("signing:fingerprint", () => (signer ? signer.fingerprint() : null));
  // V3-4: settings and facts about the application.
  handle("app:info", () => appInfo());
  handle("appearance:get", () => appearance());
  handle("appearance:set", (mode: string) => {
    if (!["system", "light", "dark"].includes(mode)) throw new Error("BAD_APPEARANCE: system, light or dark");
    writeSetting("appearance", mode);
    return mode;
  });
  // V3-5: the advocate chooses where the export goes.
  handle("matters:export", async (matterId: string) => {
    if (!window) throw new Error("NO_WINDOW");
    const title = (await matters.title(matterId)).replace(/[\\/:*?"<>|]+/g, " ").trim() || "matter";
    const r = await dialog.showSaveDialog(window, { title: "Export matter", defaultPath: `${title} ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
    if (r.canceled || !r.filePath) return null;
    return matters.exportMatter(matterId, r.filePath, (digest) => (signer ? { signature: signer.sign(digest), publicKey: signer.publicKey() } : null));
  });
  // V4: the Research and Argument Studio. Decisions are human-only.
  handle("studio:get", (matterId: string) => studio.state(matterId));
  handle("studio:log", (matterId: string) => researchLog(matters, matterId));
  handle("studio:search", (matterId: string, source: string, query: string, opts: Record<string, unknown>) =>
    hub.search(matterId, sourceName(source), String(query ?? ""), { from: Number(opts?.from) || undefined, to: Number(opts?.to) || undefined, limit: Number(opts?.limit) || 25 }),
  );
  handle("studio:read", (matterId: string, source: string, ref: string) => hub.read(matterId, sourceName(source), String(ref ?? "")));
  handle("studio:saveJudgment", (matterId: string, ref: string, input: Record<string, unknown>) =>
    hub.saveJudgment(matterId, String(ref), { paragraph: String(input?.paragraph ?? ""), proposition: String(input?.proposition ?? ""), role: String(input?.role ?? "other"), issueId: input?.issueId ? String(input.issueId) : null }, { actor: "advocate" }),
  );
  handle("studio:saveProvision", (matterId: string, ref: string) => hub.saveProvision(matterId, String(ref), { actor: "advocate" }));
  handle("studio:decideProvision", async (matterId: string, id: string, decision: string) => {
    if (decision !== "adopted" && decision !== "rejected") throw new Error("BAD_DECISION: adopted or rejected");
    return (await matters.store(matterId)).studio.decideProvision(String(id), decision, { actor: "advocate" });
  });
  handle("studio:start", (matterId: string, issueId: string, opts: Record<string, unknown>) => studio.start(matterId, String(issueId), { rounds: Number(opts?.rounds) || undefined, generators: Number(opts?.generators) || undefined }));
  handle("studio:decideArgument", async (matterId: string, id: string, decision: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return (await matters.store(matterId)).studio.decideArgument(String(id), decision, { actor: "advocate" });
  });
  handle("studio:toGrounds", async (matterId: string, id: string) => {
    const a = (await matters.store(matterId)).studio.argument(String(id));
    if (!a) throw new Error("ARGUMENT_NOT_FOUND");
    if (a.status !== "accepted") throw new Error("ARGUMENT_NOT_ACCEPTED: accept the argument first");
    const r = await workHost.proposeParagraph(matterId, { kind: "grounds", after: null, text: `${a.claim} ${a.reasoning}`, reason: "Argument accepted in the Studio" }, "");
    return r.text;
  });
  handle("studio:weakPoints", (matterId: string) => studio.weakPoints(matterId));
  handle("corpus:parts", () => hub.parts());
  handle("corpus:indexSc", (years: unknown) => hub.indexSupremeCourt(Array.isArray(years) ? years.map(Number).filter(Number.isFinite) : []));
  handle("corpus:highCourts", (year: number) => hub.highCourts(Number(year)));
  handle("corpus:indexHc", (code: string, year: number) => hub.indexHighCourt(String(code), Number(year)));
  handle("research:getSettings", () => researchSettings());
  handle("research:setSettings", (s: Record<string, unknown>) => {
    const next: ResearchSettings = { aws: s?.aws !== false, indiaCode: s?.indiaCode !== false, web: s?.web !== false };
    writeSetting("researchSources", next);
    return next;
  });
  // V5-1 to V5-5: record chain, refusals, Inspector, Find, Files, Jobs.
  handle("audit:verifyChain", async (matterId: string) => (await matters.store(matterId)).verifyChain());
  handle("audit:refusals", async (matterId: string) => (await matters.store(matterId)).refusals());
  handle("audit:inspect", async (matterId: string, id: string) => (await matters.store(matterId)).inspect(String(id)));
  handle("find:query", async (matterId: string, q: string) => {
    await ensureFindIndex(matters, matterId);
    return (await matters.store(matterId)).find(String(q ?? ""), 40);
  });
  handle("files:list", async (matterId: string) => listMatterFiles((await matters.store(matterId)).folder));
  handle("files:open", async (matterId: string, rel: string) => {
    const folder = (await matters.store(matterId)).folder;
    const target = path.resolve(folder, String(rel ?? ""));
    if (!target.startsWith(path.resolve(folder) + path.sep)) throw new Error("PATH_OUTSIDE_MATTER");
    const err = await shell.openPath(target);
    if (err) throw new Error(`OPEN_FAILED: ${err}`);
    return true;
  });
  handle("jobs:list", async (matterId: string) => {
    const store = await matters.store(matterId);
    return {
      reading: store.listJobs().map((j) => ({ ...j, name: store.getSource(j.sourceId)?.name ?? j.sourceId })),
      runs: store.studio.runs(),
      running: studio.runningRun(matterId),
      indexing: hub.indexingNow(),
    };
  });
  handle("studio:stop", (matterId: string) => studio.stop(matterId));
  // V3-1 and V3-2: reads only.
  handle("progress:get", (matterId: string) => progress.progress(matterId));
  handle("inbox:get", (matterId: string) => progress.inbox(matterId));
  // V3-3: the command bar's line search (the same search as the agent's search_sources).
  handle("sources:search", (matterId: string, query: string) => matters.searchLines(matterId, String(query ?? ""), 50));
  handle("matters:create", (title: string) => matters.create(String(title ?? "")));
  handle("matters:open", async (matterId: string) => {
    const sources = await matters.openMatter(matterId);
    ingest.enqueue(matterId);
    return sources;
  });
  handle("sources:list", (matterId: string) => matters.listSources(matterId));
  handle("sources:origins", (matterId: string, sourceId: string) => matters.listOrigins(matterId, sourceId));
  handle("sources:add", (matterId: string, paths: unknown) => {
    const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    return matters.addFiles(matterId, list, { actor: "advocate" }).then((results) => {
      ingest.enqueue(matterId);
      return results;
    });
  });
  handle("events:list", (matterId: string) => matters.listEvents(matterId));
  handle("ingest:jobs", (matterId: string) => matters.listJobs(matterId));
  handle("sources:pages", (matterId: string, sourceId: string) => matters.listPages(matterId, sourceId));
  handle("review:list", (matterId: string) => matters.listReviewItems(matterId));
  // Human-only actions (decision 5): bridge functions, never agent tools.
  handle("review:resolve", (matterId: string, itemId: string) => matters.decideReviewItem(matterId, itemId, "resolved"));
  handle("review:skip", (matterId: string, itemId: string) => matters.decideReviewItem(matterId, itemId, "skipped"));
  handle("notebook:get", (matterId: string) => matters.notebook(matterId));
  for (const decision of ["confirmed", "rejected", "excluded", "included"] as const) {
    handle(`notebook:${decision}`, (matterId: string, eventId: string) => matters.decideEvent(matterId, eventId, decision));
  }
  handle("notebook:resolveConflict", (matterId: string, conflictId: string, resolution: string) => matters.resolveConflict(matterId, conflictId, resolution));
  handle("view:openSource", async (matterId: string, sourceId: string) => {
    const file = await matters.sourceFile(matterId, sourceId);
    return editorHost.open(file.path, file.name, "pdf", true);
  });
  handle("view:close", async (token: string) => {
    editorHost.close(String(token ?? ""));
    await drafts.closeWorkingCopy(String(token ?? ""));
  });
  // Step 4: drafts and revisions. The store is reached only through main/matters.ts.
  handle("drafts:list", (matterId: string) => drafts.list(matterId));
  handle("drafts:getRevision", (matterId: string, revisionId: string) => drafts.revisionDetail(matterId, revisionId));
  handle("drafts:paragraphSource", (matterId: string, draftId: string, anchor: string) => drafts.paragraphSource(matterId, draftId, anchor));
  handle("drafts:generateListOfDates", (matterId: string) => drafts.generate(matterId, "list_of_dates" satisfies DraftKind));
  handle("drafts:generateSynopsis", (matterId: string) => drafts.generate(matterId, "synopsis" satisfies DraftKind));
  handle("drafts:openRevision", (matterId: string, revisionId: string) => drafts.openInEditor(matterId, revisionId));
  handle("drafts:insertFromNotebook", (matterId: string, draftId: string, eventId: string) =>
    drafts.insertFromNotebook(matterId, draftId, eventId),
  );
  // Human-only actions (decision 5): the advocate saves and approves a revision.
  handle("drafts:saveRevision", (matterId: string, draftId: string, bytes: unknown, baseRevisionId: string) => {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer | number[]);
    if (raw.length === 0) throw new Error("DOC_SAVE_FAILED: the editor sent no bytes");
    return drafts.saveRevision(matterId, draftId, raw, baseRevisionId);
  });
  handle("drafts:check", (matterId: string, draftId: string) => drafts.check(matterId, String(draftId ?? "")));
  handle("drafts:agentChanges", (matterId: string) => drafts.agentChanges(matterId));
  // Human-only (decision 5): keep or undo agent changes. Never an agent tool.
  handle("drafts:decideAgentChanges", (matterId: string, draftId: string, baseRevisionId: string, decisions: unknown) => {
    if (!Array.isArray(decisions)) throw new Error("BAD_DECISION: a list of decisions is needed");
    const clean = decisions.map((d: { anchor?: unknown; decision?: unknown }) => {
      if (d?.decision !== "keep" && d?.decision !== "undo") throw new Error("BAD_DECISION: keep or undo");
      return { anchor: String(d.anchor ?? ""), decision: d.decision as "keep" | "undo" };
    });
    return drafts.decideAgentChanges(matterId, String(draftId ?? ""), String(baseRevisionId ?? ""), clean);
  });
  handle("drafts:approveRevision", (matterId: string, revisionId: string) => drafts.approveRevision(matterId, revisionId));
  handle("drafts:generate", (matterId: string, kind: string) => {
    if (!["questions_of_law", "grounds", "petition", "conference", "condonation"].includes(kind)) throw new Error("BAD_DRAFT_KIND: questions_of_law, grounds, petition, conference or condonation");
    return drafts.generate(matterId, kind as DraftKind);
  });

  // Steps 6 and 7: research and legal review. Decisions are human-only bridge functions (decision 5).
  handle("research:get", (matterId: string) => research.state(matterId));
  handle("research:addIssue", (matterId: string, text: string) => research.addIssue(matterId, String(text ?? "")));
  handle("research:decideIssue", (matterId: string, id: string, decision: string, reason: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return research.decideIssue(matterId, String(id), decision, String(reason ?? ""));
  });
  handle("research:addAuthority", (matterId: string, input: Record<string, unknown>) =>
    research.addAuthority(matterId, {
      citation: String(input?.citation ?? ""),
      parties: String(input?.parties ?? ""),
      decisionDate: String(input?.decisionDate ?? ""),
      paragraph: String(input?.paragraph ?? ""),
      proposition: String(input?.proposition ?? ""),
      role: String(input?.role ?? "") as "supporting",
      issueId: input?.issueId ? String(input.issueId) : null,
    }),
  );
  handle("research:decideAuthority", (matterId: string, id: string, decision: string) => {
    if (decision !== "adopted" && decision !== "rejected") throw new Error("BAD_DECISION: adopted or rejected");
    return research.decideAuthority(matterId, String(id), decision);
  });
  handle("research:checkCitations", async (matterId: string, draftId: string | null) => {
    const out = await research.checkCitations(matterId, draftId ? String(draftId) : undefined);
    matterChanged(matterId);
    return out;
  });
  handle("research:attestCitation", (matterId: string, citation: string, reason: string) => research.attestCitation(matterId, String(citation ?? ""), String(reason ?? "")));
  handle("research:adverseReview", (matterId: string, outcome: string, coverage: string, note: string) =>
    research.recordAdverseReview(matterId, outcome as "none_found", String(coverage ?? ""), String(note ?? "")),
  );
  handle("research:searchIndex", (query: string) => searchCitationIndex(ulos, String(query ?? ""), 20));

  // Step 8: filing preparation. The approval for filing is human-only.
  handle("filing:get", (matterId: string) => filing.state(matterId));
  handle("filing:setDetails", (matterId: string, input: Record<string, unknown>) =>
    filing.setDetails(matterId, {
      ...(input?.petitioner !== undefined ? { petitioner: String(input.petitioner) } : {}),
      ...(input?.respondent !== undefined ? { respondent: String(input.respondent) } : {}),
      ...(input?.caseNumber !== undefined ? { caseNumber: String(input.caseNumber) } : {}),
      ...(input?.cnr !== undefined ? { cnr: String(input.cnr) } : {}),
      ...(input?.court !== undefined ? { court: String(input.court) } : {}),
      ...(input?.interimRelief !== undefined ? { interimRelief: String(input.interimRelief) } : {}),
      ...(input?.impugnedEventId !== undefined ? { impugnedEventId: input.impugnedEventId ? String(input.impugnedEventId) : null } : {}),
    }),
  );
  handle("filing:setAnnexures", (matterId: string, items: unknown) => {
    const list = Array.isArray(items) ? items.map((x: { sourceId?: unknown; title?: unknown }) => ({ sourceId: String(x?.sourceId ?? ""), title: String(x?.title ?? "") })) : [];
    return filing.setAnnexures(matterId, list);
  });
  handle("filing:computeLimitation", (matterId: string) => filing.computeLimitation(matterId));
  handle("filing:confirmLimitation", (matterId: string, id: string) => filing.confirmLimitation(matterId, String(id ?? "")));
  handle("filing:approve", (matterId: string) => filing.approveForFiling(matterId));
  handle("filing:verifyManifest", (matterId: string) => filing.verifyManifest(matterId));
  handle("filing:confirm", (matterId: string, filingSetId: string, payloadSha256: string, step: number) => {
    if (step !== 1 && step !== 2) throw new Error("BAD_STEP: 1 or 2");
    return filing.confirmFiling(matterId, String(filingSetId ?? ""), String(payloadSha256 ?? ""), step);
  });
  handle("filing:reveal", async (matterId: string) => {
    const set = (await filing.state(matterId)).filingSet;
    if (set) shell.showItemInFolder(path.join(set.folder, "manifest.json"));
  });

  // Step 10: voice. The transcript is text for the composer only; voice confirms nothing.
  handle("voice:status", () => voiceAvailable(resourcesRoot()));
  handle("voice:transcribe", (samples: unknown) => {
    const s = samples instanceof Float32Array ? samples : new Float32Array(samples as ArrayBuffer);
    if (s.length > 16_000 * 120) throw new Error("VOICE_TOO_LONG: at most two minutes at a time");
    return transcribe(resourcesRoot(), s);
  });

  // Step 9: court record capture and client email.
  handle("capture:openPortal", (matterId: string) => portal.open(matterId));
  handle("mail:importEml", async (matterId: string) => {
    if (!window) return { messages: 0, attachments: [] };
    const r = await dialog.showOpenDialog(window, { title: "Import saved email messages", properties: ["openFile", "multiSelections"], filters: [{ name: "Email message", extensions: ["eml"] }] });
    if (r.canceled) return { messages: 0, attachments: [] };
    const out = await mail.importEmlFiles(matterId, r.filePaths);
    ingest.enqueue(matterId);
    return out;
  });
  handle("mail:getAccount", () => {
    const a = readSettings().mail as MailAccount | undefined;
    return a ? { ...a, hasPassword: existsSync(mailSecretFile()) } : null;
  });
  handle("mail:setAccount", (account: Record<string, unknown>, password: string) => {
    const a: MailAccount = { host: String(account?.host ?? ""), port: Number(account?.port ?? 993), secure: account?.secure !== false, user: String(account?.user ?? "") };
    if (!a.host || !a.user) throw new Error("MAIL_ACCOUNT_INCOMPLETE: host and user are needed");
    writeSetting("mail", a);
    if (password) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("SECRET_STORE_UNAVAILABLE: the operating system's secret store is not available");
      writeFileSync(mailSecretFile(), safeStorage.encryptString(String(password)));
    }
    return { ...a, hasPassword: existsSync(mailSecretFile()) };
  });
  handle("mail:fetch", async (matterId: string, filter: Record<string, unknown>) => {
    const a = readSettings().mail as MailAccount | undefined;
    if (!a || !existsSync(mailSecretFile())) throw new Error("MAIL_ACCOUNT_MISSING: set the authorised mailbox first");
    const password = safeStorage.decryptString(readFileSync(mailSecretFile()));
    const out = await mail.importFromImap(matterId, a, password, {
      from: filter?.from ? String(filter.from) : undefined,
      subject: filter?.subject ? String(filter.subject) : undefined,
      since: filter?.since ? String(filter.since) : undefined,
    });
    ingest.enqueue(matterId);
    return out;
  });
  handle("dialog:pickFiles", async () => {
    if (!window) return [];
    const result = await dialog.showOpenDialog(window, {
      title: "Add PDF files to the matter",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Documents", extensions: ["pdf", "docx", "txt", "png", "jpg", "jpeg"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle("chat:get", (matterId: string) => agent.getChat(matterId));
  handle("models:list", () => agent.listModels());
  handle("models:get", () => agent.currentModel());
  handle("models:set", (key: string) => agent.setModel(String(key ?? "")));
  handle("effort:get", () => agent.getEffort());
  handle("effort:set", (level: string) => agent.setEffort(String(level ?? "")));
  handle("chat:send", (matterId: string, text: string) => {
    // The turn runs in the background; progress arrives as chat events.
    void agent.send(matterId, String(text ?? ""));
  });
}

/** The height of our title bar. The renderer's bar and the window controls use the same value. */
const TITLE_BAR_HEIGHT = 40;

function createWindow(): void {
  // No File, Edit, View, Window bar. macOS keeps the menus that carry its standard shortcuts.
  Menu.setApplicationMenu(
    process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null,
  );
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Open Advocate",
    show: false,
    // One title bar of our own: the renderer draws it, the system draws only the window controls over it.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#ffffff", symbolColor: "#1c1c1c", height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  // The editor frame may move only within its own origin (WD-078).
  window.webContents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame) return;
    if (event.url.startsWith(`${EO_ORIGIN}/`) || event.url === "about:blank") return;
    event.preventDefault();
  });
  window.once("ready-to-show", () => window?.show());
  if (rendererDevUrl) void window.loadURL(rendererDevUrl);
  else void window.loadFile(rendererFile);
  window.on("closed", () => {
    window = null;
  });
}

/** V4-1: which research sources may be reached. Each is on until the advocate turns it off. */
function researchSettings(): ResearchSettings {
  const r = (readSettings().researchSources ?? {}) as Partial<ResearchSettings>;
  return { aws: r.aws !== false, indiaCode: r.indiaCode !== false, web: r.web !== false };
}

const SOURCES: SourceName[] = ["aws_sc", "aws_hc", "indiacode", "web"];
function sourceName(s: unknown): SourceName {
  if (!SOURCES.includes(s as SourceName)) throw new Error(`BAD_SOURCE: one of ${SOURCES.join(", ")}`);
  return s as SourceName;
}

/** V3-4: the appearance the advocate chose. */
function appearance(): "system" | "light" | "dark" {
  const a = readSettings().appearance;
  return a === "light" || a === "dark" ? a : "system";
}

function lockFact(file: string, pick: (j: Record<string, unknown>) => string): string {
  try {
    return pick(JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>);
  } catch {
    return "not installed";
  }
}

/** V3-4: versions and folders, for the Settings page. */
function appInfo() {
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    euroOffice: lockFact(path.join(euroOfficeRoot(), "vendor.lock.json"), (j) => String(j.tag ?? "unknown")),
    validator: lockFact(path.join(resourcesRoot(), "ulos", platformKey(), "vendor.lock.json"), (j) => `copied ${String(j.copiedAt ?? "unknown").slice(0, 10)}`),
    folders: { matters: matters.root, userData: app.getPath("userData") },
    signingKey: signer ? signer.fingerprint() : null,
  };
}

/** Non-secret application settings in the user data folder. */
function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeSetting(key: string, value: unknown): void {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), [key]: value }, null, 2));
}

function exposeTestHooks(): void {
  // Read-only hooks for the Playwright tests. Present only when OPENADVO_TEST=1.
  if (process.env.OPENADVO_TEST !== "1") return;
  (globalThis as Record<string, unknown>).__openadvoTest = {
    agentToolNames: (matterId: string) => agent.toolNames(matterId),
    agentSessionId: (matterId: string) => agent.sessionId(matterId),
    mattersRoot: () => matters.root,
    ingestIdle: () => ingest.idle(),
    // Stands in for the agent's propose_correction tool, so a test needs no model.
    proposeCorrection: (matterId: string, input: { draftId: string; anchor: string; expected: string; replacement: string; reason: string }) =>
      drafts.proposeCorrection(matterId, input),
    // The same functions the agent's step 6 to 10 tools call, so tests need no model.
    work: () => workHost,
    // The agent's fill_record_cell, so a test needs no model.
    fillRecordCell: (matterId: string, input: { source: string; column: string; answer: string; quote: string; page: number; line: number }) =>
      recordTables.fillByAgent(matterId, input, "", findSource),
    readMemoryAsAgent: (matterId: string) => matters.memory(matterId),
    // The agent's propose_memory_note (V2-8), so a test needs no model.
    proposeMemoryAsAgent: (matterId: string, text: string, reason: string) => matters.proposeMemory(matterId, text, reason),
    // V4: answer the research sources' requests from fixtures (url substring → body), so tests need no network.
    setResearchFixtures: (fixtures: Array<{ match: string; body: string; type?: string; status?: number; base64?: boolean }>) => {
      setFetcher(async (url, init) => {
        const f = fixtures.find((x) => url.includes(x.match));
        if (!f) return new Response("not in the fixtures", { status: 404 });
        const bytes = f.base64 ? Buffer.from(f.body, "base64") : Buffer.from(f.body);
        const range = init?.headers?.range ? /bytes=(\d+)-(\d+)?/.exec(init.headers.range) : null;
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) + 1 : bytes.length;
          return new Response(bytes.subarray(start, end), { status: 206, headers: { "content-range": `bytes ${start}-${end - 1}/${bytes.length}`, "content-type": f.type ?? "application/octet-stream" } });
        }
        return new Response(bytes, { status: f.status ?? 200, headers: { "content-type": f.type ?? "text/plain" } });
      });
      return true;
    },
    // V4-3: the loop with a scripted model (labels to answers), so tests need no model.
    runStudioScripted: async (matterId: string, issueId: string, script: Array<{ match: string; answer: string }>) => {
      const fake = new ArgumentStudio(matters, async () => ({ model: "test/scripted", complete: async (_s: string, user: string) => script.find((x) => user.includes(x.match))?.answer ?? "{}" }), (id) => window?.webContents.send("studio:changed", id));
      await fake.start(matterId, issueId, { rounds: 1, generators: 2 });
      await fake.idle(matterId);
      return (await matters.store(matterId)).studio.runs().at(-1);
    },
    studioTool: (matterId: string, tool: string, params: Record<string, unknown>) => studioTools(hub, studio, matters)(matterId, tool, params, ""),
    importEml: async (matterId: string, paths: string[]) => {
      const out = await mail.importEmlFiles(matterId, paths);
      ingest.enqueue(matterId);
      return out;
    },
    portalContentsUrl: () => (portal.isOpen() ? "open" : "closed"),
    portalEval: (code: string) => portal.evaluateForTest(code),
  };
}

function resourcesRoot(): string {
  return process.env.OPENADVO_RESOURCES ? path.resolve(process.env.OPENADVO_RESOURCES) : path.join(app.getAppPath(), "resources");
}

function euroOfficeRoot(): string {
  if (process.env.OPENADVO_EO_ROOT) return path.resolve(process.env.OPENADVO_EO_ROOT);
  return path.join(app.getAppPath(), "resources", "euro-office", platformKey());
}

app.whenReady().then(() => {
  editorHost = new EditorHost({
    eoRoot: euroOfficeRoot(),
    hostDir: path.join(app.getAppPath(), "src", "editor-host"),
    fontDataDir: path.join(app.getPath("userData"), "euro-office-fonts"),
    logFile: path.join(app.getPath("userData"), "logs", "editor-host.log"),
  });
  editorHost.register();
  matters = new Matters(mattersRoot());
  const workingRoot = path.join(app.getPath("userData"), "draft-work");
  mkdirSync(workingRoot, { recursive: true });
  ulos = ulosPaths(resourcesRoot());
  research = new Research(matters, ulos);
  drafts = new Drafts(matters, {
    x2t: euroOfficePaths(euroOfficeRoot()).x2t,
    workingRoot,
    openInEditor: (file, name, kind, readOnly, meta) => editorHost.open(file, name, kind, readOnly, meta),
    legalBlockers: (id, draftId, revisionId) => research.legalBlockers(id, draftId, revisionId),
  });
  signer = KeyFileSigner.create(path.join(app.getPath("userData"), "manifest-signing.key"));
  filing = new Filing(matters, euroOfficePaths(euroOfficeRoot()).x2t, signer);
  progress = new Progress(matters, filing, research, drafts);
  mail = new Mail(matters);
  portal = new Portal(
    matters,
    portalOptionsFromEnv((matterId, detail) => {
      ingest.enqueue(matterId);
      matterChanged(matterId);
      emitChat({ matterId, event: { type: "CUSTOM", name: "openadvo.chat_message", value: { id: randomUUID(), role: "notice", text: `Captured from the court portal: ${detail.name} (${detail.outcome}).` }, timestamp: Date.now() } as never });
    }),
  );
  workHost = agentWorkHost({ matters, research, drafts, portal, ulos });
  // V4: the Research and Argument Studio.
  hub = new ResearchHub(matters, path.join(app.getPath("userData"), "corpus"), researchSettings, (text) => window?.webContents.send("studio:progress", text));
  studio = new ArgumentStudio(matters, () => agent.completer(), (id) => window?.webContents.send("studio:changed", id));
  recordTables = new RecordTables(matters);
  agent = new Agent(
    {
      listSources: (id) => matters.listSources(id),
      listPages: (id, sourceId, from, to) => matters.listPages(id, sourceId, from, to),
      searchLines: (id, query, limit) => matters.searchLines(id, query, limit),
      notebook: (id) => matters.notebook(id),
      drafts: (id, kind) => drafts.readDrafts(id, kind),
      paragraphSource: (id, anchor) => drafts.paragraphSourceAnywhere(id, anchor),
      checkDraft: (id, draftId) => drafts.check(id, draftId),
      proposeCorrection: (id, input, sessionId) => drafts.proposeCorrection(id, input, sessionId),
      work: workHost,
      matterTitle: (id) => matters.title(id),
      recordSession: (id, sessionId, model) => matters.recordAgentSession(id, sessionId, model),
      emit: emitChat,
      loadModelKey: () => {
        const v = readSettings().model;
        return typeof v === "string" && v ? v : null;
      },
      saveModelKey: (key) => writeSetting("model", key),
      loadEffort: () => {
        const v = readSettings().effort;
        return typeof v === "string" && v ? v : null;
      },
      saveEffort: (level) => writeSetting("effort", level),
      chatDir: (id) => matters.chatDir(id),
      readMemory: (id) => matters.memory(id),
      proposeMemory: async (id, text, reason, sessionId) => (await matters.proposeMemory(id, text, reason, sessionId)).id,
      recordTable: (id) => recordTables.describe(id),
      fillRecordCell: (id, input, sessionId) => recordTables.fillByAgent(id, input, sessionId, findSource),
      studio: (id, tool, params, sessionId) => studioTools(hub, studio, matters)(id, tool, params, sessionId),
    },
    { agentDir: path.join(app.getPath("userData"), "pi-agent"), model: process.env.OPENADVO_MODEL || undefined },
  );
  ingest = new Ingest(matters, (matterId) => window?.webContents.send("ingest:update", matterId));
  registerBridge();
  exposeTestHooks();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  void agent?.disposeAll();
  matters?.closeAll();
});
