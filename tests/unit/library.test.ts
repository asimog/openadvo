/** M1: the Knowledge Library's metadata store. Spec: docs/specs/advocate-matters-browser.md section 4. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import { classifyLibraryFile, libraryScope, libraryTitle } from "../../src/lib/library/index.ts";

const advocate = { actor: "advocate" as const };

test("M1: a library item is added, found by its bytes, filtered and corrected; only the advocate writes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oa-library-"));
  try {
    const store = AdvocateStore.open(dir);
    const item = store.addLibraryItem(
      {
        title: "Bail judgment",
        kind: "judgment",
        author: "A. Advocate",
        itemDate: "2024-05-01",
        sourceName: "bail-judgment.pdf",
        sha256: "a".repeat(64),
        size: 1200,
        scope: "judgments/2024",
        tags: ["bail", "2024"],
      },
      advocate,
    );
    assert.equal(item.status, "unreviewed");
    assert.equal(item.tags.length, 2);
    assert.equal(store.libraryBySha("a".repeat(64))?.id, item.id);
    assert.equal(store.library({ kind: "judgment" }).length, 1);
    assert.equal(store.library({ q: "bail" }).length, 1);
    assert.equal(store.library({ status: "approved" }).length, 0);

    const updated = store.updateLibraryItem(item.id, { title: "Bail judgment (reviewed)", status: "reviewed", court: "Supreme Court" }, advocate);
    assert.equal(updated.title, "Bail judgment (reviewed)");
    assert.equal(updated.status, "reviewed");
    assert.equal(updated.court, "Supreme Court");
    assert.equal(store.setLibraryStatus(item.id, "approved", advocate).status, "approved");

    assert.throws(() => store.addLibraryItem({ ...item, title: "Again" } as never, advocate), /DUPLICATE/);
    assert.throws(() => store.setLibraryStatus(item.id, "filed", { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(store.verifyChain().ok, true);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("M1: the file name proposes a kind, a title and the folder scope", () => {
  assert.equal(classifyLibraryFile("Supreme Court judgment 2024.pdf"), "judgment");
  assert.equal(classifyLibraryFile("written submissions.docx"), "submission");
  assert.equal(classifyLibraryFile("Court Rules 2013.pdf"), "court_rule");
  assert.equal(classifyLibraryFile("notes.md"), "note");
  assert.equal(classifyLibraryFile("contract.pdf"), "judgment");
  assert.equal(libraryTitle("bail_application_final.docx"), "bail application final");
  const root = path.join(tmpdir(), "library-test");
  assert.equal(libraryScope(root, path.join(root, "judgments", "2024", "a.pdf")), "judgments/2024");
  assert.equal(libraryScope(root, path.join(root, "a.pdf")), "");
});
