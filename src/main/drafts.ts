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
import { checkDraft } from "../lib/verification/index.ts";
import type { DraftCheck } from "../shared/records.ts";
import {
  eventSentence,
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
}

const KINDS: Record<DraftKind, { title: string; generate: typeof generateListOfDates }> = {
  list_of_dates: { title: "LIST OF DATES", generate: generateListOfDates },
  synopsis: { title: "SYNOPSIS", generate: generateSynopsis },
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
    const notebook = await this.matters.notebook(matterId);
    const confirmed = notebook.events.filter((e) => e.status === "confirmed" && !e.excluded);
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
    const meta = KINDS[kind];
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

  /** Human-only approval of one revision (decision 5). */
  async approveRevision(matterId: string, revisionId: string) {
    return this.matters.approveRevision(matterId, revisionId);
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
    const pairKind: DraftKind = draft.kind === "list_of_dates" ? "synopsis" : "list_of_dates";
    const pair = all.find((d) => d.kind === pairKind);
    const notebook = await this.matters.notebook(matterId);
    const result = checkDraft({
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
    const byKind: Record<string, number> = {};
    for (const d of result.defects) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    await this.matters.appendEvent(matterId, { actor: "advocate" }, "draft.checked", draft.revision.id, {
      method: result.method,
      statements: result.statementsChecked,
      defects: result.defects.length,
      byKind,
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
