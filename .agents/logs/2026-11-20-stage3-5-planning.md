# 2026-11-20 — Stages 3, 4 and 5 of the rewrite planning

Task: propose domain boundaries (Stage 3), identify the open owner decisions (Stage 4), and compare alternatives (Stage 5). No code changed; no commands run. All three documents are marked proposed, not accepted.

## Outputs

- `docs/rewrite-boundaries.md` — Stage 3: the five kinds of code; the challenge of the assignment's ten candidate domains (one added: Filing Preparation; two split: Courts/adapters, Work/workflow-execution); the eleven-domain ownership map (records, rules, operations, dependencies, exclusions, writes); the thin shared foundation; the dependency diagram; per-table write ownership; the R-rule mapping; what the first slice touches.
- `docs/rewrite-decisions.md` — Stage 4: nine open decisions DQ-1 to DQ-9 with options, consequences and defaults; four audit questions settled as design details; round one named (DQ-1, DQ-2, DQ-3, DQ-5, DQ-9), round two pending (DQ-4, DQ-6, DQ-7, DQ-8).
- `docs/rewrite-alternatives.md` — Stage 5: ten forks A1 to A10, each with preferred, viable alternative and rejected options with reasons tied to the R-rules and the audit.
- `docs/README.md` — three rows added to the index.

## Notes

- Nothing in the three documents is an accepted decision. Defaults are stand-ins until the owner answers.
- **Round one answered 2026-11-20**: DQ-1 documented in-process trust; DQ-2 single advocate first; DQ-3 per-matter folders, start empty; DQ-9 CLI-only slice exit — all four accept the defaults. **DQ-5 overthrows its default**: the owner directed the runtime family to LangChain / DeepAgents in TypeScript/JS. Answers recorded in `docs/rewrite-decisions.md`; the runtime alternative A7 rewritten in `docs/rewrite-alternatives.md` (Pi becomes the fallback; live verification of a maintained DeepAgents TS/JS variant and LangGraph.js state is owed in the runtime deliverable).
- Round two remains open: DQ-4, DQ-6, DQ-7, DQ-8.
- Stage 6 (the architecture plan: deliverables C, D, F, G, H, I) is unblocked and starts on request.
