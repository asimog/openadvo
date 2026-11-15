/** Phase 4: facts, evidence, structure, relations, contradictions, timelines, templates, jurisdiction and the store. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { buildJurisdictionReport, buildTimeline, detectContradictions, detectRelatedMatters, detectRelations, extractFacts, extractForumClauses, extractLayout, extractStructure, templatesFor, timelineOf } from "../../src/lib/evidence/index.ts";

const advocate = { actor: "advocate" as const };
const line = (text: string, page = 1, n = 1) => ({ anchorId: `a${page}-${n}`, sourceId: "s1", sourceName: "record.pdf", page, line: n, text, reading: "text_layer" as const });

test("H8: a line with a date, an amount, an admission or a denial becomes a candidate fact", () => {
  const facts = extractFacts([
    line("On 12.03.2024 the defendant paid Rs. 5,00,000 to the plaintiff."),
    line("The defendant admitted that the agreement was signed on 1 January 2024."),
    line("The plaintiff denied the allegation of delay."),
    line("This line has nothing that makes it a fact."),
  ]);
  assert.equal(facts.length, 3);
  assert.equal(facts[0].date, "2024-03-12");
  assert.equal(facts[0].amount, "500000");
  assert.equal(facts[1].type, "admission");
  assert.equal(facts[2].type, "denial");
});

test("H6: the structure of a pleading keeps its parts and anchors", () => {
  const parts = extractStructure([
    line("IN THE HIGH COURT OF DELHI"),
    line("Asha v. State"),
    line("FACTS"),
    line("The petitioner was arrested on 1 January 2024."),
    line("GROUNDS"),
    line("The order is arbitrary."),
    line("PRAYER"),
    line("It is therefore prayed that the order be quashed."),
    line("The respondent admitted the date of arrest."),
    line("Annexure P-1 is the arrest memo."),
    line("The Court directed the respondent to file a reply within four weeks."),
  ]);
  for (const kind of ["title", "parties", "facts", "grounds", "prayer", "admission", "annexure", "direction"]) assert.ok(parts.some((p) => p.kind === kind), kind);
  assert.ok(parts.every((p) => p.anchorId && p.page === 1));
});

test("H3: the layout marks the header, the footer, a footnote and a paragraph", () => {
  const l = (text: string, n: number, y: number) => ({ ...line(text, 1, n), y, h: 12, pageHeight: 842 });
  const parts = extractLayout([
    l("IN THE HIGH COURT OF DELHI", 1, 800),
    l("The first paragraph begins here.", 2, 700),
    l("It continues on the next line.", 3, 685),
    l("1 A footnote at the bottom.", 4, 40),
    l("Page 1", 5, 10),
  ]);
  assert.ok(parts.some((p) => p.kind === "header"));
  assert.ok(parts.some((p) => p.kind === "footer"));
  assert.ok(parts.some((p) => p.kind === "footnote"));
  assert.ok(parts.some((p) => p.kind === "paragraph" && p.text.includes("first paragraph")));
});

test("H5: a version, a reply and an annexure are proposed with a reason", () => {
  const text = "The defendant shall file a written statement in the suit. Annexure P-1 is the arrest memo. ".repeat(40);
  const relations = detectRelations([
    { id: "a", name: "plaint.pdf", text, docType: "petition" },
    { id: "b", name: "written statement.pdf", text, docType: "reply" },
    { id: "c", name: "Annexure P-1.pdf", text: "The arrest memo is annexure P-1.", docType: "other" },
  ]);
  assert.ok(relations.some((r) => r.relation === "reply_to"));
  assert.ok(relations.some((r) => r.relation === "annexure_of"));
  assert.ok(relations.every((r) => r.reason.length > 10));
});

test("H9: the same fact with two dates or two amounts is a contradiction", () => {
  const base = { type: "fact" as const, status: "confirmed" as const, sourceId: "s1", sourceName: "a.pdf", anchorId: "a1", page: 1, line: 1, eventId: null, parties: [], issueIds: [], argumentIds: [], relief: "", supersedes: null, author: "advocate" as const, createdAt: "2026-01-01", decidedAt: null };
  const contradictions = detectContradictions([
    { ...base, id: "f1", text: "The defendant paid the amount on 1 January 2024.", date: "2024-01-01", amount: "500000" },
    { ...base, id: "f2", text: "The defendant paid the amount on 1 February 2024.", date: "2024-02-01", amount: "600000" },
  ]);
  assert.ok(contradictions.some((c) => c.kind === "date"));
  assert.ok(contradictions.some((c) => c.kind === "amount"));
});

test("H10: the timeline has procedural, payment and communication entries and a before/after split", () => {
  const events = [
    { id: "e1", sourceId: "s1", sourceName: "a.pdf", anchorId: "a1", page: 1, line: 1, dateText: "1 January 2024", dateStart: "2024-01-01", dateEnd: "2024-01-01", dateType: "explicit" as const, description: "The petition was filed.", kind: "procedural" as const, reading: "text_layer" as const, method: "rules", status: "confirmed" as const, excluded: false, conflicts: [] },
  ];
  const facts = [
    { id: "f1", text: "The defendant paid Rs. 5,00,000.", type: "fact" as const, status: "confirmed" as const, sourceId: "s1", sourceName: "a.pdf", anchorId: "a2", page: 1, line: 2, eventId: null, date: "2024-02-01", amount: "500000", parties: [], issueIds: [], argumentIds: [], relief: "", supersedes: null, author: "advocate" as const, createdAt: "2026-01-01", decidedAt: null },
    { id: "f2", text: "A notice was sent by email.", type: "fact" as const, status: "confirmed" as const, sourceId: "s1", sourceName: "a.pdf", anchorId: "a3", page: 1, line: 3, eventId: null, date: "2024-03-01", amount: "", parties: [], issueIds: [], argumentIds: [], relief: "", supersedes: null, author: "advocate" as const, createdAt: "2026-01-01", decidedAt: null },
  ];
  const all = buildTimeline(events, facts);
  assert.equal(all.length, 3);
  assert.ok(all.some((e) => e.kind === "procedural"));
  assert.ok(all.some((e) => e.kind === "payment"));
  assert.ok(all.some((e) => e.kind === "communication"));
  assert.equal(timelineOf(all, "payment").length, 1);
});

test("H12: a proceeding has its own record-table templates", () => {
  assert.ok(templatesFor("bail").some((t) => t.key === "bail_factors"));
  assert.ok(templatesFor("civil").some((t) => t.key === "plaint_admissions"));
  assert.ok(templatesFor("unknown").some((t) => t.proceeding === "any"));
});

test("D1 and D3: the report says undetermined when the court or subject is missing; a forum clause is kept with its anchor", () => {
  const clauses = extractForumClauses([line("The courts at Delhi shall have exclusive jurisdiction over this agreement.")]);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].kind, "exclusive");
  const report = buildJurisdictionReport({
    court: null,
    profile: { court: "", caseType: "", proceeding: "", relief: "", cnr: "" },
    appealRoute: [],
    rules: [],
    provisions: [],
    limitation: "",
    forumClauses: clauses.map((c, i) => ({ ...c, id: String(i) })),
    facts: [],
  });
  assert.equal(report.undetermined, true);
  assert.ok(report.unresolvedFacts.length > 0);
  assert.match(report.limitation, /Undetermined/);
});

test("C7: the same CNR or two common parties proposes a link", () => {
  const out = detectRelatedMatters([
    { id: "a", title: "Asha v. State", cnr: "DLHC010001232024", fir: "FIR 12/2024", parties: ["Asha", "State"], impugnedOrder: "Order dated 1 January 2024" },
    { id: "b", title: "Asha v. Union", cnr: "DLHC010001232024", fir: "", parties: ["Asha", "State"], impugnedOrder: "" },
  ]);
  assert.ok(out.some((r) => r.basis === "cnr"));
  assert.ok(out.some((r) => r.basis === "parties"));
});

test("F1, F3, H7, G2 and the evidence store: facts, evidence, memory, parts, edges and operations", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-evidence-"));
  try {
    const store = await MatterStore.create(dir, "Evidence v. State", advocate);
    const fact = store.evidence.addFact({ text: "The notice was served on 1 January 2024.", type: "fact", date: "2024-01-01" }, advocate);
    assert.equal(fact.status, "confirmed");
    assert.equal(store.evidence.facts().length, 1);
    assert.equal(store.evidence.decideFact(fact.id, "disputed", advocate).status, "disputed");
    const corrected = store.evidence.supersedeFact(fact.id, { text: "The notice was served on 2 January 2024.", date: "2024-01-02" }, advocate);
    assert.equal(corrected.supersedes, fact.id);
    assert.equal(store.evidence.facts().find((f) => f.id === fact.id)?.status, "superseded");

    const memory = store.evidence.proposeMemory({ type: "fact_from_document", subject: "notice", relation: "was served on", object: "2 January 2024" }, advocate);
    assert.equal(memory.status, "confirmed");
    assert.equal(store.evidence.memory().length, 1);

    assert.throws(() => store.evidence.addEvidence({ sourceId: "00000000-0000-0000-0000-000000000000", exhibitNumber: "P-1" }, advocate), /SOURCE_NOT_FOUND/);
    store.evidence.rebuildEdges();
    assert.ok(Array.isArray(store.evidence.edges()));
    store.evidence.setJurisdictionSystem({ forum: "High Court", courtType: "High Court", territorialBasis: "", subjectBasis: "", provisions: [], alternativeForums: [], limitation: "Undetermined", appealRoute: "Supreme Court", applicableRules: [], unresolvedFacts: [], undetermined: true, basis: [], updatedAt: null });
    assert.equal(store.evidence.jurisdiction()?.forum, "High Court");
    assert.equal(store.verifyChain().ok, true);
    store.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows may hold the sqlite file for a moment.
    }
  }
});
