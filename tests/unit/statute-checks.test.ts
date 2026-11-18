/**
 * Phase 6 (P4): the statute checks. In force on the governing date, the correct version, amended
 * or repealed. A row never verified makes the item unconfirmed, never passed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStatutes, findStatuteReferences } from "../../src/lib/verification/statute.ts";

type Row = { act: string; section: string; status: string; version: number | null; validFrom: string | null; validUntil: string | null; current: number; checkState: string; sourceRef: string };

const IN_FORCE: Row = { act: "Code of Civil Procedure, 1908", section: "151", status: "in_force", version: 1, validFrom: "1909-01-01", validUntil: null, current: 1, checkState: "verified", sourceRef: "indiacode:cpc" };
const REPEALED: Row = { act: "Indian Penal Code, 1860", section: "303", status: "repealed", version: 1, validFrom: null, validUntil: null, current: 1, checkState: "verified", sourceRef: "indiacode:ipc" };
const NOT_YET: Row = { act: "Bharatiya Nyaya Sanhita, 2023", section: "103", status: "in_force", version: 1, validFrom: "2024-07-01", validUntil: null, current: 1, checkState: "verified", sourceRef: "indiacode:bns" };
const OLD_VERSION: Row = { act: "Limitation Act, 1963", section: "5", status: "superseded", version: 1, validFrom: null, validUntil: "2023-12-31", current: 0, checkState: "verified", sourceRef: "indiacode:limitation" };
const NEVER_VERIFIED: Row = { act: "Code of Criminal Procedure, 1973", section: "482", status: "in_force", version: 1, validFrom: null, validUntil: null, current: 1, checkState: "never", sourceRef: "indiacode:crpc" };

const rowsOf = (rows: Row[]) => (act: string) => (rows.some((r) => r.act.toLowerCase().includes(act.toLowerCase().split(",")[0])) ? rows : null);

test("the reference finder reads the words of the draft", () => {
  const refs = findStatuteReferences("Reliance is placed on section 151 of the Code of Civil Procedure, 1908 and Article 226 of the Constitution.");
  assert.deepEqual(refs.map((r) => `${r.section} of ${r.act}`), ["151 of Code of Civil Procedure, 1908", "226 of Constitution of India"]);
});

test("a provision in force on the governing date passes", () => {
  const result = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 151 of the Code of Civil Procedure, 1908 saves the court's inherent power." }],
    governingDate: "2024-05-01",
    lookup: rowsOf([IN_FORCE]),
  });
  assert.equal(result.items.length, 0);
  assert.match(result.governingDateBasis, /2024-05-01/);
});

test("a repealed provision and a version not yet in force are defects", () => {
  const repealed = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 303 of the Indian Penal Code, 1860 is relied on." }],
    governingDate: "2024-05-01",
    lookup: rowsOf([REPEALED]),
  });
  assert.equal(repealed.items[0]?.kind, "statute_repealed");

  const notYet = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 103 of the Bharatiya Nyaya Sanhita, 2023 applies." }],
    governingDate: "2023-06-01",
    lookup: rowsOf([NOT_YET]),
  });
  assert.equal(notYet.items[0]?.kind, "statute_not_yet_in_force");
});

test("a superseded row is the wrong version; an unverified row is unconfirmed, never passed", () => {
  const old = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 5 of the Limitation Act, 1963 explains the delay." }],
    governingDate: "2024-05-01",
    lookup: rowsOf([OLD_VERSION]),
  });
  assert.equal(old.items[0]?.kind, "statute_ceased");

  const never = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 482 of the Code of Criminal Procedure, 1973 quashes the FIR." }],
    governingDate: "2024-05-01",
    lookup: rowsOf([NEVER_VERIFIED]),
  });
  assert.equal(never.items[0]?.kind, "statute_unconfirmed");
  assert.match(never.items[0]?.evidence ?? "", /never verified/);
});

test("a reference the library holds nothing for is reported for the advocate, never passed", () => {
  const result = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 9 of the Arbitration Act, 1940 applies." }],
    governingDate: "2024-05-01",
    lookup: () => null,
  });
  assert.equal(result.items[0]?.kind, "statute_not_found");
  assert.equal(result.notRun.length, 0);
});

test("no governing date is named, and the check says so", () => {
  const result = checkStatutes({
    paragraphs: [{ anchor: "oa-1", text: "Section 151 of the Code of Civil Procedure, 1908 saves the court's inherent power." }],
    governingDate: null,
    lookup: rowsOf([IN_FORCE]),
  });
  assert.equal(result.items.length, 0);
  assert.ok(result.notRun.some((n) => n.check === "The version in force on the governing date"));
  assert.match(result.governingDateBasis, /no governing date/);
});
