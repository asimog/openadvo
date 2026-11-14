# v0 spec: court record capture and client email

Step 9 of [../build-plan.md](../build-plan.md). Serves workflow sections 2 (case number, CNR, email) and 3, and Appendix B-B duplication kind 2.

**Input.** The court portal in a visible window; saved email messages; the advocate's authorised mailbox.

**Output.** Sources with capture provenance (`capture` rows and `source.captured` events): the URL and page for a portal download; the message id, sender, subject and date for an email attachment.

**Rules.**

1. The portal opens in a separate visible window with its own session, no Node integration and no preload. Navigation and new windows are limited to the court's origins. The advocate signs in and solves any CAPTCHA; the application never does.
2. Every PDF downloaded in that window is added to the open matter like a dropped file (step 1 rules), with its URL. A file that is not a PDF is refused and reported.
3. Duplication kind 2: a download from a URL captured before records `sameListingAs`. Identical bytes stay one source (kind 1).
4. Email: only PDF attachments become sources. Other attachments are listed as skipped. The mailbox path opens INBOX read only, searches by sender or subject (one is required), and never marks, moves or deletes. The password is kept with Electron `safeStorage` (decision 9).
5. Parsing uses `postal-mime` 4.2.0, and the mailbox `imapflow` 2.10.0, both pinned exact.

**Surfaces.** Filing tab: "Open court portal", "Import saved email (.eml)", the authorised mailbox form and "Import from mailbox". Agent tools: `open_court_portal`, `portal_read`, `portal_navigate`, `portal_fill`, `portal_click`. Bridge: `openPortal`, `importEmail`, `getMailAccount`, `setMailAccount`, `fetchMail`.

**Not in v0.** A script for finding a case by number on the live portal (the agent tools exist; no portal-specific steps); case status as structured data; the IMAP path is not tested against a live mailbox in this build; attachments other than PDF.

**Proof task.** The owner captures the record of a real case and imports client attachments from email.
