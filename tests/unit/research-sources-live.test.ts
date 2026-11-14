/**
 * V4-1 against the real services. Runs only with OPENADVO_LIVE_NET=1 (it reaches AWS Open Data,
 * India Code and the web search page).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { highCourtCodes, supremeCourtYear } from "../../src/lib/research-sources/aws.ts";
import { readStatute, searchStatutes } from "../../src/lib/research-sources/indiacode.ts";
import { webSearch } from "../../src/lib/research-sources/web.ts";

const live = process.env.OPENADVO_LIVE_NET === "1";

test("live: AWS Supreme Court 2023 metadata and the High Court list", { skip: !live }, async () => {
  const rows = await supremeCourtYear(2023);
  assert.ok(rows.length > 500);
  assert.ok(rows.some((r) => r.insc === "2023 INSC 1043"));
  assert.ok((await highCourtCodes(2023)).length > 10);
});

test("live: India Code finds section 483 of the BNSS with its text", { skip: !live }, async () => {
  const r = await searchStatutes("section 483 Bharatiya Nagarik Suraksha Sanhita", 5);
  const hit = r.hits.find((h) => h.kind === "SECTION" && h.section === "483");
  assert.ok(hit);
  const s = await readStatute(hit!.id);
  assert.match(s.text, /bail/i);
});

test("live: web search returns results", { skip: !live }, async () => {
  assert.ok((await webSearch("2023 INSC 1043", 3)).length > 0);
});
