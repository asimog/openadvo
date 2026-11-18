# Built-in skills

One folder per skill, with `SKILL.md`: Pi's skill file with Open Advocate's fields in the frontmatter. The format is owned by [../docs/skills.md](../docs/skills.md) section 1 and checked by `src/lib/skills/index.ts`.

Phase 8 (feature N4) adds the practice-pack library: SK-001 to SK-033 (except SK-028, phase 9), SK-101 to SK-110, SK-113 and SK-114, SK-201 to SK-208 and SK-210, SK-301 to SK-305 and SK-307 to SK-309. Each folder also holds `review.json`, the thirteen-parameter review of feature N6 with the score kept with the version. Run `node scripts/review-skills.ts` after a change to a skill.
