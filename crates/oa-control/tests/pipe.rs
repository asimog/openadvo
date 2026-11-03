//! The control pipe from a process that is not the harness.
#![cfg(windows)]

use std::fs::OpenOptions;
use std::io::BufReader;
use std::sync::Arc;

use oa_client::{Client, PipeClient};
use oa_control::{serve, HarnessJob, PipeListener};
use oa_kernel::{ClientSpec, Hooks, Kernel, Request};
use oa_protocol::{pipe_name, read_msg, write_msg, Hello, Reply};
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, ErrorCode, Origin};

fn start(app: &std::path::Path, job: Option<HarnessJob>) {
    let kernel = Arc::new(Kernel::new(app, Arc::new(SqliteFactory), Hooks::default()));
    let listener = PipeListener::bind(&pipe_name(app));
    let job = job.map(Arc::new);
    std::thread::spawn(move || serve(kernel, job, listener));
}

#[test]
fn b_ac_04_a_cli_connection_is_cli_and_human_commands_need_presence() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app ñ");
    // A harness job exists, but this process is not in it.
    start(&app, Some(HarnessJob::new().unwrap()));
    let c = PipeClient::connect(&app, Origin::Cli).unwrap();
    assert_eq!(c.origin(), Origin::Cli);

    c.call(
        Some(new_key()),
        Request::WorkspaceInit {
            root: tmp.path().join("root"),
        },
    )
    .unwrap();
    let err = c
        .call(
            Some(new_key()),
            Request::MatterCreate {
                title: "M".into(),
                client: ClientSpec::New("New".into()),
                from: None,
            },
        )
        .unwrap_err();
    // Nobody is present at the kernel in a test, so the confirmation fails safe.
    assert_eq!(err.code, ErrorCode::ConfirmationDenied);

    let m = c
        .call(
            Some(new_key()),
            Request::MatterCreate {
                title: "M".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap();
    assert!(m[0]["id"].is_string());
}

#[test]
fn b_rule_10_an_incompatible_protocol_is_refused_at_handshake() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    start(&app, None);
    let name = pipe_name(&app);
    let file = loop {
        match OpenOptions::new().read(true).write(true).open(&name) {
            Ok(f) => break f,
            Err(_) => std::thread::sleep(std::time::Duration::from_millis(20)),
        }
    };
    let mut writer = file.try_clone().unwrap();
    write_msg(
        &mut writer,
        &Hello {
            protocol: 99,
            claimed_origin: Origin::Cli,
        },
    )
    .unwrap();
    let reply: Reply = read_msg(&mut BufReader::new(file)).unwrap().unwrap();
    match reply {
        Reply::Error { error } => assert_eq!(error.code, ErrorCode::ProtocolMismatch),
        other => panic!("expected a refusal, got {other:?}"),
    }
}

#[test]
fn b_ac_09_calls_over_the_pipe_return_typed_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    start(&app, None);
    let c = PipeClient::connect(&app, Origin::Cli).unwrap();
    let err = c
        .call(Some(new_key()), Request::MatterOpen { id: "nope".into() })
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::Usage);
}
