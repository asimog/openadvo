//! `oa-shell`: the advocate's window (spec A). It holds no canonical state.
//! Every action is a control command sent over the pipe to the kernel, the
//! same commands the agent and the CLI issue (spec A rule 6). If no kernel is
//! serving, the shell starts `oa kernel serve` beside itself (a stub until the
//! supervisor, D15).

mod model;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use eframe::egui;
use model::{inbox, matter_label, matters, InboxItem, MatterItem, Pane};
use oa_client::{Client, PipeClient};
use oa_kernel::{ClientSpec, Request};
use oa_types::{new_key, OaError, Origin};
use serde_json::Value;

fn app_data() -> PathBuf {
    std::env::var_os("OA_APP_DATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("OpenAdvocate")))
        .unwrap_or_else(|| PathBuf::from(".openadvocate"))
}

/// Connects to the kernel, starting one if none is serving.
fn connect(app: &PathBuf) -> Result<(PipeClient, Option<Child>), OaError> {
    if let Ok(c) = PipeClient::connect(app, Origin::Ui) {
        return Ok((c, None));
    }
    let oa = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|d| d.join("oa.exe")))
        .unwrap_or_else(|| PathBuf::from("oa"));
    let child = Command::new(oa)
        .arg("--app-data")
        .arg(app)
        .args(["kernel", "serve"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            OaError::new(
                oa_types::ErrorCode::Unavailable,
                format!("cannot start the kernel: {e}"),
            )
        })?;
    PipeClient::connect(app, Origin::Ui).map(|c| (c, Some(child)))
}

struct Shell {
    client: Option<PipeClient>,
    kernel_child: Option<Child>,
    status: String,
    matters: Vec<MatterItem>,
    inbox: Vec<InboxItem>,
    selected: Option<String>,
    include_removed: bool,
    new_title: String,
    rename_to: String,
    palette_open: bool,
    palette_filter: String,
    focus: Pane,
}

impl Shell {
    fn new() -> Self {
        let mut shell = Shell {
            client: None,
            kernel_child: None,
            status: String::new(),
            matters: Vec::new(),
            inbox: Vec::new(),
            selected: None,
            include_removed: false,
            new_title: String::new(),
            rename_to: String::new(),
            palette_open: false,
            palette_filter: String::new(),
            focus: Pane::Files,
        };
        match connect(&app_data()) {
            Ok((c, child)) => {
                shell.client = Some(c);
                shell.kernel_child = child;
                shell.refresh();
            }
            Err(e) => shell.status = format!("Disconnected: {}", e.message),
        }
        shell
    }

    fn call(&mut self, req: Request) -> Option<Vec<Value>> {
        let Some(client) = &self.client else {
            self.status = "Disconnected from the kernel".into();
            return None;
        };
        match client.call(Some(new_key()), req) {
            Ok(v) => Some(v),
            Err(e) => {
                self.status = format!("{}: {}", e.code.as_str(), e.message);
                None
            }
        }
    }

    fn refresh(&mut self) {
        let include_removed = self.include_removed;
        let listed = self.call(Request::MatterList {
            include_removed: true,
        });
        let all = listed.map(|v| matters(&v)).unwrap_or_default();
        let rejected = self
            .call(Request::AuditRejected { matter: None })
            .unwrap_or_default();
        self.inbox = inbox(&all, &rejected);
        self.matters = all
            .into_iter()
            .filter(|m| include_removed || !m.removed)
            .collect();
    }

    fn selected_matter(&self) -> Option<&MatterItem> {
        let id = self.selected.as_deref()?;
        self.matters.iter().find(|m| m.id == id)
    }

    fn files_pane(&mut self, ui: &mut egui::Ui) {
        ui.heading(Pane::Files.title());
        ui.horizontal(|ui| {
            if ui.button("Refresh").clicked() {
                self.refresh();
            }
            if ui
                .checkbox(&mut self.include_removed, "Show removed")
                .changed()
            {
                self.refresh();
            }
        });
        ui.separator();
        let mut clicked = None;
        egui::ScrollArea::vertical().show(ui, |ui| {
            for m in &self.matters {
                let selected = self.selected.as_deref() == Some(m.id.as_str());
                if ui.selectable_label(selected, matter_label(m)).clicked() {
                    clicked = Some(m.id.clone());
                }
            }
        });
        if let Some(id) = clicked {
            self.focus = Pane::Matter;
            if let Some(v) = self.call(Request::MatterOpen { id: id.clone() }) {
                self.rename_to = v[0]["title"].as_str().unwrap_or_default().to_string();
                self.selected = Some(id);
            }
        }
        ui.separator();
        ui.label("New matter");
        ui.text_edit_singleline(&mut self.new_title);
        if ui.button("Create").clicked() && !self.new_title.trim().is_empty() {
            let title = std::mem::take(&mut self.new_title);
            if self
                .call(Request::MatterCreate {
                    title,
                    client: ClientSpec::None,
                    from: None,
                })
                .is_some()
            {
                self.refresh();
            }
        }
    }

    fn matter_pane(&mut self, ui: &mut egui::Ui) {
        let Some(m) = self.selected_matter().cloned() else {
            ui.label("Select a matter.");
            return;
        };
        ui.heading(matter_label(&m));
        ui.label(format!("urn:ulos:matter:{}", m.id));
        ui.label(&m.path);
        ui.horizontal(|ui| {
            ui.text_edit_singleline(&mut self.rename_to);
            if ui.button("Rename").clicked() {
                let title = self.rename_to.clone();
                if self
                    .call(Request::MatterRename {
                        id: m.id.clone(),
                        title,
                    })
                    .is_some()
                {
                    self.refresh();
                }
            }
            if !m.archived
                && ui.button("Archive").clicked()
                && self
                    .call(Request::MatterArchive { id: m.id.clone() })
                    .is_some()
            {
                self.refresh();
            }
        });
        ui.separator();
        ui.label("Folders");
        let dir = PathBuf::from(&m.path);
        egui::ScrollArea::vertical().show(ui, |ui| {
            for sub in oa_kernel::SUBDIRS {
                let count = std::fs::read_dir(dir.join(sub))
                    .map(|d| d.count())
                    .unwrap_or(0);
                ui.label(format!("{sub}/  ({count})"));
            }
        });
    }

    fn inbox_pane(&mut self, ui: &mut egui::Ui) {
        ui.heading(format!("{} ({})", Pane::Inbox.title(), self.inbox.len()));
        egui::ScrollArea::vertical().show(ui, |ui| {
            for item in &self.inbox {
                ui.group(|ui| {
                    ui.label(egui::RichText::new(&item.summary).strong());
                    if !item.detail.is_empty() {
                        ui.label(&item.detail);
                    }
                });
            }
        });
    }

    fn palette(&mut self, ctx: &egui::Context) {
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::K)) {
            self.palette_open = !self.palette_open;
        }
        if !self.palette_open {
            return;
        }
        let mut open = self.palette_open;
        egui::Window::new("Commands")
            .open(&mut open)
            .collapsible(false)
            .show(ctx, |ui| {
                ui.text_edit_singleline(&mut self.palette_filter);
                let filter = self.palette_filter.to_lowercase();
                for name in Request::NAMES.iter().filter(|n| n.contains(&filter)) {
                    ui.label(*name);
                }
                ui.small("Every command here is also an `oa` subcommand and an agent tool.");
            });
        self.palette_open = open;
    }
}

impl eframe::App for Shell {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.palette(ctx);
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                let connected = if self.client.is_some() {
                    "Connected"
                } else {
                    "Disconnected"
                };
                ui.label(connected);
                ui.separator();
                ui.label(&self.status);
            });
        });
        egui::SidePanel::left("files")
            .default_width(260.0)
            .show(ctx, |ui| self.files_pane(ui));
        egui::SidePanel::right("inbox")
            .default_width(300.0)
            .show(ctx, |ui| self.inbox_pane(ui));
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                let central = Pane::ALL
                    .into_iter()
                    .filter(|p| !matches!(p, Pane::Files | Pane::Inbox));
                for pane in central {
                    ui.selectable_value(&mut self.focus, pane, pane.title());
                }
            });
            ui.separator();
            match self.focus {
                Pane::Matter | Pane::Files | Pane::Inbox => self.matter_pane(ui),
                other => {
                    ui.label(format!(
                        "{} arrives with spec {}.",
                        other.title(),
                        other.waits_for().unwrap_or("?")
                    ));
                }
            }
        });
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        if let Some(mut child) = self.kernel_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Open Advocate")
            .with_inner_size([1200.0, 760.0]),
        ..Default::default()
    };
    eframe::run_native(
        "Open Advocate",
        options,
        Box::new(|_cc| Ok(Box::new(Shell::new()))),
    )
}
