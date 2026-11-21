# Module report: filing and court portal

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the filing target, required documents, compliance rows, limitation, annexures, PDF/A conversion, the filing set, the manifest and signature, the two confirmations, the visible court portal, upload, submit, receipt and reconciliation, the paper book and defect import.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Filing service | `src/main/filing.ts` (`Filing`) | `filing_target`, `limitation`, `annexure`, `filing_set`, `filing_confirmation` |
| Filing checks | `src/lib/filing/` | Compliance, limitation, manifest, PDF/A |
| Court portal | `src/main/portal.ts` (`Portal`) | Portal window, capture, result state |
| Signing | `src/main/signing.ts` | Ed25519 key, manifest signature |
| Conversion | `src/lib/converter/` | DOCX to PDF/A |
| Paper book | `src/lib/filing/v5.ts` | PDF paper book |
| Defects | `court-intel.ts`, `filing-checks.ts` | Defect rows and cure steps |
| UI | `src/renderer/src/Work.tsx` | Filing tab, manifest, confirmations |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Filing target | Implemented | `setFilingTarget` | Court, case type, list, adapter |
| Required documents | Implemented | `requiredDocuments` | Pack or adapter |
| Compliance rows | Implemented | `checkCompliance` | P-1 to P-9 |
| Procedure rows | Implemented | `procedureRules` | PROC-forum, route, limitation, rules |
| Court checklist | Implemented | `courtIntel.compliance` | C- rows |
| Limitation compute | Implemented | `computeLimitation` | Calendar days; exclusions named |
| Limitation confirm | Implemented | `confirmLimitation` | Human-only |
| Annexures | Implemented | `annexure` | Source and label |
| PDF/A conversion | Implemented | `convertFile`, `isPdfA` | x2t |
| Paper book | Implemented | `paperBook` | Reading copy |
| Manifest SHA-256 | Implemented | `manifestDigest` | Canonical JSON |
| Ed25519 signature | Implemented | `KeyFileSigner` | OS-encrypted key |
| Two confirmations | Implemented | `filing_confirmation` | Bound to payload |
| Portal upload | Implemented | `uploadFilingFile` | Only the confirmed set |
| Portal submit guard | Implemented | `submitFiling` | Refuses direct click |
| Portal receipt | Implemented | `saveReceipt` | PDF capture |
| Uncertain result | Implemented | `resultState`, `reconcile` | Human-only |
| Defect import | Implemented | `importDefects` | Registry text |
| Format checks | Implemented | `runFormatCheck` | PDF/A, size, bookmarks, page |
| Court fee | Missing | No path | No source |
| Rule versions | Missing | Pack/adapter only | No rule record |
| Filing set idempotency | Partial | No guard | Repeated approval creates a set |
| Portal coverage | Partial | SC and eCourts | No all-court e-filing |
| E-filing form fields | Missing | No path | PDF upload only |
| Filing result audit | Partial | Events and receipt | No full portal response record |

## 3. Current flow

```text
Filing target + approved drafts + annexures
  → requiredDocuments
  → checkCompliance + procedureRules + court checklist
  → limitation compute/confirm
  → approveForFiling
      → DOCX to PDF/A
      → manifest SHA-256
      → Ed25519 signature
      → filing_set (immutable)
  → confirmation 1 (advocate)
  → confirmation 2 (advocate)
  → portal upload
  → submit (only after both)
  → receipt or reconcile
```

## 4. Problems

### F-01: Filing depends on a pack or adapter for law

**Evidence.** `FilingPack` carries `requiredParts`, `limitation`, `documents`, `workflow`. `targetPack` prefers the adapter proceeding, then the practice pack. `checkCompliance` uses the pack's limitation source. `procedureRules` reads the pack.

**Effect.** A filing set can be built from a stale pack or an adapter rule. A rule change requires a content update. The rule text is not versioned with the set.

**Target.** `FilingService` consumes a `FilingRequirementSet` from `ProcedureService`, with rule ids, versions, source anchors and effective dates. The filing set records the requirement set version. A pack supplies presentation, not law.

### F-02: The filing set can be created more than once

**Evidence.** `approveForFiling` checks blockers and then creates a new folder and a new `filing_set`. There is no existing-set guard and no payload key.

**Effect.** Two clicks or two retries create two sets. The portal uses the newest. The audit has two records.

**Target.** A `filingSetKey` from the approved revision ids, annexure hashes and requirement set version. A repeat returns the existing set or creates a new version with a reason. The set has a `supersedes` link.

### F-03: The confirmation rule is duplicated

**Evidence.** `Filing.confirmFiling` stores confirmations. `Portal.confirmedSet` rechecks both confirmations and the payload hash. The portal's rule is separate.

**Effect.** A change to the confirmation rule must be made twice. The error codes can differ.

**Target.** `FilingService.assertConfirmations(filingSetId, step, payloadSha256)` is the only rule. The portal calls it. The portal still checks the UI control, but not the policy.

### F-04: A partial filing folder can remain

**Evidence.** `approveForFiling` writes files and converts each one. The `finally` removes `.work` but not the output folder. If a conversion fails, the folder remains without a `filing_set`.

**Effect.** Orphan folders accumulate. A later retry may reuse the name.

**Target.** Write to a temporary folder and rename on success. A failed build is removed or marked `failed` with a reason. The folder name includes the payload key.

### F-05: The court fee and the e-filing fields are missing

**Evidence.** No fee rule, no form field model, no e-filing XML. The portal upload accepts PDFs only.

**Effect.** The filing set is not complete for a court that requires a fee or structured fields. The advocate must do that outside the application.

**Target.** A `FilingProfile` includes fee rules and form fields, with source and effective date. The filing set includes a fee calculation or `unknown`, and the field values or `not applicable`. A court that needs XML gets a form adapter.

### F-06: The portal result can be unknown

**Evidence.** `submitFiling` records `filing.submitted`; the result state is `unknown` until a receipt is saved or the advocate reconciles. This is good.

**Effect.** The state is honest, but the filing set has no `unknown` state in its own record. The UI must combine the set and the portal state.

**Target.** A `FilingSubmission` record with states `none`, `confirmed`, `submitted`, `unknown`, `receipt`, `reconciled_not_submitted`. The filing set and the portal share it.

### F-07: No full portal response record

**Evidence.** The receipt is a PDF source. The portal page text and the response fields are not stored.

**Effect.** A later dispute about what the portal showed cannot be reconstructed beyond the receipt.

**Target.** A `PortalResponse` with URL, page hash, text, screenshot/PDF, timestamp and the fields read. The advocate can keep it as a source.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `FilingTarget` | Court, case type, proceeding, list |
| `FilingRequirementSet` | Documents, rules, forms, fees, source versions |
| `LimitationComputation` | Rule, start event, exclusions, deadline, confirmation |
| `Annexure` | Source, label, hash |
| `FilingSet` | Files, manifest, signature, approvals, versions |
| `FilingFile` | Name, role, hash, size, PDF/A, revision |
| `FilingConfirmation` | Step, payload hash, actor, time |
| `FilingSubmission` | Portal, state, receipt, response |
| `PortalResponse` | URL, hash, text, capture |
| `Defect` | Registry text, class, cure step, state |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `FilingService` | Target, requirements, limitation, annexures, set, confirmations | `ProcedureService`, `DraftingService`, `DocumentService` |
| `ManifestService` | Canonical JSON, digest, signature, verification | `FilingService`, `SigningService` |
| `PortalService` | Portal window, upload, submit, receipt, reconcile | `FilingService`, `BrowserService` |
| `SigningService` | Key, public key, fingerprint | OS secret store |
| `ConverterService` | PDF/A | `DraftingService` |

### 5.3 Contracts

```ts
interface FilingService {
  setTarget(matterId: string, courtId: string, caseType: string): Promise<MatterChecklist>;
  requirements(matterId: string): Promise<FilingRequirementSet>;
  computeLimitation(matterId: string): Promise<LimitationComputation>;
  confirmLimitation(limitationId: string): Promise<LimitationComputation>;
  approve(matterId: string): Promise<FilingSet>;
  confirm(filingSetId: string, step: 1 | 2, payloadSha256: string): Promise<FilingSet>;
  verifyManifest(filingSetId: string): Promise<ManifestCheck>;
  state(filingSetId: string): Promise<FilingState>;
}

interface PortalService {
  upload(filingSetId: string): Promise<UploadResult>;
  submit(filingSetId: string): Promise<SubmissionResult>;
  saveReceipt(filingSetId: string): Promise<Receipt>;
  reconcile(filingSetId: string, outcome: "submitted" | "not_submitted", note: string): Promise<FilingSubmission>;
}
```

### 5.4 The confirmation state machine

```text
draft
  → set_made
  → confirmed_1
  → confirmed_2
  → submitted
  → receipt
  → reconciled
```

Rules:

- Step 1 and step 2 are separate commands.
- Each is bound to the payload hash and the filing set.
- A new set invalidates the old confirmations.
- A submit requires both current confirmations.
- A failed or unknown result is recorded; a retry needs new confirmations after a reconcile.
- The advocate is the only actor.

### 5.5 The requirement rule

A `FilingRequirementSet` has:

- each document with a role, form, copies and rule id;
- each format check with a source;
- each fee with a rule id and amount or `unknown`;
- each form field with a source and value;
- each service requirement with a rule id;
- the effective date and the source version.

A checklist is a view of this set. It is not the authority.

## 6. Boundaries

- `FilingService` owns the filing set. It does not own procedure rules, drafts or documents.
- `PortalService` owns the court portal. It does not own the filing set or the confirmation rule.
- `ManifestService` owns the digest and signature. It does not own the files.
- `ConverterService` owns PDF/A. It does not own the set.
- `ProcedureService` owns the requirement rule. `FilingService` consumes it.
- `DraftingService` owns the approved revision. `FilingService` reads it.

## 7. Migration

1. Add `FilingRequirementSet` from the current pack/adapter data.
2. Add the set version and rule ids to the manifest.
3. Add `filingSetKey` and the existing-set/version rule.
4. Move the confirmation rule into `FilingService`.
5. Write to a temporary folder and rename on success.
6. Add `FilingSubmission` and `PortalResponse`.
7. Add fee and form-field support for the first court that needs it.
8. Keep the two-confirmation and submit guards unchanged.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| FI-01 | Approve twice with the same payload | One set or a superseding version with a reason |
| FI-02 | Submit before both confirmations | Refused |
| FI-03 | Confirm step 1 for an old set | Refused |
| FI-04 | Change an approved revision | The old set is not valid for a new submit |
| FI-05 | Conversion fails | No `filing_set`; no orphan folder |
| FI-06 | Manifest tamper | Verification fails |
| FI-07 | Portal submit then unknown | `unknown`; reconcile required |
| FI-08 | Receipt | A PDF source; `submitted` |
| FI-09 | Rule version change | The set shows the old version |
| FI-10 | Fee rule missing | The set says `unknown`, not zero |

## 9. Recommendation

**Keep the manifest, signature and two confirmations; make the set idempotent and move the legal requirement to the procedure service.** The filing path is one of the strongest parts of the product. Its weakness is that the pack/adapter is the law and the set is not keyed. Fix those two, add a submission record, and add fee/form support only where a real court needs it.

## Appendix: evidence map

- `src/main/filing.ts` — state, set, confirmations, manifest.
- `src/lib/filing/index.ts` — compliance, limitation, manifest, PDF/A.
- `src/lib/filing/v5.ts` — copy exclusion, disclosure, paper book, conversion.
- `src/main/portal.ts` — portal, upload, submit, receipt.
- `src/main/signing.ts` — Ed25519.
- `src/main/court-intel.ts` — checklist, format, defects.
- `src/renderer/src/Work.tsx` — filing tab.
