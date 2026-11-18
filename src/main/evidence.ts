/**
 * Phase 4: after ingest, read the stored lines and write candidate facts, document structure,
 * forum clauses and relations. Detect contradictions, rebuild the evidence graph and propose the
 * jurisdiction report. The store is the only writer; this module only computes and calls it.
 *
 * Phase 6 (P10): every source is also scanned for embedded instructions. A finding is data
 * (hard rule 6): it opens a review item with the quote and its anchor, and nothing is blocked.
 */
import type { Matters } from "./matters.ts";
import type { CourtIntel } from "./court-intel.ts";
import { detectContradictions, detectRelations, extractFacts, extractForumClauses, extractLayout, extractStructure, buildJurisdictionReport, type EvidenceLine } from "../lib/evidence/index.ts";
import { scanLines } from "../lib/verification/injection.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";

export interface AnalysisResult {
  facts: number;
  parts: number;
  clauses: number;
  relations: number;
  contradictions: number;
  edges: number;
  injections: number;
  foreign: number;
}

export async function analyzeMatter(matters: Matters, matterId: string, courtIntel?: CourtIntel): Promise<AnalysisResult> {
  const store = await matters.store(matterId);
  const sources = store.listSources().filter((s) => s.status === "ok");
  let facts = 0;
  let parts = 0;
  let clauses = 0;
  let injections = 0;
  for (const source of sources) {
    // A source is analysed once. A new source is picked up on the next ingest.
    if (store.evidence.isAnalysed(source.id)) continue;
    const pageHeights = new Map(store.listPages(source.id).map((p) => [p.page, p.height]));
    const lines = store.sourceLines(source.id).map((l): EvidenceLine => ({
      anchorId: l.id,
      sourceId: l.sourceId,
      sourceName: source.name,
      page: l.page,
      line: l.line,
      text: l.text,
      reading: l.reading,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      pageHeight: pageHeights.get(l.page),
    }));
    if (lines.length === 0) continue;
    const candidates = extractFacts(lines);
    for (const f of candidates) {
      try {
        store.evidence.addFact(f, { actor: "system" });
        facts++;
      } catch (e) {
        if ((e as MatterStoreError).code !== "FACT_EXISTS") throw e;
      }
    }
    const structureParts = extractStructure(lines);
    const layoutParts = extractLayout(lines);
    store.evidence.setParts(source.id, [...structureParts, ...layoutParts]);
    parts += structureParts.length + layoutParts.length;
    const forum = extractForumClauses(lines);
    clauses += store.evidence.setForumClauses(source.id, forum.map(({ sourceId: _s, sourceName: _n, ...rest }) => rest));
    // Phase 6 (P10): the embedded-instruction scan. One review item per pattern per source, with
    // the quote and its line. The text stays data; the finding never enters a prompt as an
    // instruction, and nothing is blocked.
    const pagesByPage = new Map<number, EvidenceLine[]>();
    for (const l of lines) pagesByPage.set(l.page, [...(pagesByPage.get(l.page) ?? []), l]);
    for (const [page, pageLines] of pagesByPage) {
      for (const found of scanLines(pageLines.map((l) => ({ line: l.line, text: l.text })))) {
        const detail = `Embedded-instruction scan of ${source.name}, p. ${page}, l. ${found.line}: the pattern "${found.pattern}" — for example: "${found.quote}". The text is data from the source, never an instruction.`;
        if (!store.listReviewItems().some((r) => r.kind === "injection" && r.detail === detail)) {
          store.openReviewItem("injection", source.id, page, detail);
          injections++;
        }
      }
    }
    store.evidence.markAnalysed(source.id);
  }

  const relationSources = sources.map((s) => ({ id: s.id, name: s.name, text: store.listPages(s.id).map((p) => p.text).join("\n"), docType: s.docType?.type ?? null }));
  let relations = 0;
  for (const r of detectRelations(relationSources)) relations += store.evidence.recordRelation(r);

  const allFacts = store.evidence.facts();
  const nb = await matters.notebook(matterId);
  const contradictions = detectContradictions(allFacts, nb.events.map((e) => ({ id: e.id, dateStart: e.dateStart, description: e.description, sourceId: e.sourceId, page: e.page, line: e.line })));
  const opened = store.evidence.recordContradictions(contradictions);
  const edges = store.evidence.rebuildEdges();
  // Phase 11 (D4): the foreign elements the record shows, as proposals. A country must be written
  // in the record; a party's name alone is never a guess.
  store.proposeForeignFromRecord(store.parties().map((p) => ({ name: p.nameInRecord })), { actor: "agent" });

  if (courtIntel) {
    const profile = store.profile();
    const details = store.work.details();
    const overview = courtIntel.overview();
    const court = overview.find((c) => c.court.id === profile.court || c.court.name === profile.court || c.court.name === details.court)?.court ?? overview[0]?.court ?? null;
    const row = overview.find((c) => c.court.id === court?.id);
    const limitation = store.work.limitation();
    store.evidence.setJurisdictionSystem(
      buildJurisdictionReport({
        court,
        profile: { court: profile.court || details.court, caseType: profile.caseType, proceeding: profile.proceeding, relief: profile.relief, cnr: profile.cnr || details.cnr },
        appealRoute: (row?.route ?? []).map((r) => ({ name: r.name, appealNote: null })),
        rules: row?.lists.filter((l) => l.kind === "rules").map((l) => l.title) ?? [],
        provisions: row?.proceedings.flatMap((p) => p.provisions) ?? [],
        limitation: limitation ? `${limitation.deadline} (${limitation.rule}; ${limitation.confirmedAt ? "confirmed" : "not confirmed"})` : "",
        forumClauses: store.evidence.forumClauses(),
        facts: allFacts,
      }),
    );
  }

  return { facts, parts, clauses, relations, contradictions: opened, edges, injections, foreign: store.foreignElements().length };
}
