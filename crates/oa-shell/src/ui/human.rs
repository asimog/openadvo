//! The human command control (spec A18, README convention 4, A-AC-21).
//!
//! A human command is drawn ONLY through this control. It names exactly what is
//! decided, takes no default focus, and has no keyboard shortcut.

use super::theme::{colors, radius, spacing, typography};
use eframe::egui::{self, Color32, CornerRadius, Stroke, WidgetInfo, WidgetType};
use oa_protocol::Request;

/// The human control widget for drawing human-class commands in the window.
pub struct HumanControl<'a> {
    pub decision: &'a str,
    pub description: &'a str,
    pub warning: Option<&'a str>,
}

impl<'a> HumanControl<'a> {
    pub fn new(decision: &'a str, description: &'a str) -> Self {
        HumanControl {
            decision,
            description,
            warning: None,
        }
    }

    pub fn with_warning(mut self, warning: &'a str) -> Self {
        self.warning = Some(warning);
        self
    }

    /// Renders the human control. Returns `Some(request)` when the advocate
    /// explicitly executes the deliberate confirmation gesture.
    ///
    /// Takes NO default focus and binds NO keyboard shortcut.
    pub fn show(
        &self,
        ui: &mut egui::Ui,
        request_factory: impl FnOnce() -> Request,
    ) -> Option<Request> {
        let mut confirmed = None;

        let padding = egui::vec2(spacing::LG, spacing::MD);
        let border_stroke = Stroke::new(1.5_f32, colors::WARNING);
        let bg_fill = colors::WARNING_BG;

        ui.scope(|ui| {
            // Outer frame
            egui::Frame::NONE
                .fill(bg_fill)
                .stroke(border_stroke)
                .corner_radius(CornerRadius::same(radius::MD as u8))
                .inner_margin(padding)
                .show(ui, |ui| {
                    ui.vertical(|ui| {
                        // 1. Explicitly name what is decided
                        let head_resp = ui.label(
                            egui::RichText::new(format!("HUMAN DECISION: {}", self.decision))
                                .size(typography::H3)
                                .color(colors::WARNING)
                                .strong(),
                        );
                        let head_name = format!("Human decision: {}", self.decision);
                        head_resp.widget_info(move || {
                            WidgetInfo::labeled(WidgetType::Label, true, head_name.clone())
                        });

                        ui.add_space(spacing::SM);

                        // 2. Exact description of what is decided
                        let desc_resp = ui.label(
                            egui::RichText::new(self.description)
                                .size(typography::BODY)
                                .color(colors::TEXT_PRIMARY),
                        );
                        let desc_name = self.description.to_string();
                        desc_resp.widget_info(move || {
                            WidgetInfo::labeled(WidgetType::Label, true, desc_name.clone())
                        });

                        if let Some(warn) = self.warning {
                            ui.add_space(spacing::SM);
                            let warn_resp = ui.label(
                                egui::RichText::new(format!("Warning: {warn}"))
                                    .size(typography::CAPTION)
                                    .color(colors::BAD)
                                    .italics(),
                            );
                            let warn_name = warn.to_string();
                            warn_resp.widget_info(move || {
                                WidgetInfo::labeled(WidgetType::Label, true, warn_name.clone())
                            });
                        }

                        ui.add_space(spacing::MD);

                        // 3. Deliberate action button. NO default focus, NO keyboard shortcut.
                        let button_text = format!("Confirm: {}", self.decision);
                        let btn = ui.add(
                            egui::Button::new(
                                egui::RichText::new(&button_text)
                                    .size(typography::BODY)
                                    .color(Color32::WHITE),
                            )
                            .fill(colors::ACCENT)
                            .corner_radius(CornerRadius::same(radius::SM as u8)),
                        );

                        let b_name = button_text.clone();
                        btn.widget_info(move || {
                            WidgetInfo::labeled(WidgetType::Button, true, b_name.clone())
                        });

                        if btn.clicked() {
                            confirmed = Some(request_factory());
                        }
                    });
                });
        });

        confirmed
    }
}

/// The typed action representing human decisions. Encapsulates construction of
/// human-class Requests so that no other module in the shell constructs them directly (A-AC-21).
#[derive(Debug, Clone, PartialEq)]
pub enum HumanAction {
    MatterConfirm {
        pending: String,
    },
    ApprovalDecide {
        matter: String,
        id: String,
        accept: bool,
        reason: String,
    },
    OcrDecide {
        matter: String,
        dispute: String,
        reading: String,
        text: Option<String>,
    },
    OcrTypedCopy {
        matter: String,
        doc: String,
        page: u32,
        text: String,
        typist: String,
    },
    NotebookConfirm {
        matter: String,
        id: String,
    },
    NotebookSkip {
        matter: String,
        review: String,
        reason: String,
    },
    NotebookDateAnchor {
        matter: String,
        doc: String,
        date: String,
    },
    DraftAccept {
        matter: String,
        proposal: String,
    },
    DraftReject {
        matter: String,
        proposal: String,
        reason: Option<String>,
    },
    BrowserAttach {
        matter: String,
    },
}

impl HumanAction {
    pub fn into_request(self) -> Request {
        match self {
            HumanAction::MatterConfirm { pending } => Request::MatterConfirm { pending },
            HumanAction::ApprovalDecide {
                matter,
                id,
                accept,
                reason,
            } => Request::ApprovalDecide {
                matter,
                id,
                accept,
                reason,
            },
            HumanAction::OcrDecide {
                matter,
                dispute,
                reading,
                text,
            } => Request::OcrDecide {
                matter,
                dispute,
                reading,
                text,
            },
            HumanAction::OcrTypedCopy {
                matter,
                doc,
                page,
                text,
                typist,
            } => Request::OcrTypedCopy {
                matter,
                doc,
                page,
                text,
                typist,
            },
            HumanAction::NotebookConfirm { matter, id } => Request::NotebookConfirm { matter, id },
            HumanAction::NotebookSkip {
                matter,
                review,
                reason,
            } => Request::NotebookSkip {
                matter,
                review,
                reason,
            },
            HumanAction::NotebookDateAnchor { matter, doc, date } => {
                Request::NotebookDateAnchor { matter, doc, date }
            }
            HumanAction::DraftAccept { matter, proposal } => {
                Request::DraftAccept { matter, proposal }
            }
            HumanAction::DraftReject {
                matter,
                proposal,
                reason,
            } => Request::DraftReject {
                matter,
                proposal,
                reason,
            },
            HumanAction::BrowserAttach { matter } => Request::BrowserAttach { matter },
        }
    }

    pub fn render(self, ui: &mut egui::Ui) -> Option<Request> {
        let (decision, desc, warn) = match &self {
            HumanAction::MatterConfirm { pending, .. } => (
                "matter.confirm",
                format!("Confirm pending matter {pending}"),
                None,
            ),
            HumanAction::ApprovalDecide { accept, id, .. } => {
                if *accept {
                    ("approval.decide", format!("Approve gate {id}"), None)
                } else {
                    (
                        "approval.decide",
                        format!("Reject gate {id}"),
                        Some("This rejection will be recorded in the audit log."),
                    )
                }
            }
            HumanAction::OcrDecide {
                dispute, reading, ..
            } => (
                "ocr.decide",
                format!("Apply reading '{reading}' for OCR dispute {dispute}"),
                Some("Unresolved OCR disputes flag affected spans as disputed."),
            ),
            HumanAction::OcrTypedCopy { doc, page, .. } => (
                "ocr.typed_copy",
                format!("Submit typed copy replacement for {doc} page {page}"),
                Some("Advocate attestation will be permanently attached."),
            ),
            HumanAction::NotebookConfirm { id, .. } => (
                "notebook.confirm",
                format!("Confirm notebook item {id}"),
                None,
            ),
            HumanAction::NotebookSkip { review, .. } => (
                "notebook.skip",
                format!("Skip review item {review}"),
                Some("Skipped items are excluded from chronology and arguments."),
            ),
            HumanAction::NotebookDateAnchor { date, .. } => (
                "notebook.date_anchor",
                format!("Anchor date to {date}"),
                None,
            ),
            HumanAction::DraftAccept { proposal, .. } => (
                "draft.accept",
                format!("Accept proposal {proposal}"),
                Some("Accepted proposal will be applied to the document draft."),
            ),
            HumanAction::DraftReject { proposal, .. } => (
                "draft.reject",
                format!("Reject proposal {proposal}"),
                Some("Proposal will be rejected and excluded."),
            ),
            HumanAction::BrowserAttach { matter } => (
                "browser.attach",
                format!("Attach external browser session to matter {matter}"),
                Some("External browsing activity may leave local artifacts."),
            ),
        };

        let mut ctrl = HumanControl::new(decision, &desc);
        if let Some(w) = warn {
            ctrl = ctrl.with_warning(w);
        }
        ctrl.show(ui, || self.into_request())
    }
}
