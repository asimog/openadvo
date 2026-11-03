# K. Verification adapter

Components: K01 to K14. See [README](README.md) for tags and conventions.

## Purpose

The application side of verification. The adapter finds what needs checking in a draft and in the Notebook, builds a bundle, runs the `ulos` validator as a separate process, records its output, and maps the four validator outcomes and the open review items into the six gate states the advocate sees. It also runs the application's own non-ULOS gates: factual consistency, draft consistency, filing compliance, limitation and masking. It never re-implements a ULOS check.

## Decisions implemented

P3, P4, RQ-08, RQ-09, RQ-11, RQ-12, RQ-14, RQ-15, RQ-17, RQ-34, RQ-55, RQ-60, X-03, X-07, X-16, L-02, L-03, L-10, L-14, H-05, H-12, H-14, P9.

## Depends on

- U (the validator). The adapter is tested against `ulos` outputs.
- C (records, gates, approvals, disclosure).
- H (facts, dates, impugned order, Notebook items).
- J (draft paragraphs and anchors).
- I (voice, treatment, adverse-authority review states feed gate mapping).

## Assumptions

- `ulos` is installed beside `oa` with a known binary hash per release.
- The Supreme Court Registry's filing-defects list is available as a sourced, versioned document (H-05).

## Non-goals

- No check code for citations, legislation or Notebook identity in the adapter (L-14).
- No `verified` produced by the adapter or by any human.
- No real-or-simulated tag (RQ-08).

## Components

| ID | Component |
|---|---|
| K01 | Verification record store and binding to target hashes |
| K02 | Factual checks: statement to source, dates, parties, numbers, provisions, disputed OCR use |
| K03 | Citation existence through ULOS-C |
| K04 | Legislation checks through ULOS-L |
| K05 | Notebook checks through ULOS-N |
| K06 | Draft consistency |
| K07 | Filing compliance and limitation rule packs |
| K08 | Outcome mapping to gate states |
| K09 | Independence guard |
| K10 | Source stamp |
| K11 | `ulos` invocation (the validator itself is specified in U) |
| K12 | Conformance of the adapter against `ulos` outputs |
| K13 | Verdict UI |
| K14 | Paragraph identification through ULOS-CI |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa verify draft <rev>` | internal | Runs every gate on a revision and records results |
| `oa verify notebook` | internal | Runs ULOS-N on the court-portal component |
| `oa verify bundle <rev> --out <dir>` | query | Writes the bundle that would be sent to `ulos`, for inspection or for running `ulos` by hand |
| `oa verify status <rev>` | query | Gate states, primary state, every blocking item |
| `oa verify attest <record> --note <n>` | human | The advocate self-verifies an `unresolved` item (RQ-60) |
| `oa limitation compute` | internal | Computes limitation from Notebook dates and the rule pack |
| `oa limitation confirm --shown <hash>` | human | The advocate confirms the computation they were shown |
| `oa rules show filing [--version <v>]` | query | The filing compliance rule pack with sources |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Verification pane | Every check with outcome, reason code, the revision judged, and the verification proof (source endpoint, URL, response hash, location, target hash, validator version and hash) | Open the raw `ulos` record; open the source passage |
| Gate state | The primary gate state and every item producing each state | Open each item |
| Attestation | An unresolved item with what the validator could not decide | Self-verify (human command), recorded as advocate-attested |
| Limitation | The computation: every input date, every excluded period, the rule and its source | Confirm (human command) |
| Blockers | Masking blockers and filing-compliance defects with their rules and sources | Open the affected paragraph |
| Catch rates | Each gate's catch rate on the planted-defect corpus, by version | Open each miss |

## Rules

1. **Extraction.** K03 finds every citation span in the draft. Any text matching the loose patterns (`INSC`, `SCC`, `AIR`, `SCR`, `v.`, `vs`, `versus`, `Civil Appeal No`, `SLP`) that the validator does not parse becomes a review item (L-02). K04 finds every statutory reference. K05 takes the Notebook's court-portal items.
2. **Bundle.** The adapter writes a ULOS bundle: the targets with their hashes, the draft anchors, the requested checks, and the matter's pinned standard version. `oa verify bundle` writes exactly what is sent.
3. **One validator.** The adapter runs `ulos verify <bundle>` as a supervised child process and stores the records it returns. A verification record without the `ulos` binary hash of a known release is refused at append (K09, L-14).
4. **Source stamp.** Every resolution attempt in a record names the endpoint used. A record whose endpoint is a fixture source is refused in a production build (K10, RQ-08).
5. **Binding.** Each record binds to the hash of the revision or Notebook item judged. On every new revision, checks whose targets changed are re-run automatically (RQ-11).
6. **Citations block.** Any citation `failed`, or `unresolved` without an attestation, sets "Blocked pending source verification" or "Needs correction", and the disclosure builder refuses (RQ-14).
7. **Reporter-only citations.** A citation with no INSC form is `unresolved` with `insc_required`, and the advocate is asked to supply the INSC citation.
8. **Attestation.** `oa verify attest` records the advocate's self-verification against an `unresolved` record, with the advocate's note. It never changes the record's outcome. The gate treats the item as attested (RQ-60, OQ-08).
9. **Amended sections.** A legislation record `unresolved` with `amended_point_in_time` needs an advocate attestation of the applicable version. Until then it is "Blocked pending legal review" (RQ-55, OQ-09).
10. **Factual checks.** Every factual sentence in the draft must carry event or fact ids. Every date, amount, case number and party name in the sentence must occur in the linked event's anchored text, or the check fails (L-03). Disputed OCR text used as fact fails.
11. **Draft consistency.** Synopsis agrees with the List of Dates and the Factual Matrix; Questions of Law correspond to grounds; every ground has record and authority references; the prayer matches the relief sought; annexure numbers and page references match J11; defined terms and party descriptions are consistent; no paragraph reproduces an advisory score statement.
12. **Filing compliance.** The rule pack is developed from the Supreme Court Registry's filing-defects list, each rule carrying its jurisdiction, applicability, effective date and source. Every defect is a visible review item (RQ-15).
13. **Limitation.** The system computes limitation from the impugned judgment date, the certified copy dates and the rule pack, with every excluded period and its source. The advocate confirms with the inputs shown, and the confirmation records the hash of what was shown. A disputed or unresolved input date makes limitation unresolved (RQ-17, L-10, H-12).
14. **Masking.** Where the case category requires it, victim identity in the draft blocks export. The blocker list is fixed and visible (RQ-34, H-14).
15. **Mapping.** One function maps outcomes and review items to the six gate states, with the precedence in [decisions.md](../decisions.md) 5.3. It is the only place the mapping exists. Research Studio's quick-check results (I14) are not inputs to it (L-17).
16. **Quick check first.** `oa verify draft` asks Research Studio for a quick check of each citation before building the `ulos` bundle, and shows mismatches to the advocate first, to save portal lookups (H-01). The `ulos` run still covers every citation.
17. **Verification runs on the DOCX.** Every check in this group judges a DOCX revision. Nothing is verified on the filing PDF ([decisions.md](../decisions.md) 5.5).
18. **Conversion check.** After J13 converts the approved revision, the conversion check extracts the PDF/A text and compares it, paragraph by paragraph in order, with the approved DOCX revision after the fixed normalisation. Any missing, added or changed paragraph fails the check, naming the paragraph id. The check also validates PDF/A conformance and that the page references match J11. Only a conversion that passes may become a filing payload. This is what carries the DOCX verification over to the filed PDF.
19. **Verdict UI.** From any badge the advocate reaches the source passage in at most two actions. The UI says what was not checked and why.
20. **Measurement.** Each gate has a catch rate on the planted-defect corpus, reported per gate version (RQ-15).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| K-AC-01 | The adapter crate contains no citation, legislation or Notebook check logic: a check fails if it depends on the validator's check modules. | [AUTO] |
| K-AC-02 | A verification record with an unknown binary hash is refused. | [AUTO] |
| K-AC-03 | A production build refuses a record whose endpoint is a fixture source. | [AUTO] |
| K-AC-04 | Editing one paragraph re-runs only the checks whose targets are in that paragraph, and the old records stay bound to the old revision. | [AUTO] |
| K-AC-05 | One `unresolved` citation puts the draft in "Blocked pending source verification" and the disclosure builder refuses. After `oa verify attest`, the item is attested, the outcome still reads `unresolved`, and the block lifts. | [AUTO] |
| K-AC-06 | `oa verify attest` from a harness connection is refused. | [AUTO] |
| K-AC-07 | The string "(2019) 5 SCC 1" with no INSC form produces `unresolved` with `insc_required`. | [AUTO] |
| K-AC-08 | "AIR 1973 SC 1461" garbled to "AlR l973 SC 146l" produces a review item from the loose pattern. | [AUTO] |
| K-AC-09 | A factual sentence linked to an event whose text lacks the sentence's date fails the factual check. | [AUTO] |
| K-AC-10 | The mapping function is tested on every combination of outcome and review-item kind, and its primary state follows the precedence. | [AUTO] (exhaustive table) |
| K-AC-11 | Limitation confirmation records the hash of the inputs shown, and changing an input after confirmation voids it. | [AUTO] |
| K-AC-12 | A matter with a sexual-offence category and a victim name in the draft blocks export. | [AUTO] |
| K-AC-13 | Each planted defect in the corpus is caught by its gate, and the catch rate is reported. | [AUTO] |
| K-AC-14 | From any badge the source passage opens in at most two control actions. | [AUTO] |
| K-AC-17 | A renderer fixture that drops one paragraph, or changes one digit, fails the conversion check naming the paragraph id. | [AUTO] |
| K-AC-18 | A faithful conversion of the fixture petition passes the conversion check and PDF/A validation. | [AUTO] |
| K-AC-15 | The filing-defects rule pack correctly reflects the Registry's current list. | [HUMAN] (legal review per rule pack version) |
| K-AC-16 | Limitation computation is correct on twenty lawyer-checked scenarios. | [AUTO+HUMAN] |
| K-AC-19 | Every verification record opens its raw `ulos` JSON and its verification proof. | [AUTO] |
| K-AC-20 | The gate state view lists every item producing each state. | [AUTO] |

## Edge cases

- A citation repeated in several paragraphs. One verification per distinct citation and pinpoint, bound to every anchor.
- `id.` and `supra` references. Resolved to the earlier full citation, and a review item if ambiguous.
- A statute cited by a short name ("the Code", "CrPC"). Resolved through the matter's defined terms, and a review item if ambiguous.
- A petition with no citations. Valid, and the UI says no citations were found and lists the loose-pattern hits if any.
- The rule pack is updated mid-matter. The matter keeps its pinned version until adoption at a stage boundary (RQ-42).

## Failure modes

| Failure | Honest state shown |
|---|---|
| `ulos` crashes | The run is `raised`, no records are written, and the draft stays in its previous gate state with a notice. |
| `ulos` reports `source_unreachable` | Recorded as `unresolved`, which blocks. No retry loop hides it. |
| A source is reachable but slow | Bounded by the per-check timeout, then `unresolved` with `source_unreachable`. |

## Observable outcomes

- The verification pane lists every check with its outcome, reason, source, and the revision it judged.
- The gate state is shown with every item that produces it.
- `oa verify status --json` gives the same picture to the CLI.

## Open questions

- OQ-06, OQ-08, OQ-09.
