/**
 * E3: one Act from India Code (indiacode.gov.in), through its DSpace REST API. An Act is one
 * item; each section, schedule and rule is another item that carries the Act's `act_id`. One
 * search by `act_id` lists them all. A single item is read again at the time of use, so the
 * stored text can be checked against the source (decision 16). Plain library (decision 6).
 */
import { createHash } from "node:crypto";
import { getBytes, getJson } from "../research-sources/http.ts";
import { INDIA_CODE } from "../research-sources/indiacode.ts";
import { footnoteEvents, goneMarker, normaliseText, sourceDate, textHash } from "./structure.ts";
import type { Provision, ProvisionKind, StatuteEvent } from "../../shared/law.ts";

type Md = Record<string, Array<{ value: string }>>;
export interface IndiaCodeItem {
  uuid: string;
  name?: string;
  handle?: string;
  metadata: Md;
}

const one = (md: Md, k: string) => (md[k]?.[0]?.value ?? "").trim();

export interface FetchedAct {
  sourceRef: string;
  sourceUrl: string;
  title: string;
  actId: string;
  number: string;
  year: string;
  jurisdiction: string;
  enacted: string | null;
  enforced: string | null;
  enforcedText: string;
  repealed: boolean;
}

export interface FetchedProvision {
  kind: ProvisionKind;
  number: string;
  heading: string;
  /** The text as plain lines, one per block of the source. */
  text: string;
  footnotes: string;
  textHash: string;
  order: number;
  /** The printed page and line, when the source gives them (the text extracts do). */
  page?: number | null;
  line?: number | null;
  /** The part, chapter or order the source prints above the provision; "" when none. */
  under?: string;
  /** A stable source key for a rule whose number repeats under different orders. */
  sourceKey?: string;
  sourceRef: string;
  sourceUrl: string;
  gone: "repealed" | "omitted" | null;
  events: Array<Omit<StatuteEvent, "id">>;
}

const itemUrl = (it: IndiaCodeItem) => (it.handle ? `${INDIA_CODE}/handle/${it.handle}` : `${INDIA_CODE}/items/${it.uuid}`);

export function actOf(item: IndiaCodeItem): FetchedAct {
  const md = item.metadata;
  if (one(md, "dc.identifier.collection") !== "ACT") throw new Error(`NOT_AN_ACT: India Code item ${item.uuid} is a ${one(md, "dc.identifier.collection") || "record"}, not an Act`);
  const enforcedText = one(md, "dc.date.enforcement_date");
  return {
    sourceRef: item.uuid,
    sourceUrl: itemUrl(item),
    title: one(md, "dc.title") || item.name || "",
    actId: one(md, "dc.identifier.act_id"),
    number: one(md, "dc.identifier.act_number"),
    year: one(md, "dc.date.act_year"),
    jurisdiction: one(md, "dc.identifier.state_name") || "CENTRAL",
    enacted: sourceDate(one(md, "dc.date.enact_date")),
    enforced: sourceDate(enforcedText),
    enforcedText,
    repealed: one(md, "dc.identifier.repealed") === "true",
  };
}

const KIND: Record<string, ProvisionKind> = {
  SECTION: "section",
  SCHEDULE: "schedule",
  RULE: "rule",
  ORDER: "order",
  ARTICLE: "article",
  SCHORDRULE: "rule",
  SCHEDULEORDER: "order",
};

/** One provision of an Act, or null for an item that is not a provision (the Act itself). */
export function provisionOf(actRef: string, item: IndiaCodeItem): FetchedProvision | null {
  const md = item.metadata;
  const collection = one(md, "dc.identifier.collection");
  const kind = KIND[collection];
  if (!kind) return null;
  const title = (one(md, "dc.title") || item.name || "").trim();
  const ruleNumber = /^Rule\s*([0-9]+[A-Z]?)[.\s:]/i.exec(title)?.[1] ?? "";
  const orderNumber = /^ORDER\s+([IVXLCDM]+|\d+)\s*[:\-.]/i.exec(title)?.[1] ?? "";
  const number =
    one(md, "dc.identifier.section_number") ||
    (collection === "SCHORDRULE" ? ruleNumber : collection === "SCHEDULEORDER" ? orderNumber : kind === "schedule" ? title.replace(/\.$/, "") : "");
  const heading =
    collection === "SCHORDRULE"
      ? title.replace(/^Rule\s*[0-9]+[A-Z]?[.\s:]*/i, "").replace(/\.$/, "").trim()
      : collection === "SCHEDULEORDER"
        ? title.replace(/^ORDER\s+[IVXLCDM0-9]+\s*[:\-.]?\s*/i, "").replace(/\.$/, "").trim()
        : title;
  const html = one(md, "dc.identifier.section_page_note") || one(md, "dc.identifier.schordrule_description") || one(md, "dc.identifier.schedule_order_description");
  const footnotes = one(md, "dc.identifier.section_footnote") || one(md, "dc.identifier.schedule_order_description");
  // An order item may be a heading only. The heading is the exact source text; the rules below
  // it carry the operative words.
  const text = html ? normaliseLines(html) : collection === "SCHEDULEORDER" ? heading : "";
  return {
    kind,
    number,
    heading,
    text,
    footnotes: footnotes ? normaliseLines(footnotes) : "",
    textHash: textHash(text),
    order: Number(one(md, "dc.identifier.order_number")) || 0,
    // India Code does not give a rule its display Order. The item keeps two same-numbered rules
    // apart; the order stays "unmapped" rather than invented.
    under: "",
    sourceKey: collection === "SCHORDRULE" ? item.uuid : "",
    sourceRef: item.uuid,
    sourceUrl: itemUrl(item),
    gone: goneMarker(heading, text),
    events: footnotes ? footnoteEvents(actRef, number, footnotes) : [],
  };
}

function normaliseLines(html: string): string {
  // One block of the source per line; the same reading every time, so hashes compare.
  return html
    .split(/<br\s*\/?>/i)
    .map((b) => normaliseText(b))
    .filter(Boolean)
    .join("\n");
}

interface SearchPage {
  _embedded?: { searchResult?: { page?: { totalElements?: number; totalPages?: number }; _embedded?: { objects?: Array<{ _embedded?: { indexableObject?: IndiaCodeItem } }> } } };
}

export async function fetchItem(uuid: string): Promise<IndiaCodeItem> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error(`BAD_ID: not an India Code item id: ${uuid}`);
  return getJson<IndiaCodeItem>(`${INDIA_CODE}/server/api/core/items/${uuid}`, { timeoutMs: 45_000 });
}

/** The Act and every provision India Code lists under it. `onPage` reports progress. */
export async function fetchAct(uuid: string, onPage: (done: number, total: number) => void = () => undefined): Promise<{ act: FetchedAct; provisions: FetchedProvision[] }> {
  const act = actOf(await fetchItem(uuid));
  if (!act.actId) throw new Error(`NO_ACT_ID: India Code gives no act id for ${act.title}`);
  const provisions: FetchedProvision[] = [];
  const size = 100;
  for (let page = 0, pages = 1; page < pages; page++) {
    const url = `${INDIA_CODE}/server/api/discover/search/objects?query=${encodeURIComponent(`dc.identifier.act_id:"${act.actId}"`)}&dsoType=ITEM&size=${size}&page=${page}`;
    const j = await getJson<SearchPage>(url, { timeoutMs: 90_000 });
    const r = j._embedded?.searchResult;
    pages = Math.min(r?.page?.totalPages ?? 1, 60);
    for (const o of r?._embedded?.objects ?? []) {
      const it = o._embedded?.indexableObject;
      const p = it ? provisionOf(act.sourceRef, it) : null;
      if (p) provisions.push(p);
    }
    onPage(provisions.length, r?.page?.totalElements ?? provisions.length);
  }
  provisions.sort((a, b) => a.order - b.order || a.number.localeCompare(b.number, "en", { numeric: true }));
  return { act, provisions };
}

export interface FetchedActText {
  itemUuid: string;
  title: string;
  handle: string;
  sourceUrl: string;
  pdfUrl: string;
  pdfSha256: string;
  /** The PDF bytes, kept for the page/line reader. */
  pdfBytes: Uint8Array;
  textUrl: string;
  textSha256: string;
  text: string;
  retrievedAt: string;
}

interface BundlePage {
  _embedded?: {
    bundles?: Array<{
      name?: string;
      _embedded?: { bitstreams?: { _embedded?: { bitstreams?: Array<{ name?: string; _links?: { content?: { href?: string } } }> } } };
    }>;
  };
}

/**
 * Read the PDF and TEXT bundles of an Act item (the Constitution and the repealed codes). The
 * text is the searchable extract; the PDF is the source of record. Both SHA-256 values go into
 * the source manifest.
 */
export async function fetchActText(itemUuid: string): Promise<FetchedActText> {
  const item = await getJson<IndiaCodeItem>(`${INDIA_CODE}/server/api/core/items/${itemUuid}`, { timeoutMs: 45_000 });
  const bundles = await getJson<BundlePage>(`${INDIA_CODE}/server/api/core/items/${itemUuid}/bundles?embed=bitstreams`, { timeoutMs: 45_000 });
  const streams: Array<{ bundle: string; name: string; url: string }> = [];
  for (const bundle of bundles._embedded?.bundles ?? []) {
    for (const stream of bundle._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
      const url = stream._links?.content?.href ?? "";
      if (url) streams.push({ bundle: String(bundle.name ?? ""), name: String(stream.name ?? ""), url });
    }
  }
  const pdf = streams.find((stream) => stream.bundle === "ORIGINAL" && /\.pdf$/i.test(stream.name));
  const textStreams = streams.filter((stream) => stream.bundle === "TEXT");
  const text = textStreams.find((stream) => /\.pdf\.txt$/i.test(stream.name)) ?? textStreams[0];
  if (!text) throw new Error(`NO_TEXT: India Code gives no text extract for ${itemUuid}`);
  const [pdfBytes, textBytes] = await Promise.all([pdf ? getBytes(pdf.url, { timeoutMs: 120_000 }) : Promise.resolve(null), getBytes(text.url, { timeoutMs: 120_000 })]);
  const title = (item.metadata["dc.title"]?.[0]?.value || item.name || "").trim();
  return {
    itemUuid,
    title,
    handle: String(item.handle ?? ""),
    sourceUrl: itemUrl(item),
    pdfUrl: pdf?.url ?? "",
    pdfSha256: pdfBytes ? createHash("sha256").update(pdfBytes).digest("hex") : "",
    pdfBytes: pdfBytes ?? new Uint8Array(),
    textUrl: text.url,
    textSha256: createHash("sha256").update(textBytes).digest("hex"),
    text: new TextDecoder("utf-8", { fatal: false }).decode(textBytes),
    retrievedAt: new Date().toISOString(),
  };
}

/** Re-read one section item from India Code, for verification at the time of use. */
export async function readProvisionSource(p: Provision): Promise<{ text: string; heading?: string; footnotes?: string }> {
  const item = await fetchItem(p.sourceRef);
  const parsed = provisionOf(p.actId, item);
  if (!parsed) throw new Error(`NOT_A_PROVISION: India Code item ${p.sourceRef} is not a provision`);
  return { text: parsed.text, heading: parsed.heading, footnotes: parsed.footnotes };
}

/** Find central Acts by title, for the "add an Act" form. */
export async function findActs(title: string, limit = 10): Promise<FetchedAct[]> {
  const q = `dc.identifier.collection:ACT AND dc.title:"${title.replace(/["\\]/g, " ").trim()}"`;
  const url = `${INDIA_CODE}/server/api/discover/search/objects?query=${encodeURIComponent(q)}&dsoType=ITEM&size=${Math.min(limit, 40)}`;
  const j = await getJson<SearchPage>(url, { timeoutMs: 45_000 });
  return (j._embedded?.searchResult?._embedded?.objects ?? [])
    .map((o) => o._embedded?.indexableObject)
    .filter((x): x is IndiaCodeItem => !!x)
    .map((it) => actOf(it));
}
