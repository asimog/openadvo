# New matter flow: proposal for owner review

Status: proposal, not built. Written 2026-11-20 for Plannotator review. This is a map, not a build order. It does not reopen any accepted decision.

Owner's instruction: make the new matter flow more optimized, streamlined and expanded. Add party names, a client marker, court level, practice area, case types from the filing portals, and a no-matter workspace for research.

---

## 1. What I found

The current flow is a small dialog. It asks for a title and an optional client. The client becomes a contact and a party with the role `client`.

- `src/renderer/src/App.tsx` lines 69 to 114: the dialog. Title, optional client, and a confirmation before a new client is added.
- `src/renderer/src/App.tsx` lines 285 to 296: `createMatter(title, client)`. It creates the matter with the title only, then adds the client contact and party.
- `src/shared/api.ts` line 436: `createMatter(title)`. The bridge carries a title only.

The rich fields already exist. They are filled after the matter is created, on the Overview.

- `src/lib/matter-store/practice.ts` lines 34 to 50: court, bench, practice area, case type, proceeding, side, case number, CNR, dates, stage, relief.
- `src/renderer/src/MatterProfile.tsx` lines 19 to 20: a short hardcoded list of sides and proceedings.
- `src/lib/classification/index.ts`: a rule-based proposal from the title, files, parties and profile. The advocate confirms it.

The knowledge to load a workflow, notebook and rules already exists in the packs.

- `packs/` holds 21 practice packs. Each pack has courts, proceedings, case types, stages, workflow steps, intake questions, record columns, evidence requirements, documents, acts, limitation rules, terms and skills.
- `src/lib/packs/index.ts` lines 198 to 224: `packForMatter()` picks a pack from the proceeding or case type, then the practice area, then the court, then the default pack. It already returns the reason.
- `src/lib/stages/index.ts`: fallback stage lists for bail, quashing, writ, suit, appeal, revision, review, execution, arbitration, consumer, tax, service and other.
- `src/lib/court-directory/index.ts`: court kinds, 25 High Courts, district judiciary per State or Union Territory, tribunals, consumer commissions and RERA authorities. The directory is offline data.

The no-matter research place is partial.

- `src/renderer/src/ResearchPage.tsx`: a page outside a matter. It searches the shared law library and lists each matter's Studio. It is not a workspace with its own notes, authorities and history.
- `src/renderer/src/App.tsx` lines 543 to 549: the Research page is shown only when no matter is open.
- `src/renderer/src/AppNav.tsx` line 92: the Research item opens the page, or the matter's Studio when a matter is open.

The main gaps are:

1. The new matter form does not collect the fields that select the pack.
2. The form has no party table and no explicit client marker.
3. The form has no court level, court, practice area, case type or stage.
4. Case-type knowledge is scattered across packs, classification rules, stage lists and adapters.
5. Practice areas are hardcoded in three renderer files with 12 values, while the packs use 21 practices and aliases.
6. The no-matter research place has no persistent workspace of its own.
7. The advocate does extra work after creation to make the matter usable.

The consequence: the correct workflow, notebook and rules cannot load at creation. They load only after the advocate fills the profile or adds papers.

---

## 2. Goals and non-goals

### Goals

1. One front door for every way to create a matter.
2. Collect the minimum facts that select the right blueprint.
3. Show the blueprint before creation, and load it after creation.
4. Keep a fast path for an advocate who only knows the parties.
5. Add a no-matter research workspace that never holds client facts.
6. Make court and case-type expansion a data change, not a code change.
7. Keep the advocate in control. The agent may propose. The advocate confirms.

### Non-goals

- This flow does not decide legal jurisdiction. The Jurisdiction report remains the place for that. The form records the forum, not a legal conclusion.
- This flow does not compute limitation. It shows the pack's rule and says when the pack states none.
- This flow does not file on a portal. Filing-ready remains the boundary (decision 25).
- This flow adds no billing, time, fees, CRM, marketing or firm analytics (decision 10).
- This flow adds no outcome prediction or judge profile (decision 18).
- This flow adds no Hindi or regional language (decision 19).
- This flow does not reopen the accepted decisions in `docs/decisions.md`.

### Terms

- **Forum**: the court or tribunal.
- **Court level**: Supreme Court, High Court, District and Sessions, Tribunal or Commission, Other.
- **Practice area**: the broad field, for example criminal, civil, commercial or family.
- **Case type**: the court's label for the case. Examples: `SLP (Criminal)`, `W.P.(C)`, `Sessions Trial`.
- **Proceeding**: the pack's workflow family. Examples: bail, writ, suit, appeal. One case type usually maps to one proceeding.
- **Blueprint**: the pack, stage list, intake questions, record columns, workflow, rules, limitation rule and filing checklist that a matter loads.
- **Client**: the party the advocate acts for. A matter can have more than one client.

---

## 3. The proposed flow

### 3.1 Entry points

The New matter page opens with one question: "What do you have?"

| Entry | What happens |
|---|---|
| Start blank | The full form opens with empty fields. |
| From papers | The advocate chooses a folder or files. The title and parties are proposed from the papers. Nothing is created until the advocate confirms. |
| From a CNR or case number | The advocate enters the CNR or case number. The court and type are looked up in the portal after the advocate signs in. The fields are proposed, not accepted. |
| From an email | An EML file is read. The thread and attachments become sources after creation. |
| From the portal case list | The existing case-list import proposes one matter per case, with CNR, court, parties, stage and next date. |
| From a chat instruction | Text and files from the landing page carry into the form. The instruction is sent as the first message after creation. |
| From an existing matter | A later stage or a related proceeding. The form copies the parties and profile, and records the relation. |

These entry points follow feature C2 in `docs/features.md`. The current `IntakeDialog` covers folder, CNR, email, cloud folders and chat. The new page absorbs it. The separate "Add an existing matter" button becomes the "Add a matter that already exists" entry.

### 3.2 Shape

Recommendation: one page, two columns, no wizard.

- Left column: the form, in four sections. Only the first section is open at the start. The others open as the advocate fills them.
- Right column: a live "This matter will load" panel. It updates as the choice changes.
- Footer: `Cancel` and `Create matter`. A second, quieter action says `Create with what I have` when the classification is incomplete.
- The page uses the main window, not a 460-pixel dialog. It has room for the party table and the blueprint.
- The left navigation folds to its icon rail while the page is open, like a document view.

Why not a wizard: a wizard hides the blueprint and adds clicks. Why not the current dialog: it is too small for a party table and a case-type search.

The page must work from the keyboard. Enter advances. Escape cancels with a confirmation. Every select is searchable. The focus order follows the sections.

### 3.3 Section A: Parties and client

A table, not a single text field.

| Column | Content |
|---|---|
| Name in the record | The name exactly as the court record gives it. |
| Role | Petitioner, respondent, appellant, respondent, applicant, accused, complainant, opposite party, decree holder, judgment debtor, claimant, or a free-text role. |
| Our client | A checkbox. This is the recommended client marker. |
| Contact | A searchable contact, or `New contact`. |
| Counsel | Optional. The counsel for that party, as the record gives it. |
| Remove | Removes the row. A row with a linked contact is not deleted from the address book. |

Rules:

- A matter can have zero, one or many clients. The checkbox is per party. This supports two petitioners who are both clients, and a client who is one of several respondents.
- A shortcut above the table says `Mark a side as our client`: `Petitioners`, `Respondents`, `Accused`, `Complainant`, or `None`. It sets the checkbox on every row on that side. The stored truth remains the per-party checkbox.
- The role list is filtered by court level and case type. A criminal trial offers `Accused` and `Complainant`. A writ offers `Petitioner` and `Respondent`. `Other` is always present.
- `Add party` adds an empty row.
- A contact is optional. If the advocate gives only a name, the page creates a contact after a visible confirmation, as the current dialog does. If the name matches an existing contact, the page offers the match and does not create a duplicate.
- The contact kind is an address-book fact. The client marker is a matter fact. A person can be a client in one matter and an opposing party in another. The page must not overwrite the contact kind.
- The title is proposed from the first party on each side: `Petitioner v. Respondent`, or `State v. Accused`. The advocate can edit it. A `Use the parties` button rebuilds the suggestion.
- The page records `side` on the profile from the client's side. If the client is the accused, the side is `accused`. If there are clients on both sides, the page asks the advocate to choose the side and says why.

This answers the request for a client checkbox "or some other method". The checkbox is the method. The side shortcut is the convenience.

### 3.4 Section B: Forum

The label is **Forum**, not **Jurisdiction**. Legal jurisdiction is a conclusion for the Jurisdiction report. This section records the court.

Fields:

1. **Court level**: Supreme Court, High Court, District and Sessions, Tribunal or Commission, Other. This is a required choice. It is stored as `court_level`, so the matter is explicit even when the court is not in the directory.
2. **Court**: a searchable list from the court directory, filtered by level and State or Union Territory. The list shows the seat and benches. `Not in the list` is a valid choice with a free-text name.
3. **Bench or seat**: the bench, station or establishment. Examples: `Lucknow Bench`, `Nagpur Bench`, `Principal Bench`.
4. **State or Union Territory**: prefilled from the court's territory. The advocate can change it.
5. **Case number and CNR**: optional at creation. A CNR can fill the court and type after the portal lookup. The advocate confirms the values.
6. **Court room or establishment**: optional free text.

The page shows the appeal route from the directory as a read-only line: `Appeal route: Delhi High Court → Supreme Court of India`. It is a directory fact, not a legal opinion. If the directory says the route depends on the subject, the page shows that note.

### 3.5 Section C: Matter type

Fields, in this order:

1. **Practice area**: one primary practice area. A searchable select, not a chip wall. The values come from the packs and their aliases. Examples: criminal, civil, constitutional and writ, commercial and arbitration, family, property, insolvency, banking, tax, service, consumer, IP, environmental, competition, administrative, insurance, immigration, RERA, motor, cheque. A `Suggest` action uses the current classification rules and shows its basis.
2. **Case type**: a searchable list, filtered by court level, court and practice area. It shows the portal label and the short code. Examples: `SLP (Criminal) — SLP(Cr.)`, `Writ Petition (Civil) — W.P.(C)`, `Sessions Trial — ST`. The list is grouped as `Recommended for this court`, `Other types for this level`, and `All types`.
3. **Proceeding**: the pack's workflow family. It is prefilled from the case type. The advocate can change it. If the pack has one proceeding for the case type, the page shows it as a read-only line with a `Change` action.
4. **Stage**: the first stage of the pack's stage list, or `Filing` when the matter is new. The list is the pack's list. The advocate can change it.
5. **Side**: the client's side. It is prefilled from Section A.
6. **Relief sought**: optional. A short free-text field.

When the court changes, the page clears a case type that is not valid for the new court and says so. It does not silently keep an invalid type.

When the practice area changes, the page filters the case types. It does not clear a valid type.

When the case type changes, the page updates the blueprint. It does not erase the parties.

### 3.6 Section D: Starting point

This section controls what happens after creation.

- **Empty matter**: create the matter and open the Overview with the intake checklist.
- **Add papers**: choose a folder or files. The files become sources after creation. The matter opens on the Documents tab when at least one file exists.
- **From a CNR**: the matter opens on the Overview with the CNR filled. The browser opens the case-status page so the advocate can sign in. The agent reads the page and proposes the stage and next date. The advocate confirms.
- **From an email**: the message and attachments become sources. The thread is kept.
- **From a chat instruction**: the text is sent as the first message after creation. Files are added first.
- **From a related matter**: choose the existing matter and the relation. The page copies the parties and profile. It records the relation on both matters.

### 3.7 Section E: More options

Collapsed by default:

- **Related matter or new stage**: appeal from, revision of, review of, cross-petition, counterclaim, transfer petition, connected, FIR behind, arbitration, common parties, common evidence.
- **Filing date, institution date, next date**: optional.
- **Tags**: optional free tags for the advocate's own grouping. No analytics.
- **Notes**: a short note for the matter memory. It is not a fact until the advocate confirms it elsewhere.

Do not put billing, time, fees, priority scoring or client value in this section.

### 3.8 The live blueprint panel

The right column answers one question: "What will this matter load?"

It shows:

1. **Pack**: the pack title and the proceeding. A line says why: `the case type matches "Writ petition under Article 226" in the Constitutional and writ pack`.
2. **Stage list**: the stages, with the chosen stage marked. The count is shown.
3. **Intake questions**: the first three questions, and `and N more`.
4. **Notebook**: the record columns and the evidence requirements. A count and a short preview.
5. **Workflow**: the pack's workflow steps. Each step shows the skill if one is named.
6. **Rules and acts**: the governing acts from the pack. Each has a version and source if the pack has one.
7. **Filing checklist**: the adapter's checklist name for this court and case type. If none is built, the panel says `No filing checklist is built for this court and type yet.` It does not pretend.
8. **Limitation**: the pack's rule if it states one. If it states none, `The pack states no limitation rule for this proceeding.`
9. **Skills**: the pack's skills, with the general skills first.
10. **Warnings**: stale pack rows, missing court data, an unclassified matter, or a case type that maps to no proceeding.

A `Change` link next to each block moves focus to the field that controls it. The panel does not edit anything.

### 3.9 Create behavior

The primary button is disabled until:

- the title is non-empty, or the page can build one from the parties;
- at least one party has a name;
- a court level is chosen;
- a case type is chosen.

`Create with what I have` is available when the title and at least one party are present, but the court or type is missing. It creates the matter with a visible `Classification not set` card on the Overview. The card offers `Propose the classification` and `Edit the profile`. This keeps the old speed and does not pretend the matter is classified.

On create, in one transaction:

1. Create the matter.
2. Write the profile fields.
3. Write the blueprint choice (`pack_id`, `proceeding_key`, `case_type_id`, `case_type_code`, `source`, `version`).
4. Create or link contacts and write the parties, including `is_client`.
5. Write the relation edges, if any.
6. Append one `matter.created` event with the field names and the source. Do not put client facts in the event body beyond ids.
7. Add the first sources, if the starting point has files or an email.
8. Send the first chat message, if the starting point has one.

Then open the matter:

- on the Overview when there are no sources;
- on the Documents tab when there is at least one source;
- with a `Start here` intake card at the top of the Overview. The card lists the pack's intake questions. Each answer is a candidate until the advocate confirms it.

If the pack or checklist is missing, the matter still opens. The missing part says so on screen.

### 3.10 Quick path

The fast path is not a second dialog. It is the same page with only Section A open.

An advocate can type two party names, tick `Our client`, type a title, and press `Create with what I have`. The matter opens with the `Classification not set` card. The agent proposes the court, type and pack after the first papers arrive. The advocate confirms.

This preserves the current speed. It also gives the advocate a clear next step, instead of a blank matter.

---

## 4. Case-type catalogue

### 4.1 What the catalogue is

The catalogue is a shared library of case-type rows. It owns the court's labels and codes. It does not own the workflow. It points to a pack and a proceeding.

Each row has:

```ts
interface CaseType {
  id: string;                 // stable id, for example "in.sc.slp.civil"
  label: string;              // the portal label, for example "Special Leave Petition (Civil)"
  code: string;               // the portal short form, for example "SLP(C)"
  courtLevels: CourtLevel[];  // supreme_court, high_court, district, tribunal, other
  courtIds: string[];         // directory ids, empty means every court at that level
  practice: string[];         // pack practice names
  packId: string;             // the pack that supplies the workflow and rules
  proceedingKey: string;      // the pack proceeding key
  aliases: string[];          // search words and older labels
  source: string;             // the portal page or filing list
  retrievedAt: string;        // YYYY-MM-DD
  status: "verified" | "unverified"; // the advocate or engineer has checked it
  note: string;               // court-specific caveats
}
```

The catalogue is data. Adding a court or a type is a data row, not a new screen.

The catalogue is not legal advice. The court's own portal label is the authority. Each row records its source and date. A row that no one has checked is `unverified` and shows that state.

### 4.2 Supreme Court of India

These are the common Supreme Court case types. The first group is the core set. The second group is the adjunct and statutory set.

| Case type (portal label) | Short form | Pack and proceeding | Note |
|---|---|---|---|
| Special Leave Petition (Civil) | SLP(C) | slp / Special leave petition (civil) | The most common civil filing. |
| Special Leave Petition (Criminal) | SLP(Cr.) | slp / Special leave petition (criminal) | The most common criminal filing. |
| Civil Appeal | C.A. | slp / Civil appeal (to add) | After leave is granted, or a statutory appeal. |
| Criminal Appeal | Crl.A. | slp / Criminal appeal (to add) | After leave is granted, or a statutory appeal. |
| Writ Petition (Civil) under Article 32 | W.P.(C) | writ / Writ petition under Article 32 | A constitutional writ. |
| Writ Petition (Criminal) under Article 32 | W.P.(Crl.) | writ / Writ petition under Article 32 (to add criminal variant) | A constitutional writ in a criminal matter. |
| Public Interest Litigation | PIL (W.P.(C)) | writ / Public interest litigation | A PIL is usually registered as a writ petition. |
| Review Petition (Civil) | R.P.(C) | writ / Review and curative petition | After a judgment. |
| Review Petition (Criminal) | R.P.(Crl.) | writ / Review and curative petition | After a judgment. |
| Curative Petition (Civil) | Curative (C) | writ / Review and curative petition | After a review is dismissed. |
| Curative Petition (Criminal) | Curative (Crl.) | writ / Review and curative petition | After a review is dismissed. |
| Transfer Petition (Civil) | T.P.(C) | writ / Transfer petition | Between courts. |
| Transfer Petition (Criminal) | T.P.(Crl.) | writ / Transfer petition | Between courts. |
| Transferred Case (Civil) | T.C.(C) | writ / Transferred case (to add) | After transfer. |
| Transferred Case (Criminal) | T.C.(Crl.) | writ / Transferred case (to add) | After transfer. |
| Special Reference | S.R. | other / Reference (to add) | A reference under the Constitution or a statute. |
| Original Suit | O.S. | civil / Original suit (to add) | A suit under Article 131. |
| Election Petition | E.P. | other / Election petition (to add) | A presidential or vice-presidential election petition. |
| Contempt Petition (Civil) | Cont.P.(C) | other / Contempt (to add) | Civil contempt. |
| Contempt Petition (Criminal) | Cont.P.(Crl.) | other / Contempt (to add) | Criminal contempt. |
| Miscellaneous Application | M.A. | other / Miscellaneous application (to add) | An application in a pending case. |
| Interlocutory Application | I.A. | adjunct | Not a main case type. It belongs to a main case. |
| Statutory appeal | C.A. or SLP | the pack for the statute | For example consumer, competition, arbitration or tax. The portal label depends on the statute. |

The core set is enough for the first build. The rows marked `to add` are new pack proceedings, not new screens.

### 4.3 High Court

The High Court labels vary by State and by court. The table gives a generic label and an example code from the High Court of Delhi. The catalogue stores the court's own label and code. It does not force the Delhi label on another High Court.

| Case type (generic) | Example code (Delhi HC) | Pack and proceeding |
|---|---|---|
| Writ Petition (Civil) | W.P.(C) | writ / Writ petition under Article 226 |
| Writ Petition (Criminal) | W.P.(CRL) | writ / Writ petition under Article 226 (criminal variant to add) |
| Public Interest Litigation | W.P.(C) (PIL) | writ / Public interest litigation |
| Civil Suit (Original Side) | CS(OS) | civil / Civil suit |
| Commercial Suit | CS(COMM) | commercial / Commercial suit |
| IPR Suit | CS(COMM) IPD; C.A.(COMM.IPD-*) | ip / Infringement suit |
| Regular First Appeal | RFA | civil / First appeal |
| Regular Second Appeal | RSA | civil / Second appeal (to add) |
| First Appeal from Order | FAO | civil / First appeal |
| Letters Patent Appeal | LPA | civil / Letters patent appeal (to add) |
| Civil Revision | C.R.P. | civil / Revision |
| Criminal Appeal | CRL.A. | criminal / Criminal appeal |
| Criminal Revision | CRL.REV.P. | criminal / Revision |
| Criminal Miscellaneous Case (quashing) | CRL.M.C. | criminal / Quashing petition |
| Bail Application | BAIL APPLN. | criminal / Regular bail |
| Anticipatory Bail | BAIL APPLN. or ABA | criminal / Anticipatory bail |
| Cancellation of Bail | CRL.M.(BAIL) | criminal / Cancellation of bail (to add) |
| Arbitration Petition (Section 9) | O.M.P.(I) | commercial / Section 9 application |
| Arbitration Petition (Section 11) | ARB.P. | commercial / Section 11 application |
| Arbitration Petition (Section 34) | O.M.P.(T); O.M.P.(COMM) | commercial / Section 34 challenge |
| Execution Petition | EX.P. | civil / Execution |
| Execution First Appeal | EFA | civil / Execution appeal (to add) |
| Matrimonial Appeal | MAT.APP. | family / Matrimonial appeal (to add) |
| Matrimonial Case | MAT.CASE | family / Matrimonial petition |
| Transfer Petition (Civil) | TR.P.(C) | family or civil / Transfer petition |
| Transfer Petition (Criminal) | TR.P.(CRL.) | criminal / Transfer petition |
| Testamentary Case or Probate | TEST.CAS. | civil / Probate or succession (to add) |
| Company Petition | CO.PET. | insolvency or commercial / Company petition |
| Income Tax Appeal | ITA | tax / Income-tax appeal |
| GST or Service Tax Appeal | ST.APPL.; CEAC | tax / GST appeal |
| VAT Appeal | VAT APPEAL | tax / VAT appeal (to add) |
| RERA Appeal | RERA APPEAL | rera / RERA appeal |
| Motor Accident Appeal | MAC.APP. | motor / Motor accident appeal |
| Land Acquisition Appeal | LA.APP. | property or civil / Land acquisition appeal (to add) |
| Contempt Case (Civil) | CONT.CAS(C) | other / Contempt (to add) |
| Contempt Case (Criminal) | CONT.CAS.(CRL) | other / Contempt (to add) |
| Election Petition | EL.PET. | other / Election petition (to add) |
| Review Petition | REVIEW PET. | writ or civil / Review |
| Caveat | CAVEAT(CO.) | other / Caveat (to add) |
| Interlocutory Application | I.A. | adjunct |
| Other | Other | other / Other proceeding |

The Delhi High Court case type list is long. It has about 150 codes, including IPR divisions, company matters, tax, RERA, motor, land acquisition, contempt and execution. The first build does not need all 150 rows. It needs the core rows above, the `Other` row, and a data path to add the rest.

### 4.4 District and Sessions

District labels vary by State, by court and by the case information system. The catalogue uses families, then a court-specific label where one is known.

| Family | Common labels | Pack and proceeding |
|---|---|---|
| Civil suit | Civil Suit, Money Suit, Title Suit, Partition Suit, Injunction Suit, Declaration Suit | civil / Civil suit |
| Commercial suit | Commercial Suit, Commercial Case | commercial / Commercial suit |
| Execution | Execution Petition, Execution Case | civil / Execution |
| Motor accident | MACT Claim, Motor Accident Claim | motor / Motor accident claim |
| Land acquisition | Land Acquisition Reference | property or civil / Land acquisition reference (to add) |
| Family | HMA Petition, Divorce, Judicial Separation, Restitution, Maintenance, Custody, Guardianship, Domestic Violence, Adoption, Succession, Probate | family / Divorce, Maintenance, Custody, Domestic violence, or a new proceeding |
| Criminal trial | Sessions Trial, Warrant Case, Summons Case, Complaint Case, Private Complaint | criminal / Trial |
| Cheque dishonour | Complaint under Section 138, NI Act Case | cheque / Cheque dishonour complaint |
| Bail | Bail Application, Anticipatory Bail | criminal / Regular bail or Anticipatory bail |
| Criminal revision or appeal | Criminal Revision, Criminal Appeal (to Sessions) | criminal / Revision or Criminal appeal |
| Rent and eviction | Eviction Petition, Rent Control Case, Public Premises | property / Possession and eviction |
| Labour and industrial | Industrial Dispute, Labour Case | service / Industrial dispute |
| Consumer commission | Consumer Complaint, Consumer Appeal | consumer / Consumer complaint or Consumer appeal |
| Other | Other | other / Other proceeding |

The district list must come from the court's own case information system or filing portal. The app should not invent a label. The first build can cover Delhi's district courts and the built-in tribunal families. Other States add rows with their own source and date.

### 4.5 Tribunals and commissions

| Forum family | Typical case types | Pack |
|---|---|---|
| NCLT and NCLAT | Section 7, 9 and 10 IBC applications; company petition; NCLAT appeal | insolvency; commercial |
| DRT and DRAT | Original application; SARFAESI Section 17; DRAT appeal | banking |
| CAT | Original application; contempt | service |
| SAT | Appeal | commercial or administrative |
| ITAT and CESTAT | Income-tax appeal; GST or customs appeal | tax |
| NGT | NGT application; NGT appeal | environmental |
| APTEL | Appeal | environmental or administrative |
| TDSAT | Appeal | administrative |
| AFT | Appeal | service |
| CCI | Information | competition |
| NCDRC, State and District Commissions | Consumer complaint; consumer appeal | consumer |
| RERA authority and appellate tribunal | RERA complaint; RERA appeal | rera |

The pack already names the court ids. The catalogue rows point to the same pack proceedings. The page shows the tribunal's own label.

### 4.6 Sources and status

The first catalogue version should record these sources:

- Supreme Court of India: the case category page and the case-number page on `sci.gov.in`, plus the Supreme Court Rules and the registry classification. The public pages can block automated access. A row whose source could not be read is `unverified`.
- High Court of Delhi: the case type list at `delhihighcourt.nic.in/app/get-case-type-status` and the case categorization pages. The list was read on 2026-11-20.
- District courts: the eCourts case-type list for the State, or the court's filing portal. The first build reads Delhi. Other States are added later.
- Tribunals: each tribunal's filing page and the pack's court ids.

Each row stores `source` and `retrievedAt`. The Court Intelligence page can show the catalogue's freshness. A stale row is `unverified`, never silently accepted.

Do not copy a portal's full list into the application without a source and a date. Do not present a label as the court's official label when it is a generic label.

---

## 5. What loads, and when

### 5.1 The blueprint resolver

Add one resolver: `blueprintFor(input)`.

Inputs: court id, court level, practice area, case type id, proceeding key.

Order:

1. An explicit `packId` and `proceedingKey` from the form.
2. The case type's `packId` and `proceedingKey` from the catalogue.
3. The existing `packForMatter()` order: proceeding or case type match, then practice area, then court, then default.
4. `other` with the `Other proceeding` stage list.

The resolver returns a blueprint or an honest `unresolved` result with a reason. It does not throw a blank screen.

### 5.2 What each part loads

| Part | Source | At creation | After creation |
|---|---|---|---|
| Court, bench, appeal route | Court directory | Shown in the form | Editable on the profile |
| Pack and proceeding | Pack | Shown in the blueprint panel | Stored on the matter; `Refresh blueprint` after a pack update |
| Stage list | Pack proceeding, then `STAGE_LISTS` fallback | Shown; first stage selected | Editable on the profile |
| Intake questions | Pack proceeding | Count and preview | `Start here` card on the Overview |
| Record columns | Pack proceeding | Count and preview | Record table tab |
| Evidence requirements | Pack proceeding | Count and preview | Evidence tab |
| Required documents | Pack proceeding | List | Filing tab |
| Workflow steps | Pack proceeding | List with skills | Workflow suggestions in the matter |
| Acts and rules | Pack acts, adapter rules | List with versions | Jurisdiction and Court Intelligence |
| Limitation | Pack proceeding | Rule or `not stated` | Filing tab |
| Filing checklist | Court adapter | Name or `not built` | Filing tab |
| Skills | Pack | List | Skills and Workflows |

The pack is content. It owns no matter fact. The matter store owns the chosen values.

### 5.3 Honesty rules

- If the pack has no stage list for the proceeding, show the fallback and say it is a fallback.
- If the pack states no limitation rule, say so. Do not compute a period.
- If the court adapter has no checklist, say so. Do not show an empty checklist as complete.
- If the court is not in the directory, keep the free-text court and mark the directory match as `not found`.
- If the case type maps to no pack proceeding, use `other` and show a warning. Do not guess a pack.
- If the pack row is stale, mark the affected part `unconfirmed`. The work is not blocked; the advocate sees the state.

### 5.4 Persistence

Store the choice on the matter at creation. Do not recompute it silently on every open. A later pack update may change a proceeding. The advocate sees `The pack has a newer version` and chooses `Refresh blueprint` or `Keep the recorded blueprint`.

This protects the matter's record. It also makes the reason for the choice visible later.

---

## 6. The no-matter workspace

### 6.1 What it is

A first-class research place outside every matter. It is not a fake matter. It has no client facts and no matter store. It uses the shared law library and public sources.

Name: **Research Workspace**. The shorter label in the left navigation can be **Workspace**, under Practice. The page title is `Research Workspace`.

### 6.2 Why it is separate

A matter is a container of client facts. A research question may start before a matter exists. It may never become a matter. If the app forces a fake matter, three bad things happen:

1. The matter list fills with research shells.
2. Client facts and law-only research mix.
3. The cross-matter rule becomes unclear.

A separate workspace keeps the boundary: law only, no client facts, no matter events.

### 6.3 Layout

Left: a list of research projects. Each project has a title, the last update and an archive action. `New research project` creates one.

Main area: tabs.

| Tab | Content |
|---|---|
| Research | The shared law search, the research plan, and the run history for this project. |
| Authorities | Saved judgments, provisions and propositions, with the reason each was saved. |
| Notes | The advocate's notes and the agent's proposed notes. A note is a candidate until the advocate keeps it. |
| Drafts | Scratch drafts that are not matter drafts. They are clearly marked `Not for filing`. |
| History | The project's law-only history: queries, saved authorities, saved provisions and runs. |
| Browser | The built-in browser, for public sources. |

The workspace uses the existing `LawPart` and research components with a workspace id, not a matter id. It does not use the matter Studio's matter-bound write path.

### 6.4 Storage

Use `advocate.db`, which already owns advocate-level records (decision 12). Proposed tables:

```sql
CREATE TABLE research_workspace (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE research_workspace_item (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES research_workspace(id),
  kind TEXT NOT NULL CHECK (kind IN ('note', 'authority', 'provision', 'query', 'draft')),
  ref TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'kept', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

The workspace stores references and notes, not copies of public law. The law itself stays in `corpus.db`. The advocate store's audit chain records each write. No matter store is opened.

### 6.5 Boundaries

- A visible banner says `Law only. Do not put client facts in this workspace.`
- The workspace has no matter id. A bridge call with no matter id is allowed only for the law and workspace functions. A matter-bound function refuses it, as it does today.
- `Send to a matter` copies saved law references only: authorities, provisions and propositions. It does not copy notes that may contain facts. The advocate chooses each item. The target matter is recorded on the item.
- `Create a matter from this research` opens the new matter page with the authorities and provisions attached to the new matter's Research tab after creation. It does not copy notes.
- The workspace never appears in the matter list, the docket or Home matter counts.

### 6.6 Entry points

- Home: a `Research workspace` card beside `New matter`.
- Left navigation: `Workspace` under Practice, or the existing `Research` item when no matter is open.
- New matter page: a quiet link `Start in the research workspace instead`.
- A matter's Research tab: `Open the research workspace` for law-only work that is not about this matter.

### 6.7 Empty state

`No research project yet. Start a law-only project for a question that is not tied to a matter. Client facts belong in a matter, not here.`

The empty state offers `New research project` and `Open the shared law library`.

### 6.8 What is built now, and what is new

Built now: the shared law library search, `LawPart` with an empty matter id, the per-matter Studio, and the cross-matter research history.

New: the project list, the workspace store, the workspace-scoped research and notes, the `Send to a matter` flow, and the law-only guard.

---

## 7. Data and code changes

### 7.1 Shared types

Add to `src/shared/work.ts` or a new `src/shared/matter-create.ts`:

```ts
export type CourtLevel =
  | "supreme_court"
  | "high_court"
  | "district_judiciary"
  | "tribunal"
  | "appellate_tribunal"
  | "consumer_commission"
  | "regulatory_authority"
  | "other";

export interface MatterCreateParty {
  nameInRecord: string;
  role: string;
  isClient: boolean;
  contactId: string | null;
  counsel: string;
}

export interface MatterCreateInput {
  title: string;
  courtLevel: CourtLevel;
  courtId: string;
  courtName: string;
  bench: string;
  territorialState: string;
  practiceArea: string;
  caseTypeId: string;
  caseTypeLabel: string;
  caseTypeCode: string;
  proceedingKey: string;
  stage: string;
  side: string;
  parties: MatterCreateParty[];
  cnr: string;
  caseNumber: string;
  filingDate: string;
  nextDate: string;
  relief: string;
  source: string;
  relatedMatterId: string | null;
  relation: MatterRelation | null;
}
```

Keep `createMatter(title)` as a compatibility wrapper. Add `createMatterFromInput(input)`.

### 7.2 Matter store

Add to `matter_profile`:

- `court_id TEXT NOT NULL DEFAULT ''`
- `court_level TEXT NOT NULL DEFAULT ''`
- `territorial_state TEXT NOT NULL DEFAULT ''`
- `case_type_id TEXT NOT NULL DEFAULT ''`
- `case_type_code TEXT NOT NULL DEFAULT ''`

Add a `matter_blueprint` table:

```sql
CREATE TABLE matter_blueprint (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pack_id TEXT NOT NULL DEFAULT '',
  proceeding_key TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  pack_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

Add to `party`:

- `is_client INTEGER NOT NULL DEFAULT 0`

Do not change the meaning of `contact.kind`. It stays an address-book fact.

### 7.3 New libraries

- `src/lib/case-catalog/`: the case-type rows, the search and filter functions, and the row checks. Plain library, no Electron, no Pi (decision 6).
- `src/lib/blueprint/`: `blueprintFor()`, `refreshBlueprint()`, and the honesty rules. It reads the packs, the catalogue and the court directory. It writes nothing.
- `src/lib/research-workspace/`: the workspace records and the law-only guard. It writes through the advocate store.

### 7.4 Renderer and main

- `src/renderer/src/NewMatter.tsx`: the page. It holds no business logic. It calls the bridge.
- `src/renderer/src/App.tsx`: open the page from `New matter`, `Matters`, the command bar, the landing page and `Add an existing matter`.
- `src/renderer/src/MatterProfile.tsx`: replace the hardcoded `PROCEEDINGS` and `SIDES` with the catalogue and the shared side list. Keep the form as the place to correct the profile after creation.
- `src/renderer/src/Onboarding.tsx`, `Profile.tsx`, `Intel.tsx`: use one shared practice-area list. Remove the three copies.
- `src/renderer/src/Pages.tsx`: add `workspace` to `Page`.
- `src/renderer/src/AppNav.tsx`: add the Workspace item or relabel Research.
- `src/main/matters.ts`: `create` accepts the full input. It writes the profile, parties and blueprint in one transaction.
- `src/main/bridge.ts`, `src/preload/index.ts`, `src/shared/api.ts`: the new functions and types.
- `src/main/index.ts`: `createMatterFromFields` accepts the new fields for the case-list import and chat proposals.

### 7.5 Migration

- Existing matters keep their rows. New columns default to empty.
- A matter with no blueprint shows `Classification not set` and offers the resolver.
- The migration does not rewrite a profile or guess a court.
- The schema version moves by one. The store's migration test covers an old matter.
- No matter is deleted. No event is rewritten.

### 7.6 Tests

Unit:

- Case catalogue filters by level, court and practice. Unknown court falls back to `Other`.
- A case type with no pack proceeding returns `other` and a warning.
- Blueprint precedence: explicit choice, catalogue, pack fallback, default.
- Pack stages win over the fallback stage list. Fallback is labelled.
- `is_client` is per party. A contact can be a client in one matter and an opposing party in another.
- Title suggestion handles `A v. B`, `State v. Accused`, and a missing party.
- Migration from the old profile and party tables.
- Workspace refuses a matter-bound call and never opens a matter store.
- `Send to a matter` copies only law references.

End to end (once, at the end of the phase, per `docs/agent-guide.md` section 8.4):

- Create a Supreme Court SLP (Criminal) with two parties and one client. The blueprint shows the SLP pack, the criminal stage list and the intake questions.
- Create a High Court writ petition with a civil and a criminal variant. The correct stage list loads.
- Create a district criminal trial and a family matter. The criminal and family packs load.
- Create a matter with only parties and title. The `Classification not set` card appears.
- Open the Research Workspace with no matter. Run a law search, save an authority, and send it to a matter. No matter is created by the search.
- Change the court after choosing a type. The invalid type clears with a notice.

---

## 8. Build slices

These are slices for approval, not a promise to build all at once.

### Slice 1: The form and the data

- Party table with the client checkbox and the side shortcut.
- Court level, court, bench and State.
- Practice area, case type, proceeding, stage and side.
- The live blueprint panel from the packs.
- `createMatterFromInput` with the profile, parties and blueprint.
- The `Classification not set` quick path.
- Tests for the form, the data and the migration.

Exit: an advocate creates a classified matter from parties, forum and type, and the pack choice is recorded.

### Slice 2: The case-type catalogue

- `src/lib/case-catalog/`.
- The Supreme Court core set, the Delhi High Court core set, the Delhi district families and the built-in tribunal families.
- Search, filter, aliases, source and date.
- The `Other` row and the `unverified` state.
- Tests for the filters and the source checks.

Exit: the advocate finds `SLP (Criminal)`, `W.P.(C)`, `CS(COMM)` and `Sessions Trial` by name or code, and the page shows the court's label.

### Slice 3: The blueprint loads into the matter

- The `Start here` intake card.
- Record columns, evidence requirements, acts and workflow steps.
- The filing checklist and the limitation state.
- The `Refresh blueprint` action.
- Honest `not built` and `not stated` states.
- Tests for the resolver and the views.

Exit: a new matter opens with the right intake questions and the right stage list, and a missing checklist says so.

### Slice 4: The Research Workspace

- `research_workspace` and `research_workspace_item` in `advocate.db`.
- The project list and the tabs.
- The law-only guard.
- `Send to a matter`.
- Tests for the guard and the copy.

Exit: the advocate runs a law-only research project, saves an authority, and sends it to a matter without creating a fake matter.

### Slice 5: Relations and polish

- `From an existing matter` with the relation edges.
- Copy parties and profile.
- Recent matters and `Duplicate the structure` (optional).
- Keyboard and empty states.
- End-to-end tests.

Exit: an appeal or revision is created from an existing matter with the parties copied and the relation recorded on both matters.

---

## 9. Acceptance

The owner completes these on a real brief (lesson L3):

1. A Supreme Court SLP (Criminal) with the accused as the client, in under 60 seconds from `New matter`.
2. A High Court writ petition (civil) with two petitioners, one of whom is the client.
3. A district criminal trial with the State as complainant and the accused as client.
4. A family matter with the wife as client and the husband as respondent.
5. A law-only research project that never appears in the matter list.

Pass means:

- The matter opens with the right pack, stage list and intake questions.
- The client marker is visible and correct.
- The matter list shows enough to identify the matter: title, court and type.
- A missing checklist or limitation rule says so. Nothing pretends.
- The advocate can correct every field after creation.
- The agent's proposals are candidates. The advocate confirms them.
- The type check and unit tests pass. The end-to-end test runs once, at the end of the phase.

---

## 10. Open questions for the owner

These are the choices I cannot make alone.

:::question
How should the advocate mark the client?
The choice changes the party table and the title suggestion. A per-party checkbox supports two clients or a client on either side. A single "we act for" radio is simpler but fails when there are two clients.

- [ ] Per-party `Our client` checkbox, with a side shortcut (recommended)
- [ ] One `We act for` radio for the whole matter
- [ ] Separate client record, then link it to a party

Recommended: Per-party checkbox, with a side shortcut
:::

:::question
What shape should the new matter flow have?
A single page keeps the blueprint visible and allows any order. A three-step wizard is shorter per screen but hides the blueprint. The current dialog is fastest but has no room for parties or types.

- [ ] One page with a live blueprint panel (recommended)
- [ ] A three-step wizard: parties, forum, type
- [ ] Keep the small dialog and add a "More details" button

Recommended: One page with a live blueprint panel
:::

:::question
How wide should the first case-type catalogue be?
The Supreme Court and Delhi lists are the most used in this repository. The packs already cover the tribunal families. All High Courts would need a separate source and review for each State.

- [ ] Supreme Court, Delhi High Court, Delhi district and the built-in tribunals (recommended)
- [ ] Every High Court in the directory in the first build
- [ ] Only the case types that already exist in the packs

Recommended: Supreme Court, Delhi High Court, Delhi district and the built-in tribunals
:::

:::question
How should the no-matter workspace be organized?
One workspace is simple. Several named projects keep separate research questions apart and match the way research actually starts.

- [ ] Several named research projects (recommended)
- [ ] One workspace with a history list
- [ ] Improve the current Research page only

Recommended: Several named research projects
:::

:::question
May the advocate create a matter with only the parties and title?
This keeps the current speed. The cost is a matter with no court or type until the agent proposes one.

- [ ] Yes, with a visible `Classification not set` card (recommended)
- [ ] No, require a court level and a case type
- [ ] Yes, but only from the chat, not from the New matter page

Recommended: Yes, with a visible `Classification not set` card
:::

---

## 11. Out of scope and decisions not reopened

- No billing, time, fees, accounting, CRM, marketing or firm analytics (decision 10).
- No analytics views (decision 13).
- No outcome prediction or judge personality profile (decision 18).
- No Hindi or regional language (decision 19).
- No portal filing by the agent (decision 25).
- No modification of vendored Euro-Office files.
- No edit to `docs/archive/`.
- No change to the matter store's one-writer rule (decision 4).
- No change to the human-only action rule (decision 5).
- No new canonical store. The Research Workspace lives in `advocate.db` (decision 12).

The one accepted decision this proposal touches is decision 20's window rule: "With no matter open, the view is the chat landing page." The owner's instruction adds a no-matter workspace. This is a newer owner instruction, so it wins. The landing page remains the default, with `New matter` and `Research workspace` as the two starting actions.

---

## 12. References

- `docs/advocate-workflow.md` sections 1, 3 and 4.
- `docs/features.md` C1, C2, C6, C10, D1, J6, Q1.
- `docs/specs/advocate-matters-browser.md` sections 3, 5 and 6.
- `docs/specs/practice-packs.md`.
- `packs/*.json`.
- `src/lib/packs/index.ts`.
- `src/lib/court-directory/index.ts`.
- `src/lib/stages/index.ts`.
- `src/lib/classification/index.ts`.
- `src/lib/matter-store/practice.ts`.
- `src/renderer/src/App.tsx`.
- `src/renderer/src/MatterProfile.tsx`.
- `src/renderer/src/Intake.tsx`.
- `src/renderer/src/ResearchPage.tsx`.
- Supreme Court of India, case category and case-number pages, `https://www.sci.gov.in/`, accessed 2026-11-20 (some pages blocked automated access; rows from those pages are marked unverified).
- High Court of Delhi, case type list, `https://delhihighcourt.nic.in/app/get-case-type-status`, accessed 2026-11-20.
- High Court of Delhi, case categorization, `https://delhihighcourt.nic.in/web/case-categorization`, accessed 2026-11-20.
- eCourts Services, `https://services.ecourts.gov.in/`, for district case-type labels; the first build uses the Delhi list and marks other States unverified until read.
