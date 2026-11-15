# Advocate workflow

Accepted by the owner on 2026-11-15. This file owns what the advocate experiences. It governs every other document, unless an accepted decision in [decisions.md](decisions.md) says otherwise. Scope and the hard rules are in [product.md](product.md).

## 1. Onboarding

Five steps. The advocate can skip each step. The application never asks for Bar Council or court-portal credentials. Signing in to a portal in step 5 happens in the portal's own page, in the app's browser; the application does not store the password.

| Step | Asks | Time |
|---|---|---|
| 1. You | Name. Role: Advocate, Advocate-on-Record, Senior Advocate, or junior in a chamber. State Bar Council and enrolment number (optional, stored encrypted). | 20 s |
| 2. Your courts | Search the built-in directory and select your courts. | 30 s |
| 3. Your work | Practice-area chips (more than one), with one primary. Trial, appellate or both. Civil, criminal or both. | 30 s |
| 4. Your past work (optional) | Drop a folder of judgments, pleadings, templates and notes. It goes into the Knowledge Library with the status "unreviewed". | 30 s |
| 5. Your existing matters (optional) | Sign in to eCourts (ecourts.gov.in) or a High Court or Supreme Court portal in the app's browser. The agent reads your case list there and proposes one matter per case, with its CNR, court, parties, stage and next date. You choose which to create. This can also be done later, from Matters. | as long as the portal takes |

The directory of courts and tribunals ships with the application, so onboarding works offline.

## 2. The Practice Profile

Onboarding builds one Practice Profile page automatically, from the answers, the imported work and the imported matters. The advocate does not fill it in. They can correct any part of it. It sits under the advocate's profile (section 3), and it updates as the advocate works.

- **Court map:** the selected courts, their packs, and the freshness of each pack.
- **Practice map:** the enabled practice packs and their proceedings.
- **Sources plan:** the official sources the application will read, and how it gets each one.
- **Statutory map:** the main acts of the enabled packs, with their versions.
- **Skills:** the recommended skills and workflows for the enabled packs.
- **Library:** suggested folders for the imported work.

**Learned later.** The application does not ask these at onboarding: citation format, drafting style, paragraph length, research depth, output format, languages, and whether the advocate briefs other counsel. It asks each one once, inside the first task where it matters. Or it proposes a preference after the advocate makes the same correction twice. The advocate approves every proposal. Each preference the agent applies shows "applied because …".

## 3. Interface

**The left navigation pane.** One pane on the left of the window. It folds to an icon rail while a source, a draft or the browser is open.

```
+ New matter                      (also: add existing, import case list)
Search                            (command bar: matters, records, commands)
-------------------------------------------------------------------------
Home                              dashboard
Review Inbox                      count of items that block work
Matters                           all matters; the open and pinned ones listed below it
   > open and pinned matters      one line each, with the next date
Calendar                          hearings, deadlines, reminders
Research                          search and research runs across all matters
Knowledge                         library, templates, approved positions, playbooks
Court Intelligence                courts, rules, cause lists, developments, source freshness
Browser                           tabs for portals and research services
Workflows & Skills                skills, workflows, the advocate's agents
-------------------------------------------------------------------------
(advocate's name)                 opens the advocate profile
Settings
```

**The advocate profile** (the name at the foot of the pane) holds what is about the advocate and the practice:

- Identity: name, role, Bar Council and enrolment.
- Practice Profile: courts, practice areas, statutory map, sources plan (section 2).
- Preferences: citation format, drafting style and the others learned in use, each with "applied because …".
- Advocate memory: confirmed records, proposals waiting, history.
- Imported work and imported matters: what came in, and its review status.
- Team: juniors, clerks and counsel of the chamber (phase 12).

**Settings** (at the foot of the pane) holds how the application works:

- Models and reasoning effort; the token budget default.
- Pi extensions and the permission policy; MCP servers.
- Research sources and the advocate's research services.
- Mailbox, contacts, calendar sync.
- Browser: profiles and site data.
- Appearance, folders, the filing-manifest key, diagnostics, versions.

**Browser.** A tabbed browser in the app window, for court portals, research services and any site. The advocate signs in there, and the sign-ins stay. The agent works in a tab the advocate hands over, or in its own hidden pages, and hands a page back when it needs a login or a CAPTCHA. Downloads become sources of the open matter. See [harness-build.md](harness-build.md) HB-2.

**Home** is the Practice Intelligence Dashboard: active matters, today's and the next hearings, pending filings, court updates, new relevant judgments, changes in law, matters that need attention, research and drafts waiting for review, filing defects, and runs waiting for the advocate. It shows no business figures.

**Inside a matter**, the tabs are: Overview · Parties · Facts & Chronology · Documents & Evidence · Issues · Jurisdiction · Research & Authorities · Arguments & Strategy · Drafts · Proceedings & Hearings · Ready to File · Tasks & Deadlines · Communications · Memory · Audit.

**The chat dock** is on every view. It knows which view and which record it is on.

- `/` calls a skill.
- `@` adds a record, a document, an authority or a matter to the context.
- A plain request is enough. The agent picks the skill and says which one it picked.
- Every answer ends with a reviewer note and a set of options.
- A side question (the Side question action, or `/btw <question>`) opens a separate, read-only thread. It cannot change the matter. Nothing returns to the main chat unless the advocate brings it in. See [harness-build.md](harness-build.md) HB-1.

## 4. A matter, from instruction to order

1. **Open the matter.** The advocate creates a new matter by hand, by voice, from a document or a whole file, from an order, from a cause-list entry, from a case number, or from an email. Or they add an existing matter: point to its folder, give its CNR number, forward its email, or describe it in the chat. Or they import their case list from a portal (onboarding step 5). An existing matter can be extended later with a new stage or a related proceeding, such as an appeal, a revision or an execution. The agent proposes the classification: practice area, court, case type, parties, stage and statutes. The advocate confirms or corrects it.
2. **Check what is missing.** The agent lists missing documents and writes a questions document for the client. The advocate sends it. The agent never sends it.
3. **Read the record.** Every document gets page and line anchors. The agent proposes facts, dates, parties and contradictions. The advocate confirms each one. A disputed fact stays disputed until the advocate resolves it.
4. **Settle the forum and the law.** The agent writes the jurisdiction report and the limitation working, and selects the law in force on the governing date. "Undetermined" is a valid answer.
5. **Research.** The agent shows a research plan before a long run. It looks for adverse authority on purpose. Each authority shows whether it binds this court, and why.
6. **Argue.** The agent proposes issues, element charts and arguments. A critic attacks them. The advocate accepts or rejects each issue and each argument.
7. **Draft.** The agent drafts from the court's template and from the confirmed records. Each generated paragraph keeps the ids of its records. Agent edits are tracked changes. The advocate keeps or undoes each change.
8. **Verify.** The checks run on the draft. Open markers (`[CITE]`, `[VERIFY]`, `[REVIEW]`) and undecided changes block approval. The reviewer note says what was read, out of how much.
9. **Ready to file.** The application builds the filing-ready set to the court's current checklist: index, pagination, annexures, court fee, the paper book and format checks, with a signed manifest. The advocate files it on the portal and records the result. Filing on the portal by the agent comes last (decision 25).
10. **Hearing.** Before the date, the agent writes a one-page hearing brief, bench questions and an oral outline. After the date, the advocate records the directions and the next date. The agent proposes the compliance tasks.
11. **Order.** A new order comes in as a source. The agent extracts its directions and raises an impact check. If the matter goes on to appeal, revision or execution, the new matter links to this one.

## 5. Review and approval

- **One Review Inbox** holds every item that needs the advocate: drafts to approve, research to verify, facts to confirm, conflicting authorities, unverified citations, missing documents, memory proposals, workflow exceptions, filing defects, proposed strategy changes, and rule-pack changes. Items that block work come first. The inbox works from the keyboard.
- **Human-only actions** are buttons that call bridge functions. The agent cannot do them: confirm a fact, keep or undo a change, approve a revision, confirm a memory record, accept a rule-pack change, submit a filing.
- **Long work** shows a plan card first. The run starts when the advocate approves it. The advocate can Stop any run.

## 6. Memory the advocate controls

- The agent proposes memory records after a run. The advocate confirms, corrects or rejects each one in the Review Inbox.
- A model inference never becomes a confirmed fact. A draft never becomes a precedent without approval.
- Facts never cross from one matter to another. Law and the advocate's own preferences can.
- Advocate memory is in the advocate profile. Matter memory is the matter's Memory tab. Both show every record with its source, its status and its history.
