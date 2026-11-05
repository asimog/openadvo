//! The chat pane (spec D, A07): the one orchestrator, following the open matter.
//!
//! Provides the chat pane UI: header (matter, run state, plan step, cost),
//! transcript (instructions, answers, tool cards), instruction box, and waiting strip.

use crate::views::{Subject, ViewId};
use eframe::egui::{self, CornerRadius, Key, Stroke, WidgetInfo, WidgetType};
use oa_protocol::Request;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::ui::theme::{colors, radius, spacing, typography};
use crate::ui::widgets::{badge, status_chip, Tone};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunState {
    Idle,
    Running,
    WaitingOnYou,
    Stopped,
    Failed,
}

impl RunState {
    pub fn as_str(self) -> &'static str {
        match self {
            RunState::Idle => "idle",
            RunState::Running => "running",
            RunState::WaitingOnYou => "waiting on you",
            RunState::Stopped => "stopped",
            RunState::Failed => "failed",
        }
    }

    pub fn tone(self) -> Tone {
        match self {
            RunState::Idle => Tone::Muted,
            RunState::Running => Tone::Good,
            RunState::WaitingOnYou => Tone::Warning,
            RunState::Stopped => Tone::Warning,
            RunState::Failed => Tone::Bad,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolCardData {
    pub id: String,
    pub class: String,
    pub name: String,
    pub args: Value,
    pub result_preview: String,
    pub full_result: String,
    pub effect_state: String,
    pub referenced_record: Option<(String, String)>, // (matter, id)
}

#[derive(Debug, Clone, PartialEq)]
pub enum TranscriptItem {
    Instruction { text: String, turn: u64 },
    Answer { text: String, streaming: bool },
    ToolCard(ToolCardData),
}

#[derive(Debug, Clone, PartialEq)]
pub struct WaitingGateItem {
    pub id: String,
    pub title: String,
    pub gate: String,
    pub target: String,
}

#[derive(Debug, Clone)]
pub struct MatterRun {
    pub matter: String,
    pub state: RunState,
    pub plan_step: Option<String>,
    pub cost_cents: u64,
    pub transcript: Vec<TranscriptItem>,
    pub waiting_gates: Vec<WaitingGateItem>,
}

impl MatterRun {
    pub fn new(matter: String) -> Self {
        MatterRun {
            matter,
            state: RunState::Idle,
            plan_step: None,
            cost_cents: 0,
            transcript: Vec::new(),
            waiting_gates: Vec::new(),
        }
    }
}

pub struct ChatOutput {
    pub issued_request: Option<Request>,
    pub inspect_subject: Option<Subject>,
    pub open_gate_in_view: Option<(ViewId, String)>,
    pub open_referenced_record: Option<(String, String)>,
}

pub struct ChatPane {
    runs: BTreeMap<String, MatterRun>,
    active_matter: Option<String>,
    pub input_text: String,
    pub selection_context: Option<String>,
}

impl Default for ChatPane {
    fn default() -> Self {
        Self::new()
    }
}

impl ChatPane {
    pub fn new() -> Self {
        ChatPane {
            runs: BTreeMap::new(),
            active_matter: None,
            input_text: String::new(),
            selection_context: None,
        }
    }

    pub fn set_matter(&mut self, matter: Option<&str>) {
        if self.active_matter.as_deref() != matter {
            self.active_matter = matter.map(str::to_string);
            if let Some(m) = matter {
                if !self.runs.contains_key(m) {
                    self.runs
                        .insert(m.to_string(), MatterRun::new(m.to_string()));
                }
            }
        }
    }

    pub fn get_active_run_mut(&mut self) -> Option<&mut MatterRun> {
        let m = self.active_matter.clone()?;
        Some(
            self.runs
                .entry(m.clone())
                .or_insert_with(|| MatterRun::new(m)),
        )
    }

    pub fn get_active_run(&self) -> Option<&MatterRun> {
        let m = self.active_matter.as_ref()?;
        self.runs.get(m)
    }

    pub fn add_run_fixture(&mut self, run: MatterRun) {
        let m = run.matter.clone();
        self.runs.insert(m.clone(), run);
        self.active_matter = Some(m);
    }

    pub fn show(&mut self, ui: &mut egui::Ui, current_matter: Option<&str>) -> ChatOutput {
        self.set_matter(current_matter);

        let mut output = ChatOutput {
            issued_request: None,
            inspect_subject: None,
            open_gate_in_view: None,
            open_referenced_record: None,
        };

        let Some(matter_id) = self.active_matter.clone() else {
            ui.vertical_centered(|ui| {
                ui.add_space(spacing::XL);
                let l = ui.label(
                    egui::RichText::new("Select a matter to start or continue an agent run.")
                        .size(typography::BODY)
                        .color(colors::TEXT_SECONDARY),
                );
                l.widget_info(|| {
                    WidgetInfo::labeled(
                        WidgetType::Label,
                        true,
                        "Select a matter to start or continue an agent run.".to_string(),
                    )
                });
            });
            return output;
        };

        let run = self
            .runs
            .entry(matter_id.clone())
            .or_insert_with(|| MatterRun::new(matter_id.clone()));

        ui.vertical(|ui| {
            // 1. Header (Matter, Run state, plan step, cost so far, cancel button)
            ui.scope(|ui| {
                egui::Frame::NONE
                    .fill(colors::SURFACE)
                    .inner_margin(spacing::SM)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let title_lbl = ui.label(
                                egui::RichText::new(format!("Agent: {matter_id}"))
                                    .size(typography::STRONG)
                                    .color(colors::TEXT_PRIMARY)
                                    .strong(),
                            );
                            let t_text = format!("Agent for matter {matter_id}");
                            title_lbl.widget_info(move || {
                                WidgetInfo::labeled(WidgetType::Label, true, t_text.clone())
                            });

                            // Run state chip
                            status_chip(ui, run.state.as_str(), run.state.tone());

                            // Cost
                            let cost_str = format!("${:.2}", run.cost_cents as f64 / 100.0);
                            let cost_lbl = ui.label(
                                egui::RichText::new(&cost_str)
                                    .size(typography::CAPTION)
                                    .color(colors::TEXT_SECONDARY),
                            );
                            let c_name = format!("Cost: {cost_str}");
                            cost_lbl.widget_info(move || {
                                WidgetInfo::labeled(WidgetType::Label, true, c_name.clone())
                            });

                            // Plan step if present
                            if let Some(ref step) = run.plan_step {
                                let step_lbl = ui.label(
                                    egui::RichText::new(format!("Step: {step}"))
                                        .size(typography::CAPTION)
                                        .color(colors::ACCENT),
                                );
                                let s_name = format!("Current plan step: {step}");
                                step_lbl.widget_info(move || {
                                    WidgetInfo::labeled(WidgetType::Label, true, s_name.clone())
                                });
                            }

                            // Cancel button when running (D-GUI-04)
                            if run.state == RunState::Running {
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        let cancel_btn = ui.add(
                                            egui::Button::new(
                                                egui::RichText::new("Cancel")
                                                    .size(typography::CAPTION)
                                                    .color(colors::BAD),
                                            )
                                            .corner_radius(CornerRadius::same(radius::SM as u8)),
                                        );
                                        cancel_btn.widget_info(|| {
                                            WidgetInfo::labeled(
                                                WidgetType::Button,
                                                true,
                                                "Cancel agent run".to_string(),
                                            )
                                        });

                                        if cancel_btn.clicked() {
                                            run.state = RunState::Idle;
                                            output.issued_request = Some(Request::AgentCancel {
                                                matter: matter_id.clone(),
                                            });
                                        }
                                    },
                                );
                            }
                        });
                    });
            });

            ui.separator();

            // 2. Waiting strip (D-GUI-05: gates this run is blocked on)
            if !run.waiting_gates.is_empty() {
                ui.scope(|ui| {
                    egui::Frame::NONE
                        .fill(colors::WARNING_BG)
                        .stroke(Stroke::new(1.0_f32, colors::WARNING))
                        .corner_radius(CornerRadius::same(radius::SM as u8))
                        .inner_margin(spacing::SM)
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                let w_lbl = ui.label(
                                    egui::RichText::new("Waiting on you:")
                                        .size(typography::CAPTION)
                                        .color(colors::WARNING)
                                        .strong(),
                                );
                                w_lbl.widget_info(|| {
                                    WidgetInfo::labeled(
                                        WidgetType::Label,
                                        true,
                                        "Waiting on you strip".to_string(),
                                    )
                                });

                                for gate in &run.waiting_gates {
                                    let btn_text = format!("Open Gate: {}", gate.title);
                                    let g_btn = ui.button(&btn_text);
                                    let b_name = btn_text.clone();
                                    g_btn.widget_info(move || {
                                        WidgetInfo::labeled(
                                            WidgetType::Button,
                                            true,
                                            b_name.clone(),
                                        )
                                    });

                                    // Clicking gate in waiting strip opens gate's human control in the view pane, NEVER in chat pane (D-GUI-05)
                                    if g_btn.clicked() {
                                        let target_view = match gate.gate.as_str() {
                                            "approval.decide" => ViewId::Approvals,
                                            "ocr.decide" | "ocr.typed_copy" => ViewId::OcrReview,
                                            "notebook.confirm"
                                            | "notebook.skip"
                                            | "notebook.date_anchor" => ViewId::Notebook,
                                            "draft.accept" | "draft.reject" => ViewId::Drafts,
                                            "browser.attach" => ViewId::Browser,
                                            "matter.confirm" => ViewId::Matters,
                                            _ => ViewId::Approvals,
                                        };
                                        output.open_gate_in_view =
                                            Some((target_view, gate.id.clone()));
                                    }
                                }
                            });
                        });
                });
                ui.add_space(spacing::XS);
            }

            // 3. Transcript
            let available_height = (ui.available_height() - 70.0).max(100.0);
            egui::ScrollArea::vertical()
                .max_height(available_height)
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for item in &run.transcript {
                        match item {
                            TranscriptItem::Instruction { text, turn } => {
                                ui.scope(|ui| {
                                    egui::Frame::NONE
                                        .fill(colors::ACCENT_LIGHT)
                                        .corner_radius(CornerRadius::same(radius::SM as u8))
                                        .inner_margin(spacing::SM)
                                        .show(ui, |ui| {
                                            ui.vertical(|ui| {
                                                let h = ui.label(
                                                    egui::RichText::new(format!(
                                                        "Instruction (turn {turn}):"
                                                    ))
                                                    .size(typography::CAPTION)
                                                    .color(colors::ACCENT)
                                                    .strong(),
                                                );
                                                h.widget_info(|| {
                                                    WidgetInfo::labeled(
                                                        WidgetType::Label,
                                                        true,
                                                        "Instruction header".to_string(),
                                                    )
                                                });

                                                let body = ui.label(
                                                    egui::RichText::new(text)
                                                        .size(typography::BODY)
                                                        .color(colors::TEXT_PRIMARY),
                                                );
                                                let t = text.clone();
                                                body.widget_info(move || {
                                                    WidgetInfo::labeled(
                                                        WidgetType::Label,
                                                        true,
                                                        t.clone(),
                                                    )
                                                });
                                            });
                                        });
                                });
                                ui.add_space(spacing::SM);
                            }
                            TranscriptItem::Answer { text, streaming } => {
                                ui.scope(|ui| {
                                    egui::Frame::NONE
                                        .fill(colors::PANEL)
                                        .corner_radius(CornerRadius::same(radius::SM as u8))
                                        .inner_margin(spacing::SM)
                                        .show(ui, |ui| {
                                            ui.vertical(|ui| {
                                                let title = if *streaming {
                                                    "Agent (streaming...)"
                                                } else {
                                                    "Agent:"
                                                };
                                                let h = ui.label(
                                                    egui::RichText::new(title)
                                                        .size(typography::CAPTION)
                                                        .color(colors::TEXT_SECONDARY)
                                                        .italics(),
                                                );
                                                h.widget_info(|| {
                                                    WidgetInfo::labeled(
                                                        WidgetType::Label,
                                                        true,
                                                        "Agent response header".to_string(),
                                                    )
                                                });

                                                let body = ui.label(
                                                    egui::RichText::new(text)
                                                        .size(typography::BODY)
                                                        .color(colors::TEXT_PRIMARY),
                                                );
                                                let t = text.clone();
                                                body.widget_info(move || {
                                                    WidgetInfo::labeled(
                                                        WidgetType::Label,
                                                        true,
                                                        t.clone(),
                                                    )
                                                });
                                            });
                                        });
                                });
                                ui.add_space(spacing::SM);
                            }
                            TranscriptItem::ToolCard(card) => {
                                // Tool card in transcript (D-GUI-03)
                                ui.scope(|ui| {
                                    egui::Frame::NONE
                                        .fill(colors::ELEMENT)
                                        .stroke(Stroke::new(1.0_f32, colors::BORDER))
                                        .corner_radius(CornerRadius::same(radius::MD as u8))
                                        .inner_margin(spacing::SM)
                                        .show(ui, |ui| {
                                            ui.vertical(|ui| {
                                                ui.horizontal(|ui| {
                                                    badge(ui, &card.class, Tone::Muted);
                                                    let title = ui.label(
                                                        egui::RichText::new(&card.name)
                                                            .size(typography::STRONG)
                                                            .color(colors::TEXT_PRIMARY),
                                                    );
                                                    let n = card.name.clone();
                                                    title.widget_info(move || {
                                                        WidgetInfo::labeled(
                                                            WidgetType::Label,
                                                            true,
                                                            n.clone(),
                                                        )
                                                    });

                                                    badge(ui, &card.effect_state, Tone::Good);
                                                });

                                                ui.add_space(spacing::XS);

                                                let prev_lbl = ui.label(
                                                    egui::RichText::new(&card.result_preview)
                                                        .size(typography::CAPTION)
                                                        .color(colors::TEXT_SECONDARY),
                                                );
                                                let rp = card.result_preview.clone();
                                                prev_lbl.widget_info(move || {
                                                    WidgetInfo::labeled(
                                                        WidgetType::Label,
                                                        true,
                                                        rp.clone(),
                                                    )
                                                });

                                                ui.horizontal(|ui| {
                                                    // Clicking tool card opens Inspector (D-GUI-03)
                                                    let insp_btn = ui.button("Inspect Tool Card");
                                                    let b_name = format!("Inspect {}", card.name);
                                                    insp_btn.widget_info(move || {
                                                        WidgetInfo::labeled(
                                                            WidgetType::Button,
                                                            true,
                                                            b_name.clone(),
                                                        )
                                                    });
                                                    if insp_btn.clicked() {
                                                        output.inspect_subject =
                                                            Some(Subject::Record {
                                                                matter: matter_id.clone(),
                                                                id: card.id.clone(),
                                                            });
                                                    }

                                                    // Referenced record link opens in view pane (D-GUI-03)
                                                    if let Some((ref rec_matter, ref rec_id)) =
                                                        card.referenced_record
                                                    {
                                                        let link_text =
                                                            format!("Open Record: {rec_id}");
                                                        let rec_btn = ui.link(&link_text);
                                                        let r_name = link_text.clone();
                                                        rec_btn.widget_info(move || {
                                                            WidgetInfo::labeled(
                                                                WidgetType::Button,
                                                                true,
                                                                r_name.clone(),
                                                            )
                                                        });
                                                        if rec_btn.clicked() {
                                                            output.open_referenced_record = Some((
                                                                rec_matter.clone(),
                                                                rec_id.clone(),
                                                            ));
                                                        }
                                                    }
                                                });
                                            });
                                        });
                                });
                                ui.add_space(spacing::SM);
                            }
                        }
                    }
                });

            ui.separator();

            // 4. Instruction box (D-GUI-01)
            ui.scope(|ui| {
                if let Some(ref sel) = self.selection_context {
                    ui.horizontal(|ui| {
                        let ctx_lbl = ui.label(
                            egui::RichText::new(format!("Context: {sel}"))
                                .size(typography::CAPTION)
                                .color(colors::ACCENT),
                        );
                        let ctx_n = format!("Context: {sel}");
                        ctx_lbl.widget_info(move || {
                            WidgetInfo::labeled(WidgetType::Label, true, ctx_n.clone())
                        });
                    });
                }

                ui.horizontal(|ui| {
                    let text_edit = egui::TextEdit::singleline(&mut self.input_text)
                        .hint_text("Instruct orchestrator (Enter to send)...")
                        .desired_width((ui.available_width() - 80.0).max(100.0));
                    let input_resp = ui.add(text_edit);
                    input_resp.widget_info(|| {
                        WidgetInfo::labeled(
                            WidgetType::TextEdit,
                            true,
                            "Instruction input".to_string(),
                        )
                    });

                    let send_clicked = ui.button("Send").clicked();
                    let enter_pressed =
                        input_resp.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter));

                    if (send_clicked || enter_pressed) && !self.input_text.trim().is_empty() {
                        let text = self.input_text.trim().to_string();
                        self.input_text.clear();

                        let turn_num = run.transcript.len() as u64 + 1;
                        run.transcript.push(TranscriptItem::Instruction {
                            text: text.clone(),
                            turn: turn_num,
                        });

                        if run.state == RunState::Running {
                            // Mid-run steer (D-GUI-01)
                            output.issued_request = Some(Request::AgentSteer {
                                matter: matter_id.clone(),
                                text,
                            });
                        } else {
                            // Start run (D-GUI-01)
                            run.state = RunState::Running;
                            output.issued_request = Some(Request::AgentRun {
                                matter: matter_id.clone(),
                                instruction: text,
                            });
                        }
                    }
                });
            });
        });

        output
    }
}
