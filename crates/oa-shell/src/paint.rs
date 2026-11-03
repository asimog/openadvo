//! Painting shared by the live panes and the galleries. egui lives here and in
//! `main.rs` and `gallery.rs`; everything it paints comes from `views`.

use eframe::egui::{self, Color32, RichText};

use crate::views::{Table, Tone, ViewState};

pub fn tone_color(tone: Tone, ui: &egui::Ui) -> Color32 {
    let dark = ui.visuals().dark_mode;
    match (tone, dark) {
        (Tone::Normal, _) => ui.visuals().text_color(),
        (Tone::Good, false) => Color32::from_rgb(20, 120, 50),
        (Tone::Good, true) => Color32::from_rgb(110, 210, 140),
        (Tone::Warn, false) => Color32::from_rgb(160, 90, 0),
        (Tone::Warn, true) => Color32::from_rgb(240, 180, 80),
        (Tone::Bad, false) => Color32::from_rgb(180, 30, 30),
        (Tone::Bad, true) => Color32::from_rgb(255, 120, 120),
        (Tone::Muted, _) => ui.visuals().weak_text_color(),
    }
}

/// Paints a table in its state. Returns the row the advocate opened (click or
/// Enter), which the caller sends to the Inspector.
pub fn table(
    ui: &mut egui::Ui,
    id: impl std::hash::Hash,
    t: &Table,
    selected: &mut Option<usize>,
) -> Option<usize> {
    match &t.state {
        ViewState::Loading => {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Loading...");
            });
            return None;
        }
        ViewState::Error(m) => {
            ui.colored_label(tone_color(Tone::Bad, ui), format!("Error: {m}"));
            return None;
        }
        ViewState::Empty(m) => {
            ui.label(RichText::new(m).weak());
            return None;
        }
        ViewState::Ready => {}
    }
    if let Some((tone, text)) = &t.banner {
        ui.colored_label(tone_color(*tone, ui), text);
    }
    let mut opened = None;
    let n = t.rows.len();
    if ui.input(|i| i.key_pressed(egui::Key::ArrowDown)) && n > 0 {
        *selected = Some(selected.map_or(0, |s| (s + 1).min(n - 1)));
    }
    if ui.input(|i| i.key_pressed(egui::Key::ArrowUp)) && n > 0 {
        *selected = Some(selected.map_or(0, |s| s.saturating_sub(1)));
    }
    egui::ScrollArea::both()
        .id_salt(egui::Id::new(&id).with("scroll"))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new(egui::Id::new(&id).with("grid"))
                .striped(true)
                .num_columns(t.columns.len())
                .show(ui, |ui| {
                    for c in &t.columns {
                        ui.label(RichText::new(*c).strong());
                    }
                    ui.end_row();
                    for (i, row) in t.rows.iter().enumerate() {
                        let color = tone_color(row.tone, ui);
                        for (col, cell) in row.cells.iter().enumerate() {
                            let text = RichText::new(cell).color(color);
                            if col == 0 {
                                let resp = ui
                                    .selectable_label(*selected == Some(i), text)
                                    .on_hover_text("Click to inspect");
                                if resp.clicked() {
                                    *selected = Some(i);
                                    opened = Some(i);
                                }
                            } else {
                                ui.label(text);
                            }
                        }
                        ui.end_row();
                    }
                });
        });
    if ui.input(|i| i.key_pressed(egui::Key::Enter)) && opened.is_none() {
        opened = *selected;
    }
    opened
}

pub fn overview(ui: &mut egui::Ui, lines: &[(String, String)]) {
    egui::Grid::new("overview").striped(true).show(ui, |ui| {
        for (k, v) in lines {
            ui.label(RichText::new(k).strong());
            if v == "missing" {
                ui.label(
                    RichText::new("missing")
                        .italics()
                        .color(tone_color(Tone::Warn, ui)),
                );
            } else {
                ui.label(v);
            }
            ui.end_row();
        }
    });
}
