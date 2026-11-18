/**
 * G7: the adapters of the one retrieval function (./index.ts). The statute, procedure and
 * research adapters read the law store. The matter, firm, advocate and session adapters take a
 * search function from their own store's host, so each store keeps its one reader and writer
 * (decision 12) and a matter adapter can only ever see the matter it was made for.
 * Plain library (decision 6).
 */
import type { LawStore } from "../law-store/index.ts";
import { citationKeyId } from "../../shared/law.ts";
import { textHash } from "../statutes/structure.ts";
import type { AdapterHealth, CitationKey, InForceResult, InstrumentKind, KnowledgeHit, KnowledgeScope, Provision, VerificationCheck } from "../../shared/law.ts";
import { KnowledgeError } from "./index.ts";
import type { AdapterContext, KnowledgeAdapter, ParsedQuery, RankedList, VectorIndex } from "./index.ts";

const PROCEDURE_KINDS: InstrumentKind[] = ["rules", "practice_direction", "regulation"];
const STATUTE_KINDS: InstrumentKind[] = ["act", "notification"];

/** The chapter, part or order a rule is under, when the source prints one. */
function provisionCitationKey(p: Provision): CitationKey {
  const key: CitationKey = { instrument: p.actId, kind: p.kind, number: p.number, version: p.version };
  const under = /^(chapter|part|order)\s+(.+)$/i.exec(p.under.trim());
  if (under) {
    const label = under[1].toLowerCase();
    if (label === "chapter") key.chapter = under[2];
    else if (label === "part") key.part = under[2];
    else key.order = under[2];
  }
  return key;
}

/** The checks this store can answer without reading the source again. RAG-0 never fakes one. */
function provisionChecks(p: Provision, governing: InForceResult | null): VerificationCheck[] {
  const at = p.checkedAt ?? p.retrievedAt;
  const sourceDetail = {
    verified: "The last check of this provision matched its source.",
    never: "This provision has never been checked against its source.",
    changed: "The source gave a different text at the last check; the new version is stored.",
    unreachable: "The source could not be reached at the last check.",
  }[p.check];
  const hashMatches = textHash(p.text) === p.textHash;
  const checks: VerificationCheck[] = [
    { dimension: "source", state: p.check, detail: sourceDetail, checkedAt: at, sourceRef: p.sourceRef },
    { dimension: "text", state: hashMatches ? "verified" : "changed", detail: hashMatches ? "The stored text matches its recorded SHA-256." : "The stored text does not match its recorded SHA-256.", checkedAt: at },
    { dimension: "citation", state: p.number.trim() ? "verified" : "never", detail: p.number.trim() ? `${p.kind} ${p.number} is a provision row of ${p.actTitle}.` : "The row has no provision number.", checkedAt: at },
  ];
  if (!governing) checks.push({ dimension: "currentness", state: "not_applicable", detail: "No governing date was given for this search.", checkedAt: at });
  else if (governing.state === "in_force") checks.push({ dimension: "currentness", state: "verified", detail: `The provision is in force on ${governing.date}. ${governing.basis.join(" ")}`.trim(), checkedAt: at });
  else if (governing.state === "undetermined") checks.push({ dimension: "currentness", state: "never", detail: `The version in force on ${governing.date} is undetermined. ${governing.basis.join(" ")}`.trim(), checkedAt: at });
  else checks.push({ dimension: "currentness", state: "changed", detail: `The provision is not in force on ${governing.date}: ${governing.state.replace(/_/g, " ")}. ${governing.basis.join(" ")}`.trim(), checkedAt: at });
  checks.push(
    { dimension: "quote", state: "not_applicable", detail: "No quote has been checked for this hit.", checkedAt: at },
    { dimension: "support", state: "not_applicable", detail: "Support for a proposition is decided after a quote is selected.", checkedAt: at },
    { dimension: "treatment", state: "not_applicable", detail: "A statutory provision has no judicial treatment.", checkedAt: at },
  );
  return checks;
}

function provisionHit(scope: KnowledgeScope, p: Provision, state?: string, governing: InForceResult | null = null): KnowledgeHit {
  const citationKey = provisionCitationKey(p);
  return {
    id: p.id,
    scope,
    kind: p.kind,
    title: `${p.kind === "section" ? "Section" : p.kind[0].toUpperCase() + p.kind.slice(1)} ${p.number}, ${p.actTitle}${p.heading ? `: ${p.heading}` : ""}`,
    text: p.text,
    anchor: citationKeyId(citationKey),
    date: p.validFrom,
    authority: 0,
    verification: state ?? (p.check === "verified" ? (p.stale ? "unconfirmed: the last check is older than the interval" : "verified") : p.check === "never" ? "unconfirmed: never checked" : p.check),
    stale: p.stale,
    score: 0,
    why: [],
    citationKey,
    checks: provisionChecks(p, governing),
  };
}

export interface LawAdapterOptions {
  /** Read one provision from its source now. When given, stale hits are checked before they are returned. */
  verify?: (p: Provision) => Promise<{ text: string; footnotes?: string; heading?: string }>;
  /** At most this many source reads per retrieval. */
  maxChecks?: number;
}

/** Statutes (Acts) or procedure (court rules, practice directions), both over the provision table. */
export function provisionAdapter(scope: "statute" | "procedure", law: LawStore, opts: LawAdapterOptions = {}): KnowledgeAdapter {
  const kinds = scope === "statute" ? STATUTE_KINDS : PROCEDURE_KINDS;
  return {
    scope,
    unavailable: () => (law.acts().some((a) => kinds.includes(a.kind)) ? null : scope === "statute" ? "No Act is in the library yet. Add one from India Code." : "No court rules are in the library yet. Add the rules PDF."),
    health: () => {
      const rows = law.acts().filter((a) => kinds.includes(a.kind)).reduce((n, a) => n + a.provisions, 0);
      return {
        scope,
        state: rows > 0 ? "ready" : "empty",
        detail: rows > 0 ? `${rows} provision(s) are searchable.` : scope === "statute" ? "No Act is in the library yet." : "No court rules are in the library yet.",
        rows,
      };
    },
    search(q: ParsedQuery, ctx: AdapterContext): RankedList[] {
      const lists: RankedList[] = [];
      // 1. A provision the query names, with its Act: an exact lookup.
      const exact: KnowledgeHit[] = [];
      for (const ref of q.provisions) {
        if (!ref.act) continue;
        for (const p of law.findProvision(ref.number, ref.act)) {
          if (!kinds.includes(law.act(p.actId)!.kind)) continue;
          if (q.date) {
            const r = law.inForce(p.actId, p.number, q.date);
            const h = provisionHit(scope, r.version ?? p, `on ${q.date}: ${r.state.replace(/_/g, " ")}. ${r.basis.join(" ")}`, r);
            exact.push(h);
          } else exact.push(provisionHit(scope, p));
        }
      }
      if (exact.length) lists.push({ retriever: "exact", hits: exact, weight: 3 });
      // 2. Full text.
      if (q.fts) {
        const hits = law.searchProvisions(q.fts, { raw: true, kinds, jurisdiction: scope === "procedure" && q.court ? q.court : undefined, limit: ctx.limit });
        if (hits.length) {
          lists.push({
            retriever: "text",
            hits: hits.map((h) => provisionHit(scope, h.provision, undefined, q.date ? law.inForce(h.provision.actId, h.provision.number, q.date) : null)),
          });
        }
      }
      return lists;
    },
    async finish(hits: KnowledgeHit[]): Promise<void> {
      if (!opts.verify) return;
      let left = opts.maxChecks ?? 5;
      for (const h of hits) {
        if (!h.stale || left <= 0) continue;
        left--;
        const c = await law.verify(h.id, opts.verify);
        const prior = h.verification;
        h.verification = c.state === "verified" ? "verified now" : c.state === "changed" ? `changed at the source: ${c.detail}` : `unconfirmed: the source could not be reached (${c.detail})`;
        // Keep the governing-date basis the hit already carries; the check is added to it.
        if (/^on \d{4}-\d{2}-\d{2}:/.test(prior)) h.verification = `${prior} (${c.state})`;
        h.stale = c.state !== "verified";
      }
    },
  };
}

/** Judgment paragraphs: exact citation, full text, the graph around what was found, and vectors. */
export function researchAdapter(law: LawStore, vectors?: { index: VectorIndex; scope: string } | null): KnowledgeAdapter {
  const authority = (court: string) => (court === "sc" ? 3 : court === "hc" ? 2 : 1);
  const paraHit = (judgmentId: string, para: number, label: string, text: string, note = ""): KnowledgeHit | null => {
    const j = law.judgment(judgmentId);
    if (!j) return null;
    const at = j.indexedAt;
    return {
      id: `${judgmentId}#p${para}`,
      scope: "research",
      kind: "paragraph",
      title: `${j.title}${j.citations[0] ? `, ${j.citations[0]}` : ""}${label ? `, para ${label}` : ""}`,
      text,
      anchor: `${judgmentId}#p${para}`,
      date: j.decisionDate || null,
      authority: authority(j.court),
      verification: note || `${j.courtName}; bench of ${j.benchStrength || "unknown strength"}`,
      stale: false,
      score: 0,
      why: [],
      authorityFacts: { court: j.court, courtName: j.courtName, benchStrength: j.benchStrength, decisionDate: j.decisionDate, role: null, treatment: null },
      checks: [
        { dimension: "source", state: "never", detail: "No source check is recorded for this judgment.", checkedAt: at },
        { dimension: "text", state: "never", detail: "No stored text hash is recorded for a judgment paragraph.", checkedAt: at },
        { dimension: "currentness", state: "not_applicable", detail: "A judgment has no version in force; its treatment is a separate question.", checkedAt: at },
        { dimension: "citation", state: j.citations.length ? "verified" : "never", detail: j.citations.length ? `Indexed with ${j.citations.join("; ")}.` : "The judgment has no citation.", checkedAt: at },
        { dimension: "quote", state: "not_applicable", detail: "No quote has been checked for this hit.", checkedAt: at },
        { dimension: "support", state: "not_applicable", detail: "Support for a proposition is decided after a quote is selected.", checkedAt: at },
        { dimension: "treatment", state: "never", detail: "Treatment is not checked in RAG-0.", checkedAt: at },
      ],
    };
  };
  return {
    scope: "research",
    unavailable: () => (law.counts().paragraphs > 0 ? null : "No judgment is indexed by paragraph yet. Read a judgment to index it."),
    health: () => {
      const rows = law.counts().paragraphs;
      return { scope: "research", state: rows > 0 ? "ready" : "empty", detail: rows > 0 ? `${rows} judgment paragraph(s) are searchable.` : "No judgment is indexed by paragraph yet.", rows };
    },
    search(q: ParsedQuery, ctx: AdapterContext): RankedList[] {
      const lists: RankedList[] = [];
      const found = new Set<string>();
      // 1. A citation the query gives.
      const exact: KnowledgeHit[] = [];
      for (const c of q.citations) {
        for (const id of law.byCitation(c)) {
          found.add(id);
          const first = law.paras(id, 0, 3).find((p) => p.para >= 1) ?? law.paras(id, 0, 1)[0];
          const h = first ? paraHit(id, first.para, first.label, first.text) : null;
          if (h) exact.push(h);
        }
      }
      if (exact.length) lists.push({ retriever: "exact", hits: exact, weight: 3 });
      // 2. Full text over paragraphs.
      if (q.fts) {
        const hits = law.searchParas(q.fts, { raw: true, court: q.court ?? undefined, limit: ctx.limit });
        const text = hits.map((h) => paraHit(h.judgmentId, h.para, h.label, h.text)).filter((h): h is KnowledgeHit => !!h);
        for (const h of hits.slice(0, 5)) found.add(h.judgmentId);
        if (text.length) lists.push({ retriever: "text", hits: text });
      }
      // 3. The graph: judgments that treat what was found, and judgments that interpret a named provision.
      const graph: KnowledgeHit[] = [];
      const fromEdge = (ref: string, relation: string) => {
        const m = /^(.*)#p(\d+)$/.exec(ref);
        if (!m) return;
        const p = law.paras(m[1], Number(m[2]), Number(m[2]))[0];
        const h = p ? paraHit(m[1], p.para, p.label, p.text, relation.replace(/_/g, " ")) : null;
        if (h && !graph.some((g) => g.id === h.id)) graph.push(h);
      };
      if (q.mode === "connected" || q.mode === "citation" || q.mode === "natural" || q.mode === "statute" || q.mode === "historical") {
        for (const id of found) for (const e of law.edges({ toKind: "judgment", toId: id, limit: 40 })) if (e.relation !== "cites" || q.mode === "connected") fromEdge(e.evidenceRef, `${e.relation} ${law.judgment(id)?.title ?? id}`);
        for (const c of q.citations) for (const e of law.edges({ toKind: "citation", toId: c, limit: 40 })) fromEdge(e.evidenceRef, `${e.relation} ${c}`);
        for (const ref of q.provisions) {
          if (!ref.act) continue;
          for (const p of law.findProvision(ref.number, ref.act)) for (const e of law.edges({ toKind: "provision", toId: p.id, relations: ["interprets"], limit: 40 })) fromEdge(e.evidenceRef, `interprets ${ref.kind} ${ref.number}`);
        }
      }
      if (graph.length) lists.push({ retriever: "graph", hits: graph.slice(0, ctx.limit), weight: 1.5 });
      // 4. Vectors, when a model is installed.
      if (ctx.vector && vectors && vectors.index.size > 0) {
        const near = vectors.index.search(ctx.vector, ctx.limit);
        const hits = near
          .map((n) => {
            const m = /^(.*)#p(\d+)$/.exec(n.id);
            const p = m ? law.paras(m[1], Number(m[2]), Number(m[2]))[0] : undefined;
            return m && p ? paraHit(m[1], p.para, p.label, p.text) : null;
          })
          .filter((h): h is KnowledgeHit => !!h);
        if (hits.length) lists.push({ retriever: "vector", hits });
      }
      return lists;
    },
  };
}

/**
 * An adapter over a search function of another store's host: the matter (bound to one matter by
 * the host), the firm library, advocate memory, or the session log.
 */
export function functionAdapter(scope: KnowledgeScope, search: (q: ParsedQuery, limit: number) => Promise<KnowledgeHit[]> | KnowledgeHit[], unavailable: () => string | null = () => null): KnowledgeAdapter {
  return {
    scope,
    unavailable,
    async search(q, ctx) {
      const hits = (await search(q, ctx.limit)).map((h) => ({ ...h, scope }));
      return hits.length ? [{ retriever: "text", hits }] : [];
    },
  };
}

/** Attach an adapter's health row for the Index Health view. */
export function withHealth(adapter: KnowledgeAdapter, health: () => AdapterHealth): KnowledgeAdapter {
  return { ...adapter, health };
}

/**
 * A scope that is deliberately not built yet. It says why, and it returns no rows. It is never
 * shown as an empty search: `unavailable` and `health` both say "deferred".
 */
export function deferredAdapter(scope: KnowledgeScope, reason: string): KnowledgeAdapter {
  return {
    scope,
    unavailable: () => reason,
    search: () => [],
    health: () => ({ scope, state: "deferred", detail: reason }),
  };
}

/** The read port of one matter. The adapter passes only its bound id and never a request id. */
export interface MatterKnowledgePort {
  search(matterId: string, q: ParsedQuery, ctx: AdapterContext): Promise<KnowledgeHit[]> | KnowledgeHit[];
  /** The rows the bound matter can search, for health. */
  rows?(matterId: string): number;
}

/**
 * A matter adapter constructed bound to one matter. The scope check runs before the port is
 * called: another id, a missing id or a malformed id is refused, so it can never open a second
 * matter. The port receives the bound id, never the id the request named.
 */
export function boundMatterAdapter(matterId: string, port: MatterKnowledgePort): KnowledgeAdapter {
  const bound = matterId.trim();
  if (!bound) throw new KnowledgeError("MATTER_SCOPE", "a matter adapter needs a matter id");
  const check = (requested: string | null | undefined): void => {
    if (!requested) throw new KnowledgeError("MATTER_SCOPE", `this adapter is bound to ${bound}; the request names no matter`);
    if (requested !== bound) throw new KnowledgeError("MATTER_SCOPE", `this adapter is bound to ${bound}; the request names ${requested}`);
  };
  return {
    scope: "matter",
    unavailable: () => null,
    async search(q, ctx) {
      check(ctx.matterId);
      const hits = await port.search(bound, q, ctx);
      return hits.length ? [{ retriever: "text", hits: hits.map((hit) => ({ ...hit, scope: "matter" as const })) }] : [];
    },
    health: () => {
      const rows = port.rows?.(bound);
      return { scope: "matter", state: "ready", detail: `Bound to matter ${bound}. The adapter cannot open another matter.`, ...(rows === undefined ? {} : { rows }) };
    },
  };
}
