# Features

Accepted by the owner on 2026-11-15. This file owns the feature catalogue: every feature, its id, its phase, its starting point, its output and what it depends on. The phases are in [build-plan.md](build-plan.md). The skills are in [skills.md](skills.md).

Scope: litigation only ([product.md](product.md) section 2).

## How to read the catalogue

| Column | Meaning |
|---|---|
| ID | Stable feature id. The specs and the commits use it. |
| Ph | The phase the feature is first delivered in (1 to 13, [build-plan.md](build-plan.md)). |
| Base | **B** built now; **X** extend what is built; **N** new. |
| Output | What the advocate or another module gets. |
| Needs | The ids it depends on. |

Every feature also obeys the hard rules in [product.md](product.md) section 3. They are not repeated row by row.

---

## A. Onboarding and advocate profile

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| A1 | Four-step onboarding: you, courts, work, past work; every step skippable | 3 | N | Advocate profile in `advocate.db` | B1 |
| A2 | Professional identity: name, role (Advocate, Advocate-on-Record, Senior Advocate, junior), State Bar Council, enrolment number and year (optional, encrypted), chamber address | 3 | N | Identity record; signature block data for drafts | A1 |
| A3 | Court selection | 3 | N | Court map | B1 |
| A4 | Practice areas (multiple, with one primary); trial, appellate or both; civil, criminal or both | 3 | N | Practice map; enabled packs | Q1 |
| A5 | Import of past work: judgments, pleadings, templates, written submissions, memos, notes, checklists, statutory material; each tagged with a precedent status (default "unreviewed") | 3 | N | Knowledge Library entries | M1 |
| A6 | Practice Profile page, built automatically from the onboarding answers, imported work and imported matters: court map, practice map, territorial map, statutory map, sources plan, local intelligence plan, recommended skills and workflows, library structure; the advocate corrects any field, never fills it in; also territory: states, districts, the High Court territory, other states, foreign parties, international arbitration, cross-border enforcement | 3 | N | One page | A1, A2, A3, A4, A5, A9, B1, Q1 |
| A7 | Preferences learned later: citation format, drafting style, pleading structure, paragraph length, research depth, output format, languages; asked inside the first task where each matters, or proposed after repeated corrections; also "Applied because" note on every preference the agent uses | 6 | X | Advocate memory records | F2 |
| A8 | Team list for a chamber: juniors, clerks, briefing counsel, arguing counsel (names and roles only) | 12 | N | Team records | W2 |
| A9 | Import existing matters (optional, at onboarding or later): the advocate signs in to eCourts (ecourts.gov.in) or a High Court or Supreme Court portal in the app's browser; the agent reads the advocate's case list there and proposes one matter per case, with CNR, court, parties, stage and next date; the advocate chooses which to create | 3 | N | Proposed matters | S10, C2, B2 |

## B. Local legal intelligence and filing readiness

Filing readiness is part of local intelligence: the court's registry rules (B5) drive the checklist, the filing-ready set and its checks. Open Advocate produces documents ready to file; the advocate files them. Filing on a portal by the agent is the last phase (section T).

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| B1 | Court and tribunal directory: Supreme Court; all High Courts with seats and benches; district, sessions, civil, magistrate, family, special and commercial courts by state; NCLT, NCLAT, DRT, DRAT, CAT, SAT, AFT, NGT, ITAT, CESTAT, consumer commissions, RERA authorities and tribunals, other statutory forums; each with its own appeal route | 2 | N | `intel.db` directory, shipped offline | — |
| B2 | Source registry: official URL, owner, retrieval date, update interval, access method, reliability, last result; also versioning: every row has `valid_from`, `valid_until`, `retrieved_at`, `checked_by`; old versions stay readable; also freshness rule: a row past its interval is "stale since <date>"; a check that depends on it says "unconfirmed" | 2 | X | Source rows; freshness state | B1 |
| B3 | Court pack, general: website, case search, status system, cause list source, orders and judgments source, calendar, holidays, registry contacts, e-filing portal | 2 | N | Pack rows with sources | B1, B2 |
| B4 | Court pack, rules: procedure rules, practice directions, local amendments, circulars and notifications, case-type names, prescribed forms, court-fee rules | 2 | N | Versioned rule rows | B3 |
| B5 | Registry pack: filing checklists per case type, document order, index, pagination, annexures, affidavits, vakalatnama, court fee, PDF rules (size, OCR, bookmarks, naming), defect list and defect classes, re-filing rules, listing and mentioning, urgent listing, certified copies, inspection, paper-book rules, formatting rules | 2 | X | Checklist rows; feeds T-section filing | B4 |
| B6 | Procedural pack: governing procedural law by date, limitation periods, exclusions and extensions, condonation requirements, appeal, revision, review and curative routes, interim applications, service and notice, evidence rules, post-order compliance, execution | 2 | X | Rule rows; feeds limitation and route checks | B4 |
| B7 | Bench data: current and past bench composition, rosters, sittings, bench strength (for authority research only) | 2 | N | Bench rows | B3 |
| B8 | Pack check task: re-read each source by its access method; show changes as a diff for the advocate to accept | 9 | N | Change list in the Review Inbox | B2, R1 |
| B9 | Court Intelligence dashboard: selected courts, current rules and circulars, recent judgments, today's cause lists, amendments, filing-rule changes, holidays, procedural updates, new favourable and adverse authorities, failed sources, rows waiting for verification; also freshness of every monitored source on screen; no promise of monitoring where access is not permitted | 9 | N | One view | B2, B3, B4, B5, B6, B7 |
| B10 | Pack editor: the advocate adds or corrects a rule with its source; marked "advocate-entered" | 2 | N | Rule rows | B4 |
| B11 | Filing checklist per court and case type, from the registry pack | 2 | X | Checklist with states | B5 |
| B12 | Filing-ready set: required documents, document order, index, pagination, annexures, affidavits, vakalatnama, court fee, limitation | 2 | X | Filing set, ready for the advocate to file | B11 |
| B13 | Format, PDF, searchability, file-size and naming checks per court | 2 | X | Check items | B5 |
| B14 | Defect list import, defect reply drafting, re-filing checklist | 2 | N | Corrected set; reply | B11 |
| B15 | Paper book and index per court rules; hearing bundle audit | 2 | X | Paper book PDF | B5 |
| B16 | Filing history per matter: what the advocate filed, when, and the result; uncertain results reconciled | 2 | B/X | — | — |
| B17 | Signed manifest of every filing set | 2 | B | — | — |

## C. Universal litigation matter

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| C1 | Matter fields: court, bench or establishment, proceeding type, side, case number, CNR, filing date, institution date, governing date, stage, relief sought, confidentiality | 3 | X | `matter_details` migration | B1, Q1 |
| C2 | Create a matter manually, by voice, from a document or file, from an order, from a cause-list entry, from a case number (through the adapter), or from an email; also add an existing matter: point to a folder of its papers, give its CNR number (status and orders through the adapter or the browser), forward or choose an email, or describe it in the chat; the agent proposes the matter fields, parties, stage, next date and sources; the advocate confirms | 3 | X | New matter with proposed fields | C1, H1 |
| C3 | Classification proposal: practice area, case type, court, parties, stage, statutes; the advocate confirms or corrects | 3 | N | Confirmed classification | C1, H1 |
| C4 | Configurable stage lists per proceeding (a bail application, a suit, a writ, an appeal, an execution and an arbitration petition each have their own) | 3 | N | Stage machine per proceeding | Q1 |
| C5 | Overview, always current: summary, parties and positions, procedural history, stage, issues, key facts, key documents and evidence, authorities, pending applications, next date, deadlines, outstanding instructions, open questions, current strategy, latest developments | 3 | X | Overview tab | C1, H, F |
| C6 | Related matters: appeal from, revision of, review of, cross-petition, counterclaim, transfer petition, connected case, the FIR behind a bail or quashing matter, connected arbitration, common parties, common evidence | 3 | N | Relation edges; navigation | C1 |
| C7 | Detect possible related matters (same CNR, FIR number, parties or impugned order) and propose links | 4 | N | Link proposals | C6, H5 |
| C8 | Parties: role in this proceeding, name as in the record, link to a contact, counsel for each party | 3 | B | — | — |
| C9 | Archive, restore and export a matter | 3 | B | — | — |
| C10 | Extend a matter: add a later stage or a related proceeding (appeal, revision, review, execution, connected case) to an existing matter, add papers in bulk from a folder or an email, and refresh its status from the portal | 3 | X | Extended matter; relation edges | C6, C2 |

## D. Jurisdiction and temporal law

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| D1 | Jurisdiction report per matter: proposed forum and type, territorial basis, subject basis, governing provisions, alternative forums, limitation, appeal route, applicable rules, unresolved facts; "undetermined" allowed; also jurisdiction facts: territorial, pecuniary, subject-matter, original, appellate, revisional, writ, supervisory, criminal and civil, and tribunal jurisdiction, as pack rows with sources | 4 | N | Report in the Jurisdiction tab | H, C1 |
| D2 | Governing-date selection of the law: commencement, repeal, amendment, transitional and savings rows; the version in force on the date (IPC/BNS, CrPC/BNSS, Evidence Act/BSA, and others) | 5 | X | Statute version per matter | E3 |
| D3 | Forum clauses, arbitration seat and venue, exclusive and non-exclusive jurisdiction, extracted from the record | 4 | N | Facts with anchors | H3 |
| D4 | Foreign elements: foreign parties, enforcement of foreign judgments and awards, as route facts | 11 | N | Route rows | D1 |
| D5 | Wrong-jurisdiction guard: a skill run with no pack for the matter's forum says so and stops | 2 | N | Refusal with reason | Q2 |

## E. Legal corpus and authority intelligence

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| E1 | Judgment records with identity: court, bench, bench strength, date, parties, citations (neutral, SCC, AIR, SCR), case numbers, judges, paragraphs | 5 | X | `corpus.db` rows | — |
| E2 | Corpus beyond the Supreme Court: the High Courts of the advocate's courts, then tribunals; from official sites, the advocate's uploads and the advocate's own research sessions | 5 | X | Index growth | B2, E1 |
| E3 | Statutes with versions: act, section, rule, regulation, notification, amendment, each with its in-force dates, from India Code and the e-Gazette | 5 | X | Versioned provision rows | B2 |
| E4 | Passage roles: ratio, obiter, counsel's submission, lower-court view, dissent, concurrence; candidates until the advocate confirms | 5 | B | — | — |
| E5 | Binding-effect check: the hierarchy, the territory, bench strength, coordinate benches, larger benches, prospective overruling; the result is a fact with its reasoning, for the advocate | 5 | N | Binding or persuasive label per authority per matter | E1, G1, B1 |
| E6 | Conflicts: decisions in conflict across benches or High Courts, references pending before larger benches | 5 | N | Conflict review items | G1 |
| E7 | Proposition records: a legal proposition, its supporting passages, its adverse passages, verified on a date; also legal memory: propositions, interpretations, tests, burdens, procedural principles, remedies, limitation and jurisdiction principles, each with sources | 5 | N | Proposition table | E1, F |
| E8 | Connector to the advocate's research services through their own session (SCC Online, Manupatra, Indian Kanoon API with the advocate's key) | 9 | N | Fetched judgments with provenance | E1, L1 |

## F. Memory

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| F1 | Typed memory records ([architecture.md](architecture.md) section 6) in `matter.db` and `advocate.db`; also matter memory: facts by source kind, admissions, disputes, missing facts, accepted and rejected arguments, decisions, orders, open questions, changes in case theory | 4 | X | Memory table | — |
| F2 | Advocate memory: preferences, frequent statutes and authorities, approved templates, rejected approaches, corrections, repeated instructions | 6 | X | Records with "applied because" | F1 |
| F3 | Lifecycle: propose, confirm, supersede, expire, archive, delete under retention; history kept | 4 | X | State changes as events | F1 |
| F4 | Memory view: search, filter by type and status, see sources, correct, supersede | 4 | X | The matter Memory tab and advocate memory in the profile | F1 |
| F5 | Retrieval answers: what was decided, why an argument was rejected, which facts are disputed, which instructions were given, what changed since the last hearing, which assumptions expired | 10 | N | Chat answers with record links | F1, I1 |
| F6 | Memory proposals after a run, decided in the Review Inbox | 4 | B | — | — |

## G. Graphs and derived indexes

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| G1 | Legal knowledge graph edges ([architecture.md](architecture.md) section 4); also treatment edges from the judgments' own text: followed, distinguished, overruled, doubted, referred to a larger bench, affirmed, reversed, modified, per incuriam | 5 | N | Edge table in `corpus.db` | E1, E3 |
| G2 | Matter evidence graph edges | 4 | X | Edge table in `matter.db` (from anchors, links, record cells) | H |
| G3 | Advocate memory graph edges | 10 | N | Edge table in `advocate.db` | F2 |
| G4 | Graph questions: judgments that interpret a provision; judgments that distinguish an authority; amendments that affect a proposition; conflicting High Court decisions; grounds that depend on a fact; facts with no support | 5 | N | Query tools for the agent and the views | G1, G2 |
| G5 | Full-text index (FTS5) over the matter and the corpus; also search across the library with access rules | 1 | B/X | — | — |
| G6 | Vector index with a local embedding model through ONNX Runtime; one spike settles sqlite-vec against a TypeScript index | 5 | N | Semantic search | G5 |
| G7 | Hybrid retrieval: full text, metadata filter, graph walk and vectors, combined and reranked | 5 | N | One retrieval function | G4, G5, G6 |
| G8 | Rebuild commands and an index health view | 5 | N | Rebuild; counts; last build time | G2, G5 |

## H. Documents and evidence

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| H1 | Intake of PDF, DOCX, DOC, ODT, XLSX, CSV, PPTX, images, scans, photos, EML, MSG, HTML, ZIP bundles, court downloads | 3 | X | Sources with origins | — |
| H2 | Audio and video intake with transcription (Whisper), speaker turns, time anchors | 9 | X | Transcript sources | — |
| H3 | Understanding: OCR with Tesseract, and docTR as the second engine (in place of PP-OCR, which the code uses now); layout, tables, headers and footers, footnotes, page and paragraph anchors, classification, entities, dates, amounts, citations | 4 | B/X | — | — |
| H4 | Signature, stamp and seal detection; handwriting flagged for the advocate | 4 | N | Marks on pages | H3 |
| H5 | Duplicate, version and relationship detection (annexure of, reply to, certified copy of) | 4 | X | Links | H3 |
| H6 | Legal structure: pleading parts, prayers, allegations, admissions and denials, witnesses, exhibits, annexure map, court-order directions | 4 | N | Structured records with anchors | H3 |
| H7 | Evidence repository: exhibit numbers, witnesses, statements, chain of custody (who gave it, when, hash), electronic-evidence metadata, authenticity status, admissibility notes (advocate-entered) | 4 | N | Evidence tab | H1, C1 |
| H8 | Fact management: extract, confirm, dispute, classify, source, supersede; fact to issue, argument and relief maps | 4 | X | Fact records | H3, F1 |
| H9 | Contradiction detection across documents and statements (dates, amounts, names, events) | 4 | X | Contradiction review items | H8 |
| H10 | Timelines: chronology, procedural timeline, payment, communication and limitation timelines, conflicting dates, before and after comparison | 4 | X | Timeline views | H8 |
| H11 | Matter Evidence Vault: bulk ingestion into the thousands; questions across the collection; review tables; grouping by issue; anomaly report | 5 | X | Vault view over the record table | H1, G7 |
| H12 | Record table templates per proceeding (for example charge-sheet witnesses, FIR ingredients, plaint and written-statement admissions) | 4 | N | Column sets | Q1 |
| H13 | Document operations: annotate, highlight, split, merge, reorder, convert, extract pages, redact (with a redaction log), export; also merge documents, reorder, split; annexure manager with marks (Annexure P-1 and so on, per court) | 4 | X | New revisions or exports | H1 |
| H14 | OCR comparison between the engines (critical-token disputes, built today with PP-OCR), a second engine for regional languages, and OCR quality checks; also document quality score (blur, skew, missing pages) | 11 | X | Dispute review items | H3, U2 |

## I. Context assembly

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| I1 | Context package builder ([architecture.md](architecture.md) section 5): classify the task, retrieve, rank, filter, fit, record; also ranking policies by question type: what the law is, what happened, what was agreed, what the client wants, what the court directed; also package types: matter, research, drafting, strategy, evidence review, hearing, filing, monitoring; also budget control: chunk choice, deduplication, compression that keeps anchors and both sides of a conflict; also freshness and conflict flags inside the package (stale rule, superseded memory, disputed fact); also cache and incremental update of packages for long tasks | 1 | N | Package record per run | Q2, G5 |

## J. Research

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| J1 | Search modes: natural language, exact phrase, Boolean, citation, party, judge, court and bench, statute and section, paragraph, proposition, fact pattern, connected case, historical law, cross-jurisdiction | 5 | X | Research view and agent tools | G7, E |
| J2 | Research plan: decompose the question, list the sources, show the plan before a long run; also completeness: issues with no authority, authorities not checked, sources not reached | 5 | N | Plan with steps | O1 |
| J3 | Analysis: ratio, obiter, tests, relevant paragraphs, factual similarities and distinctions, supporting and adverse authority, contrary readings, bench strength, later treatment, statutory versions, binding effect | 5 | X | Authority records | E4, G1, E5, E6, E7 |
| J4 | Negative search: find the adverse authority on purpose, for every issue | 5 | X | Adverse authority list | J1 |
| J5 | Deliverables: case-law matrix, statutory matrix, issue-wise authority matrix, proposition table, adverse authority report, research memorandum, opinion on a litigation question, written submissions, strategy report, historical law report, comparative report | 5 | X | Drafts with citations | K, J3 |
| J6 | Research history per matter and across matters (law only, never facts) | 5 | X | History view | E7 |

## K. Argument, strategy and hearings

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| K1 | Issues: proposed, accepted, rejected; each tied to facts and to the relief sought | 7 | B/X | — | H8 |
| K2 | Argument loop with critic and opposing counsel; the critic on a second model family | 7 | B/X | — | O5 |
| K3 | Element charts: the ingredients of an offence, the elements of a cause of action, the conditions for interim relief; each cell anchored; gaps shown; also gaps: missing evidence for each element of each issue | 7 | N | Chart in the record table | H8, Q1 |
| K4 | Case theory: alternative theories, argument dependencies, argument status, burden and standard of proof, weaknesses | 7 | X | Strategy tab | K1, K2, K3 |
| K5 | Dissent panel for hard questions: different models answer; a split is shown, not hidden | 7 | N | Split review item | O5 |
| K6 | Hearing brief: posture, the last order's directions, what is listed, open items, one page; also bench questions and answers, objections, challenge register (no outcome prediction) | 7 | N | Brief | C5 |
| K7 | Oral outline (three or four points, strongest first), rebuttal notes, compilation of authorities with marked paragraphs | 7 | N | Drafts | K1, J3 |
| K8 | Post-hearing record: directions, next date, compliance tasks; a new order triggers an impact check | 7 | B/X | — | — |
| K9 | Cross-examination plan as questions, from contradictions and statements | 7 | N | Question list with anchors | H9 |

## L. Drafting and editor

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| L1 | Template per proceeding and court: parts, order, headings, cause title, verification, affidavit, signature block | 6 | X | DOCX templates | B5, Q1 |
| L2 | Generate parts from records with ids kept: facts, list of dates, synopsis, grounds, questions, prayers, interim prayers | 6 | X | Draft paragraphs | L1, H8 |
| L3 | Documents: plaint, written statement, replication, application (interim, condonation, exemption, early hearing, stay), petition, appeal memo, revision, writ, counter, rejoinder, affidavit, written submissions, legal notice and reply, list of dates, chronology, briefing note, case summary, research memo, index and paper book; also draft letters, notices, replies and hearing updates for the client; the advocate sends | 6 | X | Drafts | L1, L2 |
| L4 | Agent edits as tracked changes; keep or undo by the advocate; revisions; approved revisions are immutable | 6 | B | — | — |
| L5 | Citation insertion from saved authorities in the advocate's format | 6 | N | Citations in the draft | A7, E1 |
| L6 | Compare any two revisions; compare a revision with the rendered PDF | 6 | B/X | — | — |
| L7 | Bilingual drafting (English with Hindi parts) | 11 | N | Drafts | U1 |
| L8 | Witness and deponent rule: the agent prepares questions and organises the deponent's own words; it does not compose the evidence | 6 | N | Skill rule | Q2 |

## M. Knowledge Library

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| M1 | Library: judgments, statutes, the advocate's pleadings, templates, written submissions, memos, notes, checklists, propositions, court rules; also precedent status: drafted, reviewed, approved, filed, superseded, rejected, withdrawn; with author, date, matter, court, scope | 3 | N | Library view in `advocate.db` with files in blobs | A5 |
| M2 | Approved and rejected positions, playbooks, court-specific drafting styles, common errors; also use in drafting: an approved precedent is offered first and shown with its scope | 10 | N | Library entries used by skills | M1 |
| M3 | Outcome records of past matters (what the court did, entered by the advocate) | 10 | N | Records | C1 |

## N. Skills, workflows and agents

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| N1 | Skills registry: built-in skills from the repository; the advocate's own skills from user data; index; versions; also skill format: id, version, title, description with triggers, packs, courts, proceedings, inputs, required context, permitted tools, output schema, checks, approval points, tests, author | 1 | N | Registry | — |
| N2 | Skill runner: builds the context package, starts a scoped Pi session, validates the output, runs the checks, writes the report card | 1 | N | Run records | N1, I1, Q2, R |
| N3 | `/` to call a skill, `@` to add context, and skill choice from a plain request | 1 | N | Chat gestures | N1 |
| N4 | Skill library ([skills.md](skills.md)): about 140 skills | 8 | X | Skills | N1 |
| N5 | Workflow builder: chain skills, with approval gates, conditions and inputs; visual editor; also agent builder: a named agent from a task, instructions, skills, a template, sources, required context, tools, output, checks and approvals; versioned and testable | 11 | X | Workflows | N2 |
| N6 | Skill review before ship: thirteen parameters, three legal failure modes; score kept with the version; also skill tests: fixture briefs and expected properties; run on every change | 8 | N | Review record | N1 |
| N7 | Import of a skill from a file: show the raw text, scan for embedded instructions, ask before install | 11 | N | Installed skill | N1 |

## O. Harness and agent controls

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| O1 | Planner: break a request into skill runs; show the plan; run on approval for long work; also plan card in the chat (AG-UI) | 1 | N | Plan card | N2 |
| O2 | Roles: intake, jurisdiction, research, evidence, chronology, drafting, review, strategy, filing, hearing, monitoring, memory; each a set of skills and a tool scope | 1 | N | Role table | N1 |
| O3 | Parallel runs inside the main process; a run never changes another run's result; also checkpoints and resume after a restart; also retry with limits, timeouts, error recovery | 1 | N | Concurrent runs | N2 |
| O4 | Evaluator gate: at most two rewrites, then a review item | 1 | X | Gate results | N2 |
| O5 | Model choice per role (drafting, extraction, critic), local or remote; also second model family for critic roles | 7 | X | Role settings | — |
| O6 | Budget per matter and per run; Stop | 1 | B | — | — |
| O7 | Jobs view: every run, its state, its cost, its package, its report card; also package view: what the agent received, what it did not receive, and why | 1 | X | Jobs view | N2 |
| O8 | Approvals as interrupts, answered by bridge functions | 1 | B/X | — | — |
| O9 | Side questions ([harness-build.md](harness-build.md) HB-1): a read-only side thread from the chat dock or `/btw`; nothing returns to the main chat unless the advocate brings it in | 1 | N | Side panel | Q2 |

## P. Verification and quality control

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| P1 | Grounding check with no model call: every quote matches an anchored line; every page or paragraph reference exists | 6 | N | Grounding score and items | H3 |
| P2 | Provenance value on every citation and fact: tool result, official site, advocate-provided, advocate-attested, model knowledge (unverified); also primary or secondary label on every source: primary law, official notification, commentary, unverified secondary | 6 | X | Tags in drafts and outputs | P1 |
| P3 | Citation checks: exists, authentic, paragraph exists, paragraph supports the whole proposition, not overruled, coverage "checked N of M"; also shared verification record for public law (who verified what, when, against which source) | 6 | X | Citation items | E, P1 |
| P4 | Statute checks: in force on the governing date, correct version, amended or repealed | 6 | X | Statute items | D2, E3 |
| P5 | Procedure checks: forum, route, limitation, court rule current | 6 | X | Procedure items | B6, D1 |
| P6 | Fact checks: source, page, admitted or disputed, conflicting documents, dates, amounts, names, inferences labelled, contradictions never resolved silently | 6 | X | Fact items | H8, H9 |
| P7 | Draft checks: required parts, structure, grounds supported, relief matches grounds, numbering, annexures, cross-references, dates, defined terms, format, final PDF matches the approved DOCX; also validation: numbering, cross-references, annexure references, defined terms, dates, citation format, footnotes, tables | 6 | X | Draft items | — |
| P8 | Markers `[CITE]`, `[VERIFY]`, `[REVIEW]` in drafts; an open marker blocks finality | 6 | N | Items; gate | P2 |
| P9 | Reviewer note above every output: sources, read N of M, items for judgment, currency, what to do before relying; also severity floor: a downstream skill never silently lowers a severity | 6 | N | Note | N2 |
| P10 | Embedded-instruction scan of ingested documents and fetched pages | 6 | N | Review item | H1 |
| P11 | AI-use disclosure in every filing package | 6 | B/X | — | — |

## R. Review Inbox and dashboard

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| R1 | Review Inbox: drafts to approve, research to verify, facts to confirm, conflicting authorities, unverified citations, missing documents, memory proposals, workflow exceptions, filing defects, proposed strategy changes, rule-pack changes; keyboard operable; "blocks the work" first | 1 | X | One queue | — |
| R2 | Practice Intelligence Dashboard (Home): active matters, today's and next hearings, pending filings, court updates, new relevant judgments, changes in law, matters needing attention, open legal questions, research and drafts awaiting review, filing defects, incomplete evidence, runs waiting for the advocate; no business figures; also matter analytics: open matters, age, stage, deadlines, open items, pending instructions, document and research completeness | 3 | X | Home view | R1, C5 |

## S. Court operations, monitoring and automation

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| S1 | Court adapter interface: capabilities and access method per court | 3 | X | Adapter registry | B2 |
| S2 | Adapters: Supreme Court (from the current portal code), Delhi High Court, Delhi district courts (eCourts) in phase 1; more by phase | 3 | X | Adapters | S1 |
| S3 | Case status: next date, listing, adjournments, transfers, bench changes, connected cases; through the advocate's session where needed | 9 | X | Status records | S1 |
| S4 | New orders and judgments for the advocate's matters; ingested as sources; impact check | 9 | X | Sources; review items | S3, K8 |
| S5 | Cause lists for the advocate's courts and matters on a date | 9 | N | Today's list | S1 |
| S6 | Legal developments: new Supreme Court and High Court judgments in the advocate's areas, new legislation, amendments, repeals, notifications, circulars, practice directions, filing-rule changes, limitation changes | 9 | N | Development records | B2, E |
| S7 | Matter impact analysis: affected provisions, matters, propositions, drafts and arguments; a change report; the advocate approves every change; also matter Change Report: what changed since the last review, why it matters, which decisions it may affect, what action is needed | 9 | X | Impact review items | S6, G4 |
| S8 | Alerts: relevant new judgment, new adverse authority, amendment, filing-rule change, limitation approaching, new order, hearing date change, missing document, unanswered direction, citation treatment change, run waiting for approval | 9 | X | Notifications | S3, S4, S5, S6, S7 |
| S9 | Event triggers: new document, email, order, hearing date, instruction, amendment, deadline approaching, citation status change, stage change, defect received; each starts named skills; also automated responses (proposals only): rebuild the chronology, update the context, flag affected issues, create research tasks, draft a letter or update, recalculate deadlines, reassess arguments | 11 | N | Trigger table | N5 |
| S10 | Built-in browser ([harness-build.md](harness-build.md) HB-2 A): a tabbed browser pane for the advocate, hidden agent pages in the same engine, handover for logins and CAPTCHAs, agent tools over the DevTools Protocol, downloads into the matter; the court portal window moves onto it | 3 | X | Browser pane; `browser_*` tools | Q2 |
| S11 | agent-browser through MCP for heavy background browsing (HB-2 B) | 9 | N | MCP server | S10 |
| S12 | Playwright scripts per court for scheduled work: cause lists, case status, new orders (HB-2 C) | 9 | N | Adapter scripts | S1 |

## T. Portal filing by the agent (last phase)

Open Advocate produces filing-ready sets (B11 to B17) and the advocate files them. The agent's work on a portal is phase 13, the last phase. The code already has a portal filing flow (the portal window, `submit_filing` after two confirmations). It is kept as it is and is not extended before that phase.

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| T1 | E-filing on a portal by the agent: prepare the bundle, fill and upload, and submit only after the advocate's two confirmations; the advocate signs in and solves the CAPTCHA | 13 | X | Captured result | S10, B12 |

## U. Languages

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| U1 | Hindi OCR and display (Tesseract Hindi data), language detection per page | 11 | N | Hindi readings | H3 |
| U2 | Regional languages, added per state the advocate selects | 11 | N | Readings | U1 |
| U3 | Line translation beside the original; also translation of a line or a document, kept beside the original, never as the source | 11 | N | Reading layer | — |

## V. Communications as evidence and instructions

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| V1 | Mail import into a matter, thread rebuild, attachments as sources | 3 | X | Sources | H1 |
| V2 | Classification of a message: instruction, notice, admission, commitment, deadline; an instruction is recorded with who gave it and whether the advocate accepted it | 9 | N | Records | V1, F1 |
| V3 | WhatsApp and SMS exports, voice notes; communication chronology | 9 | N | Sources and timeline | H2, H10 |
| V4 | Questions document for the client | 3 | B | — | — |

## W. Collaboration (chamber, no server)

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| W1 | Matter packet: a signed export of selected records and documents, imported by a colleague's Open Advocate | 12 | X | Packets | C9 |
| W2 | Roles in a matter: AOR, arguing counsel, junior, clerk; scopes for what each sees | 12 | N | Scope rules | Q2 |
| W3 | Comments, annotations, assignments, review queue for a senior | 12 | N | Queue | W1 |
| W4 | Receiving documents from a client into a matter (folder drop, mail) | 3 | X | Sources | V1 |

## X. Analytics (no business figures)

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| X1 | Legal analytics: frequently cited authorities, conflicts, court-wise and issue-wise trends, amendment impact, treatment of authorities; descriptive only | 10 | X | Research panels | G1 |
| X2 | Quality analytics: citation corrections, draft rejections, fact corrections, missing sources, run failures, context quality, advocate overrides, format defects | 10 | N | Quality panel | N2 |

## Y. Integrations

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| Y1 | Integration manifest: version, capabilities, permissions, inputs and outputs, events, lifecycle, audit, failure and disable behaviour | 11 | N | Manifest schema | — |
| Y2 | Calendar export and sync of hearings and deadlines (ICS first, then Google and Outlook) | 9 | N | Calendar entries | C5 |
| Y3 | Storage: local folders first; OneDrive and Google Drive import | 11 | N | Sources | H1 |
| Y4 | Models: local inference, OpenRouter and other providers through Pi; embeddings; reranking | 1 | B/X | — | — |
| Y5 | Microsoft Word round trip | 1 | B | — | — |

## Z. Foundation work

| ID | Feature | Ph | Base | Output | Needs |
|---|---|---|---|---|---|
| Q1 | Proceeding pack: forum, governing provisions by date, limitation rule, required parts, annexure rules, template, checklist, record-table columns, stage list, skills, intake questions | 2 | N | Pack schema in `intel.db` | B4 |
| Q2 | Policy module: tool scope per skill, matter scope, confidentiality, cross-matter rules, human-only actions; also scope check before retrieval (matter, confidentiality, chamber scope) | 1 | X | Enforced in the main process | — |
| Q3 | Remove the SLP coupling: the SLP generators, filing set, limitation and workflows become the SLP pack | 8 | X | SLP pack | Q1, N1 |
| Q4 | `advocate.db` and `intel.db` with the same hash-chain audit as `matter.db` | 1 | N | Stores | — |
| Q5 | Navigation of [advocate-workflow.md](advocate-workflow.md) section 3 | 1 | X | UI | — |

