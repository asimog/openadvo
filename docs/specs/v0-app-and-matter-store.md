# v0 spec: application skeleton, matter store and dropped files

Step 1 of [../build-plan.md](../build-plan.md). Serves workflow sections 2 and part of 3.

**Input.** PDF files the advocate drops into a matter.

**Output.** A matter folder that holds `matter.db`, each file stored once under its SHA-256 (`blobs/<sha256>`), and an append-only event table. Each event records who (advocate, agent or system), what (action and subject), when (UTC time), and the Pi session id when the agent was involved.

**Rules.**

1. Single writer. Only the matter store module writes matter facts, and only `src/main/matters.ts` calls it.
2. Same bytes are stored once. A second drop of the same bytes adds an origin to the existing source, not a new source.
3. Nothing is deleted, only marked. Database triggers refuse `UPDATE` and `DELETE` on the event table.
4. A missing or changed file is reported, not hidden. When a matter opens, every blob is hashed again. A missing blob shows status `missing`; a blob with other bytes shows `changed`. Each finding writes one event.
5. The agent has no tool that writes to the matter store. Its only tool is `list_sources`. A session has exactly the tools on our allowlist.

**Surfaces.**

- One window with three fixed panes, left to right: matters and sources; view; chat. Panes resize (`react-resizable-panels`).
- Bridge functions: `createMatter(title)` and `addFiles(matterId, paths)`. Queries: `listMatters`, `listSources`, `listEvents`. Chat: `sendChat(text)` and a chat event stream.
- One agent tool: `list_sources` (the open matter's sources: name, SHA-256, size, status).
- The chat pane shows one Pi session for the open matter.

A file that is not a PDF (by its first bytes, `%PDF-`) is refused with a visible message. It is not stored.

**Not in v0.** Hash chain, signatures, schema standard, clients, search, graph, sync, draggable tabs, the editor, OCR. Also not in v0 (see [../parking.md](../parking.md)): chat history after restart, model picker, API key entry, matter rename.

**Proof task.** The owner creates a matter, drops the PDFs of one real brief, asks the agent "list the sources", closes and reopens the application, and sees every source with its hash. A file dropped twice shows one source.

**Tests.** Unit tests of the matter store (`tests/unit/`). Playwright tests against the built application (`tests/e2e/`): create a matter, add files, duplicate drop, restart, missing and changed blob, renderer isolation, agent tool allowlist.
