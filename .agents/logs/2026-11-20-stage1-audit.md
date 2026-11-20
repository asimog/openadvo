# 2026-11-20 — Stage 1 rewrite audit

Task: audit the repository for the rewrite planning. Evidence only; no architecture proposed; no code changed.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | 422 tests, 419 pass, 0 fail, 3 skipped, ~61 s. Exit 0. |
| Import-graph script (`%TEMP%/opencode/import-audit.mjs`, 216 files) | Runtime vs type-only imports, cycles, fan-in, boundary checks. |
| `Get-ChildItem packs -Filter *.json` | 21 pack files. |
| git churn (window 500) | Hottest: `src/main/index.ts` 56 modifications, `src/shared/api.ts` 51, `src/main/agent.ts` 50. |

## Evidence passes

Five parallel audits with file:line evidence: main process; stores and domain libraries; renderer/preload/shared; tests and build; docs and specs. Load-bearing claims (tool-policy fail-open, portal sharing, anchors, SLP hard-wiring, singletons, one-row proceeding) were re-read first-hand before inclusion.

## Outputs

- `docs/rewrite-audit.md` — the audit report (verified facts, requirement ledger, unresolved questions AQ-1 to AQ-12).
- `docs/README.md` — one row added to the index.
