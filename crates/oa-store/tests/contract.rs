use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use tempfile::tempdir;

#[test]
fn e_ct_01_bundled_sqlite_has_fts5_wal_and_begin_immediate_waits() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("contract_test.db");

    // 1. FTS5 is present and usable
    let conn1 = Connection::open(&db_path).unwrap();
    conn1
        .execute("CREATE VIRTUAL TABLE test_fts USING fts5(title, body);", [])
        .expect("FTS5 table creation must succeed; bundled sqlite has fts5 enabled");
    conn1
        .execute(
            "INSERT INTO test_fts (title, body) VALUES (?1, ?2)",
            ["Section 302 IPC", "Punishment for murder under section 302"],
        )
        .unwrap();

    let count: i64 = conn1
        .query_row(
            "SELECT count(*) FROM test_fts WHERE test_fts MATCH 'section 302'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "FTS5 match must find the row");

    // 2. WAL journal mode is supported
    let mode: String = conn1
        .query_row("PRAGMA journal_mode = WAL;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal", "WAL mode must be active");

    // 3. BEGIN IMMEDIATE waiting behavior: second writer waits up to busy_timeout
    conn1.busy_timeout(Duration::from_millis(1000)).unwrap();

    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn2 = Connection::open_with_flags(&db_path, flags).unwrap();
    conn2.busy_timeout(Duration::from_millis(1000)).unwrap();

    // Start immediate transaction on conn1
    let tx1 = rusqlite::Transaction::new_unchecked(&conn1, TransactionBehavior::Immediate).unwrap();
    tx1.execute(
        "INSERT INTO test_fts (title, body) VALUES (?1, ?2)",
        ["tx1", "tx1 body"],
    )
    .unwrap();

    let tx1_committed = Arc::new(AtomicBool::new(false));
    let tx1_committed_clone = tx1_committed.clone();

    let handle = thread::spawn(move || {
        let start = Instant::now();
        // conn2 tries to begin immediate while conn1 holds the write lock
        let tx2 =
            rusqlite::Transaction::new_unchecked(&conn2, TransactionBehavior::Immediate).unwrap();
        let elapsed = start.elapsed();
        assert!(
            tx1_committed_clone.load(Ordering::SeqCst),
            "conn2 must wait until conn1 commits"
        );
        assert!(
            elapsed >= Duration::from_millis(50),
            "conn2 must have waited on the lock, elapsed was {elapsed:?}"
        );
        tx2.commit().unwrap();
    });

    thread::sleep(Duration::from_millis(100));
    tx1_committed.store(true, Ordering::SeqCst);
    tx1.commit().unwrap();

    handle.join().expect("thread completed successfully");
}
