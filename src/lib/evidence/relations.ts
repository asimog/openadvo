/**
 * H5: duplicate, version and relationship detection. Same text, an annexure, a reply, a certified
 * copy or a version. Proposals only; the advocate decides. Plain library.
 */
import { overlap } from "../document-intelligence/similar.ts";
import type { RelationKind } from "../../shared/evidence.ts";

export interface RelationSource {
  id: string;
  name: string;
  text: string;
  docType?: string | null;
}

export interface RelationProposal {
  a: string;
  b: string;
  relation: RelationKind;
  reason: string;
  confidence: number;
}

const COPY = /\b(copy|certified|true|office|signed|scanned)\b/i;
const VERSION = /\b(v\d+|version|final|revised|amended|updated|draft)\b/i;
const REPLY = /\b(reply|rejoinder|written\s+statement|counter|objection)\b/i;
const ANNEXURE = /\bannexure\b|\bexhibit\b/i;

function normalized(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mentions(text: string, name: string): boolean {
  const n = normalized(name.replace(/\.[a-z0-9]+$/i, ""));
  if (n.length < 4) return false;
  return normalized(text).includes(n);
}

/** Possible relations across every pair of sources. At most one proposal per pair. */
export function detectRelations(sources: RelationSource[]): RelationProposal[] {
  const out: RelationProposal[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      const o = overlap(a.text, b.text);
      let relation: RelationKind | null = null;
      let reason = "";
      let confidence = 0;
      if (o !== null && o >= 0.9) {
        const version = VERSION.test(a.name) || VERSION.test(b.name);
        relation = version ? "version_of" : "related";
        reason = `${Math.round(o * 100)}% of the words are the same${version ? "; a name marks a version" : ""}.`;
        confidence = o;
      } else if (COPY.test(a.name) || COPY.test(b.name)) {
        if (mentions(a.text, b.name) || mentions(b.text, a.name) || (o !== null && o >= 0.5)) {
          relation = "certified_copy_of";
          reason = "A name marks a copy, and the other text or a shared passage names it.";
          confidence = 0.7;
        }
      } else if (REPLY.test(a.docType ?? "") || REPLY.test(b.docType ?? "") || REPLY.test(a.name) || REPLY.test(b.name)) {
        const other = REPLY.test(a.docType ?? "") || REPLY.test(a.name) ? b : a;
        relation = "reply_to";
        reason = `One document is a reply or written statement; the other is ${other.name}.`;
        confidence = 0.6;
      } else if ((ANNEXURE.test(a.name) && mentions(b.text, a.name)) || (ANNEXURE.test(b.name) && mentions(a.text, b.name))) {
        relation = "annexure_of";
        reason = "An annexure or exhibit is named in the other document.";
        confidence = 0.65;
      } else if (o !== null && o >= 0.55) {
        relation = "related";
        reason = `${Math.round(o * 100)}% of the words are the same.`;
        confidence = o;
      }
      if (relation) out.push({ a: a.id, b: b.id, relation, reason, confidence });
    }
  }
  return out;
}
