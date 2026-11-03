# I. Research Studio

Components: I01 to I14. See [README](README.md) for tags and conventions.

## Purpose

Where legal research and argument development happen. Research Studio finds authorities, reads them, records how each one bears on the case, assesses whether a passage supports a proposition, classifies citation voice, checks precedent treatment, builds memoranda, runs the case conference, produces clearly labelled advisory scores, and runs a quick check of citations against the AWS open-data catalogue of Supreme Court judgments. Everything it produces is a candidate for the advocate. Verification is not done here: whether a citation exists and its paragraph is right is the validator's job (group U, through K).

## Decisions implemented

RQ-16, RQ-18, RQ-19, RQ-32, RQ-35, RQ-57, X-02, X-06, X-14, L-11, L-12, L-17, H-01, H-13, P9.

## Depends on

- D (judgment research runs as sub-agents of the orchestrator).
- H (propositions anchor into the Notebook).
- K (every authority the advocate adopts is sent for verification).
- F (judgments are captured from the portal before they are quoted).
- E02 and E03 (the research index).

## Assumptions

- The research index holds judgments the matter has captured, plus the AWS open-data catalogue of Supreme Court judgments (OQ-02, OQ-15). It is a finding aid, never a verification source.
- The AWS catalogue carries the court's judgment PDFs and metadata including the neutral citation, parties and decision date. Its coverage and update lag are stated per snapshot, not assumed.
- Bench strength and decision dates are available from the court's own records for judgments captured from the portal (H-13).

## Non-goals

- Research Studio never produces `verified`. A research result is not accepted because a model cited it.
- No judge-level forecasts and no judge identifier in any score feature (RQ-35, L-12).
- Advisory scores never enter a draft or a filing (L-11).
- Treatment is not part of citation verification (RQ-16).
- The AWS catalogue is not part of the ULOS standard. Nothing from it becomes a verification record, unblocks a gate, or appears in the disclosure document as verification (L-17).

## Components

| ID | Component | Notes |
|---|---|---|
| I01 | Research index ingest, with the coverage of each snapshot stated | A finding aid only |
| I02 | Query planner: exact citation, statute lookup, keyword, hybrid | A citation is looked up as a citation, not as prose |
| I03 | Citation span finder for research text | Finds candidate citations. Parsing for verification is the validator's |
| I04 | Authority retrieval: capture the judgment from the portal before it is quoted | Hands the citation to K for verification |
| I05 | Judgment structure: paragraph numbering, reporter blocks, headnotes, speaker segments | Feeds voice classification and the paragraph anchor |
| I06 | Legislation lookup | Reuses F04. Verification is ULOS-L through K |
| I07 | Statute mapping data: old to new codes (for example IPC to BNS), effective dates, sources | Governing date first |
| I08 | Treatment and adverse authority | RQ-16 and RQ-18 rules below |
| I09 | Note and memorandum builder | Typed propositions bound to sources |
| I10 | Case conference | Package, comparison, recorded accept and reject |
| I11 | Support and voice assessor | Does this passage support this claim, and in whose voice is it |
| I12 | Advisory outcome scores | Labelled advisory, RQ-35 |
| I13 | Multi-agent argument evaluation | Several sub-agents argue for and against a ground, for the advocate to read |
| I14 | Quick check against the AWS catalogue | An early signal on a citation before the portal check. Never verification |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa research search <query> [--mode citation|statute|keyword|hybrid]` | query | Searches the research index |
| `oa research fetch --insc <citation>` | external | Captures the judgment from the portal through F |
| `oa research propositions` | query | Propositions and the authorities bound to them |
| `oa research bind <proposition> --authority <id> --para <n> --role supporting|adverse|distinguishable|other` | internal | Records how an authority bears on a proposition |
| `oa research treatment <authority>` | query | Known treatment with citing paragraphs |
| `oa research voice <authority> --para <n>` | query | The voice classification and its basis |
| `oa research voice-confirm <binding> --voice <v>` | human | The advocate confirms or corrects voice |
| `oa research support <binding>` | query | The support assessment, in the support vocabulary |
| `oa research memo build [--issue <id>]` | internal | Builds a memorandum from bound propositions |
| `oa conference package` | internal | Builds the case-conference package |
| `oa conference decide <argument> --accept|--reject --reason <r>` | human | The advocate's decision |
| `oa research score <ground>` | internal | Produces an advisory score with its basis |
| `oa research debate <ground> [--agents <n>]` | internal | Runs a multi-agent evaluation |
| `oa research quick-check <citation|draft-rev>` | external | Quick-checks one citation, or every citation in a draft, against the AWS catalogue |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Propositions | Each proposition with its bound authorities and their roles | Bind or unbind an authority |
| Authority card | Role, voice (candidate or confirmed) with its basis, treatment with citing paragraphs, support assessment, verification outcome, quick-check result | Confirm voice (human command); open the judgment at the paragraph |
| Adverse-authority review | Found and addressed, none found with the stated coverage, or incomplete | Record the review |
| Conference board | Proposed, accepted and rejected arguments with reasons | Accept or reject (human command) |
| Advisory scores | Each score with its basis and the advisory label | Read; never insert into a draft |
| Debate | Each sub-agent's argument with its anchors | Open each anchor |

## Rules

1. **Capture before quote.** A judgment is quoted only from a copy captured from the portal (I04). Text from the research index may be used to find an authority, never as the quoted text.
2. **Every adopted authority goes to verification.** When the advocate adopts an authority for a draft, K sends it to the validator (ULOS-C for existence, ULOS-CI for the paragraph).
3. **Support vocabulary.** I11 reports support as `supports`, `partially_supports`, `does_not_support`, `contrary`, or `cannot_assess`. It never uses `verified`, `failed`, `unresolved` or `not_applicable`, which belong to the validator.
4. **Voice.** I05 and I11 classify the cited passage as `holding`, `obiter`, `counsel_submission`, `lower_court_view`, `dissent`, `concurrence` or `unknown`, with the basis (speaker segment, heading, phrasing). Voice is a candidate until the advocate confirms it. An unconfirmed voice on a citation in a ground puts the draft in "Blocked pending legal review" (RQ-19).
5. **Overruled authority is mandatory.** If an authority cited in the draft, or found adverse during research, has been overruled, the binding gets a mandatory review item. Grounds approval is blocked until the advocate records how it is addressed (RQ-16).
6. **Difference of opinion is a warning.** Treatment that is only doubted, distinguished, or a conflicting view of a coordinate bench is a warning on the binding. It does not block (RQ-16).
7. **Overruling mechanics.** Where bench strength and decision dates are known for both judgments, a deterministic check flags a smaller bench purporting to overrule a larger one, and a later judgment purportedly overruled by an earlier one. Where either fact is missing, the result is a review item, never a guess (RQ-18, H-13).
8. **Adverse-authority review.** Before grounds approval, a review is recorded with one of: adverse authority found and addressed; no adverse authority identified within the documented search coverage (with the coverage stated); search incomplete.
9. **Memoranda.** Each memorandum separates established facts, disputed facts, legal propositions, assumptions and open questions. Each proposition carries its anchors.
10. **Case conference.** Accepted and rejected arguments are both recorded with reasons. No argument becomes an approved ground because an agent produced it. Decisions are `human` class.
11. **Advisory scores.** A score record holds the ground, the score, the statement, the basis (authorities, bench-trend features), the model and configuration, and the label `advisory`. Features may include subject category, bench strength, disposal type and period. The feature schema has no judge identifier field. Every rendering carries the advisory label (RQ-35, OQ-10).
12. **Scores stay out of drafts.** A score record cannot be the target of a draft anchor. The draft consistency check refuses a paragraph that reproduces a stored score statement (L-11).
13. **Multi-agent evaluation.** I13 runs sub-agents with distinct instructions (for, against, bench perspective) and records each argument with its anchors. It is read by the advocate and produces no decision.
14. **Quick check.** I14 looks a citation up in the AWS catalogue and compares the neutral citation, parties and decision date, and, when a pinpoint and quote are given, whether the paragraph and quote occur in the catalogue's copy. It reports `found`, `not_found`, `mismatch` (naming the field) or `unavailable`. These words are its own and never a validator outcome.
15. **Quick check is not verification.** A quick-check result is its own record type, labelled "Quick check, not verified" wherever shown. The kernel refuses it as a verification record, the gate mapping ignores it, and the disclosure document does not list it as verification (L-17). Every citation still goes to the portal through `ulos`.
16. **Quick check first.** When the advocate adopts an authority or runs verification on a draft, the quick check runs first, so wrong citations are corrected before any portal lookup and its CAPTCHA (H-01). A `found` does not skip the portal check.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| I-AC-01 | A quote inserted from the research index text without a portal capture is refused. | [AUTO] |
| I-AC-02 | Adopting an authority creates a verification request to K. | [AUTO] |
| I-AC-03 | The support assessor never emits a validator outcome word. | [AUTO] |
| I-AC-04 | A ground citing an authority with an unconfirmed voice puts the draft in "Blocked pending legal review". | [AUTO] |
| I-AC-05 | `oa research voice-confirm` from a harness connection is refused. | [AUTO] |
| I-AC-06 | An authority marked overruled in the treatment data blocks grounds approval until addressed. A "distinguished" treatment shows a warning and does not block. | [AUTO] |
| I-AC-07 | A two-judge bench recorded as overruling a three-judge bench is flagged. Missing bench strength produces a review item. | [AUTO] |
| I-AC-08 | The score feature schema has no field whose name or source is a judge identifier. A test fails if one is added. | [AUTO] |
| I-AC-09 | A score record cannot be referenced by a draft anchor. | [AUTO] |
| I-AC-10 | A draft paragraph reproducing a score statement fails the draft consistency check. | [AUTO] |
| I-AC-11 | Every rendering of a score shows the advisory label. | [AUTO] (UI snapshot) |
| I-AC-12 | The adverse-authority review cannot be recorded as "none found" without a stated search coverage. | [AUTO] |
| I-AC-16 | A quick check of a citation whose parties differ from the catalogue reports `mismatch` naming `parties`. | [AUTO] (fixture catalogue) |
| I-AC-17 | A quick-check result submitted as a verification record is refused by the kernel, and a draft whose only check is a quick-check `found` stays "Blocked pending source verification". | [AUTO] |
| I-AC-18 | Every rendering of a quick-check result carries the "Quick check, not verified" label. | [AUTO] (UI snapshot) |
| I-AC-19 | The disclosure document contains no quick-check result in its verification sections. | [AUTO] |
| I-AC-13 | Voice classification on the gold set is correct for at least the agreed share of passages, measured per voice class. | [AUTO+HUMAN] (gold set by a lawyer) |
| I-AC-14 | For a sample matter, the authorities found and their treatment are what a competent lawyer would expect. | [HUMAN] |
| I-AC-15 | Memoranda distinguish fact, dispute, proposition, assumption and question correctly. | [HUMAN] |
| I-AC-20 | Every authority card shows voice, treatment and support each with its basis, and the verification outcome apart from the quick-check result. | [AUTO] |
| I-AC-21 | A debate shows each sub-agent's argument with its anchors and its context manifest. | [AUTO] |

## Edge cases

- A judgment with no paragraph numbers. Voice and support are assessed against the anchored text, and ULOS-CI will report the paragraph as `unresolved` or `failed` according to the validator's rule.
- A larger bench that refers a question without overruling. Not overruling. A warning at most.
- A judgment overruled in part.
- An authority later reversed in review or curative proceedings.
- A statute renumbered by a new code (IPC section to BNS section). The mapping is data with a source and an effective date, and the governing date of the offence decides which applies.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Treatment data missing for an authority | The binding shows "treatment unknown", and the adverse-authority review cannot be "none found". |
| Sub-agent research fails | The orchestrator records the failure and the proposition stays unsupported. |
| Portal capture fails for an adopted authority | The citation stays `unresolved` in verification, which blocks (RQ-14). |

## Observable outcomes

- Each proposition shows its authorities, their roles, their voice (candidate or confirmed), their treatment, and the support assessment.
- The conference record lists accepted and rejected arguments with reasons.
- Advisory scores appear only in Research Studio panes, always labelled.

## Open questions

- OQ-10 (score features).
