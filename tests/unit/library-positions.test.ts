/**
 * Phase 10 (M2): the library in use. A role puts an item to work; an approved precedent is
 * offered first, with the court and the scope, and a rejected item is never offered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryRole, libraryRoles, rankPrecedents, topPrecedents } from "../../src/lib/library/positions.ts";
import type { LibraryItem } from "../../src/shared/stores.ts";

function item(over: Partial<LibraryItem> & { id: string; title: string; kind: LibraryItem["kind"] }): LibraryItem {
  return {
    status: "unreviewed",
    author: "",
    itemDate: "",
    matterId: null,
    court: "",
    scope: "",
    sourceName: `${over.title}.docx`,
    sha256: `sha-${over.id}`,
    size: 1,
    notes: "",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const items: LibraryItem[] = [
  item({ id: "p-1", title: "Bail is the rule", kind: "proposition", status: "approved" }),
  item({ id: "p-2", title: "Delay defeats bail", kind: "proposition", status: "rejected" }),
  item({ id: "b-1", title: "Delhi bail checklist", kind: "checklist", status: "reviewed" }),
  item({ id: "s-1", title: "Delhi High Court bail form", kind: "template", status: "approved", court: "in.hc.delhi", scope: "bail" }),
  item({ id: "s-2", title: "Bombay High Court bail form", kind: "template", status: "approved", court: "in.hc.bombay", scope: "bail" }),
  item({ id: "e-1", title: "Do not cite a repealed section", kind: "note", status: "reviewed", tags: ["common-error"] }),
  item({ id: "x-1", title: "A judgment copy", kind: "judgment", status: "approved" }),
  item({ id: "r-1", title: "Rejected bail form", kind: "template", status: "rejected", court: "in.hc.delhi" }),
];

test("M2: an item gets one role from its kind, status, court and tags", () => {
  assert.equal(libraryRole(items[0]), "position");
  assert.equal(libraryRole(items[2]), "playbook");
  assert.equal(libraryRole(items[3]), "precedent");
  assert.equal(libraryRole(items[5]), "common_error");
  assert.equal(libraryRole(items[6]), "other");
  assert.equal(libraryRole(items[7]), "drafting_style");
  const groups = libraryRoles(items);
  assert.deepEqual(groups.map((g) => g.role), ["position", "playbook", "drafting_style", "common_error", "precedent", "other"]);
  assert.equal(groups.find((g) => g.role === "position")!.items.length, 2);
});

test("M2: the approved precedent of the matter's court is offered first, with its scope", () => {
  const offers = rankPrecedents(items, { court: "in.hc.delhi", proceeding: "Bail application", practiceArea: "criminal" });
  assert.equal(offers[0].id, "s-1");
  assert.match(offers[0].reason, /approved/);
  assert.match(offers[0].reason, /for in\.hc\.delhi/);
  assert.match(offers[0].reason, /covers Bail application/);
  assert.equal(offers.find((o) => o.id === "r-1"), undefined);
  assert.equal(offers.find((o) => o.id === "p-1"), undefined);
});

test("M2: a rejected or withdrawn item is never offered; an unreviewed one is offered last", () => {
  const all = [
    item({ id: "u-1", title: "Unreviewed bail form", kind: "pleading", status: "unreviewed", court: "in.hc.delhi" }),
    item({ id: "w-1", title: "Withdrawn form", kind: "pleading", status: "withdrawn" }),
    item({ id: "t-1", title: "Superseded form", kind: "template", status: "superseded" }),
    item({ id: "a-1", title: "Approved form", kind: "pleading", status: "approved", court: "in.hc.delhi" }),
  ];
  const offers = rankPrecedents(all, { court: "in.hc.delhi", proceeding: "Bail application", practiceArea: "criminal" });
  assert.deepEqual(offers.map((o) => o.id), ["a-1", "u-1"]);
  assert.match(offers[1].reason, /unreviewed/);
  assert.equal(topPrecedents(all, { court: "in.hc.delhi", proceeding: "Bail", practiceArea: "criminal" }, 1).length, 1);
});

test("M2: the precedent order is stable and the date breaks a tie", () => {
  const two = [
    item({ id: "a", title: "Older", kind: "pleading", status: "approved", court: "in.hc.delhi", itemDate: "2020-01-01" }),
    item({ id: "b", title: "Newer", kind: "pleading", status: "approved", court: "in.hc.delhi", itemDate: "2024-01-01" }),
  ];
  assert.deepEqual(rankPrecedents(two, { court: "in.hc.delhi", proceeding: "", practiceArea: "" }).map((o) => o.id), ["b", "a"]);
});
