/**
 * Step 10, voice: a spoken instruction reaches the chat composer as text and is not sent.
 * Chromium's fake microphone plays a WAV made by the operating system's speech synthesiser
 * (Windows only), and the vendored Whisper model transcribes it on this machine.
 * Spec: docs/specs/v0-agent-filing.md. Needs npm run vendor:voice.
 */
import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appEnv } from "./env.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const model = existsSync(path.join(repo, "resources", "models", "Xenova", "whisper-tiny.en", "onnx", "decoder_model_merged_quantized.onnx"));
test.describe.configure({ timeout: 180_000 });

test("voice: the transcript goes into the composer and nothing is sent", async () => {
  test.skip(process.platform !== "win32" || !model, "needs Windows speech synthesis and the vendored speech model (npm run vendor:voice)");
  const base = await mkdtemp(path.join(tmpdir(), "oa-voice-"));
  const wav = path.join(base, "instruction.wav");
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
      `$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); ` +
      `$s.SetOutputToWaveFile('${wav}', $f); $s.Speak('List the sources of this matter.'); $s.Dispose()`,
  ]);
  const app = await electron.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, repo],
    env: appEnv({ OPENADVO_HOME: path.join(base, "matters"), OPENADVO_USER_DATA: path.join(base, "user"), OPENADVO_TEST: "1" }),
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "New matter" }).click();
    await page.getByLabel("Matter title").fill("Voice");
    await page.getByRole("button", { name: "Create matter" }).click();
    await page.getByRole("button", { name: "Speak an instruction" }).click();
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: "Stop and transcribe" }).click();
    const composer = page.getByLabel("Message to the agent");
    await expect(composer).toContainText(/sources/i, { timeout: 60_000 });
    // Nothing was sent: voice only fills the composer.
    await expect(page.locator('[data-role="advocate"]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
