/**
 * Phase 6 (L1, L3): the document catalogue. One entry per document kind: its title, its group
 * in the window, and its parts in order. A court's document format is read from its adapter's
 * checklist data. The filing set's required documents are mapped from the proceeding pack's
 * own words. Plain library (decision 6): it computes blocks; the store writes them.
 */
import type { DraftKind } from "../../shared/records.ts";
import type { Block } from "./structured.ts";
import { dmy } from "./structured.ts";
import type { DocxFormat } from "./index.ts";
import { DEFAULT_FORMAT } from "./index.ts";
import type { DraftingInput } from "./parts.ts";
import {
  affidavitPart,
  annexureIndex,
  authoritiesIndex,
  briefingNotePart,
  caseSummaryPart,
  causeTitle,
  chronologyPart,
  factsPart,
  interimPrayers,
  letterFrame,
  memoOfParties,
  noticeFrame,
  paraWiseReply,
  prayers,
  provisionsAppendix,
  researchMemoPart,
  showeth,
  signatureBlock,
  slot,
  vakalatnamaPart,
  verificationBlock,
  writtenSubmissionsPart,
} from "./parts.ts";

export type DocumentGroup = "records" | "pleadings" | "petitions" | "applications" | "evidence" | "submissions" | "notices" | "notes" | "letters";

export const GROUP_LABEL: Record<DocumentGroup, string> = {
  records: "Records",
  pleadings: "Pleadings",
  petitions: "Petitions and appeals",
  applications: "Applications",
  evidence: "Affidavits and evidence",
  submissions: "Submissions",
  notices: "Notices",
  notes: "Notes and summaries",
  letters: "Client letters",
};

export interface DocumentTemplate {
  kind: DraftKind;
  title: string;
  group: DocumentGroup;
  /** One line the picker shows beside the title. */
  note: string;
  /** The parts, in order. */
  build: (i: DraftingInput) => Block[];
}

/** The case type of the filing target's proceeding pack, or a neutral word when none is set. */
function caseTypeOf(i: DraftingInput, fallback: string): string {
  return i.proceeding?.caseType?.trim() || fallback;
}

// ---- The catalogue ----

export const CATALOGUE: DocumentTemplate[] = [
  // Petitions and appeals.
  {
    kind: "writ_petition",
    title: "WRIT PETITION",
    group: "petitions",
    note: "Cause title, facts, grounds, prayer, verification. The grounds are yours to write or propose.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "W.P.(C)"), "Petitioner", "Respondent"),
      { text: "PETITION UNDER ARTICLE 226 OF THE CONSTITUTION OF INDIA", style: "heading" },
      ...showeth("The humble petition of the Petitioner above named most respectfully showeth:"),
      ...factsPart(i),
      ...slot("GROUNDS", "the grounds, from the accepted arguments or the advocate"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to:"),
      ...interimPrayers(i),
      ...verificationBlock(i.details.petitioner),
      ...signatureBlock(i, "Petitioner"),
    ],
  },
  {
    kind: "appeal_memo",
    title: "MEMORANDUM OF APPEAL",
    group: "petitions",
    note: "Cause title, facts, grounds, prayer. The appeal provision is a marker until the court's pack names it.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "APPEAL"), "Appellant", "Respondent"),
      { text: "MEMORANDUM OF APPEAL", style: "heading" },
      ...showeth("The memorandum of appeal of the Appellant above named most respectfully showeth:"),
      { text: `1. The Appellant calls upon this Hon'ble Court to admit this appeal. ${"[CITE: the provision the appeal is filed under]"}` },
      ...factsPart(i),
      ...slot("GROUNDS OF APPEAL", "the grounds of appeal, from the accepted arguments or the advocate"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to:"),
      ...signatureBlock(i, "Appellant"),
    ],
  },
  {
    kind: "revision_petition",
    title: "PETITION FOR REVISION",
    group: "petitions",
    note: "Cause title, facts, grounds, prayer. The revision provision is a marker until the court's pack names it.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "REVISION"), "Petitioner", "Respondent"),
      { text: "PETITION FOR REVISION", style: "heading" },
      ...showeth("The humble revision petition of the Petitioner above named most respectfully showeth:"),
      { text: `1. The Petitioner calls upon this Hon'ble Court to exercise its revisional jurisdiction. ${"[CITE: the provision the revision is filed under]"}` },
      ...factsPart(i),
      ...slot("GROUNDS", "the grounds of the revision, from the accepted arguments or the advocate"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to:"),
      ...signatureBlock(i, "Petitioner"),
    ],
  },
  // Pleadings.
  {
    kind: "plaint",
    title: "PLAINT",
    group: "pleadings",
    note: "Cause title, facts, valuation, prayer, verification.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "CIVIL SUIT"), "Plaintiff", "Defendant"),
      { text: "PLAINT", style: "heading" },
      ...showeth("The humble plaint of the Plaintiff above named most respectfully showeth:"),
      ...factsPart(i),
      ...slot("VALUATION", "the valuation of the suit for the purposes of jurisdiction and court fee"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to:"),
      ...interimPrayers(i),
      ...verificationBlock(i.details.petitioner),
      ...signatureBlock(i, "Plaintiff"),
    ],
  },
  {
    kind: "written_statement",
    title: "WRITTEN STATEMENT",
    group: "pleadings",
    note: "Para-wise reply to the plaint in the record, with the reply left to you.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "CIVIL SUIT"), "Defendant", "Plaintiff"),
      { text: "WRITTEN STATEMENT", style: "heading" },
      ...showeth("The written statement of the Defendant above named most respectfully showeth:"),
      ...paraWiseReply(i),
      ...slot("ADDITIONAL PLEAS", "the additional pleas of the defendant"),
      ...verificationBlock(i.details.respondent),
      ...signatureBlock(i, "Defendant"),
    ],
  },
  {
    kind: "replication",
    title: "REPLICATION",
    group: "pleadings",
    note: "The reply to the written statement, left to you.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "CIVIL SUIT"), "Plaintiff", "Defendant"),
      { text: "REPLICATION", style: "heading" },
      ...showeth("The replication of the Plaintiff above named most respectfully showeth:"),
      ...slot("REPLICATION TO THE WRITTEN STATEMENT", "the plaintiff's reply to each paragraph of the written statement"),
      ...verificationBlock(i.details.petitioner),
      ...signatureBlock(i, "Plaintiff"),
    ],
  },
  // Affidavits and evidence.
  {
    kind: "affidavit",
    title: "AFFIDAVIT",
    group: "evidence",
    note: "The deponent's own recorded statements, organized and numbered. Nothing is composed (the witness rule).",
    build: (i) => [...affidavitPart(i, i.details.petitioner), ...verificationBlock(i.details.petitioner)],
  },
  {
    kind: "counter_affidavit",
    title: "COUNTER AFFIDAVIT",
    group: "evidence",
    note: "The respondent's recorded statements, organized. Nothing is composed.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, ""), "Respondent", "Petitioner"),
      { text: "COUNTER AFFIDAVIT", style: "heading" },
      ...affidavitPart(i, i.details.respondent),
      ...verificationBlock(i.details.respondent),
    ],
  },
  {
    kind: "rejoinder",
    title: "REJOINDER AFFIDAVIT",
    group: "evidence",
    note: "The petitioner's recorded statements in reply, organized. Nothing is composed.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, ""), "Petitioner", "Respondent"),
      { text: "REJOINDER AFFIDAVIT", style: "heading" },
      ...affidavitPart(i, i.details.petitioner),
      ...verificationBlock(i.details.petitioner),
    ],
  },
  {
    kind: "memo_of_parties",
    title: "MEMO OF PARTIES",
    group: "evidence",
    note: "The parties and counsel, with addresses as markers until recorded.",
    build: (i) => memoOfParties(i, "Petitioner", "Respondent"),
  },
  {
    kind: "vakalatnama",
    title: "VAKALATNAMA",
    group: "evidence",
    note: "The appointment form, with the advocate's recorded details.",
    build: (i) => vakalatnamaPart(i, caseTypeOf(i, ""), "Petitioner"),
  },
  // Applications.
  {
    kind: "application_interim",
    title: "APPLICATION FOR INTERIM RELIEF",
    group: "applications",
    note: "Cause title, facts, grounds, the interim prayer.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "I.A."), "Petitioner", "Respondent"),
      { text: "APPLICATION FOR INTERIM RELIEF", style: "heading" },
      ...showeth("The humble application of the Applicant above named most respectfully showeth:"),
      ...factsPart(i, "THE FACTS THE APPLICATION RESTS ON"),
      ...slot("GROUNDS FOR INTERIM RELIEF", "why the interim relief cannot wait for the final hearing"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to:"),
      ...verificationBlock(i.details.petitioner),
      ...signatureBlock(i, "Petitioner"),
    ],
  },
  {
    kind: "application_stay",
    title: "APPLICATION FOR STAY",
    group: "applications",
    note: "Cause title, facts, grounds, the stay prayer.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "I.A."), "Applicant", "Respondent"),
      { text: "APPLICATION FOR STAY", style: "heading" },
      ...showeth("The humble application of the Applicant above named most respectfully showeth:"),
      ...factsPart(i, "THE FACTS THE APPLICATION RESTS ON"),
      ...slot("GROUNDS FOR STAY", "why the operation of the order should be stayed"),
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to stay the operation of:"),
      ...verificationBlock(i.details.petitioner),
      ...signatureBlock(i, "Applicant"),
    ],
  },
  {
    kind: "application_exemption",
    title: "APPLICATION FOR EXEMPTION",
    group: "applications",
    note: "The frame of an exemption application; the exemption is yours to state.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "I.A."), "Applicant", "Respondent"),
      { text: "APPLICATION FOR EXEMPTION", style: "heading" },
      ...showeth("The humble application of the Applicant above named most respectfully showeth:"),
      { text: "1. The Applicant seeks exemption from:" },
      { text: "[REVIEW: the requirement the exemption is sought from, and why]" },
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to exempt the Applicant from:"),
      ...signatureBlock(i, "Applicant"),
    ],
  },
  {
    kind: "application_early_hearing",
    title: "APPLICATION FOR EARLY HEARING",
    group: "applications",
    note: "The frame of an early-hearing application; the urgency is yours to state.",
    build: (i) => [
      ...causeTitle(i, caseTypeOf(i, "I.A."), "Applicant", "Respondent"),
      { text: "APPLICATION FOR EARLY HEARING", style: "heading" },
      ...showeth("The humble application of the Applicant above named most respectfully showeth:"),
      { text: "1. The Applicant seeks early hearing of the above case on the ground of urgency:" },
      { text: "[REVIEW: the grounds of urgency]" },
      ...prayers(i, "It is most respectfully prayed that this Hon'ble Court may be pleased to list the above case for early hearing on:"),
      ...signatureBlock(i, "Applicant"),
    ],
  },
  // Submissions.
  {
    kind: "written_submissions",
    title: "WRITTEN SUBMISSIONS",
    group: "submissions",
    note: "The frame; each submission carries its authority and its record source when written.",
    build: (i) => [...causeTitle(i, caseTypeOf(i, ""), "Counsel", "Respondent"), ...writtenSubmissionsPart(i), ...signatureBlock(i, "Counsel")],
  },
  // Notices.
  {
    kind: "legal_notice",
    title: "LEGAL NOTICE",
    group: "notices",
    note: "The notice frame; the facts and the demand are yours to state. The advocate sends it.",
    build: (i) => noticeFrame(i, "", "Legal notice on behalf of my client", ""),
  },
  {
    kind: "notice_reply",
    title: "REPLY TO LEGAL NOTICE",
    group: "notices",
    note: "The reply frame; the reply is yours to state. The advocate sends it.",
    build: (i) => [
      { text: "REPLY TO LEGAL NOTICE", style: "center" },
      { text: `Date: ${dmy(new Date().toISOString())}` },
      { text: "To," },
      { text: "[TO BE COMPLETED: the advocate who served the notice]" },
      { text: "Dear Sir/Madam," },
      { text: "1. This is in reply to your notice served on my client:" },
      { text: "[REVIEW: the reply to each demand of the notice]" },
      { text: "2. My client reserves all his rights and remedies." },
      { text: "Yours faithfully," },
      { text: `${i.advocate?.name.trim() || "______________________"} Advocate` },
    ],
  },
  // Notes and summaries.
  {
    kind: "chronology",
    title: "CHRONOLOGY OF EVENTS",
    group: "notes",
    note: "One paragraph per confirmed event, with its source line.",
    build: (i) => chronologyPart(i),
  },
  {
    kind: "briefing_note",
    title: "BRIEFING NOTE",
    group: "notes",
    note: "The summary, the accepted issues, the authorities, the open questions.",
    build: (i) => briefingNotePart(i),
  },
  {
    kind: "case_summary",
    title: "CASE SUMMARY",
    group: "notes",
    note: "The parties, the court and the confirmed facts.",
    build: (i) => caseSummaryPart(i),
  },
  {
    kind: "research_memo",
    title: "RESEARCH MEMORANDUM",
    group: "notes",
    note: "The newest stored research memorandum, as written on the Research tab.",
    build: (i) => researchMemoPart(i),
  },
  {
    kind: "index",
    title: "INDEX",
    group: "notes",
    note: "The annexures and the authorities, from the records.",
    build: (i) => [{ text: "INDEX", style: "center" }, ...annexureIndex(i).slice(1), ...authoritiesIndex(i).slice(1)],
  },
  {
    kind: "appendix_of_provisions",
    title: "APPENDIX OF PROVISIONS",
    group: "notes",
    note: "The provisions saved to the matter, with their sources.",
    build: (i) => provisionsAppendix(i),
  },
  // Client letters. The advocate sends them.
  {
    kind: "client_letter",
    title: "LETTER TO THE CLIENT",
    group: "letters",
    note: "The letter frame; the body is yours to write. The advocate sends it.",
    build: (i) => letterFrame(i, "[TO BE COMPLETED: the subject of the letter]"),
  },
  {
    kind: "hearing_update",
    title: "HEARING UPDATE FOR THE CLIENT",
    group: "letters",
    note: "The frame of a hearing update; the events of the date are yours to state. The advocate sends it.",
    build: (i) => letterFrame(i, `Update on the hearing of ${i.details.title || "the matter"}`),
  },
];

export function templateOf(kind: DraftKind): DocumentTemplate | null {
  return CATALOGUE.find((t) => t.kind === kind) ?? null;
}

// ---- The court format (L1) ----

/** 1 cm in OOXML twips. */
const CM = 567;

/** Delhi High Court e-Filing Rules, rule 6.1: A4, margins 2 cm top and bottom, 4 cm left and right, Times New Roman 14, 1.5 spacing. */
const DHC_EFILING: DocxFormat = {
  id: "in.hc.delhi.efiling",
  source: "Delhi High Court e-Filing Rules, rule 6.1",
  pageWidth: 11906,
  pageHeight: 16838,
  margin: { top: 2 * CM, bottom: 2 * CM, left: 4 * CM, right: 4 * CM },
  font: "Times New Roman",
  sizeHalfPoints: 28,
  lineSpacing: 360,
};

/** The known document formats, keyed by the court's directory id. */
export const COURT_FORMATS: Record<string, DocxFormat> = {
  "in.hc.delhi": DHC_EFILING,
};

/** The format of a court, or the default with its honest source line. */
export function courtFormat(courtId: string | null): DocxFormat {
  return (courtId && COURT_FORMATS[courtId]) || DEFAULT_FORMAT;
}

// ---- The proceeding pack's required parts, mapped to documents ----

export interface PackDocuments {
  /** The documents the set builds, in the pack's order. */
  documents: Array<{ kind: DraftKind; title: string }>;
  /** Pack parts the annexure manager owns. */
  annexures: string[];
  /** Pack parts the application cannot map: shown as they are named. */
  unmapped: string[];
}

const PACK_MAP: Array<{ re: RegExp; kind: DraftKind; title: string }> = [
  { re: /^writ petition/i, kind: "writ_petition", title: "Writ petition" },
  { re: /^special leave petition/i, kind: "petition", title: "Petition" },
  { re: /^memo of parties/i, kind: "memo_of_parties", title: "Memo of parties" },
  { re: /^affidavit/i, kind: "affidavit", title: "Affidavit" },
  { re: /^vakalatnama/i, kind: "vakalatnama", title: "Vakalatnama" },
  { re: /^list of dates/i, kind: "list_of_dates", title: "List of Dates" },
  { re: /^synopsis/i, kind: "synopsis", title: "Synopsis" },
  { re: /^questions of law/i, kind: "questions_of_law", title: "Questions of Law" },
  { re: /^grounds/i, kind: "grounds", title: "Grounds" },
  { re: /^appendix of provisions/i, kind: "appendix_of_provisions", title: "Appendix of Provisions" },
];

/**
 * The proceeding pack's required parts, each mapped to the document it names, or to the
 * annexure manager, or reported as unmapped (L1: a set says what it does not know).
 */
export function packToDocuments(parts: string[]): PackDocuments {
  const documents: PackDocuments["documents"] = [];
  const annexures: string[] = [];
  const unmapped: string[] = [];
  for (const part of parts) {
    const name = part.trim();
    if (!name) continue;
    if (/^annexures?$/i.test(name) || /^certified copy/i.test(name)) {
      annexures.push(name);
      continue;
    }
    const hit = PACK_MAP.find((m) => m.re.test(name));
    if (hit) documents.push({ kind: hit.kind, title: hit.title });
    else unmapped.push(name);
  }
  return { documents, annexures, unmapped };
}
