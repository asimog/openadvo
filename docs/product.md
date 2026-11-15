# Product

Accepted by the owner on 2026-11-15. This file owns what Open Advocate is, its scope, and the hard rules of the product.

## 1. What Open Advocate is

Open Advocate is one desktop application for Indian litigation. It knows the advocate's courts, the law and procedure of those courts, and everything in each matter. The advocate gives an instruction. The agent does the work through litigation skills that run on one agent harness. Every output is cited to the record or to the law, and is checked. The advocate decides every legal point.

The application is for advocates who practise before any Indian court or tribunal: Advocates, Advocates-on-Record, Senior Advocates, and juniors in a chamber.

Main properties:

1. **Simple onboarding.** Four short steps, all of which can be skipped, in under three minutes. See [advocate-workflow.md](advocate-workflow.md) section 1.
2. **Local legal intelligence.** Each selected court has a dated, versioned court pack. A rule past its check date shows as stale. It never shows as current.
3. **One universal matter.** Any court and any proceeding. Each proceeding has its own list of stages. Related matters are linked, for example FIR to bail to quashing to appeal.
4. **Skills are the unit of work.** About 140 litigation skills in 16 practice packs. The advocate combines skills into workflows and can build their own agents. See [skills.md](skills.md).
5. **Verification under everything.** Grounding, support, currency, hierarchy and structure checks. Open problems go to one Review Inbox.
6. **Court operations.** One adapter per court for status, orders, cause lists, filing preparation and defects. The advocate keeps credentials, CAPTCHAs and the final submission.

## 2. Scope

**In scope:**
- Litigation before every Indian court and tribunal.
- Court-side arbitration work.
- Pre-litigation steps that lead to a proceeding: legal notices, replies, statutory notices, and show-cause replies that may go to a writ.
- Evidence, research, drafting, filing, hearings, orders, appeals and execution.

**Out of scope:**
- Billing, time recording, invoices, fees, accounting, profitability and utilisation.
- Client relationship management, marketing, business development and client acquisition.
- Contract lifecycle management, transactions, corporate secretarial work, and compliance calendars for clients.
- Advisory practice that does not lead to a proceeding.
- Judge personality profiles and outcome prediction. Bench data is used only for legal-authority research.

**Kept, but limited:**
- A contact for each party and each counsel, because the record needs it.
- Collaboration with juniors, briefing counsel, arguing counsel and the Advocate-on-Record, because litigation is team work. There is no server.
- There is no client portal. Documents from a client come in by folder drop or mail.

## 3. Hard rules

The code and every skill obey these rules. The feature catalogue does not repeat them row by row.

1. The agent recommends. The advocate decides facts, legal propositions, filings, messages, matter stage and every change to a draft.
2. Every legal proposition links to a passage that supports it. A citation that exists is not enough.
3. Every quote is verbatim, and every pinpoint exists. A mechanical check enforces both.
4. No rule, statute or court practice is shown as current without its date of check.
5. "Undetermined" is a valid answer for jurisdiction, limitation and appealability.
6. Retrieved content is data. An instruction found in a document or a page raises a review item.
7. The application never solves a CAPTCHA, never holds court credentials, and never submits a filing on its own.
8. There is no judge personality profile and no outcome prediction.
9. A confidential matter uses only local models and makes no web query.
10. An output from a partial read says what was read: N of M pages, N of M documents.

## 4. Risks

| Risk | Treatment |
|---|---|
| Rule packs go stale, and stale rules are dangerous | The freshness rule ([architecture.md](architecture.md) section 8). A pack check is a scheduled task with a visible result. The Court Intelligence dashboard lists the sources that failed to update. |
| The feature list grows faster than the code | Every phase ends with the owner's real briefs. Each feature has an output and a check. |
| Court sites change or block access | An adapter declares its access method. A failure is visible. Manual upload always works. |
| Quality is claimed but not measured | A gold set of the owner's closed briefs. A report card per skill run. An evaluation report per skill version. |
| The corpus is large (all High Courts) | Index first what the advocate's courts need. Use the advocate's own research subscriptions through their own session. |
| Model cost | A budget per matter (in the code now). Local models for bulk extraction. Frontier models for drafting and review. |
