# 2026-11-20 — Stage 2 rewrite failure analysis

Task: Stage 2 of the rewrite planning. Diagnose the architectural failures, their causes and consequences, from the Stage 1 evidence. No new commands were run; no code changed.

## Inputs

- `docs/rewrite-audit.md` (Stage 1, commit `26ac806`).
- Five stage-1 evidence passes with file:line citations (recorded in `.agents/logs/2026-11-20-stage1-audit.md`).

## Outputs

- `docs/rewrite-failures.md` — seventeen failures (F-1 to F-17) in five groups, each with cause, failed boundary, why tests/review missed it, category, consequences (observed or projected) and a missing rule (R-1 to R-17). Three root patterns stated up front; consequences aggregated; rules collected in a table.
- `docs/README.md` — one row added to the index.

## Notes

- No architecture proposed. Rules are constraints for Stage 3.
- Failure-to-question mapping recorded in the file's section 6: F-11 → AQ-1, F-5 → AQ-2, F-16 → AQ-3, F-12 → AQ-4.
