/**
 * The IPC bridge: one named function per renderer action. This module is kept out of index.ts so
 * the start-up file only wires the application; every handler validates its arguments and calls
 * a main-process module.
 */
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { app, BrowserWindow, dialog, safeStorage, shell } from "electron";
import type { Matters } from "./matters.ts";
import type { Agent, AgentWorkHost } from "./agent.ts";
import type { PiExtensions } from "./pi-extensions.ts";
import type { RecordTables } from "./record-table.ts";
import type { ArgumentStudio, ResearchHub, SourceName } from "./studio.ts";
import type { Research } from "./research.ts";
import type { Drafts } from "./drafts.ts";
import type { Filing } from "./filing.ts";
import type { Portal } from "./portal.ts";
import type { Library } from "./library.ts";
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import type { IntelStore } from "../lib/intel-store/index.ts";
import type { CourtIntel } from "./court-intel.ts";
import type { Contacts } from "../lib/contacts/index.ts";
import type { Progress } from "./progress.ts";
import type { MatterProposals } from "./matter-proposals.ts";
import type { PracticePacks } from "./packs.ts";
import type { SkillRegistry } from "./skills.ts";
import type { SkillImport } from "./skill-import.ts";
import type { Ingest } from "./ingest.ts";
import type { Mail } from "./mail.ts";
import type { KeyFileSigner } from "./signing.ts";
import type { ResearchSettings } from "../shared/studio.ts";
import type { Browser } from "./browser.ts";
import type { EditorHost } from "./editor-host.ts";
import type { Integrations } from "./integrations.ts";
import type { UlosPaths } from "../lib/ulos/index.ts";
import type { RetrieveOptions } from "../lib/knowledge/index.ts";
import type { DraftKind } from "../shared/records.ts";
import type { MailAccount } from "./mail.ts";
import type { JurisdictionReport } from "../shared/evidence.ts";
import type { BrowserBounds, CaseListProposal } from "../shared/browser.ts";
import type { StorageProvider } from "../lib/storage/index.ts";
import type { ModelRole } from "./index.ts";
import { DRAFT_KINDS } from "../shared/records.ts";
import { catalogue as draftsCatalogue } from "./drafts.ts";
import { CATALOGUE } from "../lib/drafting/documents.ts";
import { allWorkflows, remove as removeWorkflow, upsert as upsertWorkflow } from "../lib/workflows/index.ts";
import { NEVER_IN_A_SKILL, HUMAN_ONLY_PATTERN } from "../lib/skills/roles.ts";
import { cleanPolicy } from "./tool-policy.ts";
import { searchCitationIndex } from "../lib/ulos/index.ts";
import { applyDateAnchor, eventsFromDecidedLine } from "./notebook.ts";
import { caseNumberConflicts, extractEntities } from "../lib/notebook/entities.ts";
import { detectMediaType } from "../lib/document-intelligence/formats.ts";
import { renderPagePng } from "../lib/document-intelligence/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { diffParagraphs } from "../lib/filing/v5.ts";
import { docket, questionsDocument, diagnosticsEntries, diagnosticsZip } from "./practice.ts";
import { responseProposal } from "../lib/triggers/index.ts";
import { detectStorageFolders, insideRoot, storageReady } from "../lib/storage/index.ts";
import { proposeClassification } from "../lib/classification/index.ts";
import { testAgent } from "../lib/builders/index.ts";
import { buildTimeline, detectContradictions, detectRelatedMatters, templatesFor } from "../lib/evidence/index.ts";
import { extractPages, markDocument, mergeDocuments, reorderDocument, splitDocument } from "./document-ops.ts";
import { transcribe, voiceAvailable } from "../lib/voice/index.ts";
import { researchLog } from "./studio-tools.ts";
import { ensureFindIndex, listMatterFiles } from "./audit.ts";

export type Handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) => void;

export interface BridgeDeps {
  matters: Matters;
  agent: Agent;
  piExtensions: () => PiExtensions;
  recordTables: RecordTables;
  studio: ArgumentStudio;
  hub: ResearchHub;
  research: Research;
  drafts: Drafts;
  filing: Filing;
  portal: Portal;
  library: Library;
  advocateStore: AdvocateStore;
  intelStore: IntelStore;
  courtIntel: CourtIntel;
  contacts: Contacts;
  progress: Progress;
  proposals: MatterProposals;
  practicePacks: PracticePacks;
  skillRegistry: SkillRegistry;
  skillImporter: SkillImport;
  ingest: Ingest;
  mail: Mail;
  signer: KeyFileSigner | null;
  researchSettings: () => ResearchSettings;
  sourceName: (s: unknown) => SourceName;
  emitChat: (event: import("../shared/api.ts").ChatEvent) => void;
  browser: Browser;
  editorHost: EditorHost;
  integrations: Integrations;
  ulos: UlosPaths;
  workHost: AgentWorkHost;
  readSettings: typeof import("./index.ts").readSettings;
  writeSetting: typeof import("./index.ts").writeSetting;
  appInfo: typeof import("./index.ts").appInfo;
  appearance: typeof import("./index.ts").appearance;
  customWorkflows: typeof import("./index.ts").customWorkflows;
  saveWorkflows: typeof import("./index.ts").saveWorkflows;
  policyTools: typeof import("./index.ts").policyTools;
  fireTrigger: typeof import("./index.ts").fireTrigger;
  matterChanged: typeof import("./index.ts").matterChanged;
  createMatterFromFields: typeof import("./index.ts").createMatterFromFields;
  resourcesRoot: typeof import("./index.ts").resourcesRoot;
  enrolmentFile: typeof import("./index.ts").enrolmentFile;
  enrolmentState: typeof import("./index.ts").enrolmentState;
  mailSecretFile: typeof import("./index.ts").mailSecretFile;
  roleModels: typeof import("./index.ts").roleModels;
  MODEL_ROLES: typeof import("./index.ts").MODEL_ROLES;
}

export function registerBridge(handle: Handle, deps: BridgeDeps): void {
  const { matters, agent, piExtensions, recordTables, studio, hub, research, drafts, filing, portal, library, advocateStore, intelStore, courtIntel, contacts, progress, proposals, practicePacks, skillRegistry, skillImporter, ingest, mail, signer, researchSettings, sourceName, emitChat, browser, editorHost, integrations, ulos, workHost, readSettings, writeSetting, appInfo, appearance, customWorkflows, saveWorkflows, policyTools, fireTrigger, matterChanged, createMatterFromFields, resourcesRoot, enrolmentFile, enrolmentState, mailSecretFile, roleModels, MODEL_ROLES } = deps;
  const mainWindow = () => BrowserWindow.getAllWindows()[0] ?? null;
  handle("matters:list", () => matters.list());
  // V1-10: rename and archive (human-only).
  handle("matters:rename", (matterId: string, title: string) => matters.rename(matterId, String(title ?? "")));
  handle("matters:archive", (matterId: string, archived: boolean) => matters.setArchived(matterId, archived === true));
  // V1-1: a new conversation.
  handle("chat:new", (matterId: string) => agent.newConversation(matterId));
  handle("chat:conversations", (matterId: string) => agent.listConversations(matterId));
  handle("chat:switch", (matterId: string, conversationId: string) => agent.switchConversation(matterId, String(conversationId)));
  handle("chat:rename", (matterId: string, conversationId: string, title: string) => agent.renameConversation(matterId, String(conversationId), String(title)));
  // V1-3: matter memory (human-only write).
  handle("memory:get", (matterId: string) => matters.memory(matterId));
  handle("memory:set", (matterId: string, text: string) => matters.setMemory(matterId, String(text ?? "")));
  // V1-4: workflows.
  handle("extensions:list", () => piExtensions().list());
  handle("extensions:add", async (source: string) => {
    const list = await piExtensions().add(String(source));
    await agent.reloadIdle();
    return list;
  });
  handle("extensions:remove", async (source: string) => {
    const list = await piExtensions().remove(String(source));
    await agent.reloadIdle();
    return list;
  });
  handle("extensions:setEnabled", async (input: { id: string; enabled: boolean }) => {
    const list = piExtensions().setEnabled(String(input.id), Boolean(input.enabled));
    await agent.reloadIdle();
    return list;
  });
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
  // V2 (docs/archive/2026-11-15/specs/v2.md). Every write here is human-only.
  handle("sources:setType", async (matterId: string, sourceId: string, type: string) => {
    const out = await matters.setSourceType(matterId, sourceId, String(type));
    if (/order|judgment/i.test(String(type))) fireTrigger(String(matterId), "order", `${String(type)}: ${String(sourceId)}`);
    if (/notification|amendment|circular/i.test(String(type))) fireTrigger(String(matterId), "amendment", `${String(type)}: ${String(sourceId)}`);
    return out;
  });
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
    if (!mainWindow()) throw new Error("NO_WINDOW");
    const title = (await matters.title(matterId)).replace(/[\\/:*?"<>|]+/g, " ").trim() || "matter";
    const r = await dialog.showSaveDialog(mainWindow()!, { title: "Export matter", defaultPath: `${title} ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
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
    const out = (await matters.store(matterId)).studio.decideArgument(String(id), decision, { actor: "advocate" });
    // The write goes through the store, so the Studio views hear about it here.
    mainWindow()?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:toGrounds", async (matterId: string, id: string) => {
    const a = (await matters.store(matterId)).studio.argument(String(id));
    if (!a) throw new Error("ARGUMENT_NOT_FOUND");
    if (a.status !== "accepted") throw new Error("ARGUMENT_NOT_ACCEPTED: accept the argument first");
    const r = await workHost.proposeParagraph(matterId, { kind: "grounds", after: null, text: `${a.claim} ${a.reasoning}`, reason: "Argument accepted in the Studio" }, "");
    return r.text;
  });
  handle("studio:weakPoints", (matterId: string) => studio.weakPoints(matterId));
  // Phase 7 (K4, K5): the case theories and the dissent panel. Decisions are the advocate's.
  handle("studio:addTheory", async (matterId: string, input: Record<string, unknown>) => {
    const out = await (await matters.store(matterId)).studio.addTheory(
      {
        title: String(input?.title ?? ""),
        statement: String(input?.statement ?? ""),
        issueIds: Array.isArray(input?.issueIds) ? (input.issueIds as unknown[]).map(String) : [],
        burden: String(input?.burden ?? ""),
        standard: String(input?.standard ?? ""),
      },
      { actor: "advocate" },
    );
    mainWindow()?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:decideTheory", async (matterId: string, id: string, decision: string, reason: string) => {
    if (decision !== "primary" && decision !== "alternative" && decision !== "rejected") throw new Error("BAD_DECISION: primary, alternative or rejected");
    const out = await (await matters.store(matterId)).studio.decideTheory(String(id), decision, String(reason ?? ""), { actor: "advocate" });
    mainWindow()?.webContents.send("studio:changed", matterId);
    return out;
  });
  handle("studio:askDissent", (matterId: string, question: string) => studio.askDissent(matterId, String(question ?? "")));
  handle("knowledge:search", (matterId: string, query: string, opts: Record<string, unknown>) => hub.searchKnowledge(matterId || null, String(query ?? ""), (opts ?? {}) as RetrieveOptions));
  handle("knowledge:health", (matterId: string) => hub.knowledgeHealth(matterId || null));
  handle("knowledge:loadFirstWave", () => hub.loadLawFirstWave());
  handle("knowledge:indexJudgment", (_matterId: string, ref: string) => hub.indexJudgment(String(ref)));
  handle("knowledge:saveProvision", (matterId: string, provisionId: string) => hub.saveLawProvision(matterId, String(provisionId)));
  handle("knowledge:plans", async (matterId: string) => (await matters.store(matterId)).researchPlans.list());
  handle("knowledge:decidePlan", async (matterId: string, id: string, decision: string) => (await matters.store(matterId)).researchPlans.decide(String(id), decision === "stopped" ? "stopped" : "approved", { actor: "advocate" }));
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
  // V5-19 to V5-25: hearings, reminders, policy and usage, Stop, parties and contacts, docket, questions, diagnostics.
  handle("hearings:list", async (matterId: string) => (await matters.store(matterId)).hearings());
  handle("hearings:add", async (matterId: string, h: Record<string, unknown>) => {
    const hearing = await (await matters.store(matterId)).addHearing(
      { date: String(h?.date ?? ""), bench: String(h?.bench ?? ""), directions: String(h?.directions ?? ""), nextDate: String(h?.nextDate ?? ""), nextDateStatus: h?.nextDateStatus === "inferred" ? "inferred" : "confirmed", notes: String(h?.notes ?? "") },
      { actor: "advocate" },
    );
    fireTrigger(matterId, "hearing_date", `${hearing.date} ${hearing.bench}`);
    return hearing;
  });
  handle("reminders:list", async (matterId: string) => (await matters.store(matterId)).reminders());
  handle("reminders:add", async (matterId: string, text: string, dueAt: string) => (await matters.store(matterId)).addReminder(String(text ?? ""), String(dueAt ?? ""), { actor: "advocate" }));
  handle("reminders:done", async (matterId: string, id: string) => {
    (await matters.store(matterId)).setReminderStatus(String(id), "done", { actor: "advocate" });
    return (await matters.store(matterId)).reminders();
  });
  // Phase 7 (K8): the compliance tasks a hearing's directions need.
  handle("tasks:list", async (matterId: string) => (await matters.store(matterId)).taskProposals());
  handle("tasks:add", async (matterId: string, hearingId: string, text: string, dueAt: string) =>
    (await matters.store(matterId)).proposeTask({ hearingId: String(hearingId ?? ""), text: String(text ?? ""), dueAt: dueAt ? String(dueAt) : undefined }, { actor: "advocate" }),
  );
  handle("tasks:decide", async (matterId: string, id: string, accept: boolean) => (await matters.store(matterId)).decideTask(String(id ?? ""), accept === true, { actor: "advocate" }));
  // Phase 7 (K9): the cross-examination plan.
  handle("cross:list", async (matterId: string) => (await matters.store(matterId)).crossQuestions());
  handle("cross:propose", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(matterId)).proposeCrossQuestion(
      {
        witness: String(input?.witness ?? ""),
        question: String(input?.question ?? ""),
        targetKind: input?.targetKind === "contradiction" ? "contradiction" : "evidence",
        targetId: String(input?.targetId ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("cross:decide", async (matterId: string, id: string, decision: string) => {
    if (decision !== "accepted" && decision !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return (await matters.store(matterId)).decideCrossQuestion(String(id ?? ""), decision, { actor: "advocate" });
  });
  handle("policy:get", async (matterId: string) => {
    const store = await matters.store(matterId);
    return { ...store.policy(), usage: store.usage() };
  });
  handle("policy:set", async (matterId: string, p: Record<string, unknown>) => {
    const store = await matters.store(matterId);
    store.setPolicy({ confidential: p?.confidential === true, budgetTokens: p?.budgetTokens == null || p.budgetTokens === "" ? null : Number(p.budgetTokens) }, { actor: "advocate" });
    return { ...store.policy(), usage: store.usage() };
  });
  handle("chat:stop", (matterId: string) => agent.stop(matterId));
  // O10, human-only: a Firm Agent handoff was taken to its matter, or dismissed.
  handle("firm:close-handoff", (id: string) => agent.closeFirmHandoff(String(id ?? "")));
  // Native harness parts: the plan (clear is human-only) and Compact now.
  handle("chat:clear-plan", (id: string) => agent.clearPlan(String(id ?? "")));
  handle("chat:compact", (id: string) => agent.compact(String(id ?? "")));
  // The matter's cost as CSV text; the window saves it from the matter page.
  handle("cost:csv", (matterId: string) => agent.costCsv(String(matterId ?? "")));
  // Helpers (native-harness-parts section 3): Stop, Steer and "Use results" are the advocate's.
  handle("helpers:stop", (id: string, helperId: string) => agent.stopHelper(String(id ?? ""), String(helperId ?? "")));
  handle("helpers:steer", (id: string, helperId: string, text: string) => agent.steerHelper(String(id ?? ""), String(helperId ?? ""), String(text ?? "")));
  handle("helpers:use-results", (id: string) => agent.useHelperResults(String(id ?? "")));
  // Settings: how strongly the agent is asked to keep a plan (native-harness-parts section 4).
  handle("plan:strength:get", () => (readSettings().planStrength === "most" ? "most" : "long"));
  handle("plan:strength:set", (value: unknown) => {
    const v = value === "most" ? "most" : "long";
    writeSetting("planStrength", v);
    return v;
  });
  // Settings → Tool permissions (native-harness-parts section 2). The file is checked on write.
  handle("tool-policy:get", () => ({ policy: agent.policyStore().read(), tools: policyTools(), partyRule: readSettings().partyRule !== false }));
  handle("tool-policy:set", (policy: unknown, partyRule: unknown) => {
    if (typeof partyRule === "boolean") writeSetting("partyRule", partyRule);
    return { policy: agent.policyStore().write(cleanPolicy(policy)), tools: policyTools(), partyRule: readSettings().partyRule !== false };
  });
  handle("chat:answer-question", (matterId: string, questionId: unknown, answer: unknown) => {
    if (typeof questionId !== "string" || !questionId) throw new Error("BAD_REQUEST: a question id is required");
    if (answer !== null && typeof answer !== "string" && typeof answer !== "boolean") throw new Error("BAD_REQUEST: the answer is a string, true or false, or null");
    return agent.answerQuestion(matterId, questionId, answer);
  });
  handle("contacts:list", () => contacts.list());
  handle("contacts:add", (c: Record<string, unknown>) => contacts.add({ name: String(c?.name ?? ""), kind: String(c?.kind ?? "client"), email: String(c?.email ?? ""), phone: String(c?.phone ?? ""), notes: String(c?.notes ?? "") }));
  handle("contacts:remove", (id: string) => contacts.remove(String(id)));
  handle("parties:list", async (matterId: string) => {
    const all = contacts.list();
    return (await matters.store(matterId)).parties().map((p) => ({ ...p, contact: all.find((c) => c.id === p.contactId) ?? null }));
  });
  handle("parties:add", async (matterId: string, contactId: string, role: string, nameInRecord: string, counsel?: string) => {
    if (!contacts.list().some((c) => c.id === contactId)) throw new Error("CONTACT_NOT_FOUND");
    return (await matters.store(matterId)).addParty(String(contactId), String(role ?? "party"), String(nameInRecord ?? ""), { actor: "advocate" }, String(counsel ?? ""));
  });
  handle("docket:list", () => docket(matters, progress));
  handle("questions:generate", async (matterId: string) => {
    const r = await questionsDocument(matters, matterId, progress);
    if (process.env.OPENADVO_TEST !== "1") await shell.openPath(r.file);
    return r;
  });
  handle("diag:preview", async () => diagnosticsEntries(appInfo(), readSettings(), (await matters.list()).length).map((e) => ({ name: e.name, description: e.description, bytes: e.bytes.length })));
  handle("diag:write", async () => {
    if (!mainWindow()) throw new Error("NO_WINDOW");
    const r = await dialog.showSaveDialog(mainWindow()!, { title: "Save the diagnostics file", defaultPath: `Open Advocate diagnostics ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
    if (r.canceled || !r.filePath) return null;
    const zip = diagnosticsZip(diagnosticsEntries(appInfo(), readSettings(), (await matters.list()).length));
    writeFileSync(r.filePath, zip);
    return { path: r.filePath, bytes: zip.length };
  });
  // V5-13: compare revisions; open a revision in Word and bring the edited copy back.
  handle("drafts:revisions", async (matterId: string, draftId: string) => (await matters.store(matterId)).listRevisions(String(draftId)));
  handle("drafts:compare", async (matterId: string, a: string, b: string) => {
    const store = await matters.store(matterId);
    const para = async (id: string) => readParagraphs(await store.revisionBytes(id)).map((x) => x.text).filter((t) => t.trim());
    return diffParagraphs(await para(String(a)), await para(String(b)));
  });
  handle("drafts:openInWord", async (matterId: string, revisionId: string) => {
    const store = await matters.store(matterId);
    const rev = store.getRevision(String(revisionId));
    const draft = store.getDraft(rev.draftId);
    const dir = path.join(app.getPath("userData"), "word", matterId);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${draft.title.replace(/[\\/:*?"<>|]+/g, " ").trim()} r${rev.seq}.docx`);
    writeFileSync(file, await store.revisionBytes(rev.id));
    store.appendEvent({ actor: "advocate" }, "revision.opened_in_word", rev.id, { file: path.basename(file) });
    if (process.env.OPENADVO_TEST !== "1") {
      const err = await shell.openPath(file);
      if (err) throw new Error(`OPEN_FAILED: ${err}`);
    }
    return { file, revisionId: rev.id };
  });
  handle("drafts:importFromWord", async (matterId: string, revisionId: string, filePath?: string) => {
    const store = await matters.store(matterId);
    const rev = store.getRevision(String(revisionId));
    let file = filePath ? String(filePath) : "";
    if (!file) {
      if (!mainWindow()) throw new Error("NO_WINDOW");
      const r = await dialog.showOpenDialog(mainWindow()!, { title: "Bring back the edited copy", properties: ["openFile"], filters: [{ name: "Word document", extensions: ["docx"] }] });
      if (r.canceled || !r.filePaths[0]) return null;
      file = r.filePaths[0];
    }
    const bytes = readFileSync(file);
    if (detectMediaType(bytes, file) !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") throw new Error("NOT_DOCX: the file is not a Word document");
    const saved = await store.saveRevision(rev.draftId, Buffer.from(bytes), rev.id, { actor: "advocate" });
    store.appendEvent({ actor: "advocate" }, "revision.imported_from_word", saved.id, { base: rev.id, file: path.basename(file) });
    return saved;
  });
  // V5-18: the portal result after an uncertain submission.
  handle("filing:result", (matterId: string) => portal.resultState(matterId));
  handle("filing:reconcile", (matterId: string, outcome: string, diary: string) => {
    if (outcome !== "submitted" && outcome !== "not_submitted") throw new Error("BAD_OUTCOME: submitted or not_submitted");
    return portal.reconcile(matterId, outcome, String(diary ?? ""));
  });
  // V5-9 to V5-12: quick check, assessments, treatments, rehearsal, trends. Confirmations are the advocate's.
  handle("studio:quickCheck", (matterId: string) => hub.quickCheck(matterId));
  handle("studio:trends", () => hub.trends());
  handle("studio:assess", async (matterId: string, authorityId: string, field: string, value: string, basis: string) =>
    (await matters.store(matterId)).studio.assessAuthority(String(authorityId), field === "voice" ? "voice" : "support", String(value), String(basis ?? ""), { actor: "advocate" }),
  );
  handle("studio:addTreatment", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(matterId)).studio.addTreatment(
      {
        authorityId: String(input?.authorityId ?? ""),
        kind: String(input?.kind ?? "") as never,
        byCitation: String(input?.byCitation ?? ""),
        byDate: String(input?.byDate ?? ""),
        byBench: Number(input?.byBench) || null,
        authorityDate: String(input?.authorityDate ?? ""),
        authorityBench: Number(input?.authorityBench) || null,
        note: String(input?.note ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("studio:rehearse", (matterId: string) => studio.rehearse(matterId));
  handle("studio:decideChallenge", async (matterId: string, id: string, status: string) => {
    if (status !== "accepted" && status !== "rejected") throw new Error("BAD_DECISION: accepted or rejected");
    return (await matters.store(matterId)).studio.decideChallenge(String(id), status, { actor: "advocate" });
  });
  // V5-6 to V5-8: entities, corrections, date anchors, OCR disputes. Decisions are human-only.
  handle("notebook:entities", async (matterId: string) => {
    const store = await matters.store(matterId);
    const lines = store.listSources().flatMap((s) => store.sourceLines(s.id).map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text })));
    const entities = extractEntities(lines);
    return { entities, conflicts: caseNumberConflicts(entities) };
  });
  handle("notebook:correctEvent", async (matterId: string, eventId: string, input: Record<string, unknown>, reason: string) => {
    (await matters.store(matterId)).correctEvent(String(eventId), { dateStart: String(input?.dateStart ?? ""), dateEnd: String(input?.dateEnd ?? ""), description: String(input?.description ?? "") }, String(reason ?? ""), { actor: "advocate" });
    return matters.notebook(matterId);
  });
  handle("notebook:setDateAnchor", async (matterId: string, sourceId: string, date: string) => {
    (await matters.store(matterId)).setDateAnchor(String(sourceId), String(date), { actor: "advocate" });
    const added = await applyDateAnchor(matters, matterId, String(sourceId));
    return { added, notebook: await matters.notebook(matterId) };
  });
  handle("ocr:disputes", async (matterId: string, sourceId?: string) => (await matters.store(matterId)).disputes(sourceId ? String(sourceId) : undefined));
  handle("ocr:decide", async (matterId: string, id: string, choice: string, typed: string) => {
    if (choice !== "a" && choice !== "b" && choice !== "typed") throw new Error("BAD_CHOICE: a, b or typed");
    const d = (await matters.store(matterId)).decideDispute(String(id), choice, String(typed ?? ""), { actor: "advocate" });
    const added = await eventsFromDecidedLine(matters, matterId, d);
    return { dispute: d, added };
  });
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
  handle("notebook:status", (matterId: string) => matters.notebookStatus(matterId));
  handle("notebook:rebuild", (matterId: string) => matters.rebuildNotebook(matterId));
  handle("sources:pageImage", async (matterId: string, sourceId: string, page: number, scale?: number) => {
    const store = await matters.store(String(matterId));
    const source = store.getSource(String(sourceId));
    if (!source) throw new Error(`SOURCE_NOT_FOUND: ${String(sourceId)}`);
    if (source.mediaType !== "application/pdf") throw new Error("NOT_A_PDF: only a PDF has page images");
    const bytes = new Uint8Array(await store.readBlob(source.sha256));
    const png = await renderPagePng(bytes, Math.max(1, Math.floor(Number(page) || 1)), Math.max(0.75, Math.min(Number(scale) || 1.5, 4)));
    return `data:image/png;base64,${png.toString("base64")}`;
  });
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
  // Human-only (decision 5): keep or undo agent changes. Never an agent tool. An undo may carry
  // the advocate's reason (A7): the second identical reason proposes a preference.
  handle("drafts:decideAgentChanges", (matterId: string, draftId: string, baseRevisionId: string, decisions: unknown) => {
    if (!Array.isArray(decisions)) throw new Error("BAD_DECISION: a list of decisions is needed");
    const clean = decisions.map((d: { anchor?: unknown; decision?: unknown; reason?: unknown }) => {
      if (d?.decision !== "keep" && d?.decision !== "undo") throw new Error("BAD_DECISION: keep or undo");
      return { anchor: String(d.anchor ?? ""), decision: d.decision as "keep" | "undo", reason: typeof d.reason === "string" ? d.reason : undefined };
    });
    return drafts.decideAgentChanges(matterId, String(draftId ?? ""), String(baseRevisionId ?? ""), clean);
  });
  handle("drafts:approveRevision", (matterId: string, revisionId: string) => drafts.approveRevision(matterId, revisionId));
  handle("drafts:generate", (matterId: string, kind: string) => {
    if (!(DRAFT_KINDS as readonly string[]).includes(kind)) throw new Error("BAD_DRAFT_KIND");
    return drafts.generate(matterId, kind as DraftKind);
  });
  handle("drafts:catalogue", () => draftsCatalogue());
  handle("drafts:compareRevisionWithPdf", (matterId: string, revisionId: string) =>
    drafts.compareRevisionToPdf(matterId, String(revisionId ?? "")).then((r) => ({ ok: r.ok, missing: r.missing, extra: r.extra })),
  );

  // Steps 6 and 7: research and legal review. Decisions are human-only bridge functions (decision 5).
  handle("research:get", (matterId: string) => research.state(matterId));
  handle("memo:docx", async (matterId: string, memoId: string) => {
    const file = await matters.ensureMemoDocx(String(matterId), String(memoId));
    const error = await shell.openPath(file);
    if (error) throw new Error(`MEMO_DOCX_OPEN: ${error}`);
    return file;
  });
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
    if (out.some((c) => c.outcome === "failed" || c.outcome === "unresolved")) fireTrigger(String(matterId), "citation_change", `${out.filter((c) => c.outcome !== "verified" && c.outcome !== "not_applicable").length} citation(s) changed or unresolved`);
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
      ...(input?.victimProtected !== undefined ? { victimProtected: input.victimProtected === true } : {}),
      ...(Array.isArray(input?.victimNames) ? { victimNames: (input.victimNames as unknown[]).map(String) } : {}),
      ...(input?.copyApplied !== undefined ? { copyApplied: String(input.copyApplied) } : {}),
      ...(input?.copyReceived !== undefined ? { copyReceived: String(input.copyReceived) } : {}),
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
  // Phase 3 (S10): the built-in browser. The pane owns the layout; the main process owns the tabs.
  handle("browser:state", () => browser.state());
  handle("browser:open", (url?: string, options?: { agent?: boolean; activate?: boolean }) => browser.open(url ? String(url) : undefined, { agent: options?.agent === true, activate: options?.activate !== false }));
  handle("browser:close", (id: string) => browser.close(String(id)));
  handle("browser:activate", (id: string) => browser.activate(String(id)));
  handle("browser:navigate", (id: string, url: string) => browser.navigate(String(id), String(url)));
  handle("browser:back", (id: string) => browser.back(String(id)));
  handle("browser:forward", (id: string) => browser.forward(String(id)));
  handle("browser:reload", (id: string) => browser.reload(String(id)));
  handle("browser:stop", (id: string) => browser.stop(String(id)));
  handle("browser:setBounds", (bounds: BrowserBounds) => browser.setBounds(bounds));
  handle("browser:setVisible", (visible: boolean) => browser.setVisible(visible === true));
  handle("browser:setMatter", (matterId: string | null) => browser.setMatter(matterId ? String(matterId) : null));
  handle("browser:bookmarks", () => browser.listBookmarks());
  handle("browser:toggleBookmark", (id: string) => browser.toggleBookmark(String(id)));
  handle("browser:removeBookmark", (id: string) => browser.removeBookmark(String(id)));
  handle("browser:openBookmark", (id: string) => browser.openBookmark(String(id)));
  handle("browser:history", () => browser.historyList());
  handle("browser:clearHistory", () => browser.clearHistory());
  handle("browser:proposeCaseList", async () => browser.proposeCaseList((await agent.completer())?.complete ?? null));
  handle("browser:createMatters", async (cases: CaseListProposal[]) => {
    if (!Array.isArray(cases)) throw new Error("BAD_CASES: a list of proposals is needed");
    const out: { created: number; matterIds: string[]; refused: string[] } = { created: 0, matterIds: [], refused: [] };
    for (const c of cases.slice(0, 100)) {
      try {
        const m = await createMatterFromFields({
          title: String(c?.title ?? ""),
          petitioner: String(c?.petitioner ?? ""),
          respondent: String(c?.respondent ?? ""),
          cnr: String(c?.cnr ?? ""),
          court: String(c?.court ?? ""),
          stage: String(c?.stage ?? ""),
          nextDate: String(c?.nextDate ?? ""),
          sourceUrl: String(c?.sourceUrl ?? ""),
        });
        out.matterIds.push(m.id);
      } catch (e) {
        out.refused.push(`${String((c as { title?: unknown })?.title ?? "a case")}: ${(e as Error).message}`);
      }
    }
    out.created = out.matterIds.length;
    return out;
  });
  // C2: the agent's proposal waits for the advocate.
  handle("proposals:list", () => proposals.list());
  handle("proposals:create", async (id: string) => {
    const p = proposals.get(String(id));
    if (!p) throw new Error(`NOT_FOUND: no matter proposal ${String(id)}`);
    if (p.status !== "open") throw new Error(`NOT_OPEN: the proposal is ${p.status}`);
    const m = await createMatterFromFields({ title: p.title, cnr: p.cnr, court: p.court, petitioner: p.petitioner, respondent: p.respondent, stage: p.stage, nextDate: p.nextDate, sourceUrl: `a chat proposal (${p.reason})` });
    proposals.setStatus(p.id, "created");
    return m;
  });
  handle("proposals:dismiss", (id: string) => {
    proposals.setStatus(String(id), "dismissed");
    return proposals.list();
  });
  // Phase 4: facts, evidence, structure, relations, the graph and timelines.
  handle("evidence:facts", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.facts(filter ?? {}));
  handle("evidence:addFact", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.addFact(
      {
        text: String(input?.text ?? ""),
        type: String(input?.type ?? "fact"),
        sourceId: input?.sourceId ? String(input.sourceId) : null,
        anchorId: input?.anchorId ? String(input.anchorId) : null,
        page: input?.page == null ? null : Number(input.page),
        line: input?.line == null ? null : Number(input.line),
        eventId: input?.eventId ? String(input.eventId) : null,
        date: String(input?.date ?? ""),
        amount: String(input?.amount ?? ""),
        parties: Array.isArray(input?.parties) ? (input.parties as unknown[]).map(String) : [],
        relief: String(input?.relief ?? ""),
        method: "advocate",
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:decideFact", async (matterId: string, id: string, status: string) => {
    if (status !== "confirmed" && status !== "disputed" && status !== "rejected") throw new Error("BAD_STATUS: confirmed, disputed or rejected");
    return (await matters.store(String(matterId))).evidence.decideFact(String(id), status, { actor: "advocate" });
  });
  handle("evidence:supersedeFact", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.supersedeFact(
      String(id),
      {
        text: String(input?.text ?? ""),
        type: input?.type ? String(input.type) : undefined,
        date: input?.date ? String(input.date) : undefined,
        amount: input?.amount ? String(input.amount) : undefined,
        parties: Array.isArray(input?.parties) ? (input.parties as unknown[]).map(String) : undefined,
        relief: input?.relief ? String(input.relief) : undefined,
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:linkFact", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.linkFact(
      String(id),
      {
        issueIds: Array.isArray(input?.issueIds) ? (input.issueIds as unknown[]).map(String) : undefined,
        argumentIds: Array.isArray(input?.argumentIds) ? (input.argumentIds as unknown[]).map(String) : undefined,
        relief: input?.relief !== undefined ? String(input.relief) : undefined,
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:contradictions", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const nb = await matters.notebook(String(matterId));
    return detectContradictions(store.evidence.facts(), nb.events.map((e) => ({ id: e.id, dateStart: e.dateStart, description: e.description, sourceId: e.sourceId, page: e.page, line: e.line })));
  });
  handle("evidence:list", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.evidenceList(filter ?? {}));
  handle("evidence:add", async (matterId: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.addEvidence(
      {
        sourceId: String(input?.sourceId ?? ""),
        exhibitNumber: String(input?.exhibitNumber ?? ""),
        witness: String(input?.witness ?? ""),
        statement: String(input?.statement ?? ""),
        givenBy: String(input?.givenBy ?? ""),
        givenAt: String(input?.givenAt ?? ""),
        electronic: input?.electronic === true,
        device: String(input?.device ?? ""),
        admissibility: String(input?.admissibility ?? ""),
        notes: String(input?.notes ?? ""),
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:update", async (matterId: string, id: string, input: Record<string, unknown>) =>
    (await matters.store(String(matterId))).evidence.updateEvidence(
      String(id),
      {
        ...(input?.exhibitNumber !== undefined ? { exhibitNumber: String(input.exhibitNumber) } : {}),
        ...(input?.witness !== undefined ? { witness: String(input.witness) } : {}),
        ...(input?.statement !== undefined ? { statement: String(input.statement) } : {}),
        ...(input?.givenBy !== undefined ? { givenBy: String(input.givenBy) } : {}),
        ...(input?.givenAt !== undefined ? { givenAt: String(input.givenAt) } : {}),
        ...(input?.electronic !== undefined ? { electronic: input.electronic === true } : {}),
        ...(input?.device !== undefined ? { device: String(input.device) } : {}),
        ...(input?.authenticity !== undefined ? { authenticity: String(input.authenticity) as never } : {}),
        ...(input?.admissibility !== undefined ? { admissibility: String(input.admissibility) } : {}),
        ...(input?.notes !== undefined ? { notes: String(input.notes) } : {}),
        ...(input?.status !== undefined ? { status: String(input.status) as never } : {}),
      },
      { actor: "advocate" },
    ),
  );
  handle("evidence:parts", async (matterId: string, sourceId?: string) => (await matters.store(String(matterId))).evidence.parts(sourceId ? String(sourceId) : undefined));
  handle("evidence:relations", async (matterId: string) => (await matters.store(String(matterId))).evidence.relations());
  handle("evidence:decideRelation", async (matterId: string, reviewItemId: string, decision: string) => {
    if (decision !== "same" && decision !== "different") throw new Error("BAD_DECISION: same or different");
    return (await matters.store(String(matterId))).evidence.decideRelation(String(reviewItemId), decision, { actor: "advocate" });
  });
  handle("evidence:edges", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.edges(filter ?? {}));
  handle("evidence:timeline", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const nb = await matters.notebook(String(matterId));
    return buildTimeline(nb.events, store.evidence.facts());
  });
  handle("matter-memory:list", async (matterId: string, filter?: Record<string, string>) => (await matters.store(String(matterId))).evidence.memory(filter ?? {}));
  handle("matter-memory:propose", async (matterId: string, input: Record<string, unknown>) => {
    const memory = (await matters.store(String(matterId))).evidence.proposeMemory(
      {
        type: String(input?.type ?? "fact_from_document"),
        subject: String(input?.subject ?? ""),
        relation: String(input?.relation ?? "is"),
        object: String(input?.object ?? ""),
        sourceId: input?.sourceId ? String(input.sourceId) : null,
        anchorId: input?.anchorId ? String(input.anchorId) : null,
        validFrom: input?.validFrom ? String(input.validFrom) : null,
        validUntil: input?.validUntil ? String(input.validUntil) : null,
        confidence: input?.confidence == null ? null : Number(input.confidence),
        supersedes: input?.supersedes ? String(input.supersedes) : null,
      },
      { actor: "advocate" },
    );
    if (memory.type === "client_instruction") fireTrigger(String(matterId), "instruction", memory.object);
    return memory;
  });
  handle("matter-memory:decide", async (matterId: string, id: string, status: string) => (await matters.store(String(matterId))).evidence.decideMemory(String(id), status as never, { actor: "advocate" }));
  handle("evidence:marks", async (matterId: string, sourceId?: string) => (await matters.store(String(matterId))).evidence.marks(sourceId ? String(sourceId) : undefined));
  handle("docops:list", async (matterId: string) => (await matters.store(String(matterId))).evidence.operations());
  handle("docops:run", async (matterId: string, input: Record<string, unknown>) => {
    const kind = String(input?.kind ?? "");
    if (kind === "extract") return extractPages(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.pages) ? (input.pages as unknown[]).map(Number) : []);
    if (kind === "split") return splitDocument(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.ranges) ? (input.ranges as unknown[]).map((r) => (Array.isArray(r) ? r.map(Number) : [])) : []);
    if (kind === "merge") return mergeDocuments(matters, String(matterId), Array.isArray(input?.sourceIds) ? (input.sourceIds as unknown[]).map(String) : []);
    if (kind === "reorder") return reorderDocument(matters, String(matterId), String(input?.sourceId ?? ""), Array.isArray(input?.order) ? (input.order as unknown[]).map(Number) : []);
    if (kind === "annotate" || kind === "highlight" || kind === "redact") {
      const area = (input?.area ?? {}) as Record<string, unknown>;
      return markDocument(matters, String(matterId), String(input?.sourceId ?? ""), { page: Number(area.page), x: Number(area.x), y: Number(area.y), w: Number(area.w), h: Number(area.h) }, kind);
    }
    throw new Error("BAD_OPERATION: extract, split, merge, reorder, annotate, highlight or redact");
  });
  handle("jurisdiction:get", async (matterId: string) => (await matters.store(String(matterId))).evidence.jurisdiction());
  handle("jurisdiction:set", async (matterId: string, report: JurisdictionReport) => (await matters.store(String(matterId))).evidence.setJurisdiction(report, { actor: "advocate" }));
  handle("jurisdiction:clauses", async (matterId: string) => (await matters.store(String(matterId))).evidence.forumClauses());
  handle("matters:relatedSuggestions", async () => {
    const all = await matters.list();
    const out: Array<{ a: string; b: string; reason: string; basis: string }> = [];
    const fingerprints: Array<{ id: string; title: string; cnr: string; fir: string; parties: string[]; impugnedOrder: string }> = [];
    for (const m of all.filter((x) => !x.archived)) {
      const store = await matters.store(m.id);
      const profile = store.profile();
      const details = store.work.details();
      const nb = await matters.notebook(m.id);
      const impugned = details.impugnedEventId ? nb.events.find((e) => e.id === details.impugnedEventId)?.description ?? "" : "";
      const fir = [m.title, ...store.listSources().map((s) => s.name)].join(" ").match(/\b(?:FIR|F\.I\.R\.?)\s*(?:No\.?)?\s*[A-Z0-9/-]{2,}/i)?.[0] ?? "";
      fingerprints.push({
        id: m.id,
        title: m.title,
        cnr: profile.cnr || details.cnr,
        fir,
        parties: [...store.parties().map((p) => p.nameInRecord), details.petitioner, details.respondent].filter(Boolean),
        impugnedOrder: impugned,
      });
    }
    for (const r of detectRelatedMatters(fingerprints)) out.push(r);
    return out;
  });
  handle("records:templates", async (proceeding: string) => templatesFor(String(proceeding ?? "")));
  handle("records:applyTemplate", async (matterId: string, key: string) => {
    const store = await matters.store(String(matterId));
    const proceeding = store.profile().proceeding || store.profile().caseType;
    const t = templatesFor(proceeding).find((x) => x.key === String(key));
    if (!t) throw new Error(`TEMPLATE_NOT_FOUND: ${String(key)}`);
    for (const q of t.columns) store.work.addRecordColumn(q, { actor: "advocate" });
    return { columns: t.columns.length };
  });
  // Phase 7 (K3): the advocate confirms a proposed element column, or rejects it.
  handle("records:decideColumn", async (matterId: string, columnId: string, decision: string) => {
    if (decision !== "confirmed" && decision !== "rejected") throw new Error("BAD_DECISION: confirmed or rejected");
    return (await matters.store(String(matterId))).work.decideRecordColumn(String(columnId ?? ""), decision, { actor: "advocate" });
  });
  handle("mail:importEml", async (matterId: string) => {
    if (!mainWindow()) return { messages: 0, attachments: [] };
    const r = await dialog.showOpenDialog(mainWindow()!, { title: "Import saved email messages", properties: ["openFile", "multiSelections"], filters: [{ name: "Email message", extensions: ["eml"] }] });
    if (r.canceled) return { messages: 0, attachments: [] };
    const out = await mail.importEmlFiles(matterId, r.filePaths);
    ingest.enqueue(matterId);
    if (out.messages > 0) fireTrigger(String(matterId), "email", `${out.messages} saved message(s) imported`);
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
    if (out.messages > 0) fireTrigger(String(matterId), "email", `${out.messages} message(s) fetched`);
    return out;
  });
  handle("dialog:pickFiles", async () => {
    if (!mainWindow()) return [];
    const result = await dialog.showOpenDialog(mainWindow()!, {
      title: "Add PDF files to the matter",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Documents", extensions: ["pdf", "docx", "txt", "png", "jpg", "jpeg"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle("dialog:pickFolder", async () => {
    if (!mainWindow()) return null;
    const result = await dialog.showOpenDialog(mainWindow()!, { title: "Choose the folder of the matter", properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  // C2, W4: create a matter from a folder, a CNR or an email. The advocate confirms the title.
  handle("intake:folder", async () => {
    if (!mainWindow()) return null;
    const picked = await dialog.showOpenDialog(mainWindow()!, { title: "Choose the folder of the matter", properties: ["openDirectory"] });
    const folder = picked.canceled ? null : picked.filePaths[0];
    if (!folder) return null;
    const m = await matters.create(path.basename(folder));
    const results = await matters.addFolder(m.id, folder);
    ingest.enqueue(m.id);
    return { matter: m, added: results.filter((r) => r.outcome === "added").length, refused: results.filter((r) => r.outcome === "refused").length };
  });
  handle("intake:cnr", async (cnr: string, court: string) => {
    const clean = String(cnr ?? "").trim().toUpperCase();
    if (!clean) throw new Error("CNR_REQUIRED: a CNR is needed");
    if (clean.length > 40) throw new Error("BAD_CNR: the CNR is too long");
    const title = String(court ?? "").trim() ? `${String(court).trim()} — CNR ${clean}` : `CNR ${clean}`;
    const m = await matters.create(title);
    const store = await matters.store(m.id);
    store.setProfile({ cnr: clean, court: String(court ?? "").trim() }, { actor: "advocate" });
    await filing.setDetails(m.id, { cnr: clean, court: String(court ?? "").trim() });
    return m;
  });
  handle("intake:email", async () => {
    if (!mainWindow()) return null;
    const picked = await dialog.showOpenDialog(mainWindow()!, { title: "Choose a saved email message", properties: ["openFile", "multiSelections"], filters: [{ name: "Email message", extensions: ["eml"] }] });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const m = await matters.create(path.basename(picked.filePaths[0], path.extname(picked.filePaths[0])));
    const out = await mail.importEmlFiles(m.id, picked.filePaths);
    ingest.enqueue(m.id);
    return { matter: m, messages: out.messages, attachments: out.attachments.length };
  });
  // C1, C3, C6, C10: the universal matter.
  handle("matter:profile", async (matterId: string) => (await matters.store(String(matterId))).profile());
  handle("matter:setProfile", async (matterId: string, input: Record<string, unknown>) => {
    const store = await matters.store(String(matterId));
    const before = store.profile().stage;
    const out = store.setProfile(
      {
        ...(input?.court !== undefined ? { court: String(input.court) } : {}),
        ...(input?.bench !== undefined ? { bench: String(input.bench) } : {}),
        ...(input?.practiceArea !== undefined ? { practiceArea: String(input.practiceArea) } : {}),
        ...(input?.caseType !== undefined ? { caseType: String(input.caseType) } : {}),
        ...(input?.proceeding !== undefined ? { proceeding: String(input.proceeding) } : {}),
        ...(input?.side !== undefined ? { side: String(input.side) } : {}),
        ...(input?.caseNumber !== undefined ? { caseNumber: String(input.caseNumber) } : {}),
        ...(input?.cnr !== undefined ? { cnr: String(input.cnr) } : {}),
        ...(input?.filingDate !== undefined ? { filingDate: String(input.filingDate) } : {}),
        ...(input?.institutionDate !== undefined ? { institutionDate: String(input.institutionDate) } : {}),
        ...(input?.governingDate !== undefined ? { governingDate: String(input.governingDate) } : {}),
        ...(input?.stage !== undefined ? { stage: String(input.stage) } : {}),
        ...(input?.relief !== undefined ? { relief: String(input.relief) } : {}),
      },
      { actor: "advocate" },
    );
    if (input?.stage !== undefined && out.stage !== before) fireTrigger(String(matterId), "stage_change", out.stage);
    return out;
  });
  handle("matter:classification", async (matterId: string) => {
    const store = await matters.store(String(matterId));
    const profile = store.profile();
    const partyRows = store.parties().map((p) => ({ role: p.role, nameInRecord: p.nameInRecord }));
    const details = store.work.details();
    if (details.petitioner.trim()) partyRows.push({ role: "petitioner", nameInRecord: details.petitioner });
    if (details.respondent.trim()) partyRows.push({ role: "respondent", nameInRecord: details.respondent });
    return proposeClassification({ title: store.matter().title, profile: { ...profile, court: profile.court || details.court, cnr: profile.cnr || details.cnr }, parties: partyRows, sourceNames: store.listSources().map((s) => s.name) });
  });
  handle("matter:applyClassification", async (matterId: string, proposal: Record<string, unknown>) => {
    const store = await matters.store(String(matterId));
    const profile = store.setProfile(
      {
        practiceArea: String(proposal?.practiceArea ?? ""),
        caseType: String(proposal?.caseType ?? ""),
        court: String(proposal?.court ?? ""),
        proceeding: String(proposal?.proceeding ?? ""),
        stage: String(proposal?.stage ?? ""),
      },
      { actor: "advocate" },
    );
    const details = await filing.setDetails(String(matterId), { court: profile.court });
    return { profile, details };
  });
  handle("matter:related", (matterId: string) => matters.relatedFor(String(matterId)));
  handle("matter:addRelated", async (matterId: string, toId: string, relation: string, note: string) => {
    const store = await matters.store(String(matterId));
    if (!(await matters.list()).some((m) => m.id === String(toId))) throw new Error("MATTER_NOT_FOUND: the related matter is not on this computer");
    store.addRelated(String(toId), String(relation) as never, String(note ?? ""), { actor: "advocate" });
    return matters.relatedFor(String(matterId));
  });
  handle("matter:removeRelated", async (matterId: string, toId: string, relation: string) => {
    (await matters.store(String(matterId))).removeRelated(String(toId), String(relation), { actor: "advocate" });
    return matters.relatedFor(String(matterId));
  });
  handle("matter:extend", async (matterId: string, input: { title: string; relation: string; court?: string; proceeding?: string }) => {
    const old = await matters.store(String(matterId));
    const title = String(input?.title ?? "").trim();
    if (!title) throw new Error("TITLE_REQUIRED: the new matter needs a title");
    const m = await matters.create(title);
    const next = await matters.store(m.id);
    next.setProfile({ court: String(input?.court ?? old.profile().court), proceeding: String(input?.proceeding ?? old.profile().proceeding) }, { actor: "advocate" });
    for (const p of old.parties()) next.addParty(p.contactId, p.role, p.nameInRecord, { actor: "advocate" }, p.counsel);
    next.addRelated(String(matterId), String(input?.relation ?? "connected") as never, `Extended from ${old.matter().title}.`, { actor: "advocate" });
    return m;
  });
  handle("advocate:set-enrolment", (number: string, year: string) => {
    const clean = String(number ?? "").replace(/\s+/g, "");
    if (!clean) throw new Error("ENROLMENT_REQUIRED: the enrolment number is empty");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("SECRET_STORE_UNAVAILABLE: the operating system's secret store is not available");
    mkdirSync(path.dirname(enrolmentFile()), { recursive: true });
    writeFileSync(enrolmentFile(), safeStorage.encryptString(clean));
    advocateStore.setProfileField("enrolment_stored", "yes", { actor: "advocate" });
    advocateStore.setProfileField("enrolment_year", String(year ?? ""), { actor: "advocate" });
    return enrolmentState();
  });
  handle("advocate:enrolment-state", () => enrolmentState());
  handle("advocate:clear-enrolment", () => {
    try {
      unlinkSync(enrolmentFile());
    } catch {
      // Already absent.
    }
    advocateStore.setProfileField("enrolment_stored", "", { actor: "advocate" });
    return enrolmentState();
  });
  handle("library:list", (filter?: { q?: string; kind?: string; status?: string }) =>
    library.list(filter).map((item) => ({ ...item, path: library.fileFor(item.id)?.path })),
  );
  handle("library:importFiles", async () => {
    if (!mainWindow()) return { added: 0, duplicates: 0, refused: ["the window is not open"], items: [] };
    const r = await dialog.showOpenDialog(mainWindow()!, { title: "Import files into the Knowledge Library", properties: ["openFile", "multiSelections"], filters: [{ name: "Documents", extensions: ["pdf", "docx", "doc", "odt", "txt", "md", "csv", "xlsx", "pptx", "html", "htm", "eml", "msg", "zip"] }] });
    if (r.canceled) return { added: 0, duplicates: 0, refused: [], items: [] };
    return library.importFiles(r.filePaths);
  });
  handle("library:importFolder", async () => {
    if (!mainWindow()) return { added: 0, duplicates: 0, refused: ["the window is not open"], items: [] };
    const r = await dialog.showOpenDialog(mainWindow()!, { title: "Import a folder into the Knowledge Library", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { added: 0, duplicates: 0, refused: [], items: [] };
    return library.importFolder(r.filePaths[0]);
  });
  handle("library:update", (id: string, input: Record<string, unknown>) =>
    advocateStore.updateLibraryItem(String(id), {
      ...(input?.title !== undefined ? { title: String(input.title) } : {}),
      ...(input?.kind !== undefined ? { kind: String(input.kind) } : {}),
      ...(input?.status !== undefined ? { status: String(input.status) } : {}),
      ...(input?.author !== undefined ? { author: String(input.author) } : {}),
      ...(input?.itemDate !== undefined ? { itemDate: String(input.itemDate) } : {}),
      ...(input?.matterId !== undefined ? { matterId: input.matterId ? String(input.matterId) : null } : {}),
      ...(input?.court !== undefined ? { court: String(input.court) } : {}),
      ...(input?.scope !== undefined ? { scope: String(input.scope) } : {}),
      ...(input?.notes !== undefined ? { notes: String(input.notes) } : {}),
      ...(Array.isArray(input?.tags) ? { tags: (input.tags as unknown[]).map(String) } : {}),
    }, { actor: "advocate" }),
  );
  handle("library:setStatus", (id: string, status: string) => advocateStore.setLibraryStatus(String(id), String(status), { actor: "advocate" }));
  // Phase 10 (F5, G3, M2, M3).
  handle("memory:answer", (matterId: string, question: string) => matters.answerMemory(String(matterId), String(question ?? "")));
  handle("outcomes:list", (matterId: string) => matters.outcomes(String(matterId)));
  handle("outcomes:record", (matterId: string, input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_OUTCOME: an outcome record is needed");
    return matters.recordOutcome(String(matterId), {
      result: String(input.result ?? "") as never,
      subject: String(input.subject ?? ""),
      court: input.court === undefined ? undefined : String(input.court),
      decidedOn: String(input.decidedOn ?? ""),
      sourceId: input.sourceId === undefined || input.sourceId === null ? null : String(input.sourceId),
      summary: input.summary === undefined ? undefined : String(input.summary),
      supersedes: input.supersedes === undefined || input.supersedes === null ? null : String(input.supersedes),
    });
  });
  handle("library:roles", () => library.roles());
  handle("precedents:list", async (matterId: string, limit?: number) => {
    const store = await matters.store(String(matterId));
    const profile = store.profile();
    const details = store.work.details();
    return library.precedents({ court: details.court || profile.court, proceeding: profile.proceeding, practiceArea: profile.practiceArea }, Number(limit) || 3);
  });
  handle("advocate:graph", () => advocateStore.graph());
  handle("advocate:rebuild-graph", async () => advocateStore.rebuildGraph(await matters.allOutcomes(), { actor: "advocate" }));
  handle("advocate:graph-walk", (kind: string, id: string, depth: number) => advocateStore.graphWalk(String(kind) as never, String(id), Number(depth) || 1));
  // Phase 11 (D4): foreign elements and their routes.
  handle("foreign:list", async (matterId: string) => (await matters.store(String(matterId))).foreignElements());
  handle("foreign:add", async (matterId: string, input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_ELEMENT: an element is needed");
    const store = await matters.store(String(matterId));
    return store.proposeForeignElement(
      {
        kind: String(input.kind ?? "") as never,
        subject: String(input.subject ?? ""),
        detail: input.detail === undefined ? undefined : String(input.detail),
        country: input.country === undefined ? undefined : String(input.country),
        sourceId: input.sourceId === undefined || input.sourceId === null ? null : String(input.sourceId),
        anchorId: input.anchorId === undefined || input.anchorId === null ? null : String(input.anchorId),
      },
      { actor: "advocate" },
    );
  });
  handle("foreign:decide", async (matterId: string, id: string, decision: string) => {
    if (decision !== "confirmed" && decision !== "rejected") throw new Error("BAD_DECISION: confirmed or rejected");
    return (await matters.store(String(matterId))).decideForeignElement(String(id), decision, { actor: "advocate" });
  });
  handle("foreign:routes", async (matterId: string) => (await matters.store(String(matterId))).foreignRoutes());
  handle("quality:document", async (matterId: string, sourceId: string) => (await matters.store(String(matterId))).documentQuality(String(sourceId)));
  // Phase 11 (Y3): the synced OneDrive and Google Drive folders. No OAuth and no credential.
  const storageProvider = (value: unknown): StorageProvider => {
    if (value !== "onedrive" && value !== "google_drive") throw new Error("BAD_PROVIDER: onedrive or google_drive");
    return value;
  };
  const storageFolder = async (provider: StorageProvider): Promise<string | null> => {
    const ready = storageReady(detectStorageFolders(), provider);
    if (!ready) throw new Error(`NOT_DETECTED: the ${provider === "onedrive" ? "OneDrive" : "Google Drive"} folder is not on this computer`);
    if (!mainWindow()) throw new Error("WINDOW_CLOSED: the window is not open");
    const picked = await dialog.showOpenDialog(mainWindow()!, { title: `Import a folder from ${provider === "onedrive" ? "OneDrive" : "Google Drive"}`, defaultPath: ready.root, properties: ["openDirectory"] });
    const folder = picked.canceled ? null : picked.filePaths[0] ?? null;
    if (!folder) return null;
    if (!insideRoot(ready.root, folder)) throw new Error("OUTSIDE_PROVIDER: the folder is not inside the synced folder");
    return folder;
  };
  handle("storage:folders", () => detectStorageFolders());  handle("storage:import-library", async (providerValue: string) => {
    const provider = storageProvider(providerValue);
    const folder = await storageFolder(provider);
    if (!folder) return null;
    return library.importFolder(folder, provider);
  });
  handle("storage:import-matter", async (matterId: string, providerValue: string) => {
    const provider = storageProvider(providerValue);
    const folder = await storageFolder(provider);
    if (!folder) return null;
    const results = await matters.addFolder(String(matterId), folder, { actor: "advocate" }, provider);
    ingest.enqueue(String(matterId));
    return { added: results.filter((r) => r.outcome === "added").length, refused: results.filter((r) => r.outcome === "refused").length, folder };
  });
  handle("intake:storage", async (providerValue: string) => {
    const provider = storageProvider(providerValue);
    const folder = await storageFolder(provider);
    if (!folder) return null;
    const matter = await matters.create(path.basename(folder));
    const results = await matters.addFolder(matter.id, folder, { actor: "advocate" }, provider);
    ingest.enqueue(matter.id);
    return { matter, added: results.filter((r) => r.outcome === "added").length, refused: results.filter((r) => r.outcome === "refused").length, folder };
  });
  // Phase 11 (Y1): the integration manifests. No integration ships; the registry keeps the state.
  handle("integrations:list", () => integrations.list());
  handle("integrations:sync", () => integrations.sync());
  handle("integrations:add", async () => {
    if (!mainWindow()) return null;
    const picked = await dialog.showOpenDialog(mainWindow()!, { title: "Add an integration manifest", properties: ["openFile"], filters: [{ name: "Integration manifest", extensions: ["json"] }] });
    const file = picked.canceled ? null : picked.filePaths[0] ?? null;
    return file ? integrations.add(file) : null;
  });
  handle("integrations:enable", (id: string, enabled: boolean) => integrations.setEnabled(String(id), enabled === true));
  // Phase 11 (N5): the workflow and agent builder.
  const builderDeps = () => ({
    skills: skillRegistry.get().active,
    draftKinds: CATALOGUE.map((c) => c.kind),
    humanOnly: HUMAN_ONLY_PATTERN,
    never: NEVER_IN_A_SKILL,
  });
  handle("builders:workflows", () => advocateStore.workflows());
  handle("builders:save-workflow", (input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_WORKFLOW: a workflow is needed");
    return advocateStore.saveWorkflow(input, [...skillRegistry.get().active.keys()], { actor: "advocate" });
  });
  handle("builders:delete-workflow", (id: string) => {
    advocateStore.deleteWorkflow(String(id), { actor: "advocate" });
    return advocateStore.workflows();
  });
  handle("builders:runs", async (matterId: string) => (await matters.store(String(matterId))).workflowRuns());
  handle("builders:run-workflow", async (matterId: string, workflowId: string, inputs: Record<string, string>) => {
    const wf = advocateStore.workflow(String(workflowId));
    if (!wf) throw new Error(`NOT_FOUND: no workflow ${String(workflowId)}`);
    // The run streams in the chat; the bridge does not hold the renderer until it ends.
    void agent.send(String(matterId), `Run the workflow "${wf.title}" (${wf.id}) with these inputs: ${JSON.stringify(inputs ?? {})}. Call run_workflow now with the workflow "${wf.id}" and the inputs. Then tell me each step's result in short.`).catch((e) => console.error(`workflow start: ${(e as Error).message}`));
    return { sent: true };
  });
  handle("builders:agents", () => advocateStore.agents());
  handle("builders:run-agent", async (matterId: string, agentId: string) => {
    const profile = advocateStore.agent(String(agentId));
    if (!profile) throw new Error(`NOT_FOUND: no agent ${String(agentId)}`);
    void agent.send(String(matterId), `Run the agent "${profile.title}" (${profile.id}). Call run_agent now with the agent "${profile.id}". Then tell me each step's result in short.`).catch((e) => console.error(`agent start: ${(e as Error).message}`));
    return { sent: true };
  });
  handle("builders:save-agent", (input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_AGENT: an agent is needed");
    return advocateStore.saveAgent(input, builderDeps(), { actor: "advocate" });
  });
  handle("builders:delete-agent", (id: string) => {
    advocateStore.deleteAgent(String(id), { actor: "advocate" });
    return advocateStore.agents();
  });
  handle("builders:test-agent", (input: Record<string, unknown>) => {
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    return testAgent({ ...raw, id: String(raw.id ?? "agent-draft"), version: String(raw.version ?? "1.0.0") } as never, builderDeps());
  });
  // Phase 11 (N7): the skill import. The raw text and the scan come first; the advocate installs.
  handle("skills:import-preview", async () => {
    if (!mainWindow()) return null;
    const picked = await dialog.showOpenDialog(mainWindow()!, { title: "Import a skill file", properties: ["openFile"], filters: [{ name: "Skill file", extensions: ["md"] }] });
    const file = picked.canceled ? null : picked.filePaths[0] ?? null;
    return file ? skillImporter.preview(file) : null;
  });
  handle("skills:import-install", (id: string) => {
    const installed = skillImporter.install(String(id));
    skillRegistry.get(true);
    return installed;
  });
  // Phase 11 (S9): the trigger table and its fires. A fire starts nothing until the advocate starts it.
  handle("triggers:list", () => advocateStore.triggers());
  handle("triggers:save", (input: Record<string, unknown>) => {
    if (!input || typeof input !== "object") throw new Error("BAD_TRIGGER: a trigger is needed");
    return advocateStore.saveTrigger(input, { actor: "advocate" });
  });
  handle("triggers:set-enabled", (id: string, enabled: boolean) => advocateStore.setTriggerEnabled(String(id), enabled === true, { actor: "advocate" }));
  handle("triggers:delete", (id: string) => advocateStore.deleteTrigger(String(id), { actor: "advocate" }));
  handle("triggers:fires", (matterId?: string) => {
    const all = advocateStore.triggerFires();
    return matterId ? all.filter((f) => f.matterId === String(matterId)) : all;
  });
  handle("triggers:decide", async (id: string, state: string) => {
    if (state !== "started" && state !== "dismissed") throw new Error("BAD_STATE: started or dismissed");
    const fire = advocateStore.triggerFires().find((f) => f.id === String(id));
    if (!fire) throw new Error(`NOT_FOUND: no trigger fire ${String(id)}`);
    const decided = advocateStore.decideTriggerFire(fire.id, state, { actor: "advocate" });
    if (state === "started") {
      const store = await matters.store(fire.matterId);
      for (const r of fire.responses) {
        const p = responseProposal(r, fire.subject);
        store.openReviewItem(p.kind, null, null, p.detail);
      }
      if (fire.skills.length) {
        void agent.send(fire.matterId, `The trigger "${fire.event}" fired for ${fire.subject}. Run these skills now, one after the other: ${fire.skills.join(", ")}. Use run_skill for each, with the reason "the trigger ${fire.event} fired". These are proposals; do not change a draft or a deadline.`).catch((e) => console.error(`trigger start: ${(e as Error).message}`));
      }
      matterChanged(fire.matterId);
    }
    return decided;
  });
  handle("library:open", async (id: string) => {
    const f = library.fileFor(String(id));
    if (!f) throw new Error(`NOT_FOUND: no library item ${String(id)}`);
    return shell.openPath(f.path);
  });
  handle("library:reveal", (id: string) => {
    const f = library.fileFor(String(id));
    if (f) shell.showItemInFolder(f.path);
  });
  handle("chat:get", (matterId: string) => agent.getChat(matterId));
  handle("models:list", () => agent.listModels());
  handle("models:get", () => agent.currentModel());
  handle("models:set", (key: string) => agent.setModel(String(key ?? "")));
  // Phase 7 (O5): the model per role — drafting, extraction, critic — saved in settings.json.
  // Each key must name a model with credentials; an absent key falls back to the chat's model.
  handle("models:roles", () => roleModels());
  handle("models:setRole", async (role: string, key: string | null) => {
    if (!MODEL_ROLES.includes(role as ModelRole)) throw new Error(`BAD_ROLE: ${MODEL_ROLES.join(", ")}`);
    if (key == null || key === "") {
      writeSetting("roleModels", { ...roleModels(), [role]: null });
      return roleModels();
    }
    const models = await agent.listModels();
    if (!models.some((m) => m.key === key)) throw new Error(`BAD_MODEL: ${key} is not a model with credentials`);
    writeSetting("roleModels", { ...roleModels(), [role]: key });
    return roleModels();
  });
  handle("effort:get", () => agent.getEffort());
  handle("effort:set", (level: string) => agent.setEffort(String(level ?? "")));
  handle("chat:send", (matterId: string, text: string) => {
    // The turn runs in the background; progress arrives as chat events.
    void agent.send(matterId, String(text ?? ""));
  });
}
