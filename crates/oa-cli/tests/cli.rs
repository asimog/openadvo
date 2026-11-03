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
