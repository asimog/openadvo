# Stage 2 — Domain Design: Ownership and Relationships

| | |
|---|---|
| Status | Stage 2 of 4. **Proposed domain design. Not accepted.** |
| Date | 20 November 2026 |
| Inputs | The Stage 1 audit (`1-audit.md`) and the owner requirements in the rewrite assignment. |
| Not used as authority | `docs/rewrite/`, the untracked planning documents, and the repository documents that assert earlier decisions. |
| Next document | `3-runtime-and-interfaces.md` (Stage 3), then `4-implementation-plan.md` (Stage 4). |

## How to read this document

Each decision is labelled.

| Label | Meaning |
|---|---|
| **Owner requirement** | The rewrite assignment states it. It outranks the current code and the current documents. |
| **Verified current behaviour** | Stage 1 observed it in the code. It is context, not a target. |
| **Proposed decision** | My recommendation. It is not accepted until the owner accepts it. |
| **Open** | The evidence or the owner decision is missing. |

The design is deliberately smaller than the current application. It does not try to preserve every table or feature. It tries to give each type of truth one owner and one place to change.

### Decision status at a glance

| Part of this document | Status |
|---|---|
| Vocabulary (section 2) | **Proposed** |
| Ownership map (section 3) | **Proposed** |
| Relationships (section 4) | **Proposed** |
| Six core domains (section 5) | **Proposed** |
| Four-layer fact model (section 5.7) | **Proposed** |
| Other domains (section 6) | **Proposed** |
| Shared kernel (section 7) | **Proposed** |
| Acceptance model (section 8) | **Proposed** |
| Capability and policy model (section 9) | **Proposed** |
| State transitions (section 10) | **Proposed** |
| Contracts (section 11) | **Illustrative, not final** |
| Scenario validation (section 12) | **Proposed; all twelve are explained** |
| Persistence layout (section 14) | **Proposed; Stage 3 confirms** |
| D1 to D4 (section 17) | **Owner decision required** |
| Runtime, CLI, UI, migration (section 18) | **Not settled; Stage 3 or 4** |

Nothing in this document is accepted architecture until the owner accepts it. A "Proposed" label is not a decision.

---

## 1. The design problem in one page

The current application has one per-matter database with 83 tables and one main-process module with most of the services. The database is the real bounded context. That is why the code is hard to maintain: there is no boundary to change inside, only a large file to edit.

The target is a **modular monolith** with explicit domain ownership. One process, one local database per scope, many modules. No microservices. No distributed system. No second database server.

The central rule is:

> **A domain owns its records and its decisions. It exposes operations. It does not let another domain write its tables. A workflow or an agent may coordinate domains, but it owns none of their records.**

The second rule is:

> **A legal decision is a record, not a status field. A model output is a proposal, not a fact. A court document is evidence only when an advocate says what it is offered to prove.**

These two rules solve most of the failures in Stage 1.

---

## 2. Settled vocabulary

The current code uses "matter", "proceeding", "case", "case type", "court file", "document", "evidence" and "fact" loosely. The rewrite must use one meaning for each. These are the proposed meanings.

| Term | Proposed meaning | Not this |
|---|---|---|
| **Matter** | The advocate's engagement for a client. It is the unit of intake, scope, assignment, access and closure. | Not a court case. Not a case number. Not a proceeding. |
| **Client** | The person or organisation the advocate acts for. It can have many matters. | Not every party. Not a contact kind. |
| **Proceeding** | A legal claim, appeal, application or execution before a court or tribunal. It has a forum, a case type, parties, relief, a stage and a procedural history. | Not a matter. Not a case type. Not a court file. |
| **Court File** | The court registry's record of a proceeding in one court: case number, diary number, filing date, bench, status as reported, documents filed and exhibits marked. | Not the legal claim. Not the matter. Not the filing preparation set. |
| **Case Type** | A court's taxonomy value for a proceeding, such as `SLP(C)`, `W.P.(C)`, `RFA`, `CS`, `Bail Application`. | Not a proceeding. Not a practice area. Not a workflow. |
| **Court** | A forum identity from the court directory, such as `in.sc` or `in.hc.delhi`. | Not a text field on a matter. |
| **Document** | A stable intellectual object that can be identified and cited, such as "the impugned judgment dated 1 March 2024". It has versions. | Not a file on disk. Not evidence. Not a draft. |
| **Document Version** | One immutable content state of a document, with bytes, a hash and provenance. | Not a derived OCR text. Not a converted PDF. |
| **Representation** | A derived form of a version: text, OCR, PDF/A, thumbnail. It can be rebuilt. | Not the original. Not a new version. |
| **Evidence** | A legal item offered or usable to prove a fact. It can be a document, testimony, an object, an electronic record or an admission. | Not the document itself. Not the fact. |
| **Factual Record** | The assertions about what happened, their sources, the parties' positions, the court's findings, the advocate's decisions and the contradictions. | Not a boolean. Not a single status field. Not chat history. |
| **Draft** | A work product that references facts, evidence and authorities by id. | Not a court document until it is filed or served. |
| **Court Adapter** | An integration that declares what it can do with one court or portal and returns observations or prepared filings. | Not the owner of legal records. Not a filing authority. |
| **Capability** | A declared application operation with input, output, owner, scope, access, risk, approval and side effects. | Not a tool name. Not a permission list. |
| **Workflow** | A definition that coordinates capabilities in order, with gates and recovery. | Not a prompt template. |
| **Prompt Template** | Text instructions to an agent. The current code calls this a "workflow". | Not an execution graph. |
| **Chat** | An execution log between the advocate and an agent. | Not a legal record. Not a fact store. |

**Proposed decision.** The rewrite uses these terms in code, contracts, UI labels and documents. A synonym is a defect.

---

## 3. Ownership map

This is Deliverable B. The map covers the candidate domains in the assignment. The six core domains are expanded in section 5. The others are summarised in section 6.

| Domain | Canonical records | Rules it owns | Operations it exposes | Depends on | Explicit exclusions |
|---|---|---|---|---|---|
| **Matter** | Matter, Client, MatterClient, MatterAssignment, MatterInstruction, MatterRelationship, MatterLifecycleEvent | A matter has a client and a lead advocate. It can have zero or many proceedings. Access is by assignment. Closure is an advocate decision. | `openMatter`, `updateMatter`, `assignAdvocate`, `recordInstruction`, `linkMatter`, `closeMatter`, `reopenMatter`, `archiveMatter`, `getMatter`, `listMattersForActor` | Advocate/Organisation ids; Policy port | Court, case number, stage, hearing, document, evidence, fact, draft, research |
| **Proceeding** | Proceeding, ProceedingParty, Hearing, Order, StageRecord, ProceedingRelationship, ProceedingDocumentRole | A proceeding belongs to one matter and one court. It has one case type. An appeal is a new proceeding. A stage is recorded, not inferred. | `createProceeding`, `updateProceeding`, `recordStage`, `addParty`, `recordHearing`, `recordOrder`, `linkProceeding`, `closeProceeding`, `getProceeding`, `listProceedings` | Matter ids; Court directory; Document ids for orders; Evidence ids for court-file exhibits | Matter lifecycle, document bytes, evidence status, fact truth, drafts, tasks |
| **Court File** (inside Proceeding) | CourtFile, CourtFileDocument, CourtFileExhibit, CourtFileOrder, CourtFileEvent | A court file has one lead proceeding and one court. Its interlocutory applications share the file. One current file per proceeding. Registry identity is separate from the legal claim. | `createCourtFile`, `renumberCourtFile`, `transferCourtFile`, `addCourtFileDocument`, `addCourtFileExhibit`, `recordCourtOrder`, `recordCourtStatus`, `closeCourtFile` | Proceeding; Court; Document ids; Evidence ids | Document content, evidence decisions, fact truth, filing preparation |
| **Document** | Document, DocumentVersion, Representation, DocumentClassification, ProcessingJob | A document belongs to one matter. Versions are immutable. The original is preserved. A hash proves bytes, not authenticity. | `registerDocument`, `addVersion`, `classifyDocument`, `processVersion`, `rebuildRepresentation`, `supersedeVersion`, `getDocument`, `listDocuments` | Matter ids; Blob port; OCR/conversion ports | Evidence status, court-file roles, facts, drafts, filing manifest |
| **Evidence** | EvidenceItem, Witness, ChainOfCustody, EvidenceVerification, EvidenceRelation, EvidenceDecision | Evidence is matter-scoped. Authenticity, admissibility and inclusion are separate. Decisions are human-only. | `registerEvidence`, `assessAuthenticity`, `assessAdmissibility`, `includeEvidence`, `excludeEvidence`, `recordChain`, `verifyEvidence`, `getEvidence`, `listEvidence` | Matter ids; Document ids; Witness ids (Evidence-owned) | Document bytes, court-file labels, fact truth, legal propositions |
| **Factual Record** | FactAssertion, FactSource, PartyPosition, JudicialFinding, FactDecision, FactRelation, FactProceedingLink | Facts are matter-scoped. Origin, review state and legal effect are separate. A model extraction cannot be accepted without an advocate. A judicial finding is recorded from an order. | `proposeFact`, `recordFactSource`, `recordPartyPosition`, `recordJudicialFinding`, `reviewFact`, `supersedeFact`, `relateFacts`, `linkProceeding`, `getFact`, `listFacts`, `factHistory` | Matter ids; Document anchors; Evidence ids; Proceeding ids | Legal propositions, issues, evidence authenticity, document content, drafts |
| **Advocate & Organisation** | Advocate, Organisation, Membership, Role, PracticeArea, AdvocatePreference, BarEnrolment | An advocate belongs to an organisation. Roles are capability sets, not legal authority. Practice areas are classifications. | `createAdvocate`, `createOrganisation`, `addMember`, `setRole`, `proposePreference`, `approvePreference`, `getAdvocate`, `listMembers` | Policy port | Matter access decisions, matter records, court data |
| **Court** | Court, Bench, CaseType, CourtRule, PracticeDirection, CourtAdapterRegistration, CourtObservation | Courts and case types are data. Adapters declare capabilities. An observation is not a legal record. Stale rules are visible. | `listCourts`, `getCourt`, `listCaseTypes`, `registerAdapter`, `observeCourt`, `checkRuleFreshness` | None | Legal records, filing approval, evidence, facts |
| **Research & Knowledge** | Authority, Statute, Provision, Proposition, CitationCheck, ResearchCollection, ResearchQuery | A result is a candidate. A proposition needs a supporting passage. Public law is firm-level; matter research is matter-level. | `searchLaw`, `saveAuthority`, `proposeProposition`, `acceptProposition`, `checkCitation`, `getAuthority` | Court ids; Document ids for judgments; Blob port | Facts, evidence, court-file records, drafts |
| **Drafting** | Draft, DraftSection, Revision, CitationReference, DraftCheck, DraftApproval, Issue, IssueElement, IssueFactLink, IssueAuthorityLink | A draft references facts, evidence and authorities by id. Revisions are immutable. A draft cannot state an unaccepted fact as established. An issue is a legal question that links to facts and authorities; it is not a fact. | `createDraft`, `saveRevision`, `insertCitation`, `checkDraft`, `approveRevision`, `createIssue`, `linkIssueFact`, `getDraft`, `listDrafts` | Matter ids; Factual Record; Evidence; Research | Facts, evidence, court records, filing state |
| **Work Management** | Task, Deadline, ReviewItem, ApprovalRequest, WorkflowDefinition, WorkflowRun, PromptTemplate | Work coordinates domains; it owns no domain record. A run has a durable state and a resume or fail path. Approvals are human. | `createTask`, `assignTask`, `startWorkflow`, `resumeWorkflow`, `decideApproval`, `listInbox` | Capability registry; all domains by id | Matter, proceeding, document, evidence, fact, draft, research |
| **Audit & Policy** (platform) | AuditEvent, Capability, PolicyDecision, AccessDecision | Every important action is audited. Policy fails closed. Capabilities are declared once. | `appendAudit`, `evaluatePolicy`, `registerCapability`, `listCapabilities` | Kernel only | Legal records and legal decisions |

### 3.1 The critical ownership choices

**Choice 1 — Matter does not own the court case.** Matter owns the engagement. Proceeding owns the court case. This is the change that makes multi-proceeding matters possible.

**Choice 2 — Court File is a separate record inside the Proceeding domain.** Proceeding is the legal claim. Court File is the registry's record. They are separate aggregates, but one module owns both, because a court file has no meaning without its proceeding. A proceeding can have no file (draft), one current file, or several historical files (renumbering, transfer, restoration). An appeal is a new proceeding with a new file.

**Choice 3 — Facts are matter-scoped, not proceeding-scoped.** The same payment, meeting or notice can matter in the suit and the appeal. Duplicating facts per proceeding creates conflicting copies. Facts link to proceedings through relevance and through party positions and findings.

**Choice 4 — Evidence and facts are separate domains.** Evidence answers "what is this item, where did it come from, is it authentic, is it admissible, and is it included?" Facts answer "what do we assert happened, on what source, who accepts it, and is it disputed?" An inadmissible document can be authentic. An admission can establish a fact with no document. Merging them forces one status and loses both distinctions.

**Choice 5 — Court File owns "as filed" roles; the Document and Evidence domains own the items.** The same judgment is `order` in the trial proceeding and `impugned_order` in the appeal. The same evidence item is Exhibit P-1 in the suit and Annexure A-3 in the appeal. Roles belong to the file, not to the item.

**Choice 6 — Documents are matter-scoped; court files are matter-scoped.** The same external case number in another matter is a separate record. The court's case number is an external identifier, not a join key across clients. This is a confidentiality rule, not a convenience.

**Choice 7 — A client is not a contact kind.** A client has a stable identity and can have many matters. A contact directory is not a legal record. Opposing parties, counsel and witnesses are party identities, not clients.

**Choice 8 — Assignment is a matter record; access is a policy decision.** Advocate and Organisation own identity, membership and roles. Matter owns the assignment. Policy combines actor, assignment, capability and scope. No single domain owns "access" alone.

---

## 4. Relationships

### 4.1 Diagram

```
Organisation 1 ─── * Advocate
      │                  │
      │           MatterAssignment (owned by Matter)
      │                  │
      └─────────────── Matter 1 ─── * Proceeding * ─── 1 current CourtFile
                           │              │                │
                           │              ├── * Hearing     ├── * CourtFileDocument ──► DocumentVersion
                           │              ├── * Order ──────┼── * CourtFileExhibit  ──► EvidenceItem
                           │              ├── * ProceedingParty
                           │              └── * StageRecord
                           │
                           ├── * Document 1 ─── * DocumentVersion 1 ─── * Representation
                           │                            ▲
                           ├── * EvidenceItem ──────────┘ (source)
                           │
                           ├── * FactAssertion 1 ─── * FactSource ──► DocumentVersion / EvidenceItem
                           │         │        │
                           │         │        ├── * FactDecision
                           │         │        ├── * FactRelation
                           │         │        ├── * PartyPosition ──► Proceeding
                           │         │        └── * JudicialFinding ──► CourtFile + Order
                           │
                           ├── * Draft 1 ─── * Revision
                           │
                           └── * Task / Deadline / ReviewItem / WorkflowRun
```

A Court File has one lead proceeding. Its interlocutory applications share the same file. An appeal has its own proceeding and its own file.

### 4.2 Cardinalities

| Relationship | Cardinality | Rule |
|---|---|---|
| Organisation → Advocate | 1 : * | An advocate belongs to at least one organisation |
| Matter → Client | * : * | A matter has at least one client; a client can have many matters |
| Matter → Proceeding | 1 : * | A matter can have zero proceedings at intake, and many later |
| Proceeding → CourtFile | * : 1 current | One current file; historical files remain |
| CourtFile → Proceeding | 1 : * | One lead proceeding, plus its interlocutory applications |
| CourtFile → CourtFileDocument | 1 : * | A document version can appear in many files with different roles |
| CourtFile → CourtFileExhibit | 1 : * | An evidence item can be marked in many files with different labels |
| Document → DocumentVersion | 1 : * | One current version; older versions remain |
| DocumentVersion → Representation | 1 : * | Text, OCR, PDF/A, thumbnail |
| EvidenceItem → DocumentVersion | * : 0..1 | Document evidence points to a version; testimony/object evidence does not |
| FactAssertion → FactSource | 1 : * | A fact needs at least one source or an explicit no-source reason |
| FactAssertion → EvidenceItem | * : * | One fact can rest on several items; one item can support several facts |
| FactAssertion → Proceeding | * : * | Relevance, not ownership |
| PartyPosition → FactAssertion | * : 1 | A party's stance in a proceeding |
| JudicialFinding → FactAssertion | * : 1 | A court's finding in a proceeding |
| Draft → Revision | 1 : * | Revisions are immutable |
| WorkItem → subject | * : 1 | By id only; no copy of the subject |

### 4.3 Relationship rules

1. **No cross-matter references.** A document, evidence item, fact, draft or court file belongs to exactly one matter. A query that returns another matter's record is a defect.
2. **A matter does not store a court or case number.** Those are proceeding and court-file fields.
3. **A proceeding does not store document bytes or evidence status.** It references them.
4. **A court file does not own the document or the evidence item.** It owns the role of that item in that file.
5. **A fact does not own evidence.** It cites evidence and document anchors. Evidence can be excluded and the fact can still stand on another source.
6. **A judicial finding is not the advocate's fact.** It is a finding by a court, recorded from an order with an anchor.
7. **A draft does not copy facts, evidence or authorities.** It references ids and anchors.
8. **A workflow does not write domain records.** It invokes capabilities.
9. **Chat does not write legal records.** It is an execution log. A durable outcome is an application operation.

---

## 5. The six core domains

Each section states what the domain owns, what it does not own, its rules, its operations, its dependencies and the invariants that must be tested.

### 5.1 Matter

**Owns.**
- Matter identity, title, status, open and close dates.
- Client identity and the client's role in the matter.
- Matter assignments: lead advocate, assigned advocates, juniors, observers.
- Instructions: dated client instructions, their source and status.
- Matter relationships: appeal of, connected, companion, same transaction, related.
- Matter scope: practice areas and a short statement of the engagement.
- Matter lifecycle events.

**Does not own.**
- Court, case type, case number, stage, hearings, orders. Those belong to Proceeding and Court File.
- Documents, evidence, facts, drafts, research. Those belong to their domains.
- Access decisions. Policy decides access from the assignment.

**Rules.**
- A matter has at least one client and one lead advocate.
- A matter can have zero proceedings. A new matter starts at intake, before any court case exists.
- A matter can have many proceedings in different courts.
- A matter's title is the advocate's label. It is not the court's cause title.
- Closing a matter is an advocate decision with a reason. It does not delete or hide records.
- A closed matter is read-only except for reopen, export and audit.
- A matter's client and parties are not deduplicated by name. A merge is an explicit, audited operation.

**Operations.**
`openMatter`, `updateMatter`, `addClient`, `assignAdvocate`, `removeAssignment`, `recordInstruction`, `linkMatter`, `unlinkMatter`, `closeMatter`, `reopenMatter`, `archiveMatter`, `getMatter`, `listMattersForActor`.

**Dependencies.** Advocate/Organisation ids, Policy port. No dependency on Proceeding. A query for a matter's proceedings is composed by the application service.

**Invariants to test.**
- A matter with two proceedings in different courts is valid.
- A matter with no proceeding is valid at intake.
- A client with two matters has one client id.
- Two clients with the same name are two clients unless an explicit merge is recorded.
- A closed matter refuses a new proceeding, document or evidence item until reopened.
- An advocate who is not assigned cannot read the matter, even if they belong to the organisation.

**Why this is better than the current model.** The current `matter` table has only a title, and `matter_profile` holds one court case. The new model makes the engagement the unit and the court case a child.

---

### 5.2 Proceeding

**Owns.**
- The legal proceeding: forum, case type, parties, relief, side, status and stage.
- Hearings and their directions.
- Orders and judgments as proceeding events, with a document version.
- Procedural relationships: appeal from, revision of, review of, execution of, companion.
- The roles of documents in the proceeding: plaint, written statement, impugned order, judgment, application, affidavit, annexure, evidence.
- The roles of evidence items in the court file (through Court File).
- The proceeding's procedural history.

**Does not own.**
- The matter's client, scope or assignment.
- The document's bytes or versions.
- The evidence item's authenticity or admissibility.
- The truth of a fact.
- The draft.
- The filing preparation set.

**Rules.**
- A proceeding belongs to exactly one matter.
- A proceeding has exactly one court and one case type. A change of court is a new proceeding (transfer) or a new court file (renumbering), not a silent edit.
- A proceeding can exist in `draft` before it is filed.
- A proceeding's stage is a `StageRecord` from a versioned stage list for its case type. It records the date, the source and the advocate who confirmed it. There is no default stage.
- A proceeding's internal status and the court's reported status are separate. The court's status is stored with its source and retrieval time.
- An appeal, revision, review or execution is a new proceeding linked to its parent. It does not mutate the parent.
- An interlocutory application is a child proceeding with the same court file as its parent. **This is an owner decision (D1).**
- A hearing belongs to a proceeding. A common cause-list listing can group hearings with a `listingGroupId`; the hearing records remain per proceeding.
- An order belongs to a proceeding and a court file. A common judgment can be linked to connected proceedings with an `OrderLink`.

**Operations.**
`createProceeding`, `updateProceeding`, `recordStage`, `addParty`, `removeParty`, `recordHearing`, `recordOrder`, `linkProceeding`, `unlinkProceeding`, `closeProceeding`, `getProceeding`, `listProceedings`, `proceedingHistory`.

**Dependencies.** Matter ids, Court directory and case types, Document ids for orders. No dependency on Evidence or Factual Record. The application composes a view that includes them.

**Invariants to test.**
- One matter, three proceedings: suit, appeal, SLP. Each has its own court, case type and stage.
- An appeal does not change the trial proceeding's status.
- A stage cannot be set without a source and a stage-list version.
- A proceeding cannot be filed without a court file with a diary number.
- A proceeding cannot be registered without a case number.
- A disposed proceeding requires an order.
- A proceeding cannot belong to two matters.

**Why this is better than the current model.** The current `matter_profile.proceeding` is a string and the case type is often copied into it. The new model makes the proceeding the unit of procedural law and gives it a stable id.

---

### 5.3 Court File

**Owns.**
- The registry identity: court, case type as registered, case number, diary number, CNR, filing date, registration date.
- The current bench and the court's status as reported, with source and time.
- The documents filed in that file, their roles, serial numbers and filing status.
- The exhibits and material objects marked in that file, their designations and dates.
- The orders and judgments attached to that file.
- The file's history: created, renumbered, transferred, restored, closed.

**Does not own.**
- The legal claim or the proceeding's internal status.
- The document's content or versions.
- The evidence item's authenticity or admissibility.
- The fact.
- The filing preparation set or the approval to file.

**Rules.**
- A court file has exactly one lead proceeding and one court. It may be shared by that proceeding's interlocutory applications. A proceeding has one current court file. Historical files remain and point to their successor.
- A new court file is created for a renumbering, transfer or restoration. The old file is marked `superseded`, not edited.
- Within a matter and court, a current case number is unique. Across matters, the same external case number is a separate record. **This is a confidentiality rule.**
- A `CourtFileDocument` is a role of a document version in that file. It is not a property of the document.
- A `CourtFileExhibit` is a role of an evidence item in that file. It is not a property of the evidence item.
- A court-file item names the proceeding within the file: the lead proceeding or an interlocutory application.
- A court-reported status is stored with `source`, `retrievedAt` and `verification`. It never silently overwrites the proceeding's internal status.
- A court file is never deleted. It is superseded or closed.

**Operations.**
`createCourtFile`, `renumberCourtFile`, `transferCourtFile`, `restoreCourtFile`, `addCourtFileDocument`, `removeCourtFileDocument`, `addCourtFileExhibit`, `recordCourtOrder`, `recordCourtStatus`, `closeCourtFile`, `getCourtFile`, `courtFileHistory`.

**Dependencies.** Proceeding, Court, Document ids, Evidence ids.

**Invariants to test.**
- A court file has one lead proceeding. An interlocutory application shares its lead proceeding's file.
- A proceeding has at most one current court file.
- A renumbered file keeps the old file and its documents.
- The same document version can be `impugned_order` in one file and `order` in another.
- The same evidence item can be Exhibit P-1 in one file and Annexure A-3 in another.
- An interlocutory application's document can sit in the shared file without being attributed to the main suit.
- A court status from an unverified source is marked unverified; it does not become the proceeding's status.

**Why this is better than the current model.** The current model has `filing_target` as a singleton and `evidence.exhibit_number` as one string. It cannot represent a renumbered case, a shared document with two roles, or an exhibit marked in two files.

---

### 5.4 Document

**Owns.**
- Document identity: a stable id, a matter id, a title and a kind.
- Versions: an immutable content state with a hash, a media type, a size and provenance.
- Representations: text, OCR, PDF/A, thumbnail, and their engine and version.
- Classification: proposed and confirmed kind, with a basis.
- Processing state: queued, running, ready, failed, with attempts and errors.
- Origin: where the bytes came from, with the original path or URL and the actor.

**Does not own.**
- Evidence status. A document is not evidence until an evidence item is created.
- Court-file roles. The court file owns the role.
- Facts. A document can contain a statement; the fact is a separate assertion.
- Drafts. A draft is a work product; a filed revision becomes a document version.
- The filing manifest.

**Rules.**
- A document belongs to one matter. Cross-matter sharing is forbidden.
- A version is immutable. A correction creates a new version and a `supersedes` link.
- The original version is preserved. A derived representation never replaces it.
- A document points to its current version. Older versions remain and can be cited.
- Processing state is per version, not per document.
- A duplicate import of the same bytes into the same matter returns the existing version and records a new origin. It does not create a new version.
- A hash proves byte integrity. It does not prove authenticity, execution or legal status. The UI must say "bytes match", not "authentic".
- A certified copy is a version with `provenance = certified_copy`, not a new document. **Proposed decision; see D4.**
- A court download is a version with `provenance = court_copy`. A later corrected download is a new version with a `supersedes` link.

**Operations.**
`registerDocument`, `addVersion`, `supersedeVersion`, `classifyDocument`, `confirmClassification`, `processVersion`, `rebuildRepresentation`, `getDocument`, `listDocuments`, `documentHistory`.

**Dependencies.** Matter ids, Blob port, OCR/conversion ports. No dependency on Proceeding, Evidence or Factual Record.

**Invariants to test.**
- The same bytes imported twice into one matter create one version and two origins.
- The same document corrected by the court creates a second version; the first remains.
- The OCR text is a representation; deleting it does not delete the version.
- A failed conversion is visible; the original is untouched.
- A document from matter A cannot be read from matter B.
- A hash mismatch is reported as a byte change, not as inauthenticity.

**Why this is better than the current model.** The current `source` is a file's bytes. The new model separates identity, version, representation and evidence.

---

### 5.5 Evidence

**Owns.**
- Evidence items: document, testimony, object, electronic record, admission.
- The link from an item to its source: a document version, a witness statement, an object register entry, or an admission.
- Authenticity: unknown, authentic, disputed, rejected.
- Admissibility: not assessed, admitted, inadmissible, objection pending.
- Inclusion: candidate, included, excluded.
- Chain of custody.
- Verification: hash match, source match, quote match.
- Evidence relations: same as, copy of, part of, derived from.
- Evidence decisions, with actor, time, reason and basis.

**Does not own.**
- Document bytes or versions.
- Court-file exhibit labels. The court file owns the designation.
- Fact truth. Evidence supports or contradicts a fact; it does not decide it.
- Legal propositions.
- The advocate's working fact.

**Rules.**
- Evidence is matter-scoped. It can be used in many proceedings and court files.
- Evidence must have a source or an explicit `no_source` reason. Oral testimony has a witness statement; an object has an object register entry.
- Authenticity, admissibility and inclusion are independent. A document can be authentic but inadmissible. An item can be admissible but excluded by the advocate for strategy.
- Each of these is a human decision. The agent can propose; it cannot decide.
- A hash match is not authenticity. It is a byte check.
- An exhibit designation belongs to the court file, not the evidence item.
- Evidence is never deleted. It is excluded or superseded, with history.
- Evidence can support or contradict many facts. The link is owned by the Factual Record.

**Operations.**
`registerEvidence`, `assessAuthenticity`, `assessAdmissibility`, `includeEvidence`, `excludeEvidence`, `recordChain`, `verifyEvidence`, `relateEvidence`, `getEvidence`, `listEvidence`, `evidenceHistory`.

**Dependencies.** Matter ids, Document ids, Witness/Party ids. No dependency on Factual Record.

**Invariants to test.**
- An authentic but inadmissible document is representable.
- An oral testimony with no document is representable.
- An exhibit designation in one court file does not change in another.
- An agent proposal cannot set authenticity to `authentic`.
- An excluded evidence item still exists and appears in history.
- A hash mismatch does not set authenticity to `rejected` automatically.

**Why this is better than the current model.** The current `evidence` row has one `authenticity`, one free-text `admissibility`, one `status` and a mandatory `source_id`. It cannot represent the legal distinctions.

---

### 5.6 Factual Record

This is the most important domain. The current model collapses origin, review and legal effect into `fact.type` and `fact.status`. The new model separates them.

**Owns.**
- `FactAssertion`: the proposition. It is matter-scoped.
- `FactSource`: why the assertion exists: a document anchor, an evidence item, a party position, a judicial finding, an advocate instruction or a model extraction.
- `PartyPosition`: a party's stance in a proceeding: asserted, admitted, denied or not in issue. It cites the pleading or order anchor.
- `JudicialFinding`: a court's finding in a proceeding. It cites the order document version and the paragraph anchor.
- `FactDecision`: the advocate's decision to accept as a working fact, dispute, reject or supersede. It records the actor, time, reason and basis.
- `FactRelation`: supports, contradicts, qualifies, supersedes, derived from.
- `FactProceedingLink`: the fact's relevance to a proceeding.
- Issue charts and element charts are **not** owned here. They belong to Drafting (case theory) and reference facts by id. This keeps the dependency one-way: Drafting depends on the Factual Record, not the reverse.

**Does not own.**
- Evidence authenticity or admissibility.
- Document content.
- Legal propositions. "Section 34 applies" is a proposition, not a fact.
- Legal issues and element charts. They belong to Drafting and reference facts by id.
- The draft.
- The court's order. The order is a document; the finding is a record about it.

**Rules.**
- A fact belongs to one matter. It can be relevant to many proceedings.
- A fact must have at least one source or an explicit "advocate's knowledge, no source" reason. An unsourced model extraction is not allowed.
- A model extraction creates a fact with `reviewState = extracted` and a `FactSource` of kind `model_extraction` with an anchor. It cannot create `accepted_working`.
- Only an advocate decision moves a fact to `accepted_working`, `disputed`, `rejected` or `superseded`.
- A judicial finding requires an order document version and a paragraph anchor. It is recorded, not "accepted" as the advocate's fact.
- A party admission requires a pleading or order anchor and a proceeding party id. It is a `PartyPosition`, not automatically an accepted fact. The advocate decides whether to treat it as an admitted fact.
- A contradiction is a `FactRelation` with both facts retained. It is never auto-resolved.
- A superseded fact remains. The new fact points to it.
- Fact text is not a legal conclusion. Legal propositions belong to Research and Drafting.
- Fact history is append-only. The current state is a projection from decisions.

**Operations.**
`proposeFact`, `recordFactSource`, `recordPartyPosition`, `recordJudicialFinding`, `reviewFact`, `supersedeFact`, `relateFacts`, `linkProceeding`, `getFact`, `listFacts`, `factHistory`.

**Dependencies.** Matter ids, Document anchors, Evidence ids, Proceeding ids. No dependency on Drafting or Research.

**Invariants to test.**
- A model extraction cannot be accepted without a human decision.
- A judicial finding cannot be rejected as if it were the advocate's fact. A later order can supersede it.
- A party's denial does not set the advocate's review state to `rejected`. It is a separate position.
- A contradiction keeps both facts and both sources.
- A superseded fact is still readable and its history is complete.
- A fact with no source is refused unless the advocate gives a reason.
- A fact from matter A is never returned in matter B.
- A fact can be relevant to two proceedings without duplication.

**Why this is better than the current model.** The current `fact` table has one `type` and one `status`, and `decideFact` overwrites the status. The new model makes the origin, the review and the legal effect separate, and it keeps every decision.

---

### 5.7 The four-layer fact model

The assignment asks to distinguish six things. This is the mapping.

| What the assignment asks for | Record in the new model | What it means |
|---|---|---|
| A statement extracted by a model | `FactAssertion` with `reviewState = extracted`, plus a `FactSource` of kind `model_extraction` and a document anchor | The model found words. It is not a fact yet. |
| A fact proposed by a person | `FactAssertion` with `reviewState = proposed`, plus a `FactSource` of kind `advocate` or `person` | A person asserts it. The advocate still decides. |
| A fact under review | `reviewState = under_review`, plus a `ReviewItem` | The advocate has opened it. |
| An accepted working fact | `reviewState = accepted_working`, plus a `FactDecision` | The advocate adopts it for the matter's working record. |
| A disputed fact | `reviewState = disputed`, plus a `FactDecision`; a `PartyPosition` of `denied` is separate | The advocate treats it as contested. The opponent's denial is a separate record. |
| A rejected fact | `reviewState = rejected`, plus a `FactDecision` | The advocate does not accept it. The record stays. |
| A superseded fact | `reviewState = superseded`, plus `supersedesFactId` | A later assertion replaces it. The old record stays. |
| A fact admitted by an opposing party | `PartyPosition` with `position = admitted`, citing the pleading or order anchor | It is the party's position, not automatically the advocate's working fact. |
| A judicial finding | `JudicialFinding`, citing the proceeding, court file, order version and paragraph anchor | The court found it. It is not the advocate's fact. |
| A fact established by an order or judgment | `JudicialFinding` citing the order and paragraph anchor; the view derives the legal effect from that record | The finding is recorded. Whether it binds another proceeding is a legal argument, not a field. |

**The rule that prevents the current failure.** A status is not a boolean. A fact has an origin, a review state and a legal effect. Each change is a `FactDecision` with an actor, a time and a reason. The current state is a projection, not the only record.

---

## 6. The other domains

### 6.1 Advocate and Organisation

**Owns.** Advocate identity, bar enrolment, organisation, membership, roles, practice areas, preferences.

**Key rules.**
- An advocate belongs to at least one organisation.
- A role is a capability set, not a legal authority. The policy engine decides.
- Practice areas are classifications. They do not create separate modules or kernels. A criminal matter and a civil matter share the same Matter, Proceeding, Document, Evidence and Factual Record domains.
- Preferences are proposed and approved. They never override a law or a court rule.
- Bar enrolment is sensitive. Store it encrypted, not in a plain profile row. The current code already uses `safeStorage` for the enrolment file; keep that.

**Does not own.** Matter access decisions, matter records, court data.

**Challenge to the assignment's grouping.** The assignment puts "matter assignments and access relationships" under Advocate and Organisation. I propose a split:
- Advocate and Organisation own identity, membership and roles.
- Matter owns the assignment of an advocate to that matter.
- Policy owns the access decision.

This avoids two problems: an advocate domain that knows about every matter, and a matter domain that knows about organisation roles. The assignment's grouping is a list of related concerns, not a ownership boundary.

### 6.2 Court

**Owns.** Court directory, benches, case types, court rules and practice directions, adapter registrations, court observations.

**Key rules.**
- Courts and case types are data. No individual High Court or District Court is hard-coded in the core.
- `SLP(C)` is a case type under the Supreme Court. It is not a matter, a court, a writ or a stage. The Supreme Court adapter or pack declares it.
- An adapter declares its capabilities, access method, authentication, limitations, verification and version.
- An adapter returns observations or prepared filings. It never changes a legal record. The application service decides whether to record an observation.
- A stale rule is shown as stale. A check that depends on it is "unconfirmed", never "passed".
- No CAPTCHA bypass, no stored court passwords, no unauthorised bulk scraping.

**Capability model.** A court adapter declares a set of capabilities, not a boolean "supported".

| Capability | What it returns | Human approval |
|---|---|---|
| `case_status` | A court observation: status text, bench, next date, source, time | No |
| `orders` | Document versions (PDF) and metadata | No |
| `cause_list` | Listings for a date and court | No |
| `filing_prepare` | Checklist, required parts, format checks, a draft manifest | No |
| `filing_submit` | A submission attempt and a receipt | **Yes, always** |

A court that supports only `case_status` is a first-class adapter. A missing capability is a visible limitation, not an error.

### 6.3 Research and Knowledge

**Owns.** Authorities, statutes, provisions, propositions, citation checks, research collections, research queries.

**Key rules.**
- A research result is a candidate, not an accepted proposition.
- A proposition must link to a supporting passage with an anchor.
- A citation that exists is not enough. The proposition must be supported.
- Public law is firm-level. Matter research is matter-level. No cross-matter facts.
- A research output cannot become evidence or a fact automatically.
- A judgment's finding is a fact about what the court decided; the legal effect of the judgment is a proposition. Keep them apart.

### 6.4 Drafting

**Owns.** Drafts, sections, revisions, citation references, draft checks, draft approvals, legal issues, issue elements, issue-fact links, issue-authority links.

**Key rules.**
- A draft references facts, evidence and authorities by id and anchor. It does not copy them as truth.
- An issue is the advocate's legal question. It links to facts, evidence and authorities by id. It is not a fact and does not change a fact's review state.
- A revision is immutable. A new revision supersedes.
- A draft cannot cite an unverified authority as verified.
- A draft cannot state an unaccepted fact as established. It can state it as an allegation, with the source.
- When a draft is filed, its approved revision becomes a Document version with `provenance = filed_copy`. The draft remains for history.
- A draft is not a court file and not a filing set.

### 6.5 Work Management and Workflows

**Owns.** Tasks, deadlines, review items, approval requests, workflow definitions, workflow runs, prompt templates.

**Key rules.**
- Work coordinates domains but owns no domain record.
- A workflow step invokes a capability, not a store.
- A run has a durable state and a resume or fail path.
- An approval is a human decision. It cannot be delegated to an agent.
- A task references any subject by id. It does not copy the subject.
- The two current "workflow" concepts get different names: `WorkflowDefinition` for orchestration, `PromptTemplate` for text instructions.

**Workflow run states.** `pending`, `running`, `waiting_approval`, `interrupted`, `done`, `failed`, `cancelled`.

**Recovery rule.** A run that was `running` when the process stopped becomes `interrupted` on the next start. Resume continues from the last completed step whose side effect is recorded. A step with no recorded side effect may run again only if it is idempotent. If it is not, the run fails with a visible reason and the advocate decides.

---

## 7. Shared kernel

The shared kernel is small. It is not a place for business rules.

### 7.1 What belongs

| Concept | Why it is shared |
|---|---|
| Branded ids (`MatterId`, `ProceedingId`, `CourtFileId`, `DocumentId`, `DocumentVersionId`, `EvidenceId`, `FactId`, `ActorId`, `OrganisationId`, `CapabilityId`) | Prevent mixing ids across domains |
| `ActorRef` (id, kind, display name) | Every decision and audit event needs an actor |
| `Scope` (organisation id, optional matter id) | Every query and command is scoped |
| `Clock` | Testable time |
| `Version` (optimistic concurrency) | Every mutable aggregate has a version |
| `ProvenanceRef` (kind, id, anchor, retrieved time, method) | Evidence, facts, research and court observations need one shape |
| `AuditRef` | Link a decision to its audit event |
| `Decision` (subject, decision, actor, time, reason, basis) | One shape for human decisions, with domain-specific allowed values |
| `AppError` (code, message, details, retryable) | One error contract for CLI, UI and agent |
| `Page<T>` / `Cursor` | Stable list contracts |
| `Hash` | A value object for SHA-256 |

### 7.2 What does not belong

- `Party`, `Court`, `CaseType`, `Stage`, `FactStatus`, `EvidenceStatus`, `FilingState`, `Permission`, `Role`.
- Repository base classes, generic `Entity<T>`, `AggregateRoot`, or a plugin framework.
- Any legal rule. "Only an advocate accepts a fact" belongs to the Factual Record, not the kernel.
- A god `Kernel` service that coordinates everything. The kernel is types and value objects, not behaviour.

### 7.3 The difference between the five layers

| Layer | What it does | Example | May import |
|---|---|---|---|
| **Domain** | Owns rules and state transitions | `FactAssertion.accept(decision)`; `Proceeding.recordStage(...)` | Kernel only |
| **Application** | Coordinates a use case, a transaction and authorisation | `AcceptFact` loads the fact, checks policy, calls the domain, appends audit | Domain, ports |
| **Shared technical contract** | Types and value objects used by all | `ProvenanceRef`, `AppError`, `Decision` | Nothing |
| **Infrastructure** | Implements a port | SQLite repository, blob store, OCR, Pi adapter | Ports, domain types |
| **Agent execution** | Runs a model, calls capabilities, streams events | Pi adapter, execution log, approval bridge | Application capabilities, execution port |

A domain never imports Electron, React, Pi, SQLite or the filesystem. An application service never imports Electron or React. An interface never reaches into a store.

---

## 8. Acceptance and decisions

The assignment requires "advocate acceptance" to be explicit, authorised and auditable. The design uses one shape and domain-specific commands.

```
Decision {
  id
  subject: { domain, id, version }
  decision: <domain-specific value>
  actorId
  at
  reason?
  basis: ProvenanceRef[]
}
```

| Domain | Decision values | Who may decide | What it changes |
|---|---|---|---|
| Factual Record | `accept_working`, `dispute`, `reject`, `supersede` | Advocate assigned to the matter | Review state projection |
| Evidence | `authentic`, `disputed`, `rejected`, `admissible`, `inadmissible`, `include`, `exclude` | Advocate assigned to the matter | Evidence status |
| Document | `confirm_classification`, `confirm_version` | Advocate or a delegated clerk, per policy | Classification and current version |
| Proceeding | `confirm_stage`, `confirm_order`, `close` | Advocate assigned to the matter | Stage, order link, status |
| Court File | `confirm_status`, `confirm_document_role`, `confirm_exhibit` | Advocate assigned to the matter | Court-file record |
| Drafting | `approve_revision` | Advocate assigned to the matter | Approved revision |
| Filing | `approve_filing`, `confirm_payload` | Advocate, with the role that permits filing | Filing approval |
| Work | `approve_step`, `approve_capability` | The approver named by policy | Workflow or capability gate |
| Research | `accept_proposition`, `reject_proposition` | Advocate assigned to the matter | Proposition status |

**Rules.**
- A decision names the subject and its version. A stale version is refused.
- A decision records the actor id, not the role label.
- A decision appends an audit event in the same transaction.
- A decision never deletes the previous state. The previous decision remains.
- A model cannot create a decision. It can create a proposal.
- A human-only capability is not exposed to the agent at all. The agent can prepare a request; the advocate decides.

---

## 9. Capability and policy model

This is the domain-level contract. Stage 3 will settle the runtime.

### 9.1 Capability fields

| Field | Purpose |
|---|---|
| `id` | Stable name, such as `matter.open`, `fact.review`, `filing.submit` |
| `domain` | The owning domain |
| `description` | What it does, in one sentence |
| `inputSchema`, `outputSchema` | Typed contract |
| `access` | `read`, `propose`, `execute`, `human_only` |
| `scope` | `matter`, `proceeding`, `firm`, `global` |
| `risk` | `low`, `medium`, `high`, `reserved` |
| `approval` | `none`, `once`, `always`, `two_step` |
| `sideEffects` | What it writes or sends |
| `interfaces` | `cli`, `desktop`, `agent`, `workflow` |

### 9.2 Policy rules

- The policy engine evaluates `actor + organisation + matter assignment + capability + scope`.
- Missing policy, an unreadable policy file or an unknown capability is **deny**. This is the owner requirement and it reverses the current allow-by-default behaviour.
- A human-only capability is never in the agent's tool list. The agent can call a `propose` capability that creates an approval request.
- Matter isolation is enforced by the application service before the domain call. The agent prompt is not a security control.
- A capability that writes a legal record is `execute` or `human_only`, never `read`.
- A capability that calls an external court or LLM has an explicit side-effect record and a timeout.

### 9.3 One registry, many interfaces

The CLI command tree, the IPC handlers, the agent tools and the workflow steps all reference `CapabilityId`. A test asserts three things:
1. Every handler has a capability record.
2. Every capability record has at least one handler.
3. Every interface exposes only the capabilities declared for it.

This is how the rewrite avoids the ten tool lists in the current code.

---

## 10. State transitions

These are the minimum states. A court-reported status is separate and can be richer.

### 10.1 Matter

```
intake ──► active ──► on_hold ──► active
  │          │
  │          ├──► closed ──► archived
  │          │       │
  │          │       └──► active   (reopen)
  │          └──► archived
  └──► archived                    (a matter that never started)
```

Only an advocate transitions a matter. Closing requires a reason. Archive does not delete.

### 10.2 Proceeding

```
draft ──► filed ──► registered ──► pending ──► disposed ──► closed
  │          │            │
  └──────────┴────────────┴──► closed   (a draft that is abandoned, with a reason)
```

- `draft` may have no court file.
- `filed` requires a court file with a diary number.
- `registered` requires a case number.
- `disposed` requires an order.
- `closed` is the advocate's record closure after the appeal period or decision.
- A court-reported status is stored beside this state, not instead of it.

### 10.3 Court File

```
active ──► superseded   (renumbered, transferred, restored)
   │
   └──► closed          (case disposed and record complete)
```

The old file remains. `supersedes` points forward.

### 10.4 Document and processing

```
registered ──► processing ──► ready
                    │
                    └──► failed (visible; retry allowed)
```

A version is `current` or `superseded`. A representation is `ready` or `failed`.

### 10.5 Evidence

The three dimensions move independently.

```
authenticity:   unknown ──► authentic | disputed | rejected
admissibility:  not_assessed ──► admitted | inadmissible | objection_pending
inclusion:      candidate ──► included | excluded
```

Each transition is a human decision.

### 10.6 Fact

```
extracted | proposed ──► under_review ──► accepted_working
                                   ├──► disputed
                                   ├──► rejected
                                   └──► superseded
```

A `JudicialFinding` and a `PartyPosition` are separate records. They do not move the review state by themselves.

### 10.7 Filing

```
draft ──► prepared ──► approved ──► submitted_pending_ack ──► acknowledged
                                   └──► rejected ──► prepared   (with new approval)
```

`prepared` and `approved` are internal. `submitted_pending_ack` is external. A court file is updated only from the acknowledgment.

### 10.8 Workflow

```
pending ──► running ──► waiting_approval ──► running ──► done
               │                                  │
               ├──► interrupted ──► running       ├──► failed
               │        └──► failed               └──► cancelled
               └──► cancelled
```

An interrupted run has a resume token. A run that cannot resume fails with a reason.

---

## 11. Illustrative contracts

These are boundary sketches, not final code. They show the essential fields and the ownership. They are deliberately short.

### 11.1 Shared kernel

```ts
type Brand<T, B> = T & { readonly __brand: B };
type MatterId = Brand<string, "MatterId">;
type ProceedingId = Brand<string, "ProceedingId">;
type CourtFileId = Brand<string, "CourtFileId">;
type DocumentId = Brand<string, "DocumentId">;
type DocumentVersionId = Brand<string, "DocumentVersionId">;
type EvidenceId = Brand<string, "EvidenceId">;
type FactId = Brand<string, "FactId">;
type ActorId = Brand<string, "ActorId">;
type OrganisationId = Brand<string, "OrganisationId">;
type CapabilityId = Brand<string, "CapabilityId">;

type IsoDate = string;        // YYYY-MM-DD
type IsoDateTime = string;    // ISO 8601

// Court, case type, practice area and client ids are branded the same way.
// They are shown as strings in these sketches for brevity.

interface ActorRef {
  id: ActorId;
  kind: "advocate" | "agent" | "system";
  displayName?: string;
}

interface ProvenanceRef {
  kind: "document_version" | "evidence" | "court_observation" | "advocate" | "agent" | "system";
  id: string;
  anchor?: string;            // e.g. "sha256:page:line"
  retrievedAt?: IsoDateTime;
  method?: string;
}

interface Decision {
  id: string;
  subject: { domain: string; id: string; version: number };
  decision: string;           // domain-specific
  actor: ActorRef;
  at: IsoDateTime;
  reason?: string;
  basis: ProvenanceRef[];
}

interface AppError {
  code: string;               // stable, e.g. "FACT_NOT_ACCEPTED"
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}
```

### 11.2 Matter

```ts
interface Matter {
  id: MatterId;
  organisationId: OrganisationId;
  clientIds: string[];        // at least one
  title: string;              // the advocate's label, not the cause title
  status: "intake" | "active" | "on_hold" | "closed" | "archived";
  openedOn: IsoDate;
  closedOn?: IsoDate;
  practiceAreaIds: string[];
  leadAdvocateId: ActorId;
  version: number;
}

interface MatterAssignment {
  matterId: MatterId;
  advocateId: ActorId;
  role: "lead" | "assigned" | "junior" | "observer" | "aoR";
  assignedOn: IsoDate;
  assignedBy: ActorId;
}
```

**Invariants.** At least one client and one lead advocate. No court or case number. A closed matter is read-only until reopened.

### 11.3 Proceeding

```ts
interface Proceeding {
  id: ProceedingId;
  matterId: MatterId;
  courtId: string;            // directory id, e.g. "in.hc.delhi"
  caseTypeId: string;         // court taxonomy, e.g. "W.P.(C)"
  title: string;
  side: "petitioner" | "respondent" | "appellant" | "accused" | "complainant" | "other";
  status: "draft" | "filed" | "registered" | "pending" | "disposed" | "closed";
  courtFileId?: CourtFileId;  // the current file; absent in draft
  stage?: StageRecord;
  parent?: {
    proceedingId: ProceedingId;
    relation: "appeal_from" | "revision_of" | "review_of" | "execution_of" | "companion" | "interlocutory_in";
  };
  version: number;
}

interface StageRecord {
  key: string;
  label: string;
  recordedOn: IsoDate;
  source: ProvenanceRef;      // the order, notice or court page
  confirmedBy: ActorId;
  stageListVersion: string;
}
```

**Invariants.** One matter, one court, one case type. A stage is recorded, not inferred. An appeal is a new proceeding.

### 11.4 Court File

```ts
interface CourtFile {
  id: CourtFileId;
  leadProceedingId: ProceedingId;
  courtId: string;
  caseTypeAsRegistered: string;
  caseNumber?: string;
  diaryNumber?: string;
  cnr?: string;
  filingOn?: IsoDate;
  registeredOn?: IsoDate;
  bench?: string;
  statusAsReported?: {
    text: string;
    source: ProvenanceRef;
    retrievedAt: IsoDateTime;
    verification: "official" | "advocate_attested" | "unverified";
  };
  isCurrent: boolean;
  supersedes?: CourtFileId;
  version: number;
}

interface CourtFileDocument {
  courtFileId: CourtFileId;
  proceedingId?: ProceedingId;   // the lead proceeding or an interlocutory application
  documentVersionId: DocumentVersionId;
  role: "plaint" | "written_statement" | "impugned_order" | "judgment" | "application" | "affidavit" | "annexure" | "evidence" | "other";
  serialNumber?: string;
  label?: string;
  filedOn?: IsoDate;
  status: "filed" | "accepted" | "rejected" | "returned";
}

interface CourtFileExhibit {
  courtFileId: CourtFileId;
  proceedingId?: ProceedingId;   // the lead proceeding or an interlocutory application
  evidenceId: EvidenceId;
  designation: "exhibit" | "annexure" | "material_object";
  label: string;              // "P-1", "A-3"
  markedOn?: IsoDate;
}
```

**Invariants.** A court file has one lead proceeding; an interlocutory application shares the lead's file. One current file per proceeding. A document version can have different roles in different files. An exhibit label belongs to the file.

### 11.5 Document

```ts
interface Document {
  id: DocumentId;
  matterId: MatterId;
  title: string;
  kind: "pleading" | "order" | "judgment" | "affidavit" | "notice" | "correspondence" | "evidence" | "other";
  status: "active" | "archived";
  currentVersionId: DocumentVersionId;
  version: number;
}

interface DocumentVersion {
  id: DocumentVersionId;
  documentId: DocumentId;
  sha256: string;
  mediaType: string;
  size: number;
  provenance: {
    kind: "original" | "client_copy" | "court_copy" | "certified_copy" | "generated" | "filed_copy";
    ref?: string;             // path, URL or court source
    receivedAt: IsoDateTime;
    receivedBy: ActorId;
  };
  supersedesVersionId?: DocumentVersionId;
}

interface Representation {
  id: string;
  versionId: DocumentVersionId;
  kind: "text" | "ocr" | "pdfa" | "thumbnail";
  engine: string;
  engineVersion: string;
  sha256: string;
  status: "ready" | "failed";
}
```

**Invariants.** A version is immutable. The original is preserved. A duplicate import records an origin, not a new version. A hash is not authenticity.

### 11.6 Evidence

```ts
interface EvidenceItem {
  id: EvidenceId;
  matterId: MatterId;
  kind: "document" | "testimony" | "object" | "electronic" | "admission";
  title: string;
  source: {
    documentVersionId?: DocumentVersionId;
    witnessId?: string;
    objectRegisterId?: string;
    noSourceReason?: string;
  };
  authenticity: "unknown" | "authentic" | "disputed" | "rejected";
  admissibility: "not_assessed" | "admitted" | "inadmissible" | "objection_pending";
  inclusion: "candidate" | "included" | "excluded";
  version: number;
}
```

**Invariants.** The three statuses are independent. A decision is human-only. An exhibit label is not on this record.

### 11.7 Factual Record

```ts
interface FactAssertion {
  id: FactId;
  matterId: MatterId;
  text: string;
  kind: "occurrence" | "state" | "identity" | "date" | "amount" | "communication" | "document_content";
  reviewState: "extracted" | "proposed" | "under_review" | "accepted_working" | "disputed" | "rejected" | "superseded";
  supersedes?: FactId;
  version: number;
}

// `reviewState` is a projection of the FactDecision records, not the source of truth.
// `FactSource` is the only record of why the assertion exists.
// The view derives any legal effect from PartyPosition and JudicialFinding.

interface FactSource {
  factId: FactId;
  kind: "document_anchor" | "evidence" | "party_pleading" | "court_order" | "advocate" | "model_extraction";
  ref: ProvenanceRef;
}

interface PartyPosition {
  id: string;
  proceedingId: ProceedingId;
  factId: FactId;
  proceedingPartyId: string;   // the party role in that proceeding, not a global person
  position: "asserted" | "admitted" | "denied" | "not_in_issue";
  source: ProvenanceRef;      // the pleading or order anchor
  recordedAt: IsoDateTime;
}

interface JudicialFinding {
  id: string;
  proceedingId: ProceedingId;
  courtFileId: CourtFileId;
  factId: FactId;
  orderDocumentVersionId: DocumentVersionId;
  paragraphAnchor: string;
  findingText: string;
  recordedAt: IsoDateTime;
}

interface FactDecision {
  id: string;
  factId: FactId;
  decision: "accept_working" | "dispute" | "reject" | "supersede";
  supersededBy?: FactId;      // present when decision is "supersede"
  actor: ActorRef;
  at: IsoDateTime;
  reason: string;
  basis: ProvenanceRef[];
}
```

**Invariants.** A model extraction cannot be accepted without a `FactDecision`. A judicial finding cites an order and an anchor. A party position is not the advocate's review state. A contradiction is a `FactRelation`, not a deleted fact.

### 11.8 Court adapter

```ts
interface CourtAdapter {
  id: string;
  version: string;
  courts: string[];
  capabilities: CourtCapability[];
  access: Array<"official_feed" | "public_page" | "advocate_session" | "manual_upload">;
  auth: "none" | "advocate_session" | "otp" | "dsc";
  limitations: string[];
  verification: "official" | "advocate_attested" | "unverified";
}

interface CourtCapability {
  key: "case_status" | "orders" | "cause_list" | "filing_prepare" | "filing_submit";
  operations: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiresHuman: boolean;
  returns: "observation" | "document" | "filing_receipt";
}
```

**Invariants.** An adapter never writes a legal record. `filing_submit` always requires human approval. A missing capability is a visible limitation.

### 11.9 Capability

```ts
interface Capability {
  id: CapabilityId;
  domain: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  access: "read" | "propose" | "execute" | "human_only";
  scope: "matter" | "proceeding" | "firm" | "global";
  risk: "low" | "medium" | "high" | "reserved";
  approval: "none" | "once" | "always" | "two_step";
  sideEffects: string[];
  interfaces: Array<"cli" | "desktop" | "agent" | "workflow">;
}
```

**Invariant.** A handler without a capability, or a capability without a handler, fails the build.

### 11.10 Agent execution

```ts
interface AgentExecutionPort {
  start(request: ExecutionRequest): Promise<ExecutionHandle>;
  resume(executionId: string): Promise<ExecutionHandle>;
  cancel(executionId: string, reason: string): Promise<void>;
  decide(executionId: string, approvalId: string, decision: Decision): Promise<void>;
  events(executionId: string): AsyncIterable<ExecutionEvent>;
  snapshot(executionId: string): Promise<ExecutionSnapshot>;
}

interface ExecutionRequest {
  matterId?: MatterId;
  actor: ActorRef;
  capabilityIds: CapabilityId[];
  prompt: string;
  budget?: { tokens?: number; cost?: number };
  approvalPolicy: "ask_on_write" | "ask_always" | "read_only";
}
```

**Invariants.** The runtime owns execution state. The domains own legal state. The runtime calls capabilities; it does not write tables. Chat is an execution log.

### 11.11 Workflow

```ts
interface WorkflowRun {
  id: string;
  definitionId: string;
  definitionVersion: string;
  matterId: MatterId;
  state: "pending" | "running" | "waiting_approval" | "interrupted" | "done" | "failed" | "cancelled";
  currentStepId?: string;
  steps: Array<{
    id: string;
    capabilityId: CapabilityId;
    state: "pending" | "running" | "waiting_approval" | "done" | "failed" | "skipped";
    idempotencyKey: string;
    outputRef?: string;
    error?: AppError;
  }>;
  startedAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

**Invariants.** A run resumes or fails visibly. A step invokes a capability. A workflow never writes a domain table.

---

## 12. Scenario validation

The design must explain these scenarios without hand-waving. This is the test the assignment sets in Step 7.

| # | Scenario | How the design handles it | What it proves |
|---|---|---|---|
| 1 | One matter with several proceedings | Matter M1 has P1 (suit, District Court), P2 (appeal, High Court, `appeal_from` P1), P3 (SLP, Supreme Court, `appeal_from` P2). Each has its own court file and stage. | Matter is not the court case |
| 2 | One proceeding with several documents | P1 has CF1 with plaint, written statement, issues, affidavit, exhibits and order. Each is a Document version with a `CourtFileDocument` role. | Document identity and court-file roles are separate |
| 3 | A shared document used in several proceedings | The trial judgment is `order` in P1 and `impugned_order` in P2. One Document, two roles, two court-file links. | No copy, no conflicting versions |
| 4 | Conflicting facts from different sources | F1 (receipt: payment on 1 March) and F2 (written statement: no payment) are two assertions. A `FactRelation` of `contradicts` links them. Both stay visible. The advocate decides. | Contradictions are first-class and never auto-resolved |
| 5 | A lawyer accepts or rejects a proposed fact | The agent extracts F3 (`extracted`). The advocate calls `reviewFact(accept_working)`. A `FactDecision` records actor, time, reason and basis. The projection changes. The old state remains in the decision log. | Acceptance is explicit and auditable |
| 6 | Several advocates on one matter | A1 is lead, A2 is junior, A3 is AoR. Matter assignments record each. Policy allows A2 to draft, A3 to approve filing, A1 to do both. Every decision records the actor id. | Multi-advocate is representable without a server |
| 7 | An advocate across practice areas | A1 has civil, criminal and constitutional practice areas. M1 is civil, M2 is criminal, M3 is writ. The domains are the same; case types and stage lists differ. | Practice areas are classifications, not kernels |
| 8 | Different court adapters with different capabilities | Adapter A has status and orders. Adapter B has status, orders and filing preparation. Adapter C has filing submission with DSC. The proceeding asks for capabilities, not court names. | No hard-coded courts; capability differences are visible |
| 9 | An agent works on one matter while another is open | The execution request carries M1. Capabilities are scoped to M1. The browser tab and portal session are bound to M1. A tab from M2 is not listed. A download goes to M1. | Matter isolation is enforced outside the prompt |
| 10 | A failed workflow must resume | Run W1 is at step 3. The process stops. On restart it is `interrupted`. Resume checks the recorded side effects and continues at step 3 or 4. If a step is not idempotent, the run fails visibly. | Durable state and recovery |
| 11 | A court document is retrieved and later found incorrect | Order D1 v1 is downloaded. Evidence E1 cites it. The court corrects the order; D1 v2 is downloaded with `supersedes`. E1 still points to v1. The court file shows the cited version was superseded and opens a review item. | Versions are immutable; no silent replacement |
| 12 | A filing is prepared but not approved or submitted | FilingSet FS1 is `prepared`. No `FilingApproval`. No `FilingSubmission`. The court file has no diary number. The UI says "prepared, not approved". The agent cannot submit. | Preparation and submission are separate; human authority is explicit |

**Result.** The design explains all twelve. The weak points are the owner decisions D1 to D3, not the model.

---

## 13. Alternatives considered and rejected

| Alternative | Why it is attractive | Why it is rejected |
|---|---|---|
| **Merge Matter and Proceeding** | Fewer entities; matches the current code | One engagement can have a suit, an appeal and an SLP. Merging recreates F-01 and makes a second court case impossible without a new matter |
| **Merge Proceeding and Court File** | One case entity; simpler | A case can be renumbered, transferred or restored. The court's registry identity changes independently of the legal claim. Merging loses the history |
| **Make Court File the top-level case** | Matches the court's view | An appeal is a new proceeding with a new file. The matter would become a bag of files, and the legal relationship between proceedings would be lost |
| **Put facts in Proceeding** | Facts are used in a case | The same fact can matter in the suit, the appeal and the SLP. Duplicating it creates conflicting copies. Facts are matter-scoped with proceeding relevance |
| **Merge Evidence and Factual Record** | One "record" domain; fewer tables | Authenticity and admissibility are independent of truth. An inadmissible document can be authentic. An admission can establish a fact with no document. Merging forces one status and loses both distinctions |
| **One global SQLite database** | Simple transactions; easy cross-matter queries | Matter export, confidentiality and corruption isolation are worse. A single corrupt file loses the firm. A hybrid keeps the option open if measurement shows per-matter DBs are too slow |
| **One database per domain** | Pure boundaries | Distributed transactions and operational complexity for a desktop app. A modular monolith with table ownership is enough |
| **Full event sourcing** | Perfect history | Every query needs a projection; the team is small; legal records need current-state reads. The design uses append-only decision records plus projections, not full event sourcing |
| **Generic plugin platform** | Extensibility | No concrete use case yet. A capability registry and a court-adapter contract are enough. A plugin platform adds a second architecture to maintain |
| **Let the LLM own the factual record** | Less review work | Human authority cannot be delegated. The assignment forbids it. The model proposes; the advocate decides |
| **Microservices** | Independent deployment | Forbidden by the constraints, and unnecessary for a local desktop app |

---

## 14. Persistence and transaction ownership

This is a **proposed decision** for Stage 3 to confirm. It follows from the domain ownership, but the runtime can change it.

### 14.1 Proposed layout

| Store | Contents | Why |
|---|---|---|
| **Firm database** | Advocate, organisation, membership, roles, practice areas, preferences, court directory, case types, rules, research/knowledge, capability registry, cross-matter index | Shared across matters; small; changes slowly |
| **Per-matter database** | Matter, client link, assignment, proceeding, court file, document metadata, evidence, factual record, drafting, work, audit events for the matter | Confidential; exportable; a corrupt matter does not take down the firm |
| **Per-matter blob store** | Original bytes at `blobs/<sha256>` | Content-addressed; portable; integrity-checkable |
| **Derived indexes** | FTS, vectors, cross-matter index | Rebuildable; own nothing |
| **Execution store** | Agent runs, messages, tool calls, checkpoints | Execution log, not legal record |

### 14.2 Write ownership

- Each table has one owning domain. A table ownership manifest lists it.
- A domain repository may write only its own tables.
- An application service may coordinate a transaction across domains in one database.
- A cross-database operation (firm + matter) is avoided. If it is needed, the matter database is the source of truth and the firm side is an idempotent projection with an outbox.
- The audit event is written in the same transaction as the decision it records.

### 14.3 Why not one database

The current per-matter database is a strength for portability and confidentiality. The problem is not the file boundary. The problem is that the file contains 83 tables with no internal ownership. The rewrite keeps the file boundary and fixes the internal boundary.

### 14.4 Why not one database per domain

A desktop app with eight SQLite files and cross-domain transactions is harder to back up, migrate and recover. One file per scope, with table ownership, is the smaller coherent design.

---

## 15. Dependency rules and architecture tests

### 15.1 Module graph

```
kernel
  ▲
  ├── advocate-organisation
  ├── matter
  ├── court
  ├── document
  ├── proceeding ──► matter (ids), court (ids), document (ids), evidence (ids)
  ├── evidence ──► matter (ids), document (ids)
  ├── factual-record ──► matter, document, evidence, proceeding (ids)
  ├── research ──► court, document (ids)
  ├── drafting ──► matter, factual-record, evidence, research (ids)
  ├── work ──► all domains by id
  └── audit-policy ──► kernel
```

The arrows are id references and query ports, not table access. No domain imports another domain's repository.

### 15.2 Layer rules

| Rule | Test |
|---|---|
| Domain imports only the kernel and its own module | Import graph test |
| Domain imports no Electron, React, Pi, SQLite or `node:fs` | Import graph test |
| Application imports domain and ports, not Electron or React | Import graph test |
| Interfaces import application, not infrastructure | Import graph test |
| A table is written by one domain | Table ownership test |
| A capability has a handler and a handler has a capability | Registry parity test |
| An agent tool is a capability with `access = propose` or `execute` | Registry test |
| A human-only capability is absent from the agent tool list | Registry test |
| No circular module dependencies | Graph test |
| A court adapter cannot import a legal domain's repository | Import graph test |

### 15.3 Tests to write before implementation

**Domain tests.**
- Matter with two proceedings; matter with no proceeding; client with two matters.
- Proceeding stage requires a source; appeal does not mutate the parent.
- Court file renumbering keeps history; one current file.
- Document versions are immutable; duplicate import adds an origin.
- Evidence authenticity, admissibility and inclusion are independent.
- Fact model extraction cannot be accepted without a decision; judicial finding requires an order anchor; party denial does not change the advocate's review state.
- Contradiction keeps both facts; supersession keeps history.

**Application tests.**
- The same operation through CLI, IPC and agent produces the same result.
- A stale version is refused.
- A cross-matter id is refused before the domain call.
- A policy error denies.
- An audit event is written with the decision.

**Adapter contract tests.**
- A court adapter declares its capabilities and limitations.
- A missing capability is a visible limitation.
- An observation carries source, time and verification.
- A `filing_submit` capability requires human approval.
- A timeout or failure is normalized into `AppError`.

**Security tests.**
- Cross-matter read and write are refused.
- An agent cannot accept a fact, approve a filing or submit a filing.
- A corrupt policy denies.
- A browser tab from matter A is not listed in matter B.
- A portal download goes to the tab's matter.

**Integrity and recovery tests.**
- Original bytes survive a failed conversion.
- A duplicate import does not create a second version.
- An interrupted import is marked failed, not hidden.
- An OCR failure is visible and retryable.
- An index rebuild gives the same result.
- A workflow resumes or fails visibly.
- The audit chain verifies.

**Architecture tests.**
- The import graph rules above.
- Table ownership.
- Capability parity.
- No circular dependencies.
- No domain imports the agent framework.
- No UI imports a store.

---

## 16. How this design meets the owner requirements

| Owner requirement | Design element |
|---|---|
| General litigation, not an SLP application | Court and Case Type are data; Proceeding is the legal unit; SLP is one case type |
| One matter with several proceedings | Matter 1 : * Proceeding |
| Different courts and stages | Proceeding has a court, a case type and a versioned stage record |
| Generalised court adapters | CourtAdapter with declared capabilities, access, limitations and verification |
| No individual High Court in the core | Court directory and case types are data |
| Local-first | One process, local SQLite, local blobs, no servers |
| One canonical owner for each truth | Ownership map and table ownership manifest |
| No giant kernel | Small shared kernel of ids and value objects |
| Human authority | Decision records, human-only capabilities |
| Original documents preserved | Immutable document versions and content-addressed blobs |
| Derived data reproducible | Representations and extraction runs name their inputs |
| Agent framework replaceable | `AgentExecutionPort` |
| Workflows coordinate, not own | Workflow steps invoke capabilities |
| Permissions enforced by the application | Policy checks in application services |
| Every important action auditable | Decision + audit event in one transaction |
| Fail closed | Missing or invalid policy denies |
| CLI, UI and agent use the same services | One capability registry, one application operation |
| No duplicate business logic | Interfaces are thin adapters |
| No premature plugin platform | A capability registry, not a plugin runtime |

---

## 17. Owner decisions required before Stage 3

These three decisions change the model. The rest can be settled in Stage 3 or Stage 4.

### D1 — Is an interlocutory application a Proceeding or a Court File item?

**Recommended:** a child Proceeding with `parentProceedingId` and the same `courtFileId` as its parent.

**Why.** An IA has its own relief, its own hearings, its own order and sometimes its own limitation. It is a legal proceeding, not a document in the file. Modelling it as a Court File item would force its orders and hearings into the main proceeding and lose the distinction.

**Consequence if yes.** A Court File can contain more than one Proceeding (the main proceeding and its IAs). The model supports this. The UI shows the main proceeding with its applications.

**Consequence if no.** An IA becomes a `CourtFileItem` with a lighter record. It cannot carry a separate order, stage or hearing cleanly. A later change would be a migration.

### D2 — Is multi-advocate a v1 requirement?

**Recommended:** model identity, organisation, membership, role and matter assignment in v1. Implement one active advocate per installation. Do not build real-time collaboration or sync.

**Why.** The assignment requires the model to represent several advocates on one matter. It does not require a server. A local-first app can support multiple profiles on one machine or a shared folder, but real-time collaboration is a different product. The schema should not need a rewrite when collaboration arrives.

**Consequence if yes.** The schema has organisation, membership, roles and assignments. The UI can start with one advocate and a "switch advocate" action. Access is enforced per actor.

**Consequence if no.** The schema can stay single-advocate, but the assignment's scenario "several advocates working on one matter" cannot be demonstrated. A later migration is likely.

### D3 — May the agent submit a filing in v1?

**Recommended:** no. v1 prepares the filing set and the manifest. The advocate submits it in the court portal. Agent submission is a later capability, enabled per court adapter, with two human approvals and a receipt.

**Why.** Filing is a reserved legal act. The current code has two confirmations, but the selector bypass in Stage 1 shows that the gate is not yet strong enough. The safer v1 is preparation only. This also matches `docs/product.md` hard rule 7.

**Consequence if yes.** The Court Adapter contract includes `filing_submit`, but the capability is `human_only` in v1. The user interface shows "prepared, not submitted". The agent cannot call it.

**Consequence if no.** The adapter may submit after two approvals. The design must add a declared submit control, a receipt, a result reconciliation and a per-court enable switch. The risk is higher.

### D4 — Is a certified copy a new Document or a new Document Version?

**Recommended:** a new Document Version with `provenance = certified_copy`. The Document identity stays the same.

**Why.** A certified copy is the same instrument with a different provenance and evidentiary weight. Modelling it as a new Document would split the citation history and make "the judgment" ambiguous. A version keeps the identity and lets Evidence point to the certified copy.

**Consequence.** Evidence cites the version, so the certified copy can be the source of authenticity. The Document history shows both the ordinary copy and the certified copy.

**Consequence if the owner prefers a new Document.** The model needs a `same_instrument_as` relation and a rule for which document is canonical. More complexity, no clear gain.

---

## 18. What this design deliberately does not settle

These are Stage 3 or Stage 4 questions. They do not change the ownership map.

1. **The agent runtime choice.** Pi, DeepAgents, LangGraph or a custom runtime. Stage 3 compares them against the execution port.
2. **The IPC shape.** One command bus, typed channels per module, or a local HTTP API. Stage 3 decides.
3. **The CLI command tree.** Stage 3/4.
4. **The UI framework and shell.** React is the current base. Stage 3 evaluates whether to keep it.
5. **The search and embedding stack.** FTS5, vectors, local models. Stage 3.
6. **The exact SQLite schema and migration plan.** Stage 4.
7. **The court adapter package format.** Data-only JSON, code modules, or both. Stage 3.
8. **The backup, export and retention policy.** Stage 3/4.
9. **The migration from the current matter databases.** Stage 4.
10. **The test framework and CI.** Stage 4.

---

## 19. Final position for Stage 2

The design is coherent if the owner accepts four propositions:

1. **Matter and court case are different.** A matter is an engagement. A proceeding is a legal case. A court file is the registry's record.
2. **Document, evidence and fact are different.** A document has versions. Evidence is a legal use of an item. A fact is an assertion with an origin, a review and a legal effect.
3. **The court file owns roles, not items.** The same document or evidence item can have different roles in different files.
4. **Human decisions are records, not status fields.** A model output is a proposal. An advocate decision is an event with an actor, a time, a reason and a basis.

If these four hold, the rest of the design follows. If one is rejected, the model must change before Stage 3.

The next stage tests the design against the runtime and the interfaces: application services, CLI, agent runtime, chat and UI. The domain design is the input, not the answer.
