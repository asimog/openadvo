---
name: contradiction-report
id: SK-011
version: 0.1.0
title: Contradiction report
description: Lists the date conflicts, the events that are not confirmed, and the dates that are inferred or read by OCR, each with its source line and what the advocate must decide. Use it when the advocate asks to check the chronology, the dates or the contradictions in the record.
role: chronology
packs: [general]
inputs: [a matter with events in its Notebook]
required_context: [events, conflicts, lines]
permitted_tools: [list_sources, read_source_text, search_sources, list_events, get_chronology, find_in_matter]
output: list
checks: [schema, anchors]
approval_points: []
budget_tokens: 40000
package_type: evidence_review
question_type: happened
tests: [a matter with a date conflict lists that conflict first, with both lines]
author: built-in
review: not reviewed
---

Test the chronology of the matter.

1. Each date conflict is one item, with the anchors of both sides. Mark it `blocks: true`.
2. Each event that is still a candidate, or whose date is inferred or read by OCR, is one item with its event id and its source anchor.
3. In each item's detail, say what the advocate must decide. Change nothing.

Put what you could not read in `not_read`.
