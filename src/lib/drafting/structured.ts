/**
 * V1-6 and V1-7: documents built from structured records (v1 spec). Plain library (decision 6).
 * Still no model writes text: form paragraphs are fixed text with recorded details filled in,
 * and legal text is copied from approved revisions.
 */
import { generateStructuredDocx, type DraftEvent, type DocxFormat, type GeneratedDocument, type GeneratedParagraph } from "./index.ts";

/** One block of a structured document: one anchored paragraph. */
export interface Block {
  text: string;
  style?: "heading" | "center" | "plain";
  eventIds?: string[];
  /** The facts this paragraph states (L2). */
  factIds?: string[];
  /** The evidence statements this paragraph organizes (L7). */
  evidenceIds?: string[];
}

export function generateStructured(blocks: Block[], options: { title: string; generatedAt: string; format?: DocxFormat }): GeneratedDocument {
  const rows: Array<Omit<GeneratedParagraph, "anchor">> = blocks
    .filter((b) => b.text.trim() !== "")
    .map((b) => ({
      text: b.text.trim(),
      eventIds: b.eventIds ?? [],
      factIds: b.factIds ?? [],
      evidenceIds: b.evidenceIds ?? [],
      style: b.style ?? "plain",
    }));
  return generateStructuredDocx(rows, options);
}

/** A research memorandum as a DOCX: its markdown headings and paragraphs, with the title. */
export function memoDocument(title: string, body: string, generatedAt: string): GeneratedDocument {
  const blocks: Block[] = [];
  let first = true;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      // The composed memo opens with its own title; the DOCX title carries it.
      if (first && heading[1].length === 1) {
        first = false;
        continue;
      }
      blocks.push({ text: heading[2], style: "heading" });
    } else {
      blocks.push({ text: line, style: "plain" });
    }
    first = false;
  }
  return generateStructured(blocks, { title, generatedAt });
}

/** The marker the petition writes where a detail is not recorded. Check rule 23 finds it. */
export const TO_COMPLETE = "[TO BE COMPLETED";

export function missing(what: string): string {
  return `${TO_COMPLETE}: ${what}]`;
}

export function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function range(e: DraftEvent): string {
  return e.dateStart === e.dateEnd ? dmy(e.dateStart) : `${dmy(e.dateStart)} – ${dmy(e.dateEnd)}`;
}

function byDate(events: DraftEvent[]): DraftEvent[] {
  return [...events].sort((a, b) => (a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : a.page - b.page || a.line - b.line));
}

/** The title paragraphs a draft carries, dropped when its text is copied into the petition. */
export const TITLES = { questionsOfLaw: /^questions of law$/i, grounds: /^grounds$/i };

/** A draft's live paragraphs without its own title and without empty paragraphs. */
export function bodyParagraphs(paragraphs: Array<{ text: string }>, title: RegExp): string[] {
  return paragraphs.map((p) => p.text.trim()).filter((t) => t !== "" && !title.test(t));
}

export interface ConferenceInput {
  details: { petitioner: string; respondent: string; court: string; caseNumber: string; cnr: string; impugned: string | null };
  procedural: DraftEvent[];
  factual: DraftEvent[];
  issues: Array<{ text: string; status: string; author: string; reason: string | null }>;
  authorities: Array<{ citation: string; parties: string; role: string; status: string; proposition: string; outcome: string | null }>;
  adverseReview: { outcome: string; coverage: string; note: string } | null;
  memoranda: Array<{ title: string; refs: number; unresolved: number }>;
  openReviewItems: Array<{ kind: string; detail: string }>;
  /** V4-4: the Studio's weak-points report, for accepted arguments. */
  weakPoints?: Array<{ claim: string; questions: string[]; attacks: Array<{ kind: string; claim: string }> }>;
}

const ROLES = ["supporting", "adverse", "distinguishable", "other"];

/** V1-6: the case-conference package, from records only (workflow 7E). */
export function conferenceBlocks(i: ConferenceInput): Block[] {
  const d = i.details;
  const absent = [
    d.petitioner ? "" : "petitioner",
    d.respondent ? "" : "respondent",
    d.court ? "" : "High Court",
    d.caseNumber ? "" : "High Court case number",
    d.cnr ? "" : "CNR",
    d.impugned ? "" : "impugned judgment",
  ].filter(Boolean);
  const line = (e: DraftEvent): Block => ({ text: `${range(e)}: ${e.description.trim()} [${e.sourceName}, p. ${e.page}, l. ${e.line}]`, eventIds: [e.id] });
  const blocks: Block[] = [
    { text: "1. Case summary", style: "heading" },
    { text: `${d.petitioner || "Petitioner not recorded"} versus ${d.respondent || "Respondent not recorded"}.` },
    { text: `Court: ${d.court || "not recorded"}. Case number: ${d.caseNumber || "not recorded"}. CNR: ${d.cnr || "not recorded"}. Impugned judgment: ${d.impugned ?? "not recorded"}.` },
    { text: "2. Procedural history", style: "heading" },
  ];
  if (!i.procedural.length) blocks.push({ text: "No confirmed procedural event." });
  for (const e of byDate(i.procedural)) blocks.push(line(e));
  blocks.push({ text: "3. Factual Matrix", style: "heading" });
  if (!i.factual.length) blocks.push({ text: "No confirmed factual event." });
  for (const e of byDate(i.factual)) blocks.push(line(e));
  blocks.push({ text: "4. Issues and proposed questions", style: "heading" });
  if (!i.issues.length) blocks.push({ text: "No issue is recorded." });
  for (const x of i.issues) blocks.push({ text: `[${x.status}, proposed by the ${x.author}] ${x.text}${x.reason ? ` Reason recorded: ${x.reason}` : ""}` });
  ROLES.forEach((role, n) => {
    blocks.push({ text: `5${"abcd"[n]}. Authorities: ${role}`, style: "heading" });
    const rows = i.authorities.filter((a) => a.role === role);
    if (!rows.length) blocks.push({ text: "None recorded." });
    for (const a of rows) blocks.push({ text: `${a.citation}${a.parties ? `, ${a.parties}` : ""} [${a.status}; validator: ${a.outcome ?? "not checked"}]${a.proposition ? `: ${a.proposition}` : ""}` });
  });
  blocks.push({ text: "6. Adverse-authority review", style: "heading" });
  blocks.push({ text: i.adverseReview ? `${i.adverseReview.outcome}. Coverage: ${i.adverseReview.coverage}. ${i.adverseReview.note}` : "Not recorded. Grounds cannot be approved until it is." });
  blocks.push({ text: "7. Memoranda", style: "heading" });
  if (!i.memoranda.length) blocks.push({ text: "None." });
  for (const m of i.memoranda) blocks.push({ text: `${m.title}: ${m.refs} resolved reference(s), ${m.unresolved} unresolved.` });
  blocks.push({ text: "8. Missing information and open review items", style: "heading" });
  if (absent.length) blocks.push({ text: `Matter details not recorded: ${absent.join(", ")}.` });
  if (!i.openReviewItems.length && !absent.length) blocks.push({ text: "None." });
  for (const r of i.openReviewItems) blocks.push({ text: `[${r.kind}] ${r.detail}` });
  blocks.push({ text: "8A. Weak points of the accepted arguments (Studio)", style: "heading" });
  const wp = i.weakPoints ?? [];
  if (!wp.length) blocks.push({ text: "No argument has been accepted in the Studio." });
  for (const w of wp) {
    blocks.push({ text: `Argument: ${w.claim}` });
    if (!w.questions.length && !w.attacks.length) blocks.push({ text: "No open question and no attack that stands." });
    for (const q of w.questions) blocks.push({ text: `Open question: ${q}` });
    for (const a of w.attacks) blocks.push({ text: `Attack that stands (${a.kind}): ${a.claim}` });
  }
  blocks.push({ text: "9. Decisions of the conference", style: "heading" });
  blocks.push({ text: "The advocate records each decision on the Research tab: accept or reject each issue with a reason, adopt or reject each authority. This package is generated from the records and holds no decision of its own." });
  blocks.push({ text: "Advisory outcome scores: not available. The application has no bench data (ruling R-1)." });
  return blocks;
}
