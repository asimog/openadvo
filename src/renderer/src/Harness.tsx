/**
 * Phase 1 in the chat dock (docs/specs/harness-and-stores.md): the report card of a skill run
 * (N2), the package view (I1, O7), the Jobs tab (O7) and the side panel (O9). No business logic:
 * every record comes from a bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { SIDE_EVENT, type ChatEvent, type ContextPackageRecord, type JobRow, type ReportCard, type SideThread } from "../../shared/api.ts";
import { Markdown } from "./Markdown.tsx";

const api = window.openadvo;

const STATE_DOT: Record<string, "neutral" | "accent" | "success" | "warning" | "error"> = {
  running: "accent",
  done: "success",
  ended: "success",
  needs_review: "warning",
  interrupted: "warning",
  stopped: "neutral",
  refused: "neutral",
  failed: "error",
};

const words = (s: string) => s.replace(/_/g, " ");

export function money(n: number): string {
  return n > 0 ? `$${n.toFixed(4)}` : "$0";
}

/** I1: what the run received, what it did not receive, and why. */
export function PackageView(props: { matterId: string; packageId: string }) {
  const [pkg, setPkg] = useState<ContextPackageRecord | null | undefined>(undefined);
  useEffect(() => {
    void api.getContextPackage(props.matterId, props.packageId).then(setPkg, () => setPkg(null));
  }, [props.matterId, props.packageId]);
  if (pkg === undefined) return <Text type="supporting">Reading the package…</Text>;
  if (pkg === null) return <Text type="supporting">The package {props.packageId} is not in this matter.</Text>;
  return (
    <div className="package-view" data-testid="package-view">
      <Text type="supporting">
        Package {pkg.id}: {pkg.packageType.replace("_", " ")} package, question "{words(pkg.questionType)}", {pkg.tokens} of {pkg.budget} tokens, for {pkg.skillId} v{pkg.skillVersion}.
      </Text>
      <Heading level={4}>Received ({pkg.included.length})</Heading>
      {pkg.included.length === 0 ? <Text type="supporting">Nothing: the run read with its tools only.</Text> : null}
      <List density="compact" data-testid="package-included">
        {pkg.included.map((i) => (
          <ListItem key={`${i.kind}:${i.id}`} label={`${i.kind}: ${i.label}`} description={[`${i.tokens} tokens`, i.shortened ? "shortened, anchors kept" : "", ...i.flags].filter(Boolean).join(" · ")} />
        ))}
      </List>
      <Heading level={4}>Not received ({pkg.excluded.length})</Heading>
      {pkg.excluded.length === 0 ? <Text type="supporting">Nothing was left out.</Text> : null}
      <List density="compact" data-testid="package-excluded">
        {pkg.excluded.map((e, k) => (
          <ListItem key={`${e.kind}:${e.id}:${k}`} label={`${e.kind}: ${e.label}`} description={e.reason} />
        ))}
      </List>
    </div>
  );
}

/** N2: the report card of one skill run. */
export function ReportCardView(props: { matterId: string; card: ReportCard }) {
  const c = props.card;
  const [showPkg, setShowPkg] = useState(false);
  return (
    <section className="report-card" data-testid="report-card" data-state={c.state} aria-label={`Report card ${c.runId}`}>
      <div className="report-head">
        <StatusDot variant={STATE_DOT[c.state] ?? "neutral"} label={words(c.state)} />
        <Text weight="semibold">
          {c.skillId} {c.skillTitle}
        </Text>
        <Badge label={`v${c.skillVersion}`} />
        <Text type="supporting">{words(c.state)}</Text>
      </div>
      <Text>{c.reason}</Text>
      <dl className="facts report-facts">
        <dt>Run</dt>
        <dd className="mono">{c.runId}</dd>
        <dt>Attempts</dt>
        <dd>
          {c.attempts} ({c.rewrites} rewrite{c.rewrites === 1 ? "" : "s"})
        </dd>
        <dt>Checks</dt>
        <dd data-testid="report-checks">
          {c.checks.length === 0
            ? "None ran."
            : c.checks.map((k) => (
                <span key={k.name} className="report-check" data-result={k.result} title={k.detail}>
                  {k.name}: {k.result === "not_available" ? "not available yet" : k.result}{" "}
                </span>
              ))}
        </dd>
        <dt>Tools</dt>
        <dd>{c.toolsUsed.length ? c.toolsUsed.map((t) => `${t.name} ×${t.calls}${t.errors ? ` (${t.errors} refused or failed)` : ""}`).join(", ") : "None used."}</dd>
        <dt>Tokens</dt>
        <dd>
          {c.tokens.total} ({money(c.cost)}), {Math.round(c.durationMs / 100) / 10} s
        </dd>
        {c.notRead.length ? (
          <>
            <dt>Not read</dt>
            <dd>{c.notRead.join("; ")}</dd>
          </>
        ) : null}
      </dl>
      {c.reviewItemId ? <div className="notice">A review item waits in the Review Inbox.</div> : null}
      {c.output != null ? (
        <Collapsible defaultIsOpen={false} trigger={<Text type="supporting">Output</Text>}>
          <pre className="ext-pre" data-testid="report-output">{JSON.stringify(c.output, null, 2)}</pre>
        </Collapsible>
      ) : null}
      {c.packageId ? (
        <div className="question-options">
          <Button label={showPkg ? "Hide the package" : `Show the package (${c.packageTokens} tokens)`} size="sm" variant="ghost" onClick={() => setShowPkg((v) => !v)} />
        </div>
      ) : null}
      {showPkg && c.packageId ? <PackageView matterId={props.matterId} packageId={c.packageId} /> : null}
    </section>
  );
}

/** O7: every run of the matter: chat runs, helpers and skill runs, with state, cost, package and report card. */
export function JobsPanel(props: { matterId: string; version: number }) {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [cards, setCards] = useState<Record<string, ReportCard | null>>({});
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [jobs, runs] = await Promise.all([api.listRunJobs(props.matterId), api.listSkillRuns(props.matterId)]);
    setRows(jobs);
    setCards(Object.fromEntries(runs.map((r) => [r.id, r.report])));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  if (!rows) return <Text type="supporting">Reading the jobs…</Text>;
  return (
    <div className="dock-jobs" data-testid="jobs-panel">
      <div className="jobs-head">
        <Text type="supporting">
          {rows.length} job{rows.length === 1 ? "" : "s"}: chat runs, helpers and skill runs. The trace holds no client text.
        </Text>
        <Button label="Refresh" size="sm" variant="ghost" clickAction={load} />
      </div>
      {rows.length === 0 ? <Text type="supporting">No runs yet.</Text> : null}
      <List density="compact">
        {rows.map((r) => (
          <ListItem
            key={`${r.kind}:${r.id}`}
            data-testid={`job-${r.kind}`}
            data-state={r.state}
            startContent={<StatusDot variant={STATE_DOT[r.state] ?? "neutral"} label={words(r.state)} />}
            label={r.title}
            description={`${words(r.state)} · ${r.tokens} tokens · ${money(r.cost)}${r.tools ? ` · ${r.tools} tool call${r.tools === 1 ? "" : "s"}` : ""}${r.errors ? `, ${r.errors} refused or failed` : ""}${r.startedAt ? ` · ${r.startedAt.slice(0, 19).replace("T", " ")}` : ""}`}
            endContent={
              r.kind === "skill" ? (
                <span className="row-actions">
                  {r.state === "interrupted" ? <Button label="Resume" size="sm" clickAction={async () => { await api.resumeSkillRun(props.matterId, r.id); await load(); }} /> : null}
                  <Button label={open === r.id ? "Close" : "Open"} size="sm" variant="ghost" onClick={() => setOpen((o) => (o === r.id ? null : r.id))} />
                </span>
              ) : undefined
            }
          />
        ))}
      </List>
      {open ? (
        cards[open] ? (
          <ReportCardView matterId={props.matterId} card={cards[open]!} />
        ) : (
          <div className="notice">
            This run has no report card yet{rows.find((r) => r.id === open)?.packageId ? "; its package is below" : ""}.
            {rows.find((r) => r.id === open)?.packageId ? <PackageView matterId={props.matterId} packageId={rows.find((r) => r.id === open)!.packageId!} /> : null}
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * O9: the side panel (harness-build.md HB-1). A read-only thread beside the chat; follow-ups
 * stay in it. "Bring into chat" puts a quote into the composer; the advocate sends it or not.
 */
export function SidePanel(props: { matterId: string; view: string; first: { id: number; text: string } | null; onBring: (text: string) => void; onClose: () => void }) {
  const [thread, setThread] = useState<SideThread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    try {
      setThread(await api.askSide(props.matterId, thread?.id ?? null, q, props.view));
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally {
      setBusy(false);
    }
  };
  const firstId = props.first?.id;
  useEffect(() => {
    if (props.first?.text) void ask(props.first.text);
    // Only a new first question starts a thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId]);
  useEffect(
    () =>
      api.onChatEvent((ev: ChatEvent) => {
        const e = ev.event as unknown as { type: string; name?: string; value?: SideThread };
        if (ev.matterId === props.matterId && e.type === "CUSTOM" && e.name === SIDE_EVENT && e.value && (!thread || e.value.id === thread.id)) setThread(e.value);
      }),
    [props.matterId, thread],
  );
  const answers = thread?.messages.filter((m) => m.role === "answer") ?? [];
  return (
    <section className="side-panel" aria-label="Side question" data-testid="side-panel">
      <div className="side-head">
        <Heading level={3}>Side question</Heading>
        <Text type="supporting">Read only. It cannot change the matter, and nothing goes into the chat unless you bring it in.</Text>
      </div>
      <div className="side-log">
        {(thread?.messages ?? []).map((m) => (
          <div key={m.id} className="side-msg" data-role={m.role} data-testid={`side-${m.role}`}>
            {m.role === "answer" ? <Markdown text={m.text} /> : <Text weight={m.role === "question" ? "semibold" : undefined}>{m.text}</Text>}
          </div>
        ))}
        {busy ? <Text type="supporting">Answering…</Text> : null}
        {error ? <div className="notice">{error}</div> : null}
      </div>
      <TextInput label="Ask a follow-up" value={text} onChange={setText} onEnter={() => void ask(text)} isDisabled={busy} />
      <div className="question-options">
        <Button label="Ask" size="sm" isDisabled={busy || !text.trim()} clickAction={() => ask(text)} />
        <Button
          label="Bring into chat"
          size="sm"
          variant="ghost"
          isDisabled={answers.length === 0}
          onClick={() => {
            const last = answers.at(-1)!.text.trim();
            const selected = window.getSelection()?.toString().trim();
            const quote = (selected && last.includes(selected) ? selected : last).split(String.fromCharCode(10)).map((l) => `> ${l}`).join(String.fromCharCode(10));
            props.onBring(`From a side question:${String.fromCharCode(10)}${quote}${String.fromCharCode(10)}`);
          }}
        />
        <Button
          label="Discard"
          size="sm"
          variant="ghost"
          clickAction={async () => {
            if (thread) await api.discardSide(props.matterId, thread.id);
            props.onClose();
          }}
        />
      </div>
    </section>
  );
}
