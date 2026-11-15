/** S10: the built-in browser. Types shared by the main process, the bridge and the renderer. */

/** One tab of the browser pane. A tab with an about:blank address shows the new-tab page. */
export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** True when the agent opened the tab in its own temporary partition (HB-2 A). */
  agent: boolean;
  /** True when a hidden agent page was handed to the advocate. */
  handedOver: boolean;
  /** The page's last failure, in one line. */
  error?: string;
}

export interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
}

/** The rectangle of the page, in the window's content coordinates. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

export interface BrowserVisit {
  id: string;
  title: string;
  url: string;
  visitedAt: string;
}

/** The pane sends this when a browser tab is selected or the Matter tab returns. */
export const BROWSER_STATE_EVENT = "openadvo.browser_state";

/** A page finished downloading a file into the matter. */
export interface BrowserCapture {
  matterId: string;
  name: string;
  outcome: string;
  url: string;
}

/** A keyboard shortcut the page claimed while it had focus. */
export interface BrowserShortcut {
  type: "new-tab" | "close-tab" | "focus-address" | "reload";
}

/** One case the agent read from a portal's case list. */
export interface CaseListProposal {
  /** The title the matter will get. */
  title: string;
  cnr: string;
  court: string;
  petitioner: string;
  respondent: string;
  stage: string;
  /** YYYY-MM-DD, or "". */
  nextDate: string;
  /** The page the proposal was read from. */
  sourceUrl: string;
}

export interface CaseListResult {
  proposals: CaseListProposal[];
  pageUrl: string;
  /** What the model read, so the advocate can see the basis. */
  basis: string;
}
