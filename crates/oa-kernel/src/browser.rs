//! The browser commands (spec M). The kernel owns the browser supervisor: one
//! process per profile (RQ-80), the agent's own throwaway profile (RQ-81),
//! the egress log, attachment of the agent to a visible profile (a `human`
//! command), and download interception into the matter inbox through the
//! capture path (M rule 5, F06).

use std::sync::Mutex;

use oa_browser::{
    intercept, parse_allow_list, BrowserError, Connection, EgressSpec, Initiator, Profile,
    ProfileRequest, Supervisor, FILING_HOSTS, PUBLIC_LEGAL_SOURCES,
};
use oa_store::{AttachmentRow, DownloadRow, EgressRow};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::{json, Value};

use crate::command::{Attachment, CaptureInput};
use crate::{store_err, Ctx, Kernel};

/// The browser state the kernel keeps in memory: the running processes, and
/// the profile the advocate last used (the default for queries).
pub(crate) struct BrowserState {
    pub(crate) sup: Supervisor,
    pub(crate) last: Option<Profile>,
}

impl BrowserState {
    pub(crate) fn new(sup: Supervisor) -> Mutex<Self> {
        Mutex::new(BrowserState { sup, last: None })
    }
}

fn browser_err(e: BrowserError) -> OaError {
    match e {
        BrowserError::Refused { reason, .. } => OaError::new(ErrorCode::WriteRefused, reason),
        BrowserError::Unavailable(reason) => OaError::new(
            ErrorCode::Unavailable,
            format!("dependency_unavailable: {reason}"),
        ),
        BrowserError::Failed { reason, .. } => OaError::new(ErrorCode::CheckFailed, reason),
    }
}

fn usage(e: String) -> OaError {
    OaError::new(ErrorCode::Usage, e)
}

fn egress_json(e: &EgressRow) -> Value {
    json!({
        "id": e.id,
        "kind_of": "egress",
        "at": e.at,
        "profile": e.profile,
        "url": e.url,
        "host": e.host,
        "initiator": e.initiator,
        "kind": e.kind,
        "allowed": e.allowed,
        "reason": e.reason,
        "status": e.status,
        "error": e.error,
    })
}

fn download_json(d: &DownloadRow) -> Value {
    json!({
        "id": d.id,
        "at": d.at,
        "profile": d.profile,
        "url": d.url,
        "final_url": d.final_url,
        "file_name": d.file_name,
        "content_type": d.content_type,
        "sha256": d.sha256,
        "size": d.size,
        "matter": d.matter,
        "evidence_id": d.evidence_id,
        "capture_id": d.capture_id,
        "status": d.status,
        "detail": d.detail,
    })
}

fn attachment_json(a: &AttachmentRow) -> Value {
    json!({
        "id": a.id,
        "profile": a.profile,
        "attached_at": a.attached_at,
        "attached_by": a.attached_by,
        "detached_at": a.detached_at,
        "detached_by": a.detached_by,
        "active": a.detached_at.is_none(),
    })
}

impl Kernel {
    fn browser_state(&self) -> std::sync::MutexGuard<'_, BrowserState> {
        self.browser.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// The allow list for a profile, from firm settings, with the spec's
    /// defaults: public legal sources for the agent, the e-filing portal for
    /// filing, nothing beyond the advocate's own navigation for a matter.
    fn egress_for(&self, profile: &Profile) -> Result<EgressSpec, OaError> {
        let firm = self.firm()?;
        let setting = |key: &str| firm.setting(key).map_err(store_err);
        let allow = match profile {
            Profile::Agent => setting("browser.allow.agent")?
                .map(|v| parse_allow_list(&v))
                .unwrap_or_else(|| PUBLIC_LEGAL_SOURCES.iter().map(|s| s.to_string()).collect()),
            Profile::Filing => setting("browser.allow.filing")?
                .map(|v| parse_allow_list(&v))
                .unwrap_or_else(|| FILING_HOSTS.iter().map(|s| s.to_string()).collect()),
            Profile::Matter(id) => {
                let own = setting(&format!("browser.allow.matter.{}", id.to_ascii_lowercase()))?;
                let shared = setting("browser.allow.matter")?;
                own.or(shared)
                    .map(|v| parse_allow_list(&v))
                    .unwrap_or_default()
            }
        };
        Ok(EgressSpec::for_profile(profile, Some(allow)))
    }

    fn active_attachment(&self) -> Result<Option<AttachmentRow>, OaError> {
        Ok(self
            .firm()?
            .attachments()
            .map_err(store_err)?
            .into_iter()
            .rev()
            .find(|a| a.detached_at.is_none()))
    }

    fn log_egress(&self, profile: &Profile, connections: &[Connection]) -> Result<(), OaError> {
        if connections.is_empty() {
            return Ok(());
        }
        let rows: Vec<EgressRow> = connections
            .iter()
            .map(|c| EgressRow {
                id: ulid::Ulid::new().to_string(),
                at: c.at.clone(),
                profile: profile.name(),
                url: c.url.clone(),
                host: c.host.clone(),
                initiator: c.initiator.as_str().to_string(),
                kind: c.kind.clone(),
                allowed: c.allowed,
                reason: c.reason.clone(),
                status: c.status.map(i64::from),
                error: c.error.clone(),
            })
            .collect();
        self.firm()?.insert_egress(&rows).map_err(store_err)
    }

    /// Who may drive which profile. The harness drives its own profile, a
    /// matter profile only while the advocate has attached it there (RQ-81),
    /// and never the filing profile.
    fn initiator_for(&self, ctx: &Ctx, profile: &Profile) -> Result<Initiator, String> {
        if ctx.origin != Origin::Harness {
            return Ok(Initiator::Advocate);
        }
        match profile {
            Profile::Agent => Ok(Initiator::Agent),
            Profile::Filing => Err(
                "the agent never drives the filing profile on its own: filing runs under the advocate's confirmations (spec L)"
                    .into(),
            ),
            Profile::Matter(_) => {
                let attached = self
                    .active_attachment()
                    .ok()
                    .flatten()
                    .is_some_and(|a| a.profile == profile.name());
                if attached {
                    Ok(Initiator::Agent)
                } else {
                    Err(format!(
                        "the agent is not attached to {profile}: only the advocate can attach it (RQ-81)"
                    ))
                }
            }
        }
    }

    fn resolve_profile(&self, ctx: &Ctx, profile: Option<&str>) -> Result<Profile, OaError> {
        match profile {
            Some(p) => Profile::parse(p).map_err(usage),
            None if ctx.origin == Origin::Harness => Ok(Profile::Agent),
            None => self.browser_state().last.clone().ok_or_else(|| {
                OaError::new(
                    ErrorCode::Usage,
                    "no profile has been used yet: pass --profile matter:<id>, filing or agent",
                )
            }),
        }
    }

    pub(crate) fn browser_open(
        &self,
        ctx: &Ctx,
        profile: &str,
        url: &str,
        matter: Option<&str>,
    ) -> Result<Value, OaError> {
        const COMMAND: &str = "browser.open";
        let profile = Profile::parse(profile).map_err(usage)?;
        if let Some(m) = profile.matter() {
            self.live(m)?;
        }
        let initiator = match self.initiator_for(ctx, &profile) {
            Ok(i) => i,
            Err(reason) => {
                self.audit_firm(ctx, COMMAND, &reason, url.as_bytes())?;
                return Err(OaError::new(ErrorCode::WriteRefused, reason));
            }
        };
        let egress = self.egress_for(&profile)?;
        let result = {
            let mut st = self.browser_state();
            if ctx.origin != Origin::Harness {
                st.last = Some(profile.clone());
            }
            st.sup.navigate(&profile, &egress, url, initiator)
        };
        let resp = match result {
            Ok(r) => r,
            Err(e) => {
                self.log_egress(&profile, e.connections())?;
                if let BrowserError::Refused { reason, .. } = &e {
                    self.audit_firm(ctx, COMMAND, reason, url.as_bytes())?;
                }
                return Err(browser_err(e));
            }
        };
        self.log_egress(&profile, &resp.connections)?;
        let refused = resp.connections.iter().filter(|c| !c.allowed).count();
        let mut out = json!({
            "profile": profile.name(),
            "initiator": initiator.as_str(),
            "connections": resp.connections.len(),
            "refused": refused,
        });
        if let Some(file) = &resp.download {
            let routed_matter = profile.matter().or(matter);
            out["download"] = self.route_download(ctx, &profile, initiator, file, routed_matter)?;
        } else if let Value::Object(map) = &resp.data {
            for (k, v) in map {
                out[k] = v.clone();
            }
        }
        Ok(out)
    }

    /// Hashes the download from the bytes on disk, then routes it to the
    /// matter inbox with a capture record (M rule 5). Only the browser
    /// supervisor's origin may create capture records (F-AC-03).
    fn route_download(
        &self,
        ctx: &Ctx,
        profile: &Profile,
        initiator: Initiator,
        file: &oa_browser::DownloadFile,
        matter: Option<&str>,
    ) -> Result<Value, OaError> {
        let got = intercept(file).map_err(|e| OaError::new(ErrorCode::Unavailable, e))?;
        let now = oa_types::now_utc();
        let mut row = DownloadRow {
            id: ulid::Ulid::new().to_string(),
            at: now.clone(),
            profile: profile.name(),
            url: file.url.clone(),
            final_url: file.final_url.clone(),
            file_name: file.file_name.clone(),
            content_type: file.content_type.clone(),
            sha256: got.sha256.clone(),
            size: got.bytes.len() as i64,
            matter: matter.map(str::to_string),
            evidence_id: None,
            capture_id: None,
            status: "unrouted".into(),
            detail: Some("no matter to route to: pass --matter".into()),
        };
        if let Some(m) = matter {
            let capture_ctx = Ctx::new(
                Origin::Capture,
                format!("{}:download:{}", ctx.key(), got.sha256),
            );
            let capture = CaptureInput {
                file: Some(Attachment {
                    file_name: file.file_name.clone(),
                    bytes: got.bytes.clone(),
                }),
                origin: "browser".into(),
                url: file.url.clone(),
                final_url: file.final_url.clone(),
                captured_at: now.clone(),
                profile: profile.name(),
                gesture: format!("browser.open by the {}", initiator.as_str()),
                portal_date: None,
                adapter: "browser".into(),
                status: "completed".into(),
                reason: None,
                health: None,
                codebook: None,
            };
            let rec = self.capture_commit(&capture_ctx, m, &capture)?;
            row.evidence_id = rec["evidence_id"].as_str().map(str::to_string);
            row.capture_id = rec["id"].as_str().map(str::to_string);
            row.status = "routed".into();
            row.detail = None;
            if rec["blob"].as_str() != Some(got.sha256.as_str()) {
                row.status = "hash_mismatch".into();
                row.detail = Some(format!(
                    "the stored blob {} differs from the intercepted {}",
                    rec["blob"], got.sha256
                ));
            }
        }
        self.firm()?.insert_download(&row).map_err(store_err)?;
        Ok(download_json(&row))
    }

    pub(crate) fn browser_state_query(&self, profile: Option<&str>) -> Result<Vec<Value>, OaError> {
        let only = profile.map(Profile::parse).transpose().map_err(usage)?;
        let attachment = self.active_attachment()?;
        let mut st = self.browser_state();
        let launcher = st.sup.launcher();
        let mut out = Vec::new();
        for p in st.sup.status() {
            if only.as_ref().is_some_and(|o| o.name() != p.profile) {
                continue;
            }
            let parsed = Profile::parse(&p.profile).map_err(usage)?;
            let tabs = if p.state == "running" {
                st.sup
                    .query(&parsed, &ProfileRequest::State)
                    .map(|r| r.data["tabs"].clone())
                    .unwrap_or(json!([]))
            } else {
                json!([])
            };
            out.push(json!({
                "id": format!("browser:{}", p.profile),
                "profile": p.profile,
                "state": p.state,
                "pid": p.pid,
                "started_at": p.started_at,
                "restarts": p.restarts,
                "last_error": p.last_error,
                "visible": parsed.config().visible,
                "devtools": parsed.config().devtools,
                "agent_attached": attachment.as_ref().is_some_and(|a| a.profile == p.profile),
                "engine": launcher,
                "tabs": tabs,
            }));
        }
        if out.is_empty() {
            if let Some(o) = only {
                out.push(json!({
                    "id": format!("browser:{}", o.name()),
                    "profile": o.name(),
                    "state": "not_running",
                    "pid": null,
                    "visible": o.config().visible,
                    "devtools": o.config().devtools,
                    "agent_attached": attachment.as_ref().is_some_and(|a| a.profile == o.name()),
                    "engine": launcher,
                    "tabs": [],
                }));
            }
        }
        Ok(out)
    }

    fn browser_query(
        &self,
        ctx: &Ctx,
        profile: Option<&str>,
        req: &ProfileRequest,
    ) -> Result<Value, OaError> {
        let profile = self.resolve_profile(ctx, profile)?;
        if ctx.origin == Origin::Harness {
            // Reading a visible profile is driving it: the same rule as open.
            if let Err(reason) = self.initiator_for(ctx, &profile) {
                return Err(OaError::new(ErrorCode::WriteRefused, reason));
            }
        }
        let mut st = self.browser_state();
        st.sup
            .query(&profile, req)
            .map(|r| r.data)
            .map_err(browser_err)
    }

    pub(crate) fn browser_dom(
        &self,
        ctx: &Ctx,
        profile: Option<&str>,
        selector: &str,
    ) -> Result<Value, OaError> {
        self.browser_query(
            ctx,
            profile,
            &ProfileRequest::Dom {
                selector: selector.to_string(),
            },
        )
    }

    pub(crate) fn browser_extract(
        &self,
        ctx: &Ctx,
        profile: Option<&str>,
    ) -> Result<Value, OaError> {
        let mut v = self.browser_query(ctx, profile, &ProfileRequest::Extract)?;
        // The label is the kernel's promise too, whatever the process said.
        v["label"] = json!(oa_browser::UNTRUSTED);
        Ok(v)
    }

    pub(crate) fn browser_screenshot(
        &self,
        ctx: &Ctx,
        profile: Option<&str>,
    ) -> Result<Value, OaError> {
        self.browser_query(ctx, profile, &ProfileRequest::Screenshot)
    }

    pub(crate) fn browser_devtools(&self, ctx: &Ctx, profile: &str) -> Result<Value, OaError> {
        const COMMAND: &str = "browser.devtools";
        let profile = Profile::parse(profile).map_err(usage)?;
        if ctx.origin == Origin::Harness {
            let reason = "DevTools are opened by the advocate only";
            self.audit_firm(ctx, COMMAND, reason, b"")?;
            return Err(OaError::new(ErrorCode::WriteRefused, reason));
        }
        let egress = self.egress_for(&profile)?;
        let result = self.browser_state().sup.open_devtools(&profile, &egress);
        match result {
            Ok(_) => Ok(json!({ "profile": profile.name(), "devtools": "open" })),
            Err(e) => {
                if let BrowserError::Refused { reason, .. } = &e {
                    self.audit_firm(ctx, COMMAND, reason, b"")?;
                }
                Err(browser_err(e))
            }
        }
    }

    /// Attaches the agent to a matter's visible profile. A `human` command:
    /// `dispatch` refuses it to the harness before this runs (M-AC-04).
    pub(crate) fn browser_attach(&self, ctx: &Ctx, matter: &str) -> Result<Value, OaError> {
        let profile = Profile::Matter(matter.to_string());
        self.live(matter)?;
        self.require_presence(&format!(
            "Let the agent drive the visible browser for {profile}"
        ))?;
        let firm = self.firm()?;
        let now = oa_types::now_utc();
        // One attachment at a time: a new one replaces the old.
        firm.end_attachment(&now, ctx.origin.actor())
            .map_err(store_err)?;
        let row = AttachmentRow {
            id: ulid::Ulid::new().to_string(),
            profile: profile.name(),
            attached_at: now,
            attached_by: ctx.origin.actor().to_string(),
            detached_at: None,
            detached_by: None,
        };
        firm.insert_attachment(&row).map_err(store_err)?;
        Ok(attachment_json(&row))
    }

    /// Revokes the attachment. Anyone may detach, the agent included.
    pub(crate) fn browser_detach(&self, ctx: &Ctx) -> Result<Value, OaError> {
        let ended = self
            .firm()?
            .end_attachment(&oa_types::now_utc(), ctx.origin.actor())
            .map_err(store_err)?;
        Ok(json!({ "detached": ended }))
    }

    pub(crate) fn browser_attachments(&self) -> Result<Vec<Value>, OaError> {
        Ok(self
            .firm()?
            .attachments()
            .map_err(store_err)?
            .iter()
            .map(attachment_json)
            .collect())
    }

    pub(crate) fn browser_downloads(&self, matter: Option<&str>) -> Result<Vec<Value>, OaError> {
        Ok(self
            .firm()?
            .downloads()
            .map_err(store_err)?
            .iter()
            .filter(|d| matter.is_none() || d.matter.as_deref() == matter)
            .map(download_json)
            .collect())
    }

    pub(crate) fn browser_egress(
        &self,
        profile: Option<&str>,
        refused_only: bool,
    ) -> Result<Vec<Value>, OaError> {
        let only = profile.map(Profile::parse).transpose().map_err(usage)?;
        Ok(self
            .firm()?
            .egress()
            .map_err(store_err)?
            .iter()
            .filter(|e| only.as_ref().is_none_or(|p| p.name() == e.profile))
            .filter(|e| !refused_only || !e.allowed)
            .map(egress_json)
            .collect())
    }

    /// Kills one profile's process, as a crash would. For the kill tests and
    /// the supervisor; not a control command.
    pub fn browser_kill(&self, profile: &str) -> Result<(), OaError> {
        let p = Profile::parse(profile).map_err(usage)?;
        self.browser_state().sup.kill(&p);
        Ok(())
    }

    /// Ends the agent's run: its profile and folder are discarded (M rule 2).
    pub fn browser_end_agent_run(&self) {
        self.browser_state().sup.end_agent_run();
    }

    /// Stops every browser profile process (C rule 22).
    pub(crate) fn browser_stop_all(&self) {
        self.browser_state().sup.stop_all();
    }
}
