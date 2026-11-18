---
name: citation-grounding-review
id: SK-027
version: 0.2.0
title: Citation and grounding review
description: Runs the draft checks and the citation validator on the drafts and lists every defect with its evidence and the action it needs. Use it when the advocate asks to check, review or verify a draft, its citations or its grounding before filing.
role: review
packs: [general]
inputs: [a matter with at least one draft]
required_context: [drafts, authorities, issues, preferences]
permitted_tools: [list_sources, read_draft, get_paragraph_source, check_draft, check_citations, quick_check_citations, list_research, find_in_matter, list_preferences]
output: list
checks: [schema, anchors, no_unverified_claims, severity_floor]
approval_points: []
budget_tokens: 60000
package_type: filing
question_type: court_directed
tests: [a draft with an unlinked paragraph gives a defect with that paragraph's anchor; an item that reports a blocking defect as not blocking fails the severity floor]
author: built-in
review: not reviewed
---

Review the drafts of the matter.

1. Run check_draft on each draft, and check_citations once.
2. Each defect is one item: what is wrong, the evidence, and the action the advocate must take. Carry the defect's `kind` exactly as the tool reported it, and set `blocks` exactly as the tool's reviewer note says (the severity floor fails an item that lowers one). Its anchors are the paragraph anchor and the record ids the tool returned.
3. Report a citation exactly as the validator reports it. A quick check is not verification. Never say a citation is verified unless the validator said so.
4. Read list_preferences once: if the citation format is not approved, ask the advocate for it (once, inside this run) and propose the answer with propose_preference.
5. Say the coverage of the citation checks as check_citations reports it: checked N of M.

You change no text. Put what you could not check in `not_read`.
