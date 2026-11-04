# O. Firm data

Components: O01 to O04. Conventions, test kinds and status words are in the [README](README.md).

**Status:** contacts with kinds, party roles, the ledger-built timeline, the correspondence log, the RQ-87 confirmation and the Contacts, Parties and Timeline views work. Remaining: checking court and bench contacts against the F codebooks, `firm.db` backup (E), merging two contacts.

## Purpose

The small amount of firm-level data that ties matters together: contacts, organisations, counsel, courts and benches; party roles per matter; an activity timeline; a correspondence log. Four small tables, nothing like a CRM.

## Decisions implemented

RQ-87, RQ-31, P9.

## Depends on

- C: the kernel writes firm data like any record. A: matter creation consults contacts for the client.
- E: `firm.db` lives in the application data folder and is backed up, because it cannot be rebuilt. Party roles live in `matter.db`.
- F: court codebooks.

## Non-goals

- No sending path. The correspondence log records; it does not send.
- No CRM features: no pipeline, no billing.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa contacts list` / `add` / `edit <id>` / `show <id>` | query, internal | Contacts and organisations |
| `oa contacts merge <keep> <drop>` | internal | Merges two contacts; references move to the kept one |
| `oa parties <matter>` | query | Party roles for a matter |
| `oa parties set <matter> --contact <id> --role <r> --record-name <n>` | internal | Records a party role |
| `oa timeline <matter\|contact>` | query | Activity built from the ledger |
| `oa correspondence log <matter> --kind <k> --summary <s>` | internal | Logs a call, meeting or letter |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Contacts | Contacts and organisations, each with every matter and role | Add, edit, merge, open a matter |
| Parties | A matter's parties with role, contact name and record name | Set a role |
| Timeline | A matter's or contact's activity from the ledger | Open each event |

## Rules

1. A party is a reference to a contact, plus a role and the name as it appears in the record. Both names are kept.
2. The timeline is computed from ledger events and stores nothing.
3. Creating a matter for a contact that does not exist raises the RQ-87 confirmation.
4. Courts and benches are contacts whose source names an F codebook entry. A source that does not resolve in the codebook is refused.
5. A merge is an event. The dropped contact's id resolves to the kept one forever.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| O-AC-01 | Rebuilding the timeline from the ledger gives the same entries. | [AUTO] | done |
| O-AC-02 | A party whose record name differs from the contact name keeps and shows both. | [AUTO] | done |
| O-AC-03 | No command in this group makes a network request. | [AUTO] | done |
| O-AC-04 | The contact and party views are what an advocate's office expects. | [HUMAN] | remaining |
| O-AC-05 | A contact page lists every matter and role, and the timeline opens each event in the Inspector. | [AUTO] | done |
| O-AC-06 | A court contact whose source does not resolve in the codebook is refused. | [AUTO] | remaining |
| O-AC-07 | After a merge, every party role and timeline entry of the dropped contact shows under the kept one. | [AUTO] | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| O-GUI-01 | The add-contact form returns `contacts.add` with the fields entered. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| O-VIS-01 | Contacts, contact page, parties and timeline in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| O-E2E-01 | Create a matter for a new client from the chat pane; the confirmation appears in the view pane; after confirming, the client's contact page shows the matter. | remaining |

## Edge cases

- One contact is petitioner in one matter and respondent in another.
- Two contacts with the same name stay apart until the advocate merges them.

## Failure modes

| Failure | Honest state shown |
|---|---|
| `firm.db` unavailable | Firm data is read only, matter creation for a new client is refused, other matter work continues. |

## Open questions

None.
