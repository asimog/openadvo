//! The kernel: the only writer of canonical state (spec C), with the step-1
//! workspace commands of spec A.
//!
//! Every command enters through [`Kernel::dispatch`], which enforces the
//! command class rules before any work: `internal` and `external` commands
//! need an idempotency key, and `human` commands are refused on harness
//! connections (spec C rule 12).

mod approvals;
mod capture;
mod command;
mod documents;
mod drafts;
mod evidence;
mod find;
mod hooks;
mod jobs;
mod layout;
mod ledger;
mod links;
mod matters;
mod notebook;
mod ocr;
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

pub use command::{
    AdapterHealthInput, Attachment, CaptureInput, ClientSpec, CodebookInput, CourtCodeInput,
    OcrEngineHealthInput, OcrPageInput, OcrReadingInput, OcrRunInput, Request,
};
pub use find::KINDS as FIND_KINDS;
pub use hooks::{
    CheckInput, DraftChecks, FaultHook, GateBlocker, GrantPolicy, Hooks, NoFaults, NobodyPresent,
    PresencePrompt, Step, StepOneGrants, StubDraftChecks,
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
        if matches!(req, Request::CaptureCommit { .. }) && ctx.origin != Origin::Capture {
            self.audit_firm(
                ctx,
                req.name(),
                "capture records are created only by the browser supervisor",
                b"",
            )?;
            return Err(OaError::new(
                ErrorCode::WriteRefused,
                "capture.commit is accepted only from the browser supervisor",
            ));
        }
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
            Request::EvidenceImport { matter, files } => {
                self.evidence_import(ctx, matter.as_deref(), &files)
            }
            Request::IngestSetText {
                matter,
                evidence,
                text,
            } => self
                .ingest_set_text(ctx, &matter, &evidence, &text)
                .map(one),
            Request::CaptureCommit { matter, capture } => {
                self.capture_commit(ctx, &matter, &capture).map(one)
            }
            Request::CaptureStatus => self.capture_status(),
            Request::IngestStatus { doc } => self.ingest_status(doc.as_deref()),
            Request::EvidenceDuplicates { matter } => self.evidence_duplicates(&matter),
            Request::CodebookShow { scheme } => self.codebook_show(&scheme).map(one),
            Request::AdapterHealth => self.adapter_health(),
            Request::OcrRun { matter, doc, input } => {
                self.ocr_run(ctx, &matter, &doc, &input).map(one)
            }
            Request::OcrLines { matter, doc, page } => self.ocr_lines(&matter, &doc, page),
            Request::OcrPipeline { matter } => self.ocr_pipeline(matter.as_deref()),
            Request::OcrDisputes { matter, doc } => {
                self.ocr_disputes(matter.as_deref(), doc.as_deref())
            }
            Request::OcrDecide {
                matter,
                dispute,
                reading,
                text,
            } => self
                .ocr_decide(ctx, &matter, &dispute, &reading, text.as_deref())
                .map(one),
            Request::OcrTypedCopy {
                matter,
                doc,
                page,
                text,
                typist,
            } => self
                .ocr_typed_copy(ctx, &matter, &doc, page, &text, &typist)
                .map(one),
            Request::ExtractEntities { matter, doc } => self.extract_entities(&matter, &doc),
            Request::OcrEngines => self.ocr_engines(),
            Request::NotebookShow { matter, section } => {
                self.notebook_show(&matter, section.as_deref()).map(one)
            }
            Request::NotebookItem {
                matter,
                id,
                version,
            } => self.notebook_item(&matter, &id, version).map(one),
            Request::NotebookFacts { matter, status } => {
                self.notebook_facts(&matter, status.as_deref())
            }
            Request::NotebookChronology {
                matter,
                view,
                show_excluded,
                for_prose,
            } => self.notebook_chronology(&matter, view.as_deref(), show_excluded, for_prose),
            Request::NotebookReady { matter } => self.notebook_ready(&matter).map(one),
            Request::NotebookConflicts { matter } => self.notebook_conflicts(&matter),
            Request::Trace { matter, id } => self.trace(&matter, &id).map(one),
            Request::NotebookPropose { matter, item } => {
                self.notebook_propose(ctx, &matter, &item).map(one)
            }
            Request::NotebookExtract { matter, doc } => {
                self.notebook_extract(ctx, &matter, &doc).map(one)
            }
            Request::NotebookCorrect {
                matter,
                id,
                reason,
                item,
            } => self
                .notebook_correct(ctx, &matter, &id, &reason, &item)
                .map(one),
            Request::NotebookExclude {
                matter,
                view,
                event,
                category,
                restore,
            } => self
                .notebook_exclude(
                    ctx,
                    &matter,
                    &view,
                    event.as_deref(),
                    category.as_deref(),
                    restore,
                )
                .map(one),
            Request::NotebookImpugnedSet { matter, order } => {
                self.notebook_impugned_set(ctx, &matter, &order).map(one)
            }
            Request::NotebookConfirm { matter, id } => {
                self.notebook_confirm(ctx, &matter, &id).map(one)
            }
            Request::NotebookSkip {
                matter,
                review,
                reason,
            } => self.notebook_skip(ctx, &matter, &review, &reason).map(one),
            Request::NotebookDateAnchor { matter, doc, date } => self
                .notebook_date_anchor(ctx, &matter, &doc, &date)
                .map(one),
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
            Request::View {
                matter,
                target,
                page,
            } => self.view(&matter, &target, page).map(one),
            Request::DraftNew {
                matter,
                title,
                template,
                from_notebook,
            } => self
                .draft_new(ctx, &matter, &title, &template, from_notebook)
                .map(one),
            Request::DraftParagraphs { matter, rev } => {
                self.draft_paragraphs(&matter, &rev).map(one)
            }
            Request::DraftPropose {
                matter,
                draft,
                para,
                replace,
                reason,
                turn,
            } => self
                .draft_propose(
                    ctx,
                    &matter,
                    documents::ProposeArgs {
                        draft,
                        para,
                        replace,
                        reason,
                        turn,
                    },
                )
                .map(one),
            Request::DraftProposals { matter, draft, all } => {
                self.draft_proposals(&matter, draft.as_deref(), all)
            }
            Request::DraftAccept { matter, proposal } => {
                self.draft_accept(ctx, &matter, &proposal).map(one)
            }
            Request::DraftReject {
                matter,
                proposal,
                reason,
            } => self.draft_reject(ctx, &matter, &proposal, reason).map(one),
            Request::DraftRevert { matter, draft, rev } => {
                self.draft_revert(ctx, &matter, &draft, &rev).map(one)
            }
            Request::DraftOpenEditor { matter, draft } => {
                self.draft_open_editor(ctx, &matter, &draft).map(one)
            }
            Request::DraftEditorStatus { matter, draft } => {
                self.draft_editor_status(&matter, &draft).map(one)
            }
            Request::DraftImportWorkingCopy {
                matter,
                draft,
                autosave,
            } => self
                .draft_import_working_copy(ctx, &matter, &draft, autosave)
                .map(one),
            Request::DraftDiff { matter, a, b } => self.draft_diff(&matter, &a, &b).map(one),
            Request::DraftChanges { matter, draft } => self.draft_changes(&matter, &draft).map(one),
            Request::DraftNote {
                matter,
                draft,
                rev,
                para,
                text,
                to_agent,
            } => self
                .draft_note(
                    ctx,
                    &matter,
                    &documents::NoteArgs {
                        draft,
                        rev,
                        para,
                        text,
                        to_agent,
                    },
                )
                .map(one),
            Request::DraftRender { matter, rev } => self.draft_render(ctx, &matter, &rev).map(one),
            Request::FilingPdf {
                matter,
                rev,
                annexures,
            } => self.filing_pdf(ctx, &matter, &rev, &annexures).map(one),
            Request::FilingConversions { matter } => self.filing_conversions(&matter),
            Request::FidelityCheck { matter, rev } => self.fidelity_check(&matter, &rev).map(one),
            Request::PdfOpenEditor { matter, target } => {
                self.pdf_open_editor(ctx, &matter, &target).map(one)
            }
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
            Request::SettingsList => self.settings_list(),
            Request::ApprovalList { matter } => self.approval_list(&matter),
            Request::Find {
                matter,
                query,
                kinds,
                filter,
            } => self.find(matter.as_deref(), &query, &kinds, filter.as_deref()),
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
