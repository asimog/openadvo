/**
 * Phase 1: the bridge functions of the harness and the stores (docs/specs/harness-and-stores.md).
 * Each is a named function on the preload bridge. The human-only ones (approve a plan, decide a
 * preference or a memory record, set a profile field) are never agent tools (decision 5).
 */
import type { Agent } from "./agent.ts";
import { readTrace } from "./agent.ts";
import type { Matters } from "./matters.ts";
import type { Progress } from "./progress.ts";
import type { SkillRegistry } from "./skills.ts";
import type { PracticePacks } from "./packs.ts";
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import type { IntelStore } from "../lib/intel-store/index.ts";
import { freshness } from "../lib/intel-store/index.ts";
import { roleSummaries } from "../lib/skills/index.ts";
import { jobRows } from "./jobs.ts";
import { ensureFindIndex } from "./audit.ts";
import type { Corpus } from "../lib/research-sources/corpus.ts";
import type { ContextCandidate } from "../shared/skills.ts";
import type { InboxItem } from "../shared/work.ts";

type Handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) => void;

export interface HarnessBridgeDeps {
  matters: Matters;
  agent: Agent;
  progress: Progress;
  skills: SkillRegistry;
  packs: PracticePacks;
  advocate: AdvocateStore;
  intel: IntelStore;
  corpus: () => Corpus | null;
}

const str = (v: unknown): string => String(v ?? "");

export function registerHarnessBridge(handle: Handle, d: HarnessBridgeDeps): void {
  // N1, O2: the registry and the roles.
  handle("skills:list", (fresh?: boolean) => {
    const registry = d.skills.get(fresh === true);
    return { skills: registry.all, roles: roleSummaries(registry), folders: d.skills.folders(), practicePacks: d.packs.get(fresh === true).summaries };
  });
  // N2, O7: runs, their packages and the Jobs rows of one matter.
  handle("skills:runs", async (matterId: string) => (await d.matters.store(str(matterId))).skillRuns());
  handle("skills:package", async (matterId: string, packageId: string) => (await d.matters.store(str(matterId))).contextPackage(str(packageId)));
  handle("runs:jobs", async (matterId: string) => {
    const id = str(matterId);
    await d.agent.flushTraces();
    return jobRows(await readTrace(await d.matters.chatDir(id)), (await d.matters.store(id)).skillRuns());
  });
  // O3: Resume puts the request to the Matter Agent, which calls run_skill with resume.
  handle("skills:resume", async (matterId: string, runId: string) => {
    const run = (await d.matters.store(str(matterId))).skillRun(str(runId));
    if (!run) throw new Error(`NOT_FOUND: no skill run ${str(runId)}`);
    if (run.state !== "interrupted") throw new Error(`NOT_INTERRUPTED: the skill run is ${run.state}`);
    await d.agent.send(str(matterId), `/resume ${run.id}`);
  });
  // O1: human-only.
  handle("plan:approve", (matterId: string) => d.agent.approvePlan(str(matterId)));
  // O9: side questions.
  handle("side:ask", (matterId: string, threadId: string | null, question: string, view: string) => d.agent.sideAsk(str(matterId), threadId ? str(threadId) : null, str(question), str(view)));
  handle("side:discard", (matterId: string, threadId: string) => d.agent.sideDiscard(str(matterId), str(threadId)));
  handle("side:list", (matterId: string) => d.agent.sideThreads(str(matterId)));
  // N3: what "@" can add: records of this matter only (Q2).
  handle("context:candidates", async (matterId: string, query: string) => {
    const store = await d.matters.store(str(matterId));
    const q = str(query).toLowerCase().trim();
    const out: ContextCandidate[] = [
      ...store.listSources().map((s) => ({ kind: "source" as const, id: s.id, label: s.name })),
      ...store.listDrafts().map((x) => ({ kind: "draft" as const, id: x.id, label: x.title })),
      ...store.work.listIssues().filter((i) => i.status !== "rejected").map((i) => ({ kind: "issue" as const, id: i.id, label: i.text.slice(0, 80) })),
      ...store.work.listAuthorities().filter((a) => a.status !== "rejected").map((a) => ({ kind: "authority" as const, id: a.id, label: a.citation || a.parties })),
      ...store.notebook().events.filter((e) => !e.excluded && e.status !== "rejected").map((e) => ({ kind: "event" as const, id: e.id, label: `${e.dateText}: ${e.description.slice(0, 60)}` })),
    ];
    return (q ? out.filter((c) => c.label.toLowerCase().includes(q) || c.kind.startsWith(q)) : out).slice(0, 30);
  });
  // R1: one queue across matters, "blocks the work" first, then the advocate's own proposals.
  handle("inbox:all", async () => {
    const all: Array<InboxItem & { matterId: string | null; matterTitle: string }> = [];
    for (const m of (await d.matters.list()).filter((x) => !x.archived)) {
      for (const item of await d.progress.inbox(m.id).catch(() => [] as InboxItem[])) all.push({ ...item, matterId: m.id, matterTitle: m.title });
    }
    for (const p of d.advocate.preferences().filter((x) => x.status === "proposed")) all.push({ id: `preference:${p.id}`, kind: "advocate_preference", blocks: false, title: "Preference proposed", detail: `${p.key}: ${p.value} (${p.reason})`, tab: "profile", matterId: null, matterTitle: "Advocate profile" });
    for (const r of d.advocate.memory("proposed")) all.push({ id: `advocate-memory:${r.memoryId}`, kind: "advocate_memory", blocks: false, title: "Advocate memory proposed", detail: `${r.subject} ${r.relation} ${r.object}`, tab: "profile", matterId: null, matterTitle: "Advocate profile" });
    // S9: a trigger fire waits for the advocate. It starts nothing by itself.
    const titles = new Map((await d.matters.list()).map((m) => [m.id, m.title]));
    for (const f of d.advocate.triggerFires("proposed")) {
      all.push({
        id: `trigger:${f.id}`,
        kind: "trigger_fire",
        blocks: false,
        title: `Trigger: ${f.event.replace(/_/g, " ")}`,
        detail: `${f.subject}. Skills: ${f.skills.join(", ") || "none"}. Responses: ${f.responses.join(", ") || "none"}. Nothing has started.`,
        tab: "overview",
        matterId: f.matterId,
        matterTitle: titles.get(f.matterId) ?? "Matter",
        triggerId: f.id,
      });
    }
    return [...all.filter((x) => x.blocks), ...all.filter((x) => !x.blocks)];
  });
  // G5: the advocate's search over every open matter and the judgment index. The agent's own
  // Find stays inside its matter: this is a bridge function, not a tool.
  handle("search:all", async (query: string) => {
    const q = str(query).trim();
    if (q.length < 2) return [];
    const hits: Array<{ matterId: string | null; matterTitle: string; kind: string; ref: string; label: string; snippet: string }> = [];
    for (const m of (await d.matters.list()).filter((x) => !x.archived)) {
      await ensureFindIndex(d.matters, m.id).catch(() => undefined);
      for (const h of (await d.matters.store(m.id)).find(q, 8)) hits.push({ matterId: m.id, matterTitle: m.title, kind: h.kind, ref: h.ref, label: h.label, snippet: h.snippet || h.text.slice(0, 160) });
    }
    const corpus = d.corpus();
    if (corpus) {
      try {
        for (const j of corpus.search(q, { limit: 8 })) hits.push({ matterId: null, matterTitle: "Judgment index", kind: "judgment", ref: j.id, label: j.insc || j.citation || j.courtName, snippet: j.title });
      } catch {
        // The judgment index may not be built yet; the matters still answer.
      }
    }
    return hits.slice(0, 60);
  });
  // Q4: the advocate store. Writes are the advocate's.
  handle("advocate:profile", () => d.advocate.profile());
  handle("advocate:set-profile", (key: string, value: string) => d.advocate.setProfileField(str(key), str(value), { actor: "advocate" }));
  handle("advocate:memory", () => d.advocate.memory());
  handle("advocate:decide-memory", (id: string, status: string) => {
    if (!["confirmed", "rejected", "tentative", "archived", "deprecated"].includes(str(status))) throw new Error("BAD_STATUS: confirmed, rejected, tentative, archived or deprecated");
    return d.advocate.decideMemory(str(id), str(status) as "confirmed", { actor: "advocate" });
  });
  handle("advocate:preferences", () => d.advocate.preferences());
  handle("advocate:decide-preference", (id: string, decision: string) => {
    if (decision !== "approved" && decision !== "rejected") throw new Error("BAD_DECISION: approved or rejected");
    return d.advocate.decidePreference(str(id), decision, { actor: "advocate" });
  });
  // Phase 6 (A7): the advocate answers a preference question inside a task (human-only, decision 5).
  // The answer is approved at once: the advocate gave it. The reason names the task and the date.
  handle("advocate:setPreference", (key: string, value: string, task: string) => {
    const k = str(key);
    const v = str(value).trim();
    if (!k || !v) throw new Error("BAD_PREFERENCE: a key and a value are needed");
    const ctx = { actor: "advocate" as const };
    const proposed = d.advocate.proposePreference(
      { key: k, value: v, reason: `answered inside ${str(task) || "a task"} on ${new Date().toISOString().slice(0, 10)}` },
      ctx,
    );
    return d.advocate.decidePreference(proposed.id, "approved", ctx);
  });
  // Q4: the local intelligence store: sources with their freshness (decision 16).
  handle("intel:sources", () => d.intel.sources().map((s) => ({ ...s, freshness: freshness(s) })));
  handle("stores:chains", () => {
    const a = d.advocate.verifyChain();
    const i = d.intel.verifyChain();
    return { advocate: { ok: a.ok, events: a.events, firstBreak: a.firstBreak }, intel: { ok: i.ok, events: i.events, firstBreak: i.firstBreak } };
  });
}
