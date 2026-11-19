/**
 * A judgment or order opens the next-step review item: the court, the date, the next forum and
 * the choice between appeal/SLP, review/revision and no action.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { Matters } from "../../src/main/matters.ts";
import { finalOrderNextStep } from "../../src/main/practice.ts";

const advocate = { actor: "advocate" as const };

test("a High Court judgment opens a final_order item with the appeal route", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-final-order-"));
  try {
    const store = await MatterStore.create(root, "Judgment v. State", advocate);
    const file = path.join(root, "judgment.txt");
    await writeFile(file, "JUDGMENT\nIN THE HIGH COURT OF DELHI\nThe writ petition is dismissed. Dated 12.03.2024.");
    const source = (await store.addFile(file, advocate)).source!;
    store.startJob(source.id);
    store.recordPage(source.id, {
      page: 1,
      width: 595,
      height: 842,
      kind: "born_digital",
      text: "JUDGMENT\nIN THE HIGH COURT OF DELHI\nThe writ petition is dismissed. Dated 12.03.2024.",
      lines: [
        { line: 1, x: 72, y: 780, w: 200, h: 16, text: "JUDGMENT" },
        { line: 2, x: 72, y: 750, w: 300, h: 16, text: "IN THE HIGH COURT OF DELHI" },
        { line: 3, x: 72, y: 720, w: 400, h: 16, text: "The writ petition is dismissed. Dated 12.03.2024." },
      ],
    });
    store.finishJob(source.id, 1);
    store.work.setSourceType(source.id, "judgment", advocate);
    store.work.setDetails({ court: "in.hc.delhi" }, advocate);
    const id = store.matter().id;
    store.close();

    const matters = new Matters(root);
    const opened = await finalOrderNextStep(matters, id);
    assert.equal(opened, 1);
    const item = (await matters.store(id)).listReviewItems().find((r) => r.kind === "final_order");
    assert.ok(item);
    assert.match(item.detail, /judgment/);
    assert.match(item.detail, /High Court of Delhi/i);
    assert.match(item.detail, /Supreme Court/i);
    assert.match(item.detail, /appeal or a special leave petition/i);
    matters.closeAll();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
