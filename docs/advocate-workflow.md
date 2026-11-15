# Advocate workflow

Accepted by the owner on 2026-11-15. This file owns what the advocate experiences. It governs every other document, unless an accepted decision in [decisions.md](decisions.md) says otherwise. Scope and the hard rules are in [product.md](product.md).

## 1. Onboarding

Four steps. The advocate can skip each step. The application never asks for Bar Council or court-portal credentials.

| Step | Asks | Time |
|---|---|---|
| 1. You | Name. Role: Advocate, Advocate-on-Record, Senior Advocate, or junior in a chamber. State Bar Council and enrolment number (optional, stored encrypted). | 20 s |
| 2. Your courts | Search the built-in directory and select courts, with a bench or district under each. Mark one court as primary. | 40 s |
| 3. Your work | Practice-area chips (more than one), with one primary. Trial, appellate or both. Civil, criminal or both. | 30 s |
| 4. Your past work (optional) | Drop a folder of judgments, pleadings, templates and notes. It goes into the Knowledge Library with the status "unreviewed". | 30 s |

The directory of courts and tribunals ships with the application, so onboarding works offline.

## 2. The Practice Profile

Onboarding ends on one Practice Profile page. The advocate can edit every part of it. It sits under Settings.

- **Court map:** the selected courts, their packs, and the freshness of each pack.
- **Practice map:** the enabled practice packs and their proceedings.
- **Sources plan:** the official sources the application will read, and how it gets each one.
- **Statutory map:** the main acts of the enabled packs, with their versions.
- **Skills:** the recommended skills and workflows for the enabled packs.
- **Library:** suggested folders for the imported work.

**Learned later.** The application does not ask these at onboarding: citation format, drafting style, paragraph length, research depth, output format, languages, and whether the advocate briefs other counsel. It asks each one once, inside the first task where it matters. Or it proposes a preference after the advocate makes the same correction twice. The advocate approves every proposal. Each preference the agent applies shows "applied because …".

## 3. Interface

**Global navigation:** Home · Matters · Research · Knowledge · Court Intelligence · Review Inbox · Calendar · Workflows & Skills · Memory · Settings.

**Home** is the Practice Intelligence Dashboard: active matters, today's and the next hearings, pending filings, court updates, new relevant judgments, changes in law, matters that need attention, research and drafts waiting for review, filing defects, and runs waiting for the advocate. It shows no business figures.

**Inside a matter**, the tabs are: Overview · Parties · Facts & Chronology · Documents & Evidence · Issues · Jurisdiction · Research & Authorities · Arguments & Strategy · Drafts · Proceedings & Hearings · Filing · Tasks & Deadlines · Communications · Memory · Audit.

**The chat dock** is on every view. It knows which view and which record it is on.

- `/` calls a skill.
- `@` adds a record, a document, an authority or a matter to the context.
- A plain request is enough. The agent picks the skill and says which one it picked.
- Every answer ends with a reviewer note and a set of options.

## 4. A matter, from instruction to order

1. **Open the matter.** The advocate creates it by hand, by voice, from a document or a whole file, from an order, from a cause-list entry, from a case number, or from an email. The agent proposes the classification: practice area, court, case type, parties, stage and statutes. The advocate confirms or corrects it.
2. **Check what is missing.** The agent lists missing documents and writes a questions document for the client. The advocate sends it. The agent never sends it.
3. **Read the record.** Every document gets page and line anchors. The agent proposes facts, dates, parties and contradictions. The advocate confirms each one. A disputed fact stays disputed until the advocate resolves it.
4. **Settle the forum and the law.** The agent writes the jurisdiction report and the limitation working, and selects the law in force on the governing date. "Undetermined" is a valid answer.
5. **Research.** The agent shows a research plan before a long run. It looks for adverse authority on purpose. Each authority shows whether it binds this court, and why.
6. **Argue.** The agent proposes issues, element charts and arguments. A critic attacks them. The advocate accepts or rejects each issue and each argument.
7. **Draft.** The agent drafts from the court's template and from the confirmed records. Each generated paragraph keeps the ids of its records. Agent edits are tracked changes. The advocate keeps or undoes each change.
8. **Verify.** The checks run on the draft. Open markers (`[CITE]`, `[VERIFY]`, `[REVIEW]`) and undecided changes block approval. The reviewer note says what was read, out of how much.
9. **File.** The application builds the filing set to the court's current checklist: index, pagination, annexures, court fee and format checks. It prepares the portal bundle. The advocate signs in, solves the CAPTCHA and submits. The application records the result and the signed manifest.
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
- The Memory view shows every record with its source, its status and its history.
