/**
 * R2: the Practice Intelligence Dashboard on Home. Active matters, today and the next hearings,
 * pending filings, matters that need attention, drafts and research awaiting review, filing
 * defects and runs waiting. No business figures. Spec: docs/specs/advocate-matters-browser.md.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { MatterSummary } from "../../shared/api.ts";

const api = window.openadvo;

function Card(props: { title: string; count?: number; testId: string; children: ReactNode; action?: { label: string; run: () => void } }) {
  return (
    <section className="dash-card" data-testid={props.testId}>
      <div className="dash-card-head">
        <h3>{props.title}{typeof props.count === "number" ? ` (${props.count})` : ""}</h3>
        {props.action ? <Button label={props.action.label} size="sm" variant="ghost" onClick={props.action.run} /> : null}
      </div>
      {props.children}
    </section>
  );
}

export function HomeDashboard(props: { matters: MatterSummary[]; onOpenMatter: (id: string) => void; onInbox: () => void; onCalendar: () => void }) {
  const [docket, setDocket] = useState<Awaited<ReturnType<typeof api.getDocket>>>([]);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof api.inboxAll>>>([]);
  const [filings, setFilings] = useState<Array<{ matterId: string; title: string; pending: boolean; defects: string[]; filingSet: boolean }>>([]);
  const [proposals, setProposals] = useState<Awaited<ReturnType<typeof api.proposalsList>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [d, i] = await Promise.all([api.getDocket(), api.inboxAll()]);
        if (!live) return;
        setDocket(d);
        setInbox(i);
        setProposals((await api.proposalsList().catch(() => [])).filter((p) => p.status === "open"));
        const states = await Promise.all(props.matters.map(async (m) => {
          try {
            const f = await api.getFiling(m.id);
            const defects = f.compliance.results.filter((r) => r.outcome === "defect").map((r) => `${r.rule}: ${r.title}`);
            return { matterId: m.id, title: m.title, pending: !f.filingSet, defects, filingSet: !!f.filingSet };
          } catch {
            return { matterId: m.id, title: m.title, pending: false, defects: [], filingSet: false };
          }
        }));
        if (live) setFilings(states);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [props.matters]);

  const today = new Date().toISOString().slice(0, 10);
  const hearingToday = docket.filter((d) => d.nextHearing?.date === today);
  const nextHearings = docket.filter((d) => d.nextHearing && d.nextHearing.date >= today).slice(0, 5);
  const blocking = inbox.filter((i) => i.blocks);
  const draftReview = inbox.filter((i) => !i.blocks && /draft|research|argument|memory|preference|skill|fact|event|document/i.test(`${i.kind} ${i.title}`));
  const filingDefects = filings.filter((f) => f.defects.length > 0);
  const pendingFilings = filings.filter((f) => f.pending && f.filingSet === false);
  const runsWaiting = inbox.filter((i) => /run|skill|helper/i.test(`${i.kind} ${i.title}`));

  return (
    <section className="dashboard" aria-label="Practice dashboard" data-testid="home-dashboard">
      <div className="dashboard-head">
        <Heading level={2}>Practice dashboard</Heading>
        <Text type="supporting">What needs you today, across every matter. No business figures.</Text>
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <div className="dash-grid">
        <Card title="Today" count={hearingToday.length} testId="dash-today" action={{ label: "Calendar", run: props.onCalendar }}>
          {hearingToday.length === 0 ? <Text type="supporting">No hearing is listed for today.</Text> : (
            <ul className="dash-list">{hearingToday.map((d) => <li key={d.matterId}><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpenMatter(d.matterId); }}>{d.title}</a> <Text type="supporting">{d.stage}</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Needs attention" count={blocking.length} testId="dash-attention" action={{ label: "Review Inbox", run: props.onInbox }}>
          {blocking.length === 0 ? <Text type="supporting">Nothing blocks the work.</Text> : (
            <ul className="dash-list">{blocking.slice(0, 6).map((i) => <li key={`${i.matterId}:${i.id}`}><Text weight="semibold">{i.title}</Text> <Text type="supporting">{i.matterTitle}: {i.detail}</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Proposed matters" count={proposals.length} testId="dash-proposals">
          {proposals.length === 0 ? <Text type="supporting">No matter is proposed.</Text> : (
            <ul className="dash-list">
              {proposals.map((p) => (
                <li key={p.id} data-testid="proposal-row">
                  <Text weight="semibold">{p.title}</Text>
                  <Text type="supporting">{[p.cnr, p.court, p.stage, p.nextDate, p.reason].filter(Boolean).join(" · ")}</Text>
                  <div className="row-actions">
                    <Button label="Create" size="sm" clickAction={async () => {
                      const m = await api.proposalCreate(p.id);
                      setProposals((list) => list.filter((x) => x.id !== p.id));
                      props.onOpenMatter(m.id);
                    }} data-testid="proposal-create" />
                    <Button label="Dismiss" size="sm" variant="ghost" clickAction={async () => {
                      setProposals(await api.proposalDismiss(p.id));
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Next hearings" count={nextHearings.length} testId="dash-hearings" action={{ label: "Calendar", run: props.onCalendar }}>
          {nextHearings.length === 0 ? <Text type="supporting">No next date is recorded.</Text> : (
            <ul className="dash-list">{nextHearings.map((d) => <li key={d.matterId}><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpenMatter(d.matterId); }}>{d.title}</a> <Text type="supporting">{d.nextHearing!.date} ({d.nextHearing!.status})</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Pending filings" count={pendingFilings.length} testId="dash-filings">
          {pendingFilings.length === 0 ? <Text type="supporting">No matter is waiting to file.</Text> : (
            <ul className="dash-list">{pendingFilings.slice(0, 6).map((f) => <li key={f.matterId}><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpenMatter(f.matterId); }}>{f.title}</a> <Text type="supporting">No filing set yet</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Filing defects" count={filingDefects.length} testId="dash-defects">
          {filingDefects.length === 0 ? <Text type="supporting">No filing defect is open.</Text> : (
            <ul className="dash-list">{filingDefects.slice(0, 6).map((f) => <li key={f.matterId}><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpenMatter(f.matterId); }}>{f.title}</a> <Text type="supporting">{f.defects.slice(0, 3).join("; ")}</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Awaiting review" count={draftReview.length} testId="dash-review" action={{ label: "Review Inbox", run: props.onInbox }}>
          {draftReview.length === 0 ? <Text type="supporting">No draft, research or fact waits for review.</Text> : (
            <ul className="dash-list">{draftReview.slice(0, 6).map((i) => <li key={`${i.matterId}:${i.id}`}><Text weight="semibold">{i.title}</Text> <Text type="supporting">{i.matterTitle}</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Runs waiting" count={runsWaiting.length} testId="dash-runs" action={{ label: "Review Inbox", run: props.onInbox }}>
          {runsWaiting.length === 0 ? <Text type="supporting">No run waits for you.</Text> : (
            <ul className="dash-list">{runsWaiting.slice(0, 6).map((i) => <li key={`${i.matterId}:${i.id}`}><Text weight="semibold">{i.title}</Text> <Text type="supporting">{i.matterTitle}</Text></li>)}</ul>
          )}
        </Card>
        <Card title="Court updates and new judgments" testId="dash-updates">
          <Text type="supporting">Court monitoring, new orders and new relevant judgments come in phase 13. Nothing is connected yet.</Text>
        </Card>
        <Card title="Active matters" count={props.matters.length} testId="dash-matters">
          {props.matters.length === 0 ? <Text type="supporting">No matter is open.</Text> : (
            <ul className="dash-list">{props.matters.slice(0, 8).map((m) => {
              const d = docket.find((x) => x.matterId === m.id);
              return <li key={m.id}><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpenMatter(m.id); }}>{m.title}</a> <Text type="supporting">{d?.stage ?? "No stage recorded"}{d?.nextHearing ? `; next ${d.nextHearing.date}` : ""}</Text></li>;
            })}</ul>
          )}
        </Card>
      </div>
    </section>
  );
}
