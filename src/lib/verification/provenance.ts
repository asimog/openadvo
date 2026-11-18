/**
 * Phase 6 (P2): the provenance of every citation, fact and source, computed from the existing
 * records. The values are the feature's own: tool result, official site, advocate-provided,
 * advocate-attested, model knowledge (unverified); ruling R-5 adds client-supplied. Every
 * source also carries a primary or secondary label. Nothing is invented: a value the records do
 * not support is never shown as a higher one.
 *
 * Plain library: no Electron import, no Pi import (decision 6).
 */

export const PROVENANCE_VALUES = [
  "tool_result",
  "official_site",
  "advocate_provided",
  "advocate_attested",
  "client_supplied",
  "model_knowledge",
] as const;
export type ProvenanceValue = (typeof PROVENANCE_VALUES)[number];

export const SOURCE_LABELS = ["primary_law", "official_notification", "commentary", "unverified_secondary"] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

export interface Provenance {
  value: ProvenanceValue;
  /** The label of a source of law, or null for a record of the matter. */
  label: SourceLabel | null;
  /** One line the window shows beside the record. */
  note: string;
}

/** The provenance of a citation in a draft, from the check, the attestation and the saved record. */
export function citationProvenance(input: { attested: boolean; outcome: string | null; saved: boolean }): Provenance {
  if (input.attested) return { value: "advocate_attested", label: null, note: "advocate-attested; not verified" };
  if (input.outcome === "verified") return { value: "tool_result", label: null, note: "verified by the independent validator" };
  if (input.outcome === "failed" || input.outcome === "unresolved") return { value: "model_knowledge", label: null, note: `${input.outcome} by the validator; unverified` };
  if (input.saved) return { value: "official_site", label: null, note: "saved from a research source; not verified by the validator yet" };
  return { value: "model_knowledge", label: null, note: "model knowledge (unverified)" };
}

/** The provenance of a fact: where it came from, whatever the advocate later decided about it. */
export function factProvenance(input: { author: string; sourceId: string | null; anchorId: string | null }): Provenance {
  if (input.author === "advocate" && !input.sourceId) return { value: "advocate_provided", label: null, note: "stated by the advocate" };
  if (input.anchorId) return { value: "tool_result", label: null, note: "extracted from the record with its anchor" };
  if (input.sourceId) return { value: "tool_result", label: null, note: "read from a source of the matter" };
  return { value: "model_knowledge", label: null, note: "no source recorded (unverified)" };
}

/** The label of a source of law, from its address. A client file is neither. */
export function sourceLabel(url: string): SourceLabel | null {
  const u = url.toLowerCase();
  if (u.includes("indiacode.gov.in") || u.includes("legislative.gov.in") || u.includes("egov.nic.in")) return "primary_law";
  if (u.includes("indiankanoon.org")) return "unverified_secondary";
  if (u.includes("sci.gov.in") || u.includes("gov.in") || u.includes("nic.in")) return "official_notification";
  return "commentary";
}

/**
 * The provenance of a statutory provision, from its own source rows. The CrPC rows that fell
 * back to Indian Kanoon are unverified secondary text; the India Code PDF stays the source of
 * record, and the note says so.
 */
export function provisionProvenance(input: { sourceUrl: string; sourceFile: string; checkState: string }): Provenance {
  const label = sourceLabel(input.sourceUrl);
  if (input.sourceUrl.includes("indiankanoon.org")) {
    return { value: "official_site", label: "unverified_secondary", note: "secondary source (Indian Kanoon); the official PDF remains the source of record; not verified" };
  }
  if (label === "primary_law") {
    return {
      value: "official_site",
      label,
      note: input.checkState === "verified" ? "official source, verified on re-read" : input.checkState === "never" ? "official source; not verified yet" : `official source; ${input.checkState}`,
    };
  }
  return { value: "official_site", label, note: `source: ${input.sourceUrl || "recorded source"}; ${input.checkState}` };
}

/** The provenance of a document that came in by mail or by hand: the client's own file (ruling R-5). */
export const CLIENT_FILE: Provenance = { value: "client_supplied", label: null, note: "client-supplied; never put through the validator" };

/** The provenance of a document downloaded from a court's own site. */
export function courtRecord(host: string): Provenance {
  const official = /(\.gov\.in|\.nic\.in)$/i.test(new URL(`https://${host}`).hostname.replace(/^www\./, ""));
  return official ? { value: "official_site", label: "official_notification", note: `downloaded from ${host}, an official site` } : { value: "tool_result", label: "commentary", note: `downloaded from ${host}` };
}
