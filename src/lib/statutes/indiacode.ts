/**
 * E3: one Act from India Code (indiacode.gov.in), through its DSpace REST API. An Act is one
 * item; each section, schedule and rule is another item that carries the Act's `act_id`. One
 * search by `act_id` lists them all. A single item is read again at the time of use, so the
 * stored text can be checked against the source (decision 16). Plain library (decision 6).
 */
import { getJson } from "../research-sources/http.ts";
import { INDIA_CODE } from "../research-sources/indiacode.ts";
import { footnoteEvents, goneMarker, normaliseText, sourceDate, textHash } from "./structure.ts";
import type { ProvisionKind, StatuteEvent } from "../../shared/law.ts";

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

const KIND: Record<string, ProvisionKind> = { SECTION: "section", SCHEDULE: "schedule", RULE: "rule", ORDER: "order", ARTICLE: "article" };

/** One provision of an Act, or null for an item that is not a provision (the Act itself). */
export function provisionOf(actRef: string, item: IndiaCodeItem): FetchedProvision | null {
  const md = item.metadata;
  const kind = KIND[one(md, "dc.identifier.collection")];
  if (!kind) return null;
  const heading = (one(md, "dc.title") || item.name || "").trim();
  const html = one(md, "dc.identifier.section_page_note");
  const footnotes = one(md, "dc.identifier.section_footnote");
  const number = one(md, "dc.identifier.section_number") || (kind === "schedule" ? heading.replace(/\.$/, "") : "");
  const text = html
    ? normaliseLines(html)
    : "";
  return {
    kind,
    number,
    heading,
    text,
    footnotes: footnotes ? normaliseLines(footnotes) : "",
    textHash: textHash(text),
    order: Number(one(md, "dc.identifier.order_number")) || 0,
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
