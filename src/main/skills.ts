/**
 * N1: discovery of skill files. Built-in skills are in `skills/` of the application; the
 * advocate's own are in `<userData>/skills/`. Each skill is a folder with SKILL.md, read with
 * Pi's frontmatter parser (Pi's skill format, harness-hardening H-16). The checks and the
 * registry are in src/lib/skills (decision 6).
 */
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { buildRegistry, checkSkill, type LoadedSkill, type Registry } from "../lib/skills/index.ts";
import type { ReviewRecord } from "../lib/skills/review.ts";

function skillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const folder = path.join(dir, name);
    const file = path.join(folder, "SKILL.md");
    try {
      if (statSync(folder).isDirectory() && existsSync(file)) out.push(file);
    } catch {
      // A folder that vanished while listing is skipped.
    }
  }
  return out;
}

export function loadSkillDir(dir: string, author: "built-in" | "advocate", agentTools: readonly string[]): LoadedSkill[] {
  return skillFiles(dir).map((file) => {
    try {
      const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(readFileSync(file, "utf8"));
      // N6: the review record is kept with the version, beside SKILL.md.
      const recordFile = path.join(path.dirname(file), "review.json");
      let review: ReviewRecord | null = null;
      if (existsSync(recordFile)) {
        try {
          review = JSON.parse(readFileSync(recordFile, "utf8")) as ReviewRecord;
        } catch {
          review = null;
        }
      }
      return checkSkill({ frontmatter, body, file, author, agentTools, review });
    } catch (e) {
      const empty = checkSkill({ frontmatter: {}, body: "", file, author, agentTools });
      return { skill: null, summary: { ...empty.summary, error: `the file cannot be read: ${(e as Error).message}` } };
    }
  });
}

export class SkillRegistry {
  private cached: Registry | null = null;
  private readonly dirs: { builtIn: string; advocate: string };
  private readonly agentTools: readonly string[];
  constructor(dirs: { builtIn: string; advocate: string }, agentTools: readonly string[]) {
    this.dirs = dirs;
    this.agentTools = agentTools;
  }

  /** The registry, read again when `fresh` (the Workflows & Skills view reloads it). */
  get(fresh = false): Registry {
    if (!this.cached || fresh) {
      this.cached = buildRegistry([...loadSkillDir(this.dirs.builtIn, "built-in", this.agentTools), ...loadSkillDir(this.dirs.advocate, "advocate", this.agentTools)]);
    }
    return this.cached;
  }

  folders(): { builtIn: string; advocate: string } {
    return { ...this.dirs };
  }
}
