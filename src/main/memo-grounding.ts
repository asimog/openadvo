/**
 * The reference grounding of a memorandum. Every [event:<id>], [issue:<id>],
 * [authority:<id>] and [source name, p. N, l. M] in the body is resolved against the matter.
 * A reference that does not resolve is kept as unresolved, never invented. Plain main-process
 * module: it reads the matter, it writes nothing.
 */
import type { Matters } from "./matters.ts";
import { parseReferences } from "../lib/research/index.ts";

export interface MemoGrounding {
  refs: string[];
  unresolved: string[];
}

export async function resolveMemoReferences(matters: Matters, matterId: string, body: string): Promise<MemoGrounding> {
  const store = await matters.store(matterId);
  const work = store.work;
  const notebook = await matters.notebook(matterId);
  const sources = await matters.listSources(matterId);
  const refs: string[] = [];
  const unresolved: string[] = [];
  for (const r of parseReferences(body)) {
    let ok = false;
    if (r.kind === "event") ok = notebook.events.some((e) => e.id === r.id);
    else if (r.kind === "issue") ok = work.listIssues().some((i) => i.id === r.id);
    else if (r.kind === "authority") ok = work.listAuthorities().some((a) => a.id === r.id);
    else if (r.kind === "source") {
      const source = sources.find((s) => s.name.toLowerCase() === r.name.toLowerCase());
      if (source) {
        const pages = await matters.listPages(matterId, source.id, r.page, r.page);
        ok = pages.some((p) => p.lines.some((l) => l.line === r.line));
      }
    }
    (ok ? refs : unresolved).push(r.raw);
  }
  return { refs, unresolved };
}
