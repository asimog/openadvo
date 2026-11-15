/** Phase 2: the adapter library (docs/specs/court-adapters.md sections 3 and 4). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allowedUrl, caseTypes, checkAdapter, extractSection, findLink, findQuote, listsForCaseType, matchDefects, recommended, runFormatCheck, scopeLines, type DocLine } from "../../src/lib/court-adapters/index.ts";
import { DIRECTORY, appealRoute, court, searchDirectory } from "../../src/lib/court-directory/index.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const lines = (text: string, page = 1): DocLine[] => text.split("\n").map((t, i) => ({ page, line: i + 1, text: t }));

test("the built-in adapters are valid, and each names courts of the directory", () => {
  for (const id of ["in-sc", "in-hc-delhi", "in-dj-delhi"]) {
    const { adapter, errors } = checkAdapter(JSON.parse(readFileSync(path.join(repo, "adapters", id, "adapter.json"), "utf8")));
    assert.deepEqual(errors, [], id);
    for (const c of adapter!.courts) assert.ok(court(c), `${id}: ${c}`);
    for (const l of adapter!.lists) for (const it of l.items ?? []) if (l.kind !== "workflow") assert.ok(it.quote && it.ref, `${id} ${l.key}: every rule item carries its quote and reference`);
  }
});

test("an adapter is refused for a host outside its list, plain http, a missing source and an unknown check", () => {
  const base = { id: "x-test", version: "1.0.0", courts: ["in.sc"], hosts: ["court.example"], sources: [{ key: "r", title: "R", kind: "rules", owner: "o", checkDays: 30, reliability: "official", url: "https://court.example/r.pdf" }], lists: [{ key: "l", kind: "checklist", title: "L", source: "r", items: [{ text: "t", quote: "q" }] }] };
  assert.deepEqual(checkAdapter(base).errors, []);
  assert.match(checkAdapter({ ...base, sources: [{ ...base.sources[0], url: "https://evil.example/r.pdf" }] }).errors.join(), /host evil.example is not in hosts/);
  assert.match(checkAdapter({ ...base, sources: [{ ...base.sources[0], url: "http://court.example/r.pdf" }] }).errors.join(), /only https/);
  assert.match(checkAdapter({ ...base, lists: [{ ...base.lists[0], source: "nope" }] }).errors.join(), /source nope is not in sources/);
  assert.match(checkAdapter({ ...base, formatChecks: [{ key: "f", title: "F", check: "pdf_colour", source: "r" }] }).errors.join(), /check must be one of/);
  assert.match(checkAdapter({ ...base, hosts: [] }).errors.join(), /hosts must name/);
  assert.equal(allowedUrl(checkAdapter(base).adapter!, "https://court.example/other.pdf"), true);
  assert.equal(allowedUrl(checkAdapter(base).adapter!, "https://court.example.evil.test/x.pdf"), false);
});

test("the quote match: OCR errors, joined and split words, a lost word; an invented quote is not found", () => {
  const doc = lines(["(b) Alongwith the petition, list of dates in chronological order with relevant material facts or", "events pertaining to eacb ofthe dates shall be furnished.", "6. The petitioner shall file at least three spare sets ofthe petition and of the accompanying papers.", "fiJed u Appendix to the Special Leave Petition."].join("\n"));
  const m = findQuote(doc, "list of dates in chronological order with relevant material facts or events pertaining to each of the dates shall be furnished");
  assert.deepEqual([m?.page, m?.line, m?.score], [1, 1, 1]);
  assert.equal(findQuote(doc, "The petitioner shall file at least three spare sets of the petition")?.line, 3);
  assert.equal(findQuote(doc, "filed as Appendix to the Special Leave Petition")?.line, 4);
  assert.equal(findQuote(doc, "the petition shall be filed in quadruplicate with a court fee stamp"), null);
});

test("scope keeps a quote inside its part of the document; section extraction reads numbered rules", () => {
  const doc = lines(["ORDER XIX", "1. A certified copy of the judgment or order appealed from.", "ORDER XXI", "SPECIAL LEAVE PETITIONS (CIVIL)", "1. Where certificate of fitness was refused, sixty days.", "continued text of rule one.", "2. Where the period of limitation is claimed.", "[3. Substituted rule three.]", "SPECIAL LEAVE PETITIONS (CRIMINAL)", "1. Criminal rule."].join("\n"));
  const scoped = scopeLines(doc, { start: "SPECIAL LEAVE PETITIONS (CIVIL)", end: "SPECIAL LEAVE PETITIONS (CRIMINAL)" });
  assert.equal(scoped.found, true);
  assert.equal(findQuote(scoped.lines, "A certified copy of the judgment or order appealed from"), null);
  assert.equal(findQuote(doc, "A certified copy of the judgment or order appealed from")?.line, 2);
  const rules = extractSection(doc, "SPECIAL LEAVE PETITIONS (CIVIL)", "SPECIAL LEAVE PETITIONS (CRIMINAL)");
  assert.deepEqual(rules.map((r) => [r.n, r.line]), [["1", 5], ["2", 7], ["3", 8]]);
  assert.match(rules[0].text, /continued text of rule one/);
});

test("finding a document's link on a court's page: in the link, or in the cell before it", () => {
  const page = '<table><tr><td>1</td><td>Supreme Court Rules, 2013</td><td><a href="/uploads/r2013.pdf">View</a></td></tr></table><a href="https://court.example/rules-1966.pdf">Supreme Court Rules, 1966</a>';
  assert.equal(findLink(page, "Supreme Court Rules, 2013", "https://court.example/rules/"), "https://court.example/uploads/r2013.pdf");
  assert.equal(findLink(page, "supreme court rules, 1966", "https://court.example/rules/"), "https://court.example/rules-1966.pdf");
  assert.equal(findLink(page, "Rules of 1950", "https://court.example/rules/"), null);
});

test("format checks on a PDF's facts", () => {
  const facts = { name: "set.pdf", bytes: 30 * 1024 * 1024, pages: 3, pagesWithText: 2, pdfA: false, bookmarks: true, pageSizes: [{ w: 595.28, h: 841.89 }, { w: 841.89, h: 595.28 }, { w: 612, h: 792 }] };
  const c = (check: string, value?: number) => runFormatCheck({ key: "k", title: "t", check: check as never, value, source: "s" }, facts);
  assert.equal(c("pdf_max_mb", 100).result, "pass");
  assert.equal(c("pdf_max_mb", 20).result, "fail");
  assert.equal(c("pdf_searchable").result, "fail");
  assert.equal(c("pdf_bookmarks").result, "pass");
  assert.equal(c("pdf_a").result, "fail");
  assert.deepEqual([c("pdf_page_size").result, c("pdf_page_size").detail], ["fail", "1 of 3 pages are not A4."]);
});

test("the profile decides what is recommended; a case type decides what a matter needs; defects are matched", () => {
  const sc = checkAdapter(JSON.parse(readFileSync(path.join(repo, "adapters", "in-sc", "adapter.json"), "utf8"))).adapter!;
  assert.deepEqual(recommended(sc, ["criminal"]), []);
  assert.deepEqual(recommended(sc, ["civil"]).sort(), ["filing.slp_civil", "limitation.slp_civil", "rules.order_xxi", "workflow.slp_civil"]);
  assert.deepEqual(caseTypes(sc), ["SLP(C)"]);
  assert.equal(listsForCaseType(sc, "slp (c)").length, 4);
  assert.equal(listsForCaseType(sc, "W.P.(C)").length, 0);
  const dhc = checkAdapter(JSON.parse(readFileSync(path.join(repo, "adapters", "in-hc-delhi", "adapter.json"), "utf8"))).adapter!;
  assert.deepEqual(listsForCaseType(dhc, "W.P.(C)").map((l) => l.key), ["filing.efiling_format", "filing.paper"]);
  const withClasses = { ...sc, defects: [{ key: "court_fee", title: "Court fee", match: ["court fee"], step: "Pay the deficit court fee." }] };
  assert.deepEqual(matchDefects(withClasses, "1. Deficit court fee\n2) Index not paginated\n\n"), [
    { text: "Deficit court fee", classKey: "court_fee", classTitle: "Court fee", step: "Pay the deficit court fee." },
    { text: "Index not paginated", classKey: null, classTitle: null, step: null },
  ]);
});

test("the court directory: the Supreme Court, 25 High Courts, a district judiciary per state and union territory, tribunals, appeal routes", () => {
  assert.equal(DIRECTORY.filter((c) => c.kind === "high_court").length, 25);
  assert.equal(DIRECTORY.filter((c) => c.kind === "district_judiciary").length, 36);
  assert.deepEqual(appealRoute("in.dj.delhi").map((c) => c.id), ["in.dj.delhi", "in.hc.delhi", "in.sc"]);
  assert.deepEqual(appealRoute("in.t.nclt").map((c) => c.id), ["in.t.nclt", "in.t.nclat", "in.sc"]);
  assert.equal(court("in.dj.goa")?.appealTo, "in.hc.bombay");
  assert.ok(searchDirectory("madurai").some((c) => c.id === "in.hc.madras"));
  assert.ok(new Set(DIRECTORY.map((c) => c.id)).size === DIRECTORY.length);
});
