/**
 * Phase 10 (M3): outcome records. The advocate enters what the court did; a correction is a new
 * row that supersedes the old one, and the old one stays for the history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore, MatterStoreError } from "../../src/lib/matter-store/index.ts";

const advocate = { actor: "advocate" as const };

test("M3: the advocate records an outcome; the row carries the result, the subject and the date", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-outcome-"));
  const store = await MatterStore.create(root, "State v. Example", advocate);
  try {
    const o = store.recordOutcome({ result: "allowed", subject: "bail on the custody ground", court: "Delhi High Court", decidedOn: "2026-10-01", summary: "Allowed on the custody ground." }, advocate);
    assert.equal(o.result, "allowed");
    assert.equal(o.subject, "bail on the custody ground");
    assert.equal(o.status, "active");
    assert.deepEqual(store.outcomes().map((x) => x.id), [o.id]);
    assert.ok(store.listEvents().some((e) => e.action === "matter.outcome_recorded"));
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("M3: only the advocate records an outcome", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-outcome-"));
  const store = await MatterStore.create(root, "State v. Example", advocate);
  try {
    assert.throws(() => store.recordOutcome({ result: "dismissed", subject: "the application", decidedOn: "2026-10-01" }, { actor: "agent" }), (e: unknown) => e instanceof MatterStoreError && e.code === "HUMAN_ONLY");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("M3: a correction supersedes the old row; nothing is deleted and the history stays", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-outcome-"));
  const store = await MatterStore.create(root, "State v. Example", advocate);
  try {
    const first = store.recordOutcome({ result: "dismissed", subject: "bail", decidedOn: "2026-10-01" }, advocate);
    const corrected = store.recordOutcome({ result: "allowed", subject: "bail", decidedOn: "2026-10-02", supersedes: first.id, summary: "The order dated 2 October corrects the earlier entry." }, advocate);
    const all = store.outcomes();
    assert.equal(all.length, 2);
    assert.equal(all.find((x) => x.id === first.id)!.status, "superseded");
    assert.equal(all.find((x) => x.id === corrected.id)!.status, "active");
    assert.throws(() => store.recordOutcome({ result: "other", subject: "bail", decidedOn: "2026-10-03", supersedes: first.id }, advocate), /ALREADY_SUPERSEDED/);
    assert.throws(() => store.recordOutcome({ result: "maybe", subject: "bail", decidedOn: "2026-10-03" } as never, advocate), /BAD_RESULT/);
    assert.throws(() => store.recordOutcome({ result: "allowed", subject: "", decidedOn: "2026-10-03" }, advocate), /BAD_OUTCOME/);
    assert.throws(() => store.recordOutcome({ result: "allowed", subject: "bail", decidedOn: "3 October" }, advocate), /BAD_DATE/);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
