/**
 * Research and legal review (build-plan steps 6 and 7; workflow 5E, 5F, 7, 9B, 9C).
 *
 * Issues, authorities and memoranda are records of the matter. The agent writes candidates
 * and memoranda; the advocate decides (decision 5). Citations are checked by the external
 * validator `ulos` through `lib/ulos`; this module stores what the validator says and never
 * decides an outcome itself. Specs: docs/archive/2026-11-15/specs/v0-research.md, docs/archive/2026-11-15/specs/v0-citations.md.
 */
import type { Matters } from "./matters.ts";
import { findCitations, ulosAvailable, verifyCitation, type UlosPaths } from "../lib/ulos/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { WriteContext } from "../shared/records.ts";
import type { AdverseReview, AuthorityRecord, CitationCheck, ResearchState } from "../shared/work.ts";

const advocate: WriteContext = { actor: "advocate" };

/** One row of the shared verification record for public law (P3). */
export interface SharedCitationCheck {
  citation: string;
  outcome: string;
  /** The source the check ran against, as the validator names it. */
  against: string;
  at: string;
  /** Who ran it: the application's validator run for one matter. */
  by: string;
}

export class Research {
  private matters: Matters;
  private ulos: UlosPaths;
  /** Phase 6 (P3): the shared verification record of public law, in corpus.db. Optional in tests. */
  sharedCheck?: (input: { citation: string; outcome: string; against: string; by: string; detail: string | null }) => void;
  /** Phase 6 (P3): the shared record's rows for one citation. */
  sharedChecksOf?: (citation: string) => SharedCitationCheck[];
  /** Phase 6 (P3): the highest indexed paragraph of a saved authority's judgment, or null. */
  authorityParagraph?: (citation: string) => number | null;

  constructor(matters: Matters, ulos: UlosPaths) {
    this.matters = matters;
    this.ulos = ulos;
  }

  private async work(matterId: string) {
    return (await this.matters.store(matterId)).work;
  }

  async state(matterId: string): Promise<ResearchState> {
    const w = await this.work(matterId);
    const citations = this.latestChecks(w.listCitationChecks());
    const shared = this.sharedChecksOf ? citations.map((c) => ({ citation: c.citation, rows: (this.sharedChecksOf?.(c.citation) ?? []) })) : [];
    return {
      issues: w.listIssues(),
      authorities: w.listAuthorities(),
      memoranda: w.listMemoranda(),
      citations,
      attestations: w.listAttestations(),
      adverseReview: w.adverseReview(),
      validator: ulosAvailable(this.ulos),
      // Phase 6 (P3): the coverage of the checks, and the shared verification record.
      coverage: await this.citationCoverage(matterId),
      sharedChecks: shared.filter((s) => s.rows.length > 0),
    };
  }

  /** The newest check of each citation (per draft). Older checks stay in the store. */
  private latestChecks(all: CitationCheck[]): CitationCheck[] {
    const byKey = new Map<string, CitationCheck>();
    for (const c of all) byKey.set(`${c.draftId ?? "-"}|${c.citation}`, c);
    return [...byKey.values()];
  }

  async addIssue(matterId: string, text: string, ctx: WriteContext = advocate) {
    return (await this.work(matterId)).addIssue(text, ctx);
  }

  async decideIssue(matterId: string, id: string, decision: "accepted" | "rejected", reason: string) {
    return (await this.work(matterId)).decideIssue(id, decision, reason, advocate);
  }

  async addAuthority(matterId: string, input: Omit<AuthorityRecord, "id" | "author" | "status" | "createdAt">, ctx: WriteContext = advocate) {
    return (await this.work(matterId)).addAuthority(input, ctx);
  }

  async decideAuthority(matterId: string, id: string, decision: "adopted" | "rejected") {
    return (await this.work(matterId)).decideAuthority(id, decision, advocate);
  }

  /**
   * Phase 6 (P3): the coverage of the citation checks, as one line with its numbers. `of` counts
   * every citation the drafts and the authorities state; `checked` counts those whose newest
   * check verified. A reporter-only citation is counted and named, never skipped silently.
   */
  async citationCoverage(matterId: string): Promise<{ checked: number; of: number; note: string }> {
    const w = await this.work(matterId);
    const checks = this.latestChecks(w.listCitationChecks());
    const verified = new Set(checks.filter((c) => c.outcome === "verified").map((c) => c.citation));
    const found = new Set<string>();
    let reporterOnly = 0;
    const drafts = (await this.matters.listDrafts(matterId)).filter((d) => d.head);
    for (const d of drafts) {
      const text = readParagraphs(await this.matters.revisionBytes(matterId, d.head!.id)).map((p) => p.text).join("\n");
      for (const c of findCitations(text)) found.add(c);
    }
    for (const a of w.listAuthorities().filter((x) => x.status !== "rejected")) {
      const c = findCitations(a.citation)[0];
      if (c) found.add(c);
    }
    let checked = 0;
    for (const c of found) if (verified.has(c)) checked += 1;
    const note =
      found.size === 0
        ? "No citation is stated in the drafts or the authorities."
        : `Checked ${checked} of ${found.size} citation(s) with the validator. The validator checks Supreme Court neutral citations; a citation in reporter form with no neutral citation is counted and reported as unchecked.${reporterOnly ? ` ${reporterOnly} paragraph(s) hold reporter-only citations.` : ""}`;
    return { checked, of: found.size, note };
  }

  /**
   * Check every Supreme Court neutral citation in the latest revision of one draft (or of all
   * drafts), and every authority not rejected, with the validator. Each failed or unresolved
   * citation opens a review item of its draft. Nothing is checked when the validator is absent.
   * Phase 6 (P3): each run also writes the shared verification record of public law.
   */
  async checkCitations(matterId: string, draftId?: string): Promise<CitationCheck[]> {
    const avail = ulosAvailable(this.ulos);
    if (!avail.available) throw new MatterStoreError("VALIDATOR_UNAVAILABLE", avail.detail);
    const store = await this.matters.store(matterId);
    const w = store.work;
    const authorities = w.listAuthorities().filter((a) => a.status !== "rejected");
    const out: CitationCheck[] = [];
    const run = async (citation: string, scope: { draftId: string | null; revisionId: string | null }) => {
      const known = authorities.find((a) => findCitations(a.citation)[0] === citation);
      const opts = { parties: known?.parties || undefined, date: known?.decisionDate || undefined };
      let rec;
      try {
        rec = await verifyCitation(this.ulos, citation, opts);
      } catch (e) {
        rec = { outcome: "unresolved" as const, reason: "validator_error", reasonDetail: (e as Error).message, raw: JSON.stringify({ error: (e as Error).message }) };
      }
      const check = w.addCitationCheck(
        { citation, draftId: scope.draftId, revisionId: scope.revisionId, parties: opts.parties ?? null, decisionDate: opts.date ?? null, outcome: rec.outcome, reason: rec.reason, record: rec.raw },
        { actor: "system" },
      );
      out.push(check);
      // Phase 6 (P3): the shared verification record of public law, so the advocate can see who
      // verified what, when, against which source. A record, never a substitute for the online
      // check (ruling R-4).
      this.sharedCheck?.({ citation, outcome: rec.outcome, against: `ulos ${this.ulos.db}`, by: `the validator run for matter ${matterId}`, detail: rec.reason ?? null });
      return { check, detail: rec.reasonDetail };
    };
    const drafts = (await this.matters.listDrafts(matterId)).filter((d) => d.head && (!draftId || d.id === draftId));
    for (const d of drafts) {
      const text = readParagraphs(await this.matters.revisionBytes(matterId, d.head!.id)).map((p) => p.text).join("\n");
      const defects: Array<{ kind: string; detail: string }> = [];
      for (const c of findCitations(text)) {
        const { check, detail } = await run(c, { draftId: d.id, revisionId: d.head!.id });
        if (check.outcome === "failed" || check.outcome === "unresolved") {
          defects.push({ kind: `citation.${check.outcome}`, detail: `${d.title}: ${c} is ${check.outcome} (${check.reason ?? "no reason"}${detail ? `: ${detail}` : ""}). Action: correct the citation, or attest it with a reason.` });
        }
      }
      if (defects.length) store.openDraftDefects(d.id, d.head!.id, defects);
    }
    if (!draftId) {
      for (const a of authorities) {
        const c = findCitations(a.citation)[0];
        if (c && !out.some((x) => x.citation === c)) await run(c, { draftId: null, revisionId: null });
      }
    }
    return out;
  }

  async attestCitation(matterId: string, citation: string, reason: string) {
    return (await this.work(matterId)).attestCitation(citation, reason, advocate);
  }

  async recordAdverseReview(matterId: string, outcome: AdverseReview["outcome"], coverage: string, note: string) {
    return (await this.work(matterId)).recordAdverseReview(outcome, coverage, note, advocate);
  }

  /**
   * Workflow 9B, 9C: what holds one draft in "Blocked pending legal review". A citation of the
   * draft's revision that failed or is unresolved blocks until it is attested. A citation in the
   * draft that was never checked blocks. Grounds also need the adverse-authority review.
   */
  async legalBlockers(matterId: string, draftId: string, revisionId: string): Promise<string[]> {
    const w = await this.work(matterId);
    const draft = (await this.matters.listDrafts(matterId)).find((d) => d.id === draftId);
    if (!draft) return [];
    const text = readParagraphs(await this.matters.revisionBytes(matterId, revisionId)).map((p) => p.text).join("\n");
    const checks = this.latestChecks(w.listCitationChecks().filter((c) => c.draftId === draftId));
    const out: string[] = [];
    for (const c of findCitations(text)) {
      const check = checks.find((x) => x.citation === c);
      if (!check) out.push(`${c}: not checked by the validator`);
      else if ((check.outcome === "failed" || check.outcome === "unresolved") && !check.attested) out.push(`${c}: ${check.outcome} (${check.reason ?? "no reason"}), not attested`);
    }
    // V5-10: an overruled authority blocks the grounds (and the petition that repeats them) until addressed;
    // a cited authority whose voice the advocate has not confirmed holds them in legal review.
    // Phase 6 (P3): the passage relied on must exist in the indexed judgment, and the support
    // assessment — that the paragraph supports the whole proposition — must be confirmed.
    if (draft.kind === "grounds" || draft.kind === "petition") {
      const store = await this.matters.store(matterId);
      for (const r of store.listReviewItems().filter((x) => x.kind === "authority_overruled" && x.status === "open")) out.push(r.detail);
      const assessments = new Map(store.studio.assessments().map((a) => [a.authorityId, a]));
      for (const a of w.listAuthorities().filter((x) => x.status !== "rejected" && text.includes(x.citation))) {
        const v = assessments.get(a.id);
        if (!v || v.voice === null || v.voiceStatus !== "confirmed") out.push(`${a.citation}: the voice of the passage relied on (holding, obiter, and so on) is not confirmed`);
        if (!v || v.support === null || v.supportStatus !== "confirmed") out.push(`${a.citation}: whether the passage supports the whole proposition is not confirmed (the support assessment is open)`);
        if (a.paragraph.trim() && this.authorityParagraph) {
          const max = this.authorityParagraph(a.citation);
          const para = Number(/^(\d+)/.exec(a.paragraph.trim())?.[1] ?? NaN);
          if (max != null && Number.isFinite(para) && para > max) out.push(`${a.citation}: paragraph ${para} is relied on, and the indexed judgment reaches only paragraph ${max}`);
        }
      }
    }
    if (draft.kind === "grounds") {
      const review = w.adverseReview();
      if (!review) out.push("Adverse-authority review: not recorded");
      else if (review.outcome === "incomplete") out.push("Adverse-authority review: incomplete");
    }
    return out;
  }
}
