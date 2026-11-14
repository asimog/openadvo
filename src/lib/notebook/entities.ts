/**
 * V5-6: entities by fixed rules: parties (from cause titles), statutory references, case
 * numbers, amounts and citation mentions, each with its line anchor. Derived from the stored
 * lines on demand; nothing here is a fact until the advocate relies on it. Plain library.
 */

export type EntityKind = "party" | "statute" | "case_number" | "amount" | "citation";

export interface Entity {
  kind: EntityKind;
  /** The words as written. */
  text: string;
  /** A normalised value for grouping: "s. 302 IPC", "CRL.M.C. 1234/2023", "10000". */
  value: string;
  anchorId: string;
  sourceId: string;
  page: number;
  line: number;
}

export interface EntityLine {
  anchorId: string;
  sourceId: string;
  page: number;
  line: number;
  text: string;
}

const ACTS: Array<[RegExp, string]> = [
  [/\b(?:indian\s+penal\s+code|i\.?\s?p\.?\s?c\.?)\b/i, "IPC"],
  [/\b(?:code\s+of\s+criminal\s+procedure|cr\.?\s?p\.?\s?c\.?)\b/i, "CrPC"],
  [/\b(?:bharatiya\s+nyaya\s+sanhita|b\.?n\.?s\.?)\b/i, "BNS"],
  [/\b(?:bharatiya\s+nagarik\s+suraksha\s+sanhita|b\.?n\.?s\.?s\.?)\b/i, "BNSS"],
  [/\b(?:bharatiya\s+sakshya\s+adhiniyam|b\.?s\.?a\.?)\b/i, "BSA"],
  [/\b(?:code\s+of\s+civil\s+procedure|c\.?\s?p\.?\s?c\.?)\b/i, "CPC"],
  [/\b(?:indian\s+)?evidence\s+act\b/i, "Evidence Act"],
  [/\bconstitution(?:\s+of\s+india)?\b/i, "Constitution"],
  [/\bN\.?D\.?P\.?S\.?(?:\s+Act)?\b/, "NDPS Act"],
  [/\bP\.?M\.?L\.?A\.?\b/, "PMLA"],
];

function actName(text: string): string | null {
  for (const [re, name] of ACTS) if (re.test(text)) return name;
  const m = /\b(?:of\s+)?(?:the\s+)?([A-Z][A-Za-z().,'\s]{2,80}?(?:Act|Code|Sanhita|Adhiniyam))(?:,?\s*(\d{4}))?/.exec(text);
  return m ? `${m[1].trim()}${m[2] ? `, ${m[2]}` : ""}` : null;
}

const SECTION = /\b(?:sections?|secs?\.|s\.|u\/s\.?|under\s+section)\s*(\d{1,4}[A-Z]?(?:\s*\(\s*\d+[a-z]?\s*\))*)((?:\s*(?:,|and|&|\/)\s*\d{1,4}[A-Z]?)*)([^.;]{0,90})/gi;
const ARTICLE = /\barticles?\s+(\d{1,3}[A-Z]?(?:\s*\(\s*\d+\s*\))?)(?:\s+of\s+the\s+constitution(?:\s+of\s+india)?)?/gi;
const CASE_NO =
  /\b((?:Special\s+Leave\s+Petition|S\.?L\.?P\.?|Criminal\s+Appeal|Civil\s+Appeal|Crl\.?\s*A\.?|C\.?A\.?|Writ\s+Petition|W\.?P\.?|Crl\.?\s*M\.?\s*C\.?|Bail\s+Application|Crl\.?\s*Rev\.?|Criminal\s+Revision|Review\s+Petition|Suit|F\.?I\.?R\.?|Case\s+Crime)(?:\s*\((?:C|Crl|Civil|Criminal|C\)|Crl\))\)?)?\.?\s*(?:No\.?|Number)?\s*)(\d{1,7})\s*(?:of|\/)\s*(\d{4})/gi;
const AMOUNT = /(?:\bRs\.?|\bINR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:\/-)?)(?:\s*(lakhs?|crores?))?/gi;
const CITATIONS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/\b(\d{4})\s*INSC\s*(\d{1,5})\b/gi, (m) => `${m[1]} INSC ${m[2]}`],
  [/\((\d{4})\)\s*(\d{1,3})\s*SCC\s*(\d{1,5})\b/gi, (m) => `(${m[1]}) ${m[2]} SCC ${m[3]}`],
  [/\bAIR\s*(\d{4})\s*SC\s*(\d{1,5})\b/gi, (m) => `AIR ${m[1]} SC ${m[2]}`],
  [/\[(\d{4})\]\s*(\d{1,3})\s*S\.?C\.?R\.?\s*(\d{1,5})\b/gi, (m) => `[${m[1]}] ${m[2]} SCR ${m[3]}`],
];
const CAUSE_TITLE = /^\s*(.{3,120}?)\s+(?:v\.|vs\.?|versus)\s+(.{3,120}?)\s*(?:\.{3}|…)?\s*(?:respondents?|petitioners?|appellants?)?\s*$/i;

function caseKind(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/\b(No\.?|Number)\s*$/i, "").replace(/\.$/, "").trim().toUpperCase();
}

export function lineEntities(l: EntityLine): Entity[] {
  const out: Entity[] = [];
  const add = (kind: EntityKind, text: string, value: string) => {
    if (!out.some((e) => e.kind === kind && e.value === value)) out.push({ kind, text: text.trim(), value, anchorId: l.anchorId, sourceId: l.sourceId, page: l.page, line: l.line });
  };
  for (const m of l.text.matchAll(SECTION)) {
    const act = actName(m[3] ?? "") ?? "(Act not named on the line)";
    const nums = [m[1], ...(m[2] ?? "").split(/,|and|&|\//).map((x) => x.trim()).filter(Boolean)];
    for (const n of nums) add("statute", m[0], `s. ${n.replace(/\s+/g, "")} ${act}`);
  }
  for (const m of l.text.matchAll(ARTICLE)) add("statute", m[0], `Art. ${m[1].replace(/\s+/g, "")} Constitution`);
  for (const m of l.text.matchAll(CASE_NO)) add("case_number", m[0], `${caseKind(m[1])} ${Number(m[2])}/${m[3]}`);
  for (const m of l.text.matchAll(AMOUNT)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base) || base === 0) continue;
    const mult = /lakh/i.test(m[2] ?? "") ? 1e5 : /crore/i.test(m[2] ?? "") ? 1e7 : 1;
    add("amount", m[0], String(Math.round(base * mult * 100) / 100));
  }
  for (const [re, norm] of CITATIONS) {
    re.lastIndex = 0;
    for (let m = re.exec(l.text); m; m = re.exec(l.text)) add("citation", m[0], norm(m));
  }
  const ct = CAUSE_TITLE.exec(l.text);
  if (ct && !/\d{2}[./-]\d{2}/.test(l.text) && l.text.length < 200) {
    add("party", ct[1], ct[1].replace(/\s+/g, " ").trim().toUpperCase());
    add("party", ct[2], ct[2].replace(/\s+/g, " ").replace(/\s*(?:\.{3}|…).*$/, "").trim().toUpperCase());
  }
  return out;
}

export function extractEntities(lines: EntityLine[]): Entity[] {
  return lines.flatMap(lineEntities);
}

/**
 * The same case kind and number given with different years, across the record. Flagged for the
 * advocate; never resolved here.
 */
export function caseNumberConflicts(entities: Entity[]): Array<{ key: string; values: string[]; anchors: string[] }> {
  const groups = new Map<string, Map<string, string[]>>();
  for (const e of entities.filter((x) => x.kind === "case_number")) {
    const m = /^(.*) (\d+)\/(\d{4})$/.exec(e.value);
    if (!m) continue;
    const key = `${m[1]} ${m[2]}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key)!;
    g.set(e.value, [...(g.get(e.value) ?? []), e.anchorId]);
  }
  return [...groups].filter(([, g]) => g.size > 1).map(([key, g]) => ({ key, values: [...g.keys()], anchors: [...g.values()].flat() }));
}
