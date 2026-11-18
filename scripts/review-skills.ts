/**
 * Phase 8 (N6): write each built-in skill's review record beside its SKILL.md. The review is
 * deterministic (src/lib/skills/review.ts); the record keeps the score with the version. Run:
 * node scripts/review-skills.ts
 */
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkSkill } from "../src/lib/skills/index.ts";
import { reviewSkill, type ReviewRecord } from "../src/lib/skills/review.ts";
import { AGENT_TOOLS } from "../src/main/agent.ts";

const repo = path.resolve(import.meta.dirname, "..");
const dir = path.join(repo, "skills");
let failed = 0;
let reviewed = 0;

for (const name of readdirSync(dir).sort()) {
  const folder = path.join(dir, name);
  const file = path.join(folder, "SKILL.md");
  if (!statSync(folder).isDirectory() || !existsSync(file)) continue;
  reviewed++;
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(readFileSync(file, "utf8"));
  const loaded = checkSkill({ frontmatter, body, file, author: "advocate", agentTools: AGENT_TOOLS });
  if (!loaded.skill) {
    console.error(`${name}: cannot read the skill: ${loaded.summary.error}`);
    failed++;
    continue;
  }
  const review = reviewSkill(loaded.skill, null);
  const record: ReviewRecord = {
    version: review.version,
    score: review.score,
    max: review.max,
    parameters: review.parameters,
    failure_modes: review.failureModes,
    reviewed_at: review.reviewedAt,
    fixtures: review.fixtures,
  };
  writeFileSync(path.join(folder, "review.json"), `${JSON.stringify(record, null, 2)}\n`);
  if (review.defects.length) console.log(`${loaded.skill.id}: ${review.score}/${review.max} — ${review.defects.join(" | ")}`);
  if (review.failureModes.length) failed++;
}
if (failed) process.exitCode = 1;
console.log(`Reviewed ${reviewed} skills.`);
