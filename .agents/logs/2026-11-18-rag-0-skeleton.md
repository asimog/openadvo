# RAG-0: contract and skeleton

Session of 2026-11-18. Owner's instruction: "START IMPLEMENTATION OF RAG-0 SKELETON". Spec: [docs/specs/law-research-authority.md](../../docs/specs/law-research-authority.md). Report: [2026-11-18-rag-integration-phases.md](2026-11-18-rag-integration-phases.md).

Status: RAG-0 is implemented and tested. It is not accepted, not committed, and not the Phase 5 exit.

## What was built

| Area | Code |
|---|---|
| Contract: citation key, verification dimensions, quote check, source passage, authority facts, coverage, adapter health | `src/shared/law.ts` |
| `citationKeyId`, `citationKeyText` | `src/shared/law.ts` |
| `summariseVerification` | `src/shared/law.ts` |
| `KnowledgeRegistry`, duplicate-scope refusal, `health`/`healthOf` | `src/lib/knowledge/index.ts` |
| `runRetrieval`: parse, scope check, bounded concurrency, per-adapter timeout, RRF, policy, finish hooks, coverage | `src/lib/knowledge/index.ts` |
| Hit contract check, pre-fusion rejection of malformed hits and foreign scopes | `src/lib/knowledge/index.ts` |
| Statute, procedure and research adapters with citation keys, checks and health | `src/lib/knowledge/adapters.ts` |
| `deferredAdapter`, `withHealth` | `src/lib/knowledge/adapters.ts` |
| `boundMatterAdapter`, `MatterKnowledgePort` | `src/lib/knowledge/adapters.ts` |
| `locateQuote`, `verifyQuote`, `quoteHash`, 12-character minimum | `src/lib/knowledge/quote.ts` |
| `createSkeletonKnowledge` | `src/lib/knowledge/skeleton.ts` |
| Read `under` on a provision and `indexedAt` on a judgment (existing columns, no migration) | `src/lib/law-store/index.ts` |
| RAG-0 tests | `tests/unit/rag-skeleton.test.ts` |

`createSkeletonKnowledge` registers seven scopes. Statute, procedure and research read the existing `LawStore`. A matter adapter is bound when a port is supplied; otherwise the matter scope is deferred. Firm, advocate and session are always deferred with a reason. The factory has no verify or vector option, so a run writes nothing and builds no vector index.

## Commands and results

| Command | Result |
|---|---|
| `git stash list` | the draft was reviewed and dropped; the list is empty |
| `npm run typecheck` | exit 0 |
| `node --test tests/unit/rag-skeleton.test.ts` | 25 tests: 25 passed, 0 failed |
| `npm run test:unit` | 256 tests: 253 passed, 0 failed, 3 skipped; exit 0 |
| `npm run session:start -- --unit` | exit 0; 256 tests, 253 passed, 3 skipped |

The three skipped tests are the live-network tests (`tests/unit/research-sources-live.test.ts`), which require `OPENADVO_LIVE_NET=1`.

## Contract decisions in this step

- `summariseVerification`: any `changed`, `unreachable` or `never` makes the record `unconfirmed`. All seven dimensions `verified` makes it `verified`. A missing dimension or a `not_applicable` dimension makes it `partial`. `not_applicable` alone never makes a record unconfirmed. The individual checks are never replaced.
- `citationKeyId` removes a label from a chapter, part, order or proviso, removes the brackets from a sub or clause, escapes `#` and `%`, and appends `v<n>` for a version.
- `runRetrieval` rejects a hit with no `id`, `title`, `text`, `anchor` or valid `scope` before fusion. A hit whose `scope` differs from its adapter is rejected. The adapter is listed in `coverage.failed`; another adapter's hits survive.
- A bound matter adapter refuses a missing id, another id and a malformed id before it calls the port. The port receives the bound id, never the requested id.
- `coverage.deferred` is a missing adapter, an unavailable adapter or a deferred adapter. `coverage.failed` is a search error, a timeout, a state-read error, an invalid hit or a failed finish hook. `partial` is true when either list is not empty.

## Not built (RAG-0 boundary)

- No law ingestion, repealed-code OCR or source manifests.
- No vectors, embeddings, ANN, partitions or vector server.
- No firm, advocate or session store; no annotations; no append-only `matter.db` migration.
- No research skill, no plan, no memorandum workflow and no `search_knowledge` tool.
- No Phase 5 exit.

## Mismatches and notes

- The stashed draft was dropped after review. It was a partial type patch only, and its header said the types "map directly to the Rust Kernel when the owner confirms that repository direction". That contradicts RAG-26 (TypeScript only). The stash list is empty.
- The handoff says "Commit in small steps" and also "No RAG code is committed before the owner accepts RAG-0". The second, specific gate was followed: the RAG-0 code and tests are uncommitted in the working tree for owner review.
- `applyPolicy` still uses the legacy `authority` number to order hits inside a relevance band. `authorityFacts` now travel with research hits, but RAG-0 computes no binding or persuasive label. That is RAG-2 work.
- `Provision.under` and `judgment().indexedAt` are read from columns that already exist. No schema migration and no write path were added.

## Clean state at hand-over

- [x] `npm run typecheck` exits 0
- [x] Focused RAG-0 tests pass (25/25)
- [x] Full unit suite passes (256 tests, 253 passed, 3 skipped, 0 failed)
- [x] Deferred scopes are visible, not faked
- [x] No store writes in the tested run
- [x] No RAG code is committed before the owner accepts RAG-0
- [x] Work started and not finished is listed above
