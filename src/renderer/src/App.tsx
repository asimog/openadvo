import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Icon } from "@astryxdesign/core/Icon";
import { SideNavCollapseButton } from "@astryxdesign/core/SideNav";
import { ScaleIcon } from "@heroicons/react/24/outline";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { AppNav } from "./AppNav.tsx";
import { ChatDock } from "./ChatDock.tsx";
import { Landing, type Carry } from "./Landing.tsx";
import { NotebookView, type SourceLink } from "./Notebook.tsx";
import { DraftsSection } from "./Drafts.tsx";
import { DraftView } from "./DraftView.tsx";
import { FilingView, MatterDetailsForm, ResearchView } from "./Work.tsx";
import { ArchivedMatters, MatterAdmin, MemoryEditor, RecordTableView } from "./V1.tsx";
import { CommandBar, MatterProgress, ReviewInbox, SettingsPage, tabName, type Command } from "./V3.tsx";
import { MailboxAccount } from "./Work.tsx";
import { ResearchSourceSettings, StudioView } from "./Studio.tsx";
import { DateAnchorForm, DisputeDecision, EntitiesView, FilesAndJobs, Inspector, RecordIntegrity, inspect } from "./V5.tsx";
import { EventTable, SourceDetail, SourcesPanel } from "./Sources.tsx";
import type {
  AddFileResult,
  DraftRecord,
  EventRecord,
  MatterSummary,
  IngestJob,
  ReviewItem,
  Notebook,
  RevisionRecord,
  SourceRecord,
} from "../../shared/api.ts";

const api = window.openadvo;

// Stop a file dropped outside a drop target from navigating the window.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

function summarise(results: AddFileResult[]): string {
  const added = results.filter((r) => r.outcome === "added").length;
  const dup = results.filter((r) => r.outcome === "duplicate");
  const refused = results.filter((r) => r.outcome === "refused");
  const parts = [`${added} added`];
  if (dup.length) parts.push(`${dup.length} already in the matter (same bytes): ${dup.map((r) => r.source?.name).join(", ")}`);
  if (refused.length) parts.push(`${refused.length} refused: ${refused.map((r) => `${baseName(r.path)} (${r.reason})`).join("; ")}`);
  return parts.join(". ") + ".";
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function NewMatterDialog(props: { isOpen: boolean; onOpenChange: (open: boolean) => void; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const submit = async () => {
    if (!title.trim()) return;
    await props.onCreate(title);
    setTitle("");
    props.onOpenChange(false);
  };
  return (
    <Dialog isOpen={props.isOpen} onOpenChange={props.onOpenChange} purpose="form" width={460} padding={4}>
      <DialogHeader title="New matter" onOpenChange={props.onOpenChange} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
        <TextInput
          label="Matter title"
          description="For example: Petitioner v. Respondent"
          value={title}
          onChange={(v) => setTitle(v)}
          onEnter={() => void submit()}
          hasAutoFocus
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button label="Cancel" variant="ghost" onClick={() => props.onOpenChange(false)} />
          <Button label="Create matter" variant="primary" isDisabled={!title.trim()} clickAction={submit} />
        </div>
      </div>
    </Dialog>
  );
}

function ReviewList(props: { matterId: string; items: ReviewItem[]; onChange: () => void }) {
  const open = props.items.filter((i) => i.status === "open");
  const decided = props.items.length - open.length;
  if (props.items.length === 0) return <Text type="supporting">No review items.</Text>;
  return (
    <div>
      <Text type="supporting">{open.length} open, {decided} decided.</Text>
      <ul className="review-list" aria-label="Review items">
        {props.items.map((item) => (
          <li key={item.id} data-status={item.status}>
            <div>{item.detail}</div>
            {item.status === "open" && item.kind === "ocr_dispute" ? (
              <DisputeDecision matterId={props.matterId} reviewItemId={item.id} onDone={props.onChange} />
            ) : item.status === "open" && item.kind === "date_anchor" && item.sourceId ? (
              <DateAnchorForm matterId={props.matterId} sourceId={item.sourceId} onDone={props.onChange} />
            ) : item.status === "open" && item.kind === "possible_duplicate" ? (
              <div className="review-actions">
                <Button label="Same document" size="sm" clickAction={async () => { await api.decideDuplicate(props.matterId, item.id, "same"); props.onChange(); }} />
                <Button label="Different documents" size="sm" variant="ghost" clickAction={async () => { await api.decideDuplicate(props.matterId, item.id, "different"); props.onChange(); }} />
              </div>
            ) : item.status === "open" ? (
              <div className="review-actions">
                <Button label="Resolve" size="sm" clickAction={async () => { await api.resolveReviewItem(props.matterId, item.id); props.onChange(); }} />
                <Button label="Skip" size="sm" variant="ghost" clickAction={async () => { await api.skipReviewItem(props.matterId, item.id); props.onChange(); }} />
              </div>
            ) : (
              <Text type="supporting">{item.status === "resolved" ? "Resolved" : "Skipped"} by {item.decidedBy}</Text>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The window. A side navigation that can be hidden; the chat landing page when no matter is open;
 * in a matter, the chat docked on the left and the Notebook, a source or the Word editor on the right
 * (decisions.md choice 20).
 */
export function App() {
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [version, setVersion] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  // V3-4 and V3-3.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [nb, setNb] = useState<Notebook | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [openDraft, setOpenDraft] = useState<DraftRecord | null>(null);
  const [openRevision, setOpenRevision] = useState<RevisionRecord | null>(null);
  const [draftFocus, setDraftFocus] = useState<{ anchor: string; n: number } | null>(null);
  const [focus, setFocus] = useState<SourceLink | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [tab, setTab] = useState("matter");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  /** True while the navigation is folded because a document opened, not because the advocate folded it. */
  const navFoldedForDocument = useRef(false);
  /** Where the open document puts its controls in the chat dock. */
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  /** Text carried from the landing page into the dock's composer. */
  const [dockCarry, setDockCarry] = useState<{ id: number; text: string } | null>(null);
  /** The instruction and files that wait for the advocate to create the matter. */
  const pendingCarry = useRef<Carry | null>(null);

  const refreshMatters = useCallback(async () => setMatters(await api.listMatters()), []);
  useEffect(() => {
    void refreshMatters();
  }, [refreshMatters]);

  const refreshMatter = useCallback(async (id: string) => {
    setSources(await api.listSources(id));
    setEvents(await api.listEvents(id));
    setJobs(await api.listJobs(id));
    setReviewItems(await api.listReviewItems(id));
    setNb(await api.getNotebook(id));
    setDrafts(await api.listDrafts(id));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!matterId) return;
    return api.onIngestUpdate((id) => {
      if (id === matterId) void refreshMatter(id);
    });
  }, [matterId, refreshMatter]);

  const closeDocument = useCallback(() => {
    setSourceId(null);
    setOpenDraft(null);
    setOpenRevision(null);
  }, []);

  const openMatter = useCallback(
    async (id: string) => {
      setMatterId(id);
      setSettingsOpen(false);
      setNotice(null);
      closeDocument();
      const checked = await api.openMatter(id);
      setSources(checked);
      // A matter with no sources opens where the files are added.
      setTab(checked.length === 0 ? "sources" : "matter");
      setEvents(await api.listEvents(id));
      setJobs(await api.listJobs(id));
      setReviewItems(await api.listReviewItems(id));
      setNb(await api.getNotebook(id));
      setDrafts(await api.listDrafts(id));
      const bad = checked.filter((s) => s.status !== "ok");
      if (bad.length) setNotice(`${bad.length} source file(s) are missing or changed: ${bad.map((s) => `${s.name} (${s.status})`).join(", ")}.`);
    },
    [closeDocument],
  );

  const goHome = () => {
    setSettingsOpen(false);
    setMatterId(null);
    setNotice(null);
    closeDocument();
  };

  const addPathsTo = useCallback(
    async (id: string, paths: string[]) => {
      if (paths.length === 0) return;
      const results = await api.addFiles(id, paths);
      setNotice(summarise(results));
      await refreshMatter(id);
    },
    [refreshMatter],
  );

  /** Open a matter from the landing page: add the attached files, then send or carry the instruction. */
  const openWithCarry = async (id: string, carry: Carry, send: boolean) => {
    await openMatter(id);
    if (carry.paths.length) {
      await addPathsTo(id, carry.paths);
      setTab("sources");
    }
    const text = carry.text.trim();
    if (!text) return;
    if (send) void api.sendChat(id, text);
    else setDockCarry({ id: Date.now(), text });
  };

  const createMatter = async (title: string) => {
    const m = await api.createMatter(title);
    await refreshMatters();
    const carry = pendingCarry.current;
    pendingCarry.current = null;
    // The advocate's instruction started this matter, so it is sent as the first message.
    await openWithCarry(m.id, carry ?? { text: "", paths: [] }, true);
  };

  const askNewMatter = (carry: Carry | null) => {
    pendingCarry.current = carry;
    setDialogOpen(true);
  };

  const matter = useMemo(() => matters.find((m) => m.id === matterId) ?? null, [matters, matterId]);
  // V3-3: what the command bar offers. Each command does what its button does.
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "home", group: "Actions", label: "Home", run: goHome },
      { id: "new", group: "Actions", label: "New matter", run: () => askNewMatter(null) },
      { id: "settings", group: "Actions", label: "Settings", hint: "appearance, mailbox, versions", run: () => { goHome(); setSettingsOpen(true); } },
    ];
    for (const m of matters.filter((x) => !x.archived)) list.push({ id: `m:${m.id}`, group: "Matters", label: m.title, run: () => void openMatter(m.id) });
    if (matterId) {
      for (const t of ["matter", "review", "sources", "procedural", "matrix", "chronology", "records", "research", "filing"]) {
        list.push({ id: `t:${t}`, group: "Go to", label: tabName(t), hint: t === "research" ? "research, sources, arguments" : undefined, run: () => { closeDocument(); setTab(t); } });
      }
      const id = matterId;
      list.push({ id: "add", group: "Actions", label: "Add files to this matter", run: async () => addPathsTo(id, await api.pickFiles()) });
      list.push({ id: "export", group: "Actions", label: "Export this matter", hint: "ZIP backup", run: () => void api.exportMatter(id).then((r) => r && setNotice(`Exported ${r.files} file(s) to ${r.path}.`)) });
      for (const [kind, label] of [["list_of_dates", "Generate List of Dates"], ["synopsis", "Generate Synopsis"], ["petition", "Prepare petition"], ["conference", "Prepare conference package"]] as const) {
        list.push({
          id: `g:${kind}`,
          group: "Actions",
          label,
          run: async () => {
            try {
              const r = kind === "list_of_dates" ? await api.generateListOfDates(id) : kind === "synopsis" ? await api.generateSynopsis(id) : await api.generateDraft(id, kind);
              await refreshMatter(id);
              setSourceId(null);
              setOpenDraft(r.draft);
              setOpenRevision(r.revision);
            } catch (e) {
              setNotice((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
            }
          },
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matters, matterId]);
  const searchLines = useMemo(() => {
    if (!matterId) return null;
    const id = matterId;
    return async (q: string): Promise<Command[]> => {
      // V5-4: Find in the matter: source lines open the source; any other record opens the Inspector.
      const hits = await api.findInMatter(id, q);
      const bySha = new Map(sources.map((s) => [s.sha256, s.id]));
      return hits.slice(0, 15).map((h) => {
        const anchor = h.kind === "line" ? /^([0-9a-f]{64}):(\d+):(\d+)$/.exec(h.ref) : null;
        const sourceIdOf = anchor ? bySha.get(anchor[1]) : undefined;
        return {
          id: `f:${h.kind}:${h.ref}`,
          group: (h.kind === "line" ? "Source lines" : "In this matter") as Command["group"],
          label: (h.snippet || h.text.slice(0, 120)).replace(/[[\]]/g, ""),
          hint: `${h.kind}: ${h.label}`,
          run: () => {
            if (anchor && sourceIdOf) {
              setFocus({ sourceId: sourceIdOf, page: Number(anchor[2]), line: Number(anchor[3]) });
              setSourceId(sourceIdOf);
            } else inspect(h.ref.split("#")[0]);
          },
        };
      });
    };
  }, [matterId, sources]);
  // V3-2: the count on the Review tab.
  useEffect(() => {
    if (!matterId) return;
    void api.getInbox(matterId).then((items) => setInboxCount(items.length), () => setInboxCount(0));
  }, [matterId, version, nb, reviewItems, sources]);
  // V3-3: Ctrl+K (Cmd+K on macOS) opens the command bar anywhere in the window.
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  // V3-6: the window title names the open matter.
  useEffect(() => {
    document.title = matter ? `${matter.title} — Open Advocate` : "Open Advocate";
  }, [matter]);
  const source = sources.find((s) => s.id === sourceId) ?? null;
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of nb?.events ?? []) counts.set(e.sourceId, (counts.get(e.sourceId) ?? 0) + 1);
    return counts;
  }, [nb]);

  const openSource = (link: SourceLink) => {
    setOpenDraft(null);
    setOpenRevision(null);
    setFocus(link);
    setSourceId(link.sourceId);
  };

  const draftOpen = matter && openDraft && openRevision;
  const openItem = draftOpen ? openDraft.title : matter && source ? source.name : null;

  // A source or a draft gets the width of the window: the navigation folds to its icon rail
  // while one is open, and unfolds when it closes. A fold the advocate made stays.
  const documentOpen = openItem !== null;
  useEffect(() => {
    if (documentOpen) {
      setNavCollapsed((collapsed) => {
        if (!collapsed) navFoldedForDocument.current = true;
        return true;
      });
    } else if (navFoldedForDocument.current) {
      navFoldedForDocument.current = false;
      setNavCollapsed(false);
    }
  }, [documentOpen]);

  const setNavByHand = (collapsed: boolean) => {
    navFoldedForDocument.current = false;
    setNavCollapsed(collapsed);
  };

  return (
    <>
      <AppShell
        contentPadding={0}
        variant="surface"
        mobileNav={false}
        topNav={
          // The only bar of the window. It drags the window; the system draws the window controls at its end.
          <header className="titlebar" data-testid="titlebar">
            <span className="titlebar-control">
              <SideNavCollapseButton size="sm" collapsible={{ isCollapsed: navCollapsed, onCollapsedChange: setNavByHand }} />
            </span>
            <Icon icon={ScaleIcon} size="sm" color="secondary" />
            <span className="titlebar-name">Open Advocate</span>
            {matter ? <span className="titlebar-matter">{matter.title}</span> : null}
          </header>
        }
        sideNav={
          <AppNav
            matters={matters.filter((m) => !m.archived)}
            matterId={matterId}
            isCollapsed={navCollapsed}
            onCollapsedChange={setNavByHand}
            onHome={goHome} onNewMatter={() => askNewMatter(null)} onOpenMatter={(id) => void openMatter(id)}
            settingsOpen={settingsOpen}
            onSettings={() => {
              goHome();
              setSettingsOpen(true);
            }}
          />
        }
      >
        {settingsOpen ? (
          <SettingsPage mailbox={<MailboxAccount />} research={<ResearchSourceSettings />} />
        ) : !matter ? (
          <Landing
            matters={matters.filter((m) => !m.archived)}
            onOpenMatter={(id, carry) => void openWithCarry(id, carry, false)}
            onNewMatter={askNewMatter}
            footer={<ArchivedMatters matters={matters} onChanged={refreshMatters} />}
          />
        ) : (
          <div className="matter" data-testid="matter-view">
            <Group orientation="horizontal" style={{ height: "100%" }}>
              <Panel id="chat" defaultSize="32%" minSize="300px" maxSize="60%">
                <ChatDock
                  matterId={matter.id}
                  title={matter.title}
                  openItem={openItem}
                  onBack={closeDocument}
                  slotRef={setDockSlot}
                  carry={dockCarry}
                  onAddPaths={(paths) => addPathsTo(matter.id, paths)}
                  onShowChange={(draftId, anchor) => {
                    void api.listDrafts(matter.id).then((all) => {
                      const d = all.find((x) => x.id === draftId);
                      if (!d?.head) return;
                      setSourceId(null);
                      setOpenDraft(d);
                      setOpenRevision(d.head);
                      setDraftFocus((f) => ({ anchor, n: (f?.n ?? 0) + 1 }));
                    });
                  }}
                  onRevisionsChanged={async () => {
                    await refreshMatter(matter.id);
                    if (!openDraft) return;
                    const next = (await api.listDrafts(matter.id)).find((d) => d.id === openDraft.id);
                    if (next?.head) {
                      setOpenDraft(next);
                      setOpenRevision(next.head);
                    }
                  }}
                />
              </Panel>
              <Separator className="separator" />
              <Panel id="view" minSize="30%">
                <div className="work" aria-label="View" data-testid="work-view">
                  {draftOpen ? (
                    <DraftView
                      matterId={matter.id}
                      draft={openDraft}
                      revision={openRevision}
                      dock={dockSlot}
                      onChanged={async () => {
                        await refreshMatter(matter.id);
                      }}
                      onOpenSource={openSource}
                      focus={draftFocus}
                    />
                  ) : source ? (
                    <SourceDetail matterId={matter.id} source={source} events={events} version={version} focus={focus} dock={dockSlot} onChanged={() => void refreshMatter(matter.id)} />
                  ) : (
                    <div className="work-scroll">
                      {notice ? (
                        <div className="notice notice-closable" role="status" data-testid="notice">
                          <span>{notice}</span>
                          <button type="button" className="notice-close" aria-label="Close notice" onClick={() => setNotice(null)}>×</button>
                        </div>
                      ) : null}
                      <NotebookView
                        matterId={matter.id}
                        nb={nb}
                        tab={tab}
                        onTab={(t) => {
                          setTab(t);
                          setNotice(null);
                        }}
                        onChange={(next) => {
                          setNb(next);
                          void refreshMatter(matter.id);
                        }}
                        onOpen={(link) => {
                          setFocus(link);
                          setSourceId(link.sourceId);
                        }}
                        sourcesPanel={
                          <SourcesPanel
                            sources={sources}
                            jobs={jobs}
                            eventCounts={eventCounts}
                            onAddPaths={(paths) => addPathsTo(matter.id, paths)}
                            onSelect={(id) => {
                              setFocus(null);
                              setSourceId(id);
                            }}
                          />
                        }
                        researchPanel={<StudioView matterId={matter.id} version={version} conference={<ResearchView matterId={matter.id} version={version} />} />}
                        filingPanel={<FilingView matterId={matter.id} sources={sources} version={version} />}
                        recordPanel={<RecordTableView matterId={matter.id} sources={sources} version={version} />}
                        reviewCount={inboxCount}
                        entitiesPanel={
                          <EntitiesView
                            matterId={matter.id}
                            version={version}
                            onOpen={(link) => {
                              setFocus(link);
                              setSourceId(link.sourceId);
                            }}
                          />
                        }
                        reviewPanel={
                          <ReviewInbox
                            matterId={matter.id}
                            version={version + inboxCount}
                            onTab={setTab}
                            onOpenSource={(id) => {
                              setFocus(null);
                              setSourceId(id);
                            }}
                            onChanged={() => void refreshMatter(matter.id)}
                          />
                        }
                        overview={
                          <div>
                            <MatterProgress matterId={matter.id} version={version + inboxCount} onTab={setTab} />
                            <MatterAdmin matter={matter} onChanged={refreshMatters} onArchived={goHome} />
                            <MatterDetailsForm matterId={matter.id} nb={nb} version={version} />
                            <MemoryEditor matterId={matter.id} />
                            <dl className="facts">
                              <dt>Sources</dt><dd>{sources.length}</dd>
                              <dt>Matter folder</dt><dd className="mono">{matter.folder}</dd>
                              <dt>Created</dt><dd>{matter.createdAt}</dd>
                            </dl>
                            <DraftsSection
                              matterId={matter.id}
                              drafts={drafts}
                              onRefresh={async () => {
                                await refreshMatter(matter.id);
                              }}
                              onOpen={(draft, revision) => {
                                setSourceId(null);
                                setOpenDraft(draft);
                                setOpenRevision(revision);
                              }}
                            />
                            <Heading level={3}>Review items</Heading>
                            <ReviewList matterId={matter.id} items={reviewItems} onChange={() => void refreshMatter(matter.id)} />
                            <Heading level={3}>Events</Heading>
                            <EventTable events={events} />
                            <RecordIntegrity matterId={matter.id} version={version} />
                            <FilesAndJobs matterId={matter.id} version={version} />
                          </div>
                        }
                      />
                    </div>
                  )}
                </div>
              </Panel>
            </Group>
          </div>
        )}
      </AppShell>
      <NewMatterDialog
        isOpen={dialogOpen}
        onOpenChange={(open) => {
          if (!open) pendingCarry.current = null;
          setDialogOpen(open);
        }}
        onCreate={createMatter}
      />
      <Inspector matterId={matterId} />
      <CommandBar isOpen={commandOpen} onClose={() => setCommandOpen(false)} commands={commands} searchLines={searchLines} />
    </>
  );
}
