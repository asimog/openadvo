/**
 * Fetch and check the official Euro-Office desktop release for this platform.
 * See docs/euro-office-vendoring.md. Vendored files are never modified.
 *
 * Usage:
 *   node scripts/vendor-euro-office.ts                 download into .vendor-cache/, then stage
 *   node scripts/vendor-euro-office.ts --from <file>   use a local copy of the release file (sha256 still checked)
 *   node scripts/vendor-euro-office.ts --verify        check the staged folder only
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { platformKey, euroOfficePaths, type PlatformKey } from "../src/lib/euro-office/platform.ts";

interface Manifest {
  source: string;
  tag: string;
  commit: string;
  keep: string[];
  required: string[];
  assets: Record<PlatformKey, { name: string; size: number; sha256: string }>;
}

const repo = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(repo, "scripts", "euro-office.manifest.json"), "utf8")) as Manifest;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`vendor-euro-office: ${message}`);
  process.exit(1);
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/** tar that reads zip and tar.xz: the system bsdtar on Windows, the system tar elsewhere. */
function tarBinary(): string {
  if (process.platform === "win32") return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  return "tar";
}

async function download(url: string, target: string): Promise<void> {
  console.log(`downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) fail(`download failed: HTTP ${response.status}`);
  const part = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(part));
  await rename(part, target);
}

/** Find the folder inside an extracted release that holds every kept folder. */
async function findReleaseRoot(dir: string, depth = 0): Promise<string | null> {
  if (manifest.keep.every((k) => existsSync(path.join(dir, k)))) return dir;
  if (depth > 4) return null;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = await findReleaseRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function extract(asset: string, key: PlatformKey, staging: string): Promise<void> {
  await mkdir(staging, { recursive: true });
  if (key === "mac-arm64") {
    // A .dmg is a disk image: mount it read only, copy the kept folders, detach.
    const mount = path.join(staging, "..", "dmg-mount");
    await mkdir(mount, { recursive: true });
    await run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, asset]);
    try {
      const root = await findReleaseRoot(mount);
      if (!root) fail("the disk image holds no editors, converter, fonts and dictionaries folders");
      for (const k of manifest.keep) await run("cp", ["-R", path.join(root, k), path.join(staging, k)]);
    } finally {
      await run("hdiutil", ["detach", mount]);
    }
    return;
  }
  if (asset.endsWith(".zip")) {
    // The Windows zip has the kept folders at its top level: extract only those.
    await run(tarBinary(), ["-xf", asset, "-C", staging, ...manifest.keep]);
    return;
  }
  // tar.xz (Linux): extract all, then keep only the kept folders.
  const all = path.join(staging, "..", "all");
  await mkdir(all, { recursive: true });
  await run(tarBinary(), ["-xJf", asset, "-C", all]);
  const root = await findReleaseRoot(all);
  if (!root) fail("the archive holds no editors, converter, fonts and dictionaries folders");
  for (const k of manifest.keep) await rename(path.join(root, k), path.join(staging, k));
  await rm(all, { recursive: true, force: true });
}

async function verify(dest: string, key: PlatformKey): Promise<void> {
  const p = euroOfficePaths(dest, key.startsWith("win") ? "win32" : "posix");
  const missing = [...manifest.required.map((r) => path.join(dest, r)), p.x2t].filter((f) => !existsSync(f));
  if (missing.length) fail(`missing in ${dest}:\n  ${missing.join("\n  ")}`);
  const sdk = await readFile(path.join(dest, "editors", "sdkjs", "word", "sdk-all-min.js"), "utf8");
  for (const needle of ["getJsApi", "SetTrackRevisions"]) {
    if (!sdk.includes(needle)) fail(`the Word engine has no ${needle}`);
  }
  console.log(`OK: ${dest} holds Euro-Office ${manifest.tag} for ${key}`);
}

const key = platformKey();
const asset = manifest.assets[key];
const dest = path.join(repo, "resources", "euro-office", key);

if (process.argv.includes("--verify")) {
  await verify(dest, key);
  process.exit(0);
}

const lockFile = euroOfficePaths(dest).lock;
if (existsSync(lockFile) && !process.argv.includes("--force")) {
  const lock = JSON.parse(await readFile(lockFile, "utf8")) as { tag: string; sha256: string };
  if (lock.tag === manifest.tag && lock.sha256 === asset.sha256) {
    await verify(dest, key);
    process.exit(0);
  }
}

let file = arg("--from");
if (!file) {
  const cache = path.join(repo, ".vendor-cache");
  await mkdir(cache, { recursive: true });
  file = path.join(cache, asset.name);
  if (!existsSync(file) || (await stat(file)).size !== asset.size) {
    await download(`${manifest.source}/releases/download/${manifest.tag}/${asset.name}`, file);
  }
}
console.log(`checking ${file}`);
const actual = await sha256(file);
if (actual !== asset.sha256) fail(`sha256 mismatch for ${file}: expected ${asset.sha256}, got ${actual}`);

const work = path.join(repo, "resources", "euro-office", `.staging-${key}`);
await rm(work, { recursive: true, force: true });
const staging = path.join(work, "release");
console.log(`extracting ${manifest.keep.join(", ")}`);
await extract(file, key, staging);
await writeFile(
  path.join(staging, "vendor.lock.json"),
  JSON.stringify({ source: manifest.source, tag: manifest.tag, commit: manifest.commit, platform: key, asset: asset.name, sha256: asset.sha256, staged: new Date().toISOString() }, null, 2),
);
await verify(staging, key);
await rm(dest, { recursive: true, force: true });
await rename(staging, dest);
await rm(work, { recursive: true, force: true });
await verify(dest, key);
