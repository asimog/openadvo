//! The kernel: the only writer of canonical state (spec C), with the step-1
//! workspace commands of spec A.
//!
//! Every command enters through [`Kernel::dispatch`], which enforces the
//! command class rules before any work: `internal` and `external` commands
//! need an idempotency key, and `human` commands are refused on harness
//! connections (spec C rule 12).

mod approvals;
mod command;
mod drafts;
mod evidence;
mod hooks;
mod jobs;
mod layout;
mod ledger;
mod links;
mod matters;
mod paths;
mod records;
mod rescan;
mod settings;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use oa_store::{
    CommandLogRow, FirmStore, MatterStore, RegistryStore, RejectedWrite, StoreError,
    StoreErrorKind, StoreFactory,
};
use oa_types::{CommandClass, ErrorCode, OaError, Origin};
use serde_json::Value;

pub use command::{Attachment, ClientSpec, Request};
pub use hooks::{
    FaultHook, GrantPolicy, Hooks, NoFaults, NobodyPresent, PresencePrompt, Step, StepOneGrants,
};
pub use layout::{Manifest, MANIFEST, STAGING, SUBDIRS};
pub use ledger::{verify_chain, ChainBreak};
pub use links::{edges, Edge};
pub use paths::WriteArea;

/// Who is asking, and under which idempotency key.
#[derive(Debug, Clone)]
pub struct Ctx {
    pub origin: Origin,
    pub key: Option<String>,
}

impl Ctx {
    pub fn new(origin: Origin, key: impl Into<String>) -> Self {
        Ctx {
            origin,
            key: Some(key.into()),
        }
    }

    pub fn query(origin: Origin) -> Self {
        Ctx { origin, key: None }
    }

    fn key(&self) -> &str {
        self.key.as_deref().unwrap_or_default()
    }
}

pub struct Kernel {
    app_data: PathBuf,
    stores: Arc<dyn StoreFactory>,
    hooks: Hooks,
    /// One writer at a time (spec B edge case: the kernel serialises).
    writer: Mutex<()>,
}

pub(crate) fn store_err(e: StoreError) -> OaError {
    let code = match e.kind {
        StoreErrorKind::Unavailable => ErrorCode::Unavailable,
        StoreErrorKind::Conflict => ErrorCode::Conflict,
        StoreErrorKind::NotFound => ErrorCode::NotFound,
        StoreErrorKind::Other => ErrorCode::Internal,
    };
    OaError::new(code, e.message)
}

pub(crate) fn io_err(context: &str, e: std::io::Error) -> OaError {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => ErrorCode::NotFound,
        _ => ErrorCode::Unavailable,
    };
    OaError::new(code, format!("{context}: {e}"))
}

impl Kernel {
    pub fn new(app_data: impl Into<PathBuf>, stores: Arc<dyn StoreFactory>, hooks: Hooks) -> Self {
        Kernel {
            app_data: app_data.into(),
            stores,
            hooks,
            writer: Mutex::new(()),
        }
    }

    pub fn app_data(&self) -> &Path {
        &self.app_data
    }

    pub fn dispatch(&self, ctx: &Ctx, req: Request) -> Result<Vec<Value>, OaError> {
        match req.class() {
            CommandClass::Internal | CommandClass::External if ctx.key.is_none() => {
                return Err(OaError::new(
                    ErrorCode::Usage,
                    format!("{} needs an idempotency key", req.name()),
                ));
            }
            CommandClass::Human if ctx.origin == Origin::Harness => {
                self.audit_firm(ctx, req.name(), "human-class command from the harness", b"")?;
                return Err(OaError::new(
                    ErrorCode::HumanCommandRefused,
                    format!(
                        "{} is a human command and is refused to the harness",
                        req.name()
                    ),
                ));
            }
            _ => {}
        }
        // Cancel only sets a flag a running job polls, so it must not wait
        // behind the job it cancels.
        let class = req.class();
        let _writer = (class != CommandClass::Query && !matches!(req, Request::JobCancel { .. }))
            .then(|| self.writer.lock().unwrap_or_else(|p| p.into_inner()));
        let name = req.name();
        let matter = req.matter().map(str::to_string);
        let result = self.run(ctx, req);
        if result.is_ok() && class != CommandClass::Query {
            // Best effort: the effect has happened, so a failed audit write
            // must not turn into a reported failure of the command.
            if let Ok(firm) = self.firm() {
                let _ = firm.log_command(&CommandLogRow {
                    at: oa_types::now_utc(),
                    actor: ctx.origin.actor().to_string(),
                    origin: ctx.origin.as_str().to_string(),
                    command: name.to_string(),
                    idempotency_key: ctx.key.clone(),
                    matter,
                });
            }
        }
        result
    }

    fn run(&self, ctx: &Ctx, req: Request) -> Result<Vec<Value>, OaError> {
        match req {
            Request::WorkspaceInit { root } => self.workspace_init(&root).map(one),
            Request::MatterCreate {
                title,
                client,
                from,
            } => self.matter_create(ctx, &title, client, from).map(one),
            Request::MatterConfirm { pending } => self.matter_confirm(ctx, &pending).map(one),
            Request::MatterList { include_removed } => self.matter_list(include_removed),
            Request::MatterOpen { id } => self.matter_open(&id).map(one),
            Request::MatterArchive { id } => self.matter_archive(ctx, &id).map(one),
            Request::MatterRename { id, title } => self.matter_rename(ctx, &id, &title).map(one),
            Request::MatterWriteFile { id, relpath, bytes } => {
                self.matter_write_file(ctx, &id, &relpath, &bytes).map(one)
            }
            Request::RegistryRescan => self.registry_rescan().map(one),
            Request::SettingsGet { key } => self.settings_get(&key).map(one),
            Request::SettingsSet { key, value } => self.settings_set(ctx, &key, &value).map(one),
            Request::JobList => self.job_list(),
            Request::JobShow { id } => self.job_show(&id).map(one),
            Request::JobCancel { id } => self.job_cancel(&id).map(one),
            Request::LedgerTail { matter, n } => self.ledger_tail(&matter, n),
            Request::LedgerVerify { matter } => self.ledger_verify(&matter).map(one),
            Request::AuditRejected { matter } => self.audit_rejected(matter.as_deref()),
            Request::AuditCommands => self.audit_commands(),
            Request::EvidenceAdd {
                matter,
                file,
                origin,
            } => self.evidence_add(ctx, &matter, &file, &origin).map(one),
            Request::EvidenceList { matter } => self.evidence_list(&matter),
            Request::EvidenceShow { matter, id } => self.evidence_show(&matter, &id).map(one),
            Request::DraftCreate {
                matter,
                title,
                file,
            } => self.draft_create(ctx, &matter, &title, &file).map(one),
            Request::DraftCommit {
                matter,
                draft,
                base,
                file,
                note,
            } => self
                .draft_commit(ctx, &matter, &draft, &base, &file, note)
                .map(one),
            Request::DraftList { matter } => self.draft_list(&matter),
            Request::DraftLog { matter, draft } => self.draft_log(&matter, &draft).map(one),
            Request::DraftShow { matter, rev } => self.draft_show(&matter, &rev).map(one),
            Request::DraftCheckpoint {
                matter,
                draft,
                name,
            } => self.draft_checkpoint(ctx, &matter, &draft, &name).map(one),
            Request::DraftRestore {
                matter,
                draft,
                checkpoint,
            } => self
                .draft_restore(ctx, &matter, &draft, &checkpoint)
                .map(one),
            Request::ApprovalRequest {
                matter,
                gate,
                target,
            } => self.approval_request(ctx, &matter, &gate, &target).map(one),
            Request::ApprovalDecide {
                matter,
                id,
                accept,
                reason,
            } => self
                .approval_decide(ctx, &matter, &id, accept, &reason)
                .map(one),
            Request::ApprovalStatus {
                matter,
                gate,
                target,
            } => self.approval_status(&matter, &gate, &target).map(one),
            Request::RulesPin { matter } => self.rules_pin(&matter).map(one),
            Request::Inspect { matter, id } => self.inspect(&matter, &id).map(one),
            Request::LinksOut { matter, id } => self.links_out(&matter, &id),
            Request::LinksIn { matter, id } => self.links_in(&matter, &id),
        }
    }

    fn ensure_app_data(&self) -> Result<(), OaError> {
        fs::create_dir_all(&self.app_data).map_err(|e| io_err("application data folder", e))
    }

    pub(crate) fn registry(&self) -> Result<Box<dyn RegistryStore>, OaError> {
        self.ensure_app_data()?;
        self.stores.registry(&self.app_data).map_err(store_err)
    }

    pub(crate) fn firm(&self) -> Result<Box<dyn FirmStore>, OaError> {
        self.ensure_app_data()?;
        self.stores.firm(&self.app_data).map_err(store_err)
    }

    pub(crate) fn open_matter(&self, dir: &Path) -> Result<Box<dyn MatterStore>, OaError> {
        self.stores.open_matter(dir).map_err(|e| {
            OaError::new(
                ErrorCode::MatterDamaged,
                format!("matter.db cannot be opened: {}", e.message),
            )
        })
    }

    pub(crate) fn workspace_root(&self) -> Result<PathBuf, OaError> {
        self.firm()?
            .workspace_root()
            .map_err(store_err)?
            .map(PathBuf::from)
            .ok_or_else(|| {
                OaError::new(
                    ErrorCode::WorkspaceNotInitialised,
                    "no workspace root: run `oa workspace init <root>` first",
                )
            })
    }

    /// Records a refused firm-level command in `firm.db` (spec C rule 5).
    pub(crate) fn audit_firm(
        &self,
        ctx: &Ctx,
        command: &str,
        reason: &str,
        body: &[u8],
    ) -> Result<(), OaError> {
        self.firm()?
            .record_rejected(&rejected(ctx, command, reason, body))
            .map_err(store_err)
    }

    /// Asks the human at the machine. Refused to the harness by `dispatch`.
    pub(crate) fn require_presence(&self, summary: &str) -> Result<(), OaError> {
        if self.hooks.presence.confirm(summary) {
            Ok(())
        } else {
            Err(OaError::new(
                ErrorCode::ConfirmationDenied,
                format!("not confirmed: {summary}"),
            ))
        }
    }

    fn workspace_init(&self, root: &Path) -> Result<Value, OaError> {
        fs::create_dir_all(root).map_err(|e| io_err("workspace root", e))?;
        let root = std::path::absolute(root).map_err(|e| io_err("workspace root", e))?;
        let root_str = root.to_string_lossy().to_string();
        let firm = self.firm()?;
        match firm.workspace_root().map_err(store_err)? {
            Some(existing) if existing != root_str => {
                return Err(OaError::new(
                    ErrorCode::Conflict,
                    format!("a workspace root is already set: {existing}"),
                ));
            }
            Some(_) => {}
            None => firm.set_workspace_root(&root_str).map_err(store_err)?,
        }
        self.registry()?;
        Ok(serde_json::json!({
            "workspace_root": root_str,
            "app_data": self.app_data.to_string_lossy(),
        }))
    }
}

pub(crate) fn rejected(ctx: &Ctx, command: &str, reason: &str, body: &[u8]) -> RejectedWrite {
    RejectedWrite {
        at: oa_types::now_utc(),
        actor: ctx.origin.actor().to_string(),
        origin: ctx.origin.as_str().to_string(),
        command: command.to_string(),
        reason: reason.to_string(),
        body_hash: ledger::sha256_hex(body),
    }
}

fn one(v: Value) -> Vec<Value> {
    vec![v]
}
