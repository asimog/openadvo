/**
 * Phase 6 (P1): the grounding check — every quote verbatim in an anchored line, fact or
 * statement; every page reference a page the record holds; every authority paragraph in range.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, pageReferences, paragraphReferences, quotedSpans } from "../../src/lib/verification/grounding.ts";

const LINES = [
  { sourceName: "judgment.pdf", page: 1, line: 2, text: "The High Court dismissed the writ petition on 12.03.2024." },
  { sourceName: "judgment.pdf", page: 1, line: 4, text: "Costs follow the event." },
];
const SOURCES = [{ name: "judgment.pdf", pages: [1, 2] }];
const FACTS = [{ id: "f1", text: "The petitioner filed a review petition.", status: "confirmed" }];
const EVIDENCE = [{ id: "ev1", statement: "I filed the review petition myself." }];
const AUTHORITIES = [{ citation: "2024 INSC 23", maxParagraph: 31 }];

test("a verbatim quote is grounded; a touched quote is not", () => {
  const ok = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: 'The court held: "The High Court dismissed the writ petition on 12.03.2024."' }],
    lines: LINES, sources: SOURCES, facts: FACTS, evidence: EVIDENCE, authorities: AUTHORITIES,
  });
  assert.equal(ok.items.length, 0);
  assert.equal(ok.score, 1);

  const touched = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: 'The court held: "The High Court dismissed the writ petition on 12.03.2025."' }],
    lines: LINES, sources: SOURCES, facts: FACTS, evidence: EVIDENCE, authorities: AUTHORITIES,
  });
  assert.equal(touched.items[0]?.kind, "quote_unmatched");
  assert.equal(touched.score, 0);
});

test("a quote a fact or a recorded statement states is grounded too", () => {
  const fromFact = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: '"The petitioner filed a review petition."' }],
    lines: [], sources: [], facts: FACTS, evidence: [], authorities: [],
  });
  assert.equal(fromFact.items.length, 0);
  const fromStatement = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: '"I filed the review petition myself."' }],
    lines: [], sources: [], facts: [], evidence: EVIDENCE, authorities: [],
  });
  assert.equal(fromStatement.items.length, 0);
});

test("a quote shorter than twelve characters is reported, never passed", () => {
  const short = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: 'The word "costs" appears.' }],
    lines: LINES, sources: SOURCES, facts: [], evidence: [], authorities: [],
  });
  assert.equal(short.items[0]?.kind, "quote_too_short");
  assert.equal(short.score, 0);
});

test("a page reference must name a page the record holds", () => {
  const missing = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: "See judgment.pdf, p. 9, l. 3." }],
    lines: LINES, sources: SOURCES, facts: [], evidence: [], authorities: [],
  });
  assert.equal(missing.items[0]?.kind, "page_missing");
  const ok = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: "See judgment.pdf, p. 2, l. 3." }],
    lines: LINES, sources: SOURCES, facts: [], evidence: [], authorities: [],
  });
  assert.equal(ok.items.length, 0);
});

test("a paragraph cited for a saved authority must exist in its indexed judgment", () => {
  const beyond = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: "2024 INSC 23, paragraph 44 settles this." }],
    lines: LINES, sources: SOURCES, facts: [], evidence: [], authorities: AUTHORITIES,
  });
  assert.equal(beyond.items[0]?.kind, "authority_paragraph_missing");
  const inRange = checkGrounding({
    paragraphs: [{ anchor: "oa-1", text: "2024 INSC 23, paragraph 15 settles this." }],
    lines: LINES, sources: SOURCES, facts: [], evidence: [], authorities: AUTHORITIES,
  });
  assert.equal(inRange.items.length, 0);
});

test("the reference finders", () => {
  assert.deepEqual(quotedSpans('He said "the petitioner knew" and left.'), ["the petitioner knew"]);
  assert.deepEqual(pageReferences("see p. 12 and page 3, l. 4"), [
    { page: 12, line: null },
    { page: 3, line: 4 },
  ]);
  assert.deepEqual(paragraphReferences("para 4 and paragraph 17"), [4, 17]);
});
