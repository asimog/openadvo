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
fn h_cli_notebook_commands_after_ocr() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "Notebook"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let file = tmp.path().join("order.txt");
    std::fs::write(&file, b"order").unwrap();
    let doc = lines(&oa(
        &app,
        &["import", file.to_str().unwrap(), "--matter", &id],
    ))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let not_ready = oa(&app, &["notebook", "ready", "--matter", &id]);
    assert_eq!(lines(&not_ready)[0]["ready"], false);
    let line = "Order dated 12.03.2019 in W.P. No. 1234/2018";
    let input = serde_json::json!({
        "matter": id,
        "doc": doc,
        "input": {
            "pages": [{ "page": 1, "raster_hash": "sha256:r", "width": 10.0, "height": 10.0, "dpi": 300, "text_layer": null }],
            "readings": [
                { "page": 1, "line": 0, "reading": { "engine": "tesseract", "engine_version": "stub-1.0", "model_hash": "sha256:m", "text": line, "confidence": 0.9, "words": [] } },
                { "page": 1, "line": 0, "reading": { "engine": "paddle", "engine_version": "stub-1.0", "model_hash": "sha256:m", "text": line, "confidence": 0.9, "words": [] } }
            ],
            "engine_health": []
        }
    });
    oa(&app, &["call", "ocr.run", "--input", &input.to_string()]);
    let extracted = lines(&oa(&app, &["notebook", "extract", "--matter", &id, &doc]));
    assert_eq!(extracted[0]["added"], 2);
    let facts = lines(&oa(&app, &["notebook", "facts", "--matter", &id]));
    assert_eq!(facts.len(), 1);
    let fact = facts[0]["id"].as_str().unwrap().to_string();
    let excluded = oa(
        &app,
        &[
            "notebook", "exclude", "--matter", &id, "--view", "synopsis", "--event", &fact,
        ],
    );
    assert!(excluded.status.success());
    let synopsis = lines(&oa(
        &app,
        &[
            "notebook",
            "chronology",
            "--matter",
            &id,
            "--view",
            "synopsis",
        ],
    ));
    assert!(synopsis.is_empty());
    let shown = lines(&oa(
        &app,
        &[
            "notebook",
            "chronology",
            "--matter",
            &id,
            "--view",
            "synopsis",
            "--show-excluded",
        ],
    ));
    assert_eq!(shown[0]["excluded"], true);
    let trace = lines(&oa(&app, &["trace", "--matter", &id, &fact]));
    assert_eq!(trace[0]["chain"][0]["original_file"], "order.txt");
    let set = lines(&oa(
        &app,
        &[
            "notebook",
            "impugned",
            "set",
            "--matter",
            &id,
            "--court-type",
            "HC",
            "--state",
            "27",
            "--bench",
            "1",
            "--case-type",
            "WP",
            "--number",
            "1234",
            "--year",
            "2018",
            "--order-date",
            "2019-03-12",
        ],
    ));
    assert_eq!(set[0]["missing"][0], "cnr");
    let show = lines(&oa(&app, &["notebook", "show", "--matter", &id]));
    assert_eq!(show[0]["counts"].as_array().unwrap().len(), 8);
    assert!(lines(&oa(&app, &["notebook", "conflicts", "--matter", &id])).is_empty());
    // A human command with nobody at a terminal is not confirmed.
    let confirm = oa(&app, &["notebook", "confirm", "--matter", &id, &fact]);
    assert!(!confirm.status.success());
    assert_eq!(lines(&confirm)[0]["error"]["code"], "confirmation_denied");
    let ready = lines(&oa(&app, &["notebook", "ready", "--matter", &id]));
    assert_eq!(ready[0]["ready"], true, "{:?}", ready[0]);
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

/// Drives spec J through the binary. The DOCX engine is the `wordcraft`
/// executable beside `oa`, built with the workspace.
#[test]
fn j_cli_documents_commands_through_the_binary() {
    let oa_exe = std::path::PathBuf::from(env!("CARGO_BIN_EXE_oa"));
    let wordcraft = oa_exe.with_file_name(format!("wordcraft{}", std::env::consts::EXE_SUFFIX));
    assert!(
        wordcraft.is_file(),
        "build the workspace first: {} is missing",
        wordcraft.display()
    );
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let id = lines(&oa(&app, &["matter", "create", "--title", "Rao v. State"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let m = ["--matter", id.as_str()];
    let new = oa(
        &app,
        &[&["draft", "new"][..], &m, &["--title", "SLP"]].concat(),
    );
    assert!(
        new.status.success(),
        "{}",
        String::from_utf8_lossy(&new.stderr)
    );
    let new = lines(&new);
    let draft = new[0]["draft"]["id"].as_str().unwrap().to_string();
    let rev = new[0]["revision"]["hash"].as_str().unwrap().to_string();

    let paras = lines(&oa(
        &app,
        &[&["draft", "paragraphs"][..], &m, &[&rev]].concat(),
    ));
    let para = paras[0]["paragraphs"][4]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let proposed = lines(&oa(
        &app,
        &[
            &["draft", "propose"][..],
            &m,
            &[&draft, "--para", &para, "--replace", "A tighter synopsis."],
        ]
        .concat(),
    ));
    let proposal = proposed[0]["id"].as_str().unwrap().to_string();
    let pending = lines(&oa(&app, &[&["draft", "proposals"][..], &m].concat()));
    assert_eq!(pending.len(), 1);
    // A human command with nobody at a terminal is not confirmed.
    let accept = oa(&app, &[&["draft", "accept"][..], &m, &[&proposal]].concat());
    assert_eq!(accept.status.code(), Some(3));

    let note = oa(
        &app,
        &[
            &["draft", "note"][..],
            &m,
            &[&draft, "--rev", &rev, "--para", &para, "--text", "Check"],
        ]
        .concat(),
    );
    assert!(note.status.success());
    let changes = lines(&oa(
        &app,
        &[&["draft", "changes"][..], &m, &[&draft]].concat(),
    ));
    assert_eq!(changes[0]["notes"].as_array().unwrap().len(), 1);
    let diff = oa(&app, &[&["draft", "diff"][..], &m, &[&rev, &rev]].concat());
    assert!(lines(&diff)[0]["changes"].as_array().unwrap().is_empty());

    let pdf = tmp.path().join("render.pdf");
    let render = oa(
        &app,
        &[
            &["draft", "render"][..],
            &m,
            &[&rev, "--out", pdf.to_str().unwrap()],
        ]
        .concat(),
    );
    assert!(
        render.status.success(),
        "{}",
        String::from_utf8_lossy(&render.stderr)
    );
    assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF-"));

    let fidelity = oa(&app, &[&["fidelity", "check"][..], &m, &[&rev]].concat());
    assert_eq!(fidelity.status.code(), Some(0));
    let view = lines(&oa(&app, &[&["view"][..], &m, &[&rev]].concat()));
    assert_eq!(view[0]["kind"], "docx");

    let editor = lines(&oa(
        &app,
        &[&["draft", "open-editor"][..], &m, &[&draft]].concat(),
    ));
    assert!(editor[0]["working"].is_string());
    let status = lines(&oa(
        &app,
        &[&["draft", "editor-status"][..], &m, &[&draft]].concat(),
    ));
    assert_eq!(status[0]["state"], "open");
    let import = lines(&oa(
        &app,
        &[&["draft", "import-working-copy"][..], &m, &[&draft]].concat(),
    ));
    assert_eq!(import[0]["outcome"], "unchanged");

    let filing_out = tmp.path().join("filing.pdf");
    let filing = oa(
        &app,
        &[
            &["filing", "pdf"][..],
            &m,
            &[&rev, "--out", filing_out.to_str().unwrap()],
        ]
        .concat(),
    );
    assert_eq!(filing.status.code(), Some(1), "unapproved: refused");
    assert!(!filing_out.exists());
    let conversions = lines(&oa(&app, &[&["filing", "conversions"][..], &m].concat()));
    assert!(conversions.is_empty());
    let pdfcraft = oa(
        &app,
        &[&["pdf", "open-editor"][..], &m, &["nothing"]].concat(),
    );
    assert_eq!(pdfcraft.status.code(), Some(2));
}

/// Drives spec M through the binary against a served kernel, so each profile
/// is a real `oa-browser-profile` process that outlives one `oa` call.
#[test]
fn m_cli_browser_commands_through_a_served_kernel() {
    use std::io::{Read, Write};
    let oa_exe = std::path::PathBuf::from(env!("CARGO_BIN_EXE_oa"));
    let profile_exe = oa_exe.with_file_name(format!(
        "oa-browser-profile{}",
        std::env::consts::EXE_SUFFIX
    ));
    assert!(
        profile_exe.is_file(),
        "build the workspace first: {} is missing",
        profile_exe.display()
    );
    // A local page and a PDF.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap_or(0);
            let pdf = String::from_utf8_lossy(&buf[..n]).contains("GET /order.pdf");
            let (ct, body): (&str, &[u8]) = if pdf {
                ("application/pdf", b"%PDF-1.4\n%%EOF\n")
            } else {
                (
                    "text/html",
                    b"<html><title>Listing</title><body><p id='n'>Order list</p></body></html>",
                )
            };
            let _ = write!(
                stream,
                "HTTP/1.0 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {}\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(body);
        }
    });
    let url = |path: &str| format!("http://127.0.0.1:{port}{path}");

    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let mut server = Command::new(&oa_exe)
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
    let id = lines(&connect(&["matter", "create", "--title", "Rao"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let profile = format!("matter:{id}");

    let opened = connect(&["browser", "open", &url("/case"), "--matter", &id]);
    assert_eq!(
        opened.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&opened.stderr)
    );
    assert_eq!(lines(&opened)[0]["title"], "Listing");

    let state = lines(&connect(&["browser", "state", "--profile", &profile]));
    assert_eq!(state[0]["state"], "running");
    assert!(
        state[0]["pid"].as_u64().is_some(),
        "a real process: {}",
        state[0]
    );
    assert_eq!(state[0]["tabs"][0]["title"], "Listing");

    let dom = lines(&connect(&["browser", "dom", "#n"]));
    assert_eq!(dom[0]["matches"][0]["text"], "Order list");
    let extract = lines(&connect(&["browser", "extract"]));
    assert_eq!(extract[0]["label"], "untrusted");

    let png = tmp.path().join("shot.png");
    let shot = connect(&["browser", "screenshot", "--out", png.to_str().unwrap()]);
    assert_eq!(shot.status.code(), Some(0));
    assert!(std::fs::read(&png).unwrap().starts_with(b"\x89PNG"));
    assert!(lines(&shot)[0]["png"].is_null(), "the PNG is not printed");

    let dl = lines(&connect(&[
        "browser",
        "open",
        &url("/order.pdf"),
        "--matter",
        &id,
    ]));
    assert_eq!(dl[0]["download"]["status"], "routed");
    let downloads = lines(&connect(&["browser", "downloads"]));
    assert_eq!(downloads.len(), 1);
    assert_eq!(downloads[0]["sha256"], dl[0]["download"]["sha256"]);

    // Refusals use exit 3; the egress log records them.
    let refused = connect(&[
        "browser",
        "open",
        "https://efiling.sci.gov.in/",
        "--profile",
        "agent",
    ]);
    assert_eq!(refused.status.code(), Some(3));
    let devtools = connect(&["browser", "devtools", "--profile", "filing"]);
    assert_eq!(devtools.status.code(), Some(3));
    let log = lines(&connect(&["browser", "egress", "--refused"]));
    assert!(log.iter().any(|e| e["host"] == "efiling.sci.gov.in"));
    // Attaching needs a person at the terminal; without one it is not confirmed.
    let attach = connect(&["browser", "attach", "agent", "--to", &profile]);
    assert_eq!(attach.status.code(), Some(3));
    assert!(lines(&connect(&["browser", "attachments"])).is_empty());

    let _ = server.kill();
    let _ = server.wait();
}

#[test]
fn o_cli_contacts_parties_timeline_and_correspondence() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);
    let c = lines(&oa(&app, &["contacts", "add", "Ramesh Kumar"]))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let m = lines(&oa(
        &app,
        &[
            "matter",
            "create",
            "--title",
            "Kumar v. State",
            "--client",
            &c,
        ],
    ))[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let set = oa(
        &app,
        &[
            "parties",
            "set",
            &m,
            "--contact",
            &c,
            "--role",
            "petitioner",
            "--record-name",
            "R. Kumar",
        ],
    );
    assert!(
        set.status.success(),
        "{}",
        String::from_utf8_lossy(&set.stderr)
    );
    let parties = lines(&oa(&app, &["parties", &m]));
    assert_eq!(parties[0]["record_name"], "R. Kumar");
    assert_eq!(parties[0]["contact_name"], "Ramesh Kumar");
    let logged = oa(
        &app,
        &[
            "correspondence",
            "log",
            &m,
            "--kind",
            "call",
            "--summary",
            "Next date asked",
        ],
    );
    assert!(logged.status.success());
    let by_matter = lines(&oa(&app, &["timeline", &m]));
    assert_eq!(by_matter.len(), 3);
    // The same positional reads as a contact when no matter has the id.
    let by_contact = lines(&oa(&app, &["timeline", &c]));
    assert_eq!(by_contact.len(), 2);
    let shown = lines(&oa(&app, &["contacts", "show", &c]));
    assert_eq!(shown[0]["matters"].as_array().unwrap().len(), 2);
    let bad = oa(&app, &["contacts", "add", "HC", "--kind", "court"]);
    assert_eq!(bad.status.code(), Some(2));
}

#[test]
fn b_ac_16_a_second_oa_kernel_serve_on_the_same_folder_exits_3() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);

    let mut server = Command::new(env!("CARGO_BIN_EXE_oa"))
        .arg("--app-data")
        .arg(&app)
        .args(["kernel", "serve"])
        .spawn()
        .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if oa_client::PipeClient::try_connect(&app, oa_types::Origin::Cli).is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let second = Command::new(env!("CARGO_BIN_EXE_oa"))
        .arg("--app-data")
        .arg(&app)
        .args(["kernel", "serve"])
        .output()
        .unwrap();
    assert_eq!(
        second.status.code(),
        Some(3),
        "second serve on same folder exits 3"
    );

    let list_out = oa(&app, &["matter", "list"]);
    assert!(
        list_out.status.success(),
        "oa without --connect routes to serving kernel"
    );

    let shutdown_out = oa(&app, &["kernel", "shutdown"]);
    assert!(shutdown_out.status.success());
    let _ = server.wait();
}

#[test]
fn b_ac_17_the_same_script_in_process_and_over_the_pipe_gives_equal_replies_and_ledger() {
    let tmp = tempfile::tempdir().unwrap();
    let app_in_process = tmp.path().join("app_in_proc");
    let root_in_process = tmp.path().join("root_in_proc");

    let app_pipe = tmp.path().join("app_pipe");
    let root_pipe = tmp.path().join("root_pipe");

    let mut server = Command::new(env!("CARGO_BIN_EXE_oa"))
        .arg("--app-data")
        .arg(&app_pipe)
        .args(["kernel", "serve"])
        .spawn()
        .unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if oa_client::PipeClient::try_connect(&app_pipe, oa_types::Origin::Cli).is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let r1_in = lines(&oa(
        &app_in_process,
        &["workspace", "init", root_in_process.to_str().unwrap()],
    ));
    let r1_pipe = lines(&oa(
        &app_pipe,
        &["workspace", "init", root_pipe.to_str().unwrap()],
    ));
    assert_eq!(r1_in[0]["schema_version"], r1_pipe[0]["schema_version"]);

    let r2_in = lines(&oa(
        &app_in_process,
        &["matter", "create", "--title", "Matter Script"],
    ));
    let r2_pipe = lines(&oa(
        &app_pipe,
        &["matter", "create", "--title", "Matter Script"],
    ));
    assert_eq!(r2_in[0]["title"], r2_pipe[0]["title"]);
    let m_in = r2_in[0]["id"].as_str().unwrap();
    let m_pipe = r2_pipe[0]["id"].as_str().unwrap();

    let r3_in = lines(&oa(
        &app_in_process,
        &[
            "draft",
            "new",
            "--matter",
            m_in,
            "--title",
            "Draft1",
            "--template",
            "blank",
        ],
    ));
    let r3_pipe = lines(&oa(
        &app_pipe,
        &[
            "draft",
            "new",
            "--matter",
            m_pipe,
            "--title",
            "Draft1",
            "--template",
            "blank",
        ],
    ));
    assert_eq!(r3_in[0]["draft"]["title"], r3_pipe[0]["draft"]["title"]);

    let ledger_in = lines(&oa(&app_in_process, &["ledger", "tail", "--matter", m_in]));
    let ledger_pipe = lines(&oa(&app_pipe, &["ledger", "tail", "--matter", m_pipe]));
    assert_eq!(ledger_in.len(), ledger_pipe.len());
    for (e_in, e_pipe) in ledger_in.iter().zip(ledger_pipe.iter()) {
        assert_eq!(e_in["event"], e_pipe["event"], "events match");
        assert_eq!(
            e_in["data"]["title"], e_pipe["data"]["title"],
            "ledger event data bodies match"
        );
    }

    let _ = oa(&app_pipe, &["kernel", "shutdown"]);
    let _ = server.wait();
}

#[test]
fn a_ac_06_cli_screen_show_and_set() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let root = tmp.path().join("root");
    oa(&app, &["workspace", "init", root.to_str().unwrap()]);

    let initial = lines(&oa(&app, &["screen", "show"]));
    assert_eq!(initial.len(), 1);
    assert_eq!(initial[0]["left"], "open");
    assert_eq!(initial[0]["chat"], "open");
    assert_eq!(initial[0]["view"]["pane"], "open");

    let screen_json = serde_json::json!({
        "matter": null,
        "left": "collapsed",
        "chat": "open",
        "view": {
            "pane": "open",
            "splits": [
                {
                    "page": { "view": "overview", "arg": null },
                    "back": [],
                    "forward": [],
                    "visible_anchors": ["anchor-cli-1"],
                    "selection": "sel-cli"
                }
            ],
            "focus": 0
        },
        "inspector": null
    });
    let temp_screen = tmp.path().join("test_screen.json");
    std::fs::write(&temp_screen, screen_json.to_string()).unwrap();

    let set_out = lines(&oa(&app, &["screen", "set", temp_screen.to_str().unwrap()]));
    assert_eq!(set_out.len(), 1);
    assert_eq!(set_out[0]["left"], "collapsed");
    assert_eq!(set_out[0]["view"]["splits"][0]["visible_anchors"][0], "anchor-cli-1");
    assert_eq!(set_out[0]["view"]["splits"][0]["selection"], "sel-cli");

    let shown = lines(&oa(&app, &["screen", "show"]));
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0]["left"], "collapsed");
    assert_eq!(shown[0]["view"]["splits"][0]["page"]["view"], "overview");
    assert_eq!(shown[0]["view"]["splits"][0]["selection"], "sel-cli");
}
