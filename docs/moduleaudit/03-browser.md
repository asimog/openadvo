# Module report: built-in browser

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the browser pane and its tabs, the advocate and agent sessions, bookmarks and history, hidden agent pages, handover, page reading and control, downloads into a matter, and the case-list import. The visible court portal in `src/main/portal.ts` is a separate system and is covered in the filing report.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Browser process | `src/main/browser.ts` (`Browser`) | Tabs, views, partitions, downloads |
| Browser logic | `src/lib/browser/index.ts` | URL rule, bookmarks, visits, case-list parse |
| Browser pane | `src/renderer/src/RightPane.tsx` | Tab strip, chrome, page bounds |
| Shared types | `src/shared/browser.ts` | `BrowserTab`, `BrowserState`, `BrowserBookmark`, `BrowserVisit`, `CaseListProposal` |
| Browser tools | `src/main/agent.ts` | `browser_*` tools |
| Case-list proposal | `browser.proposeCaseList` | Model answer, no persisted proposal |
| Downloads | `Browser.captureDownload` | Matter source through `Matters.addFiles` |

The browser is one Chromium engine. Advocate tabs share `persist:oa-browser`. Hidden agent pages use a temporary partition per tab. The court portal uses its own `persist:oa-portal` window.

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Tab strip and new tab | Implemented | `Browser.open`, `state`, `RightPane` | One strip with the Matter tab |
| Back, forward, reload, stop | Implemented | `Browser.back/forward/reload/stop` | Per tab |
| Address normalisation | Implemented | `normalizeAddress` | http/https only |
| New-tab page | Implemented | `COURT_PORTALS`, `RightPane` | SC, eCourts, Delhi HC |
| Bookmarks | Implemented | `bookmarks.json`, `toggleBookmark` | 500 max, one per URL |
| Recent pages | Implemented | `browser-history.json`, `withVisit` | 50 max |
| Advocate session | Implemented | `persist:oa-browser` | Sign-ins survive |
| Hidden agent session | Implemented | `oa-browser-agent-<uuid>` | No advocate cookies |
| Handover to advocate | Implemented | `handToAdvocate` | Hidden page becomes visible |
| Read page text | Implemented | `pageText`, `read` | Accessibility tree or DOM |
| Click and fill | Implemented | `click`, `fill` | Fill refuses password and file fields |
| Screenshot | Implemented | `screenshot` | Saved as a matter source |
| Download into matter | Implemented | `downloadToMatter`, `captureDownload` | URL and page recorded |
| Case-list import | Implemented | `proposeCaseList`, `parseCaseListAnswer` | Model proposal, advocate ticks |
| Case status refresh | Missing | No `case_status` path | The portal page is read manually |
| Page annotation | Missing | No path | Screenshot only |
| Per-tab matter binding | Partial | One `matterId` on the browser | A tab is not bound to a matter |
| Agent tab ownership | Partial | `agent` flag and partition | No per-agent tab list or expiry |
| Retention of page text | Missing | Not stored | Only downloads are kept |
| Audit of visited pages | Missing | No event | History is local, not audited |
| Site policy or rate limit | Missing | No path | Every http/https page is allowed |
| Credential filling | Refused | `fill` refuses password | Good |
| Download type and size policy | Partial | `Matters.addFiles` format check | PDF/DOCX/TXT/PNG/JPEG only |

## 3. Current flow

```text
Advocate clicks a portal
  → Browser.open(agent=false)
  → persist:oa-browser tab
  → page loads
  → download → captureDownload → Matters.addFiles → source + capture
  → page text → case list → model → CaseListProposal → advocate creates matters

Agent needs a page
  → browser_open(visible=false)
  → temporary partition
  → snapshot/read/click/fill
  → hand_to_advocate if sign-in or CAPTCHA
  → download_to_matter
```

## 4. Problems

### B-01: A tab is not bound to a matter

**Evidence.** `Browser` has one `matterId` set by `setMatter`. `BrowserTab` has no matter id. A download uses the current `matterId`.

**Effect.** If the advocate switches matter while a tab is open, a download can go to the wrong matter. A tab opened for matter A remains when matter B opens. There is no visible owner on the tab.

**Target.** `BrowserTab` carries `matterId` and `owner` (`advocate` or `agent`). A download is allowed only when the tab's matter is the open matter, or the advocate confirms the target. A tab with no matter can browse law, but cannot download into a matter.

### B-02: The visible browser has no policy boundary

**Evidence.** `isBrowserUrl` allows every http/https address. The advocate session is persistent. There is no site list, no download policy beyond the matter format check, and no warning for a page that asks for a payment or a credential.

**Effect.** The browser is a general browser. That is acceptable for the advocate, but not for an agent. The agent uses a separate partition, which is the main control. The visible tab has no data-loss rule.

**Target.** Keep the visible browser general. Add a `SessionPolicy` for agent tabs: allowed hosts for court and legal sources, no file upload, no password fill, no download unless the matter accepts it, a tab lifetime, and a visible marker. The advocate can hand over or open any page.

### B-03: Case-list import is a model answer, not a reviewed proposal set

**Evidence.** `proposeCaseList` reads the visible page, sends up to 24,000 characters to the model, parses the first JSON object and returns proposals. The UI lets the advocate tick cases. There is no per-field evidence, no duplicate check against existing matters and no persisted proposal.

**Effect.** A wrong CNR or a wrong party can create a matter. A repeated import can create a duplicate matter. The model's basis is a text line, not a source anchor.

**Target.** A `CaseListProposal` with a page URL, a page snapshot hash, per-field source phrases, a duplicate check by CNR/case number, and a decision record. The model proposes; the parser validates; the advocate confirms each case.

### B-04: Page text is not retained or anchored

**Evidence.** `pageText` returns text to the caller. Only a download or a screenshot becomes a source. A page that is read but not downloaded leaves no record.

**Effect.** The advocate cannot cite a portal page later. The agent's reading is not reproducible. A case-status page has no snapshot.

**Target.** A `PageCapture` record with URL, title, timestamp, text hash, optional PDF/PNG, and a source link when the advocate keeps it. Reading a page is not the same as saving it; the advocate chooses.

### B-05: No case status

**Evidence.** No `case_status` code path. The docs describe one. The browser can open a case page and read it, but there is no adapter field, no status parser and no next-date proposal.

**Effect.** The matter's stage and next date are entered by hand. The browser does not close the loop with the matter.

**Target.** `ForumAdapterService` declares `case_status` with a URL pattern and a field map. The browser opens the page; the agent reads it; the fields are proposed; the advocate confirms. The snapshot is kept.

### B-06: Agent tabs have no expiry

**Evidence.** `Browser.open` creates a temporary partition per agent tab. `close` removes the tab. There is no TTL, no maximum tab count and no cleanup on matter change.

**Effect.** Hidden pages and partitions can accumulate. A page can stay open after the matter closes.

**Target.** An agent tab has a TTL, a maximum count and a `closeAllForMatter` on matter close. A handover converts the partition to an advocate-visible tab and records the change.

## 5. Greenfield target

### 5.1 Entities

| Entity | Fields |
|---|---|
| `BrowserTab` | `id`, `matterId`, `owner`, `url`, `title`, `partition`, `state`, `createdAt`, `expiresAt` |
| `BrowserSession` | `id`, `kind` (`advocate`, `agent`, `portal`), `persistent`, `allowedHosts`, `policy` |
| `PageCapture` | `id`, `tabId`, `matterId`, `url`, `title`, `textHash`, `text`, `pdfSourceId`, `capturedAt`, `basis` |
| `DownloadCapture` | `id`, `tabId`, `matterId`, `url`, `pageUrl`, `sourceId`, `outcome`, `at` |
| `CaseListProposal` | `id`, `pageUrl`, `pageHash`, `fields`, `evidence`, `duplicateOf`, `status` |
| `BrowserAuditEvent` | `tabId`, `owner`, `action`, `url`, `at`, `outcome` |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `BrowserService` | Tabs, sessions, navigation, bounds, close | Electron views |
| `CaptureService` | Page and download capture, matter source creation | `BrowserService`, `DocumentService` |
| `CaseListService` | Proposal, parse, duplicate check, decision | `BrowserService`, `MatterService`, model |
| `ForumAdapterService` | Case-status URL and field map | `BrowserService` |

### 5.3 Contracts

```ts
interface BrowserService {
  open(input: { matterId: string | null; owner: "advocate" | "agent"; url?: string; visible: boolean }): Promise<BrowserTab>;
  close(tabId: string): Promise<void>;
  navigate(tabId: string, url: string): Promise<void>;
  snapshot(tabId: string): Promise<string>;
  read(tabId: string, selector?: string): Promise<string>;
  click(tabId: string, target: Target): Promise<void>;
  fill(tabId: string, target: Target, value: string): Promise<void>;
  screenshot(tabId: string): Promise<string>;
  capturePage(tabId: string, matterId: string): Promise<PageCapture>;
  download(tabId: string, matterId: string, url?: string): Promise<DownloadCapture>;
  handOver(tabId: string): Promise<BrowserTab>;
}

interface CaseListService {
  propose(tabId: string): Promise<CaseListProposal[]>;
  decide(proposalId: string, decision: "create" | "skip", matterId?: string): Promise<MatterSummary | null>;
}
```

## 6. Boundaries

- The browser owns tabs, sessions and page control. It does not own matters, documents or legal rules.
- `DocumentService` owns the source created by a download or capture. The browser passes the bytes and the provenance.
- `CaseListService` owns the proposal and the duplicate check. `MatterService` owns the created matter.
- `ForumAdapterService` owns the case-status field map. The browser only opens and reads.
- The agent cannot read the advocate's persistent cookies. A handover is the only bridge.
- No password, file-input fill, CAPTCHA solving or payment action.

## 7. Migration

1. Add `matterId` and `owner` to `BrowserTab`; set them on open.
2. Add a check that a download target is the tab's matter or the open matter with confirmation.
3. Add `PageCapture` and a "Keep this page" action. Reuse the screenshot and PDF paths.
4. Add `CaseListService` with a duplicate check and a persisted proposal.
5. Add agent tab TTL and `closeAllForMatter`.
6. Add a `BrowserAuditEvent` for open, navigate, handover, download and close.
7. Add the `case_status` adapter field and a parser with advocate confirmation.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| BR-01 | Open a tab for matter A, switch to B, download | Refused or confirmed for B; no silent write to B |
| BR-02 | Agent tab reads the advocate's bank page | No cookies from `persist:oa-browser` |
| BR-03 | Agent fills a password field | Refused |
| BR-04 | Hidden page handed over | Same page state; owner changes; audit event |
| BR-05 | Case-list import twice | The second proposal shows the existing matter |
| BR-06 | Case-list model returns a bad CNR | The proposal is marked unverified; no matter is created |
| BR-07 | Page capture | URL, hash and source link are stored |
| BR-08 | Close matter with agent tabs | All its agent tabs close |
| BR-09 | Navigate to `file:` or `javascript:` | Refused |
| BR-10 | Download a refused format | Refused with a reason |

## 9. Recommendation

**Keep the browser, add ownership and capture.** It is already one of the better-isolated parts of the product. The missing pieces are per-tab matter identity, page capture, case-status parsing, a duplicate-aware case-list proposal and an audit trail. Do not turn the visible browser into a locked kiosk; keep it general for the advocate.

## Appendix: evidence map

- `src/main/browser.ts` — `Browser`, tabs, partitions, capture, handover, case list.
- `src/lib/browser/index.ts` — URL rule, bookmarks, visits, case-list parse.
- `src/shared/browser.ts` — tab, bookmark, visit and proposal types.
- `src/renderer/src/RightPane.tsx` — tab strip, chrome, page bounds.
- `src/main/agent.ts` — `browser_*` tools.
- `src/main/portal.ts` — separate court portal (filing report).
