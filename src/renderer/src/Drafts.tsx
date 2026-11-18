import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { CatalogueEntry, DraftRecord, RevisionRecord } from "../../shared/api.ts";
import type { PrecedentOffer } from "../../shared/knowledge.ts";
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

/** Phase 6: pick a document of the catalogue and generate it from the matter's records. */
function NewDraft(props: { matterId: string; onGenerate: (kind: DraftRecord["kind"]) => void; disabled: boolean }) {
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [pickedGroup, setPickedGroup] = useState("");
  useEffect(() => {
    void api.draftCatalogue().then(setEntries).catch(() => setEntries([]));
  }, []);
  // The catalogue owns the group ids and their labels, in catalogue order.
  const groups: Array<{ id: string; label: string }> = [];
  for (const entry of entries) {
    if (!groups.some((g) => g.id === entry.group)) groups.push({ id: entry.group, label: entry.groupLabel });
  }
  const group = groups.some((g) => g.id === pickedGroup) ? pickedGroup : (groups[0]?.id ?? "");
  const ofGroup = entries.filter((e) => e.group === group);
  const [kind, setKind] = useState("");
  const chosen = ofGroup.find((e) => e.kind === kind) ?? ofGroup[0];
  return (
    <div className="new-draft" data-testid="new-draft">
      <select aria-label="Document group" value={group} onChange={(e) => setPickedGroup(e.target.value)}>
        {groups.map((g) => (
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
  const [precedents, setPrecedents] = useState<PrecedentOffer[]>([]);
  useEffect(() => {
    void api.listPrecedents(props.matterId, 3).then(setPrecedents, () => setPrecedents([]));
  }, [props.matterId, props.drafts.length]);

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
      {precedents.length > 0 ? (
        <div className="notice" data-testid="precedent-offers">
          <Text weight="semibold">Approved precedents offered first</Text>
          <Text type="supporting">From the Knowledge Library. A rejected precedent is never offered. You decide what the new draft says.</Text>
          <ul className="plain-list">
            {precedents.map((p) => (
              <li key={p.id} className="phase4-row" data-testid="precedent-offer">
                <Text weight="semibold">{p.title}</Text>
                <Text type="supporting">{[p.status, p.court || null, p.scope || null, p.itemDate || null].filter(Boolean).join(" · ")}. {p.reason}.</Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
