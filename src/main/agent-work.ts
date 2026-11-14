/**
 * The agent's tools of steps 6 to 10, bound to the main-process modules. Each returns plain text
 * for the model. The agent writes candidates, memoranda and proposals only; every decision is a
 * bridge function (decision 5).
 */
import type { AgentWorkHost, ProposedCorrection } from "./agent.ts";
import type { Matters } from "./matters.ts";
import type { Research } from "./research.ts";
import type { Drafts } from "./drafts.ts";
import type { Portal } from "./portal.ts";
import { searchCitationIndex, type UlosPaths } from "../lib/ulos/index.ts";

export function agentWorkHost(deps: { matters: Matters; research: Research; drafts: Drafts; portal: Portal; ulos: UlosPaths }): AgentWorkHost {
  const { matters, research, drafts, portal } = deps;
  const agent = { actor: "agent" as const };
  return {
    async research(matterId) {
      const s = await research.state(matterId);
      const lines = [
        `Issues (${s.issues.length}):`,
        ...s.issues.map((i) => `- [issue:${i.id}] ${i.status}${i.reason ? ` (${i.reason})` : ""}: ${i.text}`),
        `Authorities (${s.authorities.length}):`,
        ...s.authorities.map((a) => `- [authority:${a.id}] ${a.status}, ${a.role}: ${a.citation}${a.parties ? `, ${a.parties}` : ""}${a.decisionDate ? `, ${a.decisionDate}` : ""}${a.paragraph ? `, para ${a.paragraph}` : ""}${a.proposition ? ` — ${a.proposition}` : ""}`),
        `Memoranda (${s.memoranda.length}):`,
        ...s.memoranda.map((m) => `- ${m.title} (${m.refs.length} references resolved, ${m.unresolved.length} unresolved)`),
        `Citation checks (validator: ${s.validator.available ? "available" : s.validator.detail}):`,
        ...s.citations.map((c) => `- ${c.citation}: ${c.outcome}${c.reason ? ` (${c.reason})` : ""}${c.attested ? ", attested by the advocate" : ""}`),
        `Adverse-authority review: ${s.adverseReview ? `${s.adverseReview.outcome}${s.adverseReview.coverage ? `, coverage: ${s.adverseReview.coverage}` : ""}` : "not recorded"}`,
      ];
      return lines.join("\n");
    },
    async searchCitationIndex(query) {
      const hits = await searchCitationIndex(deps.ulos, query, 20);
      if (hits.length === 0) return `No entry of the citation index matches "${query}". Finding aid only: not verification.`;
      return ["Finding aid only: not verification.", ...hits.map((h) => `- ${h.citation}: ${h.parties}, decided ${h.date}${h.caseNumber ? `, ${h.caseNumber}` : ""}`)].join("\n");
    },
    async proposeIssue(matterId, text) {
      const i = await research.addIssue(matterId, text, agent);
      return `Recorded as a candidate issue [issue:${i.id}]. The advocate decides it at the case conference.`;
    },
    async addAuthority(matterId, input) {
      const a = await research.addAuthority(matterId, input, agent);
      return `Recorded as a candidate authority [authority:${a.id}] (${a.role}). The advocate adopts or rejects it. It is not verified until the validator says so.`;
    },
    async writeMemorandum(matterId, input) {
      const m = await research.writeMemorandum(matterId, input, agent);
      return `Memorandum stored: ${m.title}. ${m.refs.length} reference(s) resolved${m.unresolved.length ? `; unresolved: ${m.unresolved.join(", ")}` : ""}.`;
    },
    async proposeParagraph(matterId, input, sessionId) {
      const generated = await drafts.generate(matterId, input.kind);
      const r = await drafts.proposeParagraph(matterId, { draftId: generated.draft.id, after: input.after, text: input.text, reason: input.reason }, sessionId);
      const proposal: ProposedCorrection = {
        draftId: generated.draft.id,
        title: generated.draft.title,
        revisionId: r.revision.id,
        seq: r.revision.seq,
        anchor: r.anchor,
        before: "",
        after: r.after,
        substantive: r.substantive,
        reason: input.reason,
      };
      return { text: `Proposed as a tracked insertion in ${generated.draft.title}, revision ${r.revision.seq}, anchor ${r.anchor}. The advocate keeps or undoes it.`, proposal };
    },
    async checkCitations(matterId, kind) {
      const draft = kind ? (await matters.listDrafts(matterId)).find((d) => d.kind === kind) : undefined;
      if (kind && !draft) return "That draft does not exist yet.";
      const checks = await research.checkCitations(matterId, draft?.id);
      if (checks.length === 0) return "No Supreme Court neutral citation (like 2019 INSC 1234) was found to check.";
      return checks.map((c) => `- ${c.citation}: ${c.outcome}${c.reason ? ` (${c.reason})` : ""}${c.attested ? ", attested by the advocate" : ""}`).join("\n");
    },
    async portal(matterId, action, args) {
      switch (action) {
        case "open_court_portal":
          return `The portal window is open at ${await portal.open(matterId, args.url)}. The advocate signs in and solves any CAPTCHA.`;
        case "portal_read":
          return portal.read();
        case "portal_navigate":
          return `Now at ${await portal.navigate(args.url ?? "")}.`;
        case "portal_fill":
          return portal.fill(args.selector ?? "", args.value ?? "");
        case "portal_click":
          return portal.click(args.selector ?? "");
        case "upload_filing_file":
          return portal.uploadFilingFile(matterId, args.selector ?? "", args.file_name ?? "");
        case "submit_filing":
          return portal.submitFiling(matterId, args.selector ?? "");
        case "save_portal_receipt":
          return `Saved the receipt as a source: ${await portal.saveReceipt(matterId)}.`;
        default:
          throw new Error(`unknown portal action ${action}`);
      }
    },
  };
}
