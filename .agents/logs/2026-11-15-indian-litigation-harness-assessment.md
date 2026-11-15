# Assessment: making Open Advocate a first-class Indian litigation harness

**Superseded** by [2026-11-15-litigation-harness-report.md](2026-11-15-litigation-harness-report.md) and [2026-11-15-litigation-harness-plan.md](2026-11-15-litigation-harness-plan.md).

Date: 2026-11-15. Author: the agent, on the owner's instruction. This report governs nothing (see [docs/README.md](../../docs/README.md)). It recommends. The owner decides.

Scope set by the owner: Indian litigation only. No practice management (no billing, time, CRM, invoicing, firm analytics, client portal, contract lifecycle). The Supreme Court SLP becomes one proceeding among many.

---

## 1. Key points

1. **Open Advocate already has most of the harness.** v5 has a single-writer matter store with a hash-chained event record, page and line anchors, two-engine OCR with disputes, a Notebook, a chronology, tabular record review (`record_column`, `record_cell`), research tools, authority support and voice, treatment records, an argument loop, rehearsal, gates, a validator, a filing set with an AI-use disclosure, hearings and reminders. Harvey and Legora sell these as separate products. The gap is not features. The gap is that the matter, the drafts, the gates and the filing rules assume one forum (the Supreme Court) and one proceeding (the SLP).
2. **The single most important change is a forum-and-proceeding layer.** Every matter gets a forum (court, bench, establishment) and a proceeding type (for example a regular bail application under BNSS before a Sessions Court). The forum pack and the proceeding pack then supply the drafts, the limitation rule, the filing checklist, the gates and the skills. The SLP becomes the first proceeding pack, built from what exists.
3. **Skills are the right unit for the rest, and claude-for-legal shows the format.** A skill is a versioned markdown file with a description, required inputs, the tools it may call, its output form and its gates. claude-for-legal has 12 plugins and about 150 skills. None is Indian. About 15 of its litigation and clinic skills transfer as method. Its shared guardrails transfer almost whole.
4. **lavern contributes quality machinery, not legal content.** It is a contract-review lab. Its useful parts are a mechanical grounding check, an evaluator gate with a two-loop limit, a dissent panel of different models, a memory lifecycle (tentative, confirmed, deprecated), session report cards, and a public trail of evaluation reports.
5. **The two pasted proposals are mostly compatible, with four conflicts.** They propose a Rust runtime, an embedded graph database as a peer store, practice management, and judge-level bench intelligence. Decisions 1 and 4, the owner's scope for this task, and ruling R-1 exclude these. Everything else can sit on the existing architecture: the graph and the context package are derived from the matter store; typed memory is rows in the matter store.
6. **Two items need the owner before any build starts.** The advocate workflow governs and is written for the SLP; it needs an owner-approved extension for other proceedings. Decision 10 (English only, Hindi OCR out of scope) is worded for Supreme Court documents; trial and High Court work in many states produces vernacular records. Section 12 states both.
7. **Recommended first round (lessons L1, L5):** one thin end-to-end slice for five proceedings in two forums, each with one skill, one draft, one limitation rule and one filing checklist, proven on a real brief by the owner. Not 16 practice packs.

---

## 2. What I read

| Source | Version read | What I read |
|---|---|---|
| `docs/README.md`, `decisions.md`, `parking.md`, `repo-map.md`, `specs/v5.md`, outline of `advocate-workflow.md` and `specs/v4.md` | `main` at `87a35fb` | Full or headings |
| `src/lib/matter-store` table names, agent tool names in `src/main`, `src/lib/workflows/index.ts` | `87a35fb` | Grep only |
| github.com/anthropics/claude-for-legal | commit `4a6c651` (2026-07-23) | Root `README.md`, `CLAUDE.md`; `litigation-legal/README.md`, `CLAUDE.md` (practice profile and shared guardrails, 585 lines); skills `chronology`, `brief-section-drafter` (heads); descriptions of all litigation, clinic, builder-hub and tabular skills; `agents/docket-watcher.md`; `managed-agent-cookbooks/docket-watcher`; `legal-builder-hub/skills/skills-qa` (headings); `claim-chart/references/element-templates.md` (head) |
| github.com/AnttiHero/lavern | commit `526a3b8` (2026-09-05) | `README.md`; `docs/architecture-spec.md` (pipeline and rules); `docs/agent-roles-spec.md` (headings); list of 67 prompts, 9 workflows, 23 tool files; header comments of 10 tools; `src/mcp/tools/grounding-verifier.ts` (head); `evals/jv/EVAL_REPORT_V34.md` (end) |
| harvey.ai/platform, harvey.ai/platform/vault | fetched 2026-11-15 | Product list, Vault description |
| legora.com/product/skills | fetched 2026-11-15 | Skills description, library size, litigation examples |
| Indian market | one web search, one vendor blog on the court data stack | Third-party and vendor claims; marked as such below |

Clones are in the session scratchpad, not in the repository. I did not run either project. I did not read every skill. I read no reference repository of our own (none was named).

Licence facts, as facts only: claude-for-legal ships an Apache License 2.0 file. lavern ships an Apache License 2.0 file and a `NOTICE`; its README says its five seeded datasets each carry their own licence.

---

## 3. Where Open Advocate stands

### 3.1 What is already general

These parts do not depend on the SLP and serve any Indian proceeding as they are:

- Matter store, content-addressed files, hash-chained events, refused writes, Inspector (V5-1 to V5-3).
- Ingestion, two-engine OCR with critical-token disputes, page and line anchors, entities (V5-6, V5-8).
- Notebook, chronology, date conflicts, corrections with reasons (V5-7).
- Record table: one row per source, one column per question, cells filled by the agent with anchors. This is the equivalent of Harvey review tables and Legora Tabular Review.
- Research: judgment index, statutes, web, save judgment and provision, quick check, support and voice, treatment with the overruling check (V5-9, V5-10).
- Argument loop, rehearsal and challenge register (V4-3, V5-11).
- Matter memory with agent proposals the advocate decides (V1-3, V2-8).
- Hearings, orders and impact checks, docket, reminders (V5-19, V5-20).
- Usage, budget, confidential matters on local models only, Stop (V5-21, V5-22).
- AI-use disclosure, paper book, conversion check, signed manifest (V5-17, V2-7).

### 3.2 What is bound to the SLP

| Part | How it is bound | What it needs |
|---|---|---|
| `docs/advocate-workflow.md` | Section 1 objective: "From instruction to filing-ready SLP". Sections 8 to 11 describe SLP parts. | An owner-approved extension (section 12). |
| `src/lib/drafting/structured.ts` | Generates Synopsis, List of Dates, Questions of Law, Grounds. | A draft template per proceeding. |
| `src/lib/filing/index.ts` | Supreme Court filing set. | A filing checklist per forum. |
| `src/lib/ulos` (vendored validator and court database) | Validator of court public records. | Facts only: I did not read its court coverage. Check it at the forum step. |
| Limitation (`limitation` table, V5-16) | Rule for the SLP period with the certified-copy exclusion. | A limitation rule per proceeding, with its source. |
| Built-in workflows | Five SLP steps ("Analyse the impugned judgment" … "Draft Questions of Law and Grounds"). | Become the SLP proceeding pack's skills. |
| Portal (`src/main/portal.ts`) | Supreme Court e-filing. | One adapter per portal, added only when a forum needs it. |
| `matter_details` | Matter facts. | Forum and proceeding fields (section 7.1). |

---

## 4. claude-for-legal

### 4.1 What it is

A plugin marketplace for Claude Code and Claude Cowork. Twelve first-party plugins (commercial, corporate, employment, IP, litigation, privacy, product, regulatory, AI governance, legal clinic, law student, legal builder hub), one vendor plugin (CoCounsel), and five managed-agent cookbooks (docket watcher, renewal watcher, regulatory monitor, diligence grid, launch radar). It is prompt content, not application code. All of it is written for US practice. The guardrails name the Federal Rules, FRE 408, ASC 450 and US privilege doctrine.

Its structure:

- **A practice profile** (`CLAUDE.md` per plugin) written by a **cold-start interview**: role, side (plaintiff or defence), risk calibration, house style, integrations. Every skill reads it first. A skill refuses to do substantive work while the profile still has placeholders.
- **Skills** (`skills/<name>/SKILL.md`): frontmatter with `name`, `description` (with trigger phrases) and `argument-hint`, then a workflow.
- **Agents** (`agents/<name>.md`): scheduled workers with a declared tool list.
- **Cookbooks**: an orchestrator with read-only tools; subagent leaves that hold the external tools; only one leaf may write; schema-validated JSON between them; a lint script checks that no orchestrator is over-granted.
- **A builder hub**: a skill registry, an installer that shows the raw skill before it installs, a prompt-injection scan, and `skills-qa`, which scores a skill against thirteen design parameters and three legal failure modes.

### 4.2 The guardrails: the most transferable part

The litigation `CLAUDE.md` states one set of shared guardrails. Most map onto Open Advocate states that already exist or are one field away.

| Guardrail in claude-for-legal | Open Advocate today | Proposed use |
|---|---|---|
| Source tags describe provenance, not confidence: `[CourtListener]`, `[statute / regulator site]`, `[user provided]`, `[model knowledge — verify]`, `[settled — last confirmed YYYY-MM-DD]`. A tag is never promoted because a cite "seems right". | Validator outcomes; quick check labelled "not verified"; attestation (R-2); `client_supplied` (R-6). | Give every proposition, citation and fact in a draft one provenance value from a closed list, computed from tool results in the run, never from model text. Show it in the Inspector and the disclosure. |
| One reviewer note above each deliverable: sources, coverage read, items flagged for judgment, currency, what to do before relying. The deliverable stays clean. | Harness bar, review inbox. | A fixed reviewer note on every skill output. The **Read** line (pages read of pages present) is new and important. |
| Three markers: `[CITE: …]`, `[VERIFY: …]`, `[SME VERIFY: …]`. A draft with an open marker is not final. | Review items; gates. | Markers in drafts become review items; the gate refuses a filing set with an open marker. |
| Verbatim quotes must be verbatim; no quotation marks without the passage open. | Anchors; grounding of agent changes. | A mechanical check: every quoted span in a draft matches an anchored source line (section 5.2). |
| A pinpoint must support the whole proposition ("misgrounded citation"). | Support assessment (V5-10). | Run support assessment per proposition, not per authority. |
| Citation coverage: extract every citation, check each, report "checked N of M"; "could not check" is never "confirmed". | Citation checks; R-5 (`unresolved` blocks). | Add the coverage count to the reviewer note. |
| Currency trigger: search before relying on model knowledge where recency matters. | Online verification (R-5). | A `currency` field on each statute and rule record: date last checked against the official source. |
| Jurisdiction recognition: detect, assess, say so, never answer confidently with the wrong jurisdiction's law. | None as a rule. | Central to Indian work: the forum pack names the governing procedural code by date (CrPC or BNSS, IPC or BNS, Evidence Act or BSA). A skill with no pack for the forum says so and stops. |
| Large input: know what you read; never a confident output from a partial read. | Ingest jobs; record table. | Coverage recorded per run. |
| Cross-skill severity floor: a downstream skill never silently lowers an upstream severity. | Review items have kinds. | Keep the severity of a review item when another skill consumes it. |
| Retrieved content is data, not instructions. | Standing order in AGENTS.md. | Add a mechanical scan of fetched pages and ingested documents for embedded directives; raise a review item. |
| Verification log: who verified what against which source and when; reuse within a freshness window. | Attestations; events. | One shared verification record across matters for public law sources (judgments, statutes), never for client documents. |
| Decision posture: prefer the recoverable error; over-flag. | Gates. | Unchanged. |
| Witness statements: will not write evidence in the witness's voice (England PD 57AC). | None. | Indian equivalent for affidavits of evidence and statements: the agent prepares questions and organises the deponent's own words; it does not compose the deponent's evidence. The owner sets the rule (it is a professional-conduct choice, not mine). |
| Proportionality: size the answer to the question. | None. | Keep as a style rule in the system prompt. |

### 4.3 The skills, mapped to Indian litigation

Transfer means: the method transfers; the US legal content does not.

| claude-for-legal skill | Transfer | Indian litigation use |
|---|---|---|
| `cold-start-interview` | High | Advocate profile: forums, benches, proceeding types, side, drafting style, citation format, languages. Writes a profile the skills read (section 7.4). |
| `matter-intake` | High | Intake that sets forum, proceeding type, parties, stage, governing date, first limitation. |
| `chronology` | Already built | Add the side framing for significance (petitioner or respondent; prosecution or accused) and the Statement-of-Facts variant. |
| `brief-section-drafter` | High | Section drafter for any pleading part (facts, grounds, prayer) with record fidelity and the candour rule on weak points. |
| `claim-chart` (civil element chart) | High | Element chart: each ingredient of an offence or each element of a cause of action, mapped to record anchors, with gaps. For example the ingredients of an offence in a quashing petition, or the three interim-injunction conditions. |
| `matter-briefing` | High | "Brief me on this matter" before a hearing; reads hearings, orders, open review items. |
| `matter-update` | Built | Hearing record (V5-19). |
| `deposition-prep` | Medium | Cross-examination plan for trial work: witness, prior statements (Section 161/180 statements, chief affidavit), contradictions with anchors. |
| `demand-draft`, `demand-received` | Medium | Legal notice and reply to notice (for example a statutory notice before a cheque-bounce complaint or a notice to a government body before suit). Litigation-adjacent; keep. |
| `subpoena-triage` | Low | Indian equivalent is a summons or a notice to produce; small. |
| `legal-hold`, `privilege-log-review`, `oc-status`, `portfolio-status` | None | US discovery and in-house management. Excluded by scope. |
| `legal-clinic/deadlines` | High | Deadline register with warnings at 14, 7, 3, 1 days. Docket (V5-20) has most of it. |
| `legal-clinic/supervisor-review-queue` | Medium | A senior's review queue for juniors' drafts in a chamber. Single-user today; park. |
| `corporate-legal/tabular-review` | Built | Record table. Add column templates per proceeding (section 8). |
| `legal-builder-hub/skills-qa` | High | Use its thirteen parameters to review every Open Advocate skill before it ships (section 9). |
| `legal-builder-hub/skill-installer` | Medium | Show the raw skill, scan it, ask before install. Needed only if the owner imports skills from others. |
| `docket-watcher` agent and cookbook | High, as design | Case-status and order watcher (section 8.9). Its "What it does NOT do" list transfers almost word for word: computed deadlines are leads; a quiet docket is not a clean docket. |

### 4.4 What does not transfer

- The plugin form. Open Advocate is one Electron application, and Pi gets only the tools we register (decision 2, choice 13: our `ResourceLoader` discovers no skills). Skills must be our own records, loaded by our code.
- Cookbook subagents. Choice 13 and v5 "Not taken" exclude sub-agents. The pattern still informs tool scope per skill: an orchestration step that only reads, and a single writer.
- In-house risk vocabulary (reserves, settlement authority, insurers, board memos).

---

## 5. lavern

### 5.1 What it is

A multi-agent contract-review system by a law-firm founder. Its README says it "is not a product" and that the legal quality is "a hypothesis". 67 agent prompts on one model, a debate board, three verification layers, human gates, a "Precedent Board" memory, three providers (Anthropic, Mistral, local Ollama), a React dashboard, an autonomous folder watcher ("Clawern"). Its seeded datasets are contract datasets (CUAD, MAUD, ACORD, UNFAIR-ToS, LEDGAR). It has no Indian content and no litigation workflow beyond prompts named `litigation-associate`, `litigation-partner` and `dispute-resolution`.

Its own architecture spec says debate structure alone does not reliably beat a strong single agent, and that value comes from heterogeneous agents. That matches parking row "A second, different model family for the critic and opposing counsel".

### 5.2 What transfers

| lavern part | Open Advocate use |
|---|---|
| **Grounding verifier** (`grounding-verifier.ts`): no model call; extracts quoted text and section references from a finding and checks them against the parsed document; score = matched / total. | Run on every draft and every agent answer: each quoted span must match an anchored source line; each "para N" or "page N" reference must exist. A failed match is a review item. Cheap, deterministic, fits decision 6. |
| **Evaluator gate**: every deliverable is checked against a rubric; at most two revision loops; then stop and escalate to the human; the evaluator uses a different model or prompt from the drafter. | Wrap each skill's output: skill rubric → pass, or revise (max 2), or a review item. The argument loop already has a critic; generalise it. |
| **Dissent panel**: different models answer one hard question; a split is a finding, shown, not hidden. | For a contested interpretation of a provision or a maintainability point: show a split as a review item. Uses the parked second model family. |
| **Memory lifecycle**: `tentative` → `confirmed` → `deprecated`; anti-patterns recorded from failures. | Advocate memory and chamber precedents (section 7.5). Promotion is by the advocate, never by recurrence alone (decision 5). |
| **Report card and baselines**: per session, structured quality metrics; regression against a baseline per document type. | Per skill run: citations checked, grounding score, review items raised, advocate corrections. Feeds section 9. |
| **Handoffs**: a structured summary at each phase change. | A skill writes a handoff record when it ends; the next skill reads it. Replaces free chat context between steps. |
| **Public evaluation trail** (`evals/jv/EVAL_REPORT_V*.md`, archived runs): each failure mode named, fixed, re-measured on the same ten documents. | The model for Open Advocate's own gold set on the owner's briefs (lesson L3). |
| **Local-first default**: single user, no login, local model provider. | Already the case (V5-21 confidential matters on local models). |

### 5.3 What does not transfer

The 67-persona "law firm of the future", risk pricing and insurance agents, legal design and behavioural agents, the business-development agents, billing, multi-user hosting, Telegram push, A2A server. These are practice management or outside scope.

---

## 6. Commercial platforms

All facts here come from the vendors' own pages or third-party blogs, fetched on 2026-11-15. They are marketing claims. I verified none by use.

### 6.1 Harvey

Product list on harvey.ai/platform: Agents (plans a task, returns a "review-ready, fully cited result"), Workflows, Vault (stores and bulk-analyses documents; review tables over "thousands of documents"; up to 100,000 files per vault), Knowledge (research), Spaces (shared workspaces with outside parties), Command Center (adoption analytics), Memory (user preferences), Legal Work Orchestration, Contract Intelligence, Horizon Scanning, Intake, **Facts & Chronologies** ("Connect facts, strengthen your case"), a connector library over MCP, Word and Outlook add-ins.

What it teaches Open Advocate: the products are joined by one document store (Vault) and one memory. Open Advocate's matter store is already that join. Facts & Chronologies is a recent product; Open Advocate's Notebook is the same idea and older in this repository.

### 6.2 Legora

From legora.com/product/skills: Skills "teach the Agent how you work". 250+ skills across 20+ practice areas. Library skills are written and tested by Legora's legal engineers; the agent can also build a skill with the user. Skills are personal, team or organisation; matter permissions apply to them. The agent picks a skill from a plain-language request, or the user types `/` for a skill and `@` for context. The user can see a skill's instructions. Litigation examples named: Chronology Creation from Evidence, Settlement Analysis Builder, Pleadings Matrix (arbitration), Hearing Bundle Audit (arbitration). Other products listed: Tabular Review, Word and Outlook add-ins, Editor, Workflows, Legal Research, Portal, Monitors, Lists, Intake.

What it teaches Open Advocate: the skill is the unit the lawyer sees and trusts. The `/` and `@` gestures fit the existing chat composer and command bar. "Hearing Bundle Audit" is the paper book check (V5-17) under another name.

### 6.3 Indian market

From one search (third-party guides, May to April 2026, and a Microsoft news item, January 2026):

- SCC Online: an AI assistant over its own database; the Microsoft item says more than 4 million judgments across 400+ databases.
- Manupatra: AI research, case management, compliance and contract analysis over its database.
- CaseMine: AMICUS; "CaseGraph", a map of how judgments relate.
- Jhana: an AI paralegal; claims 16 million judgments and statutes.
- Adalat AI: hearing transcription for courts; one source says 4,000+ courtrooms. Court-side, not advocate-side.

From the eCourtsIndia blog (a vendor; self-interested): eCourts Services is built for single-case lookup; no public general-purpose API; NJDG gives aggregate statistics; 25 High Court portals with different interfaces and cause-list formats; tribunals have their own portals; CAPTCHAs limit bulk access; district and taluka records are thin in research databases; agents reading vernacular court documents at scale "do not yet exist".

What it teaches Open Advocate:

1. Indian research products are database-first. None of the sources describes a matter-centred harness that drafts, gates and files across forums. That is the space Open Advocate fills.
2. Open Advocate should not compete on corpus size. It should **use** corpora the advocate already subscribes to (Indian Kanoon API is already parked; SCC Online and Manupatra only through the advocate's own session in the visible browser, as the Supreme Court portal works today).
3. Court data access stays as the workflow sets it: the advocate's own session, the advocate solves CAPTCHAs, no bulk harvesting (v5 "Not taken").

---

## 7. Assessment of the two pasted proposals

The owner pasted two long proposals. Below, each major item is set against the frozen decisions, the lessons and this task's scope.

| Proposal item | Verdict | Reason |
|---|---|---|
| "Legal operating system" for all legal work (advisory, transactions, contracts, compliance) | **Not taken** | The owner's scope: litigation only. |
| Practice management: clients, billing, time, CRM, firm analytics, client portal | **Not taken** | The owner's scope. Contacts (V5-23) and the docket stay as they are; they serve litigation. |
| Rust runtime; "Rust desktop direction" | **Not taken** | Decision 1. The second proposal already says "establish which runtime is authoritative"; decision 1 answers it. |
| LadybugDB or another embedded graph as a store | **Changed** | Decision 4: one writer of matter facts. A graph is acceptable only as a derived, rebuildable index over `matter.db` and `corpus.db`. Both proposals say this themselves. SQLite tables with edge rows are enough for v0. |
| Three graphs (legal knowledge, matter evidence, advocate memory) | **Taken as views** | Matter evidence graph = existing links (anchors, `paragraph_link`, event to source). Legal knowledge graph = `treatment` + provisions + citations in `corpus.db`. Advocate memory = section 7.5. No new store. |
| Context Assembly Engine with recorded context packages | **Taken, thin** | Each skill declares the records it needs. The main process builds the package from the matter store and records the ids sent (decision 7: link by ids). See 7.3. |
| Typed memory with `valid_from`, `recorded_at`, `supersedes` | **Taken** | Fits the matter store and memory proposals (V2-8). See 7.5. |
| Jurisdiction resolution engine (territorial, pecuniary, subject-matter, appellate) | **Taken as data plus questions, not as decisions** | The forum pack holds facts (which court hears which proceeding, appeal routes, limitation rules), each with its official source and date. The agent may say "jurisdiction undetermined" and list the facts it needs. It never decides the forum; the advocate does. |
| Temporal law (IPC to BNS, CrPC to BNSS, Evidence Act to BSA) | **Taken** | Already parked as point-in-time statutes. Becomes required: the governing date of the matter selects the code. |
| Bench and judge intelligence; judge tenure; "subject-matter experience reflected in judgments" | **Changed** | Ruling R-1: no judge identifier in any score. Bench composition from the cause list is a fact the advocate needs and may be shown. Any per-judge analysis is not built. |
| Win-probability engine | **Not taken** | Both proposals reject it; R-1. |
| Multi-user, ethical walls, external counsel access | **Not taken** | v5 "Not taken"; decision 1 (one desktop application). |
| Communication intelligence (Gmail, WhatsApp exports) | **Partly existing** | Mail import exists (workflow section 3). WhatsApp chat exports are evidence; ingest them as sources. No sending integrations. |
| Background agents and event triggers | **Taken, thin** | A watcher runs only while the application runs, only over the advocate's own matters and permitted sources, and writes review items. Never files, never sends. |
| Plugin system with manifests | **Not taken now** | Decision 2 and choice 13 limit the agent to our tools. Skills (content) are enough. A code plugin system is a later question. |
| 16 practice-area packs | **Changed** | Lesson L5: thin end-to-end first. Start with five proceedings (section 10). |
| Advocate profile and onboarding first | **Taken** | It configures forums and proceedings. Cheap, and every skill reads it. |
| Five real-world proof tests by practising lawyers | **Taken** | Matches lesson L3. Adapted to litigation in section 10. |

### 7.1 Matter model extension

Add to `matter_details` (or a `matter_forum` table), each field confirmed by the advocate:

- `forum_id` (from the forum pack), `bench` or seat, `establishment` (for district courts).
- `proceeding_type` (from the proceeding pack), `side` (petitioner, respondent, applicant, accused, complainant, appellant, intervener).
- `stage` from the proceeding's own state list (a bail application is not a suit).
- `governing_date` (the date that selects the procedural and substantive code), with its source.
- `case_number` as the forum writes it, and the CNR where the forum uses one.
- `parent_matter` and `related_matters` (appeal from, connected case, the FIR behind a bail application).

The SLP matter becomes `forum = Supreme Court of India`, `proceeding_type = SLP (Civil)` or `SLP (Criminal)`. Existing matters migrate to that.

### 7.2 Forum pack and proceeding pack

Two kinds of versioned, dated data, each row with its official source URL, retrieval date and the advocate's confirmation state:

- **Forum pack** (per court or tribunal): name, seats and benches, case-type names, e-filing portal, page and format rules, court-fee rule reference, holidays list source, cause-list source, certified-copy procedure, the gates that apply.
- **Proceeding pack** (per proceeding type): forum(s), governing provisions by date, limitation rule and its source, required parts of the pleading, annexure rules, the draft template, the filing checklist, the record-table column template, the skills that apply, the questions the intake asks.

Rules: a pack row with no official source or an old retrieval date is shown as "not confirmed" and blocks nothing silently (R-5 pattern: unresolved blocks the gate that depends on it). The agent never writes a pack row; the advocate confirms each (decision 5). Lesson L2: a pack with five confirmed rows is honest; a pack with fifty unconfirmed rows pretends.

### 7.3 Context package

For each skill run, the main process:

1. Reads the skill's `requires` list (for example: matter forum, chronology, the impugned order, accepted issues, authorities with support assessment, advocate drafting preferences).
2. Selects those records from the matter store by id, with anchors.
3. Records the package as one row: skill id and version, record ids included, records excluded with the reason, token estimate.
4. Sends it to the Pi session as the first message of the run.

No summary replaces a source; a summary carries the anchors it summarises. This is the "context assembly" of the proposals, built from existing parts.

### 7.4 Advocate profile

Written once by an onboarding interview (the claude-for-legal cold-start pattern), editable at any time, stored in user data beside `settings.json`:

- Forums and benches the advocate appears before; proceeding types handled; usual side.
- Trial work, appellate work, or both.
- Drafting preferences: citation format (neutral citation, SCC, AIR), paragraph style, length.
- Languages of the records the advocate receives (this feeds the decision 10 question).

The profile selects which forum and proceeding packs load, and the skills the command bar offers. It never holds credentials (the paste agrees).

### 7.5 Typed memory

One table in each matter store and one in user data (for the advocate), each row: `id`, `kind` (fact preference, instruction from client, advocate decision, rejected argument, lesson), `text`, `source_id`, `valid_from`, `recorded_at`, `status` (`tentative`, `confirmed`, `deprecated`), `supersedes`. The agent proposes; the advocate confirms (V2-8). A model inference is never `confirmed` by the agent. Cross-matter memory holds only the advocate's preferences and public-law verifications, never facts of another matter.

---

## 8. The Indian litigation skill catalogue

A skill here is a markdown file with frontmatter, kept in the repository (built-in) or in user data (the advocate's own), loaded by our code, never by Pi discovery. Proposed frontmatter:

```
id, version, title, description (with trigger phrases)
forums, proceedings            # where it applies
requires                       # records for the context package
tools                          # subset of the registered tools
output                         # draft part | review items | record-table columns | memo
gates                          # checks run on the output (grounding, citations, markers)
human_only                     # the advocate decisions it ends with
tests                          # fixture briefs and the expected properties
```

The body is the method: steps, rubric, what it must not do. The `tools` list narrows, never widens, the registered tools (decision 2). Every skill ends in a reviewer note and a set of options, not a decision.

The catalogue below is grouped by stage. "Exists" means a tool or feature in v5 does most of it. Provision references are given as facts for orientation and are marked to be confirmed against India Code in the pack; they are not legal statements.

### 8.1 Intake and assessment (every proceeding)

| Skill | What it produces | Exists |
|---|---|---|
| Matter intake | Forum, proceeding, side, parties, governing date, case number; questions for missing items | Partly (matter creation, V5-24 questions) |
| Forum and route facts | The forum pack rows that apply, the appeal or revision route rows, unresolved facts; may answer "undetermined" | New |
| Limitation working | Period, start, exclusions, end, with each rule's source and the advocate's confirmation | Exists for SLP (V5-16); generalise |
| Governing code check | Which code applies on the governing date (IPC or BNS, CrPC or BNSS, Evidence Act or BSA) and the transition rows the pack holds | New; needs point-in-time statutes |
| Document completeness | Required records for the proceeding against what is in the matter; a request list for the client | Partly (V5-24) |
| Impugned order analysis | Findings, reasons, provisions applied, paragraphs relied on, each anchored | Exists (built-in workflow 1) |

### 8.2 Criminal (Sessions Court, High Court)

| Skill | Notes |
|---|---|
| FIR and complaint analysis | Allegations, the accused's alleged role, sections invoked, dates, delay, anchored. Element chart of each offence's ingredients against the FIR text. |
| Regular bail application | Custody period, prior applications and their outcome (a required disclosure in many forums: pack row), grounds drafted from the record, conditions offered as options. Proceeding pack for BNSS section 483 (CrPC 439) [confirm in pack]. |
| Anticipatory bail application | BNSS section 482 (CrPC 438) [confirm in pack]. Same structure; apprehension facts. |
| Quashing petition | High Court inherent powers, BNSS section 528 (CrPC 482) [confirm in pack]. Element chart: does the FIR text disclose each ingredient. The advocate decides; the chart shows gaps with anchors. |
| Charge-sheet analysis | Witness list, statements, documents relied on, forensic reports, gaps against the FIR. Record table template. |
| Discharge application | From charge-sheet analysis. |
| Witness contradiction table | Statement to police vs deposition vs other witnesses, per fact, anchored. A cross-examination plan as questions, not as evidence. |
| Criminal appeal and revision | Grounds from judgment analysis; limitation from the pack. |

### 8.3 Civil and commercial (District Court, Commercial Court, High Court original side)

| Skill | Notes |
|---|---|
| Plaint review and plaint drafting skeleton | Required parts from the pack (cause of action, jurisdiction paragraph, valuation, court-fee paragraph, prayer); each fact anchored. |
| Written statement | Para-wise admission and denial table against the plaint; every denial has a stated basis or a `[VERIFY]`. |
| Interim injunction application | Element chart of the three conditions the pack lists, each mapped to record anchors. |
| Commercial disclosure and statement of truth | Pack-driven checklist for commercial suits (Commercial Courts Act) [confirm in pack]. |
| Issues proposal | Proposed issues from pleadings, for the advocate to frame. |
| Evidence affidavit preparation | Questions to elicit the deponent's account; the deponent's words recorded; documents shown listed. Not composed by the agent (section 4.2, last rows). |
| Execution application | From decree analysis. |

### 8.4 Constitutional and writ (High Court, Supreme Court Article 32)

| Skill | Notes |
|---|---|
| Writ maintainability questions | The facts the advocate needs to settle maintainability (alternative remedy, delay, locus, public body), each as a question with record anchors; no conclusion. |
| Writ petition skeleton | Pack-driven parts; prayer options. |
| Counter-affidavit and rejoinder | Para-wise reply table. |

### 8.5 Arbitration-related court work

| Skill | Notes |
|---|---|
| Arbitration agreement extraction | Clause text, seat, venue, governing law, appointment procedure, anchored. |
| Section 9 interim measures application | Pack-driven; element chart. |
| Section 11 appointment application | Notice of invocation dates, limitation working. |
| Section 34 challenge | Grounds from award analysis, limitation with the pack's rule on the outer limit [confirm in pack]. |
| Section 36 enforcement | Award, stay status, execution facts. |

### 8.6 Appeals (any forum)

| Skill | Notes |
|---|---|
| Appealability and route facts | Pack rows; "undetermined" allowed. |
| Grounds of appeal | Generalises built-in workflow 5. |
| Delay and condonation application | Exists for SLP (V2-6); generalise. |
| Stay application | From grounds; balance-of-convenience facts. |
| SLP pack | The existing workflow, unchanged. |

### 8.7 Hearing preparation (every proceeding)

| Skill | Notes |
|---|---|
| Hearing brief | One page: posture, last order's directions, what is listed, open items. claude-for-legal `matter-briefing`. |
| Bench questions and answers | Exists (V5-11 rehearsal). |
| Oral outline | Three or four points, strongest first (brief-section-drafter's oral mode). |
| Compilation of authorities | Authorities bundle with paragraphs marked; uses support and voice. |
| Post-hearing record | Exists (V5-19). |

### 8.8 Verification and filing (every proceeding)

| Skill | Notes |
|---|---|
| Grounding check | lavern pattern (section 5.2). New, deterministic. |
| Citation coverage | Exists (checks); add "checked N of M". |
| Marker check | Open `[CITE]`, `[VERIFY]`, `[SME VERIFY]` block the filing set. |
| Forum filing checklist | Pack-driven; generalises the Supreme Court filing set. |
| Defect reply | Registry defect list to a corrected set and a covering note. |
| Paper book and index | Exists (V5-17); format rules from the forum pack. |
| AI-use disclosure | Exists (R-3). |

### 8.9 Watchers (while the application runs)

| Watcher | Rules |
|---|---|
| Case status and orders | The advocate's matters only; the advocate's own session; new order → impact check (exists V5-19). Computed dates are leads, never entered in the docket without the advocate. A quiet result says "no change seen", never "no change". |
| Authority treatment | When a saved authority gains a recorded treatment, open a review item in every matter that relies on it. |
| Statute currency | When India Code text for a saved provision changes, mark the provision record stale. |

---

## 9. Quality: how we know a skill works

Lesson L3: done means the owner completed a real task on a real brief. For skills that is not enough alone, because a skill changes with every edit. Proposed:

1. **Skill review before ship**: score each skill against the thirteen `skills-qa` parameters (audience, work shape, delegation threshold, inputs, versioning, confidence bands, failure modes including the three legal ones, scope, escalation, and the rest). Record the score with the skill version.
2. **Gold set from the owner's briefs**: for each proceeding pack, two or three real, closed briefs the owner selects, with the owner's own filed document as the reference. Properties checked mechanically: every quote grounded, every citation resolved or flagged, required parts present, limitation working matches the owner's.
3. **Report card per run** (lavern pattern): grounding score, citations checked of found, review items raised, advocate corrections. Stored in the matter folder beside the Pi session (decision 7).
4. **Evaluation trail**: one report per skill version under `.agents/logs/`, in the lavern style: failure mode named, fix, re-measured on the same briefs.
5. **No AI-judges-AI as proof** (the paste agrees): a model critic may gate; only the owner's review counts as evidence.

---

## 10. Recommended build order

Lessons L1 and L5: one thin slice through every new part, joined end to end, before any part grows.

**Round A: the general layer, proven on the SLP.**
1. Matter forum and proceeding fields; migrate SLP matters.
2. Forum pack and proceeding pack tables with sources and confirmation; one forum (Supreme Court) and one proceeding (SLP) filled from what exists.
3. Skill registry: load built-in skills from the repository and the advocate's skills from user data; the five SLP workflows become five skills with frontmatter.
4. Context package record per skill run.
5. Reviewer note, provenance values and the grounding check on every skill output.

Proof: the owner runs the SLP on a real brief through skills and sees no loss against v5.

**Round B: two new forums, five proceedings, one skill each (thin).**

| Proof task | Forum | Proceeding | One skill | One draft | One limitation row | One checklist |
|---|---|---|---|---|---|---|
| 1 | A High Court the owner practises before | Regular bail or anticipatory bail | FIR analysis with element chart | Bail application | — or the pack's rule | Forum filing checklist |
| 2 | Same High Court | Quashing petition | Ingredients chart | Petition skeleton | — | Same |
| 3 | Same High Court | Writ petition | Maintainability questions | Writ skeleton | Delay facts | Same |
| 4 | Same High Court or a Commercial Court | Section 34 challenge | Award analysis | Petition skeleton | Pack rule | Same |
| 5 | Supreme Court | SLP (existing) | — | — | Existing | Existing |

Plus a sixth test from the paste: the owner returns to a matter after weeks and the hearing brief recovers the correct posture, decisions and open items.

The owner picks the High Court and the proceedings. Each proof is one real brief, completed by the owner (L3).

**Round C onward**: more proceedings, the watchers, the advocate profile interview, the dissent panel with a second model family, point-in-time statutes. Each enters only when the owner moves it from parking into the build plan (L6).

---

## 11. Not taken, with the reason

| Item | Reason |
|---|---|
| Practice management of every kind (billing, time, CRM, invoicing, profitability, client portal, CLM, compliance calendars, transactions) | The owner's scope for this task |
| Rust, a second store of matter facts, a graph database as an authority | Decisions 1 and 4 |
| Pi skill discovery, extensions, sub-agents | Decision 2, choice 13 |
| Per-judge analysis, outcome prediction | Ruling R-1 |
| Bulk court harvesting, CAPTCHA solving, automated filing without the two confirmations | v5 "Not taken"; workflow section 11 |
| Multi-user, SSO, ethical walls, team review queues | v5 "Not taken"; decision 1 |
| US discovery skills (legal hold, privilege log, subpoena triage, outside-counsel status) | No Indian litigation equivalent of the same weight |
| lavern's persona agents (design, pricing, business development, insurance) | Outside litigation |
| A corpus of our own to rival SCC Online or Manupatra | Not the product's advantage; use the advocate's own subscriptions and public sources |

---

## 12. What the owner must decide before Round A starts

Only items that block the build.

1. **Extend the advocate workflow.** `docs/advocate-workflow.md` governs every plan and is written for the SLP (section 1). Round A needs an owner-approved statement that the workflow applies to any proceeding, with the SLP as one proceeding pack. Until then, a forum-general build would conflict with the governing document. Unblock: the owner approves an amended section 1 (one page, lesson L1) or tells me to draft it.
2. **Decision 10 and vernacular records.** Decision 10 says Supreme Court documents are English and Hindi OCR is out of scope. Trial and High Court work in several states produces records in Hindi and other languages. Decision 10 is frozen and I do not reopen it. Unblock: the owner states whether Round B forums are limited to English records, or adds a new decision. The default I would use until answered: Round B is limited to English-language records.
3. **Which forums and proceedings for Round B.** The owner's practice decides this; I cannot. Unblock: name one High Court and four proceedings (section 10 table).

Items 1 and 3 can be answered in one message. Item 2 can wait until Round B.

---

## Sources

- [anthropics/claude-for-legal](https://github.com/anthropics/claude-for-legal), commit `4a6c651`
- [AnttiHero/lavern](https://github.com/AnttiHero/lavern), commit `526a3b8`
- [Harvey platform](https://www.harvey.ai/platform), [Harvey Vault](https://www.harvey.ai/platform/vault)
- [Legora Skills](https://legora.com/product/skills)
- [Mapping India's court data stack (eCourtsIndia blog, vendor)](https://blogs.ecourtsindia.com/2026/04/17/mapping-india-court-data-stack-njdg-apis-ai-agents/)
- [AI tools for lawyers in India, 2026 (iPleaders)](https://blog.ipleaders.in/ai-tools-for-lawyers-in-india-the-2026-definitive-guide/)
- [Best legal research tools 2026 (CaseMine blog, vendor)](https://www.casemine.com/blog/best-legal-research-tools-2026-india-ai)
- [Code of law: How AI is helping India's lawyers work faster (Microsoft, 2026-01-21)](https://news.microsoft.com/source/asia/2026/01/21/code-of-law-how-ai-is-helping-indias-lawyers-work-faster)
- Pasted proposals in the owner's message of 2026-11-15 (two documents)
