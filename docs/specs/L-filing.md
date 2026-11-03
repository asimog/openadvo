# L. Filing

Components: L01 to L04. See [README](README.md) for tags and conventions.

## Purpose

Agent-operated, advocate-authorised filing. The agent prepares the payload and operates the e-filing portal in the dedicated visible browser. The advocate confirms the exact payload twice. A single-use token binds the confirmations to the payload hash. The system captures what the portal actually said, and reconciles before any second attempt.

## Decisions implemented

RQ-14, RQ-30, RQ-33, RQ-36, X-19, X-24, L-01, L-04, L-13, H-09, P9.

## Depends on

- K (every gate must be clear or attested).
- C (approvals, the filing payload store, tokens, the disclosure builder).
- J13 (the PDF/A filing document).
- M (the visible browser filing profile; never the agent's own browser).

## Assumptions

- The e-filing portal requires the advocate's login and may present a CAPTCHA.
- The portal returns an acknowledgement, a diary number, an error or nothing.

## Non-goals

- No filing through the agent's headless browser (RQ-80).
- No automatic retry after an uncertain result.
- Voice cannot provide either confirmation.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa filing prepare <rev>` | internal | Builds the payload: PDF/A documents, filing information, declarations, disclosure document |
| `oa filing show <payload>` | query | The destination, documents with hashes, declarations and the proposed action |
| `oa filing confirm <payload> --step 1|2` | human | One of the two confirmations, each with an OS user-presence prompt from the CLI |
| `oa filing execute <payload> --token <t>` | external | Operates the portal in the filing profile |
| `oa filing status <payload>` | query | `prepared`, `confirmed_1`, `confirmed_2`, `executing`, `submitted`, `rejected_by_portal`, `unknown`, `reconciled` |
| `oa filing reconcile <payload>` | external | Checks the portal for evidence of an earlier submission |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Filing | The state machine, the payload with every document hash and page count, the destination and declarations | Prepare; confirm twice (human commands); execute |
| Confirmation | Exactly what is being confirmed: destination, documents, declarations, action, payload hash | Confirm or cancel |
| Outcome | The acknowledgement text and hash, the diary number, any defects, the token state | Reconcile an `unknown` filing |

## Rules

1. **Preconditions.** `oa filing prepare` refuses unless the primary gate state is "Ready for advocate review", the final DOCX revision is approved, its PDF/A conversion has passed the conversion check (K), and the disclosure document builds (RQ-14, OQ-06).
2. **Payload.** The payload is the exact bytes of every document, the filing information and the declarations, with one payload hash over all of them in a fixed order. The PDF documents are the PDF/A files J13 converted from the approved DOCX revision (L-04). The payload records both the DOCX revision hash and the PDF/A hash, and the disclosure document names both.
3. **Disclosure.** The AI-use disclosure document lists, per filing, which drafting and research assistance was used, every citation and legislation reference with its outcome, and every advocate attestation in its own section, labelled as advocate-attested, never as verified (RQ-36, L-13).
4. **Two confirmations.** The first and second confirmations are `human` class, separate actions, each showing the destination, every document with its hash and page count, the declarations and the action. The second requires a distinct gesture after the first is recorded. From the CLI each needs an OS user-presence prompt. On a harness connection both are refused (L-01, H-09).
5. **Token.** After the second confirmation the kernel issues a single-use token bound to the payload hash. Any change to the payload voids it. Using it marks it spent in the same transaction that records the effect intent.
6. **Ordering.** The confirmation events precede the effect intent in the ledger, provably by sequence number (RQ-30).
7. **Execution.** The browser action runs in the filing profile of the visible browser. Login and CAPTCHA are handed to the advocate.
8. **Observation.** The portal's acknowledgement text and its hash are recorded, plus any diary number. A screenshot is taken only when the acknowledgement is an image (RQ-33).
9. **Uncertain result.** A timeout, a crash mid-submit, or an unrecognised response is `unknown`. Before any new attempt, `oa filing reconcile` checks the portal for the submission (by diary search or the e-filing dashboard). A new attempt needs a new token (L04).
10. **Honesty.** A submission is shown as successful only when the portal's acknowledgement is recorded. An attempted browser action is never shown as success.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| L-AC-01 | `oa filing confirm` on a harness connection is refused, for both steps. | [AUTO] |
| L-AC-02 | Both confirmations within one gesture (a double click) record one confirmation only. | [AUTO] |
| L-AC-03 | Changing one byte of a payload document after confirmation voids the token, and execution is refused. | [AUTO] |
| L-AC-04 | A spent token cannot be reused. | [AUTO] |
| L-AC-05 | The ledger shows both confirmation events before the effect intent for every filing. | [AUTO] |
| L-AC-06 | Against the fake portal, a crash after submit yields `unknown`. Reconcile finds the submission, and no second submission is made. | [AUTO] |
| L-AC-07 | Against the fake portal, a crash before submit yields `unknown`. Reconcile finds nothing, and a new attempt requires new confirmations. | [AUTO] |
| L-AC-08 | `oa filing prepare` refuses while one citation is unattested `unresolved`. | [AUTO] |
| L-AC-09 | The disclosure document lists attestations separately from validator outcomes. | [AUTO] |
| L-AC-10 | A voice command for a confirmation is refused. | [AUTO] |
| L-AC-13 | `oa filing prepare` refuses a PDF/A whose conversion check failed or was not run. | [AUTO] |
| L-AC-11 | The confirmation screens make the destination, documents and declarations unmistakable. | [HUMAN] |
| L-AC-12 | One real filing on the live e-filing portal completes with the acknowledgement captured. | [HUMAN] (release check) |
| L-AC-14 | The filing view shows the state, both confirmations with time and gesture, the token state, and the acknowledgement text and hash. | [AUTO] |

## Edge cases

- The advocate walks away between the confirmations. The first confirmation expires after the configured window and the payload returns to `prepared`.
- The advocate's portal session expires during execution. Execution pauses for login. If the submit had not started, the token remains valid. If it had, the state is `unknown`.
- The portal accepts the filing but reports defects. Recorded as `submitted` with the defects as review items.
- The portal is down. Execution fails before submit, recorded as `failed` with the reason, token still unspent.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Browser crash mid-submit | `unknown`, reconcile required. |
| Acknowledgement not parseable | `unknown` with the raw response stored, reconcile required. |
| Approval lapsed while in flight | `unknown`, reconcile required (RQ-30). |

## Observable outcomes

- The filing view shows the state machine, every confirmation with time and gesture, the token state, and the recorded acknowledgement.
- `oa filing status --json` gives the same.

## Open questions

- OQ-06 (disclosure required), OQ-08 (attestation unblocks filing).
