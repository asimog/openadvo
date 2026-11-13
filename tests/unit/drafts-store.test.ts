import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, appendFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore, MatterStoreError } from "../../src/lib/matter-store/index.ts";

const advocate = { actor: "advocate" as const };
const agent = { actor: "agent" as const };

async function draftFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "oa-drafts-"));
  const store = await MatterStore.create(root, "State v. Example", advocate);
  const docx1 = Buffer.from("DOCX-first-revision");
  const created = await store.createDraftWithRevision(
    "list_of_dates",
    "LIST OF DATES",
    docx1,
    [
      { anchor: "oa-1111", text: "02.01.2023: The writ petition was filed.", eventIds: ["e1"] },
      { anchor: "oa-2222", text: "12.03.2024: The High Court dismissed the writ petition.", eventIds: ["e2"] },
    ],
    advocate,
  );
  return { root, store, created, docx1, cleanup: async () => store.close() };
}

test("a generated draft stores its first revision, bytes and paragraph links", async () => {
  const f = await draftFixture();
  try {
    const { draft, revision } = f.created;
    assert.equal(draft.kind, "list_of_dates");
    assert.equal(draft.revisionCount, 1);
    assert.equal(revision.seq, 1);
    assert.equal(revision.author, "generator");
    assert.equal(revision.baseRevisionId, null);
    assert.match(revision.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await f.store.revisionBytes(revision.id), f.docx1);
    const links = f.store.listParagraphLinks(draft.id);
    assert.equal(links.length, 2);
    assert.deepEqual(links.find((l) => l.anchor === "oa-1111")?.eventIds, ["e1"]);
    assert.equal(f.store.getParagraphLink(draft.id, "oa-2222")?.text, "12.03.2024: The High Court dismissed the writ petition.");
    assert.equal(f.store.getParagraphLink(draft.id, "oa-none"), undefined);
    assert.equal(f.store.listDrafts().length, 1);
    assert.equal(f.store.headRevision(draft.id)?.id, revision.id);
    const actions = f.store.listEvents().map((e) => e.action);
    assert.ok(actions.includes("draft.generated"));
  } finally {
    await f.cleanup();
  }
});

test("a human save needs a base revision and refuses a stale base", async () => {
  const f = await draftFixture();
  try {
    const { draft, revision } = f.created;
    const docx2 = Buffer.from("DOCX-second-revision");
    await assert.rejects(
      () => f.store.saveRevision(draft.id, docx2, "", advocate),
      (e: MatterStoreError) => e.code === "BASE_REQUIRED",
    );
    await assert.rejects(
      () => f.store.saveRevision(draft.id, docx2, "00000000-0000-0000-0000-000000000000", advocate),
      (e: MatterStoreError) => e.code === "DOC_STALE_BASE",
    );
    await assert.rejects(
      () => f.store.saveRevision(draft.id, docx2, revision.id, agent),
      (e: MatterStoreError) => e.code === "HUMAN_ONLY",
    );
    const second = await f.store.saveRevision(draft.id, docx2, revision.id, advocate);
    assert.equal(second.seq, 2);
    assert.equal(second.author, "advocate");
    assert.equal(second.baseRevisionId, revision.id);
    assert.deepEqual(await f.store.revisionBytes(second.id), docx2);
    const updated = f.store.getDraft(draft.id);
    assert.equal(updated.revisionCount, 2);
    assert.equal(updated.head?.id, second.id);
    // The earlier revision and its links stay as they were.
    assert.deepEqual(await f.store.revisionBytes(revision.id), f.docx1);
    assert.equal(f.store.listParagraphLinks(draft.id).length, 2);
    const actions = f.store.listEvents().map((e) => e.action);
    assert.equal(actions.filter((a) => a === "revision.saved").length, 1);
  } finally {
    await f.cleanup();
  }
});

test("revisions and approvals are append-only; approval is human only", async () => {
  const f = await draftFixture();
  try {
    const { draft, revision } = f.created;
    assert.throws(() => f.store.approveRevision(revision.id, agent), (e: MatterStoreError) => e.code === "HUMAN_ONLY");
    const approved = f.store.approveRevision(revision.id, advocate);
    assert.ok(approved.approvedAt);
    assert.equal(approved.approvedBy, "advocate");
    assert.equal(f.store.getDraft(draft.id).approved?.id, revision.id);
    // A second approval of the same revision does not fail and does not duplicate.
    f.store.approveRevision(revision.id, advocate);
    assert.equal(f.store.getDraft(draft.id).approved?.id, revision.id);
    const actions = f.store.listEvents().map((e) => e.action);
    assert.ok(actions.includes("revision.approved"));
    const folder = f.store.folder;
    f.store.close();
    const db = new DatabaseSync(path.join(folder, "matter.db"));
    assert.throws(() => db.exec("UPDATE revision SET seq = 9"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM revision"), /append-only/);
    assert.throws(() => db.exec("UPDATE revision_approval SET at = 'x'"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM revision_approval"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM draft"), /never deleted/);
    assert.throws(() => db.exec("UPDATE paragraph_link SET text = 'x'"), /append-only/);
    db.close();
  } finally {
    await f.cleanup().catch(() => undefined);
  }
});

test("a changed revision blob is reported, not trusted", async () => {
  const f = await draftFixture();
  try {
    const { revision } = f.created;
    await appendFile(f.store.blobPath(revision.sha256), "tampered");
    await assert.rejects(
      () => f.store.revisionBytes(revision.id),
      (e: MatterStoreError) => e.code === "BLOB_CHANGED",
    );
  } finally {
    await f.cleanup();
  }
});
