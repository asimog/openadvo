/**
 * Phase 6 (P2): the provenance values of citations, facts and sources, and the primary or
 * secondary label. The Indian Kanoon fallback rows are unverified secondary text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationProvenance, CLIENT_FILE, courtRecord, factProvenance, provisionProvenance, sourceLabel } from "../../src/lib/verification/provenance.ts";

test("the provenance of a citation, from its check, attestation and record", () => {
  assert.deepEqual(citationProvenance({ attested: true, outcome: "failed", saved: true }), { value: "advocate_attested", label: null, note: "advocate-attested; not verified" });
  assert.equal(citationProvenance({ attested: false, outcome: "verified", saved: false }).value, "tool_result");
  assert.equal(citationProvenance({ attested: false, outcome: "unresolved", saved: true }).value, "model_knowledge");
  assert.equal(citationProvenance({ attested: false, outcome: null, saved: true }).value, "official_site");
  assert.equal(citationProvenance({ attested: false, outcome: null, saved: false }).value, "model_knowledge");
});

test("the provenance of a fact: where it came from, whatever was later decided", () => {
  assert.equal(factProvenance({ author: "advocate", sourceId: null, anchorId: null }).value, "advocate_provided");
  assert.equal(factProvenance({ author: "system", sourceId: "s1", anchorId: "sha:1:2" }).value, "tool_result");
  assert.equal(factProvenance({ author: "agent", sourceId: null, anchorId: null }).value, "model_knowledge");
});

test("the source labels, from the address", () => {
  assert.equal(sourceLabel("https://www.indiacode.gov.in/x"), "primary_law");
  assert.equal(sourceLabel("https://indiankanoon.org/doc/1"), "unverified_secondary");
  assert.equal(sourceLabel("https://main.sci.gov.in/order"), "official_notification");
  assert.equal(sourceLabel("https://blog.example.com/post"), "commentary");
});

test("the CrPC rows from the Indian Kanoon fallback are unverified secondary text", () => {
  const p = provisionProvenance({ sourceUrl: "https://indiankanoon.org/section/crpc/482", sourceFile: "indiacode:crpc", checkState: "never" });
  assert.equal(p.label, "unverified_secondary");
  assert.match(p.note, /Indian Kanoon/);
  assert.match(p.note, /not verified/);
  const official = provisionProvenance({ sourceUrl: "https://www.indiacode.gov.in/cpc", sourceFile: "indiacode:cpc", checkState: "verified" });
  assert.equal(official.label, "primary_law");
  assert.match(official.note, /verified on re-read/);
});

test("ruling R-5: a client-supplied file is never put through the validator", () => {
  assert.equal(CLIENT_FILE.value, "client_supplied");
  const official = courtRecord("main.sci.gov.in");
  assert.equal(official.value, "official_site");
  assert.equal(official.label, "official_notification");
  const other = courtRecord("example.com");
  assert.equal(other.value, "tool_result");
  assert.equal(other.label, "commentary");
});
