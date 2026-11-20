# Architecture rules for coding agents — deliverable I

Status: **proposed, presented for acceptance** (stage 6). These are the enforceable rules a future coding agent follows in the rewrite. They compress the plan; the plan documents remain the owners of the reasoning. Rules 1-17 restate the failure rules R-1..R-17 of [failures.md](failures.md) as build instructions; 18-30 are the working rules of this repository applied to the new tree.

## Placement and ownership

1. The process entry assembles and starts. It owns no operation and holds no business state.
2. Every named operation lives in `application/operations/`, one file per name. Interfaces route to it; domains are composed by it; nothing else composes.
3. A domain imports `foundation` and itself only. Cross-domain reads go through the owning domain's query port. A domain never writes another domain's tables.
4. `foundation/` holds types and the chain, nothing else. Adding a business rule to the foundation is a defect.
5. A new concept the product names gets a record with one owner, in the domain that rules it. A workflow-specific artefact never takes a generic concept's name (`petition` stays generic; SLP is pack data).
6. Court-specific behaviour reaches the core only as adapter data through the Courts domain. A code branch or prompt line that names a court is a defect.
7. Interfaces (CLI, desktop, agent tools) parse, render, confirm. A decision computed in an interface is a defect.
8. Infrastructure implements a port declared by application; it never calls a domain unprompted and never imports `application/` beyond its port.

## Capabilities and authority

9. Every operation declares a capability: id, scope, access class (read / propose / execute / human-only), risk, side effects, surfaces. Per-session and per-skill tool lists are derived from the catalog, never restated.
10. `human-only` capabilities (fact acceptance, filing confirmation, submission) never appear on an agent surface. The coherence test fails if one does.
11. Actor and scope are constructed by application coordination from the interface in use. No caller, and no extension, sets its own actor. The trust model is the written one (DQ-1).
12. Unreadable, missing or invalid policy is deny, with a visible error. A test proves it by corrupting the source.
13. Matter isolation is enforced at every operation by scope, never by a prompt. Portal and matter-acting contexts use per-matter partitions; the shared browser carries its recorded guards (DQ-7).

## Records and integrity

14. Every reference is typed and validated by its record's owner at write time. A free-text anchor, court id or case type is a defect.
15. Originals are write-once and re-hashed on read. Derived files are labelled and reproducible; they never replace an original.
16. Every write appends a chained event from the foundation's chain. Refused writes go to the refusal table.
17. Fact acceptance is a decision record with actor, time and chain event. A model extraction starts as candidate and no code path can accept it.
18. Long-running work has defined states and a start-up reconciler. The agent checkpointer holds execution state only; no legal record is read from it (DQ-4).

## Contracts and drift

19. The IPC contract has one source (`*.schema.ts`). Preload, bridge and `OpenAdvoApi` are generated; editing a generated file is a defect.
20. The same operation serves every surface: a CLI command, a UI pane and an agent tool call one operation. A second implementation of an operation is a defect.
21. The structural suite must stay green: import boundaries, contract divergence, capability coherence, fail-closed policy, scope isolation, recovery states. Green means behaviour **and** structure; a red structural test is never skipped or deleted to proceed.
22. No new database, store or "authority" without a written accepted reason. One store per owner table group, one writer module per table.

## Working discipline (this repository's standing rules, restated for the rewrite)

23. Specify a module when its phase starts, at the depth the phase needs; build it in the same piece of work (L1).
24. Nothing pretends: a feature that does not work yet says so on screen (L2).
25. Done means the owner completed a real exit on a real brief (L3). Tests green is not done.
26. Ideas outside the current phase go to `docs/parking.md` (L6).
27. No empty folders for imagined futures; a folder appears with its phase's first commit.
28. Every document in `docs/rewrite/` carries a status line. A claim about code is generated or tested against it; a proposal is labelled proposed until the owner accepts it.
29. Report doc-code mismatches; follow the code; fix the doc or the code in the same change.
30. Do not reopen an accepted decision. To change one, the owner's own instruction does it, dated.
