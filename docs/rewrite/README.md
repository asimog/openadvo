# The rewrite planning series

The greenfield-rewrite planning session, 2026-11-20, at commit `26ac806`. Read in order. Each file owns one thing; each carries a status line. Nothing in this series is built code, and no proposal in it is accepted until the owner accepts it. The final verdict is in [assessment.md](assessment.md).

| Order | Document | Stage | Owns | Status |
|---|---|---|---|---|
| 1 | [audit.md](audit.md) | 1 | The verified audit: current behaviour, file:line evidence, the concern table verified, strengths kept. | Evidence |
| 2 | [failures.md](failures.md) | 2 | The seventeen architectural failures, their causes and consequences; the missing rules R-1 to R-17. | Diagnosis |
| 3 | [boundaries.md](boundaries.md) | 3 | The proposed domain ownership map (eleven domains), the shared foundation, dependency direction, write ownership. | Proposed |
| 4 | [decisions.md](decisions.md) | 4 | The nine owner decisions DQ-1 to DQ-9 — all answered, four with the owner's own wording. | Answered |
| 5 | [alternatives.md](alternatives.md) | 5 | Preferred, alternative and rejected options for the ten architectural forks. | Proposed |
| 6 | [system-architecture.md](system-architecture.md) | 6 | Deliverable C: the composed system, data ownership, the action path, the enforcement checks. | Proposed plan |
| 7 | [contracts.md](contracts.md) | 6 | Deliverable D: the illustrative core contracts (matter, proceeding, document, evidence, fact, adapter, capability, execution, workflow). | Proposed plan |
| 8 | [agent-runtime.md](agent-runtime.md) | 6 | Deliverable E: the runtime decision — LangGraph.js engine behind the owned interface; `deepagents` patterns adopted, harness not; Pi as fallback. Live-verified. | Proposed decision |
| 9 | [cli-plan.md](cli-plan.md) | 6 | Deliverable F: the initial command tree and how commands call operations. | Proposed plan |
| 10 | [repo-structure.md](repo-structure.md) | 6 | Deliverable G: the directory tree, layer ownership, import rules and their tests. | Proposed plan |
| 11 | [phases.md](phases.md) | 6 | Deliverable H: twelve phases, each with tests, exclusions and an owner exit on a real brief. | Proposed plan |
| 12 | [rules.md](rules.md) | 6 | Deliverable I: the thirty enforceable rules for future coding agents. | Proposed |
| 13 | [validation.md](validation.md) | 7 | The twelve required scenarios walked through the design; three revisions recorded. | Validated design |
| 14 | [assessment.md](assessment.md) | 17 | The final engineering assessment and the verdict: **ADOPT WITH LIMITATIONS**. | Verdict |
| 15 | [capability-map.md](capability-map.md) | Addendum | The systems-design report on the proposed architecture: the fourteen capabilities, the relationship matrix (owner, consumer, contract, exchange, coupling, duplication risk), the twenty design principles, five findings. | Design report |

Deliverable J (open decisions and risks) is owned by [decisions.md](decisions.md); every decision is answered, and the residuals are carried into [assessment.md](assessment.md) as limitations.

Session records for this series are in [../../.agents/logs/](../../.agents/logs/): `2026-11-20-stage1-audit.md`, `2026-11-20-stage2-failures.md`, `2026-11-20-stage3-5-planning.md`, `2026-11-20-stage6-7-plan.md`.

No code was written during this session. Phase 1 starts with the owner's acceptance and a one-page phase spec (lesson L1).
