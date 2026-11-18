# RAG-1 readiness: build phases, specs and the next module

Date: 2026-11-18. Status: assessment for owner decision. It does not change an accepted decision. Only the owner accepts a decision.

Question: should RAG-1 (law data and verification) be implemented now, or deferred?

Evidence: [the Phase 5 spec](../../docs/specs/law-research-authority.md), [the phased RAG report](2026-11-18-rag-integration-phases.md), [the decision register](../decisions/2026-11-16-phase-5-rag.md), [the build plan](../../docs/build-plan.md), [the feature catalogue](../../docs/features.md), and the code at `9d32bb3`.

## 1. Recommendation

**Implement RAG-1 now as the next Phase 5 module. Do not defer it to a later product phase. Do not start the ingestion run until four owner answers and a RAG-1 module spec are in place. Do not start RAG-2 until the judgment corpus has a named owner.**

The reasons:

1. **RAG-1 is the critical path.** Phase 5 cannot exit without law data. RAG-2 cannot be tested without law to retrieve. RAG-0 is a contract and a set of empty adapters until real provisions are loaded.
2. **The current RAG-1 bullet list is not a module spec.** It names the 28-instrument wave, rules PDFs, chapter maps, Akoma Ntoso export, verification at use and source manifests. It does not define the ingestion surface, the `corpus.db` owner, the production switch, the health view, the tests or the owner's real task. The build plan requires a spec at that depth when the work starts.
3. **The four data decisions are not answered.** The 28-instrument list, the first court-rule order, OCR fallback for repealed codes and `undetermined` when earlier text is missing all change what is stored. Loading before them risks wrong currentness and rework.
4. **The judgment corpus has no owner in the phased plan.** RAG-1 is statutes and rules only. E1, E2 and G1 (judgment paragraphs, the corpus beyond the Supreme Court, and the legal graph) are Phase 5 features with no named RAG phase. The Phase 5 exit needs adverse authority, which needs judgment paragraphs. RAG-1 as written cannot reach the exit, and RAG-2 cannot either.
5. **Deferring RAG-1 does not remove the work; it grows the gap.** The production research path still reads India Code live and copies provisions into `matter.db`. The new `corpus.db` path is not used. Every session that adds research features on the old path makes the switch harder.

The four owner answers are the same questions already listed in the decision register: the 28-instrument list, the first court-rule order, OCR fallback for the repealed codes, and `undetermined` when earlier text is missing. The defaults exist; the owner can accept them, edit them or reject them.

## 2. Where the build stands

| Item | State on 2026-11-18 |
|---|---|
| `HEAD` | `9d32bb3`, pushed to `origin/main` |
| RAG-0 | Implemented, tested and on `main` |
| Type check | exit 0 |
| Unit suite | 256 tests: 253 passed, 0 failed, 3 skipped |
| Phase 1-4 code | Largely built; the exits are not formally accepted (the 18 November brief; the Phase 4 record says its owner exit was not run) |
| Phase 5 corpus-backed path | Library only; not wired into the main process |
| Production research path | The legacy V4/V5 Studio: judgment metadata search, PDF reading, live India Code, copies saved in `matter.db` |

Two facts decide the assessment:

- `new LawStore(...)` appears only in tests. The main process never opens the law store.
- `createSkeletonKnowledge(...)` has no main-process import. `search_knowledge` is not an agent tool.

The production `ResearchHub` (`src/main/studio.ts`) opens `<userData>/corpus/corpus.db` through `Corpus` (`src/lib/research-sources/corpus.ts`). That file holds judgment metadata (`judgment`, `judgment_fts`, `indexed_part`, `judgment_file`), not `LawStore` tables. The law store expects `statute_act`, `statute_provision`, `judgment_identity`, `judgment_para`, `legal_edge` and `vector` in a file with the same name. The two can share one file, but no code does that today.

## 3. Phase 5 features: built, partial and missing

Status is about code in the repository, not the feature's importance.

| Feature | Status | Evidence |
|---|---|---|
| RAG-0 contract and skeleton | Built, on `main` | `src/shared/law.ts`, `src/lib/knowledge/*`, `tests/unit/rag-skeleton.test.ts` |
| D2 governing-date selection | Library only | `LawStore.inForce`, `src/lib/statutes/inforce.ts`; no main-process caller |
| E1 judgment records with paragraphs | Partial | `LawStore.putJudgment` and paragraph FTS exist; production `Corpus` stores metadata only; no PDF-to-`judgment_para` writer |
| E2 corpus beyond the Supreme Court | Partial | SC and HC metadata from AWS; no tribunals; no paragraph text |
| E3 statutes with versions | Library only | `LawStore.putInstrument`, India Code parser; no production instance or data |
| E4 passage roles | Schema only | `judgment_para.role`; no role extraction or confirmation flow |
| E5 binding-effect check | Partial, legacy | `quickCheck`, `overrulingCheck`, `assessAuthority`; no binding evaluator over `AuthorityFacts` |
| E6 conflicts | Not built | `LegalConflict` type only |
| E7 propositions | Partial, legacy | `proposition` is a text field on a matter authority; no proposition table or passages |
| G1 legal graph | Library only | `LawStore.putEdges`/`edges`/`walk`, `edgesOf`; no production paragraph ingestion |
| G4 graph questions | Partial | `walk` and the graph retriever; no question tools or views |
| G6 vector index | Library only | `VectorIndex`, `LawStore.putVector`; no embedder in production |
| G7 hybrid retrieval | Library only | `runRetrieval`, RRF, policy; not exposed |
| G8 rebuild and index health | Partial | `LawStore.rebuild`/`counts`, `AdapterHealth`; no Index Health view |
| H11 Evidence Vault | Not built | `VaultAnswer` type only |
| J1 search modes | Partial | `SEARCH_MODES` and `parseQuery`; production tools are the legacy ones |
| J2 research plan | Not built | `ResearchPlan` type only; the agent plan is a different plan |
| J3 analysis | Not built | `AuthorityAnalysis` type only |
| J4 adverse search | Partial, manual | The advocate records an adverse review; no search that finds adverse authority |
| J5 deliverables | Not built | `DeliverableKind` type only |
| J6 research history | Partial | `researchLog` lists matter events; no law-only history view |

The Phase 5 phase therefore has two architectures at once:

- the **legacy Studio path** that works today on judgment metadata, PDFs, live India Code and matter copies;
- the **new corpus-backed path** with the contract and the law store, but no data and no wiring.

RAG-1 must choose and document the switch. Loading 28 Acts into a store that no screen or tool opens would repeat lesson L2: a stand-in counted as done.

## 4. What RAG-1 covers, and what it does not

The spec's RAG-1 row covers:

- the 28-instrument first wave, including the repealed codes;
- rules PDFs;
- chapter maps;
- Akoma Ntoso export;
- verification at use;
- source manifests.

It does **not** cover:

- judgment paragraph ingestion (E1, E2);
- treatment edges from judgment text (G1);
- passage roles (E4);
- binding effect and conflicts (E5, E6);
- propositions (E7);
- the Evidence Vault (H11);
- the research plan, analysis, adverse search and deliverables (J2-J6);
- the `search_knowledge` tool and the research views.

The Phase 5 exit needs several of these. The phased plan assigns J2-J6 to RAG-2, but no phase owns judgment paragraph ingestion or the legal graph. That is the most important gap in the phased plan.

| Phase 5 exit requirement | Owning work | State |
|---|---|---|
| The applicable statute, rule or judgment paragraph | RAG-1 for statutes and rules; no owner for judgments | Split |
| The version in force on the governing date | RAG-1 and D2 | Not built in production |
| The exact quote, with a stable citation and anchor | RAG-0 quote gate; RAG-2 selection | Gate built; no corpus |
| Later treatment and adverse authority | E1, E2, G1, E5, J4 | No owning phase for the corpus |
| A statement of what was searched and what was not | RAG-0 coverage; RAG-1 manifests; RAG-2 | Skeleton built; data missing |
| A research memorandum the advocate reviews | RAG-2, J2-J5 | Not built |

## 5. Owner decisions that block the ingestion run

| Decision | Why it changes the data | Default until answered | Register |
|---|---|---|---|
| The 28-instrument first wave | The count, the Acts, the current and repealed pairs | The 28 in the 18 November brief; BNS, BNSS, BSA, IPC, CrPC and the Evidence Act included | Related question 1 |
| The first court-rule order | Which rules PDFs are parsed, and which court/date filters are built | Supreme Court Rules, 2013; Delhi High Court Original Side Rules, 2018; Delhi district courts | Related question 5 |
| OCR fallback for the repealed codes | Whether the repealed text is a PDF page image, OCR text, or both; how a quote is confirmed | OCR text with the page image and the advocate's confirmation | Related question 6 |
| `undetermined` when earlier text is missing | Whether a missing earlier version is stored as `undetermined` or omitted | `undetermined` | Related question 7 |

Two further decisions affect RAG-1's design but are not data blockers: the decision register is proposed, not accepted (RAG-3 provision rows, RAG-5 citation key, RAG-6 chapter maps, RAG-11 verify at use, RAG-23 FTS5 external content), and RAG-33 says RAG-1 to RAG-5 are deferred. Starting RAG-1 changes RAG-33; only the owner can accept that change.

The accepted decisions in [docs/decisions.md](../../docs/decisions.md) already cover the store and verification principles: decision 12 (`corpus.db` owns public law), decision 13 (derived indexes own nothing) and decision 16 (rules are dated; a stale-dependent check is unconfirmed). RAG-1 can proceed under those accepted decisions if the owner treats the RAG register rows as implementation choices, but the register should say so.

There is a naming collision to fix in the documents: **RAG-1 is both a decision id** ("SQLite canonical; no server, no Docker") **and a phase name** ("Law data and verification"). The spec and the register use the same label for both. The assessment uses "RAG-1" for the phase and "decision RAG-1" for the SQLite decision.

## 6. Risks of starting now, and of deferring

If RAG-1 starts before the answers:

- A wrong or incomplete instrument list is loaded. Re-loading is possible because law is versioned, but the source manifest, chapter maps and tests are reworked.
- A repealed code is stored without its earlier version. The currentness check then says `verified` for a text that was not in force, or `undetermined` incorrectly.
- The ingestion pipeline is built against the wrong court-rule set.
- The store is populated but not wired, so no tool or view can use it.

If RAG-1 is deferred:

- Phase 5 cannot exit. RAG-2 has no corpus to research.
- The product keeps the live India Code path: no stable version on a governing date, no paragraph anchors, no treatment graph, no coverage statement.
- The new contract and the production path diverge further.
- RAG-0 remains a tested library with no data.

Neither risk is removed by starting RAG-2 first. RAG-2 without RAG-1 is a workflow over an empty corpus.

## 7. Recommended sequence

1. **Owner answers the four data questions** and accepts the change to RAG-33 (start RAG-1 now). If the owner wants RAG-1 deferred, record that and do not start RAG-2.
2. **Write the RAG-1 module spec.** It must cover:
   - the `corpus.db` owner and how it shares the file with the existing `Corpus`;
   - the ingestion commands and the source manifest with PDF and text hashes;
   - the confirmed instrument list and the repealed/current pairs;
   - the court-rule order and the PDF-to-lines path;
   - chapter maps and the `unmapped` state;
   - Akoma Ntoso export;
   - verification at use and the `changed`/`unreachable` paths;
   - the health view and the tests;
   - the owner's real acceptance task.
3. **Name the judgment corpus owner.** Either extend RAG-1 with judgment paragraph ingestion (E1, E2) and treatment edges (G1), or write a separate RAG-1b spec. Do not leave it unassigned.
4. **Build the list-independent spine first:** store wiring, manifest, ingestion and verification, health. Then load statutes, rules, repealed codes and chapter maps.
5. **Run the RAG-1 acceptance task:** the owner checks a real matter's provisions against the official source, including one amended or repealed provision, and confirms the version in force, the exact anchor and the visible changed/unreachable state.
6. **Only then start RAG-2** (plan, quote-first, adverse search, memorandum, review) once the judgment corpus is populated and searchable.

RAG-3, RAG-4 and RAG-5 stay deferred. Vectors, partitions, firm/advocate/session scopes, annotations, the append-only migration and the review surface do not belong in RAG-1.

## 8. What counts as RAG-1 done

From the phased report: **counts reconcile to the source; hashes and anchors are stable; changed and unreachable sources are visible.** The acceptance task should be a real matter's provisions, including one amended or repealed provision, checked against the official source, with the version in force on the governing date and the exact anchor confirmed.

RAG-1 is **not** the Phase 5 exit. The exit remains a real research memorandum with adverse authority, binding effect, the governing-date law and coverage.

## 9. Mismatches between documents and code, reported

1. The spec says the agent sees one tool, `search_knowledge`. The agent has `search_judgments`, `read_judgment`, `search_statutes`, `read_statute_section`, `web_search`, `web_fetch`, `save_judgment` and `save_provision`. There is no `search_knowledge`.
2. The spec says `corpus.db` owns statutes and judgments. The production `ResearchHub` uses `corpus.db` for judgment metadata and saves provisions and authorities in `matter.db`. `LawStore` is never opened in the main process.
3. The spec says the research adapter reads judgment paragraph FTS. The production corpus indexes judgment metadata, not paragraphs; the PDF is read when opened.
4. The RAG-1 bullet list omits judgment paragraph ingestion, but the Phase 5 exit needs it. No RAG phase owns E1, E2 or G1.
5. The decision register is proposed. RAG-33 says RAG-1 to RAG-5 are deferred; this assessment recommends changing that for RAG-1 only.
6. The decision id RAG-1 and the phase name RAG-1 are the same label for different things.
7. The Phase 4 record says its owner exit (a real brief of more than 1,000 pages) was not run. RAG-1's rules-PDF and repealed-code OCR work inherits that unproven path.

## 10. Evidence

| Check | Result |
|---|---|
| `git log --oneline -1` | `9d32bb3 RAG-0 tests: contract, scope, bounds, quote, citation and health` |
| `git status -sb` | `## main...origin/main` |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 256 tests: 253 passed, 0 failed, 3 skipped |
| `npm run session:start -- --unit` | exit 0 |
| `new LawStore` outside tests | none |
| `createSkeletonKnowledge` outside its module and tests | none |
| `search_knowledge` in the agent tools | none |

Files read for this assessment: `docs/build-plan.md`, `docs/features.md`, `docs/decisions.md`, `docs/questions.md`, `docs/specs/README.md`, `docs/specs/law-research-authority.md`, `.agents/decisions/2026-11-16-phase-5-rag.md`, `.agents/logs/2026-11-18-rag-integration-phases.md`, `.agents/logs/2026-11-16-phase-5-rag-assessment.md`, `src/main/studio.ts`, `src/main/agent.ts`, `src/main/index.ts`, `src/lib/research-sources/corpus.ts`, `src/lib/law-store/index.ts`, `src/lib/knowledge/*`, `src/lib/matter-store/studio.ts`, `src/lib/matter-store/work.ts`, `src/lib/matter-store/authority2.ts`.
