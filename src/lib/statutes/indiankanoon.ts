/**
 * RAG-1 fallback: Indian Kanoon's Act page is Akoma Ntoso-style HTML. It is a secondary source,
 * not the official Gazette. It is used only when the official India Code PDF is incomplete, and
 * its rows stay "never" verified until the advocate checks them against the PDF.
 *
 * The section page ("/doc/<id>/") carries the same section words. It is read again at the time
 * of use, so a secondary row can be checked against the source it came from.
 */
import { getText, htmlToText } from "../research-sources/http.ts";
import type { FetchedProvision } from "./indiacode.ts";

export interface IndianKanoonAct {
  title: string;
  sourceUrl: string;
  sections: FetchedProvision[];
}

const SECTION_START = /(?=<section class="akn-section" id="section_)/;

function chapterOf(html: string): string {
  const text = htmlToText(html).replace(/\s+/g, " ").trim();
  const match = /^Chapter\s+([IVXLCDM]+[AB]?|\d+)/i.exec(text);
  return match ? `CHAPTER ${match[1].toUpperCase()}` : "";
}

function sectionText(html: string): string {
  const withoutTables = html
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const lines = htmlToText(withoutTables)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "IndiaCode" && line !== "{|" && line !== "|-" && line !== "|}");
  return lines.join("\n").trim();
}

/**
 * Parse one Indian Kanoon Act page. It never invents a section: only `akn-section` blocks count.
 * A section page has no document link in its heading, so the caller passes its own doc id.
 */
export function parseIndianKanoonAct(html: string, fallbackDocId?: string): IndianKanoonAct {
  const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = titleMatch ? htmlToText(titleMatch[1]).replace(/\s+/g, " ").trim() : "Indian Kanoon Act";
  const sections: FetchedProvision[] = [];
  let chapter = "";
  for (const part of html.split(SECTION_START)) {
    const chapterMatch = /<section class="akn-chapter"><h2>([\s\S]*?)<\/h2>/i.exec(part);
    if (chapterMatch) chapter = chapterOf(chapterMatch[1]);
    const id = /^<section class="akn-section" id="section_([0-9]{1,4}[A-Z]?)"/.exec(part);
    if (!id) continue;
    const h3 = /<h3>([\s\S]*?)<\/h3>/i.exec(part);
    if (!h3) continue;
    const doc = /href="\/doc\/(\d+)\/"/.exec(h3[1]);
    const docId = doc?.[1] ?? fallbackDocId;
    if (!docId) continue;
    const heading = htmlToText(h3[1])
      .replace(/^\s*[0-9]{1,4}[A-Z]?\.\s*/, "")
      .replace(/\s+/g, " ")
      .replace(/\.$/, "")
      .trim();
    const bodyStart = part.indexOf(h3[0]) + h3[0].length;
    const bodyEnd = ["</article>", "<aside", "<footer"]
      .map((marker) => part.indexOf(marker, bodyStart))
      .filter((index) => index > bodyStart)
      .sort((a, b) => a - b)[0];
    const body = part.slice(bodyStart, bodyEnd);
    const text = sectionText(body);
    if (!text) continue;
    sections.push({
      kind: "section",
      number: id[1],
      heading,
      text,
      footnotes: "",
      textHash: "",
      order: sections.length + 1,
      under: chapter,
      sourceRef: `ik:${docId}`,
      sourceUrl: `https://indiankanoon.org/doc/${docId}/`,
      page: null,
      line: null,
      gone: /^\s*\[\s*(repealed|omitted)/i.test(text) ? (/^\s*\[\s*repealed/i.test(text) ? "repealed" : "omitted") : null,
      events: [],
    });
  }
  return { title, sourceUrl: "https://indiankanoon.org/", sections };
}

export async function fetchIndianKanoonAct(url: string): Promise<{ html: string; act: IndianKanoonAct }> {
  const html = await getText(url, { timeoutMs: 90_000 });
  return { html, act: parseIndianKanoonAct(html) };
}

/** Re-read one section from its Indian Kanoon page, for verification of a secondary row. */
export async function readIndianKanoonSection(sourceRef: string): Promise<{ text: string; heading?: string }> {
  const id = sourceRef.replace(/^ik:/, "");
  if (!/^\d+$/.test(id)) throw new Error(`BAD_ID: not an Indian Kanoon document id: ${sourceRef}`);
  const html = await getText(`https://indiankanoon.org/doc/${id}/`, { timeoutMs: 60_000 });
  const act = parseIndianKanoonAct(html, id);
  const section = act.sections.find((row) => row.sourceRef === sourceRef) ?? act.sections[0];
  if (!section) throw new Error(`NOT_FOUND: Indian Kanoon gives no section for ${sourceRef}`);
  return { text: section.text, heading: section.heading };
}
