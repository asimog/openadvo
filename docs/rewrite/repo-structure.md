# Repository structure — deliverable G

Status: **proposed plan, presented for acceptance** (stage 6). The tree follows the ownership map ([boundaries.md](boundaries.md)); a folder exists only when its phase starts (lesson L1: no empty folders for imagined futures). This is a **modular monolith of ordinary folders** — no packages, no workspaces, no dependency-injection container. Import rules are enforced by the structural test suite, not by convention.

## 1. The tree

```
openadvo/
  src/
    foundation/                  ids, actor & scope, typed references, clock,
                                 result envelope, the event chain, capability types
    domains/
      advocate/                  identity, profile, preferences (single advocate, DQ-2)
      matter/                    matters, clients, instructions, parties, assignments
      proceedings/               proceedings, case & diary numbers, hearings, orders
      courts/                    directory, case types, stages, limitation — versioned data
      documents/                 registration, versions, pages, anchors, processing state
      evidence/                  evidence records, provenance, integrity, relations
      facts/                     facts, decisions, contradictions, the timeline
      drafting/                  drafts, revisions, validation (phase 7)
      filing/                    filing sets, checks, confirmations (phase 10)
      work/                      tasks, deadlines, review items (phase 8)
      research/                  corpus, authorities, propositions (phase 11)
      (each domain: records.ts, rules.ts, operations-ports.ts, store.ts, queries.ts, tests)
    application/
      operations/                one file per named operation; *.schema.ts = contract source
      catalog/                  capability declarations, assembled; derivations for sessions/skills
      policy/                   fail-closed tool policy; corrupted source = deny (R-10)
      scope/                    actor & scope construction (DQ-1)
      intake/                   content-assisted classifier with cited proposals (DQ-8)
      workflows/                workflow execution, run states, reconciler (DQ-4 legal side)
      agent/                    the AgentExecution interface; engine adapter lives here
    interfaces/
      cli/                      commands (one per operation surface), output, confirmations
      desktop/                  electron main, preload (generated), renderer
      agent/                    tool views over the catalog — declarations only
    infrastructure/
      stores/                   per-matter SQLite, app store, intel store, corpus store
      blobs/                    content-addressed store, write-once, re-hash on read
      ocr/                      Tesseract + ONNX pipeline (writes through documents)
      pdf/                      extract, split, merge — each writing a new source
      llm/                      model providers (LangChain packages), scripted test model
      browser/                  built-in browser; shared surface with guards (DQ-7)
      court-portal/              per-matter partitions (DQ-7); human-only submission (DQ-6)
      court-adapters/           adapter data + fetchers, hosts-whitelist, https only
      search/                   derived indexes, one rebuild command each
  tools/
    gen-contracts.ts            generates preload + bridge + OpenAdvoApi from *.schema.ts (R-13)
  tests/
    unit/                       domain behaviour
    structural/                 import boundaries, contract divergence, capability coherence,
                                 fail-closed policy, scope isolation, recovery states
    e2e/                        CLI and desktop against real temp homes
  docs/
    rewrite/                    this series
```

## 2. Ownership of each layer

| Folder | Owns | Never does |
|---|---|---|
| `foundation/` | Types and the chain mechanism | Hold a business rule; import anything above it |
| `domains/*` | Its records, rules, tables, query ports | Import Electron, the agent framework, or another domain |
| `application/` | Named operations, catalog, policy, scope, workflows, agent interface | Contain a domain rule that belongs to a record's owner |
| `interfaces/*` | Parsing, rendering, confirmation | Contain a decision (R-2); touch a store or a file |
| `infrastructure/*` | One external world each | Call a domain unprompted; import `application/` |

The current repository's good habits are kept: plain Node scripts in `scripts/`/`tools/`, no PowerShell (frozen decision 9); vendored parts behind one module each; `.agents/logs/` for session records.

## 3. Import-boundary rules (tested, not advised)

1. `foundation` imports nothing from `src/`.
2. `domains/*` import `foundation` and their own files only.
3. `application/*` import `domains`, `foundation`, and infrastructure **ports** (interfaces declared by application, implemented by infrastructure).
4. `interfaces/*` import `application` only.
5. `infrastructure/*` import the ports they implement, `foundation`, and external packages. Never a domain's internals; never `application` beyond the port.
6. No file imports `electron` outside `interfaces/desktop` and one platform module. No file imports `@langchain/*` outside `application/agent` and `infrastructure/llm`.
7. Cycles are failures, including type-only cycles (the audit found both kinds; the type-only `index ⇄ bridge` cycle is the cautionary example).

The structural test walks the real import graph after every build — the same method the stage-1 audit used, so it cannot be argued with (R-15).

## 4. Packages versus folders

Everything above is a folder in one package. A folder becomes a package only when a second consumer outside this repository exists — none does (rule 18). The generated contract (`tools/gen-contracts.ts`) is a build step, not a package.
