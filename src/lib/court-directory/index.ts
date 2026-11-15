/**
 * B1: the directory of courts and tribunals, shipped with the application so onboarding works
 * offline (architecture.md section 8). Compiled by the engineer from public knowledge, not from
 * an official list: every row is "advocate to verify" until the advocate corrects it. The appeal
 * route is a pointer to the next forum; where the route depends on the subject it says so.
 * District judiciary is one row per state or union territory, not one row per court.
 * Plain library (decision 6).
 */

export type CourtKind = "supreme_court" | "high_court" | "district_judiciary" | "tribunal" | "appellate_tribunal" | "consumer_commission" | "regulatory_authority";

export interface DirectoryCourt {
  /** Stable id: "in.sc", "in.hc.delhi", "in.dj.delhi", "in.t.nclt". */
  id: string;
  name: string;
  kind: CourtKind;
  /** The seat (principal bench). */
  seat: string;
  /** Other benches or seats. */
  benches: string[];
  /** States and union territories the court serves. Empty for a national forum. */
  territory: string[];
  /** The next forum on appeal, as a directory id; null for the Supreme Court. */
  appealTo: string | null;
  /** When the route depends on the subject or the order, the words that say so. */
  appealNote?: string;
  /** Kinds of court inside a district judiciary. */
  courts?: string[];
  website?: string;
}

export const DIRECTORY_VERSION = "2026-11-16";
export const DIRECTORY_NOTE = "Compiled by the engineer from public knowledge; advocate to verify.";

const HC: Array<[string, string, string, string[], string[], string?]> = [
  ["allahabad", "High Court of Judicature at Allahabad", "Prayagraj", ["Lucknow"], ["Uttar Pradesh"]],
  ["andhra-pradesh", "High Court of Andhra Pradesh", "Amaravati", [], ["Andhra Pradesh"]],
  ["bombay", "High Court of Bombay", "Mumbai", ["Nagpur", "Aurangabad", "Goa (Panaji)"], ["Maharashtra", "Goa", "Dadra and Nagar Haveli and Daman and Diu"]],
  ["calcutta", "High Court at Calcutta", "Kolkata", ["Port Blair (circuit)", "Jalpaiguri (circuit)"], ["West Bengal", "Andaman and Nicobar Islands"]],
  ["chhattisgarh", "High Court of Chhattisgarh", "Bilaspur", [], ["Chhattisgarh"]],
  ["delhi", "High Court of Delhi", "New Delhi", [], ["Delhi"], "https://delhihighcourt.nic.in/"],
  ["gauhati", "Gauhati High Court", "Guwahati", ["Kohima", "Aizawl", "Itanagar"], ["Assam", "Nagaland", "Mizoram", "Arunachal Pradesh"]],
  ["gujarat", "High Court of Gujarat", "Ahmedabad", [], ["Gujarat"]],
  ["himachal-pradesh", "High Court of Himachal Pradesh", "Shimla", [], ["Himachal Pradesh"]],
  ["jammu-kashmir-ladakh", "High Court of Jammu & Kashmir and Ladakh", "Srinagar and Jammu", [], ["Jammu and Kashmir", "Ladakh"]],
  ["jharkhand", "High Court of Jharkhand", "Ranchi", [], ["Jharkhand"]],
  ["karnataka", "High Court of Karnataka", "Bengaluru", ["Dharwad", "Kalaburagi"], ["Karnataka"]],
  ["kerala", "High Court of Kerala", "Kochi", [], ["Kerala", "Lakshadweep"]],
  ["madhya-pradesh", "High Court of Madhya Pradesh", "Jabalpur", ["Indore", "Gwalior"], ["Madhya Pradesh"]],
  ["madras", "High Court of Madras", "Chennai", ["Madurai"], ["Tamil Nadu", "Puducherry"]],
  ["manipur", "High Court of Manipur", "Imphal", [], ["Manipur"]],
  ["meghalaya", "High Court of Meghalaya", "Shillong", [], ["Meghalaya"]],
  ["orissa", "High Court of Orissa", "Cuttack", [], ["Odisha"]],
  ["patna", "High Court of Patna", "Patna", [], ["Bihar"]],
  ["punjab-haryana", "High Court of Punjab and Haryana", "Chandigarh", [], ["Punjab", "Haryana", "Chandigarh"]],
  ["rajasthan", "High Court of Rajasthan", "Jodhpur", ["Jaipur"], ["Rajasthan"]],
  ["sikkim", "High Court of Sikkim", "Gangtok", [], ["Sikkim"]],
  ["telangana", "High Court for the State of Telangana", "Hyderabad", [], ["Telangana"]],
  ["tripura", "High Court of Tripura", "Agartala", [], ["Tripura"]],
  ["uttarakhand", "High Court of Uttarakhand", "Nainital", [], ["Uttarakhand"]],
];

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const DISTRICT_COURTS = ["District and Sessions Courts", "Civil Judges (Senior and Junior Division)", "Judicial and Metropolitan Magistrates", "Family Courts", "Commercial Courts", "Special Courts"];

const TRIBUNALS: DirectoryCourt[] = [
  { id: "in.t.nclt", name: "National Company Law Tribunal", kind: "tribunal", seat: "New Delhi", benches: ["Benches across the country"], territory: [], appealTo: "in.t.nclat" },
  { id: "in.t.nclat", name: "National Company Law Appellate Tribunal", kind: "appellate_tribunal", seat: "New Delhi", benches: ["Chennai"], territory: [], appealTo: "in.sc" },
  { id: "in.t.drt", name: "Debts Recovery Tribunals", kind: "tribunal", seat: "Several seats", benches: [], territory: [], appealTo: "in.t.drat" },
  { id: "in.t.drat", name: "Debts Recovery Appellate Tribunals", kind: "appellate_tribunal", seat: "Several seats", benches: [], territory: [], appealTo: null, appealNote: "Review by the High Court under its writ jurisdiction; advocate to verify." },
  { id: "in.t.cat", name: "Central Administrative Tribunal", kind: "tribunal", seat: "New Delhi (Principal Bench)", benches: ["Benches across the country"], territory: [], appealTo: null, appealNote: "Review by the High Court with territorial jurisdiction; advocate to verify." },
  { id: "in.t.sat", name: "Securities Appellate Tribunal", kind: "appellate_tribunal", seat: "Mumbai", benches: [], territory: [], appealTo: "in.sc" },
  { id: "in.t.aft", name: "Armed Forces Tribunal", kind: "tribunal", seat: "New Delhi (Principal Bench)", benches: ["Regional benches"], territory: [], appealTo: "in.sc" },
  { id: "in.t.ngt", name: "National Green Tribunal", kind: "tribunal", seat: "New Delhi (Principal Bench)", benches: ["Bhopal", "Pune", "Kolkata", "Chennai"], territory: [], appealTo: "in.sc" },
  { id: "in.t.itat", name: "Income Tax Appellate Tribunal", kind: "appellate_tribunal", seat: "Mumbai", benches: ["Benches across the country"], territory: [], appealTo: null, appealNote: "Appeal to the High Court on a substantial question of law; advocate to verify." },
  { id: "in.t.cestat", name: "Customs, Excise and Service Tax Appellate Tribunal", kind: "appellate_tribunal", seat: "New Delhi", benches: ["Regional benches"], territory: [], appealTo: null, appealNote: "Appeal to the High Court or the Supreme Court, depending on the question; advocate to verify." },
  { id: "in.t.aptel", name: "Appellate Tribunal for Electricity", kind: "appellate_tribunal", seat: "New Delhi", benches: [], territory: [], appealTo: "in.sc" },
  { id: "in.t.tdsat", name: "Telecom Disputes Settlement and Appellate Tribunal", kind: "appellate_tribunal", seat: "New Delhi", benches: [], territory: [], appealTo: "in.sc" },
  { id: "in.cc.ncdrc", name: "National Consumer Disputes Redressal Commission", kind: "consumer_commission", seat: "New Delhi", benches: [], territory: [], appealTo: "in.sc" },
];

function build(): DirectoryCourt[] {
  const out: DirectoryCourt[] = [
    { id: "in.sc", name: "Supreme Court of India", kind: "supreme_court", seat: "New Delhi", benches: [], territory: [], appealTo: null, website: "https://www.sci.gov.in/" },
  ];
  const stateHc = new Map<string, string>();
  for (const [key, name, seat, benches, territory, website] of HC) {
    const id = `in.hc.${key}`;
    out.push({ id, name, kind: "high_court", seat, benches, territory, appealTo: "in.sc", ...(website ? { website } : {}) });
    for (const t of territory) stateHc.set(t, id);
  }
  for (const [state, hc] of [...stateHc.entries()].sort()) {
    out.push({ id: `in.dj.${slug(state)}`, name: `District courts of ${state}`, kind: "district_judiciary", seat: state, benches: [], territory: [state], appealTo: hc, courts: DISTRICT_COURTS });
    out.push({ id: `in.cc.state.${slug(state)}`, name: `State Consumer Disputes Redressal Commission, ${state}`, kind: "consumer_commission", seat: state, benches: [], territory: [state], appealTo: "in.cc.ncdrc" });
    out.push({ id: `in.ra.rera.${slug(state)}`, name: `Real Estate Regulatory Authority, ${state}`, kind: "regulatory_authority", seat: state, benches: [], territory: [state], appealTo: null, appealNote: "Appeal to the state's Real Estate Appellate Tribunal, then to the High Court; advocate to verify." });
  }
  out.push(...TRIBUNALS);
  return out;
}

export const DIRECTORY: readonly DirectoryCourt[] = build();

export function court(id: string): DirectoryCourt | undefined {
  return DIRECTORY.find((c) => c.id === id);
}

/** The appeal route from a court: the court itself, then each next forum. */
export function appealRoute(id: string): DirectoryCourt[] {
  const out: DirectoryCourt[] = [];
  let at = court(id);
  while (at && !out.includes(at) && out.length < 6) {
    out.push(at);
    at = at.appealTo ? court(at.appealTo) : undefined;
  }
  return out;
}

/** Search the directory by name, seat, bench or territory. */
export function searchDirectory(q: string, limit = 30): DirectoryCourt[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return DIRECTORY.slice(0, limit);
  return DIRECTORY.filter((c) => {
    const hay = [c.name, c.seat, ...c.benches, ...c.territory, c.id].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}
