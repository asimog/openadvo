/**
 * Runs the release's own x2t converter. Plain library: no Electron import, no Pi import.
 * One conversion at a time (carried over from advodsh lib/x2t.js).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

let queue: Promise<unknown> = Promise.resolve();

function runOnce(x2t: string, args: string[], timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(x2t, args, { cwd: path.dirname(x2t), windowsHide: true });
    let output = "";
    child.stdout.on("data", (d) => (output += String(d)));
    child.stderr.on("data", (d) => (output += String(d)));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
  });
}

/** Queue one x2t run behind any running one. */
export function runX2t(x2t: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; output: string }> {
  const next = queue.then(() => runOnce(x2t, args, timeoutMs));
  queue = next.catch(() => undefined);
  return next;
}

export interface FontList {
  dir: string;
  allFontsJs: string;
  /** Every font file the list names, as written in AllFonts.js (forward slashes). */
  files: Set<string>;
}

/** Normalise a font path for the allowlist: forward slashes, no `/?/` prefix, lower case on Windows. */
export function normaliseFontPath(p: string, platform: string = process.platform): string {
  let s = p.replace(/\\/g, "/").replace(/^\/\?\//, "");
  if (platform === "win32") s = s.toLowerCase();
  return s;
}

/**
 * Build the editors' font list with `x2t -create-allfonts`: the bundled fonts plus the system fonts.
 * Writes only into `outDir`; the vendored folders are not changed.
 */
export async function buildFontList(x2t: string, fontsDir: string, outDir: string): Promise<FontList> {
  const allFontsJs = path.join(outDir, "AllFonts.js");
  if (!existsSync(allFontsJs)) {
    await mkdir(outDir, { recursive: true });
    const r = await runX2t(x2t, ["-create-allfonts", outDir, fontsDir.replace(/\\/g, "/")]);
    if (r.code !== 0 || !existsSync(allFontsJs)) throw new Error(`x2t -create-allfonts failed (${r.code}): ${r.output.slice(0, 400)}`);
  }
  const text = await readFile(allFontsJs, "utf8");
  const start = text.indexOf('window["__fonts_files"]');
  const end = text.indexOf("];", start);
  const files = new Set<string>();
  if (start >= 0 && end > start) {
    for (const m of text.slice(start, end).matchAll(/"([^"]+)"/g)) {
      if (m[1] !== "__fonts_files") files.add(normaliseFontPath(m[1]));
    }
  }
  return { dir: outDir, allFontsJs, files };
}
