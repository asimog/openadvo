//! Galleries (spec A17): one view in each fixture state, with no kernel. With
//! `--screenshot <png>` the window captures itself with eframe's own capture
//! and exits, so a gallery can be reviewed without a screen grab.

use std::path::PathBuf;
use std::sync::Arc;

use eframe::egui;

use crate::paint;
use crate::views::{fixture, GalleryState, ViewId};

pub struct Gallery {
    view: ViewId,
    shot: Option<PathBuf>,
    states: Vec<GalleryState>,
    frames: u32,
    requested: bool,
    selected: Vec<Option<usize>>,
}

impl Gallery {
    pub fn new(view: ViewId, shot: Option<PathBuf>, only: Option<String>) -> Self {
        let states: Vec<GalleryState> = GalleryState::ALL
            .into_iter()
            .filter(|s| only.as_deref().is_none_or(|o| o == s.name()))
            .collect();
        Gallery {
            view,
            shot,
            selected: vec![None; states.len()],
            states,
            frames: 0,
            requested: false,
        }
    }
}

fn save_png(path: &PathBuf, image: &Arc<egui::ColorImage>) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    image::save_buffer(
        path,
        image.as_raw(),
        image.width() as u32,
        image.height() as u32,
        image::ColorType::Rgba8,
    )
    .map_err(|e| e.to_string())
}

impl eframe::App for Gallery {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading(format!(
                "Gallery: {}  (fixtures, no kernel)",
                crate::views::def(self.view).title
            ));
            ui.separator();
            let cols = if self.states.len() > 1 { 3 } else { 1 };
            let rows = self.states.len().div_ceil(cols);
            let w = (ui.available_width() - 12.0 * cols as f32) / cols as f32;
            let h = (ui.available_height() - 12.0 * rows as f32) / rows as f32;
            for r in 0..rows {
                ui.horizontal_top(|ui| {
                    for c in 0..cols {
                        let idx = r * cols + c;
                        let Some(state) = self.states.get(idx).copied() else {
                            continue;
                        };
                        ui.allocate_ui(egui::vec2(w, h), |ui| {
                            egui::Frame::group(ui.style()).show(ui, |ui| {
                                ui.set_width(w - 16.0);
                                ui.set_height(h - 16.0);
                                ui.vertical(|ui| {
                                    ui.label(egui::RichText::new(state.name()).strong().small());
                                    let t = fixture(self.view, state);
                                    paint::table(ui, ("gallery", idx), &t, &mut self.selected[idx]);
                                });
                            });
                        });
                    }
                });
            }
        });

        self.frames += 1;
        if let Some(path) = self.shot.clone() {
            if self.frames == 8 && !self.requested {
                self.requested = true;
                ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(egui::UserData::default()));
            }
            let image = ctx.input(|i| {
                i.events.iter().find_map(|e| match e {
                    egui::Event::Screenshot { image, .. } => Some(image.clone()),
                    _ => None,
                })
            });
            if let Some(image) = image {
                match save_png(&path, &image) {
                    Ok(()) => println!("saved {}", path.display()),
                    Err(e) => {
                        eprintln!("cannot save {}: {e}", path.display());
                        std::process::exit(10);
                    }
                }
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
            ctx.request_repaint();
        }
    }
}
