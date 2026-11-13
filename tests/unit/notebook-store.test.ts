import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { Matters } from "../../src/main/matters.ts";
import { extractNotebook } from "../../src/main/notebook.ts";

const line = (n: number, text: string) => ({ line: n, x: 72, y: 800 - n * 20, w: 400, h: 12, text });

test("Notebook: events from read text, a date conflict, human decisions, readiness", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-nb-"));
  const matters = new Matters(path.join(root, "m"));
  try {
    const m = await matters.create("Notebook test");
    const file = path.join(root, "brief.pdf");
    await writeFile(file, "%PDF-1.4\n% notebook fixture\n%%EOF\n");
    const [added] = await matters.addFiles(m.id, [file]);
    const sourceId = added.source!.id;

    // Simulate step 2: the job reads two pages.
    assert.equal(await matters.startJob(m.id, sourceId), true);
    await matters.recordPage(m.id, sourceId, {
      page: 1, width: 595, height: 842, kind: "born_digital", text: "",
      lines: [
        line(1, "The writ petition was filed on 02.01.2023."),
        line(2, "The High Court dismissed the writ petition by its judgment dated 12.03.2024."),
      ],
    });
    await matters.recordPage(m.id, sourceId, {
      page: 2, width: 595, height: 842, kind: "ocr", text: "",
      ocr: { engine: "tesseract.js", version: "7.0.0", confidence: 90 },
      lines: [
        line(1, "By judgment dated 13.03.2024 the High Court dismissed the writ petition."),
        line(2, "The petitioner purchased the land in March 2019."),
      ],
    });
    await matters.finishJob(m.id, sourceId, 2);

    assert.equal(await extractNotebook(matters, m.id), 4);
    assert.equal(await extractNotebook(matters, m.id), 0, "a source is extracted once");
    let nb = await matters.notebook(m.id);
    assert.deepEqual(nb.events.map((e) => e.dateStart), ["2019-03-01", "2023-01-02", "2024-03-12", "2024-03-13"]);
    const land = nb.events[0];
    assert.equal(land.kind, "factual");
    assert.equal(land.dateType, "range");
    assert.equal(land.reading, "ocr");
    assert.equal(nb.events[1].kind, "procedural");
    assert.equal(nb.events[1].status, "candidate");

    // The two judgment dates conflict: flagged, not resolved; the Notebook is not ready.
    assert.equal(nb.conflicts.length, 1);
    assert.equal(nb.readiness.ready, false);
    assert.equal(nb.readiness.openReviewItems, 1);
    const c = nb.conflicts[0];
    const right = nb.events.find((e) => e.dateStart === "2024-03-12")!;
    nb = await matters.resolveConflict(m.id, c.id, right.id);
    assert.equal(nb.conflicts[0].status, "resolved");
    assert.equal(nb.readiness.ready, true);

    // Human decisions: confirm, reject, exclude, include. Nothing is deleted.
    nb = await matters.decideEvent(m.id, right.id, "confirmed");
    nb = await matters.decideEvent(m.id, land.id, "excluded");
    assert.equal(nb.events.find((e) => e.id === right.id)!.status, "confirmed");
    assert.equal(nb.events.find((e) => e.id === land.id)!.excluded, true);
    nb = await matters.decideEvent(m.id, land.id, "included");
    assert.equal(nb.events.find((e) => e.id === land.id)!.excluded, false);
    assert.equal(nb.events.length, 4);

    const actions = (await matters.listEvents(m.id)).map((e) => e.action);
    for (const a of ["notebook.events_extracted", "notebook.conflict_flagged", "notebook.conflict_resolved", "notebook.event_confirmed", "notebook.event_excluded"]) {
      assert.ok(actions.includes(a), a);
    }
    const folder = (await matters.list())[0].folder;
    matters.closeAll();
    const db = new DatabaseSync(path.join(folder, "matter.db"));
    try {
    assert.throws(() => db.exec("UPDATE notebook_event SET date_start = '2020-01-01'"), /written once/);
    assert.throws(() => db.exec("DELETE FROM event_decision"), /append-only/);
    assert.throws(() => db.exec("INSERT INTO event_decision (event_id, decision, actor, at) VALUES ('x', 'confirmed', 'agent', 'now')"));
    } finally {
      db.close();
    }
  } finally {
    matters.closeAll();
    await rm(root, { recursive: true, force: true });
  }
});
