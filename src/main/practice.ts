/**
 * V5-19 to V5-25 in the main process: the impact of a new order, the docket, reminders, the
 * questions document and the diagnostics file. Spec: docs/specs/v5.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { generateStructured } from "../lib/drafting/structured.ts";
import type { Matters } from "./matters.ts";
import type { Progress } from "./progress.ts";

/**
 * V5-19: a new order or judgment added after a draft was approved opens one review item that
 * names the approved drafts to re-check. Each source is checked once.
 */
export async function orderImpact(matters: Matters, matterId: string): Promise<number> {
  const store = await matters.store(matterId);
  const approved = store.listDrafts().filter((d) => d.approved?.approvedAt);
  let opened = 0;
  for (const s of store.listSources()) {
    const type = s.docType?.type;
    if (type !== "order" && type !== "judgment") continue;
    if (!store.markImpactChecked(s.id)) continue;
    const before = approved.filter((d) => (d.approved!.approvedAt ?? "") < s.addedAt);
    if (before.length === 0) continue;
    store.openReviewItem("new_order_impact", s.id, null, `${s.name} (a new ${type}) was added after ${before.map((d) => `${d.title} revision ${d.approved!.seq}`).join(", ")} ${before.length === 1 ? "was" : "were"} approved. Re-check ${before.length === 1 ? "it" : "them"} against the new ${type}.`);
    opened++;
  }
  return opened;
}

export interface DocketRow {
  matterId: string;
  title: string;
  stage: string;
  next: string;
  nextHearing: { date: string; status: string } | null;
  limitation: string | null;
  openItems: number;
  reminders: Array<{ id: string; text: string; dueAt: string; status: string }>;
}

/** V5-20: every open matter with its stage, next hearing, limitation and open items. */
export async function docket(matters: Matters, progress: Progress): Promise<DocketRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const out: DocketRow[] = [];
  for (const m of (await matters.list()).filter((x) => !x.archived)) {
    try {
      const store = await matters.store(m.id);
      const stages = await progress.progress(m.id);
      const current = stages.find((s) => s.state !== "done");
      const upcoming = store.hearings().filter((h) => h.nextDate && h.nextDate >= today).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))[0];
      const lim = store.work.limitation();
      out.push({
        matterId: m.id,
        title: m.title,
        stage: current ? current.title : "Every stage is done",
        next: current?.next ?? "",
        nextHearing: upcoming ? { date: upcoming.nextDate, status: upcoming.nextDateStatus } : null,
        limitation: lim ? `${lim.deadline}${lim.confirmedAt ? "" : " (not confirmed)"}` : null,
        openItems: (await progress.inbox(m.id)).length,
        reminders: store.reminders().filter((r) => r.status !== "done"),
      });
    } catch {
      // A matter that cannot be read is listed by the matters list itself; the docket skips it.
    }
  }
  return out.sort((a, b) => (a.nextHearing?.date ?? "9999") < (b.nextHearing?.date ?? "9999") ? -1 : 1);
}

/** V5-20: reminders that are due and not yet notified, across matters. The caller notifies. */
export async function dueReminders(matters: Matters, now = new Date()): Promise<Array<{ matterId: string; title: string; id: string; text: string }>> {
  const out: Array<{ matterId: string; title: string; id: string; text: string }> = [];
  for (const m of (await matters.list()).filter((x) => !x.archived)) {
    const store = await matters.store(m.id);
    for (const r of store.reminders()) {
      if (r.status === "open" && r.dueAt <= now.toISOString()) {
        store.setReminderStatus(r.id, "notified", { actor: "system" });
        out.push({ matterId: m.id, title: m.title, id: r.id, text: r.text });
      }
    }
  }
  return out;
}

/**
 * V5-24: the questions the matter still needs answered, as a DOCX in the matter folder. Built
 * from the records only: missing details, unresolved dates, disputed readings, open review items,
 * open critical questions of accepted arguments.
 */
export async function questionsDocument(matters: Matters, matterId: string, progress: Progress): Promise<{ file: string; questions: number }> {
  const store = await matters.store(matterId);
  const d = store.work.details();
  const blocks: Array<{ text: string; style?: "heading" | "center" }> = [{ text: "QUESTIONS FOR INSTRUCTIONS", style: "center" }, { text: `Matter: ${store.matter().title}. Prepared on ${new Date().toISOString().slice(0, 10)} from the matter's records.` }];
  let n = 0;
  const section = (title: string, items: string[]) => {
    blocks.push({ text: title, style: "heading" });
    if (items.length === 0) blocks.push({ text: "None." });
    for (const it of items) blocks.push({ text: `${++n}. ${it}` });
  };
  section("Matter details not recorded", [
    d.petitioner ? "" : "Who is the petitioner, as named in the impugned judgment?",
    d.respondent ? "" : "Who is the respondent?",
    d.court ? "" : "Which court passed the impugned judgment?",
    d.caseNumber ? "" : "What is the case number in that court?",
    d.impugnedEventId ? "" : "Which judgment or order is challenged?",
    d.copyApplied ? "" : "When was the certified copy of the impugned judgment applied for, and when was it received?",
  ].filter(Boolean));
  const nb = await matters.notebook(matterId);
  section("Dates to confirm", nb.events.filter((e) => e.dateType === "inferred" && e.status === "candidate").slice(0, 30).map((e) => `Is the date ${e.dateText} right for: ${e.description}?`));
  section("Readings to decide", store.disputes().filter((x) => x.status === "open").map((x) => `Page ${x.page}, line ${x.line}: does it read "${x.readingA}" or "${x.readingB}"?`));
  const inbox = await progress.inbox(matterId);
  section("Open items", inbox.filter((i) => !["candidate_events", "doc_type"].includes(i.kind)).slice(0, 40).map((i) => `${i.title}: ${i.detail}`));
  const args = store.studio.arguments().filter((a) => a.status === "accepted" && !a.attacks);
  section("Questions the accepted arguments leave open", args.flatMap((a) => a.questions.map((q) => `${q} (argument: ${a.claim.slice(0, 80)})`)));
  const g = generateStructured(blocks, { title: "QUESTIONS FOR INSTRUCTIONS", generatedAt: new Date().toISOString() });
  const dir = path.join(store.folder, "questions");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `Questions ${new Date().toISOString().replace(/[:.]/g, "-")}.docx`);
  await writeFile(file, g.docx);
  store.appendEvent({ actor: "advocate" }, "questions.generated", null, { questions: n, file: path.basename(file) });
  return { file, questions: n };
}

// ---- V5-25: diagnostics ----

const LOG: string[] = [];

/** Keep the last lines the main process writes, for a diagnostics file the advocate asks for. */
export function captureLogs(): void {
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      LOG.push(`${new Date().toISOString()} ${level} ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`.slice(0, 2000));
      if (LOG.length > 500) LOG.shift();
      original(...args);
    };
  }
}

export interface DiagnosticsEntry {
  name: string;
  description: string;
  bytes: Uint8Array;
}

/** Exactly what the diagnostics file holds. No matter content, no blob, no secret. */
export function diagnosticsEntries(info: Record<string, unknown>, settings: Record<string, unknown>, matterCount: number): DiagnosticsEntry[] {
  const enc = (o: unknown) => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o, null, 2));
  const safeSettings = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, k === "mail" ? "(the mailbox setting is left out)" : v]));
  return [
    { name: "versions.json", description: "Versions of the application, Electron, Euro-Office and the validator; the folders used", bytes: enc(info) },
    { name: "settings.json", description: "Application settings (model, effort, appearance, research sources); the mailbox is left out; no password is stored there", bytes: enc(safeSettings) },
    { name: "log.txt", description: `The last ${LOG.length} lines the application wrote`, bytes: enc(LOG.join("\n")) },
    { name: "matters.json", description: "Only how many matters there are; no title and no content", bytes: enc({ matters: matterCount }) },
  ];
}

export function diagnosticsZip(entries: DiagnosticsEntry[]): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((e) => [e.name, e.bytes])));
}
