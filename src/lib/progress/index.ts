/**
 * V3-1: the progress of a matter through the workflow. A plain function of records the
 * application already holds: it decides nothing and changes nothing. Spec: docs/specs/v3.md.
 */

export type StageState = "not_started" | "in_progress" | "done" | "blocked";

export interface Stage {
  id: "record" | "notebook" | "details" | "research" | "drafts" | "verification" | "filing_set" | "filing";
  title: string;
  state: StageState;
  /** What is true now, in one sentence. */
  status: string;
  /** The next action, in one sentence. Empty when the stage is done. */
  next: string;
  /** The tab where the advocate acts. */
  tab: string;
}

export interface ProgressInput {
  sources: { total: number; failed: number; missingOrChanged: number; reading: number };
  events: { candidate: number; confirmed: number; openConflicts: number };
  details: { petitioner: boolean; respondent: boolean; court: boolean; caseNumber: boolean; impugned: boolean };
  research: { issuesAccepted: number; issuesCandidate: number; adverseReview: boolean; blockedCitations: number };
  /** Required drafts by title, with whether each has an approved revision. */
  drafts: Array<{ title: string; approved: boolean; exists: boolean }>;
  /** Filing compliance blockers (rule and detail). */
  blockers: string[];
  filingSet: { exists: boolean; confirmations: number };
  receipt: boolean;
}

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function matterProgress(i: ProgressInput): Stage[] {
  const stages: Stage[] = [];
  // 1. The record (workflow 3, 4).
  {
    const s = i.sources;
    const bad = s.failed + s.missingOrChanged;
    stages.push({
      id: "record",
      title: "Case record",
      tab: "sources",
      state: s.total === 0 ? "not_started" : bad > 0 ? "blocked" : s.reading > 0 ? "in_progress" : "done",
      status: s.total === 0 ? "No source yet." : `${s.total} source(s)${s.reading ? `, ${s.reading} being read` : ""}${bad ? `, ${bad} unreadable, missing or changed` : ""}.`,
      next: s.total === 0 ? "Add the impugned judgment and the record of the lower courts." : bad > 0 ? "Open the Sources tab and deal with the files that could not be read or have changed." : "",
    });
  }
  // 2. The Notebook (workflow 5, 6).
  {
    const e = i.events;
    const total = e.candidate + e.confirmed;
    stages.push({
      id: "notebook",
      title: "Notebook: procedural history and facts",
      tab: "chronology",
      state: total === 0 ? "not_started" : e.openConflicts > 0 ? "blocked" : e.confirmed > 0 && e.candidate === 0 ? "done" : "in_progress",
      status: total === 0 ? "No dated event yet." : `${e.confirmed} confirmed, ${e.candidate} to review${e.openConflicts ? `, ${e.openConflicts} date conflict(s)` : ""}.`,
      next:
        total === 0
          ? "Events appear when the sources are read."
          : e.openConflicts > 0
            ? `Resolve ${e.openConflicts} date conflict(s) in the Chronology.`
            : e.candidate > 0
              ? `Confirm, reject or exclude ${e.candidate} candidate event(s).`
              : "",
    });
  }
  // 3. Matter identity (workflow 2).
  {
    const d = i.details;
    const absent = [
      d.petitioner ? "" : "petitioner",
      d.respondent ? "" : "respondent",
      d.court ? "" : "court",
      d.caseNumber ? "" : "case number",
      d.impugned ? "" : "impugned judgment",
    ].filter(Boolean);
    stages.push({
      id: "details",
      title: "Matter details",
      tab: "matter",
      state: absent.length === 0 ? "done" : absent.length === 5 ? "not_started" : "in_progress",
      status: absent.length === 0 ? "Parties, court, case number and impugned judgment recorded." : `Not recorded: ${list(absent)}.`,
      next: absent.length === 0 ? "" : `Record the ${list(absent)} under Matter details.`,
    });
  }
  // 4. Research and the case conference (workflow 7, 9B, 9C).
  {
    const r = i.research;
    const started = r.issuesAccepted + r.issuesCandidate > 0 || r.adverseReview;
    const done = r.issuesAccepted > 0 && r.adverseReview && r.blockedCitations === 0;
    stages.push({
      id: "research",
      title: "Research and case conference",
      tab: "research",
      state: !started ? "not_started" : r.blockedCitations > 0 ? "blocked" : done ? "done" : "in_progress",
      status: `${r.issuesAccepted} issue(s) accepted, ${r.issuesCandidate} proposed; adverse-authority review ${r.adverseReview ? "recorded" : "not recorded"}${r.blockedCitations ? `; ${r.blockedCitations} citation(s) blocked` : ""}.`,
      next: !started
        ? "Ask the agent to research the issues, or add an issue on the Research tab."
        : r.blockedCitations > 0
          ? `Correct or attest ${r.blockedCitations} blocked citation(s).`
          : r.issuesAccepted === 0
            ? "Decide the proposed issues at the case conference."
            : !r.adverseReview
              ? "Record the adverse-authority review."
              : "",
    });
  }
  // 5. Drafts (workflow 8, 10).
  {
    const missing = i.drafts.filter((d) => !d.approved).map((d) => d.title);
    const any = i.drafts.some((d) => d.exists);
    stages.push({
      id: "drafts",
      title: "Drafts",
      tab: "matter",
      state: !any ? "not_started" : missing.length === 0 ? "done" : "in_progress",
      status: `${i.drafts.length - missing.length} of ${i.drafts.length} required document(s) approved.`,
      next: missing.length ? `Prepare and approve: ${list(missing)}.` : "",
    });
  }
  // 6. Verification and filing compliance (workflow 9).
  {
    const allApproved = i.drafts.every((d) => d.approved);
    stages.push({
      id: "verification",
      title: "Verification and filing compliance",
      tab: "filing",
      state: i.blockers.length === 0 ? (allApproved ? "done" : "not_started") : allApproved ? "blocked" : i.drafts.some((d) => d.exists) ? "in_progress" : "not_started",
      status: i.blockers.length === 0 ? "No rule shows a defect." : `${i.blockers.length} rule(s) show a defect.`,
      next: i.blockers.length ? i.blockers[0] : "",
    });
  }
  // 7. The filing set (workflow 10, 11).
  {
    const f = i.filingSet;
    stages.push({
      id: "filing_set",
      title: "Filing set and confirmations",
      tab: "filing",
      state: !f.exists ? "not_started" : f.confirmations >= 2 ? "done" : "in_progress",
      status: !f.exists ? "No filing set." : `Filing set made; ${f.confirmations} of 2 confirmation(s).`,
      next: !f.exists ? (i.blockers.length ? "Clear the compliance defects first." : "Approve for filing to make the filing set.") : f.confirmations < 2 ? `Give confirmation ${f.confirmations + 1} of 2 on the Filing tab.` : "",
    });
  }
  // 8. Filing (workflow 11).
  stages.push({
    id: "filing",
    title: "Filing on the portal",
    tab: "filing",
    state: i.receipt ? "done" : i.filingSet.confirmations >= 2 ? "in_progress" : "not_started",
    status: i.receipt ? "The portal receipt is saved in the matter." : "No portal receipt yet.",
    next: i.receipt ? "" : i.filingSet.confirmations >= 2 ? "Ask the agent to file the confirmed set on the portal; you sign in and solve any CAPTCHA." : "",
  });
  return stages;
}
