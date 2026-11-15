# Assessment: the eight knowledge layers (parked)

Date: 2026-11-15. Status: **parked** ([../../docs/parking.md](../../docs/parking.md)). It enters the plan only when the owner moves it into a phase (lesson L6). It is kept apart from the harness work so that the harness does not depend on it.

Sources: the LangChain, Anthropic and munder-difflin pages listed in [2026-11-15-harness-lessons-and-knowledge-layers.md](2026-11-15-harness-lessons-and-knowledge-layers.md) section 1.


The owner asked to explore and decide. The stores and the graphs are frozen (decisions 12 and 13, [architecture.md](../../docs/architecture.md) sections 3, 4 and 6). So each layer below maps to an existing owner, and the open choice is the retrieval method. Retrieval methods:

- **Records**: typed rows, read by id and filter.
- **FTS5**: SQLite full text (G4/G5).
- **Vectors**: a local embedding model through ONNX Runtime (G6; the sqlite-vec spike is open).
- **Graph**: SQLite edge tables, walked by a recursive query (decision 13).
- **Compiled pages**: a derived, rebuildable page per subject, written by a model, where each statement carries its anchor and the hash of the source lines. When a source changes, the hash flags only the affected statements (the OpenWiki pattern). This fits decision 13 (derived, owns nothing) and architecture section 5 ("a summary never replaces a source; it carries the anchors").

| Layer | Owner (frozen) | Holds | Retrieval | Written by, approved by | Notes |
|---|---|---|---|---|---|
| 1. Advocate memory | `advocate.db` (F2, G3) | Preferences, corrections, repeated instructions, rejected approaches, lessons | Records (by type, scope) + graph (prefers, rejected, supersedes). No vectors needed: the set is small | Proposed after a run (F6); the advocate confirms | Loaded into every context package with "applied because" (A7). |
| 2. Firm knowledgebase | `advocate.db` Knowledge Library (M1, M2) | What the advocate uploads: templates, memos, workflows, playbooks, pleadings, submissions, checklists, approved positions, with precedent status | FTS5 + vectors + metadata filter (court, case type, status) → hybrid (G7). Compiled pages for playbooks | Imported (A5); precedent status set by the advocate | Owner, 2026-11-15: an advocate runs a firm; a solo practitioner is a firm too. So the firm knowledgebase is the one advocate's Knowledge Library (M1), and the Firm Agent reads it. |
| 3. Statute intelligence | `corpus.db` (E7, G1) | Bare acts by version, sections, amendments, commentary passages, propositions | Records by act, section and date in force (decision 16) first; FTS5; graph (amended by, in force from, interprets); vectors only to find candidate sections | Fetched from sources with retrieval dates | Commentary is secondary (P2); never ranked above the section. Compiled pages per section ("section notes") with claim hashes suit this layer. |
| 4. Jurisdictional and procedural | `intel.db` (B1 to B17) | Court packs: rules, forms, fees, limitation rules, holidays, drafting formats | Records only: by court, case type, date. No vectors: a rule must be the exact row, with its freshness | Source rows with `valid_from`, `valid_until`, `checked_by` | A stale row gives "unconfirmed" (decision 16). Retrieval must never "guess" a rule by similarity. |
| 5. Matter intelligence | `matter.db` (F1, matter evidence graph) | Parties, events, dates, documents, pages, facts by source kind, admissions, disputes | Records + graph (supports, contradicts, admits) + FTS5 over the matter's text; vectors scoped to the one matter | Extracted with anchors; the advocate confirms facts | No cross-matter retrieval of facts (architecture section 6). |
| 6. Research intelligence | `corpus.db` (judgments, treatments, propositions) and `matter.db` (research items for the matter) | Precedents, treatment edges, propositions with supporting and adverse passages | Hybrid (G7): FTS5 + vectors + graph walk (cites, follows, overrules) + rerank by authority and date (architecture section 5, step 3) | Research runs propose; the citation validator verifies (R-4) | The best fit for compiled pages: a proposition page with its passages and hashes. Matches the OpenWiki result that pages help on connected questions, not on simple lookups. |
| 7. Per-matter orchestrator memory | The Pi session files per matter (decision 7) + `matter.db` (plan, tasks, decisions) | The run plan, checklist, progress, helper results, handoff notes | Pi session tree and compaction; the matter brief (B-I1); the handoff note (B-I3); the run trace (B-I2) | The harness writes; memory proposals go to the Review Inbox | Agent activity stays in the Pi session; case facts stay in the store (decision 7). |
| 8. Unified memory for the main agent | No new store. The context package builder (I1) over layers 1 to 7, with the scope check first (Q2) | — | One retrieval function (G7) with ranking policies by question type | — | A single "unified memory" store would break decisions 12 and 13. Unity comes from the one builder and the shared ids. |

Compiled pages as a derived index for layers 3 and 6 are parked with this assessment.

