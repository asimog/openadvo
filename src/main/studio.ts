/**
 * V4: the Research and Argument Studio in the main process. The research hub reaches the four
 * sources and keeps the shared judgment index; the argument studio runs the loop of
 * lib/studio for one issue. Every write goes through the matter store. Spec: docs/specs/v4.md.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Corpus, type CachedPage } from "../lib/research-sources/corpus.ts";
import { AWS_LICENCE, highCourtCodes, highCourtName, highCourtYear, supremeCourtYear, type JudgmentMeta } from "../lib/research-sources/aws.ts";
import { readStatute, searchStatutes } from "../lib/research-sources/indiacode.ts";
import { webFetch, webSearch } from "../lib/research-sources/web.ts";
import { getBytes, SourceError } from "../lib/research-sources/http.ts";
import { processPdf } from "../lib/document-intelligence/index.ts";
import { groundedStatus, runLoop, type ArchivedArgument, type LoopContext } from "../lib/studio/index.ts";
import { rehearse } from "../lib/studio/rehearsal.ts";
import { disposalClass, quickCheck } from "../lib/matter-store/authority2.ts";
import { findCitations } from "../lib/ulos/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { randomUUID } from "node:crypto";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { Matters } from "./matters.ts";
import type { WriteContext } from "../shared/records.ts";
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
  private indexing: string | null = null;
  private onProgress: (text: string) => void;

  constructor(matters: Matters, corpusFolder: string, settings: () => ResearchSettings, onProgress: (text: string) => void = () => undefined) {
    this.matters = matters;
    this.corpus = new Corpus(corpusFolder);
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
    // V5-21: a confidential matter sends no query to the open web.
    if (source === "web" && matterId && (await this.matters.store(matterId)).policy().confidential) throw new SourceError("CONFIDENTIAL_MATTER", "this matter is confidential: web search is off for it");
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
}

// ---------------------------------------------------------------------------------------------

export type Completer = () => Promise<{ model: string; local?: boolean; complete: (system: string, user: string, sessionId?: string) => Promise<string> } | null>;

export class ArgumentStudio {
  private matters: Matters;
  private completer: Completer;
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
  private onChange: (matterId: string) => void;

  constructor(matters: Matters, completer: Completer, onChange: (matterId: string) => void = () => undefined) {
    this.matters = matters;
    this.completer = completer;
    this.onChange = onChange;
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
    if ((await this.matters.store(matterId)).policy().confidential && c.local === false) throw new MatterStoreError("CONFIDENTIAL_MATTER", `this matter is confidential: ${c.model} is not a model on this computer`);
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
      const response = await c.complete(system, user, `openadvo-studio-${run.id}`);
      const i = ++n;
      const record = { label, model: c.model, system, user, response };
      const request = createHash("sha256").update(JSON.stringify({ system, user })).digest("hex");
      calls.push({ label, request, response: createHash("sha256").update(response).digest("hex") });
      await writeFile(path.join(folder, `${String(i).padStart(3, "0")}-${label.replace(/[^\w-]+/g, "_")}.json`), JSON.stringify(record, null, 2));
      return response;
    };
    const archive: ArchivedArgument[] = store.studio
      .arguments(issueId)
      .filter((a) => a.status !== "rejected")
      .map((a) => ({ id: a.id, ground: a.ground, stance: a.stance, claim: a.claim, reasoning: a.reasoning, elo: a.elo, attacks: a.attacks }));
    void (async () => {
      try {
        const stats = await runLoop({
          complete,
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
          shouldStop: () => this.stopping.has(matterId),
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
    if ((await this.matters.store(matterId)).policy().confidential && c.local === false) throw new MatterStoreError("CONFIDENTIAL_MATTER", `this matter is confidential: ${c.model} is not a model on this computer`);
    const context = await this.context(matterId, null);
    const store = await this.matters.store(matterId);
    const runId = randomUUID();
    const folder = path.join(store.folder, "studio", `rehearsal-${runId}`);
    await mkdir(folder, { recursive: true });
    let n = 0;
    const r = await rehearse(async (system, user, label) => {
      const response = await c.complete(system, user, `openadvo-rehearsal-${runId}`);
      await writeFile(path.join(folder, `${String(++n).padStart(3, "0")}-${label}.json`), JSON.stringify({ label, model: c.model, system, user, response }, null, 2));
      return response;
    }, context);
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
}
