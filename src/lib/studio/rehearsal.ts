/**
 * V5-11: admission-hearing rehearsal. Model calls propose the bench's likely questions with a
 * one-line answer, and opposing counsel's objections with a response; code keeps only those
 * whose answer is anchored to the record or an authority, by the same checks as the argument
 * loop. No outcome is predicted. Plain library. Spec: docs/specs/v5.md.
 */
import { aliases, contextText, extractJson, labelAliases, SYSTEM, type Aliases, type Complete, type LoopContext } from "./index.ts";

export const OBJECTION_CATEGORIES = ["maintainability", "limitation", "delay", "alternative_remedy", "distinction", "other"] as const;

export interface RehearsalItem {
  kind: "bench_question" | "objection";
  category: string;
  text: string;
  answer: string;
  /** Record events and authorities the answer relies on (ids). */
  refs: string[];
}

export interface RehearsalResult {
  items: RehearsalItem[];
  rejected: Array<{ text: string; reason: string }>;
  calls: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function ground(o: Record<string, unknown>, al: Aliases): { refs: string[] } | { reason: string } {
  const refs: string[] = [];
  for (const e of Array.isArray(o.events) ? (o.events as Array<Record<string, unknown>>) : []) {
    const ref = str(e?.ref).toUpperCase();
    if (!ref) continue;
    const ev = al.events.get(ref);
    if (!ev) return { reason: `${ref} is not a confirmed event of the record` };
    const q = str(e?.quote);
    if (!q || !norm(ev.text).includes(norm(q))) return { reason: `the quote "${q.slice(0, 60)}" is not in ${ref}` };
    refs.push(ev.id);
  }
  for (const a of Array.isArray(o.authorities) ? (o.authorities as Array<Record<string, unknown>>) : []) {
    const ref = str(a?.ref).toUpperCase();
    if (!ref) continue;
    const au = al.authorities.get(ref);
    if (!au) return { reason: `${ref} is not an authority of the matter` };
    if (au.citationFailed) return { reason: `${au.citation} failed the citation check and is not attested` };
    refs.push(au.id);
  }
  if (refs.length === 0) return { reason: "the answer is not anchored to the record or an authority" };
  return { refs };
}

export function questionsPrompt(context: string): string {
  return `${context}\n\nTASK: The petition is at the admission hearing before the Supreme Court, which lasts two to five minutes. List the three questions the bench is most likely to ask, each with a one-line answer for the advocate anchored to the record or an authority above. Do not predict the outcome. Return JSON: {"questions":[{"question":"...","answer":"...","events":[{"ref":"E1","quote":"exact words"}],"authorities":[{"ref":"A1","paragraph":"12"}]}]}`;
}

export function objectionsPrompt(context: string): string {
  return `${context}\n\nTASK: As counsel for the respondent at the admission hearing, raise the strongest objections (categories: ${OBJECTION_CATEGORIES.join(", ")}). For each, give the petitioner's one-line response anchored to the record or an authority above. At most five. Return JSON: {"objections":[{"category":"limitation","objection":"...","response":"...","events":[{"ref":"E1","quote":"exact words"}],"authorities":[]}]}`;
}

export async function rehearse(complete: Complete, ctx: LoopContext): Promise<RehearsalResult> {
  const al = aliases(ctx);
  const context = contextText(ctx, al);
  const [q, o] = await Promise.all([complete(SYSTEM, questionsPrompt(context), "rehearsal-questions"), complete(SYSTEM, objectionsPrompt(context), "rehearsal-objections")]);
  const items: RehearsalItem[] = [];
  const rejected: RehearsalResult["rejected"] = [];
  const qj = extractJson(q) as { questions?: unknown } | null;
  for (const raw of Array.isArray(qj?.questions) ? (qj!.questions as Array<Record<string, unknown>>) : []) {
    const text = str(raw.question);
    const answer = str(raw.answer);
    if (!text || !answer) continue;
    const g = ground(raw, al);
    if ("reason" in g) rejected.push({ text, reason: g.reason });
    else items.push({ kind: "bench_question", category: "bench", text: labelAliases(text, al), answer: labelAliases(answer, al), refs: g.refs });
  }
  const oj = extractJson(o) as { objections?: unknown } | null;
  for (const raw of Array.isArray(oj?.objections) ? (oj!.objections as Array<Record<string, unknown>>) : []) {
    const text = str(raw.objection);
    const answer = str(raw.response);
    if (!text || !answer) continue;
    const category = (OBJECTION_CATEGORIES as readonly string[]).includes(str(raw.category)) ? str(raw.category) : "other";
    const g = ground(raw, al);
    if ("reason" in g) rejected.push({ text, reason: g.reason });
    else items.push({ kind: "objection", category, text: labelAliases(text, al), answer: labelAliases(answer, al), refs: g.refs });
  }
  return { items, rejected, calls: 2 };
}
