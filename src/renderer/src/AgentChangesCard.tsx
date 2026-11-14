import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import type { AgentChange, AgentChanges } from "../../shared/api.ts";

const api = window.openadvo;

/**
 * Editor-design items e to g: one card per draft with agent changes not yet decided.
 * Keep all covers only the changes that are not substantive (item g). Each change shows its
 * before and after, with Keep and Undo. Keep and Undo are bridge functions (decision 5).
 */
export function AgentChangesCard(props: { matterId: string; group: AgentChanges; onDecided: () => Promise<void> }) {
  const g = props.group;
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const plain = g.changes.filter((c) => !c.substantive);
  const substantive = g.changes.filter((c) => c.substantive);

  const decide = async (changes: AgentChange[], decision: "keep" | "undo") => {
    if (changes.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      await api.decideAgentChanges(props.matterId, g.draftId, g.revisionId, changes.map((c) => ({ anchor: c.anchor, decision })));
      await props.onDecided();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const row = (c: AgentChange) => (
    <li key={c.anchor} className="change-row" data-testid="agent-change" data-substantive={c.substantive ? "yes" : "no"}>
      {c.substantive ? <Text type="supporting" weight="semibold">Substantive: decide on its own</Text> : null}
      <div className="change-before" data-testid="change-before"><Text type="supporting">Before</Text> {c.before}</div>
      <div className="change-after" data-testid="change-after"><Text type="supporting">After</Text> {c.after}</div>
      <div className="change-actions">
        <Button label="Keep" size="sm" isDisabled={working} onClick={() => void decide([c], "keep")} />
        <Button label="Undo" size="sm" variant="ghost" isDisabled={working} onClick={() => void decide([c], "undo")} />
      </div>
    </li>
  );

  return (
    <section className="changes-card" aria-label={`Agent changes to ${g.title}`} data-testid="agent-changes-card">
      <Text weight="semibold">
        {g.title}, revision {g.seq}: {g.changes.length} agent change(s) not decided
      </Text>
      <Text type="supporting">
        {plain.length} wording change(s), {substantive.length} substantive change(s). The revision cannot be approved until each one is decided.
      </Text>
      <div className="change-actions">
        <Button label={`Keep all wording changes (${plain.length})`} size="sm" isDisabled={working || plain.length === 0} onClick={() => void decide(plain, "keep")} />
        <Button label="Undo all" size="sm" variant="ghost" isDisabled={working} onClick={() => void decide(g.changes, "undo")} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <ol className="change-list">{[...substantive, ...plain].map(row)}</ol>
    </section>
  );
}
