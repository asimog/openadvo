# RAG-3: the Knowledge Library and advocate memory in the one knowledge search

Date: 2026-11-19. The Phase 10 stores existed but `search_knowledge` still deferred the `firm` and `advocate` scopes. They are now real scopes.

## What changed

- `src/lib/knowledge/adapters.ts`: `libraryAdapter` over the Knowledge Library and `advocateAdapter` over confirmed advocate memory and approved preferences. The library adapter excludes matter-linked items and rejected, superseded and withdrawn items; approved records rank first. The advocate adapter never returns a proposed, tentative or rejected record as confirmed; a record past its valid-until date is marked stale. A connected but empty store is searched and reported empty; it is not called deferred.
- `src/lib/knowledge/skeleton.ts`: `createPhase5Knowledge` accepts the firm and advocate ports and registers the two adapters. The session scope stays deferred. `createSkeletonKnowledge` keeps all three deferred, as the RAG-0 skeleton.
- `src/main/studio.ts`: `ResearchHub` takes the `AdvocateStore` and passes it to the production registry.
- `src/main/index.ts`: the store is passed to `ResearchHub` after it opens.
- `src/main/agent.ts`: `search_knowledge` now says the firm and advocate scopes are available and only the session scope is deferred.
- `src/renderer/src/Studio.tsx`: the Law library in the Studio and the no-matter Research page offer **Knowledge library** and **Advocate memory**; the default scope searches them too. The health line now names every scope, including deferred ones.
- `tests/unit/knowledge-phase10.test.ts` (new): the firm and advocate boundaries, health and the production registry.
- `tests/e2e/phase10.spec.ts`: the approved precedent is found through `knowledgeSearch` and through the Studio's Law library. An approved preference is found through the `advocate` scope. The health rows move from `firm: ready`, `advocate: empty`, `session: deferred` to `advocate: ready` after the preference is approved.

The firm scope searches the library record (title, kind, status, court, scope, notes, tags, source name), not the file's extracted text. The record says so when it is returned.

## Documents

- `docs/specs/law-research-authority.md`: the phase table now records RAG-0 to RAG-2 built, RAG-3 firm and advocate scopes built, RAG-4 and RAG-5 not built. The firm adapter row states that a matter-linked item is never returned.
- `docs/specs/README.md`: the Phase 5 row matches.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/unit/knowledge-phase10.test.ts` | 3 tests: 3 passed |
| `npm run test:unit` | 417 tests: 414 passed, 0 failed, 3 skipped |
| `npm run build` | main, preload and renderer built |
| `npx playwright test tests/e2e/phase1.spec.ts tests/e2e/phase10.spec.ts` | 3 tests passed |

## Still deferred

- The `session` scope.
- Annotations, chamber sharing, golden set and benchmark (RAG-3 remainder and RAG-5).
- Court/year partition catalog, external-content FTS, multi-opinion paragraphs and ANN (RAG-4).
- File-text indexing for library items and quote verification against a library file.
