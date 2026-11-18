/** I1: the context package builder (architecture.md section 5; docs/specs/harness-and-stores.md section 3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackage, classify, packageHash, renderPackage, tokensOf, type ContextItem } from "../../src/lib/context-package/index.ts";
import { keywords, pinnedRefs } from "../../src/main/context-assembly.ts";

const M = "matter-1";
const item = (over: Partial<ContextItem> & Pick<ContextItem, "id" | "kind">): ContextItem => ({ label: over.id, text: `text of ${over.id}`, anchors: [over.id], matterId: M, relevance: 0.5, ...over });
const base = { matterId: M, skillId: "SK-900", skillVersion: "0.1.0", packageType: "matter" as const, request: "", id: "pkg-test", now: "2026-11-15T00:00:00Z" };

test("classify: the skill's question type wins, then the request's words, then the package type", () => {
  assert.equal(classify({ packageType: "matter", questionType: "law", request: "what happened" }).questionType, "law");
  assert.equal(classify({ packageType: "matter", questionType: null, request: "What did the court direct on the last date?" }).questionType, "court_directed");
  assert.equal(classify({ packageType: "matter", questionType: null, request: "find the binding authority" }).questionType, "law");
  assert.equal(classify({ packageType: "research", questionType: null, request: "go" }).questionType, "law");
  assert.equal(classify({ packageType: "hearing", questionType: null, request: "go" }).questionType, "court_directed");
});

test("ranking by question type: law puts authority first; what happened puts the record lines first; pinned items lead both", () => {
  const items = [item({ id: "a1", kind: "authority" }), item({ id: "l1", kind: "line" }), item({ id: "e1", kind: "event" }), item({ id: "p1", kind: "pinned", pinned: true })];
  const law = buildPackage({ ...base, questionType: "law", budget: 10_000, items });
  assert.deepEqual(law.items.map((i) => i.id), ["p1", "a1", "l1", "e1"]);
  const happened = buildPackage({ ...base, questionType: "happened", budget: 10_000, items });
  assert.deepEqual(happened.items.map((i) => i.id), ["p1", "l1", "e1", "a1"]);
  // Inside a kind: confirmed before proposed, then relevance.
  const events = buildPackage({ ...base, questionType: "happened", budget: 10_000, items: [item({ id: "e-low", kind: "event", relevance: 0.9, verification: "proposed" }), item({ id: "e-conf", kind: "event", relevance: 0.1, verification: "confirmed" })] });
  assert.deepEqual(events.items.map((i) => i.id), ["e-conf", "e-low"]);
});

test("the scope check refuses another matter's records before ranking, and duplicates are left out with the reason", () => {
  const same = "The petitioner was dismissed from service on 12 March 2019 by the order under challenge.";
  const p = buildPackage({
    ...base,
    questionType: "happened",
    budget: 10_000,
    items: [item({ id: "x1", kind: "line", matterId: "other-matter" }), item({ id: "l1", kind: "line", text: same }), item({ id: "l2", kind: "line", text: same.toUpperCase() }), item({ id: "l1", kind: "line" })],
  });
  assert.deepEqual(p.items.map((i) => i.id), ["l1"]);
  assert.deepEqual(p.record.excluded.map((e) => [e.id, e.reason]), [["x1", "another matter: facts never cross matters"], ["l2", "duplicate of l1"]]);
});

test("the budget: long items are shortened with their anchors kept; what does not fit is left out with the reason", () => {
  const long = item({ id: "big", kind: "line", text: "x".repeat(20_000), anchors: ["sha:1:2"] });
  const p = buildPackage({ ...base, questionType: "happened", budget: 1000, items: [long, ...Array.from({ length: 40 }, (_, k) => item({ id: `e${k}`, kind: "event", text: `${k} `.padEnd(400, "y") }))] });
  const big = p.items.find((i) => i.id === "big")!;
  assert.ok(big.text.length < 1100 && big.text.endsWith("[…]"));
  assert.deepEqual(big.anchors, ["sha:1:2"]);
  assert.equal(p.record.included.find((i) => i.id === "big")!.shortened, true);
  assert.ok(p.record.tokens <= 1000);
  assert.ok(p.record.excluded.some((e) => e.reason === "over the budget"));
  assert.equal(p.record.included.length + p.record.excluded.length, 41);
});

test("both sides of a conflict go in together or stay out together, and the flags stay inside", () => {
  const sideA = item({ id: "c#a", kind: "conflict", conflictGroup: "c1", text: "a".repeat(600), disputed: true });
  const sideB = item({ id: "c#b", kind: "conflict", conflictGroup: "c1", text: "b".repeat(600), disputed: true });
  const stale = item({ id: "m1", kind: "memory", stale: true, superseded: true });
  const fits = buildPackage({ ...base, questionType: "happened", budget: 5000, items: [sideA, stale, sideB] });
  assert.deepEqual(fits.items.filter((i) => i.kind === "conflict").map((i) => i.id), ["c#a", "c#b"]);
  assert.deepEqual(fits.record.included.find((i) => i.id === "c#a")!.flags, ["disputed", "conflict c1"]);
  assert.deepEqual(fits.record.included.find((i) => i.id === "m1")!.flags, ["stale", "superseded"]);
  assert.match(renderPackage(fits), /flags="stale; superseded"/);
  const tight = buildPackage({ ...base, questionType: "happened", budget: 200, items: [sideA, sideB] });
  assert.equal(tight.items.length, 0);
  assert.deepEqual(tight.record.excluded.map((e) => e.reason), ["over the budget, with the other side of its conflict", "over the budget, with the other side of its conflict"]);
});

test("the record and the cache: the same inputs give the same hash; a changed item changes it", () => {
  const items = [item({ id: "l1", kind: "line" }), item({ id: "e1", kind: "event" })];
  const a = buildPackage({ ...base, questionType: "happened", budget: 2000, items });
  const b = buildPackage({ ...base, questionType: "happened", budget: 2000, items: [...items].reverse() });
  assert.equal(a.record.hash, b.record.hash);
  assert.notEqual(packageHash({ ...base, budget: 2000, items: [item({ id: "l1", kind: "line", text: "changed" }), items[1]] }), a.record.hash);
  assert.equal(a.record.skillId, "SK-900");
  assert.equal(a.record.tokens, a.items.reduce((n, i) => n + tokensOf(i.text) + 12, 0));
  assert.match(renderPackage(a), /<context-package id="pkg-test" skill="SK-900@0.1.0" question="happened"/);
});

test("retrieval helpers: the request's main words, and the records pinned with @", () => {
  assert.deepEqual(keywords("Please check the dismissal order and the limitation"), ["limitation", "dismissal", "order"]);
  assert.deepEqual(pinnedRefs("see @[source:abc Order.pdf] and @[event:ev:1:2:3] and @[issue:other/xyz]"), [
    { kind: "source", id: "abc", matterId: null },
    { kind: "event", id: "ev:1:2:3", matterId: null },
    { kind: "issue", id: "xyz", matterId: "other" },
  ]);
});

test("M2: an approved precedent is carried in a drafting package and ranked before the record", () => {
  const items = [item({ id: "l1", kind: "line" }), item({ id: "pr1", kind: "precedent", matterId: null, text: "Precedent Bail application (pleading, approved, in.hc.delhi). Offered first: approved, for in.hc.delhi.", relevance: 0.9, verification: "confirmed" })];
  const p = buildPackage({ ...base, questionType: "happened", budget: 5000, items });
  assert.deepEqual(p.items.map((i) => i.id), ["pr1", "l1"]);
  assert.equal(p.record.included.find((i) => i.id === "pr1")!.kind, "precedent");
});
