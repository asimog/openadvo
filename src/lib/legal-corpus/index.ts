/**
 * E1, G1: what a judgment's own text states. Its numbered paragraphs, the citations and the
 * provisions it names, and the treatment words that sit in the same sentence as a citation.
 * Every edge keeps the paragraph and the sentence that state it, and is a candidate until the
 * advocate confirms it. Nothing here is a model's reading. Plain library (decision 6).
 */
import type { LegalEdge, LegalRelation } from "../../shared/law.ts";

// ---- paragraphs ----

export interface PageLines {
  page: number;
  lines: Array<{ line: number; text: string }>;
}

export interface Paragraph {
  para: number;
  label: string;
  page: number;
  line: number;
  text: string;
}

const PARA_START = /^(\d{1,4})\s*[.)]\s+(\S.*)$/;

/**
 * The paragraphs of a judgment. A line "12. ..." starts paragraph 12 only when 12 follows the
 * last number, so a date or a list inside a paragraph does not split it. A judgment that prints
 * no numbers is split at blank-line breaks into unnumbered blocks (label "").
 */
export function paragraphs(pages: PageLines[]): Paragraph[] {
  const numbered: Paragraph[] = [];
  let last = 0;
  let cur: Paragraph | null = null;
  const head: Array<{ page: number; line: number; text: string }> = [];
  for (const p of pages) {
    for (const l of p.lines) {
      const t = l.text.trim();
      if (!t) continue;
      const m = PARA_START.exec(t);
      const n = m ? Number(m[1]) : NaN;
      if (m && (n === last + 1 || (last === 0 && n === 1))) {
        if (cur) numbered.push(cur);
        last = n;
        cur = { para: n, label: String(n), page: p.page, line: l.line, text: m[2] };
      } else if (cur) cur.text += ` ${t}`;
      else head.push({ page: p.page, line: l.line, text: t });
    }
  }
  if (cur) numbered.push(cur);
  if (numbered.length >= 3) {
    const out = head.length ? [{ para: 0, label: "", page: head[0].page, line: head[0].line, text: head.map((h) => h.text).join(" ") }, ...numbered] : numbered;
    return out.map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim() }));
  }
  // No numbering: blocks of about 1,200 characters that end at a sentence.
  const out: Paragraph[] = [];
  let block: Paragraph | null = null;
  for (const p of pages) {
    for (const l of p.lines) {
      const t = l.text.trim();
      if (!t) continue;
      if (!block) block = { para: out.length + 1, label: "", page: p.page, line: l.line, text: t };
      else block.text += ` ${t}`;
      if (block.text.length > 1200 && /[.?!]["')\]]?$/.test(t)) {
        out.push(block);
        block = null;
      }
    }
  }
  if (block) out.push(block);
  return out.map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim() }));
}

// ---- citations ----

export interface FoundCitation {
  /** The citation in one spelling: "2023 INSC 1043", "(2019) 5 SCC 1", "AIR 1973 SC 1461". */
  citation: string;
  series: "INSC" | "SCC" | "SCC OnLine" | "AIR" | "SCR" | "HC neutral" | "SCALE" | "JT" | "CriLJ";
  index: number;
  length: number;
}

const CITATION_PATTERNS: Array<[FoundCitation["series"], RegExp, (m: RegExpExecArray) => string]> = [
  ["INSC", /\b((?:19|20)\d{2})\s*INSC\s*(\d{1,5})\b/g, (m) => `${m[1]} INSC ${m[2]}`],
  ["SCC OnLine", /\b((?:19|20)\d{2})\s+SCC\s+On\s?Line\s+([A-Z][A-Za-z&]{1,8})\s+(\d{1,6})\b/g, (m) => `${m[1]} SCC OnLine ${m[2]} ${m[3]}`],
  ["SCC", /[([]((?:19|20)\d{2})[)\]]\s*(\d{1,2})\s+SCC\s+(?:\((Cri|L&S|Civ)\)\s+)?(\d{1,5})\b/g, (m) => `(${m[1]}) ${m[2]} SCC ${m[3] ? `(${m[3]}) ` : ""}${m[4]}`],
  ["AIR", /\bAIR\s+((?:19|20)\d{2})\s+(SC|[A-Z][A-Za-z]{1,4})\s+(\d{1,5})\b/g, (m) => `AIR ${m[1]} ${m[2]} ${m[3]}`],
  ["SCR", /[([]((?:19|20)\d{2})[)\]]\s*(?:(Supp\.?)\s*)?(\d{1,2})\s+SCR\s+(\d{1,5})\b/g, (m) => `(${m[1]}) ${m[2] ? "Supp " : ""}${m[3]} SCR ${m[4]}`],
  ["HC neutral", /\b((?:19|20)\d{2})\s*:\s*([A-Z]{2,6}(?:-[A-Z]{1,4})?)\s*:\s*(\d{1,7})(?:-(DB|FB|SB))?\b/g, (m) => `${m[1]}:${m[2]}:${m[3]}${m[4] ? `-${m[4]}` : ""}`],
  ["SCALE", /[([]((?:19|20)\d{2})[)\]]\s*(\d{1,2})\s+SCALE\s+(\d{1,5})\b/g, (m) => `(${m[1]}) ${m[2]} SCALE ${m[3]}`],
  ["JT", /\bJT\s+((?:19|20)\d{2})\s*\((\d{1,2})\)\s*SC\s+(\d{1,5})\b/g, (m) => `JT ${m[1]} (${m[2]}) SC ${m[3]}`],
  ["CriLJ", /\b((?:19|20)\d{2})\s+Cri\.?\s?L\.?\s?J\.?\s+(\d{1,5})\b/g, (m) => `${m[1]} CriLJ ${m[2]}`],
];

/** Every reporter and neutral citation in a text, in the order they appear. */
export function findCitations(text: string): FoundCitation[] {
  const out: FoundCitation[] = [];
  for (const [series, re, norm] of CITATION_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (out.some((o) => m!.index < o.index + o.length && o.index < m!.index + m![0].length)) continue;
      out.push({ citation: norm(m), series, index: m.index, length: m[0].length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---- provisions named ----

export interface FoundProvision {
  kind: "section" | "article" | "order" | "rule";
  number: string;
  /** The instrument's name as the text writes it, or "" when the text names none. */
  act: string;
  index: number;
}

const PROVISION = /\b(Sections?|Secs?\.|S\.|u\/s\.?|Articles?|Art\.|Order|Rule)\s+(\d{1,4}[A-Z]{0,3}|[IVXL]{1,7})(?:\s*\(\w{1,4}\))*(?:\s+(?:read with|r\/w)\s+(?:Sections?|Rule|Order)?\s*\d{1,4}[A-Z]{0,3})?(?:\s+of\s+(?:the\s+)?((?:[A-Z][A-Za-z.&'-]*\s?){0,8}(?:Act|Code|Sanhita|Adhiniyam|Constitution|Rules|Regulations|Cr\.?P\.?C\.?|C\.?P\.?C\.?|I\.?P\.?C\.?|BNSS|BNS|BSA)(?:,?\s+(?:19|20|18)\d{2})?))?/g;

export function findProvisions(text: string): FoundProvision[] {
  const out: FoundProvision[] = [];
  PROVISION.lastIndex = 0;
  for (let m = PROVISION.exec(text); m; m = PROVISION.exec(text)) {
    const w = m[1].toLowerCase();
    const kind = w.startsWith("art") ? "article" : w.startsWith("order") ? "order" : w.startsWith("rule") ? "rule" : "section";
    if (kind === "section" && /^[IVXL]+$/.test(m[2])) continue;
    out.push({ kind, number: m[2], act: (m[3] ?? "").trim().replace(/\.$/, ""), index: m.index });
  }
  return out;
}

// ---- treatments ----

/** The words that state how one judgment treats another. Order matters: the first match wins. */
const TREATMENT: Array<[LegalRelation, RegExp]> = [
  ["overrules", /\b(?:overrul(?:ed|es|ing)|no longer good law|stands? overruled|is hereby overruled)\b/i],
  ["per_incuriam", /\bper\s+incuriam\b/i],
  ["refers_to_larger_bench", /\b(?:refer(?:red|s)?\s+(?:the\s+\w+\s+)?to\s+a\s+larger\s+bench|placed before (?:the )?(?:Hon'?ble )?(?:the )?Chief Justice|requires? reconsideration by a larger bench)\b/i],
  ["doubts", /\b(?:doubt(?:ed|s|ing)?\s+the\s+correctness|correctness .{0,40} doubted|we have (?:our )?reservations)\b/i],
  ["distinguishes", /\b(?:distinguish(?:ed|es|able|ing)|has no application|is of no assistance|is of no avail|turned on its own facts|does not (?:apply|help|advance))\b/i],
  ["reverses", /\b(?:revers(?:ed|es|ing)|set(?:s|ting)? aside the (?:judgment|decision) in)\b/i],
  ["modifies", /\b(?:modif(?:ied|ies|ying)|clarif(?:ied|ies|ying)|read down)\b/i],
  ["affirms", /\b(?:affirm(?:ed|s|ing)|upheld|approv(?:ed|es|ing)|approval)\b/i],
  ["follows", /\b(?:follow(?:ed|s|ing)?|relied (?:up)?on|reliance (?:is|was) placed|reiterat(?:ed|es)|as held in|in view of the (?:law laid down|decision) in|squarely covered by|bound by)\b/i],
];

/** The sentences of a paragraph, each with its start offset. A reporter's full stops do not end one. */
export function sentences(text: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  let start = 0;
  const re = /[.?!]["')\]]?\s+(?=[A-Z("'\[])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index + 1);
    if (/\b(?:v|vs|Dr|Mr|Mrs|Ms|Hon|Ltd|Co|Anr|Ors|No|Nos|Art|Sec|Cr|Cl|para|paras|pp|p|J|JJ|CJ|i\.e|e\.g|etc|viz|Supp)\.$/i.test(before)) continue;
    out.push({ start, text: text.slice(start, m.index + 1) });
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push({ start, text: text.slice(start) });
  return out;
}

/**
 * The edges one judgment's paragraphs state. For each citation: a "cites" edge, and a treatment
 * edge when a treatment word is in the same sentence. For each provision named with its Act: an
 * "interprets" edge. `resolve` gives the id of a cited judgment when the corpus holds it; else
 * the citation itself is the node id, so the edge still answers "who cites this citation".
 * A submission of counsel ("learned counsel relied on ...") yields "cites" only.
 */
export function edgesOf(
  judgmentId: string,
  paras: Paragraph[],
  resolve: (citation: string) => string | null,
  resolveProvision: (kind: string, number: string, act: string) => string | null = () => null,
): Array<Omit<LegalEdge, "id" | "status" | "builtFrom" | "builtAt">> {
  const out: Array<Omit<LegalEdge, "id" | "status" | "builtFrom" | "builtAt">> = [];
  const seen = new Set<string>();
  const add = (relation: LegalRelation, toKind: string, toId: string, ref: string, quote: string) => {
    const k = `${relation}|${toKind}|${toId}|${ref}`;
    if (seen.has(k) || (toKind === "judgment" && toId === judgmentId)) return;
    seen.add(k);
    out.push({ fromKind: "judgment", fromId: judgmentId, relation, toKind, toId, evidenceRef: ref, quote });
  };
  for (const p of paras) {
    const ref = `${judgmentId}#p${p.para}`;
    for (const s of sentences(p.text)) {
      const cites = findCitations(s.text);
      const counsel = /\b(?:learned\s+(?:senior\s+)?counsel|learned\s+(?:ASG|Solicitor|Attorney|Advocate General)|it (?:is|was) (?:submitted|contended|argued|urged)|submits? that|contends? that|placed reliance)\b/i.test(s.text);
      const treatment = counsel ? null : TREATMENT.find(([, re]) => re.test(s.text))?.[0] ?? null;
      // One reported case is often cited in two reporters side by side; they are one authority.
      for (const c of cites) {
        const id = resolve(c.citation);
        const toKind = id ? "judgment" : "citation";
        const toId = id ?? c.citation;
        add("cites", toKind, toId, ref, s.text.slice(0, 400));
        if (treatment) add(treatment, toKind, toId, ref, s.text.slice(0, 400));
      }
      for (const pr of findProvisions(s.text)) {
        if (!pr.act) continue;
        const id = resolveProvision(pr.kind, pr.number, pr.act);
        add("interprets", id ? "provision" : "provision_ref", id ?? `${pr.kind} ${pr.number} of ${pr.act}`, ref, s.text.slice(0, 400));
      }
    }
  }
  return out;
}
