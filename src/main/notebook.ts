/**
 * Builds the Notebook after ingestion (build step 3): candidate events from every read source,
 * then date conflicts across the whole matter. Deterministic rules only (lib/notebook).
 * Results reach the matter store only through main/matters.ts.
 */
import { extractEvents, extractRelative, findConflicts, METHOD, runningLines, type CandidateEvent } from "../lib/notebook/index.ts";
import type { Matters } from "./matters.ts";

export async function extractNotebook(matters: Matters, matterId: string): Promise<number> {
  let added = 0;
  for (const source of await matters.sourcesToExtract(matterId)) {
    const lines = await matters.sourceLines(matterId, source.id);
    const byPage = new Map<number, typeof lines>();
    for (const l of lines) byPage.set(l.page, [...(byPage.get(l.page) ?? []), l]);
    const events: CandidateEvent[] = [];
    const running = runningLines(lines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text })));
    for (const pageLines of byPage.values()) {
      const input = pageLines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text }));
      events.push(...extractEvents(input, pageLines[0].reading, running));
    }
    // V2-4: relative dates, against the header date or the last explicit date.
    events.push(...extractRelative(lines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text, reading: l.reading })), running));
    await matters.recordEvents(matterId, source.id, events, METHOD);
    added += events.length;
  }
  if (added > 0) {
    const all = (await matters.notebook(matterId)).events;
    await matters.recordConflicts(matterId, findConflicts(all));
  }
  return added;
}
