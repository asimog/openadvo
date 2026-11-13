/**
 * Notebook extraction: dates, candidate events and date conflicts. Deterministic rules only.
 * Plain library: no Electron import, no Pi import. Spec: docs/specs/v0-notebook.md.
 */

export const METHOD = "rules-v1";

export type DateType = "explicit" | "inferred" | "range";

export interface DateHit {
  /** The date as written. */
  text: string;
  /** ISO dates. For a single date, start equals end. */
  start: string;
  end: string;
  type: DateType;
  index: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A two-digit year: the nearest century that is not more than one year in the future. */
function fullYear(yy: number, now = new Date()): number {
  const current = now.getUTCFullYear();
  const candidate = 2000 + yy;
  return candidate <= current + 1 ? candidate : 1900 + yy;
}

const PATTERNS: Array<{ re: RegExp; read: (m: RegExpExecArray) => Omit<DateHit, "text" | "index"> | null }> = [
  {
    // 12th March, 2024 / 12 March 2024 / 12th day of March, 2024
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH}\\.?,?\\s+(\\d{4})\\b`, "gi"),
    read: (m) => {
      const d = iso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
      return d ? { start: d, end: d, type: "explicit" } : null;
    },
  },
  {
    // March 12, 2024
    re: new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"),
    read: (m) => {
      const d = iso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
      return d ? { start: d, end: d, type: "explicit" } : null;
    },
  },
  {
    // 12.03.2024 / 12/03/2024 / 12-03-2024, read day first; two-digit years are inferred.
    re: /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g,
    read: (m) => {
      const short = m[3].length === 2;
      const y = short ? fullYear(Number(m[3])) : Number(m[3]);
      const d = iso(y, Number(m[2]), Number(m[1]));
      return d ? { start: d, end: d, type: short ? "inferred" : "explicit" } : null;
    },
  },
  {
    // March 2024 / March, 2024: a range over the month.
    re: new RegExp(`\\b${MONTH}\\.?,?\\s+(\\d{4})\\b`, "gi"),
    read: (m) => {
      const y = Number(m[2]);
      const mo = MONTHS[m[1].toLowerCase()];
      return { start: `${y}-${pad(mo)}-01`, end: `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`, type: "range" };
    },
  },
];

/** Every date in a text, in reading order. Earlier patterns win where matches overlap. */
export function findDates(text: string): DateHit[] {
  const taken: Array<[number, number]> = [];
  const hits: DateHit[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const s = m.index;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      const read = p.read(m);
      if (!read) continue;
      taken.push([s, e]);
      hits.push({ ...read, text: m[0], index: s });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

export type EventKind = "procedural" | "factual";

const PROCEDURAL = /\b(filed|instituted|order(?:s|ed)?|judg(?:e)?ment|decree|hearing|heard|listed|adjourned|notice|issued|application|petition|appeal|dismissed|allowed|disposed|stay(?:ed)?|summons|registered|preferred|admitted|impugned|writ|suit|fir|charge-?sheet|complaint|reply|rejoinder|affidavit|counter|review|vakalatnama|served|pronounced|reserved)\b/i;

export function eventKind(description: string): EventKind {
  return PROCEDURAL.test(description) ? "procedural" : "factual";
}

export type Reading = "text_layer" | "ocr";

export interface LineInput {
  anchorId: string;
  sourceId: string;
  page: number;
  line: number;
  text: string;
}

export interface CandidateEvent {
  id: string;
  sourceId: string;
  anchorId: string;
  page: number;
  line: number;
  dateText: string;
  dateStart: string;
  dateEnd: string;
  dateType: DateType;
  description: string;
  kind: EventKind;
  reading: Reading;
  method: string;
}

/**
 * One candidate event per date found on a line. The description is the line, joined with the
 * next line on the same page when the line does not end a sentence.
 */
export function extractEvents(lines: LineInput[], reading: Reading): CandidateEvent[] {
  const events: CandidateEvent[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const dates = findDates(l.text);
    if (dates.length === 0) continue;
    const next = lines[i + 1];
    const joins = next && next.sourceId === l.sourceId && next.page === l.page && !/[.;:]\s*$/.test(l.text);
    const description = (joins ? `${l.text} ${next.text}` : l.text).replace(/\s+/g, " ").trim();
    dates.forEach((d, n) => {
      events.push({
        id: `ev:${l.anchorId}:${n + 1}`,
        sourceId: l.sourceId,
        anchorId: l.anchorId,
        page: l.page,
        line: l.line,
        dateText: d.text,
        dateStart: d.start,
        dateEnd: d.end,
        dateType: d.type,
        description,
        kind: eventKind(description),
        reading,
        method: METHOD,
      });
    });
  }
  return events;
}

const STOP = new Set([
  "that", "this", "with", "from", "were", "have", "been", "which", "their", "there", "shall", "would", "said",
  "dated", "date", "dates", "into", "upon", "under", "also", "only", "same", "before", "after", "being",
  ...Object.keys(MONTHS),
]);

/** The words that say what an event is about: letters only, four or more, without dates and common words. */
export function eventKey(description: string): Set<string> {
  let text = description;
  for (const d of findDates(description)) text = text.replace(d.text, " ");
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const CONFLICT_SIMILARITY = 0.6;

/**
 * Pairs of events from different lines that describe the same act with different dates.
 * Flagged for the advocate; never resolved here.
 */
export function findConflicts(events: Array<Pick<CandidateEvent, "id" | "anchorId" | "description" | "dateStart" | "dateEnd" | "kind">>): Array<[string, string]> {
  const keys = new Map(events.map((e) => [e.id, eventKey(e.description)]));
  const out: Array<[string, string]> = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (a.anchorId === b.anchorId || a.kind !== b.kind) continue;
      if (a.dateStart === b.dateStart && a.dateEnd === b.dateEnd) continue;
      const ka = keys.get(a.id)!;
      const kb = keys.get(b.id)!;
      if (ka.size < 3 || kb.size < 3) continue;
      if (jaccard(ka, kb) >= CONFLICT_SIMILARITY) out.push([a.id, b.id]);
    }
  }
  return out;
}
