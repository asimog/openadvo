/**
 * V4-3: the argument loop. Built here, comparable to MOTO (Intrafere/MOTO, MIT; not vendored,
 * no code copied): generators, staged validators, a diversity archive keyed by ground and
 * stance, pairwise comparison, and typed rejection memory. Plain library: the model call, the
 * records and the writes are passed in. Spec: docs/specs/v4.md.
 *
 * Code decides what is grounded and what an argument's status is. A model only proposes text,
 * lists critical questions, writes attacks, and compares two arguments on grounding and clarity.
 */
import { GROUNDS, STANCES, type ArgumentStatus, type Ground, type RejectionReason, type Stance } from "../../shared/studio.ts";
import { shingles, words } from "../document-intelligence/similar.ts";

// ---------------------------------------------------------------------------------------------
// The context: records only, with short aliases the model copies (E1, A1, P1).

export interface LoopEvent {
  id: string;
  date: string;
  text: string;
  source: string;
}
export interface LoopAuthority {
  id: string;
  citation: string;
  parties: string;
  paragraph: string;
  proposition: string;
  role: string;
  /** True when the validator failed it (or could not resolve it) and the advocate has not attested it. */
  citationFailed: boolean;
}
export interface LoopProvision {
  id: string;
  act: string;
  section: string;
  title: string;
  text: string;
  repealed: boolean;
}

export interface LoopContext {
  issue: string;
  matter: string;
  events: LoopEvent[];
  authorities: LoopAuthority[];
  provisions: LoopProvision[];
}

export interface Aliases {
  events: Map<string, LoopEvent>;
  authorities: Map<string, LoopAuthority>;
  provisions: Map<string, LoopProvision>;
}

export function aliases(ctx: LoopContext): Aliases {
  return {
    events: new Map(ctx.events.map((e, i) => [`E${i + 1}`, e])),
    authorities: new Map(ctx.authorities.map((a, i) => [`A${i + 1}`, a])),
    provisions: new Map(ctx.provisions.map((p, i) => [`P${i + 1}`, p])),
  };
}

export function contextText(ctx: LoopContext, al: Aliases): string {
  const lines = [`MATTER: ${ctx.matter}`, `ISSUE: ${ctx.issue}`, "", "RECORD (confirmed events; quote words exactly from the text when you rely on one):"];
  for (const [k, e] of al.events) lines.push(`${k} [${e.date}] ${e.text} (${e.source})`);
  if (al.events.size === 0) lines.push("(none)");
  lines.push("", "AUTHORITIES OF THE MATTER (cite only these, by alias):");
  for (const [k, a] of al.authorities) lines.push(`${k} ${a.citation}${a.parties ? `, ${a.parties}` : ""}${a.paragraph ? `, para ${a.paragraph}` : ""} [${a.role}]${a.proposition ? `: ${a.proposition}` : ""}`);
  if (al.authorities.size === 0) lines.push("(none)");
  lines.push("", "PROVISIONS OF THE MATTER (cite only these, by alias):");
  for (const [k, p] of al.provisions) lines.push(`${k} ${p.act}, section ${p.section}: ${p.title}${p.repealed ? " [REPEALED]" : ""}`);
  if (al.provisions.size === 0) lines.push("(none)");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// The archive: cells of ground × stance.

export interface Cell {
  ground: Ground;
  stance: Stance;
}

export const ALL_CELLS: Cell[] = GROUNDS.flatMap((ground) => STANCES.map((stance) => ({ ground, stance })));

/** Diversity: the cells with the fewest arguments first, petitioner before respondent on a tie. */
export function pickCells(counts: Map<string, number>, n: number, stances: Stance[] = ["petitioner"]): Cell[] {
  const cells = ALL_CELLS.filter((c) => stances.includes(c.stance));
  const order = [...cells].sort((a, b) => (counts.get(`${a.ground}/${a.stance}`) ?? 0) - (counts.get(`${b.ground}/${b.stance}`) ?? 0));
  return order.slice(0, Math.max(1, n));
}

// ---------------------------------------------------------------------------------------------
// Prompts and parsing.

export const SYSTEM = [
  "You assist an Advocate-on-Record in the Supreme Court of India. You propose arguments; the advocate decides.",
  "Use only the record, authorities and provisions given, by their aliases. Do not invent facts, citations, paragraphs or sections.",
  "Do not predict outcomes, the court's view, or any probability of success.",
  "Answer with JSON only, no prose before or after.",
].join(" ");

export interface Candidate {
  ground: string;
  stance: string;
  claim: string;
  reasoning: string;
  events: Array<{ ref: string; quote: string }>;
  authorities: Array<{ ref: string; paragraph: string }>;
  provisions: string[];
}

const SHAPE = `{"arguments":[{"claim":"one sentence","reasoning":"the steps, citing E/A/P aliases","events":[{"ref":"E1","quote":"exact words from E1"}],"authorities":[{"ref":"A1","paragraph":"12"}],"provisions":["P1"]}]}`;

export function generatorPrompt(context: string, cell: Cell, rejections: Array<{ reason: string; detail: string }>, perCall: number): string {
  const memory = rejections.length
    ? `\nEarlier candidates for this cell were rejected. Avoid these faults:\n${rejections.map((r) => `- ${r.reason}: ${r.detail}`).join("\n")}\n`
    : "";
  return `${context}\n\nTASK: Propose up to ${perCall} distinct ${cell.ground} arguments for the ${cell.stance} on the ISSUE. Each must rely on at least one record event or authority above.${memory}\nReturn exactly this JSON shape:\n${SHAPE}`;
}

export function criticPrompt(context: string, claim: string, reasoning: string): string {
  return `${context}\n\nARGUMENT: ${claim}\nREASONING: ${reasoning}\n\nTASK: List the critical questions this argument does not answer (for its scheme: argument from precedent, from statute, or from the record). At most 5, each one sentence. Return JSON: {"questions":["..."]}`;
}

export function opponentPrompt(context: string, claim: string, reasoning: string, stance: Stance): string {
  const other = stance === "petitioner" ? "respondent" : "petitioner";
  return `${context}\n\nARGUMENT OF THE ${stance.toUpperCase()}: ${claim}\nREASONING: ${reasoning}\n\nTASK: As counsel for the ${other}, write at most 2 attacks on this argument. Each attack is "rebut" (attacks the conclusion), "undercut" (attacks the inference) or "undermine" (attacks a premise). Rely only on the aliases above. Return JSON: {"arguments":[{"kind":"undercut","claim":"...","reasoning":"...","events":[{"ref":"E1","quote":"..."}],"authorities":[{"ref":"A1","paragraph":"3"}],"provisions":[]}]}`;
}

export function judgePrompt(context: string, a: string, b: string): string {
  return `${context}\n\nARGUMENT A: ${a}\n\nARGUMENT B: ${b}\n\nTASK: Which argument is better grounded in the record and authorities above, and more clearly reasoned? Judge only grounding and clarity, not who will win. Return JSON: {"better":"A"} or {"better":"B"}`;
}

/** The first JSON object or array in a model's answer, or null. Code fences are allowed. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  for (const open of ["{", "["]) {
    const start = t.indexOf(open);
    if (start < 0) continue;
    const close = open === "{" ? "}" : "]";
    for (let end = t.lastIndexOf(close); end > start; end = t.lastIndexOf(close, end - 1)) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        // try a shorter span
      }
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseCandidates(text: string, cell: Cell): { candidates: Candidate[]; kinds: string[] } | null {
  const j = extractJson(text) as { arguments?: unknown } | unknown[] | null;
  const list = Array.isArray(j) ? j : Array.isArray((j as { arguments?: unknown })?.arguments) ? ((j as { arguments: unknown[] }).arguments) : null;
  if (!list) return null;
  const candidates: Candidate[] = [];
  const kinds: string[] = [];
  for (const raw of list) {
    const o = (raw ?? {}) as Record<string, unknown>;
    candidates.push({
      ground: cell.ground,
      stance: cell.stance,
      claim: str(o.claim),
      reasoning: str(o.reasoning),
      events: Array.isArray(o.events) ? o.events.map((e) => ({ ref: str((e as Record<string, unknown>)?.ref), quote: str((e as Record<string, unknown>)?.quote) })) : [],
      authorities: Array.isArray(o.authorities) ? o.authorities.map((a) => ({ ref: str((a as Record<string, unknown>)?.ref), paragraph: str((a as Record<string, unknown>)?.paragraph) })) : [],
      provisions: Array.isArray(o.provisions) ? o.provisions.map(str) : [],
    });
    kinds.push(str(o.kind).toLowerCase());
  }
  return { candidates, kinds };
}

export function parseQuestions(text: string): string[] {
  const j = extractJson(text) as { questions?: unknown } | null;
  return Array.isArray(j?.questions) ? (j!.questions as unknown[]).map(str).filter(Boolean).slice(0, 5) : [];
}

export function parseJudge(text: string): "A" | "B" | null {
  const j = extractJson(text) as { better?: unknown } | null;
  const b = str(j?.better).toUpperCase();
  return b === "A" || b === "B" ? b : null;
}

// ---------------------------------------------------------------------------------------------
// Staged validators: code only.

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export interface Validated {
  ground: string;
  stance: Stance;
  claim: string;
  reasoning: string;
  events: Array<{ id: string; quote: string }>;
  authorities: Array<{ id: string; paragraph: string }>;
  provisions: string[];
}

export type Verdict = { ok: true; value: Validated } | { ok: false; reason: RejectionReason; detail: string };

export const DUPLICATE_OVERLAP = 0.6;

/** Share of the candidate's five-word sequences already in an archived text (0 to 1). */
export function overlapWith(text: string, archived: string[]): number {
  const s = shingles(words(text));
  if (s.size === 0) return 0;
  let best = 0;
  for (const a of archived) {
    const t = shingles(words(a));
    let common = 0;
    for (const x of s) if (t.has(x)) common++;
    best = Math.max(best, common / s.size);
  }
  return best;
}

export function validate(c: Candidate, al: Aliases, archived: string[]): Verdict {
  if (c.claim.length < 12 || c.reasoning.length < 20 || !(STANCES as readonly string[]).includes(c.stance)) {
    return { ok: false, reason: "SCHEMA", detail: "the claim or the reasoning is missing or too short" };
  }
  const events: Validated["events"] = [];
  for (const e of c.events) {
    const ev = al.events.get(e.ref.toUpperCase());
    if (!ev) return { ok: false, reason: "UNGROUNDED_FACT", detail: `${e.ref || "(no alias)"} is not a confirmed event of the record` };
    if (!e.quote || norm(e.quote).length < 4 || !norm(ev.text).includes(norm(e.quote))) {
      return { ok: false, reason: "UNGROUNDED_FACT", detail: `the quote "${e.quote.slice(0, 80)}" is not in ${e.ref}` };
    }
    events.push({ id: ev.id, quote: e.quote });
  }
  const authorities: Validated["authorities"] = [];
  for (const a of c.authorities) {
    const au = al.authorities.get(a.ref.toUpperCase());
    if (!au) return { ok: false, reason: "UNKNOWN_AUTHORITY", detail: `${a.ref || "(no alias)"} is not an authority of the matter` };
    if (au.citationFailed) return { ok: false, reason: "FAILED_CITATION", detail: `${au.citation} failed the citation check and is not attested` };
    authorities.push({ id: au.id, paragraph: a.paragraph });
  }
  const provisions: string[] = [];
  for (const p of c.provisions) {
    const pr = al.provisions.get(p.toUpperCase());
    if (!pr) return { ok: false, reason: "UNKNOWN_AUTHORITY", detail: `${p} is not a provision of the matter` };
    if (pr.repealed) return { ok: false, reason: "REPEALED_PROVISION", detail: `${pr.act}, section ${pr.section} is recorded as repealed` };
    provisions.push(pr.id);
  }
  if (events.length === 0 && authorities.length === 0) return { ok: false, reason: "NO_GROUNDING", detail: "it cites no record event and no authority" };
  // The model's aliases in the reasoning become readable labels for the advocate.
  const reasoning = c.reasoning.replace(/\b([EAP])(\d{1,3})\b/g, (m, k: string, n: string) => {
    if (k === "E") return al.events.get(m) ? `[record ${al.events.get(m)!.date}]` : m;
    if (k === "A") return al.authorities.get(m) ? `[${al.authorities.get(m)!.citation}]` : m;
    return al.provisions.get(m) ? `[${al.provisions.get(m)!.act} s. ${al.provisions.get(m)!.section}]` : `${k}${n}`;
  });
  // Compared in the same form as the archive holds it (aliases replaced).
  const o = overlapWith(`${c.claim} ${reasoning}`, archived);
  if (o >= DUPLICATE_OVERLAP) return { ok: false, reason: "DUPLICATE", detail: `${Math.round(o * 100)}% of its words repeat an argument already found` };
  return { ok: true, value: { ground: c.ground, stance: c.stance as Stance, claim: c.claim, reasoning, events, authorities, provisions } };
}

// ---------------------------------------------------------------------------------------------
// Pairwise rating and computed status.

export const ELO_K = 24;

export function eloUpdate(winner: number, loser: number, k = ELO_K): [number, number] {
  const expected = 1 / (1 + 10 ** ((loser - winner) / 400));
  return [winner + k * (1 - expected), loser - k * (1 - expected)];
}

/**
 * Grounded semantics over the attack links: an argument is "in" when every attacker is "out",
 * "out" when an attacker is "in", and "undecided" otherwise. Rejected arguments take no part.
 */
export function groundedStatus(args: Array<{ id: string; attacks: string | null; status: string }>): Map<string, ArgumentStatus> {
  const live = args.filter((a) => a.status !== "rejected");
  const attackers = new Map<string, string[]>();
  for (const a of live) if (a.attacks) attackers.set(a.attacks, [...(attackers.get(a.attacks) ?? []), a.id]);
  const label = new Map<string, ArgumentStatus>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of live) {
      if (label.has(a.id)) continue;
      const att = (attackers.get(a.id) ?? []).filter((x) => live.some((l) => l.id === x));
      if (att.every((x) => label.get(x) === "out")) {
        label.set(a.id, "in");
        changed = true;
      } else if (att.some((x) => label.get(x) === "in")) {
        label.set(a.id, "out");
        changed = true;
      }
    }
  }
  for (const a of live) if (!label.has(a.id)) label.set(a.id, "undecided");
  return label;
}

// ---------------------------------------------------------------------------------------------
// The loop.

export type Complete = (system: string, user: string, label: string) => Promise<string>;

export interface ArchivedArgument {
  id: string;
  ground: string;
  stance: Stance;
  claim: string;
  reasoning: string;
  elo: number;
  attacks: string | null;
}

export interface LoopDeps {
  complete: Complete;
  context: LoopContext;
  rounds: number;
  generators: number;
  /** Arguments already in the archive for this issue (earlier runs), for diversity and duplicates. */
  archive: ArchivedArgument[];
  /** The last typed rejections of a cell. */
  rejections(cell: Cell): Array<{ reason: string; detail: string }>;
  addArgument(round: number, v: Validated, attack: { target: string; kind: "rebut" | "undercut" | "undermine" } | null): ArchivedArgument;
  addRejection(round: number, cell: Cell, reason: string, detail: string, claim: string): void;
  setQuestions(id: string, questions: string[]): void;
  setElo(id: string, elo: number): void;
  onProgress?(text: string): void;
}

export interface LoopStats {
  calls: number;
  generated: number;
  accepted: number;
  attacks: number;
  rejected: Record<string, number>;
  comparisons: number;
}

const ATTACK_KINDS = new Set(["rebut", "undercut", "undermine"]);

export async function runLoop(d: LoopDeps): Promise<LoopStats> {
  const stats: LoopStats = { calls: 0, generated: 0, accepted: 0, attacks: 0, rejected: {}, comparisons: 0 };
  const al = aliases(d.context);
  const context = contextText(d.context, al);
  const archive = [...d.archive];
  const call = async (user: string, label: string) => {
    stats.calls++;
    return d.complete(SYSTEM, user, label);
  };
  const reject = (round: number, cell: Cell, reason: string, detail: string, claim: string) => {
    stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
    d.addRejection(round, cell, reason, detail, claim);
  };
  for (let round = 1; round <= d.rounds; round++) {
    const counts = new Map<string, number>();
    for (const a of archive) if (!a.attacks) counts.set(`${a.ground}/${a.stance}`, (counts.get(`${a.ground}/${a.stance}`) ?? 0) + 1);
    const cells = pickCells(counts, d.generators);
    d.onProgress?.(`Round ${round}: generating for ${cells.map((c) => c.ground).join(", ")}`);
    // 1. Generate, in parallel.
    const answers = await Promise.all(cells.map((cell, i) => call(generatorPrompt(context, cell, d.rejections(cell).slice(0, 5), 2), `r${round}-gen${i + 1}-${cell.ground}`).then((t) => ({ cell, t }), (e: Error) => ({ cell, t: "", err: e.message }))));
    const fresh: ArchivedArgument[] = [];
    for (const { cell, t } of answers) {
      const parsed = parseCandidates(t, cell);
      if (!parsed || parsed.candidates.length === 0) {
        reject(round, cell, "SCHEMA", "the answer was not the JSON asked for", t.slice(0, 200));
        continue;
      }
      for (const c of parsed.candidates) {
        stats.generated++;
        // 2. Validate in stages.
        const v = validate(c, al, archive.map((a) => `${a.claim} ${a.reasoning}`));
        if (!v.ok) {
          reject(round, cell, v.reason, v.detail, c.claim);
          continue;
        }
        const added = d.addArgument(round, v.value, null);
        archive.push(added);
        fresh.push(added);
        stats.accepted++;
      }
    }
    // 3. Critique: critical questions and attacks.
    d.onProgress?.(`Round ${round}: critique of ${fresh.length} argument(s)`);
    await Promise.all(
      fresh.map(async (a) => {
        const [q, opp] = await Promise.all([
          call(criticPrompt(context, a.claim, a.reasoning), `r${round}-critic-${a.id.slice(0, 8)}`).catch(() => ""),
          call(opponentPrompt(context, a.claim, a.reasoning, a.stance), `r${round}-opponent-${a.id.slice(0, 8)}`).catch(() => ""),
        ]);
        d.setQuestions(a.id, parseQuestions(q));
        const cell: Cell = { ground: a.ground as Ground, stance: a.stance === "petitioner" ? "respondent" : "petitioner" };
        const parsed = parseCandidates(opp, cell);
        if (!parsed) return;
        parsed.candidates.forEach((c, i) => {
          stats.generated++;
          const kind = parsed.kinds[i];
          if (!ATTACK_KINDS.has(kind)) {
            reject(round, cell, "SCHEMA", `the attack kind "${kind}" is not rebut, undercut or undermine`, c.claim);
            return;
          }
          const v = validate(c, al, archive.map((x) => `${x.claim} ${x.reasoning}`));
          if (!v.ok) {
            reject(round, cell, v.reason, v.detail, c.claim);
            return;
          }
          archive.push(d.addArgument(round, v.value, { target: a.id, kind: kind as "rebut" | "undercut" | "undermine" }));
          stats.attacks++;
        });
      }),
    );
    // 4. Compare pairs within each cell (not attacks).
    const cellsNow = new Map<string, ArchivedArgument[]>();
    for (const a of archive) if (!a.attacks) cellsNow.set(`${a.ground}/${a.stance}`, [...(cellsNow.get(`${a.ground}/${a.stance}`) ?? []), a]);
    for (const members of cellsNow.values()) {
      const newOnes = members.filter((m) => fresh.some((f) => f.id === m.id));
      for (const n of newOnes) {
        // At most three comparisons per new argument: the rating orders a cell; it need not be exact.
        for (const other of members.filter((m) => m.id !== n.id).slice(0, 3)) {
          const verdict = parseJudge(await call(judgePrompt(context, `${n.claim} ${n.reasoning}`, `${other.claim} ${other.reasoning}`), `r${round}-judge`).catch(() => ""));
          if (!verdict) continue;
          stats.comparisons++;
          const [w, l] = verdict === "A" ? [n, other] : [other, n];
          [w.elo, l.elo] = eloUpdate(w.elo, l.elo);
          d.setElo(w.id, w.elo);
          d.setElo(l.id, l.elo);
        }
      }
    }
  }
  return stats;
}
