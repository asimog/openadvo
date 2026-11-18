/**
 * RAG-1: import the first wave from India Code into the law store, and re-read a provision at
 * the time of use. The section-based Acts use the India Code section items. The Constitution and
 * the repealed codes use the Act PDF's text layer, with page and line anchors; the PDF and the
 * extracted text are hashed in the source manifest. The TEXT bundle is an index of sections for
 * the repealed codes, not the body, so it is not used as the text.
 *
 * Plain library (decision 6). The caller supplies the LawStore. This module writes only through
 * the store's own methods.
 */
import { createHash } from "node:crypto";
import type { LawStore } from "../law-store/index.ts";
import { instrumentId } from "../law-store/index.ts";
import type { Provision } from "../../shared/law.ts";
import { FIRST_WAVE, firstWaveInstrument, type FirstWaveInstrument } from "../statutes/first-wave.ts";
import { fetchAct, fetchActText, readProvisionSource, type FetchedAct, type FetchedActText, type FetchedProvision } from "../statutes/indiacode.ts";
import { fetchIndianKanoonAct, readIndianKanoonSection, type IndianKanoonAct } from "../statutes/indiankanoon.ts";
import { parseActText, parseStatutePages, type ActTextOptions, type ParsedActProvision, type PdfPage } from "../statutes/act-text.ts";
import { processPdf } from "../document-intelligence/index.ts";
import { toAkn } from "../statutes/akn.ts";

export type ImportStage = "fetch" | "parse" | "store" | "done";

export interface ImportProgress {
  itemUuid: string;
  title: string;
  stage: ImportStage;
  /** The provisions read or stored so far. */
  done: number;
  total: number;
}

export interface ImportedAct {
  itemUuid: string;
  title: string;
  actId: string;
  provisions: number;
  added: number;
  changed: number;
  unchanged: number;
  textBased: boolean;
  /** True when the official source was incomplete and Indian Kanoon supplied the section text. */
  fallback: boolean;
}

export interface ImportResult {
  acts: ImportedAct[];
  provisions: number;
  /** The static set hash after the import. */
  setHash: string;
}

/** The source functions, injectable so the import can be tested without the network or PDF. */
export interface LawSource {
  fetchAct(uuid: string, onPage: (done: number, total: number) => void): Promise<{ act: FetchedAct; provisions: FetchedProvision[] }>;
  fetchActText(uuid: string): Promise<FetchedActText>;
  processPdf(bytes: Uint8Array): Promise<PdfPage[]>;
  fetchIndianKanoonAct(url: string): Promise<{ html: string; act: IndianKanoonAct }>;
}

const defaultSource: LawSource = {
  fetchAct,
  fetchActText,
  processPdf: (bytes) => processPdf(bytes),
  fetchIndianKanoonAct,
};

const system = { actor: "system" as const };

function minimumProvisions(item: FirstWaveInstrument): number {
  return item.minimumProvisions ?? (item.kind === "constitution" ? 300 : 50);
}

function textHashOf(pages: PdfPage[]): string {
  return createHash("sha256")
    .update(pages.map((page) => page.lines.map((line) => line.text).join("\n")).join("\n"))
    .digest("hex");
}

function textMarkers(item: FirstWaveInstrument): ActTextOptions {
  if (item.kind === "constitution") {
    return { start: /^WE, THE PEOPLE OF INDIA/i, stop: /^(?:THE\s+)?(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH)\s+SCHEDULE\b/i };
  }
  if (item.short === "CrPC") return { start: /^An Act to\b/i, stop: /^(?:THE\s+)?FIRST\s+SCHEDULE\b/i };
  if (item.short === "Evidence Act") return { start: /^\s*1\.\s+Short title[. ]*[—–-]{1,2}/i, stop: /^(?:THE\s+)?SCHEDULE\b/i };
  return {};
}

function parseForItem(item: FirstWaveInstrument, text: FetchedActText, pages: PdfPage[] | null): ParsedActProvision[] {
  const kind = item.kind === "constitution" ? "article" : "section";
  if (item.reader === "text" && pages === null) {
    const markers = textMarkers(item);
    const parsed = parseActText(text.text, kind, markers);
    return parsed.length > 0 || !markers.start ? parsed : parseActText(text.text, kind);
  }
  if (item.kind === "constitution") return parseStatutePages(pages ?? [], kind, { start: /^\s*1\.\s+Name and territory of the Union[. ]*[—–-]{1,2}/ });
  return parseStatutePages(pages ?? [], kind);
}

function actFor(item: FirstWaveInstrument, text: FetchedActText): FetchedAct {
  return {
    sourceRef: item.itemUuid,
    sourceUrl: text.sourceUrl,
    title: item.title,
    actId: item.itemUuid,
    number: item.number,
    year: item.year,
    jurisdiction: "CENTRAL",
    enacted: null,
    enforced: null,
    enforcedText: "",
    repealed: item.repealed,
  };
}

function provisionsFor(item: FirstWaveInstrument, text: FetchedActText, parsed: ParsedActProvision[]): FetchedProvision[] {
  return parsed.map((row) => ({
    kind: row.kind,
    number: row.number,
    heading: row.heading,
    text: row.text,
    footnotes: row.footnotes,
    textHash: "",
    order: row.order,
    under: row.under,
    sourceRef: item.itemUuid,
    sourceUrl: text.sourceUrl,
    page: row.page,
    line: row.line,
    gone: row.gone,
    events: [],
  }));
}

function textActInput(item: FirstWaveInstrument, text: FetchedActText, parsed: ParsedActProvision[]): { act: FetchedAct; provisions: FetchedProvision[] } {
  if (parsed.length < minimumProvisions(item)) {
    throw new Error(`PARSE_INCOMPLETE: ${item.title}: the source gave ${parsed.length} provisions; the body was not found.`);
  }
  return { act: actFor(item, text), provisions: provisionsFor(item, text, parsed) };
}

/**
 * Import one instrument. A section-based Act is read from the section items; a text-based Act is
 * read from the Act PDF's text layer. The source file hashes are stored for text-based Acts.
 */
export async function importInstrument(law: LawStore, item: FirstWaveInstrument, onProgress: (progress: ImportProgress) => void = () => undefined, source: LawSource = defaultSource): Promise<ImportedAct> {
  let act: FetchedAct | null = null;
  let provisions: FetchedProvision[] = [];
  let usedFallback = false;
  if (item.source === "indiacode-sections") {
    onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "fetch", done: 0, total: 0 });
    const fetched = await source.fetchAct(item.itemUuid, (done, total) => onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "fetch", done, total }));
    act = fetched.act;
    provisions = fetched.provisions;
    if (!act.title) act = { ...act, title: item.title };
    if (!act.number) act = { ...act, number: item.number };
    if (!act.year) act = { ...act, year: item.year };
  } else {
    onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "fetch", done: 0, total: 0 });
    const text = await source.fetchActText(item.itemUuid);
    let pages: PdfPage[] | null = null;
    let textUrl = text.textUrl;
    let textSha = createHash("sha256").update(text.text).digest("hex");
    let note = "India Code TEXT extract; the PDF is the source of record.";
    if (item.reader !== "text") {
      if (text.pdfBytes.length === 0) throw new Error(`NO_PDF: ${item.title}`);
      pages = await source.processPdf(text.pdfBytes);
      textUrl = text.pdfUrl;
      textSha = textHashOf(pages);
      note = "PDF text layer, with page and line anchors. The PDF is the source of record.";
    }
    law.putSourceFile({
      actId: instrumentId("indiacode", item.itemUuid),
      itemUuid: item.itemUuid,
      pdfUrl: text.pdfUrl,
      pdfSha256: text.pdfSha256,
      textUrl,
      textSha256: textSha,
      retrievedAt: text.retrievedAt,
      note,
    });
    const parsed = parseForItem(item, text, pages);
    if (parsed.length < minimumProvisions(item) && item.fallbackUrl) {
      onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "fetch", done: parsed.length, total: minimumProvisions(item) });
      const fallback = await source.fetchIndianKanoonAct(item.fallbackUrl);
      if (fallback.act.sections.length >= minimumProvisions(item)) {
        act = actFor(item, text);
        provisions = fallback.act.sections;
        usedFallback = true;
        law.putSourceFile({
          actId: instrumentId("indiacode", item.itemUuid),
          itemUuid: item.fallbackUrl,
          pdfUrl: "",
          pdfSha256: "",
          textUrl: item.fallbackUrl,
          textSha256: createHash("sha256").update(fallback.html).digest("hex"),
          retrievedAt: new Date().toISOString(),
          note: "Secondary source: Indian Kanoon. The official India Code PDF is recorded but its OCR was incomplete. The rows are never verified until the advocate checks them against the PDF.",
        });
      }
    }
    if (!usedFallback) {
      const built = textActInput(item, text, parsed);
      act = built.act;
      provisions = built.provisions;
    }
    onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "parse", done: provisions.length, total: provisions.length });
  }
  if (!act) throw new Error(`NO_ACT: ${item.title}`);
  onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "store", done: 0, total: provisions.length });
  const put = law.putInstrument({ kind: "act", ...act, source: "indiacode", provisions, ...(usedFallback ? { checkState: "never" as const, replace: true } : {}) }, system);
  onProgress({ itemUuid: item.itemUuid, title: item.title, stage: "done", done: provisions.length, total: provisions.length });
  return {
    itemUuid: item.itemUuid,
    title: put.act.title,
    actId: put.act.id,
    provisions: put.act.provisions,
    added: put.added,
    changed: put.changed,
    unchanged: put.unchanged,
    textBased: item.source === "indiacode-text",
    fallback: usedFallback,
  };
}

/** Import the fixed owner list. The caller decides when this runs and where the store lives. */
export async function importFirstWave(law: LawStore, onProgress: (progress: ImportProgress) => void = () => undefined, source: LawSource = defaultSource): Promise<ImportResult> {
  const acts: ImportedAct[] = [];
  for (const item of FIRST_WAVE) acts.push(await importInstrument(law, item, onProgress, source));
  law.rebuild();
  const manifest = law.manifest();
  return { acts, provisions: manifest.provisions, setHash: manifest.setHash };
}

/**
 * Re-read one provision from its source for verification at the time of use. A section-based
 * Act re-reads its section item. A text-based Act re-reads the PDF and parses the same provision.
 */
export async function readProvisionForCheck(law: LawStore, provision: Provision, source: LawSource = defaultSource): Promise<{ text: string; heading?: string; footnotes?: string }> {
  if (provision.sourceRef.startsWith("ik:")) return readIndianKanoonSection(provision.sourceRef);
  const files = law.sourceFiles(provision.actId);
  if (files.length === 0) return readProvisionSource(provision);
  const item = firstWaveInstrument(files[0].itemUuid);
  const text = await source.fetchActText(files[0].itemUuid);
  const useText = item?.reader === "text" || files[0].pdfUrl !== files[0].textUrl;
  const pages = useText ? null : await source.processPdf(text.pdfBytes);
  const parsed = item ? parseForItem(item, text, pages) : parseStatutePages(pages ?? [], provision.kind === "article" ? "article" : "section");
  const wanted = provision.number.toUpperCase();
  const match = parsed.find((row) => row.number.toUpperCase() === wanted && (!row.under || !provision.under || row.under === provision.under));
  if (!match) throw new Error(`NOT_FOUND: the source no longer holds ${provision.kind} ${provision.number} of ${provision.actTitle}`);
  return { text: match.text, heading: match.heading, footnotes: match.footnotes };
}

/** Export one Act as Akoma Ntoso 3.0. It is an exchange form, not the store. */
export function exportActAkn(law: LawStore, actId: string): string {
  const act = law.act(actId);
  if (!act) throw new Error(`NOT_FOUND: ${actId}`);
  return toAkn(act, law.provisions(actId), law.events(actId), new Date().toISOString());
}
