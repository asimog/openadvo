# Spec: drafting and verification (phase 6)

Status: started 2026-11-18. The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The advocate sees the workflow steps 7 and 8 of [../advocate-workflow.md](../advocate-workflow.md) section 4.

Two modules are built: **drafting** (A7, F2, L1 to L6, L8) and **verification** (P1 to P11). The filing set is generalized from the Supreme Court SLP package to the court-adapter proceeding packs, because the phase exit needs a filing-ready Delhi High Court set.

## 1. What already exists, and what this phase adds

The base is the pre-plan drafting work: revisions with tracked changes and keep-or-undo, deterministic generation (List of Dates, Synopsis, the SLP petition, condonation, the conference package), the draft checks of `lib/verification` (source links, dates, case numbers, party names, the `[TO BE COMPLETED` marker), the ulos citation validator with checks and attestations, and the filing set with its signed manifest, paper book and AI-use disclosure.

| Feature | Built before this phase | This phase adds |
|---|---|---|
| L4 | Tracked changes, keep-or-undo, immutable approved revisions, the stale-base refusal | Nothing. It is complete. |
| P11 | The AI-use disclosure in `approveForFiling`, its blockers (P-7), ruling R-1 honoured | The disclosure keeps its place in every filing package of every court, and lists the provenance values of section 3 |
| L6 (half) | Compare any two revisions (`diffParagraphs`, `drafts:compare`) | Compare a revision with its rendered PDF |
| P8 (part) | The `[TO BE COMPLETED` marker blocks approval | The markers `[CITE]`, `[VERIFY]`, `[REVIEW]` |

Everything else in the scope is new.

## 2. Drafting

### 2.1 The document catalogue (L1, L3)

`src/lib/drafting/documents.ts` owns the catalogue. A document kind is an ordered list of parts. A part is one of:

- **form** — fixed text with recorded details filled in; a detail the matter does not record becomes a `[TO BE COMPLETED: …]` marker (the existing rule);
- **record** — generated from confirmed records, each paragraph linked to the ids of its records (L2);
- **slot** — a title and a `[REVIEW]` marker; the advocate writes it, or the agent proposes it as a tracked change. No generator writes legal text into a slot.

Kinds: `plaint`, `written_statement`, `replication`, `application_interim`, `application_stay`, `application_exemption`, `application_early_hearing`, `condonation` (exists), `petition` (SLP, exists), `writ_petition`, `appeal_memo`, `revision_petition`, `counter_affidavit`, `rejoinder`, `affidavit`, `written_submissions`, `legal_notice`, `notice_reply`, `list_of_dates` (exists), `synopsis` (exists), `questions_of_law` (exists), `grounds` (exists), `chronology`, `briefing_note`, `case_summary`, `research_memo`, `index`, `memo_of_parties`, `vakalatnama`, `appendix_of_provisions`, `client_letter`, `hearing_update`, `conference` (exists).

Every kind is a real draft: generation builds it, the editor opens it, the checks run on it, the filing set includes it when the pack names it. Nothing is a stand-in; a slot says on screen that the advocate or the agent writes it.

### 2.2 The part library (L1, L2)

`src/lib/drafting/parts.ts` owns the parts. Each part is a function from matter records to blocks, using the existing `Block` shape of `lib/drafting/structured.ts`:

| Part | Kind | Source |
|---|---|---|
| Cause title (court, case type, number, year) | form | `matter_details`, the court pack's case type |
| Memo of parties | form | `matter_details`; addresses are markers until recorded |
| Petition or application title | form | the kind's fixed title and provisions |
| Facts | record | confirmed `fact` rows, ids kept |
| List of dates, Synopsis | record | confirmed Notebook events (exists) |
| Chronology | record | the phase 4 timeline |
| Para-wise reply | record | admission and denial facts, ids kept |
| Grounds, Questions of law | slot | the existing approved-draft flow |
| Prayers, interim prayers | form + record | recorded relief, the kind's defaults |
| Affidavit | record | the deponent's recorded evidence statements (the witness rule, L8) |
| Verification | form | the deponent recorded in the matter details |
| Signature block, vakalatnama | form | the advocate profile |
| Index of annexures and authorities | record | the annexure manager, the authority table |
| Appendix of provisions | record | the provisions saved to the matter |
| Research memo | record | the stored memorandum |
| Letter or notice frame | form | the recipient and subject; the body is a slot |

**The witness and deponent rule (L8).** The affidavit part only organizes the deponent's own recorded words (the `evidence` rows: statement, given_by, given_at). It sorts them by date, numbers them, and never composes a sentence of its own. A draft check flags an affidavit paragraph that links to no evidence record. The system prompt states the rule to the agent; the affidavit drafting skill of phase 8 (SK-033) inherits it.

**Ids kept (L2).** `paragraph_link` gains `fact_ids` and `evidence_ids` columns (the `event_ids` column exists). "Show source of this paragraph" shows the facts and the evidence statements behind a paragraph, with their source lines.

### 2.3 The court format (L1)

Each court's document format is read from the adapter's checklist data: Delhi High Court, e-Filing Rules rule 6.1 (A4, margins 2 cm top and bottom and 4 cm left and right, Times New Roman 14, line spacing 1.5). `COURT_FORMATS` in `documents.ts` holds the values with their source string, and a unit test reads `adapters/in-hc-delhi/adapter.json` and fails when the adapter's quote and the map disagree. A court with no adapter gets the default format and the draft says so.

### 2.4 Citation insertion (L5)

The agent tool `insert_citation` takes an authority id (the matter's saved authorities), or a provision id, and an anchor. It formats the citation in the advocate's `citation_format` preference and writes it as a tracked insertion in a new revision. The proposal's reason is the "applied because" note: `applied because citation_format: <value> (<the preference's reason>)`, or `no citation_format preference recorded: the default <value> was used` when none is approved. The citation then goes through the ordinary checks (P3).

### 2.5 Comparison (L6)

Two revisions: exists. A revision against its rendered PDF: `compareRevisionToPdf` renders the revision's DOCX with x2t, extracts the PDF text, and compares both ways — every DOCX paragraph in the PDF (the existing `conversionCheck`), and every PDF paragraph that is not in the DOCX. The Drafts tools expose it, and the filing set's conversion rule keeps its own check.

## 3. Learned preferences and advocate memory (A7, F2)

### 3.1 The preference keys (A7)

`src/lib/preferences/index.ts` owns the keys. Each key has a title, the question asked, its allowed values, its default, and the task kinds where it matters.

| Key | Matters in | Values |
|---|---|---|
| `citation_format` | drafting, citation insertion | `neutral_first` (default), `reporter_first` |
| `drafting_style` | drafting | free text |
| `pleading_structure` | drafting | free text |
| `paragraph_length` | drafting | `short`, `medium`, `long` |
| `research_depth` | research | `quick`, `standard`, `deep` |
| `output_format` | drafting output | `docx` (default), `pdf` |
| `languages` | drafting, records | free text; English first (decision 19) |
| `briefs_other_counsel` | hearing work | `yes`, `no` |

Three flows put a value in place, and the advocate decides in all of them:

1. **Asked inside the first task where it matters.** A bridge function that needs a key with no approved value returns the question. The Drafts view shows it as a card beside the work; the answer goes to `advocate:setPreference` (human-only, approved at once, reason `answered inside <task> on <date>`). The task completes with the default when the advocate dismisses the card, and says so.
2. **The agent asks in the chat.** The system prompt tells the agent to ask once, inside the first task where the key matters, and then to propose the value with `propose_preference`. The proposal waits in the Review Inbox as today.
3. **The same correction twice.** An undo of an agent change takes an optional reason. The second undo with the same reason in a matter proposes the preference automatically (actor `agent`), with both corrections named in the reason.

Every place the application or the agent applies a preference names it: the generation result, the proposal reason and the context package all say `applied because <key>: <value> (<reason>)`.

### 3.2 Advocate memory (F2)

The store exists (`advocate.db` `memory`, propose and decide, advocate scope only). This phase adds the records and the path:

- `propose_advocate_memory`, a new agent tool, writes a proposal of type `preference`, `approved_precedent`, `lesson` or `court_practice`. The Review Inbox and the profile decide it, as today.
- A citation inserted for the same authority in two or more matters proposes a `court_practice` record "frequently cited".
- An undo reason that states a way of working proposes a `lesson` record beside the preference of flow 3.
- Approved templates are the library's `template` items with status `approved` (exists; M1).
- Every record the agent applies names itself in the reason of the proposal that used it.

### 3.3 The context package

`required_context` gains the kind `preferences`. A skill that names it gets the approved preferences, each rendered with its "applied because" reason. The scope check treats them as advocate-scope items, not matter facts: they are the advocate's own ways, so they cross matters by design.

## 4. Verification (P1 to P11)

All checks are deterministic: no model reads the draft. Each produces items with evidence and an action, opens review items, and feeds the gate. The severity of an item is its gate state; the reviewer note lists them, and nothing downstream may lower one.

| Feature | Built in | The check |
|---|---|---|
| P1 | `src/lib/verification/grounding.ts` | Every quoted string in a draft paragraph appears verbatim in an anchored line or a confirmed fact of the matter; every `p. N` reference names a page of a source; every `paragraph N` of a saved authority exists in its indexed text. Output: a grounding score (grounded statements of checked statements) and the items. |
| P2 | `src/lib/verification/provenance.ts` | A provenance value on every citation and fact: `tool_result`, `official_site`, `advocate_provided`, `advocate_attested`, `model_knowledge` (unverified). A primary or secondary label on every source: `primary_law`, `official_notification`, `commentary`, `unverified_secondary`. Computed from the existing records (author, anchor, check, attestation, origin, host); shown beside the fact, the citation and in the disclosure. The CrPC rows from the Indian Kanoon fallback show `unverified_secondary`. |
| P3 | `src/main/research.ts`, `src/lib/law-store/` | Citation checks gain: coverage `checked N of M` (M is every citation in the drafts; the validator checks Supreme Court neutral citations, so a reporter-only citation is reported, never skipped silently); paragraph-exists and paragraph-supports-the-proposition for a saved authority (from the indexed judgment text and the authority assessment); not-overruled (the treatment rows). A shared verification record: `shared_citation_check` in `corpus.db`, written by the law store at each validator run, read as `verified on <date> against <source> in another matter`. It is a record, never a substitute for the online check (ruling R-4). |
| P4 | `src/lib/verification/statute.ts` | Every statutory reference in a draft is looked up in the law store: in force on the governing date (the impugned event's date, or today, stated), correct version (`current`), amended or repealed. A `never` or `changed` check state makes the item unconfirmed, never passed. |
| P5 | `src/main/filing.ts` `procedureRules` | Procedure compliance rows of the filing set: `PROC-forum` (the jurisdiction report's forum against the filing target), `PROC-route` (the appeal route), `PROC-limitation` (computed and confirmed, or not applicable with the reason), `PROC-rules` (the pack lists behind the target are fresh; a stale source is unconfirmed). |
| P6 | `src/lib/verification/index.ts` | Fact checks: a paragraph that states a fact links to a confirmed one; a disputed fact stated as fact is an item; an open contradiction on a stated fact is an item and is never resolved silently; an inference is labelled in the item so the advocate judges it; dates, amounts and names are compared with the fact record. |
| P7 | `src/lib/verification/structure.ts` | Draft checks: the template's parts are present in order; numbered paragraphs are sequential; a cross-reference names a paragraph that exists; an annexure reference names a recorded annexure; the relief matches the grounds and the recorded relief; the citation format matches the preference; defined terms, footnotes and tables are validated and reported; the page format of the DOCX matches the court format; the final PDF matches the approved DOCX (the filing set's conversion rule). |
| P8 | `src/lib/verification/index.ts` | The markers `[CITE]`, `[VERIFY]`, `[REVIEW]` beside `[TO BE COMPLETED`. The check reports each with its paragraph and anchor; an open marker blocks approval. |
| P9 | `src/lib/verification/reviewer-note.ts`, `src/lib/skills/gate.ts` | A reviewer note above every output: the sources read (N of M with lines), the items for judgment by severity, the currency of every rule and statute used (its check state), and what to do before relying. The severity floor: the severity of an item is its gate state; the skill gate gains the check `severity_floor`, which fails when a skill's output reports an item with a lower severity than the check that found it. |
| P10 | `src/lib/verification/injection.ts` | An embedded-instruction scan of ingested documents and fetched pages: fixed patterns (instructions addressed to an assistant, orders to disregard the record, attempts to change the role). At ingest it opens a review item of kind `injection` with the quote and its anchor; the reading tools annotate their result the same way. Retrieved content stays data (hard rule 6); nothing is blocked, and the text of the finding itself never enters a prompt as an instruction. |
| P11 | `src/main/filing.ts` (exists) | The AI-use disclosure stays a required part of every filing package of every court, with the provenance values of the citations and provisions it lists. |

## 5. The filing set of a court pack

`Filing.required` reads the matter's filing target. When the target's proceeding pack names required parts, each part maps to a document kind or to the annexure manager, and the set is built from those documents. The mapping lives in `documents.ts` with the pack's words:

| Pack part (the adapter's words) | Maps to |
|---|---|
| Writ petition | `writ_petition` |
| Memo of parties | `memo_of_parties` |
| Affidavit | `affidavit` |
| Vakalatnama | `vakalatnama` |
| Annexures | the annexure manager |
| Special leave petition (Form No. 28) | `petition` |
| List of dates | `list_of_dates` |
| Appendix of provisions | `appendix_of_provisions` |
| Certified copy of the impugned judgment | an annexure; the compliance row says which |

A part the application cannot map is a compliance row `not_checked` with the pack's words: the set says what it does not know. With no target, the Supreme Court SLP set is unchanged.

The phase exit path: a Delhi High Court W.P.(C) matter with its target set builds — memo of parties, writ petition, affidavit, vakalatnama, the annexures, the AI-use disclosure — each approved revision rendered to PDF/A, the court's checklist and format checks joined, the `PROC` rows, the paper book and the signed manifest.

## 6. The window

- **Drafts tab**: "New draft" with the catalogue by group (Pleadings, Applications, Petitions and appeals, Affidavits and evidence, Notes and summaries, Client letters); the template's parts and format shown on the draft; the checks with the reviewer note; the compare tools; the preference question cards.
- **Draft view**: unchanged flow (open, edit, save, approve); the check panel gains the reviewer note.
- **Filing tab**: the required documents of the target; the `PROC` rows beside the compliance rows.
- **Advocate profile**: preferences with "applied because", as today; the question cards add the set-once flow.
- **Facts and evidence**: the provenance value beside each record.
- **Review Inbox**: injection items, preference and memory proposals, as today's rows.

## 7. Tests

| Test | Checks |
|---|---|
| `tests/unit/preferences.test.ts` | The keys; the ask-once result; the answer writes an approved preference; the same correction twice proposes; the applied-because text |
| `tests/unit/documents.test.ts` | Every kind builds; parts in order; record parts keep ids; the witness rule; the court format against the adapter's quotes; the pack mapping |
| `tests/unit/grounding.test.ts` | A verbatim quote passes; a touched quote fails; a missing page fails; the score |
| `tests/unit/provenance.test.ts` | Each value and label; the Indian Kanoon rows are `unverified_secondary` |
| `tests/unit/statute-checks.test.ts` | In force on the date; repealed; a `never` check state is unconfirmed |
| `tests/unit/structure-checks.test.ts` | Parts, numbering, cross-references, annexure references, relief, markers, format |
| `tests/unit/injection.test.ts` | Each pattern; a clean page; the review item; the tool-result notice |
| `tests/unit/verification.test.ts` | The fact checks, the markers, the reviewer note and the severity floor join the existing suite |
| `tests/unit/filing-target.test.ts` | The DHC required set from the pack; an unmapped part; the `PROC` rows; the disclosure in the DHC set |
| `tests/e2e/phase6.spec.ts` | The exit path: a DHC W.P.(C) matter, target set, the five documents generated from templates, a marker and a grounding defect found with evidence, the preference asked and answered, approvals, the filing set with checklist, `PROC` rows, disclosure and manifest |
| `tests/e2e/app.spec.ts` | The new agent tools and bridge functions in the exact lists |

Between the steps of the phase: the type check and the unit tests. The end-to-end suite runs once, at the end (section 8.4 of [../agent-guide.md](../agent-guide.md)).

## 8. What is not built, and why

- The practice-pack drafting skills (SK-201, SK-304 and the rest) are phase 8. This phase builds the documents, templates, parts and checks they run on.
- The affidavit goes as far as the recorded evidence statements go. Statements the matter does not record are markers, not composed prose (the witness rule).
- A shared verification record is a log, never a substitute for the online check (ruling R-4).
- Bilingual drafting is phase 11 (L7). The `languages` preference records the advocate's choice now; nothing translates yet.

## 9. Done

The owner completes the phase exit of [../build-plan.md](../build-plan.md) on a real draft and a real Delhi High Court matter (lesson L3): every error the review finds is supported by a source with an accurate reference, and the filing-ready set is one the advocate files without changes.
