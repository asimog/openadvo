# Build plan

Accepted by the owner on 2026-11-15. This file owns the phases, their scope, their order and their exits. The scope of each phase is a list of feature ids from [features.md](features.md). Skills are listed with their phase in [skills.md](skills.md).

## 1. Rules for every phase

- A phase builds one or two modules deep and complete: every feature in its scope, with its tests and its views. Nothing is left as a thin version to extend later.
- A module's spec is written when its work starts, at the depth it needs, in [specs/](specs/).
- Phases run in order. A feature never needs a feature of a later phase.
- Done means the owner completed the exit on real briefs. A document or a test the agent wrote is not done (lesson L3 in [../AGENTS.md](../AGENTS.md)).

## 2. Phases

| Phase | Modules | Features |
|---|---|---|
| 1 | Harness and stores | 19 |
| 2 | Local legal intelligence and filing readiness | 17 |
| 3 | Advocate, matters and the browser | 25 |
| 4 | Documents, evidence and facts | 18 |
| 5 | Law, research and authority | 20 |
| 6 | Drafting and verification | 20 |
| 7 | Argument and hearings | 10 |
| 8 | Practice packs: criminal, civil, writ and SLP | 3 |
| 9 | — Skipped; merged with phase 13 | — |
| 10 | Memory and knowledge | 4 |
| 11 | Builders, automation, integrations and the remaining packs | 8 |
| 12 | Chamber work | 4 |
| 13 | Court monitoring, communications and portal filing | 16 |

### Phase 1: Harness and stores

The agent harness, the canonical stores and the policy: context assembly, the skill registry and runner, the planner, run controls, the Review Inbox, side questions and the navigation. Harness hardening ([harness-hardening.md](harness-hardening.md)) runs in this phase.

Scope: G5, I1, N1–N3, O1–O4, O6–O10, Q2, Q4, Q5, R1, Y4, Y5.

Exit: A real matter conversation: the plan card before long work, a skill run with its context package and report card, a side question, and the jobs view showing what the agent read.

### Phase 2: Local legal intelligence and filing readiness

The court and tribunal directory, sources with versions and freshness, court packs (general, rules, registry, procedure), proceeding packs, and the filing-ready set with its checks, paper book and manifest.

Scope: B1–B7, B10–B17, D5, Q1.

Exit: The owner checks the packs of the first courts (questions Q-1) against official sources, and accepts the filing checklist, index and paper-book rules for one Delhi High Court case type.

### Phase 3: Advocate, matters and the browser

Onboarding, the automatic Practice Profile, the Knowledge Library, the universal matter (create, add existing, extend, related matters, stages, overview), intake and mail, the Home dashboard, the court adapter interface, and the built-in browser ([harness-build.md](harness-build.md) HB-2 A) with the import of the advocate's case list.

Scope: A1–A6, A9, C1–C6, C8–C10, H1, M1, R2, S1, S2, S10, V1, V4, W4.

Exit: Onboarding in under three minutes. The advocate's case list imported from eCourts or a court portal after signing in, with the right CNR, court, parties, stage and next date. One matter added from each of a folder, a CNR, an email and the chat.

### Phase 4: Documents, evidence and facts

OCR (Tesseract and docTR), document structure, duplicates and relations, the evidence repository, facts, contradictions, timelines, record-table templates, document operations, the matter evidence graph, typed matter memory, related-matter detection, forum clauses and the jurisdiction report.

Scope: C7, D1, D3, F1, F3, F4, F6, G2, H3–H10, H12, H13.

Exit: A real brief of more than 1,000 pages: coverage stated, review-table cells anchored, contradictions found, and the jurisdiction report with its basis.

### Phase 5: Law, research and authority

The legal corpus beyond the Supreme Court, statutes by version and the law on the governing date, binding effect, conflicts, propositions, the legal knowledge graph, full-text, vector and hybrid retrieval, the evidence vault's questions, research modes, plans, analysis, adverse authority and deliverables.

Scope: D2, E1–E7, G1, G4, G6–G8, H11, J1–J6.

Exit: A research memorandum on a real question: adverse authority found, binding effect explained, the provision in force on the governing date, and coverage stated.

### Phase 6: Drafting and verification

Templates per proceeding and court, generated parts, documents, tracked changes, comparison, citation insertion in the advocate's format, the witness rule, every verification check, the reviewer note, markers, the injection scan, the AI-use disclosure, and learned preferences with the advocate's memory.

Scope: A7, F2, L1–L6, L7, P1–P11.

Exit: Draft review on a real draft: every error found is supported by a source with an accurate reference. A filing-ready Delhi High Court set that the advocate files without changes.

### Phase 7: Argument and hearings

Issues, the argument loop and its critic, element charts with gaps, case theory, the dissent panel, the hearing brief with bench questions, the oral outline, the post-hearing record, cross-examination plans, and a model per role.

Scope: K1–K9, O5.

Exit: A real listing: the hearing brief, bench questions and oral outline before the date; the directions, next date and compliance tasks after it.

### Phase 8: Practice packs: criminal, civil, writ and SLP

The skills of the first packs (questions Q-2) on the finished modules, the SLP pack moved out of the core, and skill review and tests.

Scope: N4, N6, Q3.

Exit: Real briefs: an SLP with no loss against what the code does today; a Delhi bail application; a quashing petition with an ingredients chart; a writ with maintainability questions; a civil injunction with a conditions chart.

### Phase 9: Skipped

Skipped by the owner on 2026-11-18. Its scope is built with phase 13, so court monitoring and communications come after the builders and the remaining packs.

Scope: none.

Exit: none.

### Phase 10: Memory and knowledge

Retrieval answers over memory, the advocate memory graph, approved and rejected positions and playbooks, outcome records, and the use of an approved precedent in drafting.

Scope: F5, G3, M2, M3.

Exit: Returning to an old matter: prior decisions, instructions, open items and posture are recovered correctly. An approved precedent is offered first for a new draft, with its scope. An outcome record is entered and the advocate memory graph shows it.

### Phase 11: Builders, automation, integrations and the remaining packs

The workflow and agent builder, event triggers, skill import, integration manifests, cloud storage import, foreign elements, OCR comparison and quality checks, and the packs in [skills.md](skills.md) sections 2.5 and 2.6.

Scope: D4, H14, N5, N7, N8, S9, Y1, Y3.

Exit: One real brief per new pack, including a Section 34 challenge, completed by the owner or by an advocate the owner names. A built workflow runs its skills in order with its approval gates. A clipped scan shows its quality score and its pages are found.

### Phase 12: Chamber work

The team list, matter packets, roles and scopes, comments, assignments and review queues.

Scope: A8, W1–W3.

Exit: A matter moved between two installations with its roles, comments and review, and nothing lost or exposed.

### Phase 13: Court monitoring, communications and portal filing

Pack checks, the Court Intelligence dashboard, the advocate's research services, case status, new orders, cause lists, legal developments, matter impact and the Matter Change Report, alerts, agent-browser through MCP and Playwright scripts ([harness-build.md](harness-build.md) HB-2 B and C), audio and video, messages as instructions, the communication chronology, and calendar sync. The agent also prepares, uploads and submits on a portal after the advocate's two confirmations. Until this phase, Open Advocate produces filing-ready sets and the advocate files them.

Scope: B8, B9, E8, H2, S3–S8, S11, S12, T1, V2, V3, Y2.

Exit: Four weeks of real practice. A new order in a monitored case is ingested, with its directions and deadlines proposed. A new adverse judgment is traced to every affected matter and draft, and nothing changes without approval. One real filing on each first-court portal, with the advocate's two confirmations, and nothing submitted without them.

## 3. Where the work starts

1. Phase 1 starts with its spec in [specs/](specs/): stores and policy, context assembly, the skill registry and runner, and side questions.
2. Two spikes settle choices before the phases that need them: the vector index (sqlite-vec against a TypeScript index) before phase 5, and the reach of the Delhi High Court and eCourts sites through the built-in browser before phase 3. Each spike has a result file in `spikes/`.
3. Where the work stands is recorded in the session reports in `../.agents/logs/`.
