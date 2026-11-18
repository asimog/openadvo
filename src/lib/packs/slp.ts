/**
 * Phase 8 (Q3): the SLP pack's generators. They moved here from `src/lib/drafting/structured.ts`
 * with their text unchanged, so the SLP petition and the condonation application render exactly as
 * before. The pack owns the SLP work; the drafting library owns the generic block builders.
 */
import type { Block } from "../drafting/structured.ts";
import { dmy, missing } from "../drafting/structured.ts";

/** The SLP pack's document titles. The core names no SLP text of its own (Q3). */
export const SLP_TITLES = {
  petition: "PETITION FOR SPECIAL LEAVE TO APPEAL",
  condonation: "APPLICATION FOR CONDONATION OF DELAY",
} as const;

/** The prayer paragraph that the filing check compares with the matter details. */
export const PRAYER_LEAD = "(a) grant special leave to appeal against the impugned final judgment and order dated";

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
  /** V2-6: the interim relief sought, in the advocate's words. Empty when none. */
  interimRelief?: string;
}

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
  );
  const interim = (i.interimRelief ?? "").trim();
  if (interim) {
    blocks.push(
      { text: "7. PRAYER FOR INTERIM RELIEF", style: "heading" },
      { text: "It is most respectfully prayed that, pending the hearing and final disposal of this petition, this Hon'ble Court may be pleased to:" },
      { text: `(a) ${interim}; and` },
      { text: "(b) pass such other order or orders as this Hon'ble Court may deem fit and proper." },
    );
  }
  blocks.push(
    { text: "FILED BY: ______________________ Advocate-on-Record for the Petitioner" },
    { text: "FILED ON: ______________" },
  );
  return blocks;
}

export interface CondonationInput {
  petitioner: string;
  respondent: string;
  court: string;
  caseNumber: string;
  impugnedDate: string | null;
  /** The last day of limitation from the confirmed working, and the days of delay on `asOf`. */
  deadline: string;
  delayDays: number;
  asOf: string;
  year: number;
}

/**
 * V2-6: the application for condonation of delay. Form text and recorded figures only. The
 * reasons for the delay are the advocate's; the generator writes a marker in their place.
 */
export function condonationBlocks(i: CondonationInput): Block[] {
  const pet = i.petitioner.trim() || missing("petitioner");
  const res = i.respondent.trim() || missing("respondent");
  const court = i.court.trim() || missing("High Court");
  const caseNo = i.caseNumber.trim() || missing("High Court case number");
  const date = i.impugnedDate ? dmy(i.impugnedDate) : missing("date of the impugned judgment");
  return [
    { text: "IN THE SUPREME COURT OF INDIA", style: "center" },
    { text: "CIVIL APPELLATE JURISDICTION", style: "center" },
    { text: `I.A. NO. ______ OF ${i.year}`, style: "center" },
    { text: `IN SPECIAL LEAVE PETITION (CIVIL) NO. ______ OF ${i.year}`, style: "center" },
    { text: "IN THE MATTER OF:" },
    { text: `${pet} … Petitioner` },
    { text: "Versus", style: "center" },
    { text: `${res} … Respondent` },
    { text: "APPLICATION FOR CONDONATION OF DELAY IN FILING THE SPECIAL LEAVE PETITION", style: "heading" },
    { text: "To, The Hon'ble the Chief Justice of India and His Companion Justices of the Supreme Court of India." },
    { text: "The humble application of the Petitioner above named most respectfully showeth:" },
    { text: `1. The Petitioner has filed the accompanying Special Leave Petition against the final judgment and order dated ${date} passed by the ${court} in ${caseNo}.` },
    { text: `2. As computed in the limitation working confirmed by the advocate, the last day of limitation was ${dmy(i.deadline)}. On ${dmy(i.asOf)} the delay is ${i.delayDays} day(s).` },
    { text: `3. The reasons for the delay: ${missing("the reasons for the delay")}` },
    { text: "4. The delay is neither intentional nor deliberate." },
    { text: "PRAYER", style: "heading" },
    { text: `It is most respectfully prayed that this Hon'ble Court may be pleased to condone the delay of ${i.delayDays} day(s) in filing the accompanying Special Leave Petition, and pass such other order or orders as this Hon'ble Court may deem fit and proper.` },
    { text: "FILED BY: ______________________ Advocate-on-Record for the Petitioner" },
    { text: "FILED ON: ______________" },
  ];
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
