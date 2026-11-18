/**
 * C2, W4: add an existing matter from a folder, a CNR, an email or the chat. The advocate
 * confirms each creation; nothing is created from a model's suggestion alone.
 * Spec: docs/specs/advocate-matters-browser.md section 6.
 */
import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { MatterSummary, StorageFolder } from "../../shared/api.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function IntakeDialog(props: { isOpen: boolean; onOpenChange: (open: boolean) => void; onCreated: (matter: MatterSummary) => void }) {
  const [cnr, setCnr] = useState("");
  const [court, setCourt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageFolder[]>([]);
  useEffect(() => {
    void api.storageFolders().then(setStorage, () => setStorage([]));
  }, []);

  const run = async (fn: () => Promise<MatterSummary | null>) => {
    setBusy(true);
    setError(null);
    try {
      const m = await fn();
      if (m) {
        props.onCreated(m);
        props.onOpenChange(false);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog isOpen={props.isOpen} onOpenChange={props.onOpenChange} purpose="form" width={560} padding={4}>
      <DialogHeader title="Add an existing matter" onOpenChange={props.onOpenChange} />
      <div className="intake" data-testid="intake-dialog">
        <Text type="supporting">The agent proposes the fields; you confirm. Nothing is downloaded from a court portal until you sign in there.</Text>
        {error ? <div className="notice" role="alert">{error}</div> : null}
        <section className="intake-row">
          <div>
            <Text weight="semibold">From a folder</Text>
            <Text type="supporting">Every paper in the folder goes into the matter. The folder name becomes the title; correct it after.</Text>
          </div>
          <Button label="Choose a folder" size="sm" isDisabled={busy} clickAction={() => run(async () => (await api.intakeFolder())?.matter ?? null)} data-testid="intake-folder" />
        </section>
        <section className="intake-row intake-cnr">
          <div>
            <Text weight="semibold">From a CNR</Text>
            <Text type="supporting">The matter starts with the CNR and the court. Sign in to eCourts or the court portal in the browser to read the stage and the next date.</Text>
            <div className="onboarding-row">
              <TextInput label="CNR" value={cnr} onChange={setCnr} />
              <TextInput label="Court" value={court} onChange={setCourt} />
            </div>
          </div>
          <Button label="Create from CNR" size="sm" isDisabled={busy || !cnr.trim()} clickAction={() => run(async () => api.intakeCnr(cnr, court))} data-testid="intake-cnr" />
        </section>
        <section className="intake-row">
          <div>
            <Text weight="semibold">From an email</Text>
            <Text type="supporting">A saved EML message. The message and its attachments become sources, and the thread is kept.</Text>
          </div>
          <Button label="Choose an email" size="sm" isDisabled={busy} clickAction={() => run(async () => (await api.intakeEmail())?.matter ?? null)} data-testid="intake-email" />
        </section>
        {storage.filter((s) => s.exists).map((s) => (
          <section key={s.provider} className="intake-row">
            <div>
              <Text weight="semibold">From {s.provider === "onedrive" ? "OneDrive" : "Google Drive"}</Text>
              <Text type="supporting">A folder inside the synced folder. The provider is kept on every source. Sign in to the provider in its own application; Open Advocate holds no cloud credential.</Text>
            </div>
            <Button label={`Choose from ${s.provider === "onedrive" ? "OneDrive" : "Google Drive"}`} size="sm" isDisabled={busy} clickAction={() => run(async () => (await api.intakeStorage(s.provider))?.matter ?? null)} data-testid={`intake-${s.provider}`} />
          </section>
        ))}
        <section className="intake-row">
          <div>
            <Text weight="semibold">From the chat</Text>
            <Text type="supporting">Open the matter and tell the agent what you know. It proposes the fields and sources; you confirm them on the Matter tab.</Text>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
