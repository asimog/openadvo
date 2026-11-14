import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { Matters } from "../../src/main/matters.ts";
import { Drafts } from "../../src/main/drafts.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { generateListOfDates, readParagraphs } from "../../src/lib/drafting/index.ts";

const EVENTS = [
  {
    id: "e1",
    dateStart: "2024-03-12",
    dateEnd: "2024-03-12",
    dateText: "12.03.2024",
    description: "The High Court dismissed the writ petition.",
    kind: "procedural" as const,
    reading: "text_layer" as const,
    sourceName: "judgment.pdf",
    page: 4,
    line: 2,
  },
  {
    id: "e2",
    dateStart: "2023-01-02",
    dateEnd: "2023-01-02",
    dateText: "02.01.2023",
    description: "The writ petition was filed.",
    kind: "procedural" as const,
    reading: "text_layer" as const,
    sourceName: "judgment.pdf",
    page: 1,
    line: 5,
  },
];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "oa-changes-"));
  const matters = new Matters(root);
  const matter = await matters.create("State v. Example");
  const drafts = new Drafts(matters, {
    x2t: "unused",
    workingRoot: root,
    openInEditor: async () => {
      throw new Error("not used");
    },
  });
  const g = generateListOfDates(EVENTS, { title: "LIST OF DATES", generatedAt: "2026-11-14T00:00:00Z" });
  const { draft, revision } = await matters.createDraftWithRevision(matter.id, "list_of_dates", "LIST OF DATES", g.docx, g.paragraphs);
  return { matters, drafts, matterId: matter.id, draft, revision, paragraphs: g.paragraphs };
}

test("an agent proposal is a new revision by the agent; approval waits for every decision", async () => {
  const f = await fixture();
  try {
    const [p1, p2] = f.paragraphs;
    const wording = await f.drafts.proposeCorrection(f.matterId, {
      draftId: f.draft.id,
      anchor: p1.anchor,
      expected: p1.text,
      replacement: p1.text.replace("writ petition was filed", "writ petition was presented"),
      reason: "judgment.pdf p. 1 l. 5",
    }, "session-1");
    assert.equal(wording.revision.author, "agent");
    assert.equal(wording.revision.seq, 2);
    assert.equal(wording.substantive, false);
    const date = await f.drafts.proposeCorrection(f.matterId, {
      draftId: f.draft.id,
      anchor: p2.anchor,
      expected: p2.text,
      replacement: p2.text.replace("12.03.2024", "13.03.2024"),
      reason: "judgment.pdf p. 4 l. 2",
    });
    assert.equal(date.substantive, true);

    const open = await f.drafts.agentChanges(f.matterId);
    assert.equal(open.length, 1);
    assert.equal(open[0].revisionId, date.revision.id);
    assert.deepEqual(open[0].changes.map((c) => c.substantive), [false, true]);

    // Item h: no approval while a change is not decided.
    await assert.rejects(() => f.drafts.approveRevision(f.matterId, date.revision.id), /AGENT_CHANGES_UNDECIDED/);
    // A stale base is refused.
    await assert.rejects(
      () => f.drafts.decideAgentChanges(f.matterId, f.draft.id, wording.revision.id, [{ anchor: p1.anchor, decision: "keep" }]),
      /DOC_STALE_BASE/,
    );

    const kept = await f.drafts.decideAgentChanges(f.matterId, f.draft.id, date.revision.id, [{ anchor: p1.anchor, decision: "keep" }]);
    assert.equal(kept.author, "advocate");
    assert.equal((await f.drafts.agentChanges(f.matterId))[0].changes.length, 1);
    const undone = await f.drafts.decideAgentChanges(f.matterId, f.draft.id, kept.id, [{ anchor: p2.anchor, decision: "undo" }]);
    assert.deepEqual(await f.drafts.agentChanges(f.matterId), []);

    const text = readParagraphs(await f.matters.revisionBytes(f.matterId, undone.id));
    assert.equal(text.find((p) => p.anchor === p1.anchor)?.text, p1.text.replace("filed", "presented"));
    assert.equal(text.find((p) => p.anchor === p2.anchor)?.text, p2.text);
    const approved = await f.drafts.approveRevision(f.matterId, undone.id);
    assert.equal(approved.approved?.id, undone.id);

    const actions = (await f.matters.listEvents(f.matterId)).map((e) => `${e.actor}:${e.action}`);
    assert.equal(actions.filter((a) => a === "agent:revision.proposed").length, 2);
    assert.equal(actions.filter((a) => a === "advocate:agent_change.decided").length, 2);
  } finally {
    f.matters.closeAll();
  }
});

test("a matter made before step 5 is migrated so the agent can author a revision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-migrate-"));
  const store = await MatterStore.create(root, "Old matter", { actor: "advocate" });
  const g = generateListOfDates(EVENTS, { title: "LIST OF DATES", generatedAt: "2026-11-14T00:00:00Z" });
  const { draft, revision } = await store.createDraftWithRevision("list_of_dates", "LIST OF DATES", g.docx, g.paragraphs, { actor: "advocate" });
  await store.approveRevision(revision.id, { actor: "advocate" });
  store.close();
  // Put back the step 4 CHECK, as an older matter has it.
  const db = new DatabaseSync(path.join(store.folder, "matter.db"));
  db.exec("PRAGMA writable_schema = ON;");
  db.prepare("UPDATE sqlite_master SET sql = replace(sql, ?, ?) WHERE name = 'revision'").run("'generator', 'advocate', 'agent'", "'generator', 'advocate'");
  db.exec("PRAGMA writable_schema = OFF;");
  db.close();

  const reopened = await MatterStore.open(store.folder);
  try {
    const before = reopened.getDraft(draft.id);
    assert.equal(before.approved?.id, revision.id);
    const next = await reopened.proposeRevision(draft.id, g.docx, revision.id, {}, { actor: "agent" });
    assert.equal(next.author, "agent");
    assert.equal(reopened.getDraft(draft.id).revisionCount, 2);
  } finally {
    reopened.close();
  }
});
