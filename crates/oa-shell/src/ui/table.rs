//! Virtualized table widget with states, keyboard navigation, and inspector hooks (spec A18, PH-10).

use super::theme::{colors, spacing, typography};
use super::widgets::{banner, empty_state, Tone};
use eframe::egui::{self, Color32, Key, Rect, WidgetInfo, WidgetType};
use oa_protocol::Subject;

pub const ROW_HEIGHT: f32 = 28.0;

#[derive(Debug, Clone, PartialEq)]
pub enum TableState {
    Ready,
    Empty(String),
    Loading,
    Error(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct TableRow {
    pub cells: Vec<String>,
    pub subject: Subject,
    pub tone: Tone,
}

pub struct VirtualTable<'a> {
    pub id: &'a str,
    pub columns: &'a [&'a str],
    pub rows: &'a [TableRow],
    pub state: &'a TableState,
    pub banner: Option<(Tone, &'a str)>,
    pub selected: Option<usize>,
}

pub struct TableOutput {
    pub new_selected: Option<usize>,
    pub inspect: Option<Subject>,
}

impl<'a> VirtualTable<'a> {
    pub fn new(
        id: &'a str,
        columns: &'a [&'a str],
        rows: &'a [TableRow],
        state: &'a TableState,
    ) -> Self {
        VirtualTable {
            id,
            columns,
            rows,
            state,
            banner: None,
            selected: None,
        }
    }

    pub fn with_banner(mut self, tone: Tone, message: &'a str) -> Self {
        self.banner = Some((tone, message));
        self
    }

    pub fn with_selected(mut self, selected: Option<usize>) -> Self {
        self.selected = selected;
        self
    }

    pub fn show(self, ui: &mut egui::Ui) -> TableOutput {
        let mut new_selected = self.selected;
        let mut inspect = None;

        // Render banner if present
        if let Some((tone, msg)) = self.banner {
            banner(ui, tone, msg);
            ui.add_space(spacing::SM);
        }

        match self.state {
            TableState::Loading => {
                ui.vertical_centered(|ui| {
                    ui.add_space(spacing::XL);
                    let l = ui.label(
                        egui::RichText::new("Loading...")
                            .size(typography::BODY)
                            .color(colors::TEXT_SECONDARY),
                    );
                    l.widget_info(|| {
                        WidgetInfo::labeled(WidgetType::Label, true, "Loading".to_string())
                    });
                });
                return TableOutput {
                    new_selected,
                    inspect,
                };
            }
            TableState::Error(err) => {
                banner(ui, Tone::Bad, err);
                return TableOutput {
                    new_selected,
                    inspect,
                };
            }
            TableState::Empty(msg) => {
                empty_state(ui, msg, None);
                return TableOutput {
                    new_selected,
                    inspect,
                };
            }
            TableState::Ready => {}
        }

        if self.rows.is_empty() {
            empty_state(ui, "No entries", None);
            return TableOutput {
                new_selected,
                inspect,
            };
        }

        // Keyboard selection
        if ui.input(|i| i.key_pressed(Key::ArrowDown) || i.key_pressed(Key::J)) {
            new_selected = Some(match new_selected {
                Some(idx) => (idx + 1).min(self.rows.len() - 1),
                None => 0,
            });
        }
        if ui.input(|i| i.key_pressed(Key::ArrowUp) || i.key_pressed(Key::K)) {
            new_selected = Some(match new_selected {
                Some(idx) => idx.saturating_sub(1),
                None => 0,
            });
        }
        if ui.input(|i| i.key_pressed(Key::Enter)) {
            if let Some(idx) = new_selected {
                if idx < self.rows.len() {
                    inspect = Some(self.rows[idx].subject.clone());
                }
            }
        }

        // Header
        ui.horizontal(|ui| {
            let col_w = (ui.available_width() / self.columns.len().max(1) as f32).max(80.0);
            for col in self.columns {
                let resp = ui.add_sized(
                    [col_w, ROW_HEIGHT],
                    egui::Label::new(
                        egui::RichText::new(*col)
                            .strong()
                            .color(colors::TEXT_SECONDARY),
                    ),
                );
                let col_name = col.to_string();
                resp.widget_info(move || {
                    WidgetInfo::labeled(WidgetType::Label, true, col_name.clone())
                });
            }
        });
        ui.separator();

        // Virtualized rows scroll area
        let total_rows = self.rows.len();
        egui::ScrollArea::vertical()
            .auto_shrink([false; 2])
            .show_rows(ui, ROW_HEIGHT, total_rows, |ui, row_range| {
                let col_w = (ui.available_width() / self.columns.len().max(1) as f32).max(80.0);
                for idx in row_range {
                    let row = &self.rows[idx];
                    let is_selected = new_selected == Some(idx);
                    let bg = if is_selected {
                        colors::ACCENT_LIGHT
                    } else if idx % 2 == 1 {
                        colors::SURFACE
                    } else {
                        Color32::TRANSPARENT
                    };

                    let row_rect = Rect::from_min_size(
                        ui.cursor().min,
                        egui::vec2(ui.available_width(), ROW_HEIGHT),
                    );
                    if bg != Color32::TRANSPARENT {
                        ui.painter().rect_filled(row_rect, 0.0, bg);
                    }

                    let _resp = ui
                        .horizontal(|ui| {
                            for (c_idx, cell) in row.cells.iter().enumerate() {
                                let text_color = if c_idx == 0 {
                                    colors::ACCENT
                                } else {
                                    colors::TEXT_PRIMARY
                                };
                                ui.add_sized(
                                    [col_w, ROW_HEIGHT],
                                    egui::Label::new(egui::RichText::new(cell).color(text_color)),
                                );
                            }
                        })
                        .response;

                    let interact_resp =
                        ui.interact(row_rect, ui.id().with(idx), egui::Sense::click());
                    if interact_resp.clicked() {
                        new_selected = Some(idx);
                        inspect = Some(row.subject.clone());
                    }

                    let row_name = format!("Row {}: {}", idx + 1, row.cells.join(", "));
                    let resp_with_info = interact_resp;
                    let name = row_name.clone();
                    resp_with_info.widget_info(move || {
                        WidgetInfo::labeled(WidgetType::Button, true, name.clone())
                    });
                }
            });

        TableOutput {
            new_selected,
            inspect,
        }
    }
}
