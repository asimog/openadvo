# ULOS: the minimal standard and its validator CLI

Status: architecture, updated 4 November 2026 to the settled decisions in [decisions.md](decisions.md). It defines the standard we build, the four functions it performs, the objects it needs and the outcome vocabulary.

The canonical product docs are [architecture.md](architecture.md) and [advocate-workflow.md](advocate-workflow.md). They are the source of truth for the application. This document is the source of truth for the standard. The CLI's behaviour as a program is specified in [specs/U-ulos-validator.md](specs/U-ulos-validator.md).

## 1. What ULOS is

ULOS is a small contract layer plus one command-line validator. Both are ours and both are simulated: no court standard and no court validator exists, so we write a stand-in that lets the application's adapters be built against a fixed contract (RQ-44). The checks are not simulated. They run against the court's own sources. In tests the sources are replaced by a fixture source, which a release build refuses (RQ-08).

The validator is deterministic. It has no model. It is a separate binary with no access to the application's kernel or harness (RQ-09). It is the only producer of verification records. The application's verification adapter builds its input and maps its output, and does not re-implement any check.

ULOS has four functions.

| Part | Function | Question it answers | Source |
|---|---|---|---|
| **ULOS-L** | Legislation | Does the Act and section cited in the draft exist in India Code, unrepealed, with the cited number and year? | India Code |
| **ULOS-C** | Citation existence | Does the Supreme Court neutral citation name a real judgment, and is it the judgment the draft names? | The Supreme Court portal |
| **ULOS-CI** | Citation identification | Does the cited paragraph exist in the court's numbering, does the quote occur in it, and is the pinpoint outside any headnote or reporter block? | The judgment captured from the Supreme Court portal |
| **ULOS-N** | Notebook | Are the impugned judgment and orders in the Notebook, captured from the portal, and are they the documents the case record names? | The Supreme Court portal |

ULOS-C and ULOS-CI are deliberately separate (RQ-58). A citation can exist while its pinpoint is wrong, and the two need different sources: the case listing for existence, the judgment text for the paragraph.

The standard is a grammar of proof. It says what a verification claim must contain, how it binds to the document it judged, and how anyone re-checks it.

## 2. Scope

### 2.1 In scope

- The Supreme Court portal: case status by case number, diary number, CNR, party name and lower court, and the judgments and orders attached to a case.
- The Supreme Court judgments search, which finds a judgment and pins it by neutral citation.
- India Code, for Acts and sections of any jurisdiction it holds, Central or State (RQ-56).
- The matter layer, only as far as ULOS-N needs it: the matter, its identifiers, its captured court documents, and the Notebook items that point at them.

### 2.2 Out of scope

- High Court and district court websites. The High Court judgment and orders reach the Notebook through the Supreme Court portal's lower-court search, which is the same portal and the same capture path.
- Pleadings, affidavits, applications and any other file supplied by the client. They are Notebook items tagged `client_supplied`. The standard does not check them (RQ-45, RQ-61).
- Whether a passage supports a legal proposition, in whose voice it is written, and how later judgments have treated it. These belong to the application's Research Studio and to the advocate (RQ-16, RQ-18, RQ-19).
- Outcome prediction and any scoring of a case's merits. The application may show labelled advisory scores in Research Studio (RQ-35). The standard has no field for them.
- Whether a filing will be accepted by the registry.

### 2.3 Sources

The first release uses one source per function, and no fallback tier (RQ-57).

| Function | Source | Reached how |
|---|---|---|
| ULOS-L | India Code's anonymous REST API, with the API Setu route as an option for a registered client (RQ-53) | HTTPS, no key |
| ULOS-C, ULOS-N | The Supreme Court portal | Through a portal session captured after the advocate solves the CAPTCHA in the application's visible browser |
| ULOS-CI | The judgment PDF captured from the portal | A file supplied in the bundle, with its capture record |

The AWS open-data catalogue of Supreme Court judgments is not part of the standard, and the validator has no adapter for it. The application uses it outside the standard, for research and for a quick check that gives an early signal on a citation. A quick-check result is not a verification record and never produces `verified`. Only the portal, through the validator, verifies a citation.

## 3. Outcomes

Every check produces one of four outcomes (RQ-12). Every outcome other than `verified` carries a reason code.

| Outcome | Meaning |
|---|---|
| `verified` | The check passed against a court source. |
| `failed` | The source was reached and contradicts the target. |
| `unresolved` | The validator could not reach a decision: the source was unreachable, a CAPTCHA was pending, the match was ambiguous, the source text was OCR-disputed, or the check needs a human decision. |
| `not_applicable` | The check does not apply to this target, for example a `client_supplied` item. |

The reason codes are listed in [decisions.md](decisions.md) section 5.3.

Two rules govern the outcomes.

- **A citation must match the court record** (RQ-20). If the portal was reached and the citation does not name a judgment on it, or names a different judgment, the outcome is `failed` with `not_on_court_record` or `identifier_mismatch`. If the portal was not reached, or the match is ambiguous, the outcome is `unresolved`. There is no outside-corpus outcome.
- **Nothing is upgraded because a source was unreachable.** Unreachable is `unresolved`, and the application treats `unresolved` as blocking (RQ-14, RQ-37).

A human never produces `verified`. When the advocate checks an `unresolved` item themselves, the application records an advocate attestation beside the record. The record's outcome does not change (RQ-60).

## 4. The four functions

### 4.1 ULOS-L: legislation

**The question.** A draft cites "Section 103 of the Bharatiya Nyaya Sanhita, 2023". ULOS-L checks that the Act exists in India Code, that the section exists in that Act, that neither is flagged repealed, that the cited number and year match, and whether the section carries an amendment flag.

**What the source gives us.**

- An Act is an item with `dc.identifier.act_id`, `dc.identifier.act_number`, `dc.date.act_year`, `dc.date.enact_date`, `dc.title`, `dc.identifier.state_id` and `dc.identifier.repealed`.
- A section is an item with `dc.identifier.section_id`, `dc.identifier.section_number` and its Act's `act_id`.
- An amendment is an item of type `ACT_AMENDMENT`, naming the amending Act, the amended Act and the year, with no effective date and no before-and-after text.
- The handle URI is not identity. Some handles point at a test host, so `act_id` is the key (RQ-54).

**The checks.**

| Check | Result |
|---|---|
| `act_resolves` | `verified` when the Act exists and the `act_id` matches, `failed` with `act_not_found` otherwise |
| `section_exists` | `verified` when the section number exists in that Act, `failed` with `section_not_found` otherwise |
| `act_not_repealed` | `failed` with `repealed` when the Act is flagged repealed |
| `section_not_repealed` | `failed` with `repealed` when the section is flagged repealed |
| `act_number_matches` | `failed` with `number_year_mismatch` when the cited number and year differ |
| `amendment_status` | Conditional (RQ-55). `verified` when the section carries no amendment flag. `unresolved` with `amended_point_in_time` when it does, because India Code gives no point-in-time text and the advocate must confirm which version applies |

### 4.2 ULOS-C: citation existence

**The question.** A draft cites "2024 INSC 23" as a judgment between named parties on a named date. ULOS-C checks that the citation is well formed, that it names a judgment on the court record, and that it is the judgment the draft names.

**The source.** The Supreme Court portal. Every Supreme Court judgment now carries an INSC neutral citation (RQ-21). A draft that cites only a reporter citation gets `unresolved` with `insc_required`, and the advocate supplies the INSC citation.

**The checks.**

| Check | Result |
|---|---|
| `citation_parses` | `failed` with `schema_invalid` when the string is not a valid neutral citation |
| `work_resolves` | `verified` when the citation resolves to a judgment on the portal, `failed` with `not_on_court_record` when the portal was reached and has none |
| `two_identifiers_agree` | The neutral citation and a second identifier (the case number or diary number) name the same judgment, else `failed` with `identifier_mismatch` |
| `party_names_match` | The parties in the draft match the judgment, else `failed` with `party_mismatch` |
| `decision_date_match` | The date in the draft matches the judgment, else `failed` with `date_mismatch` |

Party names alone never resolve a citation. The citation is the key, and parties and date are checks on it.

### 4.3 ULOS-CI: citation identification

**The question.** The same draft cites "2024 INSC 23, paragraph 18" and quotes it. ULOS-CI checks that paragraph 18 exists in the court's own numbering, that the quoted words occur in it, and that the pinpoint is not in a headnote or a "Case Law Referred" block.

**The source.** The judgment captured from the portal, supplied in the bundle with its capture record. A judgment not captured from the portal cannot be the source.

**The checks.**

| Check | Result |
|---|---|
| `paragraph_exists` | `failed` with `paragraph_missing` when the court's numbering has no such paragraph |
| `quote_in_paragraph` | `failed` with `quote_not_found` when the quote does not occur in the paragraph after normalisation |
| `not_in_reporter_block` | `failed` with `in_reporter_block` when the pinpoint lands in a headnote or reporter block |

If the paragraph number or the quoted words are OCR-disputed in the captured judgment, the result is `unresolved` with `source_text_disputed`. Normalisation is fixed and versioned: Unicode NFC, whitespace collapse, line-end hyphen joins, quote-mark equivalence, and Devanagari digits mapped to ASCII. A quote with ellipses matches when each segment occurs in order inside the paragraph.

### 4.4 ULOS-N: the Notebook

**The question.** The Notebook must hold the impugned judgment and the orders the Supreme Court case depends on. ULOS-N checks that each required document is present, that it was captured from the portal, and that it is the document the case record names.

**The two components of the Notebook** (RQ-45). Items supplied by the court portal are checked. Files supplied by the client are tagged `client_supplied` and are not checked. If one reaches the validator, it is `not_applicable` with `client_supplied`.

**What the portal gives us.** The case details (diary number with its filing date, case number with its registration date, CNR, status, stage, disposal date and type, category, parties and advocates), the earlier court details (court, case type, number, year and order date), and the judgments and orders tab.

**The checks.**

| Check | Result |
|---|---|
| `matter_identifiers_present` | The matter has at least one identifier the portal accepts |
| `case_resolves` | The identifiers resolve to a case on the portal |
| `impugned_order_matches` | The impugned order matches the portal's earlier court details, else `failed` with `impugned_order_mismatch` |
| `required_document_present` | Each required document is in the Notebook, else `failed` with `required_document_missing` |
| `document_captured_from_portal` | The document has a capture record with a URL, a time, a hash and the advocate's gesture, else `failed` with `not_captured_from_portal` |
| `document_hash_matches` | The stored bytes hash to the recorded hash, else `failed` with `hash_mismatch` |
| `document_is_the_named_one` | The document's case number and order date match the case record |

The `01-01-1900` placeholder date in legacy portal records is not checked (RQ-63). The residual risk is OQ-04.

## 5. The object model

### 5.1 Shared

| Object | Purpose | Key fields |
|---|---|---|
| `Matter` | The root of the matter layer | `id`, `parties`, `externalIds`, `impugnedOrder`, `standardVersion` |
| `ExternalId` | A court identifier, kept as issued | `scheme`, `value`, `role` |
| `Source` | A place a document came from | `id`, `class`, `endpoint` |
| `SourceCapture` | The record of a capture | `id`, `url`, `finalUrl`, `capturedAt`, `downloadHash`, `gesture` |
| `Manifestation` | The bytes of a document | `sha256`, `mediaType`, `pageCount` |
| `EvidenceReference` | A pointer into a document | `work`, `manifestation`, `selector`, `quoteHash` |
| `VerificationRecord` | The result of one check, with its verification proof | `id`, `target`, `targetHash`, `checks`, `outcome`, `reason`, `standardVersion`, `validatorVersion`, `validatorHash` |
| `ResolutionAttempt` | One attempt to resolve something | `source`, `endpoint`, `url`, `startedAt`, `responseHash`, `outcome`, `reason` |

The verification proof (RQ-10) is the record's `targetHash`, plus each attempt's `endpoint`, `url` and `responseHash`, plus the location in `checks`.

### 5.2 ULOS-L

| Object | Purpose | Key fields |
|---|---|---|
| `Act` | An Act in India Code | `actId`, `actNumber`, `actYear`, `title`, `enactDate`, `jurisdiction`, `repealed` |
| `Section` | A section of an Act | `sectionId`, `actId`, `sectionNumber`, `title`, `repealed`, `amended` |
| `Amendment` | An amendment item | `amendmentId`, `amendingAct`, `amendedAct`, `year` |
| `LegislationRef` | A legislation reference in a draft | `act`, `section`, `raw`, `draftAnchor` |

### 5.3 ULOS-C and ULOS-CI

| Object | Purpose | Key fields |
|---|---|---|
| `NeutralCitation` | A Supreme Court neutral citation | `year`, `serial`, `display`, `compact`, `work` |
| `Judgment` | A judgment or order | `work`, `court`, `decisionDate`, `parties`, `caseNumber` |
| `CitationOccurrence` | A citation as it appears in a draft | `raw`, `citation`, `parties`, `date`, `draftAnchor` |
| `Paragraph` | A paragraph of a judgment, in the court's numbering | `work`, `number`, `scheme`, `textHash`, `capture` |
| `Pinpoint` | A paragraph reference and quote in a draft | `occurrence`, `paragraph`, `quote`, `draftAnchor` |

### 5.4 ULOS-N

| Object | Purpose | Key fields |
|---|---|---|
| `ImpugnedOrder` | The order under challenge | `courtType`, `state`, `bench`, `caseType`, `number`, `year`, `orderDate`, `cnr` |
| `CaseRecord` | What the portal says about a case | `identifiers`, `status`, `stage`, `disposalDate`, `disposalType`, `parties`, `earlierCourt` |
| `NotebookItem` | A document in the Notebook | `id`, `matter`, `kind`, `origin`, `manifestation`, `capture`, `status` |

`NotebookItem.origin` is `court_portal` or `client_supplied`.

## 6. Identifiers

One scheme, one parser, one validation rule (RQ-46).

| Object | Form | Example |
|---|---|---|
| Matter object | `urn:ulos:{type}:{ulid}` | `urn:ulos:vr:01JE7Q` |
| Judgment | `urn:ulos:judgment:insc:{year}:{serial}` | `urn:ulos:judgment:insc:2024:23` |
| Act | `urn:ulos:act:indiacode:{actId}` | `urn:ulos:act:indiacode:AC_CEN_5_0_202609_1791525105138` |
| Section | `urn:ulos:section:indiacode:{sectionId}` | `urn:ulos:section:indiacode:100467` |
| Document bytes | `sha256:{hex}` | `sha256:9f2c…` |

Readable forms are display aliases. Court identifiers are stored as issued, `{scheme, code}` with the label verbatim, never renumbered (RQ-50). The CNR is stored in its 16-character uppercase form with the displayed string kept verbatim. A case number keeps the portal's case type code and number range.

## 7. The validator CLI

The commands are listed in [specs/U-ulos-validator.md](specs/U-ulos-validator.md). In summary: `ulos verify`, `verify-citation`, `verify-paragraph`, `verify-legislation`, `verify-notebook`, `manifest`, `receipt`, `check-receipt`, `schema`, `conformance run` and `sources`. There is no SDK (RQ-43).

### 7.1 What the CLI checks and refuses

| Check | In the CLI |
|---|---|
| Schema validity | Yes |
| Hash and signature verification | Yes |
| Neutral citation parsing and existence (ULOS-C) | Yes |
| Paragraph identification (ULOS-CI) | Yes |
| Act and section identity, repeal, amendment flag (ULOS-L) | Yes |
| Notebook court-portal items (ULOS-N) | Yes |
| Semantic support, voice, treatment | No. Research Studio and the advocate |
| Advisory scores | No |
| Client-supplied documents | No |
| Filing acceptance | No |

Every report prints this refusal list. Every receipt carries the fixed clause: this receipt records the checks performed and the sources consulted. It is not a determination of truth, admissibility or legal correctness.

### 7.2 Network behaviour

There is no offline mode (RQ-37). With the network off, every check that needs a source reports `unresolved` with `source_unreachable`. Schema, hash, signature and receipt checks run without a network.

## 8. The conformance suite

The suite is language-neutral: fixtures in, expected records out (RQ-51). It is run by the CLI. The application's verification adapter is tested against the CLI's outputs, not against a second copy of the checks.

| Suite | Proves | Fixtures |
|---|---|---|
| `CT-L1` | Act and section identity, any jurisdiction | A Central Act section, a State Act section, a section that does not exist, a repealed Act, an unreachable source |
| `CT-L2` | Amendment honesty | An amended section reports `unresolved` with `amended_point_in_time`, an unamended one reports `verified` |
| `CT-C1` | Neutral citation parsing | Valid forms, bracketed years, leading zeros, lower case, malformed strings, a reporter-only citation |
| `CT-C2` | Existence | A real judgment, a fabricated serial on a reachable portal, the right citation with the wrong parties, the right citation with the wrong date, the portal unreachable |
| `CT-CI1` | Paragraph | A correct pinpoint, a missing paragraph, a pinpoint in a headnote, separate-opinion numbering |
| `CT-CI2` | Quote | An exact quote, a misquote, a quote with ellipses, a quote across a line-end hyphen, an OCR-disputed paragraph |
| `CT-N1` | Case resolution | A real case by CNR, by diary number and by case number, and a case that does not exist |
| `CT-N2` | Impugned order | A matching order, a mismatched order date, a missing order |
| `CT-N3` | Capture provenance | A captured document, a `client_supplied` document, a document whose hash does not match |
| `CT-S1` | Schema and hashing | Every object validates, and the hash profile produces the same digest as the test vectors |
| `CT-S2` | Receipts | A valid receipt, an altered byte, a missing signature |

## 9. What the standard does not model

These are deliberate omissions. The application keeps its own model of each.

- The Factual Matrix, the chronology and the List of Dates.
- The SLP draft structure. The standard needs a draft anchor, not a draft model.
- OCR readings and disputes. The standard records the document hash, the anchor and whether the source text was disputed.
- Precedent treatment, adverse authority, citation voice and support.
- Filing payloads and confirmation tokens.
- Procedural rules and limitation.

## 10. Decisions and open questions

The questions that shaped this standard were RQ-43 to RQ-67 in [report.md](report.md). They are settled in [decisions.md](decisions.md) section 5, groups H to L. The question still open that touches the standard is OQ-04 (the `01-01-1900` placeholder). When one is decided, record it in [decisions.md](decisions.md) and update the affected section here.
