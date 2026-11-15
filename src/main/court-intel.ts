/**
 * Phase 2: the court adapter framework in the main process (docs/specs/court-adapters.md).
 * It finds the adapters in their three tiers, says what the advocate's profile needs, and builds
 * a list only when it is needed: it downloads only the documents that list names, from the
 * adapter's own hosts, reads their text, checks every item's quote, and records the list in
 * intel.db. It also gives a matter its checklist, its format checks and its defects. An adapter
 * is data: nothing in it runs.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_DOC_BYTES, allowedUrl, checkAdapter, compareVersions, extractSection, findLink, findQuote, listsForCaseType, matchDefects, recommended, runFormatCheck, scopeLines, type DocLine, type PdfFacts } from "../lib/court-adapters/index.ts";
import { court as directoryCourt, appealRoute, type DirectoryCourt } from "../lib/court-directory/index.ts";
import { extractText, pdfHasOutline } from "../lib/document-intelligence/index.ts";
import { isPdfA } from "../lib/filing/index.ts";
import { get } from "../lib/research-sources/http.ts";
import { freshness, type IntelStore, type NewItem } from "../lib/intel-store/index.ts";
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import type { MatterStore } from "../lib/matter-store/index.ts";
import type { WriteContext } from "../shared/records.ts";
import type { ComplianceResult } from "../shared/work.ts";
import type { AdapterDefinition, AdapterList, AdapterSource, AdapterSummary, AdapterTier, BenchRow, DefectRow, FormatCheckResult, MatterChecklist, PackList } from "../shared/intel.ts";

export interface AdapterDirs {
  builtIn: string;
  vendored: string;
  advocate: string;
}

export interface CourtIntelDeps {
  intel: IntelStore;
  advocate: AdvocateStore;
  /** The matter store of one matter. */
  store(matterId: string): Promise<MatterStore>;
  /** The PDFs of the matter's newest filing set, with their paths. */
  filingFiles(matterId: string): Promise<Array<{ name: string; path: string }>>;
  dirs: AdapterDirs;
  /** Where downloaded documents are kept, by SHA-256. */
  docsDir: string;
}

interface Loaded {
  adapter: AdapterDefinition | null;
  summary: AdapterSummary;
}

export interface CourtOverview {
  court: DirectoryCourt;
  route: Array<{ id: string; name: string }>;
  adapter: AdapterSummary | null;
  lists: Array<{ key: string; kind: string; title: string; source: string; recommended: boolean; caseTypes: string[]; built: PackList | null }>;
  proceedings: AdapterDefinition["proceedings"];
  benches: BenchRow[];
}

const SYSTEM: WriteContext = { actor: "system" };

const words = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export class CourtIntel {
  private readonly d: CourtIntelDeps;
  private cache: Loaded[] | null = null;

  constructor(deps: CourtIntelDeps) {
    this.d = deps;
  }

  // ---- The adapters: three tiers, the highest version runs ----

  private loadTier(dir: string, tier: AdapterTier): Loaded[] {
    if (!existsSync(dir)) return [];
    const out: Loaded[] = [];
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name, "adapter.json");
      if (!existsSync(file)) continue;
      let raw: unknown = null;
      let errors: string[] = [];
      try {
        raw = JSON.parse(readFileSync(file, "utf8"));
      } catch (e) {
        errors = [`adapter.json cannot be read: ${(e as Error).message}`];
      }
      const checked = errors.length ? { adapter: null, errors } : checkAdapter(raw);
      const a = checked.adapter;
      const r = (raw ?? {}) as Record<string, unknown>;
      out.push({
        adapter: a,
        summary: {
          id: a?.id ?? String(r.id ?? name),
          version: a?.version ?? String(r.version ?? "0.0.0"),
          title: a?.title ?? String(r.title ?? name),
          courts: a?.courts ?? [],
          tier,
          folder: path.dirname(file),
          author: a?.author ?? "",
          review: a?.review ?? "",
          error: checked.errors.length ? checked.errors.join("; ") : null,
          shadowed: false,
          lists: (a?.lists ?? []).map((l) => ({ key: l.key, kind: l.kind, title: l.title, caseTypes: l.needs?.caseTypes ?? [], practice: l.needs?.practice ?? [] })),
          proceedings: (a?.proceedings ?? []).map((p) => ({ key: p.key, title: p.title, caseType: p.caseType })),
          general: a?.general ?? {},
          recommended: [],
        },
      });
    }
    return out;
  }

  private all(fresh = false): Loaded[] {
    if (!this.cache || fresh) {
      const loaded = [...this.loadTier(this.d.dirs.builtIn, "built-in"), ...this.loadTier(this.d.dirs.vendored, "vendored"), ...this.loadTier(this.d.dirs.advocate, "advocate")];
      const best = new Map<string, Loaded>();
      for (const l of loaded) {
        if (!l.adapter) continue;
        const have = best.get(l.adapter.id);
        if (!have || compareVersions(l.adapter.version, have.adapter!.version) > 0) best.set(l.adapter.id, l);
      }
      for (const l of loaded) l.summary.shadowed = !!l.adapter && best.get(l.adapter.id) !== l;
      this.cache = loaded;
    }
    return this.cache;
  }

  /** Every adapter file found, with its tier, error or shadowing, and the lists recommended for the profile. */
  adapters(fresh = false): AdapterSummary[] {
    const practice = this.profile().practice;
    return this.all(fresh).map((l) => ({ ...l.summary, recommended: l.adapter ? recommended(l.adapter, practice) : [] }));
  }

  /** The adapter that runs for an id. */
  adapter(id: string): AdapterDefinition | null {
    return this.all().find((l) => l.adapter?.id === id && !l.summary.shadowed)?.adapter ?? null;
  }

  /** The adapter that runs for a court of the directory. */
  adapterFor(courtId: string): AdapterDefinition | null {
    return this.all().find((l) => l.adapter && !l.summary.shadowed && l.adapter.courts.includes(courtId))?.adapter ?? null;
  }

  // ---- The profile decides what is needed ----

  /** The advocate's courts and practice areas, from advocate.db. */
  profile(): { courts: string[]; practice: string[] } {
    const f = this.d.advocate.profile().fields;
    return { courts: words(f.courts).filter((c) => !!directoryCourt(c)), practice: words(f.practice).map((p) => p.toLowerCase()) };
  }

  setProfile(input: { courts?: string[]; practice?: string[] }): { courts: string[]; practice: string[] } {
    if (input.courts) {
      const bad = input.courts.filter((c) => !directoryCourt(c));
      if (bad.length) throw new Error(`BAD_COURT: not in the directory: ${bad.join(", ")}`);
      this.d.advocate.setProfileField("courts", [...new Set(input.courts)].join(", "), { actor: "advocate" });
    }
    if (input.practice) this.d.advocate.setProfileField("practice", [...new Set(input.practice.map((p) => p.trim().toLowerCase()).filter(Boolean))].join(", "), { actor: "advocate" });
    return this.profile();
  }

  /** Court Intelligence: the advocate's courts, their adapters, and the lists each has or could build. Nothing is downloaded. */
  overview(): CourtOverview[] {
    const { courts, practice } = this.profile();
    return courts.map((id) => {
      const c = directoryCourt(id)!;
      const a = this.adapterFor(id);
      const summary = a ? this.adapters().find((s) => s.id === a.id && !s.shadowed) ?? null : null;
      const rec = a ? recommended(a, practice) : [];
      return {
        court: c,
        route: appealRoute(id).map((r) => ({ id: r.id, name: r.name })),
        adapter: summary,
        lists: (a?.lists ?? []).map((l) => ({ key: l.key, kind: l.kind, title: l.title, source: l.source, recommended: rec.includes(l.key), caseTypes: l.needs?.caseTypes ?? [], built: this.readList(a!.id, l.key) })),
        proceedings: a?.proceedings ?? [],
        benches: this.d.intel.benches(id),
      };
    });
  }

  /** A built list with its freshness and whether a higher adapter version is active. */
  readList(adapterId: string, key: string): PackList | null {
    const list = this.d.intel.currentList(adapterId, key);
    if (!list) return null;
    const src = list.sourceId ? this.d.intel.source(list.sourceId) : null;
    const current = this.adapter(adapterId);
    return {
      ...list,
      freshness: src ? freshness(src) : null,
      upgrade: current && compareVersions(current.version, list.adapterVersion) > 0 ? current.version : null,
    };
  }

  // ---- Building a list on demand ----

  private async fetchPdf(adapter: AdapterDefinition, src: AdapterSource): Promise<{ bytes: Uint8Array; url: string }> {
    let url: string | null = null;
    if (src.locate) {
      if (!allowedUrl(adapter, src.locate.index)) throw new Error(`HOST_REFUSED: ${src.locate.index} is not on the adapter's hosts`);
      try {
        const html = await (await get(src.locate.index, { timeoutMs: 30_000 })).text();
        url = findLink(html, src.locate.linkText, src.locate.index);
      } catch {
        url = null;
      }
    }
    url ??= src.url ?? null;
    if (!url) throw new Error(`NOT_FOUND: no link "${src.locate?.linkText}" on the court's page, and no fallback address`);
    if (!allowedUrl(adapter, url)) throw new Error(`HOST_REFUSED: ${url} is not on the adapter's hosts`);
    const res = await get(url, { timeoutMs: 120_000 });
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_DOC_BYTES) throw new Error(`TOO_LARGE: ${url} is ${Math.round(length / 1048576)} MB`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_DOC_BYTES) throw new Error(`TOO_LARGE: ${url}`);
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error(`NOT_PDF: ${url} did not return a PDF`);
    return { bytes, url };
  }

  /** Record a PDF (downloaded or uploaded) as the current version of an adapter's source, with its text. */
  private async recordPdf(adapter: AdapterDefinition, src: AdapterSource, bytes: Uint8Array, url: string, method: "official_feed" | "manual_upload", ctx: WriteContext): Promise<string> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    mkdirSync(this.d.docsDir, { recursive: true });
    const file = path.join(this.d.docsDir, `${sha256}.pdf`);
    if (!existsSync(file)) await writeFile(file, bytes);
    const pages = await extractText(bytes);
    const source = this.d.intel.recordSource(
      {
        key: `${adapter.id}:${src.key}`,
        name: src.title,
        sourceUrl: url,
        owner: src.owner,
        retrievedAt: new Date().toISOString(),
        checkedBy: method === "manual_upload" ? "uploaded by the advocate" : `adapter ${adapter.id} ${adapter.version}`,
        accessMethod: method,
        reliability: method === "manual_upload" ? `${src.reliability}, uploaded by the advocate` : src.reliability,
        checkDays: src.checkDays,
      },
      ctx,
    );
    this.d.intel.recordDoc({ sha256, sourceId: source.id, url, bytes: bytes.length, pages: pages.map((p) => ({ page: p.page, lines: p.lines.map((l) => l.text) })), pagesWithText: pages.filter((p) => p.kind !== "none").length }, ctx);
    // recordDoc keeps one row per content: the same PDF again belongs to the new source version too.
    return sha256;
  }

  /** The lines of a source's document: from intel.db while fresh, else downloaded now. */
  private async lines(adapter: AdapterDefinition, src: AdapterSource, ctx: WriteContext): Promise<{ lines: DocLine[]; sourceId: string }> {
    const key = `${adapter.id}:${src.key}`;
    const cur = this.d.intel.currentSource(key);
    const doc = this.d.intel.docOfKey(key);
    if (cur && doc && freshness(cur).state === "fresh") return { lines: this.d.intel.docLines(doc.sha256), sourceId: cur.id };
    const { bytes, url } = await this.fetchPdf(adapter, src);
    const sha = await this.recordPdf(adapter, src, bytes, url, "official_feed", ctx);
    return { lines: this.d.intel.docLines(sha), sourceId: this.d.intel.currentSource(key)!.id };
  }

  /** B2: the advocate uploads a source document by hand (for a site that cannot be reached, or a newer copy). */
  async uploadSource(adapterId: string, sourceKey: string, filePath: string): Promise<{ sourceKey: string; pages: number }> {
    const adapter = this.adapter(adapterId);
    if (!adapter) throw new Error(`NO_ADAPTER: ${adapterId}`);
    const src = adapter.sources.find((s) => s.key === sourceKey);
    if (!src) throw new Error(`NOT_FOUND: the adapter has no source ${sourceKey}`);
    const bytes = new Uint8Array(await readFile(filePath));
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error("NOT_PDF: the file is not a PDF");
    const sha = await this.recordPdf(adapter, src, bytes, `file:${path.basename(filePath)}`, "manual_upload", { actor: "advocate" });
    return { sourceKey, pages: new Set(this.d.intel.docLines(sha).map((l) => l.page)).size };
  }

  /** Build (or rebuild) one list. Downloads only its source document, and only when it is not fresh. */
  async buildList(adapterId: string, key: string, ctx: WriteContext = SYSTEM): Promise<PackList> {
    const adapter = this.adapter(adapterId);
    if (!adapter) throw new Error(`NO_ADAPTER: no adapter ${adapterId}`);
    const def = adapter.lists.find((l) => l.key === key);
    if (!def) throw new Error(`NOT_FOUND: the adapter ${adapterId} has no list ${key}`);
    const src = adapter.sources.find((s) => s.key === def.source)!;
    const { lines, sourceId } = await this.lines(adapter, src, ctx);
    const items = this.items(def, lines);
    this.d.intel.recordProceedings(adapter.id, adapter.version, adapter.proceedings, ctx);
    this.d.intel.recordList({ adapterId: adapter.id, adapterVersion: adapter.version, court: adapter.courts[0], key: def.key, kind: def.kind, title: def.title, sourceId, items }, ctx);
    return this.readList(adapter.id, def.key)!;
  }

  private items(def: AdapterList, lines: DocLine[]): NewItem[] {
    if (def.extract) {
      return extractSection(lines, def.extract.start, def.extract.end).map((x) => ({ text: `${x.n}. ${x.text}`, ref: `rule ${x.n}`, quote: x.text.slice(0, 120), status: "verified" as const, page: x.page, line: x.line, found: x.text.slice(0, 600) }));
    }
    const scoped = scopeLines(lines, def.scope);
    return (def.items ?? []).map((it) => {
      const base = { text: it.text, ref: it.ref ?? null, quote: it.quote ?? null, skill: it.skill ?? null, value: it.value == null ? null : String(it.value) };
      if (!it.quote) return { ...base, status: "no_quote" as const };
      const m = scoped.found ? findQuote(scoped.lines, it.quote) : null;
      return m ? { ...base, status: "verified" as const, page: m.page, line: m.line, found: m.found } : { ...base, status: "not_found" as const };
    });
  }

  /** B10: the advocate corrects or adds an item. */
  editList(listId: string, change: { n: number | null; text: string; source: string; ref?: string }): PackList {
    const list = this.d.intel.editList(listId, change, { actor: "advocate" });
    return this.readList(list.adapterId, list.key)!;
  }

  addBench(input: { court: string; date: string; bench: string; judges: string; source: string }): BenchRow {
    if (!directoryCourt(input.court)) throw new Error(`BAD_COURT: ${input.court}`);
    return this.d.intel.addBench(input, { actor: "advocate" });
  }

  // ---- Modify, upgrade and vendor in ----

  /** "Edit a copy": the adapter, copied into the advocate's folder with the next patch version. */
  forkAdapter(id: string): AdapterSummary {
    const a = this.adapter(id);
    if (!a) throw new Error(`NO_ADAPTER: ${id}`);
    const [x, y, z] = a.version.split(".").map(Number);
    const next = { ...a, version: `${x}.${y}.${z + 1}`, author: "advocate", review: `copied from ${a.id} ${a.version} by the advocate` };
    const folder = path.join(this.d.dirs.advocate, a.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "adapter.json"), JSON.stringify(next, null, 2));
    return this.adapters(true).find((s) => s.folder === folder)!;
  }

  /** Add an adapter from a folder (or a file) the advocate picked. It is checked before it is copied. */
  addAdapter(fromPath: string): AdapterSummary {
    const file = fromPath.endsWith(".json") ? fromPath : path.join(fromPath, "adapter.json");
    const text = readFileSync(file, "utf8");
    const { adapter, errors } = checkAdapter(JSON.parse(text));
    if (!adapter) throw new Error(`BAD_ADAPTER: ${errors.join("; ")}`);
    const folder = path.join(this.d.dirs.advocate, adapter.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "adapter.json"), text);
    const lockFile = path.join(this.d.dirs.advocate, "adapters.lock.json");
    const lock = existsSync(lockFile) ? (JSON.parse(readFileSync(lockFile, "utf8")) as Record<string, unknown>) : {};
    lock[adapter.id] = { version: adapter.version, from: fromPath, sha256: createHash("sha256").update(text).digest("hex"), addedAt: new Date().toISOString() };
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));
    return this.adapters(true).find((s) => s.folder === folder)!;
  }

  // ---- A matter: its checklist, format checks and defects ----

  /** B11: set the court and case type; the lists the filing needs are built now (downloading only their documents). */
  async setTarget(matterId: string, courtId: string, caseType: string): Promise<MatterChecklist> {
    if (!directoryCourt(courtId)) throw new Error(`BAD_COURT: ${courtId} is not in the directory`);
    const store = await this.d.store(matterId);
    const adapter = this.adapterFor(courtId);
    const needed = adapter ? listsForCaseType(adapter, caseType) : [];
    store.setFilingTarget({ court: courtId, caseType, listKey: needed.find((l) => l.kind === "checklist")?.key ?? null, adapterId: adapter?.id ?? null }, { actor: "advocate" });
    const failures: string[] = [];
    for (const l of needed) {
      const built = this.readList(adapter!.id, l.key);
      if (built && built.freshness?.state !== "stale" && !built.upgrade) continue;
      try {
        await this.buildList(adapter!.id, l.key);
      } catch (e) {
        failures.push(`${l.title}: ${(e as Error).message}`);
      }
    }
    const out = await this.checklist(matterId);
    return failures.length ? { ...out, reason: `${out.reason ? `${out.reason} ` : ""}Not built: ${failures.join("; ")}. Upload the document yourself in Court Intelligence, or try again.` } : out;
  }

  /** The matter's checklist: every checklist of its court for its case type, with the advocate's states. */
  async checklist(matterId: string): Promise<MatterChecklist> {
    const store = await this.d.store(matterId);
    const target = store.filingTarget();
    if (!target) return { target: null, list: null, rows: [], reason: "Choose the court and the case type of the filing.", lists: [] };
    const adapter = this.adapterFor(target.court);
    if (!adapter) return { target, list: null, rows: [], reason: `No adapter covers ${directoryCourt(target.court)?.name ?? target.court} yet. Add one, or check the court's rules by hand.`, lists: [] };
    const lists = listsForCaseType(adapter, target.caseType)
      .filter((l) => l.kind === "checklist")
      .map((l) => this.readList(adapter.id, l.key))
      .filter((l): l is PackList => !!l);
    if (!lists.length) return { target, list: null, rows: [], reason: `The ${adapter.title} adapter has no checklist built for ${target.caseType}.`, lists: [] };
    const states = store.checklistStates(lists.map((l) => l.id));
    const rows = lists.flatMap((l) =>
      l.items.map((item) => {
        const s = states.get(`${l.id}:${item.id}`);
        return { listId: l.id, listTitle: l.title, item, state: s?.state ?? ("open" as const), note: s?.note ?? "", decidedAt: s?.decidedAt ?? null };
      }),
    );
    return { target, list: lists[0], rows, reason: null, lists };
  }

  async setCheck(matterId: string, listId: string, itemId: string, state: "open" | "done" | "not_applicable", note: string): Promise<void> {
    const list = this.d.intel.list(listId);
    if (!list || !list.items.some((i) => i.id === itemId)) throw new Error("NOT_FOUND: no such checklist item");
    (await this.d.store(matterId)).setChecklistItem(listId, itemId, state, note, { actor: "advocate" });
  }

  /** B12: each checklist item as a compliance row of the filing set. An open item does not block; a stale source makes it unconfirmed. */
  async compliance(matterId: string): Promise<ComplianceResult[]> {
    const c = await this.checklist(matterId);
    const out: ComplianceResult[] = [];
    for (const list of c.lists) {
      const stale = list.freshness?.state === "stale" ? ` Unconfirmed: the source is stale since ${list.freshness.since}.` : "";
      for (const row of c.rows.filter((r) => r.listId === list.id)) {
        const it = row.item;
        out.push({
          rule: `C-${list.key}-${it.n}`,
          title: it.text,
          source: `${it.ref ?? "no reference"}; ${list.title} v${list.version} (${list.adapterId} ${list.adapterVersion})${it.status === "verified" ? `, p. ${it.page}, l. ${it.line}` : it.status === "advocate_entered" ? `, advocate-entered from ${it.enteredSource}` : ", quote not found: advocate to verify"}`,
          outcome: row.state === "open" ? "not_checked" : "pass",
          detail: (row.state === "done" ? "Ticked by the advocate." : row.state === "not_applicable" ? `Not applicable: ${row.note}` : "Not ticked yet.") + stale,
        });
      }
    }
    if (c.target && !c.lists.length) out.push({ rule: "C-0", title: "The court's filing checklist", source: c.target.court, outcome: "not_checked", detail: c.reason ?? "No checklist." });
    return out;
  }

  /** B13: the court's format checks on each PDF of the newest filing set. */
  async formatChecks(matterId: string): Promise<{ results: FormatCheckResult[]; reason: string | null }> {
    const target = (await this.d.store(matterId)).filingTarget();
    if (!target) return { results: [], reason: "Choose the court and the case type of the filing." };
    const adapter = this.adapterFor(target.court);
    if (!adapter) return { results: [], reason: "No adapter covers this court, so no format check is known." };
    if (!adapter.formatChecks.length) return { results: [], reason: `The ${adapter.title} adapter states no format check yet.` };
    const files = (await this.d.filingFiles(matterId)).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) return { results: [], reason: "No filing set yet: the checks run on its PDFs." };
    const results: FormatCheckResult[] = [];
    for (const f of files) {
      const bytes = new Uint8Array(await readFile(f.path));
      const pages = await extractText(bytes);
      const facts: PdfFacts = {
        name: f.name,
        bytes: bytes.length,
        pages: pages.length,
        pagesWithText: pages.filter((p) => p.kind !== "none").length,
        pdfA: isPdfA(bytes),
        bookmarks: await pdfHasOutline(bytes),
        pageSizes: pages.map((p) => ({ w: p.width, h: p.height })),
      };
      for (const check of adapter.formatChecks) results.push(runFormatCheck(check, facts));
    }
    return { results, reason: null };
  }

  /** B14: the registry's defect list, pasted by the advocate, matched to the court's defect classes. */
  async importDefects(matterId: string, text: string): Promise<DefectRow[]> {
    const store = await this.d.store(matterId);
    const target = store.filingTarget();
    const rows = matchDefects(target ? this.adapterFor(target.court) : null, text);
    if (!rows.length) throw new Error("EMPTY: paste the defect list, one defect per line");
    return store.addDefects(rows, { actor: "advocate" });
  }

  /** I1: the court's rules for the matter's filing, as context items (kind "rules"), with their freshness. */
  async rulesContext(matterId: string): Promise<Array<{ id: string; label: string; text: string; anchors: string[]; stale: boolean; verified: boolean }>> {
    const target = (await this.d.store(matterId)).filingTarget();
    const adapter = target ? this.adapterFor(target.court) : null;
    if (!target || !adapter) return [];
    const out: Array<{ id: string; label: string; text: string; anchors: string[]; stale: boolean; verified: boolean }> = [];
    for (const def of listsForCaseType(adapter, target.caseType)) {
      const list = this.readList(adapter.id, def.key);
      if (!list) continue;
      for (const it of list.items) {
        out.push({
          id: it.id,
          label: `${list.title}, item ${it.n}`,
          text: `${it.text}${it.ref ? ` (${it.ref})` : ""}${it.value ? ` [value ${it.value}]` : ""}`,
          anchors: [it.id],
          stale: list.freshness?.state === "stale",
          verified: it.status === "verified" || it.status === "advocate_entered",
        });
      }
    }
    return out;
  }

  // ---- D5: the wrong-jurisdiction guard ----

  /** Why a skill naming these courts may not run in this matter, or null. */
  async forumRefusal(matterId: string, skillCourts: readonly string[]): Promise<string | null> {
    if (!skillCourts.length) return null;
    const target = (await this.d.store(matterId)).filingTarget();
    if (!target) return `This skill is for ${skillCourts.join(", ")}, and the matter has no court yet. Set the court and case type in Ready to File first.`;
    if (!skillCourts.includes(target.court)) return `This skill is for ${skillCourts.join(", ")}; the matter's court is ${target.court}.`;
    if (!this.adapterFor(target.court)) return `No adapter covers ${target.court}, so its rules are not known to the application.`;
    return null;
  }
}
