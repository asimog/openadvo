/** Phase 5: statutes from India Code and from rules PDFs, Akoma Ntoso, verification at use, the governing date, the legal graph and fused retrieval. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { actOf, provisionOf, type IndiaCodeItem } from "../../src/lib/statutes/indiacode.ts";
import { footnoteEvents, provisionParts, sourceDate, textHash } from "../../src/lib/statutes/structure.ts";
import { parseAkn, toAkn, workUri } from "../../src/lib/statutes/akn.ts";
import { parseRules } from "../../src/lib/statutes/rules.ts";
import { proposeCrosswalk } from "../../src/lib/statutes/crosswalk.ts";
import { LawStore, type InstrumentInput } from "../../src/lib/law-store/index.ts";
import { checkChain } from "../../src/lib/store-chain/index.ts";
import { edgesOf, findCitations, findProvisions, paragraphs, sentences } from "../../src/lib/legal-corpus/index.ts";
import { VectorIndex, booleanFts, fuse, parseQuery, retrieve, type Embedder } from "../../src/lib/knowledge/index.ts";
import { functionAdapter, provisionAdapter, researchAdapter } from "../../src/lib/knowledge/adapters.ts";
import type { KnowledgeHit } from "../../src/shared/law.ts";

const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "indiacode-contract-act.json"), "utf8")) as { act: IndiaCodeItem; items: IndiaCodeItem[] };
const system = { actor: "system" as const };
const advocate = { actor: "advocate" as const };

function contractAct(): InstrumentInput {
  const act = actOf(fixture.act);
  const provisions = fixture.items.map((i) => provisionOf(act.sourceRef, i)).filter((p) => p !== null);
  return { kind: "act", ...act, source: "indiacode", provisions };
}

function store(): LawStore {
  return new LawStore(new DatabaseSync(":memory:"));
}

test("E3: an India Code Act becomes an instrument with sections, footnote events and dates", () => {
  const act = actOf(fixture.act);
  assert.equal(act.title, "The Indian Contract Act, 1872");
  assert.equal(act.enforced, "1872-09-01");
  assert.equal(sourceDate("1-7-2024"), "2024-07-01");
  assert.equal(sourceDate("24th July, 2020.-- S. 2 clauses"), null);
  const s28 = provisionOf(act.sourceRef, fixture.items.find((i) => i.metadata["dc.identifier.section_number"]?.[0].value === "28")!)!;
  assert.equal(s28.kind, "section");
  const sub = s28.events.find((e) => e.kind === "substitution")!;
  assert.equal(sub.byAct, "Act 1 of 1997");
  assert.equal(sub.date, "1997-01-08");
  assert.equal(sub.datePrecision, "day");
  const s19a = provisionOf(act.sourceRef, fixture.items.find((i) => i.metadata["dc.identifier.section_number"]?.[0].value === "19A")!)!;
  assert.deepEqual(s19a.events.map((e) => [e.kind, e.byAct, e.datePrecision]), [["insertion", "Act 6 of 1899", "year"]]);
  const gone = provisionOf(act.sourceRef, fixture.items.find((i) => i.metadata["dc.identifier.section_number"]?.[0].value === "99")!)!;
  assert.equal(gone.gone, "repealed");
  assert.equal(footnoteEvents("a", "1", "<sup>3</sup>. <i>Cf</i>. the Arbitration Act, 1940 (10 of 1940).").length, 0);
});

test("E3: the parts of a section are read by rule: clauses, exceptions and illustrations", () => {
  const act = actOf(fixture.act);
  const s2 = provisionOf(act.sourceRef, fixture.items.find((i) => i.metadata["dc.identifier.section_number"]?.[0].value === "2")!)!;
  const parts = provisionParts(s2.text);
  assert.equal(parts[0].kind, "intro");
  assert.ok(parts.filter((p) => p.kind === "clause").length >= 8);
  assert.ok(parts.some((p) => p.kind === "clause" && p.num === "(i)"), "(i) after (h) is a clause, not a sub-clause");
  const s19a = provisionOf(act.sourceRef, fixture.items.find((i) => i.metadata["dc.identifier.section_number"]?.[0].value === "19A")!)!;
  assert.ok(provisionParts(s19a.text).some((p) => p.kind === "illustration" && p.num === "(a)"));
});

test("E3: Akoma Ntoso written from the rows reads back with the same text and a hash per section", () => {
  const input = contractAct();
  const s = store();
  const { act } = s.putInstrument(input, system);
  const rows = s.provisions(act.id);
  const xml = toAkn(act, rows, s.events(act.id), "2026-11-16T00:00:00Z");
  assert.equal(workUri(act), "/akn/in/act/1872/9");
  assert.match(xml, /<FRBRuri value="\/akn\/in\/act\/1872\/9"\/>/);
  assert.match(xml, /<eventRef [^>]*date="1997-01-08" type="amendment"/);
  const back = parseAkn(xml);
  assert.equal(back.act.title, act.title);
  const sections = rows.filter((r) => r.kind === "section");
  assert.equal(back.provisions.filter((p) => p.kind === "section").length, sections.length);
  for (const p of back.provisions.filter((x) => x.kind === "section")) {
    assert.equal(p.hashMatches, true, `section ${p.number} reads back with the stored hash`);
  }
  // A changed file is seen at once.
  const tampered = parseAkn(xml.replace("willingness", "unwillingness"));
  assert.ok(tampered.provisions.some((p) => p.hashMatches === false));
});

test("verification at use: same text is verified, a changed text adds a version, an unreachable source is unconfirmed", async () => {
  const s = store();
  const { act, added } = s.putInstrument(contractAct(), system);
  assert.ok(added >= 8);
  const again = s.putInstrument(contractAct(), system);
  assert.equal(again.added, 0);
  assert.equal(again.changed, 0);
  const p = s.provisions(act.id).find((x) => x.number === "10")!;
  assert.equal((await s.verify(p.id, async (x) => ({ text: x.text }))).state, "verified");
  const down = await s.verify(p.id, async () => {
    throw new Error("SOURCE_UNREACHABLE: indiacode.gov.in");
  });
  assert.equal(down.state, "unreachable");
  assert.equal(s.provision(p.id)!.check, "unreachable");
  const changed = await s.verify(p.id, async (x) => ({ text: `${x.text} New words.` }));
  assert.equal(changed.state, "changed");
  assert.equal(changed.newVersion, 2);
  const versions = s.versions(act.id, "10");
  assert.deepEqual(versions.map((v) => [v.version, v.status]), [[2, "in_force"], [1, "superseded"]]);
  assert.ok(versions[1].validUntil, "the earlier version is closed, not deleted");
  assert.equal(s.searchProvisions("new words", { phrase: true }).length, 1);
  assert.equal(checkChain((s as unknown as { db: DatabaseSync }).db).ok, true);
});

test("D2: the law on a governing date, with its basis; undetermined when the record cannot settle it", () => {
  const s = store();
  const { act } = s.putInstrument(contractAct(), system);
  assert.equal(s.inForce(act.id, "10", "1860-01-01").state, "not_yet_in_force");
  assert.equal(s.inForce(act.id, "10", "2020-05-01").state, "in_force");
  // Section 19A was inserted by an Act of 1899: the source gives the year only.
  assert.equal(s.inForce(act.id, "19A", "1890-01-01").state, "not_yet_in_force");
  assert.equal(s.inForce(act.id, "19A", "1899-06-01").state, "undetermined");
  assert.equal(s.inForce(act.id, "19A", "1950-01-01").state, "in_force");
  // Section 28 was substituted with effect from 8.1.1997: before that the stored text is not the text in force.
  const before = s.inForce(act.id, "28", "1990-01-01");
  assert.equal(before.state, "undetermined");
  assert.match(before.basis.join(" "), /08\.01\.1997/);
  assert.equal(s.inForce(act.id, "28", "2000-01-01").state, "in_force");
  // A repealed section with no date in the record.
  assert.equal(s.inForce(act.id, "99", "2000-01-01").state, "undetermined");
  assert.throws(() => s.addEvent({ actId: act.id, provision: "99", kind: "repeal", byAct: "x", bySection: "", date: "1930-07-01", datePrecision: "day", quote: "q" }, { actor: "agent" }), /HUMAN_ONLY/);
  s.addEvent({ actId: act.id, provision: "99", kind: "repeal", byAct: "Act 3 of 1930", bySection: "65", date: "1930-07-01", datePrecision: "day", quote: "Rep. by Act 3 of 1930, s. 65" }, advocate);
  assert.equal(s.inForce(act.id, "99", "2000-01-01").state, "repealed");
});

test("court rules from a PDF's lines become provisions with page and line anchors", () => {
  const L = (page: number, line: number, text: string) => ({ page, line, text });
  const r = parseRules([
    L(1, 1, "DELHI HIGH COURT (ORIGINAL SIDE) RULES, 2018"),
    L(1, 2, "ARRANGEMENT OF RULES"),
    L(2, 1, "CHAPTER I"),
    L(2, 2, "1. Short title and commencement.— These Rules may be called the Delhi High Court (Original Side) Rules, 2018."),
    L(2, 3, "2. Definitions.— In these Rules, unless the context otherwise requires,"),
    L(2, 4, "(a) \"Court\" means the High Court of Delhi;"),
    L(2, 5, "1. this numbered line is a list item inside rule 2"),
    L(3, 1, "3. Written statement.— The written statement shall be filed within 30 days."),
    L(3, 2, "CHAPTER II"),
    L(3, 3, "1. Presentation of plaint.— Every plaint shall be presented to the Registry."),
  ]);
  assert.equal(r.preface, 2);
  assert.deepEqual(r.provisions.map((p) => [p.under, p.number, p.heading]), [
    ["CHAPTER I", "1", "Short title and commencement"],
    ["CHAPTER I", "2", "Definitions"],
    ["CHAPTER I", "3", "Written statement"],
    ["CHAPTER II", "1", "Presentation of plaint"],
  ]);
  assert.match(r.provisions[1].text, /list item inside rule 2/);
  assert.deepEqual([r.provisions[2].page, r.provisions[2].line], [3, 1]);
  const s = store();
  const { act } = s.putInstrument({ kind: "rules", title: "Delhi High Court (Original Side) Rules, 2018", number: "", year: "2018", jurisdiction: "High Court of Delhi", enacted: null, enforced: null, enforcedText: "", repealed: false, source: "upload", sourceUrl: "", sourceRef: "a".repeat(64), provisions: r.provisions }, advocate);
  assert.equal(act.provisions, 4, "rule 1 of two chapters are two provisions");
});

test("D2: crosswalk candidates come from headings and opening words, with a score", () => {
  const c = proposeCrosswalk(
    [{ number: "420", heading: "Cheating and dishonestly inducing delivery of property", text: "Whoever cheats and thereby dishonestly induces the person deceived to deliver any property" }, { number: "1", heading: "Title and extent of operation of the Code", text: "This Act shall be called the Indian Penal Code" }],
    [{ number: "318", heading: "Cheating", text: "Whoever cheats and thereby dishonestly induces the person deceived to deliver any property to any person" }, { number: "303", heading: "Theft", text: "Whoever, intending to take dishonestly any movable property" }],
    0.3,
  );
  assert.deepEqual(c.map((x) => [x.from, x.to]), [["420", "318"]]);
});

test("E1, G1: paragraphs, Indian citations, provisions and treatment edges come from the judgment's own words", () => {
  const cites = findCitations("See Kesavananda Bharati v. State of Kerala, (1973) 4 SCC 225 : AIR 1973 SC 1461; 2023 INSC 1043; 2021 SCC OnLine Del 4521; 2023:DHC:1234-DB and [2019] 3 SCR 100.");
  assert.deepEqual(cites.map((c) => c.citation), ["(1973) 4 SCC 225", "AIR 1973 SC 1461", "2023 INSC 1043", "2021 SCC OnLine Del 4521", "2023:DHC:1234-DB", "(2019) 3 SCR 100"]);
  const provs = findProvisions("An offence under Section 138 of the Negotiable Instruments Act, 1881 read with Article 226 of the Constitution and Section 482 of the Cr.P.C.");
  assert.deepEqual(provs.map((p) => [p.kind, p.number, p.act]), [["section", "138", "Negotiable Instruments Act, 1881"], ["article", "226", "Constitution"], ["section", "482", "Cr.P.C"]]);
  assert.equal(sentences("In A v. B, (2019) 5 SCC 1, the Court held X. We follow it.").length, 2);
  const pages = [{ page: 1, lines: ["JUDGMENT", "1. The appeal arises from an order dated 12.03.2020.", "2. Learned counsel for the appellant relied on (2010) 2 SCC 100 to submit that the order is bad.", "continued line of paragraph two.", "3. We have considered the submissions. The decision in (2015) 7 SCC 50 is distinguishable on facts.", "4. The view in AIR 1990 SC 12 is overruled. We follow 2023 INSC 1043 on Section 138 of the Negotiable Instruments Act, 1881."].map((text, i) => ({ line: i + 1, text })) }];
  const paras = paragraphs(pages);
  assert.deepEqual(paras.map((p) => p.label), ["", "1", "2", "3", "4"]);
  assert.match(paras[2].text, /continued line/);
  const edges = edgesOf("J1", paras, (c) => (c === "2023 INSC 1043" ? "J2" : null), (_k, n) => (n === "138" ? "prov-138" : null));
  const has = (rel: string, to: string) => edges.some((e) => e.relation === rel && e.toId === to);
  assert.ok(has("cites", "(2010) 2 SCC 100"));
  assert.ok(!has("follows", "(2010) 2 SCC 100"), "counsel's reliance is not the court's treatment");
  assert.ok(has("distinguishes", "(2015) 7 SCC 50"));
  assert.ok(has("overrules", "AIR 1990 SC 12"));
  assert.ok(has("follows", "J2"));
  assert.ok(has("interprets", "prov-138"));
  assert.equal(edges.find((e) => e.relation === "overrules")!.evidenceRef, "J1#p4");
});

test("G7: fusion ranks a hit found by two retrievers first; Boolean queries always parse", () => {
  const h = (id: string): KnowledgeHit => ({ id, scope: "research", kind: "p", title: id, text: "", anchor: id, date: null, authority: 0, verification: "", stale: false, score: 0, why: [] });
  const out = fuse([{ retriever: "text", hits: [h("a"), h("b"), h("c")] }, { retriever: "vector", hits: [h("c"), h("d")] }]);
  assert.equal(out[0].id, "c");
  assert.deepEqual(out[0].why, ["text", "vector"]);
  assert.equal(booleanFts('(bail OR "anticipatory bail") AND NOT murder'), '( "bail" OR "anticipatory bail" ) AND NOT "murder"');
  assert.equal(booleanFts("AND bail) OR"), '"bail"');
  assert.equal(parseQuery("Section 138 of the Negotiable Instruments Act", "statute").provisions[0].number, "138");
});

test("G6: the vector index returns the nearest rows and honours a filter", () => {
  const idx = new VectorIndex(3, [{ id: "x", v: new Float32Array([1, 0, 0]) }, { id: "y", v: new Float32Array([0, 1, 0]) }, { id: "z", v: new Float32Array([0.9, 0.1, 0]) }]);
  assert.deepEqual(idx.search(new Float32Array([1, 0, 0]), 2).map((r) => r.id), ["x", "z"]);
  assert.deepEqual(idx.search(new Float32Array([1, 0, 0]), 2, (id) => id !== "x").map((r) => r.id), ["z", "y"]);
  assert.throws(() => idx.search(new Float32Array([1, 0]), 1), /VECTOR_DIM/);
});

test("G7: one retrieval over statutes, rules, judgments and a matter; scope and coverage are stated; stale rows are checked at use", async () => {
  const s = store();
  const { act } = s.putInstrument({ ...contractAct(), checkIntervalDays: 0 }, system);
  s.putInstrument({ kind: "rules", title: "Delhi High Court (Original Side) Rules, 2018", number: "", year: "2018", jurisdiction: "High Court of Delhi", enacted: null, enforced: null, enforcedText: "", repealed: false, source: "upload", sourceUrl: "", sourceRef: "b".repeat(64), provisions: [{ kind: "rule", number: "3", heading: "Written statement", text: "The written statement shall be filed within 30 days of service of summons.", order: 1, under: "CHAPTER VII" }] }, advocate);
  const p10 = s.provisions(act.id).find((p) => p.number === "10")!;
  const paras = [
    { para: 1, label: "1", page: 1, line: 1, text: "The question is whether an agreement by a minor is void." },
    { para: 2, label: "2", page: 1, line: 5, text: "Under Section 10 of the Indian Contract Act, 1872 all agreements are contracts if made by the free consent of parties competent to contract. The view in AIR 1990 SC 12 is overruled." },
  ];
  s.putJudgment("J1", { court: "sc", courtName: "Supreme Court of India", title: "A v. B", decisionDate: "2020-01-10", citations: ["(2020) 1 SCC 1", "2020 INSC 5"], judges: ["X", "Y", "Z"] }, paras, system);
  s.putJudgment("J0", { court: "sc", courtName: "Supreme Court of India", title: "C v. D", decisionDate: "1990-01-10", citations: ["AIR 1990 SC 12"], judges: ["P", "Q"] }, [{ para: 1, label: "1", page: 1, line: 1, text: "A minor's agreement is voidable." }], system);
  s.putEdges("J1", edgesOf("J1", paras, (c) => s.byCitation(c)[0] ?? null, (_k, n, a) => s.findProvision(n, a)[0]?.id ?? null), system);
  assert.ok(s.edges({ toKind: "provision", toId: p10.id, relations: ["interprets"] }).length === 1);
  assert.deepEqual(s.walk("judgment", "J0", { depth: 1 }).map((w) => [w.id, w.direction]).sort(), [["J1", "in"]]);

  let reads = 0;
  const embedder: Embedder = { model: "test", dim: 3, embed: async (t) => t.map(() => new Float32Array([1, 0, 0])) };
  const adapters = [
    provisionAdapter("statute", s, { verify: async (p) => (reads++, { text: p.text }) }),
    provisionAdapter("procedure", s),
    researchAdapter(s, { index: new VectorIndex(3, [{ id: "J1#p1", v: new Float32Array([1, 0, 0]) }]), scope: "research" }),
    functionAdapter("matter", () => [{ id: "fact-1", scope: "matter", kind: "fact", title: "Fact", text: "The defendant was a minor on the date of the agreement.", anchor: "s1:p3:l4", date: null, authority: 0, verification: "confirmed", stale: false, score: 0, why: [] }]),
  ];
  // A provision named with its Act: the exact row first, the judgment that interprets it by the graph.
  const r1 = await retrieve(adapters, "Section 10 of the Indian Contract Act", { mode: "statute", embedder });
  assert.equal(r1.hits[0].id, p10.id);
  assert.ok(r1.hits[0].why.includes("exact"));
  assert.equal(r1.hits[0].verification, "verified now");
  assert.ok(reads >= 1, "a stale row was read from its source before it was returned");
  assert.ok(r1.hits.some((h) => h.id === "J1#p2" && h.why.includes("graph")));
  // A citation: the judgment, and the paragraph of the later judgment that overrules it.
  const r2 = await retrieve(adapters, "AIR 1990 SC 12", { mode: "citation" });
  assert.equal(r2.hits[0].id, "J0#p1");
  assert.ok(r2.hits.some((h) => h.id === "J1#p2" && /overrules/.test(h.verification)));
  // Natural language over every scope; vectors on; the rules and the matter fact are found.
  const r3 = await retrieve(adapters, "written statement within 30 days minor agreement", { embedder });
  assert.equal(r3.vectors, "on");
  assert.ok(r3.hits.some((h) => h.scope === "procedure"));
  assert.ok(r3.hits.some((h) => h.scope === "matter"));
  assert.ok(r3.hits.some((h) => h.id === "J1#p1" && h.why.includes("vector")));
  assert.deepEqual(r3.notSearched.map((n) => n.scope).sort(), ["advocate", "firm"]);
  // Historical law: the governing date travels with the hit.
  const r4 = await retrieve(adapters, "Section 28 of the Indian Contract Act", { mode: "historical", date: "1990-01-01" });
  assert.match(r4.hits[0].verification, /on 1990-01-01: undetermined/);
  // Rebuild makes the indexes again from the rows.
  assert.deepEqual(s.rebuild(), { provisions: s.counts().provisions, paragraphs: 3 });
  assert.equal((await retrieve(adapters, "free consent", { mode: "phrase", scopes: ["research"] })).hits[0].id, "J1#p2");
});
