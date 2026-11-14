/**
 * V1-6 and V1-7: documents built from structured records (v1 spec). Plain library (decision 6).
 * Still no model writes text: form paragraphs are fixed text with recorded details filled in,
 * and legal text is copied from approved revisions.
 */
import { generateStructuredDocx, type DraftEvent, type GeneratedDocument, type GeneratedParagraph } from "./index.ts";

/** One block of a structured document: one anchored paragraph. */
export interface Block {
  text: string;
  style?: "heading" | "center" | "plain";
  eventIds?: string[];
}

export function generateStructured(blocks: Block[], options: { title: string; generatedAt: string }): GeneratedDocument {
  const rows: Array<Omit<GeneratedParagraph, "anchor">> = blocks
    .filter((b) => b.text.trim() !== "")
    .map((b) => ({ text: b.text.trim(), eventIds: b.eventIds ?? [], style: b.style ?? "plain" }));
  return generateStructuredDocx(rows, options);
}

/** The marker the petition writes where a detail is not recorded. Check rule 23 finds it. */
export const TO_COMPLETE = "[TO BE COMPLETED";

export function missing(what: string): string {
  return `${TO_COMPLETE}: ${what}]`;
}

function dmy(iso: string): string {
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

export interface PetitionInput {
  petitioner: string;
  respondent: string;
  court: string;
  caseNumber: string;
  /** The impugned judgment's ISO date, or null when not recorded. */
  impugnedDate: string | null;
  impugnedEventId: string | null;
  questions: string[];
  grounds: string[];
  annexures: Array<{ label: string; title: string }>;
  year: number;
}

/** The prayer paragraph that rule 24 compares with the matter details. */
export const PRAYER_LEAD = "(a) grant special leave to appeal against the impugned final judgment and order dated";

/** V1-7: the petition for special leave to appeal, from records only. */
export function petitionBlocks(i: PetitionInput): Block[] {
  const pet = i.petitioner.trim() || missing("petitioner");
  const res = i.respondent.trim() || missing("respondent");
  const court = i.court.trim() || missing("High Court");
  const caseNo = i.caseNumber.trim() || missing("High Court case number");
  const date = i.impugnedDate ? dmy(i.impugnedDate) : missing("date of the impugned judgment");
  const ev = i.impugnedEventId ? [i.impugnedEventId] : [];
  const blocks: Block[] = [
    { text: "IN THE SUPREME COURT OF INDIA", style: "center" },
    { text: "CIVIL APPELLATE JURISDICTION", style: "center" },
    { text: `SPECIAL LEAVE PETITION (CIVIL) NO. ______ OF ${i.year}`, style: "center" },
    { text: `(Arising out of the impugned final judgment and order dated ${date} passed by the ${court} in ${caseNo})`, style: "center", eventIds: ev },
    { text: "IN THE MATTER OF:" },
    { text: `${pet} … Petitioner` },
    { text: "Versus", style: "center" },
    { text: `${res} … Respondent` },
    { text: "PETITION UNDER ARTICLE 136 OF THE CONSTITUTION OF INDIA FOR SPECIAL LEAVE TO APPEAL", style: "heading" },
    { text: "To, The Hon'ble the Chief Justice of India and His Companion Justices of the Supreme Court of India." },
    { text: "The humble petition of the Petitioner above named most respectfully showeth:" },
    { text: `1. The Petitioner seeks special leave to appeal against the final judgment and order dated ${date} passed by the ${court} in ${caseNo} (the impugned judgment).`, eventIds: ev },
    { text: "2. QUESTIONS OF LAW", style: "heading" },
  ];
  if (i.questions.length === 0) blocks.push({ text: missing("Questions of Law: approve the Questions of Law draft") });
  for (const q of i.questions) blocks.push({ text: q });
  blocks.push(
    { text: "3. DECLARATION", style: "heading" },
    { text: `The Petitioner states that no other petition seeking leave to appeal has been filed against the impugned judgment dated ${date}.` },
    { text: "4. GROUNDS", style: "heading" },
  );
  if (i.grounds.length === 0) blocks.push({ text: missing("Grounds: approve the Grounds draft") });
  for (const g of i.grounds) blocks.push({ text: g });
  blocks.push({ text: "5. ANNEXURES", style: "heading" });
  if (i.annexures.length === 0) blocks.push({ text: "No annexure is recorded." });
  for (const a of i.annexures) blocks.push({ text: `${a.label}: ${a.title}` });
  blocks.push(
    { text: "6. PRAYER", style: "heading" },
    { text: "In the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may be pleased to:" },
    { text: `${PRAYER_LEAD} ${date} passed by the ${court} in ${caseNo}; and`, eventIds: ev },
    { text: "(b) pass such other order or orders as this Hon'ble Court may deem fit and proper in the facts and circumstances of the case." },
    { text: "AND FOR THIS ACT OF KINDNESS THE PETITIONER AS IN DUTY BOUND SHALL EVER PRAY." },
    { text: "FILED BY: ______________________ Advocate-on-Record for the Petitioner" },
    { text: "FILED ON: ______________" },
  );
  return blocks;
}

/**
 * V1-7 rule 24: the prayer names the impugned judgment's date and the case number the matter
 * records. Returns a defect text, or null.
 */
export function prayerDefect(paragraphs: string[], expected: { date: string | null; caseNumber: string }): string | null {
  const prayer = paragraphs.find((p) => p.startsWith(PRAYER_LEAD));
  if (!prayer) return "The prayer for special leave is missing.";
  const wrong: string[] = [];
  if (expected.date && !prayer.includes(dmy(expected.date))) wrong.push(`the date ${dmy(expected.date)}`);
  if (expected.caseNumber.trim() && !prayer.includes(expected.caseNumber.trim())) wrong.push(`the case number ${expected.caseNumber.trim()}`);
  return wrong.length ? `The prayer does not name ${wrong.join(" or ")} that the matter details record.` : null;
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
  blocks.push({ text: "9. Decisions of the conference", style: "heading" });
  blocks.push({ text: "The advocate records each decision on the Research tab: accept or reject each issue with a reason, adopt or reject each authority. This package is generated from the records and holds no decision of its own." });
  blocks.push({ text: "Advisory outcome scores: not available. The application has no bench data (ruling R-1)." });
  return blocks;
}
