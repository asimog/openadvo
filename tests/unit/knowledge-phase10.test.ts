/**
 * RAG-3: the Phase 10 Knowledge Library and advocate memory as real knowledge scopes. A library
 * item tied to a matter, or a rejected library item, never crosses. Only confirmed advocate
 * memory and approved preferences are returned as confirmed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { advocateAdapter, libraryAdapter } from "../../src/lib/knowledge/adapters.ts";
import { parseQuery, runRetrieval, type KnowledgeRegistry } from "../../src/lib/knowledge/index.ts";
import { createPhase5Knowledge } from "../../src/lib/knowledge/skeleton.ts";
import { LawStore } from "../../src/lib/law-store/index.ts";
import type { LibraryItem, MemoryRecord, PreferenceRecord } from "../../src/shared/stores.ts";

function libraryItem(over: Partial<LibraryItem> & Pick<LibraryItem, "id" | "title">): LibraryItem {
  return {
    kind: "pleading",
    status: "approved",
    author: "A. Advocate",
    itemDate: "2026-01-01",
    matterId: null,
    court: "High Court of Delhi",
    scope: "bail",
    sourceName: `${over.id}.docx`,
    sha256: "a".repeat(64),
    size: 100,
    notes: "",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function memory(over: Partial<MemoryRecord> & Pick<MemoryRecord, "memoryId" | "subject" | "object">): MemoryRecord {
  return {
    type: "court_practice",
    relation: "is",
    sourceId: null,
    matterId: null,
    recordedAt: "2026-01-01T00:00:00.000Z",
    validFrom: null,
    validUntil: null,
    confidence: null,
    status: "confirmed",
    scope: "advocate",
    supersedes: null,
    proposedBy: "advocate",
    ...over,
  };
}

function preference(over: Partial<PreferenceRecord> & Pick<PreferenceRecord, "id" | "key" | "value">): PreferenceRecord {
  return {
    reason: "the advocate approved it",
    status: "approved",
    proposedBy: "advocate",
    createdAt: "2026-01-01T00:00:00.000Z",
    decidedAt: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

const firm = {
  library: () => [
    libraryItem({ id: "approved", title: "Delhi bail application precedent", status: "approved" }),
    libraryItem({ id: "reviewed", title: "Bail application checklist", status: "reviewed", kind: "checklist" }),
    libraryItem({ id: "rejected", title: "Rejected bail note", status: "rejected" }),
    libraryItem({ id: "superseded", title: "Old bail precedent", status: "superseded" }),
    libraryItem({ id: "client", title: "Client bail application", matterId: "m-1" }),
  ],
};

const advocate = {
  memory: (status?: string) => [
    memory({ memoryId: "m-court", subject: "the Delhi High Court", object: "lists bail on a custody ground first", status: "confirmed" }),
    memory({ memoryId: "m-proposed", subject: "the client", object: "press the custody ground", status: "proposed" }),
    memory({ memoryId: "m-expired", subject: "an old practice", object: "no longer used", status: "confirmed", validUntil: "2020-01-01" }),
  ].filter((record) => !status || record.status === status),
  preferences: () => [
    preference({ id: "p-cite", key: "citation_format", value: "neutral citation first" }),
    preference({ id: "p-rejected", key: "drafting_style", value: "long paragraphs", status: "rejected" }),
  ],
};

test("RAG-3 firm: only a non-matter, non-rejected library record is returned; approved comes first", async () => {
  const adapter = libraryAdapter(firm);
  const [list] = await adapter.search(parseQuery("bail application precedent"), { limit: 10, vector: null });
  const hits = list?.hits ?? [];
  assert.equal(hits[0].title, "Delhi bail application precedent");
  assert.ok(hits.every((hit) => hit.scope === "firm"));
  assert.ok(hits.every((hit) => hit.anchor.startsWith("library:")));
  assert.ok(!hits.some((hit) => hit.title === "Rejected bail note"));
  assert.ok(!hits.some((hit) => hit.title === "Old bail precedent"));
  assert.ok(!hits.some((hit) => hit.title === "Client bail application"));
  assert.equal(adapter.health?.().state, "ready");
});

test("RAG-3 advocate: only confirmed memory and approved preferences are returned; a stale record is marked", async () => {
  const adapter = advocateAdapter(advocate);
  const [list] = await adapter.search(parseQuery("custody ground citation format"), { limit: 10, vector: null });
  const hits = list?.hits ?? [];
  assert.ok(hits.some((hit) => hit.title === "court practice: the Delhi High Court"));
  assert.ok(hits.some((hit) => hit.title === "Preference: citation_format"));
  assert.ok(hits.every((hit) => hit.scope === "advocate"));
  assert.ok(hits.every((hit) => hit.anchor.startsWith("advocate:")));
  assert.ok(!hits.some((hit) => hit.text.includes("long paragraphs")));
  const stale = await adapter.search(parseQuery("no longer used"), { limit: 10, vector: null });
  assert.equal(stale[0]?.hits[0]?.stale, true);
  assert.equal(adapter.health?.().state, "ready");
});

test("RAG-3 registry: the production registry searches the firm and advocate scopes and leaves the session deferred", async () => {
  const law = new LawStore(new DatabaseSync(":memory:"));
  const registry: KnowledgeRegistry = createPhase5Knowledge({ law, firm, advocate });
  const health = new Map(registry.health().map((row) => [row.scope, row]));
  assert.equal(health.get("firm")?.state, "ready");
  assert.equal(health.get("advocate")?.state, "ready");
  assert.equal(health.get("session")?.state, "deferred");

  const result = await runRetrieval(registry, "bail application custody ground citation format", { scopes: ["firm", "advocate"], limit: 10 });
  assert.ok(result.hits.some((hit) => hit.scope === "firm" && hit.title === "Delhi bail application precedent"));
  assert.ok(result.hits.some((hit) => hit.scope === "advocate" && hit.title === "Preference: citation_format"));
  assert.deepEqual(result.coverage.searched.sort(), ["advocate", "firm"]);
  assert.equal(result.coverage.partial, false);
});
