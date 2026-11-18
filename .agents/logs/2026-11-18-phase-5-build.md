# Phase 5 build: ten-instrument law library, Studio research and quote-first memorandum

Date: 2026-11-18. Owner instruction: implement Phase 5 with the RAG components and rules; reduce the 28 Acts to 10; the Studio is the research workspace; some provisions and authorities may remain only in the Studio because they are specific to a case.

## Owner decisions applied

- **Ten instruments:** the Constitution of India; Bharatiya Nyaya Sanhita, 2023; Bharatiya Nagarik Suraksha Sanhita, 2023; Bharatiya Sakshya Adhiniyam, 2023; Indian Penal Code, 1860; Code of Criminal Procedure, 1973; Indian Evidence Act, 1872; Code of Civil Procedure, 1908; General Clauses Act, 1897; Limitation Act, 1963.
- **The Studio is the research workspace.** The shared law library is in `corpus.db`. A provision or authority saved to a matter stays in `matter.db` as a case-specific copy. The shared row remains the source.
- **The repealed codes are separate dated instruments.** IPC, CrPC and the Evidence Act are loaded as repealed; BNS, BNSS and BSA are loaded as the current codes.
- **OCR is accepted for the repealed codes, with page and line anchors.** The CrPC is partial and says so; section 482 is recovered.

## What was built

| Area | Code |
|---|---|
| Ten-instrument list | `src/lib/statutes/first-wave.ts` |
| PDF/text body parser, page and line anchors, OCR repair | `src/lib/statutes/act-text.ts` |
| India Code PDF/TEXT bundles, CPC orders and rules, source hashes | `src/lib/statutes/indiacode.ts` |
| Import, manifest, verification at use, Akoma Ntoso export | `src/lib/law-import/index.ts` |
| `source_file`, `source_key`, stable set manifest | `src/lib/law-store/index.ts` |
| Production knowledge registry with verification and the CPC in procedure | `src/lib/knowledge/skeleton.ts`, `adapters.ts` |
| Shared corpus connection, law store, knowledge search, health, load, judgment paragraph indexing, quote check, memo, adverse search | `src/main/studio.ts` |
| Binding-effect check from facts and reasons | `src/lib/authority/binding.ts` |
| Coverage, adverse queries, quote-first memorandum | `src/lib/research-workflow/index.ts` |
| Research plan: agent proposes, advocate approves, steps record hits and gaps | `src/lib/matter-store/research-plan.ts` |
| Agent tools: `search_knowledge`, `verify_quote`, `find_adverse_authority`, `propose_research_plan`, `list_research_plans`, `set_research_step`, `write_research_memo` | `src/main/agent.ts`, `studio-tools.ts`, `src/lib/skills/roles.ts` |
| Studio Law library tab: load, health, search modes, coverage, binding, hit cards, save in matter, research plans | `src/renderer/src/Studio.tsx` |
| Tests | `tests/unit/law-import.test.ts`, `authority-binding.test.ts`, `research-workflow.test.ts`, `research-plan.test.ts` |

### The Studio path

- `ResearchHub` opens one `corpus.db` connection. `Corpus` and `LawStore` share it; no second module opens the file.
- `search_knowledge` searches the shared library, the indexed judgment paragraphs and the bound matter in one run. It returns exact text, the citation key, the anchor, verification, binding and coverage.
- `read_judgment` indexes the judgment's paragraphs and treatment edges into `corpus.db` after the PDF is read.
- `knowledge:saveProvision` copies a library provision into the matter's Studio. `save_judgment` saves a judgment as a candidate authority. These rows are case-specific.
- Live India Code remains available for a provision outside the ten-act library. It is a source-discovery path; it does not write the shared library.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/unit/law-import.test.ts` | 8 tests: 8 passed |
| `node --test tests/unit/authority-binding.test.ts tests/unit/research-workflow.test.ts` | 9 tests: 9 passed |
| `node --test tests/unit/research-plan.test.ts` | 1 test: 1 passed |
| `npm run test:unit` | 274 tests: 271 passed, 0 failed, 3 skipped |
| `npm run build` | built main, preload and renderer |

### Live import

The first wave was imported from India Code into a scratch `LawStore`:

| Instrument | Current provisions |
|---|---:|
| Constitution of India | 481 |
| Bharatiya Nyaya Sanhita, 2023 | 358 |
| Bharatiya Nagarik Suraksha Sanhita, 2023 | 533 |
| Bharatiya Sakshya Adhiniyam, 2023 | 171 |
| Indian Penal Code, 1860 (repealed) | 580 |
| Code of Criminal Procedure, 1973 (repealed) | 227 |
| Indian Evidence Act, 1872 (repealed) | 186 |
| Code of Civil Procedure, 1908 | 960 after the source-key fix (733 rules, 171 sections, 51 orders, 5 schedules) |
| General Clauses Act, 1897 | 37 |
| Limitation Act, 1963 | 33 |

The sum is 3,566 current provisions. The full live import was run before the CPC source-key fix and reported 2,983; the CPC-only re-import after the fix reported 960. The other nine counts did not change.

## Known gaps and limits

- **CrPC OCR is partial.** 227 current rows, not the full 484 sections. Section 482 is present. The PDF is the source of record and the page and line are kept. The advocate must confirm a quote from an OCR section before it is filed.
- **IPC, Evidence and the Constitution include schedules, amendments and extra items.** The parser keeps the longest body entry per number; an item that is not an operative provision remains possible. The first wave is a working corpus, not a certified set.
- **Not built in this step:** E4 passage-role confirmation, E6 conflict rows, E7 propositions, H11 Evidence Vault, the J5 matrix deliverables other than the research memorandum, and G6 vectors. Firm, advocate and session scopes remain deferred to RAG-3.
- **The Phase 5 exit has not been run.** The owner must still complete a real research memorandum and confirm the quotes, the governing-date law, the adverse authority and the coverage.

## Mismatches and notes

- The Phase 5 spec says the agent sees one tool, `search_knowledge`. The legacy live-source tools remain for case-specific and extra law. `search_knowledge` is now the primary legal search; the older tools are source discovery. This is the Studio boundary the owner asked for, not a second retrieval function.
- `applyPolicy` still uses the legacy numeric `authority` to order hits in a relevance band. Binding is now computed separately from `authorityFacts`; the number is not used for the binding label.
- The decision id `RAG-1` and the phase name `RAG-1` are still the same label for different things.
- The CrPC text bundle is an OCR reading. A clean section source or an advocate-confirmed OCR reading remains the next data-quality step.

## Clean state at hand-over

- [x] `npm run typecheck` exits 0
- [x] Focused Phase 5 tests pass
- [x] Full unit suite passes (274 tests: 271 passed, 3 skipped, 0 failed)
- [x] `npm run build` succeeds
- [x] The first wave loads from India Code in a live run
- [x] Deferred scopes are visible, not faked
- [x] Work started and not finished is listed above
- [ ] The owner's Phase 5 exit (a real reviewed memorandum)
