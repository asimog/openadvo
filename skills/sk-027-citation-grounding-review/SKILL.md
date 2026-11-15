---
name: citation-grounding-review
id: SK-027
version: 0.1.0
title: Citation and grounding review
description: Runs the draft checks and the citation validator on the drafts and lists every defect with its evidence and the action it needs. Use it when the advocate asks to check, review or verify a draft, its citations or its grounding before filing.
role: review
packs: [general]
inputs: [a matter with at least one draft]
required_context: [drafts, authorities, issues]
permitted_tools: [list_sources, read_draft, get_paragraph_source, check_draft, check_citations, quick_check_citations, list_research, find_in_matter]
output: list
checks: [schema, anchors, no_unverified_claims]
approval_points: []
budget_tokens: 60000
package_type: filing
question_type: court_directed
tests: [a draft with an unlinked paragraph gives a defect with that paragraph's anchor]
author: built-in
review: not reviewed
---

Review the drafts of the matter.

1. Run check_draft on each draft, and check_citations once.
2. Each defect is one item: what is wrong, the evidence, and the action the advocate must take. Its anchors are the paragraph anchor and the record ids the tool returned. A defect that blocks filing has `blocks: true`.
3. Report a citation exactly as the validator reports it. A quick check is not verification. Never say a citation is verified unless the validator said so.

You change no text. Put what you could not check in `not_read`.
