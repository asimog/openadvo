/**
 * Phase 7 (K5): the dissent panel. One hard question, every configured model answers, and the
 * answers are shown side by side. Each answer must be anchored to the record or an authority by
 * the same check as the rehearsal's; an unanchored answer is kept with its reason, never
 * dropped. The split rule is mechanical: two answers that overlap on less than the loop's
 * duplicate threshold are a split, and one review item names every answer. No answer is weighed.
 *
 * Plain library. No outcome is predicted.
 */
import { aliases, contextText, DUPLICATE_OVERLAP, extractJson, labelAliases, overlapWith, SYSTEM, type Aliases, type Complete, type LoopContext } from "./index.ts";
import { ground } from "./rehearsal.ts";

/** One member of the panel: a role and its model, distinct models only. */
export interface PanelMember {
  role: string;
  model: string;
  complete: Complete;
}

export interface PanelAnswer {
  role: string;
  model: string;
  /** The answer with its aliases labelled; empty when refused. */
  answer: string;
  /** The refusal's reason when the model did not answer anchored; empty when it did. */
  refused: string;
}

export interface PanelResult {
  answers: PanelAnswer[];
  /** True when two answers overlap on less than the duplicate threshold. Never a judgment. */
  split: boolean;
  /** The pair that split, when there is one. */
  splitPair: Array<{ role: string; model: string }> | null;
}

export function dissentPrompt(context: string, question: string): string {
  return `${context}\n\nTASK: A hard question of this matter is put to you: "${question}". Answer it in at most four sentences, anchored to the record or an authority above, and say plainly when the record does not settle it. Do not predict the outcome. Return JSON: {"answer":"...","events":[{"ref":"E1","quote":"exact words"}],"authorities":[{"ref":"A1","paragraph":"12"}]}`;
}

/**
 * Ask the panel. The members run in parallel; every answer or refusal is returned, in the order
 * the panel was given.
 */
export async function runDissent(question: string, ctx: LoopContext, panel: PanelMember[]): Promise<PanelResult> {
  const al: Aliases = aliases(ctx);
  const context = contextText(ctx, al);
  const answers: PanelAnswer[] = await Promise.all(
    panel.map(async (member): Promise<PanelAnswer> => {
      try {
        const t = await member.complete(SYSTEM, dissentPrompt(context, question), `dissent-${member.role}`);
        const o = (extractJson(t) ?? {}) as Record<string, unknown>;
        const raw = typeof o.answer === "string" ? o.answer.trim() : "";
        if (!raw) return { role: member.role, model: member.model, answer: "", refused: "the model gave no answer" };
        const g = ground(o, al);
        if ("reason" in g) return { role: member.role, model: member.model, answer: "", refused: g.reason };
        return { role: member.role, model: member.model, answer: labelAliases(raw, al), refused: "" };
      } catch (e) {
        return { role: member.role, model: member.model, answer: "", refused: (e as Error).message.slice(0, 300) };
      }
    }),
  );
  // The split rule, mechanically: two grounded answers whose words overlap less than the loop's
  // duplicate threshold. Refusals never split a panel on their own.
  const given = answers.filter((a) => a.answer);
  let splitPair: PanelResult["splitPair"] = null;
  for (let i = 0; i < given.length && !splitPair; i++) {
    for (let j = i + 1; j < given.length; j++) {
      if (overlapWith(given[i].answer, [given[j].answer]) < DUPLICATE_OVERLAP) {
        splitPair = [
          { role: given[i].role, model: given[i].model },
          { role: given[j].role, model: given[j].model },
        ];
        break;
      }
    }
  }
  return { answers, split: splitPair !== null, splitPair };
}
