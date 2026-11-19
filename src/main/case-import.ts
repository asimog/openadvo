/**
 * A case number to sources. The advocate gives a case number (and a court, when known); this
 * finds the court's judgment or order PDFs on the public web, downloads them into the matter,
 * lets the ingest queue read them, and then rebuilds the Notebook. Official court hosts win over
 * other sources. It never signs in, never solves a CAPTCHA and never invents a document.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getBytes } from "../lib/research-sources/http.ts";
import { isPublicHttpUrl, webFetch } from "../lib/research-sources/web.ts";
import { DIRECTORY } from "../lib/court-directory/index.ts";
import type { Matters } from "./matters.ts";
import type { Ingest } from "./ingest.ts";
import type { ResearchHub } from "./studio.ts";

export interface CaseDocumentRequest {
  case_number: string;
  court?: string;
  year?: string;
  urls?: string[];
}

export interface CaseImportResult {
  imported: Array<{ name: string; url: string; pages: number }>;
  candidates: string[];
  events: number;
  note: string;
}

function official(url: string, courtWebsite?: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (courtWebsite) {
      const courtHost = new URL(courtWebsite).hostname.toLowerCase();
      if (host === courtHost || host.endsWith(`.${courtHost}`)) return true;
    }
    return host === "ecourts.gov.in" || host.endsWith(".gov.in") || host.endsWith(".nic.in") || host === "sci.gov.in";
  } catch {
    return false;
  }
}

function pdfName(url: string, caseNumber: string, n: number): string {
  let base = "";
  try {
    base = decodeURIComponent(path.basename(new URL(url).pathname));
  } catch {
    base = "";
  }
  base = base.replace(/[^\w.\- ]+/g, "_").replace(/\.pdf$/i, "").slice(0, 90);
  return `${caseNumber.replace(/[^\w.\- ]+/g, "_").slice(0, 40)} ${n + 1}${base ? ` ${base}` : ""}.pdf`;
}

/** The PDF links of one page, resolved against its address. */
function links(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1];
    if (!/\.pdf(?:[?#]|$)/i.test(href)) continue;
    try {
      out.add(new URL(href, base).toString());
    } catch {
      // A malformed link is not a source.
    }
  }
  return [...out];
}

export async function importCaseDocuments(
  deps: { matters: Matters; ingest: Ingest; hub: ResearchHub },
  matterId: string,
  input: CaseDocumentRequest,
): Promise<CaseImportResult> {
  const caseNumber = input.case_number.trim();
  if (!caseNumber) throw new Error("CASE_NUMBER_REQUIRED: give the case number as the court writes it");
  const court = (input.court ?? "").trim();
  const courtRow = court
    ? DIRECTORY.find((c) => c.id === court || c.name.toLowerCase() === court.toLowerCase()) ??
      DIRECTORY.find((c) => c.name.toLowerCase().includes(court.toLowerCase()) || c.id.includes(court.toLowerCase()))
    : undefined;
  const website = courtRow?.website;
  const queries = [
    input.urls?.length ? "" : `${caseNumber} ${court || courtRow?.name || ""} judgment order pdf`.trim(),
    input.urls?.length ? "" : `site:ecourts.gov.in ${caseNumber} ${input.year ?? ""}`.trim(),
    input.urls?.length ? "" : website ? `site:${new URL(website).hostname} ${caseNumber}` : "",
    input.urls?.length ? "" : `site:indiankanoon.org ${caseNumber}`,
  ].filter(Boolean);

  const candidates = new Set<string>(input.urls ?? []);
  const notes: string[] = [];
  for (const query of queries) {
    try {
      const r = await deps.hub.search(matterId, "web", query, { limit: 8 }, { actor: "agent" });
      for (const hit of r.hits) if (hit.url) candidates.add(hit.url);
    } catch (e) {
      notes.push(`Search "${query}" failed: ${(e as Error).message}`);
    }
  }
  const pages = [...candidates].filter((u) => isPublicHttpUrl(u)).sort((a, b) => Number(official(b, website)) - Number(official(a, website)));
  const pdfs = new Set<string>();
  for (const page of pages.slice(0, 8)) {
    if (/\.pdf(?:[?#]|$)/i.test(page)) {
      pdfs.add(page);
      continue;
    }
    try {
      const fetched = await webFetch(page);
      if ("bytes" in fetched) {
        pdfs.add(page);
        continue;
      }
      for (const link of links(fetched.text, page)) pdfs.add(link);
    } catch (e) {
      notes.push(`Could not read ${page}: ${(e as Error).message}`);
    }
  }
  const ordered = [...pdfs].sort((a, b) => Number(official(b, website)) - Number(official(a, website))).slice(0, 6);
  if (ordered.length === 0) {
    return {
      imported: [],
      candidates: pages.slice(0, 12),
      events: 0,
      note: `No public PDF was found for ${caseNumber}${court ? ` in ${court}` : ""}. Open the court page in the browser and hand it to the advocate if a sign-in or CAPTCHA is needed.${notes.length ? ` ${notes.slice(0, 3).join(" ")}` : ""}`,
    };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "openadvo-case-"));
  const imported: CaseImportResult["imported"] = [];
  try {
    for (const [n, url] of ordered.entries()) {
      try {
        const bytes = await getBytes(url, { timeoutMs: 90_000 });
        if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
          notes.push(`${url} is not a PDF.`);
          continue;
        }
        const file = path.join(dir, pdfName(url, caseNumber, n));
        await writeFile(file, bytes);
        const added = await deps.matters.addFiles(matterId, [file], { actor: "agent" }, `court download: ${url}`);
        for (const a of added) if (a.source) imported.push({ name: a.source.name, url, pages: 0 });
      } catch (e) {
        notes.push(`Could not download ${url}: ${(e as Error).message}`);
      }
    }
    if (imported.length) {
      deps.ingest.enqueue(matterId);
      await deps.ingest.idle();
    }
    const rebuilt = await deps.matters.rebuildNotebook(matterId);
    const pagesNow = await deps.matters.notebookStatus(matterId);
    for (const row of imported) row.pages = pagesNow.find((s) => s.name === row.name)?.pages ?? 0;
    return {
      imported,
      candidates: pages.slice(0, 12),
      events: rebuilt.added,
      note: imported.length
        ? `${imported.length} document(s) downloaded from ${ordered.filter((u) => official(u, website)).length ? "official court hosts first" : "the web"}, read, and extracted. ${rebuilt.added} event(s) added to the Notebook.${notes.length ? ` ${notes.slice(0, 3).join(" ")}` : ""}`
        : `The PDFs were found but none could be downloaded.${notes.length ? ` ${notes.slice(0, 3).join(" ")}` : ""}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
