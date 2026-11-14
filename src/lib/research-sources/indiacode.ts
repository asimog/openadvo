/**
 * V4-1: India Code (indiacode.gov.in), through its DSpace REST API. Plain library.
 * India Code gives the current text. The version in force on a governing date is not computed;
 * the advocate confirms which version applies (ruling R-4).
 */
import { getJson, htmlToText } from "./http.ts";

export const INDIA_CODE = "https://indiacode.gov.in";

export interface StatuteHit {
  /** The DSpace item id. */
  id: string;
  /** "SECTION", "RULE", "ORDER", "REGULATION", "NOTIFICATION", or "ACT" when the item is an Act. */
  kind: string;
  title: string;
  act: string;
  actNumber: string;
  actYear: string;
  section: string;
  state: string;
  repealed: boolean;
  url: string;
}

export interface StatuteText extends StatuteHit {
  text: string;
  nextSection: string;
}

type Md = Record<string, Array<{ value: string }>>;

const one = (md: Md, k: string) => (md[k]?.[0]?.value ?? "").trim();

export function itemToHit(item: { uuid: string; name?: string; handle?: string; metadata: Md }): StatuteHit {
  const md = item.metadata;
  const kind = one(md, "dc.identifier.collection") || "ACT";
  const repealedFlag = one(md, "dc.identifier.repealed") || one(md, "dc.identifier.act_repealed");
  const title = one(md, "dc.title") || item.name || "";
  return {
    id: item.uuid,
    kind,
    title,
    act: one(md, "dc.identifier.act_name") || (kind === "ACT" ? title : ""),
    actNumber: one(md, "dc.identifier.act_number"),
    actYear: one(md, "dc.date.act_year"),
    section: one(md, "dc.identifier.section_number"),
    state: one(md, "dc.identifier.state_name"),
    repealed: repealedFlag === "true" || /\(Rep\.|repealed/i.test(title),
    url: item.handle ? `${INDIA_CODE}/handle/${item.handle}` : `${INDIA_CODE}/items/${item.uuid}`,
  };
}

interface SearchResponse {
  _embedded?: { searchResult?: { page?: { totalElements?: number }; _embedded?: { objects?: Array<{ _embedded?: { indexableObject?: { uuid: string; name?: string; handle?: string; metadata: Md } } }> } } };
}

export async function searchStatutes(query: string, limit = 10): Promise<{ total: number; hits: StatuteHit[] }> {
  const url = `${INDIA_CODE}/server/api/discover/search/objects?query=${encodeURIComponent(query)}&dsoType=ITEM&size=${Math.min(limit, 40)}`;
  const j = await getJson<SearchResponse>(url, { timeoutMs: 45_000 });
  const r = j._embedded?.searchResult;
  const hits = (r?._embedded?.objects ?? []).map((o) => o._embedded?.indexableObject).filter((x): x is NonNullable<typeof x> => !!x).map(itemToHit);
  return { total: r?.page?.totalElements ?? hits.length, hits };
}

export async function readStatute(id: string): Promise<StatuteText> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`BAD_ID: not an India Code item id: ${id}`);
  const item = await getJson<{ uuid: string; name?: string; handle?: string; metadata: Md }>(`${INDIA_CODE}/server/api/core/items/${id}`, { timeoutMs: 45_000 });
  const hit = itemToHit(item);
  return {
    ...hit,
    text: htmlToText(one(item.metadata, "dc.identifier.section_page_note")) || "India Code gives no text for this item. Open it on India Code.",
    nextSection: one(item.metadata, "dc.identifier.next_section"),
  };
}
