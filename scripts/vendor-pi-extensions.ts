/**
 * Installs the bundled Pi extensions (scripts/pi-extensions.manifest.json) into
 * resources/pi-extensions/ with npm, at their exact versions, with no install scripts and no
 * peer packages (Pi supplies its own packages to extensions). Each package's integrity in the
 * lock file must equal the manifest. Exits non-zero on any failure. Never committed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Entry { name: string; version: string; integrity: string; source: string; gitHead: string }

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "scripts", "pi-extensions.manifest.json"), "utf8")) as { extensions: Entry[] };
const dir = path.join(root, "resources", "pi-extensions");

function fail(message: string): never {
  console.error(`vendor-pi-extensions: ${message}`);
  process.exit(1);
}

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const dependencies = Object.fromEntries(manifest.extensions.map((e) => [e.name, e.version]));
writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "openadvo-pi-extensions", private: true, dependencies }, null, 2));

const args = ["install", "--ignore-scripts", "--omit=dev", "--omit=peer", "--no-audit", "--no-fund", "--save-exact"];
const run = spawnSync("npm", args, { cwd: dir, stdio: "inherit", shell: true });
if (run.status !== 0) fail(`npm install exited with ${run.status}`);

const lock = JSON.parse(readFileSync(path.join(dir, "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string; integrity?: string }> };
const installed: Record<string, { version: string; integrity: string; entries: string[] }> = {};
for (const e of manifest.extensions) {
  const got = lock.packages[`node_modules/${e.name}`];
  if (!got) fail(`${e.name} is not in the lock file`);
  if (got.version !== e.version) fail(`${e.name} is ${got.version}, expected ${e.version}`);
  if (got.integrity !== e.integrity) fail(`${e.name} has integrity ${got.integrity}, expected ${e.integrity}`);
  const pkgDir = path.join(dir, "node_modules", e.name);
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as { pi?: { extensions?: string[] } };
  const entries = pkg.pi?.extensions ?? [];
  if (entries.length === 0) fail(`${e.name} declares no extension in package.json "pi"`);
  for (const entry of entries) if (!existsSync(path.join(pkgDir, entry))) fail(`${e.name}: missing ${entry}`);
  installed[e.name] = { version: e.version, integrity: e.integrity, entries };
}
writeFileSync(path.join(dir, "vendor.lock.json"), JSON.stringify({ installedAt: new Date().toISOString(), extensions: installed }, null, 2));
console.log(`vendor-pi-extensions: ${manifest.extensions.length} extensions in ${dir}`);
