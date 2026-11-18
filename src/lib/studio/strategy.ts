/**
 * Phase 7 (K4): the Strategy view's reading of the records. A plain assembler:
 * the live theories, the standing of the accepted arguments, the attack that fells each
 * "out" one, the attack graph's dependencies, and the weaknesses (the loop's weak points
 * and the record-table gaps). It decides nothing and states no probability.
 */
import type { ArgumentRecord, ArgumentStatus, TheoryRecord } from "../../shared/studio.ts";

export interface WeakPoint {
  claim: string;
  questions: string[];
  attacks: Array<{ kind: string; claim: string }>;
}

export interface RecordGap {
  columnId: string;
  question: string;
}

export interface StrategyInput {
  arguments: Array<ArgumentRecord & { computed: ArgumentStatus }>;
  theories: TheoryRecord[];
  weakPoints: WeakPoint[];
  gaps: RecordGap[];
}

export interface StandingRow {
  id: string;
  claim: string;
  standing: ArgumentStatus;
  /** The attack that fells an "out" argument, in its own words; null otherwise. */
  felledBy: string | null;
}

export interface DependencyRow {
  attackerId: string;
  attacker: string;
  kind: string;
  targetId: string;
  target: string;
}

export interface StrategyView {
  theories: TheoryRecord[];
  standing: StandingRow[];
  dependencies: DependencyRow[];
  weaknesses: { weakPoints: WeakPoint[]; gaps: RecordGap[] };
}

export function strategyView(input: StrategyInput): StrategyView {
  const live = input.arguments.filter((a) => a.status !== "rejected");
  const standing = live
    .filter((a) => a.status === "accepted" && !a.attacks)
    .map((a) => {
      const attackers = live.filter((x) => x.attacks === a.id);
      const fell = attackers.find((x) => x.computed === "in") ?? attackers[0] ?? null;
      return { id: a.id, claim: a.claim, standing: a.computed, felledBy: a.computed === "out" ? (fell?.claim ?? null) : null };
    });
  const byId = new Map(live.map((a) => [a.id, a]));
  const dependencies = live
    .filter((a) => a.attacks && byId.has(a.attacks))
    .map((a) => ({ attackerId: a.id, attacker: a.claim, kind: a.attackKind ?? "attack", targetId: a.attacks!, target: byId.get(a.attacks!)!.claim }));
  return {
    theories: input.theories.filter((t) => t.status !== "rejected"),
    standing,
    dependencies,
    weaknesses: { weakPoints: input.weakPoints, gaps: input.gaps },
  };
}
