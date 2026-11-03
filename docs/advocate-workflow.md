# Open Advocate — End-to-End Advocate Workflow

The settled architecture decisions are canonical in [architecture.md](architecture.md). This document states the intended end-to-end advocate workflow. Supplemental requirements appear after the workflow details.

Sections 1 to 12 are identical to sections 1 to 12 of [architecture.md](architecture.md), including the amendments of 4 November 2026 listed there. Every design question is settled in [decisions.md](decisions.md).

## 1. The objective: From instruction to filing-ready SLP

Open Advocate is an agent-operated litigation workspace for Indian advocates.

The advocate should not have to manually move information between a file manager, browser, OCR application, research tool, case-analysis system and document editor.

Instead, the advocate gives the agent an instruction, provides or identifies the available material, and supervises the work.

The agent coordinates the complete workflow:

**Matter creation → Record acquisition → Document intelligence → Notebook → Legal research → Case conference → SLP drafting → Verification → Filing preparation → Filing**

The system is deeply integrated. A document discovered on a court website, a passage extracted through OCR, a fact identified during analysis, a judgment found during research and a paragraph inserted into the petition all retain their relationships to their original sources.

The advocate remains in control of legal decisions and consequential actions. The Kernel remains in control of canonical matter state, permissions, approvals and commits.

---

## 2. Starting a matter: Voice, document or case number

The advocate can initiate a matter in several ways:

- Give the impugned judgment PDF to Open Advocate.
- Provide the High Court case number, CNR or other available case identifier.
- Give a voice instruction describing the case.
- Import an existing set of client documents.
- Identify where client documents are available, including an authorised email account.

For example:

> Prepare an SLP against this High Court judgment. The client's documents are in my email. Retrieve the complete High Court record, analyse the case, research possible grounds and prepare a draft petition for my review.

The agent interprets the instruction and identifies the information and permissions required.

### Matter creation

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

## 3. Acquire the complete case record

The agent identifies the relevant court sources and begins acquiring the available record.

### Court record acquisition

The Court Capture Adapter accesses the Supreme Court portal and searches using the available case identifiers. The High Court judgment and orders are found through the portal's lower-court search. High Court websites are a later adapter. Pleadings and other papers that no portal publishes come from the client, and are tagged as supplied by the client.

The agent:

1. Locates the case.
2. Inspects the available case information.
3. Identifies available documents and procedural records.
4. Downloads the available artifacts.
5. Records the source URL, capture time and retrieval metadata.
6. Associates the downloaded material with the matter's unclassified inbox.

The advocate may already have uploaded some documents. Those are retained alongside the retrieved record.

### Authentication and CAPTCHA

The system does not bypass authentication, CAPTCHA or other access controls.

- If login is required, the dedicated visible browser is opened for the advocate.
- The advocate completes authentication.
- If CAPTCHA appears, the advocate solves it in the visible browser.
- The agent resumes the authorised capture workflow.

The agent must not silently inherit credentials or an authenticated session from the advocate's ordinary browser.

### Client documents from email

Where the advocate has explicitly connected and authorised an email account, the agent can:

1. Search for relevant client correspondence using the supplied instructions.
2. Identify potentially relevant attachments.
3. Present ambiguous matches for advocate confirmation.
4. Retrieve authorised attachments.
5. Preserve email and attachment provenance.
6. Import the attachments into the matter inbox.

Email content is treated as source material, not as an instruction to change permissions or perform consequential actions.

The advocate can also import documents directly or provide them through the workspace.

### Acquisition is continuous

Court downloads and client-document imports do not need to finish before analysis begins.

Every successfully acquired artifact becomes an independent processing task.

---

## 4. Document intelligence: Analyse each artifact as it arrives

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

### OCR and transcription

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

### Document identity and annexures

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

## 5. Notebook: The integrated matter record

The Notebook begins taking shape as soon as documents arrive.

It is not a final report produced after all downloads. It is the continuously updated, structured matter workspace through which the advocate and agent work.

The Notebook brings together:

### A. Source documents

Original files, document identities, revisions, extracted text, page references and provenance.

### B. Procedural history

Court proceedings, orders, applications, filings, hearings, dates and procedural developments.

### C. Factual Matrix

Structured candidate facts and advocate-confirmed facts, with references to their original sources.

### D. Chronology

A date-oriented view of the procedural and factual history, preserving date type, source and uncertainty.

### E. Legal issues

Issues, claims, contradictions, missing facts, proposed propositions and unresolved questions.

### F. Authorities

Judgments, statutory provisions, relevant passages, propositions and their treatment in the case.

### G. Work products

Research notes, legal memoranda, case-conference findings, draft grounds, questions of law and petition revisions.

### H. Review and verification

OCR disputes, conflicting dates, unverified citations, missing documents, adverse authorities, unresolved legal questions and filing defects.

The Notebook is the common reference surface for all subsequent operations.

The agent does not copy documents and facts into isolated tools. It passes stable document, passage, fact, authority and artifact references between capabilities.

The graph is a queryable projection of the underlying records, not an independent source of truth.

---

## 6. Build the procedural history and Factual Matrix

Once source material becomes available, the agent begins reconstructing the case.

### Procedural history

The system identifies relevant procedural events, including:

- Institution of the original proceedings.
- Applications and replies.
- Interim orders.
- Evidence and hearings.
- Final judgment.
- Review or other subsequent proceedings, where applicable.
- Relevant filing and limitation dates.

Every event is linked to its supporting document and precise source location.

### Factual Matrix

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

## 7. Legal research and case analysis

When the initial record is sufficiently processed, Studio becomes available.

Studio works directly against the Notebook and its source references.

The harness coordinates the relevant research, analysis and drafting capabilities rather than treating them as independent applications.

### A. Initial case assessment

The agent examines:

- The impugned judgment.
- The findings and reasoning of the High Court.
- The pleadings and procedural history.
- The available evidence and record.
- The relief sought and procedural posture.
- Potential errors of law and other proposed grounds.

It identifies missing information, contradictions and questions requiring further instructions.

### B. Research

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

### C. Research prompts and lawyer direction

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

### D. Legal memoranda

Studio produces structured research notes and legal memoranda grounded in Notebook references.

Each proposition must be traceable to its supporting record or authority.

The system distinguishes established facts, disputed facts, legal propositions, assumptions and unanswered questions.

### E. Case conference

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

## 8. Draft the Special Leave Petition

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

### A. List of Dates

Generated from the Factual Matrix.

Every entry refers to its underlying event and source.

### B. Synopsis

The Synopsis is initially generated from a schema-shaped representation of the case chronology and other approved matter information.

An LLM may later assist in polishing the prose, but each factual sentence must remain traceable to the relevant event IDs and sources.

The model cannot introduce new facts merely to improve narrative flow.

### C. Questions of Law

Studio proposes questions of law based on the impugned judgment, record and verified legal authorities.

Each question is linked to the legal issue, proposed ground and relevant authority.

### D. Grounds

Studio drafts grounds using the advocate-approved case theories.

Each ground identifies:

- The challenged finding or legal error.
- The relevant facts and record references.
- The legal proposition.
- Supporting authorities.
- Any relevant adverse authority.
- The relief or consequence sought.

### E. Annexures

The system identifies and organises the supporting documents, preserving original document identities and references.

Annexure numbering, document selection and page references must remain consistent throughout the petition.

The editor works with the same underlying document and provenance references as the Notebook.

Every generated or revised petition is a new document revision, not an overwrite of the original.

---

## 9. Verification: The petition must pass its quality gates

Drafting is not complete merely because the document looks finished.

The agent coordinates independent verification across document, legal research, matter-record and filing-preparation capabilities.

### A. Factual verification

- Every factual statement has a supporting source.
- Dates match the Factual Matrix.
- Conflicting dates are resolved or explicitly flagged.
- Party names, case numbers and statutory references are correct.
- Every statutory reference exists in India Code and is not repealed. Where a section has been amended, the advocate confirms which version applies.
- No disputed OCR text is treated as verified fact.
- The petition does not contradict the underlying record.

### B. Citation verification

- Every case citation is a Supreme Court neutral citation that exists on the court record and names the judgment the petition names.
- The cited paragraph exists in the court's own numbering, and the quoted words occur in it. Whether the paragraph supports the proposition is assessed in Studio and decided by the advocate.
- The parties, date and case number are checked against the court record.
- A citation that fails, or that cannot be resolved, blocks the petition until it is corrected or the advocate self-verifies it. While any citation is blocked, the AI-use disclosure document is not generated.

Citation verification is performed by an independent, deterministic validator. It checks court public records only. Documents supplied by the client are tagged as such and are not verified.

### C. Adverse-authority review

Before grounds approval, the system records a documented adverse-authority review.

It distinguishes:

- Adverse authority found and addressed.
- No adverse authority identified within the documented search coverage.
- Search incomplete or requiring further work.

### D. Draft consistency

- Synopsis agrees with the List of Dates and Factual Matrix.
- Questions of Law correspond to the grounds.
- Grounds are supported by the record and authorities.
- Prayer corresponds to the relief sought.
- Annexures and page references are consistent.
- Defined terms, party descriptions and cross-references are correct.

### E. Filing compliance

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

### Quality-gate outcome

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

## 10. Advocate approval and document commitment

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

## 11. Filing: Agent-operated, lawyer-authorised

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

## 12. The unified agent-operated environment

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

## Workflow principles

The Notebook is not a separate working copy of the record. It is the lawyer-facing, integrated matter workspace. Its graph is a derived projection; canonical records, source documents and revisions remain under Kernel control.

Processing is event-driven. Downloads, OCR, classification, indexing and extraction begin as individual files arrive. The agent does not wait for the entire record.

Research, analysis and drafting are connected. A source reference discovered during OCR must remain traceable through factual analysis, legal propositions, research, drafting and verification.

Filing is agent-operated, not agent-authorised. The agent can prepare and execute the browser workflow, but the lawyer must explicitly approve the exact filing payload twice. Voice alone cannot authorise filing.

## Important workflow details that should not be lost

These are specific operational details from your original working notes. Some are already covered by your settled decisions, but the earlier flow did not preserve all of them.

### A. Capture and ingestion are separate

The document makes a useful distinction:
- Capture retrieves or imports files.
- Ingestion processes files.
- Both feed the same matter workspace and storage.

Capture should not perform OCR or transcription itself. This keeps court retrieval independent of document processing.

The original notes also specify two capture paths: importing files and fetching from court portals. A file should enter the processing queue regardless of how it arrived.

### B. Preserve the three kinds of duplication

The three-layer duplicate handling is worth retaining:
1. Identical bytes: same SHA-256 hash; retain one physical blob and record additional origins.
2. Same court listing: potentially one legal document represented by multiple captured files; preserve both source files.
3. Same text after OCR: suggest a possible duplicate, but require advocate confirmation. Never automatically merge or discard the certified scan.

This protects the distinction between a legal document and the files that represent it.

### C. Date extraction has useful finer distinctions

The old notes contain more detail than simply extracting dates:
- Recognise explicit Indian court date formats first.
- Interpret relative dates against the document's own header date, not the computer clock.
- Distinguish explicit, inferred and unresolved dates.
- Preserve time-of-day as a property of the date extract.
- Do not turn vague expressions such as "thereafter" into invented dates.
- Keep inferred dates visibly marked and reviewable.
- Only checked dates should be used in generated SLP prose.
- Excluding a date from the chronology must not delete its underlying extract.

This is an important safeguard against manufactured procedural history.

### D. The Notebook has a useful readiness definition

The earlier flow says the Notebook continuously fills. The original adds a precise operational condition:

Notebook ready means no ingestion jobs remain queued or running, and review items have either been resolved or explicitly skipped.

That is a useful distinction between an evolving Notebook and a record ready for downstream work.

It should not prevent the agent from starting preliminary research before the entire Notebook is ready. Readiness is a workflow milestone, not a prohibition on parallel work.

### E. Source traceability should survive every transformation

The original source chain is particularly good:

Extract → Line → Page → Source hash → Original file

The intended downstream relationship is:

File → Page → Line → Event → Claim → SLP paragraph

The second chain can evolve as the legal record and ontology develop. The first is the essential source-provenance path. A research proposition or draft paragraph should never lose its connection to the original material.

## Supplemental requirements

These requirements come from the supplemental notes. Items 9 to 13 have a fuller treatment in the workflow details above.

1. Whole-application agent operation through chat and voice.
2. Shared resource identity and provenance across all capabilities.
3. Continuous human supervision and explicit review states.
4. Separate workflow-specific procedural state machines.
5. Versioned, jurisdiction-specific, source-backed procedural rules.
6. Explicit verification outcomes and limitations.
7. Unix composability, simple interchange and thin integration glue.
8. Durable, recoverable agent sessions independent of the harness process.
9. Separate capture and ingestion responsibilities.
10. Three-layer duplicate detection.
11. Explicit, inferred and unresolved date handling.
12. A precise Notebook readiness condition.
13. End-to-end source traceability from original file to SLP paragraph.