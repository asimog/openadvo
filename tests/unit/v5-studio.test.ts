/** V5-9 to V5-12: quick check, support and voice, treatment, rehearsal, trends. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { disposalClass, overrulingCheck, quickCheck } from "../../src/lib/matter-store/authority2.ts";
import { rehearse } from "../../src/lib/studio/rehearsal.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";

const adv = { actor: "advocate" as const };

test("quick check: found, not found, mismatch naming the field, unavailable when the year is not indexed", () => {
  const index = {
    yearIndexed: (y: number) => y === 2023,
    byInsc: (c: string) => (c === "2023 INSC 1043" ? { title: "ELDECO HOUSING AND INDUSTRIES LIMITED versus ASHOK VIDYARTHI", decisionDate: "2023-11-30" } : undefined),
  };
  assert.equal(quickCheck("2023 INSC 1043", { parties: "Eldeco Housing v. Ashok Vidyarthi", decisionDate: "2023-11-30" }, index).outcome, "found");
  assert.deepEqual(
    (({ outcome, field }) => ({ outcome, field }))(quickCheck("2023 INSC 1043", { parties: "", decisionDate: "2023-11-29" }, index)),
    { outcome: "mismatch", field: "decision date" },
  );
  assert.equal(quickCheck("2023 INSC 1043", { parties: "Ram Lal v. State of Rajasthan", decisionDate: "" }, index).field, "parties");
  assert.equal(quickCheck("2023 INSC 7", { parties: "", decisionDate: "" }, index).outcome, "not_found");
  assert.equal(quickCheck("2019 INSC 7", { parties: "", decisionDate: "" }, index).outcome, "unavailable");
  assert.equal(quickCheck("(2014) 8 SCC 273", { parties: "", decisionDate: "" }, index).outcome, "unavailable");
});

test("the overruling check: a smaller bench, an earlier judgment, or missing facts; never a guess", () => {
  const base = { kind: "overruled" as const, byCitation: "2020 INSC 5" };
  assert.equal(overrulingCheck({ ...base, byDate: "2020-01-01", byBench: 2, authorityDate: "2010-01-01", authorityBench: 3 })?.kind, "smaller_bench");
  assert.equal(overrulingCheck({ ...base, byDate: "2009-01-01", byBench: 5, authorityDate: "2010-01-01", authorityBench: 3 })?.kind, "earlier_judgment");
  assert.equal(overrulingCheck({ ...base, byDate: "", byBench: 5, authorityDate: "2010-01-01", authorityBench: 3 })?.kind, "missing_facts");
  assert.equal(overrulingCheck({ ...base, byDate: "2020-01-01", byBench: 5, authorityDate: "2010-01-01", authorityBench: 3 }), null);
  assert.equal(overrulingCheck({ ...base, kind: "doubted" as never, byDate: "", byBench: null, authorityDate: "", authorityBench: null }), null);
  assert.deepEqual(["Appeal(s) allowed", "Appeal(s) dismissed", "Disposed off", "Petition allowed in part"].map(disposalClass), ["allowed", "dismissed", "disposed", "allowed"]);
});

test("the rehearsal keeps only answers anchored to the record or an authority", async () => {
  const ctx = {
    matter: "Ram v. State",
    issue: "Bail",
    events: [{ id: "ev:1", date: "05.01.2020", text: "The petitioner has been in custody since 05.01.2020.", source: "x" }],
    authorities: [{ id: "au:1", citation: "2023 INSC 1043", parties: "", paragraph: "12", proposition: "", role: "supporting", citationFailed: false }],
    provisions: [],
  };
  const r = await rehearse(async (_s, user) => {
    if (user.includes("bench is most likely")) {
      return JSON.stringify({
        questions: [
          { question: "How long has the petitioner been in custody?", answer: "Since E1, over four years.", events: [{ ref: "E1", quote: "in custody since 05.01.2020" }] },
          { question: "Is there any authority?", answer: "Yes.", authorities: [] },
        ],
      });
    }
    return JSON.stringify({ objections: [{ category: "limitation", objection: "The petition is out of time.", response: "A1 at para 12.", authorities: [{ ref: "A1", paragraph: "12" }] }] });
  }, ctx);
  assert.deepEqual(r.items.map((i) => [i.kind, i.category, i.refs]), [["bench_question", "bench", ["ev:1"]], ["objection", "limitation", ["au:1"]]]);
  assert.equal(r.items[0].answer, "Since [record 05.01.2020], over four years.");
  assert.equal(r.rejected.length, 1);
});

test("the store: assessments are candidates from the agent; an overruled authority opens a blocking review item", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-v5c-"));
  const store = await MatterStore.create(path.join(root, "m"), "Authorities", adv);
  try {
    const au = store.work.addAuthority({ citation: "2010 INSC 9", parties: "A v. B", decisionDate: "2010-01-01", paragraph: "4", proposition: "p", role: "supporting", issueId: null }, adv);
    assert.equal(store.studio.assessAuthority(au.id, "voice", "obiter", "para 4 is a passing remark", { actor: "agent" }).voiceStatus, "candidate");
    assert.equal(store.studio.assessAuthority(au.id, "voice", "holding", "", adv).voiceStatus, "confirmed");
    assert.throws(() => store.studio.assessAuthority(au.id, "voice", "probably", "", adv), /BAD_VALUE/);
    const t = store.studio.addTreatment({ authorityId: au.id, kind: "overruled", byCitation: "2020 INSC 5", byDate: "2020-01-01", byBench: 2, authorityDate: "2010-01-01", authorityBench: 3, note: "" }, { actor: "agent" });
    assert.ok(t.reviewItemId);
    const kinds = store.listReviewItems().map((r) => r.kind);
    assert.ok(kinds.includes("authority_overruled"));
    assert.ok(kinds.includes("treatment_check"), "a smaller bench is flagged");
    store.studio.addChallenge({ runId: "r", kind: "objection", category: "delay", text: "Delay", answer: "a", refs: [], origin: "generated" });
    const c = store.studio.challenges()[0];
    assert.throws(() => store.studio.decideChallenge(c.id, "accepted", { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(store.studio.decideChallenge(c.id, "accepted", adv)[0].status, "accepted");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
});
