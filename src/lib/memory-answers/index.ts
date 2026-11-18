/**
 * Phase 10 (F5): retrieval answers over matter memory and the record. Deterministic: it reads a
 * snapshot and answers one question. It never calls a model and never writes. Every line names the
 * records it rests on; a missing record is a gap, never an invention (lesson L2).
 */
import { MEMORY_QUESTIONS, type MemoryAnswer, type MemoryAnswerLine, type MemoryAnswerRecord, type MemoryQuestionKind, type MemorySnapshot } from "../../shared/knowledge.ts";

export { MEMORY_QUESTIONS };

const TITLES: Record<MemoryQuestionKind, string> = {
  what_decided: "What was decided",
  why_rejected: "Why an argument was rejected",
  disputed_facts: "Which facts are disputed",
  instructions: "Which instructions were given",
  since_last_hearing: "What changed since the last hearing",
  expired_assumptions: "Which assumptions expired",
  search: "Memory search",
};

const day = (iso: string | null | undefined): string => (iso ?? "").slice(0, 10);
const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const short = (s: string, n = 220): string => (clean(s).length > n ? `${clean(s).slice(0, n)}...` : clean(s));

/** Classify the question. The six standard questions win over a search. */
export function classifyQuestion(question: string): MemoryQuestionKind {
  const q = question.toLowerCase();
  if (/changed since the last hearing|since the last hearing|what changed|what has changed/.test(q)) return "since_last_hearing";
  if (/assumption|expired|no longer valid|superseded|stale/.test(q)) return "expired_assumptions";
  if (/why.*(reject|refus)|rejected argument|argument.*rejected|why was .* rejected/.test(q)) return "why_rejected";
  if (/disput|contradict|conflict/.test(q)) return "disputed_facts";
  if (/instruction|what did the client|client (ask|want|told|say)|directions? to (the|your) (junior|counsel)/.test(q)) return "instructions";
  if (/what was decided|what.*decided|decision|order|held|finding/.test(q)) return "what_decided";
  return "search";
}

interface Built {
  lines: MemoryAnswerLine[];
  records: MemoryAnswerRecord[];
  gaps: string[];
  notRead: string[];
}

function builder(): Built & { add: (line: MemoryAnswerLine, records: MemoryAnswerRecord[]) => void; gap: (s: string) => void; notReadNote: (s: string) => void } {
  const b: Built = { lines: [], records: [], gaps: [], notRead: [] };
  return {
    ...b,
    add(line, records) {
      b.lines.push(line);
      for (const r of records) if (!b.records.some((x) => x.kind === r.kind && x.id === r.id)) b.records.push(r);
    },
    gap(s) {
      b.gaps.push(s);
    },
    notReadNote(s) {
      if (!b.notRead.includes(s)) b.notRead.push(s);
    },
  };
}

function memoryRecord(m: MemorySnapshot["memory"][number]): MemoryAnswerRecord {
  return { kind: "memory", id: m.memoryId, label: short(`${m.subject} ${m.relation} ${m.object}`), anchor: m.anchorId ?? null };
}

function issueRecord(s: MemorySnapshot, i: MemorySnapshot["issues"][number]): MemoryAnswerRecord {
  const fact = s.facts.find((f) => i.factIds.includes(f.id));
  return { kind: "issue", id: i.id, label: short(i.text), anchor: fact?.anchorId ?? null };
}

function factRecord(f: MemorySnapshot["facts"][number]): MemoryAnswerRecord {
  return { kind: "fact", id: f.id, label: short(f.text), anchor: f.anchorId };
}

function eventRecord(e: MemorySnapshot["events"][number]): MemoryAnswerRecord {
  return { kind: "event", id: e.id, label: `${e.dateStart}: ${short(e.description)}`, anchor: e.anchorId };
}

function whatDecided(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  const decisions = s.memory.filter((m) => m.type === "advocate_decision" && !["rejected", "superseded"].includes(m.status));
  for (const m of decisions) {
    b.add({ text: `${day(m.recordedAt)}: you decided ${short(m.object)}${m.status === "proposed" ? " (proposed; not yet confirmed)" : ""}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  for (const i of s.issues.filter((x) => x.status === "accepted")) {
    b.add({ text: `Issue accepted: ${short(i.text)}${i.reason ? ` (reason: ${short(i.reason)})` : ""}.`, recordIds: [i.id], anchors: [] }, [issueRecord(s, i)]);
  }
  for (const a of s.arguments.filter((x) => x.status === "accepted")) {
    const issue = s.issues.find((i) => i.id === a.issueId);
    b.add({ text: `Argument accepted${issue ? ` on "${short(issue.text, 90)}"` : ""}: ${short(a.claim)}.`, recordIds: [a.id], anchors: [] }, [{ kind: "argument", id: a.id, label: short(a.claim), anchor: null }]);
  }
  const withDirections = [...s.hearings].filter((h) => h.directions.trim()).sort((a, c) => a.date.localeCompare(c.date));
  for (const h of withDirections.slice(-8)) {
    b.add({ text: `Directions at the hearing of ${h.date}: ${short(h.directions)}${h.nextDate ? ` Next date: ${h.nextDate}.` : ""}`, recordIds: [h.id], anchors: [] }, [{ kind: "hearing", id: h.id, label: `${h.date} ${short(h.directions, 100)}`, anchor: null }]);
  }
  const orders = s.events.filter((e) => !e.excluded && e.kind === "procedural" && /order|judgment|direction|allowed|dismissed/i.test(e.description)).slice(-8);
  for (const e of orders) {
    b.add({ text: `Order or step in the record, ${e.dateStart}: ${short(e.description)} (${e.sourceName}).`, recordIds: [e.id], anchors: [e.anchorId] }, [eventRecord(e)]);
  }
  if (b.lines.length === 0) b.gap("No decision, accepted issue, accepted argument, direction or order is recorded.");
  b.notReadNote("The text of the orders outside the extracted events is not read by this answer; open the source for the full order.");
}

function whyRejected(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  const rejectedIssues = s.issues.filter((i) => i.status === "rejected");
  for (const i of rejectedIssues) {
    if (i.reason) b.add({ text: `Issue rejected: ${short(i.text)}. The reason recorded: ${short(i.reason)}.`, recordIds: [i.id], anchors: [] }, [issueRecord(s, i)]);
    else b.gap(`The issue "${short(i.text, 90)}" was rejected with no reason recorded.`);
  }
  for (const a of s.arguments.filter((x) => x.status === "rejected")) {
    const m = s.memory.find((x) => x.type === "rejected_argument" && (clean(x.subject).includes(clean(a.claim.slice(0, 40))) || clean(x.object).includes(clean(a.claim.slice(0, 40)))));
    if (m) b.add({ text: `Argument rejected: ${short(a.claim)}. The reason recorded: ${short(m.object)}.`, recordIds: [a.id, m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [{ kind: "argument", id: a.id, label: short(a.claim), anchor: null }, memoryRecord(m)]);
    else {
      b.add({ text: `Argument rejected: ${short(a.claim)}. No reason is recorded beside it.`, recordIds: [a.id], anchors: [] }, [{ kind: "argument", id: a.id, label: short(a.claim), anchor: null }]);
      b.gap(`The reason for rejecting the argument "${short(a.claim, 90)}" is not recorded.`);
    }
  }
  const looseMemory = s.memory.filter((m) => m.type === "rejected_argument" && !b.records.some((r) => r.kind === "memory" && r.id === m.memoryId));
  for (const m of looseMemory) {
    b.add({ text: `Rejected argument on record: ${short(m.subject)} - ${short(m.object)}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  if (b.lines.length === 0) b.gap("No rejected issue or argument is recorded.");
  b.notReadNote("The critic's questions are not read by this answer; open the argument's run for the full criticism.");
}

function disputedFacts(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  for (const f of s.facts.filter((x) => x.status === "disputed")) {
    b.add({ text: `Disputed fact: ${short(f.text)}${f.date ? ` (${f.date})` : ""}.`, recordIds: [f.id], anchors: f.anchorId ? [f.anchorId] : [] }, [factRecord(f)]);
  }
  for (const m of s.memory.filter((x) => x.type === "disputed_fact" && !["rejected", "superseded"].includes(x.status))) {
    b.add({ text: `Disputed in memory: ${short(m.subject)} - ${short(m.object)}${m.status === "proposed" ? " (proposed; not yet confirmed)" : ""}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  for (const c of s.conflicts.filter((x) => x.status === "open")) {
    const events = c.eventIds.map((id) => s.events.find((e) => e.id === id)).filter((e): e is MemorySnapshot["events"][number] => !!e);
    const ids = events.map((e) => e.id);
    const anchors = events.map((e) => e.anchorId);
    const lines = events.map((e) => `${e.dateStart}: ${short(e.description, 120)} (${e.sourceName})`).join(" | ");
    b.add({ text: `Date conflict, open: ${lines || c.id}.`, recordIds: ids, anchors }, events.map(eventRecord));
  }
  if (b.lines.length === 0) b.add({ text: "No fact is marked disputed and no date conflict is open.", recordIds: [], anchors: [] }, []);
  b.notReadNote("A contradiction between two documents that the phase 4 analysis did not record is not in this answer; open the Contradictions list.");
}

function instructions(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  const rows = s.memory.filter((m) => m.type === "client_instruction" && !["rejected", "superseded"].includes(m.status)).sort((a, c) => a.recordedAt.localeCompare(c.recordedAt));
  for (const m of rows) {
    b.add({ text: `${day(m.recordedAt)}: ${short(m.subject)} instructed: ${short(m.object)}${m.status === "proposed" ? " (proposed; not yet confirmed)" : ""}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  const decisions = s.memory.filter((m) => m.type === "advocate_decision" && /accept|declin|refus/i.test(m.object) && !["rejected", "superseded"].includes(m.status));
  for (const m of decisions) {
    b.add({ text: `${day(m.recordedAt)}: you decided ${short(m.object)}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  if (b.lines.length === 0) b.gap("No client instruction is recorded. Record one in the Memory tab when the client gives it.");
  b.notReadNote("The mail and message threads are not read by this answer; instruction classification is phase 13.");
}

function sinceLastHearing(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  const hearings = [...s.hearings].sort((a, c) => a.date.localeCompare(c.date));
  const last = hearings.at(-1) ?? null;
  const cutoff = last?.date ?? "";
  if (!last) b.gap("No hearing is recorded. The answer lists the recorded changes, newest first, without a hearing date to measure from.");
  else b.add({ text: `The last recorded hearing is ${last.date}${last.bench ? ` before ${last.bench}` : ""}.`, recordIds: [last.id], anchors: [] }, [{ kind: "hearing", id: last.id, label: `${last.date} ${last.bench}`, anchor: null }]);

  const after = (d: string | null | undefined): boolean => {
    const x = day(d);
    return !cutoff || (x !== "" && x > cutoff);
  };
  const changes: Array<{ at: string; line: MemoryAnswerLine; records: MemoryAnswerRecord[] }> = [];
  for (const e of s.events) if (!e.excluded && after(e.dateStart)) changes.push({ at: e.dateStart, line: { text: `${e.dateStart}: ${short(e.description)} (${e.sourceName}).`, recordIds: [e.id], anchors: [e.anchorId] }, records: [eventRecord(e)] });
  for (const h of hearings) if (after(h.date)) changes.push({ at: h.date, line: { text: `Hearing on ${h.date}${h.directions ? `: ${short(h.directions)}` : "."}`, recordIds: [h.id], anchors: [] }, records: [{ kind: "hearing", id: h.id, label: `${h.date} ${h.bench}`, anchor: null }] });
  for (const src of s.sources) if (after(src.addedAt)) changes.push({ at: day(src.addedAt), line: { text: `New document: ${src.name}.`, recordIds: [src.id], anchors: [] }, records: [{ kind: "source", id: src.id, label: src.name, anchor: null }] });
  for (const d of s.drafts) if (after(d.createdAt)) changes.push({ at: day(d.createdAt), line: { text: `New draft: ${d.title}.`, recordIds: [d.id], anchors: [] }, records: [{ kind: "draft", id: d.id, label: d.title, anchor: null }] });
  for (const m of s.memory) if (after(m.recordedAt)) changes.push({ at: day(m.recordedAt), line: { text: `Memory recorded: ${short(m.subject)} ${m.relation} ${short(m.object)}.`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, records: [memoryRecord(m)] });
  for (const i of s.issues) if (i.decidedAt && after(i.decidedAt)) changes.push({ at: day(i.decidedAt), line: { text: `Issue ${i.status}: ${short(i.text)}${i.reason ? ` (${short(i.reason)})` : ""}.`, recordIds: [i.id], anchors: [] }, records: [issueRecord(s, i)] });
  for (const a of s.arguments) if (after(a.decidedAt ?? a.createdAt)) changes.push({ at: day(a.decidedAt ?? a.createdAt), line: { text: `Argument ${a.status}: ${short(a.claim)}.`, recordIds: [a.id], anchors: [] }, records: [{ kind: "argument", id: a.id, label: short(a.claim), anchor: null }] });
  for (const f of s.facts) {
    // A fact has no created date in the snapshot; its date is the event date it records.
    if (after(f.date)) changes.push({ at: f.date, line: { text: `Fact: ${short(f.text)} (${f.status}).`, recordIds: [f.id], anchors: f.anchorId ? [f.anchorId] : [] }, records: [factRecord(f)] });
  }
  changes.sort((x, y) => x.at.localeCompare(y.at));
  for (const c of changes) b.add(c.line, c.records);
  if (changes.length === 0) b.gap(cutoff ? `Nothing in the record is dated after the hearing of ${cutoff}.` : "No change is recorded.");
  b.notReadNote("A change made outside the matter's record, such as a court update fetched in phase 13, is not in this answer.");
}

function expiredAssumptions(s: MemorySnapshot, b: ReturnType<typeof builder>): void {
  const today = day(s.asOf);
  for (const m of s.memory) {
    const until = day(m.validUntil);
    const expired = m.status === "expired" || m.status === "deprecated" || (until !== "" && until < today);
    const superseded = m.status === "superseded";
    if (!expired && !superseded) continue;
    const later = s.memory.find((x) => x.supersedes === m.memoryId);
    const why = superseded ? `superseded${later ? "" : ""}` : until ? `expired on ${until}` : `marked ${m.status}`;
    b.add({ text: `${short(m.subject)} ${m.relation} ${short(m.object)}: ${why}.${later ? ` The record ${short(later.subject)} replaces it.` : " No later record replaces it yet."}`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  }
  if (s.limitation && !s.limitation.confirmedAt) {
    b.add({ text: `The limitation working (${s.limitation.rule}, deadline ${s.limitation.deadline}) is not confirmed by you.`, recordIds: [s.limitation.id], anchors: [] }, [{ kind: "limitation", id: s.limitation.id, label: `${s.limitation.rule} ${s.limitation.deadline}`, anchor: null }]);
    b.gap("The limitation deadline is unconfirmed.");
  }
  if (b.lines.length === 0) b.add({ text: "No memory record has expired or been superseded, and no limitation working is unconfirmed.", recordIds: [], anchors: [] }, []);
  b.notReadNote("The freshness of the court rules in intel.db is not part of this snapshot; open Court Intelligence for a stale rule.");
}

function search(s: MemorySnapshot, question: string, b: ReturnType<typeof builder>): void {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !["what", "was", "were", "the", "and", "for", "why", "did", "does", "which", "who", "when", "where", "this", "that", "with", "from", "about", "have", "has", "had", "are", "you", "your", "matter", "record", "records", "memory", "say", "says", "tell"].includes(w));
  if (words.length === 0) {
    b.gap("The question has no word to search for. Ask one of the six questions, or name a subject.");
    return;
  }
  const hit = (text: string): boolean => words.some((w) => text.toLowerCase().includes(w));
  for (const m of s.memory) if (hit(`${m.subject} ${m.relation} ${m.object}`)) b.add({ text: `${day(m.recordedAt)}: ${short(m.subject)} ${m.relation} ${short(m.object)} (${m.type.replace(/_/g, " ")}, ${m.status}).`, recordIds: [m.memoryId], anchors: m.anchorId ? [m.anchorId] : [] }, [memoryRecord(m)]);
  for (const i of s.issues) if (hit(i.text)) b.add({ text: `Issue (${i.status}): ${short(i.text)}.`, recordIds: [i.id], anchors: [] }, [issueRecord(s, i)]);
  for (const f of s.facts) if (hit(f.text)) b.add({ text: `Fact (${f.status}${f.date ? `, ${f.date}` : ""}): ${short(f.text)}.`, recordIds: [f.id], anchors: f.anchorId ? [f.anchorId] : [] }, [factRecord(f)]);
  for (const e of s.events) if (!e.excluded && hit(e.description)) b.add({ text: `${e.dateStart}: ${short(e.description)} (${e.sourceName}).`, recordIds: [e.id], anchors: [e.anchorId] }, [eventRecord(e)]);
  for (const h of s.hearings) if (hit(`${h.bench} ${h.directions} ${h.notes}`)) b.add({ text: `Hearing ${h.date}: ${short(h.directions || h.notes)}.`, recordIds: [h.id], anchors: [] }, [{ kind: "hearing", id: h.id, label: `${h.date} ${h.bench}`, anchor: null }]);
  for (const src of s.sources) if (hit(src.name)) b.add({ text: `Document: ${src.name}.`, recordIds: [src.id], anchors: [] }, [{ kind: "source", id: src.id, label: src.name, anchor: null }]);
  for (const d of s.drafts) if (hit(d.title)) b.add({ text: `Draft: ${d.title}.`, recordIds: [d.id], anchors: [] }, [{ kind: "draft", id: d.id, label: d.title, anchor: null }]);
  if (b.lines.length === 0) b.gap(`No record holds the words: ${words.join(", ")}.`);
  b.notReadNote("This is a search of the memory records and the extracted records, not a reading of every page. Use Find for the full text.");
}

/** Answer one question. The answer is deterministic and every line carries its record links. */
export function answerMemoryQuestion(snapshot: MemorySnapshot, question: string): MemoryAnswer {
  const kind = classifyQuestion(question);
  const b = builder();
  if (kind === "what_decided") whatDecided(snapshot, b);
  else if (kind === "why_rejected") whyRejected(snapshot, b);
  else if (kind === "disputed_facts") disputedFacts(snapshot, b);
  else if (kind === "instructions") instructions(snapshot, b);
  else if (kind === "since_last_hearing") sinceLastHearing(snapshot, b);
  else if (kind === "expired_assumptions") expiredAssumptions(snapshot, b);
  else search(snapshot, question, b);
  return {
    question,
    kind,
    title: TITLES[kind],
    asOf: snapshot.asOf,
    answer: b.lines,
    records: b.records,
    gaps: b.gaps,
    notRead: b.notRead,
  };
}
