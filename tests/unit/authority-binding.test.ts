/** E5: the binding-effect check. Facts and reasons; never one numeric score. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingEffect, type BindingQuestion } from "../../src/lib/authority/binding.ts";
import type { AuthorityFacts } from "../../src/shared/law.ts";

const sc: AuthorityFacts = { court: "sc", courtName: "Supreme Court of India", decisionDate: "2023-01-10", benchStrength: 3, role: "ratio" };
const delhi: AuthorityFacts = { court: "hc", courtName: "High Court of Delhi", decisionDate: "2020-05-01", benchStrength: 2, role: "ratio" };
const forum: BindingQuestion = { court: "delhi-high-court", jurisdiction: "delhi", territory: "delhi", date: "2026-11-18" };

test("E5: the Supreme Court binds every court; a High Court binds its own territory", () => {
  const top = bindingEffect(sc, forum);
  assert.equal(top.label, "binding");
  assert.match(top.reasons.join(" "), /Supreme Court/);
  assert.equal(bindingEffect(delhi, forum).label, "binding");
  assert.equal(bindingEffect(delhi, { ...forum, court: "sc", territory: "delhi" }).label, "persuasive");
  assert.equal(bindingEffect(delhi, { court: "punjab-high-court", territory: "punjab", date: "2026-11-18" }).label, "persuasive");
});

test("E5: a dissent and a counsel's submission never bind; obiter is persuasive", () => {
  assert.equal(bindingEffect({ ...sc, role: "dissent" }, forum).label, "not_binding");
  assert.equal(bindingEffect({ ...sc, role: "submission" }, forum).label, "not_binding");
  assert.equal(bindingEffect({ ...sc, role: "obiter" }, forum).label, "persuasive");
  assert.match(bindingEffect({ ...sc, role: "dissent" }, forum).reasons.join(" "), /dissent/);
});

test("E5: an overruled authority is not binding, and a later decision cannot govern an earlier date", () => {
  assert.equal(bindingEffect({ ...sc, treatment: "overruled by (2025) 1 SCC 1" }, forum).label, "not_binding");
  assert.equal(bindingEffect(sc, { ...forum, date: "2020-01-01" }).label, "not_binding");
  assert.match(bindingEffect(sc, { ...forum, date: "2020-01-01" }).reasons.join(" "), /later than the governing date/);
});

test("E5: a missing fact gives undetermined, never a guess", () => {
  const noDate = bindingEffect({ ...sc, decisionDate: null }, forum);
  assert.equal(noDate.label, "undetermined");
  assert.deepEqual(noDate.unresolved, ["decision date"]);
  const noCourt = bindingEffect({ ...delhi, courtName: null }, forum);
  assert.equal(noCourt.label, "undetermined");
  assert.ok(noCourt.unresolved.includes("High Court and its territory"));
  const noForum = bindingEffect(delhi, { court: "", date: "2026-11-18" });
  assert.equal(noForum.label, "undetermined");
  assert.deepEqual(noForum.unresolved, ["the forum court"]);
});
