/**
 * V5-19 to V5-25 views (docs/specs/v5.md): hearings, reminders, confidentiality and budget,
 * parties and contacts, the questions document, the docket, and diagnostics.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import type { Contact, Hearing, Reminder } from "../../shared/api.ts";
import { dmy } from "../../shared/dates.ts";

const api = window.openadvo;

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

// ---- The Matter tab: practice ----

export function PracticeSection(props: { matterId: string; version: number }) {
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [policy, setPolicy] = useState<Awaited<ReturnType<typeof api.getPolicy>> | null>(null);
  const [parties, setParties] = useState<Awaited<ReturnType<typeof api.listParties>>>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [h, setH] = useState({ date: "", bench: "", directions: "", nextDate: "", nextDateStatus: "confirmed" as "confirmed" | "inferred" });
  const [r, setR] = useState({ text: "", dueAt: "" });
  const [party, setParty] = useState({ contactId: "", role: "petitioner", nameInRecord: "" });
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    setHearings(await api.listHearings(props.matterId));
    setReminders(await api.listReminders(props.matterId));
    const p = await api.getPolicy(props.matterId);
    setPolicy(p);
    setBudget(p.budgetTokens ? String(p.budgetTokens) : "");
    setParties(await api.listParties(props.matterId));
    setContacts(await api.listContacts());
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  const act = async (fn: () => Promise<unknown>, after?: string) => {
    try {
      setNote(null);
      await fn();
      if (after) setNote(after);
      await load();
    } catch (e) {
      setNote(errorText(e));
    }
  };
  return (
    <>
      <section className="work-section" aria-label="Hearings" data-testid="hearings">
        <Heading level={3}>Hearings</Heading>
        <Text type="supporting">What happened at each hearing, and the next date. A confirmed date is kept apart from an inferred one.</Text>
        <ul className="plain-list">
          {hearings.map((x) => (
            <li key={x.id}>
              <Text weight="semibold">{dmy(x.date)}</Text> {x.bench ? <Text>({x.bench})</Text> : null} <Text>{x.directions}</Text>{" "}
              {x.nextDate ? <Badge variant={x.nextDateStatus === "confirmed" ? "success" : "warning"} label={`Next: ${dmy(x.nextDate)} (${x.nextDateStatus})`} /> : null}
            </li>
          ))}
          {hearings.length === 0 ? <li><Text type="supporting">No hearing recorded.</Text></li> : null}
        </ul>
        <div className="row-actions practice-form">
          <input type="date" aria-label="Hearing date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
          <input aria-label="Bench" placeholder="Bench" value={h.bench} onChange={(e) => setH({ ...h, bench: e.target.value })} />
          <input aria-label="Directions" placeholder="Directions given" className="grow" value={h.directions} onChange={(e) => setH({ ...h, directions: e.target.value })} />
          <input type="date" aria-label="Next date" value={h.nextDate} onChange={(e) => setH({ ...h, nextDate: e.target.value })} />
          <select aria-label="Next date is" value={h.nextDateStatus} onChange={(e) => setH({ ...h, nextDateStatus: e.target.value as "confirmed" | "inferred" })}>
            <option value="confirmed">confirmed</option>
            <option value="inferred">inferred</option>
          </select>
          <Button label="Record hearing" size="sm" isDisabled={!h.date} clickAction={() => act(() => api.addHearing(props.matterId, h)).then(() => setH({ date: "", bench: "", directions: "", nextDate: "", nextDateStatus: "confirmed" }))} />
        </div>
      </section>
      <section className="work-section" aria-label="Reminders" data-testid="reminders">
        <Heading level={3}>Reminders</Heading>
        <ul className="plain-list">
          {reminders.filter((x) => x.status !== "done").map((x) => (
            <li key={x.id} data-status={x.status}>
              <Text>{new Date(x.dueAt).toLocaleString()}: {x.text}</Text> {x.status === "notified" ? <Badge variant="warning" label="Due" /> : null}{" "}
              <Button label="Done" size="sm" variant="ghost" clickAction={() => act(() => api.doneReminder(props.matterId, x.id))} />
            </li>
          ))}
        </ul>
        <div className="row-actions practice-form">
          <input aria-label="Reminder" placeholder="For example: file the rejoinder" className="grow" value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} />
          <input type="datetime-local" aria-label="Remind at" value={r.dueAt} onChange={(e) => setR({ ...r, dueAt: e.target.value })} />
          <Button label="Add reminder" size="sm" isDisabled={!r.text.trim() || !r.dueAt} clickAction={() => act(() => api.addReminder(props.matterId, r.text, new Date(r.dueAt).toISOString())).then(() => setR({ text: "", dueAt: "" }))} />
        </div>
      </section>
      <section className="work-section" aria-label="Parties" data-testid="parties">
        <Heading level={3}>Parties</Heading>
        <ul className="plain-list">
          {parties.map((p) => (
            <li key={p.id}><Text weight="semibold">{p.contact?.name ?? "(contact removed)"}</Text> <Text>as {p.role}</Text>{p.nameInRecord ? <Text type="supporting"> (in the record: {p.nameInRecord})</Text> : null}</li>
          ))}
        </ul>
        <div className="row-actions practice-form">
          <select aria-label="Contact" value={party.contactId} onChange={(e) => setParty({ ...party, contactId: e.target.value })}>
            <option value="">Choose a contact</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind.replace("_", " ")})</option>)}
          </select>
          <select aria-label="Role" value={party.role} onChange={(e) => setParty({ ...party, role: e.target.value })}>
            {["petitioner", "respondent", "client", "opposing counsel", "other"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input aria-label="Name as in the record" placeholder="Name as it appears in the record" value={party.nameInRecord} onChange={(e) => setParty({ ...party, nameInRecord: e.target.value })} />
          <Button label="Link party" size="sm" isDisabled={!party.contactId} clickAction={() => act(() => api.addParty(props.matterId, party.contactId, party.role, party.nameInRecord))} />
        </div>
        {contacts.length === 0 ? <Text type="supporting">No contacts yet. Add them in Settings.</Text> : null}
      </section>
      <section className="work-section" aria-label="Confidentiality and budget" data-testid="policy">
        <Heading level={3}>Confidentiality and the agent's budget</Heading>
        {policy ? (
          <>
            <label className="radio">
              <input type="checkbox" checked={policy.confidential} onChange={(e) => void act(() => api.setPolicy(props.matterId, { confidential: e.target.checked, budgetTokens: policy.budgetTokens }))} /> Confidential: the matter's text goes only to a model on this computer, and web search is off
            </label>
            <div className="row-actions practice-form">
              <input aria-label="Token budget" placeholder="Token budget (empty: none)" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <Button label="Set budget" size="sm" variant="ghost" clickAction={() => act(() => api.setPolicy(props.matterId, { confidential: policy.confidential, budgetTokens: budget.trim() ? Number(budget) : null }))} />
            </div>
            <Text type="supporting" data-testid="usage">
              The agent has used {policy.usage.tokens.toLocaleString()} tokens in {policy.usage.runs} run(s), cost {policy.usage.cost.toFixed(4)} as the provider reports it{policy.budgetTokens ? `, of a budget of ${policy.budgetTokens.toLocaleString()}` : ""}.
            </Text>
          </>
        ) : null}
      </section>
      <section className="work-section" aria-label="Questions for instructions">
        <Heading level={3}>Questions for instructions</Heading>
        <Text type="supporting">A Word document of what the matter still needs answered, from its records: missing details, dates to confirm, readings to decide, open items and the open questions of accepted arguments.</Text>
        <div className="row-actions">
          <Button label="Make the questions document" size="sm" clickAction={() => act(async () => { const q = await api.generateQuestions(props.matterId); setNote(`${q.questions} question(s) in ${q.file}.`); })} />
        </div>
      </section>
      {note ? <div className="notice" role="status" data-testid="practice-note">{note}</div> : null}
    </>
  );
}

// ---- The home page: the docket ----

export function Docket(props: { onOpen: (matterId: string) => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getDocket>> | null>(null);
  useEffect(() => {
    void api.getDocket().then(setRows, () => setRows([]));
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <section className="docket" aria-label="Docket" data-testid="docket">
      <Heading level={3}>Docket</Heading>
      <table className="plain">
        <thead><tr><th>Matter</th><th>Stage and next step</th><th>Next hearing</th><th>Limitation</th><th>Open items</th><th>Reminders</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.matterId}>
              <td><a href="#" className="link" onClick={(e) => { e.preventDefault(); props.onOpen(r.matterId); }}>{r.title}</a></td>
              <td><Text weight="semibold">{r.stage}</Text>{r.next ? <Text type="supporting"> {r.next}</Text> : null}</td>
              <td>{r.nextHearing ? `${dmy(r.nextHearing.date)} (${r.nextHearing.status})` : "—"}</td>
              <td>{r.limitation ? dmy(r.limitation.slice(0, 10)) + r.limitation.slice(10) : "—"}</td>
              <td>{r.openItems}</td>
              <td>{r.reminders.map((x) => <div key={x.id}>{new Date(x.dueAt).toLocaleDateString()}: {x.text}{x.status === "notified" ? " (due)" : ""}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Settings: contacts and diagnostics ----

export function ContactsSettings() {
  const [list, setList] = useState<Contact[]>([]);
  const [c, setC] = useState({ name: "", kind: "client", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.listContacts().then(setList);
  }, []);
  return (
    <div data-testid="contacts">
      <ul className="plain-list">
        {list.map((x) => (
          <li key={x.id}><Text weight="semibold">{x.name}</Text> <Text type="supporting">{x.kind.replace("_", " ")}{x.email ? `, ${x.email}` : ""}{x.phone ? `, ${x.phone}` : ""}</Text> <Button label="Remove" size="sm" variant="ghost" clickAction={async () => setList(await api.removeContact(x.id))} /></li>
        ))}
        {list.length === 0 ? <li><Text type="supporting">No contacts.</Text></li> : null}
      </ul>
      <div className="row-actions practice-form">
        <input aria-label="Contact name" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        <select aria-label="Contact kind" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}>
          {["client", "opposing_party", "advocate", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
        </select>
        <input aria-label="Email" placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
        <input aria-label="Phone" placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        <Button label="Add contact" size="sm" isDisabled={!c.name.trim()} clickAction={async () => { try { setError(null); await api.addContact(c); setList(await api.listContacts()); setC({ name: "", kind: "client", email: "", phone: "" }); } catch (e) { setError(errorText(e)); } }} />
      </div>
      {error ? <div className="notice" role="alert">{error}</div> : null}
    </div>
  );
}

export function DiagnosticsSettings() {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewDiagnostics>> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div data-testid="diagnostics">
      <Text type="supporting">A diagnostics file is made only when you ask. See exactly what it holds before you save it; nothing is sent anywhere. Crashes write a local dump in the settings folder.</Text>
      <div className="row-actions">
        <Button label="Show what the diagnostics file holds" size="sm" variant="ghost" clickAction={async () => setPreview(await api.previewDiagnostics())} />
        {preview ? <Button label="Save the diagnostics file" size="sm" clickAction={async () => { const r = await api.writeDiagnostics(); if (r) setNote(`Saved ${r.path} (${r.bytes} bytes).`); }} /> : null}
      </div>
      {preview ? (
        <ul className="plain-list" data-testid="diagnostics-preview">
          {preview.map((e) => <li key={e.name}><span className="mono">{e.name}</span> <Text type="supporting">({e.bytes} bytes): {e.description}</Text></li>)}
        </ul>
      ) : null}
      {note ? <Text type="supporting">{note}</Text> : null}
    </div>
  );
}
