//! Standard widgets exposing AccessKit nodes with non-empty role and name (A-AC-07, A18).

use super::theme::{colors, radius, spacing, typography};
use eframe::egui::{self, Color32, CornerRadius, Stroke, WidgetInfo, WidgetType};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Good,
    Bad,
    Warning,
    Muted,
}

pub fn tone_colors(tone: Tone) -> (Color32, Color32) {
    match tone {
        Tone::Good => (colors::GOOD, colors::GOOD_BG),
        Tone::Bad => (colors::BAD, colors::BAD_BG),
        Tone::Warning => (colors::WARNING, colors::WARNING_BG),
        Tone::Muted => (colors::MUTED, colors::MUTED_BG),
    }
}

/// A status badge with tone coloring and an accessible label.
pub fn badge(ui: &mut egui::Ui, text: &str, tone: Tone) -> egui::Response {
    let (fg, bg) = tone_colors(tone);
    let padding = egui::vec2(spacing::SM, spacing::XS);
    let font_id = egui::FontId::new(typography::CAPTION, egui::FontFamily::Proportional);
    let galley = ui.painter().layout_no_wrap(text.to_string(), font_id, fg);
    let size = galley.size() + padding * 2.0;

    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        ui.painter().rect(
            rect,
            CornerRadius::same(radius::FULL as u8),
            bg,
            Stroke::new(1.0_f32, fg),
            egui::StrokeKind::Inside,
        );
        ui.painter().galley(rect.min + padding, galley, fg);
    }
    let name = text.to_string();
    response.widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name.clone()));
    response
}

/// A status chip for service health, process state, or run state.
pub fn status_chip(ui: &mut egui::Ui, label: &str, tone: Tone) -> egui::Response {
    let (fg, bg) = tone_colors(tone);
    let padding = egui::vec2(spacing::SM, spacing::XS);
    let font_id = egui::FontId::new(typography::BODY, egui::FontFamily::Proportional);
    let galley = ui.painter().layout_no_wrap(label.to_string(), font_id, fg);
    let size = galley.size() + padding * 2.0;

    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        ui.painter().rect(
            rect,
            CornerRadius::same(radius::SM as u8),
            bg,
            Stroke::new(1.0_f32, fg),
            egui::StrokeKind::Inside,
        );
        ui.painter().galley(rect.min + padding, galley, fg);
    }
    let name = label.to_string();
    response.widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name.clone()));
    response
}

/// A key-value grid for metadata and properties.
pub fn key_value_grid(ui: &mut egui::Ui, pairs: &[(&str, &str)]) -> egui::Response {
    ui.scope(|ui| {
        egui::Grid::new("kv_grid")
            .num_columns(2)
            .spacing([spacing::LG, spacing::SM])
            .show(ui, |ui| {
                for (k, v) in pairs {
                    let r_key = ui.label(
                        egui::RichText::new(*k)
                            .color(colors::TEXT_SECONDARY)
                            .size(typography::BODY),
                    );
                    let name_k = k.to_string();
                    r_key.widget_info(move || {
                        WidgetInfo::labeled(WidgetType::Label, true, name_k.clone())
                    });

                    let r_val = ui.label(
                        egui::RichText::new(*v)
                            .color(colors::TEXT_PRIMARY)
                            .size(typography::BODY),
                    );
                    let name_v = v.to_string();
                    r_val.widget_info(move || {
                        WidgetInfo::labeled(WidgetType::Label, true, name_v.clone())
                    });

                    ui.end_row();
                }
            });
    })
    .response
}

/// A section header.
pub fn section_header(ui: &mut egui::Ui, title: &str) -> egui::Response {
    let font_id = egui::FontId::new(typography::H3, egui::FontFamily::Proportional);
    let response = ui.label(
        egui::RichText::new(title)
            .font(font_id)
            .color(colors::TEXT_PRIMARY)
            .strong(),
    );
    let name = title.to_string();
    response.widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name.clone()));
    response
}

/// An empty state with message and optional action.
pub fn empty_state(
    ui: &mut egui::Ui,
    message: &str,
    action_label: Option<&str>,
) -> (egui::Response, Option<egui::Response>) {
    let mut action_clicked = None;
    let resp = ui
        .vertical_centered(|ui| {
            ui.add_space(spacing::XL);
            let msg_resp = ui.label(
                egui::RichText::new(message)
                    .size(typography::BODY)
                    .color(colors::TEXT_SECONDARY),
            );
            let name_m = message.to_string();
            msg_resp
                .widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name_m.clone()));

            if let Some(act) = action_label {
                ui.add_space(spacing::MD);
                let btn = ui.button(act);
                let name_b = act.to_string();
                btn.widget_info(move || {
                    WidgetInfo::labeled(WidgetType::Button, true, name_b.clone())
                });
                action_clicked = Some(btn);
            }
            ui.add_space(spacing::XL);
        })
        .response;
    (resp, action_clicked)
}

/// An informational or warning banner across a view.
pub fn banner(ui: &mut egui::Ui, tone: Tone, message: &str) -> egui::Response {
    let (fg, bg) = tone_colors(tone);
    let padding = egui::vec2(spacing::MD, spacing::SM);
    let font_id = egui::FontId::new(typography::BODY, egui::FontFamily::Proportional);
    let galley = ui
        .painter()
        .layout_no_wrap(message.to_string(), font_id, fg);
    let width = ui.available_width().max(galley.size().x + padding.x * 2.0);
    let size = egui::vec2(width, galley.size().y + padding.y * 2.0);

    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        ui.painter().rect(
            rect,
            CornerRadius::same(radius::SM as u8),
            bg,
            Stroke::new(1.0_f32, fg),
            egui::StrokeKind::Inside,
        );
        ui.painter().galley(rect.min + padding, galley, fg);
    }
    let name = message.to_string();
    response.widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name.clone()));
    response
}

/// A toolbar button with an accessible label.
pub fn toolbar_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let resp = ui.button(label);
    let name = label.to_string();
    resp.widget_info(move || WidgetInfo::labeled(WidgetType::Button, true, name.clone()));
    resp
}

/// The four honest-label treatments (PH-10, A-VIS-04).
/// None shares a colour, shape or word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HonestTreatment {
    /// Validator outcome: strictly unavailable / verified (when from ULOS).
    ValidatorOutcome,
    /// Quick check: pattern match, unverified.
    QuickCheck,
    /// Advisory score: heuristic rank.
    AdvisoryScore,
    /// Advocate attestation: human signed.
    Attestation,
}

pub fn honest_treatment(ui: &mut egui::Ui, treatment: HonestTreatment) -> egui::Response {
    let padding = egui::vec2(spacing::MD, spacing::XS);
    let (text, fg, bg, stroke_color, corner_radius) = match treatment {
        HonestTreatment::ValidatorOutcome => (
            "verification: unavailable",
            colors::TEXT_SECONDARY,
            colors::SURFACE,
            colors::BORDER,
            CornerRadius::same(radius::FULL as u8),
        ),
        HonestTreatment::QuickCheck => (
            "pattern check",
            colors::WARNING,
            colors::WARNING_BG,
            colors::WARNING,
            CornerRadius::ZERO,
        ),
        HonestTreatment::AdvisoryScore => (
            "score 84%",
            colors::ACCENT,
            colors::ACCENT_LIGHT,
            colors::ACCENT,
            CornerRadius::same(radius::SM as u8),
        ),
        HonestTreatment::Attestation => (
            "attested by advocate",
            Color32::from_rgb(170, 100, 240),
            Color32::from_rgb(45, 25, 60),
            Color32::from_rgb(170, 100, 240),
            CornerRadius::same(radius::MD as u8),
        ),
    };
    let font_id = egui::FontId::new(typography::CAPTION, egui::FontFamily::Proportional);
    let galley = ui.painter().layout_no_wrap(text.to_string(), font_id, fg);
    let size = galley.size() + padding * 2.0;

    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        ui.painter().rect(
            rect,
            corner_radius,
            bg,
            Stroke::new(1.0_f32, stroke_color),
            egui::StrokeKind::Inside,
        );
        ui.painter().galley(rect.min + padding, galley, fg);
    }
    let name = text.to_string();
    response.widget_info(move || WidgetInfo::labeled(WidgetType::Label, true, name.clone()));
    response
}
