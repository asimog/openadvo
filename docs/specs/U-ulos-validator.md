# U. The `ulos` validator CLI

Components: the standard's reference CLI, with the conformance suite (map K11 and K12). See [README](README.md) for tags and conventions.

## Purpose

The one validator. A deterministic command-line program, separate from the application, with no model and no access to the kernel or the harness. It reads a bundle or a single reference, consults court sources, and writes verification records in the ULOS schema. The checks themselves, the objects and the outcome vocabulary are defined in [ULOSarchitecture.md](../ULOSarchitecture.md). This spec says how the CLI must behave.

## Decisions implemented

P3, P4, RQ-08, RQ-09, RQ-10, RQ-12, RQ-20, RQ-21, RQ-43, RQ-44, RQ-48, RQ-51, RQ-52, RQ-53, RQ-54, RQ-55, RQ-56, RQ-57, RQ-58, RQ-60, X-03, X-08, L-08, H-01, H-06, H-07.

## Depends on

- Court sources only: the Supreme Court portal, India Code. Nothing in the application.
- A captured portal session supplied by the caller when a lookup needs a solved CAPTCHA (H-01).

## Assumptions

- The standard and the validator are ours and simulated: no court standard or court validator exists. The checks run against real court sources (RQ-44, RQ-08).
- All Supreme Court judgments carry INSC neutral citations (RQ-21).
- India Code flags amended sections (RQ-55).

## Non-goals

- No SDK, only the CLI (RQ-43).
- No model, no probability, no support assessment, no treatment, no advisory score.
- No verification of client-supplied documents (RQ-45).
- No second source: no mirror, no aggregator, and no AWS catalogue adapter (RQ-57). The AWS catalogue is used only by the application's Research Studio and quick check, outside the standard.

## Commands

| Command | What it does |
|---|---|
| `ulos verify <bundle>` | Runs every check the bundle asks for and writes verification records |
| `ulos verify-citation <citation> [--parties <p>] [--date <d>]` | ULOS-C on one citation |
| `ulos verify-paragraph <citation> --para <n> [--quote <q>] --source <pdf>` | ULOS-CI on one pinpoint, against a captured judgment |
| `ulos verify-legislation <act> [<section>]` | ULOS-L on one Act and section |
| `ulos verify-notebook <bundle>` | ULOS-N on the court-portal component of a Notebook bundle |
| `ulos manifest <file>` | Builds the AI-use disclosure manifest for a file |
| `ulos receipt <manifest>` | Issues a receipt |
| `ulos check-receipt <receipt>` | Checks a receipt's signature and digests offline |
| `ulos schema [--object <name>]` | Prints the normative JSON Schema |
| `ulos conformance run [--suite <s>]` | Runs the conformance fixtures |
| `ulos sources` | Lists the source adapters, their endpoints and whether each is enabled |

Flags common to all: `--json`, `--session <file>` (a captured portal session), `--timeout <s>`, `--fixtures <dir>` (test builds only).

## GUI

None. `ulos` is a command-line program with no SDK and no window (RQ-43). Its records are shown by the verification pane of spec K.

## Rules

1. **Four outcomes.** Every check returns `verified`, `failed`, `unresolved` or `not_applicable`, with a reason code from the list in [decisions.md](../decisions.md) 5.3 for every non-`verified` outcome. No other outcome word is ever printed.
2. **Verification proof.** Every record carries the source consulted (endpoint, URL, resolution attempt), the hash of the source bytes read, the location (paragraph, Act and section, Notebook item), and the hash of the target judged (RQ-10).
3. **Match or fail.** When the source was reached and the citation does not name a judgment on the court record, or names a different one, the outcome is `failed`. When the source was not reached, or the match is ambiguous, the outcome is `unresolved`. There is no outside-corpus outcome (RQ-20, X-03).
4. **ULOS-C is existence.** Parse, resolve, two identifiers agree, parties match, decision date matches. Nothing about the paragraph (RQ-58).
5. **ULOS-CI is the paragraph.** The paragraph exists in the court's numbering, the quote occurs in it after normalisation, and the pinpoint is not in a headnote or reporter block. It runs only against a judgment captured from the portal. If the paragraph number or the quoted text in the source is OCR-disputed, the outcome is `unresolved` with `source_text_disputed` (H-07).
6. **Reporter-only citations.** A citation with no INSC form is `unresolved` with `insc_required` (RQ-21).
7. **ULOS-L.** Any Act in India Code, Central or State, is in scope (RQ-56). Identity, section existence, repeal, and number and year are checked. If India Code flags the section as amended, the amendment check is `unresolved` with `amended_point_in_time`. Otherwise it is `verified` (RQ-55).
8. **ULOS-N.** Only items with origin `court_portal` are checked. An item with origin `client_supplied` that reaches the validator is `not_applicable` with `client_supplied`.
9. **Source stamp.** Every resolution attempt records the endpoint. A release build has no fixture adapter compiled in, and `--fixtures` is refused (L-08).
10. **Deterministic.** Given the same bundle, the same source bytes and the same version, the output records are byte-identical apart from attempt times. Network responses are hashed and stored in the record so a re-run can be compared.
11. **No hidden network.** The CLI connects only to the enabled source endpoints. It has no model provider client. A `--session` file carries only the portal's public-search session obtained after the CAPTCHA, never the advocate's e-filing login or any matter-profile cookie.
12. **Schema first.** JSON Schema is normative. The Rust types are generated from it. Every record written validates against it (RQ-44).
13. **Hash profile.** Digests exclude the fields in the normative exclusion list, with test vectors (RQ-52).
14. **Refusal list.** Every report prints the fixed list of what the validator does not check, and every receipt carries the fixed clause that it records the checks performed and the sources consulted and is not a determination of truth, admissibility or legal correctness.
15. **Normalisation for quotes.** Unicode NFC, whitespace collapse, line-end hyphen join, straight and curly quote equivalence, Devanagari digits to ASCII. The normalisation version is in the record.
16. **Same names, different cases.** Party match alone never resolves a citation. The INSC citation is the key, and parties and date are checks on it.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| U-AC-01 | Every conformance suite passes: CT-L1, CT-L2, CT-C1, CT-C2, CT-CI1, CT-CI2, CT-N1, CT-N2, CT-N3, CT-S1, CT-S2. | [AUTO] |
| U-AC-02 | No output, in any mode, contains an outcome word outside the four. | [AUTO] |
| U-AC-03 | A non-existent INSC serial on a reachable fixture portal is `failed` with `not_on_court_record`. The same citation with the portal unreachable is `unresolved` with `source_unreachable`. | [AUTO] |
| U-AC-04 | A citation with the right INSC and wrong parties is `failed` with `party_mismatch`. | [AUTO] |
| U-AC-05 | A pinpoint in a headnote is `failed` with `in_reporter_block`. A misquote is `failed` with `quote_not_found`. | [AUTO] |
| U-AC-06 | A paragraph number that is OCR-disputed in the source is `unresolved` with `source_text_disputed`. | [AUTO] |
| U-AC-07 | A State Act section in India Code verifies the same way as a Central Act section. | [AUTO] |
| U-AC-08 | An amended section is `unresolved` with `amended_point_in_time`. An unamended section is `verified`. | [AUTO] |
| U-AC-09 | A `client_supplied` item in a Notebook bundle is `not_applicable` with `client_supplied`. | [AUTO] |
| U-AC-10 | A release build rejects `--fixtures` and lists no fixture source in `ulos sources`. | [AUTO] |
| U-AC-11 | Two runs on the same inputs produce identical records apart from attempt times. | [AUTO] |
| U-AC-12 | An egress test shows connections only to enabled source endpoints, and none to the AWS catalogue. | [AUTO] |
| U-AC-13 | Every record validates against the JSON Schema. | [AUTO] |
| U-AC-14 | The hash profile test vectors produce the same digests in the CLI and in an independent reference script. | [AUTO] |
| U-AC-15 | India Code returning an unknown response shape yields `unresolved` with `source_unreachable` and a schema-change note, never a guess. | [AUTO] |
| U-AC-16 | Running `ulos` against ten real citations and five real Acts gives results a lawyer agrees with. | [HUMAN] (release check) |

## Edge cases

- Bracketed and unbracketed years, leading zeros in the serial, "INSC" in lower case. Parsed by the grammar in the standard.
- A citation to a judgment and a separate order of the same date in the same case.
- A judgment with paragraph numbers restarting in a separate opinion. The court's own numbering scheme, including the opinion, is part of the pinpoint.
- Quotes with ellipses. Each segment must occur in order within the paragraph.
- A portal session that expires mid-batch. The remaining checks are `unresolved` with `captcha_pending`.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Portal or India Code unreachable | `unresolved` with `source_unreachable`, exit 3. |
| Malformed bundle | Exit 2, `schema_invalid`, no records written. |
| Internal error | Exit 10, no partial records. |

## Observable outcomes

- A JSON line per record on stdout, a human summary on stderr, and the exit code in [README](README.md).

## Open questions

None local.
