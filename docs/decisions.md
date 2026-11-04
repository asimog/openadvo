# Settled design decisions

Status: decision record, phase 2. This file settles the design questions RQ-01 to RQ-88 and the phase 2 decisions PH-01 onward. Where any other document disagrees with this file, this file governs, and the other document is a defect to fix.

Document order, highest first:

| Document | Role |
|---|---|
| decisions.md (this file) | What is settled, and the open questions. |
| [specs/](specs/README.md) | One implementation contract per component group, with its tests and their status. |
| [architecture.md](architecture.md) | The system shape: principles, processes, storage, the window, the build order. |
| [component-map.md](component-map.md) | The parts list, by component id. |
| [advocate-workflow.md](advocate-workflow.md) | The end-to-end workflow the product serves, in the advocate's terms. |
| [ULOSarchitecture.md](ULOSarchitecture.md) | The standard. It governs the standard and nothing else. |
| [archive/](archive/) | The question history and the phase 1 build reports. They govern nothing and are not read during implementation. |

## 1. How to read this file

Every decision has a status.

| Status | Meaning |
|---|---|
| **User** | Settled by the user's comments of 4 November 2026. |
| **Kept** | The user did not comment. The report's recommendation is adopted as written, after a check that it does not conflict with a User decision. |
| **Map** | Adopted from the component map's "Calls adopted". |
| **Closed** | The question no longer exists. |
| **Deferred** | Not needed before code. Revisit when the named trigger happens. |
| **Confirm** | The user's comment needed interpretation. The working decision stands and code may proceed, but the interpretation is listed in section 11 for the user to confirm. |
| **Phase 2** | Settled by the user at the start of phase 2. Listed in section 12. |

## 2. Foundation principles

These nine principles come out of the decisions below. Each one is cross-cutting, so every spec repeats the parts that touch it.

| ID | Principle | Source |
|---|---|---|
| P1 | **CLI first.** Every capability is usable from a command line before it has a pane. Two binaries: `oa` drives the application through the control protocol, and `ulos` is the independent validator. Output is JSON on request, exit codes are fixed, and commands compose in a shell. Panes are clients of the same protocol. | User, "the whole product should be CLI first", RQ-74 |
| P2 | **The kernel writes the record.** The harness and every capability propose. Only the kernel commits canonical state. | advocate-workflow.md section 12, RQ-05 |
| P3 | **One validator, deterministic, separate.** Verification is done by the `ulos` CLI, a separate binary with no model and no access to the harness. The application's verification adapter builds the input and maps the output. It does not re-implement checks. The AWS catalogue is outside the standard: Research Studio and the quick check may use it, and it never verifies. | RQ-08, RQ-09, RQ-43, RQ-44, OQ-02 |
| P4 | **Verification is mandatory and online.** There is no offline mode. A source that cannot be reached yields `unresolved`, and `unresolved` blocks. | RQ-14, RQ-37 |
| P5 | **Only court public records are verified.** Client-supplied files are tagged `client_supplied` and are never put through a verifier. | RQ-45, RQ-61 |
| P6 | **Legal judgement stays with the advocate.** Citation voice, precedent treatment, limitation, amended-section versions and self-verification of an unresolved item are all human decisions, recorded as such. | RQ-16, RQ-17, RQ-19, RQ-55, RQ-60 |
| P7 | **Vendor the source, run it separately.** The OCR engines, WordCraft and PdfCraft are vendored into our tree and run as separate processes under the supervisor. Nothing heavy or hostile-input-facing runs in the window process. | RQ-78, RQ-84, RQ-85, map calls 2 and 7 |
| P8 | **DOCX is the working format, PDF/A is the filing format.** Drafting and verification happen on the DOCX. The final DOCX is converted to PDF/A for filing, checked against the DOCX, and never edited (5.5). | RQ-79 |
| P9 | **Everything is inspectable.** The GUI is a second front end of the same commands as the CLI, with parity both ways: every query has a GUI view, and every GUI action is a command. Every record, event, command, refusal, process, job, verification, model call and context manifest can be opened in an inspector that shows its raw record, the ledger events that touched it, what it links to and what links to it, and the command and origin that produced it. Nothing the system does is visible only in a log. | User, 4 November 2026; Macro reference (section 13) |

## 3. Terms

The docs used several words in two senses. These are the meanings from now on. Every spec uses them this way.

| Term | Meaning | Not to be confused with |
|---|---|---|
| **Workspace root** | The folder chosen at first run that holds matter workspaces. | A matter workspace |
| **Matter workspace** | One matter's folder, holding its manifest, `matter.db`, blobs, drafts and the harness session store. "One SQLite database per workspace" (map call 5, RQ-70) means one `matter.db` per matter workspace. | The global registry |
| **Global registry** | A small SQLite file in the application data folder that indexes matter workspaces. It is rebuildable by scanning the workspace root. | `matter.db` |
| **Source document** | A file a court or a client handed us. Immutable. Lives in the evidence store (C04). | A draft |
| **Draft** | The working petition, or any document we produce: a DOCX revision in the draft store (C05), identified by its revision hash. | A source document |
| **Verification proof** | What a verification record must point at so anyone can re-check it (RQ-10). Previously called "evidence" in the report, renamed so it cannot be confused with the evidence store. | The evidence store |
| **Validator** | The `ulos` CLI. The only component that produces verification records. | The verification adapter |
| **Verification adapter** | Application code (group K) that extracts what to check from a draft or the Notebook, builds a `ulos` bundle, runs `ulos`, and maps the result into gate states and review items. | The validator |
| **Verified** | A validator outcome only. A human never produces `verified`. | Advocate-attested |
| **Advocate attestation** | A recorded human decision that an `unresolved` item has been checked by the advocate. It is shown and disclosed as "advocate-attested", never as `verified`. | Verified |
| **Simulated** | The ULOS standard and the validator are our own stand-ins for a court standard and a court validator that do not exist (RQ-44). The checks themselves run against real court sources. A **fixture source** is the test-only backend that replaces the court sources in tests (RQ-08). | A "simulated verdict" tag, which no longer exists |
| **Quick check** | A fast, early look-up of a citation against the AWS open-data catalogue, in Research Studio (I14). Its results use their own words (`found`, `not_found`, `mismatch`, `unavailable`), never a validator outcome. It never unblocks a gate and never appears in the disclosure document as verification. | Verification, which is the portal through `ulos` |
| **Inspector** | The drawer every view opens on any item: raw record, ledger events, links out and in, producing command, origin and actor (A16). | A debug log |
| **Signal and Noise** | The two halves of the review inbox. Signal is what needs the advocate's decision or blocks a gate. Noise is information. | Severity |
| **Backlink** | The reverse of a reference: from any record, what points at it (C17). | A copy |
| **Fence** | A number on the harness's claim to a matter session. A new claim increments it, and the store refuses appends carrying an older one (D18). | A lock |
| **Research Studio** | The research and argument capability (group I): search, treatment, voice, memoranda, case conference, advisory scores. The workflow docs call it "Studio". | Verification |
| **Harness** | The runtime that runs turns. One process. | An agent |
| **Orchestrator** | The one long-horizon agent configuration that keeps the matter's plan and memory (RQ-32). | A sub-agent |
| **Sub-agent** | A short-lived agent configuration the orchestrator starts for one task, such as judgment research or a document edit, returning a typed, capped result. Runs inside the same harness. | A second harness |
| **Approval** | A recorded advocate decision on a gate (grounds, final revision, limitation). | A filing confirmation |
| **Filing confirmation** | One of the two deliberate confirmations before a filing action, bound to the payload hash by a single-use token. | An approval |
| **Portal** | The Supreme Court of India website, its case status, judgments search and lower-court search. | The e-filing portal, which is named "e-filing portal" wherever meant |
| **Canonical ledger** | The append-only, hash-chained record in `matter.db`, owned by the kernel. The audit record. | The harness session store |
| **Left pane** | The collapsible pane at the left edge of the window: matters, the open matter's sections, the review inbox, and connection and process health (PH-05). | A status bar, which does not exist |
| **Chat pane** | The orchestrator conversation (A07). It sits between the left pane and the view pane, and becomes the rightmost pane when the view pane is collapsed (PH-05). | A second agent |
| **View pane** | The pane that takes most of the window and shows what is being worked on: a table view, the document viewer, the edit surface, a hosted editor, the browser or a files view. It holds one to three splits (PH-05). | The Inspector |
| **Screen** | The data the window draws: the open matter, which panes are collapsed, and what each view split shows. Navigation history and saved layouts are lists of screens (PH-04). | Canonical state, which the window never holds |
| **Test double** | A stand-in for a dependency, used only in tests, behind a seam that has a real adapter in production. A production build refuses test doubles (PH-06). | A stub, which phase 2 removes |
| **Harness session store** | Harness-local, durable state per matter workspace (`harness/session.db`): turns, effect intents, model traces. Needed for recovery. Not canonical. | The ledger, and disposable development traces |

## 4. Component map calls adopted

The map's section is titled "Nine places" and lists eight. All eight are adopted. The user named seven; the eighth, on provider frameworks, is adopted as a Kept recommendation because nothing the user said conflicts with it.

| ID | Call | Status | Consequence |
|---|---|---|---|
| C-1 | egui exposes an accessibility tree through AccessKit. Use it for standard widgets, and the control protocol for canvas content. | Map, User | A14 stays BUILD. RQ-73 is A. |
| C-2 | Host the document applications rather than vendoring their UI into our pane tree. | Map, User | WordCraft and PdfCraft run as separate processes. See decision X-01 for how this fits RQ-78. |
| C-3 | Own the lightweight viewer: page renderer, text layer, anchor overlay. It is the surface the agent edits through. | Map, User | J01 to J03 stay BUILD. |
| C-4 | Skip the workflow cluster. A durable local runner with intent rows and an effect ledger. | Map, User | D07 and R04. No external workflow engine. |
| C-5 | Skip network-shaped stores. One SQLite database per matter workspace plus blobs. | Map, User | No search cluster, no managed vector database, no JVM store. `sqlite-vec` is inside SQLite, so RQ-75's vector search is allowed. |
| C-6 | Do not adopt a provider framework as the harness. Use it behind our loop and measure it. | Kept | RQ-01. |
| C-7 | Defer the .NET compare engine. | Map, User | Redlines on our drafts use the DOCX engine. A .NET sidecar is a fallback only. |
| C-8 | The OCR engines run as separate processes, completely. | Map, User | G03 and G04 are child processes, never linked into the window or the harness. |

## 5. Decisions by question

### A. Kernel, runtime and harness

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-01 | Write the loop conformance fixtures first (no repeated effect on resume, synchronous block with a reason, cancel between tokens, cost per turn). Build our own loop. Measure the `rig` adapter against the same fixtures. The loser is deleted. | Kept | [D](specs/D-harness.md) |
| RQ-02 | The harness runs as a child process behind the control protocol. | Kept | [D](specs/D-harness.md), [B](specs/B-control-surface-cli.md) |
| RQ-03 | Workflow progression is data per workflow, executed by one playbook interpreter. The SLP state machine is one such file. | Kept | [D](specs/D-harness.md) |
| RQ-04 | Separate processes for the harness, the browser, each OCR engine, each hosted application and the validator. Quiet adapters run in the kernel process. | Kept | [D](specs/D-harness.md) |
| RQ-05 | The harness holds a propose-only capability object with no ledger handle, and a build test fails if harness code links the ledger. | Kept | [C](specs/C-kernel.md) |
| RQ-06 | A domain service per pipeline step writes Notebook content through the kernel's single commit path. | Kept | [H](specs/H-notebook.md) |
| RQ-07 | The integration proof is a provider swap drill, run as a recorded session replayed through the control protocol, asserting pane state and ledger events. The drill swaps an OCR engine, because two exist from day one (RQ-84). It cannot swap the validator, because there is only one (RQ-44). | Kept, adjusted | [P](specs/P-observability.md) |

### B. Verification design

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-08 | There is no real-or-simulated tag. The validator is ours and stands in for a court validator that does not exist. Every check runs against court sources: the Supreme Court portal, and India Code for legislation. In tests the court sources are replaced by a fixture source. Every resolution attempt records the source endpoint it used, and a production build refuses a fixture source. K10 is replaced by this source stamp. | User | [K](specs/K-verification-adapter.md), [U](specs/U-ulos-validator.md) |
| RQ-09 | Independence is structural. The validator is a deterministic CLI, a separate binary, with no model and no access to the harness or the kernel. The verification adapter is separate application code. The independence guard checks that every verification record was produced by a known `ulos` binary hash. No model-family field exists. | User | [K](specs/K-verification-adapter.md), [U](specs/U-ulos-validator.md) |
| RQ-10 | Explained in 5.1. A verification record carries a verification proof: the source consulted, the hash of the source bytes, the location inside the source, and the hash of the draft revision or Notebook item judged. | User asked, settled B | [U](specs/U-ulos-validator.md) |
| RQ-11 | Explained in 5.2. Verification records and approvals bind to the revision hash they judged. An edit creates a new revision, the affected checks re-run automatically, and approvals on the old revision stop counting. | User asked, settled A | [C](specs/C-kernel.md), [K](specs/K-verification-adapter.md) |
| RQ-12 | Explained in 5.3. The validator has four outcomes: `verified`, `failed`, `unresolved`, `not_applicable`. Every non-`verified` outcome carries a reason code. The advocate sees the six gate states, produced by one tested mapping function. | User | [K](specs/K-verification-adapter.md) |
| RQ-13 | Validation is deterministic, so model-family diversity does not apply. | Closed | - |
| RQ-14 | Option A. Any `unresolved` or `failed` citation blocks. While any citation is blocked the AI-use disclosure document is not generated, and the filing package cannot be assembled without it. The only way out of `unresolved` is an advocate attestation (RQ-60). The only way out of `failed` is a corrected draft. | User | [K](specs/K-verification-adapter.md), [L](specs/L-filing.md) |
| RQ-15 | The planted-defect corpus is developed from the Supreme Court Registry's list of filing defects, plus planted citation, legislation and OCR defects. Each gate reports a catch rate per version. | User | [P](specs/P-observability.md), [K](specs/K-verification-adapter.md) |
| RQ-16 | Precedent treatment is part of Research Studio, not citation verification. If a cited or relevant authority has been overruled, addressing it is mandatory and blocks grounds approval. If the treatment is only a difference of opinion (doubted, distinguished, a conflicting view of a coordinate bench), it is a warning. | User | [I](specs/I-research-studio.md) |
| RQ-17 | Option B. The system computes limitation from the Notebook dates and the rule pack, and the advocate confirms it with the inputs shown. | User | [K](specs/K-verification-adapter.md) |
| RQ-18 | Overruling mechanics are part of Research Studio. Where bench strength and dates are known, a deterministic check flags a smaller bench purporting to overrule a larger one. Where they are not known, it is a review item for the advocate. | User, mechanics Kept | [I](specs/I-research-studio.md) |
| RQ-19 | Citation voice (holding, submission, lower-court view, dissent) is classified in Research Studio and confirmed by the advocate. Verification checks only the paragraph (ULOS-CI). | User | [I](specs/I-research-studio.md) |
| RQ-20 | A citation must always match the court record. There is no outside-corpus outcome. If the source was reached and the citation does not match a judgment, the outcome is `failed`. If the source could not be reached or the match is ambiguous, the outcome is `unresolved`. | User | [U](specs/U-ulos-validator.md) |
| RQ-21 | All Supreme Court judgments now carry INSC neutral citations, so there is no pre-2014 fallback. A draft that cites only a reporter (for example an SCC citation) yields `unresolved` with `insc_required`, and the advocate supplies the INSC citation. | Closed | [U](specs/U-ulos-validator.md) |

### C. Records: OCR, dates and corrections

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-22 | Explained in 5.4. Exact agreement for every token in a critical class (digits, dates, amounts, case numbers, years, section numbers, citations, party names, statutory provision names, negations). Bounded edit distance only for the remaining prose. The threshold is versioned. | User asked, settled | [G](specs/G-ocr-document-intelligence.md) |
| RQ-23 | The document's own header date anchors relative dates. If there is no header date, the portal's date for that document is the truth. If the header date and the portal date conflict, or neither exists, the advocate is asked once per file. The computer clock is never an anchor. | User | [G](specs/G-ocr-document-intelligence.md), [H](specs/H-notebook.md) |
| RQ-24 | A correction is a new record version, and gates read the current version. | Kept | [C](specs/C-kernel.md) |
| RQ-25 | No erasure mechanism is built. The advocate removes a matter by removing its folder from the workspace root. The registry shows it as removed on the next scan. | User | [A](specs/A-shell-workspace.md) |
| RQ-26 | Rejected writes go to a separate audit table with a visible count. | Kept | [C](specs/C-kernel.md) |
| RQ-27 | Option A, compare-and-swap heads, plus checkpoints. Every agent edit is its own revision with its own parent, so each one can be reverted independently. A revert is a new revision that inverts the chosen edit. A checkpoint is a named revision, and restoring one creates a new revision with the checkpoint's content. Nothing is rewritten. | User | [C](specs/C-kernel.md), [J](specs/J-documents-editors.md) |

### D. Sessions, effects and context

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-28 | Resume replays recorded model responses from the trace store, keyed by a request hash that includes the context manifest hash, and reports the first divergence. | Kept | [D](specs/D-harness.md) |
| RQ-29 | Every external effect goes through an outbox with an `unknown` state. | Kept | [D](specs/D-harness.md) |
| RQ-30 | Every approval and both filing confirmations precede the action they authorise, provably from the event order. A lapse while the action is in flight is recorded as `unknown` and reconciled. The system always states the honest state. | User | [C](specs/C-kernel.md), [L](specs/L-filing.md) |
| RQ-31 | Option B, as two logs. The canonical ledger is the audit record, kept by the kernel in `matter.db`, never held in memory or model context, and auditable on demand. The harness session store is separate, harness-local and per matter workspace. Disposable development traces (RQ-86) are a third thing and are not a log of record. | User | [C](specs/C-kernel.md), [D](specs/D-harness.md) |
| RQ-32 | A mix of B and C. One orchestrator agent keeps the long memory and context of the matter, using persistent notes and tool-result clearing. Judgment research and document edits run as sub-agents with typed, capped returns, and each return carries its context manifest. | User | [D](specs/D-harness.md) |

### E. Filing and product boundaries

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-33 | Record the acknowledgement text and its hash, with a screenshot only when the portal answers with an image. | Kept | [L](specs/L-filing.md) |
| RQ-34 | Victim-identity masking is a deterministic export blocker, plus a fixed, visible blocker list. | Kept | [K](specs/K-verification-adapter.md) |
| RQ-35 | Option B. Advisory outcome scores are allowed in Research Studio, clearly labelled as advisory, based on deep research and current bench trends, never on a particular judge. Multi-agent evaluations of arguments are allowed in Research Studio. Scores never enter a draft, a filing or the standard. | User | [I](specs/I-research-studio.md) |
| RQ-36 | One AI-use disclosure document (manifest and receipt) per filing, generated at filing preparation. This is the document RQ-14 blocks. | Kept | [C](specs/C-kernel.md), [L](specs/L-filing.md) |
| RQ-37 | Option C. No offline guarantee. Verification is not optional. | User | [Q](specs/Q-build-ship.md) |

### F. Shell

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-38 | egui with winit. | Settled before this pass | [A](specs/A-shell-workspace.md) |

### G. Capability and reference enforcement

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-39 | A machine-readable capability manifest per adapter, and every claim gated against it at runtime. | Kept | [D](specs/D-harness.md) |
| RQ-40 | References are validated at write time, and the kernel refuses a write whose references do not resolve. | Kept | [C](specs/C-kernel.md) |
| RQ-41 | A contract test per portal adapter in CI, plus a runtime health check that degrades to a human-completable flow. | Kept | [F](specs/F-capture-ingest.md) |
| RQ-42 | A matter pins its rule pack version, and a new version is adopted only at a stage boundary with an explicit event. | Kept | [C](specs/C-kernel.md) |

### H. The standard and its CLI

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-43 | The standard has a Rust CLI and no SDK. | User | [U](specs/U-ulos-validator.md) |
| RQ-44 | There is one validator. The standard and the validator are both ours and both simulated, because no court standard or court validator exists. Their purpose is to let us write the adapters properly against a fixed contract. JSON Schema is the normative artefact, and the Rust types are generated from it. | User | [U](specs/U-ulos-validator.md) |
| RQ-45 | Verification covers court public records only. It does not cover pleadings received from clients. The Notebook has two components: items supplied by the court portal, which ULOS-N checks, and files supplied by the client, which are tagged and never checked. | User | [H](specs/H-notebook.md), [U](specs/U-ulos-validator.md) |
| RQ-46 | One identifier scheme, `urn:ulos:`, with readable forms as display aliases. | Kept | [C](specs/C-kernel.md) |
| RQ-47 | A matter pins one standard version at creation. An upgrade is an explicit event at a stage boundary. | Kept | [C](specs/C-kernel.md) |
| RQ-48 | The CLI checks structure, hashes, signatures, identifier syntax, Act and section identity, citation existence and paragraph identification, and prints its refusal list. | Kept, adjusted to RQ-58 | [U](specs/U-ulos-validator.md) |
| RQ-49 | The minimum object set is the standard's own object model, now including the ULOS-CI objects. | Kept, adjusted | [U](specs/U-ulos-validator.md) |
| RQ-50 | Court codes are stored as `{scheme, code}` with the label verbatim, never renumbered. | Kept | [F](specs/F-capture-ingest.md) |
| RQ-51 | A language-neutral fixture set with expected outputs, run by the CLI. The application's adapter is tested against the CLI's outputs, not against its own copy of the checks. | Kept, adjusted | [U](specs/U-ulos-validator.md) |
| RQ-52 | A normative hash exclusion list with test vectors. | Kept | [U](specs/U-ulos-validator.md) |

### I. ULOS-L

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-53 | The direct India Code API by default, the API Setu route as an option. | Kept | [U](specs/U-ulos-validator.md) |
| RQ-54 | `act_id` is the key. The cited number and year are checked against it. | Kept | [U](specs/U-ulos-validator.md) |
| RQ-55 | Identity and repeal are always checked. The amendment check is conditional: India Code flags an amended section, so when the flag is present the check yields `unresolved` with `amended_point_in_time`, and the advocate attests the applicable version. When the flag is absent the section is `verified`. | User | [U](specs/U-ulos-validator.md) |
| RQ-56 | Any Act verifiable from India Code is in scope. The validator does not distinguish Central from State. | User | [U](specs/U-ulos-validator.md) |

### J. ULOS-C and ULOS-CI

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-57 | The Supreme Court portal is the only citation source in the ULOS standard and the validator. The AWS open-data catalogue of Supreme Court judgments is allowed outside the standard, for Research Studio and for the quick check (OQ-02, settled 4 November 2026). | User | [U](specs/U-ulos-validator.md), [I](specs/I-research-studio.md) |
| RQ-58 | ULOS-C verifies only that a citation exists and names the judgment the draft names. A new, separate function, ULOS-CI (Citation Identification), verifies the paragraph: that it exists in the court's numbering, that the quote occurs in it, and that the pinpoint is not in a reporter block. | User | [U](specs/U-ulos-validator.md) |
| RQ-59 | Closed. All Supreme Court judgments carry INSC citations. | Closed, Confirm (OQ-07) | - |
| RQ-60 | A citation the validator cannot resolve is `unresolved` and shown to the advocate. The advocate can self-verify it. That is recorded as an advocate attestation, never as validator `verified`. | User | [K](specs/K-verification-adapter.md) |

### K. ULOS-N

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-61 | A client document is tagged `client_supplied`. It is not labelled "unverifiable". It is simply never sent to the validator. | User | [H](specs/H-notebook.md) |
| RQ-62 | The impugned order is identified by the facts the portal's lower-court search uses, plus the CNR when known. | Kept | [H](specs/H-notebook.md) |
| RQ-63 | Closed by the user. The residual risk is recorded as OQ-04. | Closed | - |
| RQ-64 | A capture record holds the URL, the final URL, the time, the download hash and the advocate's gesture. | Kept | [F](specs/F-capture-ingest.md) |

### L. Process

| RQ | Decision | Status | Trigger to revisit |
|---|---|---|---|
| RQ-65 | Deferred. | Deferred | Before the standard is shown to anyone outside the team |
| RQ-66 | Deferred. Licence position is not a constraint now. | Deferred | Before the first public release |
| RQ-67 | Deferred. The standard is simulated, and no court proposal is planned. | Deferred | If a court proposal is planned |

### M. Workspace and record shape

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-68 | A matter is a folder with a manifest, and the global registry points at it. | Settled before this pass | [A](specs/A-shell-workspace.md) |
| RQ-69 | Source bytes live in a content-addressed blob store, with one evidence entry per document carrying the original name and capture record. | Kept | [C](specs/C-kernel.md) |
| RQ-70 | One `matter.db` per matter workspace, plus the small global registry. | Kept, term clarified | [E](specs/E-stores.md) |
| RQ-71 | Two stores: immutable evidence and versioned drafts. | Kept | [C](specs/C-kernel.md) |
| RQ-72 | Our draft store owns every revision. WordCraft works on a working copy and returns DOCX bytes. | Kept | [J](specs/J-documents-editors.md) |
| RQ-73 | Option A. The control protocol for state and actions, the accessibility tree for standard widgets, and the viewport raster as the last fallback. | User | [B](specs/B-control-surface-cli.md) |
| RQ-74 | One protocol with a rich CLI. The harness tools and the CLI are two front ends of the same commands. | User | [B](specs/B-control-surface-cli.md) |
| RQ-75 | Not viewport only. The orchestrator supplies the relevant context, found through the matter's own search (FTS5 and `sqlite-vec` in `matter.db`). It never loads hundreds of pages. The viewport is one input among several. | User | [D](specs/D-harness.md), [E](specs/E-stores.md) |
| RQ-76 | Same as RQ-02. | Closed | - |
| RQ-77 | Option A, reparent the hosted window into our pane. Separate windows remain the fallback when reparenting fails. | User | [J](specs/J-documents-editors.md) |
| RQ-78 | The full editor is WordCraft, vendored into our tree from its fork, run as a hosted process and reparented into our pane. Our lightweight viewer and edit surface stay the agent's anchor surface. See X-01. | User, Confirm (OQ-01) | [J](specs/J-documents-editors.md) |
| RQ-79 | Option B. DOCX is the working format, because it is what lawyers use. Verification runs on the DOCX. The final DOCX is converted to PDF/A for filing, and the PDF is never edited. Anchor identity inside a DOCX is the paragraph id, and revision identity is the draft store's revision hash. The full flow is in 5.5. | User | [J](specs/J-documents-editors.md) |

### N. Rendering, OCR and observation

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-80 | Option A, one Chromium binary, one process per profile. In addition the agent has its own headless browser for tool tasks other than filing. | User | [M](specs/M-browser.md) |
| RQ-81 | The agent's browser is the same binary in its own process and profile, attachable to the visible browser only on the advocate's request. It is never used for filing. | Kept, extended by RQ-80 | [M](specs/M-browser.md) |
| RQ-82 | pdfium is the one PDF rasteriser. | Kept | [G](specs/G-ocr-document-intelligence.md) |
| RQ-83 | No Ladybug in the first release. | Kept | [E](specs/E-stores.md) |
| RQ-84 | Option C. Both OCR engines from the start, vendored, each in its own process. The cost, two integrations before either is proven, is accepted for the earliest disagreement signal. | User | [G](specs/G-ocr-document-intelligence.md) |
| RQ-85 | The OCR engines run as child processes. The user's note written against "RQ-85" is about iii and is recorded under RQ-86. | Map call C-8 | [G](specs/G-ocr-document-intelligence.md) |
| RQ-86 | iii is a development tool for now. It may observe the harness and save harness trace logs, which are disposable. It owns nothing that must survive. | User | [P](specs/P-observability.md) |

### O. What the agent may touch

| RQ | Decision | Status | Spec |
|---|---|---|---|
| RQ-87 | The agent may create a matter through a control call, with a visible confirmation when the client is new. | Kept | [A](specs/A-shell-workspace.md) |
| RQ-88 | The agent may write only under the inbox and its scratch area. Record folders are written through the control protocol. | Kept | [A](specs/A-shell-workspace.md) |

### 5.1 RQ-10 explained: what "evidence" meant

The report used "evidence" for two different things. The evidence store (C04) holds the files a court or client gave us. RQ-10 was about something else: what a verification result must point at, so that anyone can check it again later and see whether it still holds. That second meaning is now called the **verification proof**.

A result that says "2024 INSC 23 is correct" proves nothing on its own. A result that says "on 4 November 2026 the validator fetched the case listing at this URL, the bytes hashed to `sha256:9f2c…`, the judgment's parties and date were these, and the draft revision judged was `sha256:41ab…`" can be re-checked by anyone, and goes stale visibly when the draft changes. The proof has four parts:

1. **The source consulted.** The endpoint, the URL and the resolution attempt.
2. **The source bytes.** The hash of what was read.
3. **The location.** The paragraph number, or the Act and section, or the Notebook item.
4. **The target judged.** The hash of the draft revision or Notebook item that was checked.

### 5.2 RQ-11 explained: what "draft" means here

A draft is the working petition: a DOCX file stored as a revision in the draft store. Every save, every agent edit and every revert makes a new revision with its own hash. Source documents are never drafts.

Binding means that every verification record and every approval names the revision hash it judged. When the draft changes, the new revision has a new hash, so the old records no longer apply to it. The application then re-runs the affected checks automatically, because they are deterministic and cheap, and any approval given on the old revision has to be given again. The cost the report named, friction on every edit, falls mostly on approvals. Verification re-runs need no human.

### 5.3 RQ-12: the four verifier states

The validator produces exactly four outcomes. `not_checked` and `not_checkable_against_source` from the earlier ULOS draft are removed as outcomes and survive as reason codes under `unresolved`.

| Outcome | Meaning | Reason codes |
|---|---|---|
| `verified` | Every check the record lists passed against a court source. | none |
| `failed` | The source was reached and contradicts the target. | `not_on_court_record`, `identifier_mismatch`, `party_mismatch`, `date_mismatch`, `paragraph_missing`, `quote_not_found`, `in_reporter_block`, `act_not_found`, `section_not_found`, `repealed`, `number_year_mismatch`, `hash_mismatch`, `not_captured_from_portal`, `impugned_order_mismatch`, `required_document_missing`, `schema_invalid` |
| `unresolved` | The validator could not reach a decision. | `source_unreachable`, `captcha_pending`, `ambiguous_match`, `insc_required`, `amended_point_in_time`, `source_text_disputed`, `not_checkable_against_source` |
| `not_applicable` | The check does not apply to this target. | `client_supplied`, `no_such_element` (for example a pinpoint check on a citation with no pinpoint) |

The advocate sees the six gate states from the workflow docs. One mapping function turns verifier outcomes and review items into them. A petition can be in several states at once, and the primary state is the first match in this order.

| Order | Gate state | Produced by |
|---|---|---|
| 1 | Blocked pending source verification | Any `unresolved` without an advocate attestation |
| 2 | Needs correction | Any `failed` |
| 3 | Blocked pending legal review | An open legal review item: overruled authority, unconfirmed voice, unconfirmed limitation, amended section without attestation |
| 4 | Blocked pending filing compliance | An open filing-compliance defect, or a masking blocker |
| 5 | Needs additional instructions | An open instruction request to the advocate |
| 6 | Ready for advocate review | None of the above |

### 5.4 RQ-22 explained: how two OCR readings are compared

Two OCR engines read the same line. They almost never produce identical text, so the question is which differences matter.

- **Bounded edit distance** counts the smallest number of single-character changes that turn one reading into the other. "fiIed" and "filed" are one change apart. For ordinary prose, a small distance is a cosmetic difference, and the line is accepted.
- **Exact agreement** means the two readings must be character-for-character equal after normalisation. One different character makes the token disputed.

The rule now is: split each line into tokens, classify each token, and compare critical tokens exactly and prose tokens by bounded edit distance. Critical classes are digits in any form (dates, amounts, years, case numbers, section numbers, paragraph numbers, citations), party names, statutory provision names, and negations ("not", "no", "never", "nor", "without", and their Hindi equivalents in the rule list). A disputed critical token disputes the fact it belongs to, not only the line.

Example. Engine one reads "paid Rs. 1,50,000 on 12.03.2019 to the respondent", and engine two reads "paid Rs. 1,50,000 on 12.08.2019 to the respondcnt". The date differs, so the date is disputed and stops propagating. "respondent" and "respondcnt" are one edit apart and "respondent" is not a party name, so the prose difference is accepted. If the two readings had differed on "Ramesh" versus "Ramcsh" in the party field, that is a party name, so it is disputed.

Normalisation before comparison is fixed and versioned: Unicode NFC, whitespace collapse, line-end hyphen joins, and Devanagari digits mapped to ASCII digits. The normalisation version is stored with every comparison.

### 5.5 The DOCX to PDF/A flow (settled by the user, 4 November 2026)

Every document is drafted in DOCX, because advocates work in DOCX. Verification runs on the DOCX. When the DOCX is final, it is converted to PDF/A and the PDF/A is what is filed. The PDF is an output, never a working copy.

```
draft (DOCX revisions) -> verify (on the DOCX) -> approve (the DOCX revision) -> convert (PDF/A) -> confirm twice (the PDF/A payload) -> file
```

The rules that follow from it:

1. **DOCX is the only format anyone edits.** The advocate edits in WordCraft, the agent proposes edits against DOCX paragraph ids, and every change is a new DOCX revision.
2. **Verification judges the DOCX.** Every verification record and every approval binds to the DOCX revision hash (RQ-11). Nothing is verified on the PDF.
3. **Conversion is a mechanical last step.** It runs only on an approved revision whose gates are clear, and it produces PDF/A through one renderer (OQ-03, working decision WordCraft's engine).
4. **The PDF is never edited.** No component edits the filing PDF, including PdfCraft. A change needed after conversion goes back to the DOCX: a new revision, re-verification, re-approval, a new conversion. The source PDFs that become annexures are court or client documents and are merged as they are.
5. **The conversion is checked, so the DOCX verification carries over.** A conversion check extracts the text of the produced PDF/A and compares it, paragraph by paragraph in order, with the approved DOCX revision. Any missing, added or changed text fails the conversion. The check also validates PDF/A conformance and records the page count and the PDF hash. This is what lets a verification done on the DOCX stand for the filed PDF.
6. **The filing binds to the PDF.** The conversion record links the approved DOCX revision hash to the PDF/A hash. The two filing confirmations and the token bind to the PDF/A payload hash (L-04). The disclosure document names both hashes.

Consequences for the components: J04, J05 and J13 (one DOCX engine, conversion at the end), K (verification on the DOCX, plus the conversion check), L (the payload is the converted PDF/A). The WordCraft spike in the build order stays, because rules 1, 3 and 5 all depend on the engine preserving paragraph ids and rendering faithfully (H-02, H-03).

## 6. Contradictions found and how they are resolved

| ID | Contradiction | Resolution |
|---|---|---|
| X-01 | RQ-78 says the full editor is "vendored from WordCraft", and map call C-2, which the user also accepted, says to host WordCraft rather than vendor it into the pane tree. | Both hold. WordCraft's source is vendored into our tree, so it is ours to patch, and it runs as its own hosted process with its own egui fork, reparented into our pane. Its UI is never linked into our window. The same pattern applies to the OCR engines. OQ-01 asks the user to confirm. |
| X-02 | RQ-08 says citation verification happens "through the court website or through the AWS catalogue". RQ-57 says "the portal only for now". | Settled by the user. Both hold, in different places. The ULOS standard and the `ulos` validator use the portal only, so only the portal can produce `verified`. The AWS catalogue is used by the application outside the standard: Research Studio searches and reads it, and the quick check (I14) uses it to give an early signal on a citation before the portal check. A quick-check result is never a verification record. |
| X-03 | RQ-20 says no outside-corpus outcome and a citation must always match. RQ-60 says an unresolvable citation is `unresolved` and the advocate can self-verify. RQ-14 says unresolved blocks. | Split by cause. Source reached and no match is `failed`. Source not reached, or an ambiguous match, is `unresolved`. `unresolved` blocks until the advocate attests. `failed` blocks until the draft is corrected. |
| X-04 | RQ-79 makes DOCX the working format. The map said `docx-rs` is "never a general reader", that there is "one DOCX boundary", and that the filing PDF is laid out by `typst`. With DOCX as the working copy, those three statements cannot all hold. | One DOCX engine reads and edits drafts: WordCraft's vendored document engine. `docx-rs` writes the first revision of a generated draft and nothing else. The filing PDF is rendered from the approved DOCX revision by the DOCX engine, then assembled and converted to PDF/A. `typst` produces only the pages that are not in the DOCX, such as the index and cover. OQ-03 covers the renderer. |
| X-05 | The workflow docs (section 3) have the Court Capture Adapter access "the relevant High Court website". The ULOS scope and RQ-57 limit capture to the Supreme Court portal. | The first release captures from the Supreme Court portal, including its lower-court search for the High Court judgment and orders. High Court websites are a later adapter. The workflow docs are amended. |
| X-06 | The workflow docs (section 9B) say citation verification checks that "the cited paragraph or passage supports the proposition". RQ-16, RQ-18 and RQ-19 move support, treatment and voice to Research Studio and limit verification to existence and the paragraph. | Verification checks existence (ULOS-C) and the paragraph (ULOS-CI). Support is assessed in Research Studio and confirmed by the advocate. The workflow docs are amended. |
| X-07 | The architecture requirement listed six verification outcomes (verified, not verified, contradicted, incomplete, not applicable, requiring human determination). The report said verifiers produce four. ULOS listed five. | Four validator outcomes with reason codes, six gate states for the advocate, one mapping function (5.3). The architecture requirement is amended. |
| X-08 | ULOSarchitecture.md said "absence from a corpus is never reported as fabrication" and had a mirror and an aggregator tier. RQ-20 removes the outside corpus and RQ-57 removes the other tiers. | Rewritten in ULOSarchitecture.md under RQ-20 and X-03. |
| X-09 | architecture.md said the verifier CLI is "the second implementation the integration proof needs". RQ-44 says there is only one validator. | The integration proof swaps an OCR engine. The validator is the only implementation of the checks, and the adapter is tested against it. |
| X-10 | Map A15 said "everything must install and run with no network", and Q07 specified an offline mode. RQ-37 removes the offline guarantee. | The application installs without a network. Capture, research, model calls and verification need one. With no network, verification reports `unresolved` with `source_unreachable`, which blocks. Q07 is replaced. |
| X-11 | The map's section says "Nine places" and lists eight. | Corrected to eight. |
| X-12 | "Workspace" meant both the root folder and one matter. Call C-5 and RQ-70 said one database per workspace, while the disk layout showed `matter.db` per matter. | Defined in section 3: one `matter.db` per matter workspace, plus a global registry. |
| X-13 | The user's note labelled RQ-85 is about iii, which is RQ-86. | Recorded under RQ-86. RQ-85 is settled by call C-8. |
| X-14 | The report's RQ-35 recommendation was to exclude outcome prediction, and ULOS listed it as out of scope. The user chose B. | The application allows labelled advisory scores in Research Studio. The standard still has no field for them. These are compatible once scoped. |
| X-15 | Map C06 encrypted blobs at rest, which existed for crypto-erasure under RQ-25's option A. The user removed erasure. | Encryption at rest no longer has a driver inside the product. OQ-05 asks whether it is wanted for its own sake. |
| X-16 | Map K10 tagged every verdict real or simulated. RQ-08 removes the tag. | K10 becomes the source stamp. |
| X-17 | The user closed RQ-63 because "all SC judgments have INSC citations", but the `01-01-1900` placeholder is a case-status date, not a citation. | Closed as the user directed. The validator does not check it. OQ-04 records the residual risk. |
| X-18 | RQ-75 needs semantic search inside the matter. Map E03 made vector search optional and gated on a gold-set gap. | E03 is required from the start. `sqlite-vec` lives inside `matter.db`, so it does not breach C-5. |
| X-19 | Map B02 makes the `oa` CLI "the agent's shell". Approvals and filing confirmations must be human. If the agent can run `oa`, it can run `oa filing confirm`. | Human-gesture commands are a separate command class. They are refused on any connection that originates from the harness, and from the CLI they require an operating-system user-presence prompt raised by the kernel process. See L-01 and H-09. |
| X-20 | Map J03 called the lightweight edit surface "the agent's editing interface". RQ-78 adds a full editor. | Both. The agent proposes edits against anchors on our surface. Each accepted edit becomes a DOCX revision through the DOCX engine. The advocate edits freely in WordCraft. |
| X-21 | Map F04 and I06 assumed Central Acts only. RQ-56 says any Act. | Any Act in India Code. |
| X-22 | architecture.md sections 1 to 12 duplicated advocate-workflow.md sections 1 to 12. Two copies drift. | One copy. The workflow lives only in advocate-workflow.md, and architecture.md links to it (PH-08). A docs check fails if architecture.md carries a workflow section (A-AC-14). |
| X-23 | ULOS-N used the source value `party_supplied`. RQ-61 uses "supplied by client". | `client_supplied` everywhere. |
| X-24 | RQ-14 blocks the AI-use disclosure document. Nothing said the filing package requires it. | The filing package requires the disclosure document, as a product rule, so blocking it blocks filing. OQ-06 asks the user to confirm. |

## 7. Hidden dependencies

Each of these is a thing one component quietly relies on another for. Every one is now named in the spec that depends on it.

| ID | Dependency | Who depends on it | Spec |
|---|---|---|---|
| H-01 | The portal's judgments search and case status sit behind a CAPTCHA the advocate must solve. With the portal as the only citation source, verification throughput is bounded by the advocate. A petition with thirty citations may need many CAPTCHA solves, unless one solved session can serve a batch. The quick check against the AWS catalogue catches most wrong citations before any CAPTCHA, so the portal is asked mainly about citations that already look right. It does not remove the portal check. | Citation verification, filing readiness | [U](specs/U-ulos-validator.md), [F](specs/F-capture-ingest.md) |
| H-02 | WordCraft's engine must preserve paragraph ids through open, edit and save, and must have a mode the agent can drive without the window. Without both, anchors and agent edits die at the first save. | Anchors, RQ-27 revert, RQ-79 | [J](specs/J-documents-editors.md) |
| H-03 | A DOCX-to-PDF renderer with filing fidelity. | Filing PDF/A | [J](specs/J-documents-editors.md) |
| H-04 | An embedding model for `sqlite-vec`. A remote model sends client text off the machine, so the choice is a confidentiality decision for the model router. | Context assembly (RQ-75) | [E](specs/E-stores.md), [D](specs/D-harness.md) |
| H-05 | The Supreme Court Registry's filing-defects list, as a versioned, sourced document. | Filing compliance rule pack, planted-defect corpus (RQ-15) | [K](specs/K-verification-adapter.md) |
| H-06 | India Code's API availability, response shape and rate limits. | ULOS-L | [U](specs/U-ulos-validator.md) |
| H-07 | Paragraph numbers recoverable from the court's judgment PDF. A scanned judgment needs OCR, and a disputed paragraph number must make ULOS-CI `unresolved` rather than guess. | ULOS-CI | [U](specs/U-ulos-validator.md), [G](specs/G-ocr-document-intelligence.md) |
| H-08 | Reparenting a CEF window and a WordCraft window into a winit window on Windows, across DPI changes and modal dialogs. | One-application experience | [J](specs/J-documents-editors.md), [M](specs/M-browser.md) |
| H-09 | An operating-system user-presence prompt (Windows Hello or the credential UI) that a process cannot satisfy on its own. | Filing confirmations, approvals from the CLI | [L](specs/L-filing.md), [C](specs/C-kernel.md) |
| H-10 | Vendored Tesseract and PaddleOCR builds with Devanagari models, bundled. | OCR | [G](specs/G-ocr-document-intelligence.md), [Q](specs/Q-build-ship.md) |
| H-11 | The harness is a child process, so no agent work is possible before the control protocol exists. | Build order | [B](specs/B-control-surface-cli.md) |
| H-12 | Limitation needs the impugned judgment date, the certified copy application and receipt dates, and the rule pack. Those dates come from OCR and the date rules. A disputed date makes limitation unresolved. | RQ-17 | [K](specs/K-verification-adapter.md), [H](specs/H-notebook.md) |
| H-13 | Overruling checks need bench strength and decision dates for both judgments, from court records. | RQ-18 | [I](specs/I-research-studio.md) |
| H-14 | The masking blocker needs the case category (for example sexual offences) and entity extraction of victim identity. A misclassified category silently disables masking. | RQ-34 | [K](specs/K-verification-adapter.md), [F](specs/F-capture-ingest.md) |
| H-15 | The agent's headless browser needs its own egress policy and a hard refusal of filing destinations. | RQ-80 | [M](specs/M-browser.md) |

## 8. Untestable claims, rewritten

Each claim below was in a doc as a goal nobody could fail. The spec now states a form a test can fail.

| Original claim | Where | Testable form | Test |
|---|---|---|---|
| "Decides whether the product feels trustworthy" | Map G11 | Every disputed token shows both readings and the page image region in one screen, and a decision is one action. | AUTO for layout and action count, HUMAN for trust |
| "Two clicks to the evidence" | Map K13 | From any verdict badge, the source passage is reached in at most two control-protocol actions. | AUTO |
| "The advocate can inspect the source of a statement at any point" | architecture.md | `oa trace <draft-anchor>` returns a chain ending at a blob hash and a page region for every factual paragraph. | AUTO |
| "Deeply integrated" | Workflow section 1 | Every cross-capability handoff passes an anchor or id, never copied text. A static check finds no capability API that accepts free text where an anchor exists. | AUTO |
| "One application" | Map, RQ-77 | Hosted windows have no taskbar entry and move, resize and minimise with our window. | AUTO for window state, HUMAN for feel |
| "No issue may exist only in a log" | Map A08 | Every error code in the error catalogue maps to a review item kind or is listed as internal-only. A test fails on an unmapped code. | AUTO |
| "Screen readers become reachable" | Map C-1 | Every standard widget has an AccessKit node with a role and a name. | AUTO for nodes, HUMAN with a screen reader |
| "Specialist agents are not separate orchestration systems" | architecture.md | Exactly one crate contains a turn loop. A build check fails on a second. | AUTO |
| "Recovery is a feature" | Map Q05 | Kill tests at every effect boundary resume without a duplicate effect. | AUTO |
| "The model cannot introduce new facts" | Workflow 8B | Every factual sentence in a generated section carries event ids, and every date, number and name in it appears in a linked event. | AUTO |
| "Clearly labelled advisory scores" | RQ-35 | A score record cannot be referenced from a draft anchor, and every rendering of a score carries the advisory label. | AUTO |

## 9. Loopholes: passing the criteria while violating the intent

These are the places where an implementation could satisfy the written words and still defeat the purpose. Each spec now carries the guard.

| ID | How it passes the letter | Why it violates the intent | Guard | Spec |
|---|---|---|---|---|
| L-01 | The agent runs `oa filing confirm` twice. Both confirmations are recorded. | The confirmations were meant to be the advocate's. | Human-gesture commands are refused on harness connections and need an OS user-presence prompt from the CLI. | [L](specs/L-filing.md) |
| L-02 | The citation extractor misses a citation, so the draft has "no unresolved citations". | Verification passes vacuously. | Loose patterns (INSC, SCC, AIR, "v.", "vs") that do not parse become review items, and extractor recall is measured on the gold set. | [K](specs/K-verification-adapter.md) |
| L-03 | Every factual sentence links to an anchor, but the anchor is irrelevant. | "Has a supporting source" is satisfied by any link. | Every date, number and party name in the sentence must occur in the anchored text, or the check fails. | [K](specs/K-verification-adapter.md) |
| L-04 | The advocate approves the DOCX revision, and the filing submits a PDF rendered later. The renderer drops or changes text. | The approval and the verification did not see the filed bytes. | The conversion check compares the PDF/A text with the approved DOCX paragraph by paragraph and fails on any difference (5.5). The confirmation token binds to the final PDF payload hash, and the confirmation screen shows that PDF. | [L](specs/L-filing.md) |
| L-05 | The agent marks review items "skipped" so the Notebook becomes ready. | Readiness was meant to reflect human review. | Skip is a human-gesture command. | [H](specs/H-notebook.md) |
| L-06 | The agent types a "typed copy" for a disputed handwritten page. | The typed copy was meant to be a human's. | Typed copy entry is a human-gesture command, and the typist is recorded. | [G](specs/G-ocr-document-intelligence.md) |
| L-07 | The agent drops a file in the inbox with a fabricated capture record. | ULOS-N would accept a forged portal capture. | Capture records are created only by the download interceptor in the browser supervisor and the kernel. A capture record proposed by the harness is refused. | [F](specs/F-capture-ingest.md) |
| L-08 | A fixture source answers in production and everything is `verified`. | Verification never touched the court. | The production build refuses fixture endpoints, and every record carries the endpoint it used. | [U](specs/U-ulos-validator.md) |
| L-09 | On a compare-and-swap conflict the agent rebases its edit onto the new head and commits. | A silent merge, which RQ-27 exists to prevent. | A rebased agent edit is a new proposal the advocate must accept. | [J](specs/J-documents-editors.md) |
| L-10 | Limitation is "confirmed" by a click on a date. | The advocate confirmed a number, not the computation. | The confirmation shows every input date, every excluded period and the rule source, and records the shown values. | [K](specs/K-verification-adapter.md) |
| L-11 | An advisory score is pasted into a ground as prose. | Scores must never reach a filing. | The draft consistency check refuses text matching a stored score's statement, and scores cannot be anchored. | [I](specs/I-research-studio.md) |
| L-12 | "Bench trends" are computed by individual judge. | RQ-35 forbids judge-level forecasting. | The score feature schema has no judge identifier field, and a test fails if one is added. | [I](specs/I-research-studio.md) |
| L-13 | The advocate attests an unresolved citation, and the disclosure lists it as verified. | Attestation is not verification. | The disclosure renders attestations in their own section, from their own record type. | [L](specs/L-filing.md) |
| L-14 | The verification adapter computes a result itself when `ulos` is slow. | P3, one validator. | The adapter has no check code. A verification record without a `ulos` binary hash is refused at append. | [K](specs/K-verification-adapter.md) |
| L-15 | The two OCR engines are given the same pre-processed image by a shared step that introduces the same error. | Agreement means less when both engines inherit one mistake. | Each engine receives the pdfium raster directly. Pre-processing is per engine and recorded. | [G](specs/G-ocr-document-intelligence.md) |
| L-16 | A reverted agent edit is deleted from history. | RQ-27 says nothing is rewritten. | A revert is a new revision. The DAG is append-only, checked by a test. | [C](specs/C-kernel.md) |
| L-17 | A quick-check `found` is shown as a green badge, or copied into a verification record, so a citation looks verified without the portal. | Only the portal, through `ulos`, verifies. | Quick-check results are their own record type with their own vocabulary and a distinct label. The kernel refuses them as verification records, and the gate mapping ignores them. | [I](specs/I-research-studio.md), [K](specs/K-verification-adapter.md) |

## 10. Failure modes the docs did not cover

Each is now specified in the spec named.

| Failure | Spec |
|---|---|
| Disk full during a blob write or a ledger append | [C](specs/C-kernel.md) |
| `matter.db` corruption, and ledger hash-chain break detection | [C](specs/C-kernel.md), [E](specs/E-stores.md) |
| A matter folder moved, renamed or deleted while the application is open | [A](specs/A-shell-workspace.md) |
| Clock changes and time zones (all record times UTC, display in IST) | [C](specs/C-kernel.md) |
| The harness process crashes during an effect | [D](specs/D-harness.md) |
| Model provider outage, rate limit, or budget exhausted mid-turn | [D](specs/D-harness.md) |
| Prompt injection from page text, email bodies or document text | [D](specs/D-harness.md), [M](specs/M-browser.md), [F](specs/F-capture-ingest.md) |
| An OCR process hangs, or a malformed scan crashes it | [G](specs/G-ocr-document-intelligence.md) |
| Encrypted or password-protected PDF or DOCX, macro-bearing attachments | [F](specs/F-capture-ingest.md) |
| A very large record (over 1,000 pages in one file) | [G](specs/G-ocr-document-intelligence.md) |
| CAPTCHA abandoned or timed out | [F](specs/F-capture-ingest.md) |
| The portal changes its HTML | [F](specs/F-capture-ingest.md) |
| India Code changes its response shape | [U](specs/U-ulos-validator.md) |
| WordCraft crashes with unsaved edits | [J](specs/J-documents-editors.md) |
| An approval is abandoned, or the advocate walks away mid-filing | [L](specs/L-filing.md) |
| The payload changes between confirmation and submission | [L](specs/L-filing.md) |
| The same party names appear in two unrelated cases | [U](specs/U-ulos-validator.md) |
| Devanagari and mixed-script normalisation for quote matching | [U](specs/U-ulos-validator.md) |
| A revert of an early agent edit that later edits depend on | [J](specs/J-documents-editors.md) |

## 11. Open questions

These remain. Each says what the working decision is.

| ID | Question | Working decision until answered |
|---|---|---|
| OQ-01 | RQ-78 and call C-2: is WordCraft "vendored source, hosted process, reparented" what you meant by "full editor vendored from WordCraft"? | Yes, as in X-01. |
| OQ-02 | Settled 4 November 2026. May citation verification use the AWS open-data catalogue of Supreme Court judgments? | The AWS catalogue may be used for Research Studio and the quick check. It is not part of the ULOS standard, and the validator does not use it. |
| OQ-03 | Which engine renders the approved DOCX to the filing PDF: WordCraft's engine, or Word through COM when installed? | WordCraft's engine. Word is a comparison oracle in the fidelity test. |
| OQ-04 | The `01-01-1900` placeholder still appears in portal case-status dates. Keep a one-line importer rule that reads it as unknown? | Not built, as directed. The importer passes the value through and the chronology shows it verbatim. |
| OQ-05 | Should blobs be encrypted at rest for confidentiality, now that erasure no longer needs it? | No. Rely on the operating system's disk encryption. |
| OQ-06 | Is the AI-use disclosure a required part of every filing package? | Yes, so RQ-14 blocks filing. |
| OQ-07 | Your note "irrelevant only INSC" sat between RQ-61 and RQ-63. It is read as RQ-59 (pre-2023 citations). Correct? | Yes. RQ-62 stays at the Kept recommendation. |
| OQ-08 | Does an advocate attestation of an unresolved citation unblock filing? | Yes. The disclosure lists it as advocate-attested. |
| OQ-09 | Does an amended section with no attestation block like a citation? | Yes, through "Blocked pending legal review". |
| OQ-10 | "Current bench trends": which features may an advisory score use? | Subject category, bench strength, disposal type and period. No judge identifier. |
| OQ-11 | Is the embedding model local or remote? | Local, so client text does not leave the machine for indexing. |
| OQ-12 | Retention of the harness session store after a matter closes. | Kept with the matter folder. Deleted with it. |
| OQ-13 | Which email providers does the connector support first? | One IMAP-compatible path, read only. |
| OQ-14 | May client text be sent to remote model providers at all, and under which confidentiality labels? | Per-matter setting, default allowed for providers the advocate configured, refused for matters labelled restricted. |
| OQ-15 | Settled with OQ-02. What is the source of Research Studio's judgment search index? | Judgments the matter has captured, plus the AWS catalogue. Research results are never verification. |
| OQ-16 | The visual design of the window: palette, type, spacing, icons, and whether open documents get workspace tabs. | The region model in PH-05 is settled. The look uses the theme tokens of spec A with neutral defaults. No workspace tabs. |
| OQ-17 | Where does an unresolved critical OCR dispute block? Candidate: the harness context marks disputed spans, and a draft paragraph anchored to a disputed span blocks approval of that revision. | The harness context marks every disputed span as disputed (D). The approval gate does not yet block on it. Revisit before K is integrated. |

## 12. Phase 2 decisions

| ID | Decision | Spec |
|---|---|---|
| PH-01 | **The kernel decides the origin from the connecting process.** A pipe connection is never `capture` or `test`. `capture` exists only inside the kernel process, for the browser supervisor. A connection is `ui` only when the connecting process image is the installed `oa-shell` executable beside the kernel's own executable. Any other claim of `ui` is recorded as `cli`, which keeps the user-presence prompt (H-09). A process in the harness job is `harness` whatever it claims. The harness job kills its processes when the job closes. | [B](specs/B-control-surface-cli.md) |
| PH-02 | **One kernel per application data folder.** `oa` connects to a serving kernel when one answers. It starts an in-process kernel only when none is serving. A second kernel on the same folder refuses to start. Matter writes take the SQLite write lock at the start of the transaction. | [B](specs/B-control-surface-cli.md), [C](specs/C-kernel.md), [E](specs/E-stores.md) |
| PH-03 | **The control contract is its own crate.** The request and reply types, command classes, input types and the list of query names live in `oa-protocol`. The window and the client library depend on it and not on the kernel. A build check fails if `oa-shell` depends on `oa-kernel`, `oa-store` or `rusqlite`. | [B](specs/B-control-surface-cli.md), [A](specs/A-shell-workspace.md) |
| PH-04 | **The window draws a screen.** One data shape, the screen, says what the window shows. Navigation history, saved layouts per matter and gallery fixtures are screens. The window derives everything it draws from the screen and from query results. | [A](specs/A-shell-workspace.md) |
| PH-05 | **The window has three regions and no status bar.** From left to right: the left pane (collapsible), the chat pane (the orchestrator), and the view pane (most of the width, one to three splits). Collapsing the view pane makes the chat pane the rightmost pane. Collapsing the left pane gives its width to the others. The Inspector is a drawer over the view pane. Connection and process health sit in the left pane header. The visual design is OQ-16. | [A](specs/A-shell-workspace.md), [D](specs/D-harness.md) |
| PH-06 | **Full integration, no stubs.** Every production path uses the real dependency. A stand-in is allowed only as a test double behind a seam that has a real adapter, and a production build refuses it. Vendoring order: pdfium, then Tesseract and PaddleOCR, each with contract tests; then the document viewers; then Chromium; then WordCraft, PdfCraft, the DOCX writer and the PDF/A validator. | [Q](specs/Q-build-ship.md), [G](specs/G-ocr-document-intelligence.md), [J](specs/J-documents-editors.md), [M](specs/M-browser.md) |
| PH-07 | **The validator comes last.** `ulos` is built in its own repository. The verification adapter (K) and filing (L) are integrated after every other group. Until then every verification state is `unavailable`, which blocks, and nothing is shown as verified. | [K](specs/K-verification-adapter.md), [L](specs/L-filing.md), [U](specs/U-ulos-validator.md) |
| PH-08 | **One copy of each fact.** The document order is the table at the top of this file. The workflow exists only in advocate-workflow.md. Build status lives in the specs, next to each test. The question history and the phase 1 build reports are archived. | [specs/README.md](specs/README.md) |
| PH-09 | **Five kinds of test, each with a status.** Every spec lists its acceptance criteria, GUI tests, visual tests, end-to-end tests and, for a vendored dependency, contract tests, each marked `done` or `remaining`. A criterion is `done` only when its test passes against the real dependency. | [specs/README.md](specs/README.md) |
| PH-10 | **One internal UI module.** The window draws through its own small module of theme tokens and widgets. No third-party widget kit is a dependency. Tables use virtualised rows. GUI tests drive views by AccessKit role and name. | [A](specs/A-shell-workspace.md) |
| PH-11 | **DOCX is in the first release.** The DOCX working format, the hosted WordCraft editor and PDF/A filing are first-release scope. | [J](specs/J-documents-editors.md) |

## 13. Ideas adopted from the Macro reference

The Macro workspace was studied for workspace, UI and agent flow. Macro is AGPLv3, so it is a design reference only (verdict REF). No code is taken, and no file of it may be copied into this repository.

| ID | Idea in the reference | Adopted as | Spec |
|---|---|---|---|
| M-01 | Nearly every frontend feature ships a debug view and a fixture gallery beside it. | P9 and the Inspector (A16). Every pane has a gallery of fixture states for visual review (A17). | [A](specs/A-shell-workspace.md), [P](specs/P-observability.md) |
| M-02 | A built-in window manager with three or more splits that scale with the monitor, with navigation history. | The pane layout (A02) supports at least three splits, back and forward history, and a saved layout per matter. | [A](specs/A-shell-workspace.md) |
| M-03 | One keyboard-first inbox for every kind of item, split into Signal and Noise, with `j`, `k` and `e`. | The review inbox (A08) is split into Signal and Noise and is fully keyboard operable. | [A](specs/A-shell-workspace.md) |
| M-04 | A Cmd+K launcher that classifies intent and ranks by frecency. | The command bar (A09) searches commands, matters and records, ranked by frecency, and only ever issues registered commands. | [A](specs/A-shell-workspace.md) |
| M-05 | Every reference is stored as a bidirectional link, so any record shows what points at it. | A link index (C17), derived from the ledger, answers backlinks for every record. | [C](specs/C-kernel.md) |
| M-06 | One query service returns many entity kinds through one filter language. | `oa find` searches every record kind through one filter, and the GUI search box uses it. | [E](specs/E-stores.md) |
| M-07 | A runtime forwarding a user's prompt can never use that identity to approve its own permission. Human approvals are absent from the agent's tools. | Confirms rule 4 of spec B and X-19. A forwarded instruction cannot claim the advocate asked for something. | [D](specs/D-harness.md) |
| M-08 | Recovery revokes an abandoned runtime's claim by incrementing a fence, so the old actor can never append again. | Session lease and fence (D18). | [D](specs/D-harness.md) |
| M-09 | One tool result never crowds the model out: the model sees a preview and a paging tool, while the log keeps the whole result. | Tool-result limit and paging (D19). | [D](specs/D-harness.md) |
| M-10 | A view of sessions waiting on their owner: blocked on an interaction, or stalled. | "Waiting on you" in the chat pane and as Signal in the inbox. | [D](specs/D-harness.md) |
| M-11 | Durable action history: evidence that an instruction reached the session, and how it ended, separate from the transcript. | The session store records each instruction's delivery and outcome. | [D](specs/D-harness.md) |
| M-12 | Lifecycle facts (opened, turn started, turn ended, waiting) are published apart from the commands that drive a session. | The outbox carries lifecycle facts on their own topic. | [D](specs/D-harness.md) |
| M-13 | Memory stored as plain markdown the user can read, export and correct. | Matter memory: the orchestrator's notes are a markdown file the advocate can read and edit, with every edit attributed. | [D](specs/D-harness.md) |
| M-14 | A from-scratch DOCX engine with stable ids on every block, that writes back any XML it does not interpret unchanged, and a corpus CLI. | Requirements on the WordCraft engine (J05): stable ids on every block, uninterpreted XML preserved, and a corpus regression run. These sharpen H-02. | [J](specs/J-documents-editors.md) |
| M-15 | One shared Changes viewer for pull requests, agent sessions and previews, with review notes anchored under lines, read only unless the host grants the agent capability. | One Changes viewer (J15) for agent proposals, WordCraft saves and restores, with notes anchored to paragraph ids. | [J](specs/J-documents-editors.md) |
| M-16 | A development status bar and a hotkey debugger. | Superseded by PH-05: there is no status bar. Connection, the decided origin and the health of every supervised process show in the left pane header and open the services view. | [A](specs/A-shell-workspace.md) |

Ideas studied and not adopted: CRDT live collaboration (one advocate, one machine), team-level nightly memory across users (no multi-user scope yet), channels and email sending (spec O has no sending path), and hosted model routing (D03 keeps the router local).
