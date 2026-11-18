# RAG integration in phases: consolidated report

Date: 2026-11-18. Status: consolidated recommendation for owner review. It does not change an accepted decision. Only the owner accepts a decision.

This report combines the earlier Phase 5 assessment, the earlier integration design, the decision register, the 18 November consolidated brief supplied by the owner, the scale measurements from 18 November, and the owner's instruction of 18 November: **TypeScript only, no Rust Kernel**.

It is report and integration specification first. No RAG code is committed in this step. The TypeScript skeleton draft was prepared, set aside under the git stash `wip: rag skeleton draft (report-first, TS only)`, and will be applied only after the owner accepts the scope.

Owner files:

- Phase 5 spec: [../../docs/specs/law-research-authority.md](../../docs/specs/law-research-authority.md)
- Decision register: [../decisions/2026-11-16-phase-5-rag.md](../decisions/2026-11-16-phase-5-rag.md)
- Prior assessment: [2026-11-16-phase-5-rag-assessment.md](2026-11-16-phase-5-rag-assessment.md)
- Prior integration design: [2026-11-16-phase-5-rag-integration.md](2026-11-16-phase-5-rag-integration.md)
- Earlier survey: [../memory-rag-assessment.md](../memory-rag-assessment.md)

---

## 1. Decision in one page

**ADOPT WITH LIMITATIONS.**

1. **Build RAG-0 now: the TypeScript contract and skeleton.** One registry, one scope guard, one bounded retrieval run, coverage, health, the statute/procedure/research/matter adapters, the quote verifier and the deferred placeholders. Tests prove the contract, not the Phase 5 exit.
2. **RAG-1 to RAG-5 are deferred.** Law data, research workflow, firm/advocate/session scopes, scale partitions/vectors, and review/sharing/evaluation belong to their owning product phases or to a measured need.
3. **TypeScript only. No Rust Kernel.** The current repository is Electron/TypeScript (decision 1). The 18 November brief's Rust direction is rejected for this work by the owner's instruction. Do not build a parallel Rust runtime.
4. **SQLite remains canonical.** No database server, no Docker, no vector server, no graph server, no RAG platform.
5. **Exact lookup + FTS5 + graph + filters is the default.** Vectors are optional and benchmark-gated.
6. **Quote-first is the research gate.** Retrieve, select exact quotes, verify them deterministically, reason only over verified quotes, verify citations, then review.
7. **Coverage is mandatory.** A deferred scope, a failed adapter, a partial partition search or an unreachable source is stated. It is never hidden.
8. **The Phase 5 exit is a real research memorandum the owner completes.** RAG-0 is not the exit. A green suite is not the exit.

The problem is real. Existing matter search and judgment metadata search do not provide paragraph-level legal research, precedent treatment, temporal validity, adverse-authority coverage or exact quote verification. The proposed direction is right. The risk is scope: building the full RAG now, or building a query agent before the contract. Both are avoided by RAG-0.

---

## 2. What changed since 16 November

| Source | Change | Effect on this report |
|---|---|---|
| 18 November consolidated brief | Added separate verification dimensions, authority facts instead of a numeric score, bounded concurrency/coverage corrections, ontology deferral, one-harness rule, RAG-24 to RAG-26 | Incorporated. The numeric-authority and single-verification fields in the earlier design are now legacy compatibility fields, not the decision. |
| Owner instruction, 18 November | TypeScript only. No Rust Kernel. Report and integration first. | RAG-26 is the owner's instruction. The brief's Rust correction is rejected. No Rust code, no porting plan. |
| Scale measurements, 18 November | FTS5 at 100k and 1M paragraphs; local embedding throughput; SQL filter behaviour | Added to RAG-4. RAG-0 does not partition; it carries the extension points and the coverage rule. |
| Earlier reports | The 28-instrument first wave (including BNS, BNSS, BSA and the repealed codes), the seven adapters, quote-first, the append-only mismatch, the Plannotator pattern | Kept, reconciled, and linked. |
| Skeleton draft | TypeScript contract, registry, scope guard, bounded run, coverage, quote verifier, 8 tests | Drafted and stashed. Not committed. Report first. |

### 2.1 The TypeScript/Rust conflict is closed

The 18 November brief says the application has moved to a Rust Kernel and that TypeScript snippets are only contract examples. That conflicts with the repository in front of the agent:

- `package.json` is Electron/TypeScript; `main` is TypeScript; the accepted decision 1 is Electron/TypeScript.
- `AGENTS.md` says: when an instruction file and the code disagree, follow the code and report the mismatch.
- The owner has now said: **NO RUST KERNEL. ONLY TS.**

Therefore:

- RAG-26 is **TypeScript only**. The TypeScript contract is the implementation target.
- The brief's Rust correction is not followed.
- No Rust module, port, binding or parallel runtime is created.
- If a separate Rust repository exists, it is out of scope for this work. It does not change this report or the Phase 5 spec.

---

## 3. Reconciled architecture

### 3.1 Stores and owners

| Store or resource | Canonical owner | Holds | Must not hold |
|---|---|---|---|
| `corpus.db` | Public legal corpus | Acts, provisions, rules text, judgments, paragraphs, citations, propositions, legal edges, law notes, source checks | Client matter facts |
| `intel.db` | Court and jurisdiction intelligence | Court directory, source packs, applicability, local procedure, court requirements | Duplicate rule text owned by `corpus.db` |
| `matter.db` | One matter | Documents, anchored passages, facts, evidence links, issues, chronology, plans, drafts, annotations, approvals, audit events | Another matter's facts |
| `advocate.db` | Advocate, chamber and firm knowledge | Profile, preferences, firm library, approved know-how, basic matter pointers, firm/advocate memory, firm agent log | Client facts or matter evidence |
| Session JSONL | One agent session | Append-only user/agent/tool/run events and compaction | Authoritative facts or legal propositions |

There is no separate `firm.db`. `firm` and `advocate` are separate retrieval scopes and policies over `advocate.db`.

### 3.2 Seven scopes, one tool

1. `statute`
2. `procedure`
3. `research`
4. `matter`
5. `firm`
6. `advocate`
7. `session`

The agent sees one tool, `search_knowledge`. The main process builds one registry per session and passes narrow read ports. The renderer never opens a store.

### 3.3 Three graphs, not one

| Graph | Nodes and edges | Answers | Never used for |
|---|---|---|---|
| Legal | judgment, paragraph, citation, provision, proposition; cites, follows, distinguishes, overrules, doubts, refers to a larger bench, affirms, reverses, modifies, per incuriam, interprets, amends, repeals, in force from | What binds me; later treatment; which paragraph states it | Matter facts; a model's summary of a holding |
| Matter evidence | party, event, document, page, exhibit, witness, statement, fact, allegation, issue, argument, relief, draft paragraph; supports, contradicts, admits, denies, depends on, relies on, attacks, derived from, proves element | What happened; what supports or contradicts an issue | Law; another matter |
| Advocate memory | advocate, court, practice area, preference, skill, precedent, workflow, decision, lesson; prefers, rejected, approved, supersedes, used in, succeeded when, failed because | How this advocate works; what was rejected before | Case facts; a substitute for the matter record |

The graphs share edge mechanics. They do not share authority. A legal edge cannot confirm a fact. A fact cannot become firm precedent. A memory item cannot change the law.

For Phase 5, the graph is a SQLite edge table with bounded recursive queries. No graph database is a source of truth. A derived graph index is considered only after a measured failure.

### 3.4 Ontology is deferred

Use stable IDs, typed relationships, controlled relation names, source-backed edges and proposed/confirmed status now. Do not build a formal legal ontology. Do not let a model-generated ontology become authority. A future ontology adapter may map concepts without changing the source records.

---

## 4. The contract

The full TypeScript contract is in the Phase 5 spec, section 2. The shape:

- `KnowledgeScope`: seven scopes.
- `CitationKey`: instrument, kind, number, chapter, part, order, sub, clause, proviso, version. `citationKeyId` and `citationKeyText`.
- `KnowledgeHit`: exact text, anchor, scope, citation, authority facts, verification checks, retrieval methods.
- `SourcePassage`: exact text with offsets, page/line, source ref, URL, check state.
- `VerificationCheck`: one dimension per check, never one flag for everything.
- `AuthorityFacts`: court, jurisdiction, bench, date, territory, role, treatment.
- `Coverage`: searched, deferred, failed, partial.
- `AdapterHealth`: ready, empty, deferred, off, error.
- `QuoteCheck`: quote, hash, offsets, verified, detail.

Two compatibility fields remain in `KnowledgeHit` during the skeleton: `authority: number` and `verification: string`. They are legacy. New code uses `authorityFacts` and `checks`. The skeleton must not make a binding decision from the legacy number.

A summary never replaces a source passage. A hit without a source and an anchor is invalid.

---

## 5. Verification and authority

### 5.1 Seven dimensions

| Dimension | Proves | Does not prove |
|---|---|---|
| Source | The same official source or file was used | That the source is the latest law |
| Text | The extracted text still matches the stored hash | That the extraction is correct |
| Currentness | The version is the one in force on the governing date | That the version was found if the earlier text is missing |
| Citation | The provision, judgment and paragraph exist | That the citation supports the proposition |
| Quote | The exact quote is present at the anchor | That the quote is the holding |
| Support | The passage supports the proposition, with qualifications | That the advocate will accept it |
| Treatment | The decision is still good law for this proposition and date | That the search found every adverse authority |

A matching PDF hash proves the local file has not changed. It does not prove the PDF is the latest law. `unreachable` is unconfirmed. `changed` is a new version, not an overwrite. `never` is not verification.

### 5.2 Authority is not a score

Store the facts: court, court name, jurisdiction, territory, bench strength, decision date, role (ratio, obiter, submission, dissent, concurrence), treatment. Compute the binding/persuasive label for the question's jurisdiction and date. If a fact is missing, `undetermined`.

Relevance still matters. A higher court on a different issue must not automatically outrank a directly relevant authority. Adverse authority must not be buried by one aggregate score.

### 5.3 Coverage is a feature

Every retrieval result and every memorandum states:

- which scopes were searched;
- which court/year partitions were searched;
- which source sets were included;
- which scopes or partitions were not searched, and why;
- whether a source was stale, changed or unreachable;
- whether the corpus is incomplete for the period or court.

A bounded search is allowed only when it says it is partial. Absence of a result is not proof that no adverse authority exists.

---

## 6. The phase plan

Only RAG-0 is in this step. RAG-1 and RAG-2 are Phase 5 product work that consume the skeleton. RAG-3 to RAG-5 wait for their owning phases or a measured need.

| Phase | Name | When | Deliverable | Exit | Status |
|---|---|---|---|---|---|
| RAG-0 | Contract and skeleton | Now, Phase 5 | TS contract, registry, scope guard, bounded retrieval, coverage, health, statute/procedure/research/matter adapters, quote verifier, deferred placeholders, tests | Contract tests, scope test, timeout test, quote test, typecheck | **In this step** |
| RAG-1 | Law data and verification | Phase 5 | The 28-instrument first wave, including repealed codes; rules PDFs, chapter maps, Akoma Ntoso export, verification at use, source manifests | Counts reconcile to source; hashes and anchors stable; changed/unreachable visible | Deferred to Phase 5 module work |
| RAG-2 | Research and quote-first | Phase 5/6 | Plan, retrieve, quote, verify, reason, adverse search, memo, review | One real memo with adverse authority and temporal correctness | Deferred to Phase 5/6 module work |
| RAG-3 | Firm, advocate, session | Phase 10/12 | Firm library, advocate memory, firm agent log, session adapter, annotations, append-only migration | Memory round trip; append-only tests; annotation re-anchor | Deferred |
| RAG-4 | Scale | After Phase 5, when measured | Court/year partitions, partition catalog, external-content FTS, multi-opinion paragraphs, optional vectors/ANN | p95 < 150 ms on the target corpus; coverage line | Deferred |
| RAG-5 | Review, sharing, evaluation | Phase 6/12/13 | Plannotator-style review, chamber sharing, golden set, benchmark, hardening | Advocate acceptance; benchmark; no cross-matter leak | Deferred |

### 6.1 RAG-0: what it is

RAG-0 is the integration skeleton. It is deliberately small.

**In scope:**

- The TypeScript contract and pure functions: citation key, verification dimensions, coverage, health.
- `KnowledgeRegistry`: one adapter per scope; duplicate scope is an error.
- `runRetrieval`: parse, scope check, bounded concurrency, per-adapter timeout, RRF, policy, finish hooks, coverage.
- `createSkeletonKnowledge`: real statute, procedure and research adapters over the existing `LawStore`; a bound matter adapter when a matter port is supplied; deferred firm, advocate and session.
- `boundMatterAdapter`: refuses another matter before it calls the port.
- `deferredAdapter`: says why, returns no fake rows.
- `withHealth`: adapter health for the Index Health view.
- `verifyQuote` and `locateQuote`: whitespace tolerance, 12-character minimum, quote hash, offsets.
- Tests for the contract, scope guard, timeout, coverage, citation key, quote and health.

**Out of scope:**

- Ingestion of India Code, repealed codes, rules PDFs or judgments.
- Schema migrations beyond the current `LawStore`.
- Vectors, embeddings, ANN.
- Court/year partitions and large datasets.
- Firm, advocate and session stores.
- Append-only migration of `matter.db`; session segments.
- Plannotator-style annotation UI; plan review; memo editing.
- Akoma Ntoso import/export; static set packages.
- The full research skill (plan, reason, adverse, memo).
- The Phase 5 exit.

**What it proves:**

- One hit shape across four real scopes.
- A matter adapter cannot see another matter.
- A slow adapter does not block the others.
- A deferred scope is visible, not hidden.
- A quote is located or marked unverified.
- The contract compiles in the current TypeScript repository.

**What it does not prove:**

- That the law is loaded correctly.
- That retrieval quality is good.
- That the quotes are legally sufficient.
- That the adverse authority was found.
- That the memorandum is acceptable.
- That the corpus coverage is complete.

Those are RAG-1, RAG-2 and the Phase 5 exit.

### 6.2 RAG-1: law data and verification

This is the Phase 5 law module, not part of the skeleton.

- The 28-instrument first wave in the brief already includes the Constitution, BNS, BNSS, BSA, IPC, CrPC and the Evidence Act. Load current and repealed versions as separate dated instruments. Do not treat the new criminal codes as a simple replacement for every historical question.
- Chapter maps from the Act PDF's arrangement or index; `unmapped` when not settled.
- Court rules: Supreme Court Rules, 2013; Delhi High Court Original Side Rules, 2018; Delhi district-court packs by court, case type and date.
- Akoma Ntoso 3.0 as export and exchange, not the primary store.
- Verification at use: re-read, normalize, hash, compare; `verified`, `changed`, `unreachable`.
- Static set manifest with PDF and text hashes.
- Source images beside OCR text; advocate confirmation for a critical quote.
- Tests: counts reconcile; hashes stable; changed/unreachable paths; chapter map; part events.

RAG-1 can start after RAG-0 is accepted. It does not need RAG-3 to RAG-5.

### 6.3 RAG-2: research and quote-first

This is the Phase 5/6 research module.

- Plan with 3-8 sub-questions, scopes, court and governing date; advocate approval before a long run.
- Retrieve candidates with stable references.
- Quote selection only from returned candidates.
- Deterministic quote location with offsets and hash.
- Reason only over verified quotes and citation keys.
- Citation and treatment checks.
- Adverse search for every material issue.
- Memorandum with coverage, adverse authority and open questions.
- Advocate review, annotation, accept or reject.

RAG-2 can start after RAG-1 has enough law to answer a real question.

### 6.4 RAG-3: firm, advocate and session

Deferred to Phase 10/12.

- `advocate.db` as the firm and advocate owner.
- Firm library and approved know-how; no client facts.
- Advocate memory with lifecycle and a small always-on block.
- Firm agent log, append-only.
- Session adapter as audit only.
- Annotations: law in `corpus.db`, matter in `matter.db`, firm in `advocate.db`, session delivery in JSONL.
- Append-only migration of `matter.db` with a staged, backed-up plan.
- Plannotator interaction pattern: comment, replace, delete, insert, global note, threads, one structured message.

### 6.5 RAG-4: scale

Deferred until measured.

- Court/year partitions with a catalog and coverage line.
- FTS5 external content; indexed metadata; `detail=full`; optimize after bulk loads.
- Safe partition names from an allowlist.
- Multi-opinion paragraph namespaces.
- Vectors optional and benchmark-gated; model-aware identity; text hash invalidation.
- Optional usearch or LanceDB only past the measured threshold.
- No vector server; no graph database.

### 6.6 RAG-5: review, sharing and evaluation

Deferred to Phase 6/12/13.

- Native review surface on the Plannotator pattern.
- Chamber sharing by package, not a SQLite file on a network share.
- Golden set of real, anonymised research questions.
- Recall@10/50, citation accuracy, quote match, proposition support, adverse-authority recall, temporal accuracy, matter isolation, p95 latency.
- Advocate acceptance as the external proof.

---

## 7. Why this order

1. **Contract first.** A query agent built before the contract will either use grep (no citation keys or versions) or ad-hoc SQL (no scope, no audit). Retrofitting the data model is more expensive than defining it once.
2. **Real scopes first, deferred scopes visible.** Statute, procedure, research and matter are the Phase 5 need. Firm, advocate and session depend on their own stores and phases. The skeleton registers them as deferred, not fake.
3. **Quote gate before reasoning.** The quote verifier is small and deterministic. It prevents the most expensive failure: a plausible but fabricated citation.
4. **Law data before research quality.** The best retrieval cannot fix missing or stale law.
5. **Scale after the golden set.** Partitioning and vectors are expensive. Measure the lexical baseline first. The 1M-row measurement shows why one global table is the wrong shape, but it does not justify building partitions before the corpus exists.
6. **Review after the first memo.** The annotation surface needs a real target and a real revision. Build it when there is a memo to review.

---

## 8. What is intentionally not built now

- No RAG platform.
- No vector server, graph server or Docker.
- No Rust Kernel.
- No second agent framework.
- No formal ontology.
- No firm library, advocate memory or session adapter.
- No annotation UI or Plannotator extension.
- No append-only migration.
- No court/year partitions or vectors.
- No law ingestion or judgment corpus.
- No full research skill.
- No Phase 5 exit claim.

---

## 9. Decisions

The full register is [../decisions/2026-11-16-phase-5-rag.md](../decisions/2026-11-16-phase-5-rag.md). The 33 decisions group as follows.

| Group | Ids | What they settle |
|---|---|---|
| Foundation | RAG-1 to RAG-5 | SQLite canonical; one retrieval function; provision rows; legal chunking; citation keys |
| Retrieval | RAG-6 to RAG-10 | Chapter maps; judgment paragraphs; exact/FTS/graph default; optional vectors; SQLite graphs |
| Verification | RAG-11 to RAG-13 | Verify at use; quote-first; bounded multi-role research |
| Ownership | RAG-14 to RAG-17 | Separate stores; append-only history; versioned law/know-how; native review |
| Scope | RAG-18 to RAG-20 | No platform; build the contract; real memorandum exit |
| Scale | RAG-21 to RAG-23 | Partitions; structure and opinions; FTS5 external content |
| New corrections | RAG-24 to RAG-33 | Ontology deferred; Pi harness; **TypeScript only**; separate verification; authority facts; bounded coverage; read-only agent; safe identifiers; commentary secondary; RAG-0 only now |

RAG-26 is the owner's instruction of 2026-11-18. The others remain proposed until accepted.

---

## 10. Mismatches and corrections

1. **Rust vs TypeScript.** The 18 November brief says Rust. The repository is Electron/TypeScript. The owner says TypeScript only. This report follows the owner and the code. The brief's Rust correction is rejected for this work.
2. **The earlier design used one numeric authority field.** It remains only as a legacy compatibility field. New code uses `authorityFacts` and a binding evaluator. The skeleton must not decide binding from the number.
3. **The earlier design used one `verification` string.** It remains only as a display compatibility field. New code uses the seven checks. A single badge is not enough.
4. **The earlier design's retrieval pseudocode was sequential.** RAG-0 uses bounded concurrency, per-adapter timeouts and per-adapter failure capture.
5. **The earlier design did not require coverage in every result.** RAG-0 makes `coverage` part of the result and labels a partial search.
6. **The earlier report's `matter.db` append-only finding stands.** The current code updates and deletes in several record tables. The migration is RAG-3 and needs owner acceptance.
7. **`src/shared/law.ts` pointed to a missing spec.** The spec now exists at [../../docs/specs/law-research-authority.md](../../docs/specs/law-research-authority.md).
8. **The 18 November brief says Phases 1-4 had no formally accepted exits.** That is a finding in the supplied brief, not a fresh test in this report. The owner must accept the prior exits on real work.
9. **No code is committed in this step.** The TypeScript skeleton draft is stashed. Report and spec first, as instructed.
10. **The 28-instrument list in the brief is a recommendation, not accepted.** The owner must confirm the list and whether the current and repealed criminal codes are separate dated instruments.

---

## 11. Owner questions that block

1. Do you accept RAG-0 as the only RAG integration work now, with RAG-1 to RAG-5 deferred?
2. Do you confirm TypeScript only and no Rust Kernel in the repository?
3. Do you accept the 28-instrument first wave? It already includes BNS, BNSS, BSA, IPC, CrPC and the Evidence Act.
4. Do you accept the append-only migration of `matter.db` with the canonical-record/derived-projection distinction?
5. Do you accept `advocate.db` as the firm knowledge owner, with no client facts?
6. Do you accept the annotation split: law in `corpus.db`, matter in `matter.db`, firm in `advocate.db`?
7. Do you accept the first court-rule order: Supreme Court Rules, 2013; Delhi High Court Original Side Rules, 2018; Delhi district courts by establishment?
8. Do you accept OCR text for the repealed codes, with page image and advocate confirmation?
9. Do you accept `undetermined` when the earlier text or effective date is not in the library?

---

## 12. Recap for someone who saw none of the work

The product needs a legal research layer, not a search product. The layer has one contract, seven read-only scopes, four SQLite stores and one review gate. Statutes and rules are stored by section, not by token. Judgments are stored by paragraph, with one namespace per opinion. Every legal passage has a structured citation key. The default search is exact lookup, full text, graph and filters; vectors are optional. Every source is checked when it is used. Research is quote-first, and a deterministic verifier checks each quote and citation. The court and year coverage is always stated.

The 18 November brief wanted a Rust Kernel. The owner has said TypeScript only. This report follows the owner: the contract and skeleton are TypeScript, and no Rust code is planned.

The RAG work is now split. RAG-0 is the integration skeleton: contract, registry, scope guard, bounded retrieval, coverage, health, four real adapters, a quote verifier and deferred placeholders. RAG-1 is law data and verification. RAG-2 is the research workflow. RAG-3 is firm, advocate, session, annotations and append-only migration. RAG-4 is scale: partitions, opinions, optional vectors. RAG-5 is review, sharing and evaluation. Only RAG-0 is in this step. The rest waits for its owning phase or a measured need.

The Phase 5 exit is still a real research memorandum the owner completes: the right authorities, exact quotes, adverse authority, the law on the governing date, and a statement of coverage. A green test suite is not the exit.

---

## Appendix A: measurements kept from 18 November

The measurements are local, Windows, Node 24, `node:sqlite`, synthetic 90-140-word paragraphs. They are a lower bound for real legal text.

| Rows | Build | DB size | Phrase | OR | SQL filter on `UNINDEXED` |
|---:|---:|---:|---:|---:|---:|
| 100,000 | 3.3 s | 144 MB | 11 ms | 44 ms | not measured |
| 1,000,000 | 41.5 s | 1.44 GB | 118 ms | 464 ms | 1,011 ms |

A 50,000-100,000-row partition returns a phrase query in about 10-20 ms. The target is p95 under 150 ms.

Local embedding with `bge-small-en-v1.5` (384 dimensions, ONNX, CPU): 165-244 paragraphs/s, model load 9.7 s. One million paragraphs take about 1-1.7 hours; ten million take about 12-17 hours. This is a batch job, not a search-time cost.

A flat vector index at 1M paragraphs is about 1.5 GB and 350-430 ms per query. At that size, partition or benchmark a native ANN.

## Appendix B: what proves the design

Not a green test suite. Not a demo. Not an agent-written report. The proof is an advocate completing a difficult, real research task and confirming:

1. the right authorities were found;
2. exact quotes and paragraph anchors are correct;
3. adverse authorities were not hidden;
4. the correct law for the governing date was used;
5. missing coverage and uncertainty were disclosed;
6. matter facts stayed inside the correct matter;
7. the memorandum is usable after advocate review.
