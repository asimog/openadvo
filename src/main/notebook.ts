/**
 * Builds the Notebook after ingestion (build step 3): candidate events from every read source,
 * then date conflicts across the whole matter. Deterministic rules only (lib/notebook).
 * Results reach the matter store only through main/matters.ts.
 */
import { extractEvents, extractRelative, findConflicts, METHOD, runningLines, type CandidateEvent } from "../lib/notebook/index.ts";
import type { Matters } from "./matters.ts";

/** Events dated from the advocate's base date get their own ids, so they never collide with the file's own. */
export function anchoredIds(events: CandidateEvent[]): CandidateEvent[] {
  return events.map((e) => (e.dateText.includes("(base date given by the advocate)") ? { ...e, id: e.id.replace(/:r(\d+)$/, ":a$1") } : e));
}

/** V5-7: after the advocate gives a base date, date the file's relative phrases with it. */
export async function applyDateAnchor(matters: Matters, matterId: string, sourceId: string): Promise<number> {
  const store = await matters.store(matterId);
  const lines = await matters.sourceLines(matterId, sourceId);
  const input = lines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text, reading: l.reading }));
  const running = runningLines(input);
  return store.addEvents(sourceId, anchoredIds(extractRelative(input, running, store.dateAnchor(sourceId))));
}

/** V5-8: events from the reading the advocate chose for a disputed line, when it differs from the stored one. */
export async function eventsFromDecidedLine(matters: Matters, matterId: string, d: { sourceId: string; anchorId: string; page: number; line: number; readingA: string; decidedText: string | null }): Promise<number> {
  if (!d.decidedText || d.decidedText === d.readingA) return 0;
  const store = await matters.store(matterId);
  const found = extractEvents([{ anchorId: d.anchorId, sourceId: d.sourceId, page: d.page, line: d.line, text: d.decidedText }], "ocr", new Set());
  return store.addEvents(d.sourceId, found.map((e, i) => ({ ...e, id: `ev:${d.anchorId}:d${i + 1}`, method: `${METHOD}+decided` })));
}

/** Extract one read source. Existing event ids are kept, so a rebuild never duplicates or deletes. */
async function extractSource(matters: Matters, matterId: string, sourceId: string, name: string): Promise<number> {
  const lines = await matters.sourceLines(matterId, sourceId);
  const byPage = new Map<number, typeof lines>();
  for (const l of lines) byPage.set(l.page, [...(byPage.get(l.page) ?? []), l]);
  const events: CandidateEvent[] = [];
  const running = runningLines(lines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text })));
  for (const pageLines of byPage.values()) {
    const input = pageLines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text }));
    events.push(...extractEvents(input, pageLines[0].reading, running));
  }
  // V2-4: relative dates, against the header date or the last explicit date.
  const store = await matters.store(matterId);
  const unresolved: string[] = [];
  events.push(
    ...anchoredIds(
      extractRelative(
        lines.map((l) => ({ anchorId: l.id, sourceId: l.sourceId, page: l.page, line: l.line, text: l.text, reading: l.reading })),
        running,
        store.dateAnchor(sourceId),
        (l, phrase) => unresolved.push(`"${phrase}" on page ${l.page}, line ${l.line}`),
      ),
    ),
  );
  // V5-7: one question per file when a relative date has nothing to count from.
  if (unresolved.length) store.askDateAnchor(sourceId, `${name}: ${unresolved.slice(0, 3).join("; ")}${unresolved.length > 3 ? ` and ${unresolved.length - 3} more` : ""} cannot be dated: the file has no date to count from. Give the base date (for example the date the document was made).`);
  return matters.recordEvents(matterId, sourceId, events, METHOD);
}

export async function extractNotebook(matters: Matters, matterId: string): Promise<number> {
  let added = 0;
  for (const source of await matters.sourcesToExtract(matterId)) added += await extractSource(matters, matterId, source.id, source.name);
  if (added > 0) {
    const all = (await matters.notebook(matterId)).events;
    await matters.recordConflicts(matterId, findConflicts(all));
  }
  return added;
}

/**
 * Re-run the extraction over every read source. A source extracted as zero before is tried again,
 * and a source whose text changed (a corrected OCR reading) gains what it missed. Existing events
 * are never deleted, so a confirmed event stays.
 */
export async function rebuildNotebook(matters: Matters, matterId: string): Promise<number> {
  let added = 0;
  const done = new Set((await matters.listJobs(matterId)).filter((j) => j.state === "done").map((j) => j.sourceId));
  for (const source of (await matters.listSources(matterId)).filter((s) => done.has(s.id))) added += await extractSource(matters, matterId, source.id, source.name);
  const all = (await matters.notebook(matterId)).events;
  await matters.recordConflicts(matterId, findConflicts(all));
  return added;
}
