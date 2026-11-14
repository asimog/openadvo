/**
 * The views of steps 6 to 10: matter details (Matter tab), Research (issues, authorities,
 * memoranda, citation checks, adverse-authority review, case conference) and Filing (annexures,
 * limitation, compliance, approval, filing set, confirmations, capture). Every decision button
 * calls a human-only bridge function (decision 5). The renderer holds no business logic.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { FilingState, ManifestCheck, MatterDetails, Notebook, ResearchState, SourceRecord } from "../../shared/api.ts";

const api = window.openadvo;

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; testId?: string; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea value={props.value} placeholder={props.placeholder} data-testid={props.testId} onChange={(e) => props.onChange(e.target.value)} rows={4} />
      ) : (
        <input value={props.value} placeholder={props.placeholder} data-testid={props.testId} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Run one action; show its error. */
function useAction(after: () => Promise<void> | void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await after();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [after],
  );
  return { error, busy, run };
}

// ---- Matter details (Matter tab) ----

export function MatterDetailsForm(props: { matterId: string; nb: Notebook | null; version: number }) {
  const [d, setD] = useState<MatterDetails | null>(null);
  const [nb, setNb] = useState<Notebook | null>(props.nb);
  const load = useCallback(async () => {
    setD((await api.getFiling(props.matterId)).details);
    setNb(await api.getNotebook(props.matterId));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version, props.nb]);
  const { error, busy, run } = useAction(load);
  if (!d) return null;
  const set = (k: keyof MatterDetails) => (v: string) => setD({ ...d, [k]: v });
  const judgments = (nb?.events ?? []).filter((e) => e.status === "confirmed" && e.kind === "procedural");
  return (
    <section className="work-section" data-testid="matter-details" aria-label="Matter details">
      <Heading level={3}>Matter details</Heading>
      <Text type="supporting">What you record here is used by the checks and the filing. Information not recorded stays empty; it is never guessed.</Text>
      <div className="field-grid">
        <Field label="Petitioner" value={d.petitioner} onChange={set("petitioner")} testId="detail-petitioner" />
        <Field label="Respondent" value={d.respondent} onChange={set("respondent")} testId="detail-respondent" />
        <Field label="Case number" value={d.caseNumber} onChange={set("caseNumber")} testId="detail-case-number" placeholder="For example: Writ Petition No. 12 of 2023" />
        <Field label="CNR" value={d.cnr} onChange={set("cnr")} testId="detail-cnr" />
        <Field label="Court" value={d.court} onChange={set("court")} testId="detail-court" />
        <label className="field">
          <span>Impugned judgment (a confirmed procedural event)</span>
          <select data-testid="detail-impugned" value={d.impugnedEventId ?? ""} onChange={(e) => setD({ ...d, impugnedEventId: e.target.value || null })}>
            <option value="">Not recorded</option>
            {judgments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.dateText}: {e.description.slice(0, 90)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        label="Save matter details"
        size="sm"
        isDisabled={busy}
        clickAction={() => run(() => api.setMatterDetails(props.matterId, { petitioner: d.petitioner, respondent: d.respondent, caseNumber: d.caseNumber, cnr: d.cnr, court: d.court, impugnedEventId: d.impugnedEventId }))}
      />
      {d.updatedAt ? <Text type="supporting"> Saved {d.updatedAt}.</Text> : null}
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </section>
  );
}

// ---- Research (steps 6, 7) ----

const ROLES = ["supporting", "adverse", "distinguishable", "other"] as const;

export function ResearchView(props: { matterId: string; version: number }) {
  const [s, setS] = useState<ResearchState | null>(null);
  const load = useCallback(async () => setS(await api.getResearch(props.matterId)), [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const { error, busy, run } = useAction(load);
  const [issue, setIssue] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [auth, setAuth] = useState({ citation: "", parties: "", decisionDate: "", paragraph: "", proposition: "", role: "supporting" as (typeof ROLES)[number], issueId: "" });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ citation: string; parties: string; date: string }> | null>(null);
  const [adverse, setAdverse] = useState({ outcome: "none_found", coverage: "", note: "" });
  const [openMemo, setOpenMemo] = useState<string | null>(null);
  if (!s) return null;
  return (
    <div className="work-view" data-testid="research-view">
      {error ? <div className="notice" role="alert" data-testid="research-error">{error}</div> : null}

      <section className="work-section" aria-label="Legal issues">
        <Heading level={3}>Legal issues (case conference)</Heading>
        <Text type="supporting">The agent proposes candidates. You accept or reject each one with a reason. Your own issues are accepted when you add them.</Text>
        <ul className="work-list">
          {s.issues.map((i) => (
            <li key={i.id} data-testid="issue" data-status={i.status}>
              <Badge variant={i.status === "accepted" ? "success" : i.status === "rejected" ? "neutral" : "warning"} label={i.status} /> {i.text}{" "}
              <Text type="supporting">({i.author}{i.reason ? `; reason: ${i.reason}` : ""})</Text>
              {i.status === "candidate" ? (
                <span className="row-actions">
                  <input placeholder="Reason" aria-label="Reason" value={reasons[i.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} />
                  <Button label="Accept" size="sm" isDisabled={busy} clickAction={() => run(() => api.decideIssue(props.matterId, i.id, "accepted", reasons[i.id] ?? ""))} />
                  <Button label="Reject" size="sm" variant="ghost" isDisabled={busy} clickAction={() => run(() => api.decideIssue(props.matterId, i.id, "rejected", reasons[i.id] ?? ""))} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="row-actions">
          <input placeholder="A legal issue" aria-label="New legal issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
          <Button label="Add issue" size="sm" isDisabled={busy || !issue.trim()} clickAction={() => run(async () => { await api.addIssue(props.matterId, issue); setIssue(""); })} />
        </div>
      </section>

      <section className="work-section" aria-label="Authorities">
        <Heading level={3}>Authorities</Heading>
        <ul className="work-list">
          {s.authorities.map((a) => {
            const check = s.citations.find((c) => c.citation.toLowerCase() === a.citation.toLowerCase());
            return (
              <li key={a.id} data-testid="authority" data-status={a.status}>
                <Badge variant={a.status === "adopted" ? "success" : a.status === "rejected" ? "neutral" : "warning"} label={a.status} /> <strong>{a.citation}</strong> {a.parties} {a.decisionDate} {a.paragraph ? `para ${a.paragraph}` : ""} <Badge variant="neutral" label={a.role} />{" "}
                {check ? <Badge variant={check.outcome === "verified" ? "success" : "warning"} label={`Validator: ${check.outcome}`} /> : <Text type="supporting">Not checked</Text>}
                {a.proposition ? <div><Text type="supporting">{a.proposition}</Text></div> : null}
                {a.status === "candidate" ? (
                  <span className="row-actions">
                    <Button label="Adopt" size="sm" isDisabled={busy} clickAction={() => run(() => api.decideAuthority(props.matterId, a.id, "adopted"))} />
                    <Button label="Reject" size="sm" variant="ghost" isDisabled={busy} clickAction={() => run(() => api.decideAuthority(props.matterId, a.id, "rejected"))} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="field-grid">
          <Field label="Citation" value={auth.citation} onChange={(v) => setAuth({ ...auth, citation: v })} testId="authority-citation" placeholder="2019 INSC 1234" />
          <Field label="Parties" value={auth.parties} onChange={(v) => setAuth({ ...auth, parties: v })} />
          <Field label="Decision date (YYYY-MM-DD)" value={auth.decisionDate} onChange={(v) => setAuth({ ...auth, decisionDate: v })} />
          <Field label="Paragraph" value={auth.paragraph} onChange={(v) => setAuth({ ...auth, paragraph: v })} />
          <Field label="Proposition" value={auth.proposition} onChange={(v) => setAuth({ ...auth, proposition: v })} />
          <label className="field">
            <span>Role</span>
            <select value={auth.role} data-testid="authority-role" onChange={(e) => setAuth({ ...auth, role: e.target.value as (typeof ROLES)[number] })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <Button
          label="Add authority"
          size="sm"
          isDisabled={busy || !auth.citation.trim()}
          clickAction={() => run(async () => { await api.addAuthority(props.matterId, { ...auth, issueId: auth.issueId || null }); setAuth({ ...auth, citation: "", parties: "", decisionDate: "", paragraph: "", proposition: "" }); })}
        />
        <div className="row-actions">
          <input placeholder="Search the citation index by party or citation" aria-label="Citation index search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button label="Search index" size="sm" isDisabled={!query.trim() || !s.validator.available} clickAction={async () => setHits(await api.searchCitationIndex(query))} />
        </div>
        {hits ? (
          <div data-testid="index-hits">
            <Text type="supporting">Citation index: a finding aid only, not verification. {hits.length} hit(s).</Text>
            <ul className="work-list">{hits.map((h) => <li key={h.citation}>{h.citation}: {h.parties}, {h.date}</li>)}</ul>
          </div>
        ) : null}
      </section>

      <section className="work-section" aria-label="Citation verification">
        <Heading level={3}>Citation verification</Heading>
        <Text type="supporting" data-testid="validator-status">
          Validator: {s.validator.available ? "ulos, against the court's released list of neutral citations" : `not available. ${s.validator.detail}`}
        </Text>
        <Button label="Check all citations" size="sm" isDisabled={busy || !s.validator.available} clickAction={() => run(() => api.checkCitations(props.matterId, null))} />
        <ul className="work-list">
          {s.citations.map((c) => (
            <li key={c.id} data-testid="citation-check" data-outcome={c.outcome}>
              <strong>{c.citation}</strong>{" "}
              <Badge variant={c.outcome === "verified" ? "success" : c.outcome === "not_applicable" ? "neutral" : "warning"} label={c.outcome} /> {c.reason ?? ""}{" "}
              {c.attested ? <Badge variant="neutral" label="Attested by advocate (not verified)" /> : null}
              {(c.outcome === "failed" || c.outcome === "unresolved") && !c.attested ? (
                <span className="row-actions">
                  <input placeholder="Reason for attestation" aria-label={`Attestation reason for ${c.citation}`} value={reasons[c.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })} />
                  <Button label="Attest" size="sm" isDisabled={busy} clickAction={() => run(() => api.attestCitation(props.matterId, c.citation, reasons[c.id] ?? ""))} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="work-section" aria-label="Adverse-authority review">
        <Heading level={3}>Adverse-authority review</Heading>
        <Text type="supporting" data-testid="adverse-status">
          {s.adverseReview ? `Recorded: ${s.adverseReview.outcome}${s.adverseReview.coverage ? `. Coverage: ${s.adverseReview.coverage}` : ""}` : "Not recorded. Grounds cannot be approved until it is."}
        </Text>
        <div className="field-grid">
          <label className="field">
            <span>Outcome</span>
            <select value={adverse.outcome} data-testid="adverse-outcome" onChange={(e) => setAdverse({ ...adverse, outcome: e.target.value })}>
              <option value="found_addressed">Adverse authority found and addressed</option>
              <option value="none_found">None identified within the stated coverage</option>
              <option value="incomplete">Search incomplete</option>
            </select>
          </label>
          <Field label="Search coverage" value={adverse.coverage} onChange={(v) => setAdverse({ ...adverse, coverage: v })} testId="adverse-coverage" />
          <Field label="Note" value={adverse.note} onChange={(v) => setAdverse({ ...adverse, note: v })} />
        </div>
        <Button label="Record review" size="sm" isDisabled={busy} clickAction={() => run(() => api.recordAdverseReview(props.matterId, adverse.outcome as "none_found", adverse.coverage, adverse.note))} />
      </section>

      <section className="work-section" aria-label="Memoranda">
        <Heading level={3}>Memoranda</Heading>
        {s.memoranda.length === 0 ? <Text type="supporting">No memorandum yet. Ask the agent to write one; it must cite the matter's records.</Text> : null}
        <ul className="work-list">
          {s.memoranda.map((m) => (
            <li key={m.id} data-testid="memorandum">
              <Button label={m.title} size="sm" variant="ghost" onClick={() => setOpenMemo(openMemo === m.id ? null : m.id)} />{" "}
              <Text type="supporting">{m.author}, {m.refs.length} reference(s) resolved{m.unresolved.length ? `, ${m.unresolved.length} unresolved` : ""}</Text>
              {openMemo === m.id ? (
                <div className="memo-body">
                  <pre>{m.body}</pre>
                  {m.unresolved.length ? <div className="notice">Unresolved references: {m.unresolved.join(", ")}</div> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---- Filing (steps 8, 9, 10) ----

export function FilingView(props: { matterId: string; sources: SourceRecord[]; version: number }) {
  const [f, setF] = useState<FilingState | null>(null);
  const load = useCallback(async () => setF(await api.getFiling(props.matterId)), [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const { error, busy, run } = useAction(load);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [account, setAccount] = useState({ host: "", port: "993", user: "", password: "" });
  const [mailFilter, setMailFilter] = useState({ from: "", subject: "" });
  const [manifestCheck, setManifestCheck] = useState<ManifestCheck | null>(null);
  if (!f) return null;
  const selected = chosen ?? f.annexures.map((a) => a.sourceId);
  const set = f.filingSet;
  const confirmed = (step: 1 | 2) => !!set?.confirmations.some((c) => c.step === step && c.payloadSha256 === set.payloadSha256);
  return (
    <div className="work-view" data-testid="filing-view">
      {error ? <div className="notice" role="alert" data-testid="filing-error">{error}</div> : null}

      <section className="work-section" aria-label="Court record and email">
        <Heading level={3}>Court record and client email</Heading>
        <Text type="supporting">The court portal opens in a visible window. You sign in and solve any CAPTCHA. Every PDF you download there is added to the matter with its address.</Text>
        <div className="row-actions">
          <Button label="Open court portal" size="sm" clickAction={() => run(() => api.openPortal(props.matterId))} />
          <Button label="Import saved email (.eml)" size="sm" clickAction={() => run(async () => { const r = await api.importEmail(props.matterId); setMailNote(`${r.messages} message(s); ${r.attachments.map((a) => `${a.name}: ${a.outcome}`).join("; ") || "no attachment"}`); })} />
        </div>
        <details>
          <summary>Authorised mailbox (IMAP, read only)</summary>
          <div className="field-grid">
            <Field label="IMAP host" value={account.host} onChange={(v) => setAccount({ ...account, host: v })} />
            <Field label="Port" value={account.port} onChange={(v) => setAccount({ ...account, port: v })} />
            <Field label="User" value={account.user} onChange={(v) => setAccount({ ...account, user: v })} />
            <label className="field"><span>Password (kept in the operating system's secret store)</span><input type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></label>
          </div>
          <Button label="Save mailbox" size="sm" clickAction={() => run(async () => { await api.setMailAccount({ host: account.host, port: Number(account.port) || 993, secure: true, user: account.user }, account.password); setAccount({ ...account, password: "" }); setMailNote("Mailbox saved."); })} />
          <div className="field-grid">
            <Field label="From" value={mailFilter.from} onChange={(v) => setMailFilter({ ...mailFilter, from: v })} />
            <Field label="Subject contains" value={mailFilter.subject} onChange={(v) => setMailFilter({ ...mailFilter, subject: v })} />
          </div>
          <Button label="Import from mailbox" size="sm" clickAction={() => run(async () => { const r = await api.fetchMail(props.matterId, mailFilter); setMailNote(`${r.messages} message(s); ${r.attachments.map((a) => `${a.name}: ${a.outcome}`).join("; ") || "no attachment"}`); })} />
        </details>
        {mailNote ? <Text type="supporting" data-testid="mail-note">{mailNote}</Text> : null}
      </section>

      <section className="work-section" aria-label="Annexures">
        <Heading level={3}>Annexures</Heading>
        <Text type="supporting">Tick the sources to annex, in order. They are labelled Annexure P-1, P-2 and so on.</Text>
        <ul className="work-list">
          {props.sources.map((src) => (
            <li key={src.id}>
              <label>
                <input type="checkbox" data-testid="annexure-pick" checked={selected.includes(src.id)} onChange={(e) => setChosen(e.target.checked ? [...selected, src.id] : selected.filter((x) => x !== src.id))} /> {src.name}
                {selected.includes(src.id) ? <Badge variant="neutral" label={`Annexure P-${selected.indexOf(src.id) + 1}`} /> : null}
              </label>
            </li>
          ))}
        </ul>
        <Button label="Save annexures" size="sm" isDisabled={busy} clickAction={() => run(async () => { await api.setAnnexures(props.matterId, selected.map((id) => ({ sourceId: id, title: "" }))); setChosen(null); })} />
      </section>

      <section className="work-section" aria-label="Limitation">
        <Heading level={3}>Limitation</Heading>
        {f.limitation ? (
          <div data-testid="limitation">
            <Text weight="semibold">Last day: {f.limitation.deadline.split("-").reverse().join(".")} {f.limitation.confirmedAt ? "(confirmed by you)" : "(not confirmed)"}</Text>
            <div><Text type="supporting">{f.limitation.working}</Text></div>
            {!f.limitation.confirmedAt ? <Button label="Confirm limitation" size="sm" isDisabled={busy} clickAction={() => run(() => api.confirmLimitation(props.matterId, f.limitation!.id))} /> : null}
          </div>
        ) : (
          <Text type="supporting">Not computed.</Text>
        )}
        <Button label="Compute limitation" size="sm" variant="ghost" isDisabled={busy} clickAction={() => run(() => api.computeLimitation(props.matterId))} />
      </section>

      <section className="work-section" aria-label="Filing compliance">
        <Heading level={3}>Filing compliance ({f.compliance.version})</Heading>
        <table className="table" data-testid="compliance">
          <thead><tr><th>Rule</th><th>Requirement</th><th>Result</th><th>Detail</th><th>Source</th></tr></thead>
          <tbody>
            {f.compliance.results.map((r) => (
              <tr key={r.rule} data-rule={r.rule} data-outcome={r.outcome}>
                <td>{r.rule}</td><td>{r.title}</td>
                <td><Badge variant={r.outcome === "pass" ? "success" : r.outcome === "defect" ? "warning" : "neutral"} label={r.outcome === "not_checked" ? "not checked" : r.outcome} /></td>
                <td>{r.detail}</td><td><Text type="supporting">{r.source}</Text></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="work-section" aria-label="Approval for filing">
        <Heading level={3}>Approval for filing</Heading>
        {f.blockers.length ? <div className="notice" data-testid="filing-blockers">Blocked: {f.blockers.join(" ")}</div> : null}
        <Button label="Approve for filing and make the filing set" size="sm" variant="primary" isDisabled={busy || f.blockers.length > 0} clickAction={() => run(() => api.approveForFiling(props.matterId))} />
        {busy ? <Text type="supporting"> Working…</Text> : null}
        {set ? (
          <div data-testid="filing-set">
            <Text weight="semibold">Filing set made {set.createdAt}. Payload hash:</Text> <span className="mono" data-testid="payload-hash">{set.payloadSha256}</span>
            <table className="table">
              <thead><tr><th>File</th><th>Role</th><th>PDF/A</th><th>SHA-256</th></tr></thead>
              <tbody>{set.manifest.files.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.role}</td><td>{x.pdfa ? "yes" : "no"}</td><td className="mono">{x.sha256.slice(0, 16)}…</td></tr>)}</tbody>
            </table>
            <Text type="supporting">Manifest digest: <span className="mono">{set.manifest.digest ?? "none (made before v1)"}</span></Text>
            <div className="row-actions">
              <Button label="Show the filing set folder" size="sm" variant="ghost" clickAction={() => api.revealFilingSet(props.matterId)} />
              <Button label="Verify the manifest" size="sm" variant="ghost" clickAction={async () => setManifestCheck(await api.verifyFilingManifest(props.matterId))} />
            </div>
            {manifestCheck ? (
              <div className="notice" data-testid="manifest-check">
                {manifestCheck.ok ? "Manifest verified: the digest and every file hash match." : `Manifest NOT verified. Digest: ${manifestCheck.digest}. ${manifestCheck.files.filter((x) => x.outcome !== "match").map((x) => `${x.name}: ${x.outcome}`).join("; ")}`}
              </div>
            ) : null}
            <Heading level={4}>Confirmations (yours only; voice cannot confirm)</Heading>
            <div className="row-actions">
              <Button label={confirmed(1) ? "Filing set confirmed (1 of 2)" : "Confirm the filing set (1 of 2)"} size="sm" isDisabled={busy || confirmed(1)} clickAction={() => run(() => api.confirmFiling(props.matterId, set.id, set.payloadSha256, 1))} />
              <Button label={confirmed(2) ? "Filing confirmed (2 of 2)" : "Confirm the filing (2 of 2)"} size="sm" isDisabled={busy || !confirmed(1) || confirmed(2)} clickAction={() => run(() => api.confirmFiling(props.matterId, set.id, set.payloadSha256, 2))} />
            </div>
            <Text type="supporting">Each confirmation is bound to the payload hash above. After both, the agent may submit this filing set on the portal, and only this one.</Text>
          </div>
        ) : null}
      </section>
    </div>
  );
}
