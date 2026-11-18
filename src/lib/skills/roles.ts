/**
 * O2: the roles. A role is a set of skills and a tool scope, never an authority
 * (architecture.md section 7). A skill's permitted tools must sit inside its role's scope.
 * Plain library (decision 6).
 */
import type { Role } from "../../shared/skills.ts";

/** Tools that read the matter and change nothing. */
export const READ_MATTER_TOOLS = [
  "list_sources",
  "read_source_text",
  "search_sources",
  "list_events",
  "get_chronology",
  "read_draft",
  "get_paragraph_source",
  "list_research",
  "list_research_plans",
  "list_record_table",
  "read_matter_memory",
  "find_in_matter",
  "list_arguments",
] as const;

/** Tools that read public law and the web. */
export const READ_LAW_TOOLS = ["search_knowledge", "verify_quote", "find_adverse_authority", "search_judgments", "read_judgment", "search_statutes", "read_statute_section", "search_citation_index", "web_search", "web_fetch"] as const;

/**
 * Tools no skill may have: the portal and filing steps (decision 25: filing by the agent is the
 * last phase), the plan, helpers and runs (a skill run starts nothing).
 */
export const NEVER_IN_A_SKILL = [
  "open_court_portal",
  "portal_read",
  "portal_navigate",
  "portal_fill",
  "portal_click",
  "upload_filing_file",
  "submit_filing",
  "save_portal_receipt",
  "plan_set",
  "plan_update",
  "start_helper",
  "helper_output",
  "stop_helper",
  "steer_helper",
  "run_skill",
  "recall_result",
] as const;

/** Names of human-only actions (decision 5). No tool may carry one; a skill naming one is refused. */
export const HUMAN_ONLY_PATTERN = /^(approve|confirm|attest|keep|undo|decide|accept|reject|submit)_/;

/** Tools that write a proposal, a candidate or a record. An approval point before_write asks before the first of them. */
export const WRITING_TOOLS = new Set([
  "propose_correction",
  "propose_issue",
  "add_authority",
  "write_memorandum",
  "propose_paragraph",
  "fill_record_cell",
  "propose_memory_note",
  "save_judgment",
  "save_provision",
  "assess_authority",
  "record_treatment",
  "run_argument_loop",
  "run_rehearsal",
]);

const R = [...READ_MATTER_TOOLS];
const L = [...READ_LAW_TOOLS];

export const ROLE_TABLE: Record<Role, { description: string; tools: string[] }> = {
  intake: { description: "Takes in a new matter or document and proposes its classification and what is missing.", tools: [...R, "propose_memory_note"] },
  jurisdiction: { description: "Settles the forum, limitation and the law on the governing date, as questions and workings.", tools: [...R, ...L] },
  research: { description: "Finds and assesses law, supporting and adverse, and records candidates and memoranda.", tools: [...R, ...L, "save_judgment", "save_provision", "add_authority", "assess_authority", "record_treatment", "write_memorandum", "write_research_memo", "propose_research_plan", "set_research_step", "propose_issue"] },
  evidence: { description: "Reads the record and answers questions of each source with exact anchors.", tools: [...R, "fill_record_cell"] },
  chronology: { description: "Builds and tests the chronology: dates, conflicts and contradictions.", tools: [...R] },
  drafting: { description: "Proposes text as tracked changes from confirmed records.", tools: [...R, "propose_correction", "propose_paragraph"] },
  review: { description: "Checks drafts, citations and grounding, and reports defects. It never approves its own run.", tools: [...R, "check_draft", "check_citations", "quick_check_citations", "search_knowledge", "read_judgment", "read_statute_section", "search_citation_index"] },
  strategy: { description: "Proposes issues and arguments and tests them with a critic.", tools: [...R, ...L, "propose_issue", "run_argument_loop"] },
  filing: { description: "Checks a filing-ready set against the court's checklist. It never files.", tools: [...R, "check_draft", "check_citations", "quick_check_citations"] },
  hearing: { description: "Prepares the hearing brief, bench questions and the oral outline.", tools: [...R, ...L, "run_rehearsal"] },
  monitoring: { description: "Reads new orders, cause lists and developments and proposes their impact.", tools: [...R, ...L] },
  memory: { description: "Proposes memory records after a run. The advocate decides each one.", tools: [...R, "propose_memory_note"] },
};
