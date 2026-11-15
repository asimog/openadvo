/**
 * A1 to A5: the setup flow. Five skippable steps, then one Practice Profile page built from the
 * answers. Nothing blocks the chat. Spec: docs/specs/advocate-matters-browser.md section 3.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { AdvocateProfile, LibraryImportResult } from "../../shared/stores.ts";
import { CourtProfileEditor } from "./Intel.tsx";

const api = window.openadvo;

const PRACTICE = ["civil", "criminal", "constitutional", "commercial", "family", "tax", "service", "consumer", "property", "insolvency", "arbitration", "labour"];
const STEPS = ["You", "Your courts", "Your work", "Your past work", "Your existing matters"];

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function Onboarding(props: { onDone: () => void; onOpenBrowser: () => void }) {
  const [profile, setProfile] = useState<AdvocateProfile | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Advocate");
  const [barCouncil, setBarCouncil] = useState("");
  const [enrolment, setEnrolment] = useState("");
  const [enrolmentYear, setEnrolmentYear] = useState("");
  const [chamber, setChamber] = useState("");
  const [practice, setPractice] = useState<string[]>([]);
  const [primary, setPrimary] = useState("");
  const [forum, setForum] = useState("both");
  const [nature, setNature] = useState("both");
  const [library, setLibrary] = useState<LibraryImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await api.getAdvocateProfile();
    setProfile(p);
    setName(p.fields.name ?? "");
    setRole(p.fields.role ?? "Advocate");
    setBarCouncil(p.fields.bar_council ?? "");
    setEnrolmentYear(p.fields.enrolment_year ?? "");
    setChamber(p.fields.chamber_address ?? "");
    try {
      setPractice(JSON.parse(p.fields.practice_areas ?? "[]") as string[]);
    } catch {
      setPractice([]);
    }
    setPrimary(p.fields.primary_practice ?? "");
    setForum(p.fields.forum_level ?? "both");
    setNature(p.fields.matter_nature ?? "both");
    const n = Number(p.fields.onboarding_step ?? "1");
    if (Number.isFinite(n) && n >= 1 && n <= 5) setStep(n);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const setStepField = async (next: number) => {
    await api.setAdvocateProfile("onboarding_step", String(next));
    setStep(next);
  };

  const finish = async () => {
    await api.setAdvocateProfile("onboarding_done", "yes");
    await api.setAdvocateProfile("onboarding_step", "done");
    props.onDone();
  };

  const skip = async () => {
    await api.setAdvocateProfile("onboarding_done", "yes");
    await api.setAdvocateProfile("onboarding_step", "skipped");
    props.onDone();
  };

  const stepOne = () => save(async () => {
    await api.setAdvocateProfile("name", name.trim());
    await api.setAdvocateProfile("role", role.trim());
    await api.setAdvocateProfile("bar_council", barCouncil.trim());
    await api.setAdvocateProfile("chamber_address", chamber.trim());
    if (enrolment.trim()) await api.setAdvocateEnrolment(enrolment.trim(), enrolmentYear.trim());
    else if (enrolmentYear.trim()) await api.setAdvocateProfile("enrolment_year", enrolmentYear.trim());
    await setStepField(2);
  });

  const stepThree = () => save(async () => {
    await api.setAdvocateProfile("practice_areas", JSON.stringify(practice));
    await api.setAdvocateProfile("primary_practice", primary || practice[0] || "");
    await api.setAdvocateProfile("forum_level", forum);
    await api.setAdvocateProfile("matter_nature", nature);
    await api.setCourtProfile({ practice });
    await setStepField(4);
  });

  const importFolder = () => save(async () => {
    setLibrary(await api.libraryImportFolder());
  });
  const importFiles = () => save(async () => {
    setLibrary(await api.libraryImportFiles());
  });

  return (
    <div className="work-scroll">
      <section className="work-section page onboarding" aria-label="Set up your practice" data-testid="onboarding">
        <div className="onboarding-head">
          <div>
            <Heading level={2}>Set up your practice</Heading>
            <Text type="supporting">Five short steps. Every step can be skipped, and the chat stays open. The Practice Profile builds itself from the answers.</Text>
          </div>
          <Button label="Skip for now" size="sm" variant="ghost" clickAction={skip} data-testid="onboarding-skip" />
        </div>
        <ol className="onboarding-steps" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s} data-current={step === i + 1} data-done={step > i + 1}>
              <button type="button" onClick={() => void setStepField(i + 1)}>{i + 1}. {s}</button>
            </li>
          ))}
        </ol>
        {error ? <div className="notice" role="alert">{error}</div> : null}

        {step === 1 ? (
          <section className="onboarding-card" data-testid="onboarding-you">
            <Heading level={3}>You</Heading>
            <TextInput label="Name" value={name} onChange={setName} hasAutoFocus />
            <label className="field">Role
              <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                {["Advocate", "Advocate-on-Record", "Senior Advocate", "Junior in a chamber"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <TextInput label="State Bar Council" value={barCouncil} onChange={setBarCouncil} />
            <div className="onboarding-row">
              <TextInput label="Enrolment number (optional)" description="Stored encrypted; the profile shows only the last four digits." value={enrolment} onChange={setEnrolment} />
              <TextInput label="Year" value={enrolmentYear} onChange={setEnrolmentYear} />
            </div>
            <TextInput label="Chamber address" value={chamber} onChange={setChamber} />
            <div className="row-actions">
              <Button label="Save and continue" size="sm" isDisabled={busy || !name.trim()} clickAction={stepOne} data-testid="onboarding-you-next" />
              <Button label="Skip this step" size="sm" variant="ghost" clickAction={() => void setStepField(2)} />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-card" data-testid="onboarding-courts">
            <Heading level={3}>Your courts</Heading>
            <CourtProfileEditor />
            <div className="row-actions">
              <Button label="Continue" size="sm" clickAction={() => void setStepField(3)} data-testid="onboarding-courts-next" />
              <Button label="Skip this step" size="sm" variant="ghost" clickAction={() => void setStepField(3)} />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-card" data-testid="onboarding-work">
            <Heading level={3}>Your work</Heading>
            <Text weight="semibold">Practice areas</Text>
            <div className="chip-row">
              {PRACTICE.map((a) => (
                <label key={a} className="chip-check">
                  <input type="checkbox" checked={practice.includes(a)} onChange={(e) => setPractice((p) => (e.target.checked ? [...p, a] : p.filter((x) => x !== a)))} /> {a}
                </label>
              ))}
            </div>
            <label className="field">Primary practice area
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
            <div className="row-actions">
              <Button label="Save and continue" size="sm" isDisabled={busy || practice.length === 0} clickAction={stepThree} data-testid="onboarding-work-next" />
              <Button label="Skip this step" size="sm" variant="ghost" clickAction={() => void setStepField(4)} />
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-card" data-testid="onboarding-library">
            <Heading level={3}>Your past work</Heading>
            <Text type="supporting">A folder of judgments, pleadings, templates, written submissions and notes goes into the Knowledge Library with the status unreviewed. You can correct each item later.</Text>
            <div className="row-actions">
              <Button label="Import a folder" size="sm" clickAction={importFolder} data-testid="onboarding-import-folder" />
              <Button label="Import files" size="sm" variant="ghost" clickAction={importFiles} data-testid="onboarding-import-files" />
              <Button label="Continue" size="sm" variant="ghost" clickAction={() => void setStepField(5)} data-testid="onboarding-library-next" />
              <Button label="Skip this step" size="sm" variant="ghost" clickAction={() => void setStepField(5)} />
            </div>
            {library ? <div className="notice" role="status">{library.added} added, {library.duplicates} already in the library{library.refused.length ? `, ${library.refused.length} refused` : ""}.</div> : null}
          </section>
        ) : null}

        {step === 5 ? (
          <section className="onboarding-card" data-testid="onboarding-matters">
            <Heading level={3}>Your existing matters</Heading>
            <Text>Sign in to eCourts, the Delhi High Court or the Supreme Court portal in the browser. Open your case list there. The agent reads the page and proposes one matter per case, with its CNR, court, parties, stage and next date. You choose which to create.</Text>
            <div className="row-actions">
              <Button label="Open the browser" size="sm" clickAction={props.onOpenBrowser} data-testid="onboarding-browser" />
              <Button label="Finish setup" size="sm" variant="ghost" clickAction={finish} data-testid="onboarding-finish" />
              <Button label="Do this later" size="sm" variant="ghost" clickAction={skip} />
            </div>
          </section>
        ) : null}
        {profile ? <Text type="supporting">The profile is kept in advocate.db on this computer.</Text> : null}
      </section>
    </div>
  );
}
