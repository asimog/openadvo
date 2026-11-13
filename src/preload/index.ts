/**
 * The bridge (decision 3, decision 5). The renderer gets these named functions and nothing else.
 * Sandboxed preload: only the `electron` renderer modules are available here.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ChatEvent, OpenAdvoApi } from "../shared/api.ts";

const api: OpenAdvoApi = {
  listMatters: () => ipcRenderer.invoke("matters:list"),
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
