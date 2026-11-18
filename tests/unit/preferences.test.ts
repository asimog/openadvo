/**
 * Phase 6 (A7): the learned preferences — the keys, the ask-once questions, the correction-driven
 * proposals, the applied-because notes, and the citation format the draft uses (L5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";
import {
  appliedBecause,
  correctionPreference,
  defaultUsed,
  formatCitation,
  normaliseReason,
  PREFERENCE_KEYS,
  preferenceKeyOf,
  preferenceQuestions,
} from "../../src/lib/preferences/index.ts";

function store(): AdvocateStore {
  return AdvocateStore.open(mkdtempSync(path.join(tmpdir(), "prefs-")));
}

test("the keys: each asks once, inside the task where it matters, and names its default", () => {
  assert.equal(PREFERENCE_KEYS.length, 7);
  const citation = preferenceKeyOf("citation_format");
  assert.ok(citation);
  assert.equal(citation.default, "neutral_first");
  assert.ok(citation.mattersIn.includes("citation"));
  assert.equal(preferenceKeyOf("no_such_key"), null);
});

test("the ask-once flow: propose with the advocate's answer, then approve it", () => {
  const s = store();
  const proposed = s.proposePreference(
    { key: "citation_format", value: "neutral_first", reason: "answered inside the draft check on 2026-11-18" },
    { actor: "agent" },
  );
  assert.equal(proposed.status, "proposed");
  const approved = s.decidePreference(proposed.id, "approved", { actor: "advocate" });
  assert.equal(approved.status, "approved");
  assert.match(approved.reason, /answered inside the draft check/);
});

test("the questions a task returns: every named key with no approved value", () => {
  const s = store();
  s.proposePreference({ key: "citation_format", value: "neutral_first", reason: "the advocate answered" }, { actor: "agent" });
  s.decidePreference((s.preferences()[0] ?? { id: "" }).id, "approved", { actor: "advocate" });
  const approved: Record<string, unknown> = {};
  for (const p of s.preferences()) if (p.status === "approved") approved[p.key] = p.value;
  const questions = preferenceQuestions(["citation_format", "paragraph_length"], approved);
  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.key, "paragraph_length");
  assert.deepEqual(questions[0]?.values, ["short", "medium", "long"]);
});

test("the second identical correction proposes the matching preference", () => {
  assert.deepEqual(correctionPreference("Use the neutral citation first"), { key: "citation_format", value: "neutral_first" });
  assert.deepEqual(correctionPreference("Shorter paragraphs please"), { key: "paragraph_length", value: "short" });
  assert.equal(correctionPreference("Structure: facts, then grounds")?.key, "pleading_structure");
  assert.equal(correctionPreference("Write in a plain style, no Latin")?.key, "drafting_style");
  assert.equal(normaliseReason("  Shorter   Paragraphs please. "), "shorter paragraphs please");
  assert.equal(correctionPreference(""), null);
});

test("the applied-because note and the default notice", () => {
  assert.equal(appliedBecause("citation_format", "neutral_first", "the advocate asked for it"), "applied because citation_format: neutral_first (the advocate asked for it)");
  assert.equal(appliedBecause("paragraph_length", "short", null), "applied because paragraph_length: short (no reason recorded with the preference)");
  assert.match(defaultUsed("citation_format"), /no citation_format preference is approved: the default neutral_first was used/);
});

test("the citation takes the advocate's format (L5)", () => {
  const a = { citation: "2024 INSC 23", parties: "X v Y", paragraph: "15" };
  assert.equal(formatCitation(a, "neutral_first"), "2024 INSC 23, X v Y, paragraph 15");
  assert.equal(formatCitation(a, "parties_first"), "X v Y (2024 INSC 23), paragraph 15");
  const bare = { citation: "2024 INSC 23", parties: "", paragraph: "" };
  assert.equal(formatCitation(bare, "neutral_first"), "2024 INSC 23");
});
