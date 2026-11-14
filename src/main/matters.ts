/**
 * The only caller of the matter store library (decision 4, spec rule 1).
 * Holds one open MatterStore per matter.
 */
import path from "node:path";
import { MatterStore, MatterStoreError, listMatters } from "../lib/matter-store/index.ts";
import type {
  AddFileResult,
  EventRecord,
  MatterSummary,
  OriginRecord,
  SourceRecord,
  WriteContext,
  IngestJob,
  PageInput,
  PageRecord,
  AnchorRecord,
  ReviewItem,
  Notebook,
  EventInput,
  EventDecision,
  DraftKind,
  DraftRecord,
  RevisionRecord,
  ParagraphLinkRecord,
} from "../lib/matter-store/index.ts";

const MATTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class Matters {
  readonly root: string;
  private open = new Map<string, MatterStore>();

  constructor(root: string) {
    this.root = root;
  }

  list(): Promise<MatterSummary[]> {
    return listMatters(this.root);
  }

  async create(title: string): Promise<MatterSummary> {
    const store = await MatterStore.create(this.root, title, { actor: "advocate" });
    const summary = store.matter();
    this.open.set(summary.id, store);
    return summary;
  }

  /** Open a matter and check every blob again (spec rule 4). */
  async openMatter(matterId: string): Promise<SourceRecord[]> {
    const store = await this.store(matterId);
    return store.checkIntegrity({ actor: "system" });
  }

  async store(matterId: string): Promise<MatterStore> {
    if (!MATTER_ID.test(matterId)) throw new MatterStoreError("BAD_MATTER_ID", matterId);
    const cached = this.open.get(matterId);
    if (cached) return cached;
    const store = await MatterStore.open(path.join(this.root, matterId));
    this.open.set(matterId, store);
    return store;
  }

  async addFiles(matterId: string, paths: string[], ctx: WriteContext = { actor: "advocate" }): Promise<AddFileResult[]> {
    const store = await this.store(matterId);
    const results: AddFileResult[] = [];
    for (const p of paths) results.push(await store.addFile(p, ctx));
    return results;
  }

  async listSources(matterId: string): Promise<SourceRecord[]> {
    return (await this.store(matterId)).listSources();
  }

  async listOrigins(matterId: string, sourceId: string): Promise<OriginRecord[]> {
    return (await this.store(matterId)).listOrigins(sourceId);
  }

  /** The stored bytes of one source, for a read-only view. */
  async sourceFile(matterId: string, sourceId: string): Promise<{ path: string; name: string }> {
    const store = await this.store(matterId);
    const source = store.getSource(sourceId);
    if (!source) throw new MatterStoreError("SOURCE_NOT_FOUND", sourceId);
    return { path: store.blobPath(source.sha256), name: source.name };
  }

  async listEvents(matterId: string): Promise<EventRecord[]> {
    return (await this.store(matterId)).listEvents();
  }

  // ---- Step 2: document intelligence. The ingest queue reaches the matter store only through these. ----

  async sourcesToIngest(matterId: string): Promise<SourceRecord[]> {
    return (await this.store(matterId)).sourcesToIngest();
  }

  /** Start a job. A job left running with partial pages by an earlier run is marked failed instead. */
  async startJob(matterId: string, sourceId: string): Promise<boolean> {
    const store = await this.store(matterId);
    try {
      store.startJob(sourceId);
      return true;
    } catch (e) {
      if ((e as MatterStoreError).code === "ALREADY_INGESTED") {
        store.failJob(sourceId, "an earlier run stopped part way; some pages are stored");
        return false;
      }
      throw e;
    }
  }

  async recordPage(matterId: string, sourceId: string, page: PageInput): Promise<void> {
    (await this.store(matterId)).recordPage(sourceId, page);
  }

  async finishJob(matterId: string, sourceId: string, pages: number): Promise<void> {
    (await this.store(matterId)).finishJob(sourceId, pages);
  }

  async failJob(matterId: string, sourceId: string, error: string): Promise<void> {
    (await this.store(matterId)).failJob(sourceId, error);
  }

  async listJobs(matterId: string): Promise<IngestJob[]> {
    return (await this.store(matterId)).listJobs();
  }

  async listPages(matterId: string, sourceId: string, from?: number, to?: number): Promise<PageRecord[]> {
    return (await this.store(matterId)).listPages(sourceId, from, to);
  }

  async searchLines(matterId: string, query: string, limit?: number): Promise<AnchorRecord[]> {
    return (await this.store(matterId)).searchLines(query, limit);
  }

  async listReviewItems(matterId: string): Promise<ReviewItem[]> {
    return (await this.store(matterId)).listReviewItems();
  }

  /** Human-only (decision 5): reached from the bridge, never from an agent tool. */
  async decideReviewItem(matterId: string, itemId: string, status: "resolved" | "skipped"): Promise<ReviewItem> {
    return (await this.store(matterId)).decideReviewItem(itemId, status, { actor: "advocate" });
  }

  // ---- Step 3: the Notebook. ----

  async sourcesToExtract(matterId: string): Promise<SourceRecord[]> {
    return (await this.store(matterId)).sourcesToExtract();
  }

  async sourceLines(matterId: string, sourceId: string) {
    return (await this.store(matterId)).sourceLines(sourceId);
  }

  async recordEvents(matterId: string, sourceId: string, events: EventInput[], method: string): Promise<void> {
    (await this.store(matterId)).recordEvents(sourceId, events, method);
  }

  async recordConflicts(matterId: string, pairs: Array<[string, string]>): Promise<number> {
    return (await this.store(matterId)).recordConflicts(pairs);
  }

  async notebook(matterId: string): Promise<Notebook> {
    return (await this.store(matterId)).notebook();
  }

  /** Human-only (decision 5). */
  async decideEvent(matterId: string, eventId: string, decision: EventDecision): Promise<Notebook> {
    const store = await this.store(matterId);
    store.decideEvent(eventId, decision, { actor: "advocate" });
    return store.notebook();
  }

  /** Human-only (decision 5). */
  async resolveConflict(matterId: string, conflictId: string, resolution: string): Promise<Notebook> {
    const store = await this.store(matterId);
    store.resolveConflict(conflictId, resolution, { actor: "advocate" });
    return store.notebook();
  }

  async title(matterId: string): Promise<string> {
    return (await this.store(matterId)).matter().title;
  }

  // ---- Step 4: drafts and revisions. The generation and save paths reach the store only through these. ----

  async listDrafts(matterId: string): Promise<DraftRecord[]> {
    return (await this.store(matterId)).listDrafts();
  }

  async getDraft(matterId: string, draftId: string): Promise<DraftRecord> {
    return (await this.store(matterId)).getDraft(draftId);
  }

  async getRevision(matterId: string, revisionId: string): Promise<RevisionRecord> {
    return (await this.store(matterId)).getRevision(revisionId);
  }

  async revisionBytes(matterId: string, revisionId: string): Promise<Buffer> {
    return (await this.store(matterId)).revisionBytes(revisionId);
  }

  async createDraftWithRevision(
    matterId: string,
    kind: DraftKind,
    title: string,
    docx: Buffer,
    paragraphs: Array<{ anchor: string; text: string; eventIds: string[] }>,
    ctx: WriteContext = { actor: "advocate" },
  ): Promise<{ draft: DraftRecord; revision: RevisionRecord }> {
    return (await this.store(matterId)).createDraftWithRevision(kind, title, docx, paragraphs, ctx);
  }

  /** V1: a regenerated petition or conference package as a new revision. */
  async addGeneratedRevision(
    matterId: string,
    draftId: string,
    docx: Buffer,
    paragraphs: Array<{ anchor: string; text: string; eventIds: string[] }>,
    ctx: WriteContext = { actor: "advocate" },
  ): Promise<RevisionRecord> {
    return (await this.store(matterId)).addGeneratedRevision(draftId, docx, paragraphs, ctx);
  }

  /** Human-only (decision 5). */
  async saveDraftRevision(
    matterId: string,
    draftId: string,
    docx: Buffer,
    baseRevisionId: string,
    ctx: WriteContext = { actor: "advocate" },
  ): Promise<RevisionRecord> {
    return (await this.store(matterId)).saveRevision(draftId, docx, baseRevisionId, ctx);
  }

  /** Step 5: one review item per defect of a draft check. */
  async openDraftDefects(matterId: string, draftId: string, revisionId: string, defects: Array<{ kind: string; detail: string }>) {
    return (await this.store(matterId)).openDraftDefects(draftId, revisionId, defects);
  }

  async listReviewItemsOf(matterId: string) {
    return (await this.store(matterId)).listReviewItems();
  }

  /** The agent's proposal of tracked changes (editor-design item a). */
  async proposeDraftRevision(matterId: string, draftId: string, docx: Buffer, baseRevisionId: string, data: Record<string, unknown>, sessionId?: string): Promise<RevisionRecord> {
    return (await this.store(matterId)).proposeRevision(draftId, docx, baseRevisionId, data, { actor: "agent", sessionId });
  }

  /** Human-only (decision 5): keep or undo agent changes. */
  async decideDraftRevision(matterId: string, draftId: string, docx: Buffer, baseRevisionId: string, data: Record<string, unknown>): Promise<RevisionRecord> {
    return (await this.store(matterId)).decideRevision(draftId, docx, baseRevisionId, data, { actor: "advocate" });
  }

  /** Human-only (decision 5). */
  async approveRevision(matterId: string, revisionId: string): Promise<DraftRecord> {
    const store = await this.store(matterId);
    const revision = store.approveRevision(revisionId, { actor: "advocate" });
    return store.getDraft(revision.draftId);
  }

  async listParagraphLinks(matterId: string, draftId: string): Promise<ParagraphLinkRecord[]> {
    return (await this.store(matterId)).listParagraphLinks(draftId);
  }

  async getParagraphLink(matterId: string, draftId: string, anchor: string): Promise<ParagraphLinkRecord | undefined> {
    return (await this.store(matterId)).getParagraphLink(draftId, anchor);
  }

  async recordParagraphLink(matterId: string, draftId: string, anchor: string, revisionId: string, eventIds: string[], text: string): Promise<void> {
    (await this.store(matterId)).recordParagraphLink(draftId, anchor, revisionId, eventIds, text);
  }

  /** Any other matter-store event (drafts, editor open and close). */
  async appendEvent(matterId: string, ctx: WriteContext, action: string, subject: string | null, data: Record<string, unknown> | null): Promise<void> {
    (await this.store(matterId)).appendEvent(ctx, action, subject, data);
  }

  async recordAgentSession(matterId: string, sessionId: string, model: string | null): Promise<void> {
    (await this.store(matterId)).appendEvent({ actor: "agent", sessionId }, "agent.session_started", matterId, { model });
  }

  closeAll(): void {
    for (const store of this.open.values()) store.close();
    this.open.clear();
  }
}
