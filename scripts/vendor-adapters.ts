/**
 * Vendor court adapters (docs/specs/court-adapters.md section 3) into resources/adapters/.
 *
 *   node scripts/vendor-adapters.ts                 fetch every adapter pinned in scripts/adapters.manifest.json
 *   node scripts/vendor-adapters.ts --from <path|https url of adapter.json>
 *                                                   vendor one adapter and pin it in the manifest
 *
 * Each adapter.json is checked (src/lib/court-adapters) and its SHA-256 compared with the pin.
 * The result is recorded in resources/adapters/adapters.lock.json. Any failure exits non-zero.
 * An adapter is data: nothing in it runs.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkAdapter } from "../src/lib/court-adapters/index.ts";

const repo = path.resolve(import.meta.dirname, "..");
const manifestFile = path.join(repo, "scripts", "adapters.manifest.json");
const out = path.join(repo, "resources", "adapters");

interface Pin {
  id: string;
  version: string;
  from: string;
  sha256: string;
}

function fail(message: string): never {
  console.error(`vendor-adapters: ${message}`);
  process.exit(1);
}

async function read(from: string): Promise<string> {
  if (/^https:\/\//.test(from)) {
    const r = await fetch(from);
    if (!r.ok) fail(`${from}: HTTP ${r.status}`);
    return await r.text();
  }
  if (/^http:\/\//.test(from)) fail(`${from}: only https`);
  return readFileSync(path.resolve(from.endsWith(".json") ? from : path.join(from, "adapter.json")), "utf8");
}

function place(text: string, expectSha?: string): Pin & { text: string } {
  const sha256 = createHash("sha256").update(text).digest("hex");
  if (expectSha && sha256 !== expectSha) fail(`SHA-256 mismatch: expected ${expectSha}, got ${sha256}`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    fail(`not JSON: ${(e as Error).message}`);
  }
  const { adapter, errors } = checkAdapter(raw);
  if (!adapter) fail(`invalid adapter: ${errors.join("; ")}`);
  const dir = path.join(out, adapter.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "adapter.json"), text);
  return { id: adapter.id, version: adapter.version, from: "", sha256, text };
}

const manifest = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as { adapters: Pin[] }) : { adapters: [] };
const lock: Record<string, { version: string; sha256: string; from: string; at: string }> = {};
const at = new Date().toISOString();
const fromAt = process.argv.indexOf("--from");

if (fromAt > 0) {
  const from = process.argv[fromAt + 1];
  if (!from) fail("--from needs a path or an https address");
  const placed = place(await read(from));
  const pin: Pin = { id: placed.id, version: placed.version, from, sha256: placed.sha256 };
  manifest.adapters = [...manifest.adapters.filter((p) => p.id !== pin.id), pin];
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`vendored ${pin.id} ${pin.version} (sha256 ${pin.sha256}) and pinned it in scripts/adapters.manifest.json`);
}
for (const pin of manifest.adapters) {
  const placed = place(await read(pin.from), pin.sha256);
  if (placed.version !== pin.version) fail(`${pin.id}: the pin says ${pin.version}, the file says ${placed.version}`);
  lock[pin.id] = { version: pin.version, sha256: pin.sha256, from: pin.from, at };
}
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "adapters.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log(`${Object.keys(lock).length} adapter(s) vendored into resources/adapters`);
