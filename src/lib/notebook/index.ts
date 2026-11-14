/**
 * Notebook extraction: dates, candidate events and date conflicts. Deterministic rules only.
 * Plain library: no Electron import, no Pi import. Spec: docs/specs/v0-notebook.md.
 */

export const METHOD = "rules-v3";

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
    // Both separators are the same, so a time range such as "4-4.30" is not a date (v1 spec V1-9).
    re: /\b(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})\b(?!\s*(?:a\.?m\b|p\.?m\b|hrs\b|hours\b))/gi,
    read: (m) => {
      const short = m[4].length === 2;
      const y = short ? fullYear(Number(m[4])) : Number(m[4]);
      const d = iso(y, Number(m[3]), Number(m[1]));
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

/** Leading list numbering: "2. ", "(iii) ", "a) ". Removed from a description (v1 spec V1-9). */
const NUMBERING = /^\s*(?:\(?\d{1,3}[.)]|\([ivxlc]{1,6}\)|[ivxlc]{1,6}\)|\(?[a-z]\))\s+/i;

export function cleanDescription(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(NUMBERING, "").trim();
}

/** A line's text for comparison across pages: lower case, digits and spaces removed. */
function runningKey(text: string): string {
  return text.toLowerCase().replace(/[0-9]/g, "").replace(/\s+/g, "");
}

/**
 * Running headers and footers: a line whose text, digits ignored, occurs on three or more
 * pages of one source. Returns their anchor ids (v1 spec V1-9).
 */
export function runningLines(lines: LineInput[]): Set<string> {
  const pages = new Map<string, Set<number>>();
  for (const l of lines) {
    const key = `${l.sourceId}|${runningKey(l.text)}`;
    if (runningKey(l.text).length < 4) continue;
    if (!pages.has(key)) pages.set(key, new Set());
    pages.get(key)!.add(l.page);
  }
  const out = new Set<string>();
  for (const l of lines) {
    const seen = pages.get(`${l.sourceId}|${runningKey(l.text)}`);
    if (seen && seen.size >= 3) out.add(l.anchorId);
  }
  return out;
}

/** A document metadata line. Its date is not compared across sources for conflicts (v1 spec V1-9). */
export const METADATA_LINE = /^\s*(?:decided\s+on|date\s+of\s+decision|equivalent\s+citation|date\s+of\s+(?:judgment|order)\s+pronounced|judgment\s+pronounced\s+on|reserved\s+on|pronounced\s+on)\s*:/i;

/**
 * One candidate event per date found on a line. The description is the line, joined with the
 * next line on the same page when the line does not end a sentence.
 */
export function extractEvents(lines: LineInput[], reading: Reading, skip?: Set<string>): CandidateEvent[] {
  const events: CandidateEvent[] = [];
  /** Running headers and footers. Pass them when the lines are one page of a longer source. */
  const running = skip ?? runningLines(lines);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (running.has(l.anchorId)) continue;
    const dates = findDates(l.text);
    if (dates.length === 0) continue;
    const next = lines[i + 1];
    const joins = next && !running.has(next.anchorId) && next.sourceId === l.sourceId && next.page === l.page && !/[.;:]\s*$/.test(l.text);
    const description = cleanDescription(joins ? `${l.text} ${next.text}` : l.text);
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
      if (METADATA_LINE.test(a.description) || METADATA_LINE.test(b.description)) continue;
      if (a.dateStart === b.dateStart && a.dateEnd === b.dateEnd) continue;
      const ka = keys.get(a.id)!;
      const kb = keys.get(b.id)!;
      if (ka.size < 3 || kb.size < 3) continue;
      if (jaccard(ka, kb) >= CONFLICT_SIMILARITY) out.push([a.id, b.id]);
    }
  }
  return out;
}

/** V2-4: relative date phrases. "thereafter" and other vague words are not here on purpose. */
const RELATIVE: Array<{ re: RegExp; base: "header" | "previous"; days: number }> = [
  { re: /\b(?:today|this\s+day|the\s+date\s+hereof)\b/gi, base: "header", days: 0 },
  { re: /\byesterday\b/gi, base: "header", days: -1 },
  { re: /\bthe\s+(?:next|following)\s+day\b|\bthe\s+day\s+after\b(?!\s+(?:the|tomorrow))/gi, base: "previous", days: 1 },
];

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function indian(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * V2-4: events dated by a relative phrase. `lines` are all lines of one source in reading order.
 * "today", "this day", "the date hereof" and "yesterday" use the header date: the first explicit
 * date on page 1. "the next day", "the following day" and "the day after" use the last explicit
 * date earlier in the source. Every such date is inferred and names its base in `dateText`.
 */
export function extractRelative(lines: Array<LineInput & { reading: Reading }>, skip: Set<string> = new Set()): CandidateEvent[] {
  const usable = lines.filter((l) => !skip.has(l.anchorId));
  let header: { date: string; page: number; line: number } | null = null;
  for (const l of usable) {
    if (l.page !== 1) break;
    const d = findDates(l.text).find((h) => h.type === "explicit" && h.start === h.end);
    if (d) {
      header = { date: d.start, page: l.page, line: l.line };
      break;
    }
  }
  const events: CandidateEvent[] = [];
  let previous: { date: string; page: number; line: number } | null = null;
  for (let i = 0; i < usable.length; i++) {
    const l = usable[i];
    const dates = findDates(l.text);
    const marks: Array<{ index: number; kind: "date"; date: string } | { index: number; kind: "rel"; text: string; base: "header" | "previous"; days: number }> = [];
    for (const d of dates) if (d.type === "explicit" && d.start === d.end) marks.push({ index: d.index, kind: "date", date: d.start });
    for (const r of RELATIVE) {
      r.re.lastIndex = 0;
      for (let m = r.re.exec(l.text); m; m = r.re.exec(l.text)) {
        const at = m.index;
        if (dates.some((d) => at >= d.index && at < d.index + d.text.length)) continue;
        marks.push({ index: at, kind: "rel", text: m[0], base: r.base, days: r.days });
      }
    }
    marks.sort((a, b) => a.index - b.index);
    let n = 0;
    for (const mark of marks) {
      if (mark.kind === "date") {
        previous = { date: mark.date, page: l.page, line: l.line };
        continue;
      }
      const base = mark.base === "header" ? header : previous;
      if (!base) continue;
      const date = addDays(base.date, mark.days);
      const next = usable[i + 1];
      const joins = next && next.page === l.page && !/[.;:]\s*$/.test(l.text);
      const description = cleanDescription(joins ? `${l.text} ${next.text}` : l.text);
      events.push({
        id: `ev:${l.anchorId}:r${++n}`,
        sourceId: l.sourceId,
        anchorId: l.anchorId,
        page: l.page,
        line: l.line,
        dateText: `"${mark.text}" from ${indian(base.date)} (${mark.base === "header" ? "header date" : "earlier date"}, page ${base.page} line ${base.line})`,
        dateStart: date,
        dateEnd: date,
        dateType: "inferred",
        description,
        kind: eventKind(description),
        reading: l.reading,
        method: METHOD,
      });
    }
  }
  return events;
}
