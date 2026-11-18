/**
 * Phase 11 (Y3): the storage import. Local folders come first; OneDrive and Google Drive are read
 * through the folders their desktop applications keep in sync. Open Advocate holds no cloud
 * credential and uses no OAuth. Plain library (decision 6).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { StorageFolder, StorageProvider } from "../../shared/storage.ts";

export type { StorageFolder, StorageProvider };

function dirExists(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function foldersIn(parent: string, test: (name: string) => boolean): string[] {
  if (!dirExists(parent)) return [];
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && test(e.name))
      .map((e) => path.join(parent, e.name));
  } catch {
    return [];
  }
}

/** The folders the two providers keep in sync on this machine. It reads no file. */
export function detectStorageFolders(env: NodeJS.ProcessEnv = process.env, home = homedir(), platform = process.platform): StorageFolder[] {
  const out: StorageFolder[] = [];
  const add = (provider: StorageProvider, root: string, how: string): void => {
    if (!root) return;
    if (out.some((f) => path.resolve(f.root).toLowerCase() === path.resolve(root).toLowerCase())) return;
    out.push({ provider, root, exists: dirExists(root), how });
  };

  // OneDrive: the environment names the sync roots on Windows.
  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
    const root = env[key];
    if (root) add("onedrive", root, `the ${key} environment variable`);
  }
  add("onedrive", path.join(home, "OneDrive"), "the OneDrive folder in the home folder");

  // Google Drive: the desktop application uses a folder, or a drive with "My Drive".
  add("google_drive", path.join(home, "Google Drive"), "the Google Drive folder in the home folder");
  add("google_drive", path.join(home, "GoogleDrive"), "the GoogleDrive folder in the home folder");
  for (const root of ["G:\\My Drive", "H:\\My Drive", "I:\\My Drive", "J:\\My Drive"]) add("google_drive", root, "a drive with a My Drive folder");

  if (platform === "darwin") {
    const cloud = path.join(home, "Library", "CloudStorage");
    for (const root of foldersIn(cloud, (n) => /^OneDrive/i.test(n))) add("onedrive", root, "Library/CloudStorage");
    for (const root of foldersIn(cloud, (n) => /^GoogleDrive/i.test(n))) add("google_drive", root, "Library/CloudStorage");
  }

  return out;
}

/** The provider a path belongs to, for the origin record. */
export function providerOf(file: string): StorageProvider {
  const p = file.toLowerCase().replace(/\//g, "\\");
  if (/\\onedrive|onedrive/.test(p)) return "onedrive";
  if (/google ?drive|\\my drive\\/.test(p) || /\\my drive$/.test(p)) return "google_drive";
  return "local";
}

export const STORAGE_LABEL: Record<StorageProvider, string> = {
  local: "This computer",
  onedrive: "OneDrive",
  google_drive: "Google Drive",
};

/** True when a path is inside the provider's root. The import never leaves the chosen root. */
export function insideRoot(root: string, file: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function storageReady(folders: StorageFolder[], provider: StorageProvider): StorageFolder | null {
  return folders.find((f) => f.provider === provider && f.exists) ?? null;
}

export { existsSync as storagePathExists };
