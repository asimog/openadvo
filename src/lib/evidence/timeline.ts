/**
 * H10: timelines. The chronology and the procedural history come from the Notebook; payment and
 * communication entries come from facts. The before/after view is a split on one date. Plain library.
 */
import type { FactRecord, TimelineEntry } from "../../shared/evidence.ts";
import type { NotebookEvent } from "../../shared/records.ts";

const PAYMENT = /\b(paid|payment|deposit|transfer|remittance|cheque|dishonour|bank|amount|rs\.?|inr)\b/i;
const COMMUNICATION = /\b(letter|email|e-mail|notice|communication|message|reply|sent|received|forwarded|whatsapp|sms)\b/i;
const ORDER = /\b(order|judgment|decree|direction|directed)\b/i;

function eventKind(e: NotebookEvent): TimelineEntry["kind"] {
  if (ORDER.test(e.description)) return "order";
  return e.kind;
}

export function buildTimeline(events: NotebookEvent[], facts: FactRecord[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const e of events.filter((x) => x.status !== "rejected" && !x.excluded)) {
    out.push({
      id: `event:${e.id}`,
      date: e.dateStart,
      dateEnd: e.dateEnd,
      dateText: e.dateText,
      text: e.description,
      kind: eventKind(e),
      sourceId: e.sourceId,
      sourceName: e.sourceName,
      page: e.page,
      line: e.line,
      status: e.status,
    });
  }
  for (const f of facts.filter((x) => x.status === "confirmed" || x.status === "disputed")) {
    if (!f.date) continue;
    const kind: TimelineEntry["kind"] = PAYMENT.test(f.text) ? "payment" : COMMUNICATION.test(f.text) ? "communication" : f.type === "admission" || f.type === "denial" ? "factual" : "factual";
    out.push({
      id: `fact:${f.id}`,
      date: f.date,
      dateEnd: f.date,
      dateText: f.date,
      text: f.text,
      kind,
      sourceId: f.sourceId,
      sourceName: f.sourceName,
      page: f.page,
      line: f.line,
      status: f.status,
    });
  }
  return out.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

/** The entries before and after a date, for the before/after comparison. */
export function beforeAfter(entries: TimelineEntry[], date: string): { before: TimelineEntry[]; after: TimelineEntry[] } {
  return {
    before: entries.filter((e) => e.date && e.date < date),
    after: entries.filter((e) => e.date && e.date >= date),
  };
}

/** The entries of one timeline kind. "all" keeps every kind. */
export function timelineOf(entries: TimelineEntry[], kind: "all" | TimelineEntry["kind"]): TimelineEntry[] {
  return kind === "all" ? entries : entries.filter((e) => e.kind === kind);
}
