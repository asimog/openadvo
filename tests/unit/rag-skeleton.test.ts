/**
 * RAG-0: the Phase 5 integration skeleton. Contract, scope guard, bounded run, coverage, quote
 * gate, citation key, verification dimensions and health. It does not test RAG-1 to RAG-5 or the
 * Phase 5 exit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { actOf, provisionOf, type IndiaCodeItem } from "../../src/lib/statutes/indiacode.ts";
import { LawStore, type InstrumentInput } from "../../src/lib/law-store/index.ts";
import { checkChain } from "../../src/lib/store-chain/index.ts";
import { KnowledgeError, KnowledgeRegistry, hitContractProblem, runRetrieval } from "../../src/lib/knowledge/index.ts";
import type { KnowledgeAdapter } from "../../src/lib/knowledge/index.ts";
import { boundMatterAdapter, deferredAdapter, withHealth } from "../../src/lib/knowledge/adapters.ts";
import type { MatterKnowledgePort } from "../../src/lib/knowledge/adapters.ts";
import { createSkeletonKnowledge } from "../../src/lib/knowledge/skeleton.ts";
import { QUOTE_MIN_CHARACTERS, locateQuote, quoteHash, verifyQuote } from "../../src/lib/knowledge/quote.ts";
import { VERIFICATION_DIMENSIONS, citationKeyId, citationKeyText, summariseVerification } from "../../src/shared/law.ts";
import type { CitationKey, KnowledgeHit, KnowledgeScope, VerificationCheck, VerificationDimension, VerificationState } from "../../src/shared/law.ts";

const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "indiacode-contract-act.json"), "utf8")) as { act: IndiaCodeItem; items: IndiaCodeItem[] };
const system = { actor: "system" as const };
const advocate = { actor: "advocate" as const };

function store(): LawStore {
  return new LawStore(new DatabaseSync(":memory:"));
}

function contractAct(): InstrumentInput {
  const act = actOf(fixture.act);
  const provisions = fixture.items.map((item) => provisionOf(act.sourceRef, item)).filter((p) => p !== null);
  return { kind: "act", ...act, source: "indiacode", provisions };
}

const RULES_TITLE = "Delhi High Court (Original Side) Rules, 2018";
const RULES_TEXT = "The written statement shall be filed within 30 days of service of summons.";

function populated(): LawStore {
  const law = store();
  law.putInstrument(contractAct(), system);
  law.putInstrument(
    {
      kind: "rules",
      title: RULES_TITLE,
      number: "",
      year: "2018",
      jurisdiction: "High Court of Delhi",
      enacted: null,
      enforced: null,
      enforcedText: "",
      repealed: false,
      source: "upload",
      sourceUrl: "",
      sourceRef: "b".repeat(64),
      provisions: [
        { kind: "rule", number: "1", heading: "Short title", text: "These Rules may be cited as the Delhi High Court (Original Side) Rules, 2018.", order: 1, under: "CHAPTER I" },
        { kind: "rule", number: "3", heading: "Written statement", text: RULES_TEXT, order: 2, under: "CHAPTER I" },
      ],
    },
    advocate,
  );
  law.putJudgment(
    "J1",
    { court: "sc", courtName: "Supreme Court of India", title: "A v. B", decisionDate: "2020-01-10", citations: ["(2020) 1 SCC 1", "2020 INSC 5"], judges: ["X", "Y", "Z"] },
    [
      { para: 1, label: "1", page: 1, line: 1, text: "The question is whether the written statement was filed in time." },
      { para: 2, label: "2", page: 1, line: 5, text: "The court held that the written statement filed within 30 days is in time." },
    ],
    system,
  );
  return law;
}

function hit(id: string, scope: KnowledgeScope, overrides: Partial<KnowledgeHit> = {}): KnowledgeHit {
  return {
    id,
    scope,
    kind: "paragraph",
    title: `Title ${id}`,
    text: "The text of the passage.",
    anchor: `${scope}:${id}`,
    date: null,
    authority: 0,
    verification: "",
    stale: false,
    score: 0,
    why: ["text"],
    ...overrides,
  };
}

function adapter(scope: KnowledgeScope, search: KnowledgeAdapter["search"], extra: Partial<KnowledgeAdapter> = {}): KnowledgeAdapter {
  return { scope, unavailable: () => null, search, ...extra };
}

// ---- contract ----

test("RAG-0 contract: a returned hit has id, scope, anchor, title, text and a retriever", async () => {
  const registry = new KnowledgeRegistry([adapter("research", () => [{ retriever: "text", hits: [hit("h1", "research")] }])]);
  const result = await runRetrieval(registry, "bail", { scopes: ["research"] });
  assert.equal(result.hits.length, 1);
  assert.equal(hitContractProblem(result.hits[0]), null);
  assert.deepEqual(result.coverage.searched, ["research"]);
  assert.deepEqual(result.coverage.deferred, []);
  assert.deepEqual(result.coverage.failed, []);
  assert.equal(result.coverage.partial, false);
});

test("RAG-0 contract: a hit without an anchor is rejected and the adapter is reported", async () => {
  const bad = hit("bad", "research", { anchor: "   " });
  const good = hit("good", "research");
  const registry = new KnowledgeRegistry([adapter("research", () => [{ retriever: "text", hits: [bad, good] }])]);
  const result = await runRetrieval(registry, "bail", { scopes: ["research"] });
  assert.deepEqual(result.hits.map((h) => h.id), ["good"]);
  assert.equal(hitContractProblem(bad), "no anchor");
  assert.deepEqual(result.coverage.failed.map((f) => f.scope), ["research"]);
  assert.match(result.coverage.failed[0].reason, /invalid hit/);
  assert.equal(result.coverage.partial, true);
});

test("RAG-0 contract: a second adapter for one scope is refused", () => {
  assert.throws(
    () => new KnowledgeRegistry([adapter("research", () => []), adapter("research", () => [])]),
    (e: unknown) => e instanceof KnowledgeError && e.code === "DUPLICATE_SCOPE",
  );
});

test("RAG-0 contract: a deferred scope is visible in notSearched, coverage and health, and returns no rows", async () => {
  const registry = new KnowledgeRegistry([deferredAdapter("firm", "Firm knowledge is deferred to RAG-3.")]);
  const result = await runRetrieval(registry, "bail", { scopes: ["firm"] });
  assert.equal(result.hits.length, 0);
  assert.deepEqual(result.notSearched.map((n) => n.scope), ["firm"]);
  assert.match(result.notSearched[0].reason, /RAG-3/);
  assert.deepEqual(result.coverage.deferred.map((d) => d.scope), ["firm"]);
  assert.deepEqual(result.coverage.searched, []);
  assert.equal(result.coverage.partial, true);
  assert.deepEqual(registry.health(), [{ scope: "firm", state: "deferred", detail: "Firm knowledge is deferred to RAG-3." }]);
});

test("RAG-0 health: withHealth supplies the Index Health row, including an error", () => {
  const wrapped = withHealth(adapter("research", () => []), () => ({ scope: "research", state: "error", detail: "The paragraph index is corrupt." }));
  assert.deepEqual(new KnowledgeRegistry([wrapped]).health(), [{ scope: "research", state: "error", detail: "The paragraph index is corrupt." }]);
});

// ---- scope ----

test("RAG-0 scope: a matter adapter bound to m1 refuses m2, a missing id and a hostile id before the port", async () => {
  const seen: string[] = [];
  const port: MatterKnowledgePort = {
    search: (matterId) => {
      seen.push(matterId);
      return [hit("fact-1", "matter", { anchor: "record:fact-1", text: "The defendant was a minor.", why: ["text"] })];
    },
  };
  const registry = new KnowledgeRegistry([boundMatterAdapter("m1", port)]);

  const noId = await runRetrieval(registry, "minor", { scopes: ["matter"] });
  assert.match(noId.coverage.failed[0].reason, /MATTER_SCOPE/);
  const other = await runRetrieval(registry, "minor", { scopes: ["matter"], matterId: "m2" });
  assert.match(other.coverage.failed[0].reason, /MATTER_SCOPE/);
  const hostile = await runRetrieval(registry, "minor", { scopes: ["matter"], matterId: "../m2" });
  assert.match(hostile.coverage.failed[0].reason, /MATTER_SCOPE/);
  assert.deepEqual(seen, [], "the port is not called for a refused scope");

  const own = await runRetrieval(registry, "minor", { scopes: ["matter"], matterId: "m1" });
  assert.deepEqual(own.hits.map((h) => h.id), ["fact-1"]);
  assert.deepEqual(seen, ["m1"], "the port receives the bound id, never the requested id");
});

// ---- bounded run ----

test("RAG-0 bounded run: a slow adapter times out and the fast adapter's hits survive", async () => {
  let slowFinished = false;
  const slow = adapter("statute", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    slowFinished = true;
    return [{ retriever: "text", hits: [hit("slow", "statute")] }];
  });
  const fast = adapter("research", () => [{ retriever: "text", hits: [hit("fast", "research")] }]);
  const result = await runRetrieval(new KnowledgeRegistry([slow, fast]), "bail", { scopes: ["statute", "research"], timeoutMs: 20 });
  assert.deepEqual(result.hits.map((h) => h.id), ["fast"]);
  assert.deepEqual(result.coverage.searched, ["research"]);
  assert.deepEqual(result.coverage.failed.map((f) => f.scope), ["statute"]);
  assert.match(result.coverage.failed[0].reason, /TIMEOUT/);
  assert.equal(result.coverage.partial, true);
  assert.equal(slowFinished, false, "the run did not wait for the slow adapter");
});

test("RAG-0 bounded run: a failed adapter is reported and does not throw the run", async () => {
  const boom = adapter("statute", () => {
    throw new Error("SOURCE_DOWN: the law source did not answer");
  });
  const fast = adapter("research", () => [{ retriever: "text", hits: [hit("fast", "research")] }]);
  const result = await runRetrieval(new KnowledgeRegistry([boom, fast]), "bail", { scopes: ["statute", "research"] });
  assert.deepEqual(result.hits.map((h) => h.id), ["fast"]);
  assert.deepEqual(result.coverage.searched, ["research"]);
  assert.match(result.coverage.failed[0].reason, /SOURCE_DOWN/);
  assert.equal(result.coverage.partial, true);
});

test("RAG-0 bounded run: a broken state read or a malformed hit is reported, not thrown", async () => {
  const broken = adapter("firm", () => [], {
    unavailable: () => {
      throw new Error("STATE_DOWN: the firm store cannot be read");
    },
  });
  const malformed = adapter("research", () => [{ retriever: "text", hits: [null as unknown as KnowledgeHit] }]);
  const result = await runRetrieval(new KnowledgeRegistry([broken, malformed]), "bail", { scopes: ["firm", "research"] });
  assert.equal(result.hits.length, 0);
  assert.deepEqual(result.coverage.failed.map((f) => f.scope), ["firm", "research"]);
  assert.match(result.coverage.failed[0].reason, /STATE_DOWN/);
  assert.match(result.coverage.failed[1].reason, /invalid hit/);
  assert.equal(result.coverage.partial, true);
});

test("RAG-0 contract: an adapter cannot return a hit in another scope", async () => {
  const wrong = adapter("research", () => [{ retriever: "text", hits: [hit("x", "statute")] }]);
  const result = await runRetrieval(new KnowledgeRegistry([wrong]), "bail", { scopes: ["research"] });
  assert.equal(result.hits.length, 0);
  assert.match(result.coverage.failed[0].reason, /scope statute in a research adapter/);
});

test("RAG-0 bounded run: concurrency stays within the configured limit", async () => {
  let active = 0;
  let peak = 0;
  const scopes: KnowledgeScope[] = ["statute", "procedure", "research", "matter", "firm"];
  const adapters = scopes.map((scope) =>
    adapter(scope, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return [{ retriever: "text", hits: [hit(scope, scope)] }];
    }),
  );
  const result = await runRetrieval(new KnowledgeRegistry(adapters), "bail", { scopes, concurrency: 2, timeoutMs: 1_000 });
  assert.equal(result.hits.length, 5);
  assert.equal(result.coverage.failed.length, 0);
  assert.ok(peak <= 2, `peak concurrency was ${peak}`);
  assert.equal(peak, 2, "two adapters ran at once");
});

test("RAG-0 bounded run: an unknown scope is refused before any adapter is called", async () => {
  let called = false;
  const registry = new KnowledgeRegistry([
    adapter("research", () => {
      called = true;
      return [];
    }),
  ]);
  await assert.rejects(() => runRetrieval(registry, "bail", { scopes: ["unknown" as KnowledgeScope] }), /UNKNOWN_SCOPE/);
  assert.equal(called, false);
});

// ---- quote ----

test("RAG-0 quote: a real quote is located with offsets and a hash", () => {
  const source = "The Court held that an agreement made by a minor is void.\n\nSection 11 applies.";
  const quote = "an agreement made by a minor is void";
  const located = locateQuote(quote, source);
  assert.ok(located);
  assert.equal(source.slice(located.start, located.end), quote);
  const check = verifyQuote(quote, source);
  assert.equal(check.verified, true);
  assert.equal(check.start, located.start);
  assert.equal(check.end, located.end);
  assert.equal(check.quoteHash, quoteHash(quote));
  assert.match(check.quoteHash, /^[a-f0-9]{64}$/);
});

test("RAG-0 quote: a whitespace-different quote is located, and the offsets point at the source", () => {
  const source = "The Court held   that an agreement\nmade by a minor is void.";
  const located = locateQuote("held that an agreement made", source);
  assert.ok(located);
  assert.equal(source.slice(located.start, located.end), "held   that an agreement\nmade");
  assert.equal(verifyQuote("The Court held that an agreement made by a minor is void.", source).verified, true);
});

test("RAG-0 quote: a fabricated quote is unverified, and a short quote is not evidence", () => {
  const source = "The Court held that an agreement made by a minor is void.";
  const fake = verifyQuote("an agreement made by a minor is voidable", source);
  assert.equal(fake.verified, false);
  assert.equal(fake.start, null);
  assert.match(fake.detail, /not present/);

  const short = verifyQuote("void", source);
  assert.equal(short.verified, false);
  assert.equal(short.start, null);
  assert.equal(QUOTE_MIN_CHARACTERS, 12);
  assert.match(short.detail, /12/);
  assert.equal(locateQuote("void", source), null);
});

// ---- citation ----

test("RAG-0 citation: a section and a rule/order key have stable ids and correct display text", () => {
  const section: CitationKey = { instrument: "ic:contract", kind: "section", number: "138", chapter: "XVII", version: 2 };
  const id = citationKeyId(section);
  assert.equal(citationKeyId({ ...section }), id);
  assert.match(id, /^ic:contract#section:138#chapter:XVII#v2$/);
  assert.notEqual(citationKeyId({ ...section, version: 3 }), id);
  assert.notEqual(citationKeyId({ ...section, chapter: "XVIII" }), id);
  assert.equal(citationKeyText(section, "Negotiable Instruments Act, 1881"), "Section 138, Chapter XVII, Negotiable Instruments Act, 1881");

  const rule: CitationKey = { instrument: "dhc-os-rules-2018", kind: "rule", number: "1", order: "XXXIX" };
  assert.equal(citationKeyText(rule, RULES_TITLE), "Order XXXIX Rule 1, Delhi High Court (Original Side) Rules, 2018");
  assert.match(citationKeyId(rule), /#order:XXXIX$/);
});

test("RAG-0 citation: a chapter or part is shown only when present, and an unmapped one is not invented", () => {
  const plain: CitationKey = { instrument: "ic:contract", kind: "section", number: "10" };
  const text = citationKeyText(plain, "The Indian Contract Act, 1872");
  assert.equal(text, "Section 10, The Indian Contract Act, 1872");
  assert.ok(!text.includes("Chapter"));
  assert.ok(!text.includes("Part"));

  const unmapped: CitationKey = { instrument: "ic:contract", kind: "section", number: "10", chapter: "unmapped" };
  assert.match(citationKeyText(unmapped, "The Indian Contract Act, 1872"), /Chapter unmapped/);

  const parts: CitationKey = { instrument: "ic:x", kind: "section", number: "138", sub: "(1)", clause: "a", proviso: "1" };
  assert.equal(citationKeyText(parts, "NI Act"), "Section 138(1)(a), proviso 1, NI Act");
});

test("RAG-0 citation: a real provision hit carries its key, and its anchor is the key id", async () => {
  const law = populated();
  const registry = createSkeletonKnowledge({ law });
  const procedure = await runRetrieval(registry, "written statement within 30 days", { scopes: ["procedure"] });
  const rule = procedure.hits.find((h) => h.citationKey?.kind === "rule" && h.citationKey.number === "3");
  assert.ok(rule);
  assert.ok(rule.citationKey);
  assert.equal(rule.anchor, citationKeyId(rule.citationKey));
  assert.equal(rule.citationKey.chapter, "I");
  assert.match(citationKeyText(rule.citationKey, RULES_TITLE), /Chapter I/);

  const statute = await runRetrieval(registry, "Section 10 of the Indian Contract Act", { scopes: ["statute"] });
  const section = statute.hits[0];
  assert.equal(section.citationKey?.number, "10");
  assert.equal(section.anchor, citationKeyId(section.citationKey!));
});

// ---- verification ----

test("RAG-0 verification: all dimensions verified is verified; changed, unreachable or never is unconfirmed", () => {
  const check = (dimension: VerificationDimension, state: VerificationState): VerificationCheck => ({ dimension, state, detail: dimension, checkedAt: "2026-11-18T00:00:00Z" });
  const all = VERIFICATION_DIMENSIONS.map((dimension) => check(dimension, "verified"));
  assert.equal(all.length, 7);
  assert.equal(summariseVerification(all), "verified");
  for (const bad of ["changed", "unreachable", "never"] as const) {
    assert.equal(
      summariseVerification(all.map((c) => (c.dimension === "quote" ? { ...c, state: bad } : c))),
      "unconfirmed",
      `${bad} makes the record unconfirmed`,
    );
  }
  assert.equal(summariseVerification([...all, check("quote", "changed")]), "unconfirmed", "a duplicate dimension keeps the worse state");
});

test("RAG-0 verification: not_applicable is partial, not unconfirmed, and the individual checks remain", () => {
  const check = (dimension: VerificationDimension, state: VerificationState): VerificationCheck => ({ dimension, state, detail: dimension, checkedAt: "2026-11-18T00:00:00Z" });
  const all = VERIFICATION_DIMENSIONS.map((dimension) => check(dimension, "verified"));
  const withNa = all.map((c) => (c.dimension === "treatment" ? { ...c, state: "not_applicable" as const } : c));
  assert.equal(summariseVerification(withNa), "partial");
  assert.notEqual(summariseVerification(withNa), "unconfirmed");
  assert.equal(withNa.length, 7);
  assert.equal(withNa.find((c) => c.dimension === "treatment")?.state, "not_applicable");
  assert.equal(summariseVerification(all.slice(0, 3)), "partial", "a missing dimension is partial");
  assert.equal(summariseVerification([]), "unconfirmed");
});

// ---- health and the skeleton ----

test("RAG-0 health: the skeleton registers seven scopes; the unbuilt scopes are deferred, not empty", () => {
  const registry = createSkeletonKnowledge({ law: store() });
  assert.deepEqual(registry.scopes(), ["advocate", "firm", "statute", "procedure", "matter", "research", "session"]);
  const health = new Map(registry.health().map((row) => [row.scope, row]));
  assert.equal(health.get("statute")?.state, "empty");
  assert.equal(health.get("procedure")?.state, "empty");
  assert.equal(health.get("research")?.state, "empty");
  assert.equal(health.get("matter")?.state, "deferred");
  assert.match(health.get("matter")?.detail ?? "", /No matter is bound/);
  assert.equal(health.get("firm")?.state, "deferred");
  assert.match(health.get("firm")?.detail ?? "", /RAG-3/);
  assert.equal(health.get("advocate")?.state, "deferred");
  assert.equal(health.get("session")?.state, "deferred");
});

test("RAG-0 health: a populated law store is ready, and a bound matter reports its rows", () => {
  const law = populated();
  const registry = createSkeletonKnowledge({ law, matter: { id: "m1", port: { search: () => [], rows: () => 12 } } });
  const health = new Map(registry.health().map((row) => [row.scope, row]));
  assert.equal(health.get("statute")?.state, "ready");
  assert.ok((health.get("statute")?.rows ?? 0) > 0);
  assert.equal(health.get("procedure")?.state, "ready");
  assert.equal(health.get("research")?.state, "ready");
  assert.equal(health.get("matter")?.state, "ready");
  assert.equal(health.get("matter")?.rows, 12);
  assert.match(health.get("matter")?.detail ?? "", /cannot open another matter/);
});

test("RAG-0 skeleton: four real scopes are searched, the other three are deferred, and the run writes nothing", async () => {
  const law = populated();
  const db = (law as unknown as { db: DatabaseSync }).db;
  const events = () => Number((db.prepare("SELECT count(*) AS n FROM event").get() as { n: number }).n);
  const before = law.counts();
  const beforeEvents = events();
  const registry = createSkeletonKnowledge({ law });
  const result = await runRetrieval(registry, "written statement within 30 days", { scopes: ["statute", "procedure", "research", "matter", "firm", "advocate", "session"] });

  assert.ok(result.hits.some((h) => h.scope === "procedure"));
  assert.deepEqual(result.coverage.searched, ["statute", "procedure", "research"]);
  assert.deepEqual(result.coverage.deferred.map((d) => d.scope), ["matter", "firm", "advocate", "session"]);
  assert.deepEqual(result.coverage.failed, []);
  assert.equal(result.coverage.partial, true);
  assert.deepEqual(result.notSearched.map((n) => n.scope), ["matter", "firm", "advocate", "session"]);
  assert.deepEqual(law.counts(), before, "the run did not write to the store");
  assert.equal(events(), beforeEvents, "the run appended no event");
  assert.equal(checkChain(db).ok, true);
});

test("RAG-0 skeleton: a governing date travels with the hit and its currentness check", async () => {
  const law = populated();
  const registry = createSkeletonKnowledge({ law });
  const inForce = await runRetrieval(registry, "Section 10 of the Indian Contract Act", { scopes: ["statute"], mode: "historical", date: "2020-05-01" });
  const hitNow = inForce.hits[0];
  assert.equal(hitNow.checks?.find((c) => c.dimension === "currentness")?.state, "verified");
  assert.match(hitNow.verification, /on 2020-05-01: in force/);

  const before = await runRetrieval(registry, "Section 10 of the Indian Contract Act", { scopes: ["statute"], mode: "historical", date: "1860-01-01" });
  const hitOld = before.hits[0];
  assert.equal(hitOld.checks?.find((c) => c.dimension === "currentness")?.state, "changed");
  assert.match(hitOld.verification, /on 1860-01-01: not yet in force/);
});

test("RAG-0 skeleton: a quote selected from a returned hit is verified against that hit's text", async () => {
  const law = populated();
  const registry = createSkeletonKnowledge({ law });
  const result = await runRetrieval(registry, "written statement within 30 days", { scopes: ["procedure"], limit: 5 });
  const hitRule = result.hits.find((h) => h.citationKey?.kind === "rule" && h.citationKey.number === "3");
  assert.ok(hitRule);
  const quote = "The written statement shall be filed within 30 days";
  const check = verifyQuote(quote, hitRule.text);
  assert.equal(check.verified, true);
  assert.equal(hitRule.text.slice(check.start!, check.end!), quote);
  assert.equal(hitRule.checks?.find((c) => c.dimension === "quote")?.state, "not_applicable", "the store hit carries no quote check; the quote gate makes one");
  assert.equal(summariseVerification(hitRule.checks ?? []), "partial");
});
