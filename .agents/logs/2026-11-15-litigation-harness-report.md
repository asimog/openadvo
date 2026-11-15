# Open Advocate as an Indian litigation harness: report

Date: 2026-11-15. Replaces [2026-11-15-indian-litigation-harness-assessment.md](2026-11-15-indian-litigation-harness-assessment.md). The plan that goes with this report is [2026-11-15-litigation-harness-plan.md](2026-11-15-litigation-harness-plan.md).

Owner's instruction for this version: ignore the earlier documents in `docs/`. Make the product feature rich. Keep advocate onboarding simple. Litigation only. No practice management, billing, marketing, CRM, accounting or firm analytics.

How I applied it: I did not take scope, limits or rulings from `docs/`. I took the **code** as the starting point, because it runs. Section 3 lists what the code has. Where the plan keeps something from the code (Electron, Pi, SQLite, Euro-Office), section 6.1 says why.

---

## 1. Key points

1. **The target.** One desktop application that knows the advocate's courts, the law and procedure of those courts, and everything in each matter. It does litigation work through skills that run on one agent harness. Every output is cited to the record or to the law, checked, and decided by the advocate.
2. **Onboarding is four short steps, all skippable:** who you are, your courts, your kind of work, and optionally a folder of your past work. It takes under three minutes. Everything else (citation format, drafting style, research depth, languages) is learned later: the application asks the first time it matters, or proposes a preference from the advocate's corrections. The advocate approves every proposal.
3. **Local intelligence comes from onboarding.** For each selected court, the application loads a dated, versioned court pack: portals, case types, filing rules, fees, forms, limitation rules, holidays, cause-list source, defect lists, paper-book rules. Each row has its official source and the date it was last checked. A rule with a stale date is shown as stale. It never shows as current.
4. **The matter becomes universal.** Any court, any proceeding, a configurable stage list per proceeding, related matters (FIR to bail to quashing to appeal), and an overview that is always current.
5. **Three graphs, one owner per fact.** The legal knowledge graph, the matter evidence graph and the advocate memory graph are edge tables. They are built from the canonical stores and can be rebuilt. They own nothing.
6. **Context assembly is a real module.** Before each task, it selects the records the task needs, ranks them by a policy for that kind of question, keeps the anchors, fits the token budget, and records what the agent got and what it did not get.
7. **Skills are the unit of work.** The library has about 140 litigation skills in 16 practice packs. A skill is a versioned file with inputs, required context, permitted tools, an output schema, checks and approval points. The advocate combines skills into workflows and can build their own agents from skills.
8. **Verification is a layer under everything.** It runs a mechanical grounding check (every quote and pinpoint must exist in the source), checks that each proposition has support, checks currency and amendments, checks hierarchy and binding effect, and checks the draft's structure. It shows what was read out of what exists. Open problems go to one Review Inbox.
9. **Court operations.** One adapter per court for case status, orders, cause lists, e-filing preparation and defects. The advocate keeps control of credentials, CAPTCHAs and the final submission. Monitoring runs only through access methods the source permits, and it shows how fresh each source is.
10. **Build order: five phases.** Each phase ends with real briefs completed by the owner. Phase 1 gives a working universal harness for the Supreme Court, one High Court and its district courts, with the criminal, civil and writ packs.

---

## 2. Scope

**In scope:** litigation before every Indian court and tribunal. That includes court-side arbitration work, and pre-litigation steps that lead to a proceeding: legal notices, replies, statutory notices, show-cause replies that may go to a writ. It also includes evidence, research, drafting, filing, hearings, orders, appeals and execution.

**Out of scope:**
- Billing, time, invoices, fees, accounting, profitability, utilisation.
- Client relationship management, marketing, business development, client acquisition.
- Contract lifecycle management, transactions, corporate secretarial work, and compliance calendars for clients.
- Advisory practice that does not lead to a proceeding.
- Judge personality profiles and outcome prediction. Bench data is used only for legal-authority research. It is never used to forecast how one judge will decide.

**Kept but limited:** a contact for each party and counsel (the record needs it). Collaboration with juniors, briefing counsel, arguing counsel and the Advocate-on-Record, because litigation is a team activity. There is no client portal, only a way to receive documents from a client.

---

## 3. What the code has today

Fact base: `main` at `7a5350a`, read on 2026-11-15. About 150 bridge functions and 33 agent tools.

| Area | In the code now | Main modules |
|---|---|---|
| Application | Electron, React, Astryx UI, one window with a chat dock and a view | `src/main`, `src/renderer` |
| Agent | Pi embedded in the main process, our tools only, model and effort choice, Stop, usage and budget, local-only models for confidential matters | `src/main/agent.ts`, `agent-work.ts`, `studio-tools.ts` |
| Matter store | One `matter.db` per matter, files by SHA-256, hash-chained events, refused writes, Inspector, export | `src/lib/matter-store` |
| Documents | PDF text, OCR with Tesseract and PP-OCR, critical-token disputes, page and line anchors, classification, duplicates, conversion | `src/lib/document-intelligence`, `converter` |
| Notebook | Events, chronology, date conflicts, corrections, entities, record table (rows and columns with anchored cells) | `src/lib/notebook`, `record_column`, `record_cell` |
| Research | Supreme Court judgment index (`corpus.db`), India Code, web search and fetch, saved judgments and provisions, quick check, support and voice, treatment, bench trends | `src/lib/research`, `research-sources` |
| Argument | Argument loop with a critic, challenge register, rehearsal, memoranda, issues | `src/lib/studio` |
| Drafting | Euro-Office editor, generated parts with event ids, agent changes as tracked changes, revisions, comparison, Word round trip | `src/lib/drafting`, `tracked-changes`, `euro-office` |
| Verification | Validator (`ulos`), citation checks, attestations, adverse authority, draft checks, victim identity | `src/lib/verification`, `ulos` |
| Filing | Supreme Court filing set, limitation, paper book, AI-use disclosure, signed manifest, portal capture, result reconciliation | `src/lib/filing`, `src/main/portal.ts`, `signing.ts` |
| Practice | Hearings, orders and impact checks, docket, reminders, contacts, parties, questions document | `src/lib/matter-store/practice.ts`, `contacts` |
| Intake | Voice (Whisper), mail import, capture from the browser | `src/lib/voice`, `src/main/mail.ts` |
| Memory | Matter memory file, agent proposals that the advocate decides | `memory:*` bridge functions |
| Workflows | Named instructions, with five built-in SLP workflows | `src/lib/workflows` |
| Search | FTS5 Find over the matter | `find:query` |

**What ties the code to the SLP:** the drafting generators (Synopsis, List of Dates, Questions of Law, Grounds), the filing set and its checks, the limitation rule, the five built-in workflows, the portal adapter and the matter fields. Everything else in the table already works for any proceeding.

---

## 4. What the first report missed

The first report kept to the frozen documents. It narrowed the pasted catalogue to a thin slice. It left out or deferred the following, which this report and the plan now cover:

| Area | Left out or deferred |
|---|---|
| Onboarding | The profile outputs (court map, practice map, statutory map, source plan, skill recommendations, library structure); import of existing knowledge with a precedent status |
| Local intelligence | Court, registry, procedural and local-precedent intelligence; monitoring of official sources; the local intelligence dashboard; versioned rules |
| Jurisdiction | Territorial, pecuniary, subject-matter, appellate, revisional and writ jurisdiction; seat and venue; forum clauses; foreign judgments and awards; the jurisdiction report |
| Precedent | Binding effect by hierarchy and territory; bench strength; coordinate and larger benches; per incuriam; prospective overruling; ratio and obiter by passage |
| Temporal law | Commencement, repeal, transitional and savings provisions; the version on the governing date; IPC/BNS, CrPC/BNSS and Evidence Act/BSA |
| Matter | Creation from a case number, a cause-list entry, an order or a whole file; classification; an always-current overview; relationship types; configurable stages |
| Graphs | The three graphs, with their node types and edge types |
| Memory | Types of memory, the full lifecycle, valid and recorded dates, retention, safety rules, retrieval questions |
| Context | Ranking policies, package types, budget, compression that keeps citations, caching, versioning |
| Research | Search modes (Boolean, party, judge, bench, paragraph, proposition, fact pattern); analysis types; deliverables (matrices, adverse authority report, opinions, written submissions) |
| Evidence | Chain of custody, exhibits, witnesses, statements, admissibility status, electronic-evidence metadata, contradictions, gaps |
| Bulk review | Vault-scale ingestion, questions across a collection, issue grouping, anomaly reports |
| Drafting | Cross-reference and numbering validation, merge and split, redaction, templates, comparison of the rendered PDF, immutable approved snapshots |
| Skills | A full library, a workflow builder, an agent builder, skill tests |
| Agent | Planning, decomposition, routing, parallel tasks, checkpoints, retry, recovery |
| Court operations | Case monitoring, legal developments, matter impact analysis, alerts, a filing subsystem with an adapter per court |
| Packs | All 16 practice packs |
| Communication | Email threads as evidence and instructions, WhatsApp, SMS, audio and video, a communication chronology |
| Automation | Event triggers and the Matter Change Report |
| Knowledge | Precedent statuses, pleading library, a library of approved and rejected positions, playbooks |
| Analytics | Matter analytics, legal analytics and quality analytics (practice analytics stays out) |
| Collaboration | Chamber work: juniors, briefing counsel, review queues, access scopes |
| Integrations | Calendar, storage, research services, a manifest-based integration system |
| Languages | Hindi and regional-language OCR, translation, bilingual drafting |

---

## 5. What the benchmarks teach

Condensed from the first report. The sources are listed there.

| Source | Lesson taken |
|---|---|
| Harvey | One document store (Vault) and one memory join every product. Review tables over thousands of documents. A separate Facts & Chronologies product. Spaces for shared work. A connector library over MCP. |
| Legora | The skill is the unit the lawyer sees and trusts. The agent picks a skill from a plain request; `/` calls a skill and `@` adds context. Workflows have approval gates. Monitors watch sources. Tabular review. A "Hearing Bundle Audit" skill. |
| claude-for-legal | A practice profile read by every skill. A provenance tag on every citation. One reviewer note above each deliverable with a "Read N of M" coverage line. Open markers block finality. Verbatim quotes. Pinpoints must support the whole proposition. A currency check. Detection of the wrong jurisdiction. A severity floor across skills. The docket watcher's "what it does not do" list. A thirteen-parameter skill review. |
| lavern | A grounding check with no model call. An evaluator gate with at most two rewrites, then escalation. A panel of different models for hard questions, which shows the split. A memory lifecycle (tentative, confirmed, deprecated). A report card per run, with baselines. A public trail of evaluation reports. |
| Indian market | Products are database-first (SCC Online, Manupatra, CaseMine, Jhana). The sources describe none of them as a harness that drafts, checks and files across forums. eCourts has no public general API. High Court portals differ. District records are thin in databases. Vernacular reading at scale is missing. |

**Harvey to Open Advocate:**

| Harvey | Open Advocate |
|---|---|
| Agents | Litigation agent: one harness, skills, roles |
| Vault | Matter Evidence Vault (built on the matter store and the record table) |
| Knowledge | Legal Knowledge Library (corpus, statutes, your precedents) |
| Spaces | Matter workspace, with chamber sharing in phase 4 |
| Workflows | Workflow builder over skills |
| Memory | Advocate memory and matter memory (typed) |
| Ecosystem and connectors | Court adapters and integrations with manifests |
| Command Center | Practice Intelligence Dashboard (matters and law only; no business figures) |
| Horizon Scanning | Legal developments and matter impact analysis |
| Facts & Chronologies | The Notebook, already built |

---

## 6. Architecture

### 6.1 Base

The plan keeps the code's base: Electron with TypeScript, React with Astryx, Pi in the main process, `node:sqlite`, Euro-Office, Tesseract and PP-OCR through ONNX Runtime, and Whisper. Reasons:

- It runs and holds about 150 tested functions.
- A rewrite would delay every feature.
- Nothing in the catalogue needs another runtime.

ONNX Runtime is already present for PP-OCR, so a local embedding model can use it without a new native dependency.

### 6.2 Layers

```
User interface        Home · Matters · Research · Knowledge · Court Intelligence · Review Inbox
                      Calendar · Workflows & Skills · Memory · Settings · matter tabs · chat everywhere
Agent harness         Pi sessions · planner · skill runner · tool scopes · approvals · checkpoints
Intelligence services Jurisdiction · Local intelligence · Context assembly · Memory · Research
                      Document · Evidence · Drafting · Verification · Filing · Monitoring · Automation
Canonical stores      matter.db (per matter) · blobs · corpus.db · intel.db · advocate.db · skills/
Derived indexes       FTS5 · vectors · graph edges · analytics views   (rebuildable, own nothing)
```

### 6.3 One owner for each kind of information

| Information | Owner | Where |
|---|---|---|
| Advocate profile, court and practice selections, preferences, advocate memory | Advocate store | `advocate.db` in user data |
| Courts, benches, case types, rules, fees, forms, limitation rules, holidays, sources and their freshness | Local intelligence store | `intel.db` in user data, versioned rows |
| Judgments, statutes and their versions, treatments, propositions from public law | Legal corpus | `corpus.db` (extends the current one) |
| Matter identity, stage, parties, facts, events, issues, arguments, decisions, approvals, matter memory, hearings, filings | Matter store | `matter.db` per matter (current) |
| Original files | Content-addressed store | `blobs/<sha256>` (current) |
| Draft revisions | Matter store and blobs | current |
| Skills, workflows, custom agents | Skills registry | `skills/` in the repository (built-in) and in user data (the advocate's own), with an index |
| Execution state | Agent runtime | Pi session files per matter (current) |
| Permissions and policy | Policy module in the main process | code plus `advocate.db` settings |
| Audit | Hash chain inside each store | current pattern, extended to `advocate.db` and `intel.db` |
| Search, vectors, graph, analytics | Derived indexes | one rebuild command each |

Rule: a module writes only to its own store. Another module asks it through a function. The agent writes nothing directly. It proposes, and the advocate decides through a bridge function.

### 6.4 The three graphs

All three are SQLite edge tables: `(from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at)`. A recursive query walks them. The rebuild reads the canonical stores. No graph database is needed at this scale. A spike measures the corpus graph first.

| Graph | Nodes | Edges (examples) |
|---|---|---|
| Legal knowledge | court, bench, act, section, rule, notification, amendment, judgment, paragraph, proposition, test, remedy | cites, follows, distinguishes, overrules, refers to a larger bench, interprets, amended by, in force from, applies in, binds in |
| Matter evidence | party, event, document, page, line, exhibit, witness, statement, fact, allegation, issue, argument, relief, draft paragraph | supports, contradicts, admits, denies, depends on, relies on, attacks, derived from, proves element |
| Advocate memory | advocate, court, practice area, preference, skill, precedent, workflow, decision, lesson | prefers, rejected, approved, supersedes, used in, succeeded when, failed because |

Cross-graph links use stable ids only. A matter never links to another client's matter by similarity.

### 6.5 Context assembly

Each skill and each chat turn gets a context package. The pipeline:

1. **Classify the task:** skill, practice pack, court, proceeding, deliverable.
2. **Retrieve** from the sources the skill declares: matter records, anchored passages, issues, statutes in force on the governing date, judgments, court rules, procedural history, decisions, drafts, approved precedents, client instructions, preferences, earlier task results, recent developments.
3. **Rank by policy, by question type.** To decide what the law is: binding authority first, by hierarchy and date. To decide what happened: primary documents first, then admissions, then party statements. To decide what the client wants: dated instructions. Each item carries relevance, authority, temporal validity, jurisdiction, verification status, confidentiality, recency, provenance and conflict status.
4. **Filter and fit:** remove duplicates, select chunks, compress with the anchors kept, keep both sides of a conflict, and keep within the token budget.
5. **Record:** the package id, the skill version, the ids included, the ids excluded with the reason, and the token count. This goes into `matter.db`.

A summary never replaces a source. It carries the anchors it summarises.

### 6.6 Memory

Memory records are typed, in `matter.db` (matter scope) and `advocate.db` (advocate scope):

`memory_id, type, subject, relation, object, source_id, matter_id, recorded_at, valid_from, valid_until, confidence, status, scope, supersedes`

- **Types:** fact from a document, fact supplied by a party, admission, disputed fact, missing fact, client instruction, advocate decision, accepted argument, rejected argument, procedural event, preference, approved precedent, lesson, court practice.
- **Lifecycle:** proposed → tentative → confirmed → superseded, expired or deprecated → archived → deleted under the retention setting. Only the advocate confirms.
- **Safety rules:**
  - A model inference never becomes a confirmed fact.
  - A draft never becomes a precedent without approval.
  - There is no cross-matter retrieval of facts.
  - Conflicts stay visible.
  - Corrections keep their history.
  - The scope is checked before context assembly, not after.

### 6.7 The harness

- **Sessions.** One Pi session per matter for chat. One session per skill run, with that skill's tool scope. Several runs can go in parallel inside the main process.
- **Roles.** Intake, jurisdiction, research, evidence, chronology, drafting, review, strategy, filing, hearing, monitoring and memory. Each role is a set of skills and a tool scope, not a separate authority. A reviewer role never approves its own run. A critic can use a different model family.
- **Controls.** The planner breaks a request into skill runs and shows the plan before it starts long work. The harness also provides checkpoints (Pi session files), retry with limits, timeouts, Stop, budget, an evaluator gate (at most two rewrites), and approvals as AG-UI interrupts that a bridge function answers.
- **Policy.** Each skill names its permitted tools. The policy module enforces the list. Human-only actions stay outside the agent. Confidential matters use local models only.

### 6.8 Local intelligence

- **Per court:** a pack in `intel.db`. Every row has `source_url, owner, retrieved_at, checked_by, valid_from, valid_until, access_method, reliability`.
- **Access methods:** an official feed or download; the advocate's own session in the visible browser; or a manual upload. Never CAPTCHA solving. Never bulk harvesting against a site's terms.
- **Freshness rule:** a row past its check interval shows as "stale since <date>". A check that depends on a stale row shows "unconfirmed". It never shows "passed".
- **First release:** the directory of all courts and tribunals (names, seats, benches, portals) ships with the application, so onboarding works offline. The detailed rule packs ship for the Phase 1 courts and grow by phase.

### 6.9 Court adapters

An adapter is a module per court or portal. It declares what it can do: case status, orders and judgments, cause list, e-filing preparation, defect list, certified copies. It also declares how it gets the data. Each capability returns data with its source and its time. Adapters never submit a filing. Submission stays the two-confirmation flow the code has now.

### 6.10 Languages

English first. Hindi OCR and display come in Phase 2 (Tesseract has Hindi data). Other regional languages come in Phase 4, through OCR data for each language and translation of each line. A translation is a reading of a line, kept beside the original. It is never the source.

---

## 7. Simplified onboarding

Four steps. Every step can be skipped. Nothing asks for Bar Council credentials.

| Step | Asks | Takes |
|---|---|---|
| 1. You | Name. Role (Advocate, Advocate-on-Record, Senior Advocate, junior in a chamber). State Bar Council and enrolment number (optional; stored encrypted). | 20 s |
| 2. Your courts | Search the directory and select courts, with a bench or district under each. Mark one as primary. | 40 s |
| 3. Your work | Practice-area chips (multiple), with one primary. Trial, appellate or both. Civil, criminal or both. | 30 s |
| 4. Your past work (optional) | Drop a folder of judgments, pleadings, templates and notes. It is imported into the Knowledge Library as "unreviewed". | 30 s |

**Result: one Practice Profile page.** The advocate can edit every part of it:

- **Court map:** the selected courts, their packs, and the freshness of each pack.
- **Practice map:** the enabled practice packs and their proceedings.
- **Sources plan:** the official sources the application will read, and how it gets each one.
- **Statutory map:** the main acts of the enabled packs, with their versions.
- **Skills:** the recommended skills and workflows for the packs.
- **Library:** suggested folders for the imported work.

**Learned later.** Citation format, drafting style, paragraph length, research depth, output format, languages, and whether the advocate briefs other counsel. These are asked once, inside the first task where they matter. Or they are proposed as a preference after the advocate makes the same correction twice. Every applied preference shows "applied because …".

---

## 8. Interface

**Global navigation:** Home (dashboard) · Matters · Research · Knowledge · Court Intelligence · Review Inbox · Calendar · Workflows & Skills · Memory · Settings. The Practice Profile sits under Settings. The chat dock is present on every view and knows the view it is on.

**Inside a matter:** Overview · Parties · Facts & Chronology · Documents & Evidence · Issues · Jurisdiction · Research & Authorities · Arguments & Strategy · Drafts · Proceedings & Hearings · Filing · Tasks & Deadlines · Communications · Memory · Audit. The current Notebook, Sources, Studio, Drafts and Practice views map onto these tabs.

**Gestures in the chat:** `/` calls a skill. `@` adds a record, document, authority or matter. Every answer ends with a reviewer note and a set of options.

---

## 9. Hard rules

These are product rules, written into the code and the skills:

1. The agent recommends. The advocate decides facts, legal propositions, filings, messages, matter stage and every change to a draft.
2. Every legal proposition links to a passage that supports it. A citation that exists is not enough.
3. Every quote is verbatim, and every pinpoint exists. A mechanical check enforces both.
4. No rule, statute or court practice is shown as current without its date of check.
5. "Undetermined" is a valid answer for jurisdiction, limitation and appealability.
6. Retrieved content is data. An embedded instruction in a document or page raises a review item.
7. The application never solves a CAPTCHA, never holds court credentials, and never submits a filing on its own.
8. There is no judge personality profile and no outcome prediction.
9. A confidential matter uses only local models and makes no web query.
10. An output from a partial read says what was read: N of M pages, N of M documents.

---

## 10. Risks

| Risk | Treatment |
|---|---|
| Rule packs go stale, and stale rules are dangerous | The freshness rule (6.8). A pack check is a scheduled task with a visible result. The Court Intelligence dashboard lists sources that failed to update. |
| The feature list outgrows the code | Every phase ends with the owner's real briefs. Each feature has an output and a check in the plan. |
| Court sites change or block access | An adapter declares its access method. A failure is visible. Manual upload always works. |
| Quality is claimed but not measured | A gold set of the owner's closed briefs. A report card per skill run. An evaluation report per skill version. |
| Corpus size (all High Courts) | Index what the advocate's courts need first. Use the advocate's own research subscriptions through their session. |
| Model cost | A budget per matter (in the code now). Local models for bulk extraction. Frontier models for drafting and review. |

---

## 11. What I need from the owner

Nothing blocks writing the Phase 1 specification. The plan uses these defaults until the owner changes them:

- **Phase 1 courts:** the Supreme Court of India, the Delhi High Court and the Delhi district courts. The pasted catalogue uses Delhi in its examples.
- **Phase 1 packs:** criminal, civil, and constitutional/writ.
- **`docs/`:** the plan does not edit it. If the owner accepts this plan, `docs/` needs a rewrite to match. I can do that next.
