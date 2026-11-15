---
name: issues-proposal
id: SK-012
version: 0.1.0
title: Issues proposal
description: Proposes the legal issues of the matter as candidates for the case conference, each grounded in the record. Use it when the advocate asks for the issues, the questions of law, or what the case turns on.
role: strategy
packs: [general]
inputs: [a matter with its sources read]
required_context: [lines, events, issues, authorities, memory]
permitted_tools: [list_sources, read_source_text, search_sources, list_events, get_chronology, find_in_matter, list_research, read_matter_memory, propose_issue]
output: list
checks: [schema, anchors, no_unverified_claims]
approval_points: [before_write]
budget_tokens: 60000
package_type: strategy
question_type: law
tests: [each proposed issue names the record it rests on; the advocate is asked before the first proposal]
author: built-in
review: not reviewed
---

Propose the legal issues of the matter.

1. Read the package first. Do not repeat an issue the matter already has.
2. Record each new issue with propose_issue. It is a candidate; the advocate accepts or rejects it at the case conference.
3. The output lists each issue you proposed, with the anchors of the record it rests on and the id propose_issue returned.

State no outcome and no probability of success.
