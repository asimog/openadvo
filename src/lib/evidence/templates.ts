/** H12: record-table templates per proceeding. The advocate adds the columns; the agent fills them. */
import type { RecordTemplate } from "../../shared/evidence.ts";

export const RECORD_TEMPLATES: RecordTemplate[] = [
  {
    key: "charge_sheet_witnesses",
    title: "Charge-sheet witnesses",
    proceeding: "criminal",
    columns: ["Witness number", "Name", "What the witness says", "Date of statement", "Exhibit or document", "Contradiction with another statement"],
  },
  {
    key: "fir_ingredients",
    title: "FIR ingredients",
    proceeding: "criminal",
    columns: ["Ingredient of the offence", "Accused", "Date and place", "Evidence", "Witness", "Denied by the accused"],
  },
  {
    key: "bail_factors",
    title: "Bail application",
    proceeding: "bail",
    columns: ["Offence and section", "Custody since", "Criminal history", "Investigation stage", "Parity with a co-accused", "Risk of flight or tampering"],
  },
  {
    key: "plaint_admissions",
    title: "Plaint and written-statement admissions",
    proceeding: "civil",
    columns: ["Plaint allegation", "Written-statement response", "Admitted or denied", "Document", "Witness"],
  },
  {
    key: "written_statement",
    title: "Written-statement admissions",
    proceeding: "civil",
    columns: ["Paragraph of the plaint", "Reply in the written statement", "Admission", "Denial", "Source"],
  },
  {
    key: "writ_maintainability",
    title: "Writ maintainability",
    proceeding: "writ",
    columns: ["Impugned action", "Date of the action", "Alternative remedy", "Delay and explanation", "Fundamental or legal right", "Territorial nexus"],
  },
  {
    key: "appeal_grounds",
    title: "Appeal",
    proceeding: "appeal",
    columns: ["Impugned finding", "Date", "Ground", "Evidence missed", "Authority", "Limitation"],
  },
  {
    key: "limitation",
    title: "Limitation working",
    proceeding: "any",
    columns: ["Starting event", "Date", "Days allowed", "Exclusions", "Last day", "Source of the rule"],
  },
  {
    key: "interim_relief",
    title: "Conditions for interim relief",
    proceeding: "interim",
    columns: ["Prima facie case", "Balance of convenience", "Irreparable injury"],
  },
];

export function templatesFor(proceeding: string): RecordTemplate[] {
  const p = proceeding.toLowerCase();
  if (/interim|injunction|stay/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "interim");
  if (/bail/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "bail" || t.proceeding === "any");
  if (/writ|article 226|article 32/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "writ" || t.proceeding === "any");
  if (/appeal|slp|special leave/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "appeal" || t.proceeding === "any");
  if (/civil|suit|plaint/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "civil" || t.proceeding === "any");
  if (/criminal|charge|fir|quash/.test(p)) return RECORD_TEMPLATES.filter((t) => t.proceeding === "criminal" || t.proceeding === "any");
  const exact = RECORD_TEMPLATES.filter((t) => t.proceeding === p || t.proceeding === "any");
  return exact.length ? exact : RECORD_TEMPLATES.filter((t) => t.proceeding === "any");
}

export function template(key: string): RecordTemplate | undefined {
  return RECORD_TEMPLATES.find((t) => t.key === key);
}

/**
 * Phase 7 (K3): the gaps of a record-table chart. A column with no confirmed cell across the
 * record is a gap: the element has no anchored evidence. A gap is named, never guessed at.
 */
export function recordGaps(columns: Array<{ id: string; question: string }>, cells: Array<{ columnId: string; status: string }>): Array<{ columnId: string; question: string }> {
  const confirmed = new Set(cells.filter((c) => c.status === "confirmed").map((c) => c.columnId));
  return columns.filter((c) => !confirmed.has(c.id)).map((c) => ({ columnId: c.id, question: c.question }));
}
