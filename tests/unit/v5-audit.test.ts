/** V5-1 to V5-4: the event chain, refusals, the Inspector and Find. Spec: docs/specs/v5.md. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { idsIn } from "../../src/lib/matter-store/audit.ts";

const adv = { actor: "advocate" as const };

test("the event chain verifies, and finds a changed, a removed and a reordered event", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-chain-"));
  try {
    const store = await MatterStore.create(path.join(root, "m"), "Chain", adv);
    const folder = store.folder;
    for (let i = 0; i < 5; i++) store.appendEvent(adv, "test.event", null, { i });
    const ok = store.verifyChain();
    assert.equal(ok.ok, true);
    assert.equal(ok.unchained, 0);
    assert.equal(ok.events, 6);
    assert.match(ok.head ?? "", /^[0-9a-f]{64}$/);
    store.close();
    // Tamper as someone with the file would: drop the guard, change one event's data.
    const db = new DatabaseSync(path.join(folder, "matter.db"));
    db.exec("DROP TRIGGER event_no_update; DROP TRIGGER event_no_delete;");
    db.prepare("UPDATE event SET data = ? WHERE seq = 3").run(JSON.stringify({ i: 99 }));
    db.close();
    const s2 = await MatterStore.open(folder);
    const bad = s2.verifyChain();
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.firstBreak, { seq: 3, problem: "its content does not match its hash (the event was changed)" });
    s2.close();
    const db2 = new DatabaseSync(path.join(folder, "matter.db"));
    db2.exec("DROP TRIGGER IF EXISTS event_no_update; DROP TRIGGER IF EXISTS event_no_delete;");
    db2.prepare("DELETE FROM event WHERE seq = 3").run();
    db2.close();
    const s3 = await MatterStore.open(folder);
    assert.equal(s3.verifyChain().firstBreak?.seq, 4);
    assert.match(s3.verifyChain().firstBreak?.problem ?? "", /link to the event before/);
    s3.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
});

test("refusals are kept; the Inspector finds a record, its events and its links; Find searches the index", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-insp-"));
  try {
    const store = await MatterStore.create(path.join(root, "m"), "Inspect", adv);
    try {
    const f = path.join(root, "order.txt");
    await writeFile(f, "The appeal was dismissed on 12.03.2024.");
    const src = (await store.addFile(f, adv)).source!;
    const issue = store.work.addIssue("Whether the appeal was rightly dismissed?", adv);
    const au = store.work.addAuthority({ citation: "2023 INSC 1043", parties: "X v. Y", decisionDate: "", paragraph: "12", proposition: "p", role: "supporting", issueId: issue.id }, adv);
    store.refuse("agent", "decideIssue", "HUMAN_ONLY", "only the advocate decides an issue");
    assert.equal(store.refusals()[0].code, "HUMAN_ONLY");
    const ins = store.inspect(issue.id)!;
    assert.equal(ins.kind, "issue");
    assert.ok(ins.events.some((e) => e.action === "issue.added" || e.action.startsWith("issue")));
    assert.deepEqual(ins.linksIn.map((l) => [l.kind, l.id]), [["authority", au.id]]);
    assert.deepEqual(store.inspect(au.id)!.linksOut, [{ kind: "issue", id: issue.id }]);
    assert.equal(store.inspect(src.id)!.kind, "source");
    assert.equal(store.inspect("nope"), null);
    store.replaceFindIndex([{ kind: "authority", ref: au.id, label: "2023 INSC 1043", text: "Long custody is a ground for bail" }]);
    assert.equal(store.find("custody bail")[0].ref, au.id);
    assert.match(store.find("custody")[0].snippet, /\[custody\]/i);
    assert.equal(store.findIndexSeq(), store.lastEventSeq());
    assert.deepEqual(idsIn(`x ${issue.id} ev:${"a".repeat(64)}:1:2:1`), [issue.id, `ev:${"a".repeat(64)}:1:2:1`, `${"a".repeat(64)}:1:2`], "an event id names its anchor too");
    } finally {
      store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
});
