//! SQLite implementations of the repository traits.

use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Row};

use crate::*;

pub const REGISTRY_FILE: &str = "registry.db";
pub const FIRM_FILE: &str = "firm.db";
pub const MATTER_FILE: &str = "matter.db";

const REGISTRY_MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE matters (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        title TEXT NOT NULL,
        archived INTEGER NOT NULL,
        removed INTEGER NOT NULL,
        last_seen TEXT NOT NULL
    );
    CREATE TABLE idempotency (key TEXT PRIMARY KEY, result TEXT NOT NULL);
    CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        done INTEGER NOT NULL,
        total INTEGER NOT NULL,
        cancel_requested INTEGER NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
"#,
    r#"
    CREATE TABLE codebooks (
        scheme TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        codes TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE adapter_health (
        adapter TEXT PRIMARY KEY,
        contract_state TEXT NOT NULL,
        runtime_state TEXT NOT NULL,
        detail TEXT,
        checked_at TEXT NOT NULL
    );
"#,
];

const FIRM_MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        creation_key TEXT UNIQUE,
        created_at TEXT NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE pending (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE rejected_writes (
        at TEXT NOT NULL, actor TEXT NOT NULL, origin TEXT NOT NULL,
        command TEXT NOT NULL, reason TEXT NOT NULL, body_hash TEXT NOT NULL
    );
"#,
    r#"
    CREATE TABLE command_log (
        at TEXT NOT NULL, actor TEXT NOT NULL, origin TEXT NOT NULL,
        command TEXT NOT NULL, idempotency_key TEXT, matter TEXT
    );
"#,
    r#"
    CREATE TABLE browser_egress (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, profile TEXT NOT NULL,
        url TEXT NOT NULL, host TEXT NOT NULL, initiator TEXT NOT NULL,
        kind TEXT NOT NULL, allowed INTEGER NOT NULL, reason TEXT NOT NULL,
        status INTEGER, error TEXT
    );
    CREATE TABLE browser_downloads (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, profile TEXT NOT NULL,
        url TEXT NOT NULL, final_url TEXT NOT NULL, file_name TEXT NOT NULL,
        content_type TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
        matter TEXT, evidence_id TEXT, capture_id TEXT,
        status TEXT NOT NULL, detail TEXT
    );
    CREATE TABLE browser_attachments (
        id TEXT PRIMARY KEY, profile TEXT NOT NULL,
        attached_at TEXT NOT NULL, attached_by TEXT NOT NULL,
        detached_at TEXT, detached_by TEXT
    );
"#,
];

const MATTER_MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE matter_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        archived INTEGER NOT NULL,
        client_id TEXT,
        created_at TEXT NOT NULL,
        standard_version TEXT NOT NULL
    );
    CREATE TABLE ledger (
        seq INTEGER PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        origin TEXT NOT NULL,
        command TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        body TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
    );
    CREATE TABLE rejected_writes (
        at TEXT NOT NULL, actor TEXT NOT NULL, origin TEXT NOT NULL,
        command TEXT NOT NULL, reason TEXT NOT NULL, body_hash TEXT NOT NULL
    );
"#,
    r#"
    CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        primary_origin TEXT NOT NULL,
        blob TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE evidence_origins (
        evidence_id TEXT NOT NULL REFERENCES evidence(id),
        origin TEXT NOT NULL,
        original_name TEXT NOT NULL,
        added_at TEXT NOT NULL
    );
    CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        head TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE revisions (
        hash TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES drafts(id) DEFERRABLE INITIALLY DEFERRED,
        parents TEXT NOT NULL,
        author_kind TEXT NOT NULL,
        author TEXT NOT NULL,
        blob TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
    );
    CREATE TABLE checkpoints (
        draft_id TEXT NOT NULL REFERENCES drafts(id),
        name TEXT NOT NULL,
        revision TEXT NOT NULL REFERENCES revisions(hash),
        created_at TEXT NOT NULL,
        PRIMARY KEY (draft_id, name)
    );
    CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        gate TEXT NOT NULL,
        target TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        decision TEXT,
        reason TEXT,
        decided_at TEXT,
        decided_by TEXT
    );
    CREATE TRIGGER revisions_never_deleted BEFORE DELETE ON revisions
        BEGIN SELECT RAISE(ABORT, 'revisions are never deleted'); END;
    CREATE TRIGGER evidence_never_changes BEFORE UPDATE ON evidence
        BEGIN SELECT RAISE(ABORT, 'evidence entries never change'); END;
    CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
        BEGIN SELECT RAISE(ABORT, 'the ledger is append only'); END;
    CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
        BEGIN SELECT RAISE(ABORT, 'the ledger is append only'); END;
"#,
    r#"
    CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        evidence_id TEXT REFERENCES evidence(id),
        url TEXT NOT NULL,
        final_url TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        blob TEXT,
        profile TEXT NOT NULL,
        gesture TEXT NOT NULL,
        portal_date TEXT,
        adapter TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX captures_status ON captures(status);
    CREATE TABLE ingest (
        id TEXT PRIMARY KEY,
        evidence_id TEXT NOT NULL REFERENCES evidence(id),
        status TEXT NOT NULL,
        format TEXT NOT NULL,
        readability TEXT NOT NULL,
        proposed_class TEXT NOT NULL,
        text_fingerprint TEXT,
        duplicate_of TEXT,
        message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX ingest_evidence ON ingest(evidence_id);
    CREATE INDEX ingest_text ON ingest(text_fingerprint);
"#,
    r#"
    CREATE TABLE ocr_documents (
        doc TEXT PRIMARY KEY REFERENCES evidence(id),
        state TEXT NOT NULL,
        page_count INTEGER NOT NULL,
        disputes INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX ocr_documents_state ON ocr_documents(state);
"#,
    r#"
    CREATE TABLE notebook_items (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        section TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        component TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, version)
    );
    CREATE INDEX notebook_items_section ON notebook_items(section);
    CREATE TABLE notebook_review (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE notebook_exclusions (
        view TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (view, target_kind, target)
    );
    CREATE TABLE notebook_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#,
    r#"
    CREATE TABLE doc_records (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        state TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, id)
    );
    CREATE INDEX doc_records_draft ON doc_records(draft_id);
"#,
];

fn err(e: rusqlite::Error) -> StoreError {
    StoreError::new(StoreErrorKind::Other, e.to_string())
}

fn open(path: &Path, create: bool) -> StoreResult<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if create {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let conn = Connection::open_with_flags(path, flags).map_err(|e| {
        StoreError::new(
            StoreErrorKind::Unavailable,
            format!("cannot open {}: {e}", path.display()),
        )
    })?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| StoreError::new(StoreErrorKind::Unavailable, e.to_string()))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(err)?;
    Ok(conn)
}

/// Applies numbered migrations. Each runs in its own transaction, so a failed
/// migration leaves the previous schema intact (spec E rule 2).
fn migrate(conn: &mut Connection, migrations: &[&str]) -> StoreResult<()> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if current > migrations.len() as i64 {
        return Err(StoreError::new(
            StoreErrorKind::Unavailable,
            format!(
                "schema version {current} is newer than this build supports ({})",
                migrations.len()
            ),
        ));
    }
    for (i, sql) in migrations.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction().map_err(err)?;
        tx.execute_batch(sql).map_err(err)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)
            .map_err(err)?;
        tx.commit().map_err(err)?;
    }
    Ok(())
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SqliteFactory;

impl StoreFactory for SqliteFactory {
    fn registry(&self, app_data: &Path) -> StoreResult<Box<dyn RegistryStore>> {
        let mut conn = open(&app_data.join(REGISTRY_FILE), true)?;
        migrate(&mut conn, REGISTRY_MIGRATIONS)?;
        Ok(Box::new(SqliteRegistry { conn }))
    }

    fn firm(&self, app_data: &Path) -> StoreResult<Box<dyn FirmStore>> {
        let mut conn = open(&app_data.join(FIRM_FILE), true)?;
        migrate(&mut conn, FIRM_MIGRATIONS)?;
        Ok(Box::new(SqliteFirm { conn }))
    }

    fn create_matter(&self, matter_dir: &Path) -> StoreResult<Box<dyn MatterStore>> {
        let path = matter_dir.join(MATTER_FILE);
        if path.exists() {
            return Err(StoreError::new(
                StoreErrorKind::Conflict,
                format!("{} already exists", path.display()),
            ));
        }
        let mut conn = open(&path, true)?;
        migrate(&mut conn, MATTER_MIGRATIONS)?;
        Ok(Box::new(SqliteMatter { conn }))
    }

    fn open_matter(&self, matter_dir: &Path) -> StoreResult<Box<dyn MatterStore>> {
        let path = matter_dir.join(MATTER_FILE);
        if !path.is_file() {
            return Err(StoreError::new(
                StoreErrorKind::NotFound,
                format!("{} is missing", path.display()),
            ));
        }
        let mut conn = open(&path, false)?;
        migrate(&mut conn, MATTER_MIGRATIONS)?;
        Ok(Box::new(SqliteMatter { conn }))
    }
}

struct SqliteRegistry {
    conn: Connection,
}

fn matter_row(r: &Row) -> rusqlite::Result<MatterRow> {
    Ok(MatterRow {
        id: r.get(0)?,
        path: r.get(1)?,
        title: r.get(2)?,
        archived: r.get(3)?,
        removed: r.get(4)?,
        last_seen: r.get(5)?,
    })
}

fn job_row(r: &Row) -> rusqlite::Result<JobRow> {
    let status: String = r.get(2)?;
    Ok(JobRow {
        id: r.get(0)?,
        kind: r.get(1)?,
        status: JobStatus::parse(&status).unwrap_or(JobStatus::Failed),
        done: r.get(3)?,
        total: r.get(4)?,
        cancel_requested: r.get(5)?,
        message: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

fn codebook_row(r: &Row) -> rusqlite::Result<CodebookRow> {
    Ok(CodebookRow {
        scheme: r.get(0)?,
        version: r.get(1)?,
        codes: r.get(2)?,
        updated_at: r.get(3)?,
    })
}

fn adapter_row(r: &Row) -> rusqlite::Result<AdapterHealthRow> {
    Ok(AdapterHealthRow {
        adapter: r.get(0)?,
        contract_state: r.get(1)?,
        runtime_state: r.get(2)?,
        detail: r.get(3)?,
        checked_at: r.get(4)?,
    })
}

const MATTER_COLS: &str = "id, path, title, archived, removed, last_seen";
const JOB_COLS: &str =
    "id, kind, status, done, total, cancel_requested, message, created_at, updated_at";

fn upsert(conn: &Connection, row: &MatterRow) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO matters (id, path, title, archived, removed, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET path = ?2, title = ?3, archived = ?4, removed = ?5, last_seen = ?6",
        params![row.id, row.path, row.title, row.archived, row.removed, row.last_seen],
    )
}

impl RegistryStore for SqliteRegistry {
    fn matter(&self, id: &str) -> StoreResult<Option<MatterRow>> {
        self.conn
            .query_row(
                &format!("SELECT {MATTER_COLS} FROM matters WHERE id = ?1"),
                params![id],
                matter_row,
            )
            .optional()
            .map_err(err)
    }

    fn matters(&self) -> StoreResult<Vec<MatterRow>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {MATTER_COLS} FROM matters ORDER BY id"))
            .map_err(err)?;
        let rows = stmt.query_map([], matter_row).map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    fn upsert_matter(&self, row: &MatterRow) -> StoreResult<()> {
        upsert(&self.conn, row).map(|_| ()).map_err(err)
    }

    fn insert_created_matter(&self, row: &MatterRow, key: &str, result: &str) -> StoreResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        upsert(&tx, row).map_err(err)?;
        tx.execute(
            "INSERT INTO idempotency (key, result) VALUES (?1, ?2)",
            params![key, result],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }

    fn idempotent_result(&self, key: &str) -> StoreResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT result FROM idempotency WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    fn apply_rescan(&self, found: &[MatterRow], seen_at: &str) -> StoreResult<Vec<String>> {
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        for row in found {
            upsert(&tx, row).map_err(err)?;
        }
        let mut newly_removed = Vec::new();
        {
            let mut stmt = tx
                .prepare("SELECT id FROM matters WHERE removed = 0")
                .map_err(err)?;
            let ids: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .map_err(err)?
                .collect::<Result<_, _>>()
                .map_err(err)?;
            for id in ids {
                if !found.iter().any(|f| f.id == id) {
                    newly_removed.push(id);
                }
            }
        }
        for id in &newly_removed {
            tx.execute(
                "UPDATE matters SET removed = 1, last_seen = ?2 WHERE id = ?1",
                params![id, seen_at],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(newly_removed)
    }

    fn create_job(&self, job: &JobRow) -> StoreResult<()> {
        self.conn
            .execute(
                &format!(
                    "INSERT INTO jobs ({JOB_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
                ),
                params![
                    job.id,
                    job.kind,
                    job.status.as_str(),
                    job.done,
                    job.total,
                    job.cancel_requested,
                    job.message,
                    job.created_at,
                    job.updated_at
                ],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn update_job(&self, id: &str, u: &JobUpdate) -> StoreResult<()> {
        let n = self
            .conn
            .execute(
                "UPDATE jobs SET status = ?2, done = ?3, total = ?4, message = ?5, updated_at = ?6 WHERE id = ?1",
                params![id, u.status.as_str(), u.done, u.total, u.message, u.at],
            )
            .map_err(err)?;
        if n == 0 {
            return Err(StoreError::new(
                StoreErrorKind::NotFound,
                format!("no job {id}"),
            ));
        }
        Ok(())
    }

    fn request_cancel(&self, id: &str, at: &str) -> StoreResult<bool> {
        let n = self
            .conn
            .execute(
                "UPDATE jobs SET cancel_requested = 1, updated_at = ?2 WHERE id = ?1 AND status = 'running'",
                params![id, at],
            )
            .map_err(err)?;
        Ok(n == 1)
    }

    fn job(&self, id: &str) -> StoreResult<Option<JobRow>> {
        self.conn
            .query_row(
                &format!("SELECT {JOB_COLS} FROM jobs WHERE id = ?1"),
                params![id],
                job_row,
            )
            .optional()
            .map_err(err)
    }

    fn jobs(&self) -> StoreResult<Vec<JobRow>> {
        let mut stmt = self
            .conn
            .prepare(&format!(
                "SELECT {JOB_COLS} FROM jobs ORDER BY created_at, id"
            ))
            .map_err(err)?;
        let rows = stmt.query_map([], job_row).map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    fn codebook(&self, scheme: &str) -> StoreResult<Option<CodebookRow>> {
        one(
            &self.conn,
            "SELECT scheme, version, codes, updated_at FROM codebooks WHERE scheme = ?1",
            params![scheme],
            codebook_row,
        )
    }

    fn codebooks(&self) -> StoreResult<Vec<CodebookRow>> {
        many(
            &self.conn,
            "SELECT scheme, version, codes, updated_at FROM codebooks ORDER BY scheme",
            params![],
            codebook_row,
        )
    }

    fn upsert_codebook(&self, row: &CodebookRow) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO codebooks (scheme, version, codes, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(scheme) DO UPDATE SET version = ?2, codes = ?3, updated_at = ?4",
                params![row.scheme, row.version, row.codes, row.updated_at],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn adapter_health(&self, adapter: &str) -> StoreResult<Option<AdapterHealthRow>> {
        one(
            &self.conn,
            "SELECT adapter, contract_state, runtime_state, detail, checked_at
             FROM adapter_health WHERE adapter = ?1",
            params![adapter],
            adapter_row,
        )
    }

    fn adapters(&self) -> StoreResult<Vec<AdapterHealthRow>> {
        many(
            &self.conn,
            "SELECT adapter, contract_state, runtime_state, detail, checked_at
             FROM adapter_health ORDER BY adapter",
            params![],
            adapter_row,
        )
    }

    fn upsert_adapter_health(&self, row: &AdapterHealthRow) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO adapter_health (adapter, contract_state, runtime_state, detail, checked_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(adapter) DO UPDATE SET contract_state = ?2, runtime_state = ?3,
                     detail = ?4, checked_at = ?5",
                params![
                    row.adapter,
                    row.contract_state,
                    row.runtime_state,
                    row.detail,
                    row.checked_at
                ],
            )
            .map(|_| ())
            .map_err(err)
    }
}

struct SqliteFirm {
    conn: Connection,
}

fn contact_row(r: &Row) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id: r.get(0)?,
        name: r.get(1)?,
        creation_key: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn rejected_row(r: &Row) -> rusqlite::Result<RejectedWrite> {
    Ok(RejectedWrite {
        at: r.get(0)?,
        actor: r.get(1)?,
        origin: r.get(2)?,
        command: r.get(3)?,
        reason: r.get(4)?,
        body_hash: r.get(5)?,
    })
}

fn insert_rejected(conn: &Connection, r: &RejectedWrite) -> StoreResult<()> {
    conn.execute(
        "INSERT INTO rejected_writes (at, actor, origin, command, reason, body_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![r.at, r.actor, r.origin, r.command, r.reason, r.body_hash],
    )
    .map(|_| ())
    .map_err(err)
}

fn select_rejected(conn: &Connection) -> StoreResult<Vec<RejectedWrite>> {
    let mut stmt = conn
        .prepare("SELECT at, actor, origin, command, reason, body_hash FROM rejected_writes ORDER BY rowid")
        .map_err(err)?;
    let rows = stmt.query_map([], rejected_row).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

impl FirmStore for SqliteFirm {
    fn workspace_root(&self) -> StoreResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM config WHERE key = 'workspace_root'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    fn set_workspace_root(&self, root: &str) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO config (key, value) VALUES ('workspace_root', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = ?1",
                params![root],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn contact(&self, id: &str) -> StoreResult<Option<Contact>> {
        self.conn
            .query_row(
                "SELECT id, name, creation_key, created_at FROM contacts WHERE id = ?1",
                params![id],
                contact_row,
            )
            .optional()
            .map_err(err)
    }

    fn contact_by_creation_key(&self, key: &str) -> StoreResult<Option<Contact>> {
        self.conn
            .query_row(
                "SELECT id, name, creation_key, created_at FROM contacts WHERE creation_key = ?1",
                params![key],
                contact_row,
            )
            .optional()
            .map_err(err)
    }

    fn insert_contact(&self, c: &Contact) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO contacts (id, name, creation_key, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![c.id, c.name, c.creation_key, c.created_at],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn setting(&self, key: &str) -> StoreResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    fn set_setting(&self, key: &str, value: &str, at: &str) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
                params![key, value, at],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn settings(&self) -> StoreResult<Vec<(String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings ORDER BY key")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)
    }

    fn insert_pending(&self, p: &Pending) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO pending (id, kind, payload, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![p.id, p.kind, p.payload, p.created_at],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn pending(&self, id: &str) -> StoreResult<Option<Pending>> {
        self.conn
            .query_row(
                "SELECT id, kind, payload, created_at FROM pending WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Pending {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        payload: r.get(2)?,
                        created_at: r.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(err)
    }

    fn remove_pending(&self, id: &str) -> StoreResult<()> {
        self.conn
            .execute("DELETE FROM pending WHERE id = ?1", params![id])
            .map(|_| ())
            .map_err(err)
    }

    fn record_rejected(&self, r: &RejectedWrite) -> StoreResult<()> {
        insert_rejected(&self.conn, r)
    }

    fn rejected(&self) -> StoreResult<Vec<RejectedWrite>> {
        select_rejected(&self.conn)
    }

    fn log_command(&self, c: &CommandLogRow) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO command_log (at, actor, origin, command, idempotency_key, matter)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    c.at,
                    c.actor,
                    c.origin,
                    c.command,
                    c.idempotency_key,
                    c.matter
                ],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn commands(&self) -> StoreResult<Vec<CommandLogRow>> {
        many(
            &self.conn,
            "SELECT at, actor, origin, command, idempotency_key, matter FROM command_log ORDER BY rowid",
            params![],
            |r| {
                Ok(CommandLogRow {
                    at: r.get(0)?,
                    actor: r.get(1)?,
                    origin: r.get(2)?,
                    command: r.get(3)?,
                    idempotency_key: r.get(4)?,
                    matter: r.get(5)?,
                })
            },
        )
    }

    fn insert_egress(&self, rows: &[EgressRow]) -> StoreResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        for e in rows {
            tx.execute(
                "INSERT INTO browser_egress (id, at, profile, url, host, initiator, kind, allowed, reason, status, error)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![e.id, e.at, e.profile, e.url, e.host, e.initiator, e.kind, e.allowed, e.reason, e.status, e.error],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    fn egress(&self) -> StoreResult<Vec<EgressRow>> {
        many(
            &self.conn,
            "SELECT id, at, profile, url, host, initiator, kind, allowed, reason, status, error
             FROM browser_egress ORDER BY rowid",
            params![],
            |r| {
                Ok(EgressRow {
                    id: r.get(0)?,
                    at: r.get(1)?,
                    profile: r.get(2)?,
                    url: r.get(3)?,
                    host: r.get(4)?,
                    initiator: r.get(5)?,
                    kind: r.get(6)?,
                    allowed: r.get(7)?,
                    reason: r.get(8)?,
                    status: r.get(9)?,
                    error: r.get(10)?,
                })
            },
        )
    }

    fn insert_download(&self, d: &DownloadRow) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO browser_downloads (id, at, profile, url, final_url, file_name, content_type, sha256, size, matter, evidence_id, capture_id, status, detail)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![d.id, d.at, d.profile, d.url, d.final_url, d.file_name, d.content_type, d.sha256, d.size, d.matter, d.evidence_id, d.capture_id, d.status, d.detail],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn downloads(&self) -> StoreResult<Vec<DownloadRow>> {
        many(
            &self.conn,
            "SELECT id, at, profile, url, final_url, file_name, content_type, sha256, size, matter, evidence_id, capture_id, status, detail
             FROM browser_downloads ORDER BY rowid",
            params![],
            |r| {
                Ok(DownloadRow {
                    id: r.get(0)?,
                    at: r.get(1)?,
                    profile: r.get(2)?,
                    url: r.get(3)?,
                    final_url: r.get(4)?,
                    file_name: r.get(5)?,
                    content_type: r.get(6)?,
                    sha256: r.get(7)?,
                    size: r.get(8)?,
                    matter: r.get(9)?,
                    evidence_id: r.get(10)?,
                    capture_id: r.get(11)?,
                    status: r.get(12)?,
                    detail: r.get(13)?,
                })
            },
        )
    }

    fn insert_attachment(&self, a: &AttachmentRow) -> StoreResult<()> {
        self.conn
            .execute(
                "INSERT INTO browser_attachments (id, profile, attached_at, attached_by, detached_at, detached_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![a.id, a.profile, a.attached_at, a.attached_by, a.detached_at, a.detached_by],
            )
            .map(|_| ())
            .map_err(err)
    }

    fn end_attachment(&self, at: &str, by: &str) -> StoreResult<bool> {
        self.conn
            .execute(
                "UPDATE browser_attachments SET detached_at = ?1, detached_by = ?2 WHERE detached_at IS NULL",
                params![at, by],
            )
            .map(|n| n > 0)
            .map_err(err)
    }

    fn attachments(&self) -> StoreResult<Vec<AttachmentRow>> {
        many(
            &self.conn,
            "SELECT id, profile, attached_at, attached_by, detached_at, detached_by
             FROM browser_attachments ORDER BY rowid",
            params![],
            |r| {
                Ok(AttachmentRow {
                    id: r.get(0)?,
                    profile: r.get(1)?,
                    attached_at: r.get(2)?,
                    attached_by: r.get(3)?,
                    detached_at: r.get(4)?,
                    detached_by: r.get(5)?,
                })
            },
        )
    }
}

struct SqliteMatter {
    conn: Connection,
}

fn event_row(r: &Row) -> rusqlite::Result<LedgerEvent> {
    Ok(LedgerEvent {
        seq: r.get(0)?,
        recorded_at: r.get(1)?,
        actor: r.get(2)?,
        origin: r.get(3)?,
        command: r.get(4)?,
        idempotency_key: r.get(5)?,
        body: r.get(6)?,
        prev_hash: r.get(7)?,
        hash: r.get(8)?,
    })
}

const EVENT_COLS: &str =
    "seq, recorded_at, actor, origin, command, idempotency_key, body, prev_hash, hash";

fn insert_event(conn: &Connection, e: &LedgerEvent) -> rusqlite::Result<usize> {
    conn.execute(
        &format!("INSERT INTO ledger ({EVENT_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"),
        params![
            e.seq,
            e.recorded_at,
            e.actor,
            e.origin,
            e.command,
            e.idempotency_key,
            e.body,
            e.prev_hash,
            e.hash
        ],
    )
}

fn write_state(conn: &Connection, s: &MatterState) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO matter_state (singleton, id, title, archived, client_id, created_at, standard_version)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(singleton) DO UPDATE SET id = ?1, title = ?2, archived = ?3, client_id = ?4,
             created_at = ?5, standard_version = ?6",
        params![s.id, s.title, s.archived, s.client_id, s.created_at, s.standard_version],
    )
}

fn head(conn: &Connection) -> rusqlite::Result<Option<LedgerEvent>> {
    conn.query_row(
        &format!("SELECT {EVENT_COLS} FROM ledger ORDER BY seq DESC LIMIT 1"),
        [],
        event_row,
    )
    .optional()
}

impl MatterStore for SqliteMatter {
    fn initialise(&self, state: &MatterState, genesis: &LedgerEvent) -> StoreResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        if head(&tx).map_err(err)?.is_some() {
            return Err(StoreError::new(
                StoreErrorKind::Conflict,
                "ledger already has a genesis event",
            ));
        }
        write_state(&tx, state).map_err(err)?;
        insert_event(&tx, genesis).map_err(err)?;
        tx.commit().map_err(err)
    }

    fn state(&self) -> StoreResult<MatterState> {
        self.conn
            .query_row(
                "SELECT id, title, archived, client_id, created_at, standard_version FROM matter_state",
                [],
                |r| {
                    Ok(MatterState {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        archived: r.get(2)?,
                        client_id: r.get(3)?,
                        created_at: r.get(4)?,
                        standard_version: r.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(err)?
            .ok_or_else(|| StoreError::new(StoreErrorKind::NotFound, "matter state is missing"))
    }

    fn last_event(&self) -> StoreResult<Option<LedgerEvent>> {
        head(&self.conn).map_err(err)
    }

    fn events(&self) -> StoreResult<Vec<LedgerEvent>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {EVENT_COLS} FROM ledger ORDER BY seq"))
            .map_err(err)?;
        let rows = stmt.query_map([], event_row).map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    fn event_by_key(&self, key: &str) -> StoreResult<Option<LedgerEvent>> {
        self.conn
            .query_row(
                &format!("SELECT {EVENT_COLS} FROM ledger WHERE idempotency_key = ?1"),
                params![key],
                event_row,
            )
            .optional()
            .map_err(err)
    }

    fn commit(&self, event: &LedgerEvent, writes: &[MatterWrite]) -> StoreResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        let (expected_seq, expected_prev) = match head(&tx).map_err(err)? {
            Some(h) => (h.seq + 1, h.hash),
            None => return Err(conflict("ledger has no genesis event")),
        };
        if event.seq != expected_seq || event.prev_hash != expected_prev {
            return Err(conflict(format!(
                "stale append: expected seq {expected_seq}, got {}",
                event.seq
            )));
        }
        insert_event(&tx, event).map_err(err)?;
        for w in writes {
            apply(&tx, w)?;
        }
        tx.commit().map_err(err)
    }

    fn evidence(&self, id: &str) -> StoreResult<Option<EvidenceRow>> {
        one(
            &self.conn,
            &format!("SELECT {EVIDENCE_COLS} FROM evidence WHERE id = ?1"),
            params![id],
            evidence_row,
        )
    }

    fn evidence_by_blob(&self, blob: &str) -> StoreResult<Option<EvidenceRow>> {
        one(
            &self.conn,
            &format!("SELECT {EVIDENCE_COLS} FROM evidence WHERE blob = ?1"),
            params![blob],
            evidence_row,
        )
    }

    fn evidence_list(&self) -> StoreResult<Vec<EvidenceRow>> {
        many(
            &self.conn,
            &format!("SELECT {EVIDENCE_COLS} FROM evidence ORDER BY created_at, id"),
            params![],
            evidence_row,
        )
    }

    fn origins(&self, evidence_id: &str) -> StoreResult<Vec<OriginRow>> {
        many(
            &self.conn,
            "SELECT evidence_id, origin, original_name, added_at FROM evidence_origins
             WHERE evidence_id = ?1 ORDER BY rowid",
            params![evidence_id],
            |r| {
                Ok(OriginRow {
                    evidence_id: r.get(0)?,
                    origin: r.get(1)?,
                    original_name: r.get(2)?,
                    added_at: r.get(3)?,
                })
            },
        )
    }

    fn draft(&self, id: &str) -> StoreResult<Option<DraftRow>> {
        one(
            &self.conn,
            "SELECT id, title, head, created_at FROM drafts WHERE id = ?1",
            params![id],
            draft_row,
        )
    }

    fn drafts(&self) -> StoreResult<Vec<DraftRow>> {
        many(
            &self.conn,
            "SELECT id, title, head, created_at FROM drafts ORDER BY created_at, id",
            params![],
            draft_row,
        )
    }

    fn revision(&self, hash: &str) -> StoreResult<Option<RevisionRow>> {
        one(
            &self.conn,
            &format!("SELECT {REVISION_COLS} FROM revisions WHERE hash = ?1"),
            params![hash],
            revision_row,
        )
    }

    fn revisions(&self, draft_id: &str) -> StoreResult<Vec<RevisionRow>> {
        many(
            &self.conn,
            &format!("SELECT {REVISION_COLS} FROM revisions WHERE draft_id = ?1 ORDER BY rowid"),
            params![draft_id],
            revision_row,
        )
    }

    fn checkpoint(&self, draft_id: &str, name: &str) -> StoreResult<Option<CheckpointRow>> {
        one(
            &self.conn,
            "SELECT draft_id, name, revision, created_at FROM checkpoints
             WHERE draft_id = ?1 AND name = ?2",
            params![draft_id, name],
            checkpoint_row,
        )
    }

    fn checkpoints(&self, draft_id: &str) -> StoreResult<Vec<CheckpointRow>> {
        many(
            &self.conn,
            "SELECT draft_id, name, revision, created_at FROM checkpoints
             WHERE draft_id = ?1 ORDER BY created_at",
            params![draft_id],
            checkpoint_row,
        )
    }

    fn approval(&self, id: &str) -> StoreResult<Option<ApprovalRow>> {
        one(
            &self.conn,
            &format!("SELECT {APPROVAL_COLS} FROM approvals WHERE id = ?1"),
            params![id],
            approval_row,
        )
    }

    fn approvals(&self) -> StoreResult<Vec<ApprovalRow>> {
        many(
            &self.conn,
            &format!("SELECT {APPROVAL_COLS} FROM approvals ORDER BY requested_at, id"),
            params![],
            approval_row,
        )
    }

    fn capture(&self, id: &str) -> StoreResult<Option<CaptureRow>> {
        one(
            &self.conn,
            &format!("SELECT {CAPTURE_COLS} FROM captures WHERE id = ?1"),
            params![id],
            capture_row,
        )
    }

    fn capture_by_evidence(&self, evidence_id: &str) -> StoreResult<Option<CaptureRow>> {
        one(
            &self.conn,
            &format!("SELECT {CAPTURE_COLS} FROM captures WHERE evidence_id = ?1 ORDER BY created_at DESC LIMIT 1"),
            params![evidence_id],
            capture_row,
        )
    }

    fn captures(&self) -> StoreResult<Vec<CaptureRow>> {
        many(
            &self.conn,
            &format!("SELECT {CAPTURE_COLS} FROM captures ORDER BY created_at, id"),
            params![],
            capture_row,
        )
    }

    fn ingest(&self, id: &str) -> StoreResult<Option<IngestRow>> {
        one(
            &self.conn,
            &format!("SELECT {INGEST_COLS} FROM ingest WHERE id = ?1"),
            params![id],
            ingest_row,
        )
    }

    fn ingest_by_evidence(&self, evidence_id: &str) -> StoreResult<Option<IngestRow>> {
        one(
            &self.conn,
            &format!("SELECT {INGEST_COLS} FROM ingest WHERE evidence_id = ?1 ORDER BY created_at DESC LIMIT 1"),
            params![evidence_id],
            ingest_row,
        )
    }

    fn ingests(&self) -> StoreResult<Vec<IngestRow>> {
        many(
            &self.conn,
            &format!("SELECT {INGEST_COLS} FROM ingest ORDER BY created_at, id"),
            params![],
            ingest_row,
        )
    }

    fn ingests_with_text(&self, fingerprint: &str) -> StoreResult<Vec<IngestRow>> {
        many(
            &self.conn,
            &format!("SELECT {INGEST_COLS} FROM ingest WHERE text_fingerprint = ?1 ORDER BY created_at, id"),
            params![fingerprint],
            ingest_row,
        )
    }

    fn ocr_document(&self, doc: &str) -> StoreResult<Option<OcrDocumentRow>> {
        one(
            &self.conn,
            &format!("SELECT {OCR_DOCUMENT_COLS} FROM ocr_documents WHERE doc = ?1"),
            params![doc],
            ocr_document_row,
        )
    }

    fn ocr_documents(&self) -> StoreResult<Vec<OcrDocumentRow>> {
        many(
            &self.conn,
            &format!("SELECT {OCR_DOCUMENT_COLS} FROM ocr_documents ORDER BY created_at, doc"),
            params![],
            ocr_document_row,
        )
    }

    fn notebook_items(&self) -> StoreResult<Vec<NotebookItemRow>> {
        many(
            &self.conn,
            &format!(
                "SELECT {NOTEBOOK_ITEM_COLS} FROM notebook_items ORDER BY created_at, id, version"
            ),
            params![],
            notebook_item_row,
        )
    }

    fn notebook_review(&self) -> StoreResult<Vec<NotebookReviewRow>> {
        many(
            &self.conn,
            &format!("SELECT {NOTEBOOK_REVIEW_COLS} FROM notebook_review ORDER BY created_at, id"),
            params![],
            notebook_review_row,
        )
    }

    fn notebook_exclusions(&self) -> StoreResult<Vec<NotebookExclusionRow>> {
        many(
            &self.conn,
            "SELECT view, target_kind, target, created_at FROM notebook_exclusions
             ORDER BY view, target_kind, target",
            params![],
            |r| {
                Ok(NotebookExclusionRow {
                    view: r.get(0)?,
                    target_kind: r.get(1)?,
                    target: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )
    }

    fn doc_record(&self, kind: &str, id: &str) -> StoreResult<Option<DocRecordRow>> {
        one(
            &self.conn,
            "SELECT kind, id, draft_id, state, body, created_at, updated_at FROM doc_records
             WHERE kind = ?1 AND id = ?2",
            params![kind, id],
            doc_record_row,
        )
    }

    fn doc_records(&self, kind: &str) -> StoreResult<Vec<DocRecordRow>> {
        many(
            &self.conn,
            "SELECT kind, id, draft_id, state, body, created_at, updated_at FROM doc_records
             WHERE ?1 = '' OR kind = ?1 ORDER BY created_at, id",
            params![kind],
            doc_record_row,
        )
    }

    fn notebook_meta(&self, key: &str) -> StoreResult<Option<String>> {
        one(
            &self.conn,
            "SELECT value FROM notebook_meta WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
    }

    fn record_rejected(&self, r: &RejectedWrite) -> StoreResult<()> {
        insert_rejected(&self.conn, r)
    }

    fn rejected(&self) -> StoreResult<Vec<RejectedWrite>> {
        select_rejected(&self.conn)
    }
}

fn one<T>(
    conn: &Connection,
    sql: &str,
    p: &[&dyn rusqlite::ToSql],
    f: impl FnOnce(&Row) -> rusqlite::Result<T>,
) -> StoreResult<Option<T>> {
    conn.query_row(sql, p, f).optional().map_err(err)
}

fn doc_record_row(r: &Row) -> rusqlite::Result<DocRecordRow> {
    Ok(DocRecordRow {
        kind: r.get(0)?,
        id: r.get(1)?,
        draft_id: r.get(2)?,
        state: r.get(3)?,
        body: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn many<T>(
    conn: &Connection,
    sql: &str,
    p: &[&dyn rusqlite::ToSql],
    f: impl FnMut(&Row) -> rusqlite::Result<T>,
) -> StoreResult<Vec<T>> {
    let mut stmt = conn.prepare(sql).map_err(err)?;
    let rows = stmt.query_map(p, f).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

fn conflict(message: impl Into<String>) -> StoreError {
    StoreError::new(StoreErrorKind::Conflict, message)
}

const EVIDENCE_COLS: &str = "id, original_name, primary_origin, blob, size, created_at";
const REVISION_COLS: &str = "hash, draft_id, parents, author_kind, author, blob, note, created_at";
const APPROVAL_COLS: &str =
    "id, gate, target, requested_at, requested_by, decision, reason, decided_at, decided_by";
const CAPTURE_COLS: &str = "id, evidence_id, url, final_url, captured_at, blob, profile, gesture, portal_date, adapter, status, reason, created_at, updated_at";
const INGEST_COLS: &str = "id, evidence_id, status, format, readability, proposed_class, text_fingerprint, duplicate_of, message, created_at, updated_at";
const OCR_DOCUMENT_COLS: &str = "doc, state, page_count, disputes, data, created_at, updated_at";
const NOTEBOOK_ITEM_COLS: &str = "id, version, section, kind, status, component, data, created_at";
const NOTEBOOK_REVIEW_COLS: &str = "id, kind, key, state, data, created_at, updated_at";

fn evidence_row(r: &Row) -> rusqlite::Result<EvidenceRow> {
    Ok(EvidenceRow {
        id: r.get(0)?,
        original_name: r.get(1)?,
        primary_origin: r.get(2)?,
        blob: r.get(3)?,
        size: r.get(4)?,
        created_at: r.get(5)?,
    })
}

fn draft_row(r: &Row) -> rusqlite::Result<DraftRow> {
    Ok(DraftRow {
        id: r.get(0)?,
        title: r.get(1)?,
        head: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn revision_row(r: &Row) -> rusqlite::Result<RevisionRow> {
    Ok(RevisionRow {
        hash: r.get(0)?,
        draft_id: r.get(1)?,
        parents: r.get(2)?,
        author_kind: r.get(3)?,
        author: r.get(4)?,
        blob: r.get(5)?,
        note: r.get(6)?,
        created_at: r.get(7)?,
    })
}

fn checkpoint_row(r: &Row) -> rusqlite::Result<CheckpointRow> {
    Ok(CheckpointRow {
        draft_id: r.get(0)?,
        name: r.get(1)?,
        revision: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn approval_row(r: &Row) -> rusqlite::Result<ApprovalRow> {
    Ok(ApprovalRow {
        id: r.get(0)?,
        gate: r.get(1)?,
        target: r.get(2)?,
        requested_at: r.get(3)?,
        requested_by: r.get(4)?,
        decision: r.get(5)?,
        reason: r.get(6)?,
        decided_at: r.get(7)?,
        decided_by: r.get(8)?,
    })
}

fn capture_row(r: &Row) -> rusqlite::Result<CaptureRow> {
    Ok(CaptureRow {
        id: r.get(0)?,
        evidence_id: r.get(1)?,
        url: r.get(2)?,
        final_url: r.get(3)?,
        captured_at: r.get(4)?,
        blob: r.get(5)?,
        profile: r.get(6)?,
        gesture: r.get(7)?,
        portal_date: r.get(8)?,
        adapter: r.get(9)?,
        status: r.get(10)?,
        reason: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}

fn ingest_row(r: &Row) -> rusqlite::Result<IngestRow> {
    Ok(IngestRow {
        id: r.get(0)?,
        evidence_id: r.get(1)?,
        status: r.get(2)?,
        format: r.get(3)?,
        readability: r.get(4)?,
        proposed_class: r.get(5)?,
        text_fingerprint: r.get(6)?,
        duplicate_of: r.get(7)?,
        message: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
    })
}

fn ocr_document_row(r: &Row) -> rusqlite::Result<OcrDocumentRow> {
    Ok(OcrDocumentRow {
        doc: r.get(0)?,
        state: r.get(1)?,
        page_count: r.get(2)?,
        disputes: r.get(3)?,
        data: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn notebook_item_row(r: &Row) -> rusqlite::Result<NotebookItemRow> {
    Ok(NotebookItemRow {
        id: r.get(0)?,
        version: r.get(1)?,
        section: r.get(2)?,
        kind: r.get(3)?,
        status: r.get(4)?,
        component: r.get(5)?,
        data: r.get(6)?,
        created_at: r.get(7)?,
    })
}

fn notebook_review_row(r: &Row) -> rusqlite::Result<NotebookReviewRow> {
    Ok(NotebookReviewRow {
        id: r.get(0)?,
        kind: r.get(1)?,
        key: r.get(2)?,
        state: r.get(3)?,
        data: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn is_constraint(e: &rusqlite::Error) -> bool {
    matches!(e, rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation)
}

/// Applies one write inside the commit transaction.
fn apply(tx: &Connection, w: &MatterWrite) -> StoreResult<()> {
    let done = |r: rusqlite::Result<usize>| r.map(|_| ()).map_err(err);
    match w {
        MatterWrite::State(s) => done(write_state(tx, s)),
        MatterWrite::InsertEvidence(e) => done(tx.execute(
            &format!("INSERT INTO evidence ({EVIDENCE_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"),
            params![e.id, e.original_name, e.primary_origin, e.blob, e.size, e.created_at],
        )),
        MatterWrite::AddOrigin(o) => done(tx.execute(
            "INSERT INTO evidence_origins (evidence_id, origin, original_name, added_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![o.evidence_id, o.origin, o.original_name, o.added_at],
        )),
        MatterWrite::InsertDraft(d) => done(tx.execute(
            "INSERT INTO drafts (id, title, head, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![d.id, d.title, d.head, d.created_at],
        )),
        MatterWrite::InsertRevision(r) => done(tx.execute(
            &format!(
                "INSERT INTO revisions ({REVISION_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
            ),
            params![
                r.hash,
                r.draft_id,
                r.parents,
                r.author_kind,
                r.author,
                r.blob,
                r.note,
                r.created_at
            ],
        )),
        MatterWrite::MoveHead {
            draft_id,
            expected,
            new,
        } => {
            let n = tx
                .execute(
                    "UPDATE drafts SET head = ?3 WHERE id = ?1 AND head = ?2",
                    params![draft_id, expected, new],
                )
                .map_err(err)?;
            if n == 1 {
                return Ok(());
            }
            let current: Option<String> = tx
                .query_row(
                    "SELECT head FROM drafts WHERE id = ?1",
                    params![draft_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            Err(conflict(format!(
                "stale parent: the head of draft {draft_id} is {}",
                current.unwrap_or_else(|| "missing".into())
            )))
        }
        MatterWrite::InsertCheckpoint(c) => tx
            .execute(
                "INSERT INTO checkpoints (draft_id, name, revision, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![c.draft_id, c.name, c.revision, c.created_at],
            )
            .map(|_| ())
            .map_err(|e| {
                if is_constraint(&e) {
                    conflict(format!("checkpoint {:?} already exists", c.name))
                } else {
                    err(e)
                }
            }),
        MatterWrite::InsertApproval(a) => done(tx.execute(
            &format!(
                "INSERT INTO approvals ({APPROVAL_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
            ),
            params![
                a.id,
                a.gate,
                a.target,
                a.requested_at,
                a.requested_by,
                a.decision,
                a.reason,
                a.decided_at,
                a.decided_by
            ],
        )),
        MatterWrite::DecideApproval {
            id,
            decision,
            reason,
            decided_at,
            decided_by,
        } => {
            let n = tx
                .execute(
                    "UPDATE approvals SET decision = ?2, reason = ?3, decided_at = ?4, decided_by = ?5
                     WHERE id = ?1 AND decision IS NULL",
                    params![id, decision, reason, decided_at, decided_by],
                )
                .map_err(err)?;
            if n == 1 {
                Ok(())
            } else {
                Err(conflict(format!(
                    "approval {id} is already decided or does not exist"
                )))
            }
        }
        MatterWrite::InsertCapture(c) => done(tx.execute(
            &format!(
                "INSERT INTO captures ({CAPTURE_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"
            ),
            params![
                c.id,
                c.evidence_id,
                c.url,
                c.final_url,
                c.captured_at,
                c.blob,
                c.profile,
                c.gesture,
                c.portal_date,
                c.adapter,
                c.status,
                c.reason,
                c.created_at,
                c.updated_at
            ],
        )),
        MatterWrite::InsertIngest(i) => done(tx.execute(
            &format!(
                "INSERT INTO ingest ({INGEST_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
            ),
            params![
                i.id,
                i.evidence_id,
                i.status,
                i.format,
                i.readability,
                i.proposed_class,
                i.text_fingerprint,
                i.duplicate_of,
                i.message,
                i.created_at,
                i.updated_at
            ],
        )),
        MatterWrite::UpdateCaptureStatus {
            id,
            status,
            reason,
            updated_at,
        } => {
            let n = tx
                .execute(
                    "UPDATE captures SET status = ?2, reason = ?3, updated_at = ?4 WHERE id = ?1",
                    params![id, status, reason, updated_at],
                )
                .map_err(err)?;
            if n == 0 {
                return Err(StoreError::new(
                    StoreErrorKind::NotFound,
                    format!("no capture {id}"),
                ));
            }
            Ok(())
        }
        MatterWrite::SetIngestText {
            id,
            text_fingerprint,
            duplicate_of,
            updated_at,
        } => {
            let n = tx
                .execute(
                    "UPDATE ingest SET text_fingerprint = ?2, duplicate_of = ?3, updated_at = ?4
                     WHERE id = ?1",
                    params![id, text_fingerprint, duplicate_of, updated_at],
                )
                .map_err(err)?;
            if n == 0 {
                return Err(StoreError::new(
                    StoreErrorKind::NotFound,
                    format!("no ingest job {id}"),
                ));
            }
            Ok(())
        }
        MatterWrite::UpsertOcrDocument(o) => done(tx.execute(
            &format!(
                "INSERT INTO ocr_documents ({OCR_DOCUMENT_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(doc) DO UPDATE SET state = ?2, page_count = ?3, disputes = ?4,
                     data = ?5, updated_at = ?7"
            ),
            params![
                o.doc,
                o.state,
                o.page_count,
                o.disputes,
                o.data,
                o.created_at,
                o.updated_at
            ],
        )),
        MatterWrite::InsertNotebookItem(i) => tx
            .execute(
                &format!(
                    "INSERT INTO notebook_items ({NOTEBOOK_ITEM_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
                ),
                params![
                    i.id,
                    i.version,
                    i.section,
                    i.kind,
                    i.status,
                    i.component,
                    i.data,
                    i.created_at
                ],
            )
            .map(|_| ())
            .map_err(|e| {
                if is_constraint(&e) {
                    conflict(format!("notebook item {} version {} exists", i.id, i.version))
                } else {
                    err(e)
                }
            }),
        MatterWrite::UpsertNotebookReview(r) => done(tx.execute(
            &format!(
                "INSERT INTO notebook_review ({NOTEBOOK_REVIEW_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET state = ?4, data = ?5, updated_at = ?7"
            ),
            params![r.id, r.kind, r.key, r.state, r.data, r.created_at, r.updated_at],
        )),
        MatterWrite::AddNotebookExclusion(x) => done(tx.execute(
            "INSERT OR IGNORE INTO notebook_exclusions (view, target_kind, target, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![x.view, x.target_kind, x.target, x.created_at],
        )),
        MatterWrite::RemoveNotebookExclusion {
            view,
            target_kind,
            target,
        } => done(tx.execute(
            "DELETE FROM notebook_exclusions WHERE view = ?1 AND target_kind = ?2 AND target = ?3",
            params![view, target_kind, target],
        )),
        MatterWrite::SetNotebookMeta { key, value } => done(tx.execute(
            "INSERT INTO notebook_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )),
        MatterWrite::InsertDocRecord(d) => done(tx.execute(
            "INSERT INTO doc_records (kind, id, draft_id, state, body, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![d.kind, d.id, d.draft_id, d.state, d.body, d.created_at, d.updated_at],
        )),
        MatterWrite::UpdateDocRecord {
            kind,
            id,
            expected,
            state,
            body,
            updated_at,
        } => {
            let n = tx
                .execute(
                    "UPDATE doc_records SET state = ?4, body = ?5, updated_at = ?6
                     WHERE kind = ?1 AND id = ?2 AND state = ?3",
                    params![kind, id, expected, state, body, updated_at],
                )
                .map_err(err)?;
            if n == 1 {
                Ok(())
            } else {
                Err(conflict(format!("{kind} {id} is no longer {expected}")))
            }
        }
    }
}
