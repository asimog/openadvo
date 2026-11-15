/**
 * H9: contradictions of date, amount, name and event across facts and events. The system opens
 * a review item; it never decides which value is right. Plain library.
 */
import type { Contradiction, FactRecord } from "../../shared/evidence.ts";

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "at", "for", "and", "or", "is", "was", "were", "are", "be", "been", "that", "this", "it", "as", "by", "with", "from", "has", "have", "had", "not", "no", "shall", "may", "will"]);

function signature(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b\d{4}\b/g, " ")
    .replace(/(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d+)?/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .slice(0, 10)
    .join(" ");
}

export interface EventForContradiction {
  id: string;
  dateStart: string;
  description: string;
  sourceId: string;
  page: number;
  line: number;
}

export function detectContradictions(facts: FactRecord[], events: EventForContradiction[] = []): Contradiction[] {
  const groups = new Map<string, FactRecord[]>();
  for (const f of facts.filter((x) => x.status !== "rejected" && x.status !== "superseded")) {
    const key = signature(f.text);
    if (key.length < 8) continue;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: Contradiction[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const dates = [...new Set(list.map((f) => f.date).filter(Boolean))];
    if (dates.length > 1) {
      out.push({ key: `date:${key}`, kind: "date", values: list.filter((f) => f.date).map((f) => ({ value: f.date, factId: f.id, text: f.text, sourceId: f.sourceId, page: f.page, line: f.line })) });
    }
    const amounts = [...new Set(list.map((f) => f.amount).filter(Boolean))];
    if (amounts.length > 1) {
      out.push({ key: `amount:${key}`, kind: "amount", values: list.filter((f) => f.amount).map((f) => ({ value: f.amount, factId: f.id, text: f.text, sourceId: f.sourceId, page: f.page, line: f.line })) });
    }
    const names = [...new Set(list.flatMap((f) => f.parties.map((p) => p.toLowerCase())).filter(Boolean))];
    if (names.length > 2) {
      out.push({ key: `name:${key}`, kind: "name", values: list.map((f) => ({ value: f.parties.join(", "), factId: f.id, text: f.text, sourceId: f.sourceId, page: f.page, line: f.line })) });
    }
  }
  // A fact that names an event whose date is different.
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const f of facts) {
    if (!f.eventId || !f.date) continue;
    const e = byId.get(f.eventId);
    if (e && e.dateStart && e.dateStart !== f.date) {
      out.push({
        key: `event:${f.id}:${e.id}`,
        kind: "event",
        values: [
          { value: f.date, factId: f.id, text: f.text, sourceId: f.sourceId, page: f.page, line: f.line },
          { value: e.dateStart, factId: e.id, text: e.description, sourceId: e.sourceId, page: e.page, line: e.line },
        ],
      });
    }
  }
  return out;
}
