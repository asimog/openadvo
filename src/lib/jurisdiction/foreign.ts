/**
 * Phase 11 (D4): the foreign element and the route facts it may open. It reads a forum clause or
 * the advocate's words; it never guesses a nationality from a name. A route is a question for the
 * advocate, with its provisions and its source, never a decision. Plain library (decision 6).
 */
import type { ForeignElementInput, ForeignKind, ForeignRoute } from "../../shared/foreign.ts";

/** Country names and adjectives the record may use. India is not foreign. */
const COUNTRIES: Array<[RegExp, string]> = [
  [/\b(united kingdom|u\.?k\.?|england|britain|british|london)\b/i, "United Kingdom"],
  [/\b(united states|u\.?s\.?a?\.?|american|new york|delaware|california|texas)\b/i, "United States"],
  [/\b(singapore|singaporean)\b/i, "Singapore"],
  [/\b(dubai|abu dhabi|u\.?a\.?e\.?|united arab emirates)\b/i, "United Arab Emirates"],
  [/\b(hong kong)\b/i, "Hong Kong"],
  [/\b(australia|australian|sydney|melbourne)\b/i, "Australia"],
  [/\b(canada|canadian|toronto|ontario)\b/i, "Canada"],
  [/\b(germany|german|frankfurt|berlin)\b/i, "Germany"],
  [/\b(france|french|paris)\b/i, "France"],
  [/\b(switzerland|swiss|zurich|geneva)\b/i, "Switzerland"],
  [/\b(netherlands|dutch|amsterdam)\b/i, "Netherlands"],
  [/\b(china|chinese|shanghai|beijing)\b/i, "China"],
  [/\b(japan|japanese|tokyo)\b/i, "Japan"],
  [/\b(mauritius|mauritian)\b/i, "Mauritius"],
  [/\b(nepal|nepalese)\b/i, "Nepal"],
  [/\b(bangladesh|bangladeshi)\b/i, "Bangladesh"],
  [/\b(sri lanka|sri lankan)\b/i, "Sri Lanka"],
  [/\b(pakistan|pakistani)\b/i, "Pakistan"],
  [/\b(bhutan|bhutanese)\b/i, "Bhutan"],
  [/\b(myanmar|burma)\b/i, "Myanmar"],
  [/\b(malaysia|malaysian)\b/i, "Malaysia"],
  [/\b(thailand|thai)\b/i, "Thailand"],
  [/\b(indonesia|indonesian)\b/i, "Indonesia"],
  [/\b(south africa|south african)\b/i, "South Africa"],
  [/\b(kenya|kenyan)\b/i, "Kenya"],
  [/\b(nigeria|nigerian)\b/i, "Nigeria"],
  [/\b(brazil|brazilian)\b/i, "Brazil"],
  [/\b(russia|russian)\b/i, "Russia"],
  [/\b(italy|italian)\b/i, "Italy"],
  [/\b(spain|spanish)\b/i, "Spain"],
  [/\b(sweden|swedish)\b/i, "Sweden"],
  [/\b(norway|norwegian)\b/i, "Norway"],
  [/\b(denmark|danish)\b/i, "Denmark"],
  [/\b(ireland|irish)\b/i, "Ireland"],
  [/\b(new zealand)\b/i, "New Zealand"],
];

/** The country a text names, or null. India is not foreign. */
export function countryIn(text: string): string | null {
  if (/\b(india|indian|delhi|mumbai|bombay|chennai|kolkata|calcutta|bengaluru|bangalore|hyderabad|ahmedabad|pune)\b/i.test(text) && !/foreign/i.test(text)) {
    return null;
  }
  for (const [re, name] of COUNTRIES) if (re.test(text)) return name;
  return null;
}

/** A clause that names a seat, a venue, courts or the governing law outside India. */
export function foreignFromClause(clause: { kind: string; text: string; sourceId: string; anchorId: string }): ForeignElementInput | null {
  const country = countryIn(clause.text);
  if (!country) return null;
  if (clause.kind === "seat" || /seat of (the )?arbitration|arbitration shall be held|seat shall be/i.test(clause.text)) {
    return { kind: "foreign_seat", subject: `the seat or venue named in the clause: ${country}`, detail: clause.text, country, sourceId: clause.sourceId, anchorId: clause.anchorId };
  }
  return { kind: "foreign_party", subject: `the forum clause names ${country}`, detail: clause.text, country, sourceId: clause.sourceId, anchorId: clause.anchorId };
}

/** A party whose recorded name or note names a country outside India. Never a guess from a surname. */
export function foreignFromParty(party: { name: string; note?: string }): ForeignElementInput | null {
  const text = `${party.name} ${party.note ?? ""}`;
  const country = countryIn(text);
  if (!country) return null;
  return { kind: "foreign_party", subject: party.name.trim(), detail: `the party record names ${country}`, country };
}

const ROUTE = (route: string, basis: string, source: string, note = ""): Omit<ForeignRoute, "status"> => ({ route, basis, source, note });

const ROUTES: Record<ForeignKind, Array<Omit<ForeignRoute, "status">>> = {
  foreign_party: [
    ROUTE("Suit against or by a foreign party: the court's jurisdiction and the forum clause", "Section 9 read with Section 20 of the Code of Civil Procedure, 1908, and the forum clause, if any", "Code of Civil Procedure, 1908, Sections 9 and 20"),
    ROUTE("Service of the defendant outside India", "Order V Rule 25 of the Code of Civil Procedure, 1908", "Code of Civil Procedure, 1908, Order V Rule 25"),
    ROUTE("Security for costs where the plaintiff resides outside India", "Order XXV of the Code of Civil Procedure, 1908, and the rules of the court", "Code of Civil Procedure, 1908, Order XXV"),
  ],
  foreign_judgment: [
    ROUTE("Enforcement of a judgment of a foreign court", "Section 13 read with Section 14 of the Code of Civil Procedure, 1908", "Code of Civil Procedure, 1908, Sections 13 and 14"),
    ROUTE("Execution of a decree of a reciprocating territory", "Section 44A of the Code of Civil Procedure, 1908, and the notified reciprocating territories", "Code of Civil Procedure, 1908, Section 44A"),
    ROUTE("The conclusive and inconclusive grounds of a foreign judgment", "Section 13 of the Code of Civil Procedure, 1908: the grounds on which a foreign judgment is not conclusive", "Code of Civil Procedure, 1908, Section 13"),
  ],
  foreign_award: [
    ROUTE("Enforcement of a foreign award", "Sections 44 to 52 of the Arbitration and Conciliation Act, 1996, and the New York Convention", "Arbitration and Conciliation Act, 1996, Part II Chapter II"),
    ROUTE("Refusal of enforcement", "Section 48 of the Arbitration and Conciliation Act, 1996", "Arbitration and Conciliation Act, 1996, Section 48"),
    ROUTE("Enforcement as a decree of the court", "Section 49 of the Arbitration and Conciliation Act, 1996", "Arbitration and Conciliation Act, 1996, Section 49"),
  ],
  foreign_seat: [
    ROUTE("The law of the seat governs the arbitration; the court of the seat supervises it", "The arbitration agreement and the law of the seat named in it", "The arbitration agreement and the law of the seat"),
    ROUTE("Interim relief in India in a foreign-seated arbitration", "Section 9 of the Arbitration and Conciliation Act, 1996", "Arbitration and Conciliation Act, 1996, Section 9"),
    ROUTE("The law governing the arbitration agreement", "The governing-law clause read with the seat", "The arbitration agreement and the governing-law clause"),
  ],
  foreign_asset: [
    ROUTE("Enforcement against an asset outside India", "The law of the place of the asset, and the order the Indian court makes", "The law of the place of the asset"),
    ROUTE("Letters of request for evidence or service abroad", "Section 77 of the Code of Civil Procedure, 1908", "Code of Civil Procedure, 1908, Section 77"),
  ],
};

/** The routes an element may open. The status follows the element: a proposed element's routes are proposed. */
export function routesFor(kinds: readonly ForeignKind[], status: "proposed" | "confirmed"): ForeignRoute[] {
  const out: ForeignRoute[] = [];
  const seen = new Set<string>();
  for (const kind of kinds) {
    for (const r of ROUTES[kind] ?? []) {
      const key = `${r.route}|${r.basis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...r, status, note: "A route is a question for you: verify the current provision, the treaty position and the facts it needs." });
    }
  }
  return out;
}

/** Every route the five kinds may open, for the panel's empty state. It asserts nothing about the matter. */
export function allRoutes(): ForeignRoute[] {
  return routesFor(["foreign_party", "foreign_judgment", "foreign_award", "foreign_seat", "foreign_asset"], "proposed");
}
