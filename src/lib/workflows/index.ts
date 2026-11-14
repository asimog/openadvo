/**
 * V1-4 workflows: named, reusable instructions to the agent (v1 spec; after Mike's workflows).
 * Plain library (decision 6). A workflow is text the advocate sends. It grants no tool and no
 * permission: the agent keeps the same tools.
 */
import { randomUUID } from "node:crypto";
import type { Workflow } from "../../shared/work.ts";

/** The built-in workflows follow the advocate workflow, step by step. */
export const BUILT_IN: Workflow[] = [
  {
    id: "builtin-analyse-judgment",
    title: "Analyse the impugned judgment",
    body: "Read the impugned judgment in the sources. Summarise the High Court's findings and reasoning, with a [source, p., l.] reference for each finding. List the findings that appear unsupported by the record, possible errors of law, and the information that is missing. Propose each possible issue with propose_issue. Do not decide anything.",
    builtIn: true,
  },
  {
    id: "builtin-chronology-review",
    title: "Review the chronology",
    body: "Read the chronology and list the events that are not confirmed, the date conflicts, and the dates that are inferred or taken from OCR. For each, give the source line and say what the advocate must decide. Change nothing.",
    builtIn: true,
  },
  {
    id: "builtin-record-table",
    title: "Fill the record table",
    body: "Read the record table columns with list_record_table. For each source and each column, read the source and fill the cell with fill_record_cell, quoting the exact words of one line. Leave a cell empty when the source does not answer the question.",
    builtIn: true,
  },
  {
    id: "builtin-research",
    title: "Research the accepted issues",
    body: "For each accepted issue in list_research, search the citation index for supporting and adverse Supreme Court authorities. Record each candidate with add_authority and its role. Then write one memorandum per issue with write_memorandum, grounded in [event:], [issue:], [authority:] and source references. Separate established facts, disputed facts, propositions, assumptions and open questions.",
    builtIn: true,
  },
  {
    id: "builtin-draft-grounds",
    title: "Draft Questions of Law and Grounds",
    body: "From the accepted issues and adopted authorities, propose Questions of Law and Grounds with propose_paragraph, one paragraph each. Each ground names the challenged finding, the record reference, the proposition and the authority. Then run check_citations. The advocate keeps or undoes each paragraph.",
    builtIn: true,
  },
  {
    id: "builtin-pre-filing-check",
    title: "Check the petition before filing",
    body: "Run check_draft on every draft and check_citations on the drafts. List every defect with its evidence and the action required, grouped by draft. Propose corrections only where the Notebook or the sources support them.",
    builtIn: true,
  },
];

/** The advocate's own workflows, as stored, validated. Bad entries are dropped. */
export function parseCustom(raw: unknown): Workflow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
    .filter((w) => typeof w.id === "string" && typeof w.title === "string" && typeof w.body === "string")
    .map((w) => ({ id: String(w.id), title: String(w.title).trim(), body: String(w.body).trim(), builtIn: false }))
    .filter((w) => w.title !== "" && w.body !== "");
}

export function allWorkflows(custom: Workflow[]): Workflow[] {
  return [...BUILT_IN, ...custom];
}

/** Add a workflow, or replace the one with the same id. A built-in workflow cannot be changed. */
export function upsert(custom: Workflow[], input: { id?: string; title: string; body: string }): Workflow[] {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("WORKFLOW_EMPTY: a workflow needs a title and an instruction");
  if (input.id?.startsWith("builtin-")) throw new Error("WORKFLOW_BUILT_IN: a built-in workflow cannot be changed");
  const id = input.id || `wf-${randomUUID()}`;
  const next = { id, title, body, builtIn: false };
  return custom.some((w) => w.id === id) ? custom.map((w) => (w.id === id ? next : w)) : [...custom, next];
}

export function remove(custom: Workflow[], id: string): Workflow[] {
  if (id.startsWith("builtin-")) throw new Error("WORKFLOW_BUILT_IN: a built-in workflow cannot be deleted");
  return custom.filter((w) => w.id !== id);
}
