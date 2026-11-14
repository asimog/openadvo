/** Types of the record chain, refusals, the Inspector and Find (v5 spec, V5-1 to V5-4). */

export interface ChainCheck {
  ok: boolean;
  events: number;
  /** Events written before the chain existed (v5): they are not covered. */
  unchained: number;
  head: string | null;
  /** The first event whose hash or link does not match, with what was found. */
  firstBreak: { seq: number; problem: string } | null;
}

export interface Refusal {
  id: string;
  at: string;
  actor: string;
  action: string;
  code: string;
  reason: string;
}

export interface Inspection {
  kind: string;
  id: string;
  record: Record<string, unknown>;
  events: Array<{ seq: number; at: string; actor: string; action: string; data: unknown }>;
  linksOut: Array<{ kind: string; id: string }>;
  linksIn: Array<{ kind: string; id: string; field: string }>;
}

export interface FindRow {
  kind: string;
  ref: string;
  label: string;
  text: string;
}

export interface FindHit extends FindRow {
  snippet: string;
}
