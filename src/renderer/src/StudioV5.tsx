/**
 * V5-9 to V5-12 in the Studio (docs/specs/v5.md): support, voice and treatment of authorities,
 * the quick check, bench trends (advisory) and the admission-hearing rehearsal.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { StudioState } from "../../shared/api.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

const SUPPORT_VALUES = ["supports", "partially_supports", "does_not_support", "contrary", "cannot_assess"];
const VOICE_VALUES = ["holding", "obiter", "counsel_submission", "lower_court_view", "dissent", "concurrence", "unknown"];
const TREATMENT_VALUES = ["overruled", "doubted", "distinguished", "followed", "referred_to_larger_bench"];

function AssessField(props: { matterId: string; authorityId: string; field: "support" | "voice"; value: string | null; status: string | undefined; onDone: () => void }) {
  const [v, setV] = useState(props.value ?? "");
  useEffect(() => setV(props.value ?? ""), [props.value]);
  const values = props.field === "support" ? SUPPORT_VALUES : VOICE_VALUES;
  const label = props.field === "support" ? "Support" : "Voice";
  return (
    <span className="assess">
      <select aria-label={`${label} of the authority`} value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">{label}: not assessed</option>
        {values.map((x) => (
          <option key={x} value={x}>
            {x.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {props.status === "confirmed" && v === props.value ? (
        <Badge variant="success" label={`${label} confirmed`} />
      ) : (
        <Button
          label={props.value && v === props.value ? `Confirm ${props.field}` : `Set ${props.field}`}
          size="sm"
          variant="ghost"
          isDisabled={!v}
          clickAction={async () => {
            await api.assessAuthority(props.matterId, props.authorityId, props.field, v, "");
            props.onDone();
          }}
        />
      )}
      {props.status === "candidate" && props.value ? <Text type="supporting"> (proposed)</Text> : null}
    </span>
  );
}

type TreatmentForm = { authorityId: string; kind: string; byCitation: string; byDate: string; byBench: string; authorityDate: string; authorityBench: string };

export function AuthorityReview(props: { matterId: string; version: number }) {
  const [authorities, setAuthorities] = useState<Array<{ id: string; citation: string; parties: string; status: string }>>([]);
  const [s, setS] = useState<StudioState | null>(null);
  const [form, setForm] = useState<TreatmentForm | null>(null);
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof api.quickCheckCitations>> | null>(null);
  const [trends, setTrends] = useState<Awaited<ReturnType<typeof api.benchTrends>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setAuthorities((await api.getResearch(props.matterId)).authorities.filter((a) => a.status !== "rejected"));
    setS(await api.getStudio(props.matterId));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  if (!s) return null;
  const assessment = (id: string) => s.assessments.find((a) => a.authorityId === id);
  const pct = (n: number, t: number) => `${Math.round((100 * n) / Math.max(1, t))}%`;
  return (
    <>
      <section className="work-section" aria-label="Authority review" data-testid="authority-review">
        <Heading level={3}>Support, voice and treatment</Heading>
        <Text type="supporting">
          For each authority: the support it gives to the proposition, and the voice of the passage relied on (holding, obiter and so on). A cited authority whose voice is not confirmed holds the Grounds in legal review. An overruled authority blocks them until you record how they address it.
        </Text>
        {authorities.length === 0 ? <Text type="supporting">No authority yet.</Text> : null}
        {authorities.map((a) => {
          const as = assessment(a.id);
          const ts = s.treatments.filter((t) => t.authorityId === a.id);
          return (
            <div key={a.id} className="authority-row" data-testid="authority-row">
              <div>
                <Text weight="semibold">{a.citation}</Text> <Text type="supporting">{a.parties}</Text>
              </div>
              <div className="row-actions">
                <AssessField matterId={props.matterId} authorityId={a.id} field="support" value={as?.support ?? null} status={as?.supportStatus} onDone={() => void load()} />
                <AssessField matterId={props.matterId} authorityId={a.id} field="voice" value={as?.voice ?? null} status={as?.voiceStatus} onDone={() => void load()} />
                <Button label="Record treatment" size="sm" variant="ghost" onClick={() => setForm({ authorityId: a.id, kind: "overruled", byCitation: "", byDate: "", byBench: "", authorityDate: "", authorityBench: "" })} />
              </div>
              {ts.map((t) => (
                <div key={t.id} className="treatment" data-testid="treatment">
                  <Badge variant={t.kind === "overruled" ? "error" : t.kind === "followed" ? "success" : "warning"} label={t.kind.replace(/_/g, " ")} />{" "}
                  <Text>
                    by {t.byCitation}
                    {t.byBench ? ` (bench of ${t.byBench})` : ""}
                    {t.byDate ? `, ${t.byDate}` : ""}
                  </Text>
                </div>
              ))}
              {form?.authorityId === a.id ? (
                <div className="row-actions treatment-form" data-testid="treatment-form">
                  <select aria-label="Treatment" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                    {TREATMENT_VALUES.map((k) => (
                      <option key={k} value={k}>
                        {k.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Treated by (citation)" placeholder="Treated by (citation)" value={form.byCitation} onChange={(e) => setForm({ ...form, byCitation: e.target.value })} />
                  <input aria-label="Its date" type="date" value={form.byDate} onChange={(e) => setForm({ ...form, byDate: e.target.value })} />
                  <input aria-label="Its bench strength" placeholder="Bench" value={form.byBench} onChange={(e) => setForm({ ...form, byBench: e.target.value })} style={{ width: 60 }} />
                  <input aria-label="Date of the authority" type="date" value={form.authorityDate} onChange={(e) => setForm({ ...form, authorityDate: e.target.value })} />
                  <input aria-label="Bench strength of the authority" placeholder="Bench" value={form.authorityBench} onChange={(e) => setForm({ ...form, authorityBench: e.target.value })} style={{ width: 60 }} />
                  <Button
                    label="Save treatment"
                    size="sm"
                    isDisabled={!form.byCitation.trim()}
                    clickAction={async () => {
                      try {
                        setError(null);
                        await api.addTreatment(props.matterId, {
                          authorityId: form.authorityId,
                          kind: form.kind as never,
                          byCitation: form.byCitation,
                          byDate: form.byDate,
                          byBench: Number(form.byBench) || null,
                          authorityDate: form.authorityDate,
                          authorityBench: Number(form.authorityBench) || null,
                        });
                        setForm(null);
                        await load();
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {error ? <div className="notice" role="alert">{error}</div> : null}
      </section>
      <section className="work-section" aria-label="Quick check" data-testid="quick-check">
        <Heading level={3}>Quick check, not verified</Heading>
        <Text type="supporting">Compares each neutral citation with the local judgment index, before any portal lookup. It is not verification: only the validator verifies.</Text>
        <div className="row-actions">
          <Button label="Quick check the citations" size="sm" clickAction={async () => setChecks(await api.quickCheckCitations(props.matterId))} />
        </div>
        {checks ? (
          <ul className="plain-list">
            {checks.map((c) => (
              <li key={c.citation} data-outcome={c.outcome}>
                <Badge variant={c.outcome === "mismatch" || c.outcome === "not_found" ? "warning" : "neutral"} label={`Quick check: ${c.outcome.replace("_", " ")}`} /> <Text weight="semibold">{c.citation}</Text>
                {c.field ? <Text> ({c.field})</Text> : null} <Text type="supporting">{c.detail}</Text>
              </li>
            ))}
            {checks.length === 0 ? (
              <li>
                <Text type="supporting">No neutral citation in the matter.</Text>
              </li>
            ) : null}
          </ul>
        ) : null}
      </section>
      <section className="work-section" aria-label="Bench trends" data-testid="bench-trends">
        <Heading level={3}>Bench trends (advisory)</Heading>
        <Text type="supporting">How the indexed Supreme Court judgments were disposed of, by year. Descriptive figures from the index: no score is computed for this matter, no judge is named, and nothing here enters a draft.</Text>
        <div className="row-actions">
          <Button label="Show the trends" size="sm" variant="ghost" clickAction={async () => setTrends(await api.benchTrends())} />
        </div>
        {trends ? (
          trends.length === 0 ? (
            <Text type="supporting">No Supreme Court year is indexed.</Text>
          ) : (
            <table className="plain">
              <thead>
                <tr><th>Year</th><th>Judgments</th><th>Allowed</th><th>Dismissed</th><th>Disposed of</th><th>Other</th></tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t.year}>
                    <td>{t.year}</td><td>{t.total}</td><td>{pct(t.allowed, t.total)}</td><td>{pct(t.dismissed, t.total)}</td><td>{pct(t.disposed, t.total)}</td><td>{pct(t.other, t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
      </section>
    </>
  );
}

export function RehearsalPart(props: { matterId: string; version: number }) {
  const [s, setS] = useState<StudioState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setS(await api.getStudio(props.matterId)), [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  if (!s) return null;
  const groups: Array<[string, (c: StudioState["challenges"][number]) => boolean]> = [
    ["Bench questions", (c) => c.kind === "bench_question"],
    ["Objections of opposing counsel", (c) => c.kind === "objection" && c.origin === "generated"],
    ["Verified defects", (c) => c.origin === "verified_defect"],
  ];
  return (
    <div className="work-view" data-testid="rehearsal">
      <section className="work-section" aria-label="Admission hearing rehearsal">
        <Heading level={3}>Admission hearing rehearsal</Heading>
        <Text type="supporting">
          The questions the bench is likely to ask and the objections opposing counsel may raise, each with a one-line answer anchored to the record. Unanchored answers are dropped. The register keeps generated challenges, verified defects and the ones you accept apart. No outcome is predicted.
        </Text>
        <div className="row-actions">
          <Button
            label="Prepare the rehearsal"
            size="sm"
            variant="primary"
            isDisabled={busy}
            clickAction={async () => {
              setBusy(true);
              try {
                const r = await api.runRehearsal(props.matterId);
                setNote(`${r.added} anchored item(s); ${r.rejected} dropped.`);
                await load();
              } catch (e) {
                setNote(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          {busy ? <Text type="supporting">Preparing…</Text> : null}
        </div>
        {note ? <div className="notice" role="status">{note}</div> : null}
      </section>
      {groups.map(([title, pick]) => {
        const rows = s.challenges.filter(pick);
        return (
          <section key={title} className="work-section" aria-label={title}>
            <Heading level={4}>
              {title} ({rows.length})
            </Heading>
            {rows.map((c) => (
              <div key={c.id} className="challenge" data-testid="challenge" data-status={c.status}>
                <div>
                  <Badge variant="neutral" label={c.category.replace(/_/g, " ")} /> <Text weight="semibold">{c.text}</Text>
                </div>
                {c.answer ? <Text>Answer: {c.answer}</Text> : null}
                <div className="row-actions">
                  {c.status !== "accepted" ? (
                    <Button label="Accept" size="sm" clickAction={async () => { await api.decideChallenge(props.matterId, c.id, "accepted"); await load(); }} />
                  ) : (
                    <Badge variant="success" label="Accepted" />
                  )}
                  {c.status !== "rejected" ? (
                    <Button label="Reject" size="sm" variant="ghost" clickAction={async () => { await api.decideChallenge(props.matterId, c.id, "rejected"); await load(); }} />
                  ) : (
                    <Badge variant="error" label="Rejected" />
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
