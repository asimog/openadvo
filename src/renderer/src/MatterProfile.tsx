/**
 * C1, C3, C4, C5, C6 and C10: the matter profile, the classification proposal, the stages, the
 * related matters and the overview. Human-only writes; the agent only proposes.
 * Spec: docs/specs/advocate-matters-browser.md section 5.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { ClassificationProposal } from "../../lib/classification/index.ts";
import type { MatterDetails, MatterProfile, MatterRelation, RelatedMatter } from "../../shared/work.ts";
import type { MatterSummary } from "../../shared/records.ts";
import { MATTER_RELATIONS } from "../../shared/work.ts";
import { stageListFor } from "../../lib/stages/index.ts";
import { dmy } from "../../shared/dates.ts";

const api = window.openadvo;

const SIDES = ["petitioner", "respondent", "applicant", "accused", "appellant", "complainant", "decree holder", "judgment debtor", "claimant"];
const PROCEEDINGS = ["Bail application", "Anticipatory bail", "Quashing petition", "Writ petition", "Civil suit", "Appeal", "Special leave petition", "Revision", "Review", "Execution", "Arbitration petition", "Consumer complaint", "Tax appeal", "Service matter", "Other proceeding"];

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function MatterProfileForm(props: { matterId: string; version: number; onChange: () => void }) {
  const [profile, setProfile] = useState<MatterProfile | null>(null);
  const [details, setDetails] = useState<MatterDetails | null>(null);
  const [draft, setDraft] = useState<MatterProfile | null>(null);
  const [proposal, setProposal] = useState<ClassificationProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api.getMatterProfile(props.matterId), api.getFiling(props.matterId)]);
      setProfile(p);
      setDraft(p);
      setDetails(f.details);
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);

  const stages = stageListFor(draft?.proceeding, draft?.caseType);
  const save = async () => {
    if (!draft) return;
    try {
      setError(null);
      const next = await api.setMatterProfile(props.matterId, draft);
      setProfile(next);
      setDraft(next);
      await api.setMatterDetails(props.matterId, { cnr: next.cnr, court: next.court, caseNumber: next.caseNumber || details?.caseNumber || "" });
      setNote("The matter profile is saved.");
      props.onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const classify = async () => {
    try {
      setError(null);
      setProposal(await api.proposeClassification(props.matterId));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const apply = async () => {
    if (!proposal) return;
    try {
      await api.applyClassification(props.matterId, proposal);
      setProposal(null);
      setNote("The classification is applied. Correct any field above.");
      await load();
      props.onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!draft) return <div className="work-section" aria-label="Matter profile"><Text type="supporting">Reading the matter profile.</Text></div>;
  const field = (key: keyof MatterProfile, set: (p: MatterProfile) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set({ ...draft, [key]: e.target.value });
  return (
    <section className="work-section" aria-label="Matter profile" data-testid="matter-profile">
      <div className="section-header">
        <Heading level={3}>Matter profile</Heading>
        <div className="row-actions">
          <Button label="Propose the classification" size="sm" variant="ghost" clickAction={classify} data-testid="matter-classify" />
          <Button label="Save the profile" size="sm" clickAction={save} data-testid="matter-profile-save" />
        </div>
      </div>
      <Text type="supporting">The universal fields of this matter. Missing information stays empty; nothing is guessed. The stage list follows the proceeding.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {note ? <div className="notice" role="status">{note}</div> : null}
      <div className="field-grid">
        <label className="field">Court<input value={draft.court} onChange={field("court", setDraft)} /></label>
        <label className="field">Bench<input value={draft.bench} onChange={field("bench", setDraft)} /></label>
        <label className="field">Practice area<input value={draft.practiceArea} onChange={field("practiceArea", setDraft)} placeholder="criminal, civil, constitutional…" /></label>
        <label className="field">Case type<input value={draft.caseType} onChange={field("caseType", setDraft)} placeholder="Bail application, writ petition…" /></label>
        <label className="field">Proceeding
          <select aria-label="Proceeding" value={draft.proceeding} onChange={field("proceeding", setDraft)}>
            <option value="">Not recorded</option>
            {PROCEEDINGS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field">Side
          <select aria-label="Side" value={draft.side} onChange={field("side", setDraft)}>
            <option value="">Not recorded</option>
            {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">Case number<input value={draft.caseNumber} onChange={field("caseNumber", setDraft)} /></label>
        <label className="field">CNR<input value={draft.cnr} onChange={field("cnr", setDraft)} /></label>
        <label className="field">Filing date<input type="date" value={draft.filingDate} onChange={field("filingDate", setDraft)} /></label>
        <label className="field">Institution date<input type="date" value={draft.institutionDate} onChange={field("institutionDate", setDraft)} /></label>
        <label className="field">Governing date<input type="date" value={draft.governingDate} onChange={field("governingDate", setDraft)} /></label>
        <label className="field">Stage
          <select aria-label="Stage" value={draft.stage} onChange={field("stage", setDraft)}>
            <option value="">Not recorded</option>
            {stages.stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Relief sought<textarea rows={2} value={draft.relief} onChange={field("relief", setDraft)} /></label>
      <Text type="supporting">Stage list: {stages.title} ({stages.stages.length} stages). The current stage is one of them.</Text>
      {proposal ? (
        <div className="notice" data-testid="classification-proposal">
          <Text weight="semibold">Proposed classification</Text>
          <Text>{[proposal.practiceArea, proposal.caseType, proposal.court, proposal.proceeding, proposal.stage].filter(Boolean).join(" · ") || "No field could be proposed."}</Text>
          <ul className="plain-list">{proposal.basis.map((b) => <li key={b}><Text type="supporting">{b}</Text></li>)}</ul>
          <div className="row-actions">
            <Button label="Apply the proposal" size="sm" clickAction={apply} data-testid="classification-apply" />
            <Button label="Dismiss" size="sm" variant="ghost" onClick={() => setProposal(null)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RelatedMatters(props: { matterId: string; matters: MatterSummary[]; version: number; onOpen: (matterId: string) => void; onChange: () => void }) {
  const [rows, setRows] = useState<RelatedMatter[]>([]);
  const [toId, setToId] = useState("");
  const [relation, setRelation] = useState<MatterRelation>("appeal_from");
  const [note, setNote] = useState("");
  const [extend, setExtend] = useState({ title: "", relation: "appeal_from" as MatterRelation, proceeding: "" });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await api.listRelatedMatters(props.matterId));
    } catch (e) {
      setError(errorText(e));
    }
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const add = async () => {
    try {
      setError(null);
      setRows(await api.addRelatedMatter(props.matterId, toId, relation, note));
      setToId("");
      setNote("");
      props.onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async (row: RelatedMatter) => {
    try {
      setRows(await api.removeRelatedMatter(props.matterId, row.fromId ?? row.toId, row.relation));
      props.onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const extendMatter = async () => {
    try {
      setError(null);
      const m = await api.extendMatter(props.matterId, { title: extend.title, relation: extend.relation, proceeding: extend.proceeding || undefined });
      setExtend({ title: "", relation: "appeal_from", proceeding: "" });
      await load();
      props.onChange();
      props.onOpen(m.id);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const others = props.matters.filter((m) => m.id !== props.matterId);
  return (
    <section className="work-section" aria-label="Related matters" data-testid="related-matters">
      <Heading level={3}>Related matters</Heading>
      <Text type="supporting">An appeal from this matter, a revision, a review, a connected case, the FIR behind a bail matter, a common party or common evidence. Each link is shown on both matters.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={`${r.fromId ?? "this"}:${r.toId}:${r.relation}`}>
            <button type="button" className="link" onClick={() => props.onOpen(r.fromId ?? r.toId)}>{r.title ?? r.toId}</button>{" "}
            <Text type="supporting">{r.incoming ? `records this matter as ${r.relation.replace(/_/g, " ")}` : r.relation.replace(/_/g, " ")}{r.note ? ` — ${r.note}` : ""}</Text>{" "}
            {!r.incoming ? <Button label="Remove" size="sm" variant="ghost" clickAction={() => remove(r)} /> : null}
          </li>
        ))}
        {rows.length === 0 ? <li><Text type="supporting">No related matter.</Text></li> : null}
      </ul>
      <div className="row-actions practice-form">
        <select aria-label="Related matter" value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">Choose a matter</option>
          {others.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select aria-label="Relation" value={relation} onChange={(e) => setRelation(e.target.value as MatterRelation)}>
          {MATTER_RELATIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
        <input aria-label="Relation note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button label="Link" size="sm" isDisabled={!toId} clickAction={add} />
      </div>
      <details className="related-extend">
        <summary>Add a later stage or a related proceeding</summary>
        <div className="row-actions practice-form">
          <input aria-label="New matter title" placeholder="Title of the new matter" value={extend.title} onChange={(e) => setExtend({ ...extend, title: e.target.value })} />
          <select aria-label="New matter relation" value={extend.relation} onChange={(e) => setExtend({ ...extend, relation: e.target.value as MatterRelation })}>
            {MATTER_RELATIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <input aria-label="New proceeding" placeholder="Appeal, revision, execution…" value={extend.proceeding} onChange={(e) => setExtend({ ...extend, proceeding: e.target.value })} />
          <Button label="Create the linked matter" size="sm" isDisabled={!extend.title.trim()} clickAction={extendMatter} data-testid="extend-matter" />
        </div>
      </details>
    </section>
  );
}

export function MatterOverview(props: { matterId: string; matter: MatterSummary; version: number; sourceCount: number; openItems: number; onTab: (tab: string) => void; onOpenRelated: (id: string) => void }) {
  const [profile, setProfile] = useState<MatterProfile | null>(null);
  const [details, setDetails] = useState<MatterDetails | null>(null);
  const [hearings, setHearings] = useState<Awaited<ReturnType<typeof api.listHearings>>>([]);
  const [related, setRelated] = useState<RelatedMatter[]>([]);
  const [parties, setParties] = useState<Awaited<ReturnType<typeof api.listParties>>>([]);
  const [research, setResearch] = useState<Awaited<ReturnType<typeof api.getResearch>> | null>(null);
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof api.listDrafts>>>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof api.getNotebook>>["events"]>([]);
  const [limitation, setLimitation] = useState<{ deadline: string; confirmedAt: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      api.getMatterProfile(props.matterId),
      api.getFiling(props.matterId),
      api.listHearings(props.matterId),
      api.listRelatedMatters(props.matterId),
      api.listParties(props.matterId),
      api.getResearch(props.matterId),
      api.listDrafts(props.matterId),
      api.getNotebook(props.matterId),
    ])
      .then(([p, f, h, r, ps, rs, ds, nb]) => {
        if (!live) return;
        setProfile(p);
        setDetails(f.details);
        setHearings(h);
        setRelated(r);
        setParties(ps);
        setResearch(rs);
        setDrafts(ds);
        setEvents(nb.events);
        setLimitation(f.limitation);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.matterId, props.version]);
  const next = hearings.filter((h) => h.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  return (
    <section className="work-section matter-overview" aria-label="Overview" data-testid="matter-overview">
      <Heading level={3}>Overview</Heading>
      <div className="overview-grid">
        <div><Text type="supporting">Court</Text><Text weight="semibold">{profile?.court || details?.court || "Not recorded"}</Text></div>
        <div><Text type="supporting">Case type</Text><Text weight="semibold">{profile?.caseType || "Not recorded"}</Text></div>
        <div><Text type="supporting">Stage</Text><Text weight="semibold">{profile?.stage || "Not recorded"}</Text></div>
        <div><Text type="supporting">Next date</Text><Text weight="semibold">{next ? `${dmy(next.nextDate)} (${next.nextDateStatus})` : "Not recorded"}</Text></div>
        <div><Text type="supporting">CNR</Text><Text weight="semibold">{details?.cnr || profile?.cnr || "Not recorded"}</Text></div>
        <div><Text type="supporting">Documents</Text><Text weight="semibold">{props.sourceCount}</Text></div>
        <div><Text type="supporting">Open items</Text><Text weight="semibold">{props.openItems}</Text></div>
        <div><Text type="supporting">Related matters</Text><Text weight="semibold">{related.length}</Text></div>
        <div><Text type="supporting">Issues accepted</Text><Text weight="semibold">{research ? research.issues.filter((i) => i.status === "accepted").length : 0}</Text></div>
        <div><Text type="supporting">Authorities adopted</Text><Text weight="semibold">{research ? research.authorities.filter((a) => a.status === "adopted").length : 0}</Text></div>
        <div><Text type="supporting">Drafts</Text><Text weight="semibold">{drafts.length}</Text></div>
        <div><Text type="supporting">Limitation</Text><Text weight="semibold">{limitation ? `${dmy(limitation.deadline)}${limitation.confirmedAt ? "" : " (not confirmed)"}` : "Not recorded"}</Text></div>
      </div>
      {profile?.relief ? <Text><Text weight="semibold">Relief sought: </Text>{profile.relief}</Text> : null}
      {research && research.issues.some((i) => i.status === "candidate") ? (
        <Text type="supporting">Open questions: {research.issues.filter((i) => i.status === "candidate").map((i) => i.text).join("; ")}.</Text>
      ) : null}
      {events.length ? (
        <div>
          <Text type="supporting">Latest developments</Text>
          <ul className="plain-list">
            {events.filter((e) => e.status !== "rejected" && !e.excluded).slice(-3).reverse().map((e) => (
              <li key={e.id}><Text weight="semibold">{e.dateText}</Text> <Text>{e.description}</Text></li>
            ))}
          </ul>
        </div>
      ) : null}
      <Text type="supporting">Parties</Text>
      <ul className="plain-list">
        {parties.map((p) => <li key={p.id}><Text weight="semibold">{(p.contact?.name ?? p.nameInRecord) || "(party)"}</Text> <Text>as {p.role}</Text>{p.counsel ? <Text type="supporting">, counsel {p.counsel}</Text> : null}</li>)}
        {parties.length === 0 ? <li><Text type="supporting">No party is linked.</Text></li> : null}
      </ul>
      <div className="row-actions">
        <Button label="Facts & chronology" size="sm" variant="ghost" onClick={() => props.onTab("chronology")} />
        <Button label="Documents & evidence" size="sm" variant="ghost" onClick={() => props.onTab("sources")} />
        <Button label="Research & authorities" size="sm" variant="ghost" onClick={() => props.onTab("research")} />
        <Button label="Ready to file" size="sm" variant="ghost" onClick={() => props.onTab("filing")} />
        <Button label="Proceedings & hearings" size="sm" variant="ghost" onClick={() => props.onTab("procedural")} />
      </div>
      {related.length ? (
        <div>
          <Text type="supporting">Related</Text>
          <ul className="plain-list">{related.map((r) => <li key={`${r.fromId ?? "this"}:${r.toId}:${r.relation}`}><button type="button" className="link" onClick={() => props.onOpenRelated(r.fromId ?? r.toId)}>{r.title ?? r.toId}</button> <Text type="supporting">{r.relation.replace(/_/g, " ")}</Text></li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
