//! The screen data shape (spec A, PH-04). The one data shape the window draws.
//! Lives in `oa-protocol` so the kernel, CLI, harness, and UI read and manipulate
//! the same screen representation.

use oa_types::{ErrorCode, MatterId, OaError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The state of a collapsible pane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Pane {
    Open,
    Collapsed,
}

/// All registered views in the shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ViewId {
    Matters,
    Overview,
    Ledger,
    Evidence,
    Drafts,
    Approvals,
    Rejected,
    Jobs,
    Settings,
    Search,
    Inspector,
    CaptureQueue,
    IngestTriage,
    Duplicates,
    Codebook,
    AdapterHealth,
    OcrReview,
    OcrPipeline,
    OcrLines,
    OcrEngines,
    Entities,
    Notebook,
    Facts,
    Chronology,
    Conflicts,
    Readiness,
    Trace,
    Viewer,
    Document,
    EditSurface,
    Changes,
    WordCraft,
    Fidelity,
    Conversion,
    Browser,
    Downloads,
    Egress,
    Contacts,
    Parties,
    Timeline,
    Services,
    Chat,
    WaitingOnYou,
    ContextManifest,
    SubAgents,
    MatterMemory,
    Effects,
}

/// What opening a row in the Inspector asks for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Subject {
    /// A record of a matter: inspect query and backlinks.
    Record { matter: String, id: String },
    /// An item with no record id: raw JSON value.
    Raw(Value),
}

/// One page in a split's history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Page {
    pub view: ViewId,
    #[serde(default)]
    pub arg: Option<String>,
}

/// One split in the view pane, with history and selection state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Split {
    pub page: Page,
    #[serde(default)]
    pub back: Vec<Page>,
    #[serde(default)]
    pub forward: Vec<Page>,
    #[serde(default)]
    pub visible_anchors: Vec<String>,
    #[serde(default)]
    pub selection: Option<String>,
}

impl Split {
    pub fn new(view: ViewId) -> Self {
        Split {
            page: Page { view, arg: None },
            back: Vec::new(),
            forward: Vec::new(),
            visible_anchors: Vec::new(),
            selection: None,
        }
    }
}

/// The view pane area: 1 to 3 splits, with focus and pane state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ViewArea {
    pub pane: Pane,
    pub splits: Vec<Split>,
    pub focus: usize,
}

impl ViewArea {
    pub fn new(splits: Vec<Split>, focus: usize) -> Self {
        ViewArea {
            pane: Pane::Open,
            splits,
            focus,
        }
    }
}

impl Default for ViewArea {
    fn default() -> Self {
        ViewArea {
            pane: Pane::Open,
            splits: vec![Split::new(ViewId::Matters)],
            focus: 0,
        }
    }
}

/// The screen is the one data shape the window draws (PH-04).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Screen {
    /// The working context; None outside a matter.
    #[schemars(with = "Option<String>")]
    pub matter: Option<MatterId>,
    pub left: Pane,
    pub chat: Pane,
    pub view: ViewArea,
    pub inspector: Option<Subject>,
}

impl Screen {
    pub fn new(
        matter: Option<MatterId>,
        left: Pane,
        chat: Pane,
        view: ViewArea,
        inspector: Option<Subject>,
    ) -> Result<Self, OaError> {
        let screen = Screen {
            matter,
            left,
            chat,
            view,
            inspector,
        };
        screen.validate()?;
        Ok(screen)
    }

    /// Enforces domain invariants.
    pub fn validate(&self) -> Result<(), OaError> {
        if self.chat == Pane::Collapsed && self.view.pane == Pane::Collapsed {
            return Err(OaError::new(
                ErrorCode::Usage,
                "chat and view panes cannot both be collapsed",
            ));
        }
        if self.view.splits.is_empty() {
            return Err(OaError::new(
                ErrorCode::Usage,
                "view area must have at least one split",
            ));
        }
        if self.view.focus >= self.view.splits.len() {
            return Err(OaError::new(
                ErrorCode::Usage,
                "view focus out of range of splits",
            ));
        }
        Ok(())
    }
}

impl Default for Screen {
    fn default() -> Self {
        Screen {
            matter: None,
            left: Pane::Open,
            chat: Pane::Open,
            view: ViewArea::default(),
            inspector: None,
        }
    }
}
