# Features

Accepted by the owner on 2026-11-15. This file owns the feature catalogue: every feature, its id, its phase, its starting point, its output and what it depends on. The phases are in [build-plan.md](build-plan.md). The skills are in [skills.md](skills.md).

Scope: litigation only ([product.md](product.md) section 2).

## How to read the catalogue

| Column | Meaning |
|---|---|
| ID | Stable feature id. The specs and the commits use it. |
| Ph | The phase the feature is first delivered in (1 to 6, [build-plan.md](build-plan.md)). |
| Base | **B** built now; **X** extend what is built; **N** new. |
| Output | What the advocate or another module gets. |
| Needs | The ids it depends on. |

Every feature also obeys the hard rules in [product.md](product.md) section 3. They are not repeated row by row.

---

## A. Onboarding and advocate profile

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| A1 | Four-step onboarding: you, courts, work, past work; every step skippable | 1 | N | Advocate profile in `advocate.db` | B1 |
| A2 | Professional identity: name, role (Advocate, Advocate-on-Record, Senior Advocate, junior), State Bar Council, enrolment number and year (optional, encrypted), chamber address | 1 | N | Identity record; signature block data for drafts | A1 |
| A3 | Court selection | 1 | N | Court map | B1 |
| A5 | Practice areas (multiple, with one primary); trial, appellate or both; civil, criminal or both | 1 | N | Practice map; enabled packs | Q1 |
| A6 | Territory: states, districts, the High Court territory, other states, foreign parties, international arbitration, cross-border enforcement | 2 | N | Territorial map; source priority | A3 |
| A7 | Import of past work: judgments, pleadings, templates, written submissions, memos, notes, checklists, statutory material; each tagged with a precedent status (default "unreviewed") | 1 | N | Knowledge Library entries | M1 |
| A8 | Practice Profile page, built automatically from the onboarding answers, imported work and imported matters: court map, practice map, territorial map, statutory map, sources plan, local intelligence plan, recommended skills and workflows, library structure; the advocate corrects any field, never fills it in | 1 | N | One page | A1–A3, A5–A7, A12, B1, Q1 |
| A9 | Preferences learned later: citation format, drafting style, pleading structure, paragraph length, research depth, output format, languages; asked inside the first task where each matters, or proposed after repeated corrections | 2 | X | Advocate memory records | F2 |
| A10 | "Applied because" note on every preference the agent uses | 2 | N | Line in the reviewer note | A9, F2 |
| A11 | Team list for a chamber: juniors, clerks, briefing counsel, arguing counsel (names and roles only) | 5 | N | Team records | W2 |
| A12 | Import existing matters (optional, at onboarding or later): the advocate signs in to eCourts (ecourts.gov.in) or a High Court or Supreme Court portal in the app's browser; the agent reads the advocate's case list there and proposes one matter per case, with CNR, court, parties, stage and next date; the advocate chooses which to create | 1 | N | Proposed matters | S12, C10, B2 |

## B. Local legal intelligence and filing readiness

Filing readiness is part of local intelligence: the court's registry rules (B5) drive the checklist, the filing-ready set and its checks. Rows B14 to B20 were T1 to T3 and T5 to T8. Open Advocate produces documents ready to file; the advocate files them. Filing on a portal by the agent is the last phase (section T).

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| B1 | Court and tribunal directory: Supreme Court; all High Courts with seats and benches; district, sessions, civil, magistrate, family, special and commercial courts by state; NCLT, NCLAT, DRT, DRAT, CAT, SAT, AFT, NGT, ITAT, CESTAT, consumer commissions, RERA authorities and tribunals, other statutory forums; each with its own appeal route | 1 | N | `intel.db` directory, shipped offline | — |
| B2 | Source registry: official URL, owner, retrieval date, update interval, access method, reliability, last result | 1 | X | Source rows; freshness state | B1 |
| B3 | Court pack, general: website, case search, status system, cause list source, orders and judgments source, calendar, holidays, registry contacts, e-filing portal | 1 | N | Pack rows with sources | B1, B2 |
| B4 | Court pack, rules: procedure rules, practice directions, local amendments, circulars and notifications, case-type names, prescribed forms, court-fee rules | 1 | N | Versioned rule rows | B3 |
| B5 | Registry pack: filing checklists per case type, document order, index, pagination, annexures, affidavits, vakalatnama, court fee, PDF rules (size, OCR, bookmarks, naming), defect list and defect classes, re-filing rules, listing and mentioning, urgent listing, certified copies, inspection, paper-book rules, formatting rules | 1 | X | Checklist rows; feeds T-section filing | B4 |
| B6 | Procedural pack: governing procedural law by date, limitation periods, exclusions and extensions, condonation requirements, appeal, revision, review and curative routes, interim applications, service and notice, evidence rules, post-order compliance, execution | 1 | X | Rule rows; feeds limitation and route checks | B4, D3 |
| B7 | Bench data: current and past bench composition, rosters, sittings, bench strength (for authority research only) | 2 | N | Bench rows | B3 |
| B9 | Versioning: every row has `valid_from`, `valid_until`, `retrieved_at`, `checked_by`; old versions stay readable | 1 | N | Version history | B2 |
| B10 | Freshness rule: a row past its interval is "stale since <date>"; a check that depends on it says "unconfirmed" | 1 | N | Freshness badges; gate states | B9 |
| B11 | Pack check task: re-read each source by its access method; show changes as a diff for the advocate to accept | 3 | N | Change list in the Review Inbox | B2, R1 |
| B12 | Court Intelligence dashboard: selected courts, current rules and circulars, recent judgments, today's cause lists, amendments, filing-rule changes, holidays, procedural updates, new favourable and adverse authorities, failed sources, rows waiting for verification | 2 | N | One view | B2–B7, B9, B10 |
| B13 | Pack editor: the advocate adds or corrects a rule with its source; marked "advocate-entered" | 1 | N | Rule rows | B4 |
| B14 | Filing checklist per court and case type, from the registry pack (was T1) | 1 | X | Checklist with states | B5 |
| B15 | Filing-ready set: required documents, document order, index, pagination, annexures, affidavits, vakalatnama, court fee, limitation (was T2) | 1 | X | Filing set, ready for the advocate to file | B14 |
| B16 | Format, PDF, searchability, file-size and naming checks per court (was T3) | 1 | X | Check items | B5 |
| B17 | Defect list import, defect reply drafting, re-filing checklist (was T5) | 2 | N | Corrected set; reply | B14 |
| B18 | Paper book and index per court rules; hearing bundle audit (was T7) | 1 | X | Paper book PDF | B5 |
| B19 | Filing history per matter: what the advocate filed, when, and the result; uncertain results reconciled (was T6) | 1 | B/X | — | — |
| B20 | Signed manifest of every filing set (was T8) | 1 | B | — | — |

## C. Universal litigation matter

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| C1 | Matter fields: court, bench or establishment, proceeding type, side, case number, CNR, filing date, institution date, governing date, stage, relief sought, confidentiality | 1 | X | `matter_details` migration | B1, Q1 |
| C2 | Create a matter manually, by voice, from a document or file, from an order, from a cause-list entry, from a case number (through the adapter), or from an email | 1 | X | New matter with proposed fields | C1, L1 |
| C3 | Classification proposal: practice area, case type, court, parties, stage, statutes; the advocate confirms or corrects | 1 | N | Confirmed classification | C1, H1 |
| C4 | Configurable stage lists per proceeding (a bail application, a suit, a writ, an appeal, an execution and an arbitration petition each have their own) | 1 | N | Stage machine per proceeding | Q1 |
| C5 | Overview, always current: summary, parties and positions, procedural history, stage, issues, key facts, key documents and evidence, authorities, pending applications, next date, deadlines, outstanding instructions, open questions, current strategy, latest developments | 1 | X | Overview tab | C1, H, F |
| C6 | Related matters: appeal from, revision of, review of, cross-petition, counterclaim, transfer petition, connected case, the FIR behind a bail or quashing matter, connected arbitration, common parties, common evidence | 1 | N | Relation edges; navigation | C1 |
| C7 | Detect possible related matters (same CNR, FIR number, parties or impugned order) and propose links | 2 | N | Link proposals | C6, H6 |
| C8 | Parties: role in this proceeding, name as in the record, link to a contact, counsel for each party | 1 | B | — | — |
| C9 | Archive, restore and export a matter | 1 | B | — | — |
| C10 | Add an existing matter: point to a folder of its papers, give its CNR number (status and orders through the adapter or the browser), forward or choose an email, or describe it in the chat; the agent proposes the matter fields, parties, stage, next date and sources; the advocate confirms | 1 | X | Matter with proposed fields | C2, H1, S2, V1 |
| C11 | Extend a matter: add a later stage or a related proceeding (appeal, revision, review, execution, connected case) to an existing matter, add papers in bulk from a folder or an email, and refresh its status from the portal | 1 | X | Extended matter; relation edges | C6, C10 |

## D. Jurisdiction and temporal law

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| D1 | Jurisdiction facts: territorial, pecuniary, subject-matter, original, appellate, revisional, writ, supervisory, criminal and civil, and tribunal jurisdiction, as pack rows with sources | 2 | N | Facts for D2 | B6 |
| D2 | Jurisdiction report per matter: proposed forum and type, territorial basis, subject basis, governing provisions, alternative forums, limitation, appeal route, applicable rules, unresolved facts; "undetermined" allowed | 2 | N | Report in the Jurisdiction tab | D1, H, C1 |
| D3 | Governing-date selection of the law: commencement, repeal, amendment, transitional and savings rows; the version in force on the date (IPC/BNS, CrPC/BNSS, Evidence Act/BSA, and others) | 2 | X | Statute version per matter | E3 |
| D4 | Forum clauses, arbitration seat and venue, exclusive and non-exclusive jurisdiction, extracted from the record | 2 | N | Facts with anchors | H3 |
| D5 | Foreign elements: foreign parties, enforcement of foreign judgments and awards, as route facts | 4 | N | Route rows | D1 |
| D6 | Wrong-jurisdiction guard: a skill run with no pack for the matter's forum says so and stops | 1 | N | Refusal with reason | Q2 |

## E. Legal corpus and authority intelligence

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| E1 | Judgment records with identity: court, bench, bench strength, date, parties, citations (neutral, SCC, AIR, SCR), case numbers, judges, paragraphs | 1 | X | `corpus.db` rows | — |
| E2 | Corpus beyond the Supreme Court: the High Courts of the advocate's courts, then tribunals; from official sites, the advocate's uploads and the advocate's own research sessions | 2 | X | Index growth | B2, E1 |
| E3 | Statutes with versions: act, section, rule, regulation, notification, amendment, each with its in-force dates, from India Code and the e-Gazette | 2 | X | Versioned provision rows | B2 |
| E4 | Passage roles: ratio, obiter, counsel's submission, lower-court view, dissent, concurrence; candidates until the advocate confirms | 1 | B | — | — |
| E5 | Treatment edges from the judgments' own text: followed, distinguished, overruled, doubted, referred to a larger bench, affirmed, reversed, modified, per incuriam | 2 | X | Graph edges with anchors | E1, G1 |
| E6 | Binding-effect check: the hierarchy, the territory, bench strength, coordinate benches, larger benches, prospective overruling; the result is a fact with its reasoning, for the advocate | 2 | N | Binding or persuasive label per authority per matter | E1, E5, B1 |
| E7 | Conflicts: decisions in conflict across benches or High Courts, references pending before larger benches | 2 | N | Conflict review items | E5 |
| E8 | Proposition records: a legal proposition, its supporting passages, its adverse passages, verified on a date | 2 | N | Proposition table | E1, F |
| E9 | Primary or secondary label on every source: primary law, official notification, commentary, unverified secondary | 1 | N | Label in results | E1 |
| E10 | Connector to the advocate's research services through their own session (SCC Online, Manupatra, Indian Kanoon API with the advocate's key) | 3 | N | Fetched judgments with provenance | E1, L1 |

## F. Memory

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| F1 | Typed memory records ([architecture.md](architecture.md) section 6) in `matter.db` and `advocate.db` | 1 | X | Memory table | — |
| F2 | Advocate memory: preferences, frequent statutes and authorities, approved templates, rejected approaches, corrections, repeated instructions | 2 | X | Records with "applied because" | F1 |
| F3 | Matter memory: facts by source kind, admissions, disputes, missing facts, accepted and rejected arguments, decisions, orders, open questions, changes in case theory | 1 | X | Records linked to the evidence graph | F1, G2 |
| F4 | Legal memory: propositions, interpretations, tests, burdens, procedural principles, remedies, limitation and jurisdiction principles, each with sources | 2 | N | Records linked to the legal graph | E8 |
| F5 | Lifecycle: propose, confirm, supersede, expire, archive, delete under retention; history kept | 1 | X | State changes as events | F1 |
| F6 | Memory view: search, filter by type and status, see sources, correct, supersede | 1 | X | Memory tab and global Memory | F1 |
| F7 | Retrieval answers: what was decided, why an argument was rejected, which facts are disputed, which instructions were given, what changed since the last hearing, which assumptions expired | 2 | N | Chat answers with record links | F3, I1 |
| F8 | Memory proposals after a run, decided in the Review Inbox | 1 | B | — | — |

## G. Graphs and derived indexes

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| G1 | Legal knowledge graph edges ([architecture.md](architecture.md) section 4) | 2 | N | Edge table in `corpus.db` | E1, E3, E5 |
| G2 | Matter evidence graph edges | 1 | X | Edge table in `matter.db` (from anchors, links, record cells) | H |
| G3 | Advocate memory graph edges | 2 | N | Edge table in `advocate.db` | F2 |
| G4 | Graph questions: judgments that interpret a provision; judgments that distinguish an authority; amendments that affect a proposition; conflicting High Court decisions; grounds that depend on a fact; facts with no support | 2 | N | Query tools for the agent and the views | G1–G3 |
| G5 | Full-text index (FTS5) over the matter and the corpus | 1 | B/X | — | — |
| G6 | Vector index with a local embedding model through ONNX Runtime; one spike settles sqlite-vec against a TypeScript index | 2 | N | Semantic search | G5 |
| G7 | Hybrid retrieval: full text, metadata filter, graph walk and vectors, combined and reranked | 2 | N | One retrieval function | G4–G6 |
| G8 | Rebuild commands and an index health view | 1 | N | Rebuild; counts; last build time | G2, G5 |

## H. Documents and evidence

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| H1 | Intake of PDF, DOCX, DOC, ODT, XLSX, CSV, PPTX, images, scans, photos, EML, MSG, HTML, ZIP bundles, court downloads | 1 | X | Sources with origins | — |
| H2 | Audio and video intake with transcription (Whisper), speaker turns, time anchors | 3 | X | Transcript sources | — |
| H3 | Understanding: OCR with Tesseract, and docTR as the second engine (replaces PP-OCR in the code); layout, tables, headers and footers, footnotes, page and paragraph anchors, classification, entities, dates, amounts, citations | 1 | B/X | — | — |
| H4 | Signature, stamp and seal detection; handwriting flagged for the advocate | 3 | N | Marks on pages | H3 |
| H5 | Document quality score (blur, skew, missing pages) | 2 | N | Quality warning | H3 |
| H6 | Duplicate, version and relationship detection (annexure of, reply to, certified copy of) | 1 | X | Links | H3 |
| H7 | Legal structure: pleading parts, prayers, allegations, admissions and denials, witnesses, exhibits, annexure map, court-order directions | 2 | N | Structured records with anchors | H3 |
| H8 | Evidence repository: exhibit numbers, witnesses, statements, chain of custody (who gave it, when, hash), electronic-evidence metadata, authenticity status, admissibility notes (advocate-entered) | 2 | N | Evidence tab | H1, C1 |
| H9 | Fact management: extract, confirm, dispute, classify, source, supersede; fact to issue, argument and relief maps | 1 | X | Fact records | H3, F3 |
| H10 | Contradiction detection across documents and statements (dates, amounts, names, events) | 2 | X | Contradiction review items | H9 |
| H11 | Gaps: missing evidence for each element of each issue | 2 | N | Gap report | H9, K3 |
| H12 | Timelines: chronology, procedural timeline, payment, communication and limitation timelines, conflicting dates, before and after comparison | 1 | X | Timeline views | H9 |
| H13 | Matter Evidence Vault: bulk ingestion into the thousands; questions across the collection; review tables; grouping by issue; anomaly report | 2 | X | Vault view over the record table | H1, G7 |
| H14 | Record table templates per proceeding (for example charge-sheet witnesses, FIR ingredients, plaint and written-statement admissions) | 1 | N | Column sets | H13, Q1 |
| H15 | Document operations: annotate, highlight, split, merge, reorder, convert, extract pages, redact (with a redaction log), export | 2 | X | New revisions or exports | H1 |
| H16 | Translation of a line or a document, kept beside the original, never as the source | 4 | N | Reading layer | H3, U1 |
| H17 | OCR comparison between the engines (critical-token disputes, built today with PP-OCR), a second engine for regional languages, and OCR quality checks | 4 | X | Dispute review items | H3, U2 |

## I. Context assembly

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| I1 | Context package builder ([architecture.md](architecture.md) section 5): classify the task, retrieve, rank, filter, fit, record | 1 | N | Package record per run | Q2, G5 |
| I2 | Ranking policies by question type: what the law is, what happened, what was agreed, what the client wants, what the court directed | 1 | N | Policy table | I1 |
| I3 | Package types: matter, research, drafting, strategy, evidence review, hearing, filing, monitoring | 1 | N | Schemas | I1 |
| I4 | Budget control: chunk choice, deduplication, compression that keeps anchors and both sides of a conflict | 1 | N | Packages within the budget | I1 |
| I5 | Freshness and conflict flags inside the package (stale rule, superseded memory, disputed fact) | 1 | N | Flags passed to the skill | I1, B10, F5 |
| I6 | Package view: what the agent received, what it did not receive, and why | 1 | N | Inspector panel | I1 |
| I7 | Cache and incremental update of packages for long tasks | 3 | N | Faster reruns | I1 |
| I8 | Scope check before retrieval (matter, confidentiality, chamber scope) | 1 | N | Refusals recorded | S1 |

## J. Research

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| J1 | Search modes: natural language, exact phrase, Boolean, citation, party, judge, court and bench, statute and section, paragraph, proposition, fact pattern, connected case, historical law, cross-jurisdiction | 2 | X | Research view and agent tools | G7, E |
| J2 | Research plan: decompose the question, list the sources, show the plan before a long run | 1 | N | Plan with steps | Q4 |
| J3 | Analysis: ratio, obiter, tests, relevant paragraphs, factual similarities and distinctions, supporting and adverse authority, contrary readings, bench strength, later treatment, statutory versions, binding effect | 2 | X | Authority records | E4–E8 |
| J4 | Negative search: find the adverse authority on purpose, for every issue | 1 | X | Adverse authority list | J1 |
| J5 | Completeness: issues with no authority, authorities not checked, sources not reached | 2 | N | Completeness line | J1 |
| J6 | Deliverables: case-law matrix, statutory matrix, issue-wise authority matrix, proposition table, adverse authority report, research memorandum, opinion on a litigation question, written submissions, strategy report, historical law report, comparative report | 2 | X | Drafts with citations | K, J3 |
| J7 | Research history per matter and across matters (law only, never facts) | 2 | X | History view | F4 |

## K. Argument, strategy and hearings

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| K1 | Issues: proposed, accepted, rejected; each tied to facts and to the relief sought | 1 | B/X | — | H9 |
| K2 | Argument loop with critic and opposing counsel; the critic on a second model family | 1 | B/X | — | Q5 |
| K3 | Element charts: the ingredients of an offence, the elements of a cause of action, the conditions for interim relief; each cell anchored; gaps shown | 1 | N | Chart in the record table | H9, Q1 |
| K4 | Case theory: alternative theories, argument dependencies, argument status, burden and standard of proof, weaknesses | 2 | X | Strategy tab | K1–K3 |
| K5 | Dissent panel for hard questions: different models answer; a split is shown, not hidden | 3 | N | Split review item | Q5 |
| K6 | Hearing brief: posture, the last order's directions, what is listed, open items, one page | 1 | N | Brief | C5 |
| K7 | Bench questions and answers, objections, challenge register (no outcome prediction) | 1 | B | — | — |
| K8 | Oral outline (three or four points, strongest first), rebuttal notes, compilation of authorities with marked paragraphs | 2 | N | Drafts | K1, J3 |
| K9 | Post-hearing record: directions, next date, compliance tasks; a new order triggers an impact check | 1 | B/X | — | — |
| K10 | Cross-examination plan as questions, from contradictions and statements | 2 | N | Question list with anchors | H10 |

## L. Drafting and editor

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| L1 | Template per proceeding and court: parts, order, headings, cause title, verification, affidavit, signature block | 1 | X | DOCX templates | B5, Q1 |
| L2 | Generate parts from records with ids kept: facts, list of dates, synopsis, grounds, questions, prayers, interim prayers | 1 | X | Draft paragraphs | L1, H9 |
| L3 | Documents: plaint, written statement, replication, application (interim, condonation, exemption, early hearing, stay), petition, appeal memo, revision, writ, counter, rejoinder, affidavit, written submissions, legal notice and reply, list of dates, chronology, briefing note, case summary, research memo, index and paper book | 1–3 | X | Drafts | L1, L2 |
| L4 | Agent edits as tracked changes; keep or undo by the advocate; revisions; approved revisions are immutable | 1 | B | — | — |
| L5 | Validation: numbering, cross-references, annexure references, defined terms, dates, citation format, footnotes, tables | 2 | N | Draft check items | L2 |
| L6 | Citation insertion from saved authorities in the advocate's format | 2 | N | Citations in the draft | A9, E1 |
| L7 | Compare any two revisions; compare a revision with the rendered PDF | 1 | B/X | — | — |
| L8 | Merge documents, reorder, split; annexure manager with marks (Annexure P-1 and so on, per court) | 2 | X | Revisions | B5 |
| L9 | Bilingual drafting (English with Hindi parts) | 4 | N | Drafts | U1 |
| L10 | Witness and deponent rule: the agent prepares questions and organises the deponent's own words; it does not compose the evidence | 1 | N | Skill rule | Q2 |

## M. Knowledge Library

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| M1 | Library: judgments, statutes, the advocate's pleadings, templates, written submissions, memos, notes, checklists, propositions, court rules | 1 | N | Library view in `advocate.db` with files in blobs | A7 |
| M2 | Precedent status: drafted, reviewed, approved, filed, superseded, rejected, withdrawn; with author, date, matter, court, scope | 1 | N | Status and history | M1 |
| M3 | Approved and rejected positions, playbooks, court-specific drafting styles, common errors | 2 | N | Library entries used by skills | M1 |
| M4 | Use in drafting: an approved precedent is offered first and shown with its scope | 2 | N | Suggestion in the context package | M2, I1 |
| M5 | Search across the library with access rules | 1 | N | Search | G5 |
| M6 | Outcome records of past matters (what the court did, entered by the advocate) | 3 | N | Records | C1 |

## N. Skills, workflows and agents

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| N1 | Skills registry: built-in skills from the repository; the advocate's own skills from user data; index; versions | 1 | N | Registry | — |
| N2 | Skill format: id, version, title, description with triggers, packs, courts, proceedings, inputs, required context, permitted tools, output schema, checks, approval points, tests, author | 1 | N | Schema and validator | N1 |
| N3 | Skill runner: builds the context package, starts a scoped Pi session, validates the output, runs the checks, writes the report card | 1 | N | Run records | N1, I1, Q2, R |
| N4 | `/` to call a skill, `@` to add context, and skill choice from a plain request | 1 | N | Chat gestures | N1 |
| N5 | Skill library ([skills.md](skills.md)): about 140 skills | 1–5 | X | Skills | N2 |
| N6 | Workflow builder: chain skills, with approval gates, conditions and inputs; visual editor | 3 | X | Workflows | N3 |
| N7 | Agent builder: a named agent from a task, instructions, skills, a template, sources, required context, tools, output, checks and approvals; versioned and testable | 4 | N | Custom agents | N6 |
| N8 | Skill review before ship: thirteen parameters, three legal failure modes; score kept with the version | 1 | N | Review record | N2 |
| N9 | Skill tests: fixture briefs and expected properties; run on every change | 1 | N | Test results | N2 |
| N10 | Import of a skill from a file: show the raw text, scan for embedded instructions, ask before install | 4 | N | Installed skill | N1 |

## O. Harness and agent controls

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| O1 | Planner: break a request into skill runs; show the plan; run on approval for long work | 1 | N | Plan card | N3 |
| O2 | Roles: intake, jurisdiction, research, evidence, chronology, drafting, review, strategy, filing, hearing, monitoring, memory; each a set of skills and a tool scope | 1 | N | Role table | N1 |
| O3 | Parallel runs inside the main process; a run never changes another run's result | 2 | N | Concurrent runs | N3 |
| O4 | Checkpoints and resume after a restart | 2 | X | Resumed runs | N3 |
| O5 | Retry with limits, timeouts, error recovery | 1 | X | Run states | N3 |
| O6 | Evaluator gate: at most two rewrites, then a review item | 1 | X | Gate results | N3 |
| O7 | Model choice per role (drafting, extraction, critic), local or remote | 2 | X | Role settings | Q5 |
| O8 | Budget per matter and per run; Stop | 1 | B | — | — |
| O9 | Jobs view: every run, its state, its cost, its package, its report card | 1 | X | Jobs view | N3 |
| O10 | Approvals as interrupts, answered by bridge functions | 1 | B/X | — | — |
| O11 | Side questions ([harness-build.md](harness-build.md) HB-1): a read-only side thread from the chat dock or `/btw`; nothing returns to the main chat unless the advocate brings it in | 1 | N | Side panel | Q2 |

## P. Verification and quality control

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| P1 | Grounding check with no model call: every quote matches an anchored line; every page or paragraph reference exists | 1 | N | Grounding score and items | H3 |
| P2 | Provenance value on every citation and fact: tool result, official site, advocate-provided, advocate-attested, model knowledge (unverified) | 1 | X | Tags in drafts and outputs | P1 |
| P3 | Citation checks: exists, authentic, paragraph exists, paragraph supports the whole proposition, not overruled, coverage "checked N of M" | 1 | X | Citation items | E, P1 |
| P4 | Statute checks: in force on the governing date, correct version, amended or repealed | 2 | X | Statute items | D3, E3 |
| P5 | Procedure checks: forum, route, limitation, court rule current | 1 | X | Procedure items | B6, D2 |
| P6 | Fact checks: source, page, admitted or disputed, conflicting documents, dates, amounts, names, inferences labelled, contradictions never resolved silently | 1 | X | Fact items | H9, H10 |
| P7 | Draft checks: required parts, structure, grounds supported, relief matches grounds, numbering, annexures, cross-references, dates, defined terms, format, final PDF matches the approved DOCX | 1 | X | Draft items | L5 |
| P8 | Markers `[CITE]`, `[VERIFY]`, `[REVIEW]` in drafts; an open marker blocks finality | 1 | N | Items; gate | P2 |
| P9 | Reviewer note above every output: sources, read N of M, items for judgment, currency, what to do before relying | 1 | N | Note | N3 |
| P10 | Severity floor: a downstream skill never silently lowers a severity | 1 | N | Rule in the runner | N3 |
| P11 | Embedded-instruction scan of ingested documents and fetched pages | 1 | N | Review item | H1 |
| P12 | Shared verification record for public law (who verified what, when, against which source) | 2 | X | Records reused across matters | E |
| P13 | AI-use disclosure in every filing package | 1 | B/X | — | — |

## R. Review Inbox and dashboard

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| R1 | Review Inbox: drafts to approve, research to verify, facts to confirm, conflicting authorities, unverified citations, missing documents, memory proposals, workflow exceptions, filing defects, proposed strategy changes, rule-pack changes; keyboard operable; "blocks the work" first | 1 | X | One queue | — |
| R2 | Practice Intelligence Dashboard (Home): active matters, today's and next hearings, pending filings, court updates, new relevant judgments, changes in law, matters needing attention, open legal questions, research and drafts awaiting review, filing defects, incomplete evidence, runs waiting for the advocate; no business figures | 1 | X | Home view | R1, C5 |
| R3 | Matter Change Report: what changed since the last review, why it matters, which decisions it may affect, what action is needed | 3 | N | Report per matter | S, C5 |

## S. Court operations, monitoring and automation

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| S1 | Court adapter interface: capabilities and access method per court | 1 | X | Adapter registry | B2 |
| S2 | Adapters: Supreme Court (from the current portal code), Delhi High Court, Delhi district courts (eCourts) in phase 1; more by phase | 1–5 | X | Adapters | S1 |
| S3 | Case status: next date, listing, adjournments, transfers, bench changes, connected cases; through the advocate's session where needed | 3 | X | Status records | S1 |
| S4 | New orders and judgments for the advocate's matters; ingested as sources; impact check | 3 | X | Sources; review items | S3, K9 |
| S5 | Cause lists for the advocate's courts and matters on a date | 3 | N | Today's list | S1 |
| S6 | Legal developments: new Supreme Court and High Court judgments in the advocate's areas, new legislation, amendments, repeals, notifications, circulars, practice directions, filing-rule changes, limitation changes | 3 | N | Development records | B2, E |
| S7 | Matter impact analysis: affected provisions, matters, propositions, drafts and arguments; a change report; the advocate approves every change | 3 | X | Impact review items | S6, G4 |
| S8 | Alerts: relevant new judgment, new adverse authority, amendment, filing-rule change, limitation approaching, new order, hearing date change, missing document, unanswered direction, citation treatment change, run waiting for approval | 3 | X | Notifications | S3–S7 |
| S9 | Event triggers: new document, email, order, hearing date, instruction, amendment, deadline approaching, citation status change, stage change, defect received; each starts named skills | 4 | N | Trigger table | N6 |
| S10 | Automated responses (proposals only): rebuild the chronology, update the context, flag affected issues, create research tasks, draft a letter or update, recalculate deadlines, reassess arguments | 4 | N | Proposals in the inbox | S9 |
| S11 | Freshness of every monitored source on screen; no promise of monitoring where access is not permitted | 3 | N | Freshness view | B10 |
| S12 | Built-in browser ([harness-build.md](harness-build.md) HB-2 A): a tabbed browser pane for the advocate, hidden agent pages in the same engine, handover for logins and CAPTCHAs, agent tools over the DevTools Protocol, downloads into the matter; the court portal window moves onto it | 1 | X | Browser pane; `browser_*` tools | Q2 |
| S13 | agent-browser through MCP for heavy background browsing (HB-2 B) | 3 | N | MCP server | S12 |
| S14 | Playwright scripts per court for scheduled work: cause lists, case status, new orders (HB-2 C) | 3 | N | Adapter scripts | S1 |

## T. Portal filing by the agent (last phase)

Open Advocate produces filing-ready sets (B14 to B20) and the advocate files them. The agent's work on a portal comes last, in phase 6. The code already has a portal filing flow (the portal window, `submit_filing` after two confirmations). It is kept as it is and is not extended before phase 6. T1 to T3 and T5 to T8 moved to B14 to B20.

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| T4 | E-filing on a portal by the agent: prepare the bundle, fill and upload, and submit only after the advocate's two confirmations; the advocate signs in and solves the CAPTCHA | 6 | X | Captured result | S12, B15 |

## U. Languages

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| U1 | Hindi OCR and display (Tesseract Hindi data), language detection per page | 2 | N | Hindi readings | H3 |
| U2 | Regional languages, added per state the advocate selects | 4 | N | Readings | U1 |
| U3 | Line translation beside the original | 4 | N | Reading layer | H16 |

## V. Communications as evidence and instructions

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| V1 | Mail import into a matter, thread rebuild, attachments as sources | 1 | X | Sources | H1 |
| V2 | Classification of a message: instruction, notice, admission, commitment, deadline; an instruction is recorded with who gave it and whether the advocate accepted it | 3 | N | Records | V1, F3 |
| V3 | WhatsApp and SMS exports, voice notes; communication chronology | 3 | N | Sources and timeline | H2, H12 |
| V4 | Draft letters, notices, replies and hearing updates for the client; the advocate sends | 2 | X | Drafts | L3 |
| V5 | Questions document for the client | 1 | B | — | — |

## W. Collaboration (chamber, no server)

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| W1 | Matter packet: a signed export of selected records and documents, imported by a colleague's Open Advocate | 5 | X | Packets | C9 |
| W2 | Roles in a matter: AOR, arguing counsel, junior, clerk; scopes for what each sees | 5 | N | Scope rules | Q2 |
| W3 | Comments, annotations, assignments, review queue for a senior | 5 | N | Queue | W1 |
| W4 | Receiving documents from a client into a matter (folder drop, mail) | 1 | X | Sources | V1 |

## X. Analytics (no business figures)

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| X1 | Matter analytics: open matters, age, stage, deadlines, open items, pending instructions, document and research completeness | 2 | X | Dashboard panels | R2 |
| X2 | Legal analytics: frequently cited authorities, conflicts, court-wise and issue-wise trends, amendment impact, treatment of authorities; descriptive only | 4 | X | Research panels | G1 |
| X3 | Quality analytics: citation corrections, draft rejections, fact corrections, missing sources, run failures, context quality, advocate overrides, format defects | 3 | N | Quality panel | N3 |

## Y. Integrations

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| Y1 | Integration manifest: version, capabilities, permissions, inputs and outputs, events, lifecycle, audit, failure and disable behaviour | 4 | N | Manifest schema | — |
| Y2 | Calendar export and sync of hearings and deadlines (ICS first, then Google and Outlook) | 3 | N | Calendar entries | C5 |
| Y3 | Storage: local folders first; OneDrive and Google Drive import | 4 | N | Sources | H1 |
| Y4 | Models: local inference, OpenRouter and other providers through Pi; embeddings; reranking | 1–2 | B/X | — | — |
| Y5 | Microsoft Word round trip | 1 | B | — | — |

## Z. Foundation work (ids Q1 to Q7)

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| Q1 | Proceeding pack: forum, governing provisions by date, limitation rule, required parts, annexure rules, template, checklist, record-table columns, stage list, skills, intake questions | 1 | N | Pack schema in `intel.db` | B4 |
| Q2 | Policy module: tool scope per skill, matter scope, confidentiality, cross-matter rules, human-only actions | 1 | X | Enforced in the main process | — |
| Q3 | Remove the SLP coupling: the SLP generators, filing set, limitation and workflows become the SLP pack | 1 | X | SLP pack | Q1, N1 |
| Q4 | Plan card in the chat (AG-UI) | 1 | X | UI | O1 |
| Q5 | Second model family for critic roles | 1 | N | Setting | O7 |
| Q6 | `advocate.db` and `intel.db` with the same hash-chain audit as `matter.db` | 1 | N | Stores | — |
| Q7 | Navigation of [advocate-workflow.md](advocate-workflow.md) section 3 | 1 | X | UI | — |

