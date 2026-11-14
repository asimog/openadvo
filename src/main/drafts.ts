/**
 * Drafts: generation, revisions, paragraph links and the working copy the editor opens.
 *
 * Generation is deterministic (`lib/drafting`): no model writes the text. Only
 * confirmed Notebook events that are not excluded reach the generator. A save
 * from the editor is converted from `Editor.bin` to DOCX with the release's own
 * x2t and goes through `main/matters.ts` (decision 4). The matter store owns
 * every revision; a stale base is refused (WD-007 to WD-010).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Matters } from "./matters.ts";
import { convertFile, FORMAT_DOCX } from "../lib/converter/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import { checkDraft, defectItemKind, gateState } from "../lib/verification/index.ts";
import { decideChanges, pendingChanges, proposeInsertion, proposeReplacement, type ChangeDecision } from "../lib/tracked-changes/index.ts";
import { caseNumbers } from "../lib/verification/index.ts";
import type { AgentChanges } from "../shared/records.ts";
import { delayDays } from "../lib/filing/index.ts";
import { protectedNamesIn, reporterOnlyCitations } from "../lib/filing/v5.ts";
import { groundedStatus } from "../lib/studio/index.ts";
import { bodyParagraphs, conferenceBlocks, condonationBlocks, generateStructured, petitionBlocks, prayerDefect, TITLES, TO_COMPLETE } from "../lib/drafting/structured.ts";
import type { DraftCheck } from "../shared/records.ts";
import {
  eventSentence,
  generateEmptyDraft,
  generateListOfDates,
  generateSynopsis,
  newAnchor,
  readParagraphs,
  type DraftEvent,
} from "../lib/drafting/index.ts";
import type {
  DraftKind,
  GeneratedDraft,
  NotebookEvent,
  ParagraphSource,
  ParagraphSourceEvent,
  RevisionDetail,
  RevisionRecord,
} from "../shared/records.ts";

/** How a working copy reaches the editor host. Implemented by `main/editor-host.ts` through a callback. */
export type OpenInEditor = (
  file: string,
  name: string,
  kind: "word",
  readOnly: boolean,
  meta: { matterId: string; draftId: string; revisionId: string },
) => Promise<string>;

export interface DraftsOptions {
  /** resources/euro-office/<platform>/converter/x2t(.exe) */
  x2t: string;
  /** Parent folder for one working folder per open revision. */
  workingRoot: string;
  /** Opens the working copy in the Word editor and returns the host-page URL. */
  openInEditor: OpenInEditor;
  /** Steps 6, 7: what holds a draft revision for legal review (main/research.ts). */
  legalBlockers?: (matterId: string, draftId: string, revisionId: string) => Promise<string[]>;
}

const KINDS: Record<"list_of_dates" | "synopsis", { title: string; generate: typeof generateListOfDates }> = {
  list_of_dates: { title: "LIST OF DATES", generate: generateListOfDates },
  synopsis: { title: "SYNOPSIS", generate: generateSynopsis },
};

/** Step 6: drafts that start with their title only. The agent proposes paragraphs; the advocate writes. */
const EMPTY_KINDS: Record<"questions_of_law" | "grounds", string> = {
  questions_of_law: "QUESTIONS OF LAW",
  grounds: "GROUNDS",
};

/** A Notebook event as the generator takes it. The source name is carried for ordering. */
function toDraftEvent(e: NotebookEvent): DraftEvent {
  return {
    id: e.id,
    dateStart: e.dateStart,
    dateEnd: e.dateEnd,
    dateText: e.dateText,
    description: e.description,
    kind: e.kind,
    reading: e.reading,
    sourceName: e.sourceName,
    page: e.page,
    line: e.line,
  };
}

/** The source line of one event, for "Show source of this paragraph". */
function toParagraphSourceEvent(e: NotebookEvent): ParagraphSourceEvent {
  return {
    id: e.id,
    dateStart: e.dateStart,
    dateEnd: e.dateEnd,
    dateText: e.dateText,
    description: e.description,
    kind: e.kind,
    reading: e.reading,
    sourceId: e.sourceId,
    sourceName: e.sourceName,
    anchorId: e.anchorId,
    page: e.page,
    line: e.line,
  };
}

interface WorkingCopy {
  dir: string;
  matterId: string;
  draftId: string;
  revisionId: string;
}

export class Drafts {
  private matters: Matters;
  private options: DraftsOptions;
  /** doc token -> the working folder behind it. */
  private working = new Map<string, WorkingCopy>();

  constructor(matters: Matters, options: DraftsOptions) {
    this.matters = matters;
    this.options = options;
  }

  /**
   * Generate one draft from the confirmed events only (workflow 8A, 8B; Appendix B-C).
   * An open date conflict on a confirmed event refuses generation: the system does
   * not put a contested date into prose.
   */
  async generate(matterId: string, kind: DraftKind): Promise<GeneratedDraft> {
    if (kind === "petition" || kind === "conference" || kind === "condonation") return this.generateStructuredDraft(matterId, kind);
    if (kind === "questions_of_law" || kind === "grounds") {
      const existing = (await this.matters.listDrafts(matterId)).find((d) => d.kind === kind);
      if (existing?.head) return { draft: existing, revision: existing.head };
      const title = EMPTY_KINDS[kind];
      const g = generateEmptyDraft({ title, generatedAt: new Date().toISOString() });
      return this.matters.createDraftWithRevision(matterId, kind, title, g.docx, []);
    }
    const notebook = await this.matters.notebook(matterId);
    let confirmed = notebook.events.filter((e) => e.status === "confirmed" && !e.excluded);
    // V2-5: the advocate's chosen rows, when a choice exists.
    if (kind === "list_of_dates") {
      const rows = new Set(await this.matters.lodRows(matterId));
      if (rows.size > 0) confirmed = confirmed.filter((e) => rows.has(e.id));
    }
    if (confirmed.length === 0) {
      throw new MatterStoreError("NO_CONFIRMED_EVENTS", "confirm at least one Notebook event before generating a draft");
    }
    const conflicted = confirmed.find((e) => e.conflicts.length > 0);
    if (conflicted) {
      throw new MatterStoreError(
        "DRAFT_DATE_CONFLICT",
        `the confirmed event dated ${conflicted.dateText} has an open date conflict. Resolve it in the Notebook first.`,
      );
    }
    const meta = KINDS[kind as "list_of_dates" | "synopsis"];
    if (!meta) throw new MatterStoreError("BAD_DRAFT_KIND", String(kind));
    const generated = meta.generate(confirmed.map(toDraftEvent), {
      title: meta.title,
      generatedAt: new Date().toISOString(),
    });
    const { draft, revision } = await this.matters.createDraftWithRevision(
      matterId,
      kind,
      meta.title,
      generated.docx,
      generated.paragraphs,
    );
    return { draft, revision };
  }

  /**
   * V1-6 and V1-7: the conference package and the petition, from records only. A second run adds
   * a new revision (author generator) to the same draft; the old revisions stay.
   */
  private async generateStructuredDraft(matterId: string, kind: "petition" | "conference" | "condonation"): Promise<GeneratedDraft> {
    const store = await this.matters.store(matterId);
    const w = store.work;
    const details = w.details();
    const notebook = await this.matters.notebook(matterId);
    const impugned = details.impugnedEventId ? notebook.events.find((e) => e.id === details.impugnedEventId) ?? null : null;
    const drafts = await this.matters.listDrafts(matterId);
    const generatedAt = new Date().toISOString();
    let title: string;
    let blocks;
    if (kind === "petition") {
      title = "PETITION FOR SPECIAL LEAVE TO APPEAL";
      const approvedText = async (k: DraftKind, re: RegExp) => {
        const d = drafts.find((x) => x.kind === k);
        if (!d?.approved) return [];
        return bodyParagraphs(readParagraphs(await this.matters.revisionBytes(matterId, d.approved.id)), re);
      };
      blocks = petitionBlocks({
        petitioner: details.petitioner,
        respondent: details.respondent,
        court: details.court,
        caseNumber: details.caseNumber,
        impugnedDate: impugned?.dateStart ?? null,
        impugnedEventId: impugned?.id ?? null,
        questions: await approvedText("questions_of_law", TITLES.questionsOfLaw),
        grounds: await approvedText("grounds", TITLES.grounds),
        annexures: w.listAnnexures().map((a) => ({ label: a.label, title: a.title })),
        year: new Date(generatedAt).getFullYear(),
        interimRelief: details.interimRelief,
      });
    } else if (kind === "condonation") {
      title = "APPLICATION FOR CONDONATION OF DELAY";
      const lim = w.limitation();
      if (!lim?.confirmedAt) throw new MatterStoreError("LIMITATION_NOT_CONFIRMED", "compute and confirm limitation on the Filing tab first");
      const delay = delayDays(lim.deadline, generatedAt);
      if (delay === 0) throw new MatterStoreError("NO_DELAY", `the petition is in time: the last day of limitation is ${lim.deadline}`);
      blocks = condonationBlocks({
        petitioner: details.petitioner,
        respondent: details.respondent,
        court: details.court,
        caseNumber: details.caseNumber,
        impugnedDate: impugned?.dateStart ?? null,
        deadline: lim.deadline,
        delayDays: delay,
        asOf: generatedAt.slice(0, 10),
        year: new Date(generatedAt).getFullYear(),
      });
    } else {
      title = "CASE CONFERENCE PACKAGE";
      const confirmed = notebook.events.filter((e) => e.status === "confirmed" && !e.excluded).map(toDraftEvent);
      const checks = w.listCitationChecks();
      const items = (await this.matters.listReviewItemsOf(matterId)).filter((r) => r.status === "open");
      blocks = conferenceBlocks({
        details: {
          petitioner: details.petitioner,
          respondent: details.respondent,
          court: details.court,
          caseNumber: details.caseNumber,
          cnr: details.cnr,
          impugned: impugned ? `${impugned.dateText}: ${impugned.description}` : null,
        },
        procedural: confirmed.filter((e) => e.kind === "procedural"),
        factual: confirmed.filter((e) => e.kind === "factual"),
        issues: w.listIssues().map((i) => ({ text: i.text, status: i.status, author: i.author, reason: i.reason })),
        authorities: w.listAuthorities().map((a) => ({
          citation: a.citation,
          parties: a.parties,
          role: a.role,
          status: a.status,
          proposition: a.proposition,
          outcome: checks.filter((c) => c.citation === a.citation).at(-1)?.outcome ?? null,
        })),
        adverseReview: (() => {
          const r = w.adverseReview();
          return r ? { outcome: r.outcome, coverage: r.coverage, note: r.note } : null;
        })(),
        memoranda: w.listMemoranda().map((m) => ({ title: m.title, refs: m.refs.length, unresolved: m.unresolved.length })),
        openReviewItems: items.map((r) => ({ kind: r.kind, detail: r.detail })),
        weakPoints: (() => {
          const args = store.studio.arguments();
          const status = groundedStatus(args);
          return args
            .filter((a) => a.status === "accepted" && !a.attacks)
            .map((a) => ({ claim: a.claim, questions: a.questions, attacks: args.filter((x) => x.attacks === a.id && x.status !== "rejected" && status.get(x.id) !== "out").map((x) => ({ kind: x.attackKind ?? "attack", claim: x.claim })) }));
        })(),
      });
    }
    const g = generateStructured(blocks, { title, generatedAt });
    const existing = drafts.find((d) => d.kind === kind);
    if (existing?.head) {
      const revision = await this.matters.addGeneratedRevision(matterId, existing.id, g.docx, g.paragraphs);
      return { draft: await this.matters.getDraft(matterId, existing.id), revision };
    }
    return this.matters.createDraftWithRevision(matterId, kind, title, g.docx, g.paragraphs);
  }

  /** A revision with the live paragraphs of its DOCX (WD-013: tracked deletions are not live text). */
  async revisionDetail(matterId: string, revisionId: string): Promise<RevisionDetail> {
    const revision = await this.matters.getRevision(matterId, revisionId);
    const docx = await this.matters.revisionBytes(matterId, revisionId);
    return { ...revision, paragraphs: readParagraphs(docx) };
  }

  /** All drafts, each with its latest revision. */
  async list(matterId: string) {
    return this.matters.listDrafts(matterId);
  }

  /**
   * Open one revision in the Word editor. The editor works on a copy: the DOCX is
   * converted to `Editor.bin` in a working folder, and the store is untouched until
   * the advocate saves (editor-design item i).
   */
  async openInEditor(matterId: string, revisionId: string): Promise<string> {
    const revision = await this.matters.getRevision(matterId, revisionId);
    const draft = await this.matters.getDraft(matterId, revision.draftId);
    const docx = await this.matters.revisionBytes(matterId, revisionId);
    const dir = await mkdtemp(path.join(this.options.workingRoot, "open-"));
    const docxPath = path.join(dir, `${safeName(draft.title)}.docx`);
    await writeFile(docxPath, docx);
    const binPath = path.join(dir, "Editor.bin");
    await convertFile(this.options.x2t, {
      from: docxPath,
      to: binPath,
      format: 8192,
      tempDir: path.join(dir, "x2t"),
    });
    await readFile(binPath); // fail now, not in the editor page, when x2t wrote nothing
    const name = `${safeName(draft.title)} - revision ${revision.seq}.docx`;
    const url = await this.options.openInEditor(binPath, name, "word", false, {
      matterId,
      draftId: draft.id,
      revisionId,
    });
    const token = new URL(url).searchParams.get("doc") ?? "";
    this.working.set(token, { dir, matterId, draftId: draft.id, revisionId });
    await this.matters.appendEvent(matterId, { actor: "advocate" }, "editor.opened", revisionId, {
      draftId: draft.id,
      token,
    });
    return url;
  }

  /** Close one working copy: delete its folder and record the close. Idempotent. */
  async closeWorkingCopy(token: string): Promise<void> {
    const copy = this.working.get(token);
    if (!copy) return;
    this.working.delete(token);
    await rm(copy.dir, { recursive: true, force: true }).catch(() => undefined);
    await this.matters.appendEvent(copy.matterId, { actor: "advocate" }, "editor.closed", copy.revisionId, {
      draftId: copy.draftId,
      token,
    });
  }

  /**
   * Save the editor's own document bytes as a new revision (human save, decision 5).
   * The bytes are the editor's binary form; x2t writes the DOCX.
   */
  async saveRevision(
    matterId: string,
    draftId: string,
    editorBytes: Uint8Array,
    baseRevisionId: string,
  ): Promise<RevisionRecord> {
    const draft = await this.matters.getDraft(matterId, draftId);
    if (!baseRevisionId) throw new MatterStoreError("BASE_REQUIRED", "a human save needs a base revision");
    const dir = await mkdtemp(path.join(this.options.workingRoot, "save-"));
    try {
      const binPath = path.join(dir, "Editor.bin");
      await writeFile(binPath, editorBytes);
      const docxPath = path.join(dir, "revision.docx");
      await convertFile(this.options.x2t, {
        from: binPath,
        to: docxPath,
        format: FORMAT_DOCX,
        tempDir: path.join(dir, "x2t"),
      });
      const docx = await readFile(docxPath);
      if (docx.length < 1024) throw new MatterStoreError("DOC_SAVE_FAILED", "the converter produced no DOCX");
      // The store writes the revision and the `revision.saved` event. An anchor that
      // survives in the new DOCX keeps its link; an anchor with no link has no source.
      return await this.matters.saveDraftRevision(matterId, draftId, docx, baseRevisionId);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Human-only approval of one revision (decision 5). Editor-design item h: a revision that
   * holds an agent change the advocate has not decided cannot be approved.
   */
  async approveRevision(matterId: string, revisionId: string) {
    const open = pendingChanges(await this.matters.revisionBytes(matterId, revisionId));
    if (open.length > 0) {
      throw new MatterStoreError("AGENT_CHANGES_UNDECIDED", `${open.length} agent change(s) are not decided. Keep or undo each one first.`);
    }
    // Workflow 9B, 9C: an unattested failed citation, or grounds without the adverse-authority review, block approval.
    const revision = await this.matters.getRevision(matterId, revisionId);
    const legal = (await this.options.legalBlockers?.(matterId, revision.draftId, revisionId)) ?? [];
    if (legal.length > 0) throw new MatterStoreError("LEGAL_REVIEW_BLOCKED", legal.join("; "));
    // V1-7: a revision that still holds a "[TO BE COMPLETED" marker is not approved (lesson L2).
    const marked = readParagraphs(await this.matters.revisionBytes(matterId, revisionId)).filter((p) => p.text.includes(TO_COMPLETE));
    if (marked.length > 0) throw new MatterStoreError("DRAFT_INCOMPLETE", `${marked.length} paragraph(s) still say "${TO_COMPLETE}". Record the details and generate again, or complete them in the editor.`);
    return this.matters.approveRevision(matterId, revisionId);
  }

  /**
   * The agent's correction of one paragraph, written as tracked changes into a new revision
   * (step 5; editor-design items a, e). The head revision is the base. Nothing is kept until
   * the advocate decides.
   */
  async proposeCorrection(
    matterId: string,
    input: { draftId: string; anchor: string; expected: string; replacement: string; reason: string },
    sessionId?: string,
  ): Promise<{ revision: RevisionRecord; before: string; after: string; substantive: boolean }> {
    const draft = await this.matters.getDraft(matterId, input.draftId);
    if (!draft.head) throw new MatterStoreError("DRAFT_NOT_FOUND", input.draftId);
    const docx = await this.matters.revisionBytes(matterId, draft.head.id);
    const { docx: next, change } = proposeReplacement(docx, {
      anchor: input.anchor,
      expected: input.expected,
      replacement: input.replacement,
      date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    const revision = await this.matters.proposeDraftRevision(
      matterId,
      draft.id,
      next,
      draft.head.id,
      { anchor: input.anchor, reason: input.reason, substantive: change.substantive },
      sessionId,
    );
    return { revision, before: change.before, after: change.after, substantive: change.substantive };
  }

  /**
   * Step 6: the agent proposes a new paragraph (a Question of Law, a Ground) as a tracked
   * insertion with its own anchor, after the paragraph `after` or at the end.
   */
  async proposeParagraph(
    matterId: string,
    input: { draftId: string; after: string | null; text: string; reason: string },
    sessionId?: string,
  ): Promise<{ revision: RevisionRecord; anchor: string; after: string; substantive: boolean }> {
    const draft = await this.matters.getDraft(matterId, input.draftId);
    if (!draft.head) throw new MatterStoreError("DRAFT_NOT_FOUND", input.draftId);
    const docx = await this.matters.revisionBytes(matterId, draft.head.id);
    const anchor = newAnchor();
    const { docx: next, change } = proposeInsertion(docx, {
      anchor,
      after: input.after,
      text: input.text,
      date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    await this.matters.recordParagraphLink(matterId, draft.id, anchor, draft.head.id, [], change.after);
    const revision = await this.matters.proposeDraftRevision(
      matterId,
      draft.id,
      next,
      draft.head.id,
      { anchor, inserted: true, reason: input.reason, substantive: change.substantive },
      sessionId,
    );
    return { revision, anchor, after: change.after, substantive: change.substantive };
  }

  /** The agent changes not yet decided, for every draft, read from the head revision's DOCX. */
  async agentChanges(matterId: string): Promise<AgentChanges[]> {
    const out: AgentChanges[] = [];
    for (const draft of await this.matters.listDrafts(matterId)) {
      if (!draft.head) continue;
      const changes = pendingChanges(await this.matters.revisionBytes(matterId, draft.head.id));
      if (changes.length > 0) out.push({ draftId: draft.id, title: draft.title, revisionId: draft.head.id, seq: draft.head.seq, changes });
    }
    return out;
  }

  /**
   * Human-only (decision 5; editor-design items e to g): keep or undo agent changes in the head
   * revision. The result is a new revision by the advocate. A stale base is refused.
   */
  async decideAgentChanges(
    matterId: string,
    draftId: string,
    baseRevisionId: string,
    decisions: Array<{ anchor: string; decision: ChangeDecision }>,
  ): Promise<RevisionRecord> {
    const docx = await this.matters.revisionBytes(matterId, baseRevisionId);
    const next = decideChanges(docx, decisions);
    return this.matters.decideDraftRevision(matterId, draftId, next, baseRevisionId, {
      kept: decisions.filter((d) => d.decision === "keep").map((d) => d.anchor),
      undone: decisions.filter((d) => d.decision === "undo").map((d) => d.anchor),
    });
  }

  /**
   * The sentence Insert from Notebook places at the cursor, with a new anchor.
   * The link is recorded before the editor adds the paragraph, so a save keeps it.
   */
  async insertFromNotebook(matterId: string, draftId: string, eventId: string): Promise<{ anchor: string; text: string }> {
    const draft = await this.matters.getDraft(matterId, draftId);
    if (!draft.head) throw new MatterStoreError("DRAFT_NOT_FOUND", draftId);
    const notebook = await this.matters.notebook(matterId);
    const event = notebook.events.find((e) => e.id === eventId);
    if (!event) throw new MatterStoreError("EVENT_NOT_FOUND", eventId);
    if (event.status !== "confirmed") throw new MatterStoreError("EVENT_NOT_CONFIRMED", "only a confirmed event can be inserted");
    if (event.excluded) throw new MatterStoreError("EVENT_EXCLUDED", "the advocate excluded this event from the chronology");
    const text = eventSentence(toDraftEvent(event));
    const anchor = newAnchor();
    await this.matters.recordParagraphLink(matterId, draftId, anchor, draft.head.id, [event.id], text);
    return { anchor, text };
  }

  /** The Notebook events and source lines one paragraph anchor links to. */
  async paragraphSource(matterId: string, draftId: string, anchor: string): Promise<ParagraphSource | null> {
    const link = await this.matters.getParagraphLink(matterId, draftId, anchor);
    if (!link) return null;
    const notebook = await this.matters.notebook(matterId);
    const byId = new Map(notebook.events.map((e) => [e.id, e]));
    const events = link.eventIds
      .map((id) => byId.get(id))
      .filter((e): e is NotebookEvent => e !== undefined)
      .map(toParagraphSourceEvent);
    return { draftId, anchor, text: link.text, eventIds: link.eventIds, events };
  }

  /**
   * The deterministic checks on the latest stored revision of one draft (step 5; workflow 9A, 9D).
   * `lib/verification` computes; the matter store records that the check ran. The draft is not changed.
   */
  async check(matterId: string, draftId: string): Promise<DraftCheck> {
    const all = await this.readDrafts(matterId);
    const draft = all.find((d) => d.draftId === draftId);
    if (!draft) throw new Error("DRAFT_NOT_FOUND: the draft has no stored revision");
    const pairKind: DraftKind | null = draft.kind === "list_of_dates" ? "synopsis" : draft.kind === "synopsis" ? "list_of_dates" : null;
    const pair = pairKind ? all.find((d) => d.kind === pairKind) : undefined;
    const notebook = await this.matters.notebook(matterId);
    const store = await this.matters.store(matterId);
    const details = store.work.details();
    const recordCaseNumbers = new Set<string>();
    for (const s of await this.matters.listSources(matterId)) {
      for (const p of await this.matters.listPages(matterId, s.id)) for (const l of p.lines) for (const n of caseNumbers(l.text)) recordCaseNumbers.add(n);
    }
    const result = checkDraft({
      paired: pairKind !== null,
      matter: { petitioner: details.petitioner, respondent: details.respondent, caseNumber: details.caseNumber },
      recordCaseNumbers: [...recordCaseNumbers],
      paragraphs: draft.paragraphs,
      events: notebook.events.map((e) => ({
        id: e.id,
        dateStart: e.dateStart,
        dateEnd: e.dateEnd,
        dateText: e.dateText,
        description: e.description,
        status: e.status,
        excluded: e.excluded,
        sourceName: e.sourceName,
        page: e.page,
        line: e.line,
      })),
      other: pair ? { title: pair.title, paragraphs: pair.paragraphs } : undefined,
    });
    // V1-7 rules 23 and 24: incomplete markers in any draft; the prayer of the petition.
    draft.paragraphs.forEach((p, n) => {
      if (p.text.includes(TO_COMPLETE)) {
        result.defects.push({ kind: "incomplete", paragraph: n + 1, anchor: p.anchor, text: p.text, evidence: "The paragraph holds a marker for a detail the matter does not record.", action: "Record the detail in the matter and generate again, or complete the paragraph in the editor." });
      }
    });
    // V5-14 and V5-15: reporter-only citations, repealed provisions, a protected victim's name.
    const repealed = store.studio.listProvisions().filter((x) => x.repealed && x.status !== "rejected");
    draft.paragraphs.forEach((p, n) => {
      for (const c of reporterOnlyCitations(p.text)) {
        result.defects.push({ kind: "reporter_citation", paragraph: n + 1, anchor: p.anchor, text: p.text, evidence: `${c} is in reporter form and the paragraph gives no neutral citation, so the validator cannot check it.`, action: "Add the neutral citation (for example 2019 INSC 1234)." });
      }
      for (const r of repealed) {
        const actWord = r.act.replace(/^the\s+/i, "").split(/[\s,]+/)[0] ?? "";
        if (new RegExp(`\\b(?:section|s\\.)\\s*${r.section}\\b`, "i").test(p.text) && actWord && p.text.toLowerCase().includes(actWord.toLowerCase())) {
          result.defects.push({ kind: "repealed_provision", paragraph: n + 1, anchor: p.anchor, text: p.text, evidence: `${r.act}, section ${r.section} is recorded as repealed (India Code).`, action: "Rely on the provision in force, or record why the repealed one applies." });
        }
      }
      if (details.victimProtected) {
        for (const name of protectedNamesIn(p.text, details.victimNames)) {
          result.defects.push({ kind: "victim_identity", paragraph: n + 1, anchor: p.anchor, text: p.text, evidence: `The paragraph names "${name}", whose identity the matter protects.`, action: "Replace the name (for example with \"the prosecutrix\" or \"X\")." });
        }
      }
    });
    if (draft.kind === "petition") {
      const impugned = details.impugnedEventId ? notebook.events.find((e) => e.id === details.impugnedEventId) : undefined;
      const defect = prayerDefect(draft.paragraphs.map((p) => p.text), { date: impugned?.dateStart ?? null, caseNumber: details.caseNumber });
      if (defect) result.defects.push({ kind: "prayer_mismatch", paragraph: 0, anchor: null, text: "Prayer", evidence: defect, action: "Correct the prayer, or the matter details." });
    }
    const byKind: Record<string, number> = {};
    for (const d of result.defects) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    // Each defect is a review item of this draft (workflow 9: a blocked item names defect, evidence, passage, action).
    const reviewItems = await this.matters.openDraftDefects(
      matterId,
      draftId,
      draft.revision.id,
      result.defects.map((d) => ({
        kind: defectItemKind(d.kind),
        detail: `${draft.title}, paragraph ${d.paragraph}: ${d.text} Evidence: ${d.evidence} Action: ${d.action}`,
      })),
    );
    const openItemKinds = (await this.matters.listReviewItemsOf(matterId))
      .filter((r) => r.draftId === draftId && r.status === "open")
      .map((r) => r.kind);
    const undecided = pendingChanges(await this.matters.revisionBytes(matterId, draft.revision.id)).length;
    const legal = (await this.options.legalBlockers?.(matterId, draftId, draft.revision.id)) ?? [];
    const gate = gateState({ openItemKinds: openItemKinds.filter((k) => !k.startsWith("citation.")), notRun: result.notRun, undecidedChanges: undecided, legal });
    await this.matters.appendEvent(matterId, { actor: "advocate" }, "draft.checked", draft.revision.id, {
      method: result.method,
      statements: result.statementsChecked,
      defects: result.defects.length,
      byKind,
      reviewItemsOpened: reviewItems.opened,
      gate: gate.state,
    });
    return {
      draftId,
      revisionId: draft.revision.id,
      seq: draft.revision.seq,
      method: result.method,
      checkedAt: new Date().toISOString(),
      statementsChecked: result.statementsChecked,
      defects: result.defects,
      notRun: result.notRun,
      reviewItems,
      gate,
    };
  }

  /** The live text of the latest revision of each draft of a kind, for the agent's `read_draft`. */
  async readDrafts(matterId: string, kind?: DraftKind): Promise<Array<{ draftId: string; kind: DraftKind; title: string; revision: RevisionRecord; paragraphs: Array<{ anchor: string | null; text: string; eventIds: string[] }> }>> {
    const drafts = (await this.matters.listDrafts(matterId)).filter((d) => !kind || d.kind === kind);
    const out = [];
    for (const draft of drafts) {
      if (!draft.head) continue;
      const detail = await this.revisionDetail(matterId, draft.head.id);
      const links = new Map((await this.matters.listParagraphLinks(matterId, draft.id)).map((l) => [l.anchor, l.eventIds]));
      out.push({
        draftId: draft.id,
        kind: draft.kind,
        title: draft.title,
        revision: draft.head,
        paragraphs: detail.paragraphs.map((p) => ({ ...p, eventIds: p.anchor ? (links.get(p.anchor) ?? []) : [] })),
      });
    }
    return out;
  }

  /** One anchor anywhere in the matter: the event ids and source lines behind it. */
  async paragraphSourceAnywhere(matterId: string, anchor: string): Promise<ParagraphSource | null> {
    const drafts = await this.matters.listDrafts(matterId);
    for (const draft of drafts) {
      const found = await this.paragraphSource(matterId, draft.id, anchor);
      if (found) return found;
    }
    return null;
  }

  /** The folder every working copy and save conversion uses. */
  static defaultWorkingRoot(): string {
    return path.join(tmpdir(), "openadvo-drafts");
  }
}

function safeName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Draft";
}
