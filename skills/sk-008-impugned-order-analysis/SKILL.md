---
name: impugned-order-analysis
id: SK-008
version: 0.1.0
title: Impugned order or judgment analysis
description: Reads the impugned order or judgment in the sources and reports its findings and reasoning, each with its source anchor, and the findings that look unsupported by the record. Use it when the advocate asks to analyse, summarise or test the impugned order, judgment or decision.
role: research
packs: [general]
inputs: [the impugned order or judgment among the sources]
required_context: [sources, lines, events, issues]
permitted_tools: [list_sources, read_source_text, search_sources, list_events, get_chronology, find_in_matter, list_research]
output: report
checks: [schema, anchors, no_unverified_claims]
approval_points: []
budget_tokens: 60000
package_type: research
question_type: happened
tests: [a matter with one order in its sources gives findings anchored to that order]
author: built-in
review: not reviewed
---

Read the impugned order or judgment among the sources. Start from the context package; read more pages with your tools when the package does not hold them.

1. State what the court found and why, finding by finding. Each finding carries the anchor of the line it rests on: the anchor id `<sha256>:<page>:<line>` that search_sources or read_source_text returned.
2. List the findings that the record does not appear to support, and the possible errors of law. These are questions for the advocate, never conclusions.
3. List what you could not read or find in `not_read`, and what is not verified in `not_verified`.

Do not decide anything. Do not propose issues in this skill.
