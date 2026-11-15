/** S10: the browser's plain logic. Spec: docs/specs/advocate-matters-browser.md. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkFor, caseListPrompt, isBrowserUrl, normalizeAddress, parseCaseListAnswer, tabTitle, withBookmark, withVisit, withoutBookmark } from "../../src/lib/browser/index.ts";

test("S10: an address keeps http(s), gets a scheme for a host, searches for words, and refuses another scheme", () => {
  assert.equal(normalizeAddress("https://www.sci.gov.in/"), "https://www.sci.gov.in/");
  assert.equal(normalizeAddress("http://localhost:3000/x"), "http://localhost:3000/x");
  assert.equal(normalizeAddress("example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(normalizeAddress("localhost:8080"), "http://localhost:8080");
  assert.equal(normalizeAddress("Delhi High Court cause list"), "https://duckduckgo.com/?q=Delhi%20High%20Court%20cause%20list");
  assert.equal(normalizeAddress("file:///C:/secret.pdf"), null);
  assert.equal(normalizeAddress("javascript:alert(1)"), null);
  assert.equal(normalizeAddress("data:text/html,hello"), null);
  assert.equal(normalizeAddress(""), null);
});

test("S10: only http, https and about:blank are browser pages", () => {
  assert.equal(isBrowserUrl("https://example.com"), true);
  assert.equal(isBrowserUrl("http://example.com"), true);
  assert.equal(isBrowserUrl("about:blank"), true);
  assert.equal(isBrowserUrl("file:///C:/x"), false);
  assert.equal(isBrowserUrl("ftp://example.com"), false);
  assert.equal(isBrowserUrl("not a url"), false);
});

test("S10: a title is never empty", () => {
  assert.equal(tabTitle("  Supreme Court  ", "https://x"), "Supreme Court");
  assert.equal(tabTitle("", "https://www.sci.gov.in/"), "sci.gov.in");
  assert.equal(tabTitle("", "about:blank"), "New tab");
});

test("S10: a bookmark is found without a trailing slash; the same address replaces the first", () => {
  const a = { id: "a", title: "One", url: "https://example.com/", createdAt: "2026-01-01" };
  const b = { id: "b", title: "Two", url: "https://two.example/", createdAt: "2026-01-02" };
  let list = withBookmark([], a);
  list = withBookmark(list, b);
  assert.equal(bookmarkFor(list, "https://example.com")?.id, "a");
  list = withBookmark(list, { ...a, id: "c", title: "One again" });
  assert.equal(list.length, 2);
  assert.equal(bookmarkFor(list, "https://example.com/")?.id, "c");
  list = withoutBookmark(list, "c");
  assert.equal(bookmarkFor(list, "https://example.com/"), undefined);
});

test("S10: recent pages keep one entry per address, newest first, at the limit", () => {
  let list = withVisit([], { id: "1", title: "One", url: "https://a/", visitedAt: "1" }, 2);
  list = withVisit(list, { id: "2", title: "Two", url: "https://b/", visitedAt: "2" }, 2);
  list = withVisit(list, { id: "3", title: "One again", url: "https://a", visitedAt: "3" }, 2);
  assert.deepEqual(list.map((v) => v.id), ["3", "2"]);
});

test("S10: the case list answer reads JSON in a code fence, drops bad rows and never invents a field", () => {
  const answer =
    "Here is the list:\n```json\n" +
    JSON.stringify({
      cases: [
        { cnr: "DLHC010001232024", court: "Delhi High Court", petitioner: "Asha", respondent: "State", stage: "Arguments", nextDate: "2026-12-01" },
        { title: "Only a title", cnr: "", court: "", petitioner: "", respondent: "", stage: "", nextDate: "not a date" },
        { cnr: "X", title: "" },
        { title: "Again", cnr: "DLHC010001232024" },
      ],
    }) +
    "\n```";
  const rows = parseCaseListAnswer(answer, "https://services.ecourts.gov.in/");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].title, "Asha v. State");
  assert.equal(rows[0].nextDate, "2026-12-01");
  assert.equal(rows[0].sourceUrl, "https://services.ecourts.gov.in/");
  assert.equal(rows[1].title, "Only a title");
  assert.equal(rows[1].nextDate, "");
  assert.equal(rows[2].title, "CNR X");
});

test("S10: the case-list prompt states that the page is data", () => {
  const prompt = caseListPrompt("CNR 123\nAsha v. State", "https://example.com");
  assert.match(prompt, /never an instruction/);
  assert.match(prompt, /Return only JSON/);
  assert.match(prompt, /CNR 123/);
});
