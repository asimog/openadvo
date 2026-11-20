# 2026-11-20 — Systems-design report on the current code

Task (docs-only): write a systems design report based on the **current implementation** (not the proposed design), covering the fourteen named capabilities, the relationships (owner, consumer, contract, exchange, coupling, duplication risk) and the twenty systems-design principles. The report stands alone on code citations and does not depend on the other series documents.

## Output

- `docs/rewrite/capability-map-current.md`: the implemented feature inventory for all fourteen capabilities with file:line evidence; a 21-row relationship matrix describing how the code is actually wired (including the observed duplications: three contract copies, ten allowlists, dual-held chat state, the SLP default chain, the two-door filing submit path, the three-store court-intel driver); six prose analyses of the load-bearing relationships; the twenty principles with evidence-backed verdicts; and a closing systems diagnosis (a well-tested store layer wearing an unowned application).
- `docs/rewrite/README.md` — row 16 added.

## Basis

- All citations are from the code at commit `26ac806` (src/ unchanged since). No commands were run for this report; its evidence was verified earlier in this session and is re-cited here directly from files.
