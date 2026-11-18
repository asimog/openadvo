/**
 * Phase 11 (D4): foreign elements and their route facts. A country must be written in the record;
 * a name alone is never a guess, and a route is a question with its provisions, never a decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { countryIn, foreignFromClause, foreignFromParty, routesFor, allRoutes } from "../../src/lib/jurisdiction/foreign.ts";
import { MatterStore, MatterStoreError } from "../../src/lib/matter-store/index.ts";

const advocate = { actor: "advocate" as const };

test("D4: a country in the record is read; an Indian place is not foreign; a surname is not a country", () => {
  assert.equal(countryIn("the seat of arbitration shall be Singapore"), "Singapore");
  assert.equal(countryIn("Acme Ltd, London"), "United Kingdom");
  assert.equal(countryIn("a party at Delhi"), null);
  assert.equal(countryIn("the supplier in Chennai"), null);
  assert.equal(countryIn("a party named Mehta"), null);
});

test("D4: a seat clause proposes a foreign seat; another clause with a country proposes a foreign party", () => {
  const seat = foreignFromClause({ kind: "seat", text: "The seat of arbitration shall be London.", sourceId: "s1", anchorId: "a1" });
  assert.equal(seat?.kind, "foreign_seat");
  assert.equal(seat?.country, "United Kingdom");
  const forum = foreignFromClause({ kind: "exclusive", text: "The courts at Singapore shall have exclusive jurisdiction.", sourceId: "s1", anchorId: "a2" });
  assert.equal(forum?.kind, "foreign_party");
  assert.equal(foreignFromClause({ kind: "exclusive", text: "The courts at Delhi shall have exclusive jurisdiction.", sourceId: "s1", anchorId: "a3" }), null);
  assert.equal(foreignFromParty({ name: "Acme Ltd", note: "registered in Singapore" })?.country, "Singapore");
  assert.equal(foreignFromParty({ name: "Acme Ltd" }), null);
});

test("D4: each element opens its routes with the provisions and the source", () => {
  const award = routesFor(["foreign_award"], "confirmed");
  assert.ok(award.some((r) => /Sections 44 to 52/.test(r.basis) && /Arbitration and Conciliation Act, 1996/.test(r.source)));
  assert.ok(award.every((r) => r.status === "confirmed" && r.note.length > 0));
  const judgment = routesFor(["foreign_judgment"], "proposed");
  assert.ok(judgment.some((r) => /Section 44A/.test(r.basis)));
  assert.ok(judgment.every((r) => r.status === "proposed"));
  assert.ok(allRoutes().length >= 10);
});

test("D4: the store records, proposes from the record, confirms and derives the routes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-foreign-"));
  const inbox = await mkdtemp(path.join(tmpdir(), "oa-foreign-in-"));
  const file = path.join(inbox, "agreement.txt");
  await writeFile(file, "The seat of arbitration shall be Singapore.\n");
  const store = await MatterStore.create(root, "Acme v. Beta", advocate);
  try {
    const added = await store.addFile(file, advocate);
    const source = added.source!;
    store.evidence.setForumClauses(source.id, [{ text: "The seat of arbitration shall be Singapore.", kind: "seat", anchorId: `${source.sha256}:1:1`, page: 1, line: 1 }]);
    const proposed = store.proposeForeignFromRecord([{ name: "Acme Ltd", note: "a company registered in Singapore" }], { actor: "agent" });
    assert.equal(proposed.filter((e) => e.kind === "foreign_seat").length, 1);
    assert.equal(proposed.filter((e) => e.kind === "foreign_party").length, 1);
    assert.ok(proposed.every((e) => e.status === "proposed"));
    assert.ok(store.foreignRoutes().every((r) => r.status === "proposed"));
    assert.ok(store.foreignRoutes().some((r) => /law of the seat/.test(r.route)));
    const confirmed = store.decideForeignElement(proposed[0].id, "confirmed", advocate);
    assert.equal(confirmed.status, "confirmed");
    assert.ok(store.foreignRoutes().some((r) => r.status === "confirmed"));
    assert.throws(() => store.decideForeignElement(proposed[0].id, "rejected", advocate), /ALREADY_DECIDED/);
    assert.throws(() => store.decideForeignElement(proposed[1].id, "confirmed", { actor: "agent" }), (e: unknown) => e instanceof MatterStoreError && e.code === "HUMAN_ONLY");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
});
