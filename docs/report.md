# Questions still open

Status: question history. Every question in this file was settled on 4 November 2026 in [decisions.md](decisions.md), which governs. The recommendations below are the positions as they stood before the decisions, kept so the reasoning behind each choice stays readable. Where a recommendation here differs from the decision, the decision is the design. In particular RQ-08, RQ-09, RQ-12 to RQ-14, RQ-16 to RQ-21, RQ-23, RQ-25, RQ-35, RQ-37, RQ-43 to RQ-45, RQ-55 to RQ-63, RQ-75, RQ-78 to RQ-80, RQ-84 and RQ-86 were decided differently from, or more specifically than, the recommendation written here.

Each entry gives the question, a line of context, what each of the three options actually buys and costs, the recommendation as it stood, and a verdict saying whether the component map changed it.

## Verdicts

Each question opens with its verdict.

| Verdict | Meaning |
|---|---|
| *Keep* | The recommendation stands, and the map makes it cheaper or more concrete. |
| *Sharpen* | Same option, with one added condition the map exposed. |
| *Change* | A different option now wins. |
| *Close* | Another question already asks this, or a decision removes the choice. |

## How to read an option line

An option line names the option, what it buys, and what it costs. The cost is the consequence to expect in the built system, not a reason to reject the option. Most of these questions have no free option, so the useful comparison is between costs.

## What changed in this pass

The component map was read against every question. The result is smaller than it looks.

**Two recommendations change.** RQ-02 changes from C to B, because the harness now operates the whole application and the typed control protocol it needs is the same IPC a separate process requires. RQ-38 changes from C to A, because egui with winit is decided.

**Seven sharpen.** RQ-01, RQ-07, RQ-22, RQ-28, RQ-33, RQ-37 and RQ-44 each gain one condition, and every one of them is about where an artefact lives rather than what it is.

**Three pairs are one question.** RQ-02 and RQ-76 ask where the harness runs. RQ-20 and RQ-60 ask how absence from a corpus is reported. RQ-21 and RQ-59 differ only in which date sets the boundary.

**The rest hold.** Seventy-eight recommendations stand unchanged. The pattern is worth naming. Every recommendation that survived is about who owns a record. Every recommendation that changed is about where code runs.

Two states are decided outside this file. The shell is egui with winit, and a matter is a folder with an index beside it. Both appear below as settled entries rather than open questions.

---

## A. Kernel, runtime and harness

**RQ-01. Which runtime runs the harness loop?** *Sharpen C.*

Some program calls the model, dispatches tools, enforces policy, waits on approvals and keeps the turn alive. The provider layer is a separate question and stays a dependency either way. This question is only about the loop.

- A. A custom Rust loop. You own approvals, budgets and cancellation, which the loop needs anyway. The cost is every streaming edge case, forever, in the one place a wrong tool call becomes a real filing.
- B. A maintained Rust framework behind an adapter. Its tool calling and streaming arrive free. The cost is that its notion of a run sits beside our registry and our durable runner, so either we adopt it or we fight it, and its release cadence becomes ours.
- C. A conformance test first, build the loop, then measure the adapter against it. One fixture set decides. The loser is deleted, the winner implements the same trait, and a later replacement is a swap. The cost is that the fixture set is on the critical path before the first model call works.

**Why.** Four properties decide it, and all four are requirements rather than taste. A resumed turn must not repeat a tool effect. A tool call must be blockable synchronously with a reason. A stream must be cancellable between tokens. Cost must be attributable per turn. A framework can hold all four, and I do not know whether one does, which is the argument for measuring rather than arguing. The fixture set is those four requirements written down, so the work survives whichever candidate wins.

**RQ-02. Where does the harness run?** *Change to B.* This is also RQ-76, and the map makes the answer concrete.

An in-process harness is simple to debug and dangerous to contain.

- A. An in-process module. No IPC at all. The cost is that a runaway loop, an out of memory or a panic takes the window and any unsaved pane state with it, and the kernel boundary becomes a review rule.
- B. A child process behind a typed protocol. The window survives, the boundary is physical, and the protocol is the same one the agent and the tests need anyway. The cost is a supervisor, serialisation on every call, and a stack trace that ends at the process edge.
- C. In process now, with a boundary test and a replaceable interface. Ships first and leaves the door open. The cost is that one test holds the boundary, and an escape hatch nobody pulls tends to rust shut.

**Why.** The harness is the component most likely to hang, loop or exhaust memory, and the application must not go down with it. The control protocol required for the agent is the same plumbing, so the second process is cheaper than it was when this question was first asked.

**RQ-03. Who owns workflow progression?** *Keep C.*

Someone tracks the stage, what to retry and where to resume. The kernel owns state and the harness coordinates, but neither is named as the progression owner.

- A. The harness state machine owns progression. One place to look. The cost is legal procedure living in the generic coordinator, so a second workflow forks the coordinator rather than adding a file.
- B. A durable engine under the kernel owns it. Retries and timers come with the engine. The cost is a second owner beside the workflow data, and two homes for the rule version pin in RQ-42.
- C. The workflow's own procedural adapter owns it, per workflow. Procedure is versioned per workflow and pinned per matter. The cost is that the interpreter must run a workflow it knows nothing about.

**Why.** The docs already make procedural logic workflow specific. Progression becomes data executed by one interpreter, which keeps the harness a general coordinator and defers a shared engine until a second workflow exists.

**RQ-04. Which process owns each adapter?** *Keep C.*

OCR, the browser and filing have different crash and speed profiles. Where each runs decides the blast radius.

- A. Everything in the harness process. Nothing to serialise. The cost is that one malformed scan or one browser crash ends the session, which is the failure this product will meet most.
- B. One separate process per adapter kind. Every failure is contained. The cost is nine supervisors, nine handshakes and a latency floor on calls that are usually microseconds.
- C. Separate processes only where the risk justifies it, such as browser, OCR and hosted applications. The cost is a judgement recorded per adapter rather than visible from the structure.

**Why.** The browser and OCR handle hostile input and heavy native work, so isolation buys containment exactly where failures live. Quiet adapters gain nothing from a process boundary but a tax.

**RQ-05. How does the authority boundary stay structural?** *Keep C, with A's test as the guard.*

The rule is that the harness proposes and the kernel commits. The question is what stops a direct write in code rather than in good intentions.

- A. A build test that fails if harness code touches the ledger, plus a narrow trait. Cheap and catches a leak on the next commit. The cost is a test a re-export or a macro can defeat, so it guards the boundary rather than making it.
- B. The child process from RQ-02. The violation becomes impossible to write. The cost is that same plumbing, and a stack trace that crosses a process when the kernel misbehaves.
- C. A capability object that can only propose, with no ledger handle to misuse. The cost is a typed proposal shape for every kernel call, which is real interface work.

**Why.** A missing handle makes the violation impossible by construction, and the build test catches leaks during development. B arrives anyway through the same trait if RQ-02 goes to B.

**RQ-06. Which component appends Notebook ingestion events?** *Keep B.*

The harness moves files and coordinates, but the Notebook still needs exactly one writer for its events.

- A. The ingestion pipeline appends its own events. Fewest hops, and the step knows its content. The cost is three writers and three audit trails for one item kind.
- B. A domain service appends them after each step, writing through the kernel's single commit path. The cost is a service layer per stage, which the Notebook already needs.
- C. The kernel appends them from validated proposals. One writer, strongest rule. The cost is the kernel learning what an OCR dispute and a date conflict are in order to write them.

**Why.** The component that did the work knows the content, and the kernel still owns the commit. That adds an owner per step without adding an authority.

**RQ-07. What proves the harness really operates the app?** *Sharpen A.* The drill becomes a recorded session replayed through the control protocol, asserting pane state and ledger events.

Generating a file for the lawyer to import is not the same as operating the editor and the browser.

- A. A provider swap drill, replacing an OCR engine or the editor and showing the workflow still runs. Tests the claim the architecture makes. The cost is that two implementations of one capability must exist before anything is proved.
- B. A scripted conformance suite per capability on every release. Broad coverage, cheap to extend. The cost is that it proves behaviour, not replaceability.
- C. A recorded proof run attached to each release. A reviewer can replay it. The cost is staleness, and a recording proves the past.

**Why.** The swap drill tests the property the docs actually claim. The replay through the control protocol is what makes the drill repeatable instead of a demo.

---

## B. Verification design

**RQ-08. What is the simulated-versus-real split per check?** *Keep C.*

Some checks are real today, such as capture provenance and citation parsing. The rest are simulated until a court standard exists.

- A. A written per-check list kept in the docs. One place to read the truth. The cost is a document that drifts from code the first month nobody updates it.
- B. Everything simulated until the standard is proposed. Honest by construction. The cost is discarding the checks that are real today.
- C. A real or simulated tag on every verdict, generated from A's list. The cost is that every adapter must set the tag, and a missing tag has to be a hard failure.

**Why.** A separate list goes stale. A tag at the point of use stays visible, and the source list keeps the tags honest.

**RQ-09. How is validator independence enforced in code?** *Keep B.*

The component that proposes a claim must not be the one that checks it.

- A. Compare actor and task now, add fields later. Cheap. The cost is that every verdict written before the other fields exist can never be rechecked.
- B. Compare actor, task, model family and the cited source hash from the first commit. The cost is that adapters must publish their model family and the hash of what they read.
- C. Enforce by structure only, with separate extensions and no kernel rule. The cost is independence as a convention, which is what the gate exists to replace.

**Why.** The check is a field comparison at append time, so it is cheap now, and the failure it prevents is silent. Retrofitting the fields later invalidates everything written before.

**RQ-10. What must a verdict contain to count as evidence?** *Keep B.*

A verdict that says "correct" without pointing at what it judged proves nothing.

- A. Source and paragraph. Reviewable. The cost is that nobody can tell whether the judged text changed afterwards.
- B. Source, paragraph and the version hash judged. Freshness becomes one comparison. The cost is that every verdict carries the hash of what it judged, which the draft store must supply.
- C. No rubric, the human in the loop judges. The cost is a verdict that is an opinion with no evidence attached.

**Why.** The version hash makes the freshness rule in RQ-11 possible, and the paragraph makes the verdict reviewable. The standard's own object set already names these fields.

**RQ-11. Do verification and approval bind to the version they judged?** *Keep A.*

If the draft changes after approval, the old approval should stop counting. The filing token already works this way.

- A. Any edit reverts badges and reopens the gate. A stale approval cannot pass. The cost is friction the advocate feels on every edit.
- B. Approvals stand until revoked. No rework. The cost is the worst silent failure in the workflow.
- C. Only the filing token binds to the hash. Partial. The cost is that verification and approval disagree about what they judged.

**Why.** One hash comparison prevents an approval landing on words it never saw.

**RQ-12. One outcome vocabulary?** *Keep A.*

The docs define six gate states. Verifiers produce four. Two vocabularies in one system cause mapping bugs.

- A. Keep the six gate states and map verifier output onto them. One vocabulary in the human view. The cost is a mapping function that must be tested, because a wrong map silently upgrades a result.
- B. Keep the verifier's four states and extend the docs. Matches the literature. The cost is editing the canonical docs to suit an adapter.
- C. Two layers on purpose. Honest separation. The cost is two vocabularies on one screen and the mapping happening in the reader's head.

**Why.** The docs are the source of truth, so the adapter maps to them. One mapping function in one place is cheaper than a vocabulary change rippling through every gate.

**RQ-13. Do simulated validators need model-family diversity?** *Keep C.*

Two checkers from the same model family tend to make the same mistakes, so their agreement means less.

- A. Not required while validators are simulated. The cost is that two Qwen-family checkers agree for the same reason one of them is wrong.
- B. Required from the start for every check. Strongest signal. The cost is a second provider and a second bill for a date comparison.
- C. Required only for high-stakes checks. The cost is a per-check policy table that someone maintains.

**Why.** Diversity costs a second provider, and the stakes are not equal across checks, so the policy belongs in data per record type.

**RQ-14. What does "verified" mean when citations stay unresolved?** *Keep B.*

Some citations will not resolve against the neutral-citation corpus. Filing needs a rule for those.

- A. Block until every citation resolves. Nothing unchecked ships. The cost is that an incomplete corpus blocks filing forever, which makes the gate lie in the other direction.
- B. Proceed with an explicit unresolved list the lawyer signs. The cost is that the signature must bind to the exact list, or it signs something else next week.
- C. Proceed and record unresolved items quietly. The cost is hiding the one failure the product exists to prevent.

**Why.** "None found in the tiers searched" is a legal answer and "not checked" is not. A signed list keeps responsibility with the advocate.

**RQ-15. What measures the verifiers and adapters?** *Keep A.*

A gate is only trustworthy if its own error rate is known.

- A. A planted-defect corpus with reported error rates, pinned by version. The cost is that planting defects is real work before any gate ships, and a bad plant measures the plant.
- B. Gold sets from past matters with periodic spot checks. Real material. The cost is that spot checks cannot say what was missed.
- C. No measurement, the human is the check. The cost is gates nobody can falsify.

**Why.** Planted defects give a catch rate per check and catch regressions. Spot checks cannot measure a miss, and no measurement makes the gates a claim.

**RQ-16. Is adverse-authority comparison mandatory at the grounds gate?** *Keep C.*

Failing to cite the case against you is the most expensive error in a draft, and forcing a comparison adds friction.

- A. Mandatory whenever any authority exists. Forces it everywhere. The cost is blocking on an incomplete search, which teaches people to override.
- B. Warning only. Never blocks. The cost is that warnings are clicked through exactly when they matter.
- C. Mandatory where it is possible, with an honest none-found state recorded. The cost is that the coverage statement must be true, which is a data problem rather than a policy one.

**Why.** Blocking on an incomplete search creates false failures, and warnings get ignored under time pressure. C forces the comparison where it can and records the coverage where it cannot.

**RQ-17. Is limitation computation a lawyer-first gate?** *Keep A.*

Limitation can end an SLP, and who computes first shapes reliance.

- A. The lawyer records a call before seeing any machine answer. The cost is that the lawyer works with no help at all.
- B. The AI computes first and the lawyer confirms. Helpful. The cost is anchoring on a number a reviewer will take on trust.
- C. Information only, no gate. The cost is treating the most expensive error class as a hint.

**Why.** A wrong limitation date is unrecoverable after filing, and the recorded lawyer call is the defensible artefact.

**RQ-18. How are overruling mechanics enforced?** *Keep A.*

A smaller bench cannot overrule a larger one, and treatment edges carry the citing paragraph. Both are mechanical.

- A. Deterministic bench-strength and date checks. Arguable and visible. The cost is that the corpus must carry bench strength and dates for both judgments, and it does not always.
- B. Validator judgment only. Handles nuance. The cost is correlated model error on a question that is arithmetic.
- C. Human judgment only. The cost is leaving the most expensive miss unassisted.

**Why.** Bench sizes and dates are facts a rule compares, and a mechanical check cannot be argued with.

**RQ-19. How is citation voice captured?** *Keep A.*

A passage can be the holding, counsel's submission, a lower court's view or a dissent. Citing a submission as a holding is a classic drafting error.

- A. A voice field on every citation, enforced at the gate. The error becomes a gate rather than a habit. The cost is that extraction must classify voice, and a wrong voice is a new error of the same shape.
- B. Capture voice where the extractor finds it, without enforcement. Cheap. The cost is that a submission can still be cited as a holding.
- C. No field, the human catches it. The cost is the error class always slipping through.

**Why.** The field is cheap at extraction and the enforcement is what makes it real. Review alone is where this error survives.

**RQ-20. Outside-corpus versus fabricated?** *Keep A.* This is also RQ-60, and RQ-60 is the sharper form.

A citation matching no record may be old, unpublished or invented. One bucket gives the wrong signal.

- A. A distinct outside-corpus outcome. Three situations get three actions. The cost is that adapters must know the corpus boundary in code to tell "not in the corpus" from "not in the world".
- B. All three count as failed. One rule. The cost is that a coverage gap looks identical to a fabrication.
- C. All three count as unresolved. Safe for the innocent. The cost is that a real fabrication never fails.

**Why.** The three need different actions, which are replacing the source, fixing the citation, or stopping to investigate.

**RQ-21. How are pre-2014 judgments cited and verified?** *Keep A.* RQ-59 is the same question with the 2023 boundary, and the 2014 date is the one that matters.

Neutral citations phase in from 2014, so most of the corpus has none.

- A. Reporter citation plus the court PDF hash as the fallback identifier. Gives provenance where a neutral citation cannot exist. The cost is a reporter parser, a reporters table, and the discipline of capturing the PDF.
- B. Skip verification for pre-2014 citations. The cost is that most of the corpus becomes unverifiable.
- C. Manual verification only. The cost is no record of what was checked.

**Why.** The court's own PDF is the ground truth, so the hash chain supplies provenance exactly where the neutral citation cannot.

---

## C. Records: OCR, dates and corrections

**RQ-22. How do the two OCR engines agree?** *Sharpen A.* A line containing any digit is compared exactly, whatever else differs.

Two engines rarely produce identical prose, and a wrong digit is a legal error while a wrong hyphen is not.

- A. Bounded edit distance for prose, exact agreement for numbers and dates, threshold recorded and versioned. Cosmetic differences pass and numbers stay strict. The cost is a threshold to choose and version, plus a rule that one differing digit disputes the whole number.
- B. Exact agreement always, everything else to review. One rule, no threshold. The cost is a review queue full of hyphenation, and reviewers who stop reading it.
- C. Confidence-weighted choice with both readings stored. Uses what the engines report. The cost is that confidence is not calibrated across engines, so the choice is a guess wearing a number.

**Why.** Exact equality drowns the reviewer in cosmetics, and the digit check is where the legal errors live. The map adds one condition: the digit rule wins over the prose rule whenever a line contains a number.

**RQ-23. What reference date applies when a file has no header date?** *Keep A, with B as the fallthrough.*

Relative dates such as "thereafter" need an anchor, and an undated file has none.

- A. Ask once per file and record the lawyer's answer as the anchor. Recoverable facts are kept with provenance. The cost is one question per undated file.
- B. Leave the dates unresolved. Honest and free. The cost is losing dates one click would have saved.
- C. Use the portal's filing date for the file. No question asked. The cost is that the portal's filing date is not the document's date, so the anchor is wrong in a way that looks right.

**Why.** The lawyer can date a file in one click, and a recorded answer carries provenance. Inferring across documents is the error class the header-date rule exists to prevent.

**RQ-24. How are corrections of facts and events modelled?** *Keep A.*

A wrong date or party name will happen, and the record is append-only, so a fix is a new entry.

- A. A correction is a new record version and gates read the current version. One correction model shared with drafts. The cost is that every reader selects the current version, and one forgotten reader shows a stale fact.
- B. A correction event supersedes the old event by reference. Append-only and small. The cost is that every query resolves a supersession chain.
- C. A tombstone retracts the old event and the graph drops it. The graph stays clean. The cost is that history disappears at the moment the ledger exists to keep it.

**Why.** It reuses the document revision model, so there is one correction idea in the system, and no query resolves chains.

**RQ-25. How is erasure handled against an append-only record?** *Keep A.*

A client may demand deletion, and the chain cannot be edited in place.

- A. Destroy the content key and append a tombstone. Content becomes unreadable and the chain stays intact. The cost is per-document key management in the blob store, which must exist before the first request.
- B. Physical deletion. Simple and complete. The cost is the chain's whole claim, and a chain with a hole is not evidence.
- C. Refuse and log the request. Honest. The cost is that the software declines an obligation the firm cannot.

**Why.** It is the only option that honours both the chain and the demand, and nothing is rewritten in place.

**RQ-26. Are rejected writes recorded?** *Keep A.*

When a component writes without authority the ledger refuses, and the question is whether the refusal is visible.

- A. A separate audit table records rejections. Repeated attempts become visible and the canonical record stays canonical. The cost is a second table to read and retain.
- B. Dropped silently. No noise. The cost is that a misconfigured component and an idle one look identical until something goes missing.
- C. The ledger records a rejected-write event. One stream to read. The cost is that refusals change what the canonical record means.

**Why.** Repeated unauthorised attempts are exactly what an audit needs, and the audit table keeps the ledger canonical.

**RQ-27. How do concurrent lawyer and agent edits resolve?** *Keep A.*

Both may edit between saves, and new revisions never overwrite, so the merge mechanics still need an answer.

- A. Compare-and-swap heads, a stale parent is rejected. Conflict becomes explicit when it happens. The cost is that the advocate sees a rejection instead of a silent merge.
- B. Last writer wins with a warning. Never rejects. The cost is losing an hour of drafting with no trace.
- C. Lock the document while the agent edits. No conflict at all. The cost is locking the advocate out of their own document.

**Why.** The swap check is small and turns an invisible conflict into an explicit one, and the drafts store already needs the compare-and-swap head.

---

## D. Sessions, effects and context

**RQ-28. What does resume mean exactly?** *Sharpen A.* The cache is the model trace store, keyed by the request hash including the context manifest hash.

After a crash the harness must continue. Re-calling the model repeats thinking and may repeat an action.

- A. Replay a recorded transcript from a stored response cache and report the first difference. Deterministic, and a repeated side effect is impossible. The cost is that the trace store becomes the largest table in a workspace, and the key must include everything that shaped the prompt.
- B. Re-call the model on resume. No cache, no storage. The cost is paying twice, thinking twice, and possibly acting twice.
- C. Hybrid, replay for reads and re-call for reasoning. Best of both on paper. The cost is two resume semantics and a rule for which applies.

**Why.** Replay cannot repeat an external effect, which is the failure that matters, and the first-divergence report says where behaviour changed. The map places the cache in the trace store, so the key has to cover the manifest.

**RQ-29. How are external effects covered beyond filing?** *Keep A.*

Downloads, uploads and submissions can leave the system unsure what happened.

- A. An outbox with an unknown state for every external effect. One mechanism and one word for uncertain. The cost is that every adapter writes through the outbox rather than calling out directly.
- B. An outbox only for filing. Minimal. The cost is that a duplicate download or a double email has no way to say unknown.
- C. No outbox, per-adapter retry rules. Local. The cost is one notion of uncertainty per adapter.

**Why.** A duplicated download is cheap and a duplicated submission is not, and both come from the same blind retry. One mechanism is cheaper to reason about than special cases.

**RQ-30. What is the approval-to-effect ordering rule?** *Keep the hybrid, A for ordering and B for a lapsed deadline.*

An approval must precede the action it authorises, and approvals can expire while a filing is in flight.

- A. The approval event must precede the effect, and a lapse means cancelled. Ordering is provable from the event sequence. The cost is that recording a lapse as cancelled may be false, because the request may already have left.
- B. A lapse means unknown, and a human reconciles. Honest about the only uncertain state. The cost is a person reconciling every expiry, including the ones where nothing happened.
- C. No deadline, the approval lives until used. Simple. The cost is an approval given for one text being used against another days later.

**Why.** The ordering is provable from sequence, but "cancelled" would be a lie if the submission reached the portal. The honest state after a lapse is unknown, which the outbox already reconciles.

**RQ-31. Are session transcripts canonical records or harness-local state?** *Keep B.*

A transcript can be audit evidence or working memory, and the answer decides retention and what a fork means.

- A. Canonical audit records owned by the kernel. One place for everything. The cost is every model call entering the canonical record, which drowns the ledger.
- B. Harness-local durable state, with summaries and canonical events reaching the record. Clean split, still durable, so recovery works. The cost is that "what did it see" depends on a harness copy, which must travel with a matter.
- C. Canonical, compacted after the matter closes. Bounded size. The cost is that compaction decides which evidence survives, invisibly.

**Why.** The docs already separate execution context from canonical state. Raw transcripts as canonical would create a second authority beside the ledger.

**RQ-32. What is the long-run context policy?** *Keep C, with B as daily practice.*

A full SLP run exhausts any context window, and the record runs to thousands of pages.

- A. Compaction between stages. Simple, one mechanism. The cost is that a summary can drop the anchor a ground later depends on.
- B. Tool-result clearing with persistent notes. Cheap and local. The cost is that the record still does not fit, so the main context thrashes at every stage edge.
- C. Sub-agent workers with typed, capped returns. The cost is that a worker's context is invisible to the main thread, so the context manifest must travel with the result.

**Why.** No amount of clearing fits thousands of pages. Workers with capped typed returns keep the main context sane, and compaction stays the last resort.

---

## E. Filing and product boundaries

**RQ-33. How is the browser submission observed and recorded?** *Sharpen A.* Record the acknowledgement text and its hash, not only a response hash.

The two confirmations and the token are settled. The record should also show what the portal said.

- A. Record the portal response, ideally its text and hash. Cheap proof of what the portal said. The cost is that only what can be captured as text is recorded, and some portals answer with an image.
- B. Record a screenshot plus the response hash. Visual proof, including the image case. The cost is personal data in the record and a screenshot nobody reads.
- C. Token only, no observation record. Minimal. The cost is an unevidenced outcome, which section 11 forbids.

**Why.** The response is the proof of what the portal said. A screenshot adds personal data for little extra value, but a hash alone proves too little when the acknowledgement is text we could keep.

**RQ-34. Which export checks are deterministic blockers?** *Keep A.*

Some defects must stop export rather than warn.

- A. Victim-identity masking blocks export, plus a fixed blocker list. A duty enforced in code, with the list visible. The cost is that a false positive blocks a filing at the worst hour.
- B. Masking warns and the lawyer decides. Matches who carries responsibility. The cost is that a duty becomes a click-through.
- C. No masking check. Fastest export. The cost is a duty the product does not enforce anywhere.

**Why.** Masking is a duty the product cannot leave to a click-through, and a deterministic check cannot be argued with.

**RQ-35. Is the outcome-prediction boundary a stated product rule?** *Keep A.*

The system could forecast win chances or judge-level outcomes. The docs leave judgment to the advocate and never forbid the product from volunteering a number.

- A. A stated exclusion of win probabilities and judge-level forecasts. No number the advocate cannot audit. The cost is a feature the market will ask for, declined on principle.
- B. Allowed as clearly labelled advisory scores. Useful and labelled. The cost is reliance the product cannot defend.
- C. Allowed, the lawyer's judgment governs. The cost is that the first forecast becomes the case theory before anyone notices.

**Why.** One sentence prevents an adapter from volunteering a number nobody can audit, and keeps the product's voice inside the evidence.

**RQ-36. What is the AI-origin manifest and receipt format?** *Keep A.*

The system should be able to show what assistance a filing had.

- A. A manifest and receipt per filing. Answers the question a registry or a client actually asks. The cost is an artefact per filing, generated and stored at the moment of filing.
- B. A manifest per matter, refreshed as work proceeds. Cheaper. The cost is blurring what a specific filing contained, which is the only version anyone disputes.
- C. No manifest. The cost is no way to show what help a filing had, in a product whose claim is exactly that.

**Why.** The filing is the consequential event and the unit the two confirmations already guard.

**RQ-37. What is the offline requirement?** *Sharpen B.* The local judgment mirror makes verification offline for anything already captured.

Court premises have poor connectivity, and which parts must work offline shapes the architecture.

- A. Full offline capture and verification. Works in a basement. The cost is shipping models and a corpus snapshot as a second distribution.
- B. Offline capture only, with verification offline against the local mirror. Matches where connectivity fails. The cost is that the portal itself waits for a connection.
- C. No offline guarantee. Simplest to promise. The cost is that capture fails at court, the one place it is needed.

**Why.** Capture happens where connectivity fails. A full offline promise would force local model infrastructure for a case that rarely occurs, and the mirror already covers captured judgments.

---

## F. Shell

**RQ-38. Which Rust GUI hosts the workbench?** *Change to A. Decided.*

Tauri, TypeScript and Electron are excluded. The application still needs a shell.

- A. egui with winit, as decided. One process, one look, and the document and PDF widgets are ours, which is what the anchoring work needs. The cost is that the web ecosystem is unavailable, and text input, IME and accessibility are ours to get right.
- B. Another Rust toolkit such as Iced or GTK. Some batteries included. The cost is a second widget model beside the document renderers, and weaker integration with hosted application panes.
- C. A Rust backend serving a plain HTML page in the system browser. Fastest shell to build. The cost is a browser process, an HTTP boundary, and the canvas problem returning in a form a web page cannot solve for a document viewer.

**Why.** The browser-shell recommendation predates the component map and the decision. An immediate-mode shell gives one process and lets the viewer and the PDF surface share the anchor model directly.

---

## G. Capability and reference enforcement

**RQ-39. Are capability limits enforced at runtime, not just declared?** *Keep A.*

An adapter that cannot support tracked changes must not be believed about tracked changes.

- A. A machine-readable capability manifest per adapter, with every claim gated against it. A declared limit becomes behaviour. The cost is that every adapter ships a manifest and a test proving it true.
- B. Manifests documented and enforced by humans. No code. The cost is a limit nothing enforces.
- C. The harness asks the adapter at run time and trusts the answer. Flexible. The cost is the adapter grading its own homework.

**Why.** A declared limit that nothing enforces is a comment. Runtime gating also gives the real-or-simulated tag a home.

**RQ-40. Are provenance references validated at write time?** *Keep A.*

The traceability chain only works if every reference points at something that exists.

- A. Schema-validated references at write time, and the kernel refuses an event whose references do not resolve. An unresolvable reference can never enter. The cost is that every writer resolves before writing, so a large import pays up front.
- B. Validation at review gates only. Cheaper writes. The cost is broken references found one at a time by reviewers.
- C. Validation at filing. Cheapest. The cost is a rebuild at the worst possible moment.

**Why.** Enforcing it at the boundary keeps the graph queryable, because a broken reference never enters it.

**RQ-41. How do adapters stay healthy against a changing portal?** *Keep A.*

Portals change without notice, so capture and filing logic breaks silently.

- A. A contract test per adapter in CI, plus a runtime health check that degrades to a human-completable flow. The cost is a fixture per portal that must be refreshed, which is maintenance nobody enjoys.
- B. Runtime health checks only. Catches a run that has already gone wrong. The cost is a silent bad capture before the check fires.
- C. Manual retesting when a change is noticed. The cost is that the advocate is the monitor.

**Why.** The contract test catches the break at build time, the health check at run time, and the human fallback keeps the advocate working.

**RQ-42. What happens to an in-flight matter when a procedural rule version changes?** *Keep A.*

A matter may sit mid-workflow when a filing rule is updated, and a silent switch makes the record unfollowable.

- A. The matter pins the version it started under, and a new version is adopted only at a stage boundary with an explicit event. One coherent trail. The cost is that old rule packs stay shippable while any matter is open.
- B. Every matter always uses the latest version. Simple. The cost is a mid-stage rule change nobody recorded.
- C. Fork the matter per version. Exact. The cost is parallel matters on parallel rule sets, and a support matrix that grows without bound.

**Why.** Pinning keeps the audit trail coherent, and the stage boundary gives the advocate a recorded choice rather than a silent swap.

---

## H. The standard and its CLI

**RQ-43. Which stack does the standard and the CLI use?** *Keep A.*

The stack rule is Rust, no Tauri, no TypeScript, no Electron. The standard outlives the application, so this is not cosmetic.

- A. Rust for the CLI and validators, JSON Schema normative, no generated TypeScript. One language, one implementation. The cost is that the schema must be written and versioned before the CLI does anything useful.
- B. A TypeScript SDK plus the Rust CLI as a second implementation. Types for third parties, and the architecture's own two-implementation proof. The cost is two implementations of every check, and the second one drifts.
- C. Rust CLI only, and drop the SDK. Smallest surface. The cost is that a third party writes their own types to conform.

**Why.** A verifier in one language is enough, and the second implementation the architecture wants is the application rather than a second CLI.

**RQ-44. What is the normative artefact, and what is generated from it?** *Sharpen A.* There is no schema in this checkout, so A starts by writing one.

Two artefacts could claim to be the standard, and the earlier work already drifted.

- A. JSON Schema is normative, and the JSON-LD context, the Rust types and the CLI checks are generated from it. One artefact, validators follow. The cost is that JSON Schema cannot express every constraint in prose, so some rules live only in prose and in tests.
- B. JSON-LD is normative and the schema is generated from it. Linked data readers get a graph. The cost is a toolchain between the standard and every validator, for an audience that does not exist yet.
- C. Both hand-maintained, kept in step by a conformance suite. Freedom for both. The cost is drift, which has already happened once.

**Why.** The schema is what a validator runs and what a court can read without a linked-data toolchain.

**RQ-45. Does the standard cover the matter layer, or only the public records?** *Keep A.* Drafts stay explicitly outside it.

The CLI can only check what it can see, and client material never leaves the machine.

- A. The standard covers the public records and the Notebook, and the CLI verifies a matter bundle offline. The advocate's first question becomes checkable. The cost is that the standard carries a Notebook shape the application must not drift from.
- B. Public records and verification records, with the Notebook private to the application. A smaller standard. The cost is that the right impugned judgment cannot be checked to be present.
- C. Public records only. The cleanest boundary. The cost is that the standard has no subject for its own Notebook function.

**Why.** The Notebook is one of the three functions, and it cannot work without a Notebook object. Drafts are a separate store and stay out.

**RQ-46. Which identifier scheme is canonical?** *Keep A.*

Readable forms and machine identifiers can diverge, and a reference that means different things in different components is the failure the architecture forbids.

- A. One scheme, `urn:ulos:`, for every object, with readable forms as display aliases. One parser, one rule. The cost is maintaining the aliases and resisting the urge to let them become identity.
- B. Path IRIs for public objects and URNs for matter objects. Public objects read naturally. The cost is two parsers in every component.
- C. Keep `urn:ilo:` and treat `ulos` as a rename. Least churn. The cost is a prefix nobody chose, kept because it was there first.

**Why.** One scheme means one parser and one validation rule, and an alias costs nothing.

**RQ-47. How does the standard version, and what does a matter pin?** *Keep A.*

Objects carry a standard version, but nothing says what a matter pins when the standard changes mid-matter.

- A. The matter pins one version at creation, and an upgrade is an explicit event at a stage boundary, the same rule as RQ-42. Old matters stay readable. The cost is that every reader handles the pinned version, so version branches multiply.
- B. Every object carries its own version and versions coexist. Independent evolution. The cost is that every reader handles every version.
- C. The application always uses the latest version. Simple. The cost is that an old matter becomes unreadable after a release.

**Why.** It reuses the rule already recommended for procedural rules, so there is one upgrade idea in the system.

**RQ-48. What does the CLI verify, and what does it refuse to claim?** *Keep A.*

A validator's output is not a judicial determination and not a guarantee of acceptance, and the CLI needs a stated scope or it will be read as one.

- A. Structure, hashes, signatures, identifier syntax, Act and section identity, and anchors, with a printed refusal list. Reproducible offline. The cost is that the CLI gives up exactly the questions a lawyer most wants answered.
- B. Also run the advisory scorers. More coverage. The cost is a model inside the verifier, which breaks the independence the standard claims.
- C. Structure and signatures only. The smallest verifier. The cost is giving up identity checks a court could actually run.

**Why.** A is the set of checks that are deterministic and reproducible offline, which is what makes a receipt worth something to a registry officer.

**RQ-49. What is the minimum object set for the first release?** *Keep A.*

The three functions need far fewer objects than a complete module list, and a standard that ships everything ships nothing anyone conforms to.

- A. The objects in the standard's own object model, meaning eight shared and eleven across the three functions. The cost is that every addition later is a version bump with a migration note.
- B. The full earlier module set at 0.1. Complete coverage. The cost is a standard nobody can conform to, and implementations picking subsets.
- C. The shared objects only. Tiny and stable. The cost is that the legislation and citation functions have no subjects.

**Why.** These are the objects the three functions read and write. Everything else can arrive as an extension once a second implementation exists.

**RQ-50. How does the standard treat the court's own codes?** *Keep A.*

Case type codes are numeric, differ by court, and their labels are not unique. Subject codes were reused across versions.

- A. Store `{scheme, code}` with the scheme naming the court and the list version, keep the label verbatim, never renumber. The portal round trip survives. The cost is a scheme and a list version per court.
- B. Store the label only. Readable and simple. The cost is that labels collide, so search and comparison fail quietly.
- C. Map every code to a standard code. Uniform. The cost is an invented mapping nobody can check against the portal.

**Why.** The code is what the portal accepts, so it must survive a round trip.

**RQ-51. What is the conformance suite, and who runs it?** *Keep A.*

A standard is only a standard if two implementations pass the same tests.

- A. A language-neutral fixture set with expected outputs, run by the CLI, with published results. The cost is that fixtures become a product with their own maintenance and review.
- B. The application's own test suite doubles as the conformance suite. Cheapest. The cost is that the application becomes the definition of correct.
- C. Conformance assessed by review. No work. The cost is that conformance is an opinion.

**Why.** The architecture's integration proof is a provider swap, and a swap proves something only if both providers pass the same fixtures.

**RQ-52. What is the hash profile?** *Keep A.*

A receipt is only checkable if two implementations compute the same digest, which means saying exactly which fields are excluded.

- A. A normative exclusion list with test vectors, covering ids, the signature block and anything marked derived. Receipts verify across implementations. The cost is a list that must be versioned with the standard.
- B. Exclude the id and the signature block only. Simple to state. The cost is that the first derived field splits the digest, and a court finds it.
- C. Let each implementation choose. Free. The cost is that no receipt verifies anywhere else.

**Why.** Two implementations computing different digests makes every receipt unverifiable.

---

## I. ULOS-L

**RQ-53. Which India Code route does the CLI use?** *Keep A.*

India Code exposes an anonymous REST API. The aggregator route wraps the same endpoints and needs a client id and key.

- A. The direct API by default, with the registered route as an option. Works with no key, and one adapter covers both. The cost is two response shapes to normalise and undocumented rate limits.
- B. The registered route only. One supported path with a key to manage. The cost is that nobody can run the CLI without registering.
- C. The direct API only. Smallest. The cost is that a registered client cannot use the route their registration exists for.

**Why.** The direct API needs no key, so the CLI works for anyone, and both routes cost one adapter.

**RQ-54. How is an Act identified?** *Keep A.*

India Code gives an id, a number and year, a title and a handle. The handle sometimes points at a test host.

- A. The `act_id` is the key, with the cited number and year checked against it. The cost is that the id is opaque, so debugging starts with a lookup.
- B. Act number and year are the key. Reads like the draft. The cost is that number and year are not unique across jurisdictions, and amendments reuse them.
- C. The title is the key. Most human. The cost is that titles change with amendments, reprints and translations.

**Why.** The id is stable and unique, and the number and year are what a draft cites, so they are the check rather than the key.

**RQ-55. What does ULOS-L do about point-in-time legislation?** *Keep A.*

A draft may need a section as it stood on the offence date, and India Code gives identity and repeal flags but no point-in-time text.

- A. Check identity and repeal, and report not checkable when the draft needs text on a date. States the limit. The cost is that the lawyer still has to find the text elsewhere.
- B. Reconstruct from amendment items. Would answer the question. The cost is a guess dressed as a check, because the items carry no effective date and no before-and-after text.
- C. Skip the check when a date is involved. Avoids a wrong answer. The cost is a silent gap where the draft most needs help.

**Why.** B would be a guess and C hides the gap. Stating the limit is what the architecture asks of every capability.

**RQ-56. Does the first release cover State Acts?** *Keep A.*

State Acts live in per-state collections, and Supreme Court work is dominated by Central Acts.

- A. Central Acts only, with State Acts as a later extension. Matches the work and one collection schema. The cost is that a State Act citation reports unresolved, honestly and repeatedly.
- B. Central and State from the start. Broader on paper. The cost is per-state metadata and edge cases before the Central path is proven.
- C. Central only, permanently. Smallest forever. The cost is that widening later is a court-facing version bump.

**Why.** The State collections are a separate scope with their own edge cases, and the three functions do not need them to be useful.

---

## J. ULOS-C

**RQ-57. Which sources does ULOS-C use, and in what order?** *Keep A.*

The portal is authoritative and needs a solved CAPTCHA. A local mirror is fast and offline. An aggregator is a last resort.

- A. The portal first for anything quoted, the mirror for identity and speed, the aggregator for corroboration only. Matches the ground truth. The cost is two capture paths and a coverage window that must be stated honestly.
- B. The mirror first, the portal on a miss. Fast and offline. The cost is a quote coming from a copy that differs from the Court's text.
- C. The aggregator first, the portal on a mismatch. Cheapest. The cost is a third party becoming the authority.

**Why.** The Court's own copy is the ground truth, the mirror is a convenience, and the aggregator is never authoritative.

**RQ-58. What does a neutral citation verify on its own?** *Keep A.*

A neutral citation identifies a judgment. It does not identify a paragraph, a quote or a proposition.

- A. Identity only, with pinpoint and quote checks needing the text and support never a check. Keeps the axes apart. The cost is that a citation alone answers less than a lawyer expects, so the interface must say what it did not check.
- B. Identity and pinpoint. More useful in one step. The cost is that the pinpoint needs the judgment text, which the standard does not always carry.
- C. Identity, pinpoint and support. Answers everything. The cost is a model inside the verifier.

**Why.** The standard separates the technical axis from the semantic one, and merging them is the error the two-axis design exists to prevent.

**RQ-59. How are pre-2023 judgments cited?** *Keep A.* RQ-21 is the same question, and its 2014 boundary is the one that matters.

- A. Reporter citation plus the court PDF hash. Gives provenance to the era with no neutral citation. The cost is a reporter parser and the discipline of capturing the PDF.
- B. Skip verification for pre-2014 citations. No work. The cost is most of the corpus being unverifiable.
- C. Manual verification only. The cost is no record of what was verified.

**Why.** The court's PDF is the ground truth, so the hash chain supplies provenance where the neutral citation cannot.

**RQ-60. What happens when a citation is outside the mirror's coverage?** *Keep A.*

The mirror is thin for recent years, and a judgment missing from it may exist.

- A. Unresolved with an outside-corpus reason, and a prompt to capture it from the portal. Honest and actionable. The cost is that the prompt is a workflow step, and the coverage window must be true rather than nominal.
- B. Failed. Fails closed. The cost is that a real judgment missing from a thin snapshot reads as invented.
- C. Verified on the aggregator. Resolves. The cost is trusting a copy nobody verified.

**Why.** Absence from a corpus is never fabrication. The distinct outcome is what lets the advocate choose between replacing the source and stopping.

## K. ULOS-N

**RQ-61. What is a Notebook item, and what does ULOS-N require of it?** *Keep A.*

The Notebook holds the impugned judgment, the orders, pleadings and client documents, and only the portal-sourced ones can be checked.

- A. An item with a kind, a source, a manifestation and a capture record, with portal kinds checked and party-supplied kinds recorded as unverifiable. Works for a real matter. The cost is that every item is classified by source, and a misclassification is a silent pass.
- B. Every item must have a capture record. One rule. The cost is failing every matter that contains a pleading, which is every matter.
- C. Check the impugned judgment only. Checks the document that matters most. The cost is that the orders, which the SLP is built on, go unchecked.

**Why.** B would fail a normal matter and C leaves the orders out. The standard needs the distinction, and the application already records source.

**RQ-62. How is the impugned order identified?** *Keep A.*

The portal's own lower-court search finds a case from court type, state, bench, case type, number, year and order date.

- A. The same facts the portal searches on, plus the CNR when known. The facts that can be checked. The cost is seven fields to collect, some unknown when the matter opens.
- B. A free-text reference to the impugned judgment. Easy to write. The cost is an identifier nothing can verify.
- C. A link to a document only. A pointer to bytes. The cost is that replacing the file silently changes the impugned order.

**Why.** The facts the portal searches on are the facts that can be checked.

**RQ-63. How is the `01-01-1900` placeholder handled?** *Keep A.*

Legacy records use that date to mean "no date", and read literally it is a real date.

- A. The importer treats it as unknown, and the check fails an item that carries it as a real date. No manufactured date reaches the chronology. The cost is a special case in every date path that reads portal data.
- B. Store it as a date. Literal and simple. The cost is a fabricated procedural event that looks entirely legitimate.
- C. Drop the field. Removes the noise. The cost is losing the fact that the portal had no date.

**Why.** A manufactured date in a chronology is the error the workflow's date rules exist to prevent.

**RQ-64. How is a capture proven?** *Keep A.*

A document may have come from the portal or from the party, and the difference decides what can be verified.

- A. A capture record with the URL, the final URL, the time, the download hash and a gesture showing the advocate acted. The cost is that a gesture must be defined and recorded on every capture path, including future connectors.
- B. A URL field on the document. Cheap. The cost is that a file the advocate dragged in looks identical to one the portal served.
- C. No capture record. The cost is that provenance is a claim rather than evidence.

**Why.** The agent must not inherit a session silently, and a record is how the advocate's action becomes provable.

---

## L. Process

**RQ-65. What is the change process for the standard?** *Keep A.*

A standard offered to a court needs a version the court can rely on.

- A. A written proposal with competency questions, a data check, public review and an immutable release. The cost is process work before anything is offered.
- B. A changelog. Low effort. The cost is no reliance, because a changelog is not a release.
- C. No process until the proposal. The cost is a proposal that arrives with no history and no review.

**Why.** A changelog does not give a court a version to rely on.

**RQ-66. What is the licence for the standard and the CLI?** *Keep A.* B costs nothing today, so the recommendation blocks no work.

The licence question is skipped for research and development, and a standard offered to a court needs terms.

- A. An open licence for the specification and the code, decided before the first public release. A court can adopt it and a third party can implement it. The cost is a decision made early.
- B. Decide at the court proposal. The cost is that the first public artefact claiming to be a standard has no terms.
- C. No licence until the product ships. The cost is that nobody outside can build against it.

**Why.** A court cannot adopt a standard whose terms are undecided, and a third party cannot be invited without them.

**RQ-67. How is the standard offered to the court?** *Keep A.*

- A. The schema, fixtures, CLI and results page are public and runnable offline, and the version is handed over with the specification. The court can run the proof without us. The cost is publishing our own conformance results, including the ones that fail.
- B. The specification is public and the implementation stays with us. Keeps the code ours. The cost is that the court must trust a vendor about the thing a standard exists to take on trust.
- C. Wait until the application is finished. The cost is that the first contact is a pitch.

**Why.** The claim that the standard is a grammar of proof rather than an engine holds only if the court can run the proof without us.

---

## M. Workspace and record shape

**RQ-68. Is a matter a folder or a record?** *Keep A. Decided in favour of the folder.*

The workspace component creates matters. If a matter is a folder, Explorer can open it and any tool can copy it.

- A. Folder first, with a manifest, and the registry pointing at it. Survives a corrupt database, copies with Explorer, backs up with anything. The cost is two sources to keep in step, and a registry that rebuilds by scanning.
- B. Record first and the folder created on demand. One source. The cost is that nothing exists until the application runs, and a lost database loses the case's address on disk.
- C. Folder only, no registry. Smallest. The cost is that "which matters exist" is a disk walk.

**Why.** The folder is the thing that survives. The registry is an index that can be rebuilt.

**RQ-69. Where do evidence bytes live?** *Keep A.*

A captured judgment, a client bundle and a re-download can be the same bytes.

- A. A content-addressed blob store, with one evidence entry per document carrying the original name and the capture record. Duplicates collapse and a rename cannot break a hash. The cost is an indirection when a human opens evidence by hand.
- B. Files under `evidence/<original name>` with hashes in the database. Readable. The cost is that one edit destroys the only copy and a rename breaks the hash.
- C. Both, mirrored. The cost is two copies to reconcile and a rule about which is canonical that nobody remembers.

**Why.** Dedup becomes free, hashes survive renames, and the document list stays readable because the name lives on the entry.

**RQ-70. One database per workspace, or one for the whole application?** *Keep A.*

Matters differ in size and value, and where the database sits decides what a corruption costs.

- A. One database per workspace plus a small global registry. A matter is movable and restorable alone. The cost is that a cross-matter query needs the registry or an attached database.
- B. One global database. One file to back up. The cost is that every matter is hostage to that file and one writer.
- C. One per matter plus one per workspace. Separation at both levels. The cost is an extra level with no clear owner.

**Why.** A matter becomes self-contained, which is also what an export bundle needs.

**RQ-71. Do evidence and drafts share a document store?** *Keep A.*

Evidence must never change. A draft changes by definition.

- A. Two stores, immutable evidence and versioned drafts with moving heads. Opposite rules live in different types. The cost is that a draft quoting evidence carries a reference rather than a copy, so the interface must resolve it.
- B. One store with a flag. One model. The cost is immutability becoming a condition someone forgets, and the first forget is unrecoverable.
- C. Drafts as plain files outside the record. The cost is no revision history, which the approval gate depends on.

**Why.** Opposite rules belong in different types, not in a condition.

**RQ-72. Who owns a draft revision when a hosted WordCraft edits it?** *Keep A.*

WordCraft keeps its own files, and the architecture says a revised petition is a new revision.

- A. Our draft store owns the revision, and WordCraft works on a copy and returns bytes plus its own files. The kernel stays authoritative and the hosted application stays replaceable. The cost is an import and export at every save, plus a copy the advocate can leave open.
- B. WordCraft owns it and we snapshot on save. Least friction. The cost is losing intermediate states and attribution becoming a file diff.
- C. Shared ownership through a lock. The cost is two writers, a lock protocol across two applications, and a deadlock when one crashes.

**Why.** A hosted application must never be the authority for a record the kernel signs.

**RQ-73. How does the agent see a pane we painted ourselves?** *Keep A.*

The document and PDF panes are canvas, so there is no accessibility node per line.

- A. A control protocol for state and actions, the accessibility tree for standard widgets, and a viewport raster as the fallback. Typed state carries anchors, accessibility carries people and generic agents, the raster covers the rest. The cost is three surfaces to keep consistent and one written rule about which is consulted first.
- B. The control protocol only. One surface, and the richest. The cost is that screen readers and any generic desktop agent see an empty window.
- C. The accessibility tree only. The cost is no paragraph or anchor identity, so the agent can look but cannot mean anything by it.

**Why.** Only the protocol can carry anchor identity. Accessibility is not a dead end, because egui depends on accesskit and egui-winit ships the platform adapter, checked in both manifests on 3 November 2026.

**RQ-74. What shape does the control surface take?** *Keep A.*

The same commands are needed by the agent, by tests and by a human debugging a screen.

- A. One typed protocol with two front ends, a thin CLI and the harness tools. The agent, the test and the human exercise one path. The cost is that the CLI must stay thin and never accumulate logic.
- B. A CLI only. One artefact. The cost is the harness shelling out for everything and losing typed errors.
- C. An HTTP API only. Familiar. The cost is a port, a server and authentication inside a single-user application.

**Why.** The agent, the test and the advocate exercise the same path, so a bug found by any of them is the same bug.

**RQ-75. How much of a document may the agent read at once?** *Keep A.*

A record runs to hundreds of pages, which decides both prompt size and whether the agent and the advocate look at the same thing.

- A. Viewport first, then a page, a paragraph or an anchor on demand. Shares the advocate's frame of reference. The cost is a query API with paging to design and test.
- B. The whole file every time. Nothing to design. The cost is that no prompt fits, and the agent reads what is not on screen.
- C. Summaries only. Smallest. The cost is no verbatim quote, so the quote check has nothing to compare.

**Why.** The viewport is what the advocate sees, so the agent can be corrected by pointing, and a prompt stays a prompt.

**RQ-76. Does the harness run in its own process?** *Close into RQ-02.*

Same question as RQ-02, asked from the map. The recommendation there is now B, a child process behind the typed protocol.

**RQ-77. How is a hosted WordCraft or PdfCraft window shown?** *Keep A, with C as the fallback.*

Both keep their own forks and their own storage, and the question is how their window appears inside ours.

- A. Reparent their window into our pane. One application, native input, IME and text services. The cost is per-window hosting work, and it breaks on some DPI changes and modal dialogs.
- B. Capture frames into a texture. Works for any window. The cost is a frame copy every frame, forwarded input, and text that looks pasted on rather than inside.
- C. Leave them tiled in their own windows and drive them by protocol. Nothing to build. The cost is the advocate switching windows, which makes one application a claim rather than a fact.

**Why.** A is what one application means. C is the fallback when reparenting fights DPI or a modal dialog.

**RQ-78. How far does our own editor go?** *Keep A.*

A viewer and an editing surface are different amounts of work, and the first release needs to show a paragraph and propose a change.

- A. Viewer plus selection, comments and a proposed edit against an anchor, with the hosted editor for full fidelity. This is the agent's editing interface, and it is small. The cost is a proposal format and a review interface, and no full fidelity for the lawyer.
- B. A full editor of our own. One editor for everything. The cost is layout fidelity becoming ours before the workflow is proven.
- C. Viewer only. Cheapest. The cost is that the agent cannot propose an edit in the app, so drafting moves to the hosted editor and loses anchors.

**Why.** The first release needs to propose a change against an anchor, not to lay out a filing.

**RQ-79. Is DOCX the working format for drafts?** *Keep A.*

A draft can live as DOCX, as our own format, or as both with a conversion step.

- A. Our own format is the working copy, and DOCX is an export and import format. A revision head and anchor ids survive, and the hosted editor stays replaceable. The cost is a converter at both ends and fidelity risk at the boundary.
- B. DOCX is the working copy, with revisions tracked by diffing files. No conversion. The cost is that attribution and anchors die at the first save.
- C. Both, kept in step on every save. The cost is two heads to keep identical, which is the drift this question exists to prevent.

**Why.** DOCX has no stable revision head or anchor id, so keeping one format as the record makes the editor replaceable.

---

## N. Rendering, OCR and observation

**RQ-80. How many Chromium processes?** *Keep A.*

One binary can serve many profiles and processes, and the split decides crash containment, login isolation and memory.

- A. One binary, one process per profile, and the agent's browser in its own process. Crash containment and cookie isolation. The cost is a process per profile to supervise, and memory that grows with open profiles.
- B. One process with many tabs. Cheapest to run. The cost is one bad page taking every profile, and the agent sharing a process with the advocate's session.
- C. Two separate binaries. Total separation. The cost is two downloads, two updates and two signatures.

**Why.** Cookies and crashes are per profile, and the agent must never share the advocate's jar.

**RQ-81. Is the agent's browser the same instance as the advocate's?** *Keep A.*

The agent browses public sources constantly. The advocate browses court portals with logins.

- A. Same binary, separate process, headless capable, and attachable to the visible browser when the advocate asks. One asset to ship. The cost is that attachment must be revocable, and the attach moment is itself a consequential action.
- B. A separate download and build. Clean separation. The cost is a second update channel for the same Chromium.
- C. Always the visible browser. Fewest parts. The cost is handing an untrusted page the advocate's logged-in session.

**Why.** One asset, one policy, and the agent profile never holds the advocate's cookies.

**RQ-82. Which PDF raster source is canonical?** *Keep A.*

OCR boxes, viewer rectangles and highlight boxes must line up to the pixel.

- A. pdfium, for the viewer, the OCR input and the anchor geometry. One geometry for three consumers. The cost is a C dependency to build correctly on every platform.
- B. PdfCraft's render crates. Pure Rust and active. The cost is linking their engine while their application is hosted, and their fork cadence becoming our build cadence.
- C. Both, with a comparison test. The cost is two pixel answers to one question, which is the bug this question exists to prevent.

**Why.** A highlight must land on the word the OCR read and the viewer drew. PdfCraft stays the editing application.

**RQ-83. Is Ladybug in the first release?** *Keep A.*

The case graph is a derived projection, and Ladybug is C++ with no maintained Rust binding.

- A. No, typed tables and recursive CTEs behind a graph trait, with Ladybug added when a query fails. No FFI build, and the graph stays what the architecture says it is. The cost is that some path queries will be slow enough to notice.
- B. Yes, from the first commit. Native traversal. The cost is a Windows FFI build before the schema settles.
- C. Only for the judgment corpus. Good for analytics on data we did not write. The cost is two graph implementations, one of them for a corpus that only needs search.

**Why.** The graph is the one store we can delete and rebuild, which makes it the safest thing to defer.

**RQ-84. Which OCR reader goes first?** *Keep A.*

Two readers are needed for the disagreement signal, but not on the same day.

- A. Tesseract first for the plumbing, then the second reader. A child process with structured output, so the line model and the review screen land first. The cost is that the weaker reader sets early expectations, and some anchors move later.
- B. The second reader first. Better readings sooner. The cost is a model download and a runtime before the pipeline can be seen end to end.
- C. Both at once. Earliest disagreement signal. The cost is two integrations before either is proven.

**Why.** The line model, the review screen and the anchors are the work, and Tesseract unblocks them without a model runtime.

**RQ-85. Do the OCR readers run in-process or as processes?** *Keep A.*

Both are heavy native stacks that read hostile files.

- A. As child processes. Containment, and the UI build stays free of a native runtime. The cost is IPC per page, and throughput bounded by process startup unless pages are batched.
- B. In process through an inference runtime. Fastest per page. The cost is one bad scan ending the session and taking unsaved pane state.
- C. One in process, one as a process. Tuned per reader. The cost is two lifecycles and two failure paths.

**Why.** A malformed scan should kill a reader and produce a review item, not the window.

**RQ-86. What does iii own?** *Keep A.*

iii observes. The record of what happened is the ledger.

- A. iii reads our trace stream and shows a live view, owning nothing that must survive. The record survives iii being closed or replaced. The cost is one more process and a stream format to keep stable.
- B. iii owns the trace store. Better tooling out of the box. The cost is history that disappears with a viewer.
- C. No iii. Fewer parts. The cost is rebuilding a live view that already exists.

**Why.** A record that disappears when a viewer closes is not a record.

---

## O. What the agent may touch

**RQ-87. May the agent create a matter?** *Keep A.*

The first instruction in the workflow is often to start a matter on a judgment.

- A. Yes, as a control call that creates the folder and the registry entry, with a visible confirmation when the client is new. Unblocks the first instruction. The cost is a confirmation path that must not become noise for repeat clients.
- B. No, the advocate creates every matter. The cost is that the most natural first instruction is refused.
- C. Yes, silently. Fastest. The cost is a matter created under the wrong client with no moment to catch it.

**Why.** Creating a workspace is reversible and cheap. Creating a new client record is the part worth a confirmation.

**RQ-88. May the agent write files straight into the workspace?** *Keep A.*

The agent has file tools, and the kernel is the only writer of canonical state.

- A. Writes are grants. The agent may write under the inbox and its own scratch area, and record folders are written through the control protocol. Raw material drops in without ceremony. The cost is a grant model with folder scopes, enforced rather than described.
- B. The agent may write anywhere in the workspace. Simplest for the agent. The cost is a direct write bypassing the ledger at exactly the point it exists for.
- C. No filesystem access at all. Strongest. The cost is that the agent cannot receive a file the advocate drags onto a pane.

**Why.** The inbox is a legitimate place for raw material. Evidence and drafts are records, so a direct write would skip the provenance check.

---

## Where this leaves the design

Eighty-eight questions, two changes and one closure. That is a smaller result than it looks, and the reason is worth stating. The questions were mostly about ownership and evidence, and the component map is mostly a list of owners, so the map mostly confirmed them. The two that changed were about where code runs, which is the one thing a parts list can settle.

Three pairs are one question each. RQ-02 and RQ-76 are the same. RQ-20 and RQ-60 are the same with different scope. RQ-21 and RQ-59 are the same with different dates. Closing them would leave eighty-five.

Four questions gate code rather than design, and they are the ones worth answering next. RQ-02 decides the process topology and therefore the protocol everything else speaks. RQ-71 decides whether the record can be trusted. RQ-72 decides who owns a draft revision, which is the difference between a hosted editor and a hosted editor that owns the case. RQ-79 decides what the revision store versions.

Two things were decided before this file was closed. The shell is egui with winit. A matter is a folder with an index beside it.

Every other question was settled on 4 November 2026 in [decisions.md](decisions.md), together with the contradictions, hidden dependencies and loopholes found in the final pass, and the fifteen questions still open (OQ-01 to OQ-15).


