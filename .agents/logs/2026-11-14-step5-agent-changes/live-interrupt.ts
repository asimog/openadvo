// Live check of the step 5 interrupt: one real turn, a stub host, the default model.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventSchemas } from "@ag-ui/core/schemas";
import { Agent } from "../../../src/main/agent.ts";

const para = { anchor: "oa-" + "a".repeat(32), text: "On 12.03.2024, the High Court dismissed the writ petition.", eventIds: ["e1"] };
const events: any[] = [];
const proposals: any[] = [];
const host: any = {
  listSources: async () => [{ id: "s1", name: "judgment.pdf", sha256: "f".repeat(64), size: 100, status: "present", origins: 1 }],
  listPages: async () => [{ page: 1, kind: "born_digital", ocr: null, lines: [{ line: 1, text: "IN THE HIGH COURT" }, { line: 2, text: "Writ Petition No. 1 of 2023" }, { line: 3, text: "Judgment dated 13.03.2024: the writ petition is dismissed." }] }],
  searchLines: async () => [{ sourceId: "s1", page: 1, line: 3, text: "Judgment dated 13.03.2024: the writ petition is dismissed." }],
  notebook: async () => ({ events: [], conflicts: [], readiness: { ready: true, jobsPending: 0, openReviewItems: 0 } }),
  drafts: async () => [{ draftId: "d1", kind: "list_of_dates", title: "LIST OF DATES", revision: { id: "r1", seq: 1, sha256: "x" }, paragraphs: [para] }],
  paragraphSource: async () => null,
  checkDraft: async () => ({ draftId: "d1", revisionId: "r1", seq: 1, method: "m", checkedAt: "", statementsChecked: 1, defects: [], notRun: [] }),
  proposeCorrection: async (_m: string, input: any) => {
    proposals.push(input);
    return { revision: { id: "r2", seq: 2 }, before: input.expected, after: input.replacement, substantive: true };
  },
  matterTitle: async () => "Live check",
  recordSession: async () => {},
  emit: (e: any) => events.push(e.event),
  loadModelKey: () => null, saveModelKey: () => {}, loadEffort: () => null, saveEffort: () => {},
};
const agent = new Agent(host, { agentDir: await mkdtemp(path.join(tmpdir(), "oa-live-")) });
console.log("model:", await agent.currentModel());
await agent.send("m1", "The judgment is dated 13.03.2024, not 12.03.2024 (judgment.pdf, p. 1, l. 3). Read the List of Dates and propose the correction to the paragraph that states the wrong date.");
const invalid = events.filter((e) => !EventSchemas.safeParse(e).success).length;
const last = events[events.length - 1];
console.log("events:", events.length, "invalid:", invalid);
console.log("tools:", events.filter((e) => e.type === "TOOL_CALL_START").map((e) => e.toolCallName).join(", "));
console.log("proposals:", JSON.stringify(proposals));
console.log("last:", last.type, JSON.stringify(last.outcome ?? last.message).slice(0, 300));
console.log("text:", (await agent.getChat("m1")).messages.filter((m) => m.role === "agent").map((m) => m.text).join(" | ").slice(-1200));
await agent.disposeAll();
