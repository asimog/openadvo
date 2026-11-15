/**
 * I1, Q2: retrieval for the context package (architecture.md section 5, step 2). One retriever
 * per kind a skill declares. Every item carries its matter id, so the builder's scope check
 * refuses another matter's records before ranking. The ranking, the budget and the record are in
 * src/lib/context-package.
 */
import type { MatterStore } from "../lib/matter-store/index.ts";
import type { ContextItem } from "../lib/context-package/index.ts";
import type { ContextKind } from "../shared/skills.ts";

const STOP = new Set(
  "the a an of to and or in on for with by at from is are was were be this that these those it its as into about what which who whom whose when where why how all any each every list show give tell check review run skill matter please".split(" "),
);

/** The main words of a request, longest first, for Find. */
export function keywords(request: string, max = 6): string[] {
  const words = request
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, max);
}

/** A pinned record, as the advocate added it with @[kind:id label]. */
export function pinnedRefs(text: string): Array<{ kind: string; id: string; matterId: string | null }> {
  const out: Array<{ kind: string; id: string; matterId: string | null }> = [];
  for (const m of text.matchAll(/@\[(source|event|draft|issue|authority|matter):([^\]\s]+)(?:\s[^\]]*)?\]/g)) {
    const [matterId, id] = m[2].includes("/") ? (m[2].split("/", 2) as [string, string]) : [null, m[2]];
    out.push({ kind: m[1], id, matterId });
  }
  return out;
}

export interface RetrievalDeps {
  matterId: string;
  store: MatterStore;
  /** Bring the Find index up to date before a search. */
  ensureFind(): Promise<void>;
  /** The matter memory text. */
  memory(): Promise<string>;
}

export async function retrieve(deps: RetrievalDeps, kinds: readonly ContextKind[], request: string, pinned: string[]): Promise<ContextItem[]> {
  const { store, matterId } = deps;
  const items: ContextItem[] = [];
  const want = new Set(kinds);
  const sources = store.listSources();
  const nameOf = new Map(sources.map((s) => [s.id, s.name]));
  const notebook = want.has("events") || want.has("conflicts") || pinned.length ? store.notebook() : null;
  const issues = want.has("issues") || pinned.length ? store.work.listIssues() : [];
  const authorities = want.has("authorities") || pinned.length ? store.work.listAuthorities() : [];
  const drafts = want.has("drafts") || pinned.length ? store.listDrafts() : [];

  // Pinned records first (N3 "@"). A record of another matter is kept as an item of that
  // matter, so the builder's scope check records why it was refused.
  for (const ref of pinnedRefs(pinned.join(" "))) {
    const base = { relevance: 1, pinned: true as const, anchors: [ref.id] };
    if (ref.matterId && ref.matterId !== matterId) {
      items.push({ ...base, id: ref.id, kind: "pinned", label: `${ref.kind} of another matter`, text: "(not read)", matterId: ref.matterId });
      continue;
    }
    if (ref.kind === "source") {
      const s = sources.find((x) => x.id === ref.id);
      if (s) items.push({ ...base, id: s.id, kind: "pinned", label: `source ${s.name}`, text: `Source file ${s.name}, ${s.mediaType}${s.docType ? `, ${s.docType.type} (${s.docType.status})` : ""}. Read its pages with read_source_text.`, matterId, provenance: "added by the advocate" });
    } else if (ref.kind === "event") {
      const e = notebook?.events.find((x) => x.id === ref.id);
      if (e) items.push({ ...base, id: e.id, kind: "pinned", label: `event ${e.dateText}`, text: `${e.dateText}: ${e.description} [${e.sourceName}, p. ${e.page}, l. ${e.line}]`, anchors: [e.id, e.anchorId], matterId, verification: e.status === "confirmed" ? "confirmed" : "proposed" });
    } else if (ref.kind === "issue") {
      const i = issues.find((x) => x.id === ref.id);
      if (i) items.push({ ...base, id: i.id, kind: "pinned", label: `issue (${i.status})`, text: i.text, matterId, verification: i.status === "accepted" ? "confirmed" : "proposed" });
    } else if (ref.kind === "authority") {
      const a = authorities.find((x) => x.id === ref.id);
      if (a) items.push({ ...base, id: a.id, kind: "pinned", label: `authority ${a.citation}`, text: `${a.citation} ${a.parties} (${a.decisionDate}), para ${a.paragraph}: ${a.proposition} [${a.role}]`, matterId, verification: a.status === "adopted" ? "confirmed" : "proposed" });
    } else if (ref.kind === "draft") {
      const d = drafts.find((x) => x.id === ref.id);
      if (d) items.push({ ...base, id: d.id, kind: "pinned", label: `draft ${d.title}`, text: `Draft ${d.title} (${d.kind}), ${d.revisionCount} revisions. Read it with read_draft.`, matterId });
    }
  }

  if (want.has("sources")) {
    for (const s of sources) {
      items.push({ id: s.id, kind: "source", label: s.name, text: `Source file ${s.name}, ${s.mediaType}${s.docType ? `, ${s.docType.type} (${s.docType.status})` : ""}, status ${s.status}.`, anchors: [s.id], matterId, relevance: 0.3, date: s.addedAt, provenance: "matter sources" });
    }
  }

  if (want.has("lines")) {
    await deps.ensureFind();
    const words = keywords(request);
    const score = new Map<string, { hit: { ref: string; label: string; text: string }; n: number }>();
    for (const w of words) {
      for (const h of store.find(w, 20)) {
        if (h.kind !== "line") continue;
        const have = score.get(h.ref);
        if (have) have.n++;
        else score.set(h.ref, { hit: h, n: 1 });
      }
    }
    for (const { hit, n } of [...score.values()].sort((a, b) => b.n - a.n).slice(0, 40)) {
      items.push({ id: hit.ref, kind: "line", label: hit.label, text: hit.text, anchors: [hit.ref], matterId, relevance: Math.min(1, n / Math.max(1, words.length)), provenance: "Find over the request's words" });
    }
  }

  if (notebook && want.has("events")) {
    for (const e of notebook.events) {
      if (e.excluded || e.status === "rejected") continue;
      items.push({
        id: e.id,
        kind: "event",
        label: `${e.dateText} (${e.status})`,
        text: `${e.dateStart}${e.dateEnd !== e.dateStart ? ` to ${e.dateEnd}` : ""} (${e.dateType}, ${e.reading === "ocr" ? "OCR" : "text layer"}): ${e.description} [${e.sourceName}, p. ${e.page}, l. ${e.line}]`,
        anchors: [e.id, e.anchorId],
        matterId,
        relevance: e.status === "confirmed" ? 0.7 : 0.5,
        date: e.dateStart,
        verification: e.status === "confirmed" ? "confirmed" : "proposed",
        disputed: e.disputed === "open",
        provenance: `Notebook, from ${nameOf.get(e.sourceId) ?? e.sourceName}`,
      });
    }
  }

  if (notebook && want.has("conflicts")) {
    const byId = new Map(notebook.events.map((e) => [e.id, e]));
    for (const c of notebook.conflicts) {
      if (c.status !== "open") continue;
      for (const side of [c.eventA, c.eventB]) {
        const e = byId.get(side);
        if (!e) continue;
        items.push({ id: `${c.id}#${side}`, kind: "conflict", label: `conflict ${c.id.slice(0, 8)}: ${e.dateText}`, text: `${e.dateText}: ${e.description} [${e.sourceName}, p. ${e.page}, l. ${e.line}]`, anchors: [c.id, e.id, e.anchorId], matterId, relevance: 0.9, date: e.dateStart, conflictGroup: c.id.slice(0, 8), disputed: true, provenance: "Notebook date conflict" });
      }
    }
  }

  if (want.has("issues")) {
    for (const i of issues) {
      if (i.status === "rejected") continue;
      items.push({ id: i.id, kind: "issue", label: `issue (${i.status})`, text: i.text, anchors: [i.id], matterId, relevance: i.status === "accepted" ? 0.8 : 0.5, date: i.createdAt, verification: i.status === "accepted" ? "confirmed" : "proposed", provenance: `issue by the ${i.author}` });
    }
  }

  if (want.has("authorities")) {
    for (const a of authorities) {
      if (a.status === "rejected") continue;
      items.push({ id: a.id, kind: "authority", label: a.citation || a.parties, text: `${a.citation} ${a.parties} (${a.decisionDate}), para ${a.paragraph}: ${a.proposition} [${a.role}]`, anchors: [a.id], matterId, relevance: a.status === "adopted" ? 0.8 : 0.5, date: a.decisionDate, authority: /INSC|SCC|SCR/.test(a.citation) ? 3 : 1, verification: a.status === "adopted" ? "confirmed" : "proposed", provenance: a.sourceRef ?? `authority by the ${a.author}` });
    }
  }

  if (want.has("drafts")) {
    for (const d of drafts) {
      items.push({ id: d.id, kind: "draft", label: d.title, text: `Draft ${d.title} (${d.kind}): ${d.revisionCount} revision${d.revisionCount === 1 ? "" : "s"}${d.approved ? ", approved" : ", not approved"}. Read it with read_draft.`, anchors: [d.id], matterId, relevance: 0.6, date: d.head?.createdAt ?? null, provenance: "matter drafts" });
    }
  }

  if (want.has("memory")) {
    const text = (await deps.memory()).trim();
    if (text) items.push({ id: `memory:${matterId}`, kind: "memory", label: "matter memory", text, anchors: [], matterId, relevance: 0.6, provenance: "the advocate's notes for this matter (lower authority than the advocate's message)" });
  }
  return items;
}

/** Whether an anchor names a record of this matter (the gate's anchors check). */
export function anchorResolver(store: MatterStore, extra: Iterable<string>): (anchor: string) => boolean {
  const known = new Set(extra);
  return (anchor: string) => {
    const a = anchor.trim();
    if (!a) return false;
    if (known.has(a)) return true;
    for (const k of known) if (k.includes(a) && a.length >= 8) return true;
    try {
      return store.inspect(a.split("#")[0]) !== null;
    } catch {
      return false;
    }
  };
}
