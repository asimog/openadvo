/** RAG-2: coverage and the quote-first memorandum. A summary never replaces the source. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adverseQueries, composeResearchMemo, coverageText, hitCitation, type VerifiedQuote } from "../../src/lib/research-workflow/index.ts";
import { verifyQuote } from "../../src/lib/knowledge/quote.ts";
import { citationKeyId } from "../../src/shared/law.ts";
import type { KnowledgeHit, QuoteCheck } from "../../src/shared/law.ts";

const source = "The written statement shall be filed within 30 days of service of summons.";
const quote = "The written statement shall be filed within 30 days";

function verified(): VerifiedQuote {
  const check: QuoteCheck = verifyQuote(quote, source);
  return { hitId: "provision:1", title: "Rule 3, Delhi High Court (Original Side) Rules, 2018", citation: "Delhi High Court (Original Side) Rules, 2018", quote, check };
}

test("RAG-2: the memorandum contains the verified quote, its hash, the adverse authority and the coverage", () => {
  const memo = composeResearchMemo({
    title: "Whether the written statement is in time",
    question: "Was the written statement filed within 30 days?",
    governingDate: "2026-11-18",
    body: "The rule gives 30 days from service.",
    quotes: [verified()],
    adverse: [],
    coverage: "Searched: statute, procedure, research, matter. Deferred: firm (not built). Failed: none. The search is partial.",
    openQuestions: ["When was service effected?"],
  });
  assert.match(memo, /# Whether the written statement is in time/);
  assert.match(memo, /“The written statement shall be filed within 30 days”/);
  assert.match(memo, /SHA-256 [a-f0-9]{64}/);
  assert.match(memo, /## Coverage/);
  assert.match(memo, /partial/);
  assert.match(memo, /When was service effected/);
  assert.match(memo, /does not prove that the passage is the holding/);
});

test("RAG-2: a fabricated quote is unverified and cannot be put in the memorandum", () => {
  const check = verifyQuote("The written statement shall be filed within 90 days", source);
  assert.equal(check.verified, false);
  assert.equal(check.start, null);
  assert.match(check.detail, /not present/);
});

test("RAG-2: the coverage line names searched, deferred, failed and partial", () => {
  const line = coverageText({
    searched: ["statute", "research"],
    deferred: [{ scope: "firm", reason: "deferred to RAG-3" }],
    failed: [{ scope: "procedure", reason: "timeout" }],
    partial: true,
  });
  assert.match(line, /Searched: statute, research/);
  assert.match(line, /Deferred: firm/);
  assert.match(line, /Failed: procedure/);
  assert.match(line, /partial/);
});

test("RAG-2: the negative search asks the contrary questions", () => {
  const queries = adverseQueries("Was the written statement filed in time?");
  assert.equal(queries.length, 5);
  assert.ok(queries.some((query) => /overruled$/.test(query)));
  assert.ok(queries.some((query) => /distinguished$/.test(query)));
  assert.ok(queries.every((query) => !query.endsWith("?")));
  assert.deepEqual(adverseQueries("   "), []);
});

test("RAG-2: a hit citation uses the structured key when it has one", () => {
  const key = { instrument: "ic:test", kind: "section" as const, number: "10", chapter: "I" };
  const hit: KnowledgeHit = { id: "p1", scope: "statute", kind: "section", title: "Section 10", text: "text", anchor: citationKeyId(key), date: null, authority: 0, verification: "", stale: false, score: 0, why: ["text"], citationKey: key };
  assert.match(hitCitation(hit), /Section 10/);
  assert.match(hitCitation(hit), /Chapter I/);
  assert.equal(hitCitation({ ...hit, citationKey: undefined }), citationKeyId(key));
});
