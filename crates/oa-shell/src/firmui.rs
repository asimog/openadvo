//! The spec O controls under the Contacts, Parties and Timeline views:
//! add and edit a contact, open a matter, record a party role, log
//! correspondence. Each control issues one registered command (P9).

use eframe::egui;
use oa_kernel::{ContactInput, Request};

use crate::views::{Subject, ViewId};
use crate::{firmviews, App, Content};

/// What the Contacts, Parties and Timeline controls are editing.
pub(crate) struct FirmForm {
    name: String,
    kind: String,
    source: String,
    phone: String,
    email: String,
    note: String,
    party_contact: String,
    party_role: String,
    party_record: String,
    corr_kind: String,
    corr_summary: String,
    corr_contact: String,
    /// (id, name) of every contact, reloaded at most once per refresh.
    contacts: Vec<(String, String)>,
    contacts_at: Option<u64>,
}

impl Default for FirmForm {
    fn default() -> Self {
        FirmForm {
            name: String::new(),
            kind: "person".into(),
            source: String::new(),
            phone: String::new(),
            email: String::new(),
            note: String::new(),
            party_contact: String::new(),
            party_role: "petitioner".into(),
            party_record: String::new(),
            corr_kind: "call".into(),
            corr_summary: String::new(),
            corr_contact: String::new(),
            contacts: Vec::new(),
            contacts_at: None,
        }
    }
}

fn opt(s: &str) -> Option<String> {
    Some(s.trim().to_string()).filter(|s| !s.is_empty())
}

fn tail(id: &str) -> &str {
    &id[id.len().saturating_sub(6)..]
}

fn contact_combo(
    ui: &mut egui::Ui,
    salt: &str,
    value: &mut String,
    contacts: &[(String, String)],
    none: bool,
) {
    let shown = contacts
        .iter()
        .find(|(id, _)| id == value)
        .map(|(id, n)| format!("{n} (..{})", tail(id)))
        .unwrap_or_else(|| {
            if none {
                "no contact".into()
            } else {
                "choose a contact".into()
            }
        });
    egui::ComboBox::from_id_salt(salt)
        .selected_text(shown)
        .width(240.0)
        .show_ui(ui, |ui| {
            if none {
                ui.selectable_value(value, String::new(), "no contact");
            }
            for (id, n) in contacts {
                ui.selectable_value(value, id.clone(), format!("{n} (..{})", tail(id)));
            }
        });
}

fn choose(ui: &mut egui::Ui, salt: &str, value: &mut String, list: &[&str]) {
    egui::ComboBox::from_id_salt(salt)
        .selected_text(value.clone())
        .show_ui(ui, |ui| {
            for k in list {
                ui.selectable_value(value, k.to_string(), *k);
            }
        });
}

fn field(ui: &mut egui::Ui, value: &mut String, hint: &str, width: f32) {
    ui.add(
        egui::TextEdit::singleline(value)
            .hint_text(hint)
            .desired_width(width),
    );
}

impl App {
    fn firm_contacts(&mut self) {
        if self.firm.contacts_at == Some(self.last_refresh_ms) {
            return;
        }
        self.firm.contacts_at = Some(self.last_refresh_ms);
        self.firm.contacts = self
            .q(Request::ContactsList { kind: None })
            .unwrap_or_default()
            .iter()
            .map(|c| {
                (
                    c["id"].as_str().unwrap_or_default().to_string(),
                    c["name"].as_str().unwrap_or_default().to_string(),
                )
            })
            .collect();
    }

    fn firm_changed(&mut self, status: String) {
        self.status = status;
        self.firm.contacts_at = None;
        self.reload_panes();
    }

    pub(crate) fn firm_extras(&mut self, ui: &mut egui::Ui, view: ViewId) {
        self.firm_contacts();
        ui.separator();
        match view {
            ViewId::Contacts => self.contacts_extras(ui),
            ViewId::Parties => self.parties_extras(ui),
            ViewId::Timeline => self.timeline_extras(ui),
            _ => {}
        }
    }

    fn selected_subject(&self) -> Option<Subject> {
        let i = self.layout.focused;
        match (&self.panes[i].content, self.panes[i].selected) {
            (Content::Table(t), Some(sel)) => t.rows.get(sel).map(|r| r.subject.clone()),
            _ => None,
        }
    }

    fn contacts_extras(&mut self, ui: &mut egui::Ui) {
        let i = self.layout.focused;
        if let Some(id) = self.layout.panes[i].page.arg.clone() {
            return self.contact_page_extras(ui, &id);
        }
        if let Some(Subject::Raw(c)) = self.selected_subject() {
            let id = c["id"].as_str().unwrap_or_default().to_string();
            let name = c["name"].as_str().unwrap_or_default().to_string();
            ui.horizontal(|ui| {
                if ui.button(format!("Open the page of {name}")).clicked() {
                    self.navigate(ViewId::Contacts, Some(id.clone()));
                }
                if ui.button("Timeline").clicked() {
                    self.navigate(
                        ViewId::Timeline,
                        Some(format!("{}{id}", firmviews::CONTACT_PREFIX)),
                    );
                }
            });
        }
        ui.label("Add a contact. A court or bench needs a source, for example codebook:hc/DL.");
        let mut add = false;
        ui.horizontal(|ui| {
            let f = &mut self.firm;
            field(ui, &mut f.name, "name", 200.0);
            choose(ui, "contact-kind", &mut f.kind, oa_firm::CONTACT_KINDS);
            field(ui, &mut f.source, "source", 150.0);
            field(ui, &mut f.phone, "phone", 130.0);
            field(ui, &mut f.email, "email", 170.0);
            add = ui.button("Add contact").clicked();
        });
        if add {
            let f = &self.firm;
            let req = Request::ContactsAdd {
                contact: ContactInput {
                    name: f.name.clone(),
                    kind: f.kind.clone(),
                    source: opt(&f.source),
                    phone: opt(&f.phone),
                    email: opt(&f.email),
                    ..Default::default()
                },
            };
            if self.act(req).is_some() {
                let msg = format!("Added {}.", self.firm.name.trim());
                let f = &mut self.firm;
                for s in [&mut f.name, &mut f.source, &mut f.phone, &mut f.email] {
                    s.clear();
                }
                self.firm_changed(msg);
            }
        }
    }

    fn contact_page_extras(&mut self, ui: &mut egui::Ui, id: &str) {
        let i = self.layout.focused;
        let mut matters: Vec<(String, String)> = Vec::new();
        if let Content::Table(t) = &self.panes[i].content {
            for r in t.rows.iter().skip(1) {
                if let Subject::Record { matter, .. } = &r.subject {
                    if !matters.iter().any(|(m, _)| m == matter) {
                        matters.push((matter.clone(), r.cells[0].clone()));
                    }
                }
            }
        }
        let mut go: Option<(ViewId, Option<String>)> = None;
        let mut open: Option<String> = None;
        ui.horizontal_wrapped(|ui| {
            if ui.button("All contacts").clicked() {
                go = Some((ViewId::Contacts, None));
            }
            if ui.button("Timeline of this contact").clicked() {
                go = Some((
                    ViewId::Timeline,
                    Some(format!("{}{id}", firmviews::CONTACT_PREFIX)),
                ));
            }
            for (m, title) in &matters {
                if ui.button(format!("Open matter: {title}")).clicked() {
                    open = Some(m.clone());
                }
            }
        });
        if let Some(m) = open {
            self.select_matter(&m);
            go = Some((ViewId::Parties, None));
        }
        if let Some((v, arg)) = go {
            return self.navigate(v, arg);
        }
        ui.label("Edit this contact. An empty field keeps what is there.");
        let mut save = false;
        ui.horizontal(|ui| {
            let f = &mut self.firm;
            field(ui, &mut f.name, "name", 200.0);
            field(ui, &mut f.phone, "phone", 130.0);
            field(ui, &mut f.email, "email", 170.0);
            field(ui, &mut f.note, "note", 200.0);
            save = ui.button("Save changes").clicked();
        });
        if save {
            let f = &self.firm;
            let req = Request::ContactsEdit {
                id: id.to_string(),
                contact: ContactInput {
                    name: f.name.trim().to_string(),
                    phone: opt(&f.phone),
                    email: opt(&f.email),
                    note: opt(&f.note),
                    ..Default::default()
                },
            };
            if self.act(req).is_some() {
                let f = &mut self.firm;
                for s in [&mut f.name, &mut f.phone, &mut f.email, &mut f.note] {
                    s.clear();
                }
                self.firm_changed("Contact saved.".into());
            }
        }
    }

    fn parties_extras(&mut self, ui: &mut egui::Ui) {
        let Some(matter) = self.selected.clone() else {
            return;
        };
        if let Some(Subject::Record { id, .. }) = self.selected_subject() {
            if let Some(contact) = id.strip_prefix("party:") {
                if ui.button("Open this contact's page").clicked() {
                    return self.navigate(ViewId::Contacts, Some(contact.to_string()));
                }
            }
        }
        ui.label("Record a party role. The name in the record may differ from the contact's name; both are kept.");
        let mut record = false;
        ui.horizontal(|ui| {
            let f = &mut self.firm;
            contact_combo(
                ui,
                "party-contact",
                &mut f.party_contact,
                &f.contacts,
                false,
            );
            choose(ui, "party-role", &mut f.party_role, oa_firm::PARTY_ROLES);
            field(
                ui,
                &mut f.party_record,
                "name as in the record (optional)",
                240.0,
            );
            record = ui.button("Record party").clicked();
        });
        if record {
            let f = &self.firm;
            let req = Request::PartiesSet {
                matter,
                contact: f.party_contact.clone(),
                role: f.party_role.clone(),
                record_name: opt(&f.party_record),
            };
            if self.act(req).is_some() {
                self.firm.party_record.clear();
                self.firm_changed("Party recorded.".into());
            }
        }
    }

    fn timeline_extras(&mut self, ui: &mut egui::Ui) {
        let i = self.layout.focused;
        let arg = self.layout.panes[i].page.arg.clone();
        if let Some(c) = arg
            .as_deref()
            .and_then(|a| a.strip_prefix(firmviews::CONTACT_PREFIX))
        {
            let mut go = None;
            ui.horizontal(|ui| {
                if ui.button("Contact page").clicked() {
                    go = Some((ViewId::Contacts, Some(c.to_string())));
                }
                if self.selected.is_some() && ui.button("This matter's timeline").clicked() {
                    go = Some((ViewId::Timeline, None));
                }
            });
            if let Some((v, a)) = go {
                self.navigate(v, a);
            }
            return;
        }
        let Some(matter) = self.selected.clone() else {
            return;
        };
        ui.label("Log a call, meeting or letter. It is recorded in the ledger; nothing is sent.");
        let mut log = false;
        ui.horizontal(|ui| {
            let f = &mut self.firm;
            choose(
                ui,
                "corr-kind",
                &mut f.corr_kind,
                oa_firm::CORRESPONDENCE_KINDS,
            );
            contact_combo(ui, "corr-contact", &mut f.corr_contact, &f.contacts, true);
            field(ui, &mut f.corr_summary, "summary", 360.0);
            log = ui.button("Log").clicked();
        });
        if log {
            let f = &self.firm;
            let req = Request::CorrespondenceLog {
                matter,
                kind: f.corr_kind.clone(),
                summary: f.corr_summary.clone(),
                contact: opt(&f.corr_contact),
                occurred_at: None,
            };
            if self.act(req).is_some() {
                self.firm.corr_summary.clear();
                self.firm_changed("Logged.".into());
            }
        }
    }
}
