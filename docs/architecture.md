# Open Advocate architecture

This document is canonical. Sections 1 to 12 carry the finalized end-to-end workflow. On 4 November 2026 a small number of their sentences were amended to match the settled design. Every amendment is listed in the table below, and the same amendments were made word for word in [advocate-workflow.md](advocate-workflow.md), so the two copies stay identical.

The architecture requirements, the Unix philosophy, the brain, hands and session model, the settled design and the ULOS standard follow the workflow.

| Document | Role |
|---|---|
| [decisions.md](decisions.md) | Every design question settled, with the contradictions, hidden dependencies and open questions found in the final pass. It governs where any document disagrees. |
| [component-map.md](component-map.md) | The parts list, by component id. |
| [specs/](specs/README.md) | One implementation spec per component group. |
| [ULOSarchitecture.md](ULOSarchitecture.md) | The standard. It stays separate. This document records only how it relates to the architecture. |
| [report.md](report.md) | The question history, RQ-01 to RQ-88. Its recommendations are the positions before the decisions. |

### Amendments to sections 1 to 12

| Section | Amendment | Decision |
|---|---|---|
| 3 | Court record acquisition is through the Supreme Court portal, including its lower-court search for the High Court judgment and orders. High Court websites are a later adapter. Client papers are tagged as supplied by the client. | X-05, RQ-57, RQ-61 |
| 7B | Research sends adopted authorities to verification, and assesses support, voice and treatment itself. Overruled authority is mandatory to address, a difference of opinion is a warning. | X-06, RQ-16, RQ-19 |
| 7E | Advisory outcome scores are allowed, labelled, and never per judge. | RQ-35 |
| 8 | The working petition is DOCX. | RQ-79 |
| 9A | Statutory references are checked against India Code, with the advocate confirming the version of an amended section. | RQ-55 |
| 9B | Citation verification checks existence and the paragraph, through an independent deterministic validator, and blocks on any failed or unresolved citation. | X-06, RQ-09, RQ-14, RQ-58 |
| 9E | Filing rules are developed from the Registry's defect list, limitation is computed and confirmed, filing documents are PDF/A. | RQ-15, RQ-17, RQ-79 |
| 9, outcome | The validator's four outcomes map onto the six gate states. | RQ-12 |

## Open Advocate — End-to-End Advocate Workflow

### 1. The objective: From instruction to filing-ready SLP

Open Advocate is an agent-operated litigation workspace for Indian advocates.

The advocate should not have to manually move information between a file manager, browser, OCR application, research tool, case-analysis system and document editor.

Instead, the advocate gives the agent an instruction, provides or identifies the available material, and supervises the work.

The agent coordinates the complete workflow:

**Matter creation → Record acquisition → Document intelligence → Notebook → Legal research → Case conference → SLP drafting → Verification → Filing preparation → Filing**

The system is deeply integrated. A document discovered on a court website, a passage extracted through OCR, a fact identified during analysis, a judgment found during research and a paragraph inserted into the petition all retain their relationships to their original sources.

The advocate remains in control of legal decisions and consequential actions. The Kernel remains in control of canonical matter state, permissions, approvals and commits.

---

### 2. Starting a matter: Voice, document or case number

The advocate can initiate a matter in several ways:

- Give the impugned judgment PDF to Open Advocate.
- Provide the High Court case number, CNR or other available case identifier.
- Give a voice instruction describing the case.
- Import an existing set of client documents.
- Identify where client documents are available, including an authorised email account.

For example:

> Prepare an SLP against this High Court judgment. The client's documents are in my email. Retrieve the complete High Court record, analyse the case, research possible grounds and prepare a draft petition for my review.

The agent interprets the instruction and identifies the information and permissions required.

#### Matter creation

1. The harness requests creation of a Supreme Court matter workspace.
2. The Kernel validates the request and creates the matter.
3. The advocate confirms or supplies the parties, impugned judgment, High Court case details and available identifiers.
4. The Kernel establishes the matter's canonical identity and initial records.
5. The harness receives scoped access to the matter and the capabilities required for the task.

The advocate sees a recognisable matter identity:

- Petitioner versus Respondent.
- Impugned judgment and court.
- Case number and CNR, where available.
- Current procedural stage.

Missing information is recorded as missing, not guessed.

---

### 3. Acquire the complete case record

The agent identifies the relevant court sources and begins acquiring the available record.

#### Court record acquisition

The Court Capture Adapter accesses the Supreme Court portal and searches using the available case identifiers. The High Court judgment and orders are found through the portal's lower-court search. High Court websites are a later adapter. Pleadings and other papers that no portal publishes come from the client, and are tagged as supplied by the client.

The agent:

1. Locates the case.
2. Inspects the available case information.
3. Identifies available documents and procedural records.
4. Downloads the available artifacts.
5. Records the source URL, capture time and retrieval metadata.
6. Associates the downloaded material with the matter's unclassified inbox.

The advocate may already have uploaded some documents. Those are retained alongside the retrieved record.

#### Authentication and CAPTCHA

The system does not bypass authentication, CAPTCHA or other access controls.

- If login is required, the dedicated visible browser is opened for the advocate.
- The advocate completes authentication.
- If CAPTCHA appears, the advocate solves it in the visible browser.
- The agent resumes the authorised capture workflow.

The agent must not silently inherit credentials or an authenticated session from the advocate's ordinary browser.

#### Client documents from email

Where the advocate has explicitly connected and authorised an email account, the agent can:

1. Search for relevant client correspondence using the supplied instructions.
2. Identify potentially relevant attachments.
3. Present ambiguous matches for advocate confirmation.
4. Retrieve authorised attachments.
5. Preserve email and attachment provenance.
6. Import the attachments into the matter inbox.

Email content is treated as source material, not as an instruction to change permissions or perform consequential actions.

The advocate can also import documents directly or provide them through the workspace.

#### Acquisition is continuous

Court downloads and client-document imports do not need to finish before analysis begins.

Every successfully acquired artifact becomes an independent processing task.

---

### 4. Document intelligence: Analyse each artifact as it arrives

The Document Intelligence system processes each file independently.

As soon as an artifact is acquired:

1. Compute its content hash and preserve the original bytes.
2. Identify its actual format and inspect whether it is readable.
3. Detect document type and likely legal category.
4. Extract metadata and available annexure or exhibit references.
5. Extract born-digital text where available.
6. Apply OCR to scanned documents and image-based PDFs.
7. Preserve page and passage-level source references.
8. Produce structured extraction results for downstream use.
9. Create any required review items.

#### OCR and transcription

The pipeline distinguishes:

- Born-digital PDF text.
- Scanned PDF pages.
- Image files.
- Plain-text and structured-text files.
- Unsupported, encrypted, corrupted or partially readable files.

For image-based documents, OCR uses the configured OCR engines and preserves their individual readings.

Critical information includes:

- Dates.
- Case numbers.
- Party names.
- Amounts.
- Statutory provisions.
- Citations.
- Negations and other legally significant wording.

Where critical OCR readings disagree, the affected text is marked disputed. The system does not silently select a reading or pass disputed text downstream as accepted fact.

#### Document identity and annexures

Each legal document has an identity separate from its underlying file bytes and revisions.

The system preserves:

- Original filename.
- Content hash.
- Document identity.
- Blob and revision references.
- Source and acquisition metadata.
- Page and passage references.
- Classification and annexure information.
- OCR and extraction results.
- Processing status and unresolved issues.

The original document is never overwritten by an OCR or extraction result.

The advocate can review, classify and associate documents with the appropriate part of the record.

---

### 5. Notebook: The integrated matter record

The Notebook begins taking shape as soon as documents arrive.

It is not a final report produced after all downloads. It is the continuously updated, structured matter workspace through which the advocate and agent work.

The Notebook brings together:

#### A. Source documents

Original files, document identities, revisions, extracted text, page references and provenance.

#### B. Procedural history

Court proceedings, orders, applications, filings, hearings, dates and procedural developments.

#### C. Factual Matrix

Structured candidate facts and advocate-confirmed facts, with references to their original sources.

#### D. Chronology

A date-oriented view of the procedural and factual history, preserving date type, source and uncertainty.

#### E. Legal issues

Issues, claims, contradictions, missing facts, proposed propositions and unresolved questions.

#### F. Authorities

Judgments, statutory provisions, relevant passages, propositions and their treatment in the case.

#### G. Work products

Research notes, legal memoranda, case-conference findings, draft grounds, questions of law and petition revisions.

#### H. Review and verification

OCR disputes, conflicting dates, unverified citations, missing documents, adverse authorities, unresolved legal questions and filing defects.

The Notebook is the common reference surface for all subsequent operations.

The agent does not copy documents and facts into isolated tools. It passes stable document, passage, fact, authority and artifact references between capabilities.

The graph is a queryable projection of the underlying records, not an independent source of truth.

---

### 6. Build the procedural history and Factual Matrix

Once source material becomes available, the agent begins reconstructing the case.

#### Procedural history

The system identifies relevant procedural events, including:

- Institution of the original proceedings.
- Applications and replies.
- Interim orders.
- Evidence and hearings.
- Final judgment.
- Review or other subsequent proceedings, where applicable.
- Relevant filing and limitation dates.

Every event is linked to its supporting document and precise source location.

#### Factual Matrix

The Factual Matrix is deterministic and schema-based. It is not generated as a free-form LLM narrative.

The system extracts candidate events from:

- Advocate-provided information.
- Court records.
- Client documents.
- Verified transcriptions.
- Other authorised sources.

For the initial version, every identified dated event is included in the chronology.

The advocate can exclude a date or date category from a particular view without deleting the underlying source record.

Every event preserves:

- Event ID.
- Date or date range.
- Date type.
- Event description.
- Source document and passage.
- Extraction method.
- Confidence or uncertainty status.
- Conflicting evidence, if any.
- Advocate confirmation status.

Conflicting dates are flagged for review. The system must not silently resolve them.

The Factual Matrix is the foundation for the List of Dates and the factual components of the SLP.

---

### 7. Legal research and case analysis

When the initial record is sufficiently processed, Studio becomes available.

Studio works directly against the Notebook and its source references.

The harness coordinates the relevant research, analysis and drafting capabilities rather than treating them as independent applications.

#### A. Initial case assessment

The agent examines:

- The impugned judgment.
- The findings and reasoning of the High Court.
- The pleadings and procedural history.
- The available evidence and record.
- The relief sought and procedural posture.
- Potential errors of law and other proposed grounds.

It identifies missing information, contradictions and questions requiring further instructions.

#### B. Research

The Research Adapter searches relevant legal authorities, initially focusing on Supreme Court judgments.

The agent:

1. Identifies legal propositions requiring support.
2. Searches for relevant authorities.
3. Retrieves judgments and relevant passages.
4. Sends every authority and statutory reference it adopts to verification.
5. Connects authorities to the propositions they support.
6. Identifies potentially adverse authorities.
7. Records whether an authority is supporting, adverse, distinguishable or otherwise relevant.

Research, not verification, assesses whether a passage supports a proposition, in whose voice it is written, and how later judgments have treated it. The advocate confirms each. An authority that has been overruled must be addressed before grounds approval. A difference of opinion between benches is a warning.

A research result is not accepted merely because a model has cited it.

Every authority and relevant passage must be independently verifiable.

#### C. Research prompts and lawyer direction

The agent presents research questions and proposed lines of argument to the advocate.

For example:

- What errors in the impugned judgment may justify Supreme Court intervention?
- Which findings appear unsupported by the record?
- Are there jurisdictional or procedural errors?
- Which questions of law arise?
- What authorities support each proposed ground?
- What authorities may undermine it?
- What additional client instructions or documents are needed?

The advocate can direct additional research, reject a theory, change priorities or request alternative arguments.

#### D. Legal memoranda

Studio produces structured research notes and legal memoranda grounded in Notebook references.

Each proposition must be traceable to its supporting record or authority.

The system distinguishes established facts, disputed facts, legal propositions, assumptions and unanswered questions.

#### E. Case conference

The agent prepares a case-conference package containing:

- Case summary.
- Procedural history.
- Factual Matrix.
- Impugned judgment analysis.
- Questions of law.
- Proposed grounds.
- Supporting authorities.
- Adverse authorities and possible distinctions.
- Evidentiary weaknesses.
- Missing documents and instructions.
- Alternative legal theories.
- Unresolved questions.

The case conference is chaired by the advocate.

The agent presents and compares possible arguments, explains their evidentiary and legal foundations, and identifies weaknesses.

Studio may show advisory outcome scores, clearly labelled as advisory, based on research and current bench trends and never on a particular judge. Scores never enter the petition.

The advocate decides which theories should be pursued.

The conference records accepted arguments, rejected arguments, required research and outstanding instructions.

No proposed argument becomes an approved ground merely because an agent produced it.

---

### 8. Draft the Special Leave Petition

Once the advocate has reviewed the case-conference output and approved the direction, the agent prepares the SLP.

The Document Editor Adapter opens the working petition. The working petition is a DOCX document. The harness coordinates drafting and revision using Notebook references.

The initial petition structure includes:

1. Synopsis.
2. List of Dates.
3. Questions of Law.
4. Grounds.
5. Main petition and relevant supporting sections.
6. Prayer.
7. Annexures and supporting document references.

#### A. List of Dates

Generated from the Factual Matrix.

Every entry refers to its underlying event and source.

#### B. Synopsis

The Synopsis is initially generated from a schema-shaped representation of the case chronology and other approved matter information.

An LLM may later assist in polishing the prose, but each factual sentence must remain traceable to the relevant event IDs and sources.

The model cannot introduce new facts merely to improve narrative flow.

#### C. Questions of Law

Studio proposes questions of law based on the impugned judgment, record and verified legal authorities.

Each question is linked to the legal issue, proposed ground and relevant authority.

#### D. Grounds

Studio drafts grounds using the advocate-approved case theories.

Each ground identifies:

- The challenged finding or legal error.
- The relevant facts and record references.
- The legal proposition.
- Supporting authorities.
- Any relevant adverse authority.
- The relief or consequence sought.

#### E. Annexures

The system identifies and organises the supporting documents, preserving original document identities and references.

Annexure numbering, document selection and page references must remain consistent throughout the petition.

The editor works with the same underlying document and provenance references as the Notebook.

Every generated or revised petition is a new document revision, not an overwrite of the original.

---

### 9. Verification: The petition must pass its quality gates

Drafting is not complete merely because the document looks finished.

The agent coordinates independent verification across document, legal research, matter-record and filing-preparation capabilities.

#### A. Factual verification

- Every factual statement has a supporting source.
- Dates match the Factual Matrix.
- Conflicting dates are resolved or explicitly flagged.
- Party names, case numbers and statutory references are correct.
- Every statutory reference exists in India Code and is not repealed. Where a section has been amended, the advocate confirms which version applies.
- No disputed OCR text is treated as verified fact.
- The petition does not contradict the underlying record.

#### B. Citation verification

- Every case citation is a Supreme Court neutral citation that exists on the court record and names the judgment the petition names.
- The cited paragraph exists in the court's own numbering, and the quoted words occur in it. Whether the paragraph supports the proposition is assessed in Studio and decided by the advocate.
- The parties, date and case number are checked against the court record.
- A citation that fails, or that cannot be resolved, blocks the petition until it is corrected or the advocate self-verifies it. While any citation is blocked, the AI-use disclosure document is not generated.

Citation verification is performed by an independent, deterministic validator. It checks court public records only. Documents supplied by the client are tagged as such and are not verified.

#### C. Adverse-authority review

Before grounds approval, the system records a documented adverse-authority review.

It distinguishes:

- Adverse authority found and addressed.
- No adverse authority identified within the documented search coverage.
- Search incomplete or requiring further work.

#### D. Draft consistency

- Synopsis agrees with the List of Dates and Factual Matrix.
- Questions of Law correspond to the grounds.
- Grounds are supported by the record and authorities.
- Prayer corresponds to the relief sought.
- Annexures and page references are consistent.
- Defined terms, party descriptions and cross-references are correct.

#### E. Filing compliance

The Filing Preparation capability checks the applicable Supreme Court filing requirements and the configured SLP filing state machine.

Checks include:

- Required documents.
- Format and document structure.
- Pagination and indexing.
- Annexure references.
- Affidavits and supporting documents.
- Limitation-related information.
- Required procedural declarations.
- Technical document defects.
- Other applicable filing requirements.

The rules must be versioned and traceable to their sources. They are developed from the Supreme Court Registry's list of filing defects.

Limitation is computed by the system from the record, and confirmed by the advocate with the computation shown.

The filing documents are PDF/A, rendered from the approved DOCX revision.

A filing defect must create a visible review item, not disappear into a generic error log.

#### Quality-gate outcome

The petition can be:

- Ready for advocate review.
- Needs correction.
- Needs additional instructions.
- Blocked pending source verification.
- Blocked pending legal review.
- Blocked pending filing compliance.

A blocked item must identify the defect, its evidence, the affected document or passage and the action required.

The validator's four outcomes (verified, failed, unresolved, not applicable) and the open review items map onto these states through one tested mapping.

---

### 10. Advocate approval and document commitment

The agent presents the completed working petition and its verification results.

The advocate can:

- Review the complete petition.
- Inspect source passages.
- Accept or reject proposed changes.
- Correct factual or legal errors.
- Request additional research.
- Revise grounds and questions of law.
- Approve the final document revision.

The harness submits the proposed revision to the Kernel.

The Kernel validates the approval and commits the resulting document revision and associated canonical records.

The agent cannot independently convert a draft into an advocate-approved final document.

---

### 11. Filing: Agent-operated, lawyer-authorised

Once the petition passes its quality gates and the advocate approves it for filing, the agent can coordinate the filing workflow through the dedicated visible browser.

The filing capability:

1. Identifies the applicable filing portal and workflow.
2. Prepares the required documents and filing information.
3. Checks the exact filing payload.
4. Presents the destination, documents, declarations and proposed action to the advocate.
5. Obtains the first explicit confirmation.
6. Obtains a second deliberate confirmation through the UI.
7. Uses a single-use confirmation token bound to the exact payload hash.
8. Executes the authorised browser action.
9. Captures the resulting receipt, acknowledgement or portal response.
10. Records the outcome and links it to the matter.

Any change to the filing payload invalidates the confirmation token.

Voice instructions can initiate and direct the ordinary workflow, but cannot substitute for the two filing confirmations.

If the portal requires login or CAPTCHA, the advocate completes the required interaction.

If the external portal produces an uncertain result, the system reconciles the portal state before attempting another submission. It must not blindly retry and risk duplicate filing.

The system records the actual result. It must not represent a submission as successful merely because a browser action was attempted.

---

### 12. The unified agent-operated environment

The advocate should experience Open Advocate as one workspace, not a collection of applications.

The harness coordinates capabilities across:

- Matter workspace and file management.
- Court capture and browser automation.
- Client-document import.
- OCR and document intelligence.
- Notebook and factual extraction.
- Legal research and authority verification.
- Case analysis and argument development.
- Case conference.
- Document editing and drafting.
- Petition verification.
- Filing preparation and authorised browser execution.

These capabilities may be implemented by separate modules, adapters or extensions. They do not need to share one implementation or run in one process.

They must, however, share stable document identities, source references, operation IDs and explicit capability contracts.

A passage retrieved by OCR must remain identifiable when used by research, case analysis or the editor. A document revision created by the editor must remain associated with its matter and provenance.

The harness maintains execution context, coordinates tools and manages interruptions, approvals, retries and recovery.

The Kernel owns canonical matter state, permissions, approvals, document commitments and the authoritative record of consequential actions.

The advocate supervises the work and retains authority over legal judgments and filing decisions.

**The result: the advocate gives Open Advocate a case and an objective. Open Advocate acquires the record, builds the Notebook, researches the law, develops arguments, drafts the petition, verifies the result and prepares and executes filing under the advocate's explicit authority.**

## Architecture requirements

These requirements are part of the architecture. They state what the selected design must deliver. They are not new technology choices, and they do not redesign the decisions above.

### Requirements the architecture must deliver

| Requirement | Why it matters |
| --- | --- |
| The harness operates the entire application, not just Studio. | The advocate can instruct it through chat or voice to work across the matter workspace, browser, editor, OCR, research and filing preparation. |
| Shared resource identity across all capabilities. | A document, revision, page or passage must mean the same thing to every component. No disconnected copies that lose provenance. |
| Explicit capability limitations. | An editor that cannot support tracked changes, or a research provider that cannot verify citations, must disclose that limitation rather than pretend to support it. |
| Human supervision throughout the workflow. | The advocate can intervene during extraction, classification, chronology, research, grounds selection, conference, drafting and verification, not just at the end. |
| A workflow-specific SLP state machine. | SLP procedural logic should not become the global state machine for the entire application. Other workflows can have their own procedural rules while reusing common capabilities. |
| Procedural rules are source-backed and versioned. | Rules need jurisdiction, applicability, effective dates and authoritative sources. Ontology constraints alone cannot express every procedural requirement. |
| Verification has explicit outcomes. | The validator has four outcomes: verified, failed, unresolved and not applicable, each with a reason code. Questions that need human determination are review items, and an advocate's self-verification is an attestation, never "verified". The advocate sees the six gate states of section 9. A validator's output is not a judicial determination or a guarantee of filing acceptance. |
| Specialist agents are not automatically separate orchestration systems. | One execution engine runs one long-horizon orchestrator agent per matter. Judgment research and document edits are delegated to sub-agents, which are task configurations inside the same engine. |

### Details that strengthen integration

**Capability limitations must be visible.** If the document editor supports inserting and formatting text but not tracked changes, the agent must know that. If a research provider can search judgments but cannot independently verify citations, it must not claim citation verification.

**The agent must operate the actual tools.** Generating a DOCX and asking the lawyer to import it is not the same as the agent opening and operating the working petition in the editor. The same principle applies to browser navigation, document inspection, research and filing preparation.

**Every operation must preserve resource identity.** The chain runs from the impugned judgment through page, passage, finding, legal proposition and proposed ground to the petition paragraph. The advocate can inspect the source of a statement at any point. This is one of the most important requirements in the entire document.

**The agent must recover, not merely remember.** A saved conversation is not a durable execution engine. The agent must resume interrupted work, understand which operations completed, identify uncertain outcomes and avoid repeating external side effects.

**The architecture needs an integration proof.** Replace an underlying provider and demonstrate that the workflow continues without rewriting the harness or changing Kernel authority. The first drill swaps one OCR engine for the other, because two engines exist from the start. That tests modularity. It is not a reason to build a universal replacement framework prematurely.

### What must survive from the long document

The long document is the earlier working notes. These ideas are the ones that must survive into the built system. Each one is already carried by a decision or a requirement above, and this table is the check that none of them was lost.

| Idea | Why it should survive | Where it lives |
| --- | --- | --- |
| One integrated litigation execution environment | The harness operates the whole application, not merely Studio. | Section 12, and the first requirement above |
| Kernel owns authority; harness owns execution | The fundamental boundary. The agent coordinates work but cannot independently establish canonical legal state. | Sections 10 and 12 |
| Three-layer integration | Capability contracts, adapters and actual component implementations remain distinguishable. | Section 12 |
| Shared resource references | Documents, revisions, pages, passages, findings and drafts retain their identities across tools. | Section 12, and the shared resource identity requirement |
| Capability declarations | An editor or research provider must disclose what it actually supports. A common interface must not pretend different implementations are equivalent. | The explicit capability limitations requirement, and the details above |
| Durable long-running execution | The SLP workflow may involve hundreds of operations and interruptions. It must survive application restarts. | The brain, hands and session section below |
| Dynamic planning | The agent decides what to do next based on acquired documents, missing information, research and review outcomes. | Section 7, and the harness role in section 12 |
| Human intervention throughout | The lawyer can redirect research, correct facts, reject arguments and resolve defects at any stage. | The human supervision requirement, and sections 7 and 10 |
| Workflow-specific state machines | SLP procedural rules belong to the SLP workflow, not a universal application-wide legal workflow. | The workflow-specific SLP state machine requirement |
| Proof of genuine integration | The agent must actually operate the editor, browser, OCR and other capabilities, not merely generate files for manual transfer. | The integration proof detail above |

## The Unix philosophy

The Unix discussion suggests a design philosophy for how Open Advocate's components cooperate. It is a philosophy, not a technology choice, and it fits the process and extension architecture already selected.

- Small tools that do one thing well. OCR extracts text; a verifier checks a proposition; a browser retrieves a document; the Kernel governs canonical state.
- Composability. Components should be usable in combinations that were not necessarily anticipated when they were first built.
- Simple interchange. Prefer simple, inspectable communication over components sharing each other's elaborate internal data structures.
- Thin integration glue. Adapters should translate and connect capabilities, not become another layer of business logic or duplicate the underlying component.
- Process independence. Where components run separately, they should be controllable, replaceable and capable of reporting their own failures.
- Testable interfaces. Libraries should have small exerciser programs or command-line interfaces so their behaviour can be tested independently of the full desktop application.
- Build from working primitives. Do not design a huge universal abstraction before proving that the underlying operations work.

Composability does not mean forcing every component into an identical interface. The integration boundary should stay simple, while each component retains its own useful capabilities and limitations.

The whole product is built CLI first. Every capability is usable from the `oa` command line, over the same control protocol the panes and the agent use, before it has a pane. The validator, `ulos`, is a second, independent command-line program. This is the philosophy applied to the product: each capability is testable on its own, scriptable, and composable in a shell.

The `ulos` validator in [ULOSarchitecture.md](ULOSarchitecture.md) is the same philosophy applied to the standard. It is a small program that does one thing, it runs without the application, and it is the only implementation of the checks. The application's verification adapter is tested against its outputs.

## Brain, hands and session

A useful distinction from the managed-agents literature:

- Brain: model and harness. It reasons, plans and coordinates.
- Hands: tools and execution environments. They perform actions.
- Session: a durable record of what happened, independently recoverable.

The requirements to retain are:

1. A failed tool or execution environment is reported as a tool failure. It must not silently destroy the entire task.
2. The harness recovers from durable session history. It does not rely on its own process memory to survive.
3. Session history is not the model's context window. The harness retrieves relevant history and assembles the context needed for each model call.
4. Credentials are not exposed to untrusted execution environments. Access is mediated through narrowly scoped capabilities.
5. The harness does not assume that every tool or resource lives in the same process or environment.
6. One harness coordinates multiple tools without creating a separate agent runtime for each tool.

This explains why the harness must be independent of the components it operates. It reinforces the existing decisions on durable execution, scoped permissions, explicit failures and recovery.

The session is kept apart from the canonical record. There are two logs. The canonical ledger is the audit record, owned by the Kernel, never held in memory or in a model's context, and auditable on demand. The harness session store is harness-local durable state per matter workspace, used for recovery and replay. Development traces, which an observer such as iii may keep, are disposable and are neither.

## The settled design

The design questions are settled in [decisions.md](decisions.md). This section states the shape they produce. The parts list is [component-map.md](component-map.md), and each group has a spec in [specs/](specs/README.md).

### Principles

1. **CLI first.** Every capability is a set of typed control commands, usable from `oa` before it has a pane.
2. **The Kernel writes the record.** Everything else proposes.
3. **One validator.** `ulos` is deterministic, has no model, and is a separate binary. The verification adapter builds its input and maps its output. Only the Supreme Court portal, through `ulos`, verifies a citation. The AWS open-data catalogue of Supreme Court judgments is outside the standard, and is used only for research and for a quick check that gives an early signal.
4. **Verification is mandatory and online.** There is no offline mode. An unreachable source gives `unresolved`, which blocks.
5. **Only court public records are verified.** Client-supplied files are tagged and never verified.
6. **Legal judgement stays with the advocate.** Voice, treatment, limitation, amended-section versions and self-verification are recorded human decisions.
7. **Vendor the source, run it separately.** The OCR engines, WordCraft and PdfCraft are vendored in our tree and run as separate supervised processes.
8. **DOCX is the working format. PDF/A is the filing format.** Every document is drafted and verified in DOCX, because advocates work in DOCX. When the approved DOCX is final it is converted to PDF/A, a conversion check confirms the PDF says exactly what the verified DOCX says, and the PDF/A is filed. The PDF is never edited. A change goes back to the DOCX.

### Process topology

| Process | Role | Why separate |
|---|---|---|
| Window | egui and winit shell, our panes, our viewer | The advocate's surface must survive everything else |
| Kernel | Single writer of canonical state, control protocol endpoint, supervisor | The authority boundary |
| Harness | The agent loop: one orchestrator per matter, sub-agents, providers, policy | Most likely to hang, loop or exhaust memory |
| OCR, one per engine | Tesseract and PaddleOCR | Hostile input, heavy native code, and the disagreement signal |
| Browser, one per profile | Matter profiles, the filing profile, the agent's headless profile | Crash and cookie isolation |
| WordCraft, PdfCraft | Hosted editors, reparented into our panes | Their own egui forks and storage |
| `ulos` | The validator, run per verification | Independence |

### Storage

| Store | Where | Owner |
|---|---|---|
| Canonical record: ledger, evidence entries, Notebook, drafts index, approvals, filing payloads, search and vector indexes | `<matter>/matter.db` | Kernel |
| Source bytes and draft revisions | `<matter>/blobs/` | Kernel |
| Harness session store | `<matter>/harness/session.db` | Harness |
| Matter index | `<app data>/registry.db`, rebuildable from the folders | Kernel |
| Firm data | `<app data>/firm.db` | Kernel |
| Secrets | OS keychain | Kernel |

A matter is a folder. Removing the folder removes the matter.

### Human-only commands

Approvals, filing confirmations, review-item skips, OCR decisions, typed copies, voice and limitation confirmations, attestations and browser attachment are a separate command class. The Kernel refuses them on any connection that originates from the harness. From the CLI they need an operating-system user-presence prompt. This is what keeps "the advocate approves" true when the agent can also run `oa`.

## The ULOS standard

The Uniform Legal Ontology Standard is the contract layer the capabilities share. It is defined in [ULOSarchitecture.md](ULOSarchitecture.md), which is a separate document and stays separate. This section records only how the standard relates to this architecture.

The standard and its validator are ours and simulated, because no court standard or court validator exists. Their purpose is a fixed contract the adapters are written against. The checks themselves run against court sources.

The standard has four functions.

- ULOS-L checks that the Act and section cited in a draft exist in India Code, are not repealed, and match the cited number and year. An amended section needs the advocate to confirm the applicable version.
- ULOS-C checks that a Supreme Court neutral citation names a real judgment on the court record, and that it is the judgment the draft names.
- ULOS-CI checks that the cited paragraph exists in the court's numbering, that the quote occurs in it, and that the pinpoint is not in a headnote.
- ULOS-N checks that the Notebook holds the correct impugned judgment and orders, captured from the Supreme Court portal. Client-supplied files are not checked.

The standard serves the requirements above in four ways.

- **Shared resource identity.** The standard defines the identifiers for a matter, a judgment, an Act, a section and a document's bytes. A passage that OCR extracts, research cites and the editor inserts carries the same reference in every component.
- **Explicit capability limitations.** The standard states what it cannot verify. A file the client supplied, whether a passage supports a proposition, its voice and treatment, and whether a filing will be accepted are all outside it, and a validator that claims otherwise is wrong.
- **Verification has explicit outcomes.** Four outcomes with reason codes for every check, kept apart from Studio's assessment of support.
- **Independence.** The validator is a separate deterministic program with no model. The application cannot produce a verification record without it.

The standard does not own canonical state. The Kernel still owns the matter, the permissions, the approvals and the commits. The standard says what a verification claim must contain and how anyone re-checks it.

The questions that shaped the standard, RQ-43 to RQ-67, are settled in [decisions.md](decisions.md).
