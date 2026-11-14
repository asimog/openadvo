import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { DraftRecord, RevisionRecord } from "../../shared/api.ts";
import { ListOfDatesRows } from "./V2.tsx";
import { InspectButton } from "./V5.tsx";

const api = window.openadvo;

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function kindLabel(kind: DraftRecord["kind"]): string {
  return { list_of_dates: "List of Dates", synopsis: "Synopsis", questions_of_law: "Questions of Law", grounds: "Grounds", petition: "Petition", conference: "Conference package", condonation: "Condonation application" }[kind];
}

/** The drafts of a matter, and the two generators that write the first revision (step 4). */
export function DraftsSection(props: {
  matterId: string;
  drafts: DraftRecord[];
  onRefresh: () => Promise<void>;
  onOpen: (draft: DraftRecord, revision: RevisionRecord) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (kind: DraftRecord["kind"]) => {
    setWorking(true);
    setError(null);
    try {
      const result =
        kind === "list_of_dates"
          ? await api.generateListOfDates(props.matterId)
          : kind === "synopsis"
            ? await api.generateSynopsis(props.matterId)
            : await api.generateDraft(props.matterId, kind);
      await props.onRefresh();
      props.onOpen(result.draft, result.revision);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="drafts" data-testid="drafts" aria-label="Drafts">
      <div className="drafts-header">
        <Heading level={3}>Drafts</Heading>
        <div className="drafts-actions">
          <Button label="Generate List of Dates" size="sm" isDisabled={working} clickAction={() => generate("list_of_dates")} />
          <Button label="Generate Synopsis" size="sm" isDisabled={working} clickAction={() => generate("synopsis")} />
          <Button label="Start Questions of Law" size="sm" isDisabled={working} clickAction={() => generate("questions_of_law")} />
          <Button label="Start Grounds" size="sm" isDisabled={working} clickAction={() => generate("grounds")} />
          <Button label="Prepare conference package" size="sm" isDisabled={working} clickAction={() => generate("conference")} />
          <Button label="Prepare petition" size="sm" isDisabled={working} clickAction={() => generate("petition")} />
          <Button label="Prepare condonation application" size="sm" isDisabled={working} clickAction={() => generate("condonation")} />
          {working ? <Text type="supporting">Generating…</Text> : null}
        </div>
      </div>
      <ListOfDatesRows matterId={props.matterId} version={props.drafts.length} />
      {error ? (
        <div className="notice" role="alert" data-testid="drafts-error">
          {error}
        </div>
      ) : null}
      {props.drafts.length === 0 ? (
        <Text type="supporting">No drafts yet. Generate the List of Dates or the Synopsis.</Text>
      ) : (
        <ul className="draft-list" aria-label="Draft list">
          {props.drafts.map((draft) => {
            const head = draft.head;
            const approved = draft.approved;
            return (
              <li key={draft.id} className="draft-row" data-draft-id={draft.id}>
                <div className="draft-meta">
                  <Text weight="semibold">{draft.title}</Text>
                  <Text type="supporting">{kindLabel(draft.kind)}</Text>
                  {head ? <Text type="supporting">Revision {head.seq}</Text> : null}
                  {approved ? <Badge variant="success" label="Approved" /> : null}
                </div>
                <div className="draft-actions">
                  {head ? <Button label="Open latest" size="sm" onClick={() => props.onOpen(draft, head)} /> : null}
                  {approved ? <Button label="Open approved" size="sm" onClick={() => props.onOpen(draft, approved)} /> : null}
                  <InspectButton id={draft.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
