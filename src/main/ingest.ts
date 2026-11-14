/**
 * The ingest queue (build step 2). One job per source, one job at a time.
 * Ingestion is separate from capture: a job starts after a file is added, or when a
 * matter opens with sources that have no finished job. A job never changes the blob.
 * Results reach the matter store only through main/matters.ts.
 */
import { readFile } from "node:fs/promises";
import { processSource } from "../lib/document-intelligence/index.ts";
import type { Matters } from "./matters.ts";
import { extractNotebook } from "./notebook.ts";
import { orderImpact } from "./practice.ts";

export class Ingest {
  private matters: Matters;
  private notify: (matterId: string) => void;
  private chain: Promise<void> = Promise.resolve();
  private pending = new Set<string>();

  constructor(matters: Matters, notify: (matterId: string) => void) {
    this.matters = matters;
    this.notify = notify;
  }

  /** Queue every source of the matter that needs a job. Safe to call often. */
  enqueue(matterId: string): void {
    if (this.pending.has(matterId)) return;
    this.pending.add(matterId);
    this.chain = this.chain
      .then(() => this.drain(matterId))
      .catch((e) => console.error(`ingest: ${(e as Error).message}`))
      .finally(() => this.pending.delete(matterId));
  }

  /** Resolves when the queue is empty (tests). */
  idle(): Promise<void> {
    return this.chain;
  }

  private async drain(matterId: string): Promise<void> {
    // Re-read the list after each job, so files added during a job are picked up too.
    for (;;) {
      const [source] = await this.matters.sourcesToIngest(matterId);
      if (!source) {
        // Every source is read: build the Notebook from the new text (step 3).
        const added = await extractNotebook(this.matters, matterId);
        // V2-2 and V2-3: document types and same-text pairs.
        const changed = await this.matters.afterIngest(matterId).catch((e) => {
          console.error(`afterIngest: ${(e as Error).message}`);
          return false;
        });
        // V5-19: a new order or judgment after an approval asks the advocate to re-check the approved drafts.
        await orderImpact(this.matters, matterId).catch((e) => console.error(`orderImpact: ${(e as Error).message}`));
        if (added > 0 || changed) this.notify(matterId);
        return;
      }
      if (!(await this.matters.startJob(matterId, source.id))) {
        this.notify(matterId);
        continue;
      }
      this.notify(matterId);
      try {
        const { path } = await this.matters.sourceFile(matterId, source.id);
        const bytes = new Uint8Array(await readFile(path));
        const pages = await processSource(bytes, source.mediaType, async (page) => {
          await this.matters.recordPage(matterId, source.id, page);
        });
        await this.matters.finishJob(matterId, source.id, pages.length);
      } catch (e) {
        await this.matters.failJob(matterId, source.id, (e as Error).message || String(e));
      }
      this.notify(matterId);
    }
  }
}
