# Final engineering assessment — section 17

Status: the planning session's closing assessment. It answers the ten questions and gives the verdict. Verified facts are cited to [audit.md](audit.md); design claims to the plan documents; the owner's decisions to [decisions.md](decisions.md).

## The ten questions

**1. Is the problem being solved real?** Yes, and verified, not assumed. The audit found: a matter model that cannot hold two proceedings (audit 4.5); a green suite coexisting with seventeen boundary failures (failures.md §4); the wiring layer absorbing 231 modifications across five files (audit 2); and four code-verified trust exposures (failures.md §3). The maintenance difficulty the owner reported is visible in the churn data. The problem is not file size or stack choice; it is ownership and enforcement.

**2. Are the proposed domain boundaries correct?** They are correct as far as evidence and twelve scenarios can test them. Eleven domains, each with one writer module per table, each reading others only through ports ([boundaries.md](boundaries.md)). Three were challenged and kept for stated reasons (facts, proceedings, filing); two were split on the assignment's own instruction (courts/adapters, work/workflow-execution); one was added with a reason (filing). The validation walked every required scenario; none overturned a boundary. The honest caveat: boundaries are only *proven* by phases 2-4 of the plan, where the slice crosses six of them.

**3. Is there unnecessary abstraction?** The plan's own constraint — no abstraction without a concrete use case — was applied against itself. The foundation holds types and one mechanism. There is no event bus, no repository layer, no plugin platform, no package split. The one heavy decision (eleven domains) is justified by the audit's finding that every collapsed concept became a failure (failures.md §1, pattern 1). The merge path for the closest trio (documents/evidence/facts) is recorded in [alternatives.md](alternatives.md) A5/A10 if the slice shows friction.

**4. Does each type of truth have one owner?** Yes — by table, by operation, and by contract: the ownership map (boundaries §3) names the writer of every table; the catalog names the owner of every capability; `tools/gen-contracts.ts` names the source of every interface. The current system's one-writer claim was verified false at the caller level (audit 4.7); the rewrite states the claim per table and enforces it with an import test instead of prose.

**5. Are dependencies pointing in the correct direction?** Yes, and testable: interfaces → application → domains → foundation, with infrastructure implementing ports (repo-structure §3). No domain imports a framework or Electron; the current system already holds this in `src/lib` (audit 6.2) and the rewrite keeps it as a tested invariant rather than a habit.

**6. Can the agent runtime be replaced without rewriting legal records?** Yes — that was the design's test for the runtime decision. The `AgentExecution` interface (contracts §7) is the seam; the engine (LangGraph.js, verified 1.7.5 MIT, with durable execution and a local checkpointer) owns turns and execution state only; operations, records, approvals and the catalog are OpenAdvo's ([agent-runtime.md](agent-runtime.md) §4). The same seam is why Pi can remain the fallback until phase 6's exit passes. One dependency-direction rule is new and enforced by test: no LangChain import outside `application/agent` and `infrastructure/llm`.

**7. Can CLI and desktop UI use the same application services?** Yes — it is rule 20 of [rules.md](rules.md), mechanically enforced: a second implementation of an operation is a defect, and the surfaces are thin by construction. The first slice completes through the CLI (DQ-9) and phase 9 renders the same operations.

**8. Can a court adapter be replaced without changing domain rules?** Yes — adapters are declared data with capability, source and limitation fields (contracts §5); the Courts domain serves what they declare; a fourth adapter drops in without core edits (phase 5's test). The audit's hard-coded-court inventory (audit 4.5) becomes the checklist of what must not exist in the new code — and a structural test enforces it (R-7).

**9. Are permissions and human approvals enforced outside the LLM?** Yes. The catalog's access classes and the fail-closed policy run in application coordination before any operation; human-only capabilities are unreachable from agent surfaces by coherence test; the actor is constructed, never self-declared (DQ-1); submission is human-only (DQ-6); the corrupt-policy case denies (R-10). The current system's fail-open file layer (audit, concern 11) is closed.

**10. What remains unverified?** Stated plainly:
- The LangGraph-in-Electron integration (streaming over generated IPC, a scripted-model test path, checkpoint behaviour in the matter folder) — phase 6 proves it or Pi remains.
- The single-advocate model's readiness for several advocates — structurally present, unvalidated by use (DQ-2).
- The shared browser's guards under real use — the residual the owner accepted with DQ-7, now guarded by tests rather than eliminated.
- DeepAgents-as-harness was verified to exist but is *not adopted*; if a future owner wants its batteries, the same analysis applies again.
- Everything in this series is a plan: no line of the rewrite exists, and the audit's own unverified list (audit §8) still stands for the current system.

## Verdict

**ADOPT WITH LIMITATIONS.**

Adopt, because: the plan is the smallest coherent architecture that satisfies all seventeen failure rules; every boundary it draws is enforced by a check that runs with the tests; the nine owner decisions are answered and carried; the runtime family the owner directed was verified live to exist, is MIT-licensed, TypeScript-native and locally operable, and sits behind a seam that keeps every legal record OpenAdvo's; the twelve required scenarios all pass with three small revisions recorded in place; and the audit's verified strengths (chains, gates, evidence integrity, adapter-as-data, sandbox discipline) are kept rather than discarded.

With limitations, because these are carried forward openly, not solved:

| Limitation | Origin | Cost of living with it |
|---|---|---|
| Single advocate first | DQ-2 (owner) | The several-advocates scenario is model-ready but unvalidated; multi-advocate arrives additively |
| No data migration | DQ-3 (owner) | Existing matters stay in the old application; re-import is by file |
| Runtime integration unproven until phase 6 | DQ-5 (owner direction) | Pi remains the fallback; the exit test decides |
| Shared browser surface | DQ-7 (owner) | Cookies shared across matters in the browser only; guards and tests bound the exposure; filing sign-ins never use it |
| CLI-only first exits | DQ-9 (owner) | The owner's early real-brief exits happen in a terminal until phase 9 |
| Classification needs extracted content | DQ-8 (owner) | Intake waits on document extraction; a step exists before a new matter is classified |

None of these limitations is hidden inside the design as if it were virtue; each is an owner decision recorded with its consequences ([decisions.md](decisions.md)), and each can be revisited by the owner's own instruction, dated.

The goal stated at the outset was *"the smallest coherent architecture that can support a serious, extensible litigation workbench without repeating the problems of the existing application."* The plan meets it: eleven domains, one thin foundation, one catalog, one contract source, one seam for the engine, and a test suite that fails when any of those drift. What happens next is the owner's acceptance, then phase 1's spec — and the first structural test that makes this document's claims runnable.
