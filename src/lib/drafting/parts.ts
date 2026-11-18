/**
 * Phase 6 (L1, L2, L3, L8): the part library of the drafting templates. A part is a function
 * from the matter's records to blocks. Plain library: no Electron import, no Pi import
 * (decision 6). No model writes text: a form part is fixed text with recorded details filled
 * in, a record part is generated from confirmed records with the ids kept, and a slot part
 * carries a marker for the advocate or the agent.
 */
import type { Block } from "./structured.ts";
import { dmy, missing } from "./structured.ts";
import type { DraftEvent } from "./index.ts";

/** The records a template part may read. `main/drafts.ts` assembles them from the stores. */
export interface DraftingInput {
  details: {
    title: string;
    court: string;
    caseNumber: string;
    cnr: string;
    petitioner: string;
    respondent: string;
    interimRelief: string;
  };
  advocate: { name: string; role: string; barCouncil: string; address: string } | null;
  /** Confirmed Notebook events, not excluded. */
  events: DraftEvent[];
  /** Confirmed facts (phase 4). */
  facts: Array<{
    id: string;
    text: string;
    type: string;
    status: string;
    date: string;
    relief: string;
    sourceName: string | null;
    page: number | null;
    line: number | null;
  }>;
  /** The deponent's recorded statements (L8). */
  evidence: Array<{
    id: string;
    statement: string;
    givenBy: string;
    givenAt: string;
    witness: string;
    exhibitNumber: string;
    sourceName: string;
  }>;
  /** Adopted authorities. */
  authorities: Array<{ citation: string; parties: string; paragraph: string; proposition: string; role: string }>;
  /** Provisions saved to the matter. */
  provisions: Array<{ act: string; section: string; title: string; repealed: boolean; source: string }>;
  /** Recorded annexures, in filing order. */
  annexures: Array<{ label: string; title: string }>;
  /** Accepted issues. */
  issues: Array<{ text: string; status: string }>;
  /** The allegations of the plaint in the record, with their anchors (phase 4 structure). */
  allegations: Array<{ text: string; ref: string; sourceName: string; page: number; line: number }>;
  /** The newest research memorandum. */
  memorandum: { title: string; body: string; unresolved: string[] } | null;
  /** The proceeding pack of the filing target, when one is set. */
  proceeding: { caseType: string; provisions: string[] } | null;
  /** Approved Questions of Law and Grounds, as the SLP petition generator uses them. */
  approved: { questions: string[]; grounds: string[] };
  /** Phase 7 (K6): the matter's stage and proceeding, from the matter profile. */
  stage: string;
  proceedingType: string;
  /** Phase 7 (K6): the hearings, newest last. */
  hearings: Array<{ date: string; bench: string; directions: string; nextDate: string; nextDateStatus: string }>;
  /** Phase 7 (K6): the directions the last orders carry, with their anchors, newest first. */
  orderDirections: Array<{ text: string; sourceName: string; page: number; line: number }>;
  /** Phase 7 (K6): the open review items, the first ten. */
  openItems: Array<{ kind: string; detail: string }>;
  /** Phase 7 (K6, K7): the challenges of the register, with each row's status. */
  challenges: Array<{ kind: string; text: string; answer: string; status: string }>;
  /** Phase 7 (K7): the accepted arguments that stand, with their computed standing. */
  arguments: Array<{ claim: string; reasoning: string; computed: string; elo: number }>;
}

const eventLine = (e: DraftEvent): string => `${e.sourceName}, p. ${e.page}, l. ${e.line}`;

function byDate(events: DraftEvent[]): DraftEvent[] {
  return [...events].sort((a, b) => (a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : a.page - b.page || a.line - b.line));
}

function range(e: DraftEvent): string {
  return e.dateStart === e.dateEnd ? dmy(e.dateStart) : `${dmy(e.dateStart)} – ${dmy(e.dateEnd)}`;
}

// ---- Form parts ----

/** The cause title. The party labels come with the kind (Petitioner, Appellant, Plaintiff). */
export function causeTitle(i: DraftingInput, caseType: string, firstLabel: string, secondLabel: string): Block[] {
  const court = i.details.court.trim() || missing("court");
  const year = new Date().getFullYear();
  return [
    { text: `IN THE ${court.toUpperCase()}`, style: "center" },
    { text: `${caseType || missing("case type")} NO. ______ OF ${year}`, style: "center" },
    { text: "IN THE MATTER OF:" },
    { text: `${i.details.petitioner.trim() || missing(firstLabel)} … ${firstLabel}` },
    { text: "Versus", style: "center" },
    { text: `${i.details.respondent.trim() || missing(secondLabel)} … ${secondLabel}` },
  ];
}

/** The memo of parties, a document of its own in some courts. Addresses are markers until recorded. */
export function memoOfParties(i: DraftingInput, firstLabel: string, secondLabel: string): Block[] {
  return [
    { text: "MEMO OF PARTIES", style: "center" },
    { text: `1. ${i.details.petitioner.trim() || missing(firstLabel)} … ${firstLabel}` },
    { text: `   Address: ${missing(`address of the ${firstLabel.toLowerCase()}`)}` },
    { text: `2. ${i.details.respondent.trim() || missing(secondLabel)} … ${secondLabel}` },
    { text: `   Address: ${missing(`address of the ${secondLabel.toLowerCase()}`)}` },
    { text: "3. Counsel for the petitioner:" },
    { text: `   ${i.advocate?.name.trim() || missing("advocate name")}${i.advocate?.address ? `, ${i.advocate.address}` : ""}` },
  ];
}

/** The lead line a petition or application opens with. */
export function showeth(lead: string): Block[] {
  return [{ text: lead }];
}

/** The vakalatnama: a form. */
export function vakalatnamaPart(i: DraftingInput, caseType: string, partyLabel: string): Block[] {
  const year = new Date().getFullYear();
  return [
    { text: "VAKALATNAMA", style: "center" },
    { text: `IN THE ${(i.details.court.trim() || missing("court")).toUpperCase()}`, style: "center" },
    { text: `${caseType || missing("case type")} NO. ______ OF ${year}`, style: "center" },
    { text: `${i.details.petitioner.trim() || missing(partyLabel)} … ${partyLabel}` },
    { text: "I, the party above named, do hereby appoint and retain:" },
    { text: `${i.advocate?.name.trim() || missing("the advocate to be appointed")} Advocate (Enrolment No. ${i.advocate?.barCouncil || missing("enrolment number")})` },
    { text: "to appear, act and plead for me in the above case and to conduct the proceedings on my behalf, and I agree to pay the agreed fee." },
    { text: "Place: ______________" },
    { text: "Date: ______________" },
    { text: "Signature of the party" },
    { text: "ACCEPTED:" },
    { text: `${i.advocate?.name.trim() || "______________________"} Advocate` },
  ];
}

/** The verification the court's rules require above an affidavit. */
export function verificationBlock(deponent: string): Block[] {
  const name = deponent.trim() || missing("deponent");
  return [
    { text: "VERIFICATION", style: "heading" },
    { text: `I, ${name}, the deponent above named, do hereby verify that the contents of the affidavit above are true to my knowledge and belief, that no part of it is false, and that nothing material has been concealed.` },
    { text: `Verified at ${missing("place of verification")} on this ______ day of ______, ${new Date().getFullYear()}.` },
    { text: "Signature of the deponent" },
  ];
}

/** The signature block of the advocate for the party named. */
export function signatureBlock(i: DraftingInput, partyLabel: string): Block[] {
  return [
    { text: `${i.advocate?.name.trim() || "______________________"}` },
    { text: `Advocate for the ${partyLabel}` },
    { text: `Date: ${dmy(new Date().toISOString())}` },
  ];
}

/** The frame of a legal notice or its reply. The body is a slot. */
export function noticeFrame(i: DraftingInput, recipient: string, subject: string, provision: string): Block[] {
  return [
    { text: "LEGAL NOTICE", style: "center" },
    { text: `(Under ${provision || missing("the provision the notice is issued under")})`, style: "center" },
    { text: `To,` },
    { text: `${recipient.trim() || missing("addressee")}` },
    { text: `Subject: ${subject}` },
    { text: "Dear Sir/Madam," },
    { text: "1. I serve this notice on behalf of my client on the following facts:" },
    { text: "[REVIEW: the facts of the notice, from the confirmed records]" },
    { text: "2. In the facts above, my client calls upon you:" },
    { text: "[REVIEW: the demand the notice makes]" },
    { text: "3. Take notice that failing compliance within the time the law allows, my client will pursue the remedies open to him, at your risk as to costs." },
    { text: "A copy of this notice is retained in my office for further action." },
    { text: `Yours faithfully,` },
    { text: `${i.advocate?.name.trim() || "______________________"} Advocate` },
  ];
}

/** The frame of a letter to the client. The advocate sends it; the body is a slot. */
export function letterFrame(i: DraftingInput, subject: string): Block[] {
  return [
    { text: `${i.advocate?.name.trim() || "______________________"} Advocate${i.advocate?.address ? `, ${i.advocate.address}` : ""}` },
    { text: `Date: ${dmy(new Date().toISOString())}` },
    { text: "To," },
    { text: missing("the client this letter is for") },
    { text: `Subject: ${subject}` },
    { text: "Dear Sir/Madam," },
    { text: "[REVIEW: the body of the letter]" },
    { text: "Yours faithfully," },
    { text: `${i.advocate?.name.trim() || "______________________"} Advocate` },
  ];
}

// ---- Record parts (L2: generated from confirmed records, the ids kept) ----

/**
 * The facts: one numbered paragraph per confirmed fact of a pleading kind. An inference, a
 * dispute, a missing fact and a client instruction are not stated in a pleading; the fact
 * checks (P6) report them for the advocate to judge.
 */
export function factsPart(i: DraftingInput, heading = "STATEMENT OF FACTS"): Block[] {
  const rows = i.facts.filter((f) => f.status === "confirmed" && (f.type === "fact" || f.type === "admission"));
  const out: Block[] = [{ text: heading, style: "heading" }];
  if (rows.length === 0) {
    out.push({ text: `No confirmed fact is recorded. ${missing("confirm at least one fact on the Facts tab")}` });
    return out;
  }
  rows.forEach((f, n) => {
    const date = f.date ? `On ${dmy(f.date)}, ` : "";
    out.push({ text: `${n + 1}. ${date}${f.text.trim()}`, factIds: [f.id] });
  });
  return out;
}

/** The chronology: one paragraph per confirmed event, with its source line, in date order. */
export function chronologyPart(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "CHRONOLOGY OF EVENTS", style: "heading" }];
  const rows = byDate(i.events);
  if (rows.length === 0) {
    out.push({ text: `No confirmed event is recorded. ${missing("confirm at least one event in the chronology")}` });
    return out;
  }
  for (const e of rows) {
    out.push({ text: `${range(e)}: ${e.description.trim()} [${eventLine(e)}]`, eventIds: [e.id] });
  }
  return out;
}

/**
 * The para-wise reply to a plaint in the record. Each allegation is stated with its anchor and
 * a marker for the reply. No generator writes a denial or an admission (the advocate writes it,
 * or the agent proposes it as a tracked change).
 */
export function paraWiseReply(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "PARA-WISE REPLY TO THE PLAINT", style: "heading" }];
  if (i.allegations.length === 0) {
    out.push({ text: `No allegation of a plaint is recorded. ${missing("ingest the plaint so its allegations are read")}` });
    return out;
  }
  i.allegations.forEach((a, n) => {
    out.push({ text: `${n + 1}. Allegation (${a.sourceName}, p. ${a.page}, l. ${a.line}): ${a.text.trim()}` });
    out.push({ text: `   Reply: [REVIEW: the reply to this allegation, from the confirmed records]` });
  });
  return out;
}

/** The prayers from the recorded relief, with the kind's fixed tail clause. */
export function prayers(i: DraftingInput, lead: string, tail = "pass such other order or orders as this Hon'ble Court may deem fit and proper in the facts and circumstances of the case."): Block[] {
  const relief = i.facts.filter((f) => f.status === "confirmed" && f.relief.trim() !== "").map((f) => f.relief.trim());
  const out: Block[] = [{ text: "PRAYER", style: "heading" }, { text: lead }];
  const letter = (n: number) => `(${String.fromCharCode(97 + n)})`;
  relief.forEach((r, n) => out.push({ text: `${letter(n)} ${r}; and` }));
  out.push({ text: `${letter(relief.length)} ${tail}` });
  if (relief.length === 0) out.push({ text: `No relief is recorded. ${missing("record the relief the matter seeks")}` });
  return out;
}

/** The interim prayers, from the interim relief recorded in the matter details. */
export function interimPrayers(i: DraftingInput): Block[] {
  const interim = i.details.interimRelief.trim();
  const out: Block[] = [];
  if (interim) {
    out.push({ text: "PRAYER FOR INTERIM RELIEF", style: "heading" });
    out.push({ text: "It is most respectfully prayed that, pending the hearing and final disposal of the above, this Hon'ble Court may be pleased to:" });
    out.push({ text: `(a) ${interim}; and` });
    out.push({ text: "(b) pass such other interim order or orders as this Hon'ble Court may deem fit and proper." });
  }
  return out;
}

/**
 * The affidavit (L8, the witness rule): the deponent's own recorded words, organized. The
 * generator sorts the statements by the date they were given, numbers them, and composes
 * nothing. A statement the matter does not record is a marker, never invented prose.
 */
export function affidavitPart(i: DraftingInput, deponent: string): Block[] {
  const statements = [...i.evidence].sort((a, b) => (a.givenAt < b.givenAt ? -1 : a.givenAt > b.givenAt ? 1 : 0));
  const name = deponent.trim() || missing("deponent");
  const out: Block[] = [
    { text: "AFFIDAVIT", style: "center" },
    { text: `I, ${name}, do hereby solemnly affirm and state as follows:` },
    { text: `1. I am the ${deponent.trim() ? deponent.trim() : "[TO BE COMPLETED: the deponent's role]"}. I am competent to swear this affidavit.` },
  ];
  if (statements.length === 0) {
    out.push({ text: `2. ${missing("the deponent's statements: record them on the Evidence tab, in the deponent's own words")}` });
    return out;
  }
  statements.forEach((s, n) => {
    const line = `${s.statement.trim()}`;
    out.push({ text: `${n + 2}. ${line}`, evidenceIds: [s.id] });
  });
  out.push({ text: "The statements above are the deponent's own recorded words, numbered in the order they were given. Nothing was added to them." });
  return out;
}

/** The index of annexures, from the annexure manager. */
export function annexureIndex(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "INDEX OF ANNEXURES", style: "heading" }];
  if (i.annexures.length === 0) {
    out.push({ text: `No annexure is recorded. ${missing("record the annexures on the Filing tab")}` });
    return out;
  }
  i.annexures.forEach((a) => out.push({ text: `${a.label}: ${a.title}` }));
  return out;
}

/** The index of authorities, from the authority table. */
export function authoritiesIndex(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "INDEX OF AUTHORITIES", style: "heading" }];
  const rows = i.authorities;
  if (rows.length === 0) {
    out.push({ text: `No authority is recorded. ${missing("save the authorities relied on, on the Research tab")}` });
    return out;
  }
  for (const a of rows) {
    out.push({ text: `${a.citation}${a.parties ? `, ${a.parties}` : ""}${a.paragraph ? `, paragraph ${a.paragraph}` : ""}${a.proposition ? ` — relied on for: ${a.proposition}` : ""}` });
  }
  return out;
}

/** The appendix of provisions, from the provisions saved to the matter. */
export function provisionsAppendix(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "APPENDIX OF PROVISIONS", style: "heading" }];
  if (i.provisions.length === 0) {
    out.push({ text: `No provision is saved to the matter. ${missing("save the provisions relied on, on the Research tab")}` });
    return out;
  }
  for (const p of i.provisions) {
    out.push({ text: `${p.act}, ${p.section}${p.repealed ? " (recorded as repealed; verify before relying)" : ""}: ${p.title}. Source: ${p.source}.` });
  }
  return out;
}

/** The case summary, from the records. */
export function caseSummaryPart(i: DraftingInput): Block[] {
  const d = i.details;
  const out: Block[] = [
    { text: "CASE SUMMARY", style: "heading" },
    { text: `${d.petitioner || "Petitioner not recorded"} versus ${d.respondent || "Respondent not recorded"}.` },
    { text: `Court: ${d.court || "not recorded"}. Case number: ${d.caseNumber || "not recorded"}. CNR: ${d.cnr || "not recorded"}.` },
    { text: "The confirmed facts of the matter:", style: "heading" },
  ];
  const rows = i.facts.filter((f) => f.status === "confirmed");
  if (rows.length === 0) out.push({ text: "No confirmed fact is recorded." });
  rows.forEach((f, n) => out.push({ text: `${n + 1}. ${f.text.trim()}`, factIds: [f.id] }));
  return out;
}

/** The briefing note for counsel: the summary, the issues, the authorities, the open questions. */
export function briefingNotePart(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "BRIEFING NOTE", style: "heading" }];
  out.push(...caseSummaryPart(i).slice(1));
  out.push({ text: "The accepted issues:", style: "heading" });
  const issues = i.issues.filter((x) => x.status === "accepted");
  if (issues.length === 0) out.push({ text: "No accepted issue is recorded." });
  issues.forEach((x, n) => out.push({ text: `${n + 1}. ${x.text}` }));
  out.push({ text: "The authorities relied on:", style: "heading" });
  out.push(...authoritiesIndex(i).slice(1));
  out.push({ text: "Open questions for counsel:", style: "heading" });
  out.push({ text: "[REVIEW: the questions this matter still needs an answer to]" });
  return out;
}

/** The research memo, from the newest stored memorandum (phase 5). */
export function researchMemoPart(i: DraftingInput): Block[] {
  const out: Block[] = [{ text: "RESEARCH MEMORANDUM", style: "heading" }];
  const m = i.memorandum;
  if (!m) {
    out.push({ text: `No research memorandum is stored. ${missing("write one on the Research tab first")}` });
    return out;
  }
  out.push({ text: m.title });
  for (const paragraph of m.body.split(/\n+/)) {
    const t = paragraph.trim();
    if (t) out.push({ text: t });
  }
  if (m.unresolved.length > 0) out.push({ text: `Unresolved references: ${m.unresolved.join("; ")}.` });
  return out;
}

/** The written submissions frame: the heading and a slot per submission. */
export function writtenSubmissionsPart(i: DraftingInput): Block[] {
  return [
    { text: "WRITTEN SUBMISSIONS", style: "heading" },
    { text: `Submissions on behalf of the ${i.details.petitioner.trim() || missing("party the submissions are for")}:` },
    { text: "1. [REVIEW: the first submission, with its authority and its record source]" },
    { text: "2. [REVIEW: the second submission, with its authority and its record source]" },
    { text: "The submissions above carry their authorities and their record sources when the advocate or the agent writes them; the citation and grounding checks verify each." },
  ];
}

/** A slot: a title and a marker. No generator writes legal text into it. */
export function slot(title: string, what: string): Block[] {
  return [
    { text: title, style: "heading" },
    { text: `[REVIEW: ${what}]` },
  ];
}

// ---- Phase 7 (K6): the hearing brief ----

/** The brief is one page: every section is capped, and no outcome is predicted anywhere in it. */
const BRIEF_ROWS = 5;

export function hearingBriefPart(i: DraftingInput): Block[] {
  const listed = [...i.hearings].reverse().find((h) => h.nextDate) ?? [...i.hearings].reverse()[0];
  const benchQuestions = i.challenges.filter((c) => c.kind === "bench_question" && c.status === "accepted");
  const objections = i.challenges.filter((c) => c.kind === "objection" && c.status === "accepted");
  const out: Block[] = [
    { text: "HEARING BRIEF", style: "center" },
    { text: `Posture: ${i.stage || "[TO BE COMPLETED: the stage of the matter]"}; ${i.proceedingType || "[TO BE COMPLETED: the proceeding]"}. ${i.details.petitioner || "…"} versus ${i.details.respondent || "…"}.` },
  ];
  if (listed) {
    out.push({ text: "What is listed", style: "heading" });
    out.push({ text: `Next: ${listed.nextDate || "[TO BE COMPLETED: the next date]"}${listed.bench ? `, before ${listed.bench}` : ""}.` });
  } else {
    out.push({ text: "What is listed", style: "heading" });
    out.push({ text: "[TO BE COMPLETED: no hearing is recorded yet]" });
  }
  out.push({ text: "The last order's directions", style: "heading" });
  const recordedDirection = [...i.hearings].reverse().find((h) => h.directions.trim() !== "");
  if (i.orderDirections.length === 0 && !recordedDirection) out.push({ text: "No direction of a recorded order is extracted yet." });
  for (const d of i.orderDirections.slice(0, BRIEF_ROWS)) out.push({ text: `- ${d.text} [${d.sourceName}, p. ${d.page}, l. ${d.line}]` });
  if (recordedDirection) out.push({ text: `- ${recordedDirection.directions} [recorded at the hearing of ${recordedDirection.date}]` });
  out.push({ text: "Open items", style: "heading" });
  if (i.openItems.length === 0) out.push({ text: "None open." });
  for (const o of i.openItems.slice(0, BRIEF_ROWS)) out.push({ text: `- [${o.kind}] ${o.detail}` });
  out.push({ text: "Bench questions and answers", style: "heading" });
  if (benchQuestions.length === 0) out.push({ text: "None accepted in the register yet. Prepare them with the rehearsal." });
  for (const q of benchQuestions.slice(0, BRIEF_ROWS)) out.push({ text: `- Q: ${q.text}\n  A: ${q.answer || "[REVIEW: the answer is yours to write]"}` });
  out.push({ text: "Objections of opposing counsel", style: "heading" });
  if (objections.length === 0) out.push({ text: "None accepted in the register yet." });
  for (const o of objections.slice(0, BRIEF_ROWS)) out.push({ text: `- ${o.text}\n  Response: ${o.answer || "[REVIEW: the response is yours to write]"}` });
  out.push({ text: "Challenge register", style: "heading" });
  if (i.challenges.length === 0) out.push({ text: "The register is empty." });
  for (const c of i.challenges.slice(0, BRIEF_ROWS)) out.push({ text: `- [${c.status}] ${c.kind === "bench_question" ? "Bench question" : "Objection"}: ${c.text}` });
  out.push({ text: "No outcome is predicted in this brief. The advocate argues; the court decides." });
  return out;
}

// ---- Phase 7 (K7): the oral outline ----

/** At most four points, strongest first: the standing orders them, then the Elo. */
const OUTLINE_POINTS = 4;

export function oralOutlinePart(i: DraftingInput): Block[] {
  const standing: Record<string, number> = { in: 0, undecided: 1, out: 2 };
  const points = [...i.arguments]
    .filter((a) => a.computed !== "out")
    .sort((a, b) => (standing[a.computed] ?? 3) - (standing[b.computed] ?? 3) || b.elo - a.elo)
    .slice(0, OUTLINE_POINTS);
  const objections = i.challenges.filter((c) => c.kind === "objection" && c.status === "accepted");
  const out: Block[] = [
    { text: "ORAL OUTLINE", style: "center" },
    { text: "Three or four points, strongest first. The order is the advocate's to change." },
    { text: "The points", style: "heading" },
  ];
  if (points.length === 0) out.push({ text: "No accepted argument stands in the Studio yet. Run the loop, and accept the arguments that hold." });
  points.forEach((p, n) => {
    out.push({ text: `${n + 1}. ${p.claim} (${p.computed === "in" ? "stands" : p.computed === "undecided" ? "undecided" : "weakest"})` });
    out.push({ text: `   Note: ${p.reasoning.slice(0, 400)}` });
  });
  out.push({ text: "Rebuttal notes", style: "heading" });
  if (objections.length === 0) out.push({ text: "None accepted in the register yet." });
  for (const o of objections.slice(0, BRIEF_ROWS)) out.push({ text: `- If "${o.text}": ${o.answer || "[REVIEW: the response is yours to write]"}` });
  out.push({ text: "Compilation of authorities, with the paragraphs relied on", style: "heading" });
  const rows = i.authorities;
  if (rows.length === 0) out.push({ text: "No authority is recorded. Save the authorities relied on, on the Research tab." });
  for (const a of rows.slice(0, 10)) out.push({ text: `- ${a.citation}${a.paragraph ? `, paragraph ${a.paragraph}` : ""}${a.parties ? `, ${a.parties}` : ""}` });
  return out;
}
