# I. Research Studio

Components: I01 to I14. Conventions, test kinds and status words are in the [README](README.md).

**Status:** not started. Built at step 9, after the chat pane and a live provider, because its main surface is the orchestrator working beside a judgment. Verification requests it creates stay `unavailable` until K is integrated (PH-07).

## Purpose

Where legal research and argument development happen. Research Studio finds authorities, reads them, records how each bears on the case, assesses whether a passage supports a proposition, classifies citation voice, checks precedent treatment, builds memoranda, runs the case conference, produces labelled advisory scores, and quick-checks citations against the AWS catalogue. Everything it produces is a candidate for the advocate. It never verifies: existence and paragraph are the validator's job (U, through K).

## Decisions implemented

RQ-16, RQ-18, RQ-19, RQ-32, RQ-35, RQ-57, X-02, X-06, X-14, L-11, L-12, L-17, H-01, H-13, P9.

## Depends on

- D: judgment research runs as sub-agents of the orchestrator.
- H: propositions anchor into the Notebook. F: judgments are captured from the portal before they are quoted.
- K: every adopted authority is sent for verification.
- E02, E03: the research index.
- The research index holds judgments the matter captured plus the AWS catalogue (OQ-02, OQ-15), a finding aid only, with each snapshot's coverage and lag stated. Bench strength and decision dates come from the court's records (H-13).

## Non-goals

- Research Studio never produces `verified`.
- No judge-level forecasts and no judge identifier in any score feature (RQ-35, L-12).
- Advisory scores never enter a draft or a filing (L-11).
- Treatment is not citation verification (RQ-16).
- Nothing from the AWS catalogue becomes a verification record, unblocks a gate, or appears in the disclosure as verification (L-17).

## Components

| ID | Component | Notes |
|---|---|---|
| I01 | Research index ingest, coverage stated per snapshot | A finding aid only |
| I02 | Query planner: exact citation, statute, keyword, hybrid | A citation is looked up as a citation |
| I03 | Citation span finder for research text | Parsing for verification is the validator's |
| I04 | Authority retrieval: capture from the portal before quoting | Hands the citation to K |
| I05 | Judgment structure: paragraphs, reporter blocks, headnotes, speaker segments | Feeds voice and the paragraph anchor |
| I06 | Legislation lookup | Reuses F; verification is ULOS-L through K |
| I07 | Statute mapping data (for example IPC to BNS), effective dates, sources | Governing date first |
| I08 | Treatment and adverse authority | Rules 5 to 8 |
| I09 | Note and memorandum builder | Typed propositions bound to sources |
| I10 | Case conference | Package, comparison, recorded accept and reject |
| I11 | Support and voice assessor | Does this passage support this claim, and in whose voice |
| I12 | Advisory outcome scores | Labelled advisory |
| I13 | Multi-agent argument evaluation | For and against a ground, for the advocate to read |
| I14 | Quick check against the AWS catalogue | An early signal, never verification |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa research search <query> [--mode citation\|statute\|keyword\|hybrid]` | query | Searches the research index |
| `oa research fetch --insc <citation>` | external | Captures the judgment from the portal through F |
| `oa research propositions` | query | Propositions and bound authorities |
| `oa research bind <proposition> --authority <id> --para <n> --role supporting\|adverse\|distinguishable\|other` | internal | How an authority bears on a proposition |
| `oa research treatment <authority>` | query | Known treatment with citing paragraphs |
| `oa research voice <authority> --para <n>` | query | Voice classification and its basis |
| `oa research voice-confirm <binding> --voice <v>` | human | Confirms or corrects voice |
| `oa research support <binding>` | query | The support assessment |
| `oa research memo build [--issue <id>]` | internal | A memorandum from bound propositions |
| `oa conference package` | internal | The case-conference package |
| `oa conference decide <argument> --accept\|--reject --reason <r>` | human | The advocate's decision |
| `oa research score <ground>` | internal | An advisory score with its basis |
| `oa research debate <ground> [--agents <n>]` | internal | A multi-agent evaluation |
| `oa research quick-check <citation\|draft-rev>` | external | Quick-checks against the AWS catalogue |

## GUI

View pane views; the orchestrator in the chat pane drives research beside them.

| View | Shows | The advocate can |
|---|---|---|
| Propositions | Each proposition with bound authorities and roles | Bind or unbind |
| Authority card | Role, voice with basis, treatment with citing paragraphs, support, verification outcome, quick-check result, each in its own treatment | Confirm voice (human control); open the judgment at the paragraph |
| Adverse-authority review | Found and addressed, none found with coverage, or incomplete | Record the review |
| Conference board | Proposed, accepted and rejected arguments with reasons | Accept or reject (human control) |
| Advisory scores | Each score with basis and the advisory label | Read; never insert into a draft |
| Debate | Each sub-agent's argument with anchors | Open each anchor |

## Rules

1. **Capture before quote.** A judgment is quoted only from a portal capture (I04). Index text finds authorities; it is never the quoted text.
2. **Every adopted authority goes to verification.** K sends it to the validator (ULOS-C, ULOS-CI). Until K is integrated, the request stays `unavailable`, which blocks.
3. **Support vocabulary.** `supports`, `partially_supports`, `does_not_support`, `contrary`, `cannot_assess`. Never a validator outcome word.
4. **Voice.** `holding`, `obiter`, `counsel_submission`, `lower_court_view`, `dissent`, `concurrence`, `unknown`, with the basis. A candidate until confirmed. An unconfirmed voice on a citation in a ground puts the draft in "Blocked pending legal review" (RQ-19).
5. **Overruled authority is mandatory.** It gets a mandatory review item, and grounds approval is blocked until the advocate records how it is addressed (RQ-16).
6. **Difference of opinion is a warning.** Doubted, distinguished or a coordinate bench's conflicting view warns and does not block.
7. **Overruling mechanics.** With bench strength and dates known for both, a deterministic check flags a smaller bench purporting to overrule a larger one, or an earlier judgment purporting to overrule a later. Missing facts give a review item, never a guess (RQ-18, H-13).
8. **Adverse-authority review.** Before grounds approval: found and addressed; none found within the stated coverage; or incomplete.
9. **Memoranda** separate established facts, disputed facts, propositions, assumptions and open questions, each proposition with anchors.
10. **Case conference.** Accepted and rejected arguments are recorded with reasons. Decisions are `human`.
11. **Advisory scores.** Ground, score, statement, basis, model and configuration, and the label `advisory`. Features may be subject category, bench strength, disposal type and period. No judge identifier field (RQ-35, OQ-10).
12. **Scores stay out of drafts.** A score cannot be a draft anchor target, and the draft check refuses a paragraph reproducing a score statement (L-11).
13. **Multi-agent evaluation** runs sub-agents with distinct instructions and records each argument with anchors. It decides nothing.
14. **Quick check.** Compares neutral citation, parties, decision date, and the paragraph and quote when given. Reports `found`, `not_found`, `mismatch` (naming the field) or `unavailable`.
15. **Quick check is not verification.** Its own record type, labelled "Quick check, not verified" everywhere. The kernel refuses it as a verification record; the gate mapping ignores it; the disclosure does not list it (L-17).
16. **Quick check first.** It runs before any portal lookup so wrong citations are fixed before a CAPTCHA (H-01). A `found` never skips the portal check.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| I-AC-01 | A quote inserted from index text without a portal capture is refused. | [AUTO] | remaining |
| I-AC-02 | Adopting an authority creates a verification request to K. | [AUTO] | remaining |
| I-AC-03 | The support assessor never emits a validator outcome word. | [AUTO] | remaining |
| I-AC-04 | A ground citing an authority with unconfirmed voice puts the draft in "Blocked pending legal review". | [AUTO] | remaining |
| I-AC-05 | `oa research voice-confirm` from a harness connection is refused. | [AUTO] | remaining |
| I-AC-06 | An overruled authority blocks grounds approval until addressed; "distinguished" warns and does not block. | [AUTO] | remaining |
| I-AC-07 | A two-judge bench recorded as overruling a three-judge bench is flagged; missing bench strength gives a review item. | [AUTO] | remaining |
| I-AC-08 | The score feature schema has no judge identifier field; a test fails if one is added. | [AUTO] | remaining |
| I-AC-09 | A score record cannot be referenced by a draft anchor. | [AUTO] | remaining |
| I-AC-10 | A draft paragraph reproducing a score statement fails the draft check. | [AUTO] | remaining |
| I-AC-11 | Every rendering of a score shows the advisory label. | [AUTO] | remaining |
| I-AC-12 | The adverse-authority review cannot be "none found" without a stated coverage. | [AUTO] | remaining |
| I-AC-13 | Voice classification on the gold set meets the agreed share per voice class. | [AUTO+HUMAN] | remaining |
| I-AC-14 | For a sample matter, the authorities found and their treatment are what a competent lawyer expects. | [HUMAN] | remaining |
| I-AC-15 | Memoranda distinguish fact, dispute, proposition, assumption and question correctly. | [HUMAN] | remaining |
| I-AC-16 | A quick check whose parties differ from the catalogue reports `mismatch` naming `parties`. | [AUTO] | remaining |
| I-AC-17 | A quick-check result submitted as a verification record is refused, and a draft whose only check is a quick-check `found` stays blocked. | [AUTO] | remaining |
| I-AC-18 | Every rendering of a quick-check result carries "Quick check, not verified". | [AUTO] | remaining |
| I-AC-19 | The disclosure document has no quick-check result in its verification sections. | [AUTO] | remaining |
| I-AC-20 | Every authority card shows voice, treatment and support each with its basis, and the verification outcome apart from the quick check. | [AUTO] | remaining |
| I-AC-21 | A debate shows each sub-agent's argument with anchors and context manifest. | [AUTO] | remaining |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| I-CT-01 | The AWS catalogue client reads a pinned snapshot's metadata and one judgment PDF, and reports `unavailable` when unreachable. | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| I-GUI-01 | Confirm voice and conference decisions draw through the human control. | remaining |
| I-GUI-02 | Opening an authority at a paragraph opens the judgment in a view pane split scrolled to that paragraph. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| I-VIS-01 | Propositions, authority card, adverse-authority review, conference board, advisory scores and debate in their six gallery states. | remaining |
| I-VIS-02 | An authority card showing a quick-check `found`, a support assessment and an `unavailable` verification side by side, each in its own treatment. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| I-E2E-01 | From the chat pane, research a ground on a sample matter: the orchestrator finds authorities, captures two from the recorded portal, binds them with roles, quick-checks them, and the advocate confirms voice and accepts the ground in the conference board. | remaining |

## Edge cases

- A judgment with no paragraph numbers: voice and support are assessed against the anchored text.
- A larger bench that refers a question without overruling: not overruling; a warning at most.
- A judgment overruled in part, or reversed in review or curative proceedings.
- A statute renumbered by a new code: the mapping has a source and effective date, and the offence date decides.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Treatment data missing | "treatment unknown", and the review cannot be "none found". |
| Sub-agent research fails | Recorded; the proposition stays unsupported. |
| Portal capture fails for an adopted authority | Verification stays `unresolved` or `unavailable`, which blocks. |

## Open questions

- OQ-10.
