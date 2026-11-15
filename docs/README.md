# Documents

Open Advocate is a desktop agentic harness for Indian litigation. `archive/` holds superseded documents for history. They govern nothing, and no document here depends on them.

Read in this order. Each fact has one owning file. Link to it; do not restate it.

| Order | Document | Owns |
|---|---|---|
| 1 | [../AGENTS.md](../AGENTS.md) | Standing orders, lessons L1 to L5, the advice boundary. |
| 2 | [product.md](product.md) | What Open Advocate is, its scope, the hard rules, the risks. |
| 3 | [advocate-workflow.md](advocate-workflow.md) | What the advocate experiences: onboarding, the Practice Profile, the interface, a matter from instruction to order, review and approval. It governs every other document. |
| 4 | [decisions.md](decisions.md) | Accepted decisions (frozen), rulings, and the terms the code uses. |
| 5 | [architecture.md](architecture.md) | Layers, the stores and what each owns, the three graphs, context assembly, memory, the harness, local intelligence, court adapters, languages. |
| 6 | [features.md](features.md) | The feature catalogue: 169 features with ids, phases, outputs and dependencies. |
| 7 | [skills.md](skills.md) | The skill format, the skills library and the practice packs. |
| 8 | [build-plan.md](build-plan.md) | The thirteen phases, the order inside each, the proof tests and the exits. |
| 9 | [harness-hardening.md](harness-hardening.md) | The hardening items H-n and the Pi feature status. |
| 10 | [harness-build.md](harness-build.md) | How the harness is built: Pi folders, extensions, the permission policy, helper agents; planned side questions and browser. |
| 11 | [engineering.md](engineering.md) | Engineering choices, the vendored parts and their scripts, the editor rules. |
| 12 | [repo-map.md](repo-map.md) | Folders, write boundaries, data outside the repository, the reference repositories. |
| 13 | [specs/](specs/) | One-page specs, one per started step. |
| — | [questions.md](questions.md) | Open questions for the owner, with the default used until answered. |
| — | [parking.md](parking.md) | Items outside the current step (lesson L6). |

Session reports and logs are in `../.agents/logs/`. They govern nothing. The assessment behind this plan is [../.agents/logs/2026-11-15-litigation-harness-report.md](../.agents/logs/2026-11-15-litigation-harness-report.md).

When two documents disagree, the workflow and the accepted decisions win, then the owning file. When a document and the code disagree, follow the code and report the mismatch.
