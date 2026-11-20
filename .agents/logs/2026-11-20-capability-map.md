# 2026-11-20 — Systems-design report: the capability map of the proposed architecture

Task (docs-only): identify the capabilities of the *proposed* system (not the current code), analyse every relevant relationship (owner, consumer, contract, exchange, coupling, duplication risk), and evaluate the twenty systems-design principles. No code changed; no commands run beyond the commit.

## Output

- `docs/rewrite/capability-map.md` (written directly into the series): the fourteen owner-named capabilities mapped onto the proposed architecture (four of them — classification, procedural intelligence, permissions, audit — deliberately not record-owning modules); the feature inventory per capability with phases; a 26-row relationship matrix; prose analyses of the six load-bearing relationships (record spine, proof chain, classification-as-proposer, permissions choke point, the agent seam and its deliberate absences, the two checkpointers); the twenty principles with an honest "materially affects?" verdict (one carried gap: observability); five findings, none overturning the plan.

## Findings recorded

1. Procedural intelligence is distributed by ownership and must never become a module (guard: import-boundary test).
2. Intake has an ordering dependency (documents extract before classification completes) — a phase-5 spec obligation under lesson L1.
3. Facts have four source kinds and one rule: typed references resolved by the target's owner.
4. The policy file tightens, never loosens; `human-only` is fixed in declarations.
5. Observability is a named, carried gap — acceptable for local single-user, required the day multi-advocate arrives.
