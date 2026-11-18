/**
 * Phase 11 (N7): the import of a skill from a file. The advocate sees the raw text, the embedded-
 * instruction scan and the skill check before anything is installed. Install writes one folder
 * under the advocate's skills; it never overwrites an existing one.
 */
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkSkill } from "../lib/skills/index.ts";
import { scanText, type InjectionFinding } from "../lib/verification/injection.ts";

const MAX_BYTES = 256 * 1024;

export interface SkillImportPreview {
  id: string;
  file: string;
  raw: string;
  name: string;
  skillId: string;
  version: string;
  title: string;
  errors: string[];
  findings: InjectionFinding[];
  permittedTools: string[];
  installable: boolean;
}

export interface InstalledSkill {
  previewId: string;
  skillId: string;
  name: string;
  folder: string;
  file: string;
}

export class SkillImport {
  private dir: string;
  private agentTools: readonly string[];
  private previews = new Map<string, SkillImportPreview>();

  constructor(skillsDir: string, agentTools: readonly string[]) {
    this.dir = skillsDir;
    this.agentTools = agentTools;
  }

  /** Read one file and check it. It writes nothing. */
  preview(file: string): SkillImportPreview {
    const info = statSync(file);
    if (!info.isFile()) throw new Error("BAD_SKILL_FILE: the path is not a file");
    if (info.size > MAX_BYTES) throw new Error("BAD_SKILL_FILE: a skill file is at most 256 KB");
    const raw = readFileSync(file, "utf8");
    const findings = scanText(raw);
    let frontmatter: Record<string, unknown> = {};
    let body = "";
    try {
      const parsed = parseFrontmatter<Record<string, unknown>>(raw);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch (e) {
      const preview: SkillImportPreview = { id: randomUUID(), file, raw, name: "", skillId: "", version: "", title: "", errors: [`the file cannot be read: ${(e as Error).message}`], findings, permittedTools: [], installable: false };
      this.previews.set(preview.id, preview);
      return preview;
    }
    const loaded = checkSkill({ frontmatter, body, file, author: "advocate", agentTools: [...this.agentTools] });
    const errors = loaded.summary.error ? loaded.summary.error.split("; ") : [];
    const preview: SkillImportPreview = {
      id: randomUUID(),
      file,
      raw,
      name: String(frontmatter.name ?? ""),
      skillId: String(frontmatter.id ?? ""),
      version: String(frontmatter.version ?? ""),
      title: String(frontmatter.title ?? frontmatter.name ?? ""),
      errors,
      findings,
      permittedTools: loaded.summary.permittedTools,
      installable: errors.length === 0,
    };
    this.previews.set(preview.id, preview);
    return preview;
  }

  /** Install one previewed skill. The same name never overwrites: a suffix keeps both. */
  install(id: string): InstalledSkill {
    const preview = this.previews.get(id);
    if (!preview) throw new Error(`NOT_FOUND: no skill preview ${id}`);
    if (!preview.installable) throw new Error(`BAD_SKILL: ${preview.errors.join("; ")}`);
    mkdirSync(this.dir, { recursive: true });
    let name = preview.name;
    let folder = path.join(this.dir, name);
    for (let n = 2; existsSync(folder); n++) {
      name = `${preview.name}-${n}`;
      folder = path.join(this.dir, name);
    }
    mkdirSync(folder);
    const file = path.join(folder, "SKILL.md");
    writeFileSync(file, preview.raw, { flag: "wx" });
    this.previews.delete(id);
    return { previewId: id, skillId: preview.skillId, name, folder, file };
  }
}
