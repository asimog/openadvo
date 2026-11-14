/** V5-19 to V5-25: hearings, reminders, policy, parties, contacts, local models, diagnostics. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MatterStore } from "../../src/lib/matter-store/index.ts";
import { Contacts } from "../../src/lib/contacts/index.ts";
import { isLocalModel } from "../../src/main/agent.ts";
import { diagnosticsEntries } from "../../src/main/practice.ts";

const adv = { actor: "advocate" as const };

test("the store: hearings keep confirmed and inferred dates apart; reminders, policy, usage and parties", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-v5e-"));
  const store = await MatterStore.create(path.join(root, "m"), "Practice", adv);
  try {
    const h = store.addHearing({ date: "2026-11-10", bench: "Two judges", directions: "Counter in four weeks", nextDate: "2026-12-08", nextDateStatus: "inferred", notes: "" }, adv);
    assert.equal(h.nextDateStatus, "inferred");
    assert.throws(() => store.addHearing({ date: "10/11/2026", bench: "", directions: "", nextDate: "", nextDateStatus: "confirmed", notes: "" }, adv), /BAD_DATE/);
    assert.throws(() => store.addHearing({ date: "2026-11-10", bench: "", directions: "", nextDate: "", nextDateStatus: "confirmed", notes: "" }, { actor: "agent" }), /HUMAN_ONLY/);
    const r = store.addReminder("File the rejoinder", "2026-11-16T04:30:00.000Z", adv);
    store.setReminderStatus(r.id, "notified", { actor: "system" });
    assert.throws(() => store.setReminderStatus(r.id, "done", { actor: "agent" }), /HUMAN_ONLY/);
    store.setReminderStatus(r.id, "done", adv);
    assert.equal(store.reminders()[0].status, "done");
    assert.deepEqual(store.setPolicy({ confidential: true, budgetTokens: 5000 }, adv), { confidential: true, budgetTokens: 5000 });
    assert.deepEqual(store.setPolicy({ confidential: false, budgetTokens: -3 }, adv), { confidential: false, budgetTokens: null });
    store.appendEvent({ actor: "agent" }, "agent.usage", null, { totalTokens: 1200, cost: 0.002 });
    store.appendEvent({ actor: "agent" }, "agent.usage", null, { totalTokens: 800, cost: 0.001 });
    assert.deepEqual(store.usage(), { runs: 2, tokens: 2000, cost: 0.003 });
    store.addParty("c1", "client", "RAM KUMAR", adv);
    assert.equal(store.parties()[0].nameInRecord, "RAM KUMAR");
    assert.equal(store.markImpactChecked("s1"), true);
    assert.equal(store.markImpactChecked("s1"), false);
    assert.equal(store.verifyChain().ok, true);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
});

test("contacts: one per name; kinds checked; removal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-contacts-"));
  try {
    const c = new Contacts(path.join(root, "contacts.json"));
    const a = c.add({ name: "Ram  Kumar", kind: "client" });
    assert.equal(c.add({ name: "ram kumar", kind: "client" }).id, a.id, "the same name is the same contact");
    assert.throws(() => c.add({ name: "X", kind: "judge" }), /BAD_KIND/);
    assert.equal(c.findByName("RAM KUMAR")?.id, a.id);
    assert.deepEqual(c.remove(a.id), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a local model is one served on this computer", () => {
  assert.equal(isLocalModel({ baseUrl: "http://localhost:11434/v1" }), true);
  assert.equal(isLocalModel({ baseUrl: "http://127.0.0.1:1234/v1" }), true);
  assert.equal(isLocalModel({ baseUrl: "https://opencode.ai/zen/v1" }), false);
  assert.equal(isLocalModel({}), false);
});

test("the diagnostics file leaves out the mailbox and holds no matter content", () => {
  const entries = diagnosticsEntries({ app: "1.1.0" }, { model: "x", mail: { host: "imap.example.com", user: "aor@example.com" } }, 3);
  assert.deepEqual(entries.map((e) => e.name), ["versions.json", "settings.json", "log.txt", "matters.json"]);
  const settings = new TextDecoder().decode(entries[1].bytes);
  assert.ok(!settings.includes("aor@example.com"));
  assert.equal(new TextDecoder().decode(entries[3].bytes), JSON.stringify({ matters: 3 }, null, 2));
});
