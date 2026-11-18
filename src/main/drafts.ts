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
import { convertFile, FORMAT_DOCX, FORMAT_PDF } from "../lib/converter/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import { checkDraft, defectItemKind, gateState } from "../lib/verification/index.ts";
import { checkGrounding } from "../lib/verification/grounding.ts";
import { checkStatutes } from "../lib/verification/statute.ts";
import { checkStructure, markersIn } from "../lib/verification/structure.ts";
import { buildReviewerNote } from "../lib/verification/reviewer-note.ts";
import { detectContradictions } from "../lib/evidence/contradictions.ts";
import { decideChanges, pendingChanges, proposeInsertion, proposeReplacement, type ChangeDecision } from "../lib/tracked-changes/index.ts";
import { caseNumbers } from "../lib/verification/index.ts";
import type { AgentChanges } from "../shared/records.ts";
import { delayDays } from "../lib/filing/index.ts";
import { protectedNamesIn, reporterOnlyCitations } from "../lib/filing/v5.ts";
import { groundedStatus } from "../lib/studio/index.ts";
import { bodyParagraphs, conferenceBlocks, condonationBlocks, generateStructured, petitionBlocks, prayerDefect, TITLES, TO_COMPLETE } from "../lib/drafting/structured.ts";
import { CATALOGUE, COURT_FORMATS, courtFormat, templateOf, type DocumentTemplate } from "../lib/drafting/documents.ts";
import type { DraftingInput } from "../lib/drafting/parts.ts";
import { appliedBecause, defaultUsed, formatCitation, normaliseReason, correctionPreference } from "../lib/preferences/index.ts";
import { extractText } from "../lib/document-intelligence/index.ts";
import { conversionCheck } from "../lib/filing/v5.ts";
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
  /** Phase 6: the advocate's profile, for the signature blocks and the vakalatnama. */
  profile?: () => { name: string; role: string; barCouncil: string; address: string } | null;
  /** Phase 6 (A7): the approved preferences, with the reason each one applies. */
  approvedPreferences?: () => Record<string, { value: string; reason: string | null }>;
  /** Phase 6 (A7): the same correction twice proposes a preference. */
  onCorrectionRepeated?: (input: { key: string; value: string; reason: string; firstAt: string; secondAt: string }) => Promise<void>;
  /** Phase 6 (F2): a citation inserted in more than one matter proposes an advocate memory record. */
  onCitationInserted?: (input: { matterId: string; citation: string }) => Promise<void>;
  /** Phase 6 (P4): the law library's rows for a statutory reference, or null when it holds none. */
  statuteLookup?: (act: string, section: string) => Array<{ act: string; section: string; status: string; version: number | null; validFrom: string | null; validUntil: string | null; current: number; checkState: string; sourceRef: string }> | null;
  /** Phase 6 (P1): the highest indexed paragraph of each saved authority's judgment, or null. */
  authorityParagraphs?: (matterId: string) => Promise<Array<{ citation: string; maxParagraph: number | null }>>;
  /** Phase 6 (A7): the questions a task asks once — the named keys with no approved value. */
  preferenceQuestions?: (keys: string[]) => Array<{ key: string; title: string; question: string; values: string[] | null; free: boolean; default: string }>;
}

/** The catalogue, for the picker in the window. */
export interface CatalogueEntry {
  kind: DraftKind;
  title: string;
  group: string;
  note: string;
}

export function catalogue(): CatalogueEntry[] {
  return CATALOGUE.map((t) => ({ kind: t.kind, title: t.title, group: t.group, note: t.note }));
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
   * not put a contested date into prose. The phase 6 catalogue kinds build from the
   * template (L1 to L3): form parts, record parts with their ids, and slots.
   */
  async generate(matterId: string, kind: DraftKind): Promise<GeneratedDraft> {
    const template = templateOf(kind);
    if (template) return this.generateFromTemplate(matterId, template);
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

  /** Phase 6: the matter's records as the template parts read them. */
  private async assembleInput(matterId: string, store: Awaited<ReturnType<Matters["store"]>>): Promise<DraftingInput> {
    const w = store.work;
    const details = w.details();
    const notebook = await this.matters.notebook(matterId);
    const events = notebook.events.filter((e) => e.status === "confirmed" && !e.excluded).map(toDraftEvent);
    const target = store.filingTarget();
    // The matter profile holds the stage; the advocate's own details (the signature blocks)
    // come from the advocate store through the phase 6 option.
    const matterProfile = store.profile();
    const profile = this.options.profile?.() ?? null;
    const hearings = store.hearings();
    const arguments_ = store.studio.arguments();
    const standing = groundedStatus(arguments_);
    const drafts = await this.matters.listDrafts(matterId);
    const approvedText = async (k: DraftKind, re: RegExp) => {
      const d = drafts.find((x) => x.kind === k);
      if (!d?.approved) return [];
      return bodyParagraphs(readParagraphs(await this.matters.revisionBytes(matterId, d.approved.id)), re);
    };
    const memo = w.listMemoranda().at(-1) ?? null;
    return {
      details: {
        title: store.matter().title,
        court: details.court,
        caseNumber: details.caseNumber,
        cnr: details.cnr,
        petitioner: details.petitioner,
        respondent: details.respondent,
        interimRelief: details.interimRelief,
      },
      advocate: profile ? { name: profile.name, role: profile.role, barCouncil: profile.barCouncil, address: profile.address } : null,
      events,
      facts: store.evidence.facts().map((f) => ({
        id: f.id,
        text: f.text,
        type: f.type,
        status: f.status,
        date: f.date,
        relief: f.relief,
        sourceName: f.sourceName,
        page: f.page,
        line: f.line,
      })),
      evidence: store.evidence.evidenceList().map((e) => ({
        id: e.id,
        statement: e.statement,
        givenBy: e.givenBy,
        givenAt: e.givenAt,
        witness: e.witness,
        exhibitNumber: e.exhibitNumber,
        sourceName: e.sourceName,
      })),
      authorities: w.listAuthorities().filter((a) => a.status !== "rejected").map((a) => ({
        citation: a.citation,
        parties: a.parties,
        paragraph: a.paragraph,
        proposition: a.proposition,
        role: a.role,
      })),
      provisions: store.studio.listProvisions().filter((p) => p.status !== "rejected").map((p) => ({
        act: p.act,
        section: p.section,
        title: p.title,
        repealed: p.repealed,
        source: p.sourceRef,
      })),
      annexures: w.listAnnexures().map((a) => ({ label: a.label, title: a.title })),
      issues: w.listIssues().map((i) => ({ text: i.text, status: i.status })),
      allegations: store.evidence
        .parts()
        .filter((p) => p.kind === "allegation")
        .map((p) => ({ text: p.text, ref: p.ref, sourceName: p.sourceName, page: p.page, line: p.line })),
      memorandum: memo ? { title: memo.title, body: memo.body, unresolved: memo.unresolved } : null,
      proceeding: target ? { caseType: target.caseType, provisions: [] } : null,
      approved: {
        questions: await approvedText("questions_of_law", TITLES.questionsOfLaw),
        grounds: await approvedText("grounds", TITLES.grounds),
      },
      stage: matterProfile.stage ?? "",
      hearings: hearings.map((h) => ({ date: h.date, bench: h.bench, directions: h.directions, nextDate: h.nextDate, nextDateStatus: h.nextDateStatus })),
      orderDirections: store.evidence
        .parts()
        .filter((p) => p.kind === "direction")
        .reverse()
        .slice(0, 8)
        .map((p) => ({ text: p.text, sourceName: p.sourceName, page: p.page, line: p.line })),
      openItems: (await this.matters.listReviewItemsOf(matterId))
        .filter((r) => r.status === "open")
        .slice(0, 10)
        .map((r) => ({ kind: r.kind, detail: r.detail })),
      challenges: store.studio.challenges().map((c) => ({ kind: c.kind, text: c.text, answer: c.answer, status: c.status })),
      arguments: arguments_
        .filter((a) => a.status === "accepted" && !a.attacks)
        .map((a) => ({ claim: a.claim, reasoning: a.reasoning, computed: standing.get(a.id) ?? "undecided", elo: a.elo })),
    };
  }

  /** Phase 6 (L1, L3): one catalogue document from the matter's records, in the court's format. */
  private async generateFromTemplate(matterId: string, template: DocumentTemplate): Promise<GeneratedDraft> {
    const store = await this.matters.store(matterId);
    const input = await this.assembleInput(matterId, store);
    const blocks = template.build(input);
    if (blocks.length === 0) throw new MatterStoreError("EMPTY_TEMPLATE", `${template.kind} built no part`);
    const format = courtFormat(store.filingTarget()?.court ?? null);
    const generatedAt = new Date().toISOString();
    const g = generateStructured(blocks, { title: template.title, generatedAt, format });
    const existing = (await this.matters.listDrafts(matterId)).find((d) => d.kind === template.kind);
    if (existing?.head) {
      const revision = await this.matters.addGeneratedRevision(matterId, existing.id, g.docx, g.paragraphs);
      return { draft: await this.matters.getDraft(matterId, existing.id), revision };
    }
    const { draft, revision } = await this.matters.createDraftWithRevision(matterId, template.kind, template.title, g.docx, g.paragraphs);
    await this.matters.appendEvent(matterId, { actor: "advocate" }, "draft.template", revision.id, {
      kind: template.kind,
      title: template.title,
      format: format.id,
      formatSource: format.source,
      parts: blocks.length,
    });
    return { draft, revision };
  }

  /**
   * Phase 6 (L5): insert a citation from a saved authority into a draft paragraph, as a tracked
   * change. The citation takes the advocate's citation_format preference, and the proposal's
   * reason is the applied-because note (A7). The citation then goes through the ordinary checks.
   */
  async insertCitation(
    matterId: string,
    input: { draftId: string; anchor: string; authorityId: string; note?: string },
    sessionId?: string,
  ): Promise<{ revision: RevisionRecord; citation: string; reason: string; before: string; after: string; substantive: boolean }> {
    const draft = await this.matters.getDraft(matterId, input.draftId);
    if (!draft.head) throw new MatterStoreError("DRAFT_NOT_FOUND", input.draftId);
    const store = await this.matters.store(matterId);
    const authority = store.work.listAuthorities().find((a) => a.id === input.authorityId && a.status !== "rejected");
    if (!authority) throw new MatterStoreError("AUTHORITY_NOT_FOUND", `${input.authorityId} is not a saved authority of this matter`);
    const prefs = this.options.approvedPreferences?.() ?? {};
    const pref = prefs["citation_format"];
    const format = pref?.value ?? "neutral_first";
    const citation = formatCitation({ citation: authority.citation, parties: authority.parties, paragraph: authority.paragraph }, format);
    const reason = `${pref ? appliedBecause("citation_format", pref.value, pref.reason) : defaultUsed("citation_format")}${input.note ? `; ${input.note}` : ""}`;
    const docx = await this.matters.revisionBytes(matterId, draft.head.id);
    const live = readParagraphs(docx).find((p) => p.anchor === input.anchor);
    if (!live) throw new MatterStoreError("ANCHOR_NOT_FOUND", `no paragraph of this draft carries the anchor ${input.anchor}`);
    const replacement = `${live.text.trimEnd()} ${citation}`;
    const { docx: next, change } = proposeReplacement(docx, {
      anchor: input.anchor,
      expected: live.text,
      replacement,
      date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    const revision = await this.matters.proposeDraftRevision(
      matterId,
      draft.id,
      next,
      draft.head.id,
      { anchor: input.anchor, citation, authorityId: input.authorityId, substantive: change.substantive, reason },
      sessionId,
    );
    await this.matters.appendEvent(matterId, { actor: "agent", sessionId }, "citation.inserted", revision.id, {
      draftId: draft.id,
      anchor: input.anchor,
      citation: authority.citation,
      authorityId: input.authorityId,
      format,
      reason,
    });
    await this.options.onCitationInserted?.({ matterId, citation: authority.citation }).catch(() => undefined);
    return { revision, citation, reason, before: live.text, after: replacement, substantive: change.substantive };
  }

  /**
   * Phase 6 (L6): compare one revision with its rendered PDF. Every DOCX paragraph must appear
   * in the PDF (the filing set's own rule), and the PDF's lines that the DOCX does not hold are
   * reported, so the advocate sees what the rendering added or lost.
   */
  async compareRevisionToPdf(matterId: string, revisionId: string): Promise<{ ok: boolean; missing: string[]; extra: string[]; pdfPath: string }> {
    const docx = await this.matters.revisionBytes(matterId, revisionId);
    const revision = await this.matters.getRevision(matterId, revisionId);
    const dir = await mkdtemp(path.join(this.options.workingRoot, "cmp-"));
    try {
      const docxPath = path.join(dir, "revision.docx");
      const pdfPath = path.join(dir, "revision.pdf");
      await writeFile(docxPath, docx);
      await convertFile(this.options.x2t, { from: docxPath, to: pdfPath, format: FORMAT_PDF, tempDir: path.join(dir, "x2t") });
      const pages = await extractText(new Uint8Array(await readFile(pdfPath)));
      const pdfText = pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n");
      const paragraphs = readParagraphs(docx).map((p) => p.text);
      const forward = conversionCheck(paragraphs, pdfText);
      const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const docxWords = new Set(norm(paragraphs.join(" ")).split(/\s+/).filter(Boolean));
      const extra: string[] = [];
      for (const line of pdfText.split("\n")) {
        const n = norm(line);
        if (!n || /^\d+$/.test(n) || n.split(/\s+/).length < 4) continue;
        const known = n.split(/\s+/).every((word) => docxWords.has(word));
        if (!known) extra.push(line.trim().slice(0, 120));
      }
      return { ok: forward.ok, missing: forward.missing, extra: [...new Set(extra)].slice(0, 30), pdfPath };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
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
    // Phase 6 (P8): an open [CITE], [VERIFY] or [REVIEW] marker blocks finality the same way.
    const paragraphs = readParagraphs(await this.matters.revisionBytes(matterId, revisionId));
    const marked = paragraphs.filter((p) => p.text.includes(TO_COMPLETE));
    if (marked.length > 0) throw new MatterStoreError("DRAFT_INCOMPLETE", `${marked.length} paragraph(s) still say "${TO_COMPLETE}". Record the details and generate again, or complete them in the editor.`);
    const openMarkers = paragraphs.flatMap((p) => markersIn(p.text).filter((m) => m !== TO_COMPLETE).map((m) => ({ m, text: p.text.slice(0, 60) })));
    if (openMarkers.length > 0) {
      const first = openMarkers[0];
      throw new MatterStoreError("MARKERS_OPEN", `${openMarkers.length} open marker(s), the first is ${first.m} ("${first.text}…"). Insert the citation, verify the statement or review the passage, then remove the marker.`);
    }
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
   * revision. The result is a new revision by the advocate. A stale base is refused. An undo
   * may carry the advocate's reason; the second undo with the same reason in a matter proposes
   * a preference automatically (A7), and the proposal names the repeated correction.
   */
  async decideAgentChanges(
    matterId: string,
    draftId: string,
    baseRevisionId: string,
    decisions: Array<{ anchor: string; decision: ChangeDecision; reason?: string }>,
  ): Promise<RevisionRecord> {
    const docx = await this.matters.revisionBytes(matterId, baseRevisionId);
    const next = decideChanges(docx, decisions);
    const reasons = decisions.filter((d) => d.decision === "undo" && d.reason?.trim()).map((d) => d.reason!.trim());
    const revision = await this.matters.decideDraftRevision(matterId, draftId, next, baseRevisionId, {
      kept: decisions.filter((d) => d.decision === "keep").map((d) => d.anchor),
      undone: decisions.filter((d) => d.decision === "undo").map((d) => d.anchor),
      undoReasons: reasons,
    });
    // A7: the second identical correction proposes a preference. The event chain holds the first.
    if (reasons.length > 0 && this.options.onCorrectionRepeated) {
      const store = await this.matters.store(matterId);
      const decided = store.eventsWithAction("agent_change.decided");
      for (const reason of reasons) {
        const earlier = decided.find((e) => {
          const r = (e.data as { undoReasons?: unknown } | null)?.undoReasons;
          return Array.isArray(r) && (r as string[]).some((x) => normaliseReason(x) === normaliseReason(reason));
        });
        if (!earlier) continue;
        const pref = correctionPreference(reason);
        if (!pref) continue;
        await this.options
          .onCorrectionRepeated({
            key: pref.key,
            value: pref.value,
            reason: `the advocate made the same correction twice: "${reason.trim()}" (an earlier undo in this matter said the same, on ${earlier.at.slice(0, 10)})`,
            firstAt: earlier.at,
            secondAt: revision.createdAt,
          })
          .catch(() => undefined);
      }
    }
    return revision;
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

  /** The records one paragraph anchor links to: the events, the facts and the evidence statements. */
  async paragraphSource(matterId: string, draftId: string, anchor: string): Promise<ParagraphSource | null> {
    const link = await this.matters.getParagraphLink(matterId, draftId, anchor);
    if (!link) return null;
    const notebook = await this.matters.notebook(matterId);
    const store = await this.matters.store(matterId);
    const byId = new Map(notebook.events.map((e) => [e.id, e]));
    const events = link.eventIds
      .map((id) => byId.get(id))
      .filter((e): e is NotebookEvent => e !== undefined)
      .map(toParagraphSourceEvent);
    const facts = store.evidence
      .facts()
      .filter((f) => link.factIds.includes(f.id))
      .map((f) => ({ id: f.id, text: f.text, type: f.type, status: f.status, sourceName: f.sourceName, anchorId: f.anchorId, page: f.page, line: f.line }));
    const evidence = store.evidence
      .evidenceList()
      .filter((e) => link.evidenceIds.includes(e.id))
      .map((e) => ({ id: e.id, statement: e.statement, givenBy: e.givenBy, givenAt: e.givenAt, witness: e.witness, exhibitNumber: e.exhibitNumber, sourceName: e.sourceName }));
    return {
      draftId,
      anchor,
      text: link.text,
      eventIds: link.eventIds,
      events,
      factIds: link.factIds,
      facts,
      evidenceIds: link.evidenceIds,
      evidence,
    };
  }

  /**
   * The deterministic checks on the latest stored revision of one draft (step 5; workflow 9A, 9D;
   * phase 6: P1, P4, P6, P7, P8, P9). `lib/verification` computes; the matter store records that
   * the check ran. The draft is not changed. No model reads the draft here.
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
    const lines: Array<{ sourceName: string; page: number; line: number; text: string }> = [];
    const sources: Array<{ name: string; pages: number[] }> = [];
    const sourcesTotal = await this.matters.listSources(matterId);
    for (const s of sourcesTotal) {
      const pages = await this.matters.listPages(matterId, s.id);
      sources.push({ name: s.name, pages: pages.map((p) => p.page) });
      for (const p of pages) {
        for (const l of p.lines) {
          for (const n of caseNumbers(l.text)) recordCaseNumbers.add(n);
          lines.push({ sourceName: s.name, page: p.page, line: l.line, text: l.text });
        }
      }
    }
    const facts = store.evidence.facts();
    // P6: the open contradictions, recomputed from the records, kept only while their review item
    // is open. A contradiction is never resolved silently.
    const computedContradictions = detectContradictions(facts, notebook.events.map((e) => ({ id: e.id, dateStart: e.dateStart, description: e.description, sourceId: e.sourceId, page: e.page, line: e.line })));
    const openContradictionDetails = new Set(
      (await this.matters.listReviewItemsOf(matterId)).filter((r) => r.kind === "contradiction" && r.status === "open").map((r) => r.detail),
    );
    const detailOf = (c: (typeof computedContradictions)[number]) => `Contradiction of ${c.kind}: ${c.values.map((v) => `${v.value} (${v.text.slice(0, 120)})`).join(" / ")}`;
    const openContradictions = computedContradictions.filter((c) => openContradictionDetails.has(detailOf(c)));
    const result = checkDraft({
      paired: pairKind !== null,
      kind: draft.kind,
      facts: facts.map((f) => ({ id: f.id, text: f.text, type: f.type, status: f.status, sourceName: f.sourceName, page: f.page, line: f.line })),
      contradictions: openContradictions.map((c) => ({
        kind: c.kind,
        values: c.values.map((v) => ({ factId: v.factId, text: v.text, sourceName: sourcesTotal.find((s) => s.id === v.sourceId)?.name ?? null, page: v.page, line: v.line })),
      })),
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

    // ---- Phase 6 ----

    // P1: the grounding check. Every quote must match an anchored line, fact or statement; every
    // page and authority-paragraph reference must exist.
    const evidenceRows = store.evidence.evidenceList();
    const authorityRows = store.work.listAuthorities().filter((a) => a.status !== "rejected");
    const grounding = checkGrounding({
      paragraphs: draft.paragraphs,
      lines,
      sources,
      facts: facts.map((f) => ({ id: f.id, text: f.text, status: f.status })),
      evidence: evidenceRows.map((e) => ({ id: e.id, statement: e.statement })),
      authorities: (await this.options.authorityParagraphs?.(matterId)) ?? authorityRows.map((a) => ({ citation: a.citation, maxParagraph: null })),
    });
    for (const g of grounding.items) {
      result.defects.push({ kind: g.kind, paragraph: g.paragraph, anchor: g.anchor, text: g.found, evidence: g.evidence, action: g.action });
    }
    result.notRun.push(...grounding.notRun);

    // P4: the statute checks, against the law library, on the governing date.
    const impugnedEvent = details.impugnedEventId ? notebook.events.find((e) => e.id === details.impugnedEventId) : undefined;
    const statutes = checkStatutes({
      paragraphs: draft.paragraphs,
      governingDate: impugnedEvent?.dateStart ?? null,
      lookup: (act, section) => this.options.statuteLookup?.(act, section) ?? null,
    });
    for (const s of statutes.items) {
      result.defects.push({ kind: s.kind, paragraph: s.paragraph, anchor: s.anchor, text: s.found, evidence: s.evidence, action: s.action });
    }
    result.notRun.push(...statutes.notRun);

    // P7 and P8: the structure checks and the open markers, against the template's parts.
    const template = templateOf(draft.kind);
    const format = courtFormat(store.filingTarget()?.court ?? null);
    let requiredHeadings: string[] = [];
    if (template) {
      const input = await this.assembleInput(matterId, store);
      requiredHeadings = template.build(input)
        .filter((b) => b.style === "heading" && !b.text.includes(TO_COMPLETE))
        .map((b) => b.text.trim());
    }
    const docx = await this.matters.revisionBytes(matterId, draft.revision.id);
    const structure = checkStructure({
      paragraphs: draft.paragraphs,
      requiredHeadings,
      annexureLabels: store.work.listAnnexures().map((a) => a.label),
      recordedRelief: facts.filter((f) => f.status === "confirmed" && f.relief.trim() !== "").map((f) => f.relief.trim()),
      pageFormat: store.filingTarget() && COURT_FORMATS[store.filingTarget()!.court] ? { width: format.pageWidth, height: format.pageHeight } : null,
      docx,
    });
    for (const s of structure.items) {
      if (s.kind === "marker") {
        const kind = s.marker === "[CITE]" ? "marker_cite" : s.marker === "[VERIFY]" ? "marker_verify" : s.marker === "[REVIEW]" ? "marker_review" : null;
        if (!kind) continue; // the [TO BE COMPLETED marker is reported by the existing rule once
        result.defects.push({ kind, paragraph: s.paragraph, anchor: s.anchor, text: s.text, evidence: s.evidence, action: s.action });
        continue;
      }
      result.defects.push({ kind: s.kind, paragraph: s.paragraph, anchor: s.anchor, text: s.text, evidence: s.evidence, action: s.action });
    }
    result.notRun.push(...structure.notRun);

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
    const undecided = pendingChanges(docx).length;
    const legal = (await this.options.legalBlockers?.(matterId, draftId, draft.revision.id)) ?? [];
    const gate = gateState({ openItemKinds: openItemKinds.filter((k) => !k.startsWith("citation.")), notRun: result.notRun, undecidedChanges: undecided, legal });

    // P9: the reviewer note. Sources read, items for judgment by severity, the currency of every
    // rule and source used, and what to do before relying. Built from the one mapping.
    const readSources = sourcesTotal.length === 0 ? null : { read: sources.filter((s) => s.pages.length > 0).length, of: sourcesTotal.length };
    const currency: string[] = [];
    for (const s of statutes.items) currency.push(`Statute ${s.found}: ${s.evidence}`);
    currency.push(statutes.governingDateBasis);
    for (const p of store.studio.listProvisions().filter((x) => x.status !== "rejected").slice(0, 10)) {
      currency.push(`${p.act} ${p.section}: saved to the matter${p.repealed ? ", recorded as repealed" : ""} (source: ${p.sourceRef}).`);
    }
    if (template) currency.push(`Document format: ${format.source}.`);
    const reviewerNote = buildReviewerNote({ defects: result.defects, openItemKinds, sources: readSources, currency });

    await this.matters.appendEvent(matterId, { actor: "advocate" }, "draft.checked", draft.revision.id, {
      method: result.method,
      statements: result.statementsChecked,
      defects: result.defects.length,
      byKind,
      reviewItemsOpened: reviewItems.opened,
      gate: gate.state,
      grounding: grounding.checked > 0 ? `${grounding.grounded}/${grounding.checked}` : null,
    });
    // A7: the citation-format question, asked once, inside the first check that needs it.
    const hasCitation = draft.paragraphs.some((p) => /\b(19|20)\d\d\s+INSC\s+\d+/i.test(p.text) || reporterOnlyCitations(p.text).length > 0);
    const preferenceQuestions = hasCitation ? (this.options.preferenceQuestions?.(["citation_format"]) ?? []) : [];
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
      grounding: grounding.checked > 0 ? { score: grounding.score, checked: grounding.checked, grounded: grounding.grounded } : null,
      reviewerNote,
      preferenceQuestions,
    };
  }

  /** The live text of the latest revision of each draft of a kind, for the agent's `read_draft`. */
  async readDrafts(matterId: string, kind?: DraftKind): Promise<Array<{ draftId: string; kind: DraftKind; title: string; revision: RevisionRecord; paragraphs: Array<{ anchor: string | null; text: string; eventIds: string[]; factIds: string[]; evidenceIds: string[] }> }>> {
    const drafts = (await this.matters.listDrafts(matterId)).filter((d) => !kind || d.kind === kind);
    const out = [];
    for (const draft of drafts) {
      if (!draft.head) continue;
      const detail = await this.revisionDetail(matterId, draft.head.id);
      const links = new Map((await this.matters.listParagraphLinks(matterId, draft.id)).map((l) => [l.anchor, l]));
      out.push({
        draftId: draft.id,
        kind: draft.kind,
        title: draft.title,
        revision: draft.head,
        paragraphs: detail.paragraphs.map((p) => ({
          ...p,
          eventIds: p.anchor ? (links.get(p.anchor)?.eventIds ?? []) : [],
          factIds: p.anchor ? (links.get(p.anchor)?.factIds ?? []) : [],
          evidenceIds: p.anchor ? (links.get(p.anchor)?.evidenceIds ?? []) : [],
        })),
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
