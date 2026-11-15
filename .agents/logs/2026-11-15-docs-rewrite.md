# Docs archived and rewritten

Date: 2026-11-15. Owner's instruction: "archive old docs. and rewrite new ones". Source of the new docs: `2026-11-15-litigation-harness-report.md` and `2026-11-15-litigation-harness-plan.md` (commit b37a3e2).

## Done

- `git mv` of all 9 old docs and `docs/specs/` (15 specs) to `docs/archive/2026-11-15/`; added `ARCHIVED.md` there.
- Code comments that cite docs (26 files in `src/` and `scripts/`) repointed to `docs/archive/2026-11-15/` by sed. All were comments.
- New docs: README, product, advocate-workflow, decisions, architecture, features, skills, build-plan, engineering, repo-map, questions, parking, specs/README.
- `features.md`, `skills.md`, `build-plan.md` and `architecture.md` are extracted from the plan and the report by line range, with the cross-references rewritten to the new owners.
- `AGENTS.md` and `README.md`: product line and links updated; AGENTS.md gains "never edit `docs/archive/`".

## Commands and results

| Command | Result |
|---|---|
| grep of `docs/` paths in `src`, `scripts` outside comments | none |
| existence check of every repointed path in code | no missing path |
| relative-link check of AGENTS.md, README.md and new docs | no broken link |
| `grep -cE '^\| [A-Z][0-9]+ \|' docs/features.md` | 204 |
| `grep -cE '^\| SK-' docs/skills.md` | 81 (plus 16 packs in 2.6) |
| `npm run typecheck` | exit 0 |
| link check inside `docs/archive/2026-11-15/` | 13 links broken by the move (depth changed); left as is, the archive is not edited |

## Mismatches recorded

- Old ruling R-1 (advisory outcome score) conflicts with the new "no outcome prediction" rule. The code builds no score; `src/lib/drafting/structured.ts:253` prints "not available". Superseded by decision 18.
- Engineering choice ids were renamed EC-1 to EC-11 to avoid a clash with feature ids E1 to E10.
