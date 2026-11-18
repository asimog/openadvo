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

Each row is one skill of its pack. The output types are those of section 2.

**Family**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-501 | Divorce petition | draft | 11 |
| SK-502 | Maintenance application | draft | 11 |
| SK-503 | Domestic violence application | draft | 11 |
| SK-504 | Custody and guardianship petition | draft | 11 |
| SK-505 | Transfer of matrimonial case | draft | 11 |
| SK-506 | Matrimonial evidence chart | chart | 11 |
| SK-507 | Stridhan claim | draft | 11 |

**Property**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-511 | Title chain chart | chart | 11 |
| SK-512 | Land record review by state | record | 11 |
| SK-513 | Partition suit | draft | 11 |
| SK-514 | Possession and eviction | draft | 11 |
| SK-515 | Injunction against dispossession | draft | 11 |
| SK-516 | Registration objections | draft | 11 |

**Insolvency**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-521 | Section 7 application | draft | 11 |
| SK-522 | Section 9 application | draft | 11 |
| SK-523 | Section 10 application | draft | 11 |
| SK-524 | Claim forms and objection to a resolution plan | draft | 11 |
| SK-525 | Appeal to NCLAT | draft | 11 |

**Banking and debt recovery**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-531 | SARFAESI Section 17 application | draft | 11 |
| SK-532 | DRT original application | draft | 11 |
| SK-533 | DRAT appeal | draft | 11 |
| SK-534 | Pre-deposit waiver | draft | 11 |

**Tax**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-541 | Reply to a tax notice | draft | 11 |
| SK-542 | Appeal memo to CIT(A) | draft | 11 |
| SK-543 | Appeal memo to ITAT | draft | 11 |
| SK-544 | Appeal to CESTAT and the GST appellate authority | draft | 11 |
| SK-545 | Stay of demand and writ against an assessment | draft | 11 |

**Service and employment**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-551 | CAT original application | draft | 11 |
| SK-552 | Writ in a service matter | draft | 11 |
| SK-553 | Disciplinary proceedings review | report | 11 |
| SK-554 | Industrial dispute reference | draft | 11 |

**Consumer**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-561 | Consumer complaint with pecuniary jurisdiction facts | draft | 11 |
| SK-562 | Written version | draft | 11 |
| SK-563 | Consumer appeal | draft | 11 |

**Intellectual property**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-571 | Infringement and passing-off suit | draft | 11 |
| SK-572 | Interim injunction in an IP suit | draft | 11 |
| SK-573 | Evidence preservation of online infringement | draft | 11 |
| SK-574 | Rectification and opposition proceedings | draft | 11 |

**Environmental**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-581 | NGT application | draft | 11 |
| SK-582 | NGT appeal | draft | 11 |
| SK-583 | Expert evidence chart | chart | 11 |

**Competition**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-591 | Information to CCI | draft | 11 |
| SK-592 | Reply to an investigation report | draft | 11 |
| SK-593 | Appeal to NCLAT under the Competition Act | draft | 11 |

**Administrative and regulatory**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-601 | Show-cause reply | draft | 11 |
| SK-602 | Statutory appeal | draft | 11 |
| SK-603 | Writ against an administrative order | draft | 11 |
| SK-604 | RTI first and second appeals | draft | 11 |

**Insurance**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-611 | Repudiation challenge before a consumer commission or the ombudsman | draft | 11 |
| SK-612 | Policy clause chart | chart | 11 |

**Immigration and citizenship**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-621 | Writ against a deportation or visa order | draft | 11 |
| SK-622 | Foreigners Tribunal record review | report | 11 |

**RERA**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-631 | RERA complaint | draft | 11 |
| SK-632 | RERA appeal to the appellate tribunal | draft | 11 |

**Motor accident and compensation**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-641 | Motor accident claim petition | draft | 11 |
| SK-642 | Compensation computation sheet | record | 11 |
| SK-643 | Motor accident appeal | draft | 11 |

**Cheque dishonour**

| ID | Skill | Output | P |
|---|---|---|---|
| SK-651 | Statutory notice under Section 138 | draft | 11 |
| SK-652 | Cheque dishonour complaint | draft | 11 |
| SK-653 | Compounding application | draft | 11 |

Each pack file holds: proceedings, courts, governing acts by version (from E3), templates (L1), checklists (B11), record-table columns (H12), stage lists (C4), intake questions, skills, evidence requirements and terms. A pack is content. It owns no matter fact.
