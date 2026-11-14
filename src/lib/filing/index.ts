/**
 * Filing preparation (build-plan step 8; workflow 8E, 9E, 10). Plain library.
 *
 * Compliance rules are versioned and each names its source (workflow 9E). v0 encodes only rules
 * about the filing package that the application can check from its own records. The Registry's
 * list of filing defects is not yet encoded: that rule reports `not_checked`, never `pass`
 * (questions.md Q-6). The limitation period is a recorded rule with its source, computed by the
 * system and confirmed by the advocate with the working shown (questions.md Q-7).
 */
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { ComplianceResult } from "../../shared/work.ts";

export const RULES_VERSION = "slp-package-v0";

/** The limitation rule v0 computes. The owner confirms its source (questions.md Q-7). */
export const LIMITATION_RULE = {
  id: "slp-90-days",
  title: "Petition for special leave to appeal: 90 days from the date of the judgment or order",
  source: "Supreme Court Rules, 2013, Order XXII, Rule 2(1), as recorded by the engineer; to be confirmed by the owner (questions.md Q-7)",
  days: 90,
};

/** Day 1 is the day after the start date. Calendar days; no exclusion is computed. */
export function computeLimitation(startIso: string, days: number = LIMITATION_RULE.days): { deadline: string; working: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  if (!m) throw new Error(`LIMITATION_BAD_DATE: ${startIso}`);
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const deadline = new Date(start + days * 86_400_000).toISOString().slice(0, 10);
  const show = (iso: string) => iso.split("-").reverse().join(".");
  const working = [
    `Start: the impugned judgment dated ${show(startIso)}.`,
    `Rule: ${LIMITATION_RULE.title}. Source: ${LIMITATION_RULE.source}.`,
    `Day 1 is ${show(new Date(start + 86_400_000).toISOString().slice(0, 10))}. Day ${days} is ${show(deadline)}.`,
    "Not computed: time spent obtaining a certified copy, court vacations and holidays, and condonation of delay. The advocate confirms or corrects the computation.",
  ].join(" ");
  return { deadline, working };
}

/** V2-6: the days after the last day of limitation, on `asOf` (ISO dates). Zero when in time. */
export function delayDays(deadline: string, asOf: string): number {
  const d = Date.parse(`${deadline}T00:00:00Z`);
  const a = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(a)) return 0;
  return Math.max(0, Math.round((a - d) / 86_400_000));
}

/** A PDF/A file declares its part in its XMP metadata (pdfaid:part) and carries an output intent. */
export function isPdfA(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString("latin1");
  return /pdfaid:part/.test(text) && /GTS_PDFA/.test(text);
}

/** "Annexure P-3", "ANNEXURE P3": the labels a draft refers to. */
export function annexureRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bAnnexure\s+P\s*-?\s*(\d{1,3})\b/gi)) {
    const label = `Annexure P-${Number(m[1])}`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export interface ComplianceInput {
  details: { petitioner: string; respondent: string; impugnedEventId: string | null };
  /** One row per required draft kind. */
  drafts: Array<{ kind: string; title: string; approvedSeq: number | null; text: string | null }>;
  annexureLabels: string[];
  limitation: { deadline: string; confirmed: boolean } | null;
  /** The newest filing set, when one exists. */
  filingSet: { files: Array<{ name: string; pdfa: boolean; role: string }> } | null;
}

/** The v0 package rules, in a fixed order. */
export function checkCompliance(input: ComplianceInput): ComplianceResult[] {
  const out: ComplianceResult[] = [];
  const add = (rule: string, title: string, source: string, outcome: ComplianceResult["outcome"], detail: string) => out.push({ rule, title, source, outcome, detail });
  const missing = input.drafts.filter((d) => d.approvedSeq === null).map((d) => d.title);
  add(
    "P-1",
    "Required documents: Synopsis, List of Dates, Petition, Questions of Law and Grounds, and the application for condonation of delay when limitation has run, each with an approved revision",
    "Workflow section 8 (petition structure)",
    missing.length ? "defect" : "pass",
    missing.length ? `Not approved: ${missing.join(", ")}.` : "Every required document has an approved revision.",
  );
  const absent = [input.details.petitioner ? "" : "petitioner", input.details.respondent ? "" : "respondent", input.details.impugnedEventId ? "" : "impugned judgment"].filter(Boolean);
  add("P-2", "Parties and the impugned judgment are recorded", "Workflow section 2 (matter identity)", absent.length ? "defect" : "pass", absent.length ? `Not recorded: ${absent.join(", ")}.` : "Recorded.");
  const referred = new Set<string>();
  for (const d of input.drafts) for (const r of annexureRefs(d.text ?? "")) referred.add(r);
  const unknown = [...referred].filter((r) => !input.annexureLabels.includes(r));
  const unused = input.annexureLabels.filter((l) => !referred.has(l));
  add(
    "P-3",
    "Annexure references are consistent: every reference names an annexure, and every annexure is referred to",
    "Workflow section 9D (annexures and page references)",
    unknown.length || unused.length ? "defect" : "pass",
    [unknown.length ? `Referred to but not an annexure: ${unknown.join(", ")}.` : "", unused.length ? `Annexure not referred to: ${unused.join(", ")}.` : ""].filter(Boolean).join(" ") || `${input.annexureLabels.length} annexure(s), all referred to.`,
  );
  add(
    "P-4",
    "Limitation is computed and confirmed by the advocate",
    `${LIMITATION_RULE.source}`,
    !input.limitation ? "defect" : input.limitation.confirmed ? "pass" : "defect",
    !input.limitation ? "Not computed. Choose the impugned judgment on the Matter tab, then compute." : input.limitation.confirmed ? `Last day ${input.limitation.deadline}, confirmed.` : `Last day ${input.limitation.deadline}, not confirmed.`,
  );
  if (!input.filingSet) add("P-5", "The petition documents are PDF/A, rendered from the approved DOCX revisions", "Workflow section 9E", "not_checked", "No filing set yet.");
  else {
    const notA = input.filingSet.files.filter((f) => f.role !== "annexure" && f.role !== "paper_book" && !f.pdfa).map((f) => f.name);
    add("P-5", "The petition documents are PDF/A, rendered from the approved DOCX revisions", "Workflow section 9E", notA.length ? "defect" : "pass", notA.length ? `Not PDF/A: ${notA.join(", ")}.` : "Every petition document declares PDF/A.");
  }
  add(
    "R-0",
    "The Supreme Court Registry's list of filing defects",
    "Supreme Court Registry, list of defects: not yet encoded (questions.md Q-6)",
    "not_checked",
    "These rules are not in the application yet. Check the filing set against the Registry's list yourself.",
  );
  return out;
}

// ---- V1-8: the tamper-evident manifest (v1 spec; after Mike's tamper-evident exports). ----

/** JSON with object keys sorted, array order kept, and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The SHA-256 of the manifest body without its `digest` and `signature` fields. The public key is
 * part of the body, so the digest binds it (V2-7).
 */
export function manifestDigest(manifest: Record<string, unknown>, sha256: (text: string) => string): string {
  const { digest: _d, signature: _s, ...body } = manifest;
  return sha256(canonicalJson(body));
}

/** V2-7: check an Ed25519 signature (base64) over the digest with a SPKI PEM public key. */
export function signatureValid(digest: string, signature: string, publicKeyPem: string): boolean {
  try {
    return cryptoVerify(null, Buffer.from(digest, "utf8"), createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export interface ManifestCheck {
  ok: boolean;
  digest: "match" | "mismatch" | "absent";
  /** V2-7. A manifest made before v2 has no signature: "not_signed", which is not a failure. */
  signature: "valid" | "invalid" | "not_signed";
  files: Array<{ name: string; outcome: "match" | "mismatch" | "missing" }>;
}

/**
 * Recompute the digest and every file hash. `readHash` returns the SHA-256 of a file in the
 * set folder, or null when the file is missing.
 */
export async function verifyManifest(
  manifest: { files: Array<{ name: string; sha256: string }>; digest?: string; signature?: string; publicKey?: string } & Record<string, unknown>,
  sha256: (text: string) => string,
  readHash: (name: string) => Promise<string | null>,
): Promise<ManifestCheck> {
  const digest = !manifest.digest ? "absent" : manifestDigest(manifest, sha256) === manifest.digest ? "match" : "mismatch";
  const files: ManifestCheck["files"] = [];
  for (const f of manifest.files) {
    const h = await readHash(f.name);
    files.push({ name: f.name, outcome: h === null ? "missing" : h === f.sha256 ? "match" : "mismatch" });
  }
  const signature: ManifestCheck["signature"] =
    !manifest.signature || !manifest.publicKey ? "not_signed" : manifest.digest && signatureValid(manifest.digest, manifest.signature, manifest.publicKey) ? "valid" : "invalid";
  return { ok: digest === "match" && signature !== "invalid" && files.every((f) => f.outcome === "match"), digest, signature, files };
}
