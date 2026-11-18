/**
 * V4: the Research and Argument Studio in the main process. The research hub reaches the four
 * sources and keeps the shared judgment index; the argument studio runs the loop of
 * lib/studio for one issue. Every write goes through the matter store. Spec: docs/archive/2026-11-15/specs/v4.md.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Corpus, type CachedPage } from "../lib/research-sources/corpus.ts";
import { AWS_LICENCE, highCourtCodes, highCourtName, highCourtYear, supremeCourtYear, type JudgmentMeta } from "../lib/research-sources/aws.ts";
import { readStatute, searchStatutes } from "../lib/research-sources/indiacode.ts";
import { webFetch, webSearch } from "../lib/research-sources/web.ts";
import { getBytes, SourceError } from "../lib/research-sources/http.ts";
import { processPdf } from "../lib/document-intelligence/index.ts";
import { groundedStatus, runLoop, type ArchivedArgument, type LoopContext } from "../lib/studio/index.ts";
import { rehearse } from "../lib/studio/rehearsal.ts";
import { runDissent, type PanelMember } from "../lib/studio/dissent.ts";
import { disposalClass, quickCheck } from "../lib/matter-store/authority2.ts";
import { findCitations } from "../lib/ulos/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { randomUUID } from "node:crypto";
import { MatterStoreError, type MatterStore } from "../lib/matter-store/index.ts";
import { LawStore, instrumentId } from "../lib/law-store/index.ts";
import { FIRST_WAVE } from "../lib/statutes/first-wave.ts";
import { importFirstWave, readProvisionForCheck, type ImportProgress } from "../lib/law-import/index.ts";
import { createPhase5Knowledge } from "../lib/knowledge/skeleton.ts";
import { runRetrieval, type KnowledgeRegistry, type RetrieveOptions } from "../lib/knowledge/index.ts";
import { boundMatterAdapter, type MatterKnowledgePort } from "../lib/knowledge/adapters.ts";
import { paragraphs, edgesOf } from "../lib/legal-corpus/index.ts";
import { bindingEffect } from "../lib/authority/binding.ts";
import { quoteHash, verifyQuote } from "../lib/knowledge/quote.ts";
import { adverseQueries, composeResearchMemo, type VerifiedQuote } from "../lib/research-workflow/index.ts";
import type { Matters } from "./matters.ts";
import type { WriteContext } from "../shared/records.ts";
import type { KnowledgeHealthView, KnowledgeHit, QuoteCheck, RetrievalResult } from "../shared/law.ts";
import type { CorpusPart, ResearchDocument, ResearchHit, ResearchSettings, StudioState } from "../shared/studio.ts";
import { dmy } from "../shared/dates.ts";

export type SourceName = "aws_sc" | "aws_hc" | "indiacode" | "web";

function sourceSwitch(s: SourceName): keyof ResearchSettings {
  return s === "indiacode" ? "indiaCode" : s === "web" ? "web" : "aws";
}

function judgmentHit(j: JudgmentMeta): ResearchHit {
  const cite = [j.insc, j.citation].filter(Boolean).join("; ");
  return {
    source: j.court === "sc" ? "aws_sc" : "aws_hc",
    ref: j.id,
    title: j.title,
    detail: `${j.courtName}, ${j.decisionDate ? dmy(j.decisionDate) : "date not given"}${cite ? `, ${cite}` : ""}${j.cnr ? `, CNR ${j.cnr}` : ""}${j.judge ? `, ${j.judge}` : ""}${j.disposal ? `; ${j.disposal}` : ""}`,
    url: j.pdfUrl,
  };
}

export class ResearchHub {
  private matters: Matters;
  private settings: () => ResearchSettings;
  readonly corpus: Corpus;
  readonly law: LawStore;
  private indexing: string | null = null;
  private lawIndexing: string | null = null;
  private onProgress: (text: string) => void;

  constructor(matters: Matters, corpusFolder: string, settings: () => ResearchSettings, onProgress: (text: string) => void = () => undefined) {
    this.matters = matters;
    // One owner for the corpus file. The judgment metadata and the law rows share the same
    // connection; no second module opens corpus.db. The folder is created here: a fresh user
    // data folder has no corpus/ yet, and sqlite does not create folders.
    mkdirSync(corpusFolder, { recursive: true });
    const db = new DatabaseSync(path.join(corpusFolder, "corpus.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    this.corpus = new Corpus(corpusFolder, db);
    this.law = new LawStore(db);
    this.settings = settings;
    this.onProgress = onProgress;
  }

  private allowed(source: SourceName): void {
    if (!this.settings()[sourceSwitch(source)]) throw new SourceError("SOURCE_OFF", `${source === "indiacode" ? "India Code" : source === "web" ? "Web research" : "AWS Open Data"} is turned off in Settings`);
  }

  /** Every query that leaves the computer is an event of the matter (V4-1). */
  private async log(matterId: string | null, source: SourceName, action: string, query: string, ctx: WriteContext, results: number): Promise<void> {
    if (!matterId) return;
    await this.matters.appendEvent(matterId, ctx, "research.query", null, { source, action, query: query.slice(0, 500), results });
  }

  // ---- the shared index ----

  parts(): CorpusPart[] {
    return this.corpus.parts();
  }

  indexingNow(): string | null {
    return this.indexing;
  }

  lawIndexingNow(): string | null {
    return this.lawIndexing;
  }

  // ---- Phase 5: the shared law library and the one knowledge search ----

  private matterPort(store: MatterStore): MatterKnowledgePort {
    return {
      search: (_matterId, q, ctx): KnowledgeHit[] => {
        const limit = Math.min(Math.max(ctx.limit ?? 20, 1), 60);
        const hits: KnowledgeHit[] = store.find(q.raw, limit).map((hit) => ({
          id: `matter:${hit.kind}:${hit.ref}`,
          scope: "matter",
          kind: hit.kind,
          title: hit.label,
          text: hit.text,
          anchor: hit.ref,
          date: null,
          authority: 0,
          verification: `Matter record (${hit.kind})`,
          stale: false,
          score: 0,
          why: ["text"],
        }));
        return hits;
      },
    };
  }

  private async knowledge(matterId: string | null): Promise<KnowledgeRegistry> {
    const store = matterId ? await this.matters.store(matterId) : null;
    const cpc = FIRST_WAVE.find((item) => item.short === "CPC");
    return createPhase5Knowledge({
      law: this.law,
      matter: store && matterId ? { id: matterId, port: this.matterPort(store) } : null,
      verify: (provision) => readProvisionForCheck(this.law, provision),
      procedureActIds: cpc ? [instrumentId("indiacode", cpc.itemUuid)] : [],
    });
  }

  /** The law counts, the set manifest and one health row per scope, for the Index Health view. */
  async knowledgeHealth(matterId: string | null = null): Promise<KnowledgeHealthView> {
    const registry = await this.knowledge(matterId);
    return { adapters: registry.health(), counts: this.law.counts(), manifest: this.law.manifest() };
  }

  /**
   * One retrieval over the law library, the judgment paragraphs and the bound matter. The matter
   * scope is refused when the caller names another matter. The run is logged as a matter event;
   * the law references are ids, never matter facts.
   */
  async searchKnowledge(matterId: string | null, query: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
    const registry = await this.knowledge(matterId);
    const result = await runRetrieval(registry, query, { ...opts, matterId });
    const profile = matterId ? (await this.matters.store(matterId)).profile() : null;
    const question = {
      court: profile?.court ?? opts.court ?? "",
      jurisdiction: profile?.court ?? null,
      territory: profile?.court ?? null,
      date: profile?.governingDate || opts.date || new Date().toISOString().slice(0, 10),
    };
    for (const hit of result.hits) if (hit.authorityFacts) hit.binding = bindingEffect(hit.authorityFacts, question);
    if (matterId) {
      const store = await this.matters.store(matterId);
      await store.appendEvent({ actor: "agent" }, "knowledge.search", null, {
        query: query.slice(0, 500),
        mode: result.mode,
        hits: result.hits.length,
        lawRefs: result.hits.filter((hit) => hit.scope === "statute" || hit.scope === "procedure" || hit.scope === "research").map((hit) => hit.id).slice(0, 50),
        coverage: result.coverage,
      });
    }
    return result;
  }

  /**
   * The negative search for one issue. It runs the contrary-treatment queries, deduplicates the
   * hits and keeps each query's coverage. It finds candidates; the advocate decides.
   */
  async adverseSearch(matterId: string | null, issue: string, opts: { date?: string | null; limit?: number } = {}): Promise<{ queries: Array<{ query: string; hits: number; coverage: RetrievalResult["coverage"] }>; hits: KnowledgeHit[] }> {
    const queries = adverseQueries(issue);
    const runs = await Promise.all(
      queries.map(async (query) => {
        const result = await this.searchKnowledge(matterId, query, { mode: "natural", scopes: ["research", "statute", "procedure"], date: opts.date ?? null, limit: Math.min(Math.max(opts.limit ?? 8, 1), 20) });
        return { query, result };
      }),
    );
    const seen = new Set<string>();
    const hits: KnowledgeHit[] = [];
    for (const run of runs) {
      for (const hit of run.result.hits) {
        const key = `${hit.scope}:${hit.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(hit);
      }
    }
    return { queries: runs.map((run) => ({ query: run.query, hits: run.result.hits.length, coverage: run.result.coverage })), hits };
  }

  /** The exact source text behind a hit id: a law provision, a judgment paragraph or a matter record. */
  private async hitText(hitId: string, matterId: string | null): Promise<{ text: string; title: string; citation: string } | null> {
    const provision = this.law.provision(hitId);
    if (provision) {
      return {
        text: provision.text,
        title: `${provision.kind} ${provision.number}, ${provision.actTitle}${provision.heading ? `: ${provision.heading}` : ""}`,
        citation: provision.actTitle,
      };
    }
    const paragraph = /^(.*)#p(\d+)$/.exec(hitId);
    if (paragraph) {
      const judgment = this.law.judgment(paragraph[1]);
      const row = this.law.paras(paragraph[1], Number(paragraph[2]), Number(paragraph[2]))[0];
      if (judgment && row) return { text: row.text, title: `${judgment.title}${row.label ? `, para ${row.label}` : ""}`, citation: judgment.citations[0] ?? "" };
    }
    if (matterId) {
      const store = await this.matters.store(matterId);
      const ref = hitId.startsWith("matter:") ? hitId.split(":").slice(2).join(":") : hitId;
      const found = store.find(ref, 8).find((hit) => hit.ref === ref || `${hit.kind}:${hit.ref}` === hitId);
      if (found) return { text: found.text, title: found.label, citation: found.kind };
    }
    return null;
  }

  /** The deterministic quote check for one hit. It never trusts a quote the caller supplies. */
  async verifyQuoteForHit(hitId: string, quote: string, matterId: string | null = null): Promise<QuoteCheck> {
    const source = await this.hitText(hitId, matterId);
    if (!source) return { quote, quoteHash: quoteHash(quote), start: null, end: null, verified: false, detail: "The hit id is not in the shared library or this matter." };
    return verifyQuote(quote, source.text);
  }

  /**
   * Write a quote-first research memorandum. Every selected quote is located in its source; one
   * unverified quote refuses the whole memorandum. The memo is a candidate for the advocate and
   * opens a review item.
   */
  async writeResearchMemo(
    matterId: string,
    input: {
      title: string;
      issueId?: string | null;
      question: string;
      governingDate?: string | null;
      body: string;
      coverage: string;
      quotes: Array<{ hitId: string; quote: string }>;
      adverse?: Array<{ hitId: string; quote: string }>;
      openQuestions?: string[];
    },
    ctx: WriteContext = { actor: "agent" },
  ) {
    const store = await this.matters.store(matterId);
    const verifyAll = async (rows: Array<{ hitId: string; quote: string }>): Promise<VerifiedQuote[]> => {
      const out: VerifiedQuote[] = [];
      for (const row of rows) {
        const source = await this.hitText(row.hitId, matterId);
        if (!source) throw new SourceError("HIT_NOT_FOUND", row.hitId);
        const check = verifyQuote(row.quote, source.text);
        if (!check.verified) throw new SourceError("QUOTE_UNVERIFIED", `${row.quote.slice(0, 120)}: ${check.detail}`);
        out.push({ hitId: row.hitId, title: source.title, citation: source.citation, quote: row.quote, check });
      }
      return out;
    };
    const quotes = await verifyAll(input.quotes);
    const adverse = await verifyAll(input.adverse ?? []);
    const body = composeResearchMemo({
      title: input.title,
      question: input.question,
      governingDate: input.governingDate ?? null,
      body: input.body,
      quotes,
      adverse,
      coverage: input.coverage,
      openQuestions: input.openQuestions ?? [],
    });
    const memo = store.work.addMemorandum(
      {
        title: input.title,
        issueId: input.issueId ?? null,
        body,
        refs: [...quotes, ...adverse].map((row) => row.hitId),
        unresolved: [],
      },
      ctx,
    );
    const reviewItem = store.openReviewItem("research_memo", memo.id, null, `Research memorandum "${memo.title}" is ready for review. ${quotes.length} verified quote(s), ${adverse.length} adverse quote(s).`);
    return { memo, reviewItem, quotes: quotes.length, adverse: adverse.length };
  }

  /** Load the owner's ten-instrument first wave. It writes law rows and source hashes. */
  async loadLawFirstWave(onProgress: (progress: ImportProgress) => void = () => undefined): Promise<{ acts: number; provisions: number; setHash: string; counts: ReturnType<LawStore["counts"]> }> {
    if (this.lawIndexing) throw new SourceError("INDEX_BUSY", `already loading law: ${this.lawIndexing}`);
    this.lawIndexing = "The first wave";
    try {
      const result = await importFirstWave(this.law, (progress) => {
        this.lawIndexing = `${progress.title} (${progress.stage} ${progress.done}/${progress.total})`;
        this.onProgress(this.lawIndexing);
        onProgress(progress);
      });
      return { acts: result.acts.length, provisions: result.provisions, setHash: result.setHash, counts: this.law.counts() };
    } finally {
      this.lawIndexing = null;
      this.onProgress("");
    }
  }

  /**
   * Save one provision from the shared law library as a case-specific copy in this matter. The
   * copy keeps the source reference, so the Studio shows it beside the library row. The advocate
   * decides whether to rely on it.
   */
  async saveLawProvision(matterId: string, provisionId: string, ctx: WriteContext = { actor: "advocate" }) {
    const provision = this.law.provision(provisionId);
    if (!provision) throw new SourceError("NOT_FOUND", provisionId);
    const store = await this.matters.store(matterId);
    const act = this.law.act(provision.actId);
    return store.studio.addProvision(
      {
        sourceRef: provision.sourceRef,
        act: provision.actTitle,
        section: provision.number,
        title: provision.heading || `${provision.kind} ${provision.number}`,
        text: provision.text,
        repealed: provision.status === "repealed" || act?.repealed === true,
        url: provision.sourceUrl,
        retrievedAt: provision.retrievedAt,
      },
      ctx,
    );
  }

  /**
   * Index a judgment's paragraphs and treatment edges after its PDF has been read. The paragraph
   * is the unit; the page and line stay as anchors. A judgment that is only metadata is not
   * searchable by text until it is read once.
   */
  async indexJudgment(ref: string): Promise<{ indexed: boolean; paragraphs: number; edges: number; reason?: string }> {
    const meta = this.corpus.get(ref);
    if (!meta) throw new SourceError("NOT_INDEXED", `${ref} is not in the local index`);
    const cached = this.corpus.cachedText(ref);
    if (!cached) return { indexed: false, paragraphs: 0, edges: 0, reason: "Read the judgment first; its PDF has not been fetched." };
    const paras = paragraphs(cached.pages);
    this.law.putJudgment(
      ref,
      {
        court: meta.court,
        courtName: meta.courtName,
        title: meta.title,
        decisionDate: meta.decisionDate,
        citations: [meta.insc, meta.citation].filter(Boolean),
        judges: meta.judge ? meta.judge.split(/\s*[,;]\s*/).filter(Boolean) : [],
      },
      paras,
      { actor: "system" },
    );
    const edges = edgesOf(ref, paras, (citation) => this.law.byCitation(citation)[0] ?? null, (_kind, number, act) => this.law.findProvision(number, act)[0]?.id ?? null);
    this.law.putEdges(ref, edges, { actor: "system" });
    return { indexed: true, paragraphs: paras.length, edges: edges.length };
  }

  /** Index Supreme Court years. Years already indexed are read again only when `refresh`. */
  async indexSupremeCourt(years: number[], refresh = false): Promise<CorpusPart[]> {
    this.allowed("aws_sc");
    if (this.indexing) throw new SourceError("INDEX_BUSY", `already indexing: ${this.indexing}`);
    const have = new Set(this.parts().filter((p) => p.source === "sc").map((p) => p.year));
    const todo = [...new Set(years)].filter((y) => y >= 1950 && y <= new Date().getFullYear() && (refresh || !have.has(y))).sort();
    try {
      for (const [i, y] of todo.entries()) {
        this.indexing = `Supreme Court ${y} (${i + 1} of ${todo.length})`;
        this.onProgress(this.indexing);
        this.corpus.putPart({ source: "sc", year: y, court: "sc", courtName: "Supreme Court of India" }, await supremeCourtYear(y));
      }
    } finally {
      this.indexing = null;
      this.onProgress("");
    }
    return this.parts();
  }

  private courtNames = new Map<string, string>();

  async highCourts(year: number): Promise<Array<{ code: string; name: string }>> {
    this.allowed("aws_hc");
    const codes = await highCourtCodes(year);
    const out: Array<{ code: string; name: string }> = [];
    for (const code of codes) {
      if (!this.courtNames.has(code)) this.courtNames.set(code, await highCourtName(year, code).catch(() => code));
      out.push({ code, name: this.courtNames.get(code)! });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async indexHighCourt(code: string, year: number): Promise<CorpusPart[]> {
    this.allowed("aws_hc");
    if (this.indexing) throw new SourceError("INDEX_BUSY", `already indexing: ${this.indexing}`);
    try {
      const name = this.courtNames.get(code) ?? (await highCourtName(year, code));
      this.indexing = `${name} ${year}`;
      this.onProgress(this.indexing);
      const rows = await highCourtYear(year, code, (bench, n) => this.onProgress(`${name} ${year}: bench ${bench}, ${n} judgments`));
      this.corpus.putPart({ source: "hc", year, court: code, courtName: name }, rows);
    } finally {
      this.indexing = null;
      this.onProgress("");
    }
    return this.parts();
  }

  // ---- search and read ----

  async search(matterId: string | null, source: SourceName, query: string, opts: { from?: number; to?: number; limit?: number } = {}, ctx: WriteContext = { actor: "advocate" }): Promise<{ hits: ResearchHit[]; notice: string }> {
    const q = String(query ?? "").trim();
    if (!q) return { hits: [], notice: "Type what to look for." };
    if (source === "aws_sc" || source === "aws_hc") {
      const court = source === "aws_sc" ? "sc" : "hc";
      const parts = this.parts().filter((p) => p.source === court);
      if (parts.length === 0) return { hits: [], notice: `No ${court === "sc" ? "Supreme Court year" : "High Court"} is indexed yet. Index it first; until then this search cannot find anything.` };
      let found = this.corpus.search(q, { court, from: opts.from, to: opts.to, limit: opts.limit });
      // A neutral citation in the query: the exact judgment comes first.
      const insc = court === "sc" ? /\b(19[5-9]\d|20\d\d)\s*INSC\s*(\d{1,5})\b/i.exec(q) : null;
      const exact = insc ? this.corpus.byInsc(`${insc[1]} INSC ${insc[2]}`) : undefined;
      if (exact) found = [exact, ...found.filter((j) => j.id !== exact.id)];
      const hits = found.map(judgmentHit);
      // A local search: nothing leaves the computer, but it is still part of the research log.
      await this.log(matterId, source, "search (local index)", q, ctx, hits.length);
      const years = parts.map((p) => p.year);
      return {
        hits,
        notice: `Searched the local index: ${parts.length} part(s), years ${Math.min(...years)} to ${Math.max(...years)}. The index holds titles, parties, judges, citations and CNR numbers, not the judgments' text: to search by subject, search the web, then open the judgment here by its citation. ${AWS_LICENCE}.`,
      };
    }
    this.allowed(source);
    if (source === "indiacode") {
      const r = await searchStatutes(q, opts.limit ?? 10);
      await this.log(matterId, source, "search", q, ctx, r.hits.length);
      return {
        hits: r.hits.map((h) => ({ source, ref: h.id, title: h.title, detail: `${h.kind}${h.section ? ` ${h.section}` : ""}${h.act && h.act !== h.title ? `, ${h.act}` : ""}${h.state && h.state !== "CENTRAL" ? `, ${h.state}` : ""}${h.repealed ? ", REPEALED" : ""}`, url: h.url, repealed: h.repealed })),
        notice: `India Code: ${r.total} result(s). India Code gives the current text; the version in force on your date is not computed.`,
      };
    }
    const hits = await webSearch(q, opts.limit ?? 10);
    await this.log(matterId, source, "search", q, ctx, hits.length);
    // A web result that names a neutral citation is linked to the court's copy when that year is indexed.
    const linked = hits.map((h): ResearchHit => {
      const m = /(19[5-9]d|20dd)s*INSCs*(d{1,5})/i.exec(`${h.title} ${h.snippet}`);
      const j = m ? this.corpus.byInsc(`${m[1]} INSC ${m[2]}`) : undefined;
      return { source, ref: h.url, title: h.title, detail: h.snippet, url: h.url, ...(j ? { courtCopy: { ref: j.id, insc: j.insc, title: j.title } } : {}) };
    });
    return { hits: linked, notice: `Web results are for discovery only. They never verify a citation.${linked.some((h) => h.courtCopy) ? " Results that name an indexed neutral citation link to the court's own copy." : ""}` };
  }

  private async pdfPages(bytes: Uint8Array): Promise<CachedPage[]> {
    const pages = await processPdf(bytes);
    return pages.map((p) => ({ page: p.page, kind: p.kind, lines: p.lines.map((l) => ({ line: l.line, text: l.text })) }));
  }

  /** Read a judgment (fetched once, then from the cache), a section, or a web page. */
  async read(matterId: string | null, source: SourceName, ref: string, ctx: WriteContext = { actor: "advocate" }): Promise<ResearchDocument> {
    if (source === "aws_sc" || source === "aws_hc") {
      const j = this.corpus.get(ref);
      if (!j) throw new SourceError("NOT_INDEXED", `${ref} is not in the local index`);
      let cached = this.corpus.cachedText(ref);
      if (!cached) {
        this.allowed(source);
        const bytes = await getBytes(j.pdfUrl, { timeoutMs: 120_000 });
        const pages = await this.pdfPages(bytes);
        const put = this.corpus.putFile(ref, bytes, pages);
        cached = { sha256: put.sha256, pages };
        await this.log(matterId, source, "fetch judgment", ref, ctx, pages.length);
      }
      // The paragraph is the research unit. Index it once the PDF has been read, so later
      // searches can find the exact paragraph and its treatment edges.
      await this.indexJudgment(ref);
      const h = judgmentHit(j);
      return { source, ref, title: j.title, detail: h.detail, url: j.pdfUrl, sha256: cached.sha256, pages: cached.pages, notice: `${AWS_LICENCE}. The court's PDF as mirrored there, read by page and line.` };
    }
    this.allowed(source);
    if (source === "indiacode") {
      const s = await readStatute(ref);
      await this.log(matterId, source, "read", ref, ctx, 1);
      const lines = s.text.split("\n").filter(Boolean).map((text, i) => ({ line: i + 1, text }));
      return {
        source,
        ref,
        title: `${s.act}${s.section ? `, section ${s.section}` : ""}: ${s.title}`,
        detail: `${s.kind}${s.repealed ? ", REPEALED" : ""}${s.nextSection ? `; next: ${s.nextSection}` : ""}`,
        url: s.url,
        sha256: createHash("sha256").update(s.text).digest("hex"),
        pages: [{ page: 1, lines }],
        notice: "India Code, current text. The version in force on the governing date is not computed; confirm which version applies.",
      };
    }
    const page = await webFetch(ref);
    await this.log(matterId, source, "fetch page", ref, ctx, 1);
    if ("bytes" in page) {
      const pages = await this.pdfPages(page.bytes);
      return { source, ref, title: ref, detail: "PDF from the web", url: ref, sha256: createHash("sha256").update(page.bytes).digest("hex"), pages, notice: "From the web: for discovery only. It verifies nothing." };
    }
    const lines = page.text.split("\n").map((text, i) => ({ line: i + 1, text }));
    const pages: ResearchDocument["pages"] = [];
    for (let i = 0; i < lines.length; i += 60) pages.push({ page: pages.length + 1, lines: lines.slice(i, i + 60).map((l, j) => ({ line: j + 1, text: l.text })) });
    return { source, ref, title: page.title || ref, detail: page.contentType, url: ref, sha256: createHash("sha256").update(page.text).digest("hex"), pages, notice: `From the web: for discovery only. It verifies nothing.${page.truncated ? " The page was cut at 24,000 characters." : ""}` };
  }

  // ---- V5-9 and V5-12: quick check and bench trends ----

  /** Every neutral citation of the matter's authorities and drafts, checked against the index. Not verification. */
  async quickCheck(matterId: string) {
    const store = await this.matters.store(matterId);
    const years = new Set(this.parts().filter((p) => p.source === "sc").map((p) => p.year));
    const index = { yearIndexed: (y: number) => years.has(y), byInsc: (c: string) => this.corpus.byInsc(c) };
    const out = new Map<string, ReturnType<typeof quickCheck>>();
    for (const a of store.work.listAuthorities().filter((x) => x.status !== "rejected")) {
      const cits = findCitations(a.citation);
      for (const c of cits.length ? cits : [a.citation]) out.set(c, quickCheck(c, { parties: a.parties, decisionDate: a.decisionDate }, index));
    }
    for (const d of store.listDrafts()) {
      if (!d.head) continue;
      const text = readParagraphs(await store.revisionBytes(d.head.id)).map((x) => x.text).join("\n");
      for (const c of findCitations(text)) if (!out.has(c)) out.set(c, quickCheck(c, { parties: "", decisionDate: "" }, index));
    }
    return [...out.values()];
  }

  /** Indexed Supreme Court judgments by year and class of disposal. Descriptive; no score for any matter. */
  trends(): Array<{ year: number; total: number; allowed: number; dismissed: number; disposed: number; other: number }> {
    const byYear = new Map<number, { year: number; total: number; allowed: number; dismissed: number; disposed: number; other: number }>();
    for (const r of this.corpus.disposalCounts()) {
      const y = byYear.get(r.year) ?? { year: r.year, total: 0, allowed: 0, dismissed: 0, disposed: 0, other: 0 };
      y.total += r.n;
      y[disposalClass(r.disposal)] += r.n;
      byYear.set(r.year, y);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }

  // ---- saving (V4-2) ----

  async saveJudgment(matterId: string, ref: string, input: { paragraph?: string; proposition?: string; role?: string; issueId?: string | null }, ctx: WriteContext) {
    const j = this.corpus.get(ref);
    if (!j) throw new MatterStoreError("NOT_INDEXED", `${ref} is not in the local index`);
    const role = ["supporting", "adverse", "distinguishable", "other"].includes(input.role ?? "") ? (input.role as "supporting") : "other";
    const store = await this.matters.store(matterId);
    const existing = store.work.listAuthorities().find((a) => a.sourceRef === ref && a.status !== "rejected");
    if (existing) return existing;
    return store.work.addAuthority(
      {
        citation: j.insc || j.citation || (j.cnr ? `CNR ${j.cnr}` : j.title),
        parties: j.title,
        decisionDate: j.decisionDate,
        paragraph: input.paragraph ?? "",
        proposition: input.proposition ?? "",
        role,
        issueId: input.issueId ?? null,
        sourceRef: ref,
      },
      ctx,
    );
  }

  async saveProvision(matterId: string, ref: string, ctx: WriteContext) {
    this.allowed("indiacode");
    const s = await readStatute(ref);
    return (await this.matters.store(matterId)).studio.addProvision(
      { sourceRef: `indiacode:${ref}`, act: s.act, section: s.section, title: s.title, text: s.text, repealed: s.repealed, url: s.url, retrievedAt: new Date().toISOString() },
      ctx,
    );
  }

  // ---- Phase 6: the rows the draft checks read ----

  /**
   * P4: the law library's stored versions of an act's section, or null when it holds none. The
   * check reads through this port; it opens no store of its own.
   */
  statuteRows(actName: string, section: string): Array<{ act: string; section: string; status: string; version: number | null; validFrom: string | null; validUntil: string | null; current: number; checkState: string; sourceRef: string }> | null {
    const wanted = actName.trim().toLowerCase();
    const bare = wanted.replace(/\b(the|act|,)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!wanted || !section.trim()) return null;
    const acts = this.law.acts().filter((a) => {
      const title = a.title.toLowerCase();
      const titleBare = title.replace(/\b(the|act|,)\b/g, " ").replace(/\s+/g, " ").trim();
      return title === wanted || title.includes(wanted) || titleBare === bare || titleBare.includes(bare);
    });
    const rows = acts.flatMap((a) => this.law.versions(a.id, section.trim()));
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      act: r.actTitle,
      section: r.number,
      status: r.status,
      version: r.version,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      current: r.status === "superseded" ? 0 : 1,
      checkState: r.check,
      sourceRef: r.sourceRef,
    }));
  }

  /**
   * P1: each saved authority with the count of its indexed judgment's paragraphs, or null when
   * the judgment is not indexed. A paragraph reference the count does not reach is an error.
   */
  async authorityParagraphs(matterId: string): Promise<Array<{ citation: string; maxParagraph: number | null }>> {
    const store = await this.matters.store(matterId);
    return store.work
      .listAuthorities()
      .filter((a) => a.status !== "rejected")
      .map((a) => {
        const id = this.law.byCitation(a.citation)[0] ?? null;
        const judgment = id ? this.law.judgment(id) : null;
        return { citation: a.citation, maxParagraph: judgment ? judgment.paragraphs : null };
      });
  }
}

// ---------------------------------------------------------------------------------------------

export type Completer = () => Promise<{
  model: string;
  local?: boolean;
  complete: (system: string, user: string, sessionId?: string, onUsage?: (u: { input: number; output: number; totalTokens: number; cost: number }) => void) => Promise<string>;
} | null>;

/** V5-21: one run's model usage, added call by call. */
class Meter {
  input = 0;
  output = 0;
  totalTokens = 0;
  cost = 0;
  add = (u: { input: number; output: number; totalTokens: number; cost: number }): void => {
    this.input += u.input;
    this.output += u.output;
    this.totalTokens += u.totalTokens;
    this.cost += u.cost;
  };
}

export class ArgumentStudio {
  private matters: Matters;
  private completer: Completer;
  /**
   * O5: the role models' completers. The attacking passes (the critic's questions and the
   * opposing counsel's attacks and objections) run on the critic model; the dissent panel asks
   * every role's model. Absent or unresolved: the proposing model runs everything, as before.
   */
  private roleCompleter: ((role: "drafting" | "extraction" | "critic") => Promise<Awaited<ReturnType<Completer>>>) | null;
  private running = new Map<string, string>();
  private progress = new Map<string, string>();
  private stopping = new Set<string>();

  /** V5-5: stop the matter's running loop between steps. */
  stop(matterId: string): boolean {
    if (!this.running.has(matterId)) return false;
    this.stopping.add(matterId);
    return true;
  }

  runningRun(matterId: string): string | null {
    return this.running.get(matterId) ?? null;
  }

  /** V5-21: a used budget refuses the next run. (Decision 24 removed the confidential check.) */
  private async admit(matterId: string, c: { model: string; local?: boolean }): Promise<{ budget: number | null; used: number }> {
    const store = await this.matters.store(matterId);
    const pol = store.policy();
    const used = store.usage().tokens;
    if (pol.budgetTokens != null && used >= pol.budgetTokens) throw new MatterStoreError("BUDGET_USED", `the matter's budget of ${pol.budgetTokens} tokens is used (${used}). Raise the budget to continue`);
    return { budget: pol.budgetTokens, used };
  }

  /** V5-21: the run's usage joins the matter's usage, like a chat turn's. */
  private async recordUsage(matterId: string, model: string, m: Meter, sessionId: string): Promise<void> {
    if (m.totalTokens <= 0) return;
    (await this.matters.store(matterId)).appendEvent({ actor: "agent", sessionId }, "agent.usage", null, { model, input: m.input, output: m.output, totalTokens: m.totalTokens, cost: m.cost });
  }
  private onChange: (matterId: string) => void;

  constructor(matters: Matters, completer: Completer, onChange: (matterId: string) => void = () => undefined, roleCompleter: ((role: "drafting" | "extraction" | "critic") => Promise<Awaited<ReturnType<Completer>>>) | null = null) {
    this.matters = matters;
    this.completer = completer;
    this.roleCompleter = roleCompleter;
    this.onChange = onChange;
  }

  /**
   * O5: the model of one role, or null. A role model that no longer resolves (removed or
   * without credentials) falls back to the proposing model, and the run says so in its event.
   */
  private async roleModel(role: "drafting" | "extraction" | "critic"): Promise<Awaited<ReturnType<Completer>>> {
    return this.roleCompleter ? await this.roleCompleter(role) : null;
  }

  /** The records the loop may use: confirmed events, live authorities and provisions. */
  async context(matterId: string, issueId: string | null): Promise<LoopContext> {
    const store = await this.matters.store(matterId);
    // V5-11: the rehearsal takes every accepted issue; the loop takes one.
    const accepted = store.work.listIssues().filter((i) => i.status === "accepted");
    const issue = issueId ? store.work.listIssues().find((i) => i.id === issueId) : accepted.length ? { id: "all", text: accepted.map((i) => i.text).join(" "), status: "accepted" as const } : undefined;
    if (!issue) throw new MatterStoreError(issueId ? "ISSUE_NOT_FOUND" : "NO_ACCEPTED_ISSUE", issueId ?? "accept an issue at the case conference first");
    if (issue.status !== "accepted") throw new MatterStoreError("ISSUE_NOT_ACCEPTED", "run the loop for an issue you accepted at the case conference");
    const nb = await this.matters.notebook(matterId);
    const checks = store.work.listCitationChecks();
    const attested = new Set(store.work.listAttestations().map((a) => a.citation));
    const latest = new Map<string, string>();
    for (const c of checks) latest.set(c.citation, c.outcome);
    return {
      matter: store.matter().title,
      issue: issue.text,
      events: nb.events
        .filter((e) => e.status === "confirmed" && !e.excluded)
        .sort((a, b) => (a.dateStart < b.dateStart ? -1 : 1))
        .slice(0, 120)
        .map((e) => ({ id: e.id, date: e.dateText, text: e.description, source: `${e.sourceName}, p. ${e.page}, l. ${e.line}` })),
      authorities: store.work
        .listAuthorities()
        .filter((a) => a.status !== "rejected")
        .map((a) => {
          const o = latest.get(a.citation);
          return { id: a.id, citation: a.citation, parties: a.parties, paragraph: a.paragraph, proposition: a.proposition, role: a.role, citationFailed: (o === "failed" || o === "unresolved") && !attested.has(a.citation) };
        }),
      provisions: store.studio
        .listProvisions()
        .filter((p) => p.status !== "rejected")
        .map((p) => ({ id: p.id, act: p.act, section: p.section, title: p.title, text: p.text.slice(0, 600), repealed: p.repealed })),
    };
  }

  async state(matterId: string): Promise<StudioState> {
    const store = await this.matters.store(matterId);
    const args = store.studio.arguments();
    const status = groundedStatus(args);
    const c = await this.completer().catch(() => null);
    const running = this.running.get(matterId) ?? null;
    return {
      assessments: store.studio.assessments(),
      treatments: store.studio.treatments(),
      challenges: store.studio.challenges(),
      provisions: store.studio.listProvisions(),
      runs: store.studio.runs(),
      arguments: args.map((a) => ({ ...a, computed: status.get(a.id) ?? "undecided" })),
      rejections: store.studio.rejections({}, 200),
      theories: store.studio.theories(),
      dissents: store.studio.dissents(),
      loop: {
        available: !!c && !running,
        detail: running ? `Running: ${this.progress.get(matterId) ?? "starting"}` : c ? `Model: ${c.model}` : "No model is available. Set up a model in Pi, then try again.",
        running,
      },
    };
  }

  /** Start the loop for one accepted issue. Returns the run id; the loop continues in the background. */
  async start(matterId: string, issueId: string, opts: { rounds?: number; generators?: number } = {}, ctx: WriteContext = { actor: "advocate" }): Promise<string> {
    if (this.running.has(matterId)) throw new MatterStoreError("LOOP_BUSY", "a loop is already running for this matter");
    const c = await this.completer();
    if (!c) throw new MatterStoreError("NO_MODEL", "no model is available. Set up a model in Pi, then try again");
    const allowance = await this.admit(matterId, c);
    const meter = new Meter();
    const criticMeter = new Meter();
    const context = await this.context(matterId, issueId);
    if (context.events.length === 0 && context.authorities.length === 0) throw new MatterStoreError("NO_RECORDS", "confirm Notebook events or add authorities first: the loop uses records only");
    const rounds = Math.min(Math.max(Math.trunc(opts.rounds ?? 2), 1), 4);
    const generators = Math.min(Math.max(Math.trunc(opts.generators ?? 3), 1), 6);
    const store = await this.matters.store(matterId);
    const run = store.studio.startRun({ issueId, model: c.model, rounds, generators }, ctx);
    this.running.set(matterId, run.id);
    const folder = path.join(store.folder, "studio", run.id);
    await mkdir(folder, { recursive: true });
    let n = 0;
    const calls: Array<{ label: string; request: string; response: string }> = [];
    const complete = async (system: string, user: string, label: string) => {
      const response = await c.complete(system, user, `openadvo-studio-${run.id}`, meter.add);
      const i = ++n;
      const record = { label, model: c.model, system, user, response };
      const request = createHash("sha256").update(JSON.stringify({ system, user })).digest("hex");
      calls.push({ label, request, response: createHash("sha256").update(response).digest("hex") });
      await writeFile(path.join(folder, `${String(i).padStart(3, "0")}-${label.replace(/[^\w-]+/g, "_")}.json`), JSON.stringify(record, null, 2));
      return response;
    };
    // O5 (K2): the critic's completer. When the advocate set a critic model that resolves, the
    // attacking passes run on it; the calls are recorded beside the proposing model's.
    const critic = await this.roleModel("critic");
    const criticComplete =
      critic && critic.model !== c.model
        ? async (system: string, user: string, label: string) => {
            const response = await critic.complete(system, user, `openadvo-studio-${run.id}`, criticMeter.add);
            const i = ++n;
            const record = { label, model: critic.model, system, user, response };
            calls.push({ label: `${label} (critic ${critic.model})`, request: createHash("sha256").update(JSON.stringify({ system, user })).digest("hex"), response: createHash("sha256").update(response).digest("hex") });
            await writeFile(path.join(folder, `${String(i).padStart(3, "0")}-${label.replace(/[^\w-]+/g, "_")}.json`), JSON.stringify(record, null, 2));
            return response;
          }
        : undefined;
    const archive: ArchivedArgument[] = store.studio
      .arguments(issueId)
      .filter((a) => a.status !== "rejected")
      .map((a) => ({ id: a.id, ground: a.ground, stance: a.stance, claim: a.claim, reasoning: a.reasoning, elo: a.elo, attacks: a.attacks }));
    void (async () => {
      try {
        const stats = await runLoop({
          complete,
          criticComplete,
          context,
          rounds,
          generators,
          archive,
          rejections: (cell) => store.studio.rejections({ ground: cell.ground, stance: cell.stance }, 5).map((r) => ({ reason: r.reason, detail: r.detail })),
          addArgument: (round, v, attack) => {
            const a = store.studio.addArgument({ runId: run.id, issueId, round, ground: v.ground, stance: v.stance, claim: v.claim, reasoning: v.reasoning, events: v.events, authorities: v.authorities, provisions: v.provisions, attacks: attack?.target ?? null, attackKind: attack?.kind ?? null });
            this.onChange(matterId);
            return { id: a.id, ground: a.ground, stance: a.stance, claim: a.claim, reasoning: a.reasoning, elo: a.elo, attacks: a.attacks };
          },
          addRejection: (round, cell, reason, detail, claim) => store.studio.addRejection({ runId: run.id, round, ground: cell.ground, stance: cell.stance, reason, detail, claim }),
          setQuestions: (id, q) => store.studio.setQuestions(id, q),
          setElo: (id, elo) => store.studio.setElo(id, elo),
          // The loop also stops between steps once the run has used the rest of the budget.
          shouldStop: () => this.stopping.has(matterId) || (allowance.budget != null && allowance.used + meter.totalTokens + criticMeter.totalTokens >= allowance.budget),
          onProgress: (t) => {
            this.progress.set(matterId, t);
            this.onChange(matterId);
          },
        });
        await writeFile(path.join(folder, "calls.json"), JSON.stringify(calls, null, 2));
        store.studio.finishRun(run.id, "done", { ...stats }, null);
      } catch (e) {
        store.studio.finishRun(run.id, "failed", { calls: n }, (e as Error).message);
      } finally {
        await this.recordUsage(matterId, c.model, meter, `openadvo-studio-${run.id}`).catch((e) => console.error(`studio usage: ${(e as Error).message}`));
        if (criticComplete && critic) await this.recordUsage(matterId, critic.model, criticMeter, `openadvo-studio-${run.id}`).catch((e) => console.error(`studio usage: ${(e as Error).message}`));
        this.running.delete(matterId);
        this.stopping.delete(matterId);
        this.progress.delete(matterId);
        this.onChange(matterId);
      }
    })();
    return run.id;
  }

  /** Resolves when the matter's loop has finished (tests). */
  async idle(matterId: string): Promise<void> {
    while (this.running.has(matterId)) await new Promise((r) => setTimeout(r, 50));
  }

  /**
   * V5-11: the admission-hearing rehearsal. Model answers that are not anchored are dropped;
   * the verified defects of the matter (open draft defects) join the challenge register.
   */
  async rehearse(matterId: string, ctx: WriteContext = { actor: "advocate" }): Promise<{ runId: string; added: number; rejected: number }> {
    const c = await this.completer();
    if (!c) throw new MatterStoreError("NO_MODEL", "no model is available. Set up a model in Pi, then try again");
    await this.admit(matterId, c);
    const meter = new Meter();
    const context = await this.context(matterId, null);
    const store = await this.matters.store(matterId);
    const runId = randomUUID();
    const folder = path.join(store.folder, "studio", `rehearsal-${runId}`);
    await mkdir(folder, { recursive: true });
    let n = 0;
    let r: Awaited<ReturnType<typeof rehearse>>;
    // O5 (K2): the objections pass takes the critic's model, with its calls recorded beside the
    // proposing model's, and its usage attributed to it.
    const critic = await this.roleModel("critic");
    const criticMeter = new Meter();
    const criticComplete =
      critic && critic.model !== c.model
        ? async (system: string, user: string, label: string) => {
            const response = await critic.complete(system, user, `openadvo-rehearsal-${runId}`, criticMeter.add);
            await writeFile(path.join(folder, `${String(++n).padStart(3, "0")}-${label}.json`), JSON.stringify({ label, model: critic.model, system, user, response }, null, 2));
            return response;
          }
        : undefined;
    try {
      r = await rehearse(
        async (system, user, label) => {
          const response = await c.complete(system, user, `openadvo-rehearsal-${runId}`, meter.add);
          await writeFile(path.join(folder, `${String(++n).padStart(3, "0")}-${label}.json`), JSON.stringify({ label, model: c.model, system, user, response }, null, 2));
          return response;
        },
        context,
        criticComplete,
      );
    } finally {
      await this.recordUsage(matterId, c.model, meter, `openadvo-rehearsal-${runId}`);
      if (criticComplete && critic && criticMeter.totalTokens > 0) await this.recordUsage(matterId, critic.model, criticMeter, `openadvo-rehearsal-${runId}`);
    }
    for (const it of r.items) store.studio.addChallenge({ runId, kind: it.kind, category: it.category, text: it.text, answer: it.answer, refs: it.refs, origin: "generated" });
    for (const item of store.listReviewItems().filter((x) => x.status === "open" && x.draftId)) {
      if (store.studio.challenges().some((ch) => ch.origin === "verified_defect" && ch.text === item.detail)) continue;
      store.studio.addChallenge({ runId, kind: "objection", category: "verified defect", text: item.detail, answer: "", refs: [item.id], origin: "verified_defect" });
    }
    store.appendEvent(ctx, "rehearsal.run", runId, { model: c.model, items: r.items.length, rejected: r.rejected.length });
    this.onChange(matterId);
    return { runId, added: r.items.length, rejected: r.rejected.length };
  }

  /** The weak-points report: for each accepted argument, unanswered questions and attacks not defeated. */
  async weakPoints(matterId: string): Promise<Array<{ claim: string; questions: string[]; attacks: Array<{ kind: string; claim: string }> }>> {
    const store = await this.matters.store(matterId);
    const args = store.studio.arguments();
    const status = groundedStatus(args);
    return args
      .filter((a) => a.status === "accepted" && !a.attacks)
      .map((a) => ({
        claim: a.claim,
        questions: a.questions,
        attacks: args.filter((x) => x.attacks === a.id && x.status !== "rejected" && status.get(x.id) !== "out").map((x) => ({ kind: x.attackKind ?? "attack", claim: x.claim })),
      }));
  }

  /**
   * Phase 7 (K5): the dissent panel. One hard question to every configured model — the drafting,
   * extraction and critic models and the chat's, the distinct ones only. Every answer or refusal
   * is kept. A split opens one review item naming every answer; the advocate weighs them.
   */
  async askDissent(matterId: string, question: string, ctx: WriteContext = { actor: "advocate" }): Promise<{ answers: Array<{ role: string; model: string; answer: string; refused: string }>; split: boolean; splitPair: Array<{ role: string; model: string }> | null }> {
    const c = await this.completer();
    if (!c) throw new MatterStoreError("NO_MODEL", "no model is available. Set up a model in Pi, then try again");
    await this.admit(matterId, c);
    const store = await this.matters.store(matterId);
    const context = await this.context(matterId, null);
    const runId = randomUUID();
    const folder = path.join(store.folder, "studio", `dissent-${runId}`);
    await mkdir(folder, { recursive: true });
    // The panel: the chat model and each role model that resolves, one member per distinct model.
    const meters = new Map<string, Meter>();
    const member = (role: string, model: string, complete: (system: string, user: string, sessionId?: string, onUsage?: (u: { input: number; output: number; totalTokens: number; cost: number }) => void) => Promise<string>): PanelMember => {
      const meter = new Meter();
      meters.set(`${role}:${model}`, meter);
      return {
        role,
        model,
        complete: async (system, user, label) => {
          const response = await complete(system, user, `openadvo-dissent-${runId}`, meter.add);
          await writeFile(path.join(folder, `${label}.json`), JSON.stringify({ label, model, system, user, response }, null, 2));
          return response;
        },
      };
    };
    const panel: PanelMember[] = [member("chat", c.model, c.complete)];
    for (const role of ["drafting", "extraction", "critic"] as const) {
      const r = await this.roleModel(role);
      if (r && !panel.some((m) => m.model === r.model)) panel.push(member(role, r.model, r.complete));
    }
    const result = await runDissent(question, context, panel);
    for (const a of result.answers) {
      store.studio.addDissent({ question, model: a.model, role: a.role, answer: a.answer, refused: a.refused });
    }
    if (result.split && result.splitPair) {
      const [a, b] = result.splitPair;
      const answers = result.answers.map((x) => `${x.role} (${x.model}): ${x.answer || `refused — ${x.refused}`}`).join("\n");
      store.openReviewItem(
        "dissent_split",
        null,
        null,
        `The dissent panel split on: "${question.slice(0, 300)}". ${a.role} (${a.model}) and ${b.role} (${b.model}) answer differently. Read every answer on the Strategy view; the advocate decides.\n${answers.slice(0, 3000)}`,
      );
    }
    store.appendEvent(ctx, "dissent.run", runId, { question: question.slice(0, 500), models: result.answers.map((x) => x.model), split: result.split });
    for (const [key, meter] of meters) {
      const model = key.slice(key.indexOf(":") + 1);
      if (meter.totalTokens > 0) await this.recordUsage(matterId, model, meter, `openadvo-dissent-${runId}`).catch(() => undefined);
    }
    this.onChange(matterId);
    return { answers: result.answers, split: result.split, splitPair: result.splitPair };
  }
}
