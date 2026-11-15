/**
 * C7: possible related matters. The same CNR, FIR number, parties or impugned order. Proposals
 * only; the advocate makes the link. Plain library.
 */
import type { RelatedProposal } from "../../shared/evidence.ts";

export interface MatterFingerprint {
  id: string;
  title: string;
  cnr: string;
  fir: string;
  parties: string[];
  impugnedOrder: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function detectRelatedMatters(matters: MatterFingerprint[]): RelatedProposal[] {
  const out: RelatedProposal[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, reason: string, basis: RelatedProposal["basis"]) => {
    const key = [a, b].sort().join("\n") + `\n${basis}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    out.push({ a, b, reason, basis });
  };
  for (let i = 0; i < matters.length; i++) {
    for (let j = i + 1; j < matters.length; j++) {
      const a = matters[i];
      const b = matters[j];
      if (a.cnr && norm(a.cnr) === norm(b.cnr)) add(a.id, b.id, `Both matters record the CNR ${a.cnr}.`, "cnr");
      if (a.fir && norm(a.fir) === norm(b.fir)) add(a.id, b.id, `Both matters record the FIR ${a.fir}.`, "fir");
      const pa = new Set(a.parties.map(norm).filter((p) => p.length > 2));
      const common = b.parties.map(norm).filter((p) => pa.has(p) && p.length > 2);
      if (common.length >= 2) add(a.id, b.id, `Both matters name ${common.slice(0, 3).join(", ")}.`, "parties");
      if (a.impugnedOrder && norm(a.impugnedOrder) === norm(b.impugnedOrder)) add(a.id, b.id, `Both matters challenge ${a.impugnedOrder}.`, "impugned_order");
    }
  }
  return out;
}
