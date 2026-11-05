//! `oa`: parses arguments, sends one request, prints the response. It holds no
//! logic of its own (spec B: "the CLI holds no logic").
//!
//! By default `oa` runs a headless kernel in this process, for scripted runs.
//! With `--connect` it talks to a running kernel (`oa kernel serve`) over the
//! control pipe, and the kernel decides the connection's origin.

use std::io::{BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use clap::{Args, Parser, Subcommand};
mod harness_cmds;
mod in_process;

use in_process::InProcess;
use oa_client::{Client, PipeClient};
use oa_kernel::{
    Attachment, ClientSpec, ContactInput, Hooks, Kernel, OcrEngineHealthInput, OcrPageInput,
    OcrReadingInput, OcrRunInput, PresencePrompt, Request,
};
use oa_ocr::{sha256_hex, EngineJob, Reading};
use oa_store::sqlite::SqliteFactory;
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::Value;

#[derive(Parser)]
#[command(name = "oa", version, about = "Open Advocate control CLI")]
struct Cli {
    /// One JSON object per line on stdout, and nothing else.
    #[arg(long, global = true)]
    json: bool,
    /// Application data folder. Defaults to OA_APP_DATA, then %APPDATA%\OpenAdvocate.
    #[arg(long, global = true, value_name = "DIR")]
    app_data: Option<PathBuf>,
    /// Idempotency key for internal commands. Generated when omitted.
    #[arg(long, global = true, value_name = "KEY")]
    idempotency_key: Option<String>,
    /// Talk to a running kernel over the control pipe instead of running one.
    #[arg(long, global = true)]
    connect: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Workspace root
    #[command(subcommand)]
    Workspace(WorkspaceCmd),
    /// Matter workspaces
    #[command(subcommand)]
    Matter(MatterCmd),
    /// The global registry
    #[command(subcommand)]
    Registry(RegistryCmd),
    /// Firm settings (the legal layer is read only)
    #[command(subcommand)]
    Settings(SettingsCmd),
    /// Long jobs
    #[command(subcommand)]
    Job(JobCmd),
    /// The canonical ledger of a matter
    #[command(subcommand)]
    Ledger(LedgerCmd),
    /// Refused writes and accepted commands
    #[command(subcommand)]
    Audit(AuditCmd),
    /// Source documents
    #[command(subcommand)]
    Evidence(EvidenceCmd),
    /// Import files or a folder into a matter's evidence and ingest queue
    Import {
        paths: Vec<PathBuf>,
        #[arg(long)]
        matter: Option<String>,
    },
    /// Capture queue: pending captures, CAPTCHA waits and failures
    #[command(subcommand)]
    Capture(CaptureCmd),
    /// Per-file ingestion state
    #[command(subcommand)]
    Ingest(IngestCmd),
    /// Court codebooks
    #[command(subcommand)]
    Codebook(CodebookCmd),
    /// OCR and document intelligence
    #[command(subcommand)]
    Ocr(OcrCmd),
    /// Entity extraction from an OCR run
    #[command(subcommand)]
    Extract(ExtractCmd),
    /// The Notebook: sections, facts, chronology, conflicts and readiness
    #[command(subcommand)]
    Notebook(NotebookCmd),
    /// The chain from a Notebook item to its original file
    Trace {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    /// Drafts and their revisions
    #[command(subcommand)]
    Draft(DraftCmd),
    /// Open a revision, a conversion or an evidence document in our viewer
    View {
        #[command(flatten)]
        m: MatterArg,
        target: String,
        #[arg(long)]
        page: Option<u32>,
    },
    /// The filing PDF/A and its conversion records
    #[command(subcommand)]
    Filing(FilingCmd),
    /// The fidelity oracle
    #[command(subcommand)]
    Fidelity(FidelityCmd),
    /// PDFs for PdfCraft (never the filing PDF)
    #[command(subcommand)]
    Pdf(PdfCmd),
    /// Gates and approvals
    #[command(subcommand)]
    Approval(ApprovalCmd),
    /// The rule pack and standard version a matter pins
    #[command(subcommand)]
    Rules(RulesCmd),
    /// Any record with the ledger events that touched it and its links
    Inspect {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    /// What a record references, and what references it
    #[command(subcommand)]
    Links(LinksCmd),
    /// One search across every record kind
    Find {
        query: String,
        /// Limit to a matter (default: every matter)
        #[arg(long)]
        matter: Option<String>,
        /// Limit to a kind; repeatable
        #[arg(long = "kind")]
        kinds: Vec<String>,
        /// field:value clauses separated by spaces
        #[arg(long)]
        filter: Option<String>,
    },
    /// The browser: one process per profile (matter:<id>, filing, agent).
    /// Profiles live as long as the kernel: use --connect to a running
    /// kernel to keep them between commands
    #[command(subcommand)]
    Browser(BrowserCmd),
    /// Contacts, organisations, counsel, courts and benches (firm data)
    #[command(subcommand)]
    Contacts(ContactsCmd),
    /// Party roles: `oa parties <matter>` lists them, `oa parties set` records one
    #[command(args_conflicts_with_subcommands = true, subcommand_negates_reqs = true)]
    Parties {
        #[arg(required = true)]
        matter: Option<String>,
        #[command(subcommand)]
        cmd: Option<PartiesCmd>,
    },
    /// A matter's or a contact's activity, computed from the ledger
    Timeline {
        /// A matter id, or a contact id
        target: String,
        /// Read the target as a contact even if a matter has that id
        #[arg(long)]
        contact: bool,
    },
    /// The correspondence log. It records calls, meetings and letters; it
    /// never sends anything
    #[command(subcommand)]
    Correspondence(CorrespondenceCmd),
    /// The harness tool registry
    #[command(subcommand)]
    Tools(harness_cmds::ToolsCmd),
    /// Workflow playbooks
    #[command(subcommand)]
    Playbook(harness_cmds::PlaybookCmd),
    /// Supervised processes
    #[command(subcommand)]
    Services(harness_cmds::ServicesCmd),
    /// The agent: runs, effects, memory, context
    #[command(subcommand)]
    Agent(harness_cmds::AgentCmd),
    /// External effects and their state
    #[command(subcommand)]
    Outbox(OutboxCmd),
    /// Run the kernel and its control pipe
    #[command(subcommand)]
    Kernel(KernelCmd),
    /// Print the protocol schema
    Schema {
        /// Only this command's entry
        #[arg(long)]
        command: Option<String>,
    },
    /// Issue any command by name, with its input as JSON
    Call {
        command: String,
        #[arg(long, default_value = "null")]
        input: String,
    },
}

#[derive(Subcommand)]
enum WorkspaceCmd {
    /// Create a workspace root and the global registry
    Init { root: PathBuf },
}

#[derive(Subcommand)]
enum MatterCmd {
    /// Create a matter workspace
    Create {
        #[arg(long)]
        title: String,
        /// An existing client id
        #[arg(long, conflicts_with = "new_client")]
        client: Option<String>,
        /// A client not yet in firm data. Needs a confirmation
        #[arg(long, value_name = "NAME")]
        new_client: Option<String>,
        /// A file to place in the new matter's inbox
        #[arg(long, value_name = "FILE")]
        from: Option<PathBuf>,
    },
    /// Confirm a pending matter for a new client (human command)
    Confirm {
        pending: String,
    },
    /// List matters
    List {
        #[arg(long)]
        include_removed: bool,
    },
    Open {
        id: String,
    },
    Archive {
        id: String,
    },
    Rename {
        id: String,
        title: String,
    },
    /// Write a raw file into the inbox or harness scratch area
    WriteFile {
        id: String,
        relpath: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
    },
}

#[derive(Subcommand)]
enum RegistryCmd {
    /// Rebuild the registry from the matter folders
    Rescan,
}

#[derive(Subcommand)]
enum SettingsCmd {
    Get {
        key: String,
    },
    Set {
        key: String,
        value: String,
    },
    /// Both layers, each value with its source
    List,
}

#[derive(Subcommand)]
enum JobCmd {
    List,
    Show { id: String },
    Cancel { id: String },
}

#[derive(Args)]
struct MatterArg {
    #[arg(long)]
    matter: String,
}

#[derive(Subcommand)]
enum LedgerCmd {
    /// Recent canonical events
    Tail {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        n: Option<u32>,
    },
    /// Recompute the hash chain and report the first break
    Verify {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum AuditCmd {
    /// Refused writes and commands
    Rejected {
        #[arg(long)]
        matter: Option<String>,
    },
    /// Accepted commands with actor and origin
    Commands,
}

#[derive(Subcommand)]
enum EvidenceCmd {
    /// Add a source document (stub until F's `oa import`)
    Add {
        #[command(flatten)]
        m: MatterArg,
        file: PathBuf,
        #[arg(long, default_value = "advocate_import")]
        origin: String,
    },
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Show {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    /// Possible duplicates of the same text after OCR
    Duplicates {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum CaptureCmd {
    /// Pending captures, CAPTCHA waits and failures
    Status,
}

#[derive(Subcommand)]
enum IngestCmd {
    /// Per-file job state, optionally for one document
    Status {
        #[arg(long)]
        doc: Option<String>,
    },
}

#[derive(Subcommand)]
enum CodebookCmd {
    /// A court codebook with its list version
    Show { scheme: String },
}

#[derive(Subcommand)]
enum OcrCmd {
    /// Run both engines on a document and store the agreement
    Run {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
        #[arg(long)]
        pages: Option<String>,
    },
    /// Canonical lines with both readings and agreement state
    Lines {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
        #[arg(long)]
        page: Option<u32>,
    },
    /// Each document's pipeline state, pages and open disputes
    Pipeline {
        #[arg(long)]
        matter: Option<String>,
    },
    /// Open disputes
    Disputes {
        #[arg(long)]
        matter: Option<String>,
        #[arg(long)]
        doc: Option<String>,
    },
    /// Decide a dispute (human command)
    Decide {
        #[command(flatten)]
        m: MatterArg,
        dispute: String,
        #[arg(long, value_parser = ["a", "b", "typed"])]
        reading: String,
        #[arg(long, required_if_eq("reading", "typed"))]
        text: Option<String>,
    },
    /// Record a typed copy for a handwritten page (human command)
    TypedCopy {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
        #[arg(long)]
        page: u32,
        #[arg(long, value_name = "FILE")]
        file: PathBuf,
        #[arg(long)]
        typist: String,
    },
    /// Engine versions, model hashes and health
    Engines,
}

#[derive(Subcommand)]
enum ExtractCmd {
    /// Dates, case numbers, CNRs, parties, amounts, provisions, citations and negations
    Entities {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
    },
}

#[derive(Subcommand)]
enum NotebookCmd {
    /// One or all sections with their counts
    Show {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        section: Option<String>,
    },
    /// One item with its anchors, origin and status
    Item {
        #[command(flatten)]
        m: MatterArg,
        id: String,
        #[arg(long)]
        version: Option<u32>,
    },
    /// The Factual Matrix
    Facts {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long, value_parser = ["candidate", "confirmed", "disputed"])]
        status: Option<String>,
    },
    /// The chronology with exclusions applied by view
    Chronology {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        view: Option<String>,
        #[arg(long)]
        show_excluded: bool,
        /// Only the events a generated List of Dates may state
        #[arg(long)]
        for_prose: bool,
    },
    /// Hide (or with --restore, show again) an event or category in a view
    Exclude {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        view: String,
        #[arg(
            long,
            conflicts_with = "category",
            required_unless_present = "category"
        )]
        event: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        restore: bool,
    },
    /// Confirm a candidate fact (human command)
    Confirm {
        #[command(flatten)]
        m: MatterArg,
        fact: String,
    },
    /// Skip a review item (human command)
    Skip {
        #[command(flatten)]
        m: MatterArg,
        review: String,
        #[arg(long)]
        reason: String,
    },
    /// The impugned order facts
    #[command(subcommand)]
    Impugned(ImpugnedCmd),
    /// The readiness condition and what blocks it
    Ready {
        #[command(flatten)]
        m: MatterArg,
    },
    /// Date, party and amount conflicts
    Conflicts {
        #[command(flatten)]
        m: MatterArg,
    },
    /// Propose an item from a JSON file (a domain service's writer)
    Propose {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long, value_name = "FILE")]
        item: PathBuf,
    },
    /// Candidate facts from a document's OCR lines
    Extract {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
    },
    /// A new version of an item, with a reason
    Correct {
        #[command(flatten)]
        m: MatterArg,
        id: String,
        #[arg(long)]
        reason: String,
        #[arg(long, value_name = "FILE")]
        item: PathBuf,
    },
    /// Answer a document's date question (human command)
    DateAnchor {
        #[command(flatten)]
        m: MatterArg,
        doc: String,
        #[arg(long)]
        date: String,
    },
}

#[derive(Subcommand)]
enum ImpugnedCmd {
    /// Record the facts the portal's lower-court search uses
    Set {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        court_type: String,
        #[arg(long)]
        state: String,
        #[arg(long)]
        bench: String,
        #[arg(long)]
        case_type: String,
        #[arg(long)]
        number: String,
        #[arg(long)]
        year: String,
        #[arg(long)]
        order_date: String,
        #[arg(long)]
        cnr: Option<String>,
    },
}

fn item_file(path: &Path) -> Result<Box<oa_notebook::ItemInput>, OaError> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", path.display())))?;
    serde_json::from_str(&text)
        .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", path.display())))
}

#[derive(Subcommand)]
enum DraftCmd {
    /// Create a draft from a DOCX file (stub until J's `oa draft new`)
    Create {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        title: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
    },
    /// Commit a new revision on top of `--base`
    Commit {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        draft: String,
        #[arg(long)]
        base: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
        #[arg(long)]
        note: Option<String>,
    },
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Log {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
    },
    Show {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
    },
    Checkpoint {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        name: String,
    },
    Restore {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        checkpoint: String,
    },
    /// Generate the first revision from a template
    New {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        title: String,
        #[arg(long, default_value = "slp")]
        template: String,
        /// Fill the List of Dates and Synopsis from the Notebook
        #[arg(long)]
        from_notebook: bool,
    },
    /// Paragraph ids, styles, text and sources from the DOCX engine
    Paragraphs {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
    },
    /// Propose a replacement for one paragraph
    Propose {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        para: String,
        #[arg(long)]
        replace: String,
        #[arg(long)]
        reason: Option<String>,
        /// The agent turn, for the revision's author
        #[arg(long)]
        turn: Option<String>,
    },
    /// Pending proposals (the edit surface)
    Proposals {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        draft: Option<String>,
        /// Every proposal, decided ones too
        #[arg(long)]
        all: bool,
    },
    /// Accept a proposal (a human decision)
    Accept {
        #[command(flatten)]
        m: MatterArg,
        proposal: String,
    },
    /// Reject a proposal (a human decision)
    Reject {
        #[command(flatten)]
        m: MatterArg,
        proposal: String,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Revert one agent edit as a new revision
    Revert {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        rev: String,
    },
    /// Open the head in hosted WordCraft on a working copy
    OpenEditor {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
    },
    /// The editor session: working copy, unimported save, autosave
    EditorStatus {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
    },
    /// Capture WordCraft's saved bytes (or its autosave) as a new revision
    ImportWorkingCopy {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        autosave: bool,
    },
    /// Paragraph-level diff by paragraph id
    Diff {
        #[command(flatten)]
        m: MatterArg,
        a: String,
        b: String,
    },
    /// Every revision against its parent, with authors and notes
    Changes {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
    },
    /// A review note anchored to a paragraph
    Note {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        rev: String,
        #[arg(long)]
        para: String,
        #[arg(long)]
        text: String,
        #[arg(long)]
        to_agent: bool,
    },
    /// Render a revision to PDF through the DOCX engine
    Render {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
        #[arg(long, value_name = "PDF")]
        out: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum FilingCmd {
    /// Build the filing PDF/A from the approved head (exit 1 when refused or
    /// when the conversion check fails)
    Pdf {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
        #[arg(long, value_name = "PDFA")]
        out: Option<PathBuf>,
        /// Evidence ids to annex, in order; repeatable
        #[arg(long = "annex")]
        annexures: Vec<String>,
    },
    /// Every conversion record with its check and validation
    Conversions {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum FidelityCmd {
    /// Compare renderers page by page (exit 1 above the threshold)
    Check {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
    },
}

#[derive(Subcommand)]
enum BrowserCmd {
    /// Navigate in a profile. A download is intercepted, hashed and routed to
    /// the matter inbox with a capture record
    Open {
        url: String,
        /// matter:<id>, filing or agent (default: matter:<--matter>)
        #[arg(long)]
        profile: Option<String>,
        /// The matter a download from the filing or agent profile goes to
        #[arg(long)]
        matter: Option<String>,
    },
    /// Profiles, processes, tabs, URL, title and load state
    State {
        #[arg(long)]
        profile: Option<String>,
    },
    /// DOM content for a selector (tag, #id, .class, tag.class)
    Dom {
        selector: String,
        #[arg(long)]
        profile: Option<String>,
    },
    /// Main text, links and tables, labelled untrusted, with URL and time
    Extract {
        #[arg(long)]
        profile: Option<String>,
    },
    /// A PNG of the page, only when the DOM has no answer
    Screenshot {
        #[arg(long)]
        profile: Option<String>,
        #[arg(long)]
        out: PathBuf,
    },
    /// Let the agent drive the visible browser for a matter (human only)
    Attach {
        #[arg(value_parser = ["agent"])]
        who: String,
        /// matter:<id>
        #[arg(long)]
        to: String,
    },
    /// Revoke the agent's attachment
    Detach {
        #[arg(value_parser = ["agent"])]
        who: String,
    },
    /// Attachments of the agent to visible profiles, active and past
    Attachments,
    /// Intercepted downloads with hashes and capture records
    Downloads {
        #[arg(long)]
        matter: Option<String>,
    },
    /// Every connection per profile, allowed or refused
    Egress {
        #[arg(long)]
        profile: Option<String>,
        /// Only refused connections
        #[arg(long)]
        refused: bool,
    },
    /// Open DevTools in a profile (refused in the filing profile)
    Devtools {
        #[arg(long)]
        profile: String,
    },
}

#[derive(clap::Args)]
struct ContactFields {
    /// person, organisation, counsel, court or bench
    #[arg(long)]
    kind: Option<String>,
    /// Where a court or bench comes from, for example codebook:<scheme>/<code>
    #[arg(long)]
    source: Option<String>,
    #[arg(long)]
    organisation: Option<String>,
    #[arg(long)]
    phone: Option<String>,
    #[arg(long)]
    email: Option<String>,
    #[arg(long)]
    address: Option<String>,
    #[arg(long)]
    note: Option<String>,
}

impl ContactFields {
    fn input(self, name: String, default_kind: &str) -> ContactInput {
        ContactInput {
            name,
            kind: self.kind.unwrap_or_else(|| default_kind.to_string()),
            source: self.source,
            organisation: self.organisation,
            phone: self.phone,
            email: self.email,
            address: self.address,
            note: self.note,
        }
    }
}

#[derive(Subcommand)]
enum ContactsCmd {
    /// Every contact, optionally of one kind
    List {
        #[arg(long)]
        kind: Option<String>,
    },
    /// Add a contact
    Add {
        name: String,
        #[command(flatten)]
        f: ContactFields,
    },
    /// A contact with every matter and role
    Show { id: String },
    /// Change a contact; fields not given are kept, an empty value clears one
    Edit {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[command(flatten)]
        f: ContactFields,
    },
}

#[derive(Subcommand)]
enum PartiesCmd {
    /// Record a party role in a matter
    Set {
        matter: String,
        #[arg(long)]
        contact: String,
        /// petitioner, respondent, appellant, applicant, plaintiff, ...
        #[arg(long)]
        role: String,
        /// The name as it appears in the record, if it differs from the contact's
        #[arg(long)]
        record_name: Option<String>,
    },
}

#[derive(Subcommand)]
enum CorrespondenceCmd {
    /// Log a call, meeting, letter, email or notice
    Log {
        matter: String,
        /// call, meeting, letter, email or notice
        #[arg(long)]
        kind: String,
        #[arg(long)]
        summary: String,
        #[arg(long)]
        contact: Option<String>,
        /// When it happened (RFC 3339 or a date); defaults to now
        #[arg(long)]
        at: Option<String>,
    },
}

#[derive(Subcommand)]
enum PdfCmd {
    /// A working copy of a PDF for PdfCraft
    OpenEditor {
        #[command(flatten)]
        m: MatterArg,
        target: String,
    },
}

#[derive(Subcommand)]
enum ApprovalCmd {
    /// Every approval, with stale ones marked
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Request {
        #[command(flatten)]
        m: MatterArg,
        gate: String,
        #[arg(long)]
        target: String,
    },
    /// Record a decision (human command)
    Decide {
        #[command(flatten)]
        m: MatterArg,
        id: String,
        #[arg(long, conflicts_with = "reject", required_unless_present = "reject")]
        accept: bool,
        #[arg(long)]
        reject: bool,
        #[arg(long)]
        reason: String,
    },
    Status {
        #[command(flatten)]
        m: MatterArg,
        gate: String,
        #[arg(long)]
        target: String,
    },
}

#[derive(Subcommand)]
enum RulesCmd {
    Pin {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum LinksCmd {
    Out {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    In {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
}

#[derive(Subcommand)]
enum KernelCmd {
    /// Serve the control pipe until stopped
    Serve,
    /// Asks the serving kernel to checkpoint jobs and stop
    Shutdown,
}

#[derive(Subcommand)]
enum OutboxCmd {
    /// Every external effect with its state
    List {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        state: Option<String>,
    },
    /// Reconcile an unknown effect
    Reconcile {
        #[command(flatten)]
        m: MatterArg,
        id: String,
        #[arg(long, default_value = "sent")]
        outcome: String,
        #[arg(long)]
        detail: Option<String>,
    },
}

/// Stub for H-09: a terminal confirmation. Refuses when no terminal is
/// attached, so a script or a process cannot confirm on its own.
struct TerminalPresence;

impl PresencePrompt for TerminalPresence {
    fn confirm(&self, summary: &str) -> bool {
        if !std::io::stdin().is_terminal() || !std::io::stderr().is_terminal() {
            return false;
        }
        let mut err = std::io::stderr();
        let _ = write!(err, "{summary}?\nType yes to confirm: ");
        let _ = err.flush();
        let mut line = String::new();
        std::io::stdin().lock().read_line(&mut line).is_ok() && line.trim() == "yes"
    }
}

fn app_data(flag: Option<PathBuf>) -> PathBuf {
    flag.or_else(|| std::env::var_os("OA_APP_DATA").map(PathBuf::from))
        .or_else(|| std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("OpenAdvocate")))
        .unwrap_or_else(|| PathBuf::from(".openadvocate"))
}

fn attachment(path: &Path) -> Result<Attachment, OaError> {
    let bytes = std::fs::read(path)
        .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", path.display())))?;
    Ok(Attachment {
        file_name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        bytes,
    })
}

/// `oa import` accepts files and folders; a folder is walked in path order so
/// the same import gives the same order every time.
fn files_in(path: &Path) -> Result<Vec<PathBuf>, OaError> {
    if path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }
    if !path.is_dir() {
        return Err(OaError::new(
            ErrorCode::Usage,
            format!("{} is not a file or folder", path.display()),
        ));
    }
    let mut files = Vec::new();
    let mut pending = vec![path.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let mut entries: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", dir.display())))?
            .flatten()
            .map(|e| e.path())
            .collect();
        entries.sort();
        for entry in entries {
            if entry.is_dir() {
                pending.push(entry);
            } else if entry.is_file() {
                files.push(entry);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn import_attachments(paths: &[PathBuf]) -> Result<Vec<Attachment>, OaError> {
    let mut out = Vec::new();
    for path in paths {
        for file in files_in(path)? {
            out.push(attachment(&file)?);
        }
    }
    Ok(out)
}

fn kernel(app: &Path) -> Kernel {
    let hooks = Hooks {
        presence: Arc::new(TerminalPresence),
        ..Hooks::default()
    };
    Kernel::new(app, Arc::new(SqliteFactory), hooks)
}

fn request(cmd: Command) -> Result<Request, OaError> {
    Ok(match cmd {
        Command::Workspace(WorkspaceCmd::Init { root }) => Request::WorkspaceInit { root },
        Command::Matter(m) => match m {
            MatterCmd::Create {
                title,
                client,
                new_client,
                from,
            } => {
                let client = match (client, new_client) {
                    (Some(id), _) => ClientSpec::Existing(id),
                    (None, Some(name)) => ClientSpec::New(name),
                    (None, None) => ClientSpec::None,
                };
                let from = from.as_deref().map(attachment).transpose()?;
                Request::MatterCreate {
                    title,
                    client,
                    from,
                }
            }
            MatterCmd::Confirm { pending } => Request::MatterConfirm { pending },
            MatterCmd::List { include_removed } => Request::MatterList { include_removed },
            MatterCmd::Open { id } => Request::MatterOpen { id },
            MatterCmd::Archive { id } => Request::MatterArchive { id },
            MatterCmd::Rename { id, title } => Request::MatterRename { id, title },
            MatterCmd::WriteFile { id, relpath, from } => Request::MatterWriteFile {
                id,
                relpath,
                bytes: attachment(&from)?.bytes,
            },
        },
        Command::Registry(RegistryCmd::Rescan) => Request::RegistryRescan,
        Command::Settings(SettingsCmd::Get { key }) => Request::SettingsGet { key },
        Command::Settings(SettingsCmd::List) => Request::SettingsList,
        Command::Settings(SettingsCmd::Set { key, value }) => Request::SettingsSet { key, value },
        Command::Job(JobCmd::List) => Request::JobList,
        Command::Job(JobCmd::Show { id }) => Request::JobShow { id },
        Command::Job(JobCmd::Cancel { id }) => Request::JobCancel { id },
        Command::Ledger(LedgerCmd::Tail { m, n }) => Request::LedgerTail {
            matter: m.matter,
            n,
        },
        Command::Ledger(LedgerCmd::Verify { m }) => Request::LedgerVerify { matter: m.matter },
        Command::Audit(AuditCmd::Rejected { matter }) => Request::AuditRejected { matter },
        Command::Audit(AuditCmd::Commands) => Request::AuditCommands,
        Command::Evidence(e) => match e {
            EvidenceCmd::Add { m, file, origin } => Request::EvidenceAdd {
                matter: m.matter,
                file: attachment(&file)?,
                origin,
            },
            EvidenceCmd::List { m } => Request::EvidenceList { matter: m.matter },
            EvidenceCmd::Show { m, id } => Request::EvidenceShow {
                matter: m.matter,
                id,
            },
            EvidenceCmd::Duplicates { m } => Request::EvidenceDuplicates { matter: m.matter },
        },
        Command::Import { paths, matter } => Request::EvidenceImport {
            matter,
            files: import_attachments(&paths)?,
        },
        Command::Capture(CaptureCmd::Status) => Request::CaptureStatus,
        Command::Ingest(IngestCmd::Status { doc }) => Request::IngestStatus { doc },
        Command::Codebook(CodebookCmd::Show { scheme }) => Request::CodebookShow { scheme },
        Command::Ocr(c) => match c {
            OcrCmd::Run { .. } => unreachable!("handled before a request is built"),
            OcrCmd::Lines { m, doc, page } => Request::OcrLines {
                matter: m.matter,
                doc,
                page,
            },
            OcrCmd::Pipeline { matter } => Request::OcrPipeline { matter },
            OcrCmd::Disputes { matter, doc } => Request::OcrDisputes { matter, doc },
            OcrCmd::Decide {
                m,
                dispute,
                reading,
                text,
            } => Request::OcrDecide {
                matter: m.matter,
                dispute,
                reading,
                text,
            },
            OcrCmd::TypedCopy {
                m,
                doc,
                page,
                file,
                typist,
            } => {
                let text = std::fs::read_to_string(&file).map_err(|e| {
                    OaError::new(ErrorCode::Usage, format!("{}: {e}", file.display()))
                })?;
                Request::OcrTypedCopy {
                    matter: m.matter,
                    doc,
                    page,
                    text,
                    typist,
                }
            }
            OcrCmd::Engines => Request::OcrEngines,
        },
        Command::Extract(ExtractCmd::Entities { m, doc }) => Request::ExtractEntities {
            matter: m.matter,
            doc,
        },
        Command::Trace { m, id } => Request::Trace {
            matter: m.matter,
            id,
        },
        Command::Notebook(n) => match n {
            NotebookCmd::Show { m, section } => Request::NotebookShow {
                matter: m.matter,
                section,
            },
            NotebookCmd::Item { m, id, version } => Request::NotebookItem {
                matter: m.matter,
                id,
                version,
            },
            NotebookCmd::Facts { m, status } => Request::NotebookFacts {
                matter: m.matter,
                status,
            },
            NotebookCmd::Chronology {
                m,
                view,
                show_excluded,
                for_prose,
            } => Request::NotebookChronology {
                matter: m.matter,
                view,
                show_excluded,
                for_prose,
            },
            NotebookCmd::Exclude {
                m,
                view,
                event,
                category,
                restore,
            } => Request::NotebookExclude {
                matter: m.matter,
                view,
                event,
                category,
                restore,
            },
            NotebookCmd::Confirm { m, fact } => Request::NotebookConfirm {
                matter: m.matter,
                id: fact,
            },
            NotebookCmd::Skip { m, review, reason } => Request::NotebookSkip {
                matter: m.matter,
                review,
                reason,
            },
            NotebookCmd::Impugned(ImpugnedCmd::Set {
                m,
                court_type,
                state,
                bench,
                case_type,
                number,
                year,
                order_date,
                cnr,
            }) => Request::NotebookImpugnedSet {
                matter: m.matter,
                order: oa_notebook::ImpugnedOrder {
                    court_type,
                    state,
                    bench,
                    case_type,
                    number,
                    year,
                    order_date,
                    cnr,
                },
            },
            NotebookCmd::Ready { m } => Request::NotebookReady { matter: m.matter },
            NotebookCmd::Conflicts { m } => Request::NotebookConflicts { matter: m.matter },
            NotebookCmd::Propose { m, item } => Request::NotebookPropose {
                matter: m.matter,
                item: item_file(&item)?,
            },
            NotebookCmd::Extract { m, doc } => Request::NotebookExtract {
                matter: m.matter,
                doc,
            },
            NotebookCmd::Correct {
                m,
                id,
                reason,
                item,
            } => Request::NotebookCorrect {
                matter: m.matter,
                id,
                reason,
                item: item_file(&item)?,
            },
            NotebookCmd::DateAnchor { m, doc, date } => Request::NotebookDateAnchor {
                matter: m.matter,
                doc,
                date,
            },
        },
        Command::Draft(d) => match d {
            DraftCmd::Create { m, title, from } => Request::DraftCreate {
                matter: m.matter,
                title,
                file: attachment(&from)?,
            },
            DraftCmd::Commit {
                m,
                draft,
                base,
                from,
                note,
            } => Request::DraftCommit {
                matter: m.matter,
                draft,
                base,
                file: attachment(&from)?,
                note,
            },
            DraftCmd::List { m } => Request::DraftList { matter: m.matter },
            DraftCmd::Log { m, draft } => Request::DraftLog {
                matter: m.matter,
                draft,
            },
            DraftCmd::Show { m, rev } => Request::DraftShow {
                matter: m.matter,
                rev,
            },
            DraftCmd::Checkpoint { m, draft, name } => Request::DraftCheckpoint {
                matter: m.matter,
                draft,
                name,
            },
            DraftCmd::Restore {
                m,
                draft,
                checkpoint,
            } => Request::DraftRestore {
                matter: m.matter,
                draft,
                checkpoint,
            },
            DraftCmd::New {
                m,
                title,
                template,
                from_notebook,
            } => Request::DraftNew {
                matter: m.matter,
                title,
                template,
                from_notebook,
            },
            DraftCmd::Paragraphs { m, rev } => Request::DraftParagraphs {
                matter: m.matter,
                rev,
            },
            DraftCmd::Propose {
                m,
                draft,
                para,
                replace,
                reason,
                turn,
            } => Request::DraftPropose {
                matter: m.matter,
                draft,
                para,
                replace,
                reason,
                turn,
            },
            DraftCmd::Proposals { m, draft, all } => Request::DraftProposals {
                matter: m.matter,
                draft,
                all,
            },
            DraftCmd::Accept { m, proposal } => Request::DraftAccept {
                matter: m.matter,
                proposal,
            },
            DraftCmd::Reject {
                m,
                proposal,
                reason,
            } => Request::DraftReject {
                matter: m.matter,
                proposal,
                reason,
            },
            DraftCmd::Revert { m, draft, rev } => Request::DraftRevert {
                matter: m.matter,
                draft,
                rev,
            },
            DraftCmd::OpenEditor { m, draft } => Request::DraftOpenEditor {
                matter: m.matter,
                draft,
            },
            DraftCmd::EditorStatus { m, draft } => Request::DraftEditorStatus {
                matter: m.matter,
                draft,
            },
            DraftCmd::ImportWorkingCopy { m, draft, autosave } => Request::DraftImportWorkingCopy {
                matter: m.matter,
                draft,
                autosave,
            },
            DraftCmd::Diff { m, a, b } => Request::DraftDiff {
                matter: m.matter,
                a,
                b,
            },
            DraftCmd::Changes { m, draft } => Request::DraftChanges {
                matter: m.matter,
                draft,
            },
            DraftCmd::Note {
                m,
                draft,
                rev,
                para,
                text,
                to_agent,
            } => Request::DraftNote {
                matter: m.matter,
                draft,
                rev,
                para,
                text,
                to_agent,
            },
            DraftCmd::Render { m, rev, out: _ } => Request::DraftRender {
                matter: m.matter,
                rev,
            },
        },
        Command::View { m, target, page } => Request::View {
            matter: m.matter,
            target,
            page,
        },
        Command::Filing(f) => match f {
            FilingCmd::Pdf {
                m,
                rev,
                out: _,
                annexures,
            } => Request::FilingPdf {
                matter: m.matter,
                rev,
                annexures,
            },
            FilingCmd::Conversions { m } => Request::FilingConversions { matter: m.matter },
        },
        Command::Fidelity(FidelityCmd::Check { m, rev }) => Request::FidelityCheck {
            matter: m.matter,
            rev,
        },
        Command::Pdf(PdfCmd::OpenEditor { m, target }) => Request::PdfOpenEditor {
            matter: m.matter,
            target,
        },
        Command::Browser(b) => match b {
            BrowserCmd::Open {
                url,
                profile,
                matter,
            } => {
                let profile = match (profile, &matter) {
                    (Some(p), _) => p,
                    (None, Some(m)) => format!("matter:{m}"),
                    (None, None) => {
                        return Err(OaError::new(
                            ErrorCode::Usage,
                            "pass --profile matter:<id>, filing or agent, or --matter <id>",
                        ))
                    }
                };
                Request::BrowserOpen {
                    profile,
                    url,
                    matter,
                }
            }
            BrowserCmd::State { profile } => Request::BrowserState { profile },
            BrowserCmd::Dom { selector, profile } => Request::BrowserDom { profile, selector },
            BrowserCmd::Extract { profile } => Request::BrowserExtract { profile },
            BrowserCmd::Screenshot { profile, .. } => Request::BrowserScreenshot { profile },
            BrowserCmd::Attach { to, .. } => Request::BrowserAttach {
                matter: to.strip_prefix("matter:").unwrap_or(&to).to_string(),
            },
            BrowserCmd::Detach { .. } => Request::BrowserDetach,
            BrowserCmd::Attachments => Request::BrowserAttachments,
            BrowserCmd::Downloads { matter } => Request::BrowserDownloads { matter },
            BrowserCmd::Egress { profile, refused } => Request::BrowserEgress { profile, refused },
            BrowserCmd::Devtools { profile } => Request::BrowserDevtools { profile },
        },
        Command::Contacts(c) => match c {
            ContactsCmd::List { kind } => Request::ContactsList { kind },
            ContactsCmd::Add { name, f } => Request::ContactsAdd {
                contact: f.input(name, "person"),
            },
            ContactsCmd::Show { id } => Request::ContactsShow { id },
            ContactsCmd::Edit { id, name, f } => Request::ContactsEdit {
                id,
                contact: f.input(name.unwrap_or_default(), ""),
            },
        },
        Command::Parties { matter, cmd } => match cmd {
            Some(PartiesCmd::Set {
                matter,
                contact,
                role,
                record_name,
            }) => Request::PartiesSet {
                matter,
                contact,
                role,
                record_name,
            },
            None => Request::PartiesList {
                matter: matter.unwrap_or_default(),
            },
        },
        Command::Timeline { target, contact } => Request::Timeline {
            matter: (!contact).then(|| target.clone()),
            contact: contact.then_some(target),
        },
        Command::Correspondence(CorrespondenceCmd::Log {
            matter,
            kind,
            summary,
            contact,
            at,
        }) => Request::CorrespondenceLog {
            matter,
            kind,
            summary,
            contact,
            occurred_at: at,
        },
        Command::Approval(a) => match a {
            ApprovalCmd::Request { m, gate, target } => Request::ApprovalRequest {
                matter: m.matter,
                gate,
                target,
            },
            ApprovalCmd::Decide {
                m,
                id,
                accept,
                reject: _,
                reason,
            } => Request::ApprovalDecide {
                matter: m.matter,
                id,
                accept,
                reason,
            },
            ApprovalCmd::List { m } => Request::ApprovalList { matter: m.matter },
            ApprovalCmd::Status { m, gate, target } => Request::ApprovalStatus {
                matter: m.matter,
                gate,
                target,
            },
        },
        Command::Rules(RulesCmd::Pin { m }) => Request::RulesPin { matter: m.matter },
        Command::Find {
            query,
            matter,
            kinds,
            filter,
        } => Request::Find {
            matter,
            query,
            kinds,
            filter,
        },
        Command::Inspect { m, id } => Request::Inspect {
            matter: m.matter,
            id,
        },
        Command::Links(LinksCmd::Out { m, id }) => Request::LinksOut {
            matter: m.matter,
            id,
        },
        Command::Links(LinksCmd::In { m, id }) => Request::LinksIn {
            matter: m.matter,
            id,
        },
        Command::Call { command, input } => {
            let input: Value = serde_json::from_str(&input)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("--input is not JSON: {e}")))?;
            let mut envelope = serde_json::json!({ "command": command });
            if !input.is_null() {
                envelope["input"] = input;
            }
            serde_json::from_value(envelope)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("{command}: {e}")))?
        }
        Command::Outbox(o) => match o {
            OutboxCmd::List { m, state } => Request::OutboxList {
                matter: m.matter,
                state,
            },
            OutboxCmd::Reconcile {
                m,
                id,
                outcome,
                detail,
            } => Request::OutboxReconcile {
                matter: m.matter,
                id,
                outcome,
                detail,
            },
        },
        Command::Kernel(KernelCmd::Shutdown) => Request::KernelShutdown,
        Command::Kernel(KernelCmd::Serve)
        | Command::Schema { .. }
        | Command::Tools(_)
        | Command::Playbook(_)
        | Command::Services(_)
        | Command::Agent(_) => {
            unreachable!("handled before a request is built")
        }
    })
}

/// The schema, or one command's entry in it.
fn schema(command: Option<String>) -> Result<Value, OaError> {
    let schema = Request::schema();
    let Some(name) = command else {
        return Ok(schema);
    };
    schema["oneOf"]
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|e| e["properties"]["command"]["enum"][0] == name.as_str())
        })
        .cloned()
        .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no command {name}")))
}

#[cfg(windows)]
fn serve(app: &Path) -> Result<Vec<Value>, OaError> {
    let name = oa_protocol::pipe_name(app);
    let job = oa_control::HarnessJob::new()
        .map_err(|e| OaError::new(ErrorCode::Unavailable, format!("harness job: {e}")))?;
    eprintln!(
        "{}",
        serde_json::json!({ "serving": name, "app_data": app.to_string_lossy() })
    );
    oa_control::serve(
        Arc::new(kernel(app)),
        Some(Arc::new(job)),
        oa_control::PipeListener::bind(&name),
    )
    .map_err(|e| {
        if e.raw_os_error() == Some(5) || e.kind() == std::io::ErrorKind::PermissionDenied {
            OaError::new(
                ErrorCode::WriteRefused,
                format!("one kernel serves one application data folder; another is already serving: {e}"),
            )
        } else {
            OaError::new(ErrorCode::Unavailable, format!("control pipe {name}: {e}"))
        }
    })?;
    Ok(Vec::new())
}

#[cfg(not(windows))]
fn serve(_app: &Path) -> Result<Vec<Value>, OaError> {
    Err(OaError::new(
        ErrorCode::Unavailable,
        "the control pipe is implemented for Windows first",
    ))
}

/// Short human text: one line per object, scalar fields as `key=value`.
fn human(v: &Value) -> String {
    match v {
        Value::Object(map) => map
            .iter()
            .filter(|(_, v)| !v.is_null())
            .map(|(k, v)| match v {
                Value::String(s) => format!("{k}={s}"),
                other => format!("{k}={other}"),
            })
            .collect::<Vec<_>>()
            .join("  "),
        other => other.to_string(),
    }
}

fn run(cli: Cli) -> Result<Vec<Value>, OaError> {
    let app = app_data(cli.app_data);
    match cli.command {
        Command::Kernel(KernelCmd::Serve) => return serve(&app),
        Command::Schema { command } => return schema(command).map(|s| vec![s]),
        Command::Tools(harness_cmds::ToolsCmd::List) => return Ok(harness_cmds::tools_list()),
        Command::Playbook(c) => return harness_cmds::playbook(c),
        Command::Services(_) => return Ok(harness_cmds::services()),
        Command::Agent(c) => {
            let user = InProcess::new(kernel(&app), Origin::Cli);
            let harness = harness_cmds::harness_client(kernel(&app));
            return harness_cmds::agent(c, &user, harness);
        }
        Command::Ocr(OcrCmd::Run { m, doc, pages }) => {
            return ocr_run(&app, cli.connect, &m.matter, &doc, pages.as_deref())
        }
        Command::Timeline {
            target,
            contact: false,
        } => return timeline(&app, cli.connect, &target),
        _ => {}
    }
    let key = cli.idempotency_key.or_else(|| Some(oa_types::new_key()));
    let out = match &cli.command {
        Command::Draft(DraftCmd::Render { out, .. })
        | Command::Filing(FilingCmd::Pdf { out, .. }) => out.clone(),
        _ => None,
    };
    let shot = match &cli.command {
        Command::Browser(BrowserCmd::Screenshot { out, .. }) => Some(out.clone()),
        _ => None,
    };
    let req = request(cli.command)?;
    let name = req.name();
    let client = client(&app, cli.connect)?;
    let mut values = client.call(key, req)?;
    if let Some(path) = shot {
        write_screenshot(&mut values, &path)?;
    }
    documents_outcome(name, &values, out.as_deref(), cli.json)?;
    Ok(values)
}

/// `oa browser screenshot --out`: the PNG goes to the file, its path to stdout.
fn write_screenshot(values: &mut [Value], path: &Path) -> Result<(), OaError> {
    use base64::Engine;
    let Some(v) = values.first_mut() else {
        return Ok(());
    };
    let png = base64::engine::general_purpose::STANDARD
        .decode(v["png"].as_str().unwrap_or_default())
        .map_err(|e| OaError::new(ErrorCode::Internal, format!("a malformed screenshot: {e}")))?;
    std::fs::write(path, &png).map_err(|e| {
        OaError::new(
            ErrorCode::Unavailable,
            format!("could not write {}: {e}", path.display()),
        )
    })?;
    v["png"] = Value::Null;
    v["out"] = Value::String(path.display().to_string());
    Ok(())
}

/// Spec J commands whose result is a file or a negative check: copy the PDF
/// to `--out`, and exit 1 when a conversion or fidelity check failed.
fn documents_outcome(
    name: &str,
    values: &[Value],
    out: Option<&Path>,
    json: bool,
) -> Result<(), OaError> {
    let Some(v) = values.first() else {
        return Ok(());
    };
    if let Some(out) = out {
        let from = v["path"].as_str().unwrap_or_default();
        std::fs::copy(from, out).map_err(|e| {
            OaError::new(
                ErrorCode::Unavailable,
                format!("could not write {}: {e}", out.display()),
            )
        })?;
        eprintln!("wrote {}", out.display());
    }
    let failed = match name {
        "filing.pdf" => v["state"] == "failed",
        "fidelity.check" => v["passed"] == false,
        _ => false,
    };
    if failed {
        println!("{}", if json { v.to_string() } else { human(v) });
        return Err(OaError::new(
            ErrorCode::CheckFailed,
            format!("{name}: the check failed; the record is above"),
        ));
    }
    Ok(())
}

/// `oa timeline <id>`: a matter's timeline, or a contact's when no matter
/// has that id.
fn timeline(app: &Path, connect: bool, target: &str) -> Result<Vec<Value>, OaError> {
    let c = client(app, connect)?;
    let as_matter = c.call(
        None,
        Request::Timeline {
            matter: Some(target.to_string()),
            contact: None,
        },
    );
    match as_matter {
        Err(e) if matches!(e.code, ErrorCode::NotFound | ErrorCode::Usage) => c
            .call(
                None,
                Request::Timeline {
                    matter: None,
                    contact: Some(target.to_string()),
                },
            )
            .map_err(|_| {
                OaError::new(
                    ErrorCode::NotFound,
                    format!("no matter or contact {target}"),
                )
            }),
        other => other,
    }
}

fn client(app: &Path, connect: bool) -> Result<Box<dyn Client>, OaError> {
    if connect {
        Ok(Box::new(PipeClient::connect(app, Origin::Cli)?))
    } else if let Ok(pipe) = PipeClient::try_connect(app, Origin::Cli) {
        Ok(Box::new(pipe))
    } else {
        Ok(Box::new(InProcess::new(kernel(app), Origin::Cli)))
    }
}

fn engine_path(name: &str) -> PathBuf {
    let env = format!("OA_OCR_{}", name.to_ascii_uppercase());
    if let Some(path) = std::env::var_os(env) {
        return PathBuf::from(path);
    }
    let exe = std::env::current_exe().ok();
    let dir = exe
        .as_ref()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    let beside = dir.join(&file);
    if beside.is_file() {
        return beside;
    }
    if let Some(parent) = dir.parent() {
        let up = parent.join(&file);
        if up.is_file() {
            return up;
        }
    }
    beside
}

/// `oa ocr run` is the one CLI command that does work before the kernel call:
/// it runs the two engine processes and sends their raw readings. The kernel
/// still runs the agreement engine and is the only writer (G rule 3).
fn ocr_run(
    app: &Path,
    connect: bool,
    matter: &str,
    doc: &str,
    _pages: Option<&str>,
) -> Result<Vec<Value>, OaError> {
    let client = client(app, connect)?;
    let shown = client.call(
        None,
        Request::EvidenceShow {
            matter: matter.to_string(),
            id: doc.to_string(),
        },
    )?;
    let blob_path = shown
        .first()
        .and_then(|v| v["blob_path"].as_str())
        .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no bytes for {doc}")))?
        .to_string();
    let bytes = std::fs::read(&blob_path)
        .map_err(|e| OaError::new(ErrorCode::Unavailable, format!("{blob_path}: {e}")))?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    let work = std::env::temp_dir().join(format!("oa-ocr-{}", oa_types::new_key()));
    std::fs::create_dir_all(&work)
        .map_err(|e| OaError::new(ErrorCode::Unavailable, format!("OCR work folder: {e}")))?;
    let sidecar_t = format!("{blob_path}.tesseract.txt");
    let sidecar_p = format!("{blob_path}.paddle.txt");
    let use_engines = Path::new(&sidecar_t).is_file() || Path::new(&sidecar_p).is_file();
    let mut readings = Vec::new();
    let mut health = Vec::new();
    let mut text_layer = None;
    if use_engines {
        for (name, sidecar) in [("tesseract", &sidecar_t), ("paddle", &sidecar_p)] {
            if !Path::new(sidecar).is_file() {
                health.push(OcrEngineHealthInput {
                    engine: name.into(),
                    version: "unknown".into(),
                    model_hash: "unknown".into(),
                    state: "failed".into(),
                    detail: Some(format!("no sidecar {sidecar}")),
                });
                continue;
            }
            let job = EngineJob {
                doc: doc.to_string(),
                page: 1,
                image_path: blob_path.clone(),
                text_layer: None,
                fail_mode: None,
            };
            let run = oa_ocr::run_engine(&engine_path(name), &job, &work, Duration::from_secs(30));
            match &run.failure {
                Some(failure) => health.push(OcrEngineHealthInput {
                    engine: name.into(),
                    version: run.version.clone(),
                    model_hash: run.model_hash.clone(),
                    state: "failed".into(),
                    detail: Some(failure.detail.clone()),
                }),
                None => {
                    health.push(OcrEngineHealthInput {
                        engine: name.into(),
                        version: run.version.clone(),
                        model_hash: run.model_hash.clone(),
                        state: "healthy".into(),
                        detail: None,
                    });
                    for (line, reading) in run.lines.iter().enumerate() {
                        readings.push(OcrReadingInput {
                            page: 1,
                            line: line as u32,
                            reading: reading.clone(),
                        });
                    }
                }
            }
        }
    } else {
        text_layer = Some(text.clone());
        readings.push(OcrReadingInput {
            page: 1,
            line: 0,
            reading: Reading {
                engine: "pdfium".into(),
                engine_version: "pdfium".into(),
                model_hash: "sha256:pdfium-text-layer".into(),
                text,
                confidence: 1.0,
                words: Vec::new(),
            },
        });
    }
    let input = OcrRunInput {
        pages: vec![OcrPageInput {
            page: 1,
            raster_hash: sha256_hex(&bytes),
            width: 0.0,
            height: 0.0,
            dpi: 300,
            text_layer,
        }],
        readings,
        engine_health: health,
    };
    let result = client.call(
        Some(oa_types::new_key()),
        Request::OcrRun {
            matter: matter.to_string(),
            doc: doc.to_string(),
            input,
        },
    );
    let _ = std::fs::remove_dir_all(&work);
    result
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let json = cli.json;
    let result = run(cli);
    let mut out = std::io::stdout().lock();
    match result {
        Ok(values) => {
            for v in values {
                let line = if json { v.to_string() } else { human(&v) };
                let _ = writeln!(out, "{line}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            if json {
                let _ = writeln!(out, "{}", serde_json::json!({ "error": e }));
            }
            eprintln!("error[{}]: {}", e.code.as_str(), e.message);
            ExitCode::from(e.code.exit_code() as u8)
        }
    }
}
