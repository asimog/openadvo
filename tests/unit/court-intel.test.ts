/**
 * Phase 2: the adapter framework in the main process, with real stores in a temporary folder, a
 * fixture adapter, a PDF made by pdf-lib and a fake fetcher (docs/specs/court-adapters.md section 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CourtIntel } from "../../src/main/court-intel.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import { IntelStore } from "../../src/lib/intel-store/index.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { setFetcher } from "../../src/lib/research-sources/http.ts";

async function pdf(pages: string[][], opts: { outline?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (const lines of pages) {
    const page = doc.addPage([595.28, 841.89]);
    lines.forEach((t, i) => page.drawText(t, { x: 50, y: 790 - i * 18, size: 11, font }));
  }
  if (opts.outline) doc.catalog.set(doc.context.obj("Outlines"), doc.context.obj({}));
  return doc.save();
}

const RULES = [
  ["THE TEST COURT RULES, 2020", "ORDER IV", "APPEALS", "1. A certified copy of the decree shall be filed.", "ORDER V", "PETITIONS"],
  ["1. Every petition shall be supported by an affidavit of the petitioner.", "2. The petitioner shall file three spare copies of the petition.", "3. The index shall be paginated continuously.", "ORDER VI", "MISCELLANEOUS"],
];

const ADAPTER = {
  id: "test-court",
  version: "1.0.0",
  title: "Test court",
  courts: ["in.sc"],
  author: "test",
  hosts: ["court.example"],
  general: { website: "https://court.example/" },
  sources: [
    { key: "rules", title: "Test Court Rules, 2020", kind: "rules", owner: "Test court", checkDays: 30, reliability: "official", locate: { index: "https://court.example/rules", linkText: "Test Court Rules, 2020" }, url: "https://court.example/fallback.pdf" },
    { key: "other", title: "Another document", kind: "rules", owner: "Test court", checkDays: 30, reliability: "official", url: "https://court.example/other.pdf" },
  ],
  lists: [
    {
      key: "filing.petition",
      kind: "checklist",
      title: "Filing a petition",
      needs: { caseTypes: ["PET"], practice: ["civil"] },
      source: "rules",
      scope: { start: "ORDER V", end: "ORDER VI" },
      items: [
        { text: "An affidavit supports the petition.", quote: "Every petition shall be supported by an affidavit of the petitioner", ref: "Order V rule 1" },
        { text: "Three spare copies.", quote: "The petitioner shall file three spare copies of the petition", ref: "Order V rule 2" },
        { text: "A certified copy of the decree.", quote: "A certified copy of the decree shall be filed", ref: "Order IV rule 1" },
      ],
    },
    { key: "rules.order_v", kind: "rules", title: "Order V", needs: { caseTypes: ["PET"] }, source: "rules", extract: { start: "PETITIONS", end: "ORDER VI" } },
    { key: "other.list", kind: "list", title: "Other", needs: { practice: ["criminal"] }, source: "other", items: [{ text: "x", quote: "x y z" }] },
  ],
  formatChecks: [
    { key: "size", title: "At most 1 MB", check: "pdf_max_mb", value: 1, source: "rules" },
    { key: "bookmarks", title: "Bookmarks", check: "pdf_bookmarks", source: "rules" },
  ],
  defects: [{ key: "pagination", title: "Pagination", match: ["paginat"], step: "Paginate the index continuously." }],
  proceedings: [{ key: "pet", title: "Petition", court: "in.sc", caseType: "PET", provisions: ["Rule 1"], requiredParts: ["Petition"], checklist: "filing.petition", stages: ["Filed"], intakeQuestions: [], skills: [] }],
};

async function fixture(adapter: Record<string, unknown> = ADAPTER) {
  const root = mkdtempSync(path.join(tmpdir(), "oa-intel-"));
  const builtIn = path.join(root, "adapters");
  mkdirSync(path.join(builtIn, String(adapter.id)), { recursive: true });
  writeFileSync(path.join(builtIn, String(adapter.id), "adapter.json"), JSON.stringify(adapter));
  const advocate = AdvocateStore.open(root);
  const intel = IntelStore.open(root);
  const store = await MatterStore.create(path.join(root, "matters"), "Intel v. Test", { actor: "advocate" });
  const rules = await pdf(RULES);
  const setFile = path.join(root, "set.pdf");
  writeFileSync(setFile, await pdf([["A filing set page with searchable text."]]));
  const fetched: string[] = [];
  const prev = setFetcher(async (url) => {
    fetched.push(url);
    if (url === "https://court.example/rules") return new Response('<p>Rules</p><a href="/docs/r2020.pdf">Test Court Rules, 2020</a>', { status: 200, headers: { "content-type": "text/html" } });
    if (url === "https://court.example/docs/r2020.pdf") return new Response(rules, { status: 200, headers: { "content-type": "application/pdf" } });
    return new Response("not here", { status: 404 });
  });
  const ci = new CourtIntel({
    intel,
    advocate,
    store: async () => store,
    filingFiles: async () => [{ name: "set.pdf", path: setFile }],
    dirs: { builtIn, vendored: path.join(root, "vendored"), advocate: path.join(root, "own") },
    docsDir: path.join(root, "docs"),
  });
  return { root, ci, intel, advocate, store, fetched, rules, close: () => { setFetcher(prev); intel.close(); advocate.close(); store.close(); } };
}

test("the profile decides what is shown; nothing is downloaded until a list is needed", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.ci.overview(), []);
    f.ci.setProfile({ courts: ["in.sc"], practice: ["civil"] });
    assert.throws(() => f.ci.setProfile({ courts: ["in.nowhere"] }), /BAD_COURT/);
    const [o] = f.ci.overview();
    assert.equal(o.adapter?.id, "test-court");
    assert.deepEqual(o.lists.map((l) => [l.key, l.recommended, l.built]), [["filing.petition", true, null], ["rules.order_v", true, null], ["other.list", false, null]]);
    assert.deepEqual(o.route.map((r) => r.id), ["in.sc"]);
    assert.deepEqual(f.fetched, []);
  } finally {
    f.close();
  }
});

test("building one list fetches only its document, anchors each quote, and keeps the scope; the cache avoids a second download", async () => {
  const f = await fixture();
  try {
    const list = await f.ci.buildList("test-court", "filing.petition");
    assert.deepEqual(f.fetched, ["https://court.example/rules", "https://court.example/docs/r2020.pdf"]);
    assert.deepEqual(list.items.map((i) => [i.n, i.status, i.page]), [[1, "verified", 2], [2, "verified", 2], [3, "not_found", null]]);
    assert.equal(list.freshness?.state, "fresh");
    assert.equal(list.adapterVersion, "1.0.0");
    const src = f.intel.currentSource("test-court:rules")!;
    assert.equal(src.sourceUrl, "https://court.example/docs/r2020.pdf");
    assert.equal(src.accessMethod, "official_feed");
    const rules = await f.ci.buildList("test-court", "rules.order_v");
    assert.deepEqual(rules.items.map((i) => i.ref), ["rule 1", "rule 2", "rule 3"]);
    assert.equal(f.fetched.length, 2, "the fresh document was not downloaded again");
    assert.equal(f.intel.proceedings("in.sc")[0].key, "pet");
    assert.ok(f.intel.verifyChain().ok);
  } finally {
    f.close();
  }
});

test("a link on another host is refused, and a failed download builds nothing; the advocate can upload the document", async () => {
  const f = await fixture({ ...ADAPTER, sources: [{ ...ADAPTER.sources[0], locate: undefined, url: "https://court.example/missing.pdf" }, ADAPTER.sources[1]] });
  try {
    await assert.rejects(f.ci.buildList("test-court", "filing.petition"), /SOURCE_HTTP/);
    assert.equal(f.intel.currentList("test-court", "filing.petition"), null);
    const file = path.join(f.root, "rules.pdf");
    writeFileSync(file, f.rules);
    assert.deepEqual(await f.ci.uploadSource("test-court", "rules", file), { sourceKey: "rules", pages: 2 });
    assert.equal(f.intel.currentSource("test-court:rules")!.accessMethod, "manual_upload");
    const list = await f.ci.buildList("test-court", "filing.petition");
    assert.equal(list.items[0].status, "verified");
  } finally {
    f.close();
  }
  const g = await fixture({ ...ADAPTER, sources: [{ ...ADAPTER.sources[0], locate: undefined, url: "https://court.example/x.pdf" }, ADAPTER.sources[1]] });
  try {
    setFetcher(async () => new Response('<a href="https://evil.example/r.pdf">Test Court Rules, 2020</a>', { status: 200 }));
    const evil = { ...ADAPTER, id: "evil-link", sources: [ADAPTER.sources[0], ADAPTER.sources[1]] };
    mkdirSync(path.join(g.root, "own", "evil-link"), { recursive: true });
    writeFileSync(path.join(g.root, "own", "evil-link", "adapter.json"), JSON.stringify(evil));
    g.ci.adapters(true);
    await assert.rejects(g.ci.buildList("evil-link", "filing.petition"), /HOST_REFUSED: https:\/\/evil.example/);
  } finally {
    g.close();
  }
});

test("modify and upgrade: Edit a copy runs as the next version; a list built by the older one says so; the advocate corrects an item", async () => {
  const f = await fixture();
  try {
    await f.ci.buildList("test-court", "filing.petition");
    const fork = f.ci.forkAdapter("test-court");
    assert.deepEqual([fork.tier, fork.version, fork.shadowed], ["advocate", "1.0.1", false]);
    assert.equal(f.ci.adapters().find((a) => a.tier === "built-in")!.shadowed, true);
    assert.equal(f.ci.readList("test-court", "filing.petition")!.upgrade, "1.0.1");
    const rebuilt = await f.ci.buildList("test-court", "filing.petition");
    assert.deepEqual([rebuilt.version, rebuilt.adapterVersion, rebuilt.upgrade], [2, "1.0.1", null]);
    const fixed = f.ci.editList(rebuilt.id, { n: 3, text: "A certified copy of the order is filed.", source: "Registry notice of 1 March 2026", ref: "notice" });
    assert.deepEqual([fixed.version, fixed.items[2].status, fixed.items[2].enteredSource], [3, "advocate_entered", "Registry notice of 1 March 2026"]);
    assert.equal(f.intel.listHistory("test-court", "filing.petition").length, 3);
    assert.throws(() => f.intel.editList(fixed.id, { n: 1, text: "x", source: "y" }, { actor: "agent" }), /HUMAN_ONLY/);
    // Vendored in: an adapter file added by the advocate is checked first.
    const bad = path.join(f.root, "bad.json");
    writeFileSync(bad, JSON.stringify({ id: "bad" }));
    assert.throws(() => f.ci.addAdapter(bad), /BAD_ADAPTER/);
  } finally {
    f.close();
  }
});

test("a matter: its court and case type build what it needs; ticks, compliance rows, format checks, defects and the wrong-jurisdiction guard", async () => {
  const f = await fixture();
  try {
    assert.match((await f.ci.forumRefusal("m", ["in.sc"]))!, /has no court yet/);
    const c = await f.ci.setTarget("m", "in.sc", "PET");
    assert.equal(c.reason, null);
    assert.deepEqual(c.rows.map((r) => r.state), ["open", "open", "open"]);
    assert.equal(f.intel.currentList("test-court", "rules.order_v")?.items.length, 3, "the rules list of the case type was built too");
    assert.equal(f.intel.currentList("test-court", "other.list"), null, "a list of another case type was not built");
    await f.ci.setCheck("m", c.rows[0].listId, c.rows[0].item.id, "done", "");
    await assert.rejects(f.ci.setCheck("m", c.rows[1].listId, c.rows[1].item.id, "not_applicable", ""), /NOTE_NEEDED/);
    await f.ci.setCheck("m", c.rows[1].listId, c.rows[1].item.id, "not_applicable", "filed through e-filing");
    const rows = await f.ci.compliance("m");
    assert.deepEqual(rows.map((r) => [r.rule, r.outcome]), [["C-filing.petition-1", "pass"], ["C-filing.petition-2", "pass"], ["C-filing.petition-3", "not_checked"]]);
    assert.match(rows[2].source, /quote not found: advocate to verify/);
    const fc = await f.ci.formatChecks("m");
    assert.deepEqual(fc.results.map((r) => [r.key, r.result]), [["size", "pass"], ["bookmarks", "fail"]]);
    const defects = await f.ci.importDefects("m", "1. Index not paginated\n2. Vakalatnama not signed");
    assert.deepEqual(defects.map((d) => [d.classKey, d.state]), [["pagination", "open"], [null, "open"]]);
    assert.equal(f.store.setDefect(defects[0].id, true, { actor: "advocate" })[0].state, "cured");
    assert.equal(await f.ci.forumRefusal("m", ["in.sc"]), null);
    assert.match((await f.ci.forumRefusal("m", ["in.hc.delhi"]))!, /the matter's court is in.sc/);
    const ctx = await f.ci.rulesContext("m");
    assert.equal(ctx.length, 6);
    assert.equal(ctx.filter((r) => r.verified).length, 5);
    assert.ok(f.store.verifyChain().ok);
  } finally {
    f.close();
  }
});
