# Agent runtime decision — deliverable E

Status: **proposed decision, presented for acceptance** (stage 6). It answers DQ-5: the owner directed the runtime family to **LangChain / DeepAgents in TypeScript/JavaScript**, in place of keeping Pi. This document verifies the direction live (2026-11-20) and recommends one engine.

## 1. Verified facts (checked against npm on 2026-11-20)

| Package | State | Licence | Notes |
|---|---|---|---|
| `@langchain/langgraph` **1.7.5** | Published 3 days before the check; 5.2M weekly downloads; 261 versions | MIT | "Low-level orchestration framework for building stateful agents." Durable execution (auto-resume from where a run left off), native interrupts for human-in-the-loop, memory, and checkpointers including a local SQLite saver (`@langchain/langgraph-checkpoint-sqlite` **1.1.0**, 2026-10-12). |
| `deepagents` **1.17.0** | Published 3 days before the check; 545k weekly downloads; 80 versions; LangChain org | MIT | The TypeScript port of Deep Agents (repo `langchain-ai/deepagentsjs`), built on LangGraph. Ships: planning (`write_todos`), **filesystem tools (`read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`)**, sub-agents (`task`), context management. Two backends: `FilesystemBackend` (Node) and `StateBackend` (in-memory). Security model, quoted from its own readme: *"trust the LLM … enforce boundaries at the tool/sandbox level, not by expecting the model to self-police."* |
| `@earendil-works/pi-coding-agent` 1.5.2 | The current engine: embedded, tested, pinned | — | Verified working in the audit (6): local operation, streaming, tool calling, session files, a scripted-model test path. |

DQ-5's open question is closed: **a maintained, MIT-licensed, TypeScript DeepAgents port exists**, and the family runs locally — LangSmith tracing is optional and stays off by default.

## 2. What each candidate actually gives

| Requirement (assignment §6) | LangGraph.js engine + owned loop | `deepagents` as the harness | Custom thin loop | Pi (fallback) |
|---|---|---|---|---|
| Execution lifecycle | Owned graph; durable execution built in | Owned by the package's defaults | Rebuilt by us | Owned by Pi |
| Streaming | Native (LangGraph streams) | Via LangGraph | Rebuilt | Native (verified) |
| Tool calling | Through the capability catalog only | Ships file/shell-style tools by default — must be disabled and replaced | Through the catalog | Through our registration (verified) |
| Context management | Ours (context assembly stays an operation) | Package's file-based working memory (wrong owner for legal data) | Ours | Ours (verified) |
| Checkpointing | `SqliteSaver` per matter folder — the **agent checkpointer** of DQ-4 | Same, through LangGraph | Rebuilt | Session files only (chat continuation; the audit found no checkpoint anywhere) |
| Resume after crash | Durable execution resumes the turn; run/workflow recovery stays with the legal checkpointer | Same | Rebuilt | Chat-only resume (audit F-16) |
| Human approval | Native interrupts map cleanly to approval requests | Same | Rebuilt | AG-UI interrupts (verified working today) |
| Delegation | Subagent = a scoped session with a narrower derived tool list (deepagents' `task` pattern, implemented as a catalog-backed tool) | Built-in, but with its own context model | Rebuilt | Helpers (verified) |
| Cancellation | Native | Native | Rebuilt | Native |
| Filesystem access | None, unless a catalog capability grants one — the runtime ships zero file tools | **Ships file tools by default — the direct opposite of R-3** | None | None (verified, decision 2 kept) |
| Permission enforcement | Catalog + fail-closed policy in application coordination; the engine enforces nothing itself | Its own model is "trust the LLM"; adopting it as harness imports that posture | Ours | Ours (verified) |
| Dependency footprint | `@langchain/core` + `@langchain/langgraph` + checkpoint-sqlite (+ provider packages as used) | Adds `deepagents` plus five peer deps including `langsmith` | Zero new deps | Already present |
| Local operation | Yes; LangSmith off by default | Yes; same | Yes | Yes |
| Maintainability | LangChain org, 5.2M weekly downloads, active | Active, one major rework onto `createAgent` behind it (2026) | All ours | Pinned 1.5.2 |
| Replacement cost | The owned interface in [contracts.md](contracts.md) §7 is the seam; swapping the engine touches `application/agent/` only | Same seam | Highest (it *is* the product) | Same seam |

## 3. Recommendation

**Adopt `@langchain/langgraph` as the execution engine, behind the OpenAdvo-owned `AgentExecution` interface. Do not adopt the `deepagents` package as the harness. Adopt two of its patterns — the planning tool and the subagent tool — implemented as catalog-backed capabilities. Keep Pi as the fallback until the agent phase's slice proves the integration.**

Reasons, tied to the rules and the owner's direction:

1. **The family is the owner's direction and it verifies** — both packages are real, MIT, TypeScript, local-capable, and actively maintained. The direction is honoured.
2. **The harness's defaults are the wrong defaults for a legal system.** `deepagents` itself says to enforce boundaries at the tool level — which is exactly the capability catalog — but its out-of-the-box posture gives the model file tools and "trust the LLM". Every one of its batteries would have to be removed to satisfy R-3 and the fail-closed policy. A harness whose value is its defaults, all of which must be disabled, is a dependency, not an accelerator.
3. **The engine's primitives match the answered decisions exactly.** Durable execution + a local SQLite checkpointer per matter folder *is* the agent checkpointer of DQ-4, bounded to execution state; native interrupts *are* the approval queue; the legal checkpointer (run states + reconciler) stays ours, separate, as DQ-4 requires.
4. **What it earns over the fallback is real, not feature-count.** The audit's F-16 found no checkpoint anywhere and crashed runs rendered "running" forever; LangGraph's durable execution solves precisely that, and interrupts formalize the approval flow the current system built by hand. The provider ecosystem (`@langchain/*` model packages) also removes the current binding to Pi's credential store.
5. **The seam stays ours.** Operations, records, approvals and the catalog are OpenAdvo's in every column of the table; replacing the engine later touches `application/agent/` alone.

## 4. What OpenAdvo owns independently of the engine

- The capability catalog and every operation the model may reach.
- The fail-closed policy and the approval queue.
- The system prompt and every piece of legal text (R-3).
- Session and checkpoint files' location and lifetime (matter chat folder, agent checkpointer only).
- The trace and cost records.
- Recovery of *work* (the legal checkpointer); the engine recovers only *turns*.

## 5. Risks, carried forward (not hidden)

1. **Integration risk.** LangGraph inside an Electron main process, streaming to a renderer through the generated IPC contract, with a scripted-model test path — the agent phase must prove all three before Pi is dropped from the build.
2. **Ecosystem churn.** `deepagents` has had one architecture rework onto `createAgent` already; the plan does not depend on it, which is the point of using the engine rather than the harness.
3. **Optional cloud.** LangSmith must remain off unless the owner turns it on; a structural test asserts no tracing key is required for local operation.
4. **Checkpoint boundary.** The SQLite checkpointer holds execution state in the matter folder; the recovery test (system-architecture.md §5) must prove no legal record is ever read from it.
