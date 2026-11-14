/**
 * Research and legal review (build-plan steps 6 and 7; workflow 5E, 5F, 7, 9B, 9C).
 *
 * Issues, authorities and memoranda are records of the matter. The agent writes candidates
 * and memoranda; the advocate decides (decision 5). Citations are checked by the external
 * validator `ulos` through `lib/ulos`; this module stores what the validator says and never
 * decides an outcome itself. Specs: docs/specs/v0-research.md, docs/specs/v0-citations.md.
 */
import type { Matters } from "./matters.ts";
import { findCitations, ulosAvailable, verifyCitation, type UlosPaths } from "../lib/ulos/index.ts";
import { parseReferences } from "../lib/research/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { WriteContext } from "../shared/records.ts";
import type { AdverseReview, AuthorityRecord, CitationCheck, MemorandumRecord, ResearchState } from "../shared/work.ts";

const advocate: WriteContext = { actor: "advocate" };

export class Research {
  private matters: Matters;
  private ulos: UlosPaths;

  constructor(matters: Matters, ulos: UlosPaths) {
    this.matters = matters;
    this.ulos = ulos;
  }

  private async work(matterId: string) {
    return (await this.matters.store(matterId)).work;
  }

  async state(matterId: string): Promise<ResearchState> {
    const w = await this.work(matterId);
    return {
      issues: w.listIssues(),
      authorities: w.listAuthorities(),
      memoranda: w.listMemoranda(),
      citations: this.latestChecks(w.listCitationChecks()),
      attestations: w.listAttestations(),
      adverseReview: w.adverseReview(),
      validator: ulosAvailable(this.ulos),
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
   * A memorandum (workflow 7D). Every reference in its body is resolved against the matter:
   * Notebook events, issues, authorities, and source lines. A reference that does not resolve
   * is stored as unresolved and shown as such; a memorandum with none that resolve is refused.
   */
  async writeMemorandum(matterId: string, input: { title: string; issueId: string | null; body: string }, ctx: WriteContext): Promise<MemorandumRecord> {
    const store = await this.matters.store(matterId);
    const w = store.work;
    const notebook = await this.matters.notebook(matterId);
    const sources = await this.matters.listSources(matterId);
    const refs: string[] = [];
    const unresolved: string[] = [];
    for (const r of parseReferences(input.body)) {
      let ok = false;
      if (r.kind === "event") ok = notebook.events.some((e) => e.id === r.id);
      else if (r.kind === "issue") ok = w.listIssues().some((i) => i.id === r.id);
      else if (r.kind === "authority") ok = w.listAuthorities().some((a) => a.id === r.id);
      else if (r.kind === "source") {
        const source = sources.find((s) => s.name.toLowerCase() === r.name.toLowerCase());
        if (source) {
          const pages = await this.matters.listPages(matterId, source.id, r.page, r.page);
          ok = pages.some((p) => p.lines.some((l) => l.line === r.line));
        }
      }
      (ok ? refs : unresolved).push(r.raw);
    }
    if (refs.length === 0) {
      throw new MatterStoreError("MEMO_UNGROUNDED", "a memorandum needs at least one reference that the matter resolves: [event:<id>], [issue:<id>], [authority:<id>] or [source name, p. N, l. M]");
    }
    if (input.issueId && !w.listIssues().some((i) => i.id === input.issueId)) throw new MatterStoreError("ISSUE_NOT_FOUND", input.issueId);
    return w.addMemorandum({ ...input, refs, unresolved }, ctx);
  }

  /**
   * Check every Supreme Court neutral citation in the latest revision of one draft (or of all
   * drafts), and every authority not rejected, with the validator. Each failed or unresolved
   * citation opens a review item of its draft. Nothing is checked when the validator is absent.
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
    if (draft.kind === "grounds" || draft.kind === "petition") {
      const store = await this.matters.store(matterId);
      for (const r of store.listReviewItems().filter((x) => x.kind === "authority_overruled" && x.status === "open")) out.push(r.detail);
      const voices = new Map(store.studio.assessments().map((a) => [a.authorityId, a]));
      for (const a of w.listAuthorities().filter((x) => x.status !== "rejected" && text.includes(x.citation))) {
        const v = voices.get(a.id);
        if (!v || v.voice === null || v.voiceStatus !== "confirmed") out.push(`${a.citation}: the voice of the passage relied on (holding, obiter, and so on) is not confirmed`);
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
