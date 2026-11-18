import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import type { AgentChange, AgentChanges } from "../../shared/api.ts";

const api = window.openadvo;

/**
 * Editor-design items e to g: one card per draft with agent changes not yet decided.
 * Keep all covers only the changes that are not substantive (item g). Each change shows its
 * before and after, with Keep and Undo. Keep and Undo are bridge functions (decision 5).
 * Phase 6 (A7): an undo may carry the advocate's reason. The second undo with the same reason
 * in a matter proposes the matching preference, so the reason is worth one line.
 */
export function AgentChangesCard(props: {
  matterId: string;
  group: AgentChanges;
  onDecided: () => Promise<void>;
  /** Item f: open the draft at this revision and move the editor to the paragraph. */
  onShow: (draftId: string, anchor: string) => void;
}) {
  const g = props.group;
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const plain = g.changes.filter((c) => !c.substantive);
  const substantive = g.changes.filter((c) => c.substantive);

  const decide = async (changes: AgentChange[], decision: "keep" | "undo") => {
    if (changes.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      const reason = decision === "undo" ? undoReason.trim() : undefined;
      await api.decideAgentChanges(
        props.matterId,
        g.draftId,
        g.revisionId,
        changes.map((c) => ({ anchor: c.anchor, decision, ...(reason ? { reason } : {}) })),
      );
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
        <Button label="Show in editor" size="sm" variant="ghost" onClick={() => props.onShow(g.draftId, c.anchor)} />
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
      <div className="undo-reason" data-testid="undo-reason">
        <label htmlFor={`undo-reason-${g.draftId}`}>
          <Text type="supporting">Why are you undoing? (optional)</Text>
        </label>
        <input
          id={`undo-reason-${g.draftId}`}
          aria-label="Reason for undoing"
          value={undoReason}
          placeholder="For example: keep paragraphs short"
          onChange={(e) => setUndoReason(e.target.value)}
        />
        <Text type="supporting">The same reason twice proposes a preference you approve.</Text>
      </div>
      <div className="change-actions">
        <Button label={`Keep all wording changes (${plain.length})`} size="sm" isDisabled={working || plain.length === 0} onClick={() => void decide(plain, "keep")} />
        <Button label="Undo all" size="sm" variant="ghost" isDisabled={working} onClick={() => void decide(g.changes, "undo")} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <ol className="change-list">{[...substantive, ...plain].map(row)}</ol>
    </section>
  );
}
