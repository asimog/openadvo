//! The hosting model for WordCraft and PdfCraft windows (J05, RQ-77).
//!
//! Pure state: given our window's events, where the hosted window must be,
//! whether it is shown, and which window styles it carries. The Win32 calls
//! that apply this state (SetParent, SetWindowPos) are the H-08 spike and are
//! not made here.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const WS_CHILD: u32 = 0x4000_0000;
pub const WS_POPUP: u32 = 0x8000_0000;
pub const WS_EX_APPWINDOW: u32 = 0x0004_0000;
pub const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum HostMode {
    Reparented,
    /// A separate top-level window owned by ours, with the reason shown in
    /// the pane (J rule 8).
    Fallback {
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HostedWindow {
    pub mode: HostMode,
    /// Screen coordinates in physical pixels.
    pub rect: Rect,
    pub visible: bool,
    pub focused: bool,
    pub dpi: u32,
    pub style: u32,
    pub ex_style: u32,
    /// What the pane says, when anything.
    pub notice: Option<String>,
}

impl HostedWindow {
    /// Neither a child window nor an owned tool window gets a taskbar button.
    pub fn has_taskbar_entry(&self) -> bool {
        self.ex_style & WS_EX_APPWINDOW != 0
            || (self.style & WS_CHILD == 0 && self.ex_style & WS_EX_TOOLWINDOW == 0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum HostEvent {
    Moved {
        x: i32,
        y: i32,
    },
    Resized {
        w: i32,
        h: i32,
    },
    /// The pane moved or resized inside our window (logical pixels).
    PaneLayout {
        pane: Rect,
    },
    Minimised,
    Restored,
    PaneFocused,
    /// `reparent_ok` is what the platform reported after the change.
    DpiChanged {
        dpi: u32,
        reparent_ok: bool,
    },
    ReparentFailed {
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Host {
    /// Our window's client origin on screen, physical pixels.
    pub origin: (i32, i32),
    /// The pane inside our window, logical pixels.
    pub pane: Rect,
    pub dpi: u32,
    pub minimised: bool,
    pub focused: bool,
    pub mode: HostMode,
}

fn scale(v: i32, dpi: u32) -> i32 {
    (v as i64 * dpi as i64 / 96) as i32
}

impl Host {
    pub fn new(origin: (i32, i32), pane: Rect, dpi: u32) -> Self {
        Host {
            origin,
            pane,
            dpi,
            minimised: false,
            focused: false,
            mode: HostMode::Reparented,
        }
    }

    pub fn apply(&mut self, e: &HostEvent) -> HostedWindow {
        match e {
            HostEvent::Moved { x, y } => self.origin = (*x, *y),
            HostEvent::Resized { w, h } => {
                self.pane.w = self.pane.w.min(*w);
                self.pane.h = self.pane.h.min(*h);
            }
            HostEvent::PaneLayout { pane } => self.pane = *pane,
            HostEvent::Minimised => self.minimised = true,
            HostEvent::Restored => self.minimised = false,
            HostEvent::PaneFocused => self.focused = true,
            HostEvent::DpiChanged { dpi, reparent_ok } => {
                self.dpi = *dpi;
                if !reparent_ok {
                    self.mode = HostMode::Fallback {
                        reason: format!("reparenting failed at the change to {dpi} DPI"),
                    };
                }
            }
            HostEvent::ReparentFailed { reason } => {
                self.mode = HostMode::Fallback {
                    reason: reason.clone(),
                }
            }
        }
        self.window()
    }

    pub fn window(&self) -> HostedWindow {
        let rect = Rect {
            x: self.origin.0 + scale(self.pane.x, self.dpi),
            y: self.origin.1 + scale(self.pane.y, self.dpi),
            w: scale(self.pane.w, self.dpi),
            h: scale(self.pane.h, self.dpi),
        };
        let (style, ex_style, notice) = match &self.mode {
            HostMode::Reparented => (WS_CHILD, 0, None),
            HostMode::Fallback { reason } => (
                WS_POPUP,
                WS_EX_TOOLWINDOW,
                Some(format!(
                    "The editor is shown in its own window owned by Open Advocate: {reason}."
                )),
            ),
        };
        HostedWindow {
            mode: self.mode.clone(),
            rect,
            visible: !self.minimised,
            focused: self.focused && !self.minimised,
            dpi: self.dpi,
            style,
            ex_style,
            notice,
        }
    }
}
