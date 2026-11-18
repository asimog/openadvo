/**
 * J1 and J6 (docs/features.md): the Research page outside a matter. The shared law library is
 * searched here; each matter's Studio is one click away. The history is law only: a research
 * query, a saved provision or authority, or an argument run. Matter facts never cross.
 * Spec: docs/specs/law-research-authority.md.
 */
import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import type { EventRecord, MatterSummary } from "../../shared/api.ts";
import { LawPart } from "./Studio.tsx";

const api = window.openadvo;

type HistoryRow = { matterId: string; matterTitle: string; event: EventRecord };

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function eventColumns(e: EventRecord): { what: string; detail: string } {
  if (e.action === "research.query") {
    return {
      what: `${String(e.data?.source ?? "")} ${String(e.data?.action ?? "")}`.trim() || "research query",
      // The query text can name a matter's facts, so the cross-matter view shows the count only.
      detail: `${String(e.data?.results ?? 0)} result(s)`,
    };
  }
  if (e.action === "provision.added") return { what: "provision saved", detail: JSON.stringify(e.data ?? {}).slice(0, 160) };
  if (e.action === "authority.added") return { what: "authority saved", detail: JSON.stringify(e.data ?? {}).slice(0, 160) };
  return { what: e.action, detail: JSON.stringify(e.data ?? {}).slice(0, 160) };
}

export function ResearchPage(props: { matters: MatterSummary[]; onOpenMatter: (id: string) => void }) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const openMatters = props.matters.filter((m) => !m.archived);

  useEffect(() => {
    let live = true;
    setError(null);
    void (async () => {
      try {
        const groups = await Promise.all(
          props.matters
            .filter((m) => !m.archived)
            .map(async (m) => {
              try {
                const log = await api.getResearchLog(m.id);
                return log.map((event) => ({ matterId: m.id, matterTitle: m.title, event }));
              } catch {
                return [];
              }
            }),
        );
        if (!live) return;
        setHistory(groups.flat().sort((a, b) => b.event.at.localeCompare(a.event.at)).slice(0, 50));
      } catch (e) {
        if (!live) return;
        setHistory([]);
        setError(errorText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [props.matters, reload]);

  return (
    <div className="work-scroll">
      <section className="work-section page" aria-label="Research" data-testid="research-page">
        <div className="row-actions">
          <Heading level={2}>Research</Heading>
          <Button label="Refresh history" size="sm" variant="ghost" clickAction={() => setReload((n) => n + 1)} />
        </div>
        <Text type="supporting">
          Research runs in a matter's Studio. With no matter open, search the shared law library here. Choose a matter below to open its research studio, where plans, saved provisions, authorities and the research log stay with that matter.
        </Text>

        <Heading level={3}>Matter research studios</Heading>
        <Text type="supporting">Each matter has its own Studio. Its search saves to that matter; nothing is saved to another.</Text>
        {openMatters.length === 0 ? <Text>No matter yet. Create a matter to open a research studio.</Text> : null}
        <div data-testid="research-matters">
          <List density="compact">
            {openMatters.map((m) => (
              <ListItem
                key={m.id}
                label={m.title}
                description={`Created ${m.createdAt.slice(0, 10)}`}
                endContent={<Button label="Open research studio" size="sm" variant="ghost" onClick={() => props.onOpenMatter(m.id)} />}
              />
            ))}
          </List>
        </div>

        <LawPart matterId="" version={0} />

        <Heading level={3}>Research history across matters</Heading>
        <Text type="supporting">Law only: each research query's source and result count, saved provisions and authorities, and argument runs. Matter facts never cross from one matter to another.</Text>
        {error ? <div className="notice" role="alert" data-testid="research-history-error">{error}</div> : null}
        {history === null ? <Text type="supporting">Reading…</Text> : null}
        {history !== null && history.length === 0 && !error ? <Text type="supporting">No research yet. Open a matter's Studio to start.</Text> : null}
        {history !== null && history.length > 0 ? (
          <table className="plain" data-testid="research-history">
            <thead>
              <tr>
                <th>When</th>
                <th>Matter</th>
                <th>What</th>
                <th>Detail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const columns = eventColumns(row.event);
                return (
                  <tr key={`${row.matterId}:${row.event.seq}`}>
                    <td className="nowrap">{row.event.at.replace("T", " ").slice(0, 19)}</td>
                    <td>{row.matterTitle}</td>
                    <td>{columns.what}</td>
                    <td>{columns.detail}</td>
                    <td><Button label="Open" size="sm" variant="ghost" onClick={() => props.onOpenMatter(row.matterId)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
