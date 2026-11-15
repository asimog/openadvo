/** Q4: advocate.db and intel.db, each with its own hash-chained audit (decision 12). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import { IntelStore, checkWord, freshness } from "../../src/lib/intel-store/index.ts";

const dir = () => mkdtempSync(path.join(tmpdir(), "oa-stores-"));

test("advocate.db: the profile is the advocate's; every write is chained; the chain finds a changed event", () => {
  const d = dir();
  const s = AdvocateStore.open(d);
  try {
    assert.throws(() => s.setProfileField("name", "X", { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(s.setProfileField("name", "A. Advocate", { actor: "advocate" }).name, "A. Advocate");
    s.setProfileField("role", "Advocate-on-Record", { actor: "advocate" });
    assert.deepEqual(s.profile().fields, { name: "A. Advocate", role: "Advocate-on-Record" });
    assert.throws(() => s.setProfileField("Bad Key", "x", { actor: "advocate" }), /BAD_KEY/);
    const check = s.verifyChain();
    assert.equal(check.ok, true);
    assert.equal(check.events, 3);
  } finally {
    s.close();
  }
  // Change an event's data by hand: the chain shows where.
  const db = new DatabaseSync(path.join(d, "advocate.db"));
  db.exec("DROP TRIGGER event_no_update");
  db.prepare("UPDATE event SET data = ? WHERE seq = 2").run('{"key":"forged"}');
  db.close();
  const again = AdvocateStore.open(d);
  try {
    const check = again.verifyChain();
    assert.equal(check.ok, false);
    assert.equal(check.firstBreak?.seq, 2);
  } finally {
    again.close();
  }
});

test("advocate memory: proposals only; a matter's facts are refused; only the advocate confirms; a correction keeps its history", () => {
  const s = AdvocateStore.open(dir());
  try {
    assert.throws(() => s.proposeMemory({ type: "fact_from_document", subject: "the petitioner", relation: "was", object: "dismissed" }, { actor: "agent" }), /CROSS_MATTER_FACT/);
    const first = s.proposeMemory({ type: "preference", subject: "citation format", relation: "is", object: "neutral citation first" }, { actor: "agent" });
    assert.equal(first.status, "proposed");
    assert.equal(first.scope, "advocate");
    assert.throws(() => s.decideMemory(first.memoryId, "confirmed", { actor: "agent" }), /HUMAN_ONLY/);
    s.decideMemory(first.memoryId, "confirmed", { actor: "advocate" });
    const fix = s.proposeMemory({ type: "preference", subject: "citation format", relation: "is", object: "SCC first, then neutral", supersedes: first.memoryId }, { actor: "agent" });
    s.decideMemory(fix.memoryId, "confirmed", { actor: "advocate" });
    assert.deepEqual(s.memory().map((m) => [m.object, m.status]), [["neutral citation first", "superseded"], ["SCC first, then neutral", "confirmed"]]);
    assert.equal(s.verifyChain().ok, true);
  } finally {
    s.close();
  }
});

test("preferences: proposed with the reason they apply; the advocate approves; a newer approval supersedes", () => {
  const s = AdvocateStore.open(dir());
  try {
    assert.throws(() => s.proposePreference({ key: "paragraph_length", value: "short", reason: "" }, { actor: "agent" }), /BAD_PREFERENCE/);
    const a = s.proposePreference({ key: "paragraph_length", value: "short", reason: "the advocate shortened two drafts" }, { actor: "agent" });
    assert.throws(() => s.decidePreference(a.id, "approved", { actor: "agent" }), /HUMAN_ONLY/);
    s.decidePreference(a.id, "approved", { actor: "advocate" });
    const b = s.proposePreference({ key: "paragraph_length", value: "medium", reason: "the advocate asked" }, { actor: "agent" });
    s.decidePreference(b.id, "approved", { actor: "advocate" });
    assert.deepEqual(s.preferences().map((p) => p.status), ["superseded", "approved"]);
    assert.throws(() => s.decidePreference(b.id, "rejected", { actor: "advocate" }), /DECIDED/);
  } finally {
    s.close();
  }
});

test("intel.db: versioned source rows, the freshness rule, and a check on a stale row is unconfirmed, never passed", () => {
  const s = IntelStore.open(dir());
  try {
    const input = { key: "dhc.rules", name: "Delhi High Court Rules", sourceUrl: "https://delhihighcourt.nic.in/rules", owner: "Delhi High Court", retrievedAt: "2026-10-01T00:00:00Z", checkedBy: "engineer", accessMethod: "official_feed" as const, reliability: "official", checkDays: 30 };
    assert.throws(() => s.recordSource(input, { actor: "agent" }), /PROPOSAL_ONLY/);
    assert.throws(() => s.recordSource({ ...input, checkDays: 0 }, { actor: "system" }), /BAD_INTERVAL/);
    assert.throws(() => s.recordSource({ ...input, sourceUrl: "file.pdf" }, { actor: "system" }), /BAD_URL/);
    const v1 = s.recordSource(input, { actor: "system" });
    const v2 = s.recordSource({ ...input, retrievedAt: "2026-11-10T00:00:00Z" }, { actor: "advocate" });
    assert.equal(v2.version, 2);
    assert.deepEqual(s.sources().map((x) => x.id), [v2.id]);
    assert.deepEqual(s.history("dhc.rules").map((x) => [x.version, x.supersededBy]), [[1, v2.id], [2, null]]);
    const now = new Date("2026-11-15T00:00:00Z");
    assert.deepEqual(freshness(v1, now), { state: "stale", since: "2026-10-31" });
    assert.equal(freshness(v2, now).state, "fresh");
    assert.equal(checkWord([v2], true, now), "passed");
    assert.equal(checkWord([v1, v2], true, now), "unconfirmed");
    assert.equal(checkWord([v2], false, now), "failed");
    assert.equal(s.verifyChain().ok, true);
    assert.equal(s.verifyChain().events, 3);
  } finally {
    s.close();
  }
});
