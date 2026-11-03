//! The SQLite harness session store (`<matter>/harness/session.db`, spec E
//! files table and spec D rules 5, 6, 17, 19, 21). The harness depends on the
//! `oa-session` trait, not on this crate.

use std::path::Path;
use std::sync::Mutex;

use oa_session::{
    EffectRow, EffectState, Fence, InstructionRow, Memory, RunRow, SessionError, SessionErrorKind,
    SessionStore, TurnRow, Usage, R,
};
use rusqlite::{params, Connection, OptionalExtension};

const MIGRATIONS: &[&str] = &[r#"
    CREATE TABLE fence (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL);
    INSERT INTO fence (id, n) VALUES (1, 0);
    CREATE TABLE turns (
        n INTEGER PRIMARY KEY, instruction TEXT NOT NULL, outcome TEXT NOT NULL,
        input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cost_micro INTEGER NOT NULL
    );
    CREATE TABLE effects (
        id TEXT PRIMARY KEY, seq INTEGER NOT NULL, turn INTEGER NOT NULL, tool TEXT NOT NULL,
        class TEXT NOT NULL, args_hash TEXT NOT NULL, state TEXT NOT NULL,
        result TEXT, reason TEXT
    );
    CREATE TABLE traces (request_hash TEXT PRIMARY KEY, response TEXT NOT NULL);
    CREATE TABLE manifests (turn INTEGER NOT NULL, step INTEGER NOT NULL, manifest TEXT NOT NULL);
    CREATE TABLE results (call_id TEXT PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE memory (id INTEGER PRIMARY KEY CHECK (id = 1), text TEXT NOT NULL, editor TEXT NOT NULL);
    CREATE TABLE instructions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, text TEXT NOT NULL,
        origin TEXT NOT NULL, outcome TEXT NOT NULL
    );
    CREATE TABLE run (
        id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL, detail TEXT NOT NULL,
        since_ms INTEGER NOT NULL, last_progress_ms INTEGER NOT NULL
    );
"#];

pub struct SqliteSession {
    conn: Mutex<Connection>,
}

fn e(err: rusqlite::Error) -> SessionError {
    SessionError::new(SessionErrorKind::Other, err.to_string())
}

impl SqliteSession {
    /// Opens or creates `session.db` at `path`.
    pub fn open(path: &Path) -> R<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|x| SessionError::new(SessionErrorKind::Other, x.to_string()))?;
        }
        let mut conn = Connection::open(path).map_err(e)?;
        conn.pragma_update(None, "journal_mode", "WAL").map_err(e)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(e)?;
        let current: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(e)?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
            let tx = conn.transaction().map_err(e)?;
            tx.execute_batch(sql).map_err(e)?;
            tx.pragma_update(None, "user_version", (i + 1) as i64)
                .map_err(e)?;
            tx.commit().map_err(e)?;
        }
        Ok(SqliteSession {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }
}

fn check(c: &Connection, fence: Fence) -> R<()> {
    let current: i64 = c
        .query_row("SELECT n FROM fence WHERE id = 1", [], |r| r.get(0))
        .map_err(e)?;
    if (fence as i64) < current {
        return Err(SessionError::new(
            SessionErrorKind::StaleFence,
            format!("fence {fence} is older than the current claim {current}"),
        ));
    }
    Ok(())
}

fn effect_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<EffectRow> {
    let state: String = r.get("state")?;
    Ok(EffectRow {
        id: r.get("id")?,
        turn: r.get::<_, i64>("turn")? as u64,
        tool: r.get("tool")?,
        class: r.get("class")?,
        args_hash: r.get("args_hash")?,
        state: EffectState::parse(&state).unwrap_or(EffectState::Unknown),
        result: r.get("result")?,
        reason: r.get("reason")?,
    })
}

impl SessionStore for SqliteSession {
    fn claim(&self) -> R<Fence> {
        let c = self.lock();
        c.execute("UPDATE fence SET n = n + 1 WHERE id = 1", [])
            .map_err(e)?;
        let n: i64 = c
            .query_row("SELECT n FROM fence WHERE id = 1", [], |r| r.get(0))
            .map_err(e)?;
        Ok(n as Fence)
    }

    fn begin_turn(&self, fence: Fence, instruction: &str) -> R<u64> {
        let c = self.lock();
        check(&c, fence)?;
        let n: i64 = c
            .query_row("SELECT COALESCE(MAX(n), 0) + 1 FROM turns", [], |r| {
                r.get(0)
            })
            .map_err(e)?;
        c.execute(
            "INSERT INTO turns (n, instruction, outcome, input_tokens, output_tokens, cost_micro)
             VALUES (?1, ?2, 'running', 0, 0, 0)",
            params![n, instruction],
        )
        .map_err(e)?;
        Ok(n as u64)
    }

    fn end_turn(&self, fence: Fence, turn: u64, outcome: &str, usage: &Usage) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "UPDATE turns SET outcome = ?2, input_tokens = ?3, output_tokens = ?4, cost_micro = ?5 WHERE n = ?1",
            params![
                turn as i64,
                outcome,
                usage.input_tokens as i64,
                usage.output_tokens as i64,
                usage.cost_micro as i64
            ],
        )
        .map_err(e)?;
        Ok(())
    }

    fn turns(&self) -> R<Vec<TurnRow>> {
        let c = self.lock();
        let mut stmt = c
            .prepare("SELECT n, instruction, outcome, input_tokens, output_tokens, cost_micro FROM turns ORDER BY n")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(TurnRow {
                    n: r.get::<_, i64>(0)? as u64,
                    instruction: r.get(1)?,
                    outcome: r.get(2)?,
                    usage: Usage {
                        input_tokens: r.get::<_, i64>(3)? as u64,
                        output_tokens: r.get::<_, i64>(4)? as u64,
                        cost_micro: r.get::<_, i64>(5)? as u64,
                    },
                })
            })
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)
    }

    fn begin_effect(&self, fence: Fence, row: &EffectRow) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        let seq: i64 = c
            .query_row("SELECT COALESCE(MAX(seq), 0) + 1 FROM effects", [], |r| {
                r.get(0)
            })
            .map_err(e)?;
        c.execute(
            "INSERT INTO effects (id, seq, turn, tool, class, args_hash, state, result, reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL)
             ON CONFLICT(id) DO UPDATE SET state = ?7, result = NULL, reason = NULL",
            params![
                row.id,
                seq,
                row.turn as i64,
                row.tool,
                row.class,
                row.args_hash,
                row.state.as_str()
            ],
        )
        .map_err(e)?;
        Ok(())
    }

    fn finish_effect(
        &self,
        fence: Fence,
        id: &str,
        state: EffectState,
        result: Option<&str>,
        reason: Option<&str>,
    ) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        let n = c
            .execute(
                "UPDATE effects SET state = ?2, result = ?3, reason = ?4 WHERE id = ?1",
                params![id, state.as_str(), result, reason],
            )
            .map_err(e)?;
        if n == 0 {
            return Err(SessionError::new(
                SessionErrorKind::NotFound,
                "no such effect",
            ));
        }
        Ok(())
    }

    fn effect(&self, id: &str) -> R<Option<EffectRow>> {
        self.lock()
            .query_row(
                "SELECT * FROM effects WHERE id = ?1",
                params![id],
                effect_from,
            )
            .optional()
            .map_err(e)
    }

    fn effects(&self) -> R<Vec<EffectRow>> {
        let c = self.lock();
        let mut stmt = c.prepare("SELECT * FROM effects ORDER BY seq").map_err(e)?;
        let rows = stmt.query_map([], effect_from).map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)
    }

    fn mark_started_unknown(&self, fence: Fence) -> R<usize> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "UPDATE effects SET state = 'unknown', reason = 'the harness stopped before the effect returned' WHERE state = 'started'",
            [],
        )
        .map_err(e)
    }

    fn put_trace(&self, fence: Fence, request_hash: &str, response: &str) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "INSERT OR REPLACE INTO traces (request_hash, response) VALUES (?1, ?2)",
            params![request_hash, response],
        )
        .map_err(e)?;
        Ok(())
    }

    fn trace(&self, request_hash: &str) -> R<Option<String>> {
        self.lock()
            .query_row(
                "SELECT response FROM traces WHERE request_hash = ?1",
                params![request_hash],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    fn put_manifest(&self, fence: Fence, turn: u64, step: u32, manifest: &str) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "INSERT INTO manifests (turn, step, manifest) VALUES (?1, ?2, ?3)",
            params![turn as i64, step as i64, manifest],
        )
        .map_err(e)?;
        Ok(())
    }

    fn manifests(&self, turn: u64) -> R<Vec<(u32, String)>> {
        let c = self.lock();
        let mut stmt = c
            .prepare("SELECT step, manifest FROM manifests WHERE turn = ?1 ORDER BY rowid")
            .map_err(e)?;
        let rows = stmt
            .query_map(params![turn as i64], |r| {
                Ok((r.get::<_, i64>(0)? as u32, r.get(1)?))
            })
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)
    }

    fn put_result(&self, fence: Fence, call_id: &str, content: &str) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "INSERT OR REPLACE INTO results (call_id, content) VALUES (?1, ?2)",
            params![call_id, content],
        )
        .map_err(e)?;
        Ok(())
    }

    fn result(&self, call_id: &str) -> R<Option<String>> {
        self.lock()
            .query_row(
                "SELECT content FROM results WHERE call_id = ?1",
                params![call_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    fn memory(&self) -> R<Option<Memory>> {
        self.lock()
            .query_row("SELECT text, editor FROM memory WHERE id = 1", [], |r| {
                Ok(Memory {
                    text: r.get(0)?,
                    editor: r.get(1)?,
                })
            })
            .optional()
            .map_err(e)
    }

    fn set_memory(&self, fence: Option<Fence>, text: &str, editor: &str) -> R<()> {
        let c = self.lock();
        if let Some(f) = fence {
            check(&c, f)?;
        }
        c.execute(
            "INSERT INTO memory (id, text, editor) VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET text = ?1, editor = ?2",
            params![text, editor],
        )
        .map_err(e)?;
        Ok(())
    }

    fn record_instruction(&self, fence: Fence, text: &str, origin: &str) -> R<String> {
        let c = self.lock();
        check(&c, fence)?;
        let next: i64 = c
            .query_row(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM instructions",
                [],
                |r| r.get(0),
            )
            .map_err(e)?;
        let id = format!("I{next}");
        c.execute(
            "INSERT INTO instructions (id, text, origin, outcome) VALUES (?1, ?2, ?3, 'received')",
            params![id, text, origin],
        )
        .map_err(e)?;
        Ok(id)
    }

    fn finish_instruction(&self, id: &str, outcome: &str) -> R<()> {
        let n = self
            .lock()
            .execute(
                "UPDATE instructions SET outcome = ?2 WHERE id = ?1",
                params![id, outcome],
            )
            .map_err(e)?;
        if n == 0 {
            return Err(SessionError::new(
                SessionErrorKind::NotFound,
                "no such instruction",
            ));
        }
        Ok(())
    }

    fn instructions(&self) -> R<Vec<InstructionRow>> {
        let c = self.lock();
        let mut stmt = c
            .prepare("SELECT id, text, origin, outcome FROM instructions ORDER BY seq")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(InstructionRow {
                    id: r.get(0)?,
                    text: r.get(1)?,
                    origin: r.get(2)?,
                    outcome: r.get(3)?,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)
    }

    fn set_run(&self, fence: Fence, run: &RunRow) -> R<()> {
        let c = self.lock();
        check(&c, fence)?;
        c.execute(
            "INSERT INTO run (id, status, detail, since_ms, last_progress_ms) VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET status = ?1, detail = ?2, since_ms = ?3, last_progress_ms = ?4",
            params![run.status, run.detail, run.since_ms as i64, run.last_progress_ms as i64],
        )
        .map_err(e)?;
        Ok(())
    }

    fn run(&self) -> R<Option<RunRow>> {
        self.lock()
            .query_row(
                "SELECT status, detail, since_ms, last_progress_ms FROM run WHERE id = 1",
                [],
                |r| {
                    Ok(RunRow {
                        status: r.get(0)?,
                        detail: r.get(1)?,
                        since_ms: r.get::<_, i64>(2)? as u64,
                        last_progress_ms: r.get::<_, i64>(3)? as u64,
                    })
                },
            )
            .optional()
            .map_err(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn d_ac_18_the_sqlite_session_refuses_an_older_fence_and_survives_a_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("harness").join("session.db");
        let old = {
            let s = SqliteSession::open(&path).unwrap();
            let old = s.claim().unwrap();
            let t = s.begin_turn(old, "first").unwrap();
            s.begin_effect(
                old,
                &EffectRow {
                    id: "e1".into(),
                    turn: t,
                    tool: "note.add".into(),
                    class: "internal".into(),
                    args_hash: "h".into(),
                    state: EffectState::Started,
                    result: None,
                    reason: None,
                },
            )
            .unwrap();
            old
        };
        // A restart: reopen, claim again, and the unfinished effect is unknown.
        let s = SqliteSession::open(&path).unwrap();
        let newer = s.claim().unwrap();
        assert!(newer > old);
        assert_eq!(s.mark_started_unknown(newer).unwrap(), 1);
        assert_eq!(s.effect("e1").unwrap().unwrap().state, EffectState::Unknown);
        let err = s.begin_turn(old, "ghost").unwrap_err();
        assert_eq!(err.kind, SessionErrorKind::StaleFence);
        assert_eq!(s.turns().unwrap().len(), 1);
        // The advocate's memory edit carries no fence.
        s.set_memory(None, "note", "advocate").unwrap();
        assert_eq!(s.memory().unwrap().unwrap().editor, "advocate");
    }
}
