/**
 * Phase 2: the bridge functions of local legal intelligence and filing readiness
 * (docs/specs/court-adapters.md). Human-only ones (the profile's courts, a correction of a list,
 * a bench row, a matter's court, a ticked item, a defect cured, an adapter added or copied) are
 * never agent tools (decision 5).
 */
import type { CourtIntel } from "./court-intel.ts";
import type { Matters } from "./matters.ts";
import { DIRECTORY_NOTE, DIRECTORY_VERSION, appealRoute, searchDirectory } from "../lib/court-directory/index.ts";

type Handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) => void;

const str = (v: unknown): string => String(v ?? "");

export function registerIntelBridge(handle: Handle, d: { intel: CourtIntel; matters: Matters; onEvent?: (matterId: string, event: "defect_received", subject: string) => void }): void {
  // B1: the directory, offline.
  handle("intel:directory", (query: string) => ({ version: DIRECTORY_VERSION, note: DIRECTORY_NOTE, courts: searchDirectory(str(query), 60) }));
  handle("intel:route", (courtId: string) => appealRoute(str(courtId)).map((c) => ({ id: c.id, name: c.name, appealNote: c.appealNote ?? null })));
  // The profile decides what is needed.
  handle("intel:profile", () => d.intel.profile());
  handle("intel:set-profile", (input: { courts?: string[]; practice?: string[] }) => d.intel.setProfile({ courts: Array.isArray(input?.courts) ? input.courts.map(str) : undefined, practice: Array.isArray(input?.practice) ? input.practice.map(str) : undefined }));
  handle("intel:overview", () => d.intel.overview());
  // The adapters: tiers, versions, errors; modify and vendor in.
  handle("intel:adapters", (fresh?: boolean) => d.intel.adapters(fresh === true));
  handle("intel:fork-adapter", (id: string) => d.intel.forkAdapter(str(id)));
  handle("intel:add-adapter", (file: string) => d.intel.addAdapter(str(file)));
  // Lists: built on demand; corrections by the advocate (B10); a source uploaded by hand (B2).
  handle("intel:build-list", (adapterId: string, key: string) => d.intel.buildList(str(adapterId), str(key)));
  handle("intel:list", (adapterId: string, key: string) => d.intel.readList(str(adapterId), str(key)));
  handle("intel:edit-list", (listId: string, change: { n: number | null; text: string; source: string; ref?: string }) =>
    d.intel.editList(str(listId), { n: change?.n == null ? null : Number(change.n), text: str(change?.text), source: str(change?.source), ref: change?.ref ? str(change.ref) : undefined }),
  );
  handle("intel:upload-source", (adapterId: string, sourceKey: string, file: string) => d.intel.uploadSource(str(adapterId), str(sourceKey), str(file)));
  handle("intel:add-bench", (input: { court: string; date: string; bench: string; judges: string; source: string }) =>
    d.intel.addBench({ court: str(input?.court), date: str(input?.date), bench: str(input?.bench), judges: str(input?.judges), source: str(input?.source) }),
  );
  // A matter: its court and case type, its checklist, format checks and defects (B11 to B14).
  handle("filing:set-target", (matterId: string, court: string, caseType: string) => d.intel.setTarget(str(matterId), str(court), str(caseType)));
  handle("filing:checklist", (matterId: string) => d.intel.checklist(str(matterId)));
  handle("filing:check-item", (matterId: string, listId: string, itemId: string, state: string, note: string) => {
    if (state !== "open" && state !== "done" && state !== "not_applicable") throw new Error("BAD_STATE: open, done or not_applicable");
    return d.intel.setCheck(str(matterId), str(listId), str(itemId), state, str(note));
  });
  handle("filing:format-checks", (matterId: string) => d.intel.formatChecks(str(matterId)));
  handle("filing:defects", async (matterId: string) => (await d.matters.store(str(matterId))).defects());
  handle("filing:import-defects", async (matterId: string, text: string) => {
    const rows = await d.intel.importDefects(str(matterId), str(text));
    d.onEvent?.(str(matterId), "defect_received", `${rows.length} defect(s) imported`);
    return rows;
  });
  handle("filing:set-defect", async (matterId: string, id: string, cured: boolean) => (await d.matters.store(str(matterId))).setDefect(str(id), cured === true, { actor: "advocate" }));
}
