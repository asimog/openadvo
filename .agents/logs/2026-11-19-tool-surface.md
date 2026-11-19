# One retrieval tool and one memorandum tool

Date: 2026-11-19. This session closes two findings of the code audit: the two legal retrieval paths and the two memorandum tools.

## What changed

### One legal retrieval path

- `search_knowledge` is the one legal retrieval tool. It returns exact text, the citation key, the anchor, verification and coverage.
- `search_judgments` is `discover_judgments`. `search_statutes` is `discover_statutes`. They are discovery tools: they return a source to open, never a citable passage. Their results say so in the first line.
- `read_judgment` and `read_statute_section` open and index the discovered source. The next step is `search_knowledge`, then `verify_quote`.
- The system prompt, the role scope (`READ_LAW_TOOLS`), the side-question scope, the helper scope, the built-in research workflow and the law-research spec now state the boundary.
- The 25 skills that named the old tools use the discovery names. Each moved to version 1.0.1 and its `review.json` was regenerated.

### One memorandum tool

- `write_memorandum` is removed from `AGENT_TOOLS`, the research role, the writing tools, the sequential tools and the host interface.
- `write_research_memo` is the only memorandum tool. It now does both grounds:
  - every quote is located in its source, and one unverified quote refuses the memorandum;
  - every `[event:]`, `[issue:]`, `[authority:]` or `[source name, p. N, l. M]` in the body is resolved, and unresolved references are kept as unresolved.
- A memorandum needs at least one verified quote or one resolved reference. Otherwise it is refused with `MEMO_UNGROUNDED`.
- `question` and `coverage` are optional. `quotes` is optional, so a memorandum grounded only in matter records is possible.
- The reference resolution moved to `src/main/memo-grounding.ts`, shared by the one tool.
- `Research.writeMemorandum` and the `AgentWorkHost.writeMemorandum` entry are removed.

## Tests

- `tests/unit/agent-tools.test.ts` (new): one retrieval tool, discovery names, one memorandum tool, and the role scopes.
- `tests/unit/agent-runs.test.ts`: the failed Studio call uses `discover_statutes`.
- `tests/e2e/app.spec.ts`: the exact tool list.
- `tests/e2e/v4.spec.ts`: `discover_judgments`.
- `tests/e2e/steps6to10.spec.ts`: the memorandum path through `write_research_memo`, including the `MEMO_UNGROUNDED` refusal and the resolved and unresolved references.

## Commands and results

| Command | Result |
|---|---|
| `npm run session:start` | exit 0; type check exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 420 tests: 417 passed, 0 failed, 3 skipped (live-network) |
| `npm run build` | exit 0; three "built in" lines |
| `npx playwright test` | 50 tests: 48 passed, 2 skipped (live-model), 0 failed; 1.7 min |
| `node scripts/review-skills.ts` | 140 skills reviewed, exit 0 |

## Known limits

- `discover_judgments`, `discover_statutes`, `web_search` and `web_fetch` remain. They are discovery, not retrieval. A discovered item must be opened, retrieved and verified before a citation. The tool names and descriptions say this.
- The discovery tools still use the existing research sources. No source was added or changed.
- The 115 skills that did not name the old tools keep their review records.

## Files

- Code: `src/main/agent.ts`, `src/main/agent-work.ts`, `src/main/studio.ts`, `src/main/studio-tools.ts`, `src/main/memo-grounding.ts` (new), `src/main/research.ts`, `src/main/side-questions.ts`, `src/main/helper-types.ts`, `src/lib/skills/roles.ts`, `src/lib/workflows/index.ts`.
- Skills: 25 `SKILL.md` files, versions 1.0.1, with their `review.json`.
- Tests: `tests/unit/agent-tools.test.ts` (new), `tests/unit/agent-runs.test.ts`, `tests/e2e/app.spec.ts`, `tests/e2e/v4.spec.ts`, `tests/e2e/steps6to10.spec.ts`.
- Documents: `docs/specs/law-research-authority.md`, `docs/harness-hardening.md`.
