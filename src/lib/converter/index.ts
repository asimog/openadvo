/**
 * Runs the release's own x2t converter. Plain library: no Electron import, no Pi import.
 * One conversion at a time (carried over from advodsh lib/x2t.js).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

/** The release's file format numbers for `m_nFormatTo` (from its own converter parameters). */
export const FORMAT_DOCX = 65;
export const FORMAT_PDF = 513;
export const FORMAT_BIN = 8192;

export interface ConvertRequest {
  from: string;
  to: string;
  format: number;
  /** x2t's own scratch folder. It must exist and be empty enough for this run. */
  tempDir: string;
  /** Extra TaskQueueDataConvert fields, for example the font list a PDF export needs. */
  extra?: string;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function slashes(value: string): string {
  return value.replace(/\\/g, "/");
}

/** One `TaskQueueDataConvert` run: write the parameters, then run x2t on them. */
export async function convertFile(x2t: string, request: ConvertRequest, timeoutMs = 120_000): Promise<void> {
  await mkdir(request.tempDir, { recursive: true });
  const paramsPath = path.join(request.tempDir, `params-${Date.now()}.xml`);
  const params = `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
<m_sFileFrom>${xmlEscape(slashes(request.from))}</m_sFileFrom>
<m_sFileTo>${xmlEscape(slashes(request.to))}</m_sFileTo>
<m_nFormatTo>${request.format}</m_nFormatTo>
<m_sTempDir>${xmlEscape(slashes(request.tempDir))}</m_sTempDir>
${request.extra ?? ""}</TaskQueueDataConvert>`;
  await writeFile(paramsPath, params);
  const result = await runX2t(x2t, [paramsPath], timeoutMs);
  if (result.code !== 0) {
    throw new Error(`x2t failed (${result.code}) converting to format ${request.format}: ${result.output.slice(0, 400)}`);
  }
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
