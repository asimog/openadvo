import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { stageIndex, stageListFor } from "../../src/lib/stages/index.ts";
import { proposeClassification } from "../../src/lib/classification/index.ts";

const advocate = { actor: "advocate" as const };

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows may hold the sqlite file for a moment after close; the temporary folder does no harm.
  }
}

test("C1: the matter profile records every field and keeps a bad date empty", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-profile-"));
  try {
    const a = await MatterStore.create(dir, "Asha v. State", advocate);
    const p = a.setProfile({ court: "Delhi High Court", proceeding: "Bail application", side: "accused", cnr: "DLHC010001232024", filingDate: "2026-02-30", stage: "Arguments" }, advocate);
    assert.equal(p.court, "Delhi High Court");
    assert.equal(p.filingDate, "");
    assert.equal(p.stage, "Arguments");
    assert.equal(a.profile().cnr, "DLHC010001232024");
    assert.throws(() => a.setProfile({ stage: "Order" }, { actor: "agent" }), /HUMAN_ONLY/);
    a.close();
  } finally {
    cleanup(dir);
  }
});

test("C4: each proceeding has its own stage list", () => {
  assert.equal(stageListFor("Bail application").key, "bail");
  assert.equal(stageListFor("Civil suit").key, "suit");
  assert.equal(stageListFor("Writ petition under Article 226").key, "writ");
  assert.equal(stageListFor("Special leave petition").key, "appeal");
  assert.equal(stageListFor("Execution").key, "execution");
  assert.equal(stageListFor("Arbitration petition under section 34").key, "arbitration");
  assert.equal(stageIndex(stageListFor("bail"), "Arguments"), 3);
  assert.equal(stageIndex(stageListFor("bail"), "Not a stage"), -1);
});

test("C3: the classification proposal has a basis and never invents a court", () => {
  const p = proposeClassification({
    title: "Asha v. State",
    profile: { court: "", bench: "", practiceArea: "", caseType: "", proceeding: "", side: "", caseNumber: "", cnr: "", filingDate: "", institutionDate: "", governingDate: "", stage: "", relief: "", updatedAt: null },
    parties: [{ role: "petitioner", nameInRecord: "Asha" }],
    sourceNames: ["bail application.pdf"],
  });
  assert.equal(p.practiceArea, "criminal");
  assert.equal(p.caseType, "Bail application");
  assert.equal(p.court, "");
  assert.ok(p.basis.length > 0);
  assert.equal(p.parties[0].name, "Asha");
});

test("C6, C8: a related matter is one edge; a party keeps its counsel", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-related-"));
  try {
    const a = await MatterStore.create(dir, "First", advocate);
    const b = await MatterStore.create(dir, "Second", advocate);
    const edge = a.addRelated(b.matter().id, "appeal_from", "The appeal from this matter", advocate);
    assert.equal(edge.relation, "appeal_from");
    assert.equal(a.related().length, 1);
    assert.throws(() => a.addRelated(a.matter().id, "connected", "", advocate), /RELATED_SELF/);
    const party = a.addParty("contact-1", "petitioner", "Asha", advocate, "A. Advocate");
    assert.equal(party.counsel, "A. Advocate");
    a.close();
    b.close();
  } finally {
    cleanup(dir);
  }
});
