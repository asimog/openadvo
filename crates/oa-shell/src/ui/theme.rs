//! Theme tokens and honest-label treatments (spec A18, PH-10, A-VIS-04).

use eframe::egui::{self, Color32, CornerRadius, FontFamily, FontId, Stroke, TextStyle};

pub mod colors {
    use super::Color32;

    pub const SURFACE: Color32 = Color32::from_rgb(248, 249, 250);
    pub const PANEL: Color32 = Color32::from_rgb(255, 255, 255);
    pub const ELEMENT: Color32 = Color32::from_rgb(241, 243, 245);
    pub const BORDER: Color32 = Color32::from_rgb(222, 226, 230);
    pub const BORDER_STRONG: Color32 = Color32::from_rgb(173, 181, 189);

    pub const TEXT_PRIMARY: Color32 = Color32::from_rgb(33, 37, 41);
    pub const TEXT_SECONDARY: Color32 = Color32::from_rgb(108, 117, 125);
    pub const TEXT_MUTED: Color32 = Color32::from_rgb(173, 181, 189);

    pub const ACCENT: Color32 = Color32::from_rgb(37, 99, 235);
    pub const ACCENT_LIGHT: Color32 = Color32::from_rgb(239, 246, 255);

    pub const GOOD: Color32 = Color32::from_rgb(22, 101, 52);
    pub const GOOD_BG: Color32 = Color32::from_rgb(240, 253, 244);

    pub const BAD: Color32 = Color32::from_rgb(185, 28, 28);
    pub const BAD_BG: Color32 = Color32::from_rgb(254, 242, 242);

    pub const WARNING: Color32 = Color32::from_rgb(180, 83, 9);
    pub const WARNING_BG: Color32 = Color32::from_rgb(254, 252, 232);

    pub const MUTED: Color32 = Color32::from_rgb(100, 116, 139);
    pub const MUTED_BG: Color32 = Color32::from_rgb(241, 245, 249);
}

pub mod spacing {
    pub const XS: f32 = 4.0;
    pub const SM: f32 = 8.0;
    pub const MD: f32 = 12.0;
    pub const LG: f32 = 16.0;
    pub const XL: f32 = 24.0;
}

pub mod radius {
    pub const SM: f32 = 3.0;
    pub const MD: f32 = 6.0;
    pub const LG: f32 = 8.0;
    pub const FULL: f32 = 999.0;
}

pub mod typography {
    pub const CAPTION: f32 = 11.0;
    pub const BODY: f32 = 13.0;
    pub const STRONG: f32 = 13.0;
    pub const H3: f32 = 15.0;
    pub const H2: f32 = 18.0;
    pub const H1: f32 = 22.0;
}

/// The four honest-label treatments (spec README convention 7, A-VIS-04).
/// None shares a colour, shape or word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HonestLabel {
    /// 1. Validator outcome: solid purple rectangular pill.
    ///    Words: "verified", "failed", "unresolved", "unavailable".
    ValidatorOutcome(&'static str),

    /// 2. Quick check: cyan rounded tag with dashed border.
    ///    Words: "found", "not_found", "mismatch", "unavailable".
    QuickCheck(&'static str),

    /// 3. Advisory score: amber bevel badge.
    ///    Words: "advisory: <score>".
    AdvisoryScore(&'static str),

    /// 4. Advocate attestation: emerald double-bordered badge.
    ///    Word: "advocate-attested".
    AdvocateAttestation,
}

impl HonestLabel {
    /// Renders the honest label into an egui UI.
    pub fn show(&self, ui: &mut egui::Ui) -> egui::Response {
        let (_rect, response) = match self {
            HonestLabel::ValidatorOutcome(outcome) => {
                let text = format!("[V] {outcome}");
                let font_id = FontId::new(typography::CAPTION, FontFamily::Proportional);
                let text_color = Color32::from_rgb(109, 40, 217); // Purple
                let bg_color = Color32::from_rgb(245, 243, 255);
                let border_color = Color32::from_rgb(139, 92, 246);

                let padding = egui::vec2(spacing::SM, spacing::XS);
                let galley = ui.painter().layout_no_wrap(text, font_id, text_color);
                let size = galley.size() + padding * 2.0;
                let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());

                ui.painter().rect(
                    rect,
                    CornerRadius::same(radius::SM as u8),
                    bg_color,
                    Stroke::new(1.5_f32, border_color),
                    egui::StrokeKind::Inside,
                );
                ui.painter().galley(rect.min + padding, galley, text_color);
                (rect, resp)
            }
            HonestLabel::QuickCheck(result) => {
                let text = format!("~QC: {result}");
                let font_id = FontId::new(typography::CAPTION, FontFamily::Proportional);
                let text_color = Color32::from_rgb(14, 116, 144); // Cyan
                let bg_color = Color32::from_rgb(236, 254, 255);
                let border_color = Color32::from_rgb(6, 182, 212);

                let padding = egui::vec2(spacing::SM, spacing::XS);
                let galley = ui.painter().layout_no_wrap(text, font_id, text_color);
                let size = galley.size() + padding * 2.0;
                let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());

                // Rounded tag
                ui.painter().rect(
                    rect,
                    CornerRadius::same(radius::MD as u8),
                    bg_color,
                    Stroke::new(1.0_f32, border_color),
                    egui::StrokeKind::Inside,
                );
                ui.painter().galley(rect.min + padding, galley, text_color);
                (rect, resp)
            }
            HonestLabel::AdvisoryScore(score) => {
                let text = format!("advisory: {score}");
                let font_id = FontId::new(typography::CAPTION, FontFamily::Proportional);
                let text_color = Color32::from_rgb(180, 83, 9); // Amber
                let bg_color = Color32::from_rgb(254, 243, 199);
                let border_color = Color32::from_rgb(245, 158, 11);

                let padding = egui::vec2(spacing::SM, spacing::XS);
                let galley = ui.painter().layout_no_wrap(text, font_id, text_color);
                let size = galley.size() + padding * 2.0;
                let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());

                // Bevel / chamfer look with flat edges
                ui.painter().rect(
                    rect,
                    CornerRadius::ZERO,
                    bg_color,
                    Stroke::new(1.5_f32, border_color),
                    egui::StrokeKind::Inside,
                );
                ui.painter().galley(rect.min + padding, galley, text_color);
                (rect, resp)
            }
            HonestLabel::AdvocateAttestation => {
                let text = "* advocate-attested";
                let font_id = FontId::new(typography::CAPTION, FontFamily::Proportional);
                let text_color = Color32::from_rgb(4, 120, 87); // Emerald
                let bg_color = Color32::from_rgb(236, 253, 245);
                let border_color = Color32::from_rgb(16, 185, 129);

                let padding = egui::vec2(spacing::SM, spacing::XS);
                let galley = ui
                    .painter()
                    .layout_no_wrap(text.to_string(), font_id, text_color);
                let size = galley.size() + padding * 2.0;
                let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());

                // Double outline effect
                ui.painter().rect(
                    rect,
                    CornerRadius::same(radius::LG as u8),
                    bg_color,
                    Stroke::new(1.0_f32, border_color),
                    egui::StrokeKind::Inside,
                );
                let inner = rect.shrink(2.0);
                ui.painter().rect(
                    inner,
                    CornerRadius::same(radius::MD as u8),
                    Color32::TRANSPARENT,
                    Stroke::new(1.0_f32, border_color),
                    egui::StrokeKind::Inside,
                );
                ui.painter().galley(rect.min + padding, galley, text_color);
                (rect, resp)
            }
        };

        response
    }
}

pub fn apply(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::light();
    visuals.window_fill = colors::PANEL;
    visuals.panel_fill = colors::SURFACE;
    visuals.extreme_bg_color = colors::SURFACE;
    visuals.widgets.noninteractive.bg_fill = colors::SURFACE;
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0_f32, colors::BORDER);
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0_f32, colors::TEXT_PRIMARY);

    visuals.widgets.inactive.bg_fill = colors::PANEL;
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0_f32, colors::BORDER);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0_f32, colors::TEXT_PRIMARY);
    visuals.widgets.inactive.corner_radius = CornerRadius::same(radius::SM as u8);

    visuals.widgets.hovered.bg_fill = colors::ELEMENT;
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, colors::BORDER_STRONG);
    visuals.widgets.hovered.fg_stroke = Stroke::new(1.0_f32, colors::TEXT_PRIMARY);

    visuals.widgets.active.bg_fill = colors::ACCENT_LIGHT;
    visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, colors::ACCENT);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0_f32, colors::ACCENT);

    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    style.text_styles = [
        (
            TextStyle::Heading,
            FontId::new(typography::H2, FontFamily::Proportional),
        ),
        (
            TextStyle::Body,
            FontId::new(typography::BODY, FontFamily::Proportional),
        ),
        (
            TextStyle::Monospace,
            FontId::new(typography::BODY, FontFamily::Monospace),
        ),
        (
            TextStyle::Button,
            FontId::new(typography::BODY, FontFamily::Proportional),
        ),
        (
            TextStyle::Small,
            FontId::new(typography::CAPTION, FontFamily::Proportional),
        ),
    ]
    .into();
    ctx.set_style(style);
}
