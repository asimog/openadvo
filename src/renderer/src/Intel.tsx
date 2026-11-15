/**
 * Phase 2 in the window (docs/specs/court-adapters.md): the advocate's courts and practice areas,
 * Court Intelligence (adapters, lists built on demand, the pack editor, sources, bench rows), and
 * a matter's court checklist with its format checks and defects. No business logic: every record
 * comes from a bridge function.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { AdapterSummary, DefectRow, DirectoryCourt, FormatCheckResult, MatterChecklist, PackItem, PackList } from "../../shared/api.ts";

const api = window.openadvo;

const clean = (e: unknown) => String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

const STATUS: Record<PackItem["status"], { dot: "success" | "warning" | "neutral" | "accent"; label: string }> = {
  verified: { dot: "success", label: "found in the source" },
  not_found: { dot: "warning", label: "not found in the source: advocate to verify" },
  no_quote: { dot: "neutral", label: "a step, not a rule" },
  advocate_entered: { dot: "accent", label: "advocate-entered" },
};

function useAct() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(clean(e));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, act };
}

/** Search the directory and pick a court. */
function CourtPicker(props: { label: string; onPick: (c: DirectoryCourt) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DirectoryCourt[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    let live = true;
    void api.searchCourts(q).then((r) => live && setHits(r.courts.slice(0, 8)));
    return () => {
      live = false;
    };
  }, [q]);
  return (
    <div className="court-picker">
      <TextInput label={props.label} description="Search by name, seat, bench or state" value={q} onChange={setQ} />
      {hits.length ? (
        <List density="compact" data-testid="court-hits">
          {hits.map((c) => (
            <ListItem key={c.id} label={c.name} description={`${c.seat}${c.benches.length ? `; benches: ${c.benches.join(", ")}` : ""}`} endContent={<Button label="Add" size="sm" variant="ghost" onClick={() => { props.onPick(c); setQ(""); }} />} />
          ))}
        </List>
      ) : null}
    </div>
  );
}

const PRACTICE = ["civil", "criminal", "constitutional", "commercial", "family", "tax", "service", "consumer", "property", "insolvency"];

/** The courts and practice areas that decide what the application prepares. */
export function CourtProfileEditor(props: { onChanged?: () => void }) {
  const [p, setP] = useState<{ courts: string[]; practice: string[] } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const { error, act } = useAct();
  const load = useCallback(async () => {
    const prof = await api.getCourtProfile();
    setP(prof);
    const all = await Promise.all(prof.courts.map(async (id) => [id, (await api.searchCourts(id)).courts.find((c) => c.id === id)?.name ?? id] as const));
    setNames(Object.fromEntries(all));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!p) return null;
  const save = (next: { courts?: string[]; practice?: string[] }) =>
    act(async () => {
      // Show the change at once; the store's answer replaces it.
      setP({ courts: next.courts ?? p.courts, practice: next.practice ?? p.practice });
      await api.setCourtProfile(next);
      await load();
      props.onChanged?.();
    });
  return (
    <div data-testid="court-profile">
      <Heading level={3}>Your courts and practice</Heading>
      <Text type="supporting">These decide which court rules the application prepares. Nothing is downloaded until a list is needed.</Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <div className="chip-row" data-testid="profile-courts">
        {p.courts.length === 0 ? <Text type="supporting">No court yet.</Text> : null}
        {p.courts.map((id) => (
          <span key={id} className="chip">
            {names[id] ?? id}
            <button type="button" aria-label={`Remove ${names[id] ?? id}`} onClick={() => void save({ courts: p.courts.filter((c) => c !== id) })}>×</button>
          </span>
        ))}
      </div>
      <CourtPicker label="Add a court" onPick={(c) => void save({ courts: [...p.courts, c.id] })} />
      <Text weight="semibold">Practice areas</Text>
      <div className="chip-row" data-testid="profile-practice">
        {PRACTICE.map((a) => (
          <label key={a} className="chip-check">
            <input type="checkbox" checked={p.practice.includes(a)} onChange={(e) => void save({ practice: e.target.checked ? [...p.practice, a] : p.practice.filter((x) => x !== a) })} /> {a}
          </label>
        ))}
      </div>
    </div>
  );
}

/** One built list: its items with their anchors and status, and the pack editor (B10). */
export function ListView(props: { list: PackList; onChanged: (l: PackList) => void }) {
  const l = props.list;
  const [editing, setEditing] = useState<number | null | "new">(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const { error, act } = useAct();
  const verified = l.items.filter((i) => i.status === "verified").length;
  return (
    <div className="pack-list" data-testid={`list-${l.key}`}>
      <Text type="supporting">
        Version {l.version}, built {l.builtAt.slice(0, 10)} by {l.adapterId} {l.adapterVersion}. {verified} of {l.items.length} items found in the source.
        {l.freshness ? (l.freshness.state === "stale" ? ` The source is stale since ${l.freshness.since}: checks on it are unconfirmed.` : ` Check the source again by ${l.freshness.since}.`) : ""}
        {l.upgrade ? ` Adapter ${l.upgrade} is available: rebuild to use it.` : ""}
      </Text>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      <ol className="pack-items">
        {l.items.map((i) => (
          <li key={i.id} data-status={i.status} data-testid="pack-item">
            <StatusDot variant={STATUS[i.status].dot} label={STATUS[i.status].label} />
            <span className="pack-item-text">
              <Text>{i.text}</Text>
              <Text type="supporting">
                {[i.ref, i.status === "verified" ? `p. ${i.page}, l. ${i.line}` : null, i.status === "advocate_entered" ? `source: ${i.enteredSource}` : null, STATUS[i.status].label, i.skill ? `skill ${i.skill}` : null].filter(Boolean).join(" · ")}
              </Text>
              {i.found ? (
                <details>
                  <summary>As read in the source</summary>
                  <Text type="supporting">{i.found}</Text>
                </details>
              ) : null}
            </span>
            <Button label="Correct" size="sm" variant="ghost" onClick={() => { setEditing(i.n); setText(i.text); setSource(""); }} />
          </li>
        ))}
      </ol>
      {editing === null ? (
        <Button label="Add an item" size="sm" variant="ghost" onClick={() => { setEditing("new"); setText(""); setSource(""); }} />
      ) : (
        <div className="pack-editor" data-testid="pack-editor">
          <TextInput label={editing === "new" ? "New item" : `Item ${editing}`} value={text} onChange={setText} />
          <TextInput label="Its source" description="The rule, notice or circular, with its date. The item is marked advocate-entered." value={source} onChange={setSource} />
          <div className="row-actions">
            <Button label="Save as a new version" size="sm" isDisabled={!text.trim() || !source.trim()} clickAction={() => act(async () => { props.onChanged(await api.editList(l.id, { n: editing === "new" ? null : editing, text, source })); setEditing(null); })} />
            <Button label="Cancel" size="sm" variant="ghost" onClick={() => setEditing(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof api.courtOverview>>;

/** Court Intelligence: the advocate's courts, their adapters, lists built on demand, sources and bench rows. */
export function CourtIntelligence() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [lists, setLists] = useState<Record<string, PackList>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [bench, setBench] = useState({ date: "", bench: "", judges: "", source: "" });
  const { error, busy, act } = useAct();
  const load = useCallback(async (fresh = false) => {
    setOv(await api.courtOverview());
    setAdapters(await api.listAdapters(fresh));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!ov) return <Text type="supporting">Reading…</Text>;
  const build = (adapterId: string, key: string) =>
    act(async () => {
      try {
        const l = await api.buildList(adapterId, key);
        setLists((m) => ({ ...m, [`${adapterId}:${key}`]: l }));
        setFailed((m) => ({ ...m, [`${adapterId}:${key}`]: "" }));
        setOpen(`${adapterId}:${key}`);
      } catch (e) {
        setFailed((m) => ({ ...m, [`${adapterId}:${key}`]: clean(e) }));
      }
      await load();
    });
  return (
    <div className="court-intel" data-testid="court-intel">
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {ov.length === 0 ? <div className="notice" data-testid="no-courts">Add your courts in your profile. The application prepares the rules of those courts only, and only when needed.</div> : null}
      {ov.map((o) => (
        <section key={o.court.id} className="work-section court-card" data-testid={`court-${o.court.id}`}>
          <Heading level={3}>{o.court.name}</Heading>
          <Text type="supporting">
            {o.court.seat}
            {o.court.benches.length ? `; benches: ${o.court.benches.join(", ")}` : ""}. Appeal route: {o.route.map((r) => r.name).join(" → ")}. {o.court.appealNote ?? ""}
          </Text>
          {o.adapter ? (
            <Text type="supporting">
              Adapter {o.adapter.id} {o.adapter.version} ({o.adapter.tier}). {o.adapter.review}
            </Text>
          ) : (
            <div className="notice">No adapter covers this court yet. Add one below, or enter its rules with their sources.</div>
          )}
          {Object.entries(o.adapter?.general ?? {}).length ? (
            <Text type="supporting">Pages: {Object.entries(o.adapter!.general).map(([k, v]) => `${k} ${v}`).join(" · ")}</Text>
          ) : null}
          <List density="compact">
            {o.lists.map((l) => {
              const id = `${o.adapter!.id}:${l.key}`;
              const built = lists[id] ?? l.built;
              return (
                <ListItem
                  key={l.key}
                  data-testid={`court-list-${l.key}`}
                  startContent={<StatusDot variant={built ? (built.freshness?.state === "stale" || built.upgrade ? "warning" : "success") : "neutral"} label={built ? "Built" : "Not built"} />}
                  label={`${l.title}${l.recommended ? " · recommended for your practice" : ""}`}
                  description={
                    failed[id]
                      ? `Not built: ${failed[id]}`
                      : built
                        ? `${l.kind}, version ${built.version}: ${built.items.filter((i) => i.status === "verified").length} of ${built.items.length} items found in the source${built.freshness?.state === "stale" ? `; stale since ${built.freshness.since}` : ""}${built.upgrade ? `; adapter ${built.upgrade} available` : ""}.`
                        : `${l.kind}; not built. ${l.caseTypes.length ? `Needed for ${l.caseTypes.join(", ")}.` : ""} Building downloads only its source.`
                  }
                  endContent={
                    <span className="row-actions">
                      <Button label={built ? "Rebuild" : "Prepare"} size="sm" variant={built ? "ghost" : "primary"} isDisabled={busy} clickAction={() => build(o.adapter!.id, l.key)} />
                      {failed[id] ? (
                        <Button
                          label="Upload the document"
                          size="sm"
                          variant="ghost"
                          clickAction={() =>
                            act(async () => {
                              const [file] = await api.pickFiles();
                              if (!file) return;
                              await api.uploadSource(o.adapter!.id, l.source, file);
                              await build(o.adapter!.id, l.key);
                            })
                          }
                        />
                      ) : null}
                      {built ? <Button label={open === id ? "Close" : "Open"} size="sm" variant="ghost" onClick={() => { setOpen(open === id ? null : id); if (!lists[id] && built) setLists((m) => ({ ...m, [id]: built })); }} /> : null}
                    </span>
                  }
                />
              );
            })}
          </List>
          {o.lists.map((l) => {
            const id = `${o.adapter?.id}:${l.key}`;
            const built = lists[id] ?? l.built;
            return open === id && built ? <ListView key={id} list={built} onChanged={(n) => { setLists((m) => ({ ...m, [id]: n })); void load(); }} /> : null;
          })}
          {o.proceedings.length ? (
            <>
              <Heading level={4}>Proceeding packs</Heading>
              <List density="compact">
                {o.proceedings.map((p) => (
                  <ListItem key={p.key} label={`${p.title} (${p.caseType})`} description={`${p.provisions.join("; ")}${p.limitation ? `. Limitation: ${p.limitation.days} days from ${p.limitation.from} (${p.limitation.ref ?? ""})` : ""}. Parts: ${p.requiredParts.join(", ")}. Stages: ${p.stages.join(" → ")}.`} />
                ))}
              </List>
            </>
          ) : null}
          <Heading level={4}>Bench rows</Heading>
          <Text type="supporting">For authority research only. Reading rosters from the court's site is not built; enter a row with its source.</Text>
          {o.benches.map((b) => (
            <Text key={b.id} type="supporting">{b.date}: {b.bench} — {b.judges} (source: {b.source})</Text>
          ))}
          <div className="field-grid">
            <TextInput label="Date (YYYY-MM-DD)" value={bench.date} onChange={(v) => setBench({ ...bench, date: v })} />
            <TextInput label="Bench" value={bench.bench} onChange={(v) => setBench({ ...bench, bench: v })} />
            <TextInput label="Judges" value={bench.judges} onChange={(v) => setBench({ ...bench, judges: v })} />
            <TextInput label="Source" value={bench.source} onChange={(v) => setBench({ ...bench, source: v })} />
          </div>
          <Button label="Add the bench row" size="sm" variant="ghost" clickAction={() => act(async () => { await api.addBench({ court: o.court.id, ...bench }); setBench({ date: "", bench: "", judges: "", source: "" }); await load(); })} />
        </section>
      ))}
      <section className="work-section" data-testid="adapters">
        <Heading level={3}>Adapters</Heading>
        <Text type="supporting">An adapter is data: the documents of a court, how to find them, and the quotes that prove each item. Built-in, vendored and your own; the highest version runs.</Text>
        <List density="compact">
          {adapters.map((a) => (
            <ListItem
              key={`${a.tier}:${a.folder}`}
              data-testid={`adapter-${a.id}-${a.tier}`}
              startContent={<StatusDot variant={a.error ? "error" : a.shadowed ? "neutral" : "success"} label={a.error ? "Invalid" : a.shadowed ? "Older version" : "Runs"} />}
              label={`${a.title} ${a.version}`}
              description={a.error ? `Invalid: ${a.error}` : `${a.tier}${a.shadowed ? ", a higher version runs" : ""}. Courts: ${a.courts.join(", ")}. ${a.lists.length} list(s). ${a.folder}`}
              endContent={!a.error && !a.shadowed ? <Button label="Edit a copy" size="sm" variant="ghost" clickAction={() => act(async () => { await api.forkAdapter(a.id); await load(true); })} /> : undefined}
            />
          ))}
        </List>
        <div className="row-actions">
          <Button label="Add an adapter (adapter.json)" size="sm" variant="ghost" clickAction={() => act(async () => { const [file] = await api.pickFiles(); if (file) { await api.addAdapter(file); await load(true); } })} />
          <Button label="Read the adapters again" size="sm" variant="ghost" clickAction={() => act(() => load(true))} />
        </div>
      </section>
    </div>
  );
}

/** A matter's court checklist, format checks and defects (B11 to B14), in Ready to File. */
export function CourtChecklistView(props: { matterId: string; version: number; onChanged: () => void }) {
  const [c, setC] = useState<MatterChecklist | null>(null);
  const [court, setCourt] = useState<DirectoryCourt | null>(null);
  const [caseType, setCaseType] = useState("");
  const [mine, setMine] = useState<DirectoryCourt[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [formats, setFormats] = useState<{ results: FormatCheckResult[]; reason: string | null } | null>(null);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [defectText, setDefectText] = useState("");
  const { error, busy, act } = useAct();
  const load = useCallback(async () => {
    setC(await api.getChecklist(props.matterId));
    setDefects(await api.listDefects(props.matterId));
    const prof = await api.getCourtProfile();
    setMine((await Promise.all(prof.courts.map(async (id) => (await api.searchCourts(id)).courts.find((x) => x.id === id)))).filter((x): x is DirectoryCourt => !!x));
  }, [props.matterId]);
  useEffect(() => {
    void load();
  }, [load, props.version]);
  if (!c) return null;
  const done = c.rows.filter((r) => r.state !== "open").length;
  return (
    <section className="work-section" aria-label="Court checklist" data-testid="court-checklist">
      <Heading level={3}>The court's filing checklist</Heading>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {c.target ? (
        <Text type="supporting" data-testid="filing-target">
          Court {c.target.court}; case type {c.target.caseType}. {c.rows.length ? `${done} of ${c.rows.length} items decided. An open item does not block the filing set; you decide.` : ""}
        </Text>
      ) : null}
      {c.reason ? <div className="notice" data-testid="checklist-reason">{c.reason}</div> : null}
      <div className="field-grid">
        <label className="field">
          Court
          <select data-testid="target-court" value={court?.id ?? c.target?.court ?? ""} onChange={(e) => setCourt(mine.find((m) => m.id === e.target.value) ?? null)}>
            <option value="">Choose one of your courts</option>
            {mine.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <TextInput label="Case type" description="As the court names it, for example SLP(C) or W.P.(C)" value={caseType} onChange={setCaseType} />
      </div>
      <Button
        label={busy ? "Preparing the court's lists…" : "Set the court and case type"}
        size="sm"
        isDisabled={busy || !(court ?? c.target) || !caseType.trim()}
        clickAction={() => act(async () => { setC(await api.setFilingTarget(props.matterId, (court?.id ?? c.target!.court), caseType.trim())); props.onChanged(); })}
      />
      {c.rows.length ? (
        <ol className="pack-items" data-testid="checklist-rows">
          {c.rows.map((r) => (
            <li key={r.item.id} data-state={r.state} data-testid="checklist-row">
              <StatusDot variant={r.state === "done" ? "success" : r.state === "not_applicable" ? "neutral" : "warning"} label={r.state.replace("_", " ")} />
              <span className="pack-item-text">
                <Text>{r.item.text}</Text>
                <Text type="supporting">
                  {[r.listTitle, r.item.ref, r.item.status === "verified" ? `p. ${r.item.page}, l. ${r.item.line}` : STATUS[r.item.status].label, r.state === "not_applicable" ? `not applicable: ${r.note}` : null].filter(Boolean).join(" · ")}
                </Text>
              </span>
              <span className="row-actions">
                {r.state !== "done" ? <Button label="Done" size="sm" clickAction={() => act(async () => { await api.checkItem(props.matterId, r.listId, r.item.id, "done", ""); await load(); props.onChanged(); })} /> : <Button label="Reopen" size="sm" variant="ghost" clickAction={() => act(async () => { await api.checkItem(props.matterId, r.listId, r.item.id, "open", ""); await load(); props.onChanged(); })} />}
                {r.state === "open" ? (
                  <>
                    <input aria-label="Why it does not apply" placeholder="Why it does not apply" value={note[r.item.id] ?? ""} onChange={(e) => setNote({ ...note, [r.item.id]: e.target.value })} />
                    <Button label="Not applicable" size="sm" variant="ghost" isDisabled={!(note[r.item.id] ?? "").trim()} clickAction={() => act(async () => { await api.checkItem(props.matterId, r.listId, r.item.id, "not_applicable", note[r.item.id] ?? ""); await load(); props.onChanged(); })} />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <Heading level={4}>Format checks</Heading>
      <Text type="supporting">The court's PDF rules, checked on each PDF of the newest filing set.</Text>
      <Button label="Run the format checks" size="sm" variant="ghost" clickAction={() => act(async () => setFormats(await api.formatChecks(props.matterId)))} />
      {formats?.reason ? <div className="notice" data-testid="format-reason">{formats.reason}</div> : null}
      {formats?.results.length ? (
        <List density="compact" data-testid="format-results">
          {formats.results.map((r, k) => (
            <ListItem key={k} startContent={<StatusDot variant={r.result === "pass" ? "success" : r.result === "fail" ? "error" : "neutral"} label={r.result} />} label={`${r.title}: ${r.file}`} description={`${r.detail}${r.ref ? ` (${r.ref})` : ""}`} />
          ))}
        </List>
      ) : null}
      <Heading level={4}>Registry defects</Heading>
      <Text type="supporting">Paste the registry's defect list, one defect per line. Each is matched to the court's defect classes and becomes a re-filing item. Drafting the reply is a skill of phase 8.</Text>
      <textarea className="memory-text" rows={4} aria-label="Defect list" value={defectText} onChange={(e) => setDefectText(e.target.value)} />
      <Button label="Record the defects" size="sm" variant="ghost" isDisabled={!defectText.trim()} clickAction={() => act(async () => { setDefects(await api.importDefects(props.matterId, defectText)); setDefectText(""); })} />
      {defects.length ? (
        <List density="compact" data-testid="defects">
          {defects.map((d) => (
            <ListItem
              key={d.id}
              startContent={<StatusDot variant={d.state === "cured" ? "success" : "warning"} label={d.state} />}
              label={d.text}
              description={d.classTitle ? `${d.classTitle}: ${d.step}` : "No defect class of this court matches; decide the step yourself."}
              endContent={<Button label={d.state === "cured" ? "Open again" : "Cured"} size="sm" variant="ghost" clickAction={() => act(async () => setDefects(await api.setDefect(props.matterId, d.id, d.state !== "cured")))} />}
            />
          ))}
        </List>
      ) : null}
    </section>
  );
}
