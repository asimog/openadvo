/**
 * The only caller of the matter store library (decision 4, spec rule 1).
 * Holds one open MatterStore per matter.
 */
import path from "node:path";
import {
  MatterStore,
  MatterStoreError,
  listMatters,
  type AddFileResult,
  type EventRecord,
  type MatterSummary,
  type OriginRecord,
  type SourceRecord,
  type WriteContext,
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

  async listEvents(matterId: string): Promise<EventRecord[]> {
    return (await this.store(matterId)).listEvents();
  }

  async title(matterId: string): Promise<string> {
    return (await this.store(matterId)).matter().title;
  }

  async recordAgentSession(matterId: string, sessionId: string, model: string | null): Promise<void> {
    (await this.store(matterId)).appendEvent({ actor: "agent", sessionId }, "agent.session_started", matterId, { model });
  }

  closeAll(): void {
    for (const store of this.open.values()) store.close();
    this.open.clear();
  }
}
