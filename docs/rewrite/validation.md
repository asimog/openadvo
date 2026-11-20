# Scenario validation — step 7

Status: **the proposed design, tested** (step 7 of the planning process). Each of the twelve scenarios is walked through the records and operations of the proposed architecture. Verdicts: **explained** (the design carries it), **explained with limitation** (the design carries it within a stated boundary the owner chose), or **revised** (the walk found a gap and the design changed). Three revisions were made during this validation; they are listed first so they are not missed.

## Revisions made during this validation

1. **Proceeding-level sources on facts.** Walking "a court document retrieved and later found incorrect" showed a fact may originate from a proceeding event (an order) as well as from an anchor. The Fact contract (contracts §4) already carries `ProceedingEventRef`; this validation confirms it is required, not optional — the Factual Record consumes proceeding events as first-class fact sources. No change needed beyond confirming it.
2. **The shared browser's matter actions.** Walking "an agent working on one matter while another is open" under DQ-7's "everything except the browser" exposed an ambiguity: if the browser is shared, what stops an agent tab from matter A being used for matter B? The design now records the guard explicitly (decisions.md DQ-7, guards 2-4): every agent tab records its owning matter; downloads-to-matter are recorded operations carrying the scope; the shared browser's cookies are untrusted for matter actions; filing sign-ins live only in the per-matter portal. The guard is a structural test, not prose.
3. **Workflow steps must be idempotent by record.** Walking "a failed workflow that must resume" forced the exact resume semantics: the reconciler restarts from the last completed step, and an operation that already committed is detected by its records, not by re-running. This was already DQ-4's shape; the validation confirms the operations layer must state the already-committed check in its transaction pattern, so it is recorded here and in phases 8's tests.

## The twelve scenarios

**1. One matter with several proceedings.**
Path: `matter` record holds zero or more `proceeding` records, each with its own typed `courtId`, `caseType`, `caseNumber`, `diaryNumber` and `stage` (contracts §2). `openadvo proceeding add` twice, different courts, different stages.
Verdict: **explained.** This is the direct fix for failure F-5, and phase 2's owner exit tests it on a real matter.

**2. One proceeding involving several documents.**
Path: documents register to the matter; evidence records cite anchors into any number of documents; a proceeding's filings and orders reference documents by id.
Verdict: **explained.** The relationship is by typed reference, not by folder position.

**3. A shared document used in several proceedings.**
Path: one `document` record (one blob, one hash); several evidence records and facts across the proceedings of the same matter cite its anchors. Across two *matters*: the design does not share documents cross-matter — the safety rule forbids cross-matter fact retrieval, so a document needed in a second matter is re-imported (it re-registers by hash, and the audit found the current blob model handles this).
Verdict: **explained with limitation.** Within a matter: fully. Across matters: deliberate refusal, recorded as design, not an accident.

**4. Conflicting facts extracted from different sources.**
Path: two candidate facts, each with typed sources; the Factual Record's contradiction operation records the pair; the review queue shows the conflict; both stay visible until the advocate decides (the current safety rule, kept); acceptance is a `FactDecision` per fact.
Verdict: **explained.** The current code already keeps conflicts visible; the design gives that rule a named owner.

**5. A lawyer accepting or rejecting a proposed fact.**
Path: `fact review` (CLI, phase 4; UI pane, phase 9; agent surface absent — `accept` is human-only). `acceptFact` writes a `FactDecision` with the constructed advocate actor, the chain event, the timestamp and the optional reason; rejection keeps the candidate with its record for the audit.
Verdict: **explained.** The acceptance is explicit, authorised and auditable — the assignment's three requirements, each with a named record.

**6. Several advocates working on one matter.**
Path: the `Actor` and `Scope` carry an advocate id from day one (DQ-2); `matter.assignments` holds advocate ids; the model allows many. But the first release holds one profile, and the scenario is not validated by use.
Verdict: **explained with limitation.** Structurally ready, unvalidated — recorded in the final assessment.

**7. An advocate working across different practice areas.**
Path: practice areas are pack data (courts, case types, stage lists, templates). An advocate's matters span any proceeding type; no code path branches on practice area; phase 7's non-SLP exit is the proof.
Verdict: **explained.** This is R-5 and R-7 made testable.

**8. Different court adapters with different capabilities.**
Path: adapters declare capabilities (contracts §5); the Courts domain serves only what its sources declare; absent capabilities surface as absent operations, honestly (`processing` states and "not checked" behaviour never pretend, L2). A fourth adapter drops in without core edits — phase 5's test.
Verdict: **explained.** The audit found the adapter-as-data model sound; the plan makes it the only route.

**9. An agent working on one matter while another matter is open.**
Path: every operation receives a scope; the catalog derives the agent's tool list for that matter's session; cross-matter access fails the scope test; the portal is per-matter partitioned; agent browser tabs record their owning matter and tools act only inside it (revision 2's guards).
Verdict: **explained.** The audit showed this exact isolation already works where code enforces it (RAG); the plan extends that enforcement to the surfaces where it was missing (portal, browser, work).

**10. A failed workflow that must resume.**
Path: the run record holds `completedSteps`; a crash leaves `interrupted`; the start-up reconciler restarts from the last completed step; an operation that already committed is detected by its records (revision 3); the agent checkpointer separately resumes the *turn* and never holds a step's legal truth (DQ-4).
Verdict: **explained.** Phase 8's tests kill a run mid-step and prove the resume.

**11. A court document retrieved and later found to be incorrect.**
Path: the original blob is preserved (write-once, re-hashed); the evidence record's status changes with a chained event; facts built on it are superseded, not deleted — the supersession chain keeps the error's history; a re-retrieved correct copy registers as a new document; limitation and stage computations re-run from courts data. Nothing is silently overwritten: the correction is a visible chain of decisions.
Verdict: **explained.** This is the provenance design the audit found half-built and the plan completes (revision 1 confirmed the proceeding-event source).

**12. A filing that is prepared but not approved or submitted.**
Path: the filing set's states are `prepared → confirmed(1) → confirmed(2) → submitted`; confirmations are human-only operations bound to the payload hash; `submit` exists nowhere on an agent surface (DQ-6); an unapproved set simply stays `prepared`, visible in the review queue, blocking nothing else.
Verdict: **explained.** The current two-confirmation gate is a verified strength; the plan keeps it and removes the residual path (the audit's `portal_click` workaround) by making submission human-only.

## What this validation changes in the plan

Nothing in the boundary map or the phases is overturned. The three revisions above are recorded in place: the shared-browser guards (already in decisions.md DQ-7), the proceeding-event fact source (already in contracts §4), and the idempotence-by-record resume semantics (now explicit in phases 8). No scenario required a new domain, a new store, or a new abstraction — the smallest-coherent-architecture constraint survived contact with all twelve scenarios.
