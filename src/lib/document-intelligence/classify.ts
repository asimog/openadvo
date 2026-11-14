/**
 * V2-2: propose a document type from the first page. Fixed rules, no model. The proposal is a
 * candidate; the advocate confirms it or sets another type. Plain library. Spec: docs/specs/v2.md.
 */

export const DOC_TYPES = [
  "judgment",
  "order",
  "fir",
  "charge_sheet",
  "petition",
  "application",
  "affidavit",
  "reply",
  "notice",
  "letter",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  judgment: "Judgment",
  order: "Order",
  fir: "First information report",
  charge_sheet: "Charge-sheet",
  petition: "Petition",
  application: "Application",
  affidavit: "Affidavit",
  reply: "Reply",
  notice: "Notice",
  letter: "Letter",
  other: "Other",
};

export const CLASSIFY_METHOD = "type-rules-v1";

/** Rules in priority order. The first rule that matches the heading wins; else the first that matches the page. */
const RULES: Array<{ type: DocType; re: RegExp }> = [
  { type: "fir", re: /first\s+information\s+report|\bF\.?\s?I\.?\s?R\.?\s+No\b/i },
  { type: "charge_sheet", re: /charge[\s-]?sheet|final\s+report\s+under\s+section\s+173/i },
  { type: "affidavit", re: /\baffidavit\b|solemnly\s+affirm|\bdeponent\b/i },
  { type: "reply", re: /\breply\b|\brejoinder\b|written\s+statement/i },
  { type: "judgment", re: /\bjudg(?:e)?ment\b|J\s?U\s?D\s?G\s?M\s?E\s?N\s?T/i },
  { type: "order", re: /\border\b|\bcoram\b/i },
  { type: "application", re: /\bapplication\b|\bI\.?A\.?\s+No\b/i },
  { type: "petition", re: /\bpetition\b/i },
  { type: "notice", re: /\bnotice\b/i },
  { type: "letter", re: /\bdear\s+(?:sir|madam)\b|\byours\s+(?:faithfully|sincerely|truly)\b/i },
];

/** The heading is the first lines of the page, where a document names itself. */
const HEADING_LINES = 12;

export interface TypeProposal {
  type: DocType;
  /** The words that matched, and where ("heading" or "page"); empty for "other". */
  matched: string;
}

export function classifyDocument(firstPageText: string): TypeProposal {
  const lines = firstPageText.split("\n");
  const heading = lines.slice(0, HEADING_LINES).join("\n");
  for (const [area, text] of [["heading", heading], ["page", firstPageText]] as const) {
    for (const r of RULES) {
      const m = r.re.exec(text);
      if (m) return { type: r.type, matched: `"${m[0].replace(/\s+/g, " ")}" in the ${area}` };
    }
  }
  return { type: "other", matched: "" };
}

export function isDocType(s: string): s is DocType {
  return (DOC_TYPES as readonly string[]).includes(s);
}
