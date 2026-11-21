# Module audit: greenfield reports

Status: architecture review, 20 November 2026. These reports describe the current module, the problems that matter for a greenfield design, and the target contract. They do not change code.

The reports use the code as the evidence. A feature is **implemented** when an end-to-end path exists and is used by the product; **partial** when it works for a subset; **emergent** when several modules produce the behaviour but no module owns it; **library-only** when code and tests exist but no product path uses it; **missing** when there is no path.

## Reports

| File | Module | Current maturity | Main design question |
|---|---|---|---|
| [00-systems-design.md](00-systems-design.md) | Whole application | Strong modular monolith, boundary erosion | How to extract services without a rewrite |
| [01-matter-proceeding-classification.md](01-matter-proceeding-classification.md) | Matter, proceeding, classification | Matter implemented; proceeding emergent; classification partial | What is a matter, what is a proceeding, and how is each identified |
| [02-research-studio.md](02-research-studio.md) | Research Studio | Implemented, panel-heavy | Is the Studio a workspace or a bundle of tools |
| [03-browser.md](03-browser.md) | Built-in browser | Implemented, security-conscious | How to bind a browser session to a matter without losing isolation |
| [04-court-adapters.md](04-court-adapters.md) | Court adapters and directory | Framework implemented, three courts | Where the technical adapter ends and the legal rule begins |
| [05-workflow-builders-automation.md](05-workflow-builders-automation.md) | Workflow, builders, triggers, integrations | Fragmented | How many workflow models should exist |
| [06-skills.md](06-skills.md) | Skill library and runner | Implemented, 140 skills | How to scope and test a skill without a pack |
| [07-rag-legal-research.md](07-rag-legal-research.md) | RAG, law store, judgments, citations | Implemented, partial coverage | How to retrieve, verify and date legal authority |
| [08-agent-runtime.md](08-agent-runtime.md) | Agent runtime and harness | Implemented, god module | How to keep one runtime while splitting 87 tools |
| [09-documents-ocr.md](09-documents-ocr.md) | Documents, ingest and OCR | Implemented for five formats | How to add formats and queues without touching evidence |
| [10-evidence-notebook.md](10-evidence-notebook.md) | Evidence and Notebook | Implemented, matter-scoped | How to make evidence a proceeding-aware service |
| [11-drafting-editor.md](11-drafting-editor.md) | Drafting and document editor | Implemented, matter-scoped | How to generate, check and approve without a second gate |
| [12-filing-portal.md](12-filing-portal.md) | Filing, manifest and portal | Implemented, strong integrity | How to make filing depend on procedure, not a pack |
| [13-memory-knowledge-library.md](13-memory-knowledge-library.md) | Memory, library and precedents | Implemented, two memories | What is a note, what is a memory, what is a precedent |
| [14-permissions-audit.md](14-permissions-audit.md) | Permissions, audit and provenance | Strong single-user, gaps | How to fail closed and prove every legal decision |
| [15-storage-mail-contacts-identity.md](15-storage-mail-contacts-identity.md) | Storage, mail, contacts and identity | Implemented, pragmatic | How to make email a communication record and identity a principal |

## Reading order

1. Read `00-systems-design.md` for the whole-application boundary and the risk register.
2. Read `01-matter-proceeding-classification.md` for the domain model. Most modules depend on it.
3. Read the module report for the capability you are about to change.
4. Read `14-permissions-audit.md` before any change that writes a legal record.

## The common template

Each module report has:

1. **Scope and current owner.** The files and data the module owns.
2. **Current inventory.** What is implemented, partial, emergent, library-only or missing, with evidence.
3. **Current flow.** How data moves through the module.
4. **Problems.** Verified defects, design concerns and boundary risks.
5. **Greenfield target.** The entities, services, contracts and states.
6. **Boundaries.** What the module owns, what it consumes and what it must not do.
7. **Migration.** The smallest safe path from the current code.
8. **Acceptance tests.** Measurable tests for the target.
9. **Recommendation.** Keep, refactor, replace or build.

## Cross-module rules

These rules apply to every report.

- One capability, one service, one data owner.
- A service calls another service's contract. It does not read another service's tables.
- The bridge calls services, not stores.
- The agent calls tools that call services, not stores.
- A legal decision is recorded with an actor, a time, a reason, a source and a version.
- Unknown is a valid result. A resolver never returns the closest match.
- A rule is not a checklist, a pack, an adapter or an agent summary.
- A confirmed record is superseded, not overwritten.
- A repeated command has an idempotency key or a documented reason it is not idempotent.
- The advocate decides every legal point.

## What these reports do not do

- They do not reopen the accepted decisions in `docs/decisions.md`.
- They do not prescribe a rewrite.
- They do not replace the owning specs. They are the architecture input for those specs.
- They do not claim a full test run. The code, schemas and tests are the evidence.
