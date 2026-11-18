/**
 * O4: the evaluator gate of a skill run (decision 15). The output must be one JSON block of the
 * skill's output type; the skill's checks run on it. A failure goes back to the run with the
 * defects, at most twice; then the run needs the advocate's review. A check that is not built
 * reports "not available", never "passed" (lesson L2). Plain library.
 */
import { AVAILABLE_CHECKS, type CheckResult, type OutputType } from "../../shared/skills.ts";
import { severityOfKind } from "../verification/reviewer-note.ts";

export const MAX_REWRITES = 2;

/** The shape each output type must have. Every item carries the anchors it rests on. */
export const OUTPUT_SHAPES: Record<OutputType, string> = {
  report: '{"summary": string, "findings": [{"text": string, "anchors": [string]}], "not_verified": [string], "not_read": [string]}',
  list: '{"items": [{"title": string, "detail": string, "anchors": [string], "blocks": boolean}], "not_read": [string]}',
  chart: '{"columns": [string], "rows": [{"cells": [string], "anchors": [string]}], "not_read": [string]}',
  record: '{"records": [{"fields": {string: string}, "anchors": [string]}], "not_read": [string]}',
  draft: '{"title": string, "paragraphs": [{"text": string, "anchors": [string]}], "not_read": [string]}',
};

const ITEM_KEY: Record<OutputType, string> = { report: "findings", list: "items", chart: "rows", record: "records", draft: "paragraphs" };

/** The last ```json block of the text, or the whole text when it is JSON. */
export function extractOutput(text: string): { value: unknown; error: string | null } {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n?```/g)].map((m) => m[1]);
  const candidates = blocks.length ? [blocks[blocks.length - 1]] : [text.trim()];
  for (const c of candidates) {
    try {
      return { value: JSON.parse(c), error: null };
    } catch (e) {
      return { value: null, error: `the output is not valid JSON: ${(e as Error).message}` };
    }
  }
  return { value: null, error: "the output has no JSON block" };
}

function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** The items of an output, each with its text and anchors, for the checks. */
export function itemsOf(type: OutputType, value: unknown): Array<{ text: string; anchors: string[] }> {
  const o = value as Record<string, unknown> | null;
  const arr = o && Array.isArray(o[ITEM_KEY[type]]) ? (o[ITEM_KEY[type]] as Array<Record<string, unknown>>) : [];
  return arr.map((it) => {
    const text =
      type === "chart" ? (isStrings(it.cells) ? it.cells.join(" | ") : "") :
      type === "record" ? Object.values((it.fields as Record<string, unknown>) ?? {}).map(String).join(" | ") :
      type === "list" ? `${String(it.title ?? "")}: ${String(it.detail ?? "")}` :
      String(it.text ?? "");
    return { text, anchors: isStrings(it.anchors) ? it.anchors : [] };
  });
}

export function schemaDefects(type: OutputType, value: unknown): string[] {
  const out: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`the output must be one JSON object: ${OUTPUT_SHAPES[type]}`];
  const o = value as Record<string, unknown>;
  const key = ITEM_KEY[type];
  if (!Array.isArray(o[key])) out.push(`"${key}" must be an array`);
  if (type === "report" && typeof o.summary !== "string") out.push('"summary" must be a string');
  if (type === "draft" && typeof o.title !== "string") out.push('"title" must be a string');
  if (type === "chart" && !isStrings(o.columns)) out.push('"columns" must be an array of strings');
  if (o.not_read !== undefined && !isStrings(o.not_read)) out.push('"not_read" must be an array of strings');
  const arr = Array.isArray(o[key]) ? (o[key] as unknown[]) : [];
  arr.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const at = `${key}[${i}]`;
    if (!it || typeof it !== "object") return void out.push(`${at} must be an object`);
    if (!isStrings(it.anchors)) out.push(`${at}.anchors must be an array of strings`);
    if ((type === "report" || type === "draft") && typeof it.text !== "string") out.push(`${at}.text must be a string`);
    if (type === "list" && (typeof it.title !== "string" || typeof it.detail !== "string")) out.push(`${at} needs a title and a detail`);
    if (type === "chart" && !isStrings(it.cells)) out.push(`${at}.cells must be an array of strings`);
    if (type === "record" && (!it.fields || typeof it.fields !== "object")) out.push(`${at}.fields must be an object`);
  });
  return out;
}

export interface GateInput {
  type: OutputType;
  checks: readonly string[];
  text: string;
  /** Whether an anchor names a record of this matter. */
  resolves: (anchor: string) => boolean;
}

export interface GateResult {
  ok: boolean;
  output: unknown;
  checks: CheckResult[];
  /** What the run must fix, for the rewrite prompt. */
  defects: string[];
}

export function runGate(input: GateInput): GateResult {
  const { value, error } = extractOutput(input.text);
  const checks: CheckResult[] = [];
  const defects: string[] = [];
  const schema = error ? [error] : schemaDefects(input.type, value);
  checks.push({ name: "schema", result: schema.length ? "failed" : "passed", detail: schema.length ? schema.join("; ") : `a valid ${input.type}` });
  defects.push(...schema);
  const items = schema.length ? [] : itemsOf(input.type, value);
  for (const name of input.checks) {
    if (name === "schema") continue;
    if (!(AVAILABLE_CHECKS as readonly string[]).includes(name)) {
      checks.push({ name, result: "not_available", detail: "This check is not built yet; it did not run." });
      continue;
    }
    if (schema.length) {
      checks.push({ name, result: "failed", detail: "Not run: the output does not match the schema." });
      continue;
    }
    if (name === "anchors") {
      const bad = [...new Set(items.flatMap((i) => i.anchors).filter((a) => !input.resolves(a)))];
      const bare = items.filter((i) => i.anchors.length === 0).length;
      checks.push({
        name,
        result: bad.length ? "failed" : "passed",
        detail: bad.length ? `Anchors that name no record of this matter: ${bad.slice(0, 10).join(", ")}` : `Every anchor resolves${bare ? `; ${bare} item${bare === 1 ? " has" : "s have"} no anchor` : ""}.`,
      });
      if (bad.length) defects.push(`these anchors name no record of this matter; use only ids the tools returned: ${bad.slice(0, 10).join(", ")}`);
    }
    if (name === "no_unverified_claims") {
      const claims = items.filter((i) => /(?<!un|not |never )\bverified\b/i.test(i.text) && !/validator/i.test(i.text));
      checks.push({ name, result: claims.length ? "failed" : "passed", detail: claims.length ? `${claims.length} item${claims.length === 1 ? " says" : "s say"} "verified" with no validator result` : "No item claims verification without the validator." });
      if (claims.length) defects.push('an item says "verified" without a validator result; say what the validator reported, or say "not verified"');
    }
    if (name === "severity_floor") {
      // P9: an item that names a defect kind carries the severity the one mapping assigns. A
      // downstream skill never lowers one: a blocking kind reported as not blocking fails here.
      const o = value as Record<string, unknown> | null;
      const key = ITEM_KEY[input.type];
      const raw = o && Array.isArray(o[key]) ? (o[key] as Array<Record<string, unknown>>) : [];
      const lowered: string[] = [];
      for (const it of raw) {
        if (typeof it.kind !== "string") continue;
        const severity = severityOfKind(it.kind);
        const blocks = it.blocks === true;
        if (severity === "blocker" && !blocks) lowered.push(`${it.kind} (the mapping blocks; the item says it does not)`);
        if (severity === "note" && blocks) lowered.push(`${it.kind} (the mapping says "for judgment"; the item blocks)`);
      }
      checks.push({
        name,
        result: lowered.length ? "failed" : "passed",
        detail: lowered.length ? `Item(s) lower a severity the checks assigned: ${lowered.slice(0, 10).join("; ")}` : "No item lowers a severity the checks assigned.",
      });
      if (lowered.length) defects.push(`these items lower a severity the checks assigned; report each item's severity exactly as the tool's reviewer note gives it: ${lowered.slice(0, 10).join("; ")}`);
    }
  }
  return { ok: !checks.some((c) => c.result === "failed"), output: value, checks, defects };
}

/** After attempt n (1-based): accept, ask for a rewrite, or stop for the advocate. */
export function gateDecision(attempt: number, ok: boolean): "accept" | "rewrite" | "review" {
  if (ok) return "accept";
  return attempt <= MAX_REWRITES ? "rewrite" : "review";
}

export function rewritePrompt(type: OutputType, defects: string[], attempt: number): string {
  return [
    `The output was refused by the gate (rewrite ${attempt} of ${MAX_REWRITES}). Fix these defects and give the whole output again as one JSON block:`,
    ...defects.map((d) => `- ${d}`),
    `The shape: ${OUTPUT_SHAPES[type]}`,
  ].join("\n");
}

/** The not_read list of an output, if any. */
export function notReadOf(value: unknown): string[] {
  const v = (value as { not_read?: unknown } | null)?.not_read;
  return isStrings(v) ? v : [];
}
