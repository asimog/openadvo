/** V4-1: the research sources, against fixtures (no network). Spec: docs/specs/v4.md. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parquetWriteBuffer } from "hyparquet-writer";
import { setFetcher, htmlToText, type Fetcher } from "../../src/lib/research-sources/http.ts";
import { hcRowToMeta, highCourtCodes, isoDate, parseListing, supremeCourtYear } from "../../src/lib/research-sources/aws.ts";
import { Corpus, ftsQuery } from "../../src/lib/research-sources/corpus.ts";
import { itemToHit, readStatute, searchStatutes } from "../../src/lib/research-sources/indiacode.ts";
import { isPublicHttpUrl, parseDuckDuckGo, webFetch } from "../../src/lib/research-sources/web.ts";

/** A fetcher that serves fixtures by URL substring and honours byte ranges. */
export function fixtureFetcher(fixtures: Array<{ match: string; body: Uint8Array | string; type?: string }>): Fetcher {
  return async (url, init) => {
    const f = fixtures.find((x) => url.includes(x.match));
    if (!f) return new Response("missing", { status: 404 });
    const bytes = typeof f.body === "string" ? Buffer.from(f.body) : Buffer.from(f.body);
    const range = init?.headers?.range ? /bytes=(\d+)-(\d+)?/.exec(init.headers.range) : null;
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) + 1 : bytes.length;
      return new Response(bytes.subarray(start, end), { status: 206, headers: { "content-range": `bytes ${start}-${end - 1}/${bytes.length}` } });
    }
    return new Response(bytes, { headers: { "content-type": f.type ?? "text/plain" } });
  };
}

export function scParquet(): Uint8Array {
  return new Uint8Array(
    parquetWriteBuffer({
      columnData: [
        { name: "title", data: ["ELDECO HOUSING AND INDUSTRIES LIMITED versus ASHOK VIDYARTHI AND OTHERS", "RAM LAL versus STATE OF RAJASTHAN & ORS."], type: "STRING" },
        { name: "petitioner", data: ["ELDECO HOUSING AND INDUSTRIES LIMITED", "RAM LAL"], type: "STRING" },
        { name: "respondent", data: ["ASHOK VIDYARTHI AND OTHERS", "STATE OF RAJASTHAN & ORS."], type: "STRING" },
        { name: "judge", data: ["VIKRAM NATH", "J.K. MAHESHWARI"], type: "STRING" },
        { name: "citation", data: ["[2023] 16 S.C.R. 872", "[2023] 15 S.C.R. 808"], type: "STRING" },
        { name: "case_id", data: ["2023 INSC 1043", "2023 INSC 1047"], type: "STRING" },
        { name: "cnr", data: ["ESCR010008242023", "ESCR010007902023"], type: "STRING" },
        { name: "decision_date", data: ["30-11-2023", "04-12-2023"], type: "STRING" },
        { name: "disposal_nature", data: ["Appeal(s) allowed", "Appeal(s) allowed"], type: "STRING" },
        { name: "path", data: ["2023_16_872_887", "2023_15_808_820"], type: "STRING" },
        { name: "nc_display", data: ["2023INSC1043", "2023INSC1047"], type: "STRING" },
      ],
    }),
  );
}

let restore: Fetcher | null = null;
after(() => {
  if (restore) setFetcher(restore);
});

test("AWS: the Supreme Court year is read by range requests into judgment metadata", async () => {
  restore = setFetcher(fixtureFetcher([{ match: "metadata/parquet/year=2023/metadata.parquet", body: scParquet() }]));
  const rows = await supremeCourtYear(2023);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { id: rows[0].id, insc: rows[0].insc, date: rows[0].decisionDate, url: rows[0].pdfUrl },
    { id: "sc:2023_16_872_887", insc: "2023 INSC 1043", date: "2023-11-30", url: "https://indian-supreme-court-judgments.s3.amazonaws.com/data/pdf/year=2023/english/2023_16_872_887_EN.pdf" },
  );
});

test("AWS: listings, High Court rows and dates", async () => {
  const xml = "<ListBucketResult><CommonPrefixes><Prefix>metadata/parquet/year=2023/court=10_8/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>metadata/parquet/year=2023/court=1_12/</Prefix></CommonPrefixes><Contents><Key>a/b.parquet</Key></Contents></ListBucketResult>";
  assert.deepEqual(parseListing(xml), { prefixes: ["metadata/parquet/year=2023/court=10_8/", "metadata/parquet/year=2023/court=1_12/"], keys: ["a/b.parquet"] });
  setFetcher(fixtureFetcher([{ match: "list-type=2", body: xml }]));
  assert.deepEqual(await highCourtCodes(2023), ["10_8", "1_12"]);
  const hc = hcRowToMeta({ title: "CR. MISC./68032/2022 of MAMTA DEVI Vs The State of Bihar", cnr: "BRHC010973712022", decision_date: new Date("2023-02-27T00:00:00Z"), pdf_link: "court/cnrorders/patnahcucisdb94/orders/BRHC010973712022_1_2023-02-27.pdf", court: "Patna High Court", judge: "Judge : X" }, 2023, "10_8", "patnahcucisdb94");
  assert.equal(hc?.id, "hc:BRHC010973712022_1_2023-02-27");
  assert.equal(hc?.petitioner, "MAMTA DEVI");
  assert.equal(hc?.respondent, "The State of Bihar");
  assert.equal(hc?.decisionDate, "2023-02-27");
  assert.equal(hc?.judge, "X");
  assert.match(hc!.pdfUrl, /data\/pdf\/year=2023\/court=10_8\/bench=patnahcucisdb94\/BRHC010973712022_1_2023-02-27\.pdf$/);
  assert.equal(isoDate("4-1-2020"), "2020-01-04");
});

test("the corpus: full-text search by parties, citation and CNR; a part is replaced, not doubled", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "oa-corpus-"));
  setFetcher(fixtureFetcher([{ match: "metadata.parquet", body: scParquet() }]));
  const c = new Corpus(folder);
  try {
    const rows = await supremeCourtYear(2023);
    c.putPart({ source: "sc", year: 2023, court: "sc", courtName: "Supreme Court of India" }, rows);
    c.putPart({ source: "sc", year: 2023, court: "sc", courtName: "Supreme Court of India" }, rows);
    assert.equal(c.parts()[0].rows, 2);
    assert.equal(c.search("ram lal rajasthan")[0].title, "RAM LAL versus STATE OF RAJASTHAN & ORS.");
    assert.equal(c.search("2023 INSC 1043")[0].id, "sc:2023_16_872_887");
    assert.equal(c.search("ESCR010007902023")[0].insc, "2023 INSC 1047");
    assert.equal(c.search("eldeco", { from: 2024 }).length, 0);
    assert.equal(c.byInsc("2023  insc 1043")?.petitioner, "ELDECO HOUSING AND INDUSTRIES LIMITED");
    assert.equal(ftsQuery('u/s 439 "CrPC"'), '"439"* "crpc"*', "one-letter words and punctuation are dropped");
    c.putFile("sc:2023_16_872_887", new Uint8Array([1, 2, 3]), [{ page: 1, kind: "born_digital", lines: [{ line: 1, text: "x" }] }]);
    assert.equal(c.cachedText("sc:2023_16_872_887")?.pages[0].lines[0].text, "x");
  } finally {
    c.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("India Code: search hits and a section's text with the repealed flag", async () => {
  const item = {
    uuid: "d7d4a61a-75dd-45ff-867e-e7da3affdd8e",
    handle: "123456789/514257",
    metadata: {
      "dc.identifier.collection": [{ value: "SECTION" }],
      "dc.title": [{ value: "Special powers of High Court or Court of Session regarding bail." }],
      "dc.identifier.act_name": [{ value: "The Bharatiya Nagarik Suraksha Sanhita, 2023" }],
      "dc.identifier.section_number": [{ value: "483" }],
      "dc.identifier.repealed": [{ value: "false" }],
      "dc.identifier.state_name": [{ value: "CENTRAL" }],
      "dc.identifier.section_page_note": [{ value: "<span></span>(1) A High Court or Court of Session may direct,&mdash;<br/>(a) that any person &amp; so on." }],
    },
  };
  setFetcher(
    fixtureFetcher([
      { match: "/discover/search/objects", body: JSON.stringify({ _embedded: { searchResult: { page: { totalElements: 14 }, _embedded: { objects: [{ _embedded: { indexableObject: item } }] } } } }) },
      { match: "/core/items/", body: JSON.stringify(item) },
    ]),
  );
  const r = await searchStatutes("section 483 BNSS");
  assert.equal(r.total, 14);
  assert.deepEqual([r.hits[0].kind, r.hits[0].section, r.hits[0].repealed, r.hits[0].url], ["SECTION", "483", false, "https://indiacode.gov.in/handle/123456789/514257"]);
  const s = await readStatute(item.uuid);
  assert.equal(s.text, "(1) A High Court or Court of Session may direct,—\n(a) that any person & so on.");
  await assert.rejects(() => readStatute("../../etc"), /BAD_ID/);
  assert.equal(itemToHit({ uuid: "x", name: "The IPC (Amendment) Act, 1942 (Rep., Act 02 of 1948)", metadata: {} }).repealed, true);
});

test("web: results are parsed and redirect links resolved; only public addresses are fetched", async () => {
  const html = `<div class="result results_links results_links_deep web-result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Findiankanoon.org%2Fdoc%2F29552837%2F&amp;rut=x">Eldeco Housing <b>vs</b> Ashok</a></h2><a class="result__snippet" href="x">2023 INSC 1043 REPORTABLE</a></div>`;
  assert.deepEqual(parseDuckDuckGo(html), [{ title: "Eldeco Housing vs Ashok", url: "https://indiankanoon.org/doc/29552837/", snippet: "2023 INSC 1043 REPORTABLE" }]);
  for (const bad of ["http://localhost:3000/", "http://127.0.0.1/", "http://192.168.0.5/", "file:///c:/x", "http://10.1.2.3/", "javascript:alert(1)"]) assert.equal(isPublicHttpUrl(bad), false, bad);
  assert.equal(isPublicHttpUrl("https://www.sci.gov.in/"), true);
  await assert.rejects(() => webFetch("http://localhost/"), /SOURCE_REFUSED/);
  setFetcher(fixtureFetcher([{ match: "example.org", body: "<html><head><title>T</title><script>evil()</script></head><body><p>Hello&nbsp;world</p><p>Line two</p></body></html>", type: "text/html" }]));
  const p = await webFetch("https://example.org/page");
  assert.ok("text" in p && p.title === "T" && p.text.includes("Hello world\nLine two"));
  assert.ok("text" in p && !p.text.includes("evil"));
  assert.equal(htmlToText("<p>a &amp; b</p><p>c</p>"), "a & b\nc");
});
