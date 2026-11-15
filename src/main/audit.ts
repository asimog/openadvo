/**
 * V5-1 to V5-5 in the main process: the Find index built from the matter's records, the Files
 * view, the Jobs view, and the record of refused requests. Spec: docs/archive/2026-11-15/specs/v5.md.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readParagraphs } from "../lib/drafting/index.ts";
import type { FindRow } from "../lib/matter-store/audit.ts";
import type { Matters } from "./matters.ts";

/**
 * Events that never change what Find holds. Any other event since the last build rebuilds the
 * index, so an unknown action is safe: it costs a rebuild, never a stale result.
 */
const NOT_INDEXED = /^(agent\.|review_item\.|reminder\.|hearing\.|party\.|matter\.policy_set$|rehearsal\.|filing\.|export\.|revision\.opened_in_word$|questions\.)/;

/** Build the Find index again when the record has moved on in a way that changes it. */
export async function ensureFindIndex(matters: Matters, matterId: string): Promise<void> {
  const store = await matters.store(matterId);
  const built = store.findIndexSeq();
  if (built === store.lastEventSeq()) return;
  if (built !== null && store.actionsSince(built).every((a) => NOT_INDEXED.test(a))) {
    store.touchFindIndex();
    return;
  }
  const rows: FindRow[] = [];
  const names = new Map(store.listSources().map((s) => [s.id, s.name]));
  for (const s of store.listSources()) {
    for (const p of store.listPages(s.id)) {
      for (const l of p.lines) rows.push({ kind: "line", ref: l.id, label: `${s.name}, p. ${l.page}, l. ${l.line}`, text: l.text });
    }
  }
  for (const e of store.listNotebookEvents()) rows.push({ kind: "event", ref: e.id, label: `${e.dateText} (${names.get(e.sourceId) ?? "source"})`, text: e.description });
  for (const d of store.listDrafts()) {
    const head = d.head;
    if (!head) continue;
    const paras = readParagraphs(await store.revisionBytes(head.id));
    paras.forEach((p, i) => rows.push({ kind: "draft", ref: `${d.id}#${p.anchor ?? i}`, label: `${d.title}, revision ${head.seq}, paragraph ${i + 1}`, text: p.text }));
  }
  for (const a of store.work.listAuthorities()) rows.push({ kind: "authority", ref: a.id, label: a.citation, text: `${a.citation} ${a.parties} ${a.proposition}` });
  for (const m of store.work.listMemoranda()) rows.push({ kind: "memorandum", ref: m.id, label: m.title, text: `${m.title} ${m.body}` });
  for (const i of store.work.listIssues()) rows.push({ kind: "issue", ref: i.id, label: "Issue", text: i.text });
  for (const p of store.studio.listProvisions()) rows.push({ kind: "provision", ref: p.id, label: `${p.act}, s. ${p.section}`, text: `${p.title} ${p.text}` });
  for (const a of store.studio.arguments()) rows.push({ kind: "argument", ref: a.id, label: `${a.ground} argument`, text: `${a.claim} ${a.reasoning}` });
  store.replaceFindIndex(rows);
}

export interface FileEntry {
  path: string;
  size: number;
  isDir: boolean;
  files?: number;
}

/** The matter folder: every file except the content store, which is summarised. */
export async function listMatterFiles(folder: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const walk = async (rel: string) => {
    for (const ent of await readdir(path.join(folder, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (r === "blobs") {
          const blobs = await readdir(path.join(folder, r));
          let size = 0;
          for (const b of blobs) size += (await stat(path.join(folder, r, b))).size;
          out.push({ path: r, size, isDir: true, files: blobs.length });
          continue;
        }
        out.push({ path: r, size: 0, isDir: true });
        await walk(r);
      } else out.push({ path: r, size: (await stat(path.join(folder, r))).size, isDir: false });
    }
  };
  await walk("");
  return out;
}
