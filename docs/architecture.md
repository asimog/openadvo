# Architecture

Accepted by the owner on 2026-11-15. This file owns the layers, the stores and what each one owns, the three graphs, context assembly, memory, the harness, local intelligence, court adapters and languages. The engineering choices under it are in [engineering.md](engineering.md).

## 1. Base

The plan keeps the code's base: Electron with TypeScript, React with Astryx, Pi in the main process, `node:sqlite`, Euro-Office, Tesseract and PP-OCR through ONNX Runtime, and Whisper. Reasons:

- It runs and holds about 150 tested functions.
- A rewrite would delay every feature.
- Nothing in the catalogue needs another runtime.

ONNX Runtime is already present for PP-OCR, so a local embedding model can use it without a new native dependency.

## 2. Layers

```
User interface        Home · Matters · Research · Knowledge · Court Intelligence · Review Inbox
                      Calendar · Workflows & Skills · Memory · Settings · matter tabs · chat everywhere
Agent harness         Pi sessions · planner · skill runner · tool scopes · approvals · checkpoints
Intelligence services Jurisdiction · Local intelligence · Context assembly · Memory · Research
                      Document · Evidence · Drafting · Verification · Filing · Monitoring · Automation
Canonical stores      matter.db (per matter) · blobs · corpus.db · intel.db · advocate.db · skills/
Derived indexes       FTS5 · vectors · graph edges · analytics views   (rebuildable, own nothing)
```

## 3. One owner for each kind of information

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

## 4. The three graphs

All three are SQLite edge tables: `(from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at)`. A recursive query walks them. The rebuild reads the canonical stores. No graph database is needed at this scale. A spike measures the corpus graph first.

| Graph | Nodes | Edges (examples) |
|---|---|---|
| Legal knowledge | court, bench, act, section, rule, notification, amendment, judgment, paragraph, proposition, test, remedy | cites, follows, distinguishes, overrules, refers to a larger bench, interprets, amended by, in force from, applies in, binds in |
| Matter evidence | party, event, document, page, line, exhibit, witness, statement, fact, allegation, issue, argument, relief, draft paragraph | supports, contradicts, admits, denies, depends on, relies on, attacks, derived from, proves element |
| Advocate memory | advocate, court, practice area, preference, skill, precedent, workflow, decision, lesson | prefers, rejected, approved, supersedes, used in, succeeded when, failed because |

Cross-graph links use stable ids only. A matter never links to another client's matter by similarity.

## 5. Context assembly

Each skill and each chat turn gets a context package. The pipeline:

1. **Classify the task:** skill, practice pack, court, proceeding, deliverable.
2. **Retrieve** from the sources the skill declares: matter records, anchored passages, issues, statutes in force on the governing date, judgments, court rules, procedural history, decisions, drafts, approved precedents, client instructions, preferences, earlier task results, recent developments.
3. **Rank by policy, by question type.** To decide what the law is: binding authority first, by hierarchy and date. To decide what happened: primary documents first, then admissions, then party statements. To decide what the client wants: dated instructions. Each item carries relevance, authority, temporal validity, jurisdiction, verification status, confidentiality, recency, provenance and conflict status.
4. **Filter and fit:** remove duplicates, select chunks, compress with the anchors kept, keep both sides of a conflict, and keep within the token budget.
5. **Record:** the package id, the skill version, the ids included, the ids excluded with the reason, and the token count. This goes into `matter.db`.

A summary never replaces a source. It carries the anchors it summarises.

## 6. Memory

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

## 7. The harness

- **Sessions.** One Pi session per matter for chat. One session per skill run, with that skill's tool scope. Several runs can go in parallel inside the main process.
- **Roles.** Intake, jurisdiction, research, evidence, chronology, drafting, review, strategy, filing, hearing, monitoring and memory. Each role is a set of skills and a tool scope, not a separate authority. A reviewer role never approves its own run. A critic can use a different model family.
- **Controls.** The planner breaks a request into skill runs and shows the plan before it starts long work. The harness also provides checkpoints (Pi session files), retry with limits, timeouts, Stop, budget, an evaluator gate (at most two rewrites), and approvals as AG-UI interrupts that a bridge function answers.
- **Pi extensions.** Each non-confidential session loads the advocate's enabled Pi extensions, Pi skills, prompt templates and context files from the application's Pi folder, and MCP, codemode and tool search. Pi's built-in file and shell tools stay off. The policy is in [harness-hardening.md](harness-hardening.md) section 3.
- **Policy.** Each skill names its permitted tools. The policy module enforces the list. Human-only actions stay outside the agent. Confidential matters use local models only.

## 8. Local intelligence

- **Per court:** a pack in `intel.db`. Every row has `source_url, owner, retrieved_at, checked_by, valid_from, valid_until, access_method, reliability`.
- **Access methods:** an official feed or download; the advocate's own session in the visible browser; or a manual upload. Never CAPTCHA solving. Never bulk harvesting against a site's terms.
- **Freshness rule:** a row past its check interval shows as "stale since <date>". A check that depends on a stale row shows "unconfirmed". It never shows "passed".
- **First release:** the directory of all courts and tribunals (names, seats, benches, portals) ships with the application, so onboarding works offline. The detailed rule packs ship for the Phase 1 courts and grow by phase.

## 9. Court adapters

An adapter is a module per court or portal. It declares what it can do: case status, orders and judgments, cause list, e-filing preparation, defect list, certified copies. It also declares how it gets the data. Each capability returns data with its source and its time. Adapters never submit a filing. Submission stays the two-confirmation flow the code has now.

## 10. Languages

English first. Hindi OCR and display come in Phase 2 (Tesseract has Hindi data). Other regional languages come in Phase 4, through OCR data for each language and translation of each line. A translation is a reading of a line, kept beside the original. It is never the source.

---
