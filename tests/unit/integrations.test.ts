/**
 * Phase 11 (Y1): the integration manifest. The check refuses what the schema does not allow; the
 * registry keeps the state; a refused manifest never enables.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkIntegrationManifest, permissionLine } from "../../src/lib/integrations/index.ts";
import { AdvocateStore } from "../../src/lib/advocate-store/index.ts";

const good = {
  id: "court-search",
  version: "1.0.0",
  title: "Court search",
  description: "Reads a court's cause list through the advocate's own browser session.",
  capabilities: ["court", "fetch"],
  permissions: ["network", "matter.read"],
  inputs: [{ name: "court", type: "string" }],
  outputs: [{ name: "causeList", type: "rows" }],
  events: { emits: ["cause_list.read"], subscribes: ["court.added"] },
  lifecycle: { install: ["create the settings"], enable: ["open a tab"], disable: ["close the tab"], remove: ["keep the record"] },
  audit: { records: ["every fetch"], where: "the matter's trace" },
  failure: { mode: "disable", message: "The court's page did not load; the integration is disabled." },
  disable: { state: "read_only" },
};

test("Y1: a manifest declares its capabilities, permissions, events, lifecycle, audit and failure", () => {
  const check = checkIntegrationManifest(good);
  assert.deepEqual(check.errors, []);
  assert.equal(check.manifest?.id, "court-search");
  assert.equal(check.manifest?.failure.mode, "disable");
  assert.match(permissionLine(check.manifest!), /court, fetch/);
  assert.match(permissionLine(check.manifest!), /network, matter\.read/);
});

test("Y1: an unknown capability or permission, a write with no enable step, a missing failure or version is refused", () => {
  const unknownCap = checkIntegrationManifest({ ...good, capabilities: ["teleport"] });
  assert.ok(unknownCap.errors.some((e) => /unknown capabilities/.test(e)));
  assert.equal(unknownCap.manifest, null);
  const unknownPerm = checkIntegrationManifest({ ...good, permissions: ["root"] });
  assert.ok(unknownPerm.errors.some((e) => /unknown permissions/.test(e)));
  const noEnable = checkIntegrationManifest({ ...good, lifecycle: { ...good.lifecycle, enable: [] } });
  assert.ok(noEnable.errors.some((e) => /needs lifecycle\.enable/.test(e)));
  const noFailure = checkIntegrationManifest({ ...good, failure: {} });
  assert.ok(noFailure.errors.some((e) => /failure\.mode/.test(e)));
  const badVersion = checkIntegrationManifest({ ...good, version: "1.0" });
  assert.ok(badVersion.errors.some((e) => /version must be n\.n\.n/.test(e)));
  const noOutput = checkIntegrationManifest({ ...good, outputs: [] });
  assert.ok(noOutput.errors.some((e) => /outputs must name/.test(e)));
  const noAudit = checkIntegrationManifest({ ...good, audit: {} });
  assert.ok(noAudit.errors.some((e) => /audit\.records/.test(e)));
});

test("Y1: the registry keeps the manifest; a refused one cannot be enabled; enable and disable are human-only", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-integration-"));
  const store = AdvocateStore.open(dir);
  try {
    const record = store.upsertIntegration(good, { actor: "advocate" });
    assert.equal(record.enabled, false);
    assert.equal(record.error, null);
    assert.equal(record.manifest?.id, "court-search");
    const enabled = store.setIntegrationEnabled("court-search", true, { actor: "advocate" });
    assert.equal(enabled.enabled, true);
    assert.throws(() => store.setIntegrationEnabled("court-search", false, { actor: "agent" }), /human|HUMAN/);
    const bad = store.upsertIntegration({ ...good, id: "broken", version: "x" }, { actor: "advocate" });
    assert.ok(bad.error);
    assert.throws(() => store.setIntegrationEnabled("broken", true, { actor: "advocate" }), /INTEGRATION_INVALID/);
    assert.equal(store.integrations().length, 2);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
