/**
 * D1 and D3: the jurisdiction report and the forum clauses. The report is built from the matter
 * profile, the court directory, the court packs, the limitation record and the record's own
 * clauses. "Undetermined" is a valid field. Plain library.
 */
import type { DirectoryCourt } from "../court-directory/index.ts";
import type { FactRecord, ForumClause, JurisdictionReport } from "../../shared/evidence.ts";
import type { EvidenceLine } from "./facts.ts";

const CLAUSES: Array<[RegExp, ForumClause["kind"]]> = [
  [/\bexclusive\s+jurisdiction\b/i, "exclusive"],
  [/\bnon[-\s]?exclusive\s+jurisdiction\b/i, "non_exclusive"],
  [/\bseat\s+of\s+(?:the\s+)?arbitration\b/i, "seat"],
  [/\bvenue\s+of\s+(?:the\s+)?arbitration\b/i, "venue"],
  [/\bcourts?\s+(?:at|of|in)\s+[A-Z][A-Za-z\s,.-]{2,60}\s+(?:shall\s+)?have\s+jurisdiction\b/i, "courts"],
  [/\bsubject\s+to\s+the\s+(?:exclusive\s+)?jurisdiction\s+of\b/i, "exclusive"],
];

export function extractForumClauses(lines: EvidenceLine[]): Array<Omit<ForumClause, "id">> {
  const out: Array<Omit<ForumClause, "id">> = [];
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, " ").trim();
    for (const [re, kind] of CLAUSES) {
      const m = re.exec(text);
      if (!m) continue;
      out.push({ sourceId: l.sourceId, sourceName: l.sourceName, text: text.slice(0, 1000), kind, anchorId: l.anchorId, page: l.page, line: l.line });
      break;
    }
    if (out.length >= 100) break;
  }
  return out;
}

export interface JurisdictionInput {
  court: DirectoryCourt | null;
  profile: { court: string; caseType: string; proceeding: string; relief: string; cnr: string };
  appealRoute: Array<{ name: string; appealNote: string | null }>;
  rules: string[];
  provisions: string[];
  limitation: string;
  forumClauses: ForumClause[];
  facts: FactRecord[];
}

const KINDS: Record<string, string> = {
  supreme_court: "Supreme Court",
  high_court: "High Court",
  district_judiciary: "District judiciary",
  tribunal: "Tribunal",
  appellate_tribunal: "Appellate tribunal",
  consumer_commission: "Consumer commission",
  regulatory_authority: "Regulatory authority",
};

export function buildJurisdictionReport(input: JurisdictionInput): JurisdictionReport {
  const basis: string[] = [];
  const unresolved: string[] = [];
  const court = input.court;
  const forum = court?.name || input.profile.court || "";
  if (forum) basis.push(`The forum is the court recorded for the matter: ${forum}.`);
  else unresolved.push("The court is not recorded.");

  const courtType = court ? (KINDS[court.kind] ?? court.kind) : "";
  if (courtType) basis.push(`The directory gives the court type: ${courtType}.`);

  const exclusive = input.forumClauses.find((c) => c.kind === "exclusive");
  const territorial = court?.territory.length
    ? `The court serves ${court.territory.join(", ")}.`
    : court?.seat
      ? `The court sits at ${court.seat}.`
      : "";
  if (territorial) basis.push(territorial);
  if (exclusive) basis.push(`The record has an exclusive-jurisdiction clause at ${exclusive.sourceName}, p. ${exclusive.page}, l. ${exclusive.line}.`);

  const subject = input.profile.caseType || input.profile.proceeding || "";
  if (subject) basis.push(`The case type or proceeding recorded is ${subject}.`);
  else unresolved.push("The case type and proceeding are not recorded.");

  const provisions = [...new Set(input.provisions)].filter(Boolean);
  if (provisions.length) basis.push(`${provisions.length} provision(s) are recorded in the court's pack.`);

  const alternatives = new Set<string>();
  if (court?.kind === "tribunal") alternatives.add("The High Court under its writ jurisdiction, where the tribunal's order is challenged.");
  if (court?.kind === "district_judiciary") alternatives.add("The High Court, in its appellate or revisional jurisdiction, where the law provides it.");
  if (court?.kind === "high_court") alternatives.add("The Supreme Court, in appeal or special leave, where the law provides it.");
  if (exclusive) alternatives.add("The forum named in the exclusive-jurisdiction clause is the alternative to this one; the advocate decides which applies.");
  if (alternatives.size) basis.push(`${alternatives.size} alternative forum(s) are noted.`);

  const limitation = input.limitation || "Undetermined: no limitation working is confirmed.";
  if (!input.limitation) unresolved.push("Limitation is not computed and confirmed.");

  const appealRoute = input.appealRoute.length ? input.appealRoute.map((r) => r.name).join(" → ") : court?.appealTo ? court.appealTo : "Undetermined";
  if (input.appealRoute.length) basis.push(`The directory gives an appeal route of ${input.appealRoute.length} step(s).`);

  const rules = [...new Set(input.rules)].filter(Boolean);
  if (rules.length) basis.push(`${rules.length} court rule list(s) are recorded.`);

  for (const f of input.facts.filter((x) => x.type === "missing" && x.status !== "rejected")) unresolved.push(f.text);
  if (!input.profile.cnr) unresolved.push("The CNR is not recorded.");

  const undetermined = !forum || !subject || unresolved.length > 0;
  return {
    forum,
    courtType,
    territorialBasis: territorial || "Undetermined: the court's territory is not in the directory.",
    subjectBasis: subject ? `The matter is recorded as ${subject}.` : "Undetermined: the case type and proceeding are not recorded.",
    provisions,
    alternativeForums: [...alternatives],
    limitation,
    appealRoute,
    applicableRules: rules,
    unresolvedFacts: [...new Set(unresolved)].slice(0, 30),
    undetermined,
    basis,
    updatedAt: new Date().toISOString(),
  };
}
