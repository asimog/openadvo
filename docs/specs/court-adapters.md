# Spec: local legal intelligence and filing readiness (phase 2)

Status: started 2026-11-16 (owner's instruction: "continue building phase 2 … do not download the whole rules for supreme court or each high court … it should be based on lawyer profile and it should be made when needed … write the framework for adapters that would download necessary PDFs of court rules and turn them into usable checklists workflows and lists … modifiable and upgradeable and ability to be vendored in"). The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The stores are in [harness-and-stores.md](harness-and-stores.md) section 6.

## 1. Principles

1. **Nothing is downloaded in bulk.** The advocate's courts and practice areas (the profile) choose the adapters and recommend lists. A list is built when the advocate asks for it, or when a matter's filing needs it. Building a list downloads only the documents that list names.
2. **An adapter is data, never code.** A vendored or third-party adapter cannot run anything. The framework does the downloading, the reading and the checks.
3. **Every item proves itself.** An item carries the words of the rule that supports it. The framework finds those words in the downloaded text, allowing for OCR errors, and records the page and line. Words that are not found make the item "not found in the source: advocate to verify". It never shows as verified.
4. **Rules are dated** (decision 16). Each source has its retrieval date and its check interval. A list built from a stale source is "unconfirmed".

## 2. Features and where each is built

| Feature | Built in | What the advocate sees |
|---|---|---|
| B1 | `src/lib/court-directory/` | Every court and tribunal, with seats, benches and the appeal route, offline. Compiled by the engineer: each row says "advocate to verify". |
| B2 | `intel.db` `source`, `doc`, `doc_line` | Each downloaded document, its address, retrieval date, interval and freshness. |
| B3 | `general` of an adapter | The court's website, case status, cause list, orders, e-filing and holidays pages. |
| B4, B5, B6 | `lists` of an adapter: kinds `checklist`, `list`, `workflow`; `rules` lists made from a document's sections | Lists built on demand, each item with its anchor and status. |
| B7 | `bench` in `intel.db`; the advocate enters rows | Bench rows with their source. Reading rosters from the court sites is not built. |
| B10 | Pack editor: `editItem`, `addItem` | An item the advocate adds or corrects is marked "advocate-entered", with the source the advocate gives. A correction makes a new list version. |
| B11 | `filing_target`, `filing_check` in `matter.db` | The matter's court and case type, and its checklist with a state per item. |
| B12, B16, B17 | The filing set and its signed manifest (built); the checklist joins its compliance list | Each checklist item is a compliance row: done, not applicable, or open. |
| B13 | `formatChecks` of an adapter; `src/lib/court-adapters/format.ts` | Size, searchable text, PDF/A, bookmarks and page size of each PDF of the filing set. |
| B14 | `defect` in `matter.db` | The advocate pastes the registry's defect list; each defect is matched to the court's defect classes and becomes a re-filing item. Drafting the reply is skill SK-025 (phase 8). |
| B15 | The paper book of the filing set (built) | — |
| D5 | `src/main/skill-runner.ts` | A skill that names courts stops with the reason when the matter's court is not among them, or has no adapter. |
| Q1 | `proceedings` of an adapter | The proceeding pack: forum, case type, provisions, limitation, required parts, its checklist and workflow, stages, intake questions, skills. |

## 3. The adapter

One folder with `adapter.json`. Fields:

| Field | Holds |
|---|---|
| `id`, `version`, `title`, `courts`, `author`, `review` | Identity. `courts` are directory ids. |
| `hosts` | The only hosts the framework may fetch from for this adapter (`https` only). |
| `general` | Pages of the court (B3), by name. |
| `sources` | Each document: `key`, `title`, `kind`, `owner`, `checkDays`, `reliability`, and how to find it: `locate.index` (the court's page) with `locate.linkText` (the link's words), and `url` as the fallback. |
| `lists` | Each list: `key`, `kind`, `title`, `needs` (`caseTypes`, `practice`), `source`, and either `items` (each with `text`, `quote`, `ref`, and for a workflow an optional `skill`) or `extract` (`start`, `end`: the words that open and close a part of the document; its numbered rules become the items). |
| `formatChecks` | `check` (`pdf_max_mb`, `pdf_searchable`, `pdf_a`, `pdf_bookmarks`, `pdf_page_size`), `value`, `source`, `quote`, `ref`. |
| `defects` | The defect classes of the registry, each with words that identify it and the re-filing step. |
| `proceedings` | Q1 packs (section 2). |

**Tiers.** Built-in adapters are in `adapters/` of the application. Vendored adapters are in `resources/adapters/`, written by `npm run vendor:adapters`, pinned by SHA-256 in `scripts/adapters.manifest.json`, with a lock file. The advocate's own adapters are in `<userData>/adapters/`. The same id in two tiers: both are listed, and the higher version runs.

**Modify and upgrade.** "Edit a copy" copies an adapter into the advocate's folder with the next patch version and the author "advocate". A list records the adapter version that built it. When a higher version is active, the list says so, and Rebuild makes a new list version; the old one stays readable.

**Safety.** Only `https` addresses on the adapter's hosts. A document must start with `%PDF` and be at most 60 MB. No CAPTCHA, no sign-in, no bulk download.

## 4. Building a list

1. Find the document: read the index page and take the link whose words match `linkText`; else use `url`.
2. Download it to `<userData>/intel/docs/<sha256>.pdf`, unless the same address was fetched within its interval. Record the source row and the document.
3. Read its text layer page by page. A page with no text is counted; OCR of rule documents is not run.
4. For each item, find its quote. The match ignores case and punctuation and allows one wrong letter in a word of four letters or more, two words read as one, one word read as two, and one lost word; at least 85 % of the words must match.
5. Record the list and its items in `intel.db`, with the adapter id and version.

## 5. Tests

| Test | Checks |
|---|---|
| `tests/unit/court-adapters.test.ts` | Adapter checks; the quote match with OCR errors; section extraction; the link on an index page; format checks; needs from a profile; the tiers and versions |
| `tests/unit/court-intel.test.ts` | Building a list from a fixture PDF through a fake fetcher: only that list's documents are fetched; anchors; a missing quote; a host outside the list is refused; the cache; a rebuild after an upgrade; the pack editor; stale sources |
| `tests/e2e/phase2.spec.ts` | Profile courts; Court Intelligence builds one list on demand; a matter's checklist with states in its compliance list; format checks; a defect list; a skill refused for the wrong court |

## 6. Done

The owner checks the first courts' lists against the official sources (questions Q-1) and accepts the filing checklist and format checks for one Delhi High Court case type (lesson L3).
