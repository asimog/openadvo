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
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import { searchCitationIndex, type UlosPaths } from "../lib/ulos/index.ts";
import { PREFERENCE_KEYS, preferenceKeyOf } from "../lib/preferences/index.ts";

export function agentWorkHost(deps: { matters: Matters; research: Research; drafts: Drafts; portal: Portal; ulos: UlosPaths; advocate?: AdvocateStore }): AgentWorkHost {
  const { matters, research, drafts, portal } = deps;
  /** Defect B1-4: every write records the session id, and a helper's call its own actor id. */
  const agent = (sessionId: string) => ({ actor: "agent" as const, sessionId });
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
    async proposeIssue(matterId, text, actor) {
      const i = await research.addIssue(matterId, text, agent(actor));
      return `Recorded as a candidate issue [issue:${i.id}]. The advocate decides it at the case conference.`;
    },
    async addAuthority(matterId, input, actor) {
      const a = await research.addAuthority(matterId, input, agent(actor));
      return `Recorded as a candidate authority [authority:${a.id}] (${a.role}). The advocate adopts or rejects it. It is not verified until the validator says so.`;
    },
    async writeMemorandum(matterId, input, actor) {
      const m = await research.writeMemorandum(matterId, input, agent(actor));
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
    async insertCitation(matterId, input, sessionId) {
      const r = await drafts.insertCitation(matterId, input, sessionId);
      const proposal: ProposedCorrection = {
        draftId: input.draftId,
        title: (await matters.getDraft(matterId, input.draftId)).title,
        revisionId: r.revision.id,
        seq: r.revision.seq,
        anchor: input.anchor,
        before: r.before,
        after: r.after,
        substantive: r.substantive,
        reason: `${r.reason} — the citation inserted: ${r.citation}`,
      };
      return {
        text: `Inserted as a tracked change in revision ${r.revision.seq}: ${r.citation}. ${r.reason}. The advocate keeps or undoes it.`,
        proposal,
      };
    },
    async listPreferences() {
      const store = deps.advocate;
      if (!store) return "The advocate store is not available in this session.";
      const lines: string[] = [];
      const approved = store.preferences().filter((p) => p.status === "approved");
      const proposed = store.preferences().filter((p) => p.status === "proposed");
      lines.push(approved.length === 0 ? "No preference is approved yet." : `Approved preferences (${approved.length}):`);
      for (const p of approved) lines.push(`- ${p.key}: ${p.value} (applied because ${p.reason})`);
      if (proposed.length > 0) {
        lines.push(`Waiting for the advocate (${proposed.length}):`);
        for (const p of proposed) lines.push(`- ${p.key}: ${p.value} — ${p.reason}`);
      }
      const unknown = PREFERENCE_KEYS.filter((k) => !approved.some((p) => p.key === k.key)).map((k) => `${k.key} (${k.question})`);
      if (unknown.length > 0) {
        lines.push("Not answered yet (ask once, inside the first task where each matters):");
        for (const u of unknown) lines.push(`- ${u}`);
      }
      return lines.join("\n");
    },
    async proposePreference(input, sessionId) {
      const store = deps.advocate;
      if (!store) return "The advocate store is not available in this session.";
      const key = preferenceKeyOf(input.key);
      if (!key) return `Unknown preference key "${input.key}".`;
      const proposed = store.proposePreference({ key: input.key, value: input.value, reason: input.reason }, agent(sessionId));
      return `Preference proposed: ${proposed.key} = ${proposed.value}. It is a proposal until the advocate approves it in the Review Inbox. Do not say it is set.`;
    },
    async proposeAdvocateMemory(input, sessionId) {
      const store = deps.advocate;
      if (!store) return "The advocate store is not available in this session.";
      const proposed = store.proposeMemory(
        { type: input.type, subject: input.subject, relation: input.relation, object: input.object, confidence: input.confidence },
        agent(sessionId),
      );
      return `Advocate memory proposed [${proposed.memoryId}]: ${proposed.subject} ${proposed.relation} ${proposed.object}. The advocate confirms or rejects it on the profile. It holds no fact of any client's matter.`;
    },
  };
}
