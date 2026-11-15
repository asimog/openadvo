# Build plan

Accepted by the owner on 2026-11-15. This file owns the phases, the order of work inside a phase, the proof tests and the exits. The scope of each phase is a list of feature ids from [features.md](features.md) and skill ids from [skills.md](skills.md).

Rules for every phase (lessons L1, L3 and L5 in [../AGENTS.md](../AGENTS.md)):

- A phase starts with a one-page spec for the step being started, not for the whole phase. Specs go in [specs/](specs/).
- Build a thin version of every part of the phase, joined end to end, before any part gets more features.
- Done means the owner completed a real task on a real brief. A document or a test the agent wrote is not done.

## 1. Phases

Each phase has a scope and an exit, which the owner completes on real briefs.

### Phase 1: the universal harness (Supreme Court, Delhi High Court, Delhi district courts; criminal, civil and writ packs)

Scope: Q1–Q7, A1–A3, A5, A7, A8, B1–B6, B9, B10, B13, C1–C9, D6, E1, E4, E9, F1, F3, F5, F6, F8, G2, G5, G8, H1, H3, H6, H9, H12, H14, I1–I6, I8, J2, J4, K1–K3, K6, K7, K9, L1–L4, L7, L10, M1, M2, M5, N1–N5, N8, N9, O1, O2, O5, O6, O8–O10, P1–P3, P5–P11, P13, R1, R2, S1, S2 (three adapters), T1–T4, T6–T8, V1, V5, W4, Y4, Y5; skills marked P 1.

Order inside the phase: stores and policy (Q2, Q6) → packs and directory (B1–B6, Q1) → matter fields and the SLP move (C1, Q3) → registry and runner (N1–N3, I1) → checks (P1–P11) → onboarding and profile (A1–A8) → skills by pack → navigation (Q7).

Exit: the proof tests of phase 1 (section 2).

### Phase 2: deep law and evidence

Scope: A4, A6, A9, A10, B7, B8, B12, C7, D1–D4, E2, E3, E5–E8, F2, F4, F7, G1, G3, G4, G6, G7, H5, H7, H8, H10, H11, H13, H15, J1, J3, J5–J7, K4, K8, K10, L5, L6, L8, M3, M4, O3, O4, O7, P4, P12, T5, U1, V4, X1; skills marked P 2; packs commercial and arbitration in part.

Exit: the proof tests of phase 2 (section 2).

### Phase 3: court operations, monitoring and communications

Scope: B11, E10, H2, H4, I7, K5, M6, N6, R3, S3–S8, S11, V2, V3, X3, Y2; adapters for two more High Courts the owner names; skills marked P 3.

Exit: the proof tests of phase 3, run over four weeks of real practice.

### Phase 4: builders, automation and the remaining packs

Scope: D5, H16, L9, N7, N10, S9, S10, U2, U3, X2, Y1, Y3; the packs in 19.6; the skills marked P 4; adapters for tribunals in the enabled packs.

Exit: one real brief per new pack completed by the owner, or by an advocate the owner names.

### Phase 5: chamber work

Scope: A11, W1–W3, S2 for the remaining courts of the advocate's profile.

Exit: a matter moved between two installations with roles, comments and review, and nothing lost or exposed.

---

## 2. Proof tests

The owner runs each test on a real brief. The evidence is the owner's own review against official rules, statutes and judgments. One model agreeing with another is not evidence.

| Test | Phase | What must be correct |
|---|---|---|
| Onboarding | 1 | The court and practice profile are right in under three minutes; the packs that load match |
| Supreme Court SLP | 1 | No loss against what the code does today; route and grounds |
| Criminal bail (Delhi) | 1 | Facts, custody period, provisions in force on the date, authorities, the application draft |
| Quashing petition (Delhi High Court) | 1 | Ingredients chart with anchors, adverse authority, petition draft |
| Writ (Delhi High Court) | 1 | Maintainability questions, the filing checklist under current rules |
| Delhi High Court filing | 1 | Current checklist, index, paper book, format checks |
| Civil injunction | 2 | Issues, evidence, conditions chart, draft |
| Section 34 challenge | 2 | Statutory route, limitation, grounds |
| Returning to an old matter | 2 | Prior decisions, instructions, open items and posture are recovered |
| New adverse judgment | 3 | Every affected matter and draft is identified; nothing changes without approval |
| New order in a monitored case | 3 | Order ingested, directions extracted, deadlines proposed, impact check raised |
| Draft review | 1 | Every error is supported by a source and has an accurate reference |
| Bulk evidence (1,000+ pages) | 2 | Coverage stated; review table cells anchored; contradictions found |
| Hindi records | 2 | Readings, disputes and anchors work on a Hindi order |

---

## 3. Phase 1, first steps

1. Write the one-page spec of the first step: stores and policy (Q2, Q6).
2. Run two spikes before the code that needs them: the vector index choice (G6, sqlite-vec against a TypeScript index), and the reach of the Delhi High Court and eCourts sites through the visible browser (S2). Each spike has a result file in `spikes/`.
3. Then follow the order of Phase 1 in section 1.

Where the work stands is recorded in the session reports in `../.agents/logs/`.
