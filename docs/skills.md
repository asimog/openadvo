# Skills

Accepted by the owner on 2026-11-15. This file owns the skill format, the skills library and the practice packs. A skill is the unit of work (decision 14).

## 1. Skill format

Each skill is one versioned file in the skills registry (feature N1). The file format as built is in [specs/harness-and-stores.md](specs/harness-and-stores.md) section 2. Built-in skills live in the repository. The advocate's own skills live in user data.

| Field | Holds |
|---|---|
| id, version, title | Stable id (SK-nnn), version, title |
| description | What it does, and the requests that should trigger it |
| packs, courts, proceedings | Where it applies; a run outside these stops with a reason (feature D5) |
| inputs | What the advocate or another skill must give |
| required context | The records the context package must hold ([architecture.md](architecture.md) section 5) |
| permitted tools | The only agent tools the run gets; the policy module enforces the list |
| output schema | draft, chart, report, list or record, with its fields |
| checks | The verification checks that run on the output (features P1 to P9) |
| approval points | Where the run stops for the advocate |
| tests | Fixture briefs and expected properties (feature N6) |
| author | Built in, or the advocate |

A skill is reviewed before it ships (feature N6). Its review score is kept with its version in `review.json` beside `SKILL.md`; a skill whose version changes without a new record cannot run. The packs are `packs/<id>.json`, checked by `src/lib/packs/` ([specs/practice-packs.md](specs/practice-packs.md)).

## 2. Skills library

P is the phase. The output types are draft, chart (a record table or an element chart), report, list (review items) or record (structured rows).

### 2.1 Every proceeding

| ID | Skill | Output | P |
|---|---|---|---|
| SK-001 | New matter intake and classification | record | 8 |
| SK-002 | Case document intake and completeness | list | 8 |
| SK-003 | Preliminary case assessment (questions, not conclusions) | report | 8 |
| SK-004 | Jurisdiction report | report | 8 |
| SK-005 | Limitation working with exclusions | record | 8 |
| SK-006 | Governing law by date | record | 8 |
| SK-007 | Missing documents and questions for the client | draft | 8 |
| SK-008 | Impugned order or judgment analysis | report | 8 |
| SK-009 | Chronology and list of dates | draft | 8 |
| SK-010 | Fact matrix with sources | chart | 8 |
| SK-011 | Contradiction report | list | 8 |
| SK-012 | Issues proposal | list | 8 |
| SK-013 | Research plan and case-law matrix | chart | 8 |
| SK-014 | Adverse authority report | report | 8 |
| SK-015 | Statutory matrix | chart | 8 |
| SK-016 | Research memorandum | draft | 8 |
| SK-017 | Written submissions | draft | 8 |
| SK-018 | Hearing brief | draft | 8 |
| SK-019 | Bench questions and objections | list | 8 |
| SK-020 | Oral outline and rebuttal | draft | 8 |
| SK-021 | Compilation of authorities | draft | 8 |
| SK-022 | Post-hearing action report | record | 8 |
| SK-023 | Filing checklist run | list | 8 |
| SK-024 | Paper book and index audit | list | 8 |
| SK-025 | Defect reply and re-filing | draft | 8 |
| SK-026 | Draft review against the court template | list | 8 |
| SK-027 | Citation and grounding review | list | 8 |
| SK-028 | Matter Change Report | report | 9 |
| SK-029 | Legal notice and reply to notice | draft | 8 |
| SK-030 | Condonation of delay application | draft | 8 |
| SK-031 | Exemption, early hearing and urgent mentioning applications | draft | 8 |
| SK-032 | Cross-examination question plan | draft | 8 |
| SK-033 | Evidence affidavit preparation (deponent's own words) | draft | 8 |
| SK-034 | Execution of decree or order | draft | 11 |
| SK-035 | Contempt petition from a non-compliance record | draft | 11 |

### 2.2 Criminal pack

| ID | Skill | Output | P |
|---|---|---|---|
| SK-101 | FIR and complaint analysis with an ingredients chart | chart | 8 |
| SK-102 | Arrest, remand and custody record and custody period | record | 8 |
| SK-103 | Regular bail application | draft | 8 |
| SK-104 | Anticipatory bail application | draft | 8 |
| SK-105 | Bail conditions and compliance tracking | record | 8 |
| SK-106 | Quashing petition | draft | 8 |
| SK-107 | Charge-sheet analysis | chart | 8 |
| SK-108 | Discharge application | draft | 8 |
| SK-109 | Framing of charge review | report | 8 |
| SK-110 | Witness statement contradiction table | chart | 8 |
| SK-111 | Forensic, medical and electronic evidence review | chart | 11 |
| SK-112 | Trial preparation file | report | 11 |
| SK-113 | Criminal appeal and revision | draft | 8 |
| SK-114 | Suspension of sentence | draft | 8 |
| SK-115 | Victim compensation, probation, parole and remission applications | draft | 11 |

### 2.3 Civil pack

| ID | Skill | Output | P |
|---|---|---|---|
| SK-201 | Plaint review and plaint drafting | draft | 8 |
| SK-202 | Written statement with a para-wise reply table | draft | 8 |
| SK-203 | Replication | draft | 8 |
| SK-204 | Interim injunction application with a conditions chart | draft | 8 |
| SK-205 | Rejection of plaint and return of plaint applications | draft | 8 |
| SK-206 | Amendment of pleadings | draft | 8 |
| SK-207 | Issues for determination | list | 8 |
| SK-208 | Evidence matrix (issue, burden, evidence, witness) | chart | 8 |
| SK-209 | Final arguments | draft | 11 |
| SK-210 | First appeal and second appeal | draft | 8 |
| SK-211 | Specific performance, recovery, declaration and possession suits | draft | 11 |

### 2.4 Constitutional and writ pack

| ID | Skill | Output | P |
|---|---|---|---|
| SK-301 | Writ maintainability questions | list | 8 |
| SK-302 | Alternative remedy analysis | report | 8 |
| SK-303 | Fundamental rights and judicial review grounds | draft | 8 |
| SK-304 | Writ petition | draft | 8 |
| SK-305 | Counter-affidavit and rejoinder | draft | 8 |
| SK-306 | PIL petition with the locus and bona fides record | draft | 11 |
| SK-307 | Review and curative petitions | draft | 8 |
| SK-308 | SLP (civil and criminal) | draft | 8 |
| SK-309 | Transfer petition | draft | 8 |

### 2.5 Commercial, arbitration and corporate litigation

| ID | Skill | Output | P |
|---|---|---|---|
| SK-401 | Commercial suit: pre-institution mediation record, statement of truth, disclosure | draft | 11 |
| SK-402 | Summary judgment application | draft | 11 |
| SK-403 | Arbitration agreement analysis (seat, venue, law, procedure) | record | 11 |
| SK-404 | Section 9 interim measures | draft | 11 |
| SK-405 | Section 11 appointment | draft | 11 |
| SK-406 | Section 16 jurisdiction objection | draft | 11 |
| SK-407 | Pleadings matrix (claim, defence, counterclaim) | chart | 11 |
| SK-408 | Hearing bundle audit | list | 11 |
| SK-409 | Section 34 challenge | draft | 11 |
| SK-410 | Section 36 enforcement and Section 37 appeal | draft | 11 |
| SK-411 | Oppression and mismanagement petition (NCLT) | draft | 11 |

### 2.6 Other packs (phase 11)

| Pack | Skills (ids SK-5xx onward) |
|---|---|
| Family | Divorce petition, maintenance application, domestic violence application, custody and guardianship, transfer of matrimonial case, matrimonial evidence chart, stridhan claim |
| Property | Title chain chart, land record review by state, partition suit, possession and eviction, injunction against dispossession, registration objections |
| Insolvency | Section 7, 9 and 10 applications, claim forms, objection to a resolution plan, appeal to NCLAT |
| Banking and debt recovery | SARFAESI Section 17 application, DRT original application, DRAT appeal, pre-deposit waiver |
| Tax | Reply to a notice, appeal memo (CIT(A), ITAT, CESTAT, GST appellate), stay of demand, writ against an assessment |
| Service and employment | CAT original application, writ in service matters, disciplinary proceedings review, industrial dispute reference |
| Consumer | Complaint with pecuniary jurisdiction facts, written version, appeal |
| Intellectual property | Infringement and passing-off suit, interim injunction, evidence preservation of online infringement, rectification and opposition proceedings |
| Environmental | NGT application, appeal, expert evidence chart |
| Competition | Information to CCI, reply to an investigation report, appeal to NCLAT |
| Administrative and regulatory | Show-cause reply, statutory appeal, writ against an order, RTI first and second appeals |
| Insurance | Repudiation challenge before a consumer commission or ombudsman, policy clause chart |
| Immigration and citizenship | Writ against a deportation or visa order, Foreigners Tribunal record review |
| RERA | Complaint, appeal to the appellate tribunal |
| Motor accident and compensation | Claim petition, compensation computation sheet, appeal |
| Cheque dishonour | Statutory notice, complaint, compounding application |

Each pack file holds: proceedings, courts, governing acts by version (from E3), templates (L1), checklists (B11), record-table columns (H12), stage lists (C4), intake questions, skills, evidence requirements and terms. A pack is content. It owns no matter fact.
