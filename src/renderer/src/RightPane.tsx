/**
 * S10: the right pane. The Matter tab and the browser tabs share one strip. The native browser
 * page is a WebContentsView placed exactly over the content area; the tab strip, address bar and
 * bookmarks bar stay in the renderer above it. Spec: docs/specs/advocate-matters-browser.md.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BookmarkIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import type { BrowserBookmark, BrowserState, BrowserTab, BrowserVisit, CaseListProposal } from "../../shared/browser.ts";
import { COURT_PORTALS, bookmarkFor } from "../../lib/browser/index.ts";

const api = window.openadvo;

export interface RightPaneHandle {
  /** Open the browser tabs, or make a new tab when none exists. */
  openBrowser: () => void;
  newTab: (url?: string) => void;
  /** Return the pane to the matter's work view. */
  showWork: () => void;
}

function errorText(e: unknown): string {
  return (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function TabIcon(props: { tab: BrowserTab; size?: number }) {
  if (props.tab.agent) return <span className="browser-agent-dot" title="The agent opened this page" aria-label="Agent page" />;
  return <GlobeAltIcon width={props.size ?? 14} height={props.size ?? 14} aria-hidden="true" />;
}

function NewTabPage(props: {
  bookmarks: BrowserBookmark[];
  history: BrowserVisit[];
  onOpen: (url: string) => void;
  onOpenBookmark: (id: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <div className="browser-newtab" data-testid="browser-newtab">
      <div className="browser-newtab-head">
        <GlobeAltIcon width={26} height={26} aria-hidden="true" />
        <div>
          <h3>Open a page</h3>
          <p>Type an address above, or choose a bookmark or a court portal.</p>
        </div>
      </div>
      <section aria-label="Court portals">
        <h4>Court portals</h4>
        <div className="browser-tiles">
          {COURT_PORTALS.map((p) => (
            <button key={p.url} type="button" className="browser-tile" onClick={() => props.onOpen(p.url)} data-testid={`browser-portal-${p.title.replace(/\s+/g, "-").toLowerCase()}`}>
              <GlobeAltIcon width={16} height={16} aria-hidden="true" />
              <span>{p.title}</span>
            </button>
          ))}
        </div>
      </section>
      <section aria-label="Bookmarks">
        <h4>Bookmarks</h4>
        {props.bookmarks.length === 0 ? <p className="browser-muted">No bookmark yet. Open a page and choose the star.</p> : (
          <div className="browser-tiles">
            {props.bookmarks.map((b) => (
              <button key={b.id} type="button" className="browser-tile" onClick={() => props.onOpenBookmark(b.id)} data-testid="browser-newtab-bookmark">
                <BookmarkIcon width={16} height={16} aria-hidden="true" />
                <span>{b.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {props.history.length ? (
        <section aria-label="Recent pages">
          <div className="browser-section-head">
            <h4>Recent pages</h4>
            <button type="button" className="browser-link" onClick={props.onClearHistory}>Clear</button>
          </div>
          <ul className="browser-recent">
            {props.history.slice(0, 8).map((v) => (
              <li key={v.id}>
                <button type="button" className="browser-recent-row" onClick={() => props.onOpen(v.url)} data-testid="browser-recent">
                  <span>{v.title}</span>
                  <span className="browser-muted">{v.url}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CaseListPanel(props: {
  loading: boolean;
  error: string | null;
  result: { proposals: CaseListProposal[]; pageUrl: string; basis: string } | null;
  onCreate: (selected: CaseListProposal[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!props.result) return;
    setChecked(new Set(props.result.proposals.map((_, i) => i)));
  }, [props.result]);
  return (
    <div className="browser-caselist" data-testid="browser-caselist">
      <div className="browser-section-head">
        <div>
          <h3>Import the case list</h3>
          <p className="browser-muted">Read from {props.result?.pageUrl || "the open page"}. Tick the cases to create; nothing is created without your tick.</p>
        </div>
        <button type="button" className="browser-icon" aria-label="Close the case list" onClick={props.onClose}><XMarkIcon width={16} height={16} /></button>
      </div>
      {props.loading ? <p>Reading the page. The model is reading the case list.</p> : null}
      {props.error ? <div className="notice" role="alert">{props.error}</div> : null}
      {props.result && props.result.proposals.length === 0 ? (
        <div className="notice">No case was read on this page. Open the case list itself, then choose Import case list again.</div>
      ) : null}
      {props.result && props.result.proposals.length ? (
        <>
          <ul className="browser-case-list">
            {props.result.proposals.map((p, i) => (
              <li key={`${p.cnr}:${p.title}`}>
                <label className="browser-case">
                  <input
                    type="checkbox"
                    checked={checked.has(i)}
                    onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })}
                  />
                  <span className="browser-case-main">
                    <span className="browser-case-title">{p.title}</span>
                    <span className="browser-muted">{[p.cnr, p.court, p.stage, p.nextDate].filter(Boolean).join(" · ") || "No CNR, court, stage or date on the page"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="browser-actions">
            <button type="button" className="browser-button" disabled={!checked.size} onClick={() => props.onCreate(props.result!.proposals.filter((_, i) => checked.has(i)))}>
              Create {checked.size} matter{checked.size === 1 ? "" : "s"}
            </button>
          </div>
          <details className="browser-basis">
            <summary>What the model read</summary>
            <pre>{props.result.basis}</pre>
          </details>
        </>
      ) : null}
    </div>
  );
}

export const RightPane = forwardRef<RightPaneHandle, {
  matterId: string | null;
  /** The Matter tab's content. */
  work?: ReactNode;
  /** A source or a draft opens in its own tab; the Matter tab stays. */
  document?: { key: string; title: string; content: ReactNode } | null;
  onCloseDocument?: () => void;
  /** True for the Browser page outside a matter: no Matter tab. */
  standalone?: boolean;
  onBrowserActive?: (active: boolean) => void;
  /** A case list created matters; the window reads the list again. */
  onMattersChanged?: () => void;
}>(function RightPane(props, ref) {
  const [state, setState] = useState<BrowserState>({ tabs: [], activeTabId: null });
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>([]);
  const [history, setHistory] = useState<BrowserVisit[]>([]);
  const [active, setActive] = useState<string>(props.standalone ? "" : "matter");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [caseResult, setCaseResult] = useState<{ proposals: CaseListProposal[]; pageUrl: string; basis: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeTab = useMemo(() => (active === "matter" ? null : state.tabs.find((t) => t.id === active) ?? null), [active, state.tabs]);
  const shownTab = active !== "matter" ? activeTab : null;
  const pageShown = !!shownTab && shownTab.url !== "about:blank" && !shownTab.error && !caseOpen;
  const currentBookmark = shownTab ? bookmarkFor(bookmarks, shownTab.url) : undefined;

  const load = useCallback(async () => {
    try {
      const [s, b, h] = await Promise.all([api.browserState(), api.browserBookmarks(), api.browserHistory()]);
      setState(s);
      setBookmarks(b);
      setHistory(h);
      setActive((a) => {
        if (a === "matter" && !props.standalone) return a;
        if (a && s.tabs.some((t) => t.id === a)) return a;
        return props.standalone ? (s.activeTabId ?? s.tabs[0]?.id ?? "") : "matter";
      });
    } catch (e) {
      setNotice(errorText(e));
    }
  }, [props.standalone]);

  useEffect(() => {
    void load();
    return api.onBrowserState((s) => {
      setState(s);
      setActive((a) => {
        if (a === "matter" && !props.standalone) return a;
        if (a && s.tabs.some((t) => t.id === a)) {
          // A link that opened another tab moves the pane there; the Matter tab never moves.
          return s.activeTabId && s.activeTabId !== a && a !== "matter" ? s.activeTabId : a;
        }
        return props.standalone ? (s.activeTabId ?? s.tabs[0]?.id ?? "") : "matter";
      });
    });
  }, [load, props.standalone]);

  useEffect(() => {
    void api.browserSetMatter(props.matterId);
    return () => void api.browserSetMatter(null);
  }, [props.matterId]);

  // A source or a draft opens its own tab. The Matter tab never closes.
  const documentKey = props.document?.key ?? null;
  useEffect(() => {
    if (documentKey) setActive("document");
    else setActive((a) => (a === "document" ? "matter" : a));
  }, [documentKey]);

  useEffect(() => {
    setAddress(pageShown && shownTab ? shownTab.url : "");
    setEditing(false);
  }, [pageShown, shownTab?.id, shownTab?.url]);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    void api.browserSetBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    void api.browserSetVisible(pageShown);
    measure();
    props.onBrowserActive?.(active !== "matter" && active !== "document");
    return () => void api.browserSetVisible(false);
  }, [pageShown, active, props, measure]);

  const selectTab = useCallback(async (id: string) => {
    setActive(id);
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    try {
      await api.browserActivate(id);
      setCaseOpen(false);
      setCaseError(null);
      const shown = !!tab && tab.url !== "about:blank" && !tab.error;
      await api.browserSetVisible(shown);
    } catch (e) {
      setNotice(errorText(e));
    }
  }, []);

  const selectMatter = useCallback(() => {
    setActive(props.standalone ? (stateRef.current.activeTabId ?? stateRef.current.tabs[0]?.id ?? "") : "matter");
    void api.browserSetVisible(false);
  }, [props.standalone]);

  const newTab = useCallback(async (url?: string) => {
    try {
      setCaseOpen(false);
      setCaseError(null);
      const id = await api.browserOpen(url);
      setActive(id);
      await api.browserActivate(id);
      const tab = (await api.browserState()).tabs.find((t) => t.id === id);
      await api.browserSetVisible(!!tab && tab.url !== "about:blank");
      if (!url) setTimeout(() => addressRef.current?.focus(), 0);
    } catch (e) {
      setNotice(errorText(e));
    }
  }, []);

  const openBrowser = useCallback(() => {
    const tabs = stateRef.current.tabs;
    if (tabs.length === 0) return void newTab();
    const target = stateRef.current.activeTabId ?? tabs[tabs.length - 1].id;
    void selectTab(target);
  }, [newTab, selectTab]);

  useImperativeHandle(ref, () => ({ openBrowser: () => void openBrowser(), newTab: (url?: string) => void newTab(url), showWork: selectMatter }), [openBrowser, newTab, selectMatter]);

  const closeTab = useCallback(async (id: string) => {
    try {
      const next = await api.browserClose(id);
      setState(next);
      if (active === id) {
        if (props.standalone) setActive(next.activeTabId ?? next.tabs[0]?.id ?? "");
        else setActive("matter");
      }
    } catch (e) {
      setNotice(errorText(e));
    }
  }, [active, props.standalone]);

  const go = useCallback(async () => {
    const value = address.trim();
    if (!value) return;
    setNotice(null);
    try {
      if (shownTab) {
        await api.browserNavigate(shownTab.id, value);
        setEditing(false);
        await api.browserSetVisible(true);
      } else {
        await newTab(value);
      }
    } catch (e) {
      setNotice(errorText(e));
    }
  }, [address, newTab, shownTab]);

  const openUrl = useCallback((url: string) => {
    void newTab(url);
  }, [newTab]);

  const openBookmark = useCallback(async (id: string) => {
    try {
      const tabId = await api.browserOpenBookmark(id);
      setActive(tabId);
      await api.browserActivate(tabId);
      setCaseOpen(false);
      await api.browserSetVisible(true);
    } catch (e) {
      setNotice(errorText(e));
    }
  }, []);

  const toggleBookmark = useCallback(async () => {
    if (!shownTab) return;
    try {
      const b = await api.browserToggleBookmark(shownTab.id);
      setBookmarks(await api.browserBookmarks());
      setNotice(b ? `Bookmarked ${b.title}.` : "Bookmark removed.");
    } catch (e) {
      setNotice(errorText(e));
    }
  }, [shownTab]);

  const removeBookmark = useCallback(async (id: string) => {
    setBookmarks(await api.browserRemoveBookmark(id));
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory(await api.browserClearHistory());
  }, []);

  const readCaseList = useCallback(async () => {
    setCaseOpen(true);
    setCaseLoading(true);
    setCaseError(null);
    setCaseResult(null);
    await api.browserSetVisible(false);
    try {
      setCaseResult(await api.browserProposeCaseList());
    } catch (e) {
      setCaseError(errorText(e));
    } finally {
      setCaseLoading(false);
    }
  }, []);

  useEffect(() => api.onBrowserShortcut((shortcut) => {
    if (shortcut === "new-tab") void newTab();
    else if (shortcut === "close-tab" && shownTab) void closeTab(shownTab.id);
    else if (shortcut === "focus-address") {
      setActive((a) => a);
      addressRef.current?.focus();
      addressRef.current?.select();
    } else if (shortcut === "reload" && shownTab) void api.browserReload(shownTab.id);
  }), [closeTab, newTab, shownTab]);

  const onAddressKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void go();
    } else if (e.key === "Escape") {
      setEditing(false);
      e.currentTarget.blur();
    }
  };

  const tabStrip = (
    <div className="browser-strip" role="tablist" aria-label="Right pane tabs" data-testid="browser-strip">
      {!props.standalone ? (
        <div className="browser-tab" data-active={active === "matter"} role="tab" aria-label="Matter view" aria-selected={active === "matter"} tabIndex={0} onClick={selectMatter} onKeyDown={(e) => e.key === "Enter" && selectMatter()} data-testid="browser-matter-tab">
          <DocumentArrowDownIcon width={14} height={14} aria-hidden="true" />
          <span className="browser-tab-title">Matter</span>
        </div>
      ) : null}
      {props.document ? (
        <div
          className="browser-tab browser-document-tab"
          data-active={active === "document"}
          role="tab"
          aria-selected={active === "document"}
          tabIndex={0}
          onClick={() => setActive("document")}
          onKeyDown={(e) => e.key === "Enter" && setActive("document")}
          title={props.document.title}
          data-testid="document-tab"
        >
          <DocumentTextIcon width={14} height={14} aria-hidden="true" />
          <span className="browser-tab-title">{props.document.title}</span>
          <button
            type="button"
            className="browser-tab-close"
            aria-label={`Close ${props.document.title}`}
            onClick={(e) => {
              e.stopPropagation();
              props.onCloseDocument?.();
            }}
          >
            <XMarkIcon width={12} height={12} />
          </button>
        </div>
      ) : null}
      {state.tabs.map((tab) => (
        <div
          key={tab.id}
          className="browser-tab"
          data-active={active === tab.id}
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={0}
          onClick={() => void selectTab(tab.id)}
          onKeyDown={(e) => e.key === "Enter" && void selectTab(tab.id)}
          title={tab.error || tab.url}
          data-testid="browser-tab"
        >
          <TabIcon tab={tab} />
          <span className="browser-tab-title">{tab.title || "New tab"}</span>
          {tab.agent ? <span className="browser-agent-label">agent</span> : null}
          <button
            type="button"
            className="browser-tab-close"
            aria-label={`Close ${tab.title || "tab"}`}
            onClick={(e) => {
              e.stopPropagation();
              void closeTab(tab.id);
            }}
          >
            <XMarkIcon width={12} height={12} />
          </button>
        </div>
      ))}
      <button type="button" className="browser-newtab-button" aria-label="New tab" onClick={() => void newTab()} data-testid="browser-new-tab">
        <PlusIcon width={15} height={15} />
      </button>
      <div className="browser-strip-end">
        <button type="button" className="browser-icon" aria-label="Import case list" title="Import case list" onClick={() => void readCaseList()} data-testid="browser-import-case-list">
          <BookmarkIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="right-pane" data-testid={props.standalone ? "browser-page-pane" : "right-pane"}>
      {tabStrip}
      {shownTab ? (
        <>
          <div className="browser-bar" data-testid="browser-bar">
            <button type="button" className="browser-icon" aria-label="Back" disabled={!shownTab.canGoBack} onClick={() => void api.browserBack(shownTab.id)}><ArrowLeftIcon width={16} height={16} /></button>
            <button type="button" className="browser-icon" aria-label="Forward" disabled={!shownTab.canGoForward} onClick={() => void api.browserForward(shownTab.id)}><ArrowRightIcon width={16} height={16} /></button>
            <button type="button" className="browser-icon" aria-label={shownTab.loading ? "Stop" : "Reload"} onClick={() => void (shownTab.loading ? api.browserStop(shownTab.id) : api.browserReload(shownTab.id))}>
              {shownTab.loading ? <XMarkIcon width={16} height={16} /> : <ArrowPathIcon width={16} height={16} />}
            </button>
            <div className="browser-address" data-editing={editing}>
              {shownTab.url.startsWith("https:") ? <LockClosedIcon width={13} height={13} aria-label="Secure page" /> : <GlobeAltIcon width={14} height={14} aria-hidden="true" />}
              <input
                ref={addressRef}
                aria-label="Address"
                placeholder="Search or enter a URL"
                value={editing ? address : shownTab.url === "about:blank" ? "" : shownTab.url}
                onFocus={(e) => { setAddress(shownTab.url === "about:blank" ? "" : shownTab.url); setEditing(true); e.currentTarget.select(); }}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={onAddressKey}
                onBlur={() => setEditing(false)}
                spellCheck={false}
              />
            </div>
            <button type="button" className={`browser-icon ${currentBookmark ? "browser-star-on" : ""}`} aria-label={currentBookmark ? "Remove bookmark" : "Bookmark this page"} onClick={() => void toggleBookmark()} data-testid="browser-star">
              {currentBookmark ? <StarIconSolid width={16} height={16} /> : <StarIcon width={16} height={16} />}
            </button>
            <button type="button" className="browser-button browser-import" onClick={() => void readCaseList()}>
              <DocumentArrowDownIcon width={15} height={15} aria-hidden="true" />
              Import case list
            </button>
          </div>
          <div className="browser-bookmarks" aria-label="Bookmarks" data-testid="browser-bookmarks">
            {bookmarks.length === 0 ? <span className="browser-muted">No bookmarks. Use the star to add this page.</span> : bookmarks.slice(0, 12).map((b) => (
              <span key={b.id} className="browser-bookmark">
                <button type="button" className="browser-bookmark-open" onClick={() => void openBookmark(b.id)} title={b.url} data-testid="browser-bookmark">
                  <BookmarkIcon width={13} height={13} aria-hidden="true" />
                  {b.title}
                </button>
                <button type="button" className="browser-bookmark-remove" aria-label={`Remove bookmark ${b.title}`} onClick={() => void removeBookmark(b.id)}><XMarkIcon width={10} height={10} /></button>
              </span>
            ))}
          </div>
        </>
      ) : null}
      {notice ? <div className="notice browser-notice" role="status"><span>{notice}</span><button type="button" className="notice-close" aria-label="Close notice" onClick={() => setNotice(null)}>x</button></div> : null}
      <div className="browser-content" ref={contentRef} data-testid="browser-content">
        {caseOpen ? (
          <CaseListPanel loading={caseLoading} error={caseError} result={caseResult} onClose={() => { setCaseOpen(false); setCaseError(null); void api.browserSetVisible(!!pageShown); }} onCreate={async (selected) => {
            setCaseError(null);
            try {
              const r = await api.browserCreateMatters(selected);
              setCaseResult(null);
              setCaseOpen(false);
              props.onMattersChanged?.();
              setNotice(`Created ${r.created} matter${r.created === 1 ? "" : "s"}${r.refused.length ? `; ${r.refused.length} refused: ${r.refused.join("; ")}` : ""}.`);
              await api.browserSetVisible(!!pageShown);
            } catch (e) {
              setCaseError(errorText(e));
            }
          }} />
        ) : active === "document" && props.document ? (
          <div className="document-content" data-testid="document-content">{props.document.content}</div>
        ) : active === "matter" && !props.standalone ? (
          props.work
        ) : shownTab && (shownTab.url === "about:blank" || shownTab.error) ? (
          shownTab.error ? (
            <div className="browser-error" data-testid="browser-error">
              <h3>The page did not load</h3>
              <p>{shownTab.error}</p>
              <button type="button" className="browser-button" onClick={() => void api.browserReload(shownTab.id)}>Try again</button>
            </div>
          ) : (
            <div className="browser-newtab-scroll">
              <NewTabPage bookmarks={bookmarks} history={history} onOpen={openUrl} onOpenBookmark={(id) => void openBookmark(id)} onClearHistory={() => void clearHistory()} />
            </div>
          )
        ) : shownTab ? null : (
          <div className="browser-empty" data-testid="browser-empty">
            <GlobeAltIcon width={36} height={36} aria-hidden="true" />
            <h3>No tab is open</h3>
            <p>Open a court portal, a research service or any page.</p>
            <button type="button" className="browser-button" onClick={() => void newTab()}>New tab</button>
          </div>
        )}
      </div>
    </div>
  );
});

/** The Browser page outside a matter: the same tabs and chrome, full width. */
export function BrowserWorkspace(props: { onMattersChanged?: () => void }) {
  const pane = useRef<RightPaneHandle>(null);
  useEffect(() => {
    // The Browser page starts with a tab, so the address field is ready.
    void (async () => {
      const s = await window.openadvo.browserState();
      if (s.tabs.length === 0) await window.openadvo.browserOpen();
    })();
  }, []);
  return <RightPane ref={pane} matterId={null} standalone onMattersChanged={props.onMattersChanged} />;
}
