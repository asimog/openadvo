# v0 spec: citation verification and adverse-authority review

Step 7 of [../build-plan.md](../build-plan.md). Serves workflow sections 5F, 9B and 9C.

**Input.** The latest revision of each draft, and the recorded authorities.

**Output.** One citation check per citation per run, with the validator's own verification record; attestations; the adverse-authority review; review items for failed and unresolved citations.

**Rules.**

1. The validator is `ulos` (`C:\dev\ulosadvo`), a separate deterministic program. `scripts/vendor-ulos.ts` copies its release binary and court database into `resources/ulos/<platform>/` with SHA-256 values. `lib/ulos` finds Supreme Court neutral citations in text (`2024 INSC 23`), runs `ulos verify-citation --json`, and stores the record. The application never re-implements a check.
2. Outcomes are the validator's four: `verified`, `failed`, `unresolved`, `not_applicable`, with its reason code. Where the database does not hold a citation, the outcome is `unresolved` (`source_unreachable`): this build has no network source.
3. An authority's recorded parties and decision date are passed to the validator, so a wrong date is `failed` (`date_mismatch`).
4. A failed or unresolved citation in a draft opens a review item of that draft, and holds the draft in "Blocked pending legal review" until the advocate attests it with a reason. An attestation is shown as "Attested by advocate (not verified)", never as verified. A citation in a draft that was never checked also blocks.
5. The adverse-authority review is human-only, with three outcomes: found and addressed (needs an adverse authority recorded), none identified within the stated coverage (needs the coverage), or incomplete. Grounds cannot be approved without a review that is not incomplete.
6. The gate mapping of step 5 places "Blocked pending legal review" between "Needs correction" and "Needs additional instructions".

**Surfaces.** Harness bar: "Check citations". Research tab: "Check all citations", outcomes, Attest with a reason, the review form. Agent tool: `check_citations`. Bridge: `checkCitations`; human-only `attestCitation`, `recordAdverseReview`.

**Not in v0.** Pinpoint paragraph and quote checks (ULOS-CI, needs captured judgments); statute checks (ULOS-L); portal lookups for citations after 2023; the AI-use disclosure document.

**Proof task.** The owner verifies every citation of a real petition and attests one that cannot be resolved.
