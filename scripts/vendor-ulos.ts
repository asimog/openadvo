/**
 * Vendor the citation validator: copy the `ulos` release binary and its court reference
 * database into resources/ulos/<platform>/. Source: ULOS_SRC, default C:\dev\ulosadvo
 * (the owner's validator repository; build it there with `cargo build --release`).
 * The copy is recorded with SHA-256 values in vendor.lock.json.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { platformKey } from "../src/lib/euro-office/platform.ts";

const repo = path.resolve(import.meta.dirname, "..");
const src = path.resolve(process.env.ULOS_SRC ?? "C:/dev/ulosadvo");
const exeName = process.platform === "win32" ? "ulos.exe" : "ulos";
const exe = path.join(src, "target", "release", exeName);
const db = path.join(src, "data", "ulos.db");
for (const f of [exe, db]) {
  if (!existsSync(f)) {
    console.error(`vendor-ulos: missing ${f}. Build ulos with cargo build --release in ${src}.`);
    process.exit(1);
  }
}
const dest = path.join(repo, "resources", "ulos", platformKey());
mkdirSync(path.join(dest, "data"), { recursive: true });
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
copyFileSync(exe, path.join(dest, exeName));
copyFileSync(db, path.join(dest, "data", "ulos.db"));
const lock = { source: src, copiedAt: new Date().toISOString(), files: { [exeName]: sha(exe), "data/ulos.db": sha(db) } };
writeFileSync(path.join(dest, "vendor.lock.json"), JSON.stringify(lock, null, 2));
console.log(`vendor-ulos: ${dest}`);
console.log(JSON.stringify(lock.files));
