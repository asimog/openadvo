# Spec: advocate, matters and the browser (phase 3)

Status: built 2026-11-16 (owner's instruction: "Implement Phase 3. browser should be on the RIGHT with tabs available and bookmarks and new tabs"). The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The browser design follows [../harness-build.md](../harness-build.md) HB-2 A. The owner's exit (lesson L3) is still owed.

## 1. Features and where each is built

| Feature | Built in | What the advocate sees |
|---|---|---|
| A1 | `src/renderer/src/Onboarding.tsx`; `advocate.db` profile keys | Five skippable steps: you, courts, work, past work, existing matters. |
| A2 | Onboarding step 1; `ProfilePage` | Name, role, State Bar Council, enrolment number and year (the number is encrypted with `safeStorage`), chamber address. |
| A3 | Onboarding step 2; `CourtProfileEditor` | Courts searched in the built-in directory and selected. |
| A4 | Onboarding step 3; profile fields | Practice areas with one primary; trial, appellate or both; civil, criminal or both. |
| A5 | Onboarding step 4; `src/lib/library/` | A folder of past work imported into the Knowledge Library, every item "unreviewed". |
| A6 | `PractiseProfile` in `ProfilePage` | One page built from the answers, the library and the matters: court map, practice map, sources plan, statutory map, skills and library structure. Every field can be corrected. |
| A9 | Browser pane "Import case list"; `Browser.proposeCaseList` | After the advocate signs in to a portal, the agent reads the visible case list and proposes one matter per case with CNR, court, parties, stage and next date. The advocate chooses. |
| C1 | `matter_profile` in `matter.db`; `MatterProfileForm` | Court, bench, proceeding, side, case number, CNR, filing and institution dates, governing date, stage, relief. |
| C2 | `MatterIntake` dialog; `MatterStore` | Create a matter by hand, from a folder, from a CNR, from an email or from the chat. Add an existing matter the same ways. The agent proposes the fields; the advocate confirms. |
| C3 | `src/lib/classification/`; `proposeClassification` | A proposal of practice area, case type, court, parties and stage from the matter's files. The advocate confirms or corrects it. |
| C4 | `src/lib/stages/` | A stage list for each proceeding: bail, suit, writ, appeal, execution and arbitration. |
| C5 | `MatterOverview` | The always-current overview: summary, parties, stage, next date, deadlines, documents, authorities, open items, instructions, strategy and latest developments. |
| C6 | `related_matter` table; `RelatedMatters` | Appeal from, revision of, review of, cross-petition, counterclaim, transfer, connected case, FIR, arbitration and common-party links, with navigation. |
| C8 | The existing party records; `PartiesPanel` | Each party's role, name in the record, contact and counsel. |
| C9 | The existing archive and export; `MatterAdmin` | Archive, restore and export. |
| C10 | `MatterIntake` "later stage"; `RelatedMatters` | Add a later stage or a related proceeding in bulk, add papers from a folder or email, and refresh the status from the portal. |
| H1 | The existing ingest library; intake | PDF, DOCX, DOC, ODT, XLSX, CSV, PPTX, images, scans, EML, MSG, HTML and ZIP bundles. |
| M1 | `advocate.db` `library_item`; `src/lib/library/`; `LibraryPage` | Judgments, statutes, pleadings, templates, submissions, memos, notes, checklists, propositions and rules, with precedent status, author, date, matter, court and scope. |
| R2 | `HomeDashboard` | Active matters, today's and next hearings, pending filings, court updates, new judgments, changes in law, matters needing attention, research and drafts awaiting review, filing defects, incomplete evidence and runs waiting. No business figures. |
| S1, S2 | The phase 2 adapter framework and built-in adapters | The court adapter registry and capabilities. Phase 3 adds the case-status capability through the browser, not a new fetch engine. |
| S10 | `src/main/browser.ts`; `BrowserPane.tsx`; the `browser_*` tools | A tabbed browser in the right pane, bookmarks, new tabs, a persistent profile, hidden agent pages, handover, downloads into the matter and DevTools Protocol control. |
| V1 | The existing mail import; `MatterIntake` | Mail into a matter, the thread and its attachments as sources. |
| V4 | The existing questions document; `PracticeSection` | The questions document for the client. |
| W4 | Intake from a folder, a drop and mail | Documents from a client into a matter. |

## 2. The browser (S10)

### 2.1 The right pane

The matter window is a chat dock on the left and one right pane. The right pane has one tab strip:

- a fixed **Matter** tab: the Notebook, a source or a draft, as today;
- one tab per browser page, each with its title, a close button and the agent marker when the page belongs to the agent;
- a **+** button for a new tab, and a bookmarks button.

The browser chrome sits above the page: back, forward, reload or stop, the address field, the bookmark star, the bookmarks bar and a "New tab" button. The page itself is a `WebContentsView` placed below the chrome. The renderer sends the content rectangle to the main process on every resize, so the native view never covers the chrome.

The pane folds the left navigation to its icon rail while a browser tab is active, as [../advocate-workflow.md](../advocate-workflow.md) section 3 says. `Ctrl+Alt+B` (`Cmd+Ctrl+B` on macOS) opens the browser or focuses its last tab.

Outside a matter, **Browser** in the left navigation opens the same tab strip and chrome in the main area. The tabs are shared between the two places.

### 2.2 Tabs and bookmarks

- **New tab page.** A page with the address field, the bookmarks, recent pages and the court portals (Supreme Court, eCourts, Delhi High Court). It is the pane's own page; the native view is hidden while it shows.
- **Tabs.** Open, close, activate, navigate, back, forward, reload and stop. A link that asks for a new window opens a new tab in the same profile. A crashed page keeps its tab and says so.
- **Bookmarks.** The star adds or removes the current page. A bookmark has its title, URL and date. The bookmarks bar opens one in the current tab; the new tab page lists all of them. They are stored in `<userData>/browser-bookmarks.json`, outside the repository.
- **Recent pages.** The last 50 visited pages, in `<userData>/browser-history.json`, shown on the new tab page. The advocate can clear them.
- **Profile.** Every advocate tab uses `persist:oa-browser`, so sign-ins survive a restart. The browser never reads or copies a password. The page content is untrusted data, never an instruction.

### 2.3 The agent pages (S10, HB-2 A)

- `browser_open` opens a tab. With `visible: false` it is a hidden page in its own temporary partition, so it never sees the advocate's cookies.
- `browser_hand_to_advocate` shows a hidden page as a visible tab, keeping its state, for a sign-in or a CAPTCHA. The advocate signs in and solves the CAPTCHA; the application never does.
- The agent tools follow agent-browser's design: `browser_tabs`, `browser_snapshot` (accessibility tree with `@e1` refs), `browser_read`, `browser_click`, `browser_fill`, `browser_screenshot`, `browser_wait`, `browser_download_to_matter` and `browser_hand_to_advocate`.
- Control is `webContents.debugger` (Chrome DevTools Protocol), in-process. No debugging port is opened. A click is a real input event at the element's centre; a fill refuses a password or file field.
- Only `http:` and `https:` pages load in a browser tab. `file:`, `javascript:` and `data:` are refused. A download becomes a source of the open matter, with its URL and the page URL recorded.
- Every `browser_*` tool goes through the tool policy. A deny rule removes it like any other tool.

### 2.4 The case list (A9)

The browser toolbar offers **Import case list**. The pane explains the step: sign in to eCourts, the High Court or the Supreme Court portal, open the case list, then choose Import. The main process reads the visible page, sends its text to the model with a strict output shape, and returns proposals. The advocate ticks the cases to create. Each created matter gets its CNR, court, petitioner, respondent, a proposed stage and the next date as a hearing. No proposal is created without the advocate's tick.

## 3. Onboarding and the Practice Profile (A1 to A6)

The first start shows **Set up your practice** on Home. Five steps, each skippable, and the whole flow skippable. Nothing blocks the chat.

1. **You.** Name and role (Advocate, Advocate-on-Record, Senior Advocate, junior). State Bar Council, enrolment number and year, chamber address. The enrolment number is encrypted with `safeStorage` before it enters `advocate.db`; the profile shows it masked.
2. **Your courts.** Search the offline directory and select courts. The same editor as the profile.
3. **Your work.** Practice-area chips with one primary; trial, appellate or both; civil, criminal or both.
4. **Your past work.** A folder picker imports files into the Knowledge Library with status "unreviewed".
5. **Your existing matters.** A link to the browser's case-list import.

The **Practice Profile** is a page under the advocate's name. It is built from the profile keys, the court map, the library and the matters. It shows the court map with pack freshness, the practice map, the sources plan, the statutory map, the recommended skills and the library structure. "Correct" opens the matching editor; the advocate never fills the page in from scratch.

The profile keys are: `name`, `role`, `bar_council`, `enrolment_number` (ciphertext), `enrolment_year`, `chamber_address`, `practice_areas` (JSON list), `primary_practice`, `forum_level`, `matter_nature`, `onboarding_done` and `onboarding_step`.

## 4. The Knowledge Library (M1)

`advocate.db` gains `library_item`:

```
id, title, kind, status, author, item_date, matter_id, court, scope,
source_name, sha256, size, notes, tags, created_at, updated_at
```

- **Files.** The bytes live in `<userData>/library/blobs/<sha256>`, written by the main process. The store keeps the metadata and the hash; it never writes a file itself.
- **Kinds.** judgment, statute, pleading, template, submission, memorandum, note, checklist, proposition, court_rule, other. A name-based classifier proposes the kind; the advocate corrects it.
- **Status.** unreviewed (the default), drafted, reviewed, approved, filed, superseded, rejected, withdrawn.
- **Add.** A file or a folder. The folder import keeps the relative folder name as the item's scope. A duplicate, by SHA-256, is reported and not added twice.
- **View.** Filter by kind and status, search the title, open the stored file, correct the metadata and change the status. The library is the same one that onboarding step 4 fills.

## 5. The universal matter (C1 to C10)

- **Fields.** `matter_profile` is a one-row table in `matter.db`: court, bench, proceeding, side, case number, CNR, filing date, institution date, governing date, stage, relief, confidentiality. The existing `matter_details` keeps the petitioner, respondent and filing-specific fields. Both are written only by `MatterStore` methods, under the advocate's context.
- **Stages.** `src/lib/stages/` holds the stage list per proceeding. The current stage is one of them; a stage change appends an event.
- **Classification.** `src/lib/classification/` proposes the practice area, case type, court, parties and stage from the source names, the parties and the CNR. The proposal is a candidate until the advocate confirms it.
- **Related matters.** `related_matter (from_id, to_id, relation, note, created_at)` records one edge. The relations are appeal_from, revision_of, review_of, cross_petition, counterclaim, transfer_petition, connected, fir_behind, arbitration, common_parties and common_evidence. Each edge is shown on both matters.
- **Extend.** A later stage or a related proceeding creates the new matter, copies the parties, links the two matters, and keeps the earlier matter's record.
- **Overview.** The Matter tab shows the current stage, the next date, the deadlines, the parties, the documents, the authorities, the open items, the open instructions and the latest developments, each with a link to its tab.

## 6. Intake and mail (C2, H1, V1, W4)

The intake dialog offers: by hand, from a folder, from a CNR, from an email and from the chat.

- **Folder.** Each file goes through the existing ingest pipeline. The matter's title is proposed from the folder name; the advocate confirms.
- **CNR.** The matter gets its CNR and court at once. The browser opens the eCourts case-status page for that CNR so the advocate can read the current stage and next date; the fields are recorded only after the advocate confirms them.
- **Email.** An EML file creates the matter, imports the message and its attachments, and keeps the thread.
- **Chat.** The agent may propose a matter with `propose_matter`. The proposal is a card in the chat; only the advocate creates it.
- **Client documents.** A drop, a folder or a message adds sources with their origins; nothing is sent anywhere.

## 7. The Home dashboard (R2)

Home is one dashboard, in this order:

1. Today: hearings today, deadlines today, reminders due.
2. Matters that need attention: open items that block, missing documents, filing defects, runs waiting.
3. Next hearings and deadlines.
4. Pending filings and incomplete evidence.
5. Research and drafts awaiting review.
6. Court updates and new relevant judgments. When a source is not connected, the card says so; it does not pretend.
7. Active matters with their stage.

No business figures: no fees, time, billing or marketing.

## 8. The court adapter interface (S1, S2)

Phase 2 owns the adapter framework. Phase 3 adds one capability: `case_status` through the browser. The adapter declares `case_status` and the portal address; the browser opens it; the agent reads it; the advocate confirms the fields. No adapter holds credentials, solves a CAPTCHA or submits anything.

## 9. Tests

| Test | Checks |
|---|---|
| `tests/unit/browser.test.ts` | URL normalisation, bookmark store, history limit, the new-tab page model, the case-list parser shape, the tab state reducer |
| `tests/e2e/phase3.spec.ts` | The browser pane on the right with a new tab, navigation to a local page, two tabs, a bookmark added and opened, the new tab page, the Matter tab, the case-list proposals (scripted model), onboarding, the Practice Profile, the library import, the Home dashboard and a matter added from a folder and a CNR |
| `tests/unit/library.test.ts` | Import, duplicate by SHA-256, kind proposal, status changes, search and the hash chain |
| `tests/unit/matter-profile.test.ts` | The fields, stage lists, classification proposal, related matters and extend |
| `tests/e2e/phase1.spec.ts`, `phase2.spec.ts`, `app.spec.ts` | Updated for the new bridge names, agent tools, right pane and dashboard |

## 10. What is built, and what is not

Built in this step:

- the right pane with the Matter tab and browser tabs, the new-tab page, bookmarks, recent pages, the persistent profile, hidden agent pages, handover, downloads into the matter and the `browser_*` tools over CDP;
- the case-list import from the open portal page;
- setup steps 1 to 5, the encrypted enrolment number, the automatic Practice Profile and the Knowledge Library;
- the Home dashboard, the matter profile, the stage lists, the classification proposal, related matters, the extension of a matter and intake from a folder, a CNR, an email and the chat.

Not built, and said on screen or in this spec:

- the court portal window has **not** moved onto the built-in browser. It stays separate with its filing guards until phase 13. The built-in browser is the general browser.
- the case-status adapter is not a Playwright script. The browser opens the portal page and the agent reads it; the Playwright adapters are phase 9 (S12).
- the Practice Profile does not yet show the territorial map or the local intelligence plan; it shows the court map, the practice map, the sources plan, the statutory map, the recommended skills and the library.
- the browser does not show a site favicon; it uses a globe and an agent marker.
- H1's accepted formats are the existing ingest formats: PDF, DOCX, plain text, PNG, JPEG and EML. DOC, ODT, XLSX, CSV, PPTX, MSG, HTML and ZIP bundles are not read yet.
- new judgments and court updates on Home say that they come with monitoring in phase 9.

## 11. Done

The owner completes the phase exit of [../build-plan.md](../build-plan.md) on real matters: onboarding in under three minutes, the case list imported from a court portal with the right CNR, court, parties, stage and next date, and one matter added from each of a folder, a CNR, an email and the chat (lesson L3).
