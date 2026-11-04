//! The `oa` binary: JSON lines on stdout and the README exit codes.

use std::path::Path;
use std::process::{Command, Output, Stdio};

use serde_json::Value;

fn oa(app: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_oa"))
        .arg("--json")
        .arg("--app-data")
        .arg(app)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .unwrap()
}

fn lines(out: &Output) -> Vec<Value> {
    String::from_utf8(out.stdout.clone())
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap_or_else(|e| panic!("not a JSON line: {l:?}: {e}")))
        .collect()
}

#[test]
fn cli_commands_print_json_lines_and_use_the_exit_codes() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app ñ");
    let root = tmp.path().join("root dir अ");
    let root_s = root.to_str().unwrap();

    let out = oa(&app, &["workspace", "init", root_s]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    let created = lines(&oa(&app, &["matter", "create", "--title", "State v. Rao"]));
    let id = created[0]["id"].as_str().unwrap().to_string();
    oa(&app, &["matter", "create", "--title", "Second"]);

    let listed = oa(&app, &["matter", "list"]);
    assert_eq!(listed.status.code(), Some(0));
    assert_eq!(lines(&listed).len(), 2, "one JSON line per matter");

    let unknown = oa(&app, &["matter", "open", "not-a-matter"]);
    assert_eq!(unknown.status.code(), Some(2));
    assert!(lines(&unknown)[0]["error"]["code"] == "usage");

    let renamed = oa(&app, &["matter", "rename", &id, "Renamed"]);
    assert_eq!(lines(&renamed)[0]["title"], "Renamed");
}

#[test]
fn a_ac_10_cli_legal_setting_exits_3() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let out = oa(&app, &["settings", "set", "legal.rule_pack", "mine"]);
    assert_eq!(out.status.code(), Some(3));
    assert_eq!(lines(&out)[0]["error"]["code"], "legal_layer_read_only");
}

#[test]
fn a_ac_04_cli_write_into_evidence_exits_3() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "W"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let file = tmp.path().join("a.pdf");
    std::fs::write(&file, b"%PDF").unwrap();
    let out = oa(
        &app,
        &[
            "matter",
            "write-file",
            &id,
            "evidence/a.pdf",
            "--from",
            file.to_str().unwrap(),
        ],
    );
    assert_eq!(out.status.code(), Some(3));
}

#[test]
fn a_ac_05_cli_new_client_without_a_terminal_is_not_confirmed() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let out = oa(
        &app,
        &[
            "matter",
            "create",
            "--title",
            "M",
            "--new-client",
            "Someone",
        ],
    );
    assert_eq!(
        out.status.code(),
        Some(3),
        "a script cannot confirm on its own"
    );
    assert_eq!(lines(&out)[0]["error"]["code"], "confirmation_denied");
}

#[cfg(windows)]
#[test]
fn b_ac_02_oa_connect_talks_to_a_served_kernel_and_oa_call_matches_the_subcommand() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app served");
    let mut server = Command::new(env!("CARGO_BIN_EXE_oa"))
        .arg("--app-data")
        .arg(&app)
        .args(["kernel", "serve"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let connect = |args: &[&str]| {
        let mut all = vec!["--connect"];
        all.extend_from_slice(args);
        oa(&app, &all)
    };
    let root = tmp.path().join("root");
    let init = connect(&["workspace", "init", root.to_str().unwrap()]);
    assert!(
        init.status.success(),
        "{}",
        String::from_utf8_lossy(&init.stderr)
    );
    connect(&["matter", "create", "--title", "Over the pipe"]);
    let via_subcommand = lines(&connect(&["matter", "list"]));
    let via_call = lines(&connect(&[
        "call",
        "matter.list",
        "--input",
        r#"{"include_removed":false}"#,
    ]));
    assert_eq!(via_subcommand, via_call);
    assert_eq!(via_call[0]["title"], "Over the pipe");

    let schema = lines(&oa(&app, &["schema", "--command", "matter.rename"]));
    assert_eq!(
        schema[0]["properties"]["command"]["enum"][0],
        "matter.rename"
    );

    let _ = server.kill();
    let _ = server.wait();
}

#[test]
fn f_cli_import_ingest_status_and_codebook_show() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "Capture"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let file = tmp.path().join("order.pdf");
    std::fs::write(&file, b"%PDF-1.7\n%%EOF\n").unwrap();
    let imported = lines(&oa(
        &app,
        &["import", file.to_str().unwrap(), "--matter", &id],
    ));
    assert_eq!(imported[0]["ingest"]["format"], "pdf");
    let ingest = lines(&oa(&app, &["ingest", "status"]));
    assert_eq!(ingest.len(), 1);
    assert_eq!(ingest[0]["matter"], id);
    let queue = lines(&oa(&app, &["capture", "status"]));
    assert!(queue.is_empty(), "no capture has been recorded");
    let missing = oa(&app, &["codebook", "show", "supreme_court"]);
    assert_eq!(missing.status.code(), Some(2));
    assert_eq!(lines(&missing)[0]["error"]["code"], "not_found");
}

#[test]
fn g_cli_ocr_queries_after_a_call() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "OCR"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let file = tmp.path().join("order.txt");
    std::fs::write(&file, b"paid on 12.03.2019").unwrap();
    let imported = lines(&oa(
        &app,
        &["import", file.to_str().unwrap(), "--matter", &id],
    ));
    let doc = imported[0]["id"].as_str().unwrap().to_string();
    let input = serde_json::json!({
        "matter": id,
        "doc": doc,
        "input": {
            "pages": [{ "page": 1, "raster_hash": "sha256:r", "width": 10.0, "height": 10.0, "dpi": 300, "text_layer": null }],
            "readings": [
                { "page": 1, "line": 0, "reading": { "engine": "tesseract", "engine_version": "stub-1.0", "model_hash": "sha256:m", "text": "paid on 12.03.2019", "confidence": 0.9, "words": [] } },
                { "page": 1, "line": 0, "reading": { "engine": "paddle", "engine_version": "stub-1.0", "model_hash": "sha256:m", "text": "paid on 12.08.2019", "confidence": 0.9, "words": [] } }
            ],
            "engine_health": [
                { "engine": "tesseract", "version": "stub-1.0", "model_hash": "sha256:m", "state": "healthy", "detail": null },
                { "engine": "paddle", "version": "stub-1.0", "model_hash": "sha256:m", "state": "healthy", "detail": null }
            ]
        }
    });
    let run = lines(&oa(
        &app,
        &["call", "ocr.run", "--input", &input.to_string()],
    ));
    assert_eq!(run[0]["state"], "needs_review");
    let lines_out = lines(&oa(&app, &["ocr", "lines", "--matter", &id, &doc]));
    assert_eq!(lines_out.len(), 1);
    let disputes = lines(&oa(
        &app,
        &["ocr", "disputes", "--matter", &id, "--doc", &doc],
    ));
    assert_eq!(disputes.len(), 1);
    let dispute = disputes[0]["id"].as_str().unwrap().to_string();
    let decided = lines(&oa(
        &app,
        &["ocr", "decide", "--matter", &id, &dispute, "--reading", "a"],
    ));
    assert_eq!(decided[0]["state"], "decided");
    let engines = lines(&oa(&app, &["ocr", "engines"]));
    assert_eq!(engines.len(), 2);
    let entities = lines(&oa(&app, &["extract", "entities", "--matter", &id, &doc]));
    assert!(entities.iter().any(|e| e["kind"] == "date"));
    let typed = tmp.path().join("typed.txt");
    std::fs::write(&typed, "typed page").unwrap();
    let copy = lines(&oa(
        &app,
        &[
            "ocr",
            "typed-copy",
            "--matter",
            &id,
            &doc,
            "--page",
            "1",
            "--file",
            typed.to_str().unwrap(),
            "--typist",
            "advocate",
        ],
    ));
    assert_eq!(copy[0]["text"], "typed page");
}

#[test]
fn d_cli_agent_run_uses_harness_origin_policy_and_records_effects() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "Before"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let script = tmp.path().join("script.json");
    let first = serde_json::json!([
        { "kind": "tool_call", "name": "matter.rename", "args": { "id": id, "title": "After" } },
        { "kind": "tool_call", "name": "approval.decide", "args": { "matter": id, "id": "x", "accept": true, "reason": "r" } }
    ]);
    let second = serde_json::json!([{ "kind": "token", "text": "done" }]);
    std::fs::write(&script, serde_json::json!([first, second]).to_string()).unwrap();
    let script_s = script.to_str().unwrap();

    // Without a grant the internal tool is refused, and so is the human one.
    let denied = lines(&oa(
        &app,
        &[
            "agent",
            "run",
            "--matter",
            &id,
            "--instruction",
            "rename it",
            "--script",
            script_s,
        ],
    ));
    let tools = denied[0]["tools"].as_array().unwrap();
    assert!(tools.iter().all(|t| t["state"] == "refused"), "{tools:?}");
    assert_eq!(lines(&oa(&app, &["matter", "list"]))[0]["title"], "Before");

    // With the internal grant the rename runs as origin harness; the human
    // command stays refused. A new script position is needed for a new turn.
    let granted = lines(&oa(
        &app,
        &[
            "agent",
            "run",
            "--matter",
            &id,
            "--instruction",
            "rename it now",
            "--script",
            script_s,
            "--grant-internal",
        ],
    ));
    let tools = granted[0]["tools"].as_array().unwrap();
    let rename = tools.iter().find(|t| t["tool"] == "matter.rename").unwrap();
    let decide = tools
        .iter()
        .find(|t| t["tool"] == "approval.decide")
        .unwrap();
    assert_eq!(rename["state"], "returned");
    assert_eq!(decide["state"], "refused");
    assert_eq!(lines(&oa(&app, &["matter", "list"]))[0]["title"], "After");

    let effects = lines(&oa(&app, &["agent", "effects", "--matter", &id]));
    assert_eq!(effects.len(), 1);
    assert_eq!(effects[0]["state"], "returned");
    let unknown = lines(&oa(
        &app,
        &["agent", "effects", "--matter", &id, "--state", "unknown"],
    ));
    assert!(unknown.is_empty(), "empty after a clean run");
    let audit = lines(&oa(&app, &["audit", "commands"]));
    assert!(
        audit
            .iter()
            .any(|c| c["command"] == "matter.rename" && c["origin"] == "harness"),
        "the kernel recorded the harness origin"
    );
    let ctx = lines(&oa(&app, &["agent", "context", "--matter", &id, "1"]));
    assert!(!ctx.is_empty());
}

#[test]
fn d_cli_tools_list_marks_human_commands_as_not_callable() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let tools = lines(&oa(&app, &["tools", "list"]));
    let decide = tools
        .iter()
        .find(|t| t["name"] == "approval.decide")
        .unwrap();
    assert_eq!(decide["class"], "human");
    assert_eq!(decide["harness_may_call"], false);
    let find = tools.iter().find(|t| t["name"] == "find").unwrap();
    assert_eq!(find["class"], "query");
    let pb = lines(&oa(&app, &["playbook", "show", "slp"]));
    assert_eq!(pb[0]["stages"].as_array().unwrap().len(), 10);
}
