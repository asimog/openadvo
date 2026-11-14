/**
 * Research references (build-plan step 6; workflow 7D). Plain library.
 * A memorandum states its grounding with references the matter can resolve:
 *   [event:<id>]  [issue:<id>]  [authority:<id>]  [source name, p. N, l. M]
 * Notebook event ids look like ev:<sha256>:<page>:<line>:<n>.
 * This module only parses them. `main/research.ts` resolves each against the matter store.
 */
export type Reference =
  | { kind: "event" | "issue" | "authority"; id: string; raw: string }
  | { kind: "source"; name: string; page: number; line: number; raw: string };

const RECORD = /\[(event|issue|authority):([A-Za-z0-9:._-]{3,200})\]/gi;
const SOURCE = /\[([^\[\]]+?),\s*p\.\s*(\d+),\s*l\.\s*(\d+)\]/g;

export function parseReferences(body: string): Reference[] {
  const out: Reference[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(RECORD)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({ kind: m[1].toLowerCase() as "event" | "issue" | "authority", id: m[2], raw: m[0] });
  }
  for (const m of body.matchAll(SOURCE)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({ kind: "source", name: m[1].trim(), page: Number(m[2]), line: Number(m[3]), raw: m[0] });
  }
  return out;
}
