import { test } from "node:test";
import assert from "node:assert/strict";
import { EventSchemas } from "@ag-ui/core/schemas";
import { DRAFT_CHANGE_INTERRUPT, draftChangeInterrupts } from "../../src/main/agent.ts";

// The RUN_FINISHED event agent.ts sends when the agent proposed a change (decisions.md choice 21).
test("the draft-change interrupt is a valid AG-UI RUN_FINISHED event", () => {
  const p = { draftId: "d", title: "LIST OF DATES", revisionId: "r", seq: 2, anchor: "oa-1", before: "a", after: "b", substantive: false, reason: "x" };
  const interrupts = draftChangeInterrupts([p]);
  assert.equal(interrupts[0].reason, DRAFT_CHANGE_INTERRUPT);
  const event = { type: "RUN_FINISHED", timestamp: Date.now(), threadId: "t", runId: "run", outcome: { type: "interrupt", interrupts } };
  const parsed = EventSchemas.safeParse(event);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});
