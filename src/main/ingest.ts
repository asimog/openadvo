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
import { finalOrderNextStep, orderImpact } from "./practice.ts";

export class Ingest {
  private matters: Matters;
  private notify: (matterId: string) => void;
  private analyze: ((matterId: string) => Promise<unknown>) | null;
  private onDocument: ((matterId: string, name: string) => void) | null;
  private chain: Promise<void> = Promise.resolve();
  private pending = new Set<string>();

  constructor(matters: Matters, notify: (matterId: string) => void, analyze?: (matterId: string) => Promise<unknown>, onDocument?: (matterId: string, name: string) => void) {
    this.matters = matters;
    this.notify = notify;
    this.analyze = analyze ?? null;
    this.onDocument = onDocument ?? null;
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
        let changed = await this.matters.afterIngest(matterId).catch((e) => {
          console.error(`afterIngest: ${(e as Error).message}`);
          return false;
        });
        // V5-19: a new order or judgment after an approval asks the advocate to re-check the approved drafts.
        await orderImpact(this.matters, matterId).catch((e) => console.error(`orderImpact: ${(e as Error).message}`));
        // A judgment or order is the start of the next step, not an end.
        const finalOrders = await finalOrderNextStep(this.matters, matterId).catch((e) => {
          console.error(`finalOrderNextStep: ${(e as Error).message}`);
          return 0;
        });
        if (finalOrders > 0) changed = true;
        // Phase 4: facts, structure, relations, contradictions, the graph and the jurisdiction report.
        const analyzed = this.analyze
          ? await this.analyze(matterId).catch((e) => {
              console.error(`analysis: ${(e as Error).message}`);
              return null;
            })
          : null;
        if (added > 0 || changed || analyzed) this.notify(matterId);
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
        this.onDocument?.(matterId, source.name);
      } catch (e) {
        await this.matters.failJob(matterId, source.id, (e as Error).message || String(e));
      }
      this.notify(matterId);
    }
  }
}
