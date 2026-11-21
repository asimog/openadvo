# Module report: court adapters

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the court directory, adapter schema and tiers, source documents, list building, quote verification, freshness, format checks, defect classes, bench rows, adapter proceedings, adapter editing and the case-list/case-status surfaces.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Court identity | `src/lib/court-directory/index.ts` | Static directory |
| Adapter schema and checks | `src/lib/court-adapters/index.ts` | Adapter JSON, quote matching, format, defects |
| Adapter registry and building | `src/main/court-intel.ts` (`CourtIntel`) | Downloads, `intel.db` |
| Adapter data | `adapters/*/adapter.json` | Three built-in adapters |
| Source and list store | `src/lib/intel-store/` | `source`, `doc`, `doc_line`, `pack_list`, `pack_item`, `bench`, `proceeding` |
| Court Intelligence UI | `src/renderer/src/Intel.tsx` | Profile courts, lists, freshness, benches |
| Filing use | `src/main/filing.ts`, `src/main/index.ts` | Checklist, format checks, defects, required parts |
| Case status | Browser only | No adapter field or parser |

The adapter is data. Nothing in an adapter runs. The framework downloads only the documents a list names, from the adapter's hosts, and checks each item's quote against them.

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Offline court directory | Implemented | `DIRECTORY`, `court`, `appealRoute` | SC, 25 HCs, district, tribunals, consumer, RERA |
| Adapter schema check | Implemented | `checkAdapter` | Data-only |
| Three tiers | Implemented | built-in, vendored, advocate | Higher version wins |
| Host allowlist | Implemented | `allowedUrl`, `hosts` | No arbitrary fetch |
| Source document storage | Implemented | `doc`, `doc_line` | Page and line |
| List kinds | Implemented | checklist, list, workflow, rules | `LIST_KINDS` |
| List build | Implemented | `buildList` | Downloads named documents |
| Quote verification | Implemented | `findQuote` | 0.85 threshold |
| Versioned lists | Implemented | `pack_list`, `pack_item` | Old versions kept |
| Freshness | Implemented | `source.checkDays`, `freshness` | Stale marked |
| Format checks | Implemented | `runFormatCheck` | PDF/A, size, bookmarks, page size |
| Defect matching | Implemented | `matchDefects` | Registry text to class |
| Bench rows | Implemented | `bench` | Manual or sourced |
| Adapter proceedings | Implemented | `proceeding` table | Duplicates pack proceedings |
| Fork and add adapter | Implemented | `forkAdapter`, `addAdapter` | Advocate can extend |
| Case-list import | Implemented | Browser proposal | Separate from case status |
| Case status | Missing | No `case_status` path | Docs describe it; code does not |
| Effective dates on rules | Missing | No field | No rule version |
| Rule interpretation links | Missing | No field | No rule-to-judgment link |
| Only three adapters | Partial | SC, Delhi HC, Delhi district | Coverage gap |
| Adapter as legal source | Emergent | `Filing` target pack | Boundary violation |
| Rule text in adapter | Partial | `rules` list items | Extracted text, not a rule record |
| Adapter list idempotency | Partial | New version each build | No content hash check |

## 3. Current flow

```text
Advocate selects court and case type
  → FilingTarget(court, caseType, listKey, adapterId)
  → CourtIntel.adapterFor(court)
  → listsForCaseType(adapter, caseType)
  → buildList for each needed list
      → source doc download (host allowlist)
      → page/line text
      → quote match per item
      → pack_list + pack_item version
  → checklist / format checks / defects
  → Filing compliance rows
```

## 4. Problems

### C-01: The adapter is used as a legal source

**Evidence.** `Filing` prefers the adapter proceeding's `requiredParts` and `limitation` when present (`main/index.ts:740-758`). `CourtIntel.compliance` turns checklist items into compliance rows. The adapter has `proceedings`, `limitation`, `requiredParts`, `workflow`, `stages`, `intakeQuestions` and `skills`.

**Effect.** A court's technical data source becomes its legal rule. A court with no adapter has no procedure. A pack and an adapter can disagree. A rule change requires an adapter release.

**Target.** The adapter owns court identity, hosts, source URLs, document retrieval, case-type labels and technical capabilities. `ProcedureService` owns rule records, versions, applicability and obligations. The adapter may fetch the document that contains a rule; it does not interpret it.

### C-02: Adapter and pack duplicate the proceeding

**Evidence.** `packs/slp.json` has `slp_civil`; `adapters/in-sc/adapter.json` has `sc.slp_civil`; both have a case type and required parts. `intel.db` has a `proceeding` table.

**Effect.** The same proceeding has two identities and two filing plans. The filing target chooses the adapter; the pack chooses the skill gate. They can disagree.

**Target.** One `ProceedingDefinition` per legal type, owned by `PracticeService`/`ProceedingService`. The adapter maps a court's case-type label to that type. It does not define a second proceeding.

### C-03: No effective dates

**Evidence.** `AdapterList` and `AdapterItem` have `source`, `quote`, `ref` and `value`, but no `effectiveFrom`, `effectiveTo`, `checkedAt` or reviewer. `source.checkDays` gives freshness, not a legal date.

**Effect.** A list built in 2024 can be used for a 2026 filing without knowing whether the rule changed. A stale item is marked stale, but a current item has no date range.

**Target.** Each list item that states a rule links to a `RuleRecord` with effective dates. The adapter item keeps the quote and the anchor. The rule record owns the date.

### C-04: Case status is missing

**Evidence.** `docs/specs/advocate-matters-browser.md` section 8 describes `case_status`. No `case_status` field exists in `AdapterDefinition` or `shared/intel.ts`; no parser exists.

**Effect.** The matter's stage and next date are entered by hand. The portal is read but not structured.

**Target.** The adapter declares `caseStatus: { urlPattern, fields[], source }`. `ForumAdapterService` opens the page, reads the fields, proposes stage and next date, and stores a page capture. The advocate confirms.

### C-05: Only three adapters, and the directory is wider

**Evidence.** `adapters/in-sc`, `adapters/in-hc-delhi`, `adapters/in-dj-delhi`. The directory has 25 High Courts, district judiciaries, tribunals and commissions.

**Effect.** A matter in another court has no checklist, no format checks and no defect classes. The UI must say "no adapter" rather than pretend.

**Target.** Treat adapter coverage as a first-class capability state. A court can be `known`, `adapter-ready`, `list-built` or `no-source`. Add adapters by data, not code. Start with the courts the owner uses.

### C-06: Adapter list builds are not idempotent

**Evidence.** `CourtIntel.buildList` always calls `recordList`, which inserts a new `pack_list` version. It does not compare the new item set with the current version.

**Effect.** A repeated build creates version noise. A reviewer cannot tell whether the list changed.

**Target.** Build a content hash over the items, source hash and adapter version. If the hash matches the current version, return it. If it differs, create a new version with a reason.

### C-07: Adapter edits have no review workflow

**Evidence.** `editList` lets the advocate correct or add an item. The item records `advocate_entered` and `enteredSource`. There is no second reviewer or verification date.

**Effect.** A correction is a single person's edit. It can become the checklist for a filing without a second check.

**Target.** An edit is a `RuleCorrection` with a reviewer, a source and a status. A corrected legal item needs a second check before it can be `verified`. A non-legal list item can be `advocate_entered`.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Forum` | Court, tribunal, commission, regulator |
| `ForumProfile` | Identity, hosts, capabilities, sources |
| `ForumCaseType` | The court's label/code, mapped to a proceeding type |
| `AdapterSource` | A document the adapter may fetch, with hosts and check interval |
| `AdapterList` | A checklist, rules list, format list or workflow list |
| `ListBuild` | One build, with source hash, item hash, version and reviewer |
| `ListItem` | Text, quote, ref, page/line, status, rule link |
| `FormatCheck` | A technical format requirement |
| `DefectClass` | A registry defect class and its cure step |
| `CaseStatusProfile` | URL pattern, fields and source |
| `PageCapture` | The page read for a case status |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `ForumService` | Directory, forum identity, case-type mapping | Static data, `intel.db` |
| `ForumAdapterService` | Adapter registry, source fetch, list build, format checks, defects | `ForumService`, `intel.db`, HTTP |
| `ProcedureService` | Rule records, versions, applicability | `corpus.db`, `intel.db` |
| `FilingService` | Filing target, requirements, compliance | `ForumAdapterService`, `ProcedureService` |
| `BrowserService` | Case-status page open and read | `ForumAdapterService` |

### 5.3 Contracts

```ts
interface ForumAdapterService {
  adapters(): Promise<AdapterSummary[]>;
  adapterFor(courtId: string): Promise<AdapterDefinition | null>;
  buildList(adapterId: string, key: string): Promise<ListBuild>;
  editList(listId: string, change: ListChange): Promise<ListBuild>;
  checklist(matterId: string): Promise<MatterChecklist>;
  formatChecks(matterId: string): Promise<FormatCheckResult[]>;
  defects(matterId: string, text: string): Promise<DefectRow[]>;
  caseStatus(matterId: string): Promise<CaseStatusProposal>;
}
```

### 5.4 The boundary rule

The adapter may state:

- the court's name and id;
- the hosts it may reach;
- the documents it may read;
- the court's case-type labels;
- the checklist items, with quotes;
- the format checks;
- the defect classes;
- the case-status page and fields.

The adapter may **not** state:

- the limitation period;
- the legal effect of non-compliance;
- the proceeding lifecycle;
- the applicable statute or rule text;
- the filing requirement as a legal obligation;
- a skill or workflow selection based on law.

Those belong to `ProcedureService`, `ProceedingService`, `PracticeService` and `FilingService`.

## 6. Boundaries

- `ForumService` owns identity. It does not own law.
- `ForumAdapterService` owns retrieval and technical checks. It does not own legal applicability.
- `ProcedureService` owns rules and dates. It does not fetch court pages.
- `FilingService` composes the requirement set. It does not parse a court page.
- `BrowserService` reads a page. It does not decide the stage.
- The adapter is data. It does not execute code.

## 7. Migration

1. Add `ForumCaseType` and map the three adapters' case types to proceeding types.
2. Move the adapter's `limitation`, `requiredParts`, `stages`, `intakeQuestions` and `skills` out of the adapter. Link to `ProcedureService` and `ProceedingService`.
3. Add `effectiveFrom`, `effectiveTo`, `checkedAt`, `reviewedBy` to each legal list item.
4. Add `caseStatus` to the adapter schema and a proposal parser.
5. Add a list build hash and an idempotent return.
6. Add a review state for advocate edits.
7. Add two more courts by data as the first coverage test.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| CA-01 | Build the same list twice | One version, same hash |
| CA-02 | Source changes one item | New version with a diff reason |
| CA-03 | Adapter item has no quote | `no_quote`; never `verified` |
| CA-04 | Source is stale | The list is stale; the filing row is unconfirmed |
| CA-05 | Adapter has a limitation | It is not used as a rule; the procedure service supplies the rule |
| CA-06 | Court has no adapter | The UI says so; no empty checklist is shown as complete |
| CA-07 | Case status page | Stage and next date are proposed; the advocate confirms |
| CA-08 | Advocate edits a legal item | It needs a second check before `verified` |
| CA-09 | New court added | Only data files change; no core code |
| CA-10 | Host not in allowlist | Refused before fetch |

## 9. Recommendation

**Narrow the adapter to technical retrieval and forum identity.** It is a good, safe framework. Its boundary is wrong: it currently carries legal content. Move that content to `ProcedureService`, map case types to `ProceedingDefinition`, add effective dates and case status, and make the build idempotent. Add courts by data only.

## Appendix: evidence map

- `src/lib/court-directory/index.ts` — directory and appeal routes.
- `src/lib/court-adapters/index.ts` — schema check, quote, format, defects.
- `src/main/court-intel.ts` — registry, build, checklist, compliance, rules context.
- `src/lib/intel-store/` — source, document, list, bench, proceeding.
- `adapters/in-sc/adapter.json`, `adapters/in-hc-delhi/adapter.json`, `adapters/in-dj-delhi/adapter.json`.
- `src/main/index.ts:740-758` — adapter proceeding used for filing.
- `src/renderer/src/Intel.tsx` — Court Intelligence view.
