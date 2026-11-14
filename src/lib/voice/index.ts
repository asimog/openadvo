/**
 * Voice instruction (build-plan step 10; workflow 2, Appendix C 1). Plain library.
 *
 * Speech is transcribed on this machine by Whisper (tiny, English: decision 10) through
 * transformers.js and its prebuilt ONNX runtime. The model files are vendored by
 * `scripts/vendor-voice.ts` into resources/models/; nothing is downloaded at run time, and no
 * audio leaves the machine. The transcript is text for the chat composer only: voice cannot
 * confirm a filing or take any human-only action (workflow 11).
 */
import path from "node:path";
import { existsSync } from "node:fs";

export const VOICE_MODEL = "Xenova/whisper-tiny.en";
export const VOICE_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

export function voiceModelDir(resourcesRoot: string): string {
  return path.join(resourcesRoot, "models", ...VOICE_MODEL.split("/"));
}

export function voiceAvailable(resourcesRoot: string): { available: boolean; detail: string } {
  const dir = voiceModelDir(resourcesRoot);
  const missing = VOICE_FILES.filter((f) => !existsSync(path.join(dir, f)));
  return missing.length ? { available: false, detail: `the speech model is not vendored (${missing.length} file(s) missing). Run npm run vendor:voice.` } : { available: true, detail: `${VOICE_MODEL}, on this machine` };
}

type Transcriber = (audio: Float32Array) => Promise<{ text: string } | Array<{ text: string }>>;
let loaded: Promise<Transcriber> | null = null;

async function transcriber(resourcesRoot: string): Promise<Transcriber> {
  loaded ??= (async () => {
    const t = await import("@huggingface/transformers");
    t.env.allowRemoteModels = false;
    t.env.allowLocalModels = true;
    t.env.localModelPath = path.join(resourcesRoot, "models") + path.sep;
    const pipe = await t.pipeline("automatic-speech-recognition", VOICE_MODEL, { dtype: "q8", device: "cpu" });
    return pipe as unknown as Transcriber;
  })();
  loaded.catch(() => (loaded = null));
  return loaded;
}

/** 16 kHz mono samples in, text out. */
export async function transcribe(resourcesRoot: string, samples: Float32Array): Promise<string> {
  const avail = voiceAvailable(resourcesRoot);
  if (!avail.available) throw new Error(`VOICE_UNAVAILABLE: ${avail.detail}`);
  if (samples.length < 1600) return "";
  const out = await (await transcriber(resourcesRoot))(samples);
  const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
  return text.replace(/\s+/g, " ").trim();
}
