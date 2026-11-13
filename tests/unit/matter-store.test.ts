import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, appendFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore, listMatters } from "../../src/lib/matter-store/index.ts";

const advocate = { actor: "advocate" as const };

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "oa-ms-"));
  const inbox = await mkdtemp(path.join(tmpdir(), "oa-in-"));
  const pdfA = path.join(inbox, "judgment.pdf");
  const pdfB = path.join(inbox, "annexure-p1.pdf");
  const copyA = path.join(inbox, "judgment copy.pdf");
  const text = path.join(inbox, "note.txt");
  await writeFile(pdfA, "%PDF-1.7\nfixture A\n%%EOF\n");
  await writeFile(pdfB, "%PDF-1.4\nfixture B\n%%EOF\n");
  await writeFile(copyA, "%PDF-1.7\nfixture A\n%%EOF\n");
  await writeFile(text, "not a pdf");
  const cleanup = async () => {
    await rm(root, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  };
  return { root, pdfA, pdfB, copyA, text, cleanup };
}

test("create, add, duplicate, refuse, reopen", async () => {
  const f = await fixture();
  try {
    const store = await MatterStore.create(f.root, "State v. Example", advocate);
    const a = await store.addFile(f.pdfA, advocate);
    const b = await store.addFile(f.pdfB, advocate);
    const dup = await store.addFile(f.copyA, advocate);
    const bad = await store.addFile(f.text, advocate);
    assert.equal(a.outcome, "added");
    assert.equal(b.outcome, "added");
    assert.equal(dup.outcome, "duplicate");
    assert.equal(dup.source?.id, a.source?.id);
    assert.equal(bad.outcome, "refused");
    assert.equal(store.listSources().length, 2);
    assert.equal(store.listOrigins(a.source!.id).length, 2);
    store.close();

    const matters = await listMatters(f.root);
    assert.equal(matters.length, 1);
    assert.equal(matters[0].title, "State v. Example");
    const reopened = await MatterStore.open(matters[0].folder);
    const sources = reopened.listSources();
    assert.deepEqual(sources.map((s) => s.name).sort(), ["annexure-p1.pdf", "judgment.pdf"]);
    for (const s of sources) assert.match(s.sha256, /^[0-9a-f]{64}$/);
    const actions = reopened.listEvents().map((e) => e.action);
    assert.ok(actions.includes("matter.created"));
    assert.equal(actions.filter((x) => x === "source.added").length, 2);
    assert.equal(actions.filter((x) => x === "source.origin_added").length, 1);
    assert.ok(actions.includes("source.refused"));
    reopened.close();
  } finally {
    await f.cleanup();
  }
});

test("missing and changed blobs are reported, not hidden", async () => {
  const f = await fixture();
  try {
    const store = await MatterStore.create(f.root, "Integrity", advocate);
    const a = (await store.addFile(f.pdfA, advocate)).source!;
    const b = (await store.addFile(f.pdfB, advocate)).source!;
    await rm(store.blobPath(a.sha256));
    await appendFile(store.blobPath(b.sha256), "tampered");
    const after = await store.checkIntegrity();
    assert.equal(after.find((s) => s.id === a.id)?.status, "missing");
    assert.equal(after.find((s) => s.id === b.id)?.status, "changed");
    const actions = store.listEvents().map((e) => e.action);
    assert.ok(actions.includes("source.missing"));
    assert.ok(actions.includes("source.changed"));
    // A second check with no change writes no new event.
    const count = store.listEvents().length;
    await store.checkIntegrity();
    assert.equal(store.listEvents().length, count);
    store.close();
  } finally {
    await f.cleanup();
  }
});

test("events and origins are append-only; sources are never deleted", async () => {
  const f = await fixture();
  try {
    const store = await MatterStore.create(f.root, "Append only", advocate);
    await store.addFile(f.pdfA, advocate);
    const folder = store.folder;
    store.close();
    const db = new DatabaseSync(path.join(folder, "matter.db"));
    assert.throws(() => db.exec("UPDATE event SET action = 'x'"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM event"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM origin"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM source"), /never deleted/);
    db.close();
  } finally {
    await f.cleanup();
  }
});

test("session id is recorded on agent events", async () => {
  const f = await fixture();
  try {
    const store = await MatterStore.create(f.root, "Session", advocate);
    store.appendEvent({ actor: "agent", sessionId: "s-123" }, "agent.session_started", null, null);
    const e = store.listEvents()[0];
    assert.equal(e.actor, "agent");
    assert.equal(e.sessionId, "s-123");
    store.close();
  } finally {
    await f.cleanup();
  }
});
