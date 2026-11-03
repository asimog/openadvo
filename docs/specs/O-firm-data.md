# O. Firm data

Components: O01 to O04. See [README](README.md) for tags and conventions.

## Purpose

The small amount of firm-level data that ties matters together: contacts, organisations, counsel, courts and benches; party roles per matter; an activity timeline; a correspondence log. Four small tables, nothing like a CRM.

## Decisions implemented

RQ-87 (a new client needs a confirmation), RQ-31 (the timeline reads the ledger, never the session store).

## Depends on

- C (the kernel writes firm data like any other record).
- A (matter creation consults O01 for the client).

## Assumptions

- Firm data spans matters, so it lives in its own file, `<app data>/firm.db`. It is not in the global registry, because the registry must be rebuildable from the folders and firm data is not. Matter-specific party roles live in `matter.db`.
- `firm.db` is backed up and exported like a matter (E06), because it cannot be rebuilt.

## Non-goals

- No sending path. The correspondence log records, it does not send.
- No CRM features: no pipeline, no billing.
- No code taken from any CRM. Entity shape was studied only (O01 REF).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa contacts list` / `add` / `show <id>` | query, internal | Contacts and organisations |
| `oa parties <matter>` | query | Party roles for a matter |
| `oa parties set <matter> --contact <id> --role petitioner|respondent|...` | internal | Records a party role |
| `oa timeline <matter|contact>` | query | Activity built from the ledger |
| `oa correspondence log <matter> --kind <k> --summary <s>` | internal | Logs a call, meeting or letter |

## Rules

1. A party in a matter is a reference to a contact, plus a role and the name as it appears in the record. The display name and the record name may differ, and both are kept.
2. The activity timeline is computed from ledger events. It stores nothing of its own.
3. Creating a matter for a contact that does not exist raises the RQ-87 confirmation.
4. Courts and benches are reference data with sources, shared with F12 codebooks.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| O-AC-01 | Deleting and rebuilding the timeline from the ledger gives the same entries. | [AUTO] |
| O-AC-02 | A party whose record name differs from the contact name keeps both and shows both. | [AUTO] |
| O-AC-03 | No command in this group makes a network request. | [AUTO] (egress test) |
| O-AC-04 | The contact and party views are what an advocate's office expects. | [HUMAN] |

## Edge cases

- One contact appears as petitioner in one matter and respondent in another.
- Two contacts with the same name. Kept apart unless the advocate merges them.

## Failure modes

| Failure | Honest state shown |
|---|---|
| `firm.db` unavailable | Firm data is read only, matter creation for a new client is refused, and other matter work continues. |

## Observable outcomes

- A contact page lists every matter and role.

## Open questions

None local.
