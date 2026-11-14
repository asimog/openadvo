/**
 * The citation validator adapter (build-plan step 7; workflow 9B). Plain library.
 *
 * The validator is `ulos` (C:\dev\ulosadvo), a separate deterministic program. This adapter
 * never re-implements a check (independence guard): it finds citations in text, runs the
 * program, and reads the verification record it prints. The program and its court database
 * are vendored per platform by `scripts/vendor-ulos.ts` into `resources/ulos/<platform>/`
 * (decision 9: a native binary behind one module that selects it by platform).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { platformKey } from "../euro-office/platform.ts";

export interface UlosPaths {
  root: string;
  exe: string;
  db: string;
}

export function ulosPaths(resourcesRoot: string, platform: string = process.platform, arch: string = process.arch): UlosPaths {
  const root = path.join(resourcesRoot, "ulos", platformKey(platform, arch));
  return { root, exe: path.join(root, platform === "win32" ? "ulos.exe" : "ulos"), db: path.join(root, "data", "ulos.db") };
}

export function ulosAvailable(p: UlosPaths): { available: boolean; detail: string } {
  if (!existsSync(p.exe)) return { available: false, detail: `the validator is not vendored (${p.exe}). Run npm run vendor:ulos.` };
  if (!existsSync(p.db)) return { available: false, detail: `the court reference database is missing (${p.db}).` };
  return { available: true, detail: `ulos at ${p.exe}` };
}

export interface UlosRecord {
  outcome: "verified" | "failed" | "unresolved" | "not_applicable";
  reason: string | null;
  reasonDetail: string | null;
  raw: string;
}

/**
 * Supreme Court neutral citations, as the court writes them: "2024 INSC 23".
 * Finding a citation is not checking it: the validator parses it again.
 */
const NEUTRAL = /\b((?:19[5-9]\d|20\d\d))\s+INSC\s+(\d{1,5})\b/g;

export function findCitations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NEUTRAL)) {
    const c = `${m[1]} INSC ${Number(m[2])}`;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Run `ulos verify-citation` once. The working folder holds `data/ulos.db`, where the program looks. */
export function verifyCitation(p: UlosPaths, citation: string, opts: { parties?: string; date?: string } = {}, timeoutMs = 60_000): Promise<UlosRecord> {
  const args = ["verify-citation", citation, "--json"];
  if (opts.parties) args.push("--parties", opts.parties);
  if (opts.date) args.push("--date", opts.date);
  return new Promise((resolve, reject) => {
    const child = spawn(p.exe, args, { cwd: p.root, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const line = out.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
      if (!line) return reject(new Error(`ULOS_NO_RECORD: exit ${code}. ${err.trim().slice(0, 500)}`));
      try {
        const r = JSON.parse(line) as { outcome: UlosRecord["outcome"]; reason: string | null; reasonDetail?: string | null };
        resolve({ outcome: r.outcome, reason: r.reason ?? null, reasonDetail: r.reasonDetail ?? null, raw: line });
      } catch (e) {
        reject(new Error(`ULOS_BAD_RECORD: ${(e as Error).message}`));
      }
    });
  });
}

/**
 * Step 6: search the court's released list of neutral citations by party name or citation.
 * A finding aid only (deprecated I-research rule 15): a hit is never a verification outcome.
 */
export async function searchCitationIndex(p: UlosPaths, query: string, limit = 20): Promise<Array<{ citation: string; parties: string; date: string; caseNumber: string }>> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(p.db, { readOnly: true });
  try {
    const q = query.trim();
    const cite = findCitations(q)[0];
    const rows = (cite
      ? db.prepare("SELECT insc_display, parties, decision_date, case_number FROM insc_citations WHERE insc_display = ? LIMIT ?").all(cite, limit)
      : db.prepare("SELECT insc_display, parties, decision_date, case_number FROM insc_citations WHERE parties LIKE ? ORDER BY decision_date DESC LIMIT ?").all(`%${q}%`, limit)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ citation: String(r.insc_display), parties: String(r.parties), date: String(r.decision_date), caseNumber: String(r.case_number ?? "") }));
  } finally {
    db.close();
  }
}
