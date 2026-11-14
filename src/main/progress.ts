/**
 * V3-1 and V3-2: the matter's progress and its review inbox, assembled from the records of
 * the matter store. Reads only. Spec: docs/specs/v3.md.
 */
import { matterProgress, type Stage } from "../lib/progress/index.ts";
import type { Filing } from "./filing.ts";
import { required } from "./filing.ts";
import type { Matters } from "./matters.ts";
import type { Research } from "./research.ts";
import type { Drafts } from "./drafts.ts";
import type { InboxItem } from "../shared/work.ts";

export class Progress {
  private matters: Matters;
  private filing: Filing;
  private research: Research;
  private drafts: Drafts;

  constructor(matters: Matters, filing: Filing, research: Research, drafts: Drafts) {
    this.matters = matters;
    this.filing = filing;
    this.research = research;
    this.drafts = drafts;
  }

  private blockedCitations(r: Awaited<ReturnType<Research["state"]>>): string[] {
    const attested = new Set(r.attestations.map((a) => a.citation));
    const latest = new Map<string, string>();
    for (const c of r.citations) latest.set(c.citation, c.outcome);
    return [...latest].filter(([c, o]) => (o === "failed" || o === "unresolved") && !attested.has(c)).map(([c]) => c);
  }

  async progress(matterId: string): Promise<Stage[]> {
    const store = await this.matters.store(matterId);
    const sources = store.listSources();
    const jobs = store.listJobs();
    const nb = await this.matters.notebook(matterId);
    const filing = await this.filing.state(matterId);
    const research = await this.research.state(matterId);
    const drafts = await this.matters.listDrafts(matterId);
    const d = filing.details;
    return matterProgress({
      sources: {
        total: sources.length,
        failed: jobs.filter((j) => j.state === "failed").length,
        missingOrChanged: sources.filter((s) => s.status !== "ok").length,
        reading: sources.length - jobs.filter((j) => j.state === "done" || j.state === "failed").length,
      },
      events: {
        candidate: nb.events.filter((e) => e.status === "candidate").length,
        confirmed: nb.events.filter((e) => e.status === "confirmed").length,
        openConflicts: nb.conflicts.filter((c) => c.status === "open").length,
      },
      details: { petitioner: !!d.petitioner, respondent: !!d.respondent, court: !!d.court, caseNumber: !!d.caseNumber, impugned: !!d.impugnedEventId },
      research: {
        issuesAccepted: research.issues.filter((i) => i.status === "accepted").length,
        issuesCandidate: research.issues.filter((i) => i.status === "candidate").length,
        adverseReview: research.adverseReview !== null,
        blockedCitations: this.blockedCitations(research).length,
      },
      drafts: required(filing.limitation).map((r) => {
        const x = drafts.find((dr) => dr.kind === r.kind);
        return { title: r.title, approved: !!x?.approved, exists: !!x };
      }),
      blockers: filing.blockers,
      filingSet: { exists: !!filing.filingSet, confirmations: filing.filingSet?.confirmations.length ?? 0 },
      receipt: store.work.listCaptures().some((c) => c.method === "filing_receipt"),
    });
  }

  /**
   * V3-2: everything that waits for the advocate, in one list. "Blocks the work" first: items
   * that refuse a draft, an approval or the filing set until decided.
   */
  async inbox(matterId: string): Promise<InboxItem[]> {
    const store = await this.matters.store(matterId);
    const nb = await this.matters.notebook(matterId);
    const items: InboxItem[] = [];
    const byId = new Map(nb.events.map((e) => [e.id, e]));
    for (const c of nb.conflicts.filter((x) => x.status === "open")) {
      const a = byId.get(c.eventA);
      const b = byId.get(c.eventB);
      items.push({ id: `conflict:${c.id}`, kind: "date_conflict", blocks: true, title: "Date conflict", detail: `${a?.dateText ?? "?"} or ${b?.dateText ?? "?"}: ${a?.description ?? ""}`, tab: "chronology" });
    }
    for (const r of store.listReviewItems().filter((x) => x.status === "open")) {
      const blocks = r.draftId !== null || r.kind === "file_unreadable" || r.kind === "possible_duplicate" || r.kind === "ocr_dispute";
      items.push({
        id: `review:${r.id}`,
        kind: r.kind,
        blocks,
        title: r.kind === "possible_duplicate" ? "Possible duplicate" : r.kind === "ocr_dispute" ? "OCR engines disagree" : r.kind === "date_anchor" ? "Base date needed" : r.draftId ? "Draft defect" : r.kind.replace(/_/g, " "),
        detail: r.detail,
        tab: "matter",
        reviewItemId: r.id,
        sourceId: r.sourceId ?? undefined,
      });
    }
    for (const change of await this.drafts.agentChanges(matterId)) {
      items.push({ id: `changes:${change.revisionId}`, kind: "agent_changes", blocks: true, title: "Agent changes not decided", detail: `${change.changes.length} change(s) in ${change.title}`, tab: "matter" });
    }
    const research = await this.research.state(matterId);
    for (const c of this.blockedCitations(research)) items.push({ id: `citation:${c}`, kind: "citation_blocked", blocks: true, title: "Citation blocked", detail: `${c}: correct it or attest it`, tab: "research" });
    const candidates = nb.events.filter((e) => e.status === "candidate");
    if (candidates.length) items.push({ id: "events", kind: "candidate_events", blocks: false, title: "Candidate events", detail: `${candidates.length} event(s) to confirm, reject or exclude`, tab: "chronology" });
    for (const s of store.listSources().filter((x) => x.docType?.status === "candidate")) {
      items.push({ id: `type:${s.id}`, kind: "doc_type", blocks: false, title: "Document type", detail: `${s.name}: proposed ${s.docType!.type}`, tab: "sources", sourceId: s.id });
    }
    for (const i of research.issues.filter((x) => x.status === "candidate")) items.push({ id: `issue:${i.id}`, kind: "issue", blocks: false, title: "Proposed issue", detail: i.text, tab: "research" });
    for (const a of research.authorities.filter((x) => x.status === "candidate")) items.push({ id: `authority:${a.id}`, kind: "authority", blocks: false, title: "Proposed authority", detail: a.citation, tab: "research" });
    const cells = store.work.recordTable().cells.filter((c) => c.status === "candidate");
    if (cells.length) items.push({ id: "cells", kind: "record_cells", blocks: false, title: "Record table", detail: `${cells.length} answer(s) to confirm or clear`, tab: "records" });
    for (const m of store.work.listMemoryProposals().filter((x) => x.status === "open")) items.push({ id: `memory:${m.id}`, kind: "memory_proposal", blocks: false, title: "Memory proposal", detail: m.text, tab: "matter" });
    return [...items.filter((x) => x.blocks), ...items.filter((x) => !x.blocks)];
  }
}
