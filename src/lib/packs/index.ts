/**
 * Phase 8: the practice-pack registry (docs/specs/practice-packs.md section 2). A pack is checked
 * content; this library selects the pack and proceeding of a matter, gives the filing plan, and
 * refuses a skill outside its pack. No filesystem and no Electron (decision 6).
 */
import { PACK_IDS, type PackChoice, type PackFilingPlan, type PackProceeding, type PackSummary, type PracticePack } from "../../shared/packs.ts";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const norm = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** A matter profile, as the pack choice reads it. */
export interface PackSubject {
  practiceArea: string;
  caseType: string;
  proceeding: string;
  court: string;
}

/**
 * Check one pack file. Returns the pack, or null and the errors. A pack may not state a legal
 * decision or a matter fact; it holds the fields of docs/skills.md section 2.6 only.
 */
export function checkPack(raw: unknown): { pack: PracticePack | null; errors: string[] } {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  if (!(PACK_IDS as readonly string[]).includes(id)) errors.push(`id must be one of ${PACK_IDS.join(", ")}`);
  if (!/^\d+\.\d+\.\d+$/.test(str(o.version))) errors.push("version must be n.n.n");
  if (!str(o.title)) errors.push("title is required");
  const practice = strs(o.practice);
  if (practice.length === 0) errors.push("practice must name at least one practice area");
  const courts = strs(o.courts);
  if (courts.length === 0) errors.push("courts must name at least one court of the directory");
  const proceedingKeys = new Set<string>();
  const proceedings: PackProceeding[] = [];
  for (const rawP of (Array.isArray(o.proceedings) ? o.proceedings : []) as Array<Record<string, unknown>>) {
    const key = str(rawP.key);
    if (!key) errors.push("a proceeding has no key");
    if (proceedingKeys.has(key)) errors.push(`proceeding ${key} is listed twice`);
    proceedingKeys.add(key);
    if (!str(rawP.title)) errors.push(`proceeding ${key}: title is required`);
    if (!str(rawP.caseType)) errors.push(`proceeding ${key}: caseType is required`);
    const lim = rawP.limitation as Record<string, unknown> | null | undefined;
    if (lim != null) {
      if (!str(lim.id) || !str(lim.title) || !str(lim.source)) errors.push(`proceeding ${key}: the limitation rule needs an id, a title and a source`);
      if (!Number.isInteger(lim.days) || (lim.days as number) < 1) errors.push(`proceeding ${key}: limitation days must be a whole number of days`);
    }
    const docs = (Array.isArray(rawP.documents) ? rawP.documents : []) as Array<Record<string, unknown>>;
    for (const d of docs) if (!str(d.kind) || !str(d.title)) errors.push(`proceeding ${key}: a document needs a kind and a title`);
    const steps = (Array.isArray(rawP.workflow) ? rawP.workflow : []) as Array<Record<string, unknown>>;
    for (const s of steps) if (!str(s.text)) errors.push(`proceeding ${key}: a workflow step has no text`);
    if (strs(rawP.skills).some((s) => !/^SK-\d{3}$/.test(s))) errors.push(`proceeding ${key}: every skill id must be SK-nnn`);
    for (const t of (Array.isArray(rawP.terms) ? rawP.terms : []) as Array<Record<string, unknown>>) if (!str(t.term) || !str(t.meaning)) errors.push(`proceeding ${key}: a term needs a term and a meaning`);
    proceedings.push({
      key,
      title: str(rawP.title),
      caseType: str(rawP.caseType),
      courts: strs(rawP.courts).length ? strs(rawP.courts) : courts,
      provisions: strs(rawP.provisions),
      limitation: lim ? { id: str(lim.id), title: str(lim.title), days: Number(lim.days), from: str(lim.from), source: str(lim.source), ref: str(lim.ref) || undefined } : null,
      requiredParts: strs(rawP.requiredParts),
      documents: docs.map((d) => ({ kind: str(d.kind), title: str(d.title) })),
      annexureParts: strs(rawP.annexureParts),
      unmappedParts: strs(rawP.unmappedParts),
      lateDocuments: (Array.isArray(rawP.lateDocuments) ? rawP.lateDocuments : []).map((d) => ({ kind: str((d as Record<string, unknown>).kind), title: str((d as Record<string, unknown>).title) })),
      workflow: steps.map((s) => ({ text: str(s.text), skill: str(s.skill) || undefined })),
      stages: strs(rawP.stages),
      intakeQuestions: strs(rawP.intakeQuestions),
      skills: strs(rawP.skills),
      recordColumns: strs(rawP.recordColumns),
      evidence: strs(rawP.evidence),
      terms: (Array.isArray(rawP.terms) ? rawP.terms : []).map((t) => ({ term: str((t as Record<string, unknown>).term), meaning: str((t as Record<string, unknown>).meaning) })),
    });
  }
  if (proceedings.length === 0) errors.push("at least one proceeding is required");
  const acts = (Array.isArray(o.acts) ? o.acts : []) as Array<Record<string, unknown>>;
  for (const a of acts) if (!str(a.act) || !str(a.version) || !str(a.source)) errors.push(`act ${str(a.act) || "(none)"}: needs a name, a version and a source`);
  if (errors.length) return { pack: null, errors };
  return {
    errors,
    pack: {
      id,
      version: str(o.version),
      title: str(o.title),
      practice,
      courts,
      default: o.default === true,
      acts: acts.map((a) => ({ act: str(a.act), version: str(a.version), source: str(a.source) })),
      templates: (Array.isArray(o.templates) ? o.templates : []).map((t) => ({ kind: str((t as Record<string, unknown>).kind), title: str((t as Record<string, unknown>).title), note: str((t as Record<string, unknown>).note) })),
      proceedings,
      terms: (Array.isArray(o.terms) ? o.terms : []).map((t) => ({ term: str((t as Record<string, unknown>).term), meaning: str((t as Record<string, unknown>).meaning) })),
    },
  };
}

/** The packs, checked. One bad pack does not hide the others; it is listed with its error. */
export function buildPacks(raws: unknown[]): { packs: PracticePack[]; summaries: PackSummary[] } {
  const packs: PracticePack[] = [];
  const summaries: PackSummary[] = [];
  for (const raw of raws) {
    const { pack, errors } = checkPack(raw);
    if (pack) {
      packs.push(pack);
      summaries.push(summaryOf(pack, null));
    } else {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      summaries.push({
        id: str(o.id) || "(no id)",
        version: str(o.version) || "0.0.0",
        title: str(o.title) || "(no title)",
        practice: strs(o.practice),
        courts: strs(o.courts),
        isDefault: o.default === true,
        proceedings: [],
        acts: [],
        skills: [],
        error: errors.join("; "),
      });
    }
  }
  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return { packs, summaries };
}

export function summaryOf(pack: PracticePack, error: string | null): PackSummary {
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    practice: pack.practice,
    courts: pack.courts,
    isDefault: !!pack.default,
    proceedings: pack.proceedings.map((p) => ({ key: p.key, title: p.title, caseType: p.caseType, courts: p.courts })),
    acts: pack.acts,
    skills: [...new Set(pack.proceedings.flatMap((p) => p.skills))].sort(),
    error,
  };
}

export function packById(packs: readonly PracticePack[], id: string): PracticePack | null {
  return packs.find((p) => p.id === id) ?? null;
}

const PRACTICE_ALIAS: Record<string, string> = {
  constitutional: "writ",
  constitution: "writ",
  arbitration: "commercial",
  corporate: "commercial",
  contracts: "commercial",
  contract: "commercial",
  matrimonial: "family",
  marriage: "family",
  land: "property",
  "real estate": "property",
  ibc: "insolvency",
  company: "insolvency",
  debt: "banking",
  sarfaesi: "banking",
  drt: "banking",
  taxation: "tax",
  gst: "tax",
  "income tax": "tax",
  employment: "service",
  labour: "service",
  "intellectual property": "ip",
  trademark: "ip",
  copyright: "ip",
  patent: "ip",
  environment: "environmental",
  regulatory: "environmental",
  "administrative law": "administrative",
  "motor accident": "motor",
  accident: "motor",
  "negotiable instruments": "cheque",
};

/** The pack a Practice Profile practice area serves. */
export function packForPractice(packs: readonly PracticePack[], practice: string): PracticePack | null {
  const p = norm(practice);
  const alias = PRACTICE_ALIAS[p] ?? PRACTICE_ALIAS[practice.trim().toLowerCase()] ?? p;
  return packs.find((x) => x.id === alias || x.practice.some((y) => norm(y) === p || norm(y) === alias)) ?? null;
}

function proceedingMatches(p: PackProceeding, words: string[]): boolean {
  const wanted = words.map(norm).filter(Boolean);
  if (wanted.length === 0) return false;
  const own = [p.key, p.title, p.caseType].map(norm);
  return wanted.some((w) => own.some((o) => o === w || o.includes(w) || w.includes(o)));
}

function courtMatches(pack: PracticePack, court: string): boolean {
  const c = norm(court);
  if (!c) return false;
  return pack.courts.some((id) => norm(id) === c) || norm(pack.title).includes(c) || c.includes(norm(pack.title));
}

/**
 * The pack and proceeding of a matter. The order is: a named proceeding, the practice area, the
 * court, then the default pack. The reason says which one decided it, so the window can show it.
 */
export function packForMatter(packs: readonly PracticePack[], subject: PackSubject): PackChoice | null {
  if (packs.length === 0) return null;
  const words = [subject.proceeding, subject.caseType].filter((x) => x.trim());
  for (const pack of packs) {
    for (const p of pack.proceedings) {
      if (proceedingMatches(p, words)) {
        return { pack, proceeding: p, source: "proceeding", reason: `the matter's proceeding or case type matches "${p.title}" in the ${pack.title} pack` };
      }
    }
  }
  const byPractice = packForPractice(packs, subject.practiceArea);
  if (byPractice) {
    const p = byPractice.proceedings[0] ?? null;
    return { pack: byPractice, proceeding: p, source: "practice", reason: `the Practice Profile names ${subject.practiceArea || byPractice.practice[0]}, which the ${byPractice.title} pack serves` };
  }
  const byCourt = [...packs].filter((pack) => courtMatches(pack, subject.court)).sort((a, b) => a.courts.length - b.courts.length)[0];
  if (byCourt) {
    return { pack: byCourt, proceeding: byCourt.proceedings[0] ?? null, source: "court", reason: `the matter's court (${subject.court}) is served by the ${byCourt.title} pack` };
  }
  const def = packs.find((p) => p.default) ?? null;
  if (def) return { pack: def, proceeding: def.proceedings[0] ?? null, source: "default", reason: `no proceeding, practice area or court chooses a pack, so the default ${def.title} pack applies` };
  return null;
}

/** The filing plan of a pack proceeding. An empty plan is reported, never invented. */
export function filingPlan(choice: PackChoice): PackFilingPlan | null {
  const p = choice.proceeding;
  if (!p) return null;
  return {
    packId: choice.pack.id,
    packTitle: choice.pack.title,
    proceedingKey: p.key,
    proceedingTitle: p.title,
    caseType: p.caseType,
    source: choice.source,
    documents: p.documents,
    annexureParts: p.annexureParts,
    unmappedParts: p.unmappedParts,
    limitation: p.limitation,
    workflow: p.workflow,
  };
}

/**
 * D5: why a skill may not run in this matter, or null. `general` applies to every pack. When no
 * pack was chosen and the default applies, the gate does not stop the run: it says the pack could
 * not be checked. The runner reports that notice; it never guesses.
 */
export function skillPackRefusal(skillPacks: readonly string[], choice: PackChoice | null): { refusal: string | null; notice: string | null } {
  if (skillPacks.length === 0 || skillPacks.includes("general")) return { refusal: null, notice: null };
  if (!choice) return { refusal: null, notice: "The matter's practice pack is not known, so the skill's pack could not be checked." };
  if (skillPacks.includes(choice.pack.id)) return { refusal: null, notice: null };
  if (choice.source === "default") return { refusal: null, notice: `No pack was chosen for the matter; the default ${choice.pack.title} pack applies. The skill names ${skillPacks.join(", ")}.` };
  return { refusal: `this skill belongs to the ${skillPacks.join(", ")} pack; the matter is a ${choice.pack.title} matter (${choice.proceeding?.title ?? "no proceeding"}).`, notice: null };
}

/** The skills of a pack, with the every-proceeding skills first. */
export function skillsOfPack(packs: readonly PracticePack[], packId: string): string[] {
  const out = new Set<string>();
  for (const p of packs) {
    if (p.id !== packId) continue;
    for (const pr of p.proceedings) for (const s of pr.skills) out.add(s);
  }
  return [...out].sort();
}

/** The acts of the enabled packs, each with the packs that name it. */
export function actsOfPacks(packs: readonly PracticePack[]): Array<{ act: string; version: string; source: string; packs: string[] }> {
  const byKey = new Map<string, { act: string; version: string; source: string; packs: string[] }>();
  for (const pack of packs) {
    for (const a of pack.acts) {
      const key = `${a.act}|${a.version}`;
      const row = byKey.get(key) ?? { ...a, packs: [] };
      if (!row.packs.includes(pack.id)) row.packs.push(pack.id);
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => a.act.localeCompare(b.act));
}
