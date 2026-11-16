/**
 * E3: Akoma Ntoso 3.0 (OASIS LegalDocML) for one instrument. The provision rows are the record;
 * this XML is their exchange form: it can be exported, kept, shared and read back. Each section
 * carries the id and URL of its source and the SHA-256 of its text, so a reader can check any
 * section against the source at the time of use. Plain library (decision 6).
 */
import { provisionParts, textHash, type ProvisionPart } from "./structure.ts";
import type { InstrumentKind, ProvisionKind, StatuteEvent } from "../../shared/law.ts";

export const AKN_NS = "http://docs.oasis-open.org/legaldocml/ns/akn/3.0";
export const OA_NS = "https://openadvocate.in/ns/provenance/1";

export interface AknAct {
  kind: InstrumentKind;
  title: string;
  number: string;
  year: string;
  jurisdiction: string;
  enacted: string | null;
  enforced: string | null;
  repealed: boolean;
  sourceUrl: string;
  sourceRef: string;
  retrievedAt: string;
}

export interface AknProvision {
  kind: ProvisionKind;
  number: string;
  heading: string;
  text: string;
  footnotes: string;
  textHash: string;
  sourceRef: string;
  sourceUrl: string;
  status?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/** "/akn/in/act/1872/9": the FRBR Work URI. A State's Act gets the State after "in-". */
export function workUri(act: Pick<AknAct, "kind" | "jurisdiction" | "year" | "number" | "title">): string {
  const place = /^central$/i.test(act.jurisdiction) || !act.jurisdiction ? "in" : `in-${slug(act.jurisdiction)}`;
  const doc = act.kind === "act" ? "act" : `act/${act.kind.replace(/_/g, "-")}`;
  return `/akn/${place}/${doc}/${act.year || "0000"}/${act.number ? slug(act.number) : slug(act.title)}`;
}

export function eId(kind: ProvisionKind, number: string): string {
  const prefix = kind === "section" ? "sec" : kind === "schedule" ? "sched" : kind === "article" ? "art" : kind === "preamble" ? "preamble" : kind;
  return `${prefix}_${number.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "") || "0"}`;
}

const HCONTAINER = new Set(["proviso", "explanation", "illustration", "exception"]);

function partsXml(parts: ProvisionPart[], base: string, pad: string): string {
  if (parts.length === 0) return `${pad}<content><p/></content>`;
  const simple = parts.every((p) => p.kind === "intro" || p.kind === "text");
  if (simple) return `${pad}<content>${parts.map((p) => `<p>${esc(p.text)}</p>`).join("")}</content>`;
  const out: string[] = [];
  const seen = new Map<string, number>();
  const id = (stem: string) => {
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    return n === 1 ? stem : `${stem}_${n}`;
  };
  let sub = "";
  for (const p of parts) {
    const num = p.num.replace(/[()]/g, "");
    if (p.kind === "intro" || p.kind === "text") out.push(`${pad}<intro><p>${esc(p.text)}</p></intro>`.replace(/intro>/g, p.kind === "intro" ? "intro>" : "wrapUp>"));
    else if (p.kind === "subsection") {
      sub = id(`${base}__subsec_${num}`);
      out.push(`${pad}<subsection eId="${sub}"><num>${esc(p.num)}</num><content><p>${esc(p.text)}</p></content></subsection>`);
    } else if (p.kind === "clause") out.push(`${pad}<paragraph eId="${id(`${sub || base}__para_${num}`)}"><num>${esc(p.num)}</num><content><p>${esc(p.text)}</p></content></paragraph>`);
    else if (p.kind === "subclause") out.push(`${pad}<subparagraph eId="${id(`${sub || base}__subpara_${num}`)}"><num>${esc(p.num)}</num><content><p>${esc(p.text)}</p></content></subparagraph>`);
    else if (HCONTAINER.has(p.kind)) out.push(`${pad}<hcontainer name="${p.kind}" eId="${id(`${sub || base}__${p.kind}`)}">${p.num ? `<num>${esc(p.num)}</num>` : ""}<content><p>${esc(p.text)}</p></content></hcontainer>`);
  }
  return out.join("\n");
}

/** The instrument as one Akoma Ntoso document. `generatedAt` is the manifestation date. */
export function toAkn(act: AknAct, provisions: AknProvision[], events: Array<Omit<StatuteEvent, "id">>, generatedAt: string): string {
  const work = workUri(act);
  const retrieved = act.retrievedAt.slice(0, 10);
  const expr = `${work}/eng@${retrieved}`;
  const lifecycle = [
    act.enacted ? `<eventRef eId="e_enactment" date="${act.enacted}" type="generation" source="#source"/>` : "",
    act.enforced ? `<eventRef eId="e_commencement" date="${act.enforced}" type="generation" source="#source" refersTo="#commencement"/>` : "",
    ...events.filter((e) => e.date).map((e, i) => `<eventRef eId="e_${i + 1}" date="${e.date}" type="${e.kind === "repeal" || e.kind === "omission" ? "repeal" : "amendment"}" source="#source"/>`),
  ].filter(Boolean);
  const notes = provisions.filter((p) => p.footnotes).map((p) => `<note eId="${eId(p.kind, p.number)}__note">${p.footnotes.split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</note>`);
  const body = provisions
    .filter((p) => p.kind !== "preamble")
    .map((p) => {
      const base = eId(p.kind, p.number);
      const tag = p.kind === "section" ? "section" : p.kind === "article" ? "article" : p.kind === "rule" ? "rule" : "hcontainer";
      const attrs = `${tag === "hcontainer" ? ` name="${p.kind}"` : ""} eId="${base}"${p.status && p.status !== "in_force" ? ` status="${p.status === "superseded" ? "edited" : "removed"}"` : ""}`;
      return `      <${tag}${attrs}>\n        <num>${esc(p.number)}</num>\n        <heading>${esc(p.heading)}</heading>\n${partsXml(provisionParts(p.text), base, "        ")}\n      </${tag}>`;
    });
  const prov = provisions.map((p) => `        <oa:provision eId="${eId(p.kind, p.number)}" sourceRef="${esc(p.sourceRef)}" sourceUrl="${esc(p.sourceUrl)}" sha256="${p.textHash}"><oa:text>${esc(p.text)}</oa:text></oa:provision>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<akomaNtoso xmlns="${AKN_NS}" xmlns:oa="${OA_NS}">
  <act name="${act.kind}" contains="singleVersion">
    <meta>
      <identification source="#openadvocate">
        <FRBRWork>
          <FRBRthis value="${work}/!main"/>
          <FRBRuri value="${work}"/>
          <FRBRdate date="${act.enacted ?? `${act.year || "0001"}-01-01`}" name="${act.enacted ? "enactment" : "year"}"/>
          <FRBRauthor href="#legislature"/>
          <FRBRcountry value="in"/>
          <FRBRnumber value="${esc(act.number)}"/>
          <FRBRname value="${esc(act.title)}"/>
        </FRBRWork>
        <FRBRExpression>
          <FRBRthis value="${expr}/!main"/>
          <FRBRuri value="${expr}"/>
          <FRBRdate date="${retrieved}" name="retrieval"/>
          <FRBRauthor href="#source"/>
          <FRBRlanguage language="eng"/>
        </FRBRExpression>
        <FRBRManifestation>
          <FRBRthis value="${expr}/!main.xml"/>
          <FRBRuri value="${expr}.xml"/>
          <FRBRdate date="${generatedAt.slice(0, 10)}" name="generation"/>
          <FRBRauthor href="#openadvocate"/>
          <FRBRformat value="application/akn+xml"/>
        </FRBRManifestation>
      </identification>
${lifecycle.length ? `      <lifecycle source="#source">\n        ${lifecycle.join("\n        ")}\n      </lifecycle>\n` : ""}      <references source="#openadvocate">
        <TLCOrganization eId="source" href="${esc(act.sourceUrl)}" showAs="${esc(act.sourceUrl ? new URL(act.sourceUrl).host : "advocate upload")}"/>
        <TLCOrganization eId="openadvocate" href="https://openadvocate.in" showAs="Open Advocate"/>
        <TLCOrganization eId="legislature" href="/ontology/organization/in/legislature" showAs="Legislature"/>
        <TLCConcept eId="commencement" href="/ontology/concept/commencement" showAs="Commencement"/>
      </references>
${notes.length ? `      <notes source="#source">\n        ${notes.join("\n        ")}\n      </notes>\n` : ""}      <proprietary source="#openadvocate">
        <oa:instrument sourceRef="${esc(act.sourceRef)}" retrievedAt="${esc(act.retrievedAt)}" repealed="${act.repealed}"/>
${prov.join("\n")}
      </proprietary>
    </meta>
    <preface>
      <longTitle><p>${esc(act.title)}</p></longTitle>
    </preface>
    <body>
${body.join("\n")}
    </body>
  </act>
</akomaNtoso>
`;
}

// ---- reading ----

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => unesc(new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? "");
const inner = (xml: string, tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? "";
const plain = (xml: string) =>
  unesc(
    xml
      .replace(/<\/(p|content|intro|wrapUp|subsection|paragraph|subparagraph|hcontainer|num)>/g, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

export interface ParsedAkn {
  act: { title: string; number: string; year: string; enacted: string | null; workUri: string; sourceRef: string; retrievedAt: string; kind: InstrumentKind };
  provisions: Array<{ kind: ProvisionKind; number: string; heading: string; text: string; eId: string; sourceRef: string; sourceUrl: string; sha256: string; hashMatches: boolean | null }>;
}

/**
 * Read an Akoma Ntoso act: ours, or another publisher's. A section's text is its blocks, one
 * per line. When the document carries our provenance, each section's hash is checked against
 * the text read, so a changed file is seen at once.
 */
export function parseAkn(xml: string): ParsedAkn {
  if (!/<akomaNtoso\b/.test(xml)) throw new Error("NOT_AKN: the file is not an Akoma Ntoso document");
  const work = inner(xml, "FRBRWork");
  const frbr = (block: string, tag: string, a: string) => attr(new RegExp(`<${tag}\\b[^>]*>`).exec(block)?.[0] ?? "", a);
  const date = frbr(work, "FRBRdate", "date");
  const uri = frbr(work, "FRBRuri", "value");
  const title = frbr(work, "FRBRname", "value") || plain(inner(xml, "longTitle")).join(" ");
  const kindName = attr(/<act\b[^>]*>/.exec(xml)?.[0] ?? "", "name");
  const kind = (["act", "rules", "regulation", "notification", "practice_direction"] as const).find((k) => k === kindName) ?? "act";
  const instrument = /<oa:instrument\b[^>]*>/.exec(xml)?.[0] ?? "";
  const prov = new Map<string, { sourceRef: string; sourceUrl: string; sha256: string; text: string }>();
  for (const m of xml.matchAll(/<oa:provision\b[^>]*>([\s\S]*?)<\/oa:provision>/g)) {
    const open = /<oa:provision\b[^>]*>/.exec(m[0])?.[0] ?? "";
    prov.set(attr(open, "eId"), { sourceRef: attr(open, "sourceRef"), sourceUrl: attr(open, "sourceUrl"), sha256: attr(open, "sha256"), text: unesc(inner(m[1], "oa:text")) });
  }
  const body = inner(xml, "body");
  const provisions: ParsedAkn["provisions"] = [];
  for (const m of body.matchAll(/<(section|article|rule|hcontainer)\b([^>]*)>([\s\S]*?)<\/\1>(?=\s*(?:<(?:section|article|rule|hcontainer|chapter|part)\b|<\/|$))/g)) {
    const tag = `<${m[1]}${m[2]}>`;
    const id = attr(tag, "eId");
    if (m[1] === "hcontainer" && !/^(sched|order|rule)/.test(id)) continue;
    const block = m[3];
    const number = plain(inner(block, "num")).join(" ");
    const heading = plain(inner(block, "heading")).join(" ");
    const rest = block.replace(/<num\b[^>]*>[\s\S]*?<\/num>/, "").replace(/<heading\b[^>]*>[\s\S]*?<\/heading>/, "");
    // A numbered child keeps its number on the same line as its text.
    const text = plain(rest.replace(/<num\b[^>]*>([\s\S]*?)<\/num>\s*<content>\s*<p>/g, "<content><p>$1 "))
      .join("\n");
    const p = prov.get(id);
    // Our own XML carries the canonical text; use it, so a structured rendering cannot change
    // the words the hash covers. Another publisher's XML has no such text: read the body.
    const canonical = p?.text || text;
    provisions.push({
      kind: m[1] === "section" ? "section" : m[1] === "article" ? "article" : m[1] === "rule" ? "rule" : id.startsWith("sched") ? "schedule" : id.startsWith("order") ? "order" : "rule",
      number,
      heading,
      text: canonical,
      eId: id,
      sourceRef: p?.sourceRef ?? "",
      sourceUrl: p?.sourceUrl ?? "",
      sha256: p?.sha256 ?? "",
      hashMatches: p?.sha256 ? textHash(canonical) === p.sha256 : null,
    });
  }
  return {
    act: {
      title,
      number: frbr(work, "FRBRnumber", "value") || uri.split("/").pop() || "",
      year: (/\/(\d{4})\//.exec(`${uri}/`)?.[1] ?? date.slice(0, 4)) || "",
      enacted: /^\d{4}-\d{2}-\d{2}$/.test(date) && frbr(work, "FRBRdate", "name") === "enactment" ? date : null,
      workUri: uri,
      sourceRef: attr(instrument, "sourceRef"),
      retrievedAt: attr(instrument, "retrievedAt"),
      kind,
    },
    provisions,
  };
}
