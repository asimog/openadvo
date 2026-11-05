//! The three-region frame: left pane, chat pane, view pane with 1-3 splits, and inspector drawer (PH-05, A18).

use eframe::egui::{self, Rect};
use oa_protocol::{Pane, Screen};

pub const MIN_SPLIT_WIDTH: f32 = 480.0;
pub const LEFT_PANE_WIDTH: f32 = 280.0;
pub const COLLAPSED_PANE_WIDTH: f32 = 36.0;

pub struct FrameLayout {
    pub left_rect: Rect,
    pub chat_rect: Rect,
    pub view_rect: Rect,
    pub split_rects: Vec<Rect>,
    pub inspector_rect: Option<Rect>,
}

/// Computes pane rectangles and verifies invariants.
pub fn compute_layout(screen: &Screen, available_rect: Rect) -> FrameLayout {
    let total_width = available_rect.width();
    let height = available_rect.height();
    let min_x = available_rect.min.x;
    let min_y = available_rect.min.y;

    // 1. Left pane
    let left_w = match screen.left {
        Pane::Open => LEFT_PANE_WIDTH,
        Pane::Collapsed => COLLAPSED_PANE_WIDTH,
    };
    let left_rect = Rect::from_min_size(egui::pos2(min_x, min_y), egui::vec2(left_w, height));

    let remaining_w = total_width - left_w;

    // 2. Chat and View panes
    let (chat_w, view_w) = match (screen.chat, screen.view.pane) {
        (Pane::Open, Pane::Open) => {
            // Give chat ~380px or 30%, view takes the rest
            let c_w = 380.0_f32.min(remaining_w * 0.35).max(300.0);
            let v_w = (remaining_w - c_w).max(MIN_SPLIT_WIDTH);
            (c_w, v_w)
        }
        (Pane::Open, Pane::Collapsed) => {
            // View collapsed: chat takes whole width
            (remaining_w, 0.0)
        }
        (Pane::Collapsed, Pane::Open) => {
            // Chat collapsed: view takes whole width
            (0.0, remaining_w)
        }
        (Pane::Collapsed, Pane::Collapsed) => {
            // Invariant violation fallback: keep view open
            (0.0, remaining_w)
        }
    };

    let chat_rect = Rect::from_min_size(
        egui::pos2(min_x + left_w, min_y),
        egui::vec2(chat_w, height),
    );

    let view_rect = Rect::from_min_size(
        egui::pos2(min_x + left_w + chat_w, min_y),
        egui::vec2(view_w, height),
    );

    // 3. Splits inside View pane
    let split_count = screen.view.splits.len().max(1);
    let mut split_rects = Vec::with_capacity(split_count);
    if view_w > 0.0 {
        let single_split_w = view_w / split_count as f32;
        for i in 0..split_count {
            split_rects.push(Rect::from_min_size(
                egui::pos2(view_rect.min.x + i as f32 * single_split_w, min_y),
                egui::vec2(single_split_w, height),
            ));
        }
    }

    // 4. Inspector drawer over view pane
    let inspector_rect = if screen.inspector.is_some() && view_w > 0.0 {
        let drawer_w = 400.0_f32.min(view_w * 0.75);
        Some(Rect::from_min_size(
            egui::pos2(view_rect.max.x - drawer_w, min_y),
            egui::vec2(drawer_w, height),
        ))
    } else {
        None
    };

    FrameLayout {
        left_rect,
        chat_rect,
        view_rect,
        split_rects,
        inspector_rect,
    }
}

/// Toggles collapse of the view pane, enforcing the invariant that chat and view cannot both be collapsed.
pub fn toggle_view_pane(screen: &mut Screen) -> bool {
    match screen.view.pane {
        Pane::Open => {
            if screen.chat == Pane::Collapsed {
                return false; // Refused: chat is already collapsed
            }
            screen.view.pane = Pane::Collapsed;
            true
        }
        Pane::Collapsed => {
            screen.view.pane = Pane::Open;
            true
        }
    }
}

/// Toggles collapse of the chat pane, enforcing the invariant that chat and view cannot both be collapsed.
pub fn toggle_chat_pane(screen: &mut Screen) -> bool {
    match screen.chat {
        Pane::Open => {
            if screen.view.pane == Pane::Collapsed {
                return false; // Refused: view is already collapsed
            }
            screen.chat = Pane::Collapsed;
            true
        }
        Pane::Collapsed => {
            screen.chat = Pane::Open;
            true
        }
    }
}

/// Toggles collapse of the left pane.
pub fn toggle_left_pane(screen: &mut Screen) {
    screen.left = match screen.left {
        Pane::Open => Pane::Collapsed,
        Pane::Collapsed => Pane::Open,
    };
}
