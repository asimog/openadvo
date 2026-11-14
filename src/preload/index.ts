/**
 * The bridge (decision 3, decision 5). The renderer gets these named functions and nothing else.
 * Sandboxed preload: only the `electron` renderer modules are available here.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ChatEvent, OpenAdvoApi } from "../shared/api.ts";

const api: OpenAdvoApi = {
  listMatters: () => ipcRenderer.invoke("matters:list"),
  renameMatter: (matterId, title) => ipcRenderer.invoke("matters:rename", matterId, title),
  setMatterArchived: (matterId, archived) => ipcRenderer.invoke("matters:archive", matterId, archived),
  newConversation: (matterId) => ipcRenderer.invoke("chat:new", matterId),
  getMemory: (matterId) => ipcRenderer.invoke("memory:get", matterId),
  setMemory: (matterId, text) => ipcRenderer.invoke("memory:set", matterId, text),
  listWorkflows: () => ipcRenderer.invoke("workflows:list"),
  saveWorkflow: (input) => ipcRenderer.invoke("workflows:save", input),
  deleteWorkflow: (id) => ipcRenderer.invoke("workflows:delete", id),
  getRecordTable: (matterId) => ipcRenderer.invoke("records:get", matterId),
  addRecordColumn: (matterId, question) => ipcRenderer.invoke("records:addColumn", matterId, question),
  decideRecordCell: (matterId, sourceId, columnId, decision) => ipcRenderer.invoke("records:decide", matterId, sourceId, columnId, decision),
  setSourceType: (matterId, sourceId, type) => ipcRenderer.invoke("sources:setType", matterId, sourceId, type),
  listDuplicates: (matterId) => ipcRenderer.invoke("duplicates:list", matterId),
  decideDuplicate: (matterId, reviewItemId, decision) => ipcRenderer.invoke("duplicates:decide", matterId, reviewItemId, decision),
  getListOfDatesRows: (matterId) => ipcRenderer.invoke("lod:getRows", matterId),
  setListOfDatesRows: (matterId, eventIds) => ipcRenderer.invoke("lod:setRows", matterId, eventIds),
  listMemoryProposals: (matterId) => ipcRenderer.invoke("memory:proposals", matterId),
  decideMemoryProposal: (matterId, id, accept) => ipcRenderer.invoke("memory:decideProposal", matterId, id, accept),
  signingFingerprint: () => ipcRenderer.invoke("signing:fingerprint"),
  openMatter: (matterId) => ipcRenderer.invoke("matters:open", matterId),
  listSources: (matterId) => ipcRenderer.invoke("sources:list", matterId),
  listOrigins: (matterId, sourceId) => ipcRenderer.invoke("sources:origins", matterId, sourceId),
  listEvents: (matterId) => ipcRenderer.invoke("events:list", matterId),
  getChat: (matterId) => ipcRenderer.invoke("chat:get", matterId),
  listModels: () => ipcRenderer.invoke("models:list"),
  getModel: () => ipcRenderer.invoke("models:get"),
  checkDraft: (matterId, draftId) => ipcRenderer.invoke("drafts:check", matterId, draftId),
  setModel: (key) => ipcRenderer.invoke("models:set", key),
  getEffort: () => ipcRenderer.invoke("effort:get"),
  setEffort: (level) => ipcRenderer.invoke("effort:set", level),
  openSourceView: (matterId, sourceId) => ipcRenderer.invoke("view:openSource", matterId, sourceId),
  closeView: (url) => ipcRenderer.invoke("view:close", new URL(url).searchParams.get("doc") ?? ""),
  listJobs: (matterId) => ipcRenderer.invoke("ingest:jobs", matterId),
  getSourcePages: (matterId, sourceId) => ipcRenderer.invoke("sources:pages", matterId, sourceId),
  listReviewItems: (matterId) => ipcRenderer.invoke("review:list", matterId),
  resolveReviewItem: (matterId, itemId) => ipcRenderer.invoke("review:resolve", matterId, itemId),
  skipReviewItem: (matterId, itemId) => ipcRenderer.invoke("review:skip", matterId, itemId),
  getNotebook: (matterId) => ipcRenderer.invoke("notebook:get", matterId),
  confirmEvent: (matterId, eventId) => ipcRenderer.invoke("notebook:confirmed", matterId, eventId),
  rejectEvent: (matterId, eventId) => ipcRenderer.invoke("notebook:rejected", matterId, eventId),
  excludeEvent: (matterId, eventId) => ipcRenderer.invoke("notebook:excluded", matterId, eventId),
  includeEvent: (matterId, eventId) => ipcRenderer.invoke("notebook:included", matterId, eventId),
  resolveConflict: (matterId, conflictId, resolution) => ipcRenderer.invoke("notebook:resolveConflict", matterId, conflictId, resolution),
  // Step 4: drafts and revisions (decision 4; human-only actions are decision 5).
  listDrafts: (matterId) => ipcRenderer.invoke("drafts:list", matterId),
  getRevision: (matterId, revisionId) => ipcRenderer.invoke("drafts:getRevision", matterId, revisionId),
  getParagraphSource: (matterId, draftId, anchor) => ipcRenderer.invoke("drafts:paragraphSource", matterId, draftId, anchor),
  generateListOfDates: (matterId) => ipcRenderer.invoke("drafts:generateListOfDates", matterId),
  generateSynopsis: (matterId) => ipcRenderer.invoke("drafts:generateSynopsis", matterId),
  openRevisionInEditor: (matterId, revisionId) => ipcRenderer.invoke("drafts:openRevision", matterId, revisionId),
  insertFromNotebook: (matterId, draftId, eventId) => ipcRenderer.invoke("drafts:insertFromNotebook", matterId, draftId, eventId),
  saveRevision: (matterId, draftId, bytes, baseRevisionId) => ipcRenderer.invoke("drafts:saveRevision", matterId, draftId, bytes, baseRevisionId),
  approveRevision: (matterId, revisionId) => ipcRenderer.invoke("drafts:approveRevision", matterId, revisionId),
  agentChanges: (matterId) => ipcRenderer.invoke("drafts:agentChanges", matterId),
  generateDraft: (matterId, kind) => ipcRenderer.invoke("drafts:generate", matterId, kind),
  getResearch: (matterId) => ipcRenderer.invoke("research:get", matterId),
  addIssue: (matterId, text) => ipcRenderer.invoke("research:addIssue", matterId, text),
  decideIssue: (matterId, id, decision, reason) => ipcRenderer.invoke("research:decideIssue", matterId, id, decision, reason),
  addAuthority: (matterId, input) => ipcRenderer.invoke("research:addAuthority", matterId, input),
  decideAuthority: (matterId, id, decision) => ipcRenderer.invoke("research:decideAuthority", matterId, id, decision),
  checkCitations: (matterId, draftId) => ipcRenderer.invoke("research:checkCitations", matterId, draftId),
  attestCitation: (matterId, citation, reason) => ipcRenderer.invoke("research:attestCitation", matterId, citation, reason),
  recordAdverseReview: (matterId, outcome, coverage, note) => ipcRenderer.invoke("research:adverseReview", matterId, outcome, coverage, note),
  searchCitationIndex: (query) => ipcRenderer.invoke("research:searchIndex", query),
  getFiling: (matterId) => ipcRenderer.invoke("filing:get", matterId),
  setMatterDetails: (matterId, input) => ipcRenderer.invoke("filing:setDetails", matterId, input),
  setAnnexures: (matterId, items) => ipcRenderer.invoke("filing:setAnnexures", matterId, items),
  computeLimitation: (matterId) => ipcRenderer.invoke("filing:computeLimitation", matterId),
  confirmLimitation: (matterId, id) => ipcRenderer.invoke("filing:confirmLimitation", matterId, id),
  approveForFiling: (matterId) => ipcRenderer.invoke("filing:approve", matterId),
  verifyFilingManifest: (matterId) => ipcRenderer.invoke("filing:verifyManifest", matterId),
  confirmFiling: (matterId, filingSetId, payloadSha256, step) => ipcRenderer.invoke("filing:confirm", matterId, filingSetId, payloadSha256, step),
  revealFilingSet: (matterId) => ipcRenderer.invoke("filing:reveal", matterId),
  voiceStatus: () => ipcRenderer.invoke("voice:status"),
  transcribe: (samples) => ipcRenderer.invoke("voice:transcribe", samples),
  openPortal: (matterId) => ipcRenderer.invoke("capture:openPortal", matterId),
  importEmail: (matterId) => ipcRenderer.invoke("mail:importEml", matterId),
  getMailAccount: () => ipcRenderer.invoke("mail:getAccount"),
  setMailAccount: (account, password) => ipcRenderer.invoke("mail:setAccount", account, password),
  fetchMail: (matterId, filter) => ipcRenderer.invoke("mail:fetch", matterId, filter),
  decideAgentChanges: (matterId, draftId, baseRevisionId, decisions) =>
    ipcRenderer.invoke("drafts:decideAgentChanges", matterId, draftId, baseRevisionId, decisions),
  onIngestUpdate: (listener) => {
    const handler = (_event: unknown, matterId: string) => listener(matterId);
    ipcRenderer.on("ingest:update", handler);
    return () => {
      ipcRenderer.removeListener("ingest:update", handler);
    };
  },
  createMatter: (title) => ipcRenderer.invoke("matters:create", title),
  addFiles: (matterId, paths) => ipcRenderer.invoke("sources:add", matterId, paths),
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
  pathsForFiles: (files) => files.map((file) => webUtils.getPathForFile(file)).filter((p) => p.length > 0),
  sendChat: (matterId, text) => ipcRenderer.invoke("chat:send", matterId, text),
  onChatEvent: (listener) => {
    const handler = (_event: unknown, payload: ChatEvent) => listener(payload);
    ipcRenderer.on("chat:event", handler);
    return () => {
      ipcRenderer.removeListener("chat:event", handler);
    };
  },
};

contextBridge.exposeInMainWorld("openadvo", api);
