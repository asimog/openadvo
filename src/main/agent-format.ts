/**
 * The agent's text formats and cost helpers. Plain functions over records; no session and no model.
 */
import type { AgentDraft } from "./agent.ts";
import type { CostSummary } from "../shared/api.ts";
import type { DraftCheck, NotebookEvent, PageRecord, ParagraphSource, SourceRecord } from "../shared/records.ts";

const KIND_LABEL: Record<string, string> = {
  born_digital: "text layer",
  ocr: "OCR, single reading, not cross-checked",
  none: "no text found",
};

export function findSource(sources: SourceRecord[], ref: string): SourceRecord | string {
  const r = ref.trim().toLowerCase();
  const exact = sources.find((s) => s.id === ref || s.name.toLowerCase() === r);
  if (exact) return exact;
  const partial = sources.filter((s) => s.name.toLowerCase().includes(r));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return `"${ref}" matches ${partial.length} sources: ${partial.map((s) => s.name).join("; ")}. Name one exactly.`;
  return `No source matches "${ref}". Use list_sources to see the names.`;
}

export function formatPages(source: SourceRecord, pages: PageRecord[]): string {
  if (pages.length === 0) return `${source.name}: no page text is stored for that range yet. Text extraction may still be running.`;
  return pages
    .map((p) => {
      const head = `== ${source.name}, page ${p.page} (${KIND_LABEL[p.kind] ?? p.kind}${p.ocr ? `, confidence ${Math.round(p.ocr.confidence)}%` : ""})`;
      return [head, ...p.lines.map((l) => `[l. ${l.line}] ${l.text}`)].join("\n");
    })
    .join("\n\n");
}

export function formatEvent(e: NotebookEvent): string {
  const date = e.dateStart === e.dateEnd ? e.dateStart : `${e.dateStart} to ${e.dateEnd}`;
  const flags = [
    e.status,
    e.dateType !== "explicit" ? `date ${e.dateType}` : "",
    e.reading === "ocr" ? "OCR single reading" : "",
    e.excluded ? "excluded from the chronology" : "",
    e.conflicts.length ? "DATE CONFLICT open" : "",
  ].filter(Boolean).join(", ");
  return `${date} (${e.dateText}) [${e.kind}; ${flags}] ${e.description} — [${e.sourceName}, p. ${e.page}, l. ${e.line}] id ${e.id}`;
}

export function formatDraft(d: AgentDraft): string {
  const head = `== ${d.title} (${d.kind}), revision ${d.revision.seq}, sha256 ${d.revision.sha256}`;
  return [head, ...d.paragraphs.map((p) => (p.anchor ? `[anchor ${p.anchor}] ${p.text}` : `[no anchor] ${p.text}`))].join("\n");
}

export function formatCheck(c: DraftCheck, title: string): string {
  const head = `${title}, revision ${c.seq}: ${c.statementsChecked} statement(s) checked, ${c.defects.length} defect(s). Method: ${c.method}. Gate: ${c.gate?.label ?? "not computed"}.`;
  const defects = c.defects.map(
    (d) => `- [${d.kind}] paragraph ${d.paragraph}${d.anchor ? ` (anchor ${d.anchor})` : ""}: ${d.text}\n  Evidence: ${d.evidence}\n  Action: ${d.action}`,
  );
  const notRun = c.notRun.map((n) => `- Not run: ${n.check}. ${n.reason}`);
  return [head, ...defects, ...notRun].join("\n");
}

export function formatParagraphSource(s: ParagraphSource): string {
  const head = `Paragraph ${s.anchor}. ${s.events.length} Notebook event(s):`;
  return [
    head,
    ...s.events.map((e) => {
      const date = e.dateStart === e.dateEnd ? e.dateStart : `${e.dateStart} to ${e.dateEnd}`;
      const reading = e.reading === "ocr" ? ", OCR single reading" : "";
      return `${date} (${e.dateText}) ${e.description} — [${e.sourceName}, p. ${e.page}, l. ${e.line}${reading}] id ${e.id}`;
    }),
  ].join("\n");
}

export function formatSources(sources: SourceRecord[]): string {  if (sources.length === 0) return "The matter has no sources.";
  const lines = sources.map(
    (s, i) => `${i + 1}. ${s.name} | ${s.mediaType} | sha256 ${s.sha256} | ${s.size} bytes | status ${s.status} | added ${s.origins} time(s)`,
  );
  return `${sources.length} source(s):\n${lines.join("\n")}`;
}

export function isLocalModel(model: { baseUrl?: string }): boolean {
  try {
    const h = new URL(model.baseUrl ?? "").hostname.replace(/^\[|\]$/g, "");
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

export function cacheHit(input: number, read: number, write: number): number | null {
  const total = input + read + write;
  return total > 0 ? Math.round((read / total) * 1000) / 10 : null;
}

export function money(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0";
  return cost >= 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toPrecision(3)}`;
}

export function costCsvText(lines: ReadonlyArray<Record<string, unknown>>): string {
  const rows = ['"Kind","Name","Id","At","Input","Output","Total","CacheRead","CacheWrite","CacheHitPercent","Cost"'];
  for (const l of lines) {
    if (l.type === "run_end") {
      rows.push(['"Run"', '""', `"${String(l.run ?? "")}"`, `"${String(l.at ?? "")}"`, n(l.input), n(l.output), n(l.tokens), n(l.cacheRead), n(l.cacheWrite), l.cacheHit === null ? "" : n(l.cacheHit), n(l.cost)].join(","));
    } else if (l.type === "helper_end") {
      rows.push(['"Helper"', `"${String(l.name ?? "").replace(/"/g, '""')}"`, `"${String(l.helper ?? "")}"`, `"${String(l.at ?? "")}"`, n(l.input), n(l.output), n(l.tokens), n(l.cacheRead), n(l.cacheWrite), l.cacheHit === null ? "" : n(l.cacheHit), n(l.cost)].join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

export function costReportText(lines: ReadonlyArray<Record<string, unknown>>): string {
  const rows = lines.filter((l) => l.type === "run_end" || l.type === "helper_end");
  if (!rows.length) return "No runs or helpers are recorded for this matter yet.";
  const table = rows.map((l) => {
    const helper = l.type === "helper_end";
    const name = helper ? `Helper ${String(l.name ?? l.helper ?? "?")}${l.helperType ? ` (${String(l.helperType)})` : ""}` : `Run ${String(l.run ?? "?").slice(0, 8)}`;
    const hit = l.cacheHit;
    return `${name}: ${n(l.tokens).toLocaleString("en-IN")} tokens (${n(l.input).toLocaleString("en-IN")} in, ${n(l.output).toLocaleString("en-IN")} out), cache ${n(l.cacheRead).toLocaleString("en-IN")} read / ${n(l.cacheWrite).toLocaleString("en-IN")} written${hit === null ? "" : ` (${n(hit)}% hit)`}, ${money(n(l.cost))}.`;
  });
  const totalTokens = rows.reduce((sum, l) => sum + n(l.tokens), 0);
  const totalCost = rows.reduce((sum, l) => sum + n(l.cost), 0);
  const cacheRead = rows.reduce((sum, l) => sum + n(l.cacheRead), 0);
  return [
    "Runs and helpers (costs are the provider's own; the CSV export is on the matter page).",
    ...table,
    `Total: ${totalTokens.toLocaleString("en-IN")} tokens, ${cacheRead.toLocaleString("en-IN")} tokens read from the cache, ${money(totalCost)}.`,
  ].join("\n");
}

export function costSummaryFromTrace(lines: ReadonlyArray<Record<string, unknown>>): CostSummary {
  const c: CostSummary = { runs: 0, helpers: 0, input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const l of lines) {
    if (l.type !== "run_end" && l.type !== "helper_end") continue;
    if (l.type === "run_end") c.runs++;
    else c.helpers++;
    c.input += n(l.input);
    c.output += n(l.output);
    c.total += n(l.tokens);
    c.cacheRead += n(l.cacheRead);
    c.cacheWrite += n(l.cacheWrite);
    c.cost += n(l.cost);
  }
  return c;
}

export function emptyCost(): CostSummary {
  return { runs: 0, helpers: 0, input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

export function toolTarget(name: string, args: unknown): string | undefined {
  const o = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const named =
    name === "start_helper"
      ? text(o.task)
      : name === "web_search"
        ? text(o.query)
        : name === "web_fetch"
          ? text(o.url)
          : name === "read_source_text"
            ? [text(o.source), o.from_page ? `p. ${String(o.from_page)}` : ""].filter(Boolean).join(", ")
            : name === "propose_correction"
              ? [text(o.draftId), text(o.anchor)].filter(Boolean).join(", ")
              : name === "plan_set"
                ? text(o.title)
                : undefined;
  const any = named ?? text(o.source) ?? text(o.query) ?? text(o.url) ?? text(o.citation) ?? text(o.title) ?? text(o.text) ?? text(o.field) ?? text(o.helper) ?? text(o.ref);
  if (!any) return undefined;
  return any.length > 120 ? `${any.slice(0, 117).trimEnd()}…` : any;
}

export function toolArgsText(args: unknown): string | undefined {
  try {
    const text = JSON.stringify(args ?? {}).replace(/\s+/g, " ");
    if (!text || text === "{}") return undefined;
    return text.length > 1200 ? `${text.slice(0, 1197)}…` : text;
  } catch {
    return undefined;
  }
}

export function toolDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

