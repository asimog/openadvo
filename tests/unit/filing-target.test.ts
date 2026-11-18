/**
 * Phase 6 (L1, P5, P11): the filing set of a court pack. The target's proceeding pack drives the
 * required documents; the procedure rows (forum, route, limitation, rule currency) read the
 * jurisdiction report and the pack lists; the unmapped parts are named, never dropped silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { Matters } from "../../src/main/matters.ts";
import { Filing, type FilingPack } from "../../src/main/filing.ts";
import { buildPacks, filingPlan, packForMatter } from "../../src/lib/packs/index.ts";
import type { AdapterDefinition } from "../../src/shared/intel.ts";

const DHC_PACK: Array<{ key: string; caseType: string; requiredParts: string[] }> = (() => {
  const adapter = JSON.parse(readFileSync(path.join("adapters", "in-hc-delhi", "adapter.json"), "utf8")) as AdapterDefinition;
  return (adapter.proceedings ?? []).map((p) => ({ key: p.key, caseType: p.caseType, requiredParts: p.requiredParts }));
})();

/** Phase 8 (Q3): the SLP pack, as main/index.ts builds it from packs/slp.json. */
const SLP_PACK: FilingPack = (() => {
  const { packs } = buildPacks([JSON.parse(readFileSync(path.join("packs", "slp.json"), "utf8"))]);
  const choice = packForMatter(packs, { practiceArea: "", caseType: "", proceeding: "", court: "" })!;
  const plan = filingPlan(choice)!;
  return {
    requiredParts: plan.documents.map((d) => d.title),
    caseType: plan.caseType,
    limitation: plan.limitation,
    packId: plan.packId,
    packTitle: plan.packTitle,
    proceeding: plan.proceedingKey,
    proceedingTitle: plan.proceedingTitle,
    source: plan.source,
    documents: plan.documents as FilingPack["documents"],
    annexureParts: plan.annexureParts,
    unmappedParts: plan.unmappedParts,
    lateDocuments: choice.proceeding?.lateDocuments as FilingPack["lateDocuments"],
    workflow: plan.workflow,
  };
})();

async function filing(): Promise<{ f: Filing; matters: Matters; matterId: string }> {
  const matters = new Matters(mkdtempSync(path.join(tmpdir(), "filing-")));
  const matter = await matters.create("X v Y");
  const f = new Filing(matters, "");
  f.proceedingPack = async () => SLP_PACK;
  return { f, matters, matterId: matter.id };
}

test("with no target, the default SLP pack supplies the set and the limitation", async () => {
  const { f, matterId } = await filing();
  const st = await f.state(matterId);
  assert.deepEqual(
    st.required.map((r) => r.kind),
    ["synopsis", "list_of_dates", "petition", "questions_of_law", "grounds"],
  );
  assert.deepEqual(st.unmapped, []);
  assert.equal(st.pack?.id, "slp");
  assert.equal(st.pack?.source, "default");
  assert.equal(st.pack?.limitation?.days, 90);
});

test("the DHC W.P.(C) pack drives the required documents, from the adapter's own words", async () => {
  const { f, matters, matterId } = await filing();
  const store = await matters.store(matterId);
  store.setFilingTarget({ court: "in.hc.delhi", caseType: "W.P.(C)", listKey: "filing.efiling_format", adapterId: "in-hc-delhi" }, { actor: "advocate" });
  const pack = DHC_PACK.find((p) => p.caseType === "W.P.(C)")!;
  f.proceedingPack = async () => ({ requiredParts: pack.requiredParts, caseType: pack.caseType });
  const st = await f.state(matterId);
  assert.deepEqual(
    st.required.map((r) => r.kind),
    ["memo_of_parties", "writ_petition", "affidavit", "vakalatnama"],
  );
  // The pack's "Annexures" part belongs to the annexure manager: its row names it.
  const packRows = st.compliance.results.filter((r) => r.rule.startsWith("PACK-"));
  assert.equal(packRows.length, 1);
  assert.equal(packRows[0]?.rule, "PACK-A1");
  assert.equal(packRows[0]?.outcome, "not_checked");
  assert.match(packRows[0]?.detail ?? "", /Annexures/);
});

test("a pack part the application cannot map is named, never dropped silently", async () => {
  const { f, matters, matterId } = await filing();
  const store = await matters.store(matterId);
  store.setFilingTarget({ court: "in.hc.delhi", caseType: "W.P.(C)", listKey: null, adapterId: "in-hc-delhi" }, { actor: "advocate" });
  f.proceedingPack = async () => ({ requiredParts: ["Writ petition", "A signed oath the application does not know"], caseType: "W.P.(C)" });
  const st = await f.state(matterId);
  assert.deepEqual(st.unmapped, ["A signed oath the application does not know"]);
  const row = st.compliance.results.find((r) => r.rule === "PACK-U1");
  assert.equal(row?.outcome, "not_checked");
  assert.match(row?.detail ?? "", /no document of its catalogue/);
});

test("the procedure rows read the target, the report and the pack lists (P5)", async () => {
  const { f, matters, matterId } = await filing();
  const noTarget = await f.state(matterId);
  assert.equal(noTarget.compliance.results.find((r) => r.rule === "PROC-forum")?.outcome, "not_checked");

  const store = await matters.store(matterId);
  store.setFilingTarget({ court: "in.hc.delhi", caseType: "W.P.(C)", listKey: null, adapterId: "in-hc-delhi" }, { actor: "advocate" });
  const pack = DHC_PACK.find((p) => p.caseType === "W.P.(C)")!;
  f.proceedingPack = async () => ({ requiredParts: pack.requiredParts, caseType: pack.caseType });
  const st = await f.state(matterId);
  const byRule = new Map(st.compliance.results.map((r) => [r.rule, r]));

  // No jurisdiction report yet: the forum row says so, never "passed".
  assert.equal(byRule.get("PROC-forum")?.outcome, "not_checked");
  assert.match(byRule.get("PROC-forum")?.detail ?? "", /No jurisdiction report/);
  assert.equal(byRule.get("PROC-route")?.outcome, "not_checked");

  // The W.P.(C) pack states no limitation rule of its own; the row says so, and the SLP
  // limitation rule never shows as this proceeding's own (P-4 overridden, not checked).
  assert.equal(byRule.get("PROC-limitation")?.outcome, "not_checked");
  assert.match(byRule.get("PROC-limitation")?.detail ?? "", /no limitation rule/);
  const p4 = st.compliance.results.find((r) => r.rule === "P-4");
  assert.equal(p4?.outcome, "not_checked");
  assert.match(p4?.detail ?? "", /no limitation rule of its own/);

  // With a fresh list built, the rule-currency row passes; a stale list is unconfirmed.
  assert.equal(byRule.get("PROC-rules")?.outcome, "not_checked");
  f.packFreshness = async () => [{ list: "E-filing format", state: "fresh", since: "" }];
  const fresh = await f.state(matterId);
  assert.equal(fresh.compliance.results.find((r) => r.rule === "PROC-rules")?.outcome, "pass");
  f.packFreshness = async () => [{ list: "E-filing format", state: "stale", since: "2026-01-01" }];
  const stale = await f.state(matterId);
  const row = stale.compliance.results.find((r) => r.rule === "PROC-rules");
  assert.equal(row?.outcome, "defect");
  assert.match(row?.detail ?? "", /stale since 2026-01-01/);
});

test("the forum row compares the report's forum with the target court", async () => {
  const { f, matters, matterId } = await filing();
  const store = await matters.store(matterId);
  store.setFilingTarget({ court: "in.hc.delhi", caseType: "W.P.(C)", listKey: null, adapterId: "in-hc-delhi" }, { actor: "advocate" });
  const pack = DHC_PACK.find((p) => p.caseType === "W.P.(C)")!;
  f.proceedingPack = async () => ({ requiredParts: pack.requiredParts, caseType: pack.caseType });
  store.evidence.setJurisdictionSystem({
    forum: "High Court of Delhi",
    courtType: "Writ petition",
    territorialBasis: "the cause of action arose in Delhi",
    subjectBasis: "",
    provisions: ["Article 226 of the Constitution"],
    alternativeForums: [],
    limitation: "",
    appealRoute: "a division bench of the Delhi High Court",
    applicableRules: [],
    unresolvedFacts: [],
    undetermined: false,
    basis: [],
    updatedAt: new Date().toISOString(),
  });
  const st = await f.state(matterId);
  const byRule = new Map(st.compliance.results.map((r) => [r.rule, r]));
  assert.equal(byRule.get("PROC-forum")?.outcome, "pass");
  assert.equal(byRule.get("PROC-route")?.outcome, "pass");

  store.evidence.setJurisdictionSystem({
    forum: "Punjab and Haryana High Court",
    courtType: "Writ petition",
    territorialBasis: "",
    subjectBasis: "",
    provisions: [],
    alternativeForums: [],
    limitation: "",
    appealRoute: "",
    applicableRules: [],
    unresolvedFacts: [],
    undetermined: false,
    basis: [],
    updatedAt: new Date().toISOString(),
  });
  const wrong = await f.state(matterId);
  const wrongByRule = new Map(wrong.compliance.results.map((r) => [r.rule, r]));
  assert.equal(wrongByRule.get("PROC-forum")?.outcome, "defect");
  assert.match(wrongByRule.get("PROC-forum")?.detail ?? "", /does not name the target court/);
});
