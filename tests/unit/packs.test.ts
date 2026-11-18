/**
 * Phase 8 (N4, Q3): the practice packs. The four packs check; the SLP pack owns the filing set,
 * the limitation rule, the workflow and the generators; a skill outside its pack is refused;
 * the in-sc adapter keeps the quoted rules and no longer holds the SLP practice content.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPacks, checkPack, filingPlan, packForMatter, skillPackRefusal, skillsOfPack } from "../../src/lib/packs/index.ts";
import { condonationBlocks, petitionBlocks } from "../../src/lib/packs/slp.ts";
import type { AdapterDefinition } from "../../src/shared/intel.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const raw = (name: string) => JSON.parse(readFileSync(path.join(repo, "packs", `${name}.json`), "utf8")) as unknown;
const PACK_FILES = ["criminal", "civil", "writ", "slp", "commercial", "family", "property", "insolvency", "banking", "tax", "service", "consumer", "ip", "environmental", "competition", "administrative", "insurance", "immigration", "rera", "motor", "cheque"];
const built = buildPacks(PACK_FILES.map(raw));

test("the 21 practice packs check, with their proceedings and acts", () => {
  assert.deepEqual(built.summaries.filter((s) => s.error).map((s) => [s.id, s.error]), []);
  assert.deepEqual(built.packs.map((p) => p.id).sort(), [...PACK_FILES].sort());
  for (const p of built.packs) {
    assert.ok(p.proceedings.length > 0, p.id);
    assert.ok(p.acts.length > 0, p.id);
    for (const a of p.acts) assert.ok(a.version.length > 0 && a.source.length > 0, `${p.id}: ${a.act}`);
  }
  const slp = built.packs.find((p) => p.id === "slp")!;
  assert.equal(slp.default, true);
  assert.deepEqual(slp.courts, ["in.sc"]);
  const civil = slp.proceedings.find((p) => p.caseType === "SLP(C)")!;
  assert.deepEqual(civil.documents.map((d) => d.kind), ["synopsis", "list_of_dates", "petition", "questions_of_law", "grounds"]);
  assert.equal(civil.limitation?.days, 90);
  assert.match(civil.limitation?.source ?? "", /Order XXI rule 1/);
  assert.ok(civil.workflow.some((s) => s.skill === "SK-308"));
});

test("a pack is refused for an unknown id, a bad version, a proceeding with no case type and a bad limitation", () => {
  assert.match(checkPack({ ...(raw("civil") as object), id: "not-a-pack" }).errors.join("; "), /id must be one of/);
  assert.match(checkPack({ ...(raw("civil") as object), version: "1" }).errors.join("; "), /version must be n\.n\.n/);
  const bad = JSON.parse(JSON.stringify(raw("civil"))) as { proceedings: Array<Record<string, unknown>> };
  bad.proceedings[0].caseType = "";
  assert.match(checkPack(bad).errors.join("; "), /caseType is required/);
  const lim = JSON.parse(JSON.stringify(raw("civil"))) as { proceedings: Array<Record<string, unknown>> };
  lim.proceedings[0].limitation = { id: "x", title: "x", days: 0, from: "x", source: "x" };
  assert.match(checkPack(lim).errors.join("; "), /limitation days/);
});

test("the pack of a matter: its proceeding, practice, court, then the default SLP pack", () => {
  const byProceeding = packForMatter(built.packs, { practiceArea: "", caseType: "Bail application", proceeding: "", court: "" })!;
  assert.equal(byProceeding.pack.id, "criminal");
  assert.equal(byProceeding.proceeding?.key, "bail");
  assert.equal(byProceeding.source, "proceeding");

  const byPractice = packForMatter(built.packs, { practiceArea: "constitutional", caseType: "", proceeding: "", court: "" })!;
  assert.equal(byPractice.pack.id, "writ");
  assert.equal(byPractice.source, "practice");

  const byCourt = packForMatter(built.packs, { practiceArea: "", caseType: "", proceeding: "", court: "in.sc" })!;
  assert.equal(byCourt.pack.id, "slp");
  assert.equal(byCourt.source, "court");

  const byDefault = packForMatter(built.packs, { practiceArea: "", caseType: "", proceeding: "", court: "" })!;
  assert.equal(byDefault.pack.id, "slp");
  assert.equal(byDefault.source, "default");
});

test("a skill runs only inside its pack; general applies everywhere; an unknown pack is a notice", () => {
  const criminal = packForMatter(built.packs, { practiceArea: "criminal", caseType: "Bail application", proceeding: "", court: "" })!;
  assert.deepEqual(skillPackRefusal(["general"], criminal), { refusal: null, notice: null });
  assert.deepEqual(skillPackRefusal(["criminal", "bail"], criminal).refusal, null);
  assert.match(skillPackRefusal(["writ"], criminal).refusal ?? "", /belongs to the writ pack/);
  const unknown = packForMatter(built.packs, { practiceArea: "", caseType: "", proceeding: "", court: "" })!;
  assert.equal(unknown.source, "default");
  assert.match(skillPackRefusal(["criminal"], unknown).notice ?? "", /default Supreme Court SLP pack/);
});

test("the filing plan of the SLP pack: the set, the late condonation and the workflow", () => {
  const choice = packForMatter(built.packs, { practiceArea: "", caseType: "SLP(C)", proceeding: "", court: "in.sc" })!;
  const plan = filingPlan(choice)!;
  assert.equal(plan.packId, "slp");
  assert.equal(plan.caseType, "SLP(C)");
  assert.deepEqual(plan.documents.map((d) => d.kind), ["synopsis", "list_of_dates", "petition", "questions_of_law", "grounds"]);
  assert.deepEqual(choice.proceeding?.lateDocuments.map((d) => d.kind), ["condonation"]);
  assert.deepEqual(plan.annexureParts, ["Certified copy of the impugned judgment", "Annexures"]);
  assert.ok(plan.workflow.length >= 5);
  assert.ok(skillsOfPack(built.packs, "slp").includes("SK-308"));
});

test("the SLP generators keep their text: the petition and the condonation application", () => {
  const blocks = petitionBlocks({
    petitioner: "Asha", respondent: "State", court: "High Court of Delhi", caseNumber: "W.P.(C) 12/2023",
    impugnedDate: "2024-03-12", impugnedEventId: "ev-1", questions: ["Whether the order is perverse"], grounds: ["Because the finding has no evidence"],
    annexures: [{ label: "Annexure P-1", title: "The order" }], year: 2026,
  });
  const text = blocks.map((b) => b.text).join("\n");
  assert.match(text, /IN THE SUPREME COURT OF INDIA/);
  assert.match(text, /PETITION UNDER ARTICLE 136/);
  assert.match(text, /grant special leave to appeal against the impugned final judgment and order dated 12\.03\.2024/);
  assert.ok(blocks.find((b) => b.text.startsWith("1. The Petitioner seeks"))?.eventIds?.includes("ev-1"));
  const c = condonationBlocks({
    petitioner: "Asha", respondent: "State", court: "High Court of Delhi", caseNumber: "W.P.(C) 12/2023",
    impugnedDate: "2024-03-12", deadline: "2024-06-10", delayDays: 25, asOf: "2024-07-05", year: 2026,
  }).map((b) => b.text);
  assert.ok(c.some((t) => /condone the delay of 25 day\(s\)/.test(t)));
});

test("the in-sc adapter keeps the quoted rules and hands the SLP practice content to the pack", () => {
  const adapter = JSON.parse(readFileSync(path.join(repo, "adapters", "in-sc", "adapter.json"), "utf8")) as AdapterDefinition;
  assert.ok(adapter.lists.some((l) => l.key === "filing.slp_civil"));
  assert.ok(!adapter.lists.some((l) => l.key === "workflow.slp_civil"));
  const p = adapter.proceedings.find((x) => x.caseType === "SLP(C)")!;
  assert.deepEqual(p.requiredParts, []);
  assert.equal(p.workflow, undefined);
  assert.equal(p.limitation, undefined);
  assert.equal(p.checklist, "filing.slp_civil");
  const slp = built.packs.find((x) => x.id === "slp")!;
  assert.ok(slp.proceedings.find((x) => x.caseType === "SLP(C)")?.documents.length);
});
