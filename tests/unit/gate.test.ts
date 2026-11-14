import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GATE_STATES, defectItemKind, gateState } from "../../src/lib/verification/index.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";

const none = { openItemKinds: [], notRun: [], undecidedChanges: 0 };
const partyCheck = { check: "Party names and case number match the matter", reason: "The matter records no parties." };

test("the gate: the first state that applies, in the workflow's order", () => {
  assert.deepEqual(GATE_STATES, [
    "blocked_source_verification",
    "needs_correction",
    "blocked_legal_review",
    "blocked_filing_compliance",
    "needs_instructions",
    "ready_for_advocate_review",
  ]);
  assert.equal(gateState(none).state, "ready_for_advocate_review");
  assert.equal(gateState({ ...none, notRun: [partyCheck] }).state, "needs_instructions");
  assert.equal(gateState({ ...none, undecidedChanges: 1, notRun: [partyCheck] }).state, "needs_correction");
  assert.equal(gateState({ ...none, openItemKinds: [defectItemKind("date_mismatch")] }).state, "needs_correction");
  assert.equal(gateState({ ...none, openItemKinds: [defectItemKind("drafts_disagree")] }).state, "needs_correction");
  for (const k of ["no_source", "broken_link", "event_not_confirmed"] as const) {
    const g = gateState({ openItemKinds: [defectItemKind("date_mismatch"), defectItemKind(k)], notRun: [partyCheck], undecidedChanges: 2 });
    assert.equal(g.state, "blocked_source_verification");
    assert.equal(g.label, "Blocked pending source verification");
    // Every reason is listed, not only the first.
    assert.equal(g.reasons.length, 4);
  }
  // Later steps' gates are never shown as passed.
  assert.equal(gateState(none).notAvailable.length, 1);
  // Legal review sits between correction and instructions.
  assert.equal(gateState({ ...none, legal: ["2024 INSC 1: failed"], notRun: [partyCheck] }).state, "blocked_legal_review");
  assert.equal(gateState({ ...none, legal: ["x"], undecidedChanges: 1 }).state, "needs_correction");
});

test("defects become review items of their draft, once each; Notebook readiness ignores them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-gate-"));
  const store = await MatterStore.create(root, "Gate", { actor: "advocate" });
  try {
    const { draft, revision } = await store.createDraftWithRevision("list_of_dates", "LIST OF DATES", Buffer.from("x"), [], { actor: "advocate" });
    const defects = [
      { kind: defectItemKind("no_source"), detail: "paragraph 1" },
      { kind: defectItemKind("date_mismatch"), detail: "paragraph 2" },
    ];
    assert.deepEqual(store.openDraftDefects(draft.id, revision.id, defects), { opened: 2, alreadyOpen: 0 });
    assert.deepEqual(store.openDraftDefects(draft.id, revision.id, defects), { opened: 0, alreadyOpen: 2 });
    const items = store.listReviewItems();
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.draftId === draft.id && i.status === "open"));
    assert.equal(store.readiness().openReviewItems, 0);
    store.decideReviewItem(items[0].id, "resolved", { actor: "advocate" });
    // A resolved defect found again opens a new item.
    assert.deepEqual(store.openDraftDefects(draft.id, revision.id, defects), { opened: 1, alreadyOpen: 1 });
  } finally {
    store.close();
  }
});
