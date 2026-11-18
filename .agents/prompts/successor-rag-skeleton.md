# Session handoff: implement the RAG-0 skeleton

Read [docs/specs/law-research-authority.md](../../docs/specs/law-research-authority.md) and [.agents/logs/2026-11-18-rag-integration-phases.md](../logs/2026-11-18-rag-integration-phases.md) first. This prompt is the next step only.

## Verified now

- `main` is at `114ad38`, pushed to `origin/main`.
- `npm run typecheck`: exit 0.
- `npm run test:unit`: 231 tests, 228 pass, 3 skipped, 0 fail.
- The Phase 5 spec and decision register exist. RAG-26 is the owner's instruction: **TypeScript only, no Rust Kernel**.

## Changed this session

- `affc4d3`: Phase 5 foundation (law store, India Code, Akoma Ntoso, citations, fused retrieval).
- `5fa7578`, `32dc328`: Phase 5 assessment, integration report, scale report.
- `114ad38`: phased RAG integration report and Phase 5 spec.
- A TypeScript RAG-0 draft is stashed: `wip: rag skeleton draft (report-first, TS only)`. It is not accepted and not committed.

## Broken or not verified

- RAG-0 is not implemented. No RAG code is committed.
- The stashed draft has not been reviewed against the spec after the report was written.
- No law ingestion, vectors, partitions, firm/advocate/session scopes, annotations, append-only migration or research skill.
- The Phase 5 exit has not been run.

## Next step

- Implement **RAG-0 only**, exactly as the spec defines it:
  - TypeScript contract: citation key, hit, passage, verification checks, authority facts, coverage, health.
  - `KnowledgeRegistry`, `runRetrieval` with bounded concurrency and per-adapter timeouts, `createSkeletonKnowledge`.
  - Real statute, procedure and research adapters over the existing `LawStore`; bound matter adapter; deferred firm/advocate/session.
  - `verifyQuote` / `locateQuote`; `citationKeyId` / `citationKeyText`; `summariseVerification`.
  - Tests: contract, scope refusal, timeout/failure isolation, coverage, quote, citation, health.
- Start with `git stash list`; if the draft is useful, `git stash pop` and review every file against the spec. If it conflicts or does not match, rebuild from the spec and drop the draft. Do not commit the draft unread.
- Done means: `npm run typecheck` exit 0; the focused RAG-0 tests pass; the full unit suite passes; the deferred scopes report a reason; no store writes. It does **not** mean the Phase 5 exit.

## Must not change

- TypeScript only. No Rust Kernel, no parallel runtime.
- No RAG platform, vector server, graph server or Docker.
- No vectors, partitions, firm/advocate/session stores, annotations, append-only migration or research skill in RAG-0.
- The seven scopes, the read-only boundary, the matter scope guard, the quote gate and the coverage rule.
- Do not claim RAG-1 to RAG-5 or the Phase 5 exit.

## Waits for the owner

- RAG-0 scope acceptance.
- The confirmed 28-instrument first wave (it includes BNS, BNSS, BSA, IPC, CrPC and the Evidence Act).
- The append-only `matter.db` migration.
- `advocate.db` as the firm knowledge owner.
- The annotation split.
- The first court-rule order.
- OCR fallback for the repealed codes.
- `undetermined` when earlier text is missing.

## Commands

- Start: `npm run session:start -- --unit`
- Apply the draft: `git stash list`; `git stash pop`
- Focused: `node --test tests/unit/rag-skeleton.test.ts`
- Verify: `npm run typecheck`; `npm run test:unit`
- Commit in small steps. Push only when the owner asks.

## Clean state at hand-over

- [ ] `npm run typecheck` exits 0
- [ ] Focused RAG-0 tests pass
- [ ] Full unit suite passes
- [ ] Deferred scopes are visible, not faked
- [ ] No RAG code is committed before the owner accepts RAG-0
- [ ] Work started and not finished is listed above
