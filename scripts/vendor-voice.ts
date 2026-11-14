/**
 * Vendor the speech model for voice instruction: Whisper tiny (English), quantized ONNX, from
 * the Hugging Face model repository, into resources/models/Xenova/whisper-tiny.en/.
 * The SHA-256 of every file is written to vendor.lock.json beside them.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { VOICE_FILES, VOICE_MODEL, voiceModelDir } from "../src/lib/voice/index.ts";

const repo = path.resolve(import.meta.dirname, "..");
const dir = voiceModelDir(path.join(repo, "resources"));
const revision = process.env.VOICE_REVISION ?? "main";
const lock: Record<string, string> = {};
for (const f of VOICE_FILES) {
  const url = `https://huggingface.co/${VOICE_MODEL}/resolve/${revision}/${f}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`vendor-voice: ${url} answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  writeFileSync(path.join(dir, f), bytes);
  lock[f] = createHash("sha256").update(bytes).digest("hex");
  console.log(`vendor-voice: ${f} ${bytes.length} bytes`);
}
writeFileSync(path.join(dir, "vendor.lock.json"), JSON.stringify({ model: VOICE_MODEL, revision, fetchedAt: new Date().toISOString(), files: lock }, null, 2));
