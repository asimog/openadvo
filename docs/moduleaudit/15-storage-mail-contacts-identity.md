# Module report: storage, mail, contacts and identity

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: OneDrive and Google Drive folder import, EML and IMAP mail, attachments into a matter, contacts, the advocate profile, the enrolment number and the mailbox secret.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Cloud folders | `src/lib/storage/index.ts` | Detected local sync folders |
| Mail | `src/main/mail.ts` (`Mail`) | EML, IMAP, attachments, `capture` |
| Contacts | `src/lib/contacts/index.ts` (`Contacts`) | A JSON file |
| Profile | `src/lib/advocate-store/` | `advocate.db profile` |
| Enrolment | `src/main/index.ts` | `enrolment.bin` encrypted by `safeStorage` |
| Mail secret | `src/main/index.ts` | `mail-secret.bin` encrypted by `safeStorage` |
| Onboarding | `src/renderer/src/Onboarding.tsx` | Five steps |
| UI | `src/renderer/src/Profile.tsx`, `Intake.tsx` | Profile and intake |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| OneDrive detection | Implemented | `detectStorageFolders` | Env and home folder |
| Google Drive detection | Implemented | `detectStorageFolders` | Home and drive letters |
| Inside-root guard | Implemented | `insideRoot` | Import cannot leave the chosen root |
| Provider origin | Implemented | `providerOf`, `origin.provider` | Local, OneDrive, Google Drive |
| EML import | Implemented | `importEmlFiles` | PostalMime |
| IMAP import | Implemented | `importFromImap` | INBOX read only, sender/subject/since |
| Attachment import | Implemented | `ACCEPTED_TYPES` | PDF, DOCX, TXT, PNG, JPEG |
| Capture provenance | Implemented | `store.work.addCapture` | From, subject, date, message id |
| Mail password | Implemented | `safeStorage` | Encrypted at rest |
| Contacts | Implemented | `Contacts` | JSON, client/opposing/advocate/other |
| Contact by name | Implemented | `findByName` | Case and spacing ignored |
| Profile | Implemented | `advocate.db profile` | Name, role, bar, enrolment, address |
| Enrolment encryption | Implemented | `safeStorage` | Last four shown |
| Onboarding | Implemented | `Onboarding.tsx` | Five skippable steps |
| OAuth storage/mail | Missing | No path | Local sync folders and IMAP only |
| Mail body as a source | Missing | Attachments only | The message text is not a source |
| Mail thread | Missing | No path | No conversation model |
| Contacts in `advocate.db` | Missing | JSON file | Not audited by the store chain |
| Contact dedupe beyond name | Missing | Name key | No email/phone merge |
| Calendar/contact sync | Missing | No path | No CalDAV/CardDAV |
| Team identity | Missing | One local advocate | No firm or roles |
| Secret provider abstraction | Partial | `safeStorage` calls in main | No service |

## 3. Current flow

```text
Cloud folder
  → detectStorageFolders
  → storageFolder picker
  → insideRoot check
  → matters.addFolder
  → origin.provider

Mail
  → EML file or IMAP search
  → PostalMime
  → attachment → temp file → matters.addFiles
  → capture (from, subject, date, message id)
  → the message body is not stored

Contact
  → Contacts.add
  → JSON file
  → party.contactId

Profile
  → onboarding
  → advocate.db profile
  → enrolment.bin encrypted
```

## 4. Problems

### SM-01: Storage detection is a filesystem guess

**Evidence.** `detectStorageFolders` reads environment variables and fixed paths. It has no provider API, no OAuth and no account identity. `providerOf` matches path strings.

**Effect.** A moved sync root or a renamed folder breaks import. A local folder that happens to contain "OneDrive" is labelled OneDrive. The application cannot tell which account the folder belongs to.

**Target.** A `StorageConnector` with a detected root, a provider id, an account label where available and a health state. The connector reads only inside the root. A missing root says so. No OAuth is needed for the local sync model; the UI must say "the provider's desktop folder", not "connected account".

### SM-02: Mail is an attachment pipe, not a communication record

**Evidence.** `importMessage` parses the message, iterates attachments, adds each as a source and records a capture. The body, the recipients and the thread are not stored. The `mail.ts` header says only PDF attachments; the code accepts five formats.

**Effect.** A client instruction in the message body is not in the matter. A reply chain is lost. The advocate cannot search the correspondence.

**Target.** An `EmailMessage` record with from, to, cc, subject, date, message id, thread id, body text and attachments. The body is a source or a communication record, with an anchor. The thread is a `Communication` timeline. Attachments link to it.

### SM-03: Contacts are outside the audited store

**Evidence.** `Contacts` writes a JSON file with a temp-and-rename. It has no hash chain, no event and no backup in the matter export. The `party` table references `contactId`.

**Effect.** A contact change is not audited. A matter export does not include the contact record. A contact can be deleted while a party points to it.

**Target.** `ContactService` in `advocate.db` with a chain event. A party keeps the name in record even if the contact is removed. The export includes the contact ids and names used by the matter.

### SM-04: Identity is a profile row, not a principal

**Evidence.** `advocate.db profile` holds name, role, bar council, enrolment, address, practice areas and onboarding state. `Bridge` hardcodes `{ actor: "advocate" }`. There is no session principal.

**Effect.** A local process that can call the bridge is the advocate. There is no distinction between the advocate, an integration and a system job at the write boundary.

**Target.** An `IdentityService` with a `Principal` (advocate, agent, system, integration). The bridge authenticates the renderer and resolves the principal. The store receives the principal. A future firm mode adds roles without changing the store contract.

### SM-05: Secrets are scattered

**Evidence.** `safeStorage` is called in `index.ts` and `signing.ts`. The mail password, enrolment number and signing key each have their own file and code path.

**Effect.** A new secret adds another path. Rotation and recovery are ad hoc.

**Target.** A `SecretService` with `get`, `set`, `rotate`, `delete` and a named secret. The OS secret store is the backend. A secret is never logged. A missing store says the feature is unavailable.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `StorageConnector` | Provider, root, account label, health |
| `EmailMessage` | Message id, thread, from/to/cc, subject, date, body, attachments |
| `Communication` | A thread or timeline of messages and letters |
| `Contact` | Person or organisation, kind, email, phone, notes |
| `Principal` | Advocate, agent, system, integration |
| `Secret` | Named encrypted value |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `StorageConnectorService` | Detection, root guard, import | `DocumentService` |
| `MailService` | EML, IMAP, message, thread, attachments | `DocumentService`, `CommunicationService` |
| `ContactService` | Contacts, dedupe, party links | `advocate.db` |
| `IdentityService` | Profile, principal | `advocate.db` |
| `SecretService` | Named secrets | OS secret store |

### 5.3 Contracts

```ts
interface MailService {
  importEml(matterId: string, paths: string[]): Promise<MailImportResult>;
  importImap(matterId: string, account: MailAccount, filter: MailFilter): Promise<MailImportResult>;
  messages(matterId: string): Promise<EmailMessage[]>;
  thread(matterId: string, threadId: string): Promise<Communication>;
}

interface ContactService {
  list(filter?: ContactFilter): Promise<Contact[]>;
  add(input: ContactInput): Promise<Contact>;
  update(id: string, input: ContactPatch): Promise<Contact>;
  merge(ids: string[], into: string): Promise<Contact>;
}

interface SecretService {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  rotate(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}
```

## 6. Boundaries

- Storage and mail are connectors. They do not own matter facts or documents.
- `DocumentService` owns the attachment source. The mail record links to it.
- `ContactService` owns the contact. The party record keeps the name in record.
- `IdentityService` owns the principal. The store enforces it.
- `SecretService` owns the encrypted value. No other module writes the secret file.

## 7. Migration

1. Add `EmailMessage` and `Communication`; keep the attachment path.
2. Store the message body as a text source with a captured origin.
3. Move contacts to `advocate.db` with a chain event; keep a JSON export for compatibility.
4. Add `Principal` to the bridge and the stores.
5. Add `SecretService` and move the three secrets.
6. Add a storage connector health state and a provider label.
7. Add a contact merge and a party link check.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| SM-01 | Import a folder outside the root | Refused |
| SM-02 | EML with a body and an attachment | Message and attachment are stored |
| SM-03 | IMAP read-only | No message is marked, moved or deleted |
| SM-04 | Contact deleted | The party keeps the name in record |
| SM-05 | Contact change | Audited in `advocate.db` |
| SM-06 | Enrolment number | Encrypted; last four only |
| SM-07 | Secret store unavailable | The feature says so; no clear-text fallback |
| SM-08 | Principal | A store rejects an agent write to a human-only field |
| SM-09 | Storage root moved | The connector says missing; no wrong folder |
| SM-10 | Export | The matter includes the contact ids and names used |

## 9. Recommendation

**Keep the local-first connectors; add a communication record, a contact service and a principal.** The storage and mail code is pragmatic and privacy-conscious. Its weakness is that email is an attachment pipe and contacts are outside the audited store. Add the message body and thread, move contacts into `advocate.db`, and make the principal explicit.

## Appendix: evidence map

- `src/lib/storage/index.ts` — provider detection and root guard.
- `src/main/mail.ts` — EML, IMAP, attachments, capture.
- `src/lib/contacts/index.ts` — contacts JSON.
- `src/lib/advocate-store/index.ts` — profile.
- `src/main/index.ts` — safeStorage for enrolment and mail.
- `src/renderer/src/Onboarding.tsx`, `Profile.tsx`, `Intake.tsx` — UI.
