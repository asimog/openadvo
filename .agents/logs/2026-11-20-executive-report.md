# 2026-11-20 — The unified executive report

Task (docs-only): combine the rewrite series (16 documents in `docs/rewrite/`) and the module audit series (17 documents in `docs/moduleaudit/`) into one executive report for the owner's discussion, covering the lessons, the modules, the failures and the rewrite discipline.

## Reading performed

- `docs/moduleaudit/` read in full: README, 00-systems-design.md (all 2,200 lines), 01-matter-proceeding-classification.md (executive summary, method, probes and structure; the ontology sections referenced), and all fourteen module reports 02-15.
- `docs/rewrite/` was written by this session and already held in full.

## Output

- `docs/rewrite/executive-report.md` — the combined report:
  - §1 one-page summary (settled baseline, settled problem, the one fork);
  - §2 the fourteen capabilities with both series' verdicts side by side;
  - §3 the merged failure register: found by both (15 rows), module-audit-only findings, rewrite-only findings;
  - §4 the lessons (L1-L6 plus seven evidenced session lessons);
  - §5 the combined rulebook (18 merged rules, with each rule's source in both series);
  - §6 the fork (refactor vs greenfield, runtime timing), the answered DQs both roads must respect, and the module audit's genuinely new questions D-01..D-08;
  - §7 coverage of all 33 source documents.
- `docs/rewrite/README.md` — row 17 added.

## Note on the fork

Both series converge on the same findings and the same target model; they disagree only on the road (strangler refactor vs greenfield) and the runtime's timing. The report presents both cases with their costs and does not decide; the owner's DQ-3 answer ("start empty") was given inside the greenfield frame and is flagged as transforming into a migration answer if the refactor road is chosen.
