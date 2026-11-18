/**
 * Phase 10 (M2): the Knowledge Library in use. An item gets one role from its kind, its status,
 * its court and its tags. An approved precedent is offered first for a new draft, with the reason
 * it is offered. Rejected and superseded items are never offered. Plain library (decision 6).
 */
import type { LibraryItem } from "../../shared/stores.ts";
import type { LibraryRole, LibraryRoleGroup, PrecedentOffer, PrecedentSubject } from "../../shared/knowledge.ts";

const PRECEDENT_KINDS = ["pleading", "submission", "template"];
const APPROVED = ["approved", "filed"];

/** One role per item, in the order that decides it. */
export function libraryRole(item: LibraryItem): LibraryRole {
  if (item.kind === "proposition") return "position";
  if (item.kind === "checklist") return "playbook";
  if (item.kind === "note" && item.tags.some((t) => t.toLowerCase() === "common-error")) return "common_error";
  if (PRECEDENT_KINDS.includes(item.kind) && APPROVED.includes(item.status)) return "precedent";
  if ((item.kind === "template" || item.kind === "pleading") && item.court.trim()) return "drafting_style";
  return "other";
}

/** The roles are views: an approved court template is both a precedent and a drafting style. */
export function libraryRoles(items: LibraryItem[]): LibraryRoleGroup[] {
  const roles: LibraryRole[] = ["position", "playbook", "drafting_style", "common_error", "precedent", "other"];
  return roles.map((role) => ({ role, title: ROLE_TITLE[role], items: items.filter((i) => inRole(i, role)) }));
}

function inRole(item: LibraryItem, role: LibraryRole): boolean {
  if (role === "position") return item.kind === "proposition";
  if (role === "playbook") return item.kind === "checklist";
  if (role === "common_error") return item.kind === "note" && item.tags.some((t) => t.toLowerCase() === "common-error");
  if (role === "drafting_style") return (item.kind === "template" || item.kind === "pleading") && item.court.trim().length > 0;
  if (role === "precedent") return PRECEDENT_KINDS.includes(item.kind) && APPROVED.includes(item.status);
  return libraryRole(item) === "other";
}

export const ROLE_TITLE: Record<LibraryRole, string> = {
  position: "Positions, approved and rejected",
  playbook: "Playbooks",
  drafting_style: "Court-specific drafting styles",
  common_error: "Common errors",
  precedent: "Approved precedents",
  other: "Not yet classified",
};

function norm(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scopeMatches(item: LibraryItem, subject: PrecedentSubject): boolean {
  const scope = norm(`${item.scope} ${item.tags.join(" ")} ${item.title}`);
  const words = `${norm(subject.proceeding)} ${norm(subject.practiceArea)}`.split(" ").filter((w) => w.length >= 3);
  return words.some((w) => scope.includes(w));
}

const COURT_WORDS = new Set(["in", "hc", "high", "court", "of", "the", "district", "sessions", "tribunal", "bench", "at"]);

function courtTokens(value: string): string[] {
  return norm(value).split(" ").filter((w) => w.length > 2 && !COURT_WORDS.has(w));
}

function courtMatches(item: LibraryItem, subject: PrecedentSubject): boolean {
  const a = norm(item.court);
  const b = norm(subject.court);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = courtTokens(item.court);
  const tb = courtTokens(subject.court);
  return ta.some((t) => tb.includes(t));
}

/**
 * The approved precedents of a drafting task, best first. A rejected, superseded or withdrawn
 * item is never offered. The reason says why the row is where it is.
 */
export function rankPrecedents(items: LibraryItem[], subject: PrecedentSubject): PrecedentOffer[] {
  const offers: PrecedentOffer[] = [];
  for (const item of items) {
    if (!PRECEDENT_KINDS.includes(item.kind)) continue;
    if (["rejected", "superseded", "withdrawn"].includes(item.status)) continue;
    const court = courtMatches(item, subject);
    const scope = scopeMatches(item, subject);
    const approved = APPROVED.includes(item.status);
    const rank = (approved ? 1000 : item.status === "reviewed" ? 500 : 100) + (court ? 100 : 0) + (scope ? 50 : 0);
    const reasons: string[] = [];
    if (approved) reasons.push(item.status === "filed" ? "filed and approved" : "approved");
    else if (item.status === "reviewed") reasons.push("reviewed, not yet approved");
    else reasons.push("unreviewed");
    if (court) reasons.push(`for ${item.court}`);
    if (scope) reasons.push(`covers ${subject.proceeding || subject.practiceArea}`);
    offers.push({ id: item.id, title: item.title, court: item.court, scope: item.scope, itemDate: item.itemDate, status: item.status, kind: item.kind, reason: reasons.join(", "), rank });
  }
  offers.sort((a, b) => b.rank - a.rank || b.itemDate.localeCompare(a.itemDate) || a.title.localeCompare(b.title));
  return offers;
}

/** The first `n` offers, for the drafting package and the Drafts view. */
export function topPrecedents(items: LibraryItem[], subject: PrecedentSubject, n = 3): PrecedentOffer[] {
  return rankPrecedents(items, subject).slice(0, Math.max(1, Math.min(10, n)));
}
