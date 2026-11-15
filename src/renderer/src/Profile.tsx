/**
 * A2 and A6: the advocate profile and the automatic Practice Profile. The page is built from the
 * onboarding answers, the court map, the sources, the skills and the Knowledge Library; the
 * advocate corrects any field. Spec: docs/specs/advocate-matters-browser.md section 3.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { IntelSource, LibraryItem, MemoryRecord, PreferenceRecord, RoleSummary, SkillSummary } from "../../shared/api.ts";
import type { AdvocateProfile, Freshness } from "../../shared/stores.ts";
import { CourtProfileEditor } from "./Intel.tsx";

const api = window.openadvo;

const PRACTICE = ["civil", "criminal", "constitutional", "commercial", "family", "tax", "service", "consumer", "property", "insolvency", "arbitration", "labour"];

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function Section(props: { title: string; description?: string; testId?: string; children: ReactNode }) {
  return (
    <section className="profile-map-section" data-testid={props.testId}>
      <Heading level={3}>{props.title}</Heading>
      {props.description ? <Text type="supporting">{props.description}</Text> : null}
      {props.children}
    </section>
  );
}

function parseList(value: string | undefined): string[] {
  try {
    const v = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return (value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  }
}

export function ProfilePage(props: { onChanged: () => void; onOnboarding?: () => void }) {
  const [profile, setProfile] = useState<AdvocateProfile | null>(null);
  const [prefs, setPrefs] = useState<PreferenceRecord[]>([]);
  const [memory, setMemory] = useState<MemoryRecord[]>([]);
  const [courts, setCourts] = useState<Awaited<ReturnType<typeof api.courtOverview>>>([]);
  const [sources, setSources] = useState<Array<IntelSource & { freshness: Freshness }>>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [skills, setSkills] = useState<{ skills: SkillSummary[]; roles: RoleSummary[]; folders: { builtIn: string; advocate: string } } | null>(null);
  const [enrolmentState, setEnrolmentState] = useState<{ stored: boolean; last4: string | null }>({ stored: false, last4: null });
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [barCouncil, setBarCouncil] = useState("");
  const [chamber, setChamber] = useState("");
  const [enrolmentYear, setEnrolmentYear] = useState("");
  const [enrolmentNumber, setEnrolmentNumber] = useState("");
  const [practice, setPractice] = useState<string[]>([]);
  const [primary, setPrimary] = useState("");
  const [forum, setForum] = useState("both");
  const [nature, setNature] = useState("both");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const p = await api.getAdvocateProfile();
      setProfile(p);
      setName(p.fields.name ?? "");
      setRole(p.fields.role ?? "");
      setBarCouncil(p.fields.bar_council ?? "");
      setChamber(p.fields.chamber_address ?? "");
      setEnrolmentYear(p.fields.enrolment_year ?? "");
      setPractice(parseList(p.fields.practice_areas));
      setPrimary(p.fields.primary_practice ?? "");
      setForum(p.fields.forum_level ?? "both");
      setNature(p.fields.matter_nature ?? "both");
      setEnrolmentState(await api.advocateEnrolmentState());
      const [prefs, memory, courts, sources, library, skills] = await Promise.all([
        api.listPreferences().catch(() => []),
        api.listAdvocateMemory().catch(() => []),
        api.courtOverview().catch(() => []),
        api.listIntelSources().catch(() => []),
        api.libraryList().catch(() => []),
        api.listSkills().catch(() => null),
      ]);
      setPrefs(prefs);
      setMemory(memory);
      setCourts(courts);
      setSources(sources);
      setLibrary(library);
      setSkills(skills);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      setError(null);
      await api.setAdvocateProfile("name", name);
      await api.setAdvocateProfile("role", role);
      await api.setAdvocateProfile("bar_council", barCouncil);
      await api.setAdvocateProfile("chamber_address", chamber);
      await api.setAdvocateProfile("enrolment_year", enrolmentYear);
      await api.setAdvocateProfile("practice_areas", JSON.stringify(practice));
      await api.setAdvocateProfile("primary_practice", primary || practice[0] || "");
      await api.setAdvocateProfile("forum_level", forum);
      await api.setAdvocateProfile("matter_nature", nature);
      await api.setCourtProfile({ practice });
      if (enrolmentNumber.trim()) {
        setEnrolmentState(await api.setAdvocateEnrolment(enrolmentNumber.trim(), enrolmentYear));
        setEnrolmentNumber("");
      }
      await load();
      props.onChanged();
      setNote("The profile is saved.");
    } catch (e) {
      setError(errorText(e));
    }
  };

  const statutory = [...new Set(courts.flatMap((c) => c.proceedings.flatMap((p) => p.provisions)))].sort();
  const builtLists = courts.flatMap((c) => c.lists.filter((l) => l.built).map((l) => ({ court: c.court.name, list: l })));

  return (
    <div className="work-scroll">
      <section className="work-section page" aria-label="Advocate profile" data-testid="profile-page">
        <div className="onboarding-head">
          <div>
            <Heading level={2}>{profile?.name || "Advocate profile"}</Heading>
            <Text type="supporting">What is about you and your practice, kept in advocate.db on this computer. The Practice Profile below is built from your answers, the courts, the sources, the skills and the library. Correct any field; you never fill it in from scratch.</Text>
          </div>
          {props.onOnboarding ? <Button label="Setup steps" size="sm" variant="ghost" onClick={props.onOnboarding} data-testid="profile-onboarding" /> : null}
        </div>
        {error ? <div className="notice" role="alert">{error}</div> : null}
        {note ? <div className="notice" role="status">{note}</div> : null}

        <Section title="Identity" description="Your name, role and enrolment. The enrolment number is encrypted." testId="profile-identity">
          <div className="field-grid">
            <TextInput label="Name" value={name} onChange={setName} />
            <label className="field">Role
              <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                {["Advocate", "Advocate-on-Record", "Senior Advocate", "Junior in a chamber"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">State Bar Council<input value={barCouncil} onChange={(e) => setBarCouncil(e.target.value)} /></label>
            <label className="field">Chamber address<input value={chamber} onChange={(e) => setChamber(e.target.value)} /></label>
            <label className="field">Enrolment year<input value={enrolmentYear} onChange={(e) => setEnrolmentYear(e.target.value)} /></label>
            <label className="field">
              Enrolment number
              <input type="password" value={enrolmentNumber} onChange={(e) => setEnrolmentNumber(e.target.value)} placeholder={enrolmentState.stored ? `Stored, ending ${enrolmentState.last4 ?? "----"}` : "Not stored"} />
            </label>
          </div>
          <div className="row-actions">
            <Button label="Save the profile" size="sm" clickAction={save} data-testid="profile-save" />
            {enrolmentState.stored ? <Button label="Remove the enrolment number" size="sm" variant="ghost" clickAction={async () => { setEnrolmentState(await api.clearAdvocateEnrolment()); }} /> : null}
            <Text type="supporting">{enrolmentState.stored ? `Stored and encrypted, ending ${enrolmentState.last4 ?? "----"}.` : "No enrolment number is stored."}</Text>
          </div>
          <CourtProfileEditor onChanged={load} />
        </Section>

        <Section title="Practice map" description="The practice areas, the forum and the nature of the matters. These decide the packs and the skills the application recommends." testId="profile-practice-map">
          <div className="chip-row">
            {PRACTICE.map((a) => (
              <label key={a} className="chip-check"><input type="checkbox" checked={practice.includes(a)} onChange={(e) => setPractice((p) => (e.target.checked ? [...p, a] : p.filter((x) => x !== a)))} /> {a}</label>
            ))}
          </div>
          <div className="field-grid">
            <label className="field">Primary practice
              <select aria-label="Primary practice area" value={primary} onChange={(e) => setPrimary(e.target.value)}>
                <option value="">Choose later</option>
                {practice.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="field">Forum
              <select aria-label="Forum" value={forum} onChange={(e) => setForum(e.target.value)}>
                <option value="both">Trial and appellate</option>
                <option value="trial">Trial</option>
                <option value="appellate">Appellate</option>
              </select>
            </label>
            <label className="field">Matters
              <select aria-label="Matter nature" value={nature} onChange={(e) => setNature(e.target.value)}>
                <option value="both">Civil and criminal</option>
                <option value="civil">Civil</option>
                <option value="criminal">Criminal</option>
              </select>
            </label>
          </div>
          <Text type="supporting">{practice.length ? `Enabled packs: ${practice.join(", ")}.` : "No practice area is chosen yet."}</Text>
        </Section>

        <Section title="Court map" description="The courts you chose, the adapter that prepares their rules, and the lists that are built. Nothing is downloaded until a list is needed." testId="profile-court-map">
          {courts.length === 0 ? <Text type="supporting">No court is chosen. Add one above.</Text> : (
            <List density="compact">
              {courts.map((c) => (
                <ListItem
                  key={c.court.id}
                  startContent={<StatusDot variant={c.adapter?.error ? "error" : c.adapter ? "success" : "neutral"} label={c.adapter?.error ? "Adapter error" : c.adapter ? "Adapter ready" : "No adapter"} />}
                  label={c.court.name}
                  description={`${c.adapter ? `${c.adapter.title} v${c.adapter.version} (${c.adapter.tier})` : "No adapter yet"}. ${c.lists.filter((l) => l.built).length} of ${c.lists.length} lists built.${c.proceedings.length ? ` Proceedings: ${c.proceedings.map((p) => p.title).join(", ")}.` : ""}`}
                />
              ))}
            </List>
          )}
          {builtLists.length ? <Text type="supporting">{builtLists.map((x) => `${x.court}: ${x.list.title} (${x.list.built?.freshness?.state ?? "fresh"})`).join("; ")}.</Text> : null}
        </Section>

        <Section title="Sources plan" description="The official sources the application will read, and how it gets each one." testId="profile-sources">
          {sources.length === 0 ? <Text type="supporting">No source is recorded yet.</Text> : (
            <List density="compact">
              {sources.map((s) => (
                <ListItem key={s.id} startContent={<StatusDot variant={s.freshness.state === "fresh" ? "success" : "warning"} label={s.freshness.state} />} label={`${s.name} v${s.version}`} description={`${s.owner} · ${s.accessMethod.replace(/_/g, " ")} · retrieved ${s.retrievedAt.slice(0, 10)}`} />
              ))}
            </List>
          )}
        </Section>

        <Section title="Statutory map" description="The main provisions of the proceedings in the chosen court packs. A version is shown only when a source records it." testId="profile-statutory-map">
          {statutory.length === 0 ? <Text type="supporting">No provision is recorded in the chosen packs yet.</Text> : <div className="chip-row">{statutory.map((p) => <span key={p} className="chip">{p}</span>)}</div>}
        </Section>

        <Section title="Skills" description="The skills and workflows recommended for these courts and practice areas." testId="profile-skills">
          {skills ? (
            <List density="compact">
              {skills.skills.map((s) => (
                <ListItem key={`${s.id}:${s.version}:${s.file}`} label={`${s.id} ${s.title} v${s.version}`} description={`${s.description} Role ${s.role}.`} startContent={<StatusDot variant={s.error ? "error" : "success"} label={s.error ? "Cannot run" : "Ready"} />} />
              ))}
            </List>
          ) : <Text type="supporting">The skill registry could not be read.</Text>}
        </Section>

        <Section title="Library" description="The imported work, by kind and precedent status." testId="profile-library">
          {library.length === 0 ? <Text type="supporting">No item yet. Import a folder in the setup steps or on the Knowledge page.</Text> : (
            <Text>{library.length} item{library.length === 1 ? "" : "s"}: {Object.entries(library.reduce<Record<string, number>>((acc, i) => { acc[i.kind] = (acc[i.kind] ?? 0) + 1; return acc; }, {})).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}. Status: {Object.entries(library.reduce<Record<string, number>>((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {})).map(([k, n]) => `${n} ${k}`).join(", ")}.</Text>
          )}
        </Section>

        <Section title="Preferences" description="Each preference is proposed after you make the same correction twice. You approve each one." testId="profile-preferences">
          {prefs.length === 0 ? <Text type="supporting">No preference yet.</Text> : (
            <List density="compact">
              {prefs.map((p) => (
                <ListItem key={p.id} label={`${p.key}: ${p.value}`} description={`${p.status}. Applied because ${p.reason}.`} endContent={p.status === "proposed" ? (
                  <span className="row-actions">
                    <Button label="Approve" size="sm" clickAction={async () => { await api.decidePreference(p.id, "approved"); await load(); }} />
                    <Button label="Reject" size="sm" variant="ghost" clickAction={async () => { await api.decidePreference(p.id, "rejected"); await load(); }} />
                  </span>
                ) : undefined} />
              ))}
            </List>
          )}
        </Section>

        <Section title="Advocate memory" description="Confirmed records, proposals and history. Facts never cross from one matter to another." testId="profile-memory">
          {memory.length === 0 ? <Text type="supporting">No record yet.</Text> : (
            <List density="compact">
              {memory.map((m) => (
                <ListItem key={m.memoryId} label={`${m.subject} ${m.relation} ${m.object}`} description={`${m.type.replace(/_/g, " ")} · ${m.status} · proposed by the ${m.proposedBy} on ${m.recordedAt.slice(0, 10)}${m.supersedes ? " · corrects an earlier record" : ""}`} endContent={m.status === "proposed" ? (
                  <span className="row-actions">
                    <Button label="Confirm" size="sm" clickAction={async () => { await api.decideAdvocateMemory(m.memoryId, "confirmed"); await load(); }} />
                    <Button label="Reject" size="sm" variant="ghost" clickAction={async () => { await api.decideAdvocateMemory(m.memoryId, "rejected"); await load(); }} />
                  </span>
                ) : undefined} />
              ))}
            </List>
          )}
        </Section>

        <Section title="Team" description="Juniors, clerks and counsel of the chamber come in phase 12." testId="profile-team">
          <Text type="supporting">Phase 12.</Text>
        </Section>
      </section>
    </div>
  );
}
