/**
 * Phase 11 (Y3): the storage folders. OneDrive and Google Drive are read through their synced
 * folders; no cloud credential is held and no OAuth is used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectStorageFolders, insideRoot, providerOf, storageReady } from "../../src/lib/storage/index.ts";

test("Y3: the OneDrive environment and a Google Drive folder are detected, and a missing one says so", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "oa-store-home-"));
  const one = path.join(home, "OneDrive - Firm");
  await mkdir(one, { recursive: true });
  try {
    const folders = detectStorageFolders({ OneDrive: one } as NodeJS.ProcessEnv, home, "win32");
    const od = folders.find((f) => f.provider === "onedrive");
    assert.equal(od?.root, one);
    assert.equal(od?.exists, true);
    assert.match(od?.how ?? "", /OneDrive environment variable/);
    const missing = detectStorageFolders({} as NodeJS.ProcessEnv, home, "win32").find((f) => f.provider === "google_drive");
    assert.equal(missing?.exists, false);
    assert.equal(storageReady(folders, "onedrive")?.root, one);
    assert.equal(storageReady(folders, "google_drive"), null);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Y3: the CloudStorage folders of macOS are read", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "oa-store-mac-"));
  const cloud = path.join(home, "Library", "CloudStorage");
  await mkdir(path.join(cloud, "OneDrive-Firm"), { recursive: true });
  await mkdir(path.join(cloud, "GoogleDrive-firm@example.com"), { recursive: true });
  try {
    const folders = detectStorageFolders({} as NodeJS.ProcessEnv, home, "darwin");
    assert.ok(folders.some((f) => f.provider === "onedrive" && f.exists));
    assert.ok(folders.some((f) => f.provider === "google_drive" && f.exists));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Y3: the provider of an origin and the root check", () => {
  assert.equal(providerOf("C:\\Users\\a\\OneDrive - Firm\\brief.pdf"), "onedrive");
  assert.equal(providerOf("G:\\My Drive\\briefs\\brief.pdf"), "google_drive");
  assert.equal(providerOf("C:\\briefs\\brief.pdf"), "local");
  assert.equal(insideRoot("C:\\Users\\a\\OneDrive", "C:\\Users\\a\\OneDrive\\briefs\\x.pdf"), true);
  assert.equal(insideRoot("C:\\Users\\a\\OneDrive", "C:\\Users\\a\\Desktop\\x.pdf"), false);
});
