import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJson, manifestDigest, verifyManifest } from "../../src/lib/filing/index.ts";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

test("V1-8: canonical JSON sorts keys and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: [3, { d: 2, c: 1 }] }), '{"a":[3,{"c":1,"d":2}],"b":1}');
});

test("V1-8: the digest ignores its own field and detects a change", async () => {
  const body = { matter: "A v B", files: [{ name: "01 Synopsis.pdf", sha256: sha("one") }] };
  const manifest = { ...body, digest: manifestDigest(body, sha) };
  const files: Record<string, string> = { "01 Synopsis.pdf": sha("one") };
  const read = async (n: string) => files[n] ?? null;
  assert.equal((await verifyManifest(manifest, sha, read)).ok, true);
  const tampered = { ...manifest, matter: "A v C" };
  assert.equal((await verifyManifest(tampered, sha, read)).digest, "mismatch");
  files["01 Synopsis.pdf"] = sha("changed");
  const r = await verifyManifest(manifest, sha, read);
  assert.equal(r.ok, false);
  assert.equal(r.files[0].outcome, "mismatch");
  delete files["01 Synopsis.pdf"];
  assert.equal((await verifyManifest(manifest, sha, read)).files[0].outcome, "missing");
});
