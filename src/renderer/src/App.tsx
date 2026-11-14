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
            {item.status === "open" ? (
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
  const [nb, setNb] = useState<Notebook | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [openDraft, setOpenDraft] = useState<DraftRecord | null>(null);
  const [openRevision, setOpenRevision] = useState<RevisionRecord | null>(null);
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
            matters={matters}
            matterId={matterId}
            isCollapsed={navCollapsed}
            onCollapsedChange={setNavByHand}
            onHome={goHome} onNewMatter={() => askNewMatter(null)} onOpenMatter={(id) => void openMatter(id)}
          />
        }
      >
        {!matter ? (
          <Landing matters={matters} onOpenMatter={(id, carry) => void openWithCarry(id, carry, false)} onNewMatter={askNewMatter} />
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
                    />
                  ) : source ? (
                    <SourceDetail matterId={matter.id} source={source} events={events} version={version} focus={focus} dock={dockSlot} />
                  ) : (
                    <div className="work-scroll">
                      {notice ? <div className="notice" role="status" data-testid="notice">{notice}</div> : null}
                      <NotebookView
                        matterId={matter.id}
                        nb={nb}
                        tab={tab}
                        onTab={setTab}
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
                        overview={
                          <div>
                            <dl className="facts">
                              <dt>Sources</dt><dd>{sources.length}</dd>
                              <dt>Matter folder</dt><dd className="mono">{matter.folder}</dd>
                              <dt>Created</dt><dd>{matter.createdAt}</dd>
                              <dt>Parties, court, case number, CNR</dt><dd>Not recorded</dd>
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
    </>
  );
}
