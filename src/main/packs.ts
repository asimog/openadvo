/**
 * Phase 8: the built-in practice packs on disk. The packs are data in `packs/` of the
 * application; this module reads them once, checks each, and answers what a matter's pack is.
 * The library is plain (src/lib/packs); only this module touches the filesystem.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildPacks, packForMatter, type PackSubject } from "../lib/packs/index.ts";
import type { PackChoice, PackSummary, PracticePack } from "../shared/packs.ts";

export class PracticePacks {
  private cached: { packs: PracticePack[]; summaries: PackSummary[] } | null = null;
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  get(fresh = false): { packs: PracticePack[]; summaries: PackSummary[] } {
    if (!this.cached || fresh) {
      const raws: unknown[] = [];
      try {
        for (const name of readdirSync(this.dir).filter((n) => n.endsWith(".json")).sort()) {
          try {
            raws.push(JSON.parse(readFileSync(path.join(this.dir, name), "utf8")) as unknown);
          } catch {
            raws.push({ id: name.replace(/\.json$/i, ""), version: "0.0.0", title: name, practice: [], courts: [], proceedings: [] });
          }
        }
      } catch {
        // No packs folder: the Filing tab and the Practice map say no pack is available.
      }
      this.cached = buildPacks(raws);
    }
    return this.cached;
  }

  /** The pack and proceeding of a matter, or null when no pack applies. */
  choiceFor(profile: { practiceArea?: string; caseType?: string; proceeding?: string; court?: string }, detailsCourt: string, advocatePractice: readonly string[]): PackChoice | null {
    const { packs } = this.get();
    const practice = (profile.practiceArea ?? "").trim();
    const mapped = practice || advocatePractice.find((p) => packs.some((x) => x.practice.some((y) => y.toLowerCase() === p.toLowerCase()) || (p.toLowerCase() === "constitutional" && x.id === "writ"))) || "";
    const subject: PackSubject = {
      practiceArea: mapped,
      caseType: profile.caseType ?? "",
      proceeding: profile.proceeding ?? "",
      court: (profile.court ?? "").trim() || detailsCourt,
    };
    return packForMatter(packs, subject);
  }
}
