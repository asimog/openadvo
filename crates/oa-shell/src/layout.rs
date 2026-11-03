//! Pane layout (spec A02 and rule 16): splits scaled to the monitor, with
//! back and forward history per pane, and a saved layout per matter.

use serde_json::{json, Value};

use crate::views::{by_key, ViewId, REGISTRY};

/// Narrowest useful pane in logical pixels.
pub const MIN_PANE_WIDTH: f32 = 480.0;

/// How many splits fit at a width. At 1920 px this is 4, so three always fit.
pub fn max_splits(width: f32) -> usize {
    ((width / MIN_PANE_WIDTH).floor() as usize).max(1)
}

#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    pub view: ViewId,
    /// What the view is about: a search query, or an Inspector subject.
    pub arg: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PaneState {
    pub page: Page,
    back: Vec<Page>,
    forward: Vec<Page>,
}

impl PaneState {
    pub fn new(view: ViewId) -> Self {
        PaneState {
            page: Page { view, arg: None },
            back: Vec::new(),
            forward: Vec::new(),
        }
    }

    pub fn navigate(&mut self, page: Page) {
        if page == self.page {
            return;
        }
        self.back.push(std::mem::replace(&mut self.page, page));
        self.forward.clear();
    }

    pub fn back(&mut self) -> bool {
        match self.back.pop() {
            Some(prev) => {
                self.forward.push(std::mem::replace(&mut self.page, prev));
                true
            }
            None => false,
        }
    }

    pub fn forward(&mut self) -> bool {
        match self.forward.pop() {
            Some(next) => {
                self.back.push(std::mem::replace(&mut self.page, next));
                true
            }
            None => false,
        }
    }

    pub fn can_back(&self) -> bool {
        !self.back.is_empty()
    }

    pub fn can_forward(&self) -> bool {
        !self.forward.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Layout {
    pub panes: Vec<PaneState>,
    pub focused: usize,
}

impl Layout {
    pub fn new(view: ViewId) -> Self {
        Layout {
            panes: vec![PaneState::new(view)],
            focused: 0,
        }
    }

    /// Adds a pane to the right of the focused one. Refused when the monitor
    /// has no room for another.
    pub fn split(&mut self, view: ViewId, width: f32) -> bool {
        if self.panes.len() >= max_splits(width) {
            return false;
        }
        self.panes.insert(self.focused + 1, PaneState::new(view));
        self.focused += 1;
        true
    }

    /// Closes a pane. The last pane cannot be closed.
    pub fn close(&mut self, index: usize) -> bool {
        if self.panes.len() <= 1 || index >= self.panes.len() {
            return false;
        }
        self.panes.remove(index);
        self.focused = self.focused.min(self.panes.len() - 1);
        true
    }

    /// Drops panes that no longer fit, rightmost first.
    pub fn fit(&mut self, width: f32) {
        while self.panes.len() > max_splits(width) {
            self.panes.pop();
        }
        self.focused = self.focused.min(self.panes.len() - 1);
    }

    pub fn to_json(&self, matter: &str) -> Value {
        json!({
            "matter": matter,
            "focused": self.focused,
            "panes": self.panes.iter().map(|p| json!({
                "view": REGISTRY.iter().find(|d| d.id == p.page.view).map(|d| d.key),
                "arg": p.page.arg,
            })).collect::<Vec<_>>(),
        })
    }

    /// Restores a saved layout. History is not saved, only what is open.
    pub fn from_json(v: &Value) -> Option<(String, Layout)> {
        let matter = v["matter"].as_str()?.to_string();
        let panes: Vec<PaneState> = v["panes"]
            .as_array()?
            .iter()
            .filter_map(|p| {
                let def = by_key(p["view"].as_str()?)?;
                let mut pane = PaneState::new(def.id);
                pane.page.arg = p["arg"].as_str().map(str::to_string);
                Some(pane)
            })
            .collect();
        if panes.is_empty() {
            return None;
        }
        let focused = (v["focused"].as_u64().unwrap_or(0) as usize).min(panes.len() - 1);
        Some((matter, Layout { panes, focused }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ac_18_three_splits_fit_at_1920_and_a_narrow_window_refuses_more() {
        assert!(max_splits(1920.0) >= 3);
        let mut l = Layout::new(ViewId::Matters);
        assert!(l.split(ViewId::Ledger, 1920.0));
        assert!(l.split(ViewId::Evidence, 1920.0));
        assert_eq!(l.panes.len(), 3);
        assert_eq!(max_splits(900.0), 1);
        let mut narrow = Layout::new(ViewId::Matters);
        assert!(!narrow.split(ViewId::Ledger, 900.0));
    }

    #[test]
    fn a_ac_18_back_and_forward_restore_the_previous_pane_contents() {
        let mut p = PaneState::new(ViewId::Matters);
        p.navigate(Page {
            view: ViewId::Ledger,
            arg: None,
        });
        p.navigate(Page {
            view: ViewId::Inspector,
            arg: Some("M:event:3".into()),
        });
        assert!(p.back());
        assert_eq!(p.page.view, ViewId::Ledger);
        assert!(p.back());
        assert_eq!(p.page.view, ViewId::Matters);
        assert!(!p.back());
        assert!(p.forward());
        assert_eq!(p.page.view, ViewId::Ledger);
        p.navigate(Page {
            view: ViewId::Jobs,
            arg: None,
        });
        assert!(!p.can_forward(), "navigating drops the forward history");
    }

    #[test]
    fn a_ac_18_a_saved_layout_reopens_with_its_matter() {
        let mut l = Layout::new(ViewId::Matters);
        l.split(ViewId::Ledger, 1920.0);
        let f = l.focused;
        l.panes[f].navigate(Page {
            view: ViewId::Search,
            arg: Some("order".into()),
        });
        let saved = l.to_json("M1");
        let (matter, back) = Layout::from_json(&saved).unwrap();
        assert_eq!(matter, "M1");
        assert_eq!(back.panes.len(), 2);
        assert_eq!(back.panes[1].page.view, ViewId::Search);
        assert_eq!(back.panes[1].page.arg.as_deref(), Some("order"));
        assert_eq!(back.focused, 1);
    }

    #[test]
    fn the_last_pane_cannot_be_closed_and_a_narrow_window_drops_extras() {
        let mut l = Layout::new(ViewId::Matters);
        assert!(!l.close(0));
        l.split(ViewId::Jobs, 1920.0);
        l.split(ViewId::Settings, 1920.0);
        l.fit(1000.0);
        assert_eq!(l.panes.len(), 2);
    }
}
