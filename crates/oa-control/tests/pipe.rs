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

#[test]
fn b_ac_14_a_pipe_claim_of_capture_or_test_is_recorded_as_cli_and_capture_commit_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    start(&app, None);
    let c = PipeClient::connect(&app, Origin::Capture).unwrap();
    assert_eq!(
        c.origin(),
        Origin::Cli,
        "a pipe client claiming capture is recorded as cli"
    );

    c.call(
        Some(new_key()),
        Request::WorkspaceInit {
            root: tmp.path().join("root"),
        },
    )
    .unwrap();
    let m = c
        .call(
            Some(new_key()),
            Request::MatterCreate {
                title: "Matter".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap();
    let matter_id = m[0]["id"].as_str().unwrap().to_string();

    let err = c
        .call(
            Some(new_key()),
            Request::CaptureCommit {
                matter: matter_id,
                capture: Box::new(oa_protocol::CaptureInput {
                    file: None,
                    origin: "portal".into(),
                    url: "https://example.com".into(),
                    final_url: "https://example.com".into(),
                    captured_at: "2026-11-04T00:00:00Z".into(),
                    profile: "default".into(),
                    gesture: "download".into(),
                    portal_date: None,
                    adapter: "high_court".into(),
                    status: "captured".into(),
                    reason: None,
                    health: None,
                    codebook: None,
                }),
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::WriteRefused);

    let c_test = PipeClient::connect(&app, Origin::Test).unwrap();
    assert_eq!(
        c_test.origin(),
        Origin::Cli,
        "a pipe client claiming test is recorded as cli"
    );
}

#[test]
fn b_ac_15_a_pipe_client_claiming_ui_whose_image_is_not_installed_oa_shell_is_cli() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    start(&app, None);

    let c = PipeClient::connect(&app, Origin::Ui).unwrap();
    assert_eq!(
        c.origin(),
        Origin::Cli,
        "a pipe client claiming ui from non-oa-shell is recorded as cli"
    );

    c.call(
        Some(new_key()),
        Request::WorkspaceInit {
            root: tmp.path().join("root"),
        },
    )
    .unwrap();
    let m = c
        .call(
            Some(new_key()),
            Request::MatterCreate {
                title: "Matter".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap();
    let matter_id = m[0]["id"].as_str().unwrap().to_string();

    let d = c
        .call(
            Some(new_key()),
            Request::DraftNew {
                matter: matter_id.clone(),
                title: "Draft".into(),
                template: "blank".into(),
                from_notebook: false,
            },
        )
        .unwrap();
    let r1 = d[0]["revision"]["hash"].as_str().unwrap().to_string();

    let apprv = c
        .call(
            Some(new_key()),
            Request::ApprovalRequest {
                matter: matter_id.clone(),
                gate: "gate1".into(),
                target: r1,
            },
        )
        .unwrap();
    let approval_id = apprv[0]["id"].as_str().unwrap().to_string();

    let err = c
        .call(
            Some(new_key()),
            Request::ApprovalDecide {
                matter: matter_id,
                id: approval_id,
                accept: true,
                reason: "human decided".into(),
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::ConfirmationDenied);
}
