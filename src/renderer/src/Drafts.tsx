import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { CatalogueEntry, DraftRecord, RevisionRecord } from "../../shared/api.ts";
import { ListOfDatesRows } from "./V2.tsx";
import { InspectButton } from "./V5.tsx";
import { DraftTools } from "./DraftsV5.tsx";

const api = window.openadvo;

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** Every kind's label, one place: the catalogue's own words, then the records' kinds. */
export function kindLabel(kind: DraftRecord["kind"]): string {
  const fixed: Partial<Record<DraftRecord["kind"], string>> = {
    list_of_dates: "List of Dates",
    synopsis: "Synopsis",
    questions_of_law: "Questions of Law",
    grounds: "Grounds",
    petition: "Petition",
    conference: "Conference package",
    condonation: "Condonation application",
  };
  return fixed[kind] ?? kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const GROUPS: Array<{ id: string; label: string }> = [
  { id: "petitions", label: "Petitions and appeals" },
  { id: "pleadings", label: "Pleadings" },
  { id: "applications", label: "Applications" },
  { id: "evidence", label: "Affidavits and evidence" },
  { id: "submissions", label: "Submissions" },
  { id: "notices", label: "Notices" },
  { id: "notes", label: "Notes and summaries" },
  { id: "letters", label: "Client letters" },
];

/** Phase 6: pick a document of the catalogue and generate it from the matter's records. */
function NewDraft(props: { matterId: string; onGenerate: (kind: DraftRecord["kind"]) => void; disabled: boolean }) {
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [group, setGroup] = useState(GROUPS[0].id);
  useEffect(() => {
    void api.draftCatalogue().then(setEntries).catch(() => setEntries([]));
  }, []);
  const ofGroup = entries.filter((e) => e.group === group);
  const [kind, setKind] = useState("");
  const chosen = ofGroup.find((e) => e.kind === kind) ?? ofGroup[0];
  return (
    <div className="new-draft" data-testid="new-draft">
      <select aria-label="Document group" value={group} onChange={(e) => setGroup(e.target.value)}>
        {GROUPS.map((g) => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      <select aria-label="Document" value={chosen?.kind ?? ""} onChange={(e) => setKind(e.target.value)}>
        {ofGroup.map((e) => (
          <option key={e.kind} value={e.kind}>{e.title}</option>
        ))}
        {ofGroup.length === 0 ? <option value="">No document in this group</option> : null}
      </select>
      <Button label="New draft" size="sm" isDisabled={props.disabled || !chosen} clickAction={() => chosen && props.onGenerate(chosen.kind)} />
      {chosen ? <Text type="supporting">{chosen.note}</Text> : null}
    </div>
  );
}

/** The drafts of a matter, and the generators that write the first revision. */
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
      <NewDraft matterId={props.matterId} onGenerate={generate} disabled={working} />
      <ListOfDatesRows matterId={props.matterId} version={props.drafts.length} />
      {error ? (
        <div className="notice" role="alert" data-testid="drafts-error">
          {error}
        </div>
      ) : null}
      {props.drafts.length === 0 ? (
        <Text type="supporting">No drafts yet. Pick a document above, or generate the List of Dates.</Text>
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
                  <DraftTools matterId={props.matterId} draft={draft} onChanged={() => void props.onRefresh()} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
