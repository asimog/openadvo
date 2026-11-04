# Open Advocate architecture

Open Advocate is an agent-operated litigation workspace for Indian advocates, built as one Rust desktop application. This document states the shape of the system. What is settled, and why it governs, is in [decisions.md](decisions.md). The workflow the system serves is in [advocate-workflow.md](advocate-workflow.md). The parts list is [component-map.md](component-map.md), and each group's implementation contract is in [specs/](specs/README.md).

## Principles

| ID | Principle |
|---|---|
| P1 | **CLI first.** Every capability is a set of typed control commands, usable from `oa` before it has a pane. |
| P2 | **The kernel writes the record.** Everything else proposes. |
| P3 | **One validator.** `ulos` is deterministic, has no model, and is a separate binary. The verification adapter builds its input and maps its output. Only the Supreme Court portal, through `ulos`, verifies a citation. The AWS catalogue serves research and the quick check only. |
| P4 | **Verification is mandatory and online.** An unreachable source gives `unresolved`, which blocks. |
| P5 | **Only court public records are verified.** Client-supplied files are tagged and never verified. |
| P6 | **Legal judgement stays with the advocate.** Voice, treatment, limitation, amended-section versions and self-verification are recorded human decisions. |
| P7 | **Vendor the source, run it separately.** pdfium, the OCR engines, Chromium, WordCraft and PdfCraft are vendored in our tree. Heavy and hostile-input work runs in supervised processes. |
| P8 | **DOCX is the working format. PDF/A is the filing format.** Drafting and verification happen on DOCX. The approved DOCX is converted to PDF/A, the conversion is checked against the DOCX, and the PDF is never edited. |
| P9 | **Everything is inspectable.** The GUI and the CLI are two front ends of the same commands. Every query has a view, and every item opens the Inspector. |

Phase 2 adds three rules to these (decisions PH-06, PH-07, PH-09):

- **Full integration.** Every production path uses the real dependency. Test doubles live only in tests.
- **The validator comes last.** Until `ulos` is integrated, every verification state is `unavailable` and blocks.
- **Status sits beside the test.** A capability is done when its tests pass against the real dependency.

## Authority: brain, hands, session and record

| Part | Role | Owner |
|---|---|---|
| Brain | The model and the harness. Reasons, plans, coordinates. One orchestrator per matter; sub-agents are task configurations inside the same harness. | Harness (D) |
| Hands | Tools and execution environments: OCR, browser, editors, the validator. Each reports its own failures. | Capability groups |
| Session | The harness's durable, private record per matter: turns, effect intents, traces. Used for recovery and replay. Not canonical. | Harness (D), `harness/session.db` |
| Record | The canonical, hash-chained ledger and the records it governs. Never held in a model's context. | Kernel (C), `matter.db` |

1. A failed tool is a tool failure. It never silently destroys the task.
2. The harness recovers from its session store, not from process memory.
3. The session is not the model's context. The harness assembles context per call and records a manifest.
4. Credentials never reach an untrusted execution environment. Access is through narrow capabilities.
5. One harness coordinates every tool. No tool gets its own agent runtime.
6. The harness proposes. Only the kernel commits, through one commit path, with an idempotency key on every change.

## Processes

| Process | Role | Started by |
|---|---|---|
| Window (`oa-shell`) | The egui and winit window. Draws screens from query results. Holds no canonical state. | The advocate |
| Kernel (`oa kernel serve`) | Single writer of canonical state, control protocol endpoint, supervisor of every other process. One per application data folder. | The window, when no kernel answers; or `oa` |
| Harness | The agent loop. Runs in a Windows Job Object, so every process it starts is identified as `harness`. | Kernel |
| OCR, one per engine | Tesseract and PaddleOCR, each fed pdfium rasters | Kernel |
| Browser, one per profile | Chromium. Matter profiles, the filing profile, the agent's headless profile. | Kernel |
| WordCraft, PdfCraft | Hosted editors, reparented into the view pane | Kernel |
| `ulos` | The validator, run per verification | Verification adapter |

The control protocol is a local named pipe that accepts only local clients and only one server. Every connection's origin is decided by the kernel from the connecting process: `harness` for any process in the harness job, `ui` only for the installed window executable, `cli` otherwise. `capture` exists only inside the kernel process (PH-01). `human` class commands are refused to `harness`, need a deliberate gesture from `ui`, and need an operating-system user-presence prompt from `cli`.

The request and reply types are their own crate, `oa-protocol`. The window and the client library depend on it, not on the kernel (PH-03).

## Storage

| Store | Where | Owner |
|---|---|---|
| Canonical record: ledger, evidence entries, Notebook, drafts index, approvals, filing payloads, search and vector indexes | `<matter>/matter.db` | Kernel |
| Source bytes and draft revisions | `<matter>/blobs/` | Kernel |
| Harness session store | `<matter>/harness/session.db` | Harness |
| Matter index, rebuildable from the folders | `<app data>/registry.db` | Kernel |
| Firm data | `<app data>/firm.db` | Kernel |
| Secrets | OS keychain | Kernel |

A matter is a folder. Removing the folder removes the matter. Matter writes take the SQLite write lock at the start of each transaction, and the ledger sequence is the primary key, so the hash chain cannot fork.

## The window

The window draws a **screen** (PH-04): which matter is open, which panes are collapsed, and what each view split shows. History, saved layouts and gallery fixtures are screens.

```
+-----------+-------------------+------------------------------------------+
| Left pane | Chat pane         | View pane (1 to 3 splits)                |
|           |                   |                                          |
| kernel ok | Orchestrator      | Table view, document viewer, edit        |
| Matters   | transcript, plan, | surface, WordCraft, browser, files       |
| Sections  | tool cards,       |                                          |
| Inbox (3) | instruction box   |                    [Inspector drawer] -> |
+-----------+-------------------+------------------------------------------+
```

- **Left pane**, collapsible: connection and process health in its header, matters, the open matter's sections, the review inbox.
- **Chat pane**: the one orchestrator. It follows the open matter and never mixes two matters in one run. When the view pane is collapsed, the chat pane is the rightmost pane.
- **View pane**: most of the width, one to three splits, each with its own back and forward history.
- **Inspector**: a drawer over the view pane. Every item in every view opens it.
- **Command bar**: reaches every registered command and record from the keyboard.
- **No status bar.**

The look is open (OQ-16). The window draws through one internal UI module of theme tokens and widgets (PH-10).

## Integration requirements

| Requirement | Test form |
|---|---|
| The harness operates the whole application, not one pane. | Every capability's commands are reachable as harness tools, subject to grants. |
| Shared resource identity. A document, revision, page or passage means the same thing to every component. | Every cross-capability handoff passes an anchor or id, never copied text. |
| Explicit capability limitations. | Each adapter has a capability manifest, and every claim is gated against it at runtime. |
| Human supervision throughout. | Every stage has review states in the inbox, and the advocate can redirect at each. |
| Workflow-specific state machines. | The SLP workflow is a playbook file run by one interpreter. |
| Source-backed, versioned procedural rules. | A matter pins its rule pack version. |
| Explicit verification outcomes. | Four validator outcomes with reason codes, mapped to six gate states. An attestation is never `verified`. |
| Source traceability. | `oa trace <draft-anchor>` ends at a blob hash and a page region for every factual paragraph. |
| Recovery, not memory. | Kill tests at every effect boundary resume without a duplicate effect. |
| An integration proof. | The provider swap drill replaces one OCR engine with the other and the workflow continues unchanged. |

## Composition

Small tools that each do one thing, composable from a shell, joined by thin adapters that translate and do not hold business logic. Each library has a CLI or exerciser so it can be tested without the window. Composability does not force identical interfaces: each component keeps its own capabilities and declares its limits.

## The ULOS standard

The Uniform Legal Ontology Standard ([ULOSarchitecture.md](ULOSarchitecture.md)) is the contract the verification adapter and the validator share. It is ours and simulated, because no court standard exists, but its checks run against court sources.

- ULOS-L: the cited Act and section exist in India Code, are not repealed, and match the cited number and year.
- ULOS-C: a neutral citation names a real Supreme Court judgment, and the one the draft names.
- ULOS-CI: the cited paragraph exists, the quote occurs in it, and the pinpoint is not a headnote.
- ULOS-N: the Notebook holds the correct impugned judgment and orders, captured from the portal.

The standard owns no canonical state. The kernel owns the matter, permissions, approvals and commits. The validator is built separately and integrated last (PH-07).

## Build order

Each step lands as `oa` commands first, then its view, with its tests in the spec.

| Step | Work | Specs |
|---|---|---|
| 1 | Control surface: kernel-decided origin, one kernel per folder, the contract crate | B, C, E |
| 2 | The window: screen, three regions, UI module, GUI and visual tests; the chat pane on a scripted provider | A, D |
| 3 | A live model provider, injection guards, disputed-span marking | D |
| 4 | Vendor pdfium, Tesseract and PaddleOCR with contract tests; OCR on real engines | Q, G |
| 5 | Document viewers on pdfium; ingest end to end | J, F |
| 6 | Vendor Chromium; browser in the view pane; live portal capture | Q, M, F |
| 7 | Vendor WordCraft, PdfCraft, the DOCX writer and the PDF/A validator; hosted editing and filing PDF/A | Q, J |
| 8 | Notebook writers, firm data backup, keychain, observability drills, packaging | H, O, E, P, Q |
| 9 | Research Studio | I |
| 10 | The validator and the verification adapter | U, K |
| 11 | Filing | L |
| Later | Computer use and desktop apps | N |
